// components/ReferencesBlock.tsx
// ═══════════════════════════════════════════════════════════════
// v1.14 — 2026-03-24 — EO-150c: Display full prefixed marker [ER-1] instead of stripped [1].
// v1.13 — 2026-03-24 — EO-147d: Unified single reference button
// v1.11 — 2026-03-23 — EO-141: normalizeMarker handles [XX-N] prefix format ([PA-1],[PI-2]).
// v1.10 — 2026-03-20 — EO-130f: Default referencesEnabled changed from true to false (safe default).
// v1.9 — 2026-03-18 — EO-130: referencesEnabled prop — hides block when references toggled OFF for section.
// v1.8 — 2026-03-17 — EO-112a: Activities WP references visibility — dynamic match for activities_wpN sectionKeys
//         References with sectionKey 'activities_wp1', 'activities_wp2', etc. now visible in Activities references panel.
// v1.7 — 2026-03-16 — EO-089: FIX content-based deduplication (doi/url/title+year/marker instead of id-only). Removes ref.id from primary key.
// EO-069: Collapsible references block shown at the bottom of each section
// in ProjectDisplay.tsx. Shows references filtered by sectionKey.
// v1.6 — 2026-03-16 — FIX: stable anchor IDs, improved section/child filtering,
//        safe marker normalization, cleaner deduplication, consistent reference rendering
// v1.5 — 2026-03-13 — EO-084: Approved source badge
// v1.4 — 2026-03-12 — EO-083: Enhanced verification display
// v1.3 — 2026-03-11 — EO-080: Verified URL badge
// v1.2 — 2026-03-10 — EO-071: DOI rendered as clickable link
// v1.1 — 2026-03-10 — EO-070: Added "Collect references from text" button
// v1.0 — 2026-03-10
// ═══════════════════════════════════════════════════════════════

import React, { useMemo, useState } from 'react';
import { TEXT } from '../locales.ts';
import { ICONS } from '../constants.tsx';
import type { Reference } from '../types.ts';

interface ReferencesBlockProps {
  sectionKey: string;
  references: Reference[];
  onAddReference: (ref: Omit<Reference, 'id'>) => void;
  onEditReference: (id: string, ref: Partial<Reference>) => void;
  onDeleteReference: (id: string) => void;
  onOpenAddModal: (sectionKey: string) => void;
  // EO-147d: onCollectFromSection removed — unified into onInjectReferences
  onInjectReferences?: (sectionKey: string) => void; // EO-147/EO-147d: unified add/refresh references
  language: 'en' | 'si';
  referencesEnabled?: boolean; // EO-130: when false, block is hidden (references toggled OFF)
}

const SECTION_CHILDREN: Record<string, string[]> = {
  problemAnalysis: ['problemAnalysis', 'coreProblem', 'causes', 'consequences'],
  projectIdea: ['projectIdea', 'mainAim', 'stateOfTheArt', 'proposedSolution', 'policies', 'readinessLevels'],
  expectedResults: ['expectedResults', 'outputs', 'outcomes', 'impacts', 'kers'],
  activities: ['activities', 'projectManagement', 'partners', 'risks'],
  generalObjectives: ['generalObjectives'],
  specificObjectives: ['specificObjectives'],
};

const getReferenceAnchorId = (ref: Reference, fallbackSectionKey?: string): string => {
  const safeSection = String(ref.sectionKey || fallbackSectionKey || 'section').replace(/[^\w-]/g, '');
  const safeMarker = String(ref.inlineMarker || 'x').replace(/[^\w-]/g, '');
  const safeId = String(ref.id || 'ref').replace(/[^\w-]/g, '');
  return `ref-${safeSection}-${safeMarker}-${safeId}`;
};

