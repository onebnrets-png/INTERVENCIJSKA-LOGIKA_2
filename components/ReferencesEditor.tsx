// components/ReferencesEditor.tsx
// ═══════════════════════════════════════════════════════════════
// EO-069: Full-page references editor — shown as a sidebar step.
// Grouped by section, inline editing, search, add/delete.
// v1.3 — 2026-03-22 — EO-140c: Responsive via useResponsive() — container padding, fonts, buttons, card padding.
// v1.2 — 2026-03-10 — EO-071: Clickable URL+DOI with external-link icons
// v1.1 — 2026-03-10 — EO-070: Added Collect All / Generate & Verify buttons
// v1.0 — 2026-03-10
// ═══════════════════════════════════════════════════════════════

import React, { useState, useMemo } from 'react';
import { TEXT } from '../locales.ts';
import { ICONS } from '../constants.tsx';
import type { Reference } from '../types.ts';
import { useResponsive } from '../hooks/useResponsive.ts';

interface ReferencesEditorProps {
  references: Reference[];
  onAddReference: (ref: Omit<Reference, 'id'>) => void;
  onEditReference: (id: string, ref: Partial<Reference>) => void;
  onDeleteReference: (id: string) => void;
  onOpenAddModal: (sectionKey?: string) => void;
  onCollectAllReferences?: () => void;
  onGenerateAndVerify?: () => void;
  isCollecting?: boolean;
  isGenerating?: boolean;
  unverifiedClaims?: any[];
  language: 'en' | 'si';
  sectionLabels: Record<string, string>;
}

