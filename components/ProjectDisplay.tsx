// components/ProjectDisplay.tsx
// ═══════════════════════════════════════════════════════════════
// v7.33 — 2026-03-23 — EO-141: findReferenceByInlineMarker matches [XX-N] prefix markers.
//         FieldCitationsPreview regex handles [PA-1],[PI-2] prefixed format. Both legacy [N] and new format supported.
// v7.31 — 2026-03-20 — EO-138: ChapterCostBadge component — inline API cost display per chapter.
//         Inserted into SectionGenerateWithToggle next to ReferenceToggle.
// v7.30 — 2026-03-20 — EO-137: Replace isLoading overlay with GenerationProgressModal, add elapsedMs counter
//         (problemAnalysis, projectIdea, generalObjectives, specificObjectives, projectManagement,
//          partners, activities, risks, expectedResults/outputs/outcomes/impacts/kers).
// v7.24 — 2026-03-20 — EO-134: Confirmed ReadinessLevelSelector uses `references` prop (not `refs`) — no undefined var.
//         Error log pointed to old deployed version. Current code is correct.
// v7.23 — 2026-03-18 — EO-130: ReferenceToggle + SectionGenerateWithToggle helper. referencesEnabled passed to ReferencesBlock.
// v7.22 — 2026-03-18 — EO-129: FieldCitationsPreview regex handles [N, M] multi-citation format.
// v7.21 — 2026-03-18 — EO-129: FieldCitationsPreview regex handles [N, M] multi-citation format.
// v7.20 — 2026-03-16 — FIX: Removed fake Citation Preview duplication.
//         Prepared clickable inline citation rendering helpers.
//         Replaced index-based citation lookup with inlineMarker-aware lookup.
//         Added safe missing-reference visual state for unresolved [N] markers.
//         Goal: align inline citation display with real reference entries.
// v7.19 — EO-081: Initial inline citation marker rendering [1],[2],[3].
//         Added renderTextWithCitations() and CitationPreview component.
//         Later revised in v7.20 due to duplicated-text UX problem.
// v7.18 — EO-079: Re-added projectIdea to ReferencesBlock sections list.
//         EO-071 removed it, but AI generates references for stateOfTheArt,
//         proposedSolution, policies — they must be visible on the Project Idea page.
// ProjectDisplay.tsx v7.17 — EO-071
// Euro-Office | Main project editing display + all section renderers
// v7.17 — EO-071: Updated ReferencesBlock sections list — removed projectIdea,
//         added generalObjectives, specificObjectives.
// v7.16 — EO-056: Consistent hover Remove buttons across entire app.
//         - Removed duplicate Remove from SectionHeader for mainAim,
//           stateOfTheArt, proposedSolution (keep only card hover).
//         - Added hover Remove to ReadinessLevelSelector cards
//           (resets level=null + justification='').
//         - Added hover Remove to projectManagement description card.
//         - Fixed duplicate TextArea for deliverable description.
//         - All Remove buttons: hover pattern inside card only.
// v7.15 — EO-055: Fixed broken JSX in renderProjectIdea readiness
//         levels block (missing <div> + <SectionHeader> opening tags,
//         removed stale duplicate ReadinessLevelSelector call).
//         Fixed ReadinessLevelSelector to properly display saved data
//         with object structure { level, justification }.
// v7.14 — EO-054: Clear buttons for mainAim, stateOfTheArt,
//         proposedSolution, readinessLevels in Project Idea.
//         Shows only when field has content.
// v7.13 — EO-052: ReadinessLevelSelector rewritten with safeEntries
//         approach + FIXED prop mismatch in renderProjectIdea call —
//         readinessLevels→value, onUpdateData→onChange wrapper. 
// v7.12 — 2026-03-08 — EO-044: ReadinessLevelSelector defensive check
// v7.11 — 2026-03-06 — EO-043: Portal anchor — passes anchorRect to FieldAIAssistant
// v7.9 — 2026-03-06 — EO-039: AI Asistent per-field (FieldAIAssistant popup) — COMPLETE
// v7.8 — 2026-03-02 — GuideTooltip integration COMPLETE — all sections covered
// v7.7 — 2026-03-02 — GuideTooltip integration on SectionHeader + FieldHeader
// v7.6 — 2026-03-01 — FIX: Indirect cost calculation for decentralized model
// v7.5 — 2026-02-25 — InlineChart added to renderRisks + renderKERs + batch viz trigger
// v7.3 — 2026-02-23 — Language-aware WP/Task prefixes + partners.map bugfix
//   - FIX: WP prefix: EN=WP, SI=DS (was hardcoded WP)
//   - FIX: Task prefix: EN=T, SI=N (was hardcoded T)
//   - All v7.0.1 bugfixes preserved.
//   - FIX: All partners access now uses Array.isArray guard
//   - FIX: renderPartners .map calls restored to proper JSX
//   - FIX: renderFinance + renderActivities partners guard added
//   - All v7.0 changes preserved.
// ═══════════════════════════════════════════════════════════════

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { ICONS, getReadinessLevelsDefinitions, getSteps } from '../constants.tsx';
import { TEXT } from '../locales.ts';
import GanttChart from './GanttChart.tsx';
import PERTChart from './PERTChart.tsx';
import Organigram from './Organigram.tsx';
import { recalculateProjectSchedule } from '../utils.ts';
import InlineChart from './InlineChart.tsx';
import ReferencesBlock, { normalizeMarker, dedupeReferences } from './ReferencesBlock.tsx';
import GuideTooltip from './GuideTooltip.tsx';
import FieldAIAssistant from './FieldAIAssistant.tsx';
import { stepColors } from '../design/theme.ts';
import StepNavigationBar from './StepNavigationBar.tsx';
import {
    PM_HOURS_PER_MONTH,
    CENTRALIZED_DIRECT_COSTS,
    DECENTRALIZED_DIRECT_COSTS,
} from '../types.ts';
import ReferenceToggle from './ReferenceToggle.tsx'; // EO-130
import { DEFAULT_REFS_ENABLED } from '../services/Instructions.ts'; // EO-130
import GenerationProgressModal from './GenerationProgressModal.tsx'; // EO-137
import { useResponsive } from '../hooks/useResponsive.ts'; // EO-140

// EO-130f: Chapter mapping for reference toggle — determines which chapter a sub-section belongs to.
// MUST be kept in sync with the identical function in hooks/useGeneration.ts.
// If you add a new section key, add it in BOTH places.
function getChapterForSection(sectionKey: string): string {
  const mapping: Record<string, string> = {
    // Chapter: problemAnalysis
    problemAnalysis: 'problemAnalysis',
    coreProblem: 'problemAnalysis',
    causes: 'problemAnalysis',
    consequences: 'problemAnalysis',
    euPolicies: 'problemAnalysis',
    policies: 'problemAnalysis',

    // Chapter: projectIdea
    projectIdea: 'projectIdea',
    mainAim: 'projectIdea',
    detailedDescription: 'projectIdea',
    stateOfTheArt: 'projectIdea',
    proposedSolution: 'projectIdea',
    readinessLevels: 'projectIdea',
    projectTitleAcronym: 'projectIdea',

    // Chapter: generalObjectives
    generalObjectives: 'generalObjectives',

    // Chapter: specificObjectives
    specificObjectives: 'specificObjectives',

    // Chapter: activities
    activities: 'activities',
    projectManagement: 'activities',
    partners: 'activities',
    workplan: 'activities',
    risks: 'activities',
    finance: 'activities',
    allocations: 'activities',
    partnerAllocations: 'activities',
    partnerAllocations_wp: 'activities',
    milestones: 'activities',
    deliverables: 'activities',

    // Chapter: expectedResults
    expectedResults: 'expectedResults',
    outputs: 'expectedResults',
    outcomes: 'expectedResults',
    impacts: 'expectedResults',
    kers: 'expectedResults',
  };
  return mapping[sectionKey] || sectionKey;
}

const safeArray = (v: any): any[] => {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      if (Array.isArray(v[k])) return v[k];
    }
  }
  return [];
};

// ═══════════════════════════════════════════════════════════════
// Inline citation helpers — clickable [N] markers + safe reference lookup
// ═══════════════════════════════════════════════════════════════

const SECTION_CHILDREN_MAP: Record<string, string[]> = {
    problemAnalysis: ['problemAnalysis', 'coreProblem', 'causes', 'consequences'],
    projectIdea: ['projectIdea', 'mainAim', 'stateOfTheArt', 'proposedSolution', 'policies', 'readinessLevels'],
    expectedResults: ['expectedResults', 'outputs', 'outcomes', 'impacts', 'kers'],
    activities: ['activities', 'projectManagement', 'partners', 'risks'],
    generalObjectives: ['generalObjectives'],
    specificObjectives: ['specificObjectives'],
};

const getTopLevelSectionKey = (subKey: string): string => {
    for (const [topKey, subKeys] of Object.entries(SECTION_CHILDREN_MAP)) {
        if (subKeys.includes(subKey)) {
            return topKey;
        }
    }
    return subKey;
};

const getMatchKeysForSection = (sectionKey: string): string[] => {
    return SECTION_CHILDREN_MAP[sectionKey] || [sectionKey];
};

const getReferenceAnchorId = (ref: any, fallbackSectionKey?: string): string => {
    const topLevelKey = fallbackSectionKey ? getTopLevelSectionKey(fallbackSectionKey) : 'section';
    const safeSection = String(ref?.sectionKey || topLevelKey).replace(/[^\w-]/g, '');
    const safeMarker = String(ref?.inlineMarker || 'x').replace(/[^\w-]/g, '');
    const safeId = String(ref?.id || 'ref').replace(/[^\w-]/g, '');
    return `ref-${safeSection}-${safeMarker}-${safeId}`;
};

const findReferenceByInlineMarker = (
    markerStr: string,
    references: any[] = [],
    sectionKey?: string
): any | undefined => {
    const topLevelKey = sectionKey ? getTopLevelSectionKey(sectionKey) : undefined;
    const matchKeys = topLevelKey ? getMatchKeysForSection(topLevelKey) : [];

    // Filter references for this section (same as ReferencesBlock)
    const filtered = references.filter((r) => {
        if (!r.sectionKey) return true;
        return matchKeys.includes(r.sectionKey);
    });

    const deduped = dedupeReferences(filtered);

    // EO-141: Match by full inlineMarker string first (handles [PA-1], [SO-2] etc)
    const byMarkerStr = deduped.find((ref) => ref.inlineMarker === markerStr);
    if (byMarkerStr) return byMarkerStr;

    // Fallback: match by number only (legacy [N] format support)
    const num = (() => {
        const pm = markerStr.match(/\[(?:[A-Z]{2,3}-)?(\d+)\]/);
        return pm ? parseInt(pm[1], 10) : NaN;
    })();
    if (isNaN(num)) return undefined;

    const sorted = deduped.sort((a, b) => {
      const aMarker = normalizeMarker(a.inlineMarker);
      const bMarker = normalizeMarker(b.inlineMarker);
      if (aMarker !== null && bMarker !== null) return aMarker - bMarker;
      if (aMarker !== null) return -1;
      if (bMarker !== null) return 1;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });

    return sorted.find((ref, idx) => {
        const markerNumber = normalizeMarker(ref.inlineMarker);
        const displayMarker = markerNumber !== null ? markerNumber : (idx + 1);
        return displayMarker === num;
    });
};



const FieldHeader = ({ title, description, id = '', accentColor = '' }) => {
    const { config: rc, isCompact } = useResponsive();
    return (
    <div className="mb-3 animate-fadeIn" style={{ paddingTop: isCompact ? '12px' : '20px' }} id={id}>
        <h3 className="font-semibold text-slate-700 flex items-center gap-2" style={{ fontSize: rc.content.fontSize.heading }}>
            {accentColor && <span style={{ width: 3, height: 20, borderRadius: 2, background: accentColor, flexShrink: 0 }} />}
            {title}
        </h3>
        {description && <p className="text-slate-500 mt-0.5" style={{ fontSize: rc.content.fontSize.label }}>{description}</p>}
    </div>
    );
};

const SectionHeader = ({ title, onAdd, addText, children, accentColor = '', guideStep = '', guideField = '', language = 'en' }: { title: string; onAdd?: () => void; addText?: string; children?: React.ReactNode; accentColor?: string; guideStep?: string; guideField?: string; language?: string }) => {
    const { config: rc, isCompact, isUltraCompact } = useResponsive();
    return (
    <div
        className={'flex justify-between items-end mb-4 pb-2 animate-fadeIn ' + (!accentColor ? 'border-b border-slate-200' : '')}
        style={{ paddingTop: isUltraCompact ? '14px' : isCompact ? '20px' : '24px', ...(accentColor ? { borderBottom: '2px solid ' + accentColor } : {}) }}
    >
        <h3 className="font-bold text-slate-700 flex items-center gap-2" style={{ fontSize: rc.content.fontSize.heading }}>
            {accentColor && <span style={{ width: 4, height: 22, borderRadius: 3, background: accentColor, flexShrink: 0 }} />}
            {title}
            {guideStep && guideField && <GuideTooltip stepKey={guideStep} fieldKey={guideField} language={language} size="sm" />}
        </h3>
        <div className="flex gap-2 items-center">
            {children}
            {onAdd && (
                <button
                    onClick={onAdd}
                    className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg shadow-sm transition-all flex items-center gap-1.5 hover:shadow-md active:scale-95"
                    style={{ background: accentColor || '#0284c7' }}
                >
                    <span className="text-base leading-none font-bold">+</span> {addText}
                </button>
            )}
        </div>
    </div>
    );
};

const RemoveButton = ({ onClick, text }) => (
    <button onClick={onClick} className="ml-2 px-2.5 py-1 text-xs font-medium bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all border border-red-100 hover:border-red-200 active:scale-95">
        {text}
    </button>
);