export const normalizeMarker = (inlineMarker?: string | number): number | null => {
  if (inlineMarker === undefined || inlineMarker === null) return null;
  if (typeof inlineMarker === 'number') return Number.isFinite(inlineMarker) ? inlineMarker : null;

  const str = String(inlineMarker).trim();

  // EO-141: New prefixed format [PA-1], [PI-3], [GO-12] etc.
  const prefixMatch = str.match(/\[([A-Z]{2,3})-(\d+)\]\s*$/);
  if (prefixMatch) {
    const parsed = parseInt(prefixMatch[2], 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // Legacy format [12]
  const bracketMatch = str.match(/\[(\d+)\]\s*$/);
  if (bracketMatch) {
    const parsed = parseInt(bracketMatch[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // Accept pure numeric fallback only
  if (/^\d+$/.test(str)) {
    const parsed = parseInt(str, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export const dedupeReferences = (refs: Reference[]): Reference[] => {
  const seen = new Set<string>();
  const result: Reference[] = [];

  for (const ref of refs) {
    // ★ FIX v7.27: Dedup by CONTENT, not by unique id
    // Priority: real references (with title/url/doi) beat placeholders
    const contentKeys: string[] = [];
    if (ref.doi && ref.doi.trim()) contentKeys.push('doi:' + ref.doi.trim().toLowerCase());
    if (ref.url && ref.url.trim().length > 10) contentKeys.push('url:' + ref.url.trim().toLowerCase());
    if (ref.title && ref.title.trim() && ref.year && !ref.title.startsWith('Reference cited as') && !ref.title.startsWith('Citation [')) {
      contentKeys.push('ty:' + ref.title.trim().toLowerCase() + '|' + String(ref.year).trim());
    }
    // Dedup by inlineMarker within same section
    if (ref.inlineMarker && ref.sectionKey) contentKeys.push('mk:' + ref.sectionKey + '|' + ref.inlineMarker);
    // Dedup placeholder references by marker globally (placeholder with [1] = placeholder with [1] regardless of section)
    const isPlaceholder = ref.title && (ref.title.startsWith('Reference cited as') || ref.title.startsWith('Citation ['));
    if (isPlaceholder && ref.inlineMarker) contentKeys.push('placeholder:' + ref.inlineMarker);

    let isDup = false;
    for (const ck of contentKeys) {
      if (seen.has(ck)) { isDup = true; break; }
    }
    if (isDup) continue;

    for (const ck of contentKeys) seen.add(ck);
    if (ref.id) seen.add('id:' + ref.id);
    result.push(ref);
  }

  return result;
};

const ReferencesBlock: React.FC<ReferencesBlockProps> = ({
  sectionKey,
  references,
  onEditReference,
  onDeleteReference,
  onOpenAddModal,
  // EO-147d: onCollectFromSection removed
  onInjectReferences,
  language,
  referencesEnabled = false, // EO-130f: default false — caller must explicitly pass true when refs are enabled
}) => {
  // EO-130: When references are toggled OFF for this section, hide the block entirely
  if (referencesEnabled === false) return null;
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Reference>>({});

  const t = (TEXT[language] || TEXT['en']) as any;
  const tr = t.references || {};

  const matchKeys = SECTION_CHILDREN[sectionKey] || [sectionKey];

  const sectionRefs = useMemo(() => {
    const filtered = (Array.isArray(references) ? references : []).filter((r) => {
      if (!r.sectionKey) return true;
      // ★ EO-112a: Also match activities_wpN sectionKeys for activities section
      if (matchKeys.includes(r.sectionKey)) return true;
      if (sectionKey === 'activities' && r.sectionKey && r.sectionKey.startsWith('activities_wp')) return true;
      return false;
    });

    const deduped = dedupeReferences(filtered);

    return deduped.sort((a, b) => {
      const aMarker = normalizeMarker(a.inlineMarker);
      const bMarker = normalizeMarker(b.inlineMarker);

      if (aMarker !== null && bMarker !== null) return aMarker - bMarker;
      if (aMarker !== null) return -1;
      if (bMarker !== null) return 1;

      return String(a.title || '').localeCompare(String(b.title || ''));
    });
  }, [references, matchKeys]);

  React.useEffect(() => {
    const handleOpenReference = (e: Event) => {
      const customEvent = e as CustomEvent;
      const targetId = customEvent.detail?.targetId;
      if (targetId) {
        const hasRef = sectionRefs.some(ref => getReferenceAnchorId(ref, sectionKey) === targetId);
        if (hasRef) {
          setIsOpen(true);
          setTimeout(() => {
            const el = document.getElementById(targetId);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('ring-2', 'ring-blue-300');
              setTimeout(() => el.classList.remove('ring-2', 'ring-blue-300'), 1800);
            }
          }, 100);
        }
      }
    };

    window.addEventListener('open-reference', handleOpenReference);
    return () => window.removeEventListener('open-reference', handleOpenReference);
  }, [sectionRefs, sectionKey]);

  // Also check hash on mount
  React.useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#ref-')) {
      const targetId = hash.substring(1);
      const hasRef = sectionRefs.some(ref => getReferenceAnchorId(ref, sectionKey) === targetId);
      if (hasRef) {
        setIsOpen(true);
        setTimeout(() => {
          const el = document.getElementById(targetId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('ring-2', 'ring-blue-300');
            setTimeout(() => el.classList.remove('ring-2', 'ring-blue-300'), 1800);
          }
        }, 100);
      }
    }
  }, [sectionRefs, sectionKey]);

  const count = sectionRefs.length;

  const handleStartEdit = (ref: Reference) => {
    setEditingId(ref.id);
    setEditData({
      authors: ref.authors,
      year: ref.year,
      title: ref.title,
      source: ref.source,
      url: ref.url,
      doi: ref.doi,
      note: ref.note,
    });
  };

  const handleSaveEdit = () => {
    if (editingId) {
      onEditReference(editingId, editData);
      setEditingId(null);
      setEditData({});
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  return (
    <div className="border-t border-slate-200 mt-6 pt-4 animate-fadeIn">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 transition-all group"
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <div className="flex items-center gap-2">
          <ICONS.REFERENCES className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-semibold text-slate-600">
            {tr.title || 'References'} ({count})
          </span>
          {count === 0 && (
            <span className="text-xs text-slate-400 italic">
              {tr.noReferences || 'No references yet'}
            </span>
          )}
        </div>

        <svg
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="mt-2 space-y-2 px-1">
          {sectionRefs.length === 0 ? (
            <p className="text-sm text-slate-400 italic py-2 px-3">
              {tr.noReferences || 'No references yet'}
            </p>
          ) : (
            sectionRefs.map((ref, idx) => {
              const markerNumber = normalizeMarker(ref.inlineMarker);
              // EO-150c: Show full prefixed marker [ER-1] instead of just [1]
              const displayMarker = (ref.inlineMarker && /^\[([A-Z]{2,3})-\d+\]$/.test(ref.inlineMarker.trim()))
                ? ref.inlineMarker.trim()
                : (markerNumber !== null ? `[${markerNumber}]` : `[${idx + 1}]`);

              return (
                <div
                  key={ref.id}
                  id={getReferenceAnchorId(ref, sectionKey)}
                  className="group/ref relative bg-white border border-slate-100 rounded-lg px-3 py-2 hover:border-indigo-200 hover:shadow-sm transition-all scroll-mt-28"
                >
                  {editingId === ref.id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className="px-2 py-1 text-sm border border-slate-200 rounded focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                          value={editData.authors || ''}
                          onChange={(e) => setEditData({ ...editData, authors: e.target.value })}
                          placeholder={tr.authors || 'Authors'}
                        />
                        <input
                          className="px-2 py-1 text-sm border border-slate-200 rounded focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                          value={editData.year || ''}
                          onChange={(e) => setEditData({ ...editData, year: e.target.value })}
                          placeholder={tr.year || 'Year'}
                        />
                      </div>

                      <input
                        className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                        value={editData.title || ''}
                        onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                        placeholder={tr.refTitle || 'Title'}
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className="px-2 py-1 text-sm border border-slate-200 rounded focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                          value={editData.source || ''}
                          onChange={(e) => setEditData({ ...editData, source: e.target.value })}
                          placeholder={tr.source || 'Source'}
                        />
                        <input
                          className="px-2 py-1 text-sm border border-slate-200 rounded focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                          value={editData.url || ''}
                          onChange={(e) => setEditData({ ...editData, url: e.target.value })}
                          placeholder={tr.url || 'URL'}
                        />
                      </div>

                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={handleCancelEdit}
                          className="px-2.5 py-1 text-xs font-medium text-slate-500 bg-slate-50 rounded-md hover:bg-slate-100 border border-slate-200 transition-all"
                        >
                          {t.modals?.cancel || 'Cancel'}
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="px-2.5 py-1 text-xs font-medium text-white bg-indigo-500 rounded-md hover:bg-indigo-600 transition-all shadow-sm"
                        >
                          {t.auth?.save || 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">
                        {displayMarker}
                      </span>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 leading-snug">
                          <span className="font-medium">{ref.authors || 'Unknown author'}</span>
                          {ref.year ? ` (${ref.year})` : ''}
                          {ref.title ? `. ${ref.title}` : ''}
                          {ref.source ? `. ${ref.source}` : ''}
                        </p>
                        {ref.url ? (
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            <div className="flex items-center gap-1.5">
                              {ref.urlVerified === true ? (
                                <span
                                  className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 flex-shrink-0"
                                  title={
                                    (language === 'si' ? 'Preverjen URL' : 'Verified URL') +
                                    (ref.verificationMethod ? ` (${ref.verificationMethod})` : '') +
                                    (ref.metadataVerified
                                      ? (language === 'si' ? ' — metapodatki potrjeni' : ' — metadata confirmed')
                                      : '')
                                  }
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                  </svg>
                                  {language === 'si' ? 'Preverjen' : 'Verified'}
                                </span>
                              ) : ref.verificationStatus === 'pending' ? (
                                <span
                                  className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-50 text-slate-500 flex-shrink-0"
                                  title={language === 'si' ? 'Preverjanje v teku…' : 'Verification in progress…'}
                                >
                                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                                  </svg>
                                  {language === 'si' ? 'Čaka…' : 'Pending…'}
                                </span>
                              ) : ref.verificationStatus === 'broken' || ref.verificationStatus === 'not-found' ? (
                                <span
                                  className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 flex-shrink-0"
                                  title={
                                    (language === 'si' ? 'URL je pokvarjen ali ne obstaja' : 'URL is broken or not found') +
                                    (ref.verificationMethod ? ` (via ${ref.verificationMethod})` : '')
                                  }
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                  {language === 'si' ? 'Pokvarjen' : 'Broken'}
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 flex-shrink-0"
                                  title={
                                    (language === 'si' ? 'URL ni preverjen — preverite ročno' : 'URL not verified — check manually') +
                                    (ref.verificationMethod ? ` (via ${ref.verificationMethod})` : '')
                                  }
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                  </svg>
                                  {language === 'si' ? 'Nepreverjen' : 'Unverified'}
                                </span>
                              )}

                              <a
                                href={ref.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-indigo-500 hover:text-indigo-700 hover:underline truncate"
                                title={ref.url}
                              >
                                {ref.url}
                              </a>
                            </div>

                            {ref.verificationMethod && ref.verificationMethod !== 'none' && (
                              <span
                                className="text-[9px] text-slate-400 pl-0.5"
                                title={
                                  (ref.resolvedUrl ? (language === 'si' ? 'Razrešen URL: ' : 'Resolved URL: ') + ref.resolvedUrl : '') +
                                  (ref.canonicalUrl ? (language === 'si' ? ' | Kanonični: ' : ' | Canonical: ') + ref.canonicalUrl : '')
                                }
                              >
                                {ref.verificationMethod}
                                {ref.verificationStatus ? ` · ${ref.verificationStatus}` : ''}
                                {ref.metadataVerified ? ' · metadata ✓' : ''}
                              </span>
                            )}
                          </div>
                        ) : (
                          <a
                            href={`https://scholar.google.com/scholar?q=${encodeURIComponent(
                              (ref.authors || '') + ' ' + (ref.year || '') + ' ' + (ref.title || '')
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 hover:underline mt-0.5"
                            title={language === 'si' ? 'Iskanje vira na Google Scholar' : 'Search source on Google Scholar'}
                          >
                            <svg className="w-3 h-3 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                            {language === 'si' ? 'URL ni na voljo — kliknite za iskanje' : 'URL not available — click to search'}
                          </a>
                        )}

                        {ref.doi && (
                          <a
                            href={ref.doi.startsWith('http') ? ref.doi : `https://doi.org/${ref.doi}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-500 hover:text-indigo-700 hover:underline truncate block mt-0.5"
                            title={`DOI: ${ref.doi}`}
                          >
                            DOI: {ref.doi}
                          </a>
                        )}

                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                              ref.addedBy === 'ai'
                                ? 'bg-purple-50 text-purple-600'
                                : 'bg-emerald-50 text-emerald-600'
                            }`}
                          >
                            {ref.addedBy === 'ai'
                              ? (tr.addedByAi || 'AI generated')
                              : (tr.addedManually || 'Manually added')}
                          </span>

                          {ref.metadataVerified === true && (
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600"
                              title={language === 'si' ? 'Naslov/avtorji potrjeni prek CrossRef' : 'Title/authors confirmed via CrossRef'}
                            >
                              CrossRef {language === 'si' ? 'potrjen' : 'confirmed'}
                            </span>
                          )}

                          {ref.sourceId && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600"
                              title={language === 'si' ? 'Povezan z odobrenim virom iz CrossRef/OpenAlex' : 'Linked to approved source from CrossRef/OpenAlex'}
                            >
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                              </svg>
                              {language === 'si' ? 'Odobren vir' : 'Approved'}
                            </span>
                          )}

                          {ref.note && (
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700"
                              title={ref.note}
                            >
                              {language === 'si' ? 'Opomba' : 'Note'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="opacity-0 group-hover/ref:opacity-100 transition-opacity flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleStartEdit(ref)}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all"
                          title={tr.edit || 'Edit Reference'}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                          </svg>
                        </button>

                        <button
                          onClick={() => onDeleteReference(ref.id)}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                          title={tr.delete || 'Delete Reference'}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div className="flex gap-2">
            <button
              onClick={() => onOpenAddModal(sectionKey)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-dashed border-indigo-200 transition-all active:scale-[0.98]"
            >
              <span className="text-base leading-none font-bold">+</span>
              {tr.add || 'Add Reference'}
            </button>

            {/* EO-147d: unified single button — replaces separate collect + inject buttons */}
            {onInjectReferences && (
              <button
                onClick={() => onInjectReferences(sectionKey)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-dashed border-indigo-200 transition-all active:scale-[0.98]"
                title={language === 'si'
                  ? 'AI prebere besedilo, doda inline citate iz preverjenih virov in ustvari seznam referenc. Obstoječe reference za to poglavje se pred tem pobrišejo.'
                  : 'AI reads the text, adds inline citations from verified sources and creates a reference list. Existing references for this chapter are removed first.'}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
                📚 {tr.addRefreshReferences || (language === 'si' ? 'Dodaj / osveži reference' : 'Add / refresh references')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReferencesBlock;

// END OF ReferencesBlock.tsx v1.14 — EO-150c: Full prefix display