const ReferencesEditor: React.FC<ReferencesEditorProps> = ({
  references,
  onEditReference,
  onDeleteReference,
  onOpenAddModal,
  onCollectAllReferences,
  onGenerateAndVerify,
  isCollecting,
  isGenerating,
  unverifiedClaims,
  language,
  sectionLabels,
}) => {
  const t = (TEXT[language] || TEXT['en']) as any;
  const tr = t.references || {};

  const { config: rc, isCompact } = useResponsive(); // EO-140c

  const [search, setSearch] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Reference>>({});

  // Get unique section keys from references
  const allSectionKeys = useMemo(() => {
    const keys = new Set(references.map((r) => r.sectionKey));
    return Array.from(keys).sort();
  }, [references]);

  // Filter references
  const filteredRefs = useMemo(() => {
    let result = references;
    if (filterSection) {
      result = result.filter((r) => r.sectionKey === filterSection);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.authors.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          String(r.year).includes(q) ||
          r.source.toLowerCase().includes(q) ||
          (r.url && r.url.toLowerCase().includes(q))
      );
    }
    return result;
  }, [references, filterSection, search]);

  // Group by section
  const groupedRefs = useMemo(() => {
    const groups: Record<string, Reference[]> = {};
    filteredRefs.forEach((ref) => {
      const key = ref.sectionKey || 'general';
      if (!groups[key]) groups[key] = [];
      groups[key].push(ref);
    });
    return groups;
  }, [filteredRefs]);

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
    <div className="max-w-4xl mx-auto animate-fadeIn" style={{ padding: rc.content.padding }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0"
            style={{ width: rc.content.iconSize.section + 16, height: rc.content.iconSize.section + 16 }}>
            <ICONS.REFERENCES style={{ width: rc.content.iconSize.section, height: rc.content.iconSize.section }} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800" style={{ fontSize: rc.content.fontSize.heading }}>{tr.title || 'References'}</h2>
            <p className="text-slate-500" style={{ fontSize: rc.content.fontSize.xs }}>
              {references.length} {tr.count || 'references'}
              {' '}&middot;{' '}
              {tr.titleDesc || 'Manage all project references and citations.'}
            </p>
          </div>
        </div>
        <button
          onClick={() => onOpenAddModal('')}
          className="flex items-center gap-1.5 font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition-all active:scale-95"
          style={{ padding: rc.content.buttonPadding.primary, fontSize: rc.content.buttonFontSize }}
        >
          <span className="leading-none font-bold">+</span>
          {tr.add || 'Add Reference'}
        </button>
      </div>

      {/* ★ EO-070: Action buttons row */}
      <div className="flex gap-3 mb-4">
        {onCollectAllReferences && (
          <button
            onClick={onCollectAllReferences}
            disabled={!!isCollecting}
            className="flex items-center gap-1.5 font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ padding: rc.content.buttonPadding.secondary, fontSize: rc.content.buttonFontSize }}
          >
            <svg style={{ width: rc.content.iconSize.button, height: rc.content.iconSize.button }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            {isCollecting ? (tr.collecting || 'Collecting...') : (tr.collectAll || 'Collect all references')}
          </button>
        )}
        {onGenerateAndVerify && (
          <button
            onClick={onGenerateAndVerify}
            disabled={!!isGenerating}
            className="flex items-center gap-1.5 font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ padding: rc.content.buttonPadding.secondary, fontSize: rc.content.buttonFontSize }}
          >
            <svg style={{ width: rc.content.iconSize.button, height: rc.content.iconSize.button }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            {isGenerating ? (tr.generating || 'Generating...') : (tr.generateAndVerify || 'Generate & verify references with AI')}
          </button>
        )}
      </div>

      {/* ★ EO-070: Unverified claims card */}
      {unverifiedClaims && unverifiedClaims.length > 0 && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <h4 className="text-sm font-bold text-yellow-800">
              {tr.unverifiedClaims || 'Unverified Claims'} ({unverifiedClaims.length})
            </h4>
          </div>
          <p className="text-xs text-yellow-700 mb-2">
            {language === 'si'
              ? 'Naslednji citati v projektu niso mogli biti preverjeni. Preverite jih ročno.'
              : 'The following citations in the project could not be verified. Please check them manually.'}
          </p>
          <div className="space-y-1.5">
            {unverifiedClaims.map((claim: any, idx: number) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-yellow-800 bg-yellow-100 rounded-lg px-3 py-1.5">
                <span className="font-mono font-bold flex-shrink-0">{claim.citation || '?'}</span>
                <span className="text-yellow-600">
                  {sectionLabels[claim.sectionKey] || claim.sectionKey}
                  {claim.reason ? ' — ' + claim.reason : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search + Filter bar */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr.searchPlaceholder || 'Search references...'}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all"
          />
        </div>
        <select
          value={filterSection}
          onChange={(e) => setFilterSection(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 bg-white cursor-pointer"
        >
          <option value="">{tr.allSections || 'All Sections'}</option>
          {allSectionKeys.map((key) => (
            <option key={key} value={key}>
              {sectionLabels[key] || key}
            </option>
          ))}
        </select>
      </div>

      {/* References grouped by section */}
      {references.length === 0 ? (
        <div className="text-center py-16">
          <ICONS.REFERENCES className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-lg font-semibold text-slate-400">{tr.noReferences || 'No references yet'}</p>
          <p className="text-sm text-slate-400 mt-1">
            {language === 'si'
              ? 'Reference se bodo samodejno dodane, ko generirate vsebino z AI.'
              : 'References will be automatically added when you generate content with AI.'}
          </p>
          <button
            onClick={() => onOpenAddModal('')}
            className="mt-4 px-4 py-2 text-sm font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 border border-indigo-200 transition-all"
          >
            {tr.add || 'Add Reference'}
          </button>
        </div>
      ) : filteredRefs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-slate-400">
            {language === 'si' ? 'Ni rezultatov za iskani niz.' : 'No results matching your search.'}
          </p>
        </div>
      ) : (
        Object.entries(groupedRefs).map(([sectionKey, refs]) => (
          <div key={sectionKey} className="mb-8">
            {/* Section heading */}
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200">
              <span className="w-1.5 h-5 rounded-full bg-indigo-400" />
              <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider">
                {sectionLabels[sectionKey] || sectionKey}
              </h3>
              <span className="text-xs text-slate-400 font-medium">({refs.length})</span>
            </div>

            {/* Reference cards */}
            <div className="space-y-2">
              {refs.map((ref, idx) => (
                <div
                  key={ref.id}
                  className="group/card bg-white border border-slate-100 rounded-xl px-4 py-3 hover:border-indigo-200 hover:shadow-sm transition-all"
                >
                  {editingId === ref.id ? (
                    /* ── Inline edit mode ── */
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            {tr.authors || 'Authors'}
                          </label>
                          <input
                            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                            value={editData.authors || ''}
                            onChange={(e) => setEditData({ ...editData, authors: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            {tr.year || 'Year'}
                          </label>
                          <input
                            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                            value={editData.year || ''}
                            onChange={(e) => setEditData({ ...editData, year: e.target.value })}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          {tr.refTitle || 'Title'}
                        </label>
                        <input
                          className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                          value={editData.title || ''}
                          onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            {tr.source || 'Source'}
                          </label>
                          <input
                            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                            value={editData.source || ''}
                            onChange={(e) => setEditData({ ...editData, source: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            {tr.url || 'URL'}
                          </label>
                          <input
                            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                            value={editData.url || ''}
                            onChange={(e) => setEditData({ ...editData, url: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            {tr.doi || 'DOI'}
                          </label>
                          <input
                            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                            value={editData.doi || ''}
                            onChange={(e) => setEditData({ ...editData, doi: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            {tr.note || 'Note'}
                          </label>
                          <input
                            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                            value={editData.note || ''}
                            onChange={(e) => setEditData({ ...editData, note: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end pt-1">
                        <button onClick={handleCancelEdit} className="px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-50 rounded-lg hover:bg-slate-100 border border-slate-200 transition-all">
                          {t.modals?.cancel || 'Cancel'}
                        </button>
                        <button onClick={handleSaveEdit} className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 transition-all shadow-sm">
                          {t.auth?.save || 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── Display mode ── */
                    <div className="flex items-start gap-3">
                      {/* Number badge */}
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg flex-shrink-0 mt-0.5 min-w-[32px] text-center">
                        {ref.inlineMarker || `[${idx + 1}]`}
                      </span>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-800 leading-relaxed">
                          <span className="font-semibold">{ref.authors}</span>
                          {ref.year ? ` (${ref.year})` : ''}
                          {ref.title ? `. ${ref.title}` : ''}
                          {ref.source ? (
                            <span className="text-slate-500">. {ref.source}</span>
                          ) : null}
                        </p>
                        {ref.url ? (
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 hover:underline truncate mt-1"
                            title={ref.url}
                          >
                            {ref.url}
                            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 20 20"><path d="M4.5 5.5H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1v-1.5M8 3.5h5.5a1 1 0 011 1V10M14 2l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </a>
                        ) : (
                          <a
                            href={`https://scholar.google.com/scholar?q=${encodeURIComponent((ref.authors || '') + ' ' + (ref.year || '') + ' ' + (ref.title || ''))}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 hover:underline mt-1"
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
                            className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 hover:underline truncate mt-0.5"
                            title={`DOI: ${ref.doi}`}
                          >
                            DOI: {ref.doi}
                            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 20 20"><path d="M4.5 5.5H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1v-1.5M8 3.5h5.5a1 1 0 011 1V10M14 2l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </a>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${ref.addedBy === 'ai' ? 'bg-purple-50 text-purple-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            {ref.addedBy === 'ai' ? (tr.addedByAi || 'AI generated') : (tr.addedManually || 'Manually added')}
                          </span>
                          {ref.note && (
                            <span className="text-[10px] text-slate-400 italic truncate" title={ref.note}>
                              {ref.note}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons — hover */}
                      <div className="opacity-0 group-hover/card:opacity-100 transition-opacity flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleStartEdit(ref)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                          title={tr.edit || 'Edit'}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                          </svg>
                        </button>
                        <button
                          onClick={() => onDeleteReference(ref.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title={tr.delete || 'Delete'}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default ReferencesEditor;