const GenerateButton = ({ onClick, isLoading, isField = false, title, text = '', missingApiKey = false }) => (
    <button
        onClick={onClick}
        disabled={!!isLoading}
        className={`flex items-center justify-center font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-95
            ${isField 
                ? (missingApiKey ? 'p-1.5 bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100' : 'p-1.5 bg-white text-sky-600 border border-sky-200 hover:bg-sky-50 hover:shadow-md')
                : (missingApiKey ? 'px-3 py-1.5 text-sm bg-amber-500 text-white hover:bg-amber-600' : 'px-3.5 py-1.5 text-sm bg-white text-sky-700 border border-sky-200 hover:bg-sky-50 hover:shadow-md')
            }`
        }
        title={missingApiKey ? "Setup API Key" : title}
    >
        {isLoading ? (
            <div className={`mr-1.5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin ${isField ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
        ) : (
            missingApiKey ? <ICONS.LOCK className={`mr-1.5 ${isField ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} /> : <ICONS.SPARKLES className={`mr-1.5 ${isField ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
        )}
        {isField ? '' : text}
    </button>
);

// EO-138: Inline API cost badge — shown next to chapter generate button
const ChapterCostBadge = ({ chapterKey, projectData, language }: { chapterKey: string; projectData: any; language: string }) => {
  const usage = projectData?._usage?.chapters?.[chapterKey];
  const [expanded, setExpanded] = React.useState(false);
  if (!usage || usage.totalCalls === 0) return null;
  const costStr = usage.totalCostEUR < 0.01 ? '< 0.01' : usage.totalCostEUR.toFixed(2);
  const isHighCost = usage.totalCostEUR > 0.50;
  return (
    <div className="relative inline-flex items-center">
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full border transition-all hover:shadow-sm"
        style={{
          background: isHighCost ? '#fef3c7' : '#f0fdf4',
          borderColor: isHighCost ? '#f59e0b' : '#86efac',
          color: isHighCost ? '#92400e' : '#166534',
        }}
        title={language === 'si' ? 'Klikni za podrobnosti o porabi' : 'Click for usage details'}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {costStr} EUR
        <span className="text-[10px] opacity-60">({usage.totalCalls}×)</span>
      </button>
      {expanded && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-4">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-bold text-slate-700">{language === 'si' ? 'Poraba API' : 'API Usage'}</h4>
            <button onClick={() => setExpanded(false)} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-slate-500">{language === 'si' ? 'Skupni stroški' : 'Total cost'}:</span><span className="font-bold">{usage.totalCostEUR.toFixed(4)} EUR</span></div>
            <div className="flex justify-between"><span className="text-slate-500">{language === 'si' ? 'API klici' : 'API calls'}:</span><span className="font-medium">{usage.totalCalls}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">{language === 'si' ? 'Vhodni tokeni' : 'Input tokens'}:</span><span className="font-medium">{usage.totalInputTokens.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">{language === 'si' ? 'Izhodni tokeni' : 'Output tokens'}:</span><span className="font-medium">{usage.totalOutputTokens.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">{language === 'si' ? 'Zadnji model' : 'Last model'}:</span><span className="font-medium text-sky-700 truncate max-w-[120px]">{usage.lastModel}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">{language === 'si' ? 'Zadnje generirano' : 'Last generated'}:</span><span className="font-medium">{new Date(usage.lastGenerated).toLocaleString()}</span></div>
            {usage.records && usage.records.length > 0 && (
              <div className="mt-3 pt-2 border-t border-slate-100">
                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{language === 'si' ? 'Zadnjih 5 klicev' : 'Last 5 calls'}</h5>
                {usage.records.slice(-5).reverse().map((rec: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center py-0.5 text-[10px]">
                    <span className="text-slate-500 truncate max-w-[100px]">{rec.sectionKey}</span>
                    <span className="text-slate-400">{(rec.model || '').split('/').pop()}</span>
                    <span className="font-medium">{rec.costEUR.toFixed(4)} EUR</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// EO-130: Combined toggle + generate button for sections that support references toggle
const SectionGenerateWithToggle = ({ sectionKey, projectData, onUpdateData, onGenerate, isLoading, title, text, missingApiKey, language }) => {
  const refsEnabled = projectData?._settings?.referencesEnabled?.[sectionKey] ?? DEFAULT_REFS_ENABLED[sectionKey] ?? false;
  const handleToggle = (sk: string, val: boolean) => {
    const cur = projectData?._settings?.referencesEnabled || {};
    onUpdateData(['_settings', 'referencesEnabled', sk], val);
  };
  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <ChapterCostBadge chapterKey={sectionKey} projectData={projectData} language={language} />
      <ReferenceToggle sectionKey={sectionKey} enabled={refsEnabled} onChange={handleToggle} language={language} />
      <GenerateButton onClick={onGenerate} isLoading={isLoading} title={title} text={text} missingApiKey={missingApiKey} />
    </div>
  );
};

const FieldCitationsPreview = ({ text, references, sectionKey, language }: { text: string, references: any[], sectionKey: string, language: string }) => {
    if (!text || !text.includes('[')) return null;

    // EO-141: Match both [PA-1] prefixed and legacy [1] formats, plus [N, M] multi-citation
    const regex = /(?:\(([^)]*?\d{4}[^)]*)\)\s*)?\[([A-Z]{2,3}-\d+|\d+(?:,\s*\d+)*)\]/g;
    let match;
    const citedRefs: { markerStr: string, refEntry: any, missing: boolean }[] = [];
    const seen = new Set<string>();

    while ((match = regex.exec(text)) !== null) {
        const rawPart = match[2];
        // Handle multi-citation [N, M] or single [PA-1] / [5]
        let markers: string[];
        if (/^[A-Z]{2,3}-\d+$/.test(rawPart)) {
            markers = ['[' + rawPart + ']'];
        } else {
            // Legacy comma-separated [N, M]
            markers = rawPart.split(/,\s*/).map((n: string) => '[' + n.trim() + ']');
        }
        for (const markerStr of markers) {
            if (!seen.has(markerStr)) {
                seen.add(markerStr);
                const refEntry = findReferenceByInlineMarker(markerStr, references, sectionKey);
                citedRefs.push({ markerStr, refEntry: refEntry || null, missing: !refEntry });
            }
        }
    }

    if (citedRefs.length === 0) return null;

    // Sort by numeric part
    citedRefs.sort((a, b) => {
        const aNum = parseInt(a.markerStr.replace(/\D/g, ''), 10) || 0;
        const bNum = parseInt(b.markerStr.replace(/\D/g, ''), 10) || 0;
        return aNum - bNum;
    });

    return (
        <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-lg shadow-sm animate-fadeIn">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                {language === 'si' ? 'Citirani viri v tem polju' : 'Cited sources in this field'}
            </h4>
            <div className="space-y-2">
                {citedRefs.map(({ markerStr, refEntry, missing }) => (
                    <div key={markerStr} className="flex items-start gap-2 text-sm">
                        {missing ? (
                            <span className="inline-flex items-center justify-center min-w-[1.5em] h-[1.5em] px-1 text-[10px] font-bold text-white bg-red-500 rounded flex-shrink-0 mt-0.5 cursor-help" title={language === 'si' ? `Referenca ${markerStr} manjka` : `Reference ${markerStr} is missing`}>
                                {markerStr.replace(/[\[\]]/g, '')}
                            </span>
                        ) : (
                            <a
                                href={`#${getReferenceAnchorId(refEntry, sectionKey)}`}
                                className="inline-flex items-center justify-center min-w-[1.5em] h-[1.5em] px-1 text-[10px] font-bold text-white bg-blue-500 rounded flex-shrink-0 mt-0.5 hover:bg-blue-600 transition-colors cursor-pointer"
                                onClick={(e) => {
                                    const targetId = getReferenceAnchorId(refEntry, sectionKey);
                                    window.dispatchEvent(new CustomEvent('open-reference', { detail: { targetId } }));
                                }}
                            >
                                {markerStr.replace(/[\[\]]/g, '')}
                            </a>
                        )}
                        {missing ? (
                            <span className="text-red-500 italic text-xs mt-0.5">
                                {language === 'si' ? 'Referenca ni bila najdena v seznamu.' : 'Reference not found in the list.'}
                            </span>
                        ) : (
                            <div className="text-slate-700 leading-snug text-xs">
                                <span className="font-medium">{refEntry.authors || 'Unknown author'}</span>
                                {refEntry.year ? ` (${refEntry.year})` : ''}
                                {refEntry.title ? `. ${refEntry.title}` : ''}
                                {refEntry.source ? `. ${refEntry.source}` : ''}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

const TextArea = ({ label, path, value, onUpdate, onGenerate, isLoading, placeholder, rows = 5, generateTitle, missingApiKey, className = "mb-5 w-full group", onFieldAIGenerate, language: fieldLanguage, references = [], sectionKey, refsEnabled = true }) => {
    const { config: rc } = useResponsive();
    // EO-140: Scale default rows (only for default rows=5, not explicit rows like rows=1)
    const effectiveRows = rows === 5 ? rc.content.textareaRows : rows;
    const enGen = TEXT.en.generating;
    const siGen = TEXT.si.generating;
    const fieldIsLoading = isLoading === `${enGen} ${String(path[path.length - 1])}...` || isLoading === `${siGen} ${String(path[path.length - 1])}...`;
    
    const actualSectionKey = sectionKey || (path && path.length > 0 ? String(path[0]) : '');
    const [isPreview, setIsPreview] = React.useState(false);
    const textAreaRef = useRef(null);
    const aiButtonRef = useRef<HTMLButtonElement>(null);
    const [aiAssistantOpen, setAiAssistantOpen] = React.useState(false);
    const [aiAnchorRect, setAiAnchorRect] = React.useState<{ top: number; right: number; bottom: number; left: number; width: number; height: number } | null>(null);
    
    const adjustHeight = useCallback(() => {
        const el = textAreaRef.current;
        if (el) {
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
        }
    }, []);
    
    useEffect(() => {
        adjustHeight();
        const rafId = requestAnimationFrame(() => {
            adjustHeight();
        });
        return () => cancelAnimationFrame(rafId);
    }, [value, adjustHeight]);

    useEffect(() => {
        const el = textAreaRef.current;
        if (!el) return;
        const observer = new ResizeObserver(() => {
            adjustHeight();
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [adjustHeight]);

    useEffect(() => {
        const handleResize = () => { adjustHeight(); };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [adjustHeight]);

    var handleAIAssistantGenerate = useCallback(async function(userInstructions: string) {
        if (onFieldAIGenerate) {
            return await onFieldAIGenerate(path, value || '', label, userInstructions);
        }
        // Fallback: use old generate if onFieldAIGenerate not provided
        onGenerate(path);
        return value || '';
    }, [onFieldAIGenerate, path, value, label, onGenerate]);

    var handleAIAccept = useCallback(function(newValue: string) {
        onUpdate(path, newValue);
    }, [onUpdate, path]);

    return (
        <div className={className}>
            <div className="flex justify-between items-end mb-1.5">
                <label className="block text-sm font-semibold text-slate-600 tracking-wide">{label}</label>
            </div>
            <div className="relative" style={{ zIndex: aiAssistantOpen ? 9999 : 'auto' }}>
                <textarea
                    ref={textAreaRef}
                    data-path={path.join(',')}
                    value={value || ''}
                    onChange={(e) => onUpdate(path, e.target.value)}
                    onInput={adjustHeight}
                    className="w-full p-3.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 pr-10 resize-none overflow-hidden block leading-relaxed shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
                    style={{ fontSize: rc.content.fontSize.body }}
                    rows={effectiveRows}
                    placeholder={placeholder}
                />
                <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 focus-within:opacity-100">
                    {onFieldAIGenerate ? (
                        <button
                            ref={aiButtonRef}
                            onClick={function() {
                                if (!aiAssistantOpen && aiButtonRef.current) {
                                    var rect = aiButtonRef.current.getBoundingClientRect();
                                    setAiAnchorRect({ top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height });
                                }
                                setAiAssistantOpen(!aiAssistantOpen);
                            }}
                            disabled={!!isLoading || missingApiKey}
                            className={'flex items-center justify-center font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-95 p-1.5 border ' + (aiAssistantOpen ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:shadow-md')}
                            title={missingApiKey ? 'Setup API Key' : (generateTitle || 'AI Assistant')}
                        >
                            {missingApiKey ? (
                                <ICONS.LOCK className="h-3.5 w-3.5" />
                            ) : (
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                                </svg>
                            )}
                        </button>
                    ) : (
                        <GenerateButton onClick={() => onGenerate(path)} isLoading={fieldIsLoading} isField title={generateTitle} missingApiKey={missingApiKey} />
                    )}
                </div>
                {refsEnabled && value && value.includes('[') && (
                    <div className="mt-2 flex justify-start">
                        <button
                            onClick={() => setIsPreview(!isPreview)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full hover:bg-indigo-100 transition-all"
                        >
                            {isPreview ? (fieldLanguage === 'si' ? 'Skrij citate' : 'Hide citations') : (fieldLanguage === 'si' ? 'Prikaži citate' : 'Preview citations')}
                        </button>
                    </div>
                )}
                {onFieldAIGenerate && (
                    <FieldAIAssistant
                        isOpen={aiAssistantOpen}
                        onClose={function() { setAiAssistantOpen(false); }}
                        onAccept={handleAIAccept}
                        onGenerate={handleAIAssistantGenerate}
                        currentValue={value || ''}
                        fieldLabel={label}
                        language={fieldLanguage || 'en'}
                        anchorRect={aiAnchorRect}
                    />
                )}
            </div>
            {refsEnabled && isPreview && (
                <FieldCitationsPreview text={value || ''} references={references} sectionKey={actualSectionKey} language={fieldLanguage} />
            )}
        </div>
    );
};

const AutoResizeTextarea = ({ value, onChange, placeholder, className = '', rows = 1 }) => {
    const ref = useRef<HTMLTextAreaElement>(null);
    const adjust = useCallback(() => {
        const el = ref.current;
        if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
    }, []);
    useEffect(() => { adjust(); }, [value, adjust]);
    useEffect(() => {
        const handleResize = () => adjust();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [adjust]);
    return (
        <textarea
            ref={ref}
            value={value || ''}
            onChange={onChange}
            onInput={adjust}
            placeholder={placeholder}
            rows={rows}
            className={`w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-base resize-none overflow-hidden ${className}`}
        />
    );
};

const ReadinessLevelSelector = ({ readinessLevels, onUpdateData, onGenerateField, onGenerateSection, isLoading, language, missingApiKey, references = [] }) => {
    const t = TEXT[language] || TEXT['en'];
    const definitions = getReadinessLevelsDefinitions(language);

    const handleLevelChange = (levelKey, value) => {
        onUpdateData(['projectIdea', 'readinessLevels', levelKey, 'level'], value);
    };

    return (
        <div id="readiness-levels" className="mt-8">
            <div className="flex justify-between items-end mb-4 border-b border-slate-200 pb-2">
                <div>
                    <h3 className="text-lg font-bold text-slate-700 flex items-center gap-2">{t.readinessLevels}<GuideTooltip stepKey="projectIdea" fieldKey="readinessLevels" language={language} size="sm" /></h3>
                    <p className="text-sm text-slate-500 mt-1">{t.readinessLevelsDesc}</p>
                </div>
                <GenerateButton
                    onClick={() => onGenerateSection('readinessLevels')}
                    isLoading={isLoading === `${t.generating} readinessLevels...`}
                    title={t.generateSubSection}
                    text={t.generateAI}
                    missingApiKey={missingApiKey}
                />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Object.entries(definitions).map(([key, def]) => {
                    // ★ v8.2 EO-066: Guard against definitions without levels (unknown readiness key)
                    if (!def || !Array.isArray(def.levels)) return null;
                    const levelKey = key;
                    const selectedLevelData = readinessLevels ? readinessLevels[levelKey] : { level: null, justification: '' };
                    const hasContent = selectedLevelData && (selectedLevelData.level !== null || (typeof selectedLevelData.justification === 'string' && selectedLevelData.justification.trim()));

                    return (
                        <div key={key} className="p-5 border border-slate-200 rounded-xl bg-white shadow-sm flex flex-col hover:shadow-md transition-all card-hover animate-fadeIn relative group">
                            {hasContent && (
                                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <RemoveButton onClick={() => { onUpdateData(['projectIdea', 'readinessLevels', levelKey, 'level'], null); onUpdateData(['projectIdea', 'readinessLevels', levelKey, 'justification'], ''); }} text={t.remove} />
                                </div>
                            )}
                            <div className="mb-3">
                                <h4 className="font-bold text-slate-800 text-base">{def.name}</h4>
                                <p className="text-xs text-slate-500 mt-1">{def.description}</p>
                            </div>

                            <select
                                value={selectedLevelData?.level || ''}
                                onChange={(e) => handleLevelChange(levelKey, e.target.value ? parseInt(e.target.value, 10) : null)}
                                className="w-full p-2.5 border border-slate-300 rounded-lg mb-4 text-base bg-slate-50 focus:bg-white transition-colors"
                            >
                                <option value="">{t.notSelected}</option>
                                {def.levels.map(l => (
                                    <option key={l.level} value={l.level}>
                                        {`${key} ${l.level}: ${l.title}`}
                                    </option>
                                ))}
                            </select>

                            <div className="flex-grow flex flex-col">
                                <TextArea
                                    label={t.justification}
                                    path={['projectIdea', 'readinessLevels', levelKey, 'justification']}
                                    value={selectedLevelData?.justification || ''}
                                    onUpdate={onUpdateData}
                                    onGenerate={onGenerateField}
                                    isLoading={isLoading}
                                    rows={2}
                                    placeholder={t.justificationPlaceholder}
                                    generateTitle={`${t.generateField} ${t.justification}`}
                                    missingApiKey={missingApiKey}
                                    onFieldAIGenerate={null}
                                    language={language} references={references} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};


const DependencySelector = ({ task, allTasks, onAddDependency, onRemoveDependency, language }) => {
    const t = TEXT[language] || TEXT['en'];
    const [selectedId, setSelectedId] = React.useState('');
    const [selectedType, setSelectedType] = React.useState('FS');

    const handleAdd = () => {
        if (selectedId) {
            onAddDependency({ predecessorId: selectedId, type: selectedType });
            setSelectedId('');
        }
    };

    const availableTasks = allTasks.filter(t => t.id !== task.id && !(task.dependencies || []).some(d => d.predecessorId === t.id));

    return (
        <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <h6 className="text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">{t.dependencies}</h6>
            <div className="flex gap-2 mb-2">
                <select 
                    className="flex-1 text-sm p-1.5 rounded border border-slate-300 bg-white" 
                    value={selectedId} 
                    onChange={e => setSelectedId(e.target.value)}
                >
                    <option value="">{t.predecessor}...</option>
                    {availableTasks.map(at => (
                        <option key={at.id} value={at.id}>{at.id}: {String(at.title || '').substring(0, 30)}...</option>
                    ))}
                </select>
                <select 
                    className="w-24 text-sm p-1.5 rounded border border-slate-300 bg-white"
                    value={selectedType}
                    onChange={e => setSelectedType(e.target.value)}
                >
                    {Object.keys(t.depTypes).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <button onClick={handleAdd} disabled={!selectedId} className="px-3 bg-sky-600 text-white rounded font-bold hover:bg-sky-700 disabled:opacity-50 transition-colors">+</button>
            </div>
            <div className="space-y-1.5">
                {(Array.isArray(task.dependencies) ? task.dependencies : []).map((dep, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-white px-2 py-1.5 rounded border border-slate-200 text-xs shadow-sm">
                        <span className="text-slate-700">{t.predecessor}: <strong className="text-sky-700">{dep.predecessorId}</strong> <span className="text-slate-400">({dep.type})</span></span>
                        <button onClick={() => onRemoveDependency(idx)} className="text-red-400 hover:text-red-600 font-bold ml-2 px-1">✕</button>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- Section Renderers ---
const renderProblemAnalysis = (props) => {
    const { projectData, onUpdateData, onGenerateField, onGenerateSection, onAddItem, onRemoveItem, isLoading, language, missingApiKey, onOpenSettings, vizTrigger, onFieldAIGenerate } = props;
    // ★ v8.2 EO-066: Safe destructuring — guard against undefined or non-object problemAnalysis
    const pa = projectData.problemAnalysis && typeof projectData.problemAnalysis === 'object' ? projectData.problemAnalysis : {};
    const coreProblem = pa.coreProblem && typeof pa.coreProblem === 'object' ? pa.coreProblem : { title: '', description: '' };
    const causes = Array.isArray(pa.causes) ? pa.causes : [];
    const consequences = Array.isArray(pa.consequences) ? pa.consequences : [];
    const path = ['problemAnalysis'];
    const t = TEXT[language] || TEXT['en'];
    // ★ EO-081: references for citation preview
    const refs = Array.isArray(projectData.references) ? projectData.references : [];

    return (
        <>
            <div id="core-problem">
                <SectionHeader title={t.coreProblem} guideStep="problemAnalysis" guideField="coreProblem" language={language}>
                    <GenerateButton onClick={() => onGenerateSection('coreProblem')} isLoading={isLoading === `${t.generating} coreProblem...`} title={t.generateSubSection} text={t.generateAI} missingApiKey={missingApiKey} />
                </SectionHeader>
                <p className="text-sm text-slate-500 mb-3 -mt-2">{t.coreProblemDesc}</p>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative group hover:shadow-md transition-all">
                    {(typeof coreProblem.title === 'string' && coreProblem.title.trim() || typeof coreProblem.description === 'string' && coreProblem.description.trim()) && <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => { onUpdateData([...path, 'coreProblem', 'title'], ''); onUpdateData([...path, 'coreProblem', 'description'], ''); }} text={t.remove} /></div>}
                    <TextArea label={t.title} path={[...path, 'coreProblem', 'title']} value={coreProblem.title} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.coreProblemTitlePlaceholder} generateTitle={`${t.generateField} ${t.coreProblem}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                    <TextArea label={t.description} path={[...path, 'coreProblem', 'description']} value={coreProblem.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.coreProblemDescPlaceholder} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                    <InlineChart text={coreProblem.description || ''} fieldContext="coreProblem" language={language} onRateLimitError={onOpenSettings} triggerExtraction={vizTrigger} />
                </div>
            </div>

            <div id="causes" className="mt-8">
                <SectionHeader title={t.causes} onAdd={() => onAddItem([...path, 'causes'], { id: null, title: '', description: '' })} addText={t.add} guideStep="problemAnalysis" guideField="causes" language={language}>
                    <GenerateButton onClick={() => onGenerateSection('causes')} isLoading={isLoading === `${t.generating} causes...`} title={t.generateSubSection} text={t.generateAI} missingApiKey={missingApiKey} />
                </SectionHeader>
                {causes.map((cause, index) => (
                    <div key={index} className="p-5 border border-slate-200 rounded-xl mb-4 bg-white shadow-sm relative group transition-all hover:shadow-md card-hover animate-fadeIn">
                         <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onRemoveItem([...path, 'causes'], index)} text={t.remove} /></div>
                        <TextArea label={`${t.causeTitle} #${index + 1}`} path={[...path, 'causes', index, 'title']} value={cause.title} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.causePlaceholder} generateTitle={`${t.generateField} ${t.title}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                        <TextArea label={t.description} path={[...path, 'causes', index, 'description']} value={cause.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.causeDescPlaceholder} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                        <InlineChart text={cause.description || ''} fieldContext={'cause_' + index} language={language} onRateLimitError={onOpenSettings} triggerExtraction={vizTrigger} />
                    </div>
                ))}
            </div>

            <div id="consequences" className="mt-8">
                <SectionHeader title={t.consequences} onAdd={() => onAddItem([...path, 'consequences'], { id: null, title: '', description: '' })} addText={t.add} guideStep="problemAnalysis" guideField="consequences" language={language}>
                    <GenerateButton onClick={() => onGenerateSection('consequences')} isLoading={isLoading === `${t.generating} consequences...`} title={t.generateSubSection} text={t.generateAI} missingApiKey={missingApiKey} />
                </SectionHeader>
                {consequences.map((consequence, index) => (
                    <div key={index} className="p-5 border border-slate-200 rounded-xl mb-4 bg-white shadow-sm relative group transition-all hover:shadow-md card-hover animate-fadeIn">
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onRemoveItem([...path, 'consequences'], index)} text={t.remove} /></div>
                        <TextArea label={`${t.consequenceTitle} #${index + 1}`} path={[...path, 'consequences', index, 'title']} value={consequence.title} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.consequencePlaceholder} generateTitle={`${t.generateField} ${t.title}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                        <TextArea label={t.description} path={[...path, 'consequences', index, 'description']} value={consequence.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.consequenceDescPlaceholder} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                        <InlineChart text={consequence.description || ''} fieldContext={'consequence_' + index} language={language} onRateLimitError={onOpenSettings} triggerExtraction={vizTrigger} />
                    </div>
                ))}
            </div>
        </>
    );
};

const renderProjectIdea = (props) => {
    const { projectData, onUpdateData, onGenerateField, onGenerateSection, onAddItem, onRemoveItem, isLoading, language, missingApiKey, onOpenSettings, vizTrigger, onFieldAIGenerate } = props;
    // ★ v8.2 EO-066: Safe destructuring — guard against malformed data
    const pi = projectData.projectIdea && typeof projectData.projectIdea === 'object' ? projectData.projectIdea : {};
    const mainAim = typeof pi.mainAim === 'string' ? pi.mainAim : '';
    const stateOfTheArt = typeof pi.stateOfTheArt === 'string' ? pi.stateOfTheArt : '';
    const proposedSolution = typeof pi.proposedSolution === 'string' ? pi.proposedSolution : '';
    const policies = Array.isArray(pi.policies) ? pi.policies : [];
    const readinessLevels = pi.readinessLevels && typeof pi.readinessLevels === 'object' ? pi.readinessLevels : {};
    const projectTitle = typeof pi.projectTitle === 'string' ? pi.projectTitle : '';
    const projectAcronym = typeof pi.projectAcronym === 'string' ? pi.projectAcronym : '';
    const startDate = pi.startDate || '';
    const path = ['projectIdea'];
    const t = TEXT[language] || TEXT['en'];
    
    // ★ v8.2 EO-066: Safe access for deeply nested fields
    const cpTitle = projectData.problemAnalysis?.coreProblem?.title || '';
    const isCoreProblemFilled = typeof cpTitle === 'string' && cpTitle.trim() !== '';
    const isMainAimFilled = mainAim.trim() !== '';
    const canEditTitle = isCoreProblemFilled && isMainAimFilled;
    // ★ EO-081: references for citation preview
    const refs = Array.isArray(projectData.references) ? projectData.references : [];

    return (
        <>
            <div className={`mb-8 p-6 border border-slate-200 rounded-xl bg-gradient-to-br from-white to-slate-50 shadow-sm transition-all duration-300 ${!canEditTitle ? 'filter blur-sm opacity-60 pointer-events-none' : ''}`}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">{t.projectTitle}<GuideTooltip stepKey="projectIdea" fieldKey="projectTitle" language={language} size="sm" /></h3>
                    <GenerateButton onClick={() => onGenerateSection('projectTitleAcronym')} isLoading={isLoading === `${t.generating} projectTitleAcronym...`} title={t.generateSubSection} text={t.generateAI} missingApiKey={missingApiKey} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <TextArea label={t.projectTitle} path={[...path, 'projectTitle']} value={projectTitle} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.projectTitlePlaceholder} generateTitle={`${t.generateField} ${t.projectTitle}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                    <TextArea label={t.acronym} path={[...path, 'projectAcronym']} value={projectAcronym} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.projectAcronymPlaceholder} generateTitle={`${t.generateField} ${t.acronym}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.projectStartDate}</label>
                        <input type="date" value={startDate || ''} onChange={(e) => onUpdateData([...path, 'startDate'], e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 shadow-sm text-base" />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.projectDuration}</label>
                        <select className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 shadow-sm text-base bg-white" value={projectData.projectIdea?.durationMonths || 24} onChange={(e) => onUpdateData(['projectIdea', 'durationMonths'], parseInt(e.target.value))}>
                            {[6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42, 48, 54, 60].map(m => (
                                <option key={m} value={m}>{m} {t.months}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.projectEndDate}</label>
                        <div className="p-2.5 border border-slate-200 rounded-lg bg-slate-50 text-base font-bold text-sky-700 shadow-sm">
                            {projectData.projectIdea?.startDate ? (() => {
                                const start = new Date(projectData.projectIdea.startDate);
                                const months = projectData.projectIdea?.durationMonths || 24;
                                const end = new Date(start);
                                end.setMonth(end.getMonth() + months);
                                end.setDate(end.getDate() - 1);
                                return end.toISOString().split('T')[0];
                            })() : '—'}
                        </div>
                    </div>
                </div>
                <p className="text-xs text-slate-400 mt-2">{t.projectDurationDesc}</p>
            </div>

            <div id="main-aim">
                <SectionHeader title={t.mainAim} guideStep="projectIdea" guideField="mainAim" language={language}>
                    <GenerateButton onClick={() => onGenerateSection('mainAim')} isLoading={isLoading === `${t.generating} mainAim...`} title={t.generateSubSection} text={t.generateAI} missingApiKey={missingApiKey} />
                </SectionHeader>

                <p className="text-sm text-slate-500 mb-3 -mt-2">{t.mainAimDesc}</p>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative group hover:shadow-md transition-all">
                    {typeof mainAim === 'string' && mainAim.trim() && <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onUpdateData(['projectIdea', 'mainAim'], '')} text={t.remove} /></div>}
                    <TextArea label={t.mainAim} path={[...path, 'mainAim']} value={mainAim} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.mainAimPlaceholder} generateTitle={`${t.generateField} ${t.mainAim}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                    </div>
            </div>

            <div id="state-of-the-art" className="mt-6">
                <SectionHeader title={t.stateOfTheArt} guideStep="projectIdea" guideField="stateOfTheArt" language={language}>
                    <GenerateButton onClick={() => onGenerateSection('stateOfTheArt')} isLoading={isLoading === `${t.generating} stateOfTheArt...`} title={t.generateSubSection} text={t.generateAI} missingApiKey={missingApiKey} />
                </SectionHeader>
                <p className="text-sm text-slate-500 mb-3 -mt-2">{t.stateOfTheArtDesc}</p>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative group hover:shadow-md transition-all">
                    {typeof stateOfTheArt === 'string' && stateOfTheArt.trim() && <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onUpdateData(['projectIdea', 'stateOfTheArt'], '')} text={t.remove} /></div>}
                    <TextArea label={t.stateOfTheArt} path={[...path, 'stateOfTheArt']} value={stateOfTheArt} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.stateOfTheArtPlaceholder} generateTitle={`${t.generateField} ${t.stateOfTheArt}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                    <InlineChart text={stateOfTheArt || ''} fieldContext="stateOfTheArt" language={language} onRateLimitError={onOpenSettings} triggerExtraction={vizTrigger} />
                </div>
            </div>

            <div id="proposed-solution" className="mt-6">
                <SectionHeader title={t.proposedSolution} guideStep="projectIdea" guideField="proposedSolution" language={language}>
                    <GenerateButton onClick={() => onGenerateSection('proposedSolution')} isLoading={isLoading === `${t.generating} proposedSolution...`} title={t.generateSubSection} text={t.generateAI} missingApiKey={missingApiKey} />
                </SectionHeader>
                <p className="text-sm text-slate-500 mb-3 -mt-2">{t.proposedSolutionDesc}</p>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative group hover:shadow-md transition-all">
                    {typeof proposedSolution === 'string' && proposedSolution.trim() && <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onUpdateData(['projectIdea', 'proposedSolution'], '')} text={t.remove} /></div>}
                    <TextArea label={t.proposedSolution} path={[...path, 'proposedSolution']} value={proposedSolution} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.proposedSolutionPlaceholder} generateTitle={`${t.generateField} ${t.proposedSolution}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                    <InlineChart text={proposedSolution || ''} fieldContext="proposedSolution" language={language} onRateLimitError={onOpenSettings} triggerExtraction={vizTrigger} />
                </div>
            </div>
            
            <ReadinessLevelSelector readinessLevels={readinessLevels} onUpdateData={onUpdateData} onGenerateField={onGenerateField} onGenerateSection={onGenerateSection} isLoading={isLoading} language={language} missingApiKey={missingApiKey} references={refs} />

            <div id="eu-policies" className="mt-8">
                 <SectionHeader title={t.euPolicies} onAdd={() => onAddItem([...path, 'policies'], { id: null, name: '', description: '' })} addText={t.add} guideStep="projectIdea" guideField="euPolicies" language={language}>
                    <GenerateButton onClick={() => onGenerateSection('policies')} isLoading={isLoading === `${t.generating} policies...`} title={t.generateSubSection} text={t.generateAI} missingApiKey={missingApiKey} />
                 </SectionHeader>
                 {policies.map((policy, index) => (
                    <div key={index} className="p-5 border border-slate-200 rounded-xl mb-4 bg-white shadow-sm relative group hover:shadow-md transition-all card-hover animate-fadeIn">
                         <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onRemoveItem([...path, 'policies'], index)} text={t.remove} /></div>
                        <TextArea label={`${t.policyName} #${index + 1}`} path={[...path, 'policies', index, 'name']} value={policy.name} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.policyPlaceholder} generateTitle={`${t.generateField} ${t.policyName}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                        <TextArea label={t.policyDesc} path={[...path, 'policies', index, 'description']} value={policy.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.policyDescPlaceholder} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                        </div>
                ))}
            </div>
        </>
    );
};
const renderGenericResults = (props, sectionKey) => {
    const { projectData, onUpdateData, onGenerateField, onGenerateSection, onAddItem, onRemoveItem, isLoading, language, missingApiKey, onOpenSettings, vizTrigger, onFieldAIGenerate } = props;
    const items = projectData[sectionKey];
    const t = TEXT[language] || TEXT['en'];
    const title = t[sectionKey];
    const getPrefix = (key) => { switch (key) { case 'outputs': return 'D'; case 'outcomes': return 'R'; case 'impacts': return 'I'; } };
    const prefix = getPrefix(sectionKey);
    // ★ EO-081: references for citation preview
    const refs = Array.isArray(projectData.references) ? projectData.references : [];
    // EO-145: read refs toggle for this chapter
    const refsEnabled = projectData?._settings?.referencesEnabled?.[sectionKey] ?? DEFAULT_REFS_ENABLED[sectionKey] ?? false;

    return (
        <div id={sectionKey} className="mt-8">
             <SectionHeader title={title} onAdd={() => onAddItem([sectionKey], { id: null, title: '', description: '', indicator: '' })} addText={t.add} guideStep="expectedResults" guideField={sectionKey} language={language}>
                <GenerateButton onClick={() => onGenerateSection(sectionKey)} isLoading={isLoading === `${t.generating} ${sectionKey}...`} title={t.generateSubSection} text={t.generateAI} missingApiKey={missingApiKey} />
             </SectionHeader>
             {safeArray(items).map((item, index) => (
                <div key={index} className="p-5 border border-slate-200 rounded-xl mb-4 bg-white shadow-sm relative group hover:shadow-md transition-all card-hover animate-fadeIn">
                     <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onRemoveItem([sectionKey], index)} text={t.remove} /></div>
                    <TextArea label={`${prefix}${index + 1}`} path={[sectionKey, index, 'title']} value={item.title} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.enterTitle} generateTitle={`${t.generateField} ${t.title}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} refsEnabled={refsEnabled} />
                    <TextArea label={t.description} path={[sectionKey, index, 'description']} value={item.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.enterDesc} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} refsEnabled={refsEnabled} />
                    <InlineChart text={item.description || ''} fieldContext={sectionKey + '_' + index} language={language} onRateLimitError={onOpenSettings} triggerExtraction={vizTrigger} />
                    <TextArea label={t.indicator} path={[sectionKey, index, 'indicator']} value={item.indicator} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.indicatorPlaceholder} generateTitle={`${t.generateField} ${t.indicator}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} refsEnabled={refsEnabled} />
                </div>
            ))}
        </div>
    );
};

const renderObjectives = (props, sectionKey) => {
    const { projectData, onUpdateData, onGenerateField, onGenerateSection, onAddItem, onRemoveItem, isLoading, language, missingApiKey, onOpenSettings, vizTrigger, onFieldAIGenerate } = props;
    const items = projectData[sectionKey];
    const t = TEXT[language] || TEXT['en'];
    const title = sectionKey === 'generalObjectives' ? t.generalObjectives : t.specificObjectives;
    const prefix = sectionKey === 'generalObjectives' ? 'GO' : 'SO';
    // ★ EO-081: references for citation preview
    const refs = Array.isArray(projectData.references) ? projectData.references : [];
    // EO-145: read refs toggle for this chapter
    const refsEnabled = projectData?._settings?.referencesEnabled?.[sectionKey] ?? DEFAULT_REFS_ENABLED[sectionKey] ?? false;
    
    return (
        <div className="mt-2">
             <SectionHeader title={title} onAdd={() => onAddItem([sectionKey], { id: null, title: '', description: '', indicator: '' })} addText={t.add} guideStep={sectionKey} guideField="objective" language={language}>
                <GenerateButton onClick={() => onGenerateSection(sectionKey)} isLoading={isLoading === `${t.generating} ${sectionKey}...`} title={t.generateSection} text={t.generateAI} missingApiKey={missingApiKey} />
             </SectionHeader>
             {safeArray(items).map((item, index) => (
                <div key={index} className="p-5 border border-slate-200 rounded-xl mb-4 bg-white shadow-sm relative group hover:shadow-md transition-all card-hover animate-fadeIn">
                     <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onRemoveItem([sectionKey], index)} text={t.remove} /></div>
                    <TextArea label={`${prefix}${index + 1}`} path={[sectionKey, index, 'title']} value={item.title} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.enterTitle} generateTitle={`${t.generateField} ${t.title}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} refsEnabled={refsEnabled} />
                    <TextArea label={t.description} path={[sectionKey, index, 'description']} value={item.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.enterDesc} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} refsEnabled={refsEnabled} />
                    <InlineChart text={item.description || ''} fieldContext={sectionKey + '_' + index} language={language} onRateLimitError={onOpenSettings} triggerExtraction={vizTrigger} />
                    <TextArea label={t.indicator} path={[sectionKey, index, 'indicator']} value={item.indicator} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.indicatorPlaceholder} generateTitle={`${t.generateField} ${t.indicator}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} refsEnabled={refsEnabled} />
                </div>
            ))}
        </div>
    );
};

const renderProjectManagement = (props) => {
    const { projectData, onUpdateData, onGenerateField, onGenerateSection, isLoading, language, missingApiKey, onFieldAIGenerate } = props;
    const { projectManagement } = projectData;
    const t = TEXT[language] || TEXT['en'];
    const pmPath = ['projectManagement'];
    const pmDescValue = projectManagement?.description || '';
    // ★ EO-081: references for citation preview
    const refs = Array.isArray(projectData.references) ? projectData.references : [];

    return (
        <div id="implementation" className="mb-10 pb-8">
            <SectionHeader title={t.management.title} guideStep="activities" guideField="implementation" language={language}>
                <GenerateButton onClick={() => onGenerateSection('projectManagement')} isLoading={isLoading === `${t.generating} projectManagement...`} title={t.generateSubSection} text={t.generateAI} missingApiKey={missingApiKey} />
            </SectionHeader>
            <p className="text-sm text-slate-500 mb-6 -mt-2">{t.management.desc}</p>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-8 relative group hover:shadow-md transition-all">
                {typeof pmDescValue === 'string' && pmDescValue.trim() && (
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <RemoveButton onClick={() => onUpdateData([...pmPath, 'description'], '')} text={t.remove} />
                    </div>
                )}
                <TextArea label={t.description} path={[...pmPath, 'description']} value={pmDescValue} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.management.placeholder} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                </div>
            <div id="organigram">
                <div className="mb-3 border-b border-slate-200 pb-2">
                    <h4 className="text-lg font-bold text-slate-700 flex items-center gap-2">{t.management.organigram}<GuideTooltip stepKey="activities" fieldKey="organigram" language={language} size="sm" /></h4>
                </div>
                <div className="chart-container-white overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <Organigram structure={projectManagement?.structure} activities={projectData.activities} language={language} id="organigram-interactive" />
                </div>
            </div>
        </div>
    );
};

const renderRisks = (props) => {
    const { projectData, onUpdateData, onGenerateField, onGenerateSection, onAddItem, onRemoveItem, isLoading, language, missingApiKey, onOpenSettings, vizTrigger, onFieldAIGenerate } = props;
    const { risks } = projectData;
    const path = ['risks'];
    const t = TEXT[language] || TEXT['en'];
    const trafficColors = { low: 'bg-green-100 border-green-300 text-green-800', medium: 'bg-yellow-100 border-yellow-300 text-yellow-800', high: 'bg-red-100 border-red-300 text-red-800' };
    const getTrafficColor = (value) => { if (!value) return trafficColors.low; return trafficColors[value.toLowerCase()] || trafficColors.low; };
    // ★ EO-081: references for citation preview
    const refs = Array.isArray(projectData.references) ? projectData.references : [];
    
    return (
        <div id="risk-mitigation" className="mt-12 border-t-2 border-slate-200 pt-8">
            <SectionHeader title={t.subSteps.riskMitigation} onAdd={() => onAddItem(path, { id: `RISK${safeArray(risks).length + 1}`, category: 'technical', title: '', description: '', likelihood: 'low', impact: 'low', mitigation: '' })} addText={t.add} guideStep="activities" guideField="riskMitigation" language={language}>
                <GenerateButton onClick={() => onGenerateSection('risks')} isLoading={isLoading === `${t.generating} risks...`} title={t.generateSubSection} text={t.generateAI} missingApiKey={missingApiKey} />
            </SectionHeader>
            {safeArray(risks).map((risk, index) => {
                const likelihoodLoading = isLoading === `${t.generating} likelihood...`;
                const impactLoading = isLoading === `${t.generating} impact...`;
                return (
                <div key={index} className="p-5 border border-slate-200 rounded-xl mb-4 bg-white shadow-sm relative group hover:shadow-md transition-all card-hover animate-fadeIn">
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onRemoveItem(path, index)} text={t.remove} /></div>
                    <div className="flex flex-wrap gap-4 mb-4">
                        <div className="w-28">
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.risks.riskId}</label>
                            <input type="text" value={risk.id || ''} onChange={(e) => onUpdateData([...path, index, 'id'], e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 font-bold bg-slate-50 text-base" />
                        </div>
                        <div className="w-48">
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.risks.category}</label>
                            <select value={risk.category || 'technical'} onChange={(e) => onUpdateData([...path, index, 'category'], e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg bg-white text-base">
                                <option value="technical">{t.risks.categories.technical}</option>
                                <option value="social">{t.risks.categories.social}</option>
                                <option value="economic">{t.risks.categories.economic}</option>
                                <option value="environmental">{t.risks.categories.environmental}</option>
                            </select>
                        </div>
                        <div className="flex-1 min-w-[200px]">
                             <TextArea label={t.risks.riskTitle} path={[...path, index, 'title']} value={risk.title} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.risks.titlePlaceholder} generateTitle={`${t.generateField} ${t.title}`} missingApiKey={missingApiKey} className="w-full group" onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                        </div>
                    </div>
                    <TextArea label={t.risks.riskDescription} path={[...path, index, 'description']} value={risk.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.risks.descPlaceholder} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.risks.likelihood}</label>
                            <div className="relative">
                                <select value={risk.likelihood} onChange={(e) => onUpdateData([...path, index, 'likelihood'], e.target.value)} className={`w-full p-2.5 border rounded-lg font-bold ${getTrafficColor(risk.likelihood)} pr-10 appearance-none transition-colors cursor-pointer text-base`}>
                                    <option value="low" className="bg-white text-slate-800">{t.risks.levels.low}</option>
                                    <option value="medium" className="bg-white text-slate-800">{t.risks.levels.medium}</option>
                                    <option value="high" className="bg-white text-slate-800">{t.risks.levels.high}</option>
                                </select>
                                <div className="absolute top-1.5 right-1.5"><GenerateButton onClick={() => onGenerateField([...path, index, 'likelihood'])} isLoading={likelihoodLoading} isField title={t.generateAI} missingApiKey={missingApiKey} /></div>
                            </div>
                        </div>
                         <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.risks.impact}</label>
                             <div className="relative">
                                <select value={risk.impact} onChange={(e) => onUpdateData([...path, index, 'impact'], e.target.value)} className={`w-full p-2.5 border rounded-lg font-bold ${getTrafficColor(risk.impact)} pr-10 appearance-none transition-colors cursor-pointer text-base`}>
                                    <option value="low" className="bg-white text-slate-800">{t.risks.levels.low}</option>
                                    <option value="medium" className="bg-white text-slate-800">{t.risks.levels.medium}</option>
                                    <option value="high" className="bg-white text-slate-800">{t.risks.levels.high}</option>
                                </select>
                                <div className="absolute top-1.5 right-1.5"><GenerateButton onClick={() => onGenerateField([...path, index, 'impact'])} isLoading={impactLoading} isField title={t.generateAI} missingApiKey={missingApiKey} /></div>
                            </div>
                        </div>
                    </div>
                    <TextArea label={t.risks.mitigation} path={[...path, index, 'mitigation']} value={risk.mitigation} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.risks.mitigationPlaceholder} generateTitle={`${t.generateField} ${t.risks.mitigation}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                    <InlineChart text={(risk.description || '') + ' ' + (risk.mitigation || '')} fieldContext={'risk_' + index} language={language} onRateLimitError={onOpenSettings} triggerExtraction={vizTrigger} />
                </div>
            )})}
        </div>
    );
};

const renderKERs = (props) => {
    const { projectData, onUpdateData, onGenerateField, onGenerateSection, onAddItem, onRemoveItem, isLoading, language, missingApiKey, onOpenSettings, vizTrigger, onFieldAIGenerate } = props;
    const { kers } = projectData;
    const path = ['kers'];
    const t = TEXT[language] || TEXT['en'];
    // ★ EO-081: references for citation preview
    const refs = Array.isArray(projectData.references) ? projectData.references : [];

    return (
        <div id="kers" className="mt-12 border-t-2 border-slate-200 pt-8">
            <SectionHeader title={t.subSteps.kers} onAdd={() => onAddItem(path, { id: `KER${safeArray(kers).length + 1}`, title: '', description: '', exploitationStrategy: '' })} addText={t.add} guideStep="expectedResults" guideField="kers" language={language}>
                <GenerateButton onClick={() => onGenerateSection('kers')} isLoading={isLoading === `${t.generating} kers...`} title={t.generateSubSection} text={t.generateAI} missingApiKey={missingApiKey} />
            </SectionHeader>
            {safeArray(kers).map((ker, index) => (
                 <div key={index} className="p-5 border border-slate-200 rounded-xl mb-4 bg-white shadow-sm relative group hover:shadow-md transition-all card-hover animate-fadeIn">
                     <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onRemoveItem(path, index)} text={t.remove} /></div>
                     <div className="flex flex-wrap gap-4 mb-4">
                        <div className="w-28">
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.kers.kerId}</label>
                            <input type="text" value={ker.id || ''} onChange={(e) => onUpdateData([...path, index, 'id'], e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 font-bold bg-slate-50 text-base" />
                        </div>
                        <div className="flex-1 min-w-[200px]">
                             <TextArea label={t.kers.kerTitle} path={[...path, index, 'title']} value={ker.title} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.kers.titlePlaceholder} generateTitle={`${t.generateField} ${t.title}`} missingApiKey={missingApiKey} className="w-full group" onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                        </div>
                     </div>
                     <TextArea label={t.kers.kerDesc} path={[...path, index, 'description']} value={ker.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.kers.descPlaceholder} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                     <TextArea label={t.kers.exploitationStrategy} path={[...path, index, 'exploitationStrategy']} value={ker.exploitationStrategy} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.kers.strategyPlaceholder} generateTitle={`${t.generateField} ${t.kers.exploitationStrategy}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                     <InlineChart text={(ker.description || '') + ' ' + (ker.exploitationStrategy || '')} fieldContext={'ker_' + index} language={language} onRateLimitError={onOpenSettings} triggerExtraction={vizTrigger} />
                </div>
            ))}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════
// ★ v7.0.1: Partnership (Consortium) renderer — BUGFIX
// ═══════════════════════════════════════════════════════════════
const renderPartners = (props) => {
    const { projectData, onUpdateData, onAddItem, onRemoveItem, onGenerateSection, isLoading, language, missingApiKey } = props;
    const t = TEXT[language] || TEXT['en'];
    const tp = t.partners || {};
    const partners = Array.isArray(projectData.partners) ? projectData.partners : [];

    return (
        <div id="partners" className="mt-12 mb-8 border-t-2 border-slate-200 pt-8">
            <SectionHeader title={tp.title || 'Partnership (Consortium)'} guideStep="activities" guideField="partners" language={language}>
                <GenerateButton onClick={() => onGenerateSection('partners')} isLoading={isLoading === `${t.generating} partners...`} title={t.generateSubSection} text={t.generateAI} missingApiKey={missingApiKey} />
            </SectionHeader>
            <p className="text-sm text-slate-500 mb-6 -mt-2">{tp.titleDesc || ''}</p>

            <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">{tp.partnerName || 'Partners'}</h4>
                <div className="flex gap-2">
                    {partners.length > 0 && (Array.isArray(projectData.activities) ? projectData.activities : []).length > 0 && (
                        <button
                            onClick={() => onGenerateSection('partnerAllocations')}
                            disabled={!!isLoading}
                            className="px-3 py-1.5 text-sm font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 hover:shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                        >
                            <ICONS.SPARKLES className="h-4 w-4" />
                            {tp.generateAllocations || 'Generate Partner Allocations with AI'}
                        </button>
                    )}
                    <button
                        onClick={() => {
                            const nextIndex = partners.length;
                            const code = nextIndex === 0 ? (language === 'si' ? 'KO' : 'CO') : `P${nextIndex + 1}`;
                            onAddItem(['partners'], {
                                id: `partner-${Date.now()}`,
                                code: code,
                                name: '',
                                expertise: '',
                                pmRate: 0,
                                partnerType: undefined
                            });
                        }}
                        className="px-3 py-1.5 text-sm font-semibold text-white bg-sky-600 rounded-lg shadow-sm hover:bg-sky-700 hover:shadow-md transition-all flex items-center gap-1.5 active:scale-95"
                    >
                        <span className="text-base leading-none font-bold">+</span> {tp.addPartner || t.add}
                    </button>
                </div>
            </div>

            {partners.length === 0 && (
                <div className="text-center py-8 text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    {tp.noPartnersYet || 'No partners defined yet.'}
                </div>
            )}

            {partners.map((partner, index) => (
                <div key={partner.id || index} className="p-5 border border-slate-200 rounded-xl mb-4 bg-white shadow-sm relative group hover:shadow-md transition-all card-hover animate-fadeIn">
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <RemoveButton onClick={() => onRemoveItem(['partners'], index)} text={tp.removePartner || t.remove} />
                    </div>

                    <div className="flex items-center gap-3 mb-4">
                        <span className={`px-3 py-1 rounded-lg text-sm font-bold ${index === 0 ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-sky-100 text-sky-800 border border-sky-200'}`}>
                            {partner.code || (index === 0 ? 'CO' : `P${index + 1}`)}
                        </span>
                        {index === 0 && <span className="text-xs text-amber-600 font-semibold">{tp.coordinator || 'Coordinator'}</span>}
                        {partner.partnerType && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200">
                                {(tp.partnerTypes || {})[partner.partnerType] || partner.partnerType}
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-600 mb-1.5">{tp.code || 'Code'}</label>
                            <input
                                type="text"
                                value={partner.code || ''}
                                onChange={(e) => onUpdateData(['partners', index, 'code'], e.target.value)}
                                placeholder={tp.codePlaceholder || 'CO, P2, P3...'}
                                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-base font-bold"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-600 mb-1.5">{tp.partnerType || 'Partner Type'}</label>
                            <select
                                value={partner.partnerType || ''}
                                onChange={(e) => onUpdateData(['partners', index, 'partnerType'], e.target.value || undefined)}
                                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white text-base"
                            >
                                <option value="">—</option>

                                {Object.entries(tp.partnerTypes || {}).map(([key, label]) => (
                                    <option key={key} value={key}>{label as string}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-600 mb-1.5">{tp.pmRate || 'PM Rate (EUR)'}</label>
                            <input
                                type="number"
                                min={0}
                                value={partner.pmRate || ''}
                                onChange={(e) => onUpdateData(['partners', index, 'pmRate'], e.target.value ? parseFloat(e.target.value) : 0)}
                                placeholder={tp.pmRatePlaceholder || '5700'}
                                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-base font-mono"
                            />
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-semibold text-slate-600 mb-1.5">{tp.partnerName || 'Name'}</label>
                        <AutoResizeTextarea
                            value={partner.name || ''}
                            onChange={(e) => onUpdateData(['partners', index, 'name'], e.target.value)}
                            placeholder={tp.partnerNamePlaceholder || 'Organization name...'}
                            rows={1}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-600 mb-1.5">{tp.expertise || 'Expertise'}</label>
                        <AutoResizeTextarea
                            value={partner.expertise || ''}
                            onChange={(e) => onUpdateData(['partners', index, 'expertise'], e.target.value)}
                            placeholder={tp.expertisePlaceholder || 'Short expertise description...'}
                            rows={1}
                        />
                    </div>
                </div>
            ))}

            {partners.length > 0 && (
                <div className="mt-6 bg-slate-50 rounded-xl border border-slate-200 p-4">
                    <h4 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">{tp.projectSummary || 'Project Partner Summary'}</h4>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-300">
                                    <th className="text-left py-2 px-3 font-semibold text-slate-600">{tp.code || 'Code'}</th>
                                    <th className="text-left py-2 px-3 font-semibold text-slate-600">{tp.partnerType || 'Type'}</th>
                                    <th className="text-left py-2 px-3 font-semibold text-slate-600">{tp.partnerName || 'Name'}</th>
                                    <th className="text-left py-2 px-3 font-semibold text-slate-600 hidden lg:table-cell">{tp.expertise || 'Expertise'}</th>
                                    <th className="text-right py-2 px-3 font-semibold text-slate-600">{tp.pmRate || 'PM Rate'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {partners.map((p, i) => (
                                    <tr key={i} className="border-b border-slate-100 hover:bg-white transition-colors">
                                        <td className="py-2 px-3 font-bold text-sky-700">{p.code}</td>
                                        <td className="py-2 px-3 text-slate-500 text-xs">
                                            {p.partnerType ? (
                                                <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-100">
                                                    {(tp.partnerTypes || {})[p.partnerType] || p.partnerType}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td className="py-2 px-3">{p.name || '—'}</td>
                                        <td className="py-2 px-3 text-slate-500 text-xs hidden lg:table-cell">{p.expertise || '—'}</td>
                                        <td className="py-2 px-3 text-right font-mono">{p.pmRate ? `€${p.pmRate.toLocaleString()}` : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════
// ★ v7.2: Finance (Budget) renderer
// ═══════════════════════════════════════════════════════════════
const renderFinance = (props) => {
    const { projectData, onUpdateData, language } = props;
    const t = TEXT[language] || TEXT['en'];
    const tf = t.finance || {};
    const tp = t.partners || {};
    const fundingModel = projectData.fundingModel || 'centralized';
    const partners = Array.isArray(projectData.partners) ? projectData.partners : [];
    const activities = Array.isArray(projectData.activities) ? projectData.activities : [];
    const indirectSettings = projectData.indirectCostSettings || { percentage: 0, appliesToCategories: [] };

    const directCostDefs = fundingModel === 'centralized' ? CENTRALIZED_DIRECT_COSTS : DECENTRALIZED_DIRECT_COSTS;
    const lang = language === 'si' ? 'si' : 'en';

    const fmtEur = (n: number): string => {
        if (n === 0) return '€0';
        return '€' + n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    };

    const calcIndirectForAllocation = (alloc: any): number => {
        if (!indirectSettings.percentage || indirectSettings.percentage <= 0) return 0;
        const applicableCategories = indirectSettings.appliesToCategories || [];
        if (applicableCategories.length === 0) return 0;

        var applicableSet = new Set(applicableCategories);

        var centralToDecentral = {
            'labourCosts': 'salariesReimbursements',
            'subContractorCosts': 'externalServiceCosts',
            'travelCosts': 'vat',
            'depreciationEquipment': 'depreciationBasicAssets',
            'investmentCosts': 'tangibleAssetInvestment',
            'materials': 'intangibleAssetInvestment',
            'otherProjectCosts': 'infoCommunication',
        };
        var decentralToCentral = {};
        Object.keys(centralToDecentral).forEach(function(k) {
            decentralToCentral[centralToDecentral[k]] = k;
        });
        var currentModel = projectData.fundingModel || 'centralized';
        var remapToCurrentModel = currentModel === 'decentralized' ? centralToDecentral : decentralToCentral;

        const applicableDirectSum = (alloc.directCosts || []).reduce((sum: number, dc: any) => {
            var rawKey = dc.categoryKey || directCostDefs[dc.categoryIndex]?.key || '';
            var catKey = remapToCurrentModel[rawKey] || rawKey;
            if (applicableSet.has(catKey)) {
                return sum + (dc.amount || 0);
            }
            return sum;
        }, 0);

        return Math.round(applicableDirectSum * (indirectSettings.percentage / 100));
    };

    const allAllocations: any[] = [];
    activities.forEach((wp: any) => {
        (wp.tasks || []).forEach((task: any) => {
            (task.partnerAllocations || []).forEach((alloc: any) => {
                const partner = partners.find((p: any) => p.id === alloc.partnerId);
                const directTotal = (alloc.directCosts || []).reduce((sum: number, dc: any) => sum + (dc.amount || 0), 0);
                const indirectTotal = calcIndirectForAllocation(alloc);
                allAllocations.push({
                    wpId: wp.id, wpTitle: wp.title || '',
                    taskId: task.id, taskTitle: task.title || '',
                    partnerId: alloc.partnerId, partnerCode: partner?.code || '?',
                    hours: alloc.hours || 0, pm: alloc.pm || 0,
                    directTotal, indirectTotal, total: directTotal + indirectTotal,
                });
            });
        });
    });

    const grandDirectTotal = allAllocations.reduce((s, a) => s + a.directTotal, 0);
    const grandIndirectTotal = allAllocations.reduce((s, a) => s + a.indirectTotal, 0);
    const grandTotal = grandDirectTotal + grandIndirectTotal;

    const wpGroups: Record<string, any[]> = {};
    allAllocations.forEach(a => {
        if (!wpGroups[a.wpId]) wpGroups[a.wpId] = [];
        wpGroups[a.wpId].push(a);
    });

    const partnerGroups: Record<string, any[]> = {};
    allAllocations.forEach(a => {
        if (!partnerGroups[a.partnerCode]) partnerGroups[a.partnerCode] = [];
        partnerGroups[a.partnerCode].push(a);
    });

    const hasData = allAllocations.length > 0;

    const indirectCostReferenceDefs = [
        { key: 'rent', en: 'Rent', si: 'Najemnina' },
        { key: 'operatingCosts', en: 'Operating costs', si: 'Obratovalni stroški' },
        { key: 'telecommunications', en: 'Telecommunications', si: 'Telekomunikacije' },
        { key: 'smallConsumables', en: 'Small consumables', si: 'Drobni potrošni material' },
        { key: 'administrativeCosts', en: 'Administrative costs', si: 'Administrativni stroški' },
    ];

    return (
        <div id="finance" className="mt-12 mb-8 border-t-2 border-slate-200 pt-8">
            <SectionHeader title={tf.title || 'Finance (Budget)'} guideStep="activities" guideField="finance" language={language} />
            <p className="text-sm text-slate-500 mb-6 -mt-2">{tf.titleDesc || ''}</p>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mb-6">
                <div className="flex flex-wrap items-end gap-6 mb-6">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{tf.fundingModel || 'Funding Model'}</label>
                        <select
                            value={fundingModel}
                            onChange={(e) => {
                                onUpdateData(['fundingModel'], e.target.value);
                                onUpdateData(['indirectCostSettings', 'appliesToCategories'], []);
                            }}
                            className="w-56 p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white text-base"
                        >
                            <option value="centralized">{tf.centralized || 'Centralized'}</option>
                            <option value="decentralized">{tf.decentralized || 'Decentralized'}</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border border-slate-200 rounded-xl overflow-hidden">
                    <div className="p-4 bg-green-50/30">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0"></span>
                            <span className="text-sm font-bold text-green-800 uppercase tracking-wider">
                                {tf.directCosts || 'Direct Costs'}
                            </span>
                        </div>
                        <p className="text-xs text-slate-400 mb-3">
                            {language === 'si'
                                ? 'Odkljukajte kategorije, na katere se nanaša % posrednih stroškov.'
                                : 'Check the categories that the indirect cost % applies to.'}
                        </p>
                        <div className="space-y-1.5">
                            {directCostDefs.map((cat, i) => {
                                const isChecked = (indirectSettings.appliesToCategories || []).includes(cat.key);
                                return (
                                    <label
                                        key={cat.key}
                                        className={`flex items-center gap-3 py-2 px-3 rounded-lg border cursor-pointer transition-all ${
                                            isChecked
                                                ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-sm'
                                                : 'bg-white border-green-100 text-slate-700 hover:border-green-200 hover:bg-green-50/50'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={(e) => {
                                                const current = indirectSettings.appliesToCategories || [];
                                                const updated = e.target.checked
                                                    ? [...current, cat.key]
                                                    : current.filter((k: string) => k !== cat.key);
                                                onUpdateData(['indirectCostSettings', 'appliesToCategories'], updated);
                                            }}
                                            className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 flex-shrink-0"
                                        />
                                        <span className="font-mono text-green-700 font-bold w-6 text-sm">{i + 1}.</span>
                                        <span className="text-sm">{cat[lang]}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    <div className="p-4 bg-amber-50/30 border-t lg:border-t-0 lg:border-l border-slate-200">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="w-3 h-3 rounded-full bg-amber-500 flex-shrink-0"></span>
                            <span className="text-sm font-bold text-amber-800 uppercase tracking-wider">
                                {tf.indirectCosts || 'Indirect Costs'}
                            </span>
                        </div>
                        <div className="mb-4">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                                {language === 'si' ? 'Odstotek posrednih stroškov (%)' : 'Indirect cost percentage (%)'}
                            </label>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.5}
                                value={indirectSettings.percentage || ''}
                                onChange={(e) => onUpdateData(['indirectCostSettings', 'percentage'], e.target.value ? parseFloat(e.target.value) : 0)}
                                placeholder="e.g. 7, 15, 25"
                                className="w-32 p-2.5 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-base font-mono bg-white"
                            />
                        </div>
                        <p className="text-xs text-slate-400 mb-3">
                            {language === 'si'
                                ? 'Referenčne kategorije posrednih stroškov:'
                                : 'Indirect cost reference categories:'}
                        </p>
                        <div className="space-y-1.5">
                            {indirectCostReferenceDefs.map((cat, i) => (
                                <div key={cat.key} className="flex items-center gap-3 py-2 px-3 bg-white rounded-lg border border-amber-100 text-sm">
                                    <span className="font-mono text-amber-700 font-bold w-6">{i + 1}.</span>
                                    <span className="text-slate-700">{cat[lang]}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {indirectSettings.percentage > 0 && (indirectSettings.appliesToCategories || []).length > 0 && (
                    <div className="mt-4 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 font-medium">
                        {language === 'si'
                            ? `Posredni stroški: ${indirectSettings.percentage}% na ${(indirectSettings.appliesToCategories || []).length} izbranih kategorij neposrednih stroškov`
                            : `Indirect costs: ${indirectSettings.percentage}% applied to ${(indirectSettings.appliesToCategories || []).length} selected direct cost categories`
                        }
                    </div>
                )}
            </div>

            {!hasData ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    <div className="text-slate-400 text-4xl mb-3">📊</div>
                    <p className="text-slate-500 font-medium">{tf.noFinanceData || 'No finance data yet.'}</p>
                    <p className="text-slate-400 text-sm mt-1">
                        {language === 'si'
                            ? 'Generirajte partnerske alokacije z AI gumbom v delovnem načrtu.'
                            : 'Generate partner allocations with the AI button in the Work Plan.'}
                    </p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                            <p className="text-xs text-green-600 font-semibold uppercase tracking-wider mb-1">{tf.totalDirectCosts || 'Total Direct'}</p>
                            <p className="text-2xl font-bold text-green-800">{fmtEur(grandDirectTotal)}</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                            <p className="text-xs text-amber-600 font-semibold uppercase tracking-wider mb-1">{tf.totalIndirectCosts || 'Total Indirect'}</p>
                            <p className="text-2xl font-bold text-amber-800">{fmtEur(grandIndirectTotal)}</p>
                            {indirectSettings.percentage > 0 && (
                                <p className="text-xs text-amber-500 mt-1">{indirectSettings.percentage}%</p>
                            )}
                        </div>
                        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-center">
                            <p className="text-xs text-sky-600 font-semibold uppercase tracking-wider mb-1">{tf.grandTotal || 'Grand Total'}</p>
                            <p className="text-2xl font-bold text-sky-800">{fmtEur(grandTotal)}</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
                        <h4 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">{tf.perWP || 'Per Work Package'}</h4>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b-2 border-slate-200">
                                        <th className="text-left py-2 px-3 font-semibold text-slate-600">WP</th>
                                        <th className="text-right py-2 px-3 font-semibold text-green-600">{tf.directCosts || 'Direct'}</th>
                                        <th className="text-right py-2 px-3 font-semibold text-amber-600">{tf.indirectCosts || 'Indirect'}</th>
                                        <th className="text-right py-2 px-3 font-semibold text-sky-600">{tf.grandTotal || 'Total'}</th>
                                        <th className="text-right py-2 px-3 font-semibold text-slate-600 hidden sm:table-cell">{tp.totalHours || 'Hours'}</th>
                                        <th className="text-right py-2 px-3 font-semibold text-slate-600 hidden sm:table-cell">{tp.totalPM || 'PM'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(wpGroups).map(([wpId, items]) => {
                                        const wpDirect = items.reduce((s, a) => s + a.directTotal, 0);
                                        const wpIndirect = items.reduce((s, a) => s + a.indirectTotal, 0);
                                        const wpHours = items.reduce((s, a) => s + a.hours, 0);
                                        const wpPM = items.reduce((s, a) => s + a.pm, 0);
                                        return (
                                            <tr key={wpId} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                                <td className="py-2 px-3 font-bold text-sky-700">{wpId}</td>
                                                <td className="py-2 px-3 text-right font-mono text-green-700">{fmtEur(wpDirect)}</td>
                                                <td className="py-2 px-3 text-right font-mono text-amber-700">{fmtEur(wpIndirect)}</td>
                                                <td className="py-2 px-3 text-right font-mono font-bold">{fmtEur(wpDirect + wpIndirect)}</td>
                                                <td className="py-2 px-3 text-right font-mono hidden sm:table-cell">{wpHours.toLocaleString('de-DE')}</td>
                                                <td className="py-2 px-3 text-right font-mono hidden sm:table-cell">{wpPM.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-slate-300 font-bold">
                                        <td className="py-2 px-3">{tf.grandTotal || 'TOTAL'}</td>
                                        <td className="py-2 px-3 text-right font-mono text-green-800">{fmtEur(grandDirectTotal)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-amber-800">{fmtEur(grandIndirectTotal)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-sky-800">{fmtEur(grandTotal)}</td>
                                        <td className="py-2 px-3 text-right font-mono hidden sm:table-cell">{allAllocations.reduce((s, a) => s + a.hours, 0).toLocaleString('de-DE')}</td>
                                        <td className="py-2 px-3 text-right font-mono hidden sm:table-cell">{allAllocations.reduce((s, a) => s + a.pm, 0).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                        <h4 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">{tf.perPartner || 'Per Partner'}</h4>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b-2 border-slate-200">
                                        <th className="text-left py-2 px-3 font-semibold text-slate-600">{tp.code || 'Partner'}</th>
                                        <th className="text-right py-2 px-3 font-semibold text-green-600">{tf.directCosts || 'Direct'}</th>
                                        <th className="text-right py-2 px-3 font-semibold text-amber-600">{tf.indirectCosts || 'Indirect'}</th>
                                        <th className="text-right py-2 px-3 font-semibold text-sky-600">{tf.grandTotal || 'Total'}</th>
                                        <th className="text-right py-2 px-3 font-semibold text-slate-600 hidden sm:table-cell">{tp.totalHours || 'Hours'}</th>
                                        <th className="text-right py-2 px-3 font-semibold text-slate-600 hidden sm:table-cell">{tp.totalPM || 'PM'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(partnerGroups).map(([code, items]) => {
                                        const pDirect = items.reduce((s, a) => s + a.directTotal, 0);
                                        const pIndirect = items.reduce((s, a) => s + a.indirectTotal, 0);
                                        const pHours = items.reduce((s, a) => s + a.hours, 0);
                                        const pPM = items.reduce((s, a) => s + a.pm, 0);
                                        return (
                                            <tr key={code} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                                <td className="py-2 px-3 font-bold text-sky-700">{code}</td>
                                                <td className="py-2 px-3 text-right font-mono text-green-700">{fmtEur(pDirect)}</td>
                                                <td className="py-2 px-3 text-right font-mono text-amber-700">{fmtEur(pIndirect)}</td>
                                                <td className="py-2 px-3 text-right font-mono font-bold">{fmtEur(pDirect + pIndirect)}</td>
                                                <td className="py-2 px-3 text-right font-mono hidden sm:table-cell">{pHours.toLocaleString('de-DE')}</td>
                                                <td className="py-2 px-3 text-right font-mono hidden sm:table-cell">{pPM.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-slate-300 font-bold">
                                        <td className="py-2 px-3">{tf.grandTotal || 'TOTAL'}</td>
                                        <td className="py-2 px-3 text-right font-mono text-green-800">{fmtEur(grandDirectTotal)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-amber-800">{fmtEur(grandIndirectTotal)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-sky-800">{fmtEur(grandTotal)}</td>
                                        <td className="py-2 px-3 text-right font-mono hidden sm:table-cell">{allAllocations.reduce((s, a) => s + a.hours, 0).toLocaleString('de-DE')}</td>
                                        <td className="py-2 px-3 text-right font-mono hidden sm:table-cell">{allAllocations.reduce((s, a) => s + a.pm, 0).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════
// ★ v7.0.1: renderActivities — BUGFIX
// ═══════════════════════════════════════════════════════════════
const renderActivities = (props) => {
    const { projectData, onUpdateData, onGenerateField, onGenerateSection, onAddItem, onRemoveItem, isLoading, language, missingApiKey, onFieldAIGenerate } = props;
    const path = ['activities'];
    const t = TEXT[language] || TEXT['en'];
    const refs = Array.isArray(projectData.references) ? projectData.references : [];

    const rawActivities = projectData.activities;
    const activities = Array.isArray(rawActivities)
        ? rawActivities
        : (rawActivities && Array.isArray(rawActivities.activities))
            ? rawActivities.activities
            : (rawActivities && typeof rawActivities === 'object' && rawActivities.id)
                ? [rawActivities]
                : [];

    const allTasks = activities.flatMap(wp => Array.isArray(wp.tasks) ? wp.tasks : []);

    const wpPrefix = language === 'si' ? 'DS' : 'WP';
    const taskPrefix = language === 'si' ? 'N' : 'T';

    const handleTaskUpdate = (itemPath, value) => {
        if (itemPath.includes('tasks')) {
            const tempProjectData = JSON.parse(JSON.stringify(projectData));
            let current = tempProjectData;
            for(let i=0; i<itemPath.length-1; i++) {
                current = current[itemPath[i]];
            }
            current[itemPath[itemPath.length-1]] = value;
            const scheduledProjectData = recalculateProjectSchedule(tempProjectData);
            onUpdateData(['activities'], scheduledProjectData.activities);
        } else {
            onUpdateData(itemPath, value);
        }
    };

    const taskPartnersList = Array.isArray(projectData.partners) ? projectData.partners : [];
    const fundingModel = projectData.fundingModel || 'centralized';
    const directCostDefs = fundingModel === 'centralized' ? CENTRALIZED_DIRECT_COSTS : DECENTRALIZED_DIRECT_COSTS;
    const lang = language === 'si' ? 'si' : 'en';
    const tp = t.partners || {};
    const tf = t.finance || {};
    const indirectSettings = projectData.indirectCostSettings || { percentage: 0, appliesToCategories: [] };

    const calcIndirectForAlloc = (alloc: any): number => {
        if (!indirectSettings.percentage || indirectSettings.percentage <= 0) return 0;
        const applicableCats = indirectSettings.appliesToCategories || [];
        if (applicableCats.length === 0) return 0;
        const applicableSum = (alloc.directCosts || []).reduce((sum: number, dc: any) => {
            const catKey = dc.categoryKey || directCostDefs[dc.categoryIndex]?.key || '';
            return applicableCats.includes(catKey) ? sum + (dc.amount || 0) : sum;
        }, 0);
        return Math.round(applicableSum * (indirectSettings.percentage / 100));
    };

    return (
        <>
            {renderProjectManagement(props)}
            {renderPartners(props)}

            <div id="workplan">
                <SectionHeader title={t.subSteps.workplan} 
                    onAdd={() => onAddItem(path, { id: `${wpPrefix}${activities.length + 1}`, title: '', tasks: [], milestones: [], deliverables: [] })} addText={t.add} guideStep="activities" guideField="workplan" language={language}>
                    <GenerateButton onClick={() => onGenerateSection('activities')} isLoading={isLoading === `${t.generating} activities...`} title={t.generateSubSection} text={t.generateAI} missingApiKey={missingApiKey} />
                </SectionHeader>
                
                {(activities || []).map((wp, wpIndex) => (
                    <div key={wpIndex} className="p-6 border border-slate-200 rounded-xl mb-8 bg-white shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                            <h4 className="text-lg font-bold text-sky-800 flex items-center gap-2">
                                <span className="bg-sky-100 text-sky-800 px-2 py-0.5 rounded text-sm">{wp.id}</span> 
                                <span className="truncate">{wp.title || t.untitled}</span>
                            </h4>
                            <RemoveButton onClick={() => onRemoveItem(path, wpIndex)} text={t.remove} />
                        </div>
                        <TextArea label={t.wpTitle} path={[...path, wpIndex, 'title']} value={wp.title} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.wpTitlePlaceholder} generateTitle={`${t.generateField} ${t.title}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                        <div className="mt-6 pl-4 border-l-4 border-sky-100">
                            <SectionHeader title={t.tasks} onAdd={() => onAddItem([...path, wpIndex, 'tasks'], { id: `${taskPrefix}${wpIndex + 1}.${(wp.tasks || []).length + 1}`, title: '', description: '', startDate: '', endDate: '', dependencies: [], partnerAllocations: [] })} addText={t.add} />
                            {(Array.isArray(wp.tasks) ? wp.tasks : []).map((task, taskIndex) => (
                                <div key={taskIndex} className="p-4 border border-slate-200 rounded-lg mb-4 bg-slate-50 relative group hover:shadow-md transition-all">
                                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onRemoveItem([...path, wpIndex, 'tasks'], taskIndex)} text={t.remove} /></div>
                                    <h5 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                                        <span className="bg-white border border-slate-200 px-2 py-0.5 rounded text-xs text-slate-500">{task.id}</span>
                                        {task.title || t.untitled}
                                    </h5>
                                    <TextArea label={t.taskTitle} path={[...path, wpIndex, 'tasks', taskIndex, 'title']} value={task.title} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.taskTitlePlaceholder} generateTitle={`${t.generateField} ${t.title}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                                    <TextArea label={t.taskDesc} path={[...path, wpIndex, 'tasks', taskIndex, 'description']} value={task.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.taskDescPlaceholder} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.startDate}</label>
                                            <input type="date" value={task.startDate || ''} onChange={(e) => handleTaskUpdate([...path, wpIndex, 'tasks', taskIndex, 'startDate'], e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white text-base" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.endDate}</label>
                                            <input type="date" value={task.endDate || ''} onChange={(e) => handleTaskUpdate([...path, wpIndex, 'tasks', taskIndex, 'endDate'], e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white text-base" />
                                        </div>
                                    </div>
                                    <DependencySelector task={task} allTasks={allTasks} language={language}
                                        onAddDependency={(dep) => { const deps = task.dependencies || []; handleTaskUpdate([...path, wpIndex, 'tasks', taskIndex, 'dependencies'], [...deps, dep]); }}
                                        onRemoveDependency={(depIdx) => { const deps = task.dependencies || []; handleTaskUpdate([...path, wpIndex, 'tasks', taskIndex, 'dependencies'], deps.filter((_, i) => i !== depIdx)); }}
                                    />

                                    {(() => {
                                        const taskAllocations = task.partnerAllocations || [];
                                        const allocPath = [...path, wpIndex, 'tasks', taskIndex, 'partnerAllocations'];

                                        if (taskPartnersList.length === 0) return (
                                            <div className="mt-4 p-3 bg-slate-100 rounded-lg border border-dashed border-slate-300 text-center text-sm text-slate-400 italic">
                                                {tp.noPartnersYet || 'No partners defined yet.'}
                                            </div>
                                        );

                                        return (
                                            <div className="mt-4 pt-4 border-t border-slate-200">
                                                <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
                                                    <h6 className="text-sm font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                                                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                                                        {tp.partnerAllocation || 'Partner Allocations'}
                                                    </h6>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => onGenerateSection('partnerAllocations')}
                                                            disabled={!!isLoading}
                                                            className="px-2 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-all flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >
                                                            <ICONS.SPARKLES className="h-3 w-3" />
                                                            AI
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                const usedIds = taskAllocations.map(a => a.partnerId);
                                                                const available = taskPartnersList.filter(p => !usedIds.includes(p.id));
                                                                if (available.length === 0) return;
                                                                onAddItem(allocPath, {
                                                                    partnerId: available[0].id,
                                                                    hours: 0,
                                                                    pm: 0,
                                                                    directCosts: [],
                                                                    totalDirectCost: 0,
                                                                    totalCost: 0
                                                                });
                                                            }}
                                                            disabled={taskAllocations.length >= taskPartnersList.length}
                                                            className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >
                                                            + {language === 'si' ? 'Dodaj' : 'Add'}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="bg-sky-50 border border-sky-200 rounded-lg px-3 py-1.5 mb-3 text-xs text-sky-700 font-medium">
                                                    {tp.hoursPerPM || `1 PM = ${PM_HOURS_PER_MONTH} hours (EU standard)`}
                                                </div>

                                                {taskAllocations.map((alloc, allocIdx) => {
                                                    const partner = taskPartnersList.find(p => p.id === alloc.partnerId);
                                                    const usedIds = taskAllocations.map(a => a.partnerId);
                                                    const availableForSwitch = taskPartnersList.filter(p => p.id === alloc.partnerId || !usedIds.includes(p.id));
                                                    const directTotal = (alloc.directCosts || []).reduce((s, dc) => s + (dc.amount || 0), 0);
                                                    const indirectTotal = calcIndirectForAlloc(alloc);

                                                    return (
                                                        <div key={allocIdx} className="p-3 mb-3 bg-white rounded-lg border border-emerald-100 shadow-sm relative group/alloc hover:shadow-md transition-all">
                                                            <div className="absolute top-2 right-2 opacity-0 group-hover/alloc:opacity-100 transition-opacity">
                                                                <RemoveButton onClick={() => onRemoveItem(allocPath, allocIdx)} text={t.remove} />
                                                            </div>

                                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                                                                <div className="sm:col-span-2">
                                                                    <label className="block text-xs font-semibold text-slate-600 mb-1">{tp.partnerName || 'Partner'}</label>
                                                                    <select
                                                                        value={alloc.partnerId || ''}
                                                                        onChange={(e) => onUpdateData([...allocPath, allocIdx, 'partnerId'], e.target.value)}
                                                                                                                                               className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
                                                                    >
                                                                        <option value="">{tp.selectPartner || 'Select partner...'}</option>
                                                                        {availableForSwitch.map(p => (
                                                                            <option key={p.id} value={p.id}>
                                                                                {p.code} — {p.name || '?'}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-semibold text-slate-600 mb-1">{tp.hours || 'Hours'}</label>
                                                                    <input
                                                                        type="number" min={0}
                                                                        value={alloc.hours || ''}
                                                                        onChange={(e) => {
                                                                            const hrs = e.target.value ? parseFloat(e.target.value) : 0;
                                                                            onUpdateData([...allocPath, allocIdx, 'hours'], hrs);
                                                                            onUpdateData([...allocPath, allocIdx, 'pm'], parseFloat((hrs / PM_HOURS_PER_MONTH).toFixed(2)));
                                                                        }}
                                                                        placeholder="0"
                                                                        className="w-full p-2 border border-slate-300 rounded-lg text-sm font-mono"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-semibold text-slate-600 mb-1">{tp.pm || 'PM'}</label>
                                                                    <input
                                                                        type="number" min={0} step={0.01}
                                                                        value={alloc.pm || ''}
                                                                        onChange={(e) => {
                                                                            const pm = e.target.value ? parseFloat(e.target.value) : 0;
                                                                            onUpdateData([...allocPath, allocIdx, 'pm'], pm);
                                                                            onUpdateData([...allocPath, allocIdx, 'hours'], Math.round(pm * PM_HOURS_PER_MONTH));
                                                                        }}
                                                                        placeholder="0.00"
                                                                        className="w-full p-2 border border-slate-300 rounded-lg text-sm font-mono"
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="mb-3">
                                                                <div className="flex justify-between items-center mb-2">
                                                                    <span className="text-xs font-bold text-green-700 uppercase tracking-wider flex items-center gap-1.5">
                                                                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                                                        {tf.directCosts || 'Direct Costs'}
                                                                    </span>
                                                                    <button
                                                                        onClick={() => {
                                                                            const firstCat = directCostDefs[0];
                                                                            onAddItem([...allocPath, allocIdx, 'directCosts'], {
                                                                                id: `dc-${Date.now()}`,
                                                                                categoryKey: firstCat?.key || '',
                                                                                name: firstCat?.[lang] || '',
                                                                                amount: 0
                                                                            });
                                                                        }}
                                                                        className="px-2 py-0.5 text-xs font-semibold bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 transition-all"
                                                                    >
                                                                        + {tf.addDirectCost || 'Add'}
                                                                    </button>
                                                                </div>
                                                                {(Array.isArray(alloc.directCosts) ? alloc.directCosts : []).map((dc, dcIdx) => (
                                                                    <div key={dcIdx} className="flex gap-2 mb-1.5 items-end">
                                                                        <div className="flex-1">
                                                                            <select
                                                                                value={dc.categoryKey || directCostDefs[dc.categoryIndex]?.key || ''}
                                                                                onChange={(e) => {
                                                                                    const selectedKey = e.target.value;
                                                                                    const cat = directCostDefs.find(c => c.key === selectedKey);
                                                                                    onUpdateData([...allocPath, allocIdx, 'directCosts', dcIdx, 'categoryKey'], selectedKey);
                                                                                    onUpdateData([...allocPath, allocIdx, 'directCosts', dcIdx, 'name'], cat?.[lang] || selectedKey);
                                                                                }}
                                                                                className="w-full p-1.5 border border-slate-300 rounded text-xs bg-white"
                                                                            >
                                                                                {directCostDefs.map((cat) => (
                                                                                    <option key={cat.key} value={cat.key}>{cat[lang]}</option>
                                                                                ))}
                                                                            </select>
                                                                        </div>
                                                                        <div className="w-28">
                                                                            <input
                                                                                type="number" min={0}
                                                                                value={dc.amount || ''}
                                                                                onChange={(e) => onUpdateData([...allocPath, allocIdx, 'directCosts', dcIdx, 'amount'], e.target.value ? parseFloat(e.target.value) : 0)}
                                                                                placeholder="€ 0"
                                                                                className="w-full p-1.5 border border-slate-300 rounded text-xs font-mono text-right"
                                                                            />
                                                                        </div>
                                                                        <button onClick={() => onRemoveItem([...allocPath, allocIdx, 'directCosts'], dcIdx)} className="text-red-400 hover:text-red-600 text-xs font-bold px-1">✕</button>
                                                                    </div>
                                                                ))}
                                                                {(alloc.directCosts || []).length > 0 && (
                                                                    <div className="text-right text-xs font-bold text-green-800 mt-1 pr-8">
                                                                        Σ €{directTotal.toLocaleString('de-DE')}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {indirectSettings.percentage > 0 && directTotal > 0 && (
                                                                <div className="mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                                                                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                                                            {tf.indirectCosts || 'Indirect Costs'} ({indirectSettings.percentage}%)
                                                                        </span>
                                                                        <span className="text-sm font-bold text-amber-800 font-mono">
                                                                            €{indirectTotal.toLocaleString('de-DE')}
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-xs text-amber-600 mt-1">
                                                                        {language === 'si'
                                                                            ? `${indirectSettings.percentage}% na izbranih neposrednih stroških (nastavljeno v Finance)`
                                                                            : `${indirectSettings.percentage}% of selected direct costs (configured in Finance)`
                                                                        }
                                                                    </p>
                                                                </div>
                                                            )}

                                                            {directTotal > 0 && (
                                                                <div className="mt-3 pt-2 border-t border-slate-200 flex justify-between items-center">
                                                                    <span className="text-xs font-semibold text-slate-500">
                                                                        {partner?.code || '?'} — {tp.totalCost || 'Total'}:
                                                                    </span>
                                                                    <span className="text-sm font-bold text-sky-800">
                                                                        €{(directTotal + indirectTotal).toLocaleString('de-DE')}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 pl-4 border-l-4 border-amber-100">
                            <SectionHeader title={t.milestones} onAdd={() => onAddItem([...path, wpIndex, 'milestones'], { id: `M${wpIndex + 1}.${(Array.isArray(wp.milestones) ? wp.milestones : []).length + 1}`, description: '', date: '' })} addText={t.add} />
                            {(Array.isArray(wp.milestones) ? wp.milestones : []).map((milestone, msIndex) => {
                                const enGen = TEXT.en.generating;
                                const siGen = TEXT.si.generating;
                                const dateLoading = isLoading === `${enGen} date...` || isLoading === `${siGen} date...`;
                                return (
                                    <div key={msIndex} className="relative mb-3 bg-amber-50/50 p-4 rounded-lg border border-amber-100 group hover:shadow-md transition-all">
                                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onRemoveItem([...path, wpIndex, 'milestones'], msIndex)} text={t.remove} /></div>
                                        <div className="flex flex-col md:flex-row gap-4">
                                            <div className="flex-1">
                                                <TextArea label={`Milestone ${milestone.id}`} path={[...path, wpIndex, 'milestones', msIndex, 'description']} value={milestone.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.milestonePlaceholder} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} className="w-full group" onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                                            </div>
                                            <div className="w-full md:w-48">
                                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t.dates}</label>
                                                <div className="flex gap-1 items-end">
                                                    <input type="date" value={milestone.date || ''} onChange={(e) => onUpdateData([...path, wpIndex, 'milestones', msIndex, 'date'], e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white text-base flex-1" />
                                                    <GenerateButton onClick={() => onGenerateField([...path, wpIndex, 'milestones', msIndex, 'date'])} isLoading={dateLoading} isField title={t.generateAI} missingApiKey={missingApiKey} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-6 pl-4 border-l-4 border-indigo-100">
                            <SectionHeader title={t.deliverables} onAdd={() => onAddItem([...path, wpIndex, 'deliverables'], { id: `D${wpIndex + 1}.${(Array.isArray(wp.deliverables) ? wp.deliverables : []).length + 1}`, title: '', description: '', indicator: '' })} addText={t.add} />
                            {(Array.isArray(wp.deliverables) ? wp.deliverables : []).map((deliverable, dIndex) => (
                                <div key={dIndex} className="relative mb-4 bg-indigo-50/50 p-4 rounded-lg border border-indigo-100 group hover:shadow-md transition-all">
                                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><RemoveButton onClick={() => onRemoveItem([...path, wpIndex, 'deliverables'], dIndex)} text={t.remove} /></div>
                                    <h5 className="font-semibold text-slate-700 mb-3">{deliverable.id}</h5>
                                    <TextArea label={t.description} path={[...path, wpIndex, 'deliverables', dIndex, 'description']} value={deliverable.description} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} placeholder={t.deliverableDescPlaceholder} generateTitle={`${t.generateField} ${t.description}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                                    <TextArea label={t.indicator} path={[...path, wpIndex, 'deliverables', dIndex, 'indicator']} value={deliverable.indicator} onUpdate={onUpdateData} onGenerate={onGenerateField} isLoading={isLoading} rows={1} placeholder={t.indicatorPlaceholder} generateTitle={`${t.generateField} ${t.indicator}`} missingApiKey={missingApiKey} onFieldAIGenerate={onFieldAIGenerate} language={language} references={refs} />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div id="gantt-chart" className="mt-12 mb-8 border-t-2 border-slate-200 pt-8">
                <h3 className="text-xl font-bold text-slate-700 mb-4 flex items-center gap-2">{t.subSteps.ganttChart}<GuideTooltip stepKey="activities" fieldKey="ganttChart" language={language} size="sm" /></h3>
                <div className="chart-container-white bg-white rounded-xl">
                    <GanttChart 
                        activities={activities} 
                        language={language} 
                        id="gantt-chart-interactive"
                        key={'gantt-' + activities.length + '-' + activities.reduce(function(acc, wp) { return acc + (wp.tasks || []).length + '-' + (wp.tasks || []).reduce(function(s, t) { return s + (t.startDate || '') + (t.endDate || ''); }, ''); }, '')}
                    />
                </div>
            </div>

            <div id="pert-chart" className="mt-12 mb-8 border-t-2 border-slate-200 pt-8">
                <h3 className="text-xl font-bold text-slate-700 mb-4 flex items-center gap-2">{t.subSteps.pertChart}<GuideTooltip stepKey="activities" fieldKey="pertChart" language={language} size="sm" /></h3>
                <div className="chart-container-white bg-white rounded-xl">
                    <PERTChart 
                        activities={activities} 
                        language={language}
                        key={'pert-' + activities.length + '-' + activities.reduce(function(acc, wp) { return acc + (wp.tasks || []).length; }, 0)}
                    />
                </div>
            </div>

            {renderFinance(props)}
            {renderRisks(props)}
        </>
    );
};

const renderExpectedResults = (props) => {
    return (
        <>
            {renderGenericResults(props, 'outputs')}
            {renderGenericResults(props, 'outcomes')}
            {renderGenericResults(props, 'impacts')}
            {renderKERs(props)}
        </>
    );
};
// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
const ProjectDisplay = (props) => {
    const { activeStepId, onGenerateSection, isLoading, error, language, missingApiKey, completedStepsStatus, onStepClick } = props;
    const [vizTrigger, setVizTrigger] = React.useState(0);
    const [showVizPrompt, setShowVizPrompt] = React.useState(false);
    const prevLoadingRef = useRef(isLoading);
    const STEPS = getSteps(language);
    const activeStep = STEPS.find(step => step.id === activeStepId);
    const t = TEXT[language] || TEXT['en'];

    // EO-140: Responsive content config
    const { config: rc, isCompact, isUltraCompact } = useResponsive();

    // EO-137: Elapsed time counter for GenerationProgressModal
    const [elapsedMs, setElapsedMs] = useState(0);
    const generationProgress = props.generationProgress || null;
    useEffect(() => {
      if (!generationProgress?.visible) {
        setElapsedMs(0);
        return;
      }
      const start = generationProgress.startTime;
      const interval = setInterval(() => {
        setElapsedMs(Date.now() - start);
      }, 500);
      return () => clearInterval(interval);
    }, [generationProgress?.visible, generationProgress?.startTime]);

    useEffect(function () {
        var wasLoading = prevLoadingRef.current;
        prevLoadingRef.current = isLoading;
        if (wasLoading && !isLoading) {
            setShowVizPrompt(true);
        }
    }, [isLoading]);

    if (!activeStep) return <div className="p-8 text-center text-red-500">Error: Invalid Step Selected</div>;

    const sectionKey = activeStep.key;

    const stepColorMap: Record<string, string> = {
        problemAnalysis: '#EF4444',
        projectIdea: '#6366F1',
        generalObjectives: '#06B6D4',
        specificObjectives: '#8B5CF6',
        activities: '#F59E0B',
        expectedResults: '#10B981',
        references: '#818CF8',  // ★ EO-069
    };

    const propsWithViz = Object.assign({}, props, { vizTrigger: vizTrigger });

    const renderContent = () => {
        switch (sectionKey) {
            case 'problemAnalysis': return renderProblemAnalysis(propsWithViz);
            case 'projectIdea': return renderProjectIdea(propsWithViz);
            case 'generalObjectives': return renderObjectives(propsWithViz, 'generalObjectives');
            case 'specificObjectives': return renderObjectives(propsWithViz, 'specificObjectives');
            case 'activities': return renderActivities(propsWithViz);
            case 'expectedResults': return renderExpectedResults(propsWithViz);
            case 'references': return null;  // ★ EO-069: Rendered separately in App.tsx
            default: return <div className="p-8 text-center text-slate-500">{t.selectStep}</div>;
        }
    };

    const showGenerateButton = ['problemAnalysis', 'projectIdea', 'generalObjectives', 'specificObjectives', 'activities', 'expectedResults'].includes(sectionKey);

    return (
        <main className="flex-1 flex flex-col overflow-hidden bg-slate-50/30">
            <header className="bg-white border-b border-slate-200 flex items-center flex-shrink-0 sticky top-0 z-20 shadow-sm animate-fadeIn" style={{ gap: '12px', padding: rc.content.headerPadding }}>
                <div className="flex items-start gap-2" style={{ flexShrink: 0, minWidth: '180px', maxWidth: '240px' }}>
                    <span style={{ width: 4, height: 28, borderRadius: 4, background: stepColorMap[sectionKey] || '#6366F1', flexShrink: 0, marginTop: 2 }} />
                    <div style={{ minWidth: 0 }}>
                        <h2 className="font-bold text-slate-800 tracking-tight" style={{ lineHeight: 1.2, fontSize: rc.content.fontSize.heading }}>{activeStep.title}</h2>
                        <p className="text-slate-400 mt-0.5 truncate" style={{ fontSize: rc.content.fontSize.xs }}>{t.stepSubtitle}</p>
                    </div>
                </div>

                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', overflow: 'hidden', minWidth: 0 }}>
                    <StepNavigationBar
                        language={language}
                        currentStepId={activeStepId}
                        completedStepsStatus={completedStepsStatus || []}
                        onStepClick={onStepClick || (() => {})}
                        isProblemAnalysisComplete={completedStepsStatus?.[0] || false}
                    />
                </div>

                <div className="flex items-center gap-4" style={{ flexShrink: 0 }}>
                    {showGenerateButton && (
                        (sectionKey === 'expectedResults' || sectionKey === 'activities')
                            ? <SectionGenerateWithToggle sectionKey={sectionKey} projectData={props.projectData} onUpdateData={props.onUpdateData} onGenerate={() => props.onGenerateCompositeSection(sectionKey)} isLoading={!!isLoading} title={t.generateSection} text={t.generateAI} missingApiKey={missingApiKey} language={language} />
                            : <SectionGenerateWithToggle sectionKey={sectionKey} projectData={props.projectData} onUpdateData={props.onUpdateData} onGenerate={() => onGenerateSection(sectionKey)} isLoading={isLoading === `${t.generating} ${sectionKey}...`} title={t.generateSection} text={t.generateAI} missingApiKey={missingApiKey} language={language} />
                    )}
                </div>
            </header>

            {showVizPrompt && (
                <div className="mx-6 mt-4 mb-2 flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 shadow-sm animate-fadeIn">
                    <span className="text-lg flex-shrink-0">📊</span>
                    <p className="text-sm text-indigo-800 font-medium flex-1">
                        {language === 'si'
                            ? 'Generiranje zakljuceno. Zelite generirati vizualizacije za vse sekcije?'
                            : 'Generation complete. Would you like to generate visualizations for all sections?'}
                    </p>
                    <button
                        onClick={function () { setVizTrigger(function (v) { return v + 1; }); setShowVizPrompt(false); }}
                        className="px-3 py-1.5 text-sm font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-sm flex-shrink-0"
                    >
                        {language === 'si' ? 'Da, generiraj' : 'Yes, generate'}
                    </button>
                    <button
                        onClick={function () { setShowVizPrompt(false); }}
                        className="px-3 py-1.5 text-sm font-medium text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-100 active:scale-95 transition-all flex-shrink-0"
                    >
                        {language === 'si' ? 'Ne, hvala' : 'No, thanks'}
                    </button>
                </div>
            )}

            {error && (() => {
                const isWarning = error.includes('partially done') || error.includes('delno uspel') || error.includes('fields failed') || error.includes('polj ni uspelo');
                return (
                    <div
                        className={`mx-6 mt-4 mb-2 flex items-start gap-3 rounded-xl border px-4 py-3 shadow-sm animate-fadeIn ${
                            isWarning
                                ? 'bg-amber-50 border-amber-200 text-amber-800'
                                : 'bg-red-50 border-red-200 text-red-800'
                        }`}
                        role="alert"
                    >
                        <span className="text-lg flex-shrink-0 mt-0.5">{isWarning ? '⚠️' : '❌'}</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold mb-0.5">
                                {isWarning
                                    ? (language === 'si' ? 'Delni prevod' : 'Partial Translation')
                                    : 'Error'}
                            </p>
                            <p className="text-sm leading-relaxed">{error}</p>
                        </div>
                    </div>
                );
            })()}

            {/* EO-137: Generation progress modal — shows when generationProgress.visible */}
            {generationProgress?.visible ? (
                <GenerationProgressModal
                    visible={true}
                    sectionName={generationProgress.sectionName}
                    sectionKey={generationProgress.sectionKey}
                    phases={generationProgress.phases}
                    elapsedMs={elapsedMs}
                    estimatedTotalMs={generationProgress.estimatedTotalMs}
                    onCancel={props.onCancelGeneration || (() => {})}
                    language={language}
                    subProgress={generationProgress.subProgress}
                />
            ) : isLoading ? (
                /* Fallback for non-tracked loading (e.g. export, translation) */
                <div className="p-4 m-6 flex items-center justify-center gap-4 text-sky-700 bg-sky-50 rounded-lg animate-pulse border border-sky-100 font-medium">
                    <div className="border-2 border-sky-400 border-t-transparent rounded-full animate-spin w-5 h-5 flex-shrink-0" />
                    <span>{typeof isLoading === 'string' ? isLoading : t.loading}</span>
                    {props.onCancelGeneration && (
                        <button
                            onClick={props.onCancelGeneration}
                            className="ml-4 px-4 py-1.5 text-sm font-bold bg-red-500 text-white rounded-lg hover:bg-red-600 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 flex-shrink-0 animate-none"
                        >
                            ✕ {language === 'si' ? 'Prekliči' : 'Cancel'}
                        </button>
                    )}
                </div>
            ) : null}

            <div
                id="main-scroll-container"
                className="step-content flex-1 overflow-y-auto scroll-smooth relative"
                style={{
                    padding: rc.content.padding,
                    '--step-card-bg': stepColors[sectionKey as keyof typeof stepColors]?.light || '#FFFFFF',
                    '--step-card-border': stepColors[sectionKey as keyof typeof stepColors]?.border || '#E2E8F0',
                    '--rc-card-padding': rc.content.cardPadding,
                    '--rc-section-gap': rc.content.sectionGap,
                } as React.CSSProperties}
            >
                <div className="max-w-5xl mx-auto pb-20">
                    <div className="animate-fadeIn" key={activeStepId}>
                        {renderContent()}
                        {/* ★ EO-069/070: References block — shown for sections with empirical data */}
                        {["projectIdea", "problemAnalysis", "stateOfTheArt", "proposedSolution", "generalObjectives", "specificObjectives", "activities", "expectedResults", "methodology", "impact", "dissemination", "risks"].includes(sectionKey) && props.projectData.references && (
                            <ReferencesBlock
                                sectionKey={sectionKey}
                                references={props.projectData.references || []}
                                onAddReference={props.onAddReference || (() => {})}
                                onEditReference={props.onEditReference || (() => {})}
                                onDeleteReference={props.onDeleteReference || (() => {})}
                                onOpenAddModal={props.onOpenAddModal || (() => {})}
                                onInjectReferences={props.onInjectReferences}  {/* EO-147d: onCollectFromSection removed */}
                                language={language}
                                referencesEnabled={
                                  // EO-130e: use getChapterForSection for correct mapping + fallback false
                                  (() => {
                                    const parentKey = getChapterForSection(sectionKey);
                                    return props.projectData._settings?.referencesEnabled?.[parentKey] ?? DEFAULT_REFS_ENABLED[parentKey] ?? false;
                                  })()
                                }
                            />
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
};

export default ProjectDisplay;

// END OF ProjectDisplay.tsx v7.33
