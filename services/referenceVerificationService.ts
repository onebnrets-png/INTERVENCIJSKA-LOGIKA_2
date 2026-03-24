// services/referenceVerificationService.ts
// ═══════════════════════════════════════════════════════════════
// EO-083: Real URL verification service — calls Supabase Edge Function
// 'verify-reference-urls' for HEAD/GET verification, DOI resolution,
// and CrossRef metadata lookup.
// v1.0 — 2026-03-12
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabaseClient.ts';
import type { Reference } from '../types.ts';

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

// ─── Main batch verification function ─────────────────────────

/**
 * Sends a batch of references to the Supabase Edge Function for
 * real URL verification (HEAD/GET + CrossRef DOI fallback).
 * Returns an array of VerificationResult objects keyed by ref.id.
 *
 * If the Edge Function is unavailable or fails, returns a graceful
 * fallback with verificationStatus='pending' for all refs.
 */
export async function verifyReferencesBatch(
  refs: Reference[]
): Promise<VerificationResult[]> {
  if (!refs || refs.length === 0) return [];

  // Only verify refs that have a URL or DOI to check
  const verifiableRefs = refs.filter(
    (r) => (r.url && r.url.trim().length > 5) || (r.doi && r.doi.trim().length > 3)
  );

  if (verifiableRefs.length === 0) {
    console.log('[EO-083] verifyReferencesBatch: no verifiable refs (no URL or DOI)');
    return refs.map((r) => ({
      id: r.id,
      verificationMethod: 'none',
      verificationStatus: 'pending',
      urlVerified: false,
    }));
  }

  // Build minimal payload for the Edge Function
  const payload = verifiableRefs.map((r) => ({
    id: r.id,
    url: r.url || '',
    doi: r.doi || '',
    title: r.title || '',
    authors: r.authors || '',
  }));

  console.log('[EO-083] verifyReferencesBatch: sending ' + payload.length + ' refs to Edge Function');

  try {
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

    // Merge results back — include non-verifiable refs as 'pending'
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

  } catch (e: any) {
    console.warn('[EO-083] verifyReferencesBatch failed:', e.message || e);
    return _fallbackResults(refs);
  }
}

// ─── Apply verification results to Reference objects ──────────

/**
 * Merges verification results into the Reference array in-place,
 * setting the new EO-083 fields on each reference.
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

    return {
      ...ref,
      urlVerified: vr.urlVerified,
      verificationMethod: vr.verificationMethod,
      verificationStatus: vr.verificationStatus,
      resolvedUrl: vr.resolvedUrl || ref.resolvedUrl,
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
