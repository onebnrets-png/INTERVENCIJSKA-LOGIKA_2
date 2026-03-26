// services/sourceRetrievalService.ts
// ═══════════════════════════════════════════════════════════════
// EO-084: Approved source pool — retrieval-only citation pipeline
// v1.1 — 2026-03-26 — EO-159 BUG11: normalizeUrlForMatch in matchReferenceToSource.
//         BUG31: explicit buildSearchQuery cases for objectives/kers/results.
// v1.0 — 2026-03-13
//
// ARCHITECTURE DECISION: Frontend service (not Supabase Edge Function)
// ─────────────────────────────────────────────────────────────────
// CrossRef and OpenAlex APIs are public, CORS-enabled, and require no
// authentication for basic queries. This eliminates the need for a
// server-side proxy, reduces latency (one fewer hop), and keeps the
// retrieval pipeline transparent to the developer.
// EO-083's Edge Function handles URL verification (HEAD/GET + DOI
// resolution) which requires server-side execution to avoid CORS
// blocks on arbitrary domains — that use case remains server-side.
//
// AUTHORITY RANKING SCALE (50–100):
//   100 — CrossRef DOI: peer-reviewed with publisher metadata
//    90 — OpenAlex DOI: indexed scholarly work with institution data
//    85 — EUR-Lex / European Commission legislative document
//    80 — Eurostat / OECD / World Bank / UN data portals
//    70 — Other official government or institutional source
//    50 — Manual entry or unknown provenance
// ═══════════════════════════════════════════════════════════════

import type { ApprovedSource, AuthorityScore } from '../types.ts';
import { normalizeUrlForMatch } from '../utils/referencePrefixMap.ts'; // ★ EO-159 BUG 11

// ─── Constants ───────────────────────────────────────────────

const CROSSREF_API = 'https://api.crossref.org/works';
const OPENALEX_API = 'https://api.openalex.org/works';
const MAX_RESULTS_PER_API = 10;
const MAX_TOTAL_SOURCES = 15;
const FETCH_TIMEOUT_MS = 8000;
const POLITE_EMAIL = 'eurooffice-app@eurooffice.eu'; // CrossRef polite pool

// Authority score thresholds
const SCORE_CROSSREF_DOI: AuthorityScore = 100;
const SCORE_OPENALEX_DOI: AuthorityScore = 90;
const SCORE_EURLEX: AuthorityScore = 85;
const SCORE_OFFICIAL_DB: AuthorityScore = 80;
const SCORE_INSTITUTIONAL: AuthorityScore = 70;
const SCORE_MANUAL: AuthorityScore = 50;

// Known high-authority publisher patterns
const EUR_LEX_PATTERNS = /eur-lex\.europa\.eu|publications\.europa\.eu/i;
const OFFICIAL_DB_PATTERNS = /eurostat|oecd\.org|worldbank\.org|data\.un\.org|iea\.org|acer\.europa\.eu/i;
const INSTITUTIONAL_PATTERNS = /europa\.eu|who\.int|eea\.europa\.eu|cedefop\.europa\.eu|eurofound\.europa\.eu|jrc\.ec\.europa\.eu/i;

// ─── Types ───────────────────────────────────────────────────

interface CrossRefItem {
  DOI?: string;
  title?: string[];
  author?: Array<{ given?: string; family?: string; name?: string }>;
  'published-print'?: { 'date-parts'?: number[][] };
  'published-online'?: { 'date-parts'?: number[][] };
  'container-title'?: string[];
  URL?: string;
  publisher?: string;
  score?: number;
}

interface OpenAlexWork {
  doi?: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  primary_location?: {
    source?: { display_name?: string };
    landing_page_url?: string;
  };
  authorships?: Array<{
    author?: { display_name?: string };
  }>;
  host_venue?: { display_name?: string; url?: string };
}

// ─── Helpers ─────────────────────────────────────────────────

