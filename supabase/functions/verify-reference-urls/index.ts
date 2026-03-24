// supabase/functions/verify-reference-urls/index.ts
// ═══════════════════════════════════════════════════════════════
// EO-083: Supabase Edge Function — real URL verification
// Performs HEAD/GET verification, DOI resolution via doi.org,
// CrossRef API metadata lookup, and returns structured results.
// v1.0 — 2026-03-12
// ═══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// ─── Types ────────────────────────────────────────────────────

interface ReferenceInput {
  id: string;
  url: string;
  doi: string;
  title: string;
  authors: string;
}

interface VerificationResult {
  id: string;
  verificationMethod: string;
  verificationStatus: string;
  resolvedUrl?: string;
  canonicalUrl?: string;
  metadataVerified?: boolean;
  urlVerified: boolean;
}

// ─── Constants ────────────────────────────────────────────────

const FETCH_TIMEOUT = 8000; // 8 seconds per URL check
const CROSSREF_API = 'https://api.crossref.org/works/';
const DOI_RESOLVER = 'https://doi.org/';
const USER_AGENT = 'EuroOffice-IdeaDraft/1.0 (https://euro-office.eu; mailto:support@euro-office.eu)';

// ─── Helpers ──────────────────────────────────────────────────

function extractDoi(url: string, doi: string): string | null {
  if (doi && doi.trim().length > 3) {
    return doi.trim().replace(/^https?:\/\/doi\.org\//, '');
  }
  const doiMatch = url.match(/doi\.org\/(.+?)(?:\?|#|$)/i);
  if (doiMatch) return doiMatch[1];
  return null;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Verification: HEAD/GET ───────────────────────────────────

async function verifyUrl(url: string): Promise<{ method: string; status: string; resolvedUrl?: string }> {
  if (!url || url.trim().length < 5) {
    return { method: 'none', status: 'not-found' };
  }

  // Try HEAD first (lightweight)
  try {
    const resp = await fetchWithTimeout(url, {
      method: 'HEAD',
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });
    const finalUrl = resp.url || url;
    if (resp.ok) {
      return {
        method: 'head',
        status: finalUrl !== url ? 'redirected' : 'verified',
        resolvedUrl: finalUrl !== url ? finalUrl : undefined,
      };
    }
    if (resp.status === 405 || resp.status === 403) {
      // Some servers block HEAD — fall through to GET
    } else if (resp.status === 404) {
      return { method: 'head', status: 'not-found' };
    } else if (resp.status >= 500) {
      return { method: 'head', status: 'broken' };
    }
  } catch (e: any) {
    if (e.name === 'AbortError') {
      return { method: 'head', status: 'timeout' };
    }
    // Network error — try GET
  }

  // Fallback to GET
  try {
    const resp = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });
    const finalUrl = resp.url || url;
    if (resp.ok) {
      return {
        method: 'get',
        status: finalUrl !== url ? 'redirected' : 'verified',
        resolvedUrl: finalUrl !== url ? finalUrl : undefined,
      };
    }
    if (resp.status === 404) return { method: 'get', status: 'not-found' };
    return { method: 'get', status: 'broken' };
  } catch (e: any) {
    if (e.name === 'AbortError') return { method: 'get', status: 'timeout' };
    return { method: 'get', status: 'broken' };
  }
}

// ─── Verification: DOI resolution ─────────────────────────────

async function resolveDoi(doi: string): Promise<{ canonicalUrl?: string; method: string; status: string }> {
  try {
    const resp = await fetchWithTimeout(DOI_RESOLVER + encodeURIComponent(doi), {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
      redirect: 'follow',
    });
    if (resp.ok || resp.status === 302 || resp.status === 303) {
      const finalUrl = resp.url || (DOI_RESOLVER + doi);
      return { canonicalUrl: finalUrl, method: 'doi-resolve', status: 'verified' };
    }
    if (resp.status === 404) {
      return { method: 'doi-resolve', status: 'not-found' };
    }
    return { method: 'doi-resolve', status: 'broken' };
  } catch (e: any) {
    if (e.name === 'AbortError') return { method: 'doi-resolve', status: 'timeout' };
    return { method: 'doi-resolve', status: 'broken' };
  }
}

// ─── Verification: CrossRef metadata lookup ───────────────────

async function crossrefLookup(doi: string, title: string, authors: string): Promise<{ metadataVerified: boolean; canonicalUrl?: string }> {
  try {
    const resp = await fetchWithTimeout(CROSSREF_API + encodeURIComponent(doi), {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    });
    if (!resp.ok) return { metadataVerified: false };
    const json = await resp.json();
    const work = json?.message;
    if (!work) return { metadataVerified: false };

    // Check title similarity
    const crTitle = (work.title?.[0] || '').toLowerCase().trim();
    const inputTitle = title.toLowerCase().trim();
    const titleMatch = crTitle.length > 5 && inputTitle.length > 5 &&
      (crTitle.includes(inputTitle.substring(0, 30)) || inputTitle.includes(crTitle.substring(0, 30)));

    // Check authors (first author last name)
    let authorMatch = false;
    if (work.author && work.author.length > 0 && authors) {
      const crFirstAuthor = (work.author[0].family || '').toLowerCase();
      const inputFirstAuthor = authors.split(',')[0].trim().split(' ').pop()?.toLowerCase() || '';
      authorMatch = crFirstAuthor.length > 2 && inputFirstAuthor.length > 2 &&
        (crFirstAuthor === inputFirstAuthor || crFirstAuthor.includes(inputFirstAuthor) || inputFirstAuthor.includes(crFirstAuthor));
    }

    const canonicalUrl = work.URL || work.resource?.primary?.URL || undefined;
    return {
      metadataVerified: titleMatch || authorMatch,
      canonicalUrl,
    };
  } catch {
    return { metadataVerified: false };
  }
}

// ─── Main verification pipeline per reference ─────────────────

async function verifyReference(ref: ReferenceInput): Promise<VerificationResult> {
  const doi = extractDoi(ref.url, ref.doi);
  let method = 'none';
  let status = 'pending';
  let resolvedUrl: string | undefined;
  let canonicalUrl: string | undefined;
  let metadataVerified: boolean | undefined;

  // Strategy 1: If DOI is available, resolve via DOI + CrossRef
  if (doi) {
    const doiResult = await resolveDoi(doi);
    method = doiResult.method;
    status = doiResult.status;
    canonicalUrl = doiResult.canonicalUrl;

    // CrossRef metadata verification
    const crResult = await crossrefLookup(doi, ref.title, ref.authors);
    metadataVerified = crResult.metadataVerified;
    if (crResult.canonicalUrl) canonicalUrl = crResult.canonicalUrl;

    if (status === 'verified' || status === 'redirected') {
      return {
        id: ref.id,
        verificationMethod: metadataVerified ? 'crossref' : method,
        verificationStatus: status,
        resolvedUrl: canonicalUrl !== ref.url ? canonicalUrl : undefined,
        canonicalUrl,
        metadataVerified,
        urlVerified: true,
      };
    }
  }

  // Strategy 2: Direct URL verification via HEAD/GET
  if (ref.url && ref.url.trim().length > 5) {
    const urlResult = await verifyUrl(ref.url);
    method = urlResult.method;
    status = urlResult.status;
    resolvedUrl = urlResult.resolvedUrl;

    return {
      id: ref.id,
      verificationMethod: metadataVerified ? 'crossref' : method,
      verificationStatus: status,
      resolvedUrl,
      canonicalUrl,
      metadataVerified,
      urlVerified: status === 'verified' || status === 'redirected',
    };
  }

  // No URL, no DOI — cannot verify
  return {
    id: ref.id,
    verificationMethod: 'none',
    verificationStatus: 'not-found',
    metadataVerified,
    urlVerified: false,
  };
}

// ─── Edge Function handler ────────────────────────────────────

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const body = await req.json();
    const references: ReferenceInput[] = body?.references || [];

    if (!Array.isArray(references) || references.length === 0) {
      return new Response(
        JSON.stringify({ results: [], errors: ['No references provided'] }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Cap at 25 refs per batch to avoid timeout
    const batch = references.slice(0, 25);
    const errors: string[] = [];

    if (references.length > 25) {
      errors.push('Batch capped at 25 references; ' + (references.length - 25) + ' skipped');
    }

    // Verify all in parallel (with concurrency limit of 5)
    const results: VerificationResult[] = [];
    for (let i = 0; i < batch.length; i += 5) {
      const chunk = batch.slice(i, i + 5);
      const chunkResults = await Promise.all(
        chunk.map((ref) =>
          verifyReference(ref).catch((e) => {
            errors.push('Failed to verify ref ' + ref.id + ': ' + (e.message || String(e)));
            return {
              id: ref.id,
              verificationMethod: 'none',
              verificationStatus: 'broken',
              urlVerified: false,
            } as VerificationResult;
          })
        )
      );
      results.push(...chunkResults);
    }

    return new Response(
      JSON.stringify({ results, errors: errors.length > 0 ? errors : undefined }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ results: [], errors: ['Edge Function error: ' + (e.message || String(e))] }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
});
