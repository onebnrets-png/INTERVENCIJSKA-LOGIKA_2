// services/referenceVerificationService.ts
// ═══════════════════════════════════════════════════════════════
// EO-083: Real URL verification service — calls Supabase Edge Function
// 'verify-reference-urls' for HEAD/GET verification, DOI resolution,
// and CrossRef metadata lookup.
// v1.1 — 2026-03-26 — EO-159 BUG3: Paginated batch (chunks of 25). BUG11: URL normalization.
// v1.0 — 2026-03-12
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabaseClient.ts';
import type { Reference } from '../types.ts';
import { normalizeUrlForMatch } from '../utils/referencePrefixMap.ts'; // ★ EO-159 BUG 11

// ─── Types ────────────────────────────────────────────────────

export interface VerificationResult {
  id: string;
  verificationMethod: string;   // 'head' | 'get' | 'doi-resolve' | 'crossref' | 'none'
  verificationStatus: string;   // 'verified' | 'broken' | 'redirected' | 'not-found' | 'timeout' | 'pending'
  resolvedUrl?: string;         // final URL after redirects
  canonicalUrl?: string;        // canonical URL from CrossRef / DOI
  metadataVerified?: boolean;   // title/authors matched CrossRef
  urlVerified: boolean;         // simplified boolean for badge display
}

export interface VerifyBatchResponse {
  results: VerificationResult[];
  errors?: string[];
}

// ─── Internal single-batch helper ─────────────────────────────

async function _verifySingleBatch(refs: Reference[]): Promise<VerificationResult[]> {
  // Only verify refs that have a URL or DOI to check
  const verifiableRefs = refs.filter(
    (r) => (r.url && r.url.trim().length > 5) || (r.doi && r.doi.trim().length > 3)
  );

  if (verifiableRefs.length === 0) {
    return refs.map((r) => ({
      id: r.id,
      verificationMethod: 'none',
      verificationStatus: 'pending',
      urlVerified: false,
    }));
  }

  const payload = verifiableRefs.map((r) => ({
    id: r.id,
    url: r.url || '',
    doi: r.doi || '',
    title: r.title || '',
    authors: r.authors || '',
  }));

  const { data, error } = await supabase.functions.invoke('verify-reference-urls', {
    body: { references: payload },
  });

  if (error) {
    console.warn('[EO-083] Edge Function error:', error.message || error);
    return _fallbackResults(refs);
  }

  if (!data || !Array.isArray(data.results)) {
    console.warn('[EO-083] Edge Function returned unexpected data:', data);
    return _fallbackResults(refs);
  }

  const response = data as VerifyBatchResponse;
  if (response.errors && response.errors.length > 0) {
    console.warn('[EO-083] Edge Function partial errors:', response.errors);
  }

  const resultMap = new Map<string, VerificationResult>();
  for (const r of response.results) {
    resultMap.set(r.id, r);
  }

  return refs.map((r) => {
    const found = resultMap.get(r.id);
    if (found) return found;
    return {
      id: r.id,
      verificationMethod: 'none',
      verificationStatus: 'pending',
      urlVerified: false,
    };
  });
}

// ─── Main batch verification function ─────────────────────────

/**
 * ★ EO-159 BUG 3: Sends references in paginated chunks of 25 to avoid
 * Edge Function timeouts on large batches.
 * Returns an array of VerificationResult objects keyed by ref.id.
 */
export async function verifyReferencesBatch(
  refs: Reference[]
): Promise<VerificationResult[]> {
  if (!refs || refs.length === 0) return [];

  const BATCH_SIZE = 25; // ★ EO-159 BUG 3
  const allResults: VerificationResult[] = [];

  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const chunk = refs.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(refs.length / BATCH_SIZE);
    console.log('[EO-159 BUG3] Verifying batch ' + batchNum + '/' + totalBatches + ' (' + chunk.length + ' refs)');

    try {
      const results = await _verifySingleBatch(chunk);
      allResults.push(...results);
    } catch (e: any) {
      console.warn('[EO-159 BUG3] Batch ' + batchNum + ' failed (non-fatal):', e.message || e);
      allResults.push(...chunk.map((r) => ({
        id: r.id,
        verificationMethod: 'none',
        verificationStatus: 'pending' as string,
        urlVerified: r.urlVerified ?? false,
      })));
    }
  }

  return allResults;
}

// ─── Apply verification results to Reference objects ──────────

/**
 * Merges verification results into the Reference array in-place,
 * setting the new EO-083 fields on each reference.
 * ★ EO-159 BUG 11: Uses normalizeUrlForMatch for URL comparison.
 */
export function applyVerificationResults(
  refs: Reference[],
  results: VerificationResult[]
): Reference[] {
  const resultMap = new Map<string, VerificationResult>();
  for (const r of results) {
    resultMap.set(r.id, r);
  }

  return refs.map((ref) => {
    const vr = resultMap.get(ref.id);
    if (!vr) return ref;

    // ★ EO-159 BUG 11: Normalize URL for comparison before merging
    const resolvedNorm = vr.resolvedUrl ? normalizeUrlForMatch(vr.resolvedUrl) : '';
    const refNorm = ref.resolvedUrl ? normalizeUrlForMatch(ref.resolvedUrl) : '';
    const resolvedUrl = resolvedNorm && resolvedNorm !== refNorm ? vr.resolvedUrl : (ref.resolvedUrl || vr.resolvedUrl);

    return {
      ...ref,
      urlVerified: vr.urlVerified,
      verificationMethod: vr.verificationMethod,
      verificationStatus: vr.verificationStatus,
      resolvedUrl: resolvedUrl,
      canonicalUrl: vr.canonicalUrl || ref.canonicalUrl,
      metadataVerified: vr.metadataVerified ?? ref.metadataVerified,
    };
  });
}

// ─── Fallback when Edge Function is unavailable ───────────────

function _fallbackResults(refs: Reference[]): VerificationResult[] {
  console.log('[EO-083] Using fallback — marking all refs as pending');
  return refs.map((r) => ({
    id: r.id,
    verificationMethod: 'none',
    verificationStatus: 'pending',
    urlVerified: r.urlVerified ?? false,
  }));
}