function _generateSourceId(): string {
  return 'src_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

function _timeoutFetch(url: string, options: RequestInit = {}, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

/**
 * Compute authority score based on source provenance and URL patterns.
 */
function _computeAuthorityScore(
  retrievedFrom: string,
  url: string,
  doi: string | undefined
): AuthorityScore {
  if (retrievedFrom === 'crossref' && doi) return SCORE_CROSSREF_DOI;
  if (retrievedFrom === 'openalex' && doi) return SCORE_OPENALEX_DOI;
  if (url && EUR_LEX_PATTERNS.test(url)) return SCORE_EURLEX;
  if (url && OFFICIAL_DB_PATTERNS.test(url)) return SCORE_OFFICIAL_DB;
  if (url && INSTITUTIONAL_PATTERNS.test(url)) return SCORE_INSTITUTIONAL;
  if (retrievedFrom === 'crossref') return SCORE_INSTITUTIONAL; // CrossRef without DOI still trustworthy
  if (retrievedFrom === 'openalex') return SCORE_INSTITUTIONAL;
  return SCORE_MANUAL;
}

function _formatAuthors(crAuthors: CrossRefItem['author']): string {
  if (!crAuthors || crAuthors.length === 0) return '';
  return crAuthors
    .map((a) => {
      if (a.name) return a.name;
      const parts = [a.family, a.given].filter(Boolean);
      return parts.join(', ');
    })
    .join('; ');
}

function _extractYear(item: CrossRefItem): number | string {
  const parts =
    item['published-print']?.['date-parts']?.[0] ||
    item['published-online']?.['date-parts']?.[0];
  if (parts && parts[0]) return parts[0];
  return '';
}

function _normalizeDoi(doi: string | undefined): string {
  if (!doi) return '';
  // Strip protocol and domain prefix
  return doi.replace(/^https?:\/\/doi\.org\//i, '').trim();
}

function _normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── CrossRef Search ─────────────────────────────────────────

async function _searchCrossRef(
  query: string,
  sectionKey: string
): Promise<ApprovedSource[]> {
  const results: ApprovedSource[] = [];
  try {
    const params = new URLSearchParams({
      query: query,
      rows: String(MAX_RESULTS_PER_API),
      sort: 'relevance',
      mailto: POLITE_EMAIL,
    });
    const url = `${CROSSREF_API}?${params.toString()}`;
    console.log('[EO-084] CrossRef query:', query);

    const response = await _timeoutFetch(url);
    if (!response.ok) {
      console.warn('[EO-084] CrossRef HTTP error:', response.status);
      return results;
    }

    const data = await response.json();
    const items: CrossRefItem[] = data?.message?.items || [];

    for (const item of items) {
      if (!item.title?.[0]) continue;
      const doi = _normalizeDoi(item.DOI);
      const sourceUrl = doi ? `https://doi.org/${doi}` : (item.URL || '');
      const authorityScore = _computeAuthorityScore('crossref', sourceUrl, doi || undefined);

      results.push({
        id: _generateSourceId(),
        doi: doi || undefined,
        title: item.title[0],
        authors: _formatAuthors(item.author),
        year: _extractYear(item),
        source: item['container-title']?.[0] || item.publisher || '',
        url: sourceUrl,
        authorityScore,
        retrievedFrom: 'crossref',
        sectionKey,
        queryUsed: query,
        retrievedAt: new Date().toISOString(),
      });
    }

    console.log(`[EO-084] CrossRef returned ${results.length} results for "${query}"`);
  } catch (e: any) {
    if (e.name === 'AbortError') {
      console.warn('[EO-084] CrossRef timeout for:', query);
    } else {
      console.warn('[EO-084] CrossRef error:', e.message || e);
    }
  }
  return results;
}

// ─── OpenAlex Search ─────────────────────────────────────────

async function _searchOpenAlex(
  query: string,
  sectionKey: string
): Promise<ApprovedSource[]> {
  const results: ApprovedSource[] = [];
  try {
    const params = new URLSearchParams({
      search: query,
      per_page: String(MAX_RESULTS_PER_API),
      sort: 'relevance_score:desc',
      mailto: POLITE_EMAIL,
    });
    const url = `${OPENALEX_API}?${params.toString()}`;
    console.log('[EO-084] OpenAlex query:', query);

    const response = await _timeoutFetch(url);
    if (!response.ok) {
      console.warn('[EO-084] OpenAlex HTTP error:', response.status);
      return results;
    }

    const data = await response.json();
    const works: OpenAlexWork[] = data?.results || [];

    for (const work of works) {
      const title = work.display_name || work.title || '';
      if (!title) continue;

      const doi = _normalizeDoi(work.doi);
      const sourceUrl = doi
        ? `https://doi.org/${doi}`
        : (work.primary_location?.landing_page_url || work.host_venue?.url || '');
      const authors = (work.authorships || [])
        .map((a) => a.author?.display_name || '')
        .filter(Boolean)
        .join('; ');
      const sourceName =
        work.primary_location?.source?.display_name ||
        work.host_venue?.display_name ||
        '';
      const authorityScore = _computeAuthorityScore('openalex', sourceUrl, doi || undefined);

      results.push({
        id: _generateSourceId(),
        doi: doi || undefined,
        title,
        authors,
        year: work.publication_year || '',
        source: sourceName,
        url: sourceUrl,
        authorityScore,
        retrievedFrom: 'openalex',
        sectionKey,
        queryUsed: query,
        retrievedAt: new Date().toISOString(),
      });
    }

    console.log(`[EO-084] OpenAlex returned ${results.length} results for "${query}"`);
  } catch (e: any) {
    if (e.name === 'AbortError') {
      console.warn('[EO-084] OpenAlex timeout for:', query);
    } else {
      console.warn('[EO-084] OpenAlex error:', e.message || e);
    }
  }
  return results;
}

// ─── Deduplication ───────────────────────────────────────────

function _deduplicateSources(sources: ApprovedSource[]): ApprovedSource[] {
  const seen = new Map<string, ApprovedSource>();

  for (const src of sources) {
    // Primary dedup key: normalized DOI
    if (src.doi) {
      const doiKey = _normalizeDoi(src.doi).toLowerCase();
      if (doiKey && seen.has('doi:' + doiKey)) {
        // Keep the one with higher authority score
        const existing = seen.get('doi:' + doiKey)!;
        if (src.authorityScore > existing.authorityScore) {
          seen.set('doi:' + doiKey, src);
        }
        continue;
      }
      if (doiKey) {
        seen.set('doi:' + doiKey, src);
        continue;
      }
    }

    // Secondary dedup key: normalized title + year
    const titleKey = _normalizeTitle(src.title) + '|' + String(src.year);
    if (seen.has('title:' + titleKey)) {
      const existing = seen.get('title:' + titleKey)!;
      if (src.authorityScore > existing.authorityScore) {
        seen.set('title:' + titleKey, src);
      }
      continue;
    }
    seen.set('title:' + titleKey, src);
  }

  return Array.from(seen.values());
}

// ─── Sort by authority score (descending) ────────────────────

function _rankSources(sources: ApprovedSource[]): ApprovedSource[] {
  return sources.sort((a, b) => b.authorityScore - a.authorityScore);
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Search CrossRef and OpenAlex for authoritative sources matching the query.
 * Returns deduplicated, authority-ranked results (max 15 sources).
 *
 * @param query - search query derived from section content / topic
 * @param sectionKey - the section this search is for (e.g., 'problemAnalysis')
 * @returns Promise<ApprovedSource[]> — sorted by authorityScore descending
 */
export async function searchAuthoritativeSources(
  query: string,
  sectionKey: string
): Promise<ApprovedSource[]> {
  if (!query || query.trim().length < 3) {
    console.log('[EO-084] searchAuthoritativeSources: query too short, skipping');
    return [];
  }

  console.log(`[EO-084] Searching authoritative sources for "${sectionKey}": "${query.substring(0, 80)}..."`);

  // Query both APIs in parallel
  const [crossRefResults, openAlexResults] = await Promise.all([
    _searchCrossRef(query, sectionKey),
    _searchOpenAlex(query, sectionKey),
  ]);

  // Combine, deduplicate, rank, and limit
  const combined = [...crossRefResults, ...openAlexResults];
  const deduped = _deduplicateSources(combined);
  const ranked = _rankSources(deduped);
  const limited = ranked.slice(0, MAX_TOTAL_SOURCES);

  console.log(
    `[EO-084] Source retrieval complete: CrossRef=${crossRefResults.length}, OpenAlex=${openAlexResults.length}, ` +
    `combined=${combined.length}, deduped=${deduped.length}, returned=${limited.length}`
  );

  return limited;
}

/**
 * Build a search query from project data for a given section.
 * Extracts key topic information to create a focused academic search query.
 */
export function buildSearchQuery(sectionKey: string, projectData: any): string {
  const parts: string[] = [];

  // Always include project title if available
  const projectTitle = projectData?.projectIdea?.projectTitle;
  if (projectTitle && projectTitle.trim().length > 3) {
    parts.push(projectTitle.trim());
  }

  // Section-specific topic extraction
  switch (sectionKey) {
    case 'problemAnalysis':
    case 'coreProblem':
    case 'causes':
    case 'consequences': {
      const coreProblem = projectData?.problemAnalysis?.coreProblem;
      if (coreProblem?.title) parts.push(coreProblem.title);
      if (coreProblem?.description && coreProblem.description.length > 20) {
        // Extract first sentence as topic hint
        const firstSentence = coreProblem.description.split(/[.!?]/)[0];
        if (firstSentence.length > 10) parts.push(firstSentence.trim());
      }
      break;
    }
    case 'projectIdea':
    case 'mainAim':
    case 'stateOfTheArt':
    case 'proposedSolution': {
      const mainAim = projectData?.projectIdea?.mainAim;
      if (mainAim && mainAim.length > 10) {
        parts.push(mainAim.substring(0, 120));
      }
      const stateOfTheArt = projectData?.projectIdea?.stateOfTheArt;
      if (stateOfTheArt && stateOfTheArt.length > 20) {
        const firstSentence = stateOfTheArt.split(/[.!?]/)[0];
        if (firstSentence.length > 10) parts.push(firstSentence.trim());
      }
      break;
    }
    // ★ EO-159 BUG 31: Explicit cases for objectives/kers/results
    case 'generalObjectives':
    case 'specificObjectives': {
      const objectives = sectionKey === 'generalObjectives'
        ? projectData?.generalObjectives : projectData?.specificObjectives;
      const titles = (Array.isArray(objectives) ? objectives : [])
        .slice(0, 3).map((o: any) => o.title).filter(Boolean).join(', ');
      if (titles) parts.push(titles + ' objectives indicators');
      break;
    }
    case 'outputs':
    case 'outcomes':
    case 'impacts': {
      const items = Array.isArray(projectData?.[sectionKey]) ? projectData[sectionKey] : [];
      const titles = items.slice(0, 3).map((i: any) => i.title).filter(Boolean).join(', ');
      if (titles) parts.push(titles + ' expected results');
      break;
    }
    case 'kers': {
      const kers = Array.isArray(projectData?.kers) ? projectData.kers : [];
      const titles = kers.slice(0, 2).map((k: any) => k.title).filter(Boolean).join(', ');
      if (titles) parts.push(titles + ' key exploitable results');
      break;
    }
    default: {
      // Generic: use main aim and core problem
      const aim = projectData?.projectIdea?.mainAim;
      if (aim && aim.length > 10) parts.push(aim.substring(0, 100));
      break;
    }
  }

  // Join unique parts, limit length for API queries
  const uniqueParts = [...new Set(parts)];
  const query = uniqueParts.join(' ').substring(0, 250).trim();

  if (!query || query.length < 5) {
    console.log('[EO-084] buildSearchQuery: insufficient data for "' + sectionKey + '"');
    return '';
  }

  return query;
}

/**
 * Conservative matching: link a Reference to an ApprovedSource.
 * Returns the sourceId if a match is found, otherwise undefined.
 *
 * Match priorities:
 *   1. DOI exact match (highest confidence)
 *   2. URL exact match
 *   3. Normalized title + year match
 */
export function matchReferenceToSource(
  ref: { doi?: string; url?: string; title?: string; year?: number | string },
  approvedSources: ApprovedSource[]
): string | undefined {
  if (!approvedSources || approvedSources.length === 0) return undefined;

  // 1. DOI exact match
  if (ref.doi && ref.doi.trim().length > 3) {
    const refDoi = _normalizeDoi(ref.doi).toLowerCase();
    for (const src of approvedSources) {
      if (src.doi && _normalizeDoi(src.doi).toLowerCase() === refDoi) {
        return src.id;
      }
    }
  }

  // 2. URL exact match — ★ EO-159 BUG 11: normalize before comparing
  if (ref.url && ref.url.trim().length > 10) {
    const refUrl = normalizeUrlForMatch(ref.url);
    for (const src of approvedSources) {
      if (src.url && normalizeUrlForMatch(src.url) === refUrl) {
        return src.id;
      }
    }
  }

  // 3. Normalized title + year match
  if (ref.title && ref.title.length > 5) {
    const refTitle = _normalizeTitle(ref.title);
    const refYear = String(ref.year || '').trim();
    for (const src of approvedSources) {
      const srcTitle = _normalizeTitle(src.title);
      const srcYear = String(src.year || '').trim();
      // Require both title and year to match (conservative)
      if (refTitle === srcTitle && refYear && srcYear && refYear === srcYear) {
        return src.id;
      }
    }
  }

  return undefined;
}

/**
 * Format approved sources as a prompt injection block for the AI.
 * This gives the AI a pool of verified sources to cite from.
 */
export function formatApprovedSourcesForPrompt(sources: ApprovedSource[]): string {
  if (!sources || sources.length === 0) return '';

  const lines = [
    '\n═══ APPROVED SOURCE POOL (EO-084) ═══',
    'Below are pre-verified, authoritative sources retrieved from CrossRef and OpenAlex.',
    'You MUST cite ONLY from this pool when making factual claims. For each citation:',
    '- Use the [N] marker format corresponding to your _references array.',
    '- Copy the authors, title, year, source, url, and doi EXACTLY as given below.',
    '- Do NOT invent additional sources. If the pool does not cover a claim, omit the claim or state the limitation.',
    '- You MAY reuse the same source for multiple claims with the same [N] marker.',
    '',
  ];

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    lines.push(`--- Source ${i + 1} (authority: ${s.authorityScore}/100, via: ${s.retrievedFrom}) ---`);
    lines.push(`  authors: ${s.authors}`);
    lines.push(`  year: ${s.year}`);
    lines.push(`  title: ${s.title}`);
    lines.push(`  source: ${s.source}`);
    lines.push(`  url: ${s.url}`);
    if (s.doi) lines.push(`  doi: ${s.doi}`);
    lines.push('');
  }

  lines.push('═══ END APPROVED SOURCE POOL ═══');
  lines.push('CRITICAL: Do NOT cite sources that are NOT in this pool. Unsupported claims must be omitted.');
  lines.push('');

  return lines.join('\n');
}

// ─── Batch source matching for references ────────────────────

/**
 * For each reference in the array, attempt to find a matching ApprovedSource
 * and set the sourceId field. Returns the updated references.
 */
export function enrichReferencesWithSourceIds(
  refs: any[],
  approvedSources: ApprovedSource[]
): any[] {
  if (!refs || refs.length === 0 || !approvedSources || approvedSources.length === 0) {
    return refs;
  }

  let matchCount = 0;
  const enriched = refs.map((ref) => {
    if (ref.sourceId) return ref; // already matched
    const sourceId = matchReferenceToSource(ref, approvedSources);
    if (sourceId) {
      matchCount++;
      return { ...ref, sourceId };
    }
    return ref;
  });

  console.log(`[EO-084] enrichReferencesWithSourceIds: matched ${matchCount}/${refs.length} references to approved sources`);
  return enriched;
}
