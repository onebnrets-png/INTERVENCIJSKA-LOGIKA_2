// hooks/useGeneration.ts
// ═══════════════════════════════════════════════════════════════ 
// AI content generation — sections, fields, summaries.
// v7.66 — 2026-03-24 — EO-147e: overrideRefs parameter in injectReferencesToText
// v7.65 — 2026-03-24 — EO-147d: Pre-clean refs in injectReferencesToText
// v7.64 — 2026-03-23 — EO-147: injectReferencesToText helper
// v7.63 — 2026-03-23 — EO-146: Add chapterPrefix to collectReferencesFromSection
// v7.62 — 2026-03-23 — EO-145: Fix safety strip regex for prefixed [XX-N] markers + hide FieldCitationsPreview when refs OFF
// v7.61 — 2026-03-23 — EO-142: Policies normalization (name/description mapping) in objectFill, fill, and executeGeneration paths.
// v7.60 — 2026-03-23 — EO-141: Per-chapter prefix numbering [PA-1],[PI-2],[SO-3] replacing global [1],[2],[3].
//         CHAPTER_REF_PREFIX + _getChapterPrefix + _prefixMarker + _migrateReferencesToPrefixFormat added.
//         _renumberAllReferences rewritten for per-chapter grouping. _convertAiRefsToReferences uses prefix.
//         _runFullReferencePipeline Step 3 sets chapterPrefix + converts [N]→[XX-N] on extraction.
//         Migration runs on executeGeneration start for legacy projects.
// v7.59 — 2026-03-20 — EO-137b: Add GenerationProgressModal to composite runners.
//         Activities: 8-phase tracking (5 steps + refs + URL verify + saving).
//         Expected Results: N+3 phase tracking (per section + refs + URL + saving).
//         Elapsed time, progress bar, estimated remaining time for both composites.
//         Phase timings saved to localStorage for future estimates.
// v7.58 — 2026-03-20 — EO-130i + EO-138:
//         EO-130i: Fix expectedResults composite runner — same guard pattern as EO-130h.
//         Guards on _runFullReferencePipeline, _verifyUrlsAfterSave, _renumberAllReferences.
//         Pre/post cleanup, safety strip per step. Proven 19 refs→0 when toggle OFF.
//         EO-138: Real-time API cost tracking. _recordUsage() at module scope.
//         calculateApiCost/USD_TO_EUR_RATE imported from constants. _usage recorded after
//         every generation step in executeGeneration + composites.
// v7.57 — 2026-03-20 — EO-137: Phase tracking callbacks throughout executeGeneration + timing history in localStorage.
// v7.56 — 2026-03-20 — EO-130h: Fix Activities composite runner — guard ALL _runFullReferencePipeline calls,
//         WP ref pipeline, URL verification. Pre/post cleanup. Safety strip per step.
//         Composite runner now fully respects chapter-level reference toggle.
// v7.55 — 2026-03-20 — EO-130g: Remove old references BEFORE pipeline init (fundamental rule: old data never survives regeneration) + post-merge safety strip.
// v7.54 — 2026-03-20 — EO-130f: Sync getChapterForSection — added readinessLevels to projectIdea mapping.
// v7.53 — 2026-03-20 — EO-130e: Recursive safety strip, skip citation modal/URL verify/source retrieval when refs OFF, clean orphaned refs.
// v7.52 — 2026-03-20 — EO-130d: Fix sub-section toggle bypass — complete getChapterForSection mapping, safety strip, fallback=false.
// v7.51 — 2026-03-20 — EO-130c: getChapterForSection inheritance — sub-sections read toggle from parent chapter.
// v7.50 — 2026-03-18 — EO-130: referencesEnabled guard in executeGeneration pipeline. Pass setting to generateSectionContent.
//         DEFAULT_REFS_ENABLED imported from Instructions.ts.
// v7.49 — 2026-03-18 — EO-131: _verifyUrlsAfterSave — post-renumber async URL verification (fire-and-forget).
//         Updates ONLY urlVerified/verificationStatus — NEVER overwrites inlineMarker or other ref fields.
//         Called from activities composite, expectedResults composite, and executeGeneration after save.
// v7.48 — 2026-03-18 — EO-129: Unwrap audit complete — all array sections (outputs/outcomes/impacts/kers/partners/risks)
//         have unwrap on both executeGeneration and composite paths. Defensive Array.isArray in all display components.
//         EO-090 runs correctly per-sectionKey for all ER sections. All EO-129 items resolved.
// v7.47 — 2026-03-18 — EO-129: Fix ER composite ref marker collisions — accumulate _erRunningRefs across steps.
//         EO-129: Normalize [N, M] multi-citation markers at pipeline entry. [N,M] parser fix in FieldCitationsPreview.
// v7.46 — 2026-03-18 — EO-125: Added BAD_REQUEST handler to handleAIError (was showing generic dialog, now shows specific 400 message + Settings button).
//         Audit confirmed all other paths (executeGeneration, composites, translation) already route through handleAIError correctly.
// v7.45 — 2026-03-18 — EO-123: partners unwrap in executeGeneration + kers fix in expectedResults handler.
//         EO-124: Ghost marker cleanup in _renumberAllReferences — removes [N] markers with no backing reference.
// v7.44 — 2026-03-18 — EO-118: skipVerification:true in composite pipeline calls (PM, Risks, expectedResults).
//         Prevents async URL verifier from overwriting renumbered references after composite DONE.
// v7.43 — 2026-03-17 — EO-117: Reduced ref caps (PM:5, risks:6, default:8).
//         EO-115 debug logging for renumbering verification.
// v7.42 — 2026-03-17 — EO-116: Cap activities_wp refs to max 2 per WP in EO-102C.
//         FIX: Ensure EO-102C marker cleanup persists after composite step overwrites.
// v7.41 — 2026-03-17 — EO-115: Global reference renumbering after composite run.
//         After activities/expectedResults composite completes ALL steps, renumber ALL references
//         sequentially [1],[2],[3]... by section order. Uses temp-placeholder system to prevent
//         marker collisions during replacement. Matches behavior of single-section generation.
// v7.40 — 2026-03-17 — EO-111: Composite INVALID_JSON fallback dialog with retry + model switch option,
//         EO-112b: Filter vertexaisearch.cloud.google.com redirect URLs from references,
//         EO-113: Unified error logging (removed duplicate logErrorQuick call).
// v7.39 — 2026-03-17 — EO-107: FIX instanceof→e.name for ModelOverloadedError (1 remaining occurrence),
//         FIX EO-106 auto-fill save order (was running AFTER setProjectData → results lost on reload),
//         FIX reference marker replacement overwrite — 4 locations where pipeline Step 7 replaced markers
//         in newData[sectionKey] but cleanData overwrote them back to unreplaced version:
//           (1) Composite Step 1 PM: don't overwrite newData.projectManagement with cleanData
//           (2) Composite Step 5 Risks: don't overwrite newData.risks with cleanData
//           (3) executeGeneration main path: read from _refPipelineData[sectionKey] not cleanData
//           (4) expectedResults composite: read from _compTempData[s] not cleanData
//         This fixes [5],[7],[11],[12],[36],[42],[45] "Reference not found" in PM and other sections.
//         CLEANUP: removed dead _escapedOrig variable in Step 7.
// v7.38 — 2026-03-17 — EO-106: Universal auto-fill for empty critical fields after generation
//         After composite or sequential generation, checks projectManagement.description,
//         problemAnalysis.coreProblem, projectIdea main fields. Auto-fills if empty.
//         Prevents "half-generated" sections when one step fails but others succeed.
// v7.37 — 2026-03-17 — EO-105: Reference pipeline for Activities WP-level text
//         generateActivitiesPerWP generates per-WP text with [N] markers but no _references.
//         Now: after all WPs generated, run _runFullReferencePipeline on each WP to create
//         placeholder refs from [N] markers + assign global numbering. Fixes "Reference not found" in Activities.
// v7.36 — 2026-03-17 — EO-104: FAST model fallback in composite runner
//         ModelOverloadedError now thrown after 3 retries (was 6) = 15s instead of 245s.
//         Composite runner catches ModelOverloadedError at EVERY step → saves progress →
//         shows EO-099 dialog immediately → user can switch model and retry.
// v7.35 — 2026-03-17 — EO-102: FIX composite ref pipeline order + cap refs per section
//         EO-102B: Composite runner ran pipeline BEFORE unwrap → unwrap overwrote replaced markers.
//         Now: unwrap FIRST → merge into newData → THEN run pipeline on final data.
//         EO-102C: Cap _references per section (PM/risks: max 10, keep newest by year).
//         Dropped refs' markers are cleaned from text to prevent orphaned [N].
// v7.34 — 2026-03-17 — EO-100: Unified Reference Pipeline — _runFullReferencePipeline() replaces
//         inline code in executeGeneration AND _processCompositeStepRefs with identical logic:
//         EO-090 (remove old section refs), EO-070 (extract _references), EO-097b (infer markers),
//         EO-087 (dedup within section), v7.26 (global marker replacement), EO-083 (URL verify),
//         EO-084 (approved source enrichment), v7.23 (fallback placeholder refs).
//         Composite runner (PM, risks, outputs, outcomes, impacts, kers) now runs FULL pipeline.
// v7.33 — 2026-03-17 — EO-097b: FIX composite ref pipeline — handle empty inlineMarker from AI,
//         infer _originalMarker from array index [1],[2]... when AI omits it.
//         Also process refs for pmContentRaw BEFORE unwrap (refs are inside wrapper).
// v7.32 — 2026-03-16 — EO-099: Intelligent model fallback dialog — when MODEL_OVERLOADED exhausts all retries,
//         shows user-friendly modal with 3 options: wait+retry, switch to fallback model, or cancel.
//         Covers all providers (Gemini, OpenAI, OpenRouter) with provider-specific fallback models.
// v7.31 — 2026-03-16 — EO-097: Reference pipeline for composite runner — PM, risks, outputs, outcomes, impacts, kers
//         now extract _references, convert to global numbering, replace markers, merge into projectData.references
// v7.30 — 2026-03-16 — EO-094: 15s rate-limiting between composite/sequential section generation calls (was 3s)
//         EO-095: localStorage cache for successful section results — survives partial chapter failures, 1h TTL, auto-clear on full regeneration
// v7.29 — 2026-03-16 — (reserved)
// v7.28 — 2026-03-16 — EO-091: FIX "Save anyway" bypassed reference merge pipeline.
// v7.27 — 2026-03-16 — EO-090: FIX reference accumulation: remove old section refs
//         before adding new ones. Prevents placeholder/stale ref buildup across regenerations.
// v7.26 — 2026-03-16 — EO-087: FIX cross-section dedup (sectionKey guard),
//         author fallback (source || 'Unknown author'), placeholder refs guard
// v7.25 — 2026-03-16 — FIX: Runtime warning for bare numeric citations without short attribution
//   - Added helper checks for bare [N] markers without (Author/Institution, Year)
//   - After generation, academic sections are scanned for incomplete inline citation format
//   - Shows warning modal with option to regenerate citation formatting only
//   - Logs bare-marker fallback cases when placeholder references are created from [N] text
// v7.24 — 2026-03-13 — EO-084: Approved source pool and retrieval-only citation pipeline
//   - Import searchAuthoritativeSources, buildSearchQuery, formatApprovedSourcesForPrompt, enrichReferencesWithSourceIds
//   - Before AI generation, search CrossRef/OpenAlex for approved sources (ACADEMIC_RIGOR_SECTIONS only)
//   - Inject approved source pool into generateSectionContent via approvedSourcesBlock parameter
//   - After generation, match references to approved sources (conservative: DOI > URL > title+year)
//   - Persist approvedSources in projectData alongside references
//   - Run EO-083 verification on generated references (preserved, no regression)
// v7.23 — 2026-03-12 — HOTFIX: persist generated references into projectData after section generation
//   - FIX: Add fallback auto-collection of references when AI omits _references but text has [N] markers
//   - FIX: Also extract _references from wrapper objects during subMapping unwrap
//   - FIX: Also extract _references during problemAnalysis/projectIdea section unwrap
// v7.22 — 2026-03-12 — EO-083: Real URL verification via Edge Function + CrossRef DOI fallback
//   - Import verifyReferencesBatch + applyVerificationResults from referenceVerificationService
//   - Remove optimistic urlVerified=true in enrichReferencesWithAI (now set by Edge Function)
//   - Remove optimistic urlVerified propagation in _convertAiRefsToReferences
//   - Insert real verification step (verifyReferencesBatch) before references are saved
// v7.21 — 2026-03-11 — EO-080: URL Provenance & urlVerified propagation
//   - _convertAiRefsToReferences: keep references with empty url (remove length filter)
//   - _convertAiRefsToReferences: propagate urlVerified from AI response
//   - enrichReferencesWithAI: respect urlVerified flag, skip re-enriching verified refs
// v7.20 — 2026-03-10 — EO-073: Search-First Citation Architecture
//   - enrichReferencesWithAI: search-first prompt, __NOT_FOUND__ handling, UNVERIFIED notes
//   - _convertAiRefsToReferences: skip refs without valid URL (min 10 chars)
//   - collectReferencesFromSection: note = "Needs verification — collected from text via regex"
// v7.18 — 2026-03-10 — EO-071: Liberal INLINE_CITATION_REGEX, EU_LEGISLATION_REGEX,
//   expanded sectionKeys (methodology, impact, dissemination)
// v7.17 — 2026-03-10 — EO-070: AI reference generation — auto-extract _references from AI response,
//   collectReferencesFromText, collectReferencesFromSection, generateAndVerifyReferences
// v7.16 — 2026-03-08 — EO-048b: Regenerate from warning modal passes validation issues as repair instructions to AI
// v7.15 — 2026-03-08 — EO-048: All warnings/errors shown via modal (consistent UX — no more red error banner for warnings)
// v7.14 — 2026-03-08 — EO-047: Markdown auto-strip from AI output before validation (prevents FATAL on **bold** in structured fields)
// v7.13 — 2026-03-08 — EO-045b: Validation fix — skip empty-field FATAL, show concrete issues in modal/warnings
// v7.12 — 2026-03-08 — EO-045: Validation gate — validateSectionOutput before save (reject FATAL, warn HIGH)
// v7.11 — 2026-03-06 — EO-040: handleFieldAIGenerate uses generateFieldContent (full rules)
// v7.10 — 2026-03-06 — EO-039: handleFieldAIGenerate + getPrettyName scope fix
//   ★ NEW: handleFieldAIGenerate() — AI Assistant per-field generation with user instructions
//   ★ FIX: SECTION_PRETTY_NAMES + getPrettyName moved to module scope (was trapped inside _smartMergeArray)
//   ★ EXPORTED: handleFieldAIGenerate in return object
// v7.9  -  Pretty names za progress (EO-034)
// v7.8 — 2026-03-01 — FIX: Composite partners/PM unwrap
//
// CHANGES v7.8:
//   ★ FIX: runComposite Step 1 (PM) — unwrap double-wrapped { projectManagement: {...} } response
//   ★ FIX: runComposite Step 2 (Partners) — unwrap object-wrapped { partners: [...] } response
//   ★ Both fixes prevent cascading failure (empty partners → skipped allocations → empty finance)
//
// v7.7 — 2026-02-27 — SMART MERGE + DEEP EMPTY FIELD DETECTION
//
// CHANGES v7.7:
//   ★ FIX: ObjectFill for problemAnalysis now detects empty causes/consequences arrays
//   ★ FIX: ObjectFill for projectIdea now detects empty policies with empty name/description
//   ★ FIX: ObjectFill for projectManagement now detects empty structure sub-fields
//   ★ FIX: DATA INSERTION uses SMART MERGE — AI empty responses never overwrite existing data
//   ★ FIX: Deep merge for nested objects (coreProblem) — only non-empty fields overwrite
//   ★ FIX: ARRAY sections (objectives, outputs, kers, risks) use smart merge — empty AI items don't overwrite
//   ★ FIX: runComposite (expectedResults) uses smart merge for array sections
//   ★ All previous v7.5/v7.6 changes preserved.
//
// v7.5 — 2026-02-24 — ABORT/CANCEL SUPPORT + TOKEN OPTIMIZATION ALIGNMENT
//
// CHANGES v7.5:
//   ★ NEW: abortControllerRef — stores active AbortController
//   ★ NEW: cancelGeneration() — aborts current generation, resets state
//   ★ CHANGED: executeGeneration() creates AbortController, passes signal
//     to all generate* functions
//   ★ CHANGED: handleGenerateField() creates AbortController, passes signal
//   ★ CHANGED: runSummaryGeneration() creates AbortController, passes signal
//   ★ CHANGED: handleAIError() recognizes AbortError — no modal shown
//   ★ EXPORTED: cancelGeneration from hook return
//   ★ All previous v7.2 changes preserved.
//
// v7.2 — 2026-02-23 — SMART AI CREDIT PROTECTION
// v7.0 — 2026-02-22 — FULL v7.0 ALIGNMENT
// v5.0 — 2026-02-22 — PARTNERS (CONSORTIUM) AI GENERATION
// v4.2 — 2026-02-16 — SUB-SECTION GENERATION
// v3.9 — 2026-02-16 — PER-WP GENERATION COMPLETE
// v3.8 — 2026-02-16 — PER-WP GENERATION
// v3.7 — 2026-02-15 — SMART FILL COMPOSITE
// v3.6 — 2026-02-15 — RETRY + BACKOFF + FRIENDLY MODALS
// v3.5.2 — 2026-02-14 — AUTO PM + ROBUST CHECKS + 3-OPTION MODAL
// ═══════════════════════════════════════════════════════════════

import { useState, useCallback, useRef } from 'react';
import {
  generateSectionContent,
  generateFieldContent,
  generateProjectSummary,
  generateTargetedFill,
  generateActivitiesPerWP,
  generateObjectFill,
  generatePartnerAllocations,
} from '../services/geminiService.ts';
import { getRateLimitStatus, ModelOverloadedError, getFallbackModel, getProviderConfig } from '../services/aiProvider.ts';
import { generateSummaryDocx } from '../services/docxGenerator.ts';
import { recalculateProjectSchedule, downloadBlob, set } from '../utils.ts';
import { TEXT } from '../locales.ts';
import { storageService } from '../services/storageService.ts';
import { smartTranslateProject } from '../services/translationDiffService.ts';
import { isValidPartnerType } from '../services/Instructions.ts';
import { getCollectReferencesInstruction } from '../services/Instructions.ts';
import { DEFAULT_REFS_ENABLED } from '../services/Instructions.ts'; // EO-130
import { calculateApiCost, USD_TO_EUR_RATE } from '../constants.tsx'; // EO-138
import { generateSectionContent as generateSectionContentRaw } from '../services/geminiService.ts';
import { logErrorQuick } from '../services/errorLogService.ts';
// ★ v7.22 EO-083: Real URL verification via Edge Function
import { verifyReferencesBatch, applyVerificationResults } from '../services/referenceVerificationService.ts';
// ★ v7.24 EO-084: Approved source pool — retrieval-only citation pipeline
import {
  searchAuthoritativeSources,
  buildSearchQuery,
  formatApprovedSourcesForPrompt,
  enrichReferencesWithSourceIds,
} from '../services/sourceRetrievalService.ts';
import type { ApprovedSource } from '../types.ts';
// ★ v7.12 EO-045: Validation service import
import { validateSectionOutput, shouldRejectOutput, shouldRepairOutput, summariseValidation } from '../services/validateInstructionsOutput.ts';
import type { ValidationContext } from '../services/validateInstructionsOutput.ts';

// EO-130d: COMPLETE map — sub-section keys → parent chapter key for toggle inheritance.
// Chapters map to themselves. Unknown keys fall back to themselves (own chapter).
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

// ── EO-141: Per-chapter reference prefix ─────────────────────────────────────
const CHAPTER_REF_PREFIX: Record<string, string> = {
  problemAnalysis:   'PA',
  projectIdea:       'PI',
  generalObjectives: 'GO',
  specificObjectives:'SO',
  activities:        'AC',
  expectedResults:   'ER',
  projectManagement: 'PM',
  partners:          'PT',
  risks:             'RS',
};

function _getChapterPrefix(sectionKey: string): string {
  // Direct hit
  if (CHAPTER_REF_PREFIX[sectionKey]) return CHAPTER_REF_PREFIX[sectionKey];
  // Map via getChapterForSection, then look up prefix
  const chapter = getChapterForSection(sectionKey);
  if (CHAPTER_REF_PREFIX[chapter]) return CHAPTER_REF_PREFIX[chapter];
  // WP sections e.g. activities_wp1 → AC
  if (sectionKey.startsWith('activities')) return 'AC';
  if (sectionKey.startsWith('expectedResults')) return 'ER';
  return 'RF';
}

// EO-141: Convert a legacy [N] marker to prefixed [XX-N] using sectionKey
function _prefixMarker(marker: string, sectionKey: string): string {
  if (!marker) return marker;
  // Already prefixed: [PA-1], [AC-3] etc — leave as-is
  if (/^\[[A-Z]{2,3}-\d+\]$/.test(marker)) return marker;
  const num = marker.replace(/\D/g, '');
  if (!num) return marker;
  return '[' + _getChapterPrefix(sectionKey) + '-' + num + ']';
}

// EO-141: Migration — run once on project load to add chapterPrefix to legacy refs
function _migrateReferencesToPrefixFormat(data: any): boolean {
  if (!data?.references?.length) return false;
  let changed = false;
  (data.references as any[]).forEach((ref: any) => {
    // Set chapterPrefix if missing
    if (!ref.chapterPrefix && ref.sectionKey) {
      ref.chapterPrefix = _getChapterPrefix(ref.sectionKey);
      changed = true;
    }
    // Convert [N] to [XX-N] if old format
    if (ref.inlineMarker && /^\[\d+\]$/.test(ref.inlineMarker)) {
      ref.inlineMarker = _prefixMarker(ref.inlineMarker, ref.sectionKey || '');
      changed = true;
    }
  });
  if (changed) {
    console.log('[EO-141] Migration: converted ' + data.references.length + ' refs to prefix format');
  }
  return changed;
}

interface UseGenerationProps {
  projectData: any;
  setProjectData: (fn: any) => void;
  language: 'en' | 'si';
  ensureApiKey: () => boolean;
  setIsSettingsOpen: (val: boolean) => void;
  setHasUnsavedTranslationChanges: (val: boolean) => void;
  handleUpdateData: (path: (string | number)[], value: any) => void;
  checkSectionHasContent: (sectionKey: string) => boolean;
  setModalConfig: (config: any) => void;
  closeModal: () => void;
  currentProjectId: string | null;
  projectVersions: { en: any; si: any };
  setLanguage: (lang: 'en' | 'si') => void;
  setProjectVersions: (fn: (prev: { en: any; si: any }) => { en: any; si: any }) => void;
}

// ★ v7.7: Helper — check if an array item has real content (excluding 'id' fields)
function _arrayItemHasContent(item: any): boolean {
  if (!item || typeof item !== 'object') return false;
  return Object.entries(item).some(function(entry: [string, any]) {
    if (entry[0] === 'id') return false;
    return typeof entry[1] === 'string' && entry[1].trim().length > 0;
  });
}

// ★ v7.7: Helper — check if an array has any items with real content
function _arrayHasRealContent(arr: any[]): boolean {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  return arr.some(function(item: any) { return _arrayItemHasContent(item); });
}

var SECTION_PRETTY_NAMES: Record<string, Record<string, string>> = {
  problemAnalysis: { en: 'Problem Analysis', si: 'Analiza problema' },
  projectIdea: { en: 'Project Idea', si: 'Projektna ideja' },
  generalObjectives: { en: 'General Objectives', si: 'Splošni cilji' },
  specificObjectives: { en: 'Specific Objectives', si: 'Specifični cilji' },
  activities: { en: 'Activities & Work Plan', si: 'Aktivnosti in delovni načrt' },
  projectManagement: { en: 'Project Management', si: 'Upravljanje projekta' },
  partners: { en: 'Consortium (Partners)', si: 'Konzorcij (Partnerji)' },
  partnerAllocations: { en: 'Partner Allocations', si: 'Alokacije partnerjev' },
  outputs: { en: 'Outputs', si: 'Rezultati (Outputs)' },
  outcomes: { en: 'Outcomes', si: 'Učinki (Outcomes)' },
  impacts: { en: 'Impacts', si: 'Vplivi (Impacts)' },
  kers: { en: 'Key Exploitable Results', si: 'Ključni izkoriščljivi rezultati' },
  risks: { en: 'Risk Management', si: 'Obvladovanje tveganj' },
  expectedResults: { en: 'Expected Results', si: 'Pričakovani rezultati' },
  coreProblem: { en: 'Core Problem', si: 'Jedro problema' },
  causes: { en: 'Causes', si: 'Vzroki' },
  consequences: { en: 'Consequences', si: 'Posledice' },
  projectTitleAcronym: { en: 'Project Title & Acronym', si: 'Naslov in akronim projekta' },
  mainAim: { en: 'Main Aim', si: 'Glavni cilj' },
  stateOfTheArt: { en: 'State of the Art', si: 'Stanje na področju' },
  proposedSolution: { en: 'Proposed Solution', si: 'Predlagana rešitev' },
  readinessLevels: { en: 'Readiness Levels (TRL/SRL/ORL/LRL)', si: 'Stopnje pripravljenosti (TRL/SRL/ORL/LRL)' },
  policies: { en: 'EU Policies', si: 'EU politike' },
};
// ★ EO-095: localStorage cache for successful section results — survives partial chapter failures
var EO095_CACHE_PREFIX = 'eo095_section_cache_';

function _cacheSectionResult(projectId: string, sectionKey: string, lang: string, data: any): void {
  try {
    var key = EO095_CACHE_PREFIX + projectId + '_' + sectionKey + '_' + lang;
    localStorage.setItem(key, JSON.stringify({
      data: data,
      timestamp: Date.now(),
      version: '7.30'
    }));
    console.log('[EO-095] Cached successful result for "' + sectionKey + '"');
  } catch (e) {
    console.warn('[EO-095] Cache write failed for "' + sectionKey + '":', e);
  }
}

function _getCachedSectionResult(projectId: string, sectionKey: string, lang: string, maxAgeMs?: number): any | null {
  try {
    var key = EO095_CACHE_PREFIX + projectId + '_' + sectionKey + '_' + lang;
    var raw = localStorage.getItem(key);
    if (!raw) return null;
    var cached = JSON.parse(raw);
    var ttl = maxAgeMs || 3600000;
    if (Date.now() - cached.timestamp > ttl) {
      localStorage.removeItem(key);
      return null;
    }
    console.log('[EO-095] Using cached result for "' + sectionKey + '" (age: ' + Math.round((Date.now() - cached.timestamp) / 1000) + 's)');
    return cached.data;
  } catch (e) {
    return null;
  }
}

function _clearSectionCache(projectId: string): void {
  try {
    var keys = Object.keys(localStorage).filter(function(k) { return k.startsWith(EO095_CACHE_PREFIX + projectId); });
    keys.forEach(function(k) { localStorage.removeItem(k); });
    if (keys.length > 0) console.log('[EO-095] Cleared ' + keys.length + ' cached sections for project ' + projectId);
  } catch (e) {
    console.warn('[EO-095] Cache clear failed:', e);
  }
}
// ★ EO-106: Universal auto-fill for empty critical fields after generation
async function _autoFillEmptyCriticalFields(
  newData: any,
  sectionsToCheck: string[],
  language: 'en' | 'si',
  signal: AbortSignal,
  setIsLoading: (msg: string | boolean) => void,
  generateObjectFillFn: typeof generateObjectFill
): Promise<any> {
  var CRITICAL_FIELDS: Record<string, string[]> = {
    projectManagement: ['description'],
    problemAnalysis: ['coreProblem'],
    projectIdea: ['mainAim', 'stateOfTheArt', 'proposedSolution'],
  };
  var filled: string[] = [];
  for (var _si = 0; _si < sectionsToCheck.length; _si++) {
    var sKey = sectionsToCheck[_si];
    var rule = CRITICAL_FIELDS[sKey];
    if (!rule) continue;
    if (signal.aborted) break;
    var sectionData = newData[sKey];
    if (!sectionData || typeof sectionData !== 'object' || Array.isArray(sectionData)) continue;
    var emptyFields: string[] = [];
    for (var _fi = 0; _fi < rule.length; _fi++) {
      var fKey = rule[_fi];
      var fVal = sectionData[fKey];
      if (!fVal) {
        emptyFields.push(fKey);
      } else if (typeof fVal === 'string' && fVal.trim().length === 0) {
        emptyFields.push(fKey);
      } else if (typeof fVal === 'object' && !Array.isArray(fVal)) {
        var hasContent = Object.values(fVal).some(function(v: any) {
          return typeof v === 'string' && v.trim().length > 0;
        });
        if (!hasContent) emptyFields.push(fKey);
      }
    }
    if (emptyFields.length === 0) continue;
    console.warn('[EO-106] "' + sKey + '" has ' + emptyFields.length + ' empty critical fields: [' + emptyFields.join(', ') + '] — auto-filling...');
    setIsLoading(language === 'si' ? 'Dopolnjujem manjkajoča polja v ' + sKey + '...' : 'Filling missing fields in ' + sKey + '...');
    try {
      var fillResult = await generateObjectFillFn(sKey, newData, sectionData, emptyFields, language, signal);
      if (fillResult && typeof fillResult === 'object') {
        var mergedSection = { ...sectionData };
        var fillKeys = Object.keys(fillResult);
        for (var _mki = 0; _mki < fillKeys.length; _mki++) {
          var mk = fillKeys[_mki];
          var mv = fillResult[mk];
          if (typeof mv === 'string' && mv.trim().length > 0) {
            mergedSection[mk] = mv;
          } else if (mv && typeof mv === 'object' && !Array.isArray(mv)) {
            var mvHas = Object.values(mv).some(function(v: any) { return typeof v === 'string' && v.trim().length > 0; });
            if (mvHas) mergedSection[mk] = { ...(mergedSection[mk] || {}), ...mv };
          } else if (Array.isArray(mv) && mv.length > 0) {
            mergedSection[mk] = mv;
          }
        }
        newData[sKey] = mergedSection;
        filled.push(sKey + ':' + emptyFields.join(','));
        console.log('[EO-106] "' + sKey + '" auto-filled: [' + emptyFields.join(', ') + ']');
      }
    } catch (_fillErr: any) {
      if (_fillErr.name === 'AbortError') break;
      console.warn('[EO-106] Auto-fill failed for "' + sKey + '" (non-fatal):', _fillErr?.message || _fillErr);
    }
  }
  if (filled.length > 0) console.log('[EO-106] Auto-fill complete: ' + filled.length + ' sections patched');
  return newData;
}

// ★ EO-100: Unified Reference Pipeline — FULL pipeline for ALL generation paths
// Replaces both inline code in executeGeneration AND old _processCompositeStepRefs.
// Steps: EO-090 cleanup → EO-070 extract → EO-097b infer markers → EO-087 dedup →
//        v7.26 marker replacement → EO-083 URL verify → EO-084 source enrichment → v7.23 fallback
function _runFullReferencePipeline(
  sectionKey: string,
  generatedData: any,
  newData: any,
  options?: {
    approvedSources?: any[];
    setProjectData?: (fn: any) => void;
    skipVerification?: boolean;
    parentSectionKey?: string;
  }
): { cleanData: any; refsAdded: number; extractedRefs: any[] } {
  var _opts = options || {};
  var _currentRefs = Array.isArray(newData.references) ? newData.references : [];
  var _rawAiRefs: any[] = [];
  var _extractedRefs: any[] = [];

  // ═══ STEP 0: EO-129 — Normalize [N, M] multi-citation markers → [N] [M] ═══
  // AI sometimes returns "(Author, Year) [1, 2]" — split into separate markers
  if (generatedData && typeof generatedData === 'object') {
    try {
      var _normJson = JSON.stringify(generatedData);
      // Replace [N, M, ...] with [N] [M] ... (handles 2+ numbers separated by commas/spaces)
      _normJson = _normJson.replace(/\[(\d+)(?:,\s*(\d+))+\]/g, function(match: string) {
        var nums = match.slice(1, -1).split(/,\s*/);
        return nums.map(function(n: string) { return '[' + n.trim() + ']'; }).join(' ');
      });
      generatedData = JSON.parse(_normJson);
    } catch (_normErr) { /* non-fatal */ }
  }

  // ═══ STEP 1: EO-090 — Remove OLD references for this section ═══
  var _sectionChildKeys: Record<string, string[]> = {
    problemAnalysis: ['problemAnalysis', 'coreProblem', 'causes', 'consequences'],
    projectIdea: ['projectIdea', 'mainAim', 'stateOfTheArt', 'proposedSolution', 'policies', 'readinessLevels'],
    generalObjectives: ['generalObjectives'],
    specificObjectives: ['specificObjectives'],
    expectedResults: ['expectedResults', 'outputs', 'outcomes', 'impacts', 'kers'],
    activities: ['activities', 'projectManagement', 'partners', 'risks'],
  };
  var _topSectionKey = _opts.parentSectionKey || sectionKey;
  for (var _scKey in _sectionChildKeys) {
    if (_sectionChildKeys[_scKey].indexOf(sectionKey) >= 0) { _topSectionKey = _scKey; break; }
  }
  var _keysToClean = [sectionKey]; // Only clean refs for THIS section, not the whole parent
  var _cleanedRefs = _currentRefs.filter(function(r: any) {
    if (!r.sectionKey) return true;
    return _keysToClean.indexOf(r.sectionKey) < 0;
  });
  var _removedCount = _currentRefs.length - _cleanedRefs.length;
  if (_removedCount > 0) {
    console.log('[EO-100/EO-090] Removed ' + _removedCount + ' old refs for "' + sectionKey + '"');
    _currentRefs = _cleanedRefs;
  }

  // ═══ STEP 2: EO-070 — Extract _references from AI response ═══
  // Check top-level
  if (generatedData && typeof generatedData === 'object' && !Array.isArray(generatedData) && Array.isArray(generatedData._references) && generatedData._references.length > 0) {
    var _extraction = _extractAndRemoveReferences(generatedData, sectionKey);
    generatedData = _extraction.cleanData;
    _rawAiRefs = _extraction.refs;
  }
  // Check nested wrappers (e.g. { projectManagement: {..., _references: [...]} })
  if (_rawAiRefs.length === 0 && generatedData && typeof generatedData === 'object' && !Array.isArray(generatedData)) {
    var _nestedKeys = Object.keys(generatedData);
    for (var _nki = 0; _nki < _nestedKeys.length; _nki++) {
      var _nkVal = generatedData[_nestedKeys[_nki]];
      if (_nkVal && typeof _nkVal === 'object' && !Array.isArray(_nkVal) && Array.isArray(_nkVal._references) && _nkVal._references.length > 0) {
        var _nestedExtraction = _extractAndRemoveReferences(_nkVal, sectionKey);
        generatedData[_nestedKeys[_nki]] = _nestedExtraction.cleanData;
        _rawAiRefs = _nestedExtraction.refs;
        console.log('[EO-100] Extracted ' + _rawAiRefs.length + ' refs from nested "' + _nestedKeys[_nki] + '"');
        break;
      }
    }
  }

  // ═══ STEP 3: EO-097b — Infer missing inlineMarker from array index ═══
  if (_rawAiRefs.length > 0) {
    // EO-141: Set chapterPrefix on all extracted refs and convert [N] → [XX-N]
    var _chPrefix = _getChapterPrefix(sectionKey);
    for (var _iri = 0; _iri < _rawAiRefs.length; _iri++) {
      var _aiRef = _rawAiRefs[_iri];
      // Ensure chapterPrefix is set
      if (!_aiRef.chapterPrefix) _aiRef.chapterPrefix = _chPrefix;
      // Infer missing marker
      if (!_aiRef.inlineMarker || !_aiRef.inlineMarker.trim()) {
        _aiRef.inlineMarker = '[' + _chPrefix + '-' + (_iri + 1) + ']';
        console.log('[EO-141/097b] Inferred inlineMarker ' + _aiRef.inlineMarker + ' for "' + (_aiRef.title || '').substring(0, 40) + '"');
      } else if (/^\[\d+\]$/.test(_aiRef.inlineMarker)) {
        // Convert legacy [N] → [XX-N]
        _aiRef.inlineMarker = _prefixMarker(_aiRef.inlineMarker, sectionKey);
      }
    }

        // ═══ STEP 3b: EO-102C — Cap references per section, KEEP NEWEST ═══
    var _REF_CAPS: Record<string, number> = {
      projectManagement: 5, risks: 6, partners: 5, activities: 5,
      outputs: 3, outcomes: 3, impacts: 3, kers: 2,
    };
    var _maxRefs = _REF_CAPS[sectionKey] ?? 8;
    // EO-116: Activities WP sections are operational — max 2 refs per WP
    if (sectionKey.startsWith('activities_wp')) {
      _maxRefs = 2;
    }
    if (_rawAiRefs.length > _maxRefs) {
      _rawAiRefs.sort(function(a: any, b: any) {
        var ya = parseInt(a.year, 10) || 0;
        var yb = parseInt(b.year, 10) || 0;
        if (ya > 0 && yb > 0) return yb - ya;
        if (ya > 0) return -1;
        if (yb > 0) return 1;
        return 0;
      });
      var _droppedRefs = _rawAiRefs.slice(_maxRefs);
      var _keptYears = _rawAiRefs.slice(0, _maxRefs).map(function(r: any) { return r.year || '?'; }).join(', ');
      console.warn('[EO-102C] Capping "' + sectionKey + '": ' + _rawAiRefs.length + ' → ' + _maxRefs + ' (kept newest: [' + _keptYears + '])');
      // Collect dropped markers to clean from text
      var _droppedMarkers = _droppedRefs.map(function(r: any) { return (r.inlineMarker || '').trim(); }).filter(function(m: string) { return m.length > 0; });
      _rawAiRefs = _rawAiRefs.slice(0, _maxRefs);
      // Remove dropped markers from generatedData text
      if (_droppedMarkers.length > 0 && generatedData && typeof generatedData === 'object') {
        try {
          var _dJson = JSON.stringify(generatedData);
          for (var _dmi = 0; _dmi < _droppedMarkers.length; _dmi++) {
            var _dmEsc = _droppedMarkers[_dmi].replace(/[[\]]/g, '\\$&');
            _dJson = _dJson.replace(new RegExp('\\s*\\([^)]{2,60}\\)\\s*' + _dmEsc, 'g'), '');
            _dJson = _dJson.replace(new RegExp(_dmEsc, 'g'), '');
          }
          generatedData = JSON.parse(_dJson);
          console.log('[EO-102C] Cleaned ' + _droppedMarkers.length + ' dropped markers from "' + sectionKey + '" text');
        } catch (_dCleanErr) {
          console.warn('[EO-102C] Marker cleanup parse error (non-fatal):', _dCleanErr);
        }
      }
      // EO-116: Also apply dropped marker cleanup to newData[sectionKey] so Step 7 (marker replacement)
      // operates on the already-cleaned version — prevents "Reference not found" for dropped markers
      if (_droppedMarkers.length > 0 && newData[sectionKey] && typeof newData[sectionKey] === 'object') {
        try {
          var _ndJson = JSON.stringify(newData[sectionKey]);
          for (var _ndmi = 0; _ndmi < _droppedMarkers.length; _ndmi++) {
            var _ndmEsc = _droppedMarkers[_ndmi].replace(/[[\]]/g, '\\$&');
            _ndJson = _ndJson.replace(new RegExp('\\s*\\([^)]{2,60}\\)\\s*' + _ndmEsc, 'g'), '');
            _ndJson = _ndJson.replace(new RegExp(_ndmEsc, 'g'), '');
          }
          newData[sectionKey] = JSON.parse(_ndJson);
          console.log('[EO-116] Applied dropped marker cleanup to newData["' + sectionKey + '"]');
        } catch (_ndCleanErr) {
          console.warn('[EO-116] newData marker cleanup parse error (non-fatal):', _ndCleanErr);
        }
      }
    }

    // ═══ STEP 4: EO-070/087 — Convert to global numbering with section-scoped dedup ═══
    _extractedRefs = _convertAiRefsToReferences(_rawAiRefs, sectionKey, _currentRefs);

    if (_extractedRefs.length > 0) {
      console.log('[EO-100] Converted ' + _extractedRefs.length + ' refs for "' + sectionKey + '"');
    }
  }

  // ═══ STEP 5: v7.23 FALLBACK — Create placeholder refs from [N] markers if no _references ═══
  if (_extractedRefs.length === 0) {
    var _allGenText = '';
    var _walkText = function(obj: any) {
      if (typeof obj === 'string') _allGenText += ' ' + obj;
      else if (Array.isArray(obj)) obj.forEach(function(item: any) { _walkText(item); });
      else if (obj && typeof obj === 'object') Object.values(obj).forEach(function(v: any) { _walkText(v); });
    };
    if (generatedData) _walkText(generatedData);
    var _markerRegex = /\[(\d+)\]/g;
    var _markerMatch;
    var _foundMarkers = new Set<string>();
    while ((_markerMatch = _markerRegex.exec(_allGenText)) !== null) {
      _foundMarkers.add(_markerMatch[1]);
    }
    if (_foundMarkers.size > 0) {
      // Check that these markers are not already in existing refs for this section
      var _existingSectionRefs = _currentRefs.filter(function(r: any) { return r.sectionKey === sectionKey; });
      var _existingMarkers = new Set(_existingSectionRefs.map(function(r: any) { return r.inlineMarker; }));
      var _missingMarkers: string[] = [];
      _foundMarkers.forEach(function(num) {
        if (!_existingMarkers.has('[' + num + ']')) _missingMarkers.push(num);
      });
      if (_missingMarkers.length > 0) {
        console.log('[EO-141] FALLBACK: Creating ' + _missingMarkers.length + ' placeholder refs from [N] markers for "' + sectionKey + '"');
        var _placeholders: any[] = [];
        var _fbPrefix = _getChapterPrefix(sectionKey);
        _missingMarkers.forEach(function(num) {
          var _prefixedMarker = '[' + _fbPrefix + '-' + num + ']';
          _placeholders.push({
          id: 'ref_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          sectionKey: sectionKey,
          chapterPrefix: _fbPrefix,
          fieldKey: 'description',
          inlineMarker: _prefixedMarker,
          _originalMarker: '[' + num + ']',
          authors: 'Citation [' + num + ']',
            year: '',
            title: 'Reference cited as [' + num + '] — needs verification',
            source: '',
            url: '',
            doi: '',
            note: 'Auto-collected from [' + num + '] marker — use "Collect references from text" to enrich',
            accessedDate: new Date().toISOString().slice(0, 10),
            addedBy: 'ai' as const,
            urlVerified: undefined,
          });
        });
        _extractedRefs = _placeholders;
      }
    }
  }

  // ═══ STEP 6: Dedup + Merge into newData.references ═══
  if (_extractedRefs.length > 0) {
    var _deduped: any[] = [];
    for (var _eri = 0; _eri < _extractedRefs.length; _eri++) {
      var _newRef = _extractedRefs[_eri];
      var _sameSecRefs = _currentRefs.filter(function(r: any) { return r.sectionKey === _newRef.sectionKey; });
      if (!_refExists(_sameSecRefs, _newRef) && !_refExists(_deduped, _newRef)) {
        _deduped.push(_newRef);
      }
    }
    if (_deduped.length > 0) {
      newData.references = _currentRefs.concat(_deduped);
      console.log('[EO-100] Merged ' + _deduped.length + ' refs for "' + sectionKey + '" (total: ' + newData.references.length + ')');

      // ═══ STEP 7: v7.26 — Replace original markers with global markers ═══ 
      var _fixTarget = newData[sectionKey];
      if (_fixTarget && typeof _fixTarget === 'object') {
        var _fixJson = JSON.stringify(_fixTarget);
        var _replacedCount = 0;
        for (var _fri = 0; _fri < _deduped.length; _fri++) {
          var _fr = _deduped[_fri];
          if (_fr._originalMarker && _fr._originalMarker !== _fr.inlineMarker) {
            _fixJson = _fixJson.split(_fr._originalMarker).join(_fr.inlineMarker);
            _replacedCount++;
          }
        }
        if (_replacedCount > 0) {
          newData[sectionKey] = JSON.parse(_fixJson);
          console.log('[EO-100/v7.26] Replaced ' + _replacedCount + ' markers in "' + sectionKey + '"');
        }
      }

      // ═══ STEP 8: EO-083 — URL verification via Edge Function (async, non-blocking) ═══
      if (!_opts.skipVerification && _opts.setProjectData) {
        try {
          console.log('[EO-100/EO-083] Starting URL verification for ' + _deduped.length + ' refs in "' + sectionKey + '"...');
          var _spd = _opts.setProjectData;
          verifyReferencesBatch(_deduped).then(function(verResults) {
            if (verResults && verResults.length > 0) {
              var verifiedRefs = applyVerificationResults(_deduped, verResults);
              var verifiedCount = verResults.filter(function(v) { return v.urlVerified; }).length;
              console.log('[EO-100/EO-083] URL verification for "' + sectionKey + '": ' + verifiedCount + '/' + verResults.length + ' verified');
              _spd(function(prev: any) {
                var updatedRefs = (prev.references || []).map(function(existingRef: any) {
                  var match = verifiedRefs.find(function(vr: any) { return vr.id === existingRef.id; });
                  return match || existingRef;
                });
                return { ...prev, references: updatedRefs };
              });
            }
          }).catch(function(verErr: any) {
            console.warn('[EO-100/EO-083] URL verification failed (non-fatal):', verErr?.message || verErr);
          });
        } catch (_verErr) {
          console.warn('[EO-100/EO-083] URL verification init failed (non-fatal):', _verErr);
        }
      }

      // ═══ STEP 9: EO-084 — Enrich refs with approved source IDs ═══
      if (_opts.approvedSources && _opts.approvedSources.length > 0) {
        newData.references = enrichReferencesWithSourceIds(newData.references, _opts.approvedSources);
        console.log('[EO-100/EO-084] Enriched refs with sourceId from approved pool for "' + sectionKey + '"');
      }

      return { cleanData: generatedData, refsAdded: _deduped.length, extractedRefs: _deduped };
    }
  }
  return { cleanData: generatedData, refsAdded: 0, extractedRefs: [] };
}

function getPrettyName(sectionKey: string, lang: 'en' | 'si'): string {
  var entry = SECTION_PRETTY_NAMES[sectionKey];
  if (entry) return entry[lang] || entry.en || sectionKey;
  return sectionKey.replace(/([A-Z])/g, ' $1').replace(/^./, function(s) { return s.toUpperCase(); });
}


// ★ v7.7: Helper — smart merge array: don't overwrite existing content with empty AI items
function _smartMergeArray(existingArr: any[], newArr: any[], sectionKey: string): any[] {
  var newHasContent = _arrayHasRealContent(newArr);
  var existingHasContent = _arrayHasRealContent(existingArr);

  if (newHasContent) {
    if (newArr.length >= existingArr.length) {
      // AI returned same or more items — use new data
      return newArr;
    }
    // AI returned fewer items — merge: use new where it has content, keep existing otherwise
    var merged: any[] = [];
    for (var mi = 0; mi < Math.max(newArr.length, existingArr.length); mi++) {
      if (mi < newArr.length && _arrayItemHasContent(newArr[mi])) {
        merged.push(newArr[mi]);
      } else if (mi < existingArr.length) {
        merged.push(existingArr[mi]);
      } else if (mi < newArr.length) {
        merged.push(newArr[mi]);
      }
    }
    console.log('[v7.7 SMART MERGE ARRAY] "' + sectionKey + '": merged ' + newArr.length + ' new + kept extras from ' + existingArr.length + ' existing');
    return merged;
  }

  // New array has NO real content — keep existing
  if (existingHasContent) {
    console.log('[v7.7 SMART MERGE ARRAY] keeping existing "' + sectionKey + '" (' + existingArr.length + ' items) — AI returned empty array');
    return existingArr;
  }

  // Both empty — use new
  return newArr;
}

// ★ v7.14 EO-047: Strip markdown formatting from AI-generated structured data
// Gemini sometimes inserts **bold**, ## headings, `code`, bullet lists into JSON string fields.
// This causes FATAL validation errors. We strip markdown BEFORE validation, AFTER AI response parsing.
function _stripMarkdownFromObject(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    return obj
      .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/```(?:json|typescript|javascript|python|html|css|xml|bash|sh|sql|text|plaintext|markdown|md|ya?ml|toml|ini|diff|log|csv)?\s*\n[\s\S]*?\n\s*```/g, '')
      .trim();
  }
  if (Array.isArray(obj)) {
    return obj.map(function(item) { return _stripMarkdownFromObject(item); });
  }
  if (typeof obj === 'object') {
    var result: any = {};
    Object.keys(obj).forEach(function(key) {
      result[key] = _stripMarkdownFromObject(obj[key]);
    });
    return result;
  }
  return obj;
}

// ★ v7.25: Detect bare numeric citation markers without short attribution
function _extractAllTextForCitationCheck(obj: any): string {
  var chunks: string[] = [];
  var walk = function(v: any) {
    if (typeof v === 'string' && v.trim().length > 0) {
      chunks.push(v);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  };
  walk(obj);
  return chunks.join(' \n ');
}

function _hasBareNumericCitations(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  var barePattern = /(^|[\s(,.;:])\[(?:[A-Z]{2,3}-)?\d+\](?=[\s).,;:]|$)/g; // EO-145: also match [SO-1], [PA-2]
  var authorYearPattern = /\(([A-Z\u00C0-\u024F][^)]+?,\s?\d{4})\)\s?\[\d+\]/g;
  return barePattern.test(text) && !authorYearPattern.test(text);
}

function _findBareCitationExamples(text: string, maxItems: number): string[] {
  if (!text || typeof text !== 'string') return [];
  var results: string[] = [];
  var regex = /(.{0,50}\[(?:[A-Z]{2,3}-)?\d+\].{0,50})/g; // EO-145: also match [SO-1], [PA-2]
  var match;
  while ((match = regex.exec(text)) !== null && results.length < maxItems) {
    results.push(match[1].trim());
  }
  return results;
}

// ★ v7.12 EO-045: Build validation context from project data
function _buildValidationContext(projectData: any, language: 'en' | 'si'): ValidationContext {
  var startDate = projectData?.projectIdea?.startDate || '';
  var durationMonths = projectData?.projectIdea?.durationMonths || 24;
  var endDate = projectData?.projectIdea?.endDate || '';
  if (!endDate && startDate) {
    try {
      var d = new Date(startDate + 'T00:00:00Z');
      d.setUTCMonth(d.getUTCMonth() + durationMonths);
      endDate = d.toISOString().slice(0, 10);
    } catch (_e) { /* ignore */ }
  }
  return {
    language: language,
    mode: 'structured',
    projectStart: startDate || undefined,
    projectEnd: endDate || undefined,
    projectDurationMonths: durationMonths,
    strictSemanticMapping: false,
  };
}

// ★ v7.12 EO-045: Sections that skip validation (structural/numeric, not content-based)
var VALIDATION_SKIP_SECTIONS = new Set(['partnerAllocations', 'expectedResults']);
// ★ v7.25: Sections where inline citation format must be checked
var INLINE_CITATION_CHECK_SECTIONS = new Set([
  'problemAnalysis', 'projectIdea', 'coreProblem', 'causes', 'consequences',
  'mainAim', 'stateOfTheArt', 'proposedSolution', 'policies',
  'generalObjectives', 'specificObjectives',
  'outputs', 'outcomes', 'impacts', 'kers',
]);
// ★ v7.13 EO-045b: Filter out empty-field FATALs (these are pre-existing empty fields, not AI errors)
// and format issues into readable text for user display
function _filterValidationIssues(report: any): any {
  var filtered = report.issues.filter(function(issue: any) {
    return issue.code !== 'empty-field';
  });
  var fatalCount = filtered.filter(function(i: any) { return i.severity === 'FATAL'; }).length;
  var highCount = filtered.filter(function(i: any) { return i.severity === 'HIGH'; }).length;
  var mediumCount = filtered.filter(function(i: any) { return i.severity === 'MEDIUM'; }).length;
  return {
    valid: fatalCount === 0,
    fatalCount: fatalCount,
    highCount: highCount,
    mediumCount: mediumCount,
    issues: filtered,
  };
}

function _formatValidationIssues(report: any, maxItems: number, language?: 'en' | 'si'): string {
  var lines: string[] = [];
  var fatals = report.issues.filter(function(i: any) { return i.severity === 'FATAL'; });
  var highs = report.issues.filter(function(i: any) { return i.severity === 'HIGH'; });
  var shown = 0;
  var fatalLabel = language === 'si' ? 'Potrebna dopolnitev' : 'Needs attention';
  var highLabel = language === 'si' ? 'Priporocilo' : 'Recommendation';
  for (var fi = 0; fi < fatals.length && shown < maxItems; fi++) {
    var f = fatals[fi];
    lines.push('\uD83D\uDD27 ' + fatalLabel + ': ' + f.message + (f.suggestion ? ' \u2192 ' + f.suggestion : ''));
    shown++;
  }
  for (var hi = 0; hi < highs.length && shown < maxItems; hi++) {
    var h = highs[hi];
    lines.push('\uD83D\uDCA1 ' + highLabel + ': ' + h.message + (h.suggestion ? ' \u2192 ' + h.suggestion : ''));
    shown++;
  }
  var remaining = report.issues.length - shown;
  if (remaining > 0) {
    lines.push('... + ' + remaining + (language === 'si' ? ' dodatnih predlogov' : ' more items'));
  }
  return lines.join('\n');
}

// ★ v7.17 EO-070 / v7.18 EO-071: Inline citation regex for collecting references from text
// Liberal pattern: supports accented chars, multi-author with &/et al./and, optional [N]
var INLINE_CITATION_REGEX = /\(([A-Za-z\u00C0-\u024F.'&\-/ ]+(?:\s(?:&|et al\.?|and)\s[A-Za-z\u00C0-\u024F.'&\-/ ]+)*),\s?((?:19|20)\d{2})\)(?:\[(\d+)\])?/g;

// ★ v7.18 EO-071: EU legislation regex for collecting EU regulation references
var EU_LEGISLATION_REGEX = /\(((?:Regulation|Directive|Decision|Recommendation|COM|SWD|SEC)\s*\(?(?:EU|EC|EEC)?\)?\s*(?:No\.?\s*)?[\d/]+(?:\/EU|\/EC|\/EEC)?)\)/g;

// ★ v7.17 EO-070: Get next global reference number
function _getNextRefNumber(existingRefs: any[]): number {
  // ★ EO-109: Count actual refs, not max marker number
  // Previous: used max([N]) which grew unbounded across regenerations
  // Now: simply refs.length + 1 — compact numbering without gaps
  return existingRefs.length + 1;
}

// ═══════════════════════════════════════════════════════════════════════
// EO-115: Global reference renumbering — called AFTER composite runner
// ═══════════════════════════════════════════════════════════════════════

const _SECTION_ORDER_FOR_REFS: string[] = [
  'problemAnalysis', 'projectIdea',
  'generalObjectives', 'specificObjectives',
  'projectManagement', 'partners',
  'activities_wp1', 'activities_wp2', 'activities_wp3', 'activities_wp4', 'activities_wp5',
  'activities_wp6', 'activities_wp7', 'activities_wp8', 'activities_wp9', 'activities_wp10',
  'risks',
  'expectedResults_outputs', 'expectedResults_outcomes', 'expectedResults_impacts', 'expectedResults_kers',
  'methodology', 'dissemination', 'sustainability'
];

const _renumberAllReferences = (data: any): void => {
  if (!data?.references || !Array.isArray(data.references) || data.references.length === 0) {
    console.log('[EO-141] No references to renumber');
    return;
  }

  const refs = data.references as any[];

  // Ensure every ref has chapterPrefix
  refs.forEach((ref: any) => {
    if (!ref.chapterPrefix) {
      ref.chapterPrefix = _getChapterPrefix(ref.sectionKey || '');
    }
  });

  // Group by chapterPrefix
  const byChapter: Record<string, any[]> = {};
  refs.forEach((ref: any) => {
    const p = ref.chapterPrefix;
    if (!byChapter[p]) byChapter[p] = [];
    byChapter[p].push(ref);
  });

  // Chapter display order (matches _SECTION_ORDER_FOR_REFS logic)
  const CHAPTER_ORDER = ['PA','PI','GO','SO','PM','PT','AC','ER','RS','RF'];

  // Build old→new marker map, sorted per-chapter
  const markerMap: Array<{ old: string; new: string; placeholder: string }> = [];
  let placeholderIdx = 0;

  for (const prefix of CHAPTER_ORDER) {
    const chRefs = byChapter[prefix];
    if (!chRefs || chRefs.length === 0) continue;

    // Sort within chapter by current numeric part of inlineMarker
    chRefs.sort((a: any, b: any) => {
      const aNum = parseInt(String(a.inlineMarker || '').replace(/\D/g, ''), 10) || 0;
      const bNum = parseInt(String(b.inlineMarker || '').replace(/\D/g, ''), 10) || 0;
      return aNum - bNum;
    });

    chRefs.forEach((ref: any, idx: number) => {
      const oldMarker = ref.inlineMarker;
      const newMarker = `[${prefix}-${idx + 1}]`;
      if (oldMarker && oldMarker !== newMarker) {
        markerMap.push({
          old: oldMarker,
          new: newMarker,
          placeholder: `__RN${placeholderIdx++}__`
        });
      }
      ref.inlineMarker = newMarker;
    });
  }

  // Also process any unknown prefix chapters
  for (const [prefix, chRefs] of Object.entries(byChapter)) {
    if (CHAPTER_ORDER.includes(prefix)) continue;
    (chRefs as any[]).forEach((ref: any, idx: number) => {
      const oldMarker = ref.inlineMarker;
      const newMarker = `[${prefix}-${idx + 1}]`;
      if (oldMarker && oldMarker !== newMarker) {
        markerMap.push({ old: oldMarker, new: newMarker, placeholder: `__RN${placeholderIdx++}__` });
      }
      ref.inlineMarker = newMarker;
    });
  }

  if (markerMap.length === 0) {
    console.log('[EO-141] All references already correctly prefixed — no renumbering needed');
    data.references = refs;
    return;
  }

  console.log('[EO-141] Renumbering ' + markerMap.length + ' markers across chapters: ' +
    Object.entries(byChapter).map(([p, r]) => `${p}:${(r as any[]).length}`).join(', '));

  // Phase 1: Serialize
  let fullJson = JSON.stringify(data);

  // Phase 2: Old → placeholder (descending by old marker length to avoid substring collisions)
  const sortedMap = [...markerMap].sort((a, b) => b.old.length - a.old.length);
  for (const entry of sortedMap) {
    const escaped = entry.old.replace(/[[\]\-]/g, '\\$&');
    fullJson = fullJson.replace(new RegExp(escaped, 'g'), entry.placeholder);
  }

  // Phase 3: Placeholder → new prefixed marker
  for (const entry of markerMap) {
    const escapedPh = entry.placeholder.replace(/[_]/g, '\\_');
    fullJson = fullJson.split(entry.placeholder).join(entry.new);
  }

  // Phase 3b: Ghost marker cleanup — remove orphan [N] (legacy) or [XX-N] (prefixed) markers
  // A ghost is any [XX-N] where no ref.inlineMarker matches it
  const validMarkers = new Set(refs.map((r: any) => r.inlineMarker));
  // Also keep old [N] markers that survived (migration may not be complete)
  fullJson = fullJson.replace(/\s*\([^)]{2,80}\)\s*\[([A-Z]{2,3}-\d+|\d+)\]|\[([A-Z]{2,3}-\d+|\d+)\]/g, (match, m1, m2) => {
    const marker = '[' + (m1 || m2) + ']';
    if (!validMarkers.has(marker)) {
      console.log('[EO-141] Removed ghost marker ' + marker + ' (no backing reference)');
      return '';
    }
    return match;
  });

  // Phase 4: Parse back
  try {
    const renumbered = JSON.parse(fullJson);
    for (const key of Object.keys(renumbered)) {
      if (key !== 'references') data[key] = renumbered[key];
    }
    data.references = refs;
    console.log('[EO-141] ✅ Renumbered ' + refs.length + ' references across ' + Object.keys(byChapter).length + ' chapters');
  } catch (e) {
    console.error('[EO-141] ❌ Renumbering JSON.parse failed — keeping original order', e);
  }
};

// ═══════════════════════════════════════════════════════════════════════
// EO-131: Post-renumber async URL verification — fire-and-forget
// Runs AFTER renumbering and save. Updates ONLY urlVerified + verificationStatus.
// NEVER overwrites inlineMarker, title, authors, or any other ref field.
// Throttled to 3 concurrent checks, 5s timeout per URL (via Edge Function).
// ═══════════════════════════════════════════════════════════════════════

function _verifyUrlsAfterSave(
  savedRefs: any[],
  setProjectDataFn: (fn: any) => void,
  currentProjectId: string | null,
  language: string,
  storageServiceRef: any
): void {
  if (!savedRefs || savedRefs.length === 0) return;
  const toVerify = savedRefs.filter((r: any) => r.url && r.url.trim().length > 5);
  if (toVerify.length === 0) return;

  console.log('[EO-131] Starting async URL verification for ' + toVerify.length + ' refs (fire-and-forget)...');

  verifyReferencesBatch(toVerify).then(function(verResults: any[]) {
    if (!verResults || verResults.length === 0) return;
    const verifiedCount = verResults.filter((v: any) => v.urlVerified).length;
    const brokenCount = verResults.filter((v: any) => v.verificationStatus === 'broken' || v.verificationStatus === 'not-found').length;
    console.log('[EO-131] URL verification complete: ' + verifiedCount + ' verified, ' + brokenCount + ' broken, ' + verResults.length + ' total');

    // Update ONLY urlVerified + verificationStatus + verificationMethod — NEVER inlineMarker or other fields
    setProjectDataFn(function(prev: any) {
      if (!Array.isArray(prev.references)) return prev;
      const updatedRefs = prev.references.map(function(existingRef: any) {
        const result = verResults.find(function(vr: any) { return vr.id === existingRef.id; });
        if (!result) return existingRef;
        // Merge ONLY verification fields — preserve inlineMarker, title, authors, url, doi, sectionKey, etc.
        return {
          ...existingRef,
          urlVerified: result.urlVerified,
          verificationStatus: result.verificationStatus,
          verificationMethod: result.verificationMethod || existingRef.verificationMethod,
          resolvedUrl: result.resolvedUrl || existingRef.resolvedUrl,
          metadataVerified: result.metadataVerified ?? existingRef.metadataVerified,
        };
      });
      const updatedData = { ...prev, references: updatedRefs };
      if (currentProjectId && storageServiceRef) {
        storageServiceRef.saveProject(updatedData, language, currentProjectId)
          .catch((e: any) => console.warn('[EO-131] Save after URL verification failed (non-fatal):', e?.message));
      }
      return updatedData;
    });
  }).catch(function(err: any) {
    console.warn('[EO-131] URL verification failed (non-fatal):', err?.message || err);
  });
}

// ★ v7.17 EO-070: Check if a reference already exists (by url OR title+year)
function _refExists(existingRefs: any[], ref: any): boolean {
  for (var ri = 0; ri < existingRefs.length; ri++) {
    var er = existingRefs[ri];
    if (ref.url && ref.url.length > 5 && er.url === ref.url) return true;
    if (ref.title && ref.year && er.title === ref.title && String(er.year) === String(ref.year)) return true;
  }
  return false;
}

// ★ v7.17 EO-070: Extract _references from AI response and remove from section data
function _extractAndRemoveReferences(generatedData: any, sectionKey: string): { cleanData: any; refs: any[] } {
  if (!generatedData || typeof generatedData !== 'object') {
    return { cleanData: generatedData, refs: [] };
  }
  var refs: any[] = [];
  if (Array.isArray(generatedData._references)) {
    refs = generatedData._references;
    console.log('[EO-070] Extracted ' + refs.length + ' _references from AI response for "' + sectionKey + '"');
  }
  // Remove _references from section data before saving
  if ('_references' in generatedData) {
    var cleanData = Object.assign({}, generatedData);
    delete cleanData._references;
    return { cleanData: cleanData, refs: refs };
  }
  return { cleanData: generatedData, refs: refs };
}

// ★ v7.17 EO-070: Convert AI _references entries to full Reference objects
// ★ EO-141: Uses per-chapter prefix format [XX-N] instead of global sequential [N]
function _convertAiRefsToReferences(aiRefs: any[], sectionKey: string, existingRefs: any[]): any[] {
  var result: any[] = [];
  var _cvPrefix = _getChapterPrefix(sectionKey);
  // Count existing refs for this chapter prefix to determine next number
  var _existingPrefixCount = existingRefs.filter(function(r: any) {
    return (r.chapterPrefix || _getChapterPrefix(r.sectionKey || '')) === _cvPrefix;
  }).length;
  var nextChapterNum = _existingPrefixCount + 1;

  for (var i = 0; i < aiRefs.length; i++) {
    var ar = aiRefs[i];
    if (!ar || !ar.title) continue;
    if (!ar.authors) ar.authors = ar.source || 'Unknown author';
    // ★ EO-112b: Filter Gemini grounding API redirect URLs
    if (ar.url && (ar.url.includes('vertexaisearch.cloud.google.com') || ar.url.includes('grounding-api-redirect'))) {
      console.warn('[EO-112b] Filtered vertexaisearch redirect URL for: ' + (ar.title || '').substring(0, 50));
      ar.url = '';
    }

    // Dedup only within SAME sectionKey
    var _isDupInResult = _refExists(result, ar);
    var _isDupInSameSection = false;
    for (var _dri = 0; _dri < existingRefs.length; _dri++) {
      var _er = existingRefs[_dri];
      if (!_er.sectionKey || _er.sectionKey !== sectionKey) continue;
      if (ar.url && ar.url.length > 5 && _er.url === ar.url) { _isDupInSameSection = true; break; }
      if (ar.title && ar.year && _er.title === ar.title && String(_er.year) === String(ar.year)) { _isDupInSameSection = true; break; }
    }
    if (_isDupInSameSection || _isDupInResult) continue;

    var _aiMarker = (ar.inlineMarker && ar.inlineMarker.trim()) ? ar.inlineMarker.trim() : '';
    // EO-141: Use prefixed marker [XX-N]
    var marker = '[' + _cvPrefix + '-' + nextChapterNum + ']';
    result.push({
      id: 'ref_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      fieldKey: 'description',
      inlineMarker: marker,
      chapterPrefix: _cvPrefix,
      _originalMarker: _aiMarker || marker,
      authors: ar.authors || '',
      year: ar.year || '',
      title: ar.title || '',
      source: ar.source || '',
      url: ar.url || '',
      doi: ar.doi || '',
      note: '',
      accessedDate: new Date().toISOString().slice(0, 10),
      addedBy: 'ai' as const,
      urlVerified: undefined,
      sectionKey: sectionKey,
    });
    nextChapterNum++;
  }
  return result;
}
// ★ v7.17 EO-070: Collect references from a single section's text by parsing inline citations
export function collectReferencesFromSection(sectionKey: string, sectionData: any): any[] {
  var refs: any[] = [];
  var texts: string[] = [];
  // Gather all text from section data
  if (typeof sectionData === 'string') {
    texts.push(sectionData);
  } else if (sectionData && typeof sectionData === 'object') {
    var _walk = function(obj: any) {
      if (typeof obj === 'string' && obj.length > 10) texts.push(obj);
      else if (Array.isArray(obj)) obj.forEach(function(item: any) { _walk(item); });
      else if (obj && typeof obj === 'object') Object.values(obj).forEach(function(v: any) { _walk(v); });
    };
    _walk(sectionData);
  }
  var fullText = texts.join('\n');
  var match;
  var seen = new Set<string>();
  INLINE_CITATION_REGEX.lastIndex = 0;
  while ((match = INLINE_CITATION_REGEX.exec(fullText)) !== null) {
    var authors = match[1].trim();
    var year = match[2];
    var key = authors + '|' + year;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({
      id: 'ref_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      sectionKey: sectionKey,
      chapterPrefix: _getChapterPrefix(sectionKey),  // EO-146: Add chapter prefix
      fieldKey: 'description',
      inlineMarker: '',  // Will be assigned by handleCollectFromSection in App.tsx
      authors: authors,
      year: year,
      title: '',
      source: '',
      url: '',
      doi: '',
      note: 'Needs verification — collected from text via regex',
      accessedDate: new Date().toISOString().slice(0, 10),
      addedBy: 'manual' as const,
    });
  }
  // ★ v7.18 EO-071: Also match EU legislation references
  EU_LEGISLATION_REGEX.lastIndex = 0;
  var euMatch;
  while ((euMatch = EU_LEGISLATION_REGEX.exec(fullText)) !== null) {
    var euRef = euMatch[1].trim();
    var euKey = 'EU|' + euRef;
    if (seen.has(euKey)) continue;
    seen.add(euKey);
    refs.push({
      id: 'ref_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      sectionKey: sectionKey,
      chapterPrefix: _getChapterPrefix(sectionKey),  // EO-146: Add chapter prefix
      fieldKey: 'description',
      inlineMarker: '',  // Will be assigned by handleCollectFromSection in App.tsx
      authors: 'European Union',
      year: '',
      title: euRef,
      source: 'Official Journal of the European Union',
      url: '',
      doi: '',
      note: 'Needs verification — collected from text via regex',
      accessedDate: new Date().toISOString().slice(0, 10),
      addedBy: 'manual' as const,
    });
  }
  return refs;
}

// EO-147: Retroactive Reference Injection — inject citations into existing text
export async function injectReferencesToText(
  sectionKey: string,
  sectionData: any,
  projectData: any,
  language: 'en' | 'si',
  overrideRefs?: any[]  // EO-147e: caller can pass pre-cleaned refs to avoid race condition
): Promise<{ updatedSectionData: any; newRefs: any[] }> {
  const { generateSectionContent: genRaw } = await import('../services/geminiService.ts');
  const chapterPrefix = _getChapterPrefix(sectionKey);
  // EO-147e: Use overrideRefs if provided (caller pre-cleaned), otherwise clean from projectData
  const baseRefs = overrideRefs !== undefined
    ? overrideRefs
    : Array.isArray(projectData.references) ? projectData.references : [];
  const cleanedRefs = baseRefs.filter((ref: any) => !ref.sectionKey || ref.sectionKey !== sectionKey);
  const removedCount = baseRefs.length - cleanedRefs.length;
  if (removedCount > 0) {
    console.log('[EO-147e] injectReferencesToText: safety-cleaned ' + removedCount + ' old refs for "' + sectionKey + '"');
  }
  const existingChapterRefs = cleanedRefs.filter((r: any) => r.chapterPrefix === chapterPrefix);
  const nextNum = existingChapterRefs.length + 1;

  const sectionJson = JSON.stringify(sectionData);
  const prompt = [
    'You are a scientific editor. Below is the existing content of section "' + sectionKey + '" of a EU funding project proposal.',
    'DO NOT change the content, meaning, structure, or order of any sentences.',
    'ADD inline citations in format (Author/Institution, Year) [' + nextNum + '], [' + (nextNum + 1) + '] etc. at the END of sentences that make empirical, legal, statistical, or comparative claims.',
    'Aim for 1-3 citations per paragraph. DO NOT cite project decisions, goals, or purely descriptive technical text.',
    'For each citation, include a _references array entry with: authors, year, title, source, url, doi.',
    'Return ONLY valid JSON: the same structure as the input but with citations added in string fields, plus a top-level _references array.',
    'EXISTING SECTION DATA (JSON):',
    sectionJson,
  ].join('\n');

  let result: any;
  try {
    result = await genRaw(
      sectionKey as any,
      { ...projectData, _customPromptOverride: prompt },
      language,
      'regenerate',
      null
    );
  } catch (e: any) {
    console.warn('[EO-147] injectReferencesToText AI call failed:', e?.message || e);
    return { updatedSectionData: sectionData, newRefs: [] };
  }

  if (!result || typeof result !== 'object') {
    return { updatedSectionData: sectionData, newRefs: [] };
  }

  // Run reference pipeline to convert [N] → [XX-N] and extract refs (EO-147d: uses cleanedRefs — no old section refs)
  const pipelineData: any = { references: [...cleanedRefs] };
  const pipelineResult = _runFullReferencePipeline(sectionKey, result, pipelineData, { skipVerification: true });
  const cleanData = pipelineResult.cleanData;
  const newRefs = pipelineResult.extractedRefs || [];

  console.log('[EO-147] injectReferencesToText: ' + newRefs.length + ' refs injected into ' + sectionKey + ' with prefix [' + chapterPrefix + '-N]');
  return { updatedSectionData: cleanData, newRefs };
}

// ★ v7.19 EO-072: Enrich collected references with AI — fill title, source, URL, DOI
export async function enrichReferencesWithAI(
  refs: any[],
  projectData: any,
  language: 'en' | 'si'
): Promise<any[]> {
  if (refs.length === 0) return refs;

  // Build a prompt asking AI to fill in missing details for each reference
  var refList = refs.map(function(r: any) {
    return {
      authors: r.authors || '',
      year: r.year || '',
      sectionKey: r.sectionKey || '',
      inlineMarker: r.inlineMarker || '',
    };
  });

  var prompt = 'You are an academic reference librarian. You MUST use web search for EVERY citation.\n\n'
    + 'TASK: For each of the following inline citations extracted from an EU project proposal, '
    + 'USE WEB SEARCH to find the REAL publication details: full title, source/journal, URL, and DOI.\n\n'
    + 'SEARCH-FIRST RULE: Do NOT guess or infer. SEARCH for each citation, verify it exists, and populate fields from search results.\n\n'
    + 'IMPORTANT: If web search is available to you, USE IT for EVERY citation to verify the source and find the real URL.\n\n'
    + 'CITATIONS TO ENRICH:\n' + JSON.stringify(refList, null, 2) + '\n\n'
    + 'OUTPUT FORMAT — strict JSON array, no markdown, no explanation:\n'
    + '[\n'
    + '  {\n'
    + '    "authors": "Full author names from search results",\n'
    + '    "year": 2023,\n'
    + '    "title": "Exact title from search — use __NOT_FOUND__ if search yields no result",\n'
    + '    "source": "Real journal/institution from search — use __NOT_FOUND__ if search yields no result",\n'
    + '    "url": "Real URL found via search — use __NOT_FOUND__ if not found",\n'
    + '    "doi": "DOI if found via search",\n'
    + '    "sectionKey": "original sectionKey"\n'
    + '  }\n'
    + ']\n\n'
    + 'RULES:\n'
    + '- Return EXACTLY ' + refs.length + ' entries, one per citation, in the same order.\n'
    + '- USE WEB SEARCH for every citation before populating fields.\n'
    + '- If search finds the publication, populate all fields with real data from search results.\n'
    + '- If search finds NO matching publication, set title, source, and url to "__NOT_FOUND__".\n'
    + '- For DOI-based URLs: use https://doi.org/<DOI>.\n'
    + '- For Eurostat: use https://ec.europa.eu/eurostat/databrowser/view/... pattern.\n'
    + '- For EU Commission reports: use https://data.europa.eu/ or official EC links.\n'
    + '- NEVER use placeholder text like "Unknown", "Not available", "details pending".\n';

  try {
    var { generateSectionContent: genRaw } = await import('../services/geminiService.ts');
    var result = await genRaw(
      'problemAnalysis',
      { ...projectData, _customPromptOverride: prompt },
      language,
      'regenerate',
      null
    );

    if (Array.isArray(result) && result.length > 0) {
      // Merge AI-enriched data back into original refs
      for (var i = 0; i < refs.length && i < result.length; i++) {
        var enriched = result[i];
        if (enriched && typeof enriched === 'object') {
          // ★ EO-073: Skip __NOT_FOUND__ entries — mark as unverified instead
          var isNotFound = (enriched.title === '__NOT_FOUND__' || enriched.url === '__NOT_FOUND__' || enriched.source === '__NOT_FOUND__');
          if (isNotFound) {
            refs[i].note = 'UNVERIFIED — AI could not find this publication via web search';
            console.warn('[EO-073] enrichReferencesWithAI: citation not found — ' + refs[i].authors + ' (' + refs[i].year + ')');
            continue;
          }
          if (enriched.title && enriched.title.trim()) refs[i].title = enriched.title;
          if (enriched.source && enriched.source.trim()) refs[i].source = enriched.source;
          if (enriched.url && enriched.url.trim()) refs[i].url = enriched.url;
          if (enriched.doi && enriched.doi.trim()) refs[i].doi = enriched.doi;
          // ★ v7.22 EO-083: Removed optimistic urlVerified=true here.
          // Real URL verification is now done by the Edge Function after references are extracted.
          // Clear the note since we now have real data
          refs[i].note = '';
        }
      }
      console.log('[EO-073] enrichReferencesWithAI: enriched ' + refs.length + ' references');
    }
  } catch (e: any) {
    console.warn('[EO-073] enrichReferencesWithAI failed — returning original refs:', e.message);
  }

  return refs;
}

// ★ v7.17 EO-070: Collect references from ALL sections in projectData
export function collectReferencesFromText(projectData: any): any[] {
  var allRefs: any[] = [];
  var sectionKeys = [
    'problemAnalysis', 'projectIdea', 'generalObjectives', 'specificObjectives',
    'projectManagement', 'activities', 'outputs', 'outcomes', 'impacts', 'risks', 'kers',
    'methodology', 'impact', 'dissemination',
  ];
  for (var si = 0; si < sectionKeys.length; si++) {
    var sk = sectionKeys[si];
    if (projectData[sk]) {
      var sectionRefs = collectReferencesFromSection(sk, projectData[sk]);
      allRefs = allRefs.concat(sectionRefs);
    }
  }
  // Also handle sub-sections
  if (projectData.projectIdea) {
    var piSubKeys = ['stateOfTheArt', 'proposedSolution', 'mainAim'];
    for (var pi = 0; pi < piSubKeys.length; pi++) {
      var psk = piSubKeys[pi];
      if (projectData.projectIdea[psk]) {
        var subRefs = collectReferencesFromSection(psk, projectData.projectIdea[psk]);
        allRefs = allRefs.concat(subRefs);
      }
    }
  }
  // EO-141: Assign per-chapter prefix numbers instead of global sequential numbers
  const byPfx: Record<string, any[]> = {};
  for (var ri = 0; ri < allRefs.length; ri++) {
    const pfx = _getChapterPrefix(allRefs[ri].sectionKey || '');
    allRefs[ri].chapterPrefix = pfx;
    if (!byPfx[pfx]) byPfx[pfx] = [];
    byPfx[pfx].push(allRefs[ri]);
  }
  for (const [pfx, pfxRefs] of Object.entries(byPfx)) {
    (pfxRefs as any[]).forEach((r: any, idx: number) => {
      r.inlineMarker = '[' + pfx + '-' + (idx + 1) + ']';
    });
  }
  return allRefs;
}

export const useGeneration = ({
  projectData,
  setProjectData,
  language,
  ensureApiKey,
  setIsSettingsOpen,
  setHasUnsavedTranslationChanges,
  handleUpdateData,
  checkSectionHasContent,
  setModalConfig,
  closeModal,
  currentProjectId,
  projectVersions,
  setLanguage,
  setProjectVersions,
}: UseGenerationProps) => {
    const [isLoading, setIsLoading] = useState<boolean | string>(false);
  const [error, setError] = useState<string | null>(null);

  // Summary state
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  // EO-137: Generation progress tracking state
  const [generationProgress, setGenerationProgress] = useState<{
    visible: boolean;
    sectionName: string;
    sectionKey: string;
    phases: import('../components/GenerationProgressModal.tsx').PhaseStatus[];
    startTime: number;
    estimatedTotalMs: number | null;
    subProgress: string;
  } | null>(null);

  // EO-137: Default phases for a standard section generation
  function _makeDefaultPhases(refsEnabled: boolean): import('../components/GenerationProgressModal.tsx').PhaseStatus[] {
    return [
      { id: 'sourceRetrieval', nameEn: 'Searching sources', nameSi: 'Iskanje virov', status: refsEnabled ? 'pending' : 'skipped' },
      { id: 'aiGeneration', nameEn: 'AI generation', nameSi: 'AI generiranje', status: 'pending' },
      { id: 'referenceProcessing', nameEn: 'Processing references', nameSi: 'Obdelava referenc', status: refsEnabled ? 'pending' : 'skipped' },
      { id: 'mergingValidation', nameEn: 'Merging & validation', nameSi: 'Združevanje in validacija', status: 'pending' },
      { id: 'saving', nameEn: 'Saving', nameSi: 'Shranjevanje', status: 'pending' },
      { id: 'urlVerification', nameEn: 'Verifying URLs', nameSi: 'Preverjanje URL-jev', status: refsEnabled ? 'pending' : 'skipped' },
    ];
  }

  // [EO-137b] Phase definitions for Activities composite (5 steps + refs + URL + saving)
  function _makeActivitiesCompositePhases(refsEnabled: boolean): import('../components/GenerationProgressModal.tsx').PhaseStatus[] {
    return [
      { id: 'step1_pm',          nameEn: 'Step 1/5: Project Management',   nameSi: 'Korak 1/5: Upravljanje projekta',   status: 'pending' },
      { id: 'step2_partners',    nameEn: 'Step 2/5: Consortium (Partners)', nameSi: 'Korak 2/5: Konzorcij (Partnerji)', status: 'pending' },
      { id: 'step3_activities',  nameEn: 'Step 3/5: Work Packages',         nameSi: 'Korak 3/5: Delovni sklopi',        status: 'pending' },
      { id: 'step4_allocations', nameEn: 'Step 4/5: Partner Allocations',   nameSi: 'Korak 4/5: Alokacije partnerjev', status: 'pending' },
      { id: 'step5_risks',       nameEn: 'Step 5/5: Risk Management',       nameSi: 'Korak 5/5: Obvladovanje tveganj', status: 'pending' },
      { id: 'referenceProcessing', nameEn: 'Reference renumbering', nameSi: 'Preštevilčenje referenc', status: refsEnabled ? 'pending' as const : 'skipped' as const },
      { id: 'urlVerification',   nameEn: 'Verifying URLs',   nameSi: 'Preverjanje URL-jev',   status: refsEnabled ? 'pending' as const : 'skipped' as const },
      { id: 'saving',            nameEn: 'Saving',           nameSi: 'Shranjevanje',           status: 'pending' },
    ];
  }

  // [EO-137b] Phase definitions for Expected Results composite (N sections + refs + URL + saving)
  function _makeExpectedResultsCompositePhases(sections: string[], refsEnabled: boolean): import('../components/GenerationProgressModal.tsx').PhaseStatus[] {
    const phases: import('../components/GenerationProgressModal.tsx').PhaseStatus[] = sections.map((s, idx) => ({
      id: 'step_' + s,
      nameEn: 'Step ' + (idx + 1) + '/' + sections.length + ': ' + getPrettyName(s, 'en'),
      nameSi: 'Korak ' + (idx + 1) + '/' + sections.length + ': ' + getPrettyName(s, 'si'),
      status: 'pending' as const,
    }));
    phases.push(
      { id: 'referenceProcessing', nameEn: 'Reference renumbering', nameSi: 'Preštevilčenje referenc', status: refsEnabled ? 'pending' as const : 'skipped' as const },
      { id: 'urlVerification',   nameEn: 'Verifying URLs',   nameSi: 'Preverjanje URL-jev',   status: refsEnabled ? 'pending' as const : 'skipped' as const },
      { id: 'saving',            nameEn: 'Saving',           nameSi: 'Shranjevanje',           status: 'pending' as const },
    );
    return phases;
  }

  // EO-137: Update a single phase status
  function _updatePhase(phaseId: string, status: import('../components/GenerationProgressModal.tsx').PhaseStatus['status'], durationMs?: number, error?: string) {    setGenerationProgress(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        phases: prev.phases.map(p =>
          p.id === phaseId ? { ...p, status, ...(durationMs !== undefined ? { durationMs } : {}), ...(error ? { error } : {}) } : p
        ),
      };
    });
  }

  // EO-137: Save phase timings to localStorage for future estimations
  function _savePhaseTimings(sk: string, phases: import('../components/GenerationProgressModal.tsx').PhaseStatus[]) {
    const KEY = 'eo137_phase_timings';
    const MAX = 5;
    try {
      const existing = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (!existing[sk]) existing[sk] = {};
      for (const p of phases) {
        if (p.status === 'completed' && p.durationMs !== undefined) {
          if (!existing[sk][p.id]) existing[sk][p.id] = [];
          existing[sk][p.id].push(p.durationMs);
          if (existing[sk][p.id].length > MAX) existing[sk][p.id] = existing[sk][p.id].slice(-MAX);
        }
      }
      localStorage.setItem(KEY, JSON.stringify(existing));
    } catch (e) { console.warn('[EO-137] Failed to save phase timings:', e); }
  }

  // EO-137: Get estimated total time from localStorage history
  function _getEstimatedTime(sk: string, phases: import('../components/GenerationProgressModal.tsx').PhaseStatus[]): number | null {
    const KEY = 'eo137_phase_timings';
    try {
      const existing = JSON.parse(localStorage.getItem(KEY) || '{}');
      const timings = existing[sk];
      if (!timings) return null;
      let total = 0; let hasData = false;
      for (const p of phases) {
        if (p.status === 'skipped') continue;
        const hist = timings[p.id];
        if (hist && hist.length > 0) {
          total += hist.reduce((s: number, v: number) => s + v, 0) / hist.length;
          hasData = true;
        }
      }
      return hasData ? total : null;
    } catch (e) { return null; }
  }

  // ★ v7.2: Global generation lock
  const isGeneratingRef = useRef(false);
  const sessionCallCountRef = useRef(0);
  // ★ v7.5: AbortController for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  const t = TEXT[language] || TEXT['en'];

  // ★ v7.5: Cancel active generation
  const cancelGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      console.log('[useGeneration] Cancelling active generation...');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isGeneratingRef.current = false;
    setIsLoading(false);
    // [EO-137b-FIX2] Close progress modal on cancel
    setGenerationProgress(prev => prev ? { ...prev, visible: false } : null);
    setError(
      language === 'si'
        ? 'Generiranje preklicano.'
        : 'Generation cancelled.'
    );
    setTimeout(() => setError(null), 3000);
  }, [language]);

  // ★ v7.2: Pre-generation guard
  const preGenerationGuard = useCallback(
    (context: string): boolean => {
      if (isGeneratingRef.current) {
        console.warn(`[useGeneration] Blocked: already generating (${context})`);
        return false;
      }

      const status = getRateLimitStatus();
      if (status.requestsInWindow >= status.maxRequests - 1) {
        const waitSec = Math.ceil(status.windowMs / 1000);
        setModalConfig({
          isOpen: true,
          title: language === 'si' ? 'Preveč zahtevkov' : 'Too Many Requests',
          message: language === 'si'
            ? `V zadnji minuti ste poslali ${status.requestsInWindow} zahtevkov (omejitev: ${status.maxRequests}/min).\n\nPočakajte ~${waitSec} sekund preden nadaljujete, da se izognete blokiranju s strani AI ponudnika.\n\nTa seja: ${sessionCallCountRef.current} AI klicev.`
            : `You've made ${status.requestsInWindow} requests in the last minute (limit: ${status.maxRequests}/min).\n\nPlease wait ~${waitSec} seconds before continuing to avoid being blocked by the AI provider.\n\nThis session: ${sessionCallCountRef.current} AI calls.`,
          confirmText: language === 'si' ? 'V redu' : 'OK',
          secondaryText: '',
          cancelText: '',
          onConfirm: closeModal,
          onSecondary: null,
          onCancel: closeModal,
        });
        return false;
      }

      return true;
    },
    [language, setModalConfig, closeModal]
  );

  // ─── DEEP CONTENT CHECKER ─────────────────────────────────────

  const hasDeepContent = useCallback((data: any): boolean => {
    if (!data) return false;
    if (typeof data === 'string') return data.trim().length > 0;
    if (Array.isArray(data)) {
      return data.length > 0 && data.some((item: any) => hasDeepContent(item));
    }
    if (typeof data === 'object') {
      return Object.values(data).some((v: any) => hasDeepContent(v));
    }
    return false;
  }, []);

  // ─── ROBUST content checker ────────────────────────────────────

  const robustCheckSectionHasContent = useCallback(
    (sectionKey: string): boolean => {
      const section = projectData[sectionKey];
      if (!section) return false;
      return hasDeepContent(section);
    },
    [projectData, hasDeepContent]
  );

  // ─── Check if a section needs generation ───────────────────────

  const sectionNeedsGeneration = useCallback(
    (sectionKey: string): { needsFill: boolean; needsFullGeneration: boolean; emptyIndices: number[] } => {
      const section = projectData[sectionKey];

      if (!section) {
        return { needsFill: false, needsFullGeneration: true, emptyIndices: [] };
      }

      if (Array.isArray(section)) {
        if (section.length === 0) {
          return { needsFill: false, needsFullGeneration: true, emptyIndices: [] };
        }

        const emptyIndices: number[] = [];
        let hasAnyContent = false;

        section.forEach((item: any, index: number) => {
          if (!item || !hasDeepContent(item)) {
            emptyIndices.push(index);
          } else {
        const hasEmptyFields = Object.entries(item).some(([key, val]) => {
              if (key === 'id') return false;
              if (val === undefined || val === null) return true;
              if (typeof val === 'string' && val.trim().length === 0) return true;
              return false;
            });
            const EXPECTED_FIELDS_MAP: Record<string, string[]> = {
              generalObjectives: ['title', 'description', 'indicator'],
              specificObjectives: ['title', 'description', 'indicator'],
              outputs: ['title', 'description', 'indicator'],
              outcomes: ['title', 'description', 'indicator'],
              impacts: ['title', 'description', 'indicator'],
              kers: ['title', 'description', 'exploitationStrategy'],
              risks: ['title', 'description', 'mitigation'],
            };
            const _expectedKeys = EXPECTED_FIELDS_MAP[sectionKey] || [];
            const hasMissingFields = _expectedKeys.length > 0 && _expectedKeys.some(k => !(k in item) || item[k] === undefined || item[k] === null || (typeof item[k] === 'string' && item[k].trim().length === 0));
            if (hasEmptyFields || hasMissingFields) {
              emptyIndices.push(index);
            }
            hasAnyContent = true;
          }
        });

        if (!hasAnyContent) {
          return { needsFill: false, needsFullGeneration: true, emptyIndices: [] };
        }

        if (emptyIndices.length > 0) {
          return { needsFill: true, needsFullGeneration: false, emptyIndices };
        }

        return { needsFill: false, needsFullGeneration: false, emptyIndices: [] };
      }

      if (typeof section === 'object') {
        const hasContent = hasDeepContent(section);
        if (!hasContent) {
          return { needsFill: false, needsFullGeneration: true, emptyIndices: [] };
        }
        const hasEmptyFields = Object.entries(section).some(([_key, val]) => {
          return typeof val === 'string' && val.trim().length === 0;
        });
        if (hasEmptyFields) {
          return { needsFill: true, needsFullGeneration: false, emptyIndices: [] };
        }
        return { needsFill: false, needsFullGeneration: false, emptyIndices: [] };
      }

      return { needsFill: false, needsFullGeneration: false, emptyIndices: [] };
    },
    [projectData, hasDeepContent]
  );

  // ─── Sub-section mapping ───────────────────────────────────────

  const SUB_SECTION_MAP: Record<string, { parent: string; path: string[]; isString?: boolean }> = {
    coreProblem:        { parent: 'problemAnalysis', path: ['problemAnalysis', 'coreProblem'] },
    causes:             { parent: 'problemAnalysis', path: ['problemAnalysis', 'causes'] },
    consequences:       { parent: 'problemAnalysis', path: ['problemAnalysis', 'consequences'] },
    projectTitleAcronym:{ parent: 'projectIdea',     path: ['projectIdea'] },
    mainAim:            { parent: 'projectIdea',     path: ['projectIdea', 'mainAim'], isString: true },
    stateOfTheArt:      { parent: 'projectIdea',     path: ['projectIdea', 'stateOfTheArt'], isString: true },
    proposedSolution:   { parent: 'projectIdea',     path: ['projectIdea', 'proposedSolution'], isString: true },
    readinessLevels:    { parent: 'projectIdea',     path: ['projectIdea', 'readinessLevels'] },
    policies:           { parent: 'projectIdea',     path: ['projectIdea', 'policies'] },
  };

  // ─── Comprehensive error handler ───────────────────────────────

  const handleAIError = useCallback(
    (e: any, context: string = '') => {
      const msg = e.message || e.toString();

      if (e.name === 'AbortError' || msg.includes('abort') || msg.includes('cancelled') || msg.includes('Generation cancelled')) {
        console.log(`[useGeneration] Generation cancelled by user (${context})`);
        return;
      }

      // ★ Log EVERY AI error to DB (except user-initiated cancellations)
      // ★ EO-113: Unified error logging (merged v5.3 duplicate into single call)
      logErrorQuick('useGeneration.AI.' + (context || 'unknown'), e, {
        errorCode: msg.split('|')[0] || 'UNKNOWN',
        provider: msg.split('|')[1] || 'unknown',
        rawMessage: msg,
        sessionCallCount: sessionCallCountRef.current,
      });
      const parts = msg.split('|');
      const errorCode = parts[0] || '';
      const provider = parts[1] || '';
      const providerLabel = provider === 'gemini' ? 'Google Gemini' : provider === 'openrouter' ? 'OpenRouter' : 'AI';

      console.warn(`[AI Error] ${context}: ${errorCode} (${provider})`, e);

      if (msg === 'MISSING_API_KEY' || errorCode === 'MISSING_API_KEY') {
        setModalConfig({
          isOpen: true,
          title: language === 'si' ? 'Manjkajoč API ključ' : 'Missing API Key',
          message: language === 'si'
            ? 'API ključ za AI ponudnika ni nastavljen ali ni veljaven.\n\nOdprite Nastavitve in vnesite veljaven API ključ.'
            : 'The AI provider API key is not set or is invalid.\n\nOpen Settings and enter a valid API key.',
          confirmText: language === 'si' ? 'Odpri nastavitve' : 'Open Settings',
          secondaryText: '',
          cancelText: language === 'si' ? 'Zapri' : 'Close',
          onConfirm: () => { closeModal(); setIsSettingsOpen(true); },
          onSecondary: null,
          onCancel: closeModal,
        });
        return;
      }

      if (errorCode === 'RATE_LIMIT') {
        setModalConfig({
          isOpen: true,
          title: language === 'si' ? 'Omejitev hitrosti dosežena' : 'Rate Limit Reached',
          message: language === 'si'
            ? `${providerLabel} je začasno omejil število zahtevkov.\n\nTo se zgodi pri brezplačnih načrtih (npr. 15 zahtevkov/minuto pri Gemini).\n\nMožne rešitve:\n• Počakajte 1–2 minuti in poskusite ponovno\n• V Nastavitvah zamenjajte na drug model\n• Nadgradite na plačljiv načrt pri ${providerLabel}`
            : `${providerLabel} has temporarily limited the number of requests.\n\nThis happens on free plans (e.g., 15 requests/minute on Gemini).\n\nPossible solutions:\n• Wait 1–2 minutes and try again\n• Switch to a different model in Settings\n• Upgrade to a paid plan with ${providerLabel}`,
          confirmText: language === 'si' ? 'V redu' : 'OK',
          secondaryText: language === 'si' ? 'Odpri nastavitve' : 'Open Settings',
          cancelText: '',
          onConfirm: closeModal,
          onSecondary: () => { closeModal(); setIsSettingsOpen(true); },
          onCancel: closeModal,
        });
        return;
      }

      if (errorCode === 'INSUFFICIENT_CREDITS') {
        setModalConfig({
          isOpen: true,
          title: language === 'si' ? 'Nezadostna sredstva' : 'Insufficient Credits',
          message: language === 'si'
            ? `${providerLabel} nima dovolj sredstev za to zahtevo.\n\nMožne rešitve:\n• Dopolnite kredit pri ${providerLabel}\n• V Nastavitvah izberite cenejši ali brezplačen model\n• Preklopite na drugega AI ponudnika (npr. Gemini ima brezplačen načrt)`
            : `${providerLabel} does not have enough credits for this request.\n\nPossible solutions:\n• Top up credits with ${providerLabel}\n• Choose a cheaper or free model in Settings\n• Switch to another AI provider (e.g., Gemini has a free plan)`,
          confirmText: language === 'si' ? 'Odpri nastavitve' : 'Open Settings',
          secondaryText: '',
          cancelText: language === 'si' ? 'Zapri' : 'Close',
          onConfirm: () => { closeModal(); setIsSettingsOpen(true); },
          onSecondary: null,
          onCancel: closeModal,
        });
        return;
      }

      // EO-125: BAD_REQUEST (HTTP 400) — deterministic client error, no retry possible
      if (errorCode === 'BAD_REQUEST') {
        setModalConfig({
          isOpen: true,
          title: language === 'si' ? 'Napačna zahteva (400)' : 'Bad Request (400)',
          message: language === 'si'
            ? `${providerLabel} je zavrnil zahtevo z napako 400 Bad Request.\n\nTo pomeni da je v naši zahtevi napaka — ponavadi:\n• Neveljavna kombinacija parametrov (npr. google_search + JSON schema)\n• Nepodprt model za to operacijo\n• Napačna struktura zahteve\n\nTo je napaka v aplikaciji — prosimo poizkusite znova ali zamenjajte model v Nastavitvah.`
            : `${providerLabel} rejected the request with a 400 Bad Request error.\n\nThis means there is a problem with our request — usually:\n• Invalid combination of parameters (e.g., google_search + JSON schema)\n• Model not supported for this operation\n• Malformed request structure\n\nThis is an application-level error — please try again or switch models in Settings.`,
          confirmText: language === 'si' ? 'V redu' : 'OK',
          secondaryText: language === 'si' ? 'Odpri nastavitve' : 'Open Settings',
          cancelText: '',
          onConfirm: closeModal,
          onSecondary: () => { closeModal(); setIsSettingsOpen(true); },
          onCancel: closeModal,
        });
        return;
      }

            if (errorCode === 'MODEL_OVERLOADED' || errorCode === 'MODEL_OVERLOADED_FALLBACK') {
        // ★ EO-099: Check if this is a structured fallback signal with model suggestion
        if (e.name === 'ModelOverloadedError' && e.fallbackModel) {
          var _fbModel = e.fallbackModel;
          var _waitMinutes = Math.ceil(e.totalWaitMs / 60000);
          setModalConfig({
            isOpen: true,
            title: language === 'si' ? 'Model preobremenjen — predlagamo zamenjavo' : 'Model Overloaded — Switch Recommended',
            message: language === 'si'
              ? `Model "${e.model}" pri ${providerLabel} je trenutno preobremenjen.\n\nSistem je poskušal ${e.retriesExhausted}-krat v zadnjih ~${_waitMinutes} minutah, ampak strežnik ne odgovarja.\n\n`
                + `To se zgodi zaradi velikega prometa pri AI ponudniku — ni napaka v vaši konfiguraciji.\n\n`
                + `Priporočamo zamenjavo na hitrejši model:\n`
                + `★ ${_fbModel.name}\n\n`
                + `Ta model je na ločeni infrastrukturi in je skoraj vedno dosegljiv. Kakovost je nekoliko nižja, ampak za večino sekcij popolnoma zadostuje.`
              : `The model "${e.model}" at ${providerLabel} is currently overloaded.\n\nThe system retried ${e.retriesExhausted} times over ~${_waitMinutes} minutes, but the server is not responding.\n\n`
                + `This happens due to high traffic at the AI provider — it is not a configuration error.\n\n`
                + `We recommend switching to a faster model:\n`
                + `★ ${_fbModel.name}\n\n`
                + `This model runs on separate infrastructure and is almost always available. Quality is slightly lower but fully sufficient for most sections.`,
            confirmText: language === 'si' ? 'Preklopi na ' + _fbModel.name : 'Switch to ' + _fbModel.name,
            secondaryText: language === 'si' ? 'Počakaj 2 min in poskusi znova' : 'Wait 2 min and retry',
            cancelText: language === 'si' ? 'Prekliči' : 'Cancel',
            onConfirm: function() {
              closeModal();
              // Switch model in settings
              storageService.setCustomModel(_fbModel.id);
              console.log('[EO-099] Switched model to fallback: ' + _fbModel.id);
              // Show confirmation
              setError(
                language === 'si'
                  ? 'Model spremenjen na ' + _fbModel.name + '. Poskusite ponovno.'
                  : 'Model switched to ' + _fbModel.name + '. Please try again.'
              );
              setTimeout(function() { setError(null); }, 5000);
            },
            onSecondary: function() {
              closeModal();
              setError(
                language === 'si'
                  ? 'Čakam 2 minuti... nato poskusite ponovno.'
                  : 'Waiting 2 minutes... then please try again.'
              );
              setTimeout(function() { setError(null); }, 120000);
            },
            onCancel: closeModal,
          });
          return;
        }

        // Fallback: no structured error, show simple modal
        setModalConfig({
          isOpen: true,
          title: language === 'si' ? 'Model začasno nedosegljiv' : 'Model Temporarily Unavailable',
          message: language === 'si'
            ? `Model pri ${providerLabel} je trenutno preobremenjen z visoko obremenitvijo.\n\nTo je začasna težava — model bo kmalu spet dosegljiv.\n\nMožne rešitve:\n• Počakajte 2–5 minut in poskusite ponovno\n• V Nastavitvah zamenjajte na drug model (npr. Gemini 2.5 Flash)`
            : `The model at ${providerLabel} is currently experiencing high demand.\n\nThis is a temporary issue — the model will be available again shortly.\n\nPossible solutions:\n• Wait 2–5 minutes and try again\n• Switch to a different model in Settings (e.g., Gemini 2.5 Flash)`,
          confirmText: language === 'si' ? 'V redu' : 'OK',
          secondaryText: language === 'si' ? 'Odpri nastavitve' : 'Open Settings',
          cancelText: '',
          onConfirm: closeModal,
          onSecondary: () => { closeModal(); setIsSettingsOpen(true); },
          onCancel: closeModal,
        });
        return;
      }

      if (errorCode === 'SERVER_ERROR') {
        setModalConfig({
          isOpen: true,
          title: language === 'si' ? 'Napaka strežnika' : 'Server Error',
          message: language === 'si'
            ? `Strežnik ${providerLabel} je vrnil napako.\n\nTo je običajno začasna težava na strani ponudnika.\n\nMožne rešitve:\n• Poskusite ponovno čez 1–2 minuti\n• Če se napaka ponavlja, zamenjajte model v Nastavitvah`
            : `The ${providerLabel} server returned an error.\n\nThis is usually a temporary issue on the provider's side.\n\nPossible solutions:\n• Try again in 1–2 minutes\n• If the error persists, switch models in Settings`,
          confirmText: language === 'si' ? 'V redu' : 'OK',
          secondaryText: language === 'si' ? 'Odpri nastavitve' : 'Open Settings',
          cancelText: '',
          onConfirm: closeModal,
          onSecondary: () => { closeModal(); setIsSettingsOpen(true); },
          onCancel: closeModal,
        });
        return;
      }

      if (errorCode === 'TIMEOUT') {
        setModalConfig({
          isOpen: true,
          title: language === 'si' ? 'Zahteva je potekla' : 'Request Timed Out',
          message: language === 'si'
            ? `Zahteva do ${providerLabel} je trajala predolgo in je potekla.\n\nTo se lahko zgodi pri velikih sekcijah (npr. aktivnosti z 8+ delovnimi sklopi).\n\nMožne rešitve:\n• Poskusite ponovno — včasih je strežnik le začasno počasen\n• V Nastavitvah izberite hitrejši model (npr. Gemini Flash)`
            : `The request to ${providerLabel} took too long and timed out.\n\nThis can happen with large sections (e.g., activities with 8+ work packages).\n\nPossible solutions:\n• Try again — sometimes the server is just temporarily slow\n• Choose a faster model in Settings (e.g., Gemini Flash)`,
          confirmText: language === 'si' ? 'V redu' : 'OK',
          secondaryText: '',
          cancelText: '',
          onConfirm: closeModal,
          onSecondary: null,
          onCancel: closeModal,
        });
        return;
      }

      if (errorCode === 'NETWORK_ERROR' ||
          msg.includes('fetch') || msg.includes('network') ||
          msg.includes('Failed to fetch') || msg.includes('ERR_')) {
        setModalConfig({
          isOpen: true,
          title: language === 'si' ? 'Omrežna napaka' : 'Network Error',
          message: language === 'si'
            ? 'Ni bilo mogoče vzpostaviti povezave z AI strežnikom.\n\nMožni vzroki:\n• Internetna povezava je prekinjena\n• Požarni zid ali VPN blokira dostop\n• AI strežnik je začasno nedosegljiv\n\nPreverite internetno povezavo in poskusite ponovno.'
            : 'Could not connect to the AI server.\n\nPossible causes:\n• Internet connection is down\n• Firewall or VPN is blocking access\n• AI server is temporarily unreachable\n\nCheck your internet connection and try again.',
          confirmText: language === 'si' ? 'V redu' : 'OK',
          secondaryText: '',
          cancelText: '',
          onConfirm: closeModal,
          onSecondary: null,
          onCancel: closeModal,
        });
        return;
      }

      if (errorCode === 'CONTENT_BLOCKED') {
        setModalConfig({
          isOpen: true,
          title: language === 'si' ? 'Vsebina blokirana' : 'Content Blocked',
          message: language === 'si'
            ? 'AI varnostni filter je blokiral generiranje vsebine.\n\nTo se lahko zgodi, če projektna tema vsebuje občutljive izraze.\n\nMožne rešitve:\n• Preoblikujte opis projekta z manj občutljivimi izrazi\n• Poskusite z drugim AI modelom v Nastavitvah'
            : 'The AI safety filter blocked the content generation.\n\nThis can happen if the project topic contains sensitive terms.\n\nPossible solutions:\n• Rephrase the project description with less sensitive terms\n• Try a different AI model in Settings',
          confirmText: language === 'si' ? 'V redu' : 'OK',
          secondaryText: '',
          cancelText: '',
          onConfirm: closeModal,
          onSecondary: null,
          onCancel: closeModal,
        });
        return;
      }

      if (errorCode === 'CONTEXT_TOO_LONG') {
        setModalConfig({
          isOpen: true,
          title: language === 'si' ? 'Projekt prevelik za model' : 'Project Too Large for Model',
          message: language === 'si'
            ? 'Projektni podatki presegajo kontekstno okno izbranega AI modela.\n\nTo se zgodi pri zelo obsežnih projektih z veliko delovnimi sklopi.\n\nMožne rešitve:\n• V Nastavitvah izberite model z večjim kontekstom (npr. Gemini 2.5 Pro — 1M tokenov)\n• Generirajte posamezne razdelke namesto celotnega projekta'
            : 'The project data exceeds the context window of the selected AI model.\n\nThis happens with very large projects with many work packages.\n\nPossible solutions:\n• Choose a model with a larger context in Settings (e.g., Gemini 2.5 Pro — 1M tokens)\n• Generate individual sections instead of the entire project',
          confirmText: language === 'si' ? 'V redu' : 'OK',
          secondaryText: language === 'si' ? 'Odpri nastavitve' : 'Open Settings',
          cancelText: '',
          onConfirm: closeModal,
          onSecondary: () => { closeModal(); setIsSettingsOpen(true); },
          onCancel: closeModal,
        });
        return;
      }

      if (errorCode === 'INVALID_JSON' ||
          msg.includes('JSON') || msg.includes('Unexpected token') || msg.includes('parse')) {
        setModalConfig({
          isOpen: true,
          title: language === 'si' ? 'Napaka formata odgovora' : 'Response Format Error',
          message: language === 'si'
            ? 'AI je vrnil nepravilen format odgovora (neveljaven JSON).\n\nTo se občasno zgodi — AI modeli niso vedno 100% zanesljivi pri strukturiranih odgovorih.\n\nPoskusite ponovno — naslednji poskus bo verjetno uspešen.'
            : 'The AI returned an invalid response format (invalid JSON).\n\nThis happens occasionally — AI models are not always 100% reliable with structured responses.\n\nPlease try again — the next attempt will likely succeed.',
          confirmText: language === 'si' ? 'V redu' : 'OK',
          secondaryText: '',
          cancelText: '',
          onConfirm: closeModal,
          onSecondary: null,
          onCancel: closeModal,
        });
        return;
      }

      console.error(`[AI Error] Unclassified: ${context}:`, e);
      logErrorQuick('useGeneration.AI.' + context, e, { errorCode, provider });
      setModalConfig({
        isOpen: true,
        title: language === 'si' ? 'Nepričakovana napaka' : 'Unexpected Error',
        message: language === 'si'
          ? `Pri komunikaciji z AI ponudnikom (${providerLabel}) je prišlo do nepričakovane napake.\n\nPodrobnosti: ${msg.substring(0, 200)}\n\nMožne rešitve:\n• Poskusite ponovno čez nekaj sekund\n• Če se napaka ponavlja, zamenjajte model ali ponudnika v Nastavitvah\n• Preverite konzolo brskalnika (F12) za več podrobnosti`
          : `An unexpected error occurred while communicating with the AI provider (${providerLabel}).\n\nDetails: ${msg.substring(0, 200)}\n\nPossible solutions:\n• Try again in a few seconds\n• If the error persists, switch models or providers in Settings\n• Check the browser console (F12) for more details`,
        confirmText: language === 'si' ? 'V redu' : 'OK',
        secondaryText: language === 'si' ? 'Odpri nastavitve' : 'Open Settings',
        cancelText: '',
        onConfirm: closeModal,
        onSecondary: () => { closeModal(); setIsSettingsOpen(true); },
        onCancel: closeModal,
      });
    },
    [language, setIsSettingsOpen, setModalConfig, closeModal]
  );

  // ─── Check other language content ──────────────────────────────

  const checkOtherLanguageHasContent = useCallback(
    async (sectionKey: string): Promise<any | null> => {
      const otherLang = language === 'en' ? 'si' : 'en';

      const checkVersion = (projectVersion: any): any | null => {
        if (!projectVersion) return null;
        const sectionData = projectVersion[sectionKey];
        if (!sectionData) return null;
        if (hasDeepContent(sectionData)) {
          return projectVersion;
        }
        return null;
      };

      const cachedResult = checkVersion(projectVersions[otherLang]);
      if (cachedResult) return cachedResult;

      try {
        const loaded = await storageService.loadProject(otherLang, currentProjectId);
        const loadedResult = checkVersion(loaded);
        if (loadedResult) return loadedResult;
      } catch (e) {
        console.warn('[useGeneration] Could not load other language version:', e);
      }

      return null;
    },
    [language, projectVersions, currentProjectId, hasDeepContent]
  );

  // ─── Perform translation from other language ───────────────────

  const performTranslationFromOther = useCallback(
    async (otherLangData: any) => {
      closeModal();
      setIsLoading(language === 'si' ? 'Prevajanje iz EN...' : 'Translating from SI...');
      setError(null);

      try {
        const { translatedData, stats } = await smartTranslateProject(
          otherLangData,
          language,
          projectData,
          currentProjectId!
        );

        if (stats.failed > 0 && stats.translated === 0) {
          throw new Error('credits');
        }

        setProjectData(translatedData);
        setHasUnsavedTranslationChanges(false);
        await storageService.saveProject(translatedData, language, currentProjectId);

        setProjectVersions((prev) => ({
          ...prev,
          [language]: translatedData,
        }));

        if (stats.failed > 0) {
          setError(
            language === 'si'
              ? `Prevod delno uspel: ${stats.translated}/${stats.changed} polj prevedenih.`
              : `Translation partially done: ${stats.translated}/${stats.changed} fields translated.`
          );
        }
      } catch (e: any) {
        handleAIError(e, 'translateFromOtherLanguage');
      } finally {
        setIsLoading(false);
      }
    },
    [
      language,
      projectData,
      currentProjectId,
      closeModal,
      setProjectData,
      setHasUnsavedTranslationChanges,
      setProjectVersions,
      handleAIError,
    ]
  );

  /**
 * EO-130e: Recursively strip [N] markers from ALL string values
 * and remove _references arrays from any level of the object.
 * Handles: raw strings, arrays, nested objects, deeply nested structures.
 */
function _stripRefsFromObj(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return obj
      .replace(/\[(?:[A-Z]{2,3}-)?(?:\d+)(?:,\s*(?:[A-Z]{2,3}-)?\d+)*\]/g, '')  // EO-145: [1], [SO-1], [PA-2, PA-3], [1, 2]
      .replace(/\s{2,}/g, ' ')               // collapse double-spaces left behind
      .trim();
  }

  if (Array.isArray(obj)) {
    return obj.map((item: any) => _stripRefsFromObj(item));
  }

  if (typeof obj === 'object') {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      if (key === '_references') {
        console.log('[EO-130e] Safety strip: removed _references key');
        continue; // drop _references entirely
      }
      result[key] = _stripRefsFromObj(obj[key]);
    }
    return result;
  }

  return obj; // numbers, booleans — pass through unchanged
}

// ─── EO-138: _recordUsage — accumulate API cost per chapter ────
// Called after every AI generation step. Mutates newData._usage in place.
// _usage key is intentionally NOT removed by _stripRefsFromObj (only _references is removed).
function _recordUsage(
  newData: any,
  sectionKey: string,
  usage: any,
  generationPath: 'single' | 'composite' | 'field',
  isRetry: boolean = false
): void {
  if (!usage || !usage.inputTokens) return;
  const chapterKey = getChapterForSection(sectionKey);
  const cost = calculateApiCost(usage.model || '_default', usage.inputTokens, usage.outputTokens || 0);
  const record = {
    timestamp: new Date().toISOString(),
    provider: usage.provider || 'unknown',
    model: usage.model || 'unknown',
    sectionKey,
    chapterKey,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens || 0,
    totalTokens: usage.totalTokens || (usage.inputTokens + (usage.outputTokens || 0)),
    costUSD: cost.costUSD,
    costEUR: cost.costEUR,
    isRetry,
    generationPath,
  };
  if (!newData._usage) {
    newData._usage = { chapters: {}, grandTotalEUR: 0, grandTotalTokens: 0, usdToEurRate: USD_TO_EUR_RATE };
  }
  if (!newData._usage.chapters[chapterKey]) {
    newData._usage.chapters[chapterKey] = { totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCostEUR: 0, lastModel: '', lastGenerated: '', records: [] };
  }
  const ch = newData._usage.chapters[chapterKey];
  ch.totalCalls += 1;
  ch.totalInputTokens += record.inputTokens;
  ch.totalOutputTokens += record.outputTokens;
  ch.totalCostEUR += record.costEUR;
  ch.lastModel = record.model;
  ch.lastGenerated = record.timestamp;
  ch.records.push(record);
  if (ch.records.length > 50) ch.records = ch.records.slice(-50);
  newData._usage.grandTotalEUR = Object.values(newData._usage.chapters as Record<string, any>)
    .reduce((sum: number, c: any) => sum + c.totalCostEUR, 0);
  newData._usage.grandTotalTokens = Object.values(newData._usage.chapters as Record<string, any>)
    .reduce((sum: number, c: any) => sum + c.totalInputTokens + c.totalOutputTokens, 0);
  console.log(
    '[EO-138] ' + sectionKey + ' (' + chapterKey + '): ' +
    record.inputTokens + ' in + ' + record.outputTokens + ' out = ' +
    record.costEUR.toFixed(6) + ' EUR (' + record.model + '). ' +
    'Chapter total: ' + ch.totalCostEUR.toFixed(4) + ' EUR. ' +
    'Grand: ' + newData._usage.grandTotalEUR.toFixed(4) + ' EUR'
  );
}

// ─── Execute section generation ────────────────────────────────

    const executeGeneration = useCallback(
    async (sectionKey: string, mode: string = 'regenerate', repairInstructions?: string) => {
      if (!preGenerationGuard(sectionKey)) return;

      // EO-141: Migrate legacy [N] refs to prefix format on first generation
      if (Array.isArray(projectData.references) && projectData.references.length > 0) {
        const _migrated = _migrateReferencesToPrefixFormat(projectData);
        if (_migrated) {
          setProjectData((prev: any) => {
            _migrateReferencesToPrefixFormat(prev);
            return { ...prev };
          });
        }
      }

      isGeneratingRef.current = true;
      sessionCallCountRef.current++;

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const signal = abortController.signal;

      closeModal();
      setIsLoading(t.generating + ' ' + getPrettyName(sectionKey, language) + '...');
      setError(null);

      // EO-137: Init progress modal
      const _execSectionName = getPrettyName(sectionKey, language);
      const _execChapterKeyEarly = getChapterForSection(sectionKey);
      const _execRefsEnabledEarly: boolean = projectData._settings?.referencesEnabled?.[_execChapterKeyEarly]
        ?? DEFAULT_REFS_ENABLED[_execChapterKeyEarly]
        ?? false;
      const _initPhases = _makeDefaultPhases(_execRefsEnabledEarly);
      setGenerationProgress({
        visible: true,
        sectionName: _execSectionName,
        sectionKey,
        phases: _initPhases,
        startTime: Date.now(),
        estimatedTotalMs: _getEstimatedTime(sectionKey, _initPhases),
        subProgress: '',
      });

      try {
        let generatedData;

        // EO-130d: Pre-compute refs toggle once for this section (using chapter key)
        const _execChapterKey = getChapterForSection(sectionKey);
        const _execRefsEnabled: boolean = projectData._settings?.referencesEnabled?.[_execChapterKey]
          ?? DEFAULT_REFS_ENABLED[_execChapterKey]
          ?? false;
        console.log('[EO-130d] executeGeneration:', sectionKey, '→ chapter:', _execChapterKey, '→ refsEnabled:', _execRefsEnabled);

        const subMapping = SUB_SECTION_MAP[sectionKey];

        // ★ v7.24 EO-084: Retrieve approved sources for academic-rigor sections
        // Searches CrossRef and OpenAlex BEFORE AI generation, formats pool for prompt injection
        // EO-130e: Skip entirely when refs disabled — saves API calls and tokens
        const APPROVED_SOURCE_SECTIONS = new Set([
          'problemAnalysis', 'projectIdea', 'coreProblem', 'causes', 'consequences',
          'mainAim', 'stateOfTheArt', 'proposedSolution', 'policies',
          'generalObjectives', 'specificObjectives',
          'outputs', 'outcomes', 'impacts', 'kers',
        ]);
        var _approvedSourcesBlock = '';
        var _approvedSources: ApprovedSource[] = [];
        if (!_execRefsEnabled) {
          console.log('[EO-130e] Source retrieval SKIPPED — refs disabled for:', sectionKey, '→ chapter:', _execChapterKey);
          // phase already 'skipped' from _makeDefaultPhases
        } else if (APPROVED_SOURCE_SECTIONS.has(sectionKey)) {
          _updatePhase('sourceRetrieval', 'running');
          const _srcStart = performance.now();
          try {
            var _searchQuery = buildSearchQuery(sectionKey, projectData);
            if (_searchQuery && _searchQuery.length >= 5) {
              console.log('[EO-084] Searching approved sources for "' + sectionKey + '": "' + _searchQuery.substring(0, 80) + '..."');
              _approvedSources = await searchAuthoritativeSources(_searchQuery, sectionKey);
              if (_approvedSources.length > 0) {
                _approvedSourcesBlock = formatApprovedSourcesForPrompt(_approvedSources);
                console.log('[EO-084] Injecting ' + _approvedSources.length + ' approved sources into prompt for "' + sectionKey + '"');
              } else {
                console.log('[EO-084] No approved sources found for "' + sectionKey + '" — falling back to search-first policy');
              }
            } else {
              console.log('[EO-084] Insufficient data to build search query for "' + sectionKey + '"');
            }
          } catch (_srcErr: any) {
            console.warn('[EO-084] Source retrieval failed (non-fatal):', _srcErr?.message || _srcErr);
            // Continue with generation without approved sources — fallback to search-first
          }
          _updatePhase('sourceRetrieval', 'completed', performance.now() - _srcStart);
        }

        // EO-137: AI generation phase
        _updatePhase('aiGeneration', 'running');
        const _aiStart = performance.now();

        if (subMapping) {
          generatedData = await generateSectionContent(
            sectionKey,
            projectData,
            language,
            mode,
            null,
            signal,
            _approvedSourcesBlock || undefined,
            _execRefsEnabled
          );

        } else if (sectionKey === 'partnerAllocations') {
          const pa_partners = Array.isArray(projectData.partners) ? projectData.partners : [];
          const pa_activities = Array.isArray(projectData.activities) ? projectData.activities : [];

          if (pa_partners.length === 0 || pa_activities.length === 0) {
            setModalConfig({
              isOpen: true,
              title: language === 'si' ? 'Manjkajo podatki' : 'Missing Data',
              message: language === 'si'
                ? 'Za generiranje alokacij partnerjev potrebujete definirane partnerje IN delovne pakete z nalogami.\n\nNajprej generirajte partnerje (Konzorcij) in aktivnosti (Delovni načrt).'
                : 'To generate partner allocations you need defined partners AND work packages with tasks.\n\nFirst generate Partners (Consortium) and Activities (Work Plan).',
              confirmText: language === 'si' ? 'V redu' : 'OK',
              secondaryText: '',
              cancelText: '',
              onConfirm: () => closeModal(),
              onSecondary: null,
              onCancel: () => closeModal(),
            });
            setIsLoading(false);
            isGeneratingRef.current = false;
            abortControllerRef.current = null;
            return;
          }

          setIsLoading(
            language === 'si'
              ? 'Generiram alokacije partnerjev na naloge...'
              : 'Generating partner allocations for tasks...'
          );

          const allocResult = await generatePartnerAllocations(
            projectData,
            language,
            (msg: string) => setIsLoading(msg),
            signal
          );

          const updatedActivities = pa_activities.map((wp: any) => ({
            ...wp,
            tasks: (wp.tasks || []).map((task: any) => {
              const taskAlloc = allocResult.find(
                (a: any) => a.taskId === task.id
              );
              if (taskAlloc && Array.isArray(taskAlloc.allocations) && taskAlloc.allocations.length > 0) {
                return {
                  ...task,
                  partnerAllocations: taskAlloc.allocations,
                };
              }
              return task;
            }),
          }));

          const newAllocData = { ...projectData, activities: updatedActivities };
          setProjectData(newAllocData);
          setHasUnsavedTranslationChanges(true);

          const totalAllocations = allocResult.reduce((s: number, t: any) => s + (t.allocations?.length || 0), 0);
          console.log(`[useGeneration] Partner allocations applied: ${totalAllocations} allocations across ${allocResult.length} tasks`);

          setIsLoading(false);
          isGeneratingRef.current = false;
          abortControllerRef.current = null;
          return;

        } else if (sectionKey === 'partners') {
          const existingPartners = projectData.partners || [];

          if (mode === 'regenerate' || existingPartners.length === 0) {
            setIsLoading(
              language === 'si'
                ? 'Generiram konzorcij (partnerji)...'
                : 'Generating consortium (partners)...'
            );
            generatedData = await generateSectionContent(
              'partners',
              projectData,
              language,
              'regenerate',
              null,
              signal,
              undefined,
              _execRefsEnabled
            );
          } else if (mode === 'enhance') {
            setIsLoading(
              language === 'si'
                ? 'Izboljšujem konzorcij...'
                : 'Enhancing consortium...'
            );
            generatedData = await generateSectionContent(
              'partners',
              projectData,
              language,
              'enhance',
              null,
              signal,
              undefined,
              _execRefsEnabled
            );
          } else {
            const needsFill = existingPartners.some((p: any) =>
              !p.name || p.name.trim() === '' || !p.expertise || p.expertise.trim() === '' || !p.pmRate
            );
            if (needsFill) {
              setIsLoading(
                language === 'si'
                  ? 'Dopolnjujem podatke o partnerjih...'
                  : 'Filling partner data...'
              );
              generatedData = await generateSectionContent(
                'partners',
                { ...projectData, partners: existingPartners },
                language,
                'fill',
                null,
                signal,
                undefined,
                _execRefsEnabled
              );
            } else {
              generatedData = existingPartners;
            }
          }

          if (Array.isArray(generatedData)) {
            generatedData = generatedData.map((p: any, idx: number) => ({
              ...p,
              id: p.id || `partner-${idx + 1}`,
              code: p.code || (idx === 0 ? (language === 'si' ? 'KO' : 'CO') : `P${idx + 1}`),
              partnerType: (p.partnerType && isValidPartnerType(p.partnerType))
                ? p.partnerType
                : 'other',
            }));
            console.log(`[useGeneration] Partners post-processed: ${generatedData.length} partners, types: ${generatedData.map((p: any) => p.partnerType).join(', ')}`);
          }

        } else if (sectionKey === 'activities') {
          const existingWPs = projectData.activities || [];
          const emptyWPIndices: number[] = [];

          const hasPMWP = existingWPs.some((wp: any) => {
            const title = (wp.title || '').toLowerCase();
            return title.includes('management') || title.includes('coordination')
              || title.includes('upravljanje') || title.includes('koordinacija');
          });
          const hasDissWP = existingWPs.some((wp: any) => {
            const title = (wp.title || '').toLowerCase();
            return title.includes('dissemination') || title.includes('communication')
              || title.includes('diseminacija') || title.includes('komunikacija');
          });

          const missingPM = !hasPMWP && existingWPs.length > 0;
          const missingDiss = !hasDissWP && existingWPs.length > 0;
          const hasMissingMandatory = missingPM || missingDiss;

          existingWPs.forEach((wp: any, idx: number) => {
            const hasTasks = wp.tasks && Array.isArray(wp.tasks) && wp.tasks.length > 0
              && wp.tasks.some((t: any) => t.title && t.title.trim().length > 0);
            const hasMilestones = wp.milestones && Array.isArray(wp.milestones) && wp.milestones.length > 0;
            const hasDeliverables = wp.deliverables && wp.deliverables.length > 0
              && wp.deliverables.some((d: any) => d.title && d.title.trim().length > 0);
            if (!hasTasks || !hasMilestones || !hasDeliverables) {
              emptyWPIndices.push(idx);
            }
          });

          if (mode === 'regenerate' || existingWPs.length === 0) {
            generatedData = await generateActivitiesPerWP(
              projectData,
              language,
              mode,
              (wpIndex: number, wpTotal: number, wpTitle: string) => {
                if (wpIndex === -1) {
                  setIsLoading(language === 'si' ? 'Generiranje strukture DS...' : 'Generating WP structure...');
                } else {
                  setIsLoading(
                    language === 'si'
                      ? `Generiram DS ${wpIndex + 1}/${wpTotal}: ${wpTitle}...`
                      : `Generating WP ${wpIndex + 1}/${wpTotal}: ${wpTitle}...`
                  );
                }
              },
              undefined,
              undefined,
              signal
            );

          } else if (hasMissingMandatory && mode !== 'enhance') {
            const durationMonths = projectData.projectIdea?.durationMonths || 24;
            const augmentedWPs = [...existingWPs];
            const mandatoryIndicesToGenerate: number[] = [];

            const missingNames: string[] = [];

            if (missingPM) {
              missingNames.push(language === 'si' ? 'Upravljanje projekta' : 'Project Management');

              const wpPfx2 = language === 'si' ? 'DS' : 'WP';
              const pmPlaceholder = {
                id: `${wpPfx2}${augmentedWPs.length + 1}`,
                title: language === 'si' ? 'Upravljanje in koordinacija projekta' : 'Project Management and Coordination',
                startDate: projectData.projectIdea?.startDate || new Date().toISOString().split('T')[0],
                endDate: '',
                startMonth: 1,
                endMonth: durationMonths,
                tasks: [],
                milestones: [],
                deliverables: [],
                leader: '',
                participants: [],
              };
              augmentedWPs.push(pmPlaceholder);
              mandatoryIndicesToGenerate.push(augmentedWPs.length - 1);
            }

            if (missingDiss) {
              missingNames.push(language === 'si' ? 'Diseminacija' : 'Dissemination');

              const dissInsertIdx = missingPM ? augmentedWPs.length - 1 : augmentedWPs.length;
              const dissPlaceholder = {
                id: '',
                title: language === 'si' ? 'Diseminacija, komunikacija in izkoriščanje rezultatov' : 'Dissemination, Communication and Exploitation of Results',
                startDate: projectData.projectIdea?.startDate || new Date().toISOString().split('T')[0],
                endDate: '',
                startMonth: 1,
                endMonth: durationMonths,
                tasks: [],
                milestones: [],
                deliverables: [],
                leader: '',
                participants: [],
              };

              augmentedWPs.splice(dissInsertIdx, 0, dissPlaceholder);

              if (missingPM) {
                mandatoryIndicesToGenerate[mandatoryIndicesToGenerate.length - 1] = augmentedWPs.length - 1;
              }
              mandatoryIndicesToGenerate.push(dissInsertIdx);
            }
            const wpPfx = language === 'si' ? 'DS' : 'WP';
            augmentedWPs.forEach((wp, idx) => {
              wp.id = `${wpPfx}${idx + 1}`;
            });
            console.warn(`[Activities] Adding missing mandatory WPs: ${missingNames.join(', ')} — generating only indices [${mandatoryIndicesToGenerate.join(', ')}]`);

            const finalIndicesToGenerate: number[] = [];
            augmentedWPs.forEach((wp: any, idx: number) => {
              const hasTasks = wp.tasks && Array.isArray(wp.tasks) && wp.tasks.length > 0
                && wp.tasks.some((t: any) => t.title && t.title.trim().length > 0);
              const hasMilestones = wp.milestones && Array.isArray(wp.milestones) && wp.milestones.length > 0;
              const hasDeliverableContent = wp.deliverables && wp.deliverables.length > 0
                && wp.deliverables.some((d: any) => d.title && d.title.trim().length > 0);
              if (!hasTasks || !hasMilestones || !hasDeliverableContent) {
                finalIndicesToGenerate.push(idx);
              }
            });

            generatedData = await generateActivitiesPerWP(
              { ...projectData, activities: augmentedWPs },
              language,
              'fill',
              (wpIndex: number, wpTotal: number, wpTitle: string) => {
                if (wpIndex === -1) {
                  setIsLoading(
                    language === 'si'
                      ? `Dodajam manjkajoče DS (${missingNames.join(' + ')})...`
                      : `Adding missing WPs (${missingNames.join(' + ')})...`
                  );
                } else {
                  setIsLoading(
                    language === 'si'
                      ? `Generiram DS ${wpIndex + 1}/${wpTotal}: ${wpTitle}...`
                      : `Generating WP ${wpIndex + 1}/${wpTotal}: ${wpTitle}...`
                  );
                }
              },
              augmentedWPs,
              finalIndicesToGenerate,
              signal
            );

          } else if (emptyWPIndices.length > 0) {
            generatedData = await generateActivitiesPerWP(
              projectData,
              language,
              'fill',
              (wpIndex: number, wpTotal: number, wpTitle: string) => {
                if (wpIndex === -1) {
                  setIsLoading(
                    language === 'si'
                      ? `Dopolnjujem ${emptyWPIndices.length} nepopolnih DS...`
                      : `Filling ${emptyWPIndices.length} incomplete WPs...`
                  );
                } else {
                  setIsLoading(
                    language === 'si'
                      ? `Dopolnjujem DS ${wpIndex + 1}/${wpTotal}: ${wpTitle}...`
                      : `Filling WP ${wpIndex + 1}/${wpTotal}: ${wpTitle}...`
                  );
                }
              },
              existingWPs,
              emptyWPIndices,
              signal
            );

          } else if (mode === 'enhance') {
            generatedData = await generateSectionContent(
              sectionKey,
              projectData,
              language,
              mode,
              null,
              signal,
              undefined,
              _execRefsEnabled
            );

          } else {
            generatedData = existingWPs;
          }

        } else if (
          mode === 'fill' &&
          ['projectIdea', 'problemAnalysis', 'projectManagement'].includes(sectionKey) &&
          projectData[sectionKey] &&
          typeof projectData[sectionKey] === 'object' &&
          !Array.isArray(projectData[sectionKey])
        ) {
          // ★ v7.7 FIX: Detect ALL empty fields including arrays and nested objects
          var sectionData = projectData[sectionKey];
          var emptyFields: string[] = [];

          // Check top-level string fields
          for (var _efKey of Object.keys(sectionData)) {
            var _efVal = sectionData[_efKey];
            if (typeof _efVal === 'string' && _efVal.trim().length === 0) {
              emptyFields.push(_efKey);
            }
          }

          // Check expected string fields that might be missing entirely
          var expectedFields: Record<string, string[]> = {
            projectIdea: ['projectTitle', 'projectAcronym', 'mainAim', 'stateOfTheArt', 'proposedSolution'],
            problemAnalysis: [],
            projectManagement: ['description'],
          };
          var expected = expectedFields[sectionKey] || [];
          for (var _exf of expected) {
            if (!sectionData[_exf] || (typeof sectionData[_exf] === 'string' && sectionData[_exf].trim().length === 0)) {
              if (!emptyFields.includes(_exf)) {
                emptyFields.push(_exf);
              }
            }
          }

          // ★ v7.7: Check ARRAY sub-fields (causes, consequences, policies, etc.)
          if (sectionKey === 'problemAnalysis') {
            var _paCauses = sectionData.causes;
            if (!_paCauses || !Array.isArray(_paCauses) || _paCauses.length === 0) {
              if (!emptyFields.includes('causes')) emptyFields.push('causes');
            } else {
              var _hasEmptyCause = _paCauses.some(function(c: any) {
                return !c || !c.title || c.title.trim().length === 0 || !c.description || c.description.trim().length === 0;
              });
              if (_hasEmptyCause && !emptyFields.includes('causes')) emptyFields.push('causes');
            }
            var _paConseq = sectionData.consequences;
            if (!_paConseq || !Array.isArray(_paConseq) || _paConseq.length === 0) {
              if (!emptyFields.includes('consequences')) emptyFields.push('consequences');
            } else {
              var _hasEmptyConseq = _paConseq.some(function(c: any) {
                return !c || !c.title || c.title.trim().length === 0 || !c.description || c.description.trim().length === 0;
              });
              if (_hasEmptyConseq && !emptyFields.includes('consequences')) emptyFields.push('consequences');
            }
            var _paCp = sectionData.coreProblem;
            if (!_paCp || !_paCp.title || _paCp.title.trim().length === 0 || !_paCp.description || _paCp.description.trim().length === 0) {
              if (!emptyFields.includes('coreProblem')) emptyFields.push('coreProblem');
            }
          }

          if (sectionKey === 'projectIdea') {
            var rl = sectionData.readinessLevels;
            if (!rl || !rl.TRL || !rl.SRL || !rl.ORL || !rl.LRL) {
              if (!emptyFields.includes('readinessLevels')) {
                emptyFields.push('readinessLevels');
              }
            } else {
              for (var _rlLevel of ['TRL', 'SRL', 'ORL', 'LRL']) {
                if (rl[_rlLevel] && typeof rl[_rlLevel].justification === 'string' && rl[_rlLevel].justification.trim().length === 0) {
                  if (!emptyFields.includes('readinessLevels')) {
                    emptyFields.push('readinessLevels');
                  }
                  break;
                }
              }
            }

            var _piPolicies = sectionData.policies;
            if (!_piPolicies || !Array.isArray(_piPolicies) || _piPolicies.length === 0) {
              if (!emptyFields.includes('policies')) {
                emptyFields.push('policies');
              }
            } else {
              var _hasEmptyPolicy = _piPolicies.some(function(p: any) {
                return !p || !p.name || p.name.trim().length === 0 || !p.description || p.description.trim().length === 0;
              });
              if (_hasEmptyPolicy && !emptyFields.includes('policies')) {
                emptyFields.push('policies');
              }
            }
          }

          // ★ v7.7: Check projectManagement nested structure
          if (sectionKey === 'projectManagement') {
            var _pmStructure = sectionData.structure;
            if (!_pmStructure) {
              if (!emptyFields.includes('structure')) emptyFields.push('structure');
            } else {
              for (var _pmField of ['coordinator', 'steeringCommittee', 'advisoryBoard', 'wpLeaders']) {
                if (!_pmStructure[_pmField] || _pmStructure[_pmField].trim().length === 0) {
                  if (!emptyFields.includes('structure')) emptyFields.push('structure');
                  break;
                }
              }
            }
          }

          console.log('[ObjectFill] v7.7 ' + sectionKey + ': detected empty fields: [' + emptyFields.join(', ') + ']');

          if (emptyFields.length === 0) {
            setModalConfig({
              isOpen: true,
              title: language === 'si' ? 'Vse je izpolnjeno' : 'Everything is filled',
              message: language === 'si'
                ? 'Vsa polja v tem razdelku so že izpolnjena. Če želite izboljšati vsebino, uporabite možnost "Izboljšaj obstoječe".'
                : 'All fields in this section are already filled. To improve content, use the "Enhance existing" option.',
              confirmText: language === 'si' ? 'V redu' : 'OK',
              secondaryText: '',
              cancelText: '',
              onConfirm: () => closeModal(),
              onSecondary: null,
              onCancel: () => closeModal(),
            });
            generatedData = sectionData;
          } else {
            var fieldNames = emptyFields.join(', ');
            console.log('[ObjectFill] ' + sectionKey + ': Empty fields detected: [' + fieldNames + ']');
            setIsLoading(
            language === 'si'
              ? 'Dopolnjujem ' + emptyFields.length + ' praznih polj v ' + getPrettyName(sectionKey, language) + ': ' + fieldNames + '...'
              : 'Filling ' + emptyFields.length + ' empty fields in ' + getPrettyName(sectionKey, language) + ': ' + fieldNames + '...'
          );

            generatedData = await generateObjectFill(
              sectionKey,
              projectData,
              projectData[sectionKey],
              emptyFields,
              language,
              signal
            );

            // EO-142: Normalize policies field names (objectFill path)
            if (sectionKey === 'projectIdea' && generatedData?.policies && Array.isArray(generatedData.policies)) {
              generatedData.policies = generatedData.policies.map((p: any) => ({
                name: p.name || p.title || p.policyName || '',
                description: p.description || p.relevanceDescription || p.alignment || p.alignmentDescription || p.relevance || '',
              }));
              console.log('[EO-142] Normalized', generatedData.policies.length, 'policies — fields mapped to {name, description}');
            }
          }

        } else if (mode === 'fill') {
          const sectionData = projectData[sectionKey];

          if (!sectionData || (Array.isArray(sectionData) && sectionData.length === 0) || !hasDeepContent(sectionData)) {
            console.log(`[SmartFill] ${sectionKey}: No data → full regeneration`);
            setIsLoading(
            language === 'si'
              ? 'Generiram ' + getPrettyName(sectionKey, language) + ' (ni obstoječih podatkov)...'
              : 'Generating ' + getPrettyName(sectionKey, language) + ' (no existing data)...'
          );
            generatedData = await generateSectionContent(
              sectionKey,
              projectData,
              language,
              'regenerate',
              null,
              signal,
              undefined,
              _execRefsEnabled
            );

            // EO-142: Normalize policies field names (fill path — full regeneration)
            if (sectionKey === 'projectIdea' && generatedData?.policies && Array.isArray(generatedData.policies)) {
              generatedData.policies = generatedData.policies.map((p: any) => ({
                name: p.name || p.title || p.policyName || '',
                description: p.description || p.relevanceDescription || p.alignment || p.alignmentDescription || p.relevance || '',
              }));
              console.log('[EO-142] Normalized', generatedData.policies.length, 'policies — fields mapped to {name, description}');
            }

          } else if (Array.isArray(sectionData)) {
            const emptyIndices: number[] = [];
            sectionData.forEach((item: any, index: number) => {
              if (!item || !hasDeepContent(item)) {
                emptyIndices.push(index);
              } else {
            const hasEmptyFields = Object.entries(item).some(([key, val]) => {
              if (key === 'id') return false;
              if (val === undefined || val === null) return true;
              if (typeof val === 'string' && val.trim().length === 0) return true;
              return false;
            });
            const EXPECTED_FIELDS_MAP: Record<string, string[]> = {
              generalObjectives: ['title', 'description', 'indicator'],
              specificObjectives: ['title', 'description', 'indicator'],
              outputs: ['title', 'description', 'indicator'],
              outcomes: ['title', 'description', 'indicator'],
              impacts: ['title', 'description', 'indicator'],
              kers: ['title', 'description', 'exploitationStrategy'],
              risks: ['title', 'description', 'mitigation'],
            };
            const _expectedKeys = EXPECTED_FIELDS_MAP[sectionKey] || [];
            const hasMissingFields = _expectedKeys.length > 0 && _expectedKeys.some(k => !(k in item) || item[k] === undefined || item[k] === null || (typeof item[k] === 'string' && item[k].trim().length === 0));
            if (hasEmptyFields || hasMissingFields) {
              emptyIndices.push(index);
                }
              }
            });

            if (emptyIndices.length === 0) {
              console.log(`[SmartFill] ${sectionKey}: All ${sectionData.length} items complete → nothing to fill`);
              setModalConfig({
                isOpen: true,
                title: language === 'si' ? 'Vse je izpolnjeno' : 'Everything is filled',
                message: language === 'si'
                  ? `Vsi elementi v razdelku "${sectionKey}" so že izpolnjeni. Za izboljšanje vsebine uporabite "Izboljšaj obstoječe".`
                  : `All items in "${sectionKey}" are already filled. To improve content, use "Enhance existing".`,
                confirmText: language === 'si' ? 'V redu' : 'OK',
                secondaryText: '',
                cancelText: '',
                onConfirm: () => closeModal(),
                onSecondary: null,
                onCancel: () => closeModal(),
              });
              generatedData = sectionData;
            } else {
              console.log(`[SmartFill] ${sectionKey}: ${emptyIndices.length} of ${sectionData.length} items need filling at indices [${emptyIndices.join(', ')}]`);
              setIsLoading(
              language === 'si'
                ? 'Dopolnjujem ' + emptyIndices.length + ' od ' + sectionData.length + ' elementov v ' + getPrettyName(sectionKey, language) + '...'
                : 'Filling ' + emptyIndices.length + ' of ' + sectionData.length + ' items in ' + getPrettyName(sectionKey, language) + '...'
            );

              generatedData = await generateTargetedFill(
                sectionKey,
                projectData,
                sectionData,
                language,
                signal
              );
            }

          } else if (typeof sectionData === 'object') {
            const emptyFields: string[] = [];

            if (sectionKey === 'projectIdea') {
              for (const field of ['projectTitle', 'projectAcronym', 'mainAim', 'stateOfTheArt', 'proposedSolution']) {
                const val = sectionData[field];
                if (!val || (typeof val === 'string' && val.trim().length === 0)) {
                  emptyFields.push(field);
                }
              }
              const rl = sectionData.readinessLevels;
              if (!rl || !rl.TRL || !rl.SRL || !rl.ORL || !rl.LRL) {
                emptyFields.push('readinessLevels');
              } else {
                for (const level of ['TRL', 'SRL', 'ORL', 'LRL']) {
                  if (rl[level] && (!rl[level].justification || rl[level].justification.trim().length === 0)) {
                    if (!emptyFields.includes('readinessLevels')) emptyFields.push('readinessLevels');
                    break;
                  }
                }
              }
              const policies = sectionData.policies;
              if (!policies || !Array.isArray(policies) || policies.length === 0) {
                emptyFields.push('policies');
              } else {
                const hasEmptyPolicy = policies.some((p: any) =>
                  !p.name || p.name.trim().length === 0 || !p.description || p.description.trim().length === 0
                );
                if (hasEmptyPolicy && !emptyFields.includes('policies')) {
                  emptyFields.push('policies');
                }
              }

            } else if (sectionKey === 'problemAnalysis') {
              const cp = sectionData.coreProblem;
              if (!cp || !cp.title || cp.title.trim().length === 0 || !cp.description || cp.description.trim().length === 0) {
                emptyFields.push('coreProblem');
              }
              const causes = sectionData.causes;
              if (!causes || !Array.isArray(causes) || causes.length === 0) {
                emptyFields.push('causes');
              } else {
                const hasEmptyCause = causes.some((c: any) =>
                  !c.title || c.title.trim().length === 0 || !c.description || c.description.trim().length === 0
                );
                if (hasEmptyCause && !emptyFields.includes('causes')) {
                  emptyFields.push('causes');
                }
              }
              const consequences = sectionData.consequences;
              if (!consequences || !Array.isArray(consequences) || consequences.length === 0) {
                emptyFields.push('consequences');
              } else {
                const hasEmptyConseq = consequences.some((c: any) =>
                  !c.title || c.title.trim().length === 0 || !c.description || c.description.trim().length === 0
                );
                if (hasEmptyConseq && !emptyFields.includes('consequences')) {
                  emptyFields.push('consequences');
                }
              }

            } else if (sectionKey === 'projectManagement') {
              if (!sectionData.description || sectionData.description.trim().length === 0) {
                emptyFields.push('description');
              }
              const structure = sectionData.structure;
              if (!structure) {
                emptyFields.push('structure');
              } else {
                for (const field of ['coordinator', 'steeringCommittee', 'advisoryBoard', 'wpLeaders']) {
                  if (!structure[field] || structure[field].trim().length === 0) {
                    if (!emptyFields.includes('structure')) emptyFields.push('structure');
                    break;
                  }
                }
              }

            } else {
              for (const [key, val] of Object.entries(sectionData)) {
                if (typeof val === 'string' && val.trim().length === 0) {
                  emptyFields.push(key);
                }
              }
            }

            if (emptyFields.length === 0) {
              console.log(`[SmartFill] ${sectionKey}: All fields complete → nothing to fill`);
              setModalConfig({
                isOpen: true,
                title: language === 'si' ? 'Vse je izpolnjeno' : 'Everything is filled',
                message: language === 'si'
                  ? `Vsa polja v razdelku "${sectionKey}" so že izpolnjena. Za izboljšanje vsebine uporabite "Izboljšaj obstoječe".`
                  : `All fields in "${sectionKey}" are already filled. To improve content, use "Enhance existing".`,
                confirmText: language === 'si' ? 'V redu' : 'OK',
                secondaryText: '',
                cancelText: '',
                onConfirm: () => closeModal(),
                onSecondary: null,
                onCancel: () => closeModal(),
              });
              generatedData = sectionData;
            } else {
              const fieldNames = emptyFields.join(', ');
              console.log(`[SmartFill] ${sectionKey}: Empty fields detected: [${fieldNames}]`);
              setIsLoading(
              language === 'si'
                ? 'Dopolnjujem ' + emptyFields.length + ' praznih polj v ' + getPrettyName(sectionKey, language) + ' (' + fieldNames + ')...'
                : 'Filling ' + emptyFields.length + ' empty fields in ' + getPrettyName(sectionKey, language) + ' (' + fieldNames + ')...'
            );
              generatedData = await generateObjectFill(
                sectionKey,
                projectData,
                sectionData,
                emptyFields,
                language,
                signal
              );
            }

          } else {
            generatedData = await generateSectionContent(
              sectionKey,
              projectData,
              language,
              mode,
              null,
              signal,
              _approvedSourcesBlock || undefined,
              _execRefsEnabled
            );
          }

        } else {
          var _genProjectData = projectData;
          if (repairInstructions) {
            _genProjectData = { ...projectData, _repairInstructions: repairInstructions };
            console.log('[EO-048b] Passing repair instructions to AI (' + repairInstructions.length + ' chars)');
          }
          generatedData = await generateSectionContent(
            sectionKey,
            _genProjectData,
            language,
            mode,
            null,
            signal,
            _approvedSourcesBlock || undefined,
            _execRefsEnabled
          );
        }
        // EO-137: AI generation complete
        _updatePhase('aiGeneration', 'completed', performance.now() - _aiStart);

        // [EO-138] Record token usage for single-section generation
        if (generatedData?._usage) {
          _recordUsage(projectData as any, sectionKey, generatedData._usage, 'single');
        }

        // ★ DIAGNOSTIC: Log what AI actually returned
        console.log(`[executeGeneration] ★ generatedData for "${sectionKey}":`, 
          JSON.stringify(generatedData)?.substring(0, 500),
          '| type:', typeof generatedData,
          '| isArray:', Array.isArray(generatedData),
          '| length:', Array.isArray(generatedData) ? generatedData.length : 'N/A'
        );
        // ★ GUARD: If AI returned nothing, don't overwrite existing data
        if (generatedData === undefined || generatedData === null) {
          console.error(`[executeGeneration] ★ CRITICAL: generatedData is ${generatedData} for "${sectionKey}" — aborting data insertion`);
          setError(
            language === 'si'
              ? 'AI ni vrnil podatkov. Poskusite ponovno.'
              : 'AI returned no data. Please try again.'
          );
          setIsLoading(false);
          isGeneratingRef.current = false;
          abortControllerRef.current = null;
          return;
        }

        // ★ EO-100: Run unified reference pipeline (extract + clean old refs + infer markers)
        // This replaces inline EO-070/EO-090/v7.23 code with the unified function
        // EO-130d: skip pipeline entirely when references are OFF for this section's parent chapter
        const _eoChapterKey = getChapterForSection(sectionKey);
        const _eoRefsEnabled = projectData._settings?.referencesEnabled?.[_eoChapterKey] ?? DEFAULT_REFS_ENABLED[_eoChapterKey] ?? false;
        console.log('[EO-130d] References', _eoRefsEnabled ? 'ENABLED' : 'DISABLED', 'for section:', sectionKey, '→ chapter:', _eoChapterKey);

        // ═══════════════════════════════════════════════════════════════
        // EO-130g: FUNDAMENTAL RULE — Remove old references for this chapter
        // BEFORE initializing the pipeline, so stale refs CANNOT survive regeneration.
        // Applies regardless of toggle ON/OFF.
        // ON: old refs removed here → new refs from Gemini added by pipeline → only fresh refs saved
        // OFF: old refs removed here → pipeline skipped → 0 refs for this chapter saved
        // ═══════════════════════════════════════════════════════════════
        const _regenChapterKey = _eoChapterKey;
        const CHAPTER_CHILDREN: Record<string, string[]> = {
          problemAnalysis: ['problemAnalysis', 'coreProblem', 'causes', 'consequences', 'euPolicies', 'policies'],
          projectIdea: ['projectIdea', 'mainAim', 'detailedDescription', 'stateOfTheArt', 'proposedSolution', 'policies', 'readinessLevels', 'projectTitleAcronym'],
          generalObjectives: ['generalObjectives'],
          specificObjectives: ['specificObjectives'],
          activities: ['activities', 'projectManagement', 'partners', 'workplan', 'risks', 'finance', 'allocations', 'partnerAllocations', 'partnerAllocations_wp', 'milestones', 'deliverables'],
          expectedResults: ['expectedResults', 'outputs', 'outcomes', 'impacts', 'kers'],
        };
        const _regenChildKeys = CHAPTER_CHILDREN[_regenChapterKey] || [_regenChapterKey, sectionKey];

        if (projectData?.references && Array.isArray(projectData.references)) {
          const _preCleanBefore = projectData.references.length;
          (projectData as any).references = projectData.references.filter((ref: any) => {
            const refSection = ref.sectionKey || '';
            return !_regenChildKeys.includes(refSection);
          });
          const _preCleanRemoved = _preCleanBefore - (projectData as any).references.length;
          console.log(`[EO-130g] Pre-pipeline cleanup: removed ${_preCleanRemoved} old references for chapter "${_regenChapterKey}" (section: "${sectionKey}"). Remaining: ${(projectData as any).references.length}`);
        }

        // Initialize pipeline AFTER cleanup — so it starts with clean refs
        var _refPipelineData: any = { references: Array.isArray(projectData.references) ? projectData.references.slice() : [], [sectionKey]: generatedData };

        // EO-137: Reference processing phase
        const _refStart = performance.now();
        _updatePhase('referenceProcessing', _eoRefsEnabled ? 'running' : 'skipped');

        // ★ EO-105b: For activities, run per-WP pipeline (same as composite Step 3)\n        // Each WP has local [1],[2],[3] markers that would collide if processed as one blob
        if (!_eoRefsEnabled) {
          // EO-130e: References OFF — full recursive safety strip (standalone function above executeGeneration)
          generatedData = _stripRefsFromObj(generatedData);
          console.log('[EO-130e] Safety strip complete: removed all [N] markers and _references from section:', sectionKey);
          // EO-130g: Orphan cleanup already done above (pre-pipeline). No need to repeat here.
        } else if (sectionKey === 'activities' && Array.isArray(generatedData)) {
          for (var _egWpIdx = 0; _egWpIdx < generatedData.length; _egWpIdx++) {
            var _egWp = generatedData[_egWpIdx];
            if (_egWp && typeof _egWp === 'object') {
              var _egWpKey = 'activities_wp' + (_egWpIdx + 1);
              _refPipelineData[_egWpKey] = _egWp;
              var _egWpResult = _runFullReferencePipeline(_egWpKey, _egWp, _refPipelineData, {
                approvedSources: _approvedSources,
                setProjectData: setProjectData,
                skipVerification: true,
              });
              if (_refPipelineData[_egWpKey]) {
                generatedData[_egWpIdx] = _refPipelineData[_egWpKey];
              }
              delete _refPipelineData[_egWpKey];
              if (_egWpResult.refsAdded > 0) {
                console.log('[EO-105b] executeGeneration WP' + (_egWpIdx + 1) + ': ' + _egWpResult.refsAdded + ' refs created');
              }
            }
          }
          console.log('[EO-105b] executeGeneration activities per-WP pipeline done — total refs: ' + (_refPipelineData.references || []).length);
        } else {
          var _refPipelineResult = _runFullReferencePipeline(sectionKey, generatedData, _refPipelineData, {
            approvedSources: _approvedSources,
            setProjectData: setProjectData,
            skipVerification: false,
          });
          // ★ EO-107: Use the marker-replaced version from _refPipelineData, not cleanData
          generatedData = _refPipelineData[sectionKey] || _refPipelineResult.cleanData;
        }

        // EO-142: Normalize policies field names (executeGeneration / regenerate path)
        if (sectionKey === 'projectIdea' && generatedData?.policies && Array.isArray(generatedData.policies)) {
          generatedData.policies = generatedData.policies.map((p: any) => ({
            name: p.name || p.title || p.policyName || '',
            description: p.description || p.relevanceDescription || p.alignment || p.alignmentDescription || p.relevance || '',
          }));
          console.log('[EO-142] Normalized', generatedData.policies.length, 'policies — fields mapped to {name, description}');
        }

        var _extractedRefs: any[] = [];
        var _currentProjectRefs = _refPipelineData.references;
        // Sync the cleaned refs back (EO-090 cleanup happened inside pipeline)
        var _cleanedProjectRefs = _currentProjectRefs;



        // ═══ DATA INSERTION ═══
        
        let newData = { ...projectData };

        // ★ v7.6 FIX: Unwrap AI response if wrapped in parent/field keys
        if (subMapping && generatedData && typeof generatedData === 'object' && !Array.isArray(generatedData)) {
          var unwrapped = generatedData;
          // ★ EO-100: Extract any remaining _references from wrapper during unwrap
          if (_extractedRefs.length === 0 && unwrapped._references) {
            var _uwExtraction = _extractAndRemoveReferences(unwrapped, sectionKey);
            unwrapped = _uwExtraction.cleanData;
            var _uwConvertedRefs = _convertAiRefsToReferences(_uwExtraction.refs, sectionKey, _currentProjectRefs);
            if (_uwConvertedRefs.length > 0) {
              _extractedRefs = _uwConvertedRefs;
              // Merge into pipeline data
              var _uwDeduped = _uwConvertedRefs.filter(function(nr: any) { return !_refExists(_currentProjectRefs, nr); });
              if (_uwDeduped.length > 0) {
                _refPipelineData.references = _currentProjectRefs.concat(_uwDeduped);
                _currentProjectRefs = _refPipelineData.references;
              }
              console.log('[EO-100] Extracted ' + _uwConvertedRefs.length + ' refs from subMapping wrapper');
            }
          }
          var uwParent = subMapping.path[0];
          if (unwrapped[uwParent] && typeof unwrapped[uwParent] === 'object') {
            // ★ HOTFIX v7.23: Check for _references inside parent wrapper too
            if (_extractedRefs.length === 0 && unwrapped[uwParent]._references) {
              var _parentExtraction = _extractAndRemoveReferences(unwrapped[uwParent], sectionKey);
              unwrapped[uwParent] = _parentExtraction.cleanData;
              _extractedRefs = _convertAiRefsToReferences(_parentExtraction.refs, sectionKey, _currentProjectRefs);
              if (_extractedRefs.length > 0) {
                console.log('[HOTFIX v7.23] Extracted ' + _extractedRefs.length + ' refs from parent "' + uwParent + '" wrapper');
              }
            }
            console.log('[executeGeneration] ★ UNWRAP: stripped parent "' + uwParent + '"');
            unwrapped = unwrapped[uwParent];
          }
          if (subMapping.path.length === 2) {
            var uwField = subMapping.path[1];
            if (unwrapped[uwField] !== undefined) {
              console.log('[executeGeneration] ★ UNWRAP: stripped field "' + uwField + '"');
              unwrapped = unwrapped[uwField];
            }
          }
          generatedData = unwrapped;
        }

        if (subMapping) {
          if (sectionKey === 'projectTitleAcronym') {
            newData.projectIdea = {
              ...newData.projectIdea,
              projectTitle: generatedData.projectTitle || newData.projectIdea.projectTitle,
              projectAcronym: generatedData.projectAcronym || newData.projectIdea.projectAcronym,
            };
          } else if (subMapping.isString) {
            var parentKeyS = subMapping.path[0];
            var fieldKeyS = subMapping.path[1];
            var stringVal = generatedData;
            if (typeof stringVal !== 'string' && stringVal && typeof stringVal === 'object') {
              if (typeof stringVal[fieldKeyS] === 'string') {
                stringVal = stringVal[fieldKeyS];
              } else {
                var sVals = Object.values(stringVal);
                var sFirst = sVals.find(function(v) { return typeof v === 'string' && (v as string).trim().length > 0; });
                if (sFirst) { stringVal = sFirst; }
              }
              console.log('[executeGeneration] ★ UNWRAP string for "' + sectionKey + '"');
            }
            newData[parentKeyS] = {
              ...newData[parentKeyS],
              [fieldKeyS]: stringVal,
            };
          } else if (subMapping.path.length === 2) {
            var parentKeyP = subMapping.path[0];
            var fieldKeyP = subMapping.path[1];
            newData[parentKeyP] = {
              ...newData[parentKeyP],
              [fieldKeyP]: generatedData,
            };
          }
        } else if (sectionKey === 'partners') {
          // EO-123: Unwrap if AI returned { partners: [...] } wrapper instead of direct array
          if (generatedData && !Array.isArray(generatedData) && typeof generatedData === 'object') {
            if (Array.isArray((generatedData as any).partners)) {
              console.log('[executeGeneration] EO-123 UNWRAP: partners was {partners:[...]} wrapper — extracted array (' + (generatedData as any).partners.length + ' items)');
              generatedData = (generatedData as any).partners;
            } else {
              var _pWrapValues = Object.values(generatedData as any);
              var _pNestedArr = _pWrapValues.find(function(v: any) { return Array.isArray(v) && v.length > 0; });
              if (_pNestedArr) {
                console.log('[executeGeneration] EO-123 UNWRAP: partners was wrapped object — extracted nested array (' + (_pNestedArr as any[]).length + ' items)');
                generatedData = _pNestedArr;
              }
            }
          }
          newData.partners = generatedData;

        } else if (['problemAnalysis', 'projectIdea', 'projectManagement'].includes(sectionKey)) {
          // ★ v7.6 FIX: Unwrap if AI returned { problemAnalysis: {...} } or { projectIdea: {...} }
          if (generatedData && typeof generatedData === 'object' && !Array.isArray(generatedData)) {
            if (generatedData[sectionKey] && typeof generatedData[sectionKey] === 'object' && !Array.isArray(generatedData[sectionKey])) {
              // ★ HOTFIX v7.23: Extract _references from inside the section wrapper before unwrapping
              if (_extractedRefs.length === 0 && generatedData[sectionKey]._references) {
                var _secExtraction = _extractAndRemoveReferences(generatedData[sectionKey], sectionKey);
                generatedData[sectionKey] = _secExtraction.cleanData;
                _extractedRefs = _convertAiRefsToReferences(_secExtraction.refs, sectionKey, _currentProjectRefs);
                if (_extractedRefs.length > 0) {
                  console.log('[HOTFIX v7.23] Extracted ' + _extractedRefs.length + ' refs from "' + sectionKey + '" section wrapper');
                }
              }
              console.log('[executeGeneration] ★ UNWRAP: stripped "' + sectionKey + '" wrapper from full-section response');
              generatedData = generatedData[sectionKey];
            }
          }
          if (sectionKey === 'projectManagement') {
            if (Array.isArray(generatedData)) {
              console.error('[executeGeneration] ★ CRITICAL: AI returned ARRAY for projectManagement (' + generatedData.length + ' items) — this is activities data, NOT PM! Keeping original.');
            } else if (generatedData && typeof generatedData === 'object') {
              var pmData = generatedData.projectManagement && typeof generatedData.projectManagement === 'object'
                ? generatedData.projectManagement
                : generatedData;
              console.log('[executeGeneration] ★ PM merge — unwrapped: ' + (!!generatedData.projectManagement) + ', desc length: ' + (pmData?.description?.length || 0));
              newData[sectionKey] = {
                ...newData[sectionKey],
                ...pmData,
                structure: {
                  ...(newData[sectionKey]?.structure || {}),
                  ...(pmData?.structure || {}),
                },
              };
            }
          } else {
            // ★ v7.7 FIX: SMART MERGE — do NOT overwrite existing data with empty AI responses
            if (generatedData && typeof generatedData === 'object' && !Array.isArray(generatedData)) {
              var _smartMerged = { ...newData[sectionKey] };
              var _mergeKeys = Object.keys(generatedData);
              for (var _mki = 0; _mki < _mergeKeys.length; _mki++) {
                var _mk = _mergeKeys[_mki];
                var _newVal = generatedData[_mk];
                var _existingVal = _smartMerged[_mk];

                if (typeof _newVal === 'string' && _newVal.trim().length > 0) {
                  _smartMerged[_mk] = _newVal;
                  continue;
                }
                // ★ FIX: If schema expects string but AI returned object (e.g. proposedSolution as {phases:[...]})
                if (_mk === 'proposedSolution' && _newVal && typeof _newVal === 'object' && !Array.isArray(_newVal)) {
                  var _flattenedPS = '';
                  if (Array.isArray(_newVal.phases)) {
                    _flattenedPS = _newVal.phases.map(function(phase: any, idx: number) {
                      var phTitle = phase.title || ('Phase ' + (idx + 1));
                      var phDesc = phase.description || '';
                      var phActivities = Array.isArray(phase.activities) ? phase.activities.join('; ') : '';
                      return phTitle + ': ' + phDesc + (phActivities ? ' Activities: ' + phActivities : '');
                    }).join('\n\n');
                  } else {
                    _flattenedPS = JSON.stringify(_newVal);
                  }
                  if (_flattenedPS.trim().length > 0) {
                    console.log('[v7.7 SMART MERGE] ★ FIX: proposedSolution was OBJECT — flattened to string (' + _flattenedPS.length + ' chars)');
                    _smartMerged[_mk] = _flattenedPS;
                    continue;
                  }
                }

                // ★ FIX: Gemini returns "euPolicies" instead of "policies" — remap
                if (_mk === 'euPolicies' && Array.isArray(_newVal) && _newVal.length > 0) {
                  console.log('[v7.7 SMART MERGE] ★ FIX: remapping "euPolicies" → "policies" (' + _newVal.length + ' items)');
                  _smartMerged['policies'] = _newVal;
                  continue;
                }

                // ★ FIX: readinessLevels — Gemini sometimes nests TRL inside wrong structure
                if (_mk === 'readinessLevels' && _newVal && typeof _newVal === 'object' && !Array.isArray(_newVal)) {
                  var _rlFixed = _newVal;
                  if (!_newVal.TRL && !_newVal.trl) {
                    var _rlKeys = Object.keys(_newVal);
                    for (var _rli = 0; _rli < _rlKeys.length; _rli++) {
                      var _rlSub = _newVal[_rlKeys[_rli]];
                      if (_rlSub && typeof _rlSub === 'object' && (_rlSub.TRL || _rlSub.level !== undefined)) {
                        _rlFixed = _rlSub;
                        console.log('[v7.7 SMART MERGE] ★ FIX: readinessLevels unwrapped from "' + _rlKeys[_rli] + '"');
                        break;
                      }
                    }
                  }
                  if (_rlFixed.trl && !_rlFixed.TRL) { _rlFixed.TRL = _rlFixed.trl; delete _rlFixed.trl; }
                  if (_rlFixed.srl && !_rlFixed.SRL) { _rlFixed.SRL = _rlFixed.srl; delete _rlFixed.srl; }
                  if (_rlFixed.orl && !_rlFixed.ORL) { _rlFixed.ORL = _rlFixed.orl; delete _rlFixed.orl; }
                  if (_rlFixed.lrl && !_rlFixed.LRL) { _rlFixed.LRL = _rlFixed.lrl; delete _rlFixed.lrl; }
                  _smartMerged[_mk] = _rlFixed;
                  console.log('[v7.7 SMART MERGE] ★ readinessLevels merged — TRL present: ' + !!(_rlFixed.TRL));
                  continue;
                }

                if (Array.isArray(_newVal) && _newVal.length > 0) {
                  if (_arrayHasRealContent(_newVal)) {
                    _smartMerged[_mk] = _newVal;
                    continue;
                  }
                  if (Array.isArray(_existingVal) && _arrayHasRealContent(_existingVal)) {
                    console.log('[executeGeneration] ★ v7.7 SMART MERGE: keeping existing "' + _mk + '" (AI returned empty array)');
                    continue;
                  }
                  _smartMerged[_mk] = _newVal;
                  continue;
                }

                if (_newVal && typeof _newVal === 'object' && !Array.isArray(_newVal)) {
                  var _objHasContent = Object.values(_newVal).some(function(v: any) {
                    return typeof v === 'string' && v.trim().length > 0;
                  });
                  if (_objHasContent) {
                    if (_existingVal && typeof _existingVal === 'object' && !Array.isArray(_existingVal)) {
                      var _deepMerged = { ..._existingVal };
                      var _dvKeys = Object.keys(_newVal);
                      for (var _dvi = 0; _dvi < _dvKeys.length; _dvi++) {
                        var _dvk = _dvKeys[_dvi];
                        if (typeof _newVal[_dvk] === 'string' && _newVal[_dvk].trim().length > 0) {
                          _deepMerged[_dvk] = _newVal[_dvk];
                        }
                      }
                      _smartMerged[_mk] = _deepMerged;
                    } else {
                      _smartMerged[_mk] = _newVal;
                    }
                    continue;
                  }
                  if (_existingVal && typeof _existingVal === 'object') {
                    var _existObjHasContent = false;
                    if (Array.isArray(_existingVal)) {
                      _existObjHasContent = _existingVal.length > 0;
                    } else {
                      _existObjHasContent = Object.values(_existingVal).some(function(v: any) {
                        return typeof v === 'string' && v.trim().length > 0;
                      });
                    }
                    if (_existObjHasContent) {
                      console.log('[executeGeneration] ★ v7.7 SMART MERGE: keeping existing "' + _mk + '" (AI returned empty object)');
                      continue;
                    }
                  }
                  _smartMerged[_mk] = _newVal;
                  continue;
                }

                if (typeof _newVal === 'string' && _newVal.trim().length === 0) {
                  if (typeof _existingVal === 'string' && _existingVal.trim().length > 0) {
                    console.log('[executeGeneration] ★ v7.7 SMART MERGE: keeping existing "' + _mk + '" (AI returned empty string)');
                    continue;
                  }
                }

                if (Array.isArray(_newVal) && _newVal.length === 0 && Array.isArray(_existingVal) && _existingVal.length > 0) {
                  console.log('[executeGeneration] ★ v7.7 SMART MERGE: keeping existing "' + _mk + '" (AI returned empty array [])');
                  continue;
                }

                _smartMerged[_mk] = _newVal;
              }
              console.log('[executeGeneration] ★ v7.7 SMART MERGE complete for "' + sectionKey + '": keys merged: [' + _mergeKeys.join(', ') + ']');
              newData[sectionKey] = _smartMerged;
            } else {
              newData[sectionKey] = { ...newData[sectionKey], ...generatedData };
            }
          }

        } else if (sectionKey === 'activities') {
          if (Array.isArray(generatedData)) {
            newData[sectionKey] = generatedData;
          } else if (generatedData && Array.isArray(generatedData.activities)) {
            newData[sectionKey] = generatedData.activities;
          } else if (generatedData && typeof generatedData === 'object' && !Array.isArray(generatedData)) {
            newData[sectionKey] = [generatedData];
          } else {
            console.warn('[executeGeneration] activities: unexpected format, keeping original');
          }
        } else if (sectionKey === 'expectedResults') {
          const compositeData = generatedData as any;
          if (compositeData.outputs) newData.outputs = compositeData.outputs;
          if (compositeData.outcomes) newData.outcomes = compositeData.outcomes;
          if (compositeData.impacts) newData.impacts = compositeData.impacts;
          if (compositeData.kers) newData.kers = compositeData.kers; // EO-123: was missing
        } else {
          // ★ v7.7 FIX: Smart merge for ARRAY sections
          var _finalArrayData = generatedData;

          if (_finalArrayData && typeof _finalArrayData === 'object' && !Array.isArray(_finalArrayData)) {
            var _wrapValues = Object.values(_finalArrayData);
            var _wrapNestedArr = _wrapValues.find(function(v: any) { return Array.isArray(v) && v.length > 0; });
            if (_wrapNestedArr) {
              console.warn('[executeGeneration] ★ "' + sectionKey + '" returned as object, extracted nested array (' + (_wrapNestedArr as any[]).length + ' items)');
              _finalArrayData = _wrapNestedArr;
            }
          }

          if (Array.isArray(_finalArrayData) && Array.isArray(newData[sectionKey]) && newData[sectionKey].length > 0) {
            newData[sectionKey] = _smartMergeArray(newData[sectionKey], _finalArrayData as any[], sectionKey);
          } else if (Array.isArray(_finalArrayData)) {
            newData[sectionKey] = _finalArrayData;
          } else if (_finalArrayData === null || _finalArrayData === undefined) {
            console.warn('[executeGeneration] ★ "' + sectionKey + '" generatedData is null/undefined — keeping original');
          } else {
            newData[sectionKey] = _finalArrayData;
          }
        }

        // EO-130g: Post-merge safety — if refs disabled, strip any [N] markers SMART MERGE
        // may have re-introduced from old text, and double-check no stale refs survived
        if (!_eoRefsEnabled) {
          if (newData[sectionKey] !== undefined) {
            newData[sectionKey] = _stripRefsFromObj(newData[sectionKey]);
            console.log('[EO-130g] Post-merge safety strip applied to newData.' + sectionKey);
          }
          // Double-check: remove any references that somehow survived for this chapter
          if (Array.isArray(newData.references)) {
            const _postMergeBefore = newData.references.length;
            newData.references = newData.references.filter((ref: any) => {
              const refSection = ref.sectionKey || '';
              return !_regenChildKeys.includes(refSection);
            });
            const _postMergeRemoved = _postMergeBefore - newData.references.length;
            if (_postMergeRemoved > 0) {
              console.log(`[EO-130g] Post-merge double-check: removed ${_postMergeRemoved} additional stale references for chapter "${_regenChapterKey}"`);
            }
          }
        }

        // ★ FIX: Auto-assign IDs for KERs and Risks if AI didn't generate them
        if (Array.isArray(newData.kers)) {
          newData.kers = newData.kers.map((item: any, idx: number) => ({
            ...item,
            id: (item.id && item.id.trim()) ? item.id : `KER${idx + 1}`,
          }));
        }
        if (Array.isArray(newData.risks)) {
          newData.risks = newData.risks.map((item: any, idx: number) => ({
            ...item,
            id: (item.id && item.id.trim()) ? item.id : `RISK${idx + 1}`,
          }));
        }

                if (sectionKey === 'activities') {
          const schedResult = recalculateProjectSchedule(newData);
          newData = schedResult.projectData;
          if (schedResult.warnings.length > 0) {
            console.warn('Schedule warnings:', schedResult.warnings);
          }

          // ★ EO-094: 15s pause before PM generation
          console.log('[EO-094] Waiting 15s before projectManagement generation...');
          await new Promise(r => setTimeout(r, 15000));
          setIsLoading(`${t.generating} ${t.subSteps.implementation}...`);
          try {
            const pmContent = await generateSectionContent(
              'projectManagement',
              newData,
              language,
              mode,
              null,
              signal,
              undefined,
              _execRefsEnabled
            );
            newData.projectManagement = {
              ...newData.projectManagement,
              ...pmContent,
              structure: {
                ...(newData.projectManagement?.structure || {}),
                ...(pmContent?.structure || {}),
              },
            };
          } catch (e: any) {
            if (e.name === 'AbortError') throw e;

            console.error('[Auto-gen projectManagement]:', e);
            const emsg = e.message || '';
            const isRateLimit = emsg.includes('429') || emsg.includes('Quota') || emsg.includes('rate limit') || emsg.includes('RESOURCE_EXHAUSTED');
            if (isRateLimit) {
              console.warn('[Auto-gen projectManagement] Rate limit hit — retrying in 20s...');
              setIsLoading(
                language === 'si'
                  ? 'Čakam na API kvoto... 20s → Implementacija'
                  : 'Waiting for API quota... 20s → Implementation'
              );
              await new Promise(r => setTimeout(r, 20000));
              if (signal.aborted) throw new DOMException('Generation cancelled', 'AbortError');
              setIsLoading(`${t.generating} ${t.subSteps.implementation}...`);
              try {
                const pmRetry = await generateSectionContent('projectManagement', newData, language, mode, null, signal, undefined, _execRefsEnabled);
                newData.projectManagement = {
                  ...newData.projectManagement,
                  ...pmRetry,
                  structure: {
                    ...(newData.projectManagement?.structure || {}),
                    ...(pmRetry?.structure || {}),
                  },
                };
              } catch (e2: any) {
                if (e2.name === 'AbortError') throw e2;
                console.error('[Auto-gen projectManagement] Retry also failed:', e2);
                setError(
                  language === 'si'
                    ? 'Implementacija ni bila generirana (omejitev API). Generirajte jo ročno v koraku 5 → Implementacija.'
                    : 'Implementation was not generated (API limit). Generate it manually in Step 5 → Implementation.'
                );
              }
            } else {
              setError(
                language === 'si'
                  ? 'Implementacija ni bila generirana. Generirajte jo ročno v koraku 5 → Implementacija.'
                  : 'Implementation was not generated. Generate it manually in Step 5 → Implementation.'
              );
            }
          }

          // ★ EO-094: 15s pause before risks generation
          console.log('[EO-094] Waiting 15s before risks generation...');
          await new Promise(r => setTimeout(r, 15000));
          if (signal.aborted) throw new DOMException('Generation cancelled', 'AbortError');
          setIsLoading(`${t.generating} ${t.subSteps.riskMitigation}...`);
          try {
            const risksContent = await generateSectionContent(
              'risks',
              newData,
              language,
              mode,
              null,
              signal,
              undefined,
              _execRefsEnabled
            );
            if (Array.isArray(risksContent)) {
              newData.risks = risksContent;
            } else if (risksContent && Array.isArray(risksContent.risks)) {
              newData.risks = risksContent.risks;
            } else {
              console.warn('[executeGeneration] risks: unexpected format, keeping original');
            }
          } catch (e: any) {
            if (e.name === 'AbortError') throw e;

            console.error('[Auto-gen risks]:', e);
            const emsg = e.message || '';
            const isRateLimit = emsg.includes('429') || emsg.includes('Quota') || emsg.includes('rate limit') || emsg.includes('RESOURCE_EXHAUSTED');
            if (isRateLimit) {
              console.warn('[Auto-gen risks] Rate limit hit — retrying in 20s...');
              setIsLoading(
                language === 'si'
                  ? 'Čakam na API kvoto... 20s → Obvladovanje tveganj'
                  : 'Waiting for API quota... 20s → Risk Mitigation'
              );
              await new Promise(r => setTimeout(r, 20000));
              if (signal.aborted) throw new DOMException('Generation cancelled', 'AbortError');
              setIsLoading(`${t.generating} ${t.subSteps.riskMitigation}...`);
              try {
                const risksRetry = await generateSectionContent('risks', newData, language, mode, null, signal, undefined, _execRefsEnabled);
                if (Array.isArray(risksRetry)) {
                  newData.risks = risksRetry;
                } else if (risksRetry && Array.isArray((risksRetry as any).risks)) {
                  newData.risks = (risksRetry as any).risks;
                }
              } catch (e2: any) {
                if (e2.name === 'AbortError') throw e2;
                console.error('[Auto-gen risks] Retry also failed:', e2);
                setModalConfig({
                  isOpen: true,
                  title: language === 'si' ? 'Tveganja niso bila generirana' : 'Risks Were Not Generated',
                  message: language === 'si'
                    ? 'Avtomatsko generiranje tveganj ni uspelo zaradi omejitve API ponudnika.\n\nTo ni kritična napaka — aktivnosti in implementacija so uspešno generirani.\n\nTveganja lahko generirate ročno:\n• Pojdite na korak 5 → Obvladovanje tveganj\n• Kliknite "Generiraj z UI"'
                    : 'Automatic risk generation failed due to API provider limits.\n\nThis is not a critical error — activities and implementation were generated successfully.\n\nYou can generate risks manually:\n• Go to Step 5 → Risk Mitigation\n• Click "Generate with AI"',
                  confirmText: language === 'si' ? 'V redu' : 'OK',
                  secondaryText: '',
                  cancelText: '',
                  onConfirm: () => closeModal(),
                  onSecondary: null,
                  onCancel: () => closeModal(),
                });
              }
            } else {
              setModalConfig({
                isOpen: true,
                title: language === 'si' ? 'Tveganja niso bila generirana' : 'Risks Were Not Generated',
                message: language === 'si'
                  ? 'Avtomatsko generiranje tveganj ni uspelo.\n\nTo ni kritična napaka — aktivnosti in implementacija so uspešno generirani.\n\nTveganja lahko generirate ročno:\n• Pojdite na korak 5 → Obvladovanje tveganj\n• Kliknite "Generiraj z UI"'
                  : 'Automatic risk generation failed.\n\nThis is not a critical error — activities and implementation were generated successfully.\n\nYou can generate risks manually:\n• Go to Step 5 → Risk Mitigation\n• Click "Generate with AI"',
                confirmText: language === 'si' ? 'V redu' : 'OK',
                secondaryText: '',
                cancelText: '',
                onConfirm: () => closeModal(),
                onSecondary: null,
                onCancel: () => closeModal(),
              });
            }
          }
        }
        // ★ EO-106: Auto-fill empty critical fields after activities generation
        if (sectionKey === 'activities' && !signal.aborted) {
          newData = await _autoFillEmptyCriticalFields(
            newData, ['projectManagement'],
            language, signal, setIsLoading, generateObjectFill
          );
        }
        // ★ v7.14 EO-047: Strip markdown from structured AI output before validation and save
        // EO-137: Merging & validation phase
        _updatePhase('mergingValidation', 'running');
        const _mergeStart = performance.now();
        if (generatedData && typeof generatedData === 'object') {
          generatedData = _stripMarkdownFromObject(generatedData);
          console.log('[EO-047] Markdown stripped from generatedData for "' + sectionKey + '"');
        }
        // Also strip markdown from newData[sectionKey] which may have been merged above
        if (SUB_SECTION_MAP[sectionKey]) {
          var _mdParent = SUB_SECTION_MAP[sectionKey].path[0];
          if (newData[_mdParent] && typeof newData[_mdParent] === 'object') {
            newData[_mdParent] = _stripMarkdownFromObject(newData[_mdParent]);
          }
        } else if (newData[sectionKey] && typeof newData[sectionKey] === 'object') {
          newData[sectionKey] = _stripMarkdownFromObject(newData[sectionKey]);
        }

        // ★ v7.12 EO-045: Validation gate — check AI output before saving
        var _validationSectionKey = sectionKey;
        var _validationData = generatedData;
        if (SUB_SECTION_MAP[sectionKey]) {
          _validationSectionKey = SUB_SECTION_MAP[sectionKey].parent;
          _validationData = newData[_validationSectionKey];
        } else if (['problemAnalysis', 'projectIdea', 'projectManagement'].includes(sectionKey)) {
          _validationData = newData[sectionKey];
        }
        var _skipValidation = VALIDATION_SKIP_SECTIONS.has(sectionKey);
        if (!_skipValidation && _validationData) {
          try {
            var _valCtx = _buildValidationContext(newData, language);
            var _valReport = validateSectionOutput(_validationSectionKey, _validationData, _valCtx);
            // ★ v7.13 EO-045b: Filter out empty-field issues (pre-existing empties, not AI errors)
            var _filteredReport = _filterValidationIssues(_valReport);
            console.log('[EO-045 VALIDATION] ' + _validationSectionKey + ': raw FATAL=' + _valReport.fatalCount + ' → filtered FATAL=' + _filteredReport.fatalCount + ' HIGH=' + _filteredReport.highCount + ' MEDIUM=' + _filteredReport.mediumCount);
            if (_filteredReport.fatalCount > 0) {
              var _rejectSummary = _formatValidationIssues(_filteredReport, 8, language);
              console.error('[EO-045 VALIDATION] ★ REJECTED — ' + _validationSectionKey + ':\n' + _rejectSummary);
              var _qualityScore = Math.max(0, Math.round(100 - (_filteredReport.fatalCount * 15) - (_filteredReport.highCount * 5) - (_filteredReport.mediumCount * 1)));
              setModalConfig({
                isOpen: true,
                title: language === 'si' ? '\uD83D\uDD27 Vsebina potrebuje dopolnitev' : '\uD83D\uDD27 Content Needs Attention',
                message: (language === 'si'
                  ? '\uD83D\uDCCA Ocena kakovosti: ' + _qualityScore + '/100\n\nAI-generirana vsebina za "' + getPrettyName(_validationSectionKey, language) + '" potrebuje naslednje dopolnitve:\n\n'
                  : '\uD83D\uDCCA Quality Score: ' + _qualityScore + '/100\n\nAI-generated content for "' + getPrettyName(_validationSectionKey, language) + '" needs the following improvements:\n\n')
                  + _rejectSummary
                  + (language === 'si' ? '\n\nPriporocamo ponovno generiranje za boljsi rezultat.' : '\n\nWe recommend regenerating for a better result.'),
                confirmText: language === 'si' ? 'Generiraj ponovno' : 'Regenerate',
                secondaryText: language === 'si' ? 'Shrani vseeno' : 'Save anyway',
                cancelText: language === 'si' ? 'Zapri' : 'Close',
                onConfirm: function() { closeModal(); executeGeneration(sectionKey, 'regenerate'); },
                                onSecondary: function() {
                  closeModal();
                  console.warn('[EO-045 VALIDATION] User chose SAVE ANYWAY despite FATAL issues');
                  // ★ EO-091: Apply reference merge BEFORE forced save (was skipped by early return)
                  if (_extractedRefs.length > 0) {
                    var _forceSaveRefs = _currentProjectRefs.slice();
                    var _forceSaveDeduped: any[] = [];
                    for (var _fsi = 0; _fsi < _extractedRefs.length; _fsi++) {
                      var _fsRef = _extractedRefs[_fsi];
                      var _fsSameSecRefs = _forceSaveRefs.filter(function(r) { return r.sectionKey === _fsRef.sectionKey; });
                      if (!_refExists(_fsSameSecRefs, _fsRef) && !_refExists(_forceSaveDeduped, _fsRef)) {
                        _forceSaveDeduped.push(_fsRef);
                      }
                    }
                    if (_forceSaveDeduped.length > 0) {
                      newData.references = _forceSaveRefs.concat(_forceSaveDeduped);
                      // Replace markers
                      var _fsSectionToFix = subMapping ? subMapping.path[0] : sectionKey;
                      var _fsFixTarget = newData[_fsSectionToFix];
                      if (_fsFixTarget && typeof _fsFixTarget === 'object') {
                        var _fsFixJson = JSON.stringify(_fsFixTarget);
                        for (var _fmri = 0; _fmri < _forceSaveDeduped.length; _fmri++) {
                          var _fmr = _forceSaveDeduped[_fmri];
                          if (_fmr._originalMarker && _fmr._originalMarker !== _fmr.inlineMarker) {
                            _fsFixJson = _fsFixJson.split(_fmr._originalMarker).join(_fmr.inlineMarker);
                          }
                        }
                        newData[_fsSectionToFix] = JSON.parse(_fsFixJson);
                      }
                      console.log('[EO-091] Forced save: merged ' + _forceSaveDeduped.length + ' refs + replaced markers');
                    }
                  }
                  setProjectData(function(prev: any) {
                    var savedData = Object.assign({}, prev, newData);
                    if (currentProjectId) {
                      storageService.saveProject(savedData, language, currentProjectId)
                        .then(function() { console.log('[executeGeneration] ★ Forced save after validation override'); })
                        .catch(function(e: any) { console.error('[executeGeneration] ★ Forced save failed:', e); });
                    }
                    return savedData;
                  });
                  setHasUnsavedTranslationChanges(true);
                },
                onCancel: closeModal,
              });
              setIsLoading(false);
              isGeneratingRef.current = false;
              abortControllerRef.current = null;
              return;
            }
            if (_filteredReport.highCount > 0) {
              var _warnSummary = _formatValidationIssues(_filteredReport, 5, language);
              console.warn('[EO-045 VALIDATION] ★ WARNINGS — ' + _validationSectionKey + ':\n' + _warnSummary);
              setModalConfig({
                isOpen: true,
                title: language === 'si' ? '\uD83D\uDCA1 Priporocila za izboljsavo' : '\uD83D\uDCA1 Improvement Suggestions',
                message: (language === 'si'
                  ? 'AI-generirana vsebina za "' + getPrettyName(_validationSectionKey, language) + '" je bila shranjena. Nekaj priporocil za izboljsavo:\n\n'
                  : 'AI-generated content for "' + getPrettyName(_validationSectionKey, language) + '" was saved. Here are some suggestions for improvement:\n\n')
                  + _warnSummary
                  + (language === 'si' ? '\n\nVsebino lahko rocno popravite ali poskusite ponovno generirati.' : '\n\nYou can manually edit the content or try regenerating.'),
                confirmText: language === 'si' ? 'V redu' : 'OK',
                secondaryText: language === 'si' ? 'Generiraj ponovno' : 'Regenerate',
                cancelText: '',
                onConfirm: closeModal,
                onSecondary: function() {
                  closeModal();
                  var _repairText = 'REPAIR INSTRUCTIONS — fix these specific issues from the previous generation:\n' + _warnSummary + '\nKeep all content that was correct. ONLY fix the listed issues.';
                  executeGeneration(sectionKey, 'enhance', _repairText);
                },
                onCancel: closeModal,
              });
            }
          } catch (_valErr) {
            console.error('[EO-045 VALIDATION] Validator crashed (non-fatal):', _valErr);
          }
        }
                // ★ v7.25: Citation format warning — bare [N] without (Author/Institution, Year)
        // EO-130e: Skip entirely when refs disabled for this chapter
        const _citationChapterKey = getChapterForSection(sectionKey);
        const _citationRefsEnabled = projectData?._settings?.referencesEnabled?.[_citationChapterKey]
          ?? DEFAULT_REFS_ENABLED[_citationChapterKey]
          ?? false;
        if (!_citationRefsEnabled) {
          console.log('[EO-130e] Citation format check SKIPPED — refs disabled for:', sectionKey, '→ chapter:', _citationChapterKey);
        } else if (INLINE_CITATION_CHECK_SECTIONS.has(sectionKey) || INLINE_CITATION_CHECK_SECTIONS.has(_validationSectionKey)) {
          try {
            var _citationText = _extractAllTextForCitationCheck(_validationData || generatedData || newData[sectionKey]);
            if (_hasBareNumericCitations(_citationText)) {
              var _citationExamples = _findBareCitationExamples(_citationText, 3);
              console.warn('[v7.25 CITATION FORMAT] Bare numeric citations detected in "' + sectionKey + '":', _citationExamples);

              setModalConfig({
                isOpen: true,
                title: language === 'si' ? '⚠ Oblika citatov ni popolna' : '⚠ Citation format is incomplete',
                message:
                  (language === 'si'
                    ? 'AI je ustvaril nekatere gole številčne citate brez kratke navedbe avtorja/institucije in letnice.\n\nPravilna oblika je:\n(Avtor ali institucija, leto) [N]\n\nPrimeri zaznanih delov besedila:\n'
                    : 'The AI generated some bare numeric citations without short author/institution + year attribution.\n\nCorrect format is:\n(Author or Institution, Year) [N]\n\nExamples detected in text:\n')
                  + (_citationExamples.length > 0 ? '\n- ' + _citationExamples.join('\n- ') : '\n- [N] markers detected')
                  + (language === 'si'
                    ? '\n\nVsebina je bila shranjena, vendar priporočamo ponovno generiranje ali ročni popravek citatov.'
                    : '\n\nThe content was saved, but we recommend regenerating or manually fixing the citations.'),
                confirmText: language === 'si' ? 'V redu' : 'OK',
                secondaryText: language === 'si' ? 'Generiraj ponovno' : 'Regenerate',
                cancelText: '',
                onConfirm: closeModal,
                onSecondary: function() {
                  closeModal();
                  var _repairCitationText =
                    'REPAIR CITATION FORMAT ONLY. Rewrite all factual citations from bare [N] markers into this mandatory format: (Author/Institution, Year) [N]. ' +
                    'Do NOT change the meaning of the content. Do NOT remove valid references. Do NOT invent metadata.';
                  executeGeneration(sectionKey, 'enhance', _repairCitationText);
                },
                onCancel: closeModal,
              });
            }
          } catch (_citationFormatErr) {
            console.error('[v7.25 CITATION FORMAT] Citation format check crashed (non-fatal):', _citationFormatErr);
          }
        }

        // ★ EO-100: Reference pipeline already ran above — sync results into newData
        newData.references = _refPipelineData.references;
        // EO-137: Reference processing complete
        if (_eoRefsEnabled) _updatePhase('referenceProcessing', 'completed', performance.now() - _refStart);

        // ★ v7.24 EO-084: Persist approved sources in projectData
        if (_approvedSources.length > 0) {
          var _existingApproved = Array.isArray(newData.approvedSources) ? newData.approvedSources : [];
          var _newApproved: ApprovedSource[] = [];
          for (var _asi = 0; _asi < _approvedSources.length; _asi++) {
            var _as = _approvedSources[_asi];
            var _asDup = false;
            for (var _eai = 0; _eai < _existingApproved.length; _eai++) {
              var _ea = _existingApproved[_eai];
              if (_as.doi && _ea.doi && _as.doi.toLowerCase() === _ea.doi.toLowerCase()) { _asDup = true; break; }
              if (_as.title && _ea.title && _as.title.toLowerCase() === _ea.title.toLowerCase() && String(_as.year) === String(_ea.year)) { _asDup = true; break; }
            }
            if (!_asDup) _newApproved.push(_as);
          }
          if (_newApproved.length > 0) {
            newData.approvedSources = _existingApproved.concat(_newApproved);
            console.log('[EO-100/EO-084] Persisted ' + _newApproved.length + ' new approved sources (total: ' + newData.approvedSources.length + ')');
          }
        }

        setProjectData((prev: any) => {
          // EO-137: Merging/validation complete, saving starts
          _updatePhase('mergingValidation', 'completed', performance.now() - _mergeStart);
          _updatePhase('saving', 'running');
          const _saveStart = performance.now();
          const savedData = { ...prev, ...newData };
          if (currentProjectId) {
            storageService.saveProject(savedData, language, currentProjectId)
              .then(() => {
                console.log(`[executeGeneration] ★ Explicit save after ${sectionKey} — lang=${language}, generalObjectives: ${Array.isArray(savedData.generalObjectives) && savedData.generalObjectives.some((o: any) => o.title?.trim()) ? '✅ HAS' : '⚠️ EMPTY'}`);
                _updatePhase('saving', 'completed', performance.now() - _saveStart);
              })
              .catch((e: any) => {
                console.error(`[executeGeneration] ★ Explicit save failed:`, e);
                _updatePhase('saving', 'failed', undefined, e?.message || 'Save failed');
              });
          } else {
            _updatePhase('saving', 'completed', performance.now() - _saveStart);
          }
          return savedData;
        });
        // EO-131: Async URL verification after save — fire-and-forget
        // EO-130e: Skip when refs disabled for this chapter
        const _verifyChapterKey = getChapterForSection(sectionKey);
        const _verifyRefsEnabled = projectData?._settings?.referencesEnabled?.[_verifyChapterKey]
          ?? DEFAULT_REFS_ENABLED[_verifyChapterKey]
          ?? false;
        if (!_verifyRefsEnabled) {
          console.log('[EO-130e] URL verification SKIPPED — refs disabled for:', sectionKey, '→ chapter:', _verifyChapterKey);
          // phase already 'skipped' from _makeDefaultPhases
        } else if (Array.isArray(newData.references) && newData.references.length > 0) {
          _updatePhase('urlVerification', 'running');
          _verifyUrlsAfterSave(newData.references, setProjectData, currentProjectId, language, storageService);
          // Fire-and-forget — mark complete optimistically (actual completion is async)
          setTimeout(() => _updatePhase('urlVerification', 'completed'), 500);
        } else {
          _updatePhase('urlVerification', 'completed', 0);
        }
        setHasUnsavedTranslationChanges(true);

      } catch (e: any) {
        handleAIError(e, `generateSection(${sectionKey})`);
      } finally {
        // EO-137: Close progress modal + save timings
        setGenerationProgress(prev => {
          if (prev) _savePhaseTimings(prev.sectionKey, prev.phases);
          return prev ? { ...prev, visible: false } : null;
        });
        setIsLoading(false);
        isGeneratingRef.current = false;
        abortControllerRef.current = null;
      }
    },
    [
      projectData,
      language,
      t,
      closeModal,
      setProjectData,
      setHasUnsavedTranslationChanges,
      handleAIError,
      preGenerationGuard,
      currentProjectId,
      setModalConfig,
    ]
  );
  // ─── 3-option generation modal helper ──────────────────────────

  const show3OptionModal = useCallback(
    (onEnhance: () => void, onFill: () => void, onRegenerate: () => void) => {
      setModalConfig({
        isOpen: true,
        title: t.modals.generationChoiceTitle,
        message: t.modals.generationChoiceMsg,

        confirmText: t.modals.enhanceExistingBtn,
        confirmDesc: t.modals.enhanceExistingDesc,
        onConfirm: onEnhance,

        secondaryText: t.modals.fillMissingBtn,
        secondaryDesc: t.modals.fillMissingDesc,
        onSecondary: onFill,

        tertiaryText: t.modals.regenerateAllBtn,
        tertiaryDesc: t.modals.regenerateAllDesc,
        onTertiary: onRegenerate,

        cancelText: language === 'si' ? 'Prekliči' : 'Cancel',
        onCancel: closeModal,
      });
    },
    [t, language, setModalConfig, closeModal]
  );

  // ─── SMART Handle generate (4-level logic) ─────────────────────

    const handleGenerateSection = useCallback(
    async (sectionKey: string) => {
      if (!ensureApiKey()) {
        setIsSettingsOpen(true);
        return;
      }

      const otherLang = language === 'en' ? 'SI' : 'EN';

      const subMapping = SUB_SECTION_MAP[sectionKey];
      const contentCheckKey = subMapping ? subMapping.parent : sectionKey;

      // ★ v7.6 FIX: Read fresh data from current projectData to avoid stale closure
      var freshHasContent = false;
      if (subMapping) {
        var subData = projectData;
        for (var si = 0; si < subMapping.path.length; si++) {
          subData = subData ? subData[subMapping.path[si]] : undefined;
        }
        freshHasContent = hasDeepContent(subData);
      } else {
        freshHasContent = robustCheckSectionHasContent(sectionKey);
        if (!freshHasContent && projectData[sectionKey] && typeof projectData[sectionKey] === 'object' && !Array.isArray(projectData[sectionKey])) {
          var secObj = projectData[sectionKey];
          var secKeys = Object.keys(secObj);
          for (var ski = 0; ski < secKeys.length; ski++) {
            var secVal = secObj[secKeys[ski]];
            if (typeof secVal === 'string' && secVal.trim().length > 0) { freshHasContent = true; break; }
            if (secVal && typeof secVal === 'object' && !Array.isArray(secVal)) {
              var nestedVals = Object.values(secVal);
              for (var nvi = 0; nvi < nestedVals.length; nvi++) {
                if (typeof nestedVals[nvi] === 'string' && (nestedVals[nvi] as string).trim().length > 0) { freshHasContent = true; break; }
              }
              if (freshHasContent) break;
            }
            if (Array.isArray(secVal) && secVal.length > 0) {
              var hasArrContent = secVal.some(function(item) {
                if (!item || typeof item !== 'object') return false;
                return Object.values(item).some(function(v) { return typeof v === 'string' && (v as string).trim().length > 0; });
              });
              if (hasArrContent) { freshHasContent = true; break; }
            }
          }
          if (freshHasContent) {
            console.log('[handleGenerateSection] ★ v7.6: Deep check found content in "' + sectionKey + '" that robustCheck missed');
          }
        }
      }
      var currentHasContent = freshHasContent;


      const otherLangData = await checkOtherLanguageHasContent(contentCheckKey);

      if (otherLangData && !currentHasContent) {
        setModalConfig({
          isOpen: true,
          title:
            language === 'si'
              ? `Vsebina obstaja v ${otherLang}`
              : `Content exists in ${otherLang}`,
          message:
            language === 'si'
              ? `To poglavje že ima vsebino v ${otherLang} jeziku. Želite prevesti obstoječo vsebino ali generirati novo?`
              : `This section already has content in ${otherLang}. Would you like to translate existing content or generate new?`,
          confirmText:
            language === 'si'
              ? `Prevedi iz ${otherLang}`
              : `Translate from ${otherLang}`,
          secondaryText: language === 'si' ? 'Generiraj novo' : 'Generate new',
          cancelText: language === 'si' ? 'Prekliči' : 'Cancel',
          onConfirm: () => performTranslationFromOther(otherLangData),
          onSecondary: () => executeGeneration(sectionKey, 'regenerate'),
          onCancel: closeModal,
        });
        return;
      }

      if (otherLangData && currentHasContent) {
        setModalConfig({
          isOpen: true,
          title:
            language === 'si'
              ? `Vsebina obstaja v obeh jezikih`
              : `Content exists in both languages`,
          message:
            language === 'si'
              ? `To poglavje ima vsebino v slovenščini in angleščini. Kaj želite storiti?`
              : `This section has content in both SI and EN. What would you like to do?`,
          confirmText:
            language === 'si'
              ? 'Generiraj / izboljšaj trenutno'
              : 'Generate / enhance current',
          secondaryText:
            language === 'si'
              ? `Prevedi iz ${otherLang}`
              : `Translate from ${otherLang}`,
          cancelText: language === 'si' ? 'Prekliči' : 'Cancel',
          onConfirm: () => {
            closeModal();
            setTimeout(() => {
              show3OptionModal(
                () => executeGeneration(sectionKey, 'enhance'),
                () => executeGeneration(sectionKey, 'fill'),
                () => executeGeneration(sectionKey, 'regenerate')
              );
            }, 100);
          },
          onSecondary: () => performTranslationFromOther(otherLangData),
          onCancel: closeModal,
        });
        return;
      }

            if (currentHasContent) {
        show3OptionModal(
          () => executeGeneration(sectionKey, 'enhance'),
          () => executeGeneration(sectionKey, 'fill'),
          () => executeGeneration(sectionKey, 'regenerate')
        );
        return;
      }

      // ★ v7.6 FIX: For parent sections (problemAnalysis, projectIdea), check if ANY sub-field has content
      if (sectionKey === 'problemAnalysis' || sectionKey === 'projectIdea') {
        var parentData = projectData[sectionKey];
        if (parentData && typeof parentData === 'object' && Object.keys(parentData).length > 0) {
          var anyContent = false;
          for (var pKey in parentData) {
            if (parentData[pKey] && typeof parentData[pKey] === 'string' && parentData[pKey].trim().length > 0) { anyContent = true; break; }
            if (parentData[pKey] && typeof parentData[pKey] === 'object') {
              var pVals = Object.values(parentData[pKey]);
              if (pVals.some(function(v) { return typeof v === 'string' && (v as string).trim().length > 0; })) { anyContent = true; break; }
            }
          }
          if (anyContent) {
            console.log('[handleGenerateSection] ★ v7.6: Detected content in ' + sectionKey + ' sub-fields — offering fill option');
            show3OptionModal(
              () => executeGeneration(sectionKey, 'enhance'),
              () => executeGeneration(sectionKey, 'fill'),
              () => executeGeneration(sectionKey, 'regenerate')
            );
            return;
          }
        }
      }

      executeGeneration(sectionKey, 'regenerate');

    },
    [
      ensureApiKey,
      language,
      projectData,
      hasDeepContent,
      robustCheckSectionHasContent,
      checkOtherLanguageHasContent,
      executeGeneration,
      performTranslationFromOther,
      show3OptionModal,
      setModalConfig,
      closeModal,
      setIsSettingsOpen,
    ]
  );

    // ─── Composite generation (expectedResults OR activities) ───────

  const handleGenerateCompositeSection = useCallback(
    async (compositeSectionKey: string) => {
      if (!ensureApiKey()) {
        setIsSettingsOpen(true);
        return;
      }

      // EO-130d: Pre-compute refs toggle for this composite chapter
      const _compChapterKey = getChapterForSection(compositeSectionKey);
      const _compRefsEnabled: boolean = projectData._settings?.referencesEnabled?.[_compChapterKey]
        ?? DEFAULT_REFS_ENABLED[_compChapterKey]
        ?? false;
      console.log('[EO-130d] handleGenerateCompositeSection:', compositeSectionKey, '→ refsEnabled:', _compRefsEnabled);

      const COMPOSITE_MAP: Record<string, string[]> = {
        expectedResults: ['outputs', 'outcomes', 'impacts', 'kers'],
        activities: ['projectManagement', 'partners', 'activities', 'partnerAllocations', 'risks'],
      };

      const allSections = COMPOSITE_MAP[compositeSectionKey];
      if (!allSections) {
        console.error(`[handleGenerateCompositeSection] Unknown composite key: ${compositeSectionKey}`);
        return;
      }

      const isActivities = compositeSectionKey === 'activities';

            const checkableSections = isActivities
        ? ['projectManagement', 'partners', 'activities', 'risks']
        : allSections;

        const hasContentInSections = checkableSections.some((s) => {
        if (isActivities && s === 'projectManagement') {
          const hasWPs = Array.isArray(projectData.activities) && projectData.activities.some((wp: any) => wp.title?.trim() && wp.tasks?.length > 0 && wp.tasks.some((t: any) => t.title?.trim()));
          const hasPart = Array.isArray(projectData.partners) && projectData.partners.some((p: any) => p.name?.trim());
          if (!hasWPs && !hasPart) return false;
        }
        return robustCheckSectionHasContent(s);
      });

      const otherLang = language === 'en' ? 'SI' : 'EN';

      const hasRealContent = (data: any, sectionKey: string): boolean => {
        if (!data) return false;
        const section = data[sectionKey];
        if (!section) return false;
        if (Array.isArray(section)) {
          return section.length > 0 && section.some((item: any) => {
            if (!item || typeof item !== 'object') return false;
            return Object.entries(item).some(([key, val]) => {
              if (key === 'id' || key === 'startDate' || key === 'endDate' || key === 'startMonth' || key === 'endMonth' || key === 'dependencies' || key === 'leader' || key === 'participants') return false;
              if (typeof val === 'string') return val.trim().length > 0;
              if (Array.isArray(val)) return val.length > 0 && val.some((v: any) => {
                if (!v || typeof v !== 'object') return false;
                return Object.entries(v).some(([k2, v2]) => {
                  if (k2 === 'id' || k2 === 'dependencies') return false;
                  return typeof v2 === 'string' && v2.trim().length > 0;
                });
              });
              return false;
            });
          });
        }
        if (typeof section === 'object') {
          const desc = (section as any).description;
          if (typeof desc === 'string' && desc.trim().length > 0) return true;
          return false;
        }
        return false;
      };

      let otherLangData: any = null;
      for (const s of checkableSections) {
        const candidate = await checkOtherLanguageHasContent(s);
          if (candidate) {
          otherLangData = candidate;
          break;
        }
      }

      // ── Main composite runner ──
            const runComposite = async (mode: string) => {
        if (!preGenerationGuard(`composite-${compositeSectionKey}`)) return;

        isGeneratingRef.current = true;
        sessionCallCountRef.current++;

        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        const signal = abortController.signal;

        closeModal();
        setError(null);
        // [EO-137b-FIX2] setIsLoading(true) is called AFTER setGenerationProgress in each composite
        // path below, to prevent the fallback spinner from flashing before the progress modal.

        try {
          // ★ EO-095: Clear stale cache before full chapter regeneration
          if (mode === 'regenerate' && currentProjectId) {
            _clearSectionCache(currentProjectId);
          }

                    if (isActivities) {

            // ═══════════════════════════════════════════════
            // ACTIVITIES COMPOSITE — sequential with dependencies
            // ═══════════════════════════════════════════════
            var _compositeStartTime = Date.now(); // ★ EO-104: Track composite duration
            let newData = { ...projectData };
            const totalSteps = 5;
            let currentStep = 0;
            let successCount = 0;
            let firstFatalError: any = null;

            // [EO-130h] Fix 5.1 — Read chapter toggle once, applies to ALL composite steps
            const _chapterKey130h = getChapterForSection('activities');
            const _refsEnabled130h: boolean = projectData?._settings?.referencesEnabled?.[_chapterKey130h]
              ?? DEFAULT_REFS_ENABLED[_chapterKey130h]
              ?? false;
            console.log('[EO-130h] Activities composite: _refsEnabled130h =', _refsEnabled130h, '(chapter:', _chapterKey130h, ')');

            // [EO-130h] Fix 5.2 — Pre-composite cleanup: remove ALL old Activities references
            if (Array.isArray(newData.references)) {
              const _preCompBefore = newData.references.length;
              newData.references = newData.references.filter(function(r: any) {
                if (!r.sectionKey) return true;
                if (getChapterForSection(r.sectionKey) === 'activities') return false;
                if (r.sectionKey.startsWith('activities_wp')) return false;
                return true;
              });
              const _preCompRemoved = _preCompBefore - newData.references.length;
              if (_preCompRemoved > 0) {
                console.log('[EO-130h] Pre-composite cleanup: removed ' + _preCompRemoved + ' old refs for Activities chapter. Remaining: ' + newData.references.length);
              }
            }

            const stepLabel = (stepNum: number, siText: string, enText: string) => {
              return language === 'si'
                ? `${siText} (${stepNum}/${totalSteps})...`
                : `${enText} (${stepNum}/${totalSteps})...`;
            };

            const isRateLimitError = (e: any): boolean => {
              const msg = e?.message || e?.toString() || '';
              return msg.includes('RATE_LIMIT') || msg.includes('429') || msg.includes('Quota') || msg.includes('RESOURCE_EXHAUSTED');
            };

            // [EO-137b] Initialize progress modal for Activities composite
            const _actPhases = _makeActivitiesCompositePhases(_refsEnabled130h);
            setGenerationProgress({
              visible: true,
              sectionName: language === 'si' ? 'Aktivnosti in delovni načrt' : 'Activities & Work Plan',
              sectionKey: 'activities',
              phases: _actPhases,
              startTime: Date.now(),
              estimatedTotalMs: _getEstimatedTime('composite_activities', _actPhases),
              subProgress: '',
            });
            setIsLoading(true); // [EO-137b-FIX2] After progress modal — no fallback flash
            console.log('[EO-137b] Activities composite: progress modal initialized with', _actPhases.length, 'phases');

            // ── Step 1: Project Management ──
            currentStep++;
            if (signal.aborted) throw new DOMException('Generation cancelled', 'AbortError');
            setIsLoading(stepLabel(currentStep, 'Generiram implementacijo', 'Generating implementation'));
            _updatePhase('step1_pm', 'running');

              try {
              var pmContentRaw = await generateSectionContent(
                'projectManagement', newData, language, mode, null, signal, undefined, _compRefsEnabled
              );
              // ★ EO-102B: Step A — Extract _references from raw (but DON'T replace markers yet)
              var _pmExtractedAiRefs: any[] = [];
              if (pmContentRaw && typeof pmContentRaw === 'object' && !Array.isArray(pmContentRaw)) {
                if (Array.isArray(pmContentRaw._references)) {
                  _pmExtractedAiRefs = pmContentRaw._references;
                  delete pmContentRaw._references;
                  console.log('[EO-102B] PM: extracted ' + _pmExtractedAiRefs.length + ' _references from top-level');
                }
                // Check nested { projectManagement: {..., _references: [...]} }
                if (_pmExtractedAiRefs.length === 0 && pmContentRaw.projectManagement && typeof pmContentRaw.projectManagement === 'object') {
                  if (Array.isArray(pmContentRaw.projectManagement._references)) {
                    _pmExtractedAiRefs = pmContentRaw.projectManagement._references;
                    delete pmContentRaw.projectManagement._references;
                    console.log('[EO-102B] PM: extracted ' + _pmExtractedAiRefs.length + ' _references from nested projectManagement');
                  }
                }
              }

              // ★ EO-102B: Step B — Unwrap FIRST
              var pmContent = pmContentRaw;
              if (pmContent && typeof pmContent === 'object' && !Array.isArray(pmContent)) {
                if (pmContent.projectManagement && typeof pmContent.projectManagement === 'object' && !Array.isArray(pmContent.projectManagement)) {
                  console.log('[Composite/activities] ★ v7.8 UNWRAP: PM was double-wrapped { projectManagement: {...} }');
                  pmContent = pmContent.projectManagement;
                }
              }

              // ★ EO-102B: Step C — Merge into newData
              newData.projectManagement = {
                ...newData.projectManagement,
                ...pmContent,
                structure: {
                  ...(newData.projectManagement?.structure || {}),
                  ...(pmContent?.structure || {}),
                },
              };

              // ★ EO-102B: Step D — Re-attach refs and run pipeline on FINAL merged data
              // [EO-130h] Fix 5.3: Guard pipeline with chapter toggle
              if (_refsEnabled130h) {
                var _pmDataWithRefs = { ...newData.projectManagement, _references: _pmExtractedAiRefs };
                var _pmRefResult = _runFullReferencePipeline('projectManagement', _pmDataWithRefs, newData, {
                  setProjectData: setProjectData,
                  skipVerification: true, // EO-118: skip async URL verify inside composite — prevents post-renumber overwrite
                });
                // ★ EO-107: Pipeline Step 7 already replaced markers IN newData.projectManagement
                if (newData.projectManagement && newData.projectManagement._references) {
                  delete newData.projectManagement._references;
                }
                console.log('[Composite/activities] PM content check — description length:', newData.projectManagement?.description?.length || 0, '| refs added:', _pmRefResult.refsAdded);
              } else {
                console.log('[EO-130h] Refs OFF — skipping _runFullReferencePipeline for "projectManagement"');
                newData.projectManagement = _stripRefsFromObj(newData.projectManagement);
                console.log('[EO-130h] Safety strip applied to "projectManagement"');
              }

              successCount++;
              // [EO-138] Record PM usage
              if (pmContentRaw?._usage) _recordUsage(newData, 'projectManagement', pmContentRaw._usage, 'composite');
              _updatePhase('step1_pm', 'completed'); // [EO-137b]
                            // ★ EO-095: Cache successful PM result

              if (currentProjectId) _cacheSectionResult(currentProjectId, 'projectManagement', language, newData.projectManagement);
              console.log('[Composite/activities] Step 1/5: projectManagement ✅');

                        } catch (e: any) {
              if (e.name === 'AbortError') throw e;
              console.error('[Composite/activities] projectManagement failed:', e);
              _updatePhase('step1_pm', 'failed', undefined, e?.message?.substring(0, 60)); // [EO-137b]

              // ★ EO-104: If ModelOverloadedError, show fallback dialog IMMEDIATELY and stop composite
              if (e.name === 'ModelOverloadedError' && e.fallbackModel) {
                console.warn('[EO-104] ModelOverloadedError at Step 1 (PM) — showing fallback dialog immediately');
                if (!firstFatalError) firstFatalError = e;
                // Save whatever we have so far
                setProjectData(function(prev: any) {
                  var savedData = Object.assign({}, prev, newData);
                  if (currentProjectId) {
                    storageService.saveProject(savedData, language, currentProjectId).catch(function(se: any) { console.error('[EO-104] Save failed:', se); });
                  }
                  return savedData;
                });
                // Show dialog and STOP composite
                handleAIError(e, 'compositeActivities');
                setIsLoading(false);
                isGeneratingRef.current = false;
                abortControllerRef.current = null;
                return;
              }

              // ★ EO-095: Try to restore from cache
              if (currentProjectId) {
                var _cachedPM = _getCachedSectionResult(currentProjectId, 'projectManagement', language);
                if (_cachedPM) {
                  newData.projectManagement = _cachedPM;
                  successCount++;
                  console.log('[EO-095] Restored projectManagement from cache');
                } else {
                  if (!firstFatalError) firstFatalError = e;
                  if (isRateLimitError(e)) {
                    console.error('[Composite/activities] ★ RATE_LIMIT on step 1 — aborting composite');
                    handleAIError(e, 'compositeActivities');
                    setIsLoading(false);
                    isGeneratingRef.current = false;
                    abortControllerRef.current = null;
                    return;
                  }
                }
              } else {
                if (!firstFatalError) firstFatalError = e;
                if (isRateLimitError(e)) {
                  console.error('[Composite/activities] ★ RATE_LIMIT on step 1 — aborting composite');
                  handleAIError(e, 'compositeActivities');
                  setIsLoading(false);
                  isGeneratingRef.current = false;
                  abortControllerRef.current = null;
                  return;
                }
              }
            }

            // ★ EO-094: 15s rate-limiting pause between composite steps
            console.log('[EO-094] Waiting 15s before next composite step...');
            await new Promise(r => setTimeout(r, 15000));

            // ── Step 2: Partners (Consortium) ──

            currentStep++;
            if (signal.aborted) throw new DOMException('Generation cancelled', 'AbortError');
            setIsLoading(stepLabel(currentStep, 'Generiram konzorcij', 'Generating consortium'));
            _updatePhase('step2_partners', 'running'); // [EO-137b]

              try {
              let partnersResult = await generateSectionContent(
                'partners', newData, language, mode, null, signal, undefined, _compRefsEnabled
              );
              // ★ v7.8 FIX: Unwrap partners if AI returned object wrapper { partners: [...] }
              if (partnersResult && typeof partnersResult === 'object' && !Array.isArray(partnersResult)) {
                var _pValues = Object.values(partnersResult);
                var _pArr = _pValues.find(function(v) { return Array.isArray(v) && (v as any[]).length > 0; });
                if (_pArr) {
                  console.log('[Composite/activities] ★ v7.8 UNWRAP: partners was object, extracted array (' + (_pArr as any[]).length + ' items)');
                  partnersResult = _pArr as any[];
                } else {
                  console.warn('[Composite/activities] ★ v7.8 WARN: partners was object but no nested array found:', Object.keys(partnersResult));
                }
              }
              if (Array.isArray(partnersResult)) {

                partnersResult = partnersResult.map((p: any, idx: number) => ({
                  ...p,
                  id: p.id || `partner-${idx + 1}`,
                  code: p.code || (idx === 0 ? (language === 'si' ? 'KO' : 'CO') : `P${idx + 1}`),
                  partnerType: (p.partnerType && isValidPartnerType(p.partnerType))
                    ? p.partnerType
                    : 'other',
                }));
                newData.partners = partnersResult;
                successCount++;
                // [EO-138] Record partners usage
                if (partnersResult?._usage) _recordUsage(newData, 'partners', partnersResult._usage, 'composite');
                _updatePhase('step2_partners', 'completed'); // [EO-137b]
                // ★ EO-095: Cache successful partners result
                if (currentProjectId) _cacheSectionResult(currentProjectId, 'partners', language, newData.partners);
                console.log(`[Composite/activities] Step 2/5: partners ✅ (${partnersResult.length} partners)`);
              }
            } catch (e: any) {
              if (e.name === 'AbortError') throw e;
              console.error('[Composite/activities] partners failed:', e);
              _updatePhase('step2_partners', 'failed', undefined, e?.message?.substring(0, 60)); // [EO-137b]
              if (e.name === 'ModelOverloadedError' && e.fallbackModel) {
                console.warn('[EO-104] ModelOverloadedError at Step 2 (Partners) — showing fallback dialog');
                if (!firstFatalError) firstFatalError = e;
                setProjectData(function(prev: any) {
                  var savedData = Object.assign({}, prev, newData);
                  if (currentProjectId) {
                    storageService.saveProject(savedData, language, currentProjectId).catch(function(se: any) { console.error('[EO-104] Save failed:', se); });
                  }
                  return savedData;
                });
                handleAIError(e, 'compositeActivities');
                setIsLoading(false);
                isGeneratingRef.current = false;
                abortControllerRef.current = null;
                return;
              }

              // ★ EO-095: Try to restore from cache
              if (currentProjectId) {
                var _cachedPartners = _getCachedSectionResult(currentProjectId, 'partners', language);
                if (_cachedPartners) {
                  newData.partners = _cachedPartners;
                  successCount++;
                  console.log('[EO-095] Restored partners from cache');
                } else {
                  if (!firstFatalError) firstFatalError = e;
                  if (isRateLimitError(e) && successCount === 0) {
                    console.error('[Composite/activities] ★ RATE_LIMIT, 0 successes — aborting composite');
                    handleAIError(e, 'compositeActivities');
                    setIsLoading(false);
                    isGeneratingRef.current = false;
                    abortControllerRef.current = null;
                    return;
                  }
                }
              } else {
                if (!firstFatalError) firstFatalError = e;
                if (isRateLimitError(e) && successCount === 0) {
                  console.error('[Composite/activities] ★ RATE_LIMIT, 0 successes — aborting composite');
                  handleAIError(e, 'compositeActivities');
                  setIsLoading(false);
                  isGeneratingRef.current = false;
                  abortControllerRef.current = null;
                  return;
                }
              }
            }

            // ★ EO-094: 15s rate-limiting pause between composite steps
            console.log('[EO-094] Waiting 15s before next composite step...');
            await new Promise(r => setTimeout(r, 15000));

            // ── Step 3: Activities (WP per-WP generation) ──

            currentStep++;
            if (signal.aborted) throw new DOMException('Generation cancelled', 'AbortError');
            _updatePhase('step3_activities', 'running'); // [EO-137b]

            try {
              const existingWPs = Array.isArray(newData.activities) ? newData.activities : [];

              let activitiesResult;
              if (mode === 'regenerate' || existingWPs.length === 0) {
                activitiesResult = await generateActivitiesPerWP(
                  newData, language, mode,
                  (wpIndex: number, wpTotal: number, wpTitle: string) => {
                    if (wpIndex === -1) {
                      setIsLoading(stepLabel(currentStep, 'Generiram strukturo DS', 'Generating WP structure'));
                      setGenerationProgress(prev => prev ? { ...prev, subProgress: '' } : prev); // [EO-137b]
                    } else {
                      const _wpLoadLabel = language === 'si'
                        ? `Generiram DS ${wpIndex + 1}/${wpTotal}: ${wpTitle} (${currentStep}/${totalSteps})...`
                        : `Generating WP ${wpIndex + 1}/${wpTotal}: ${wpTitle} (${currentStep}/${totalSteps})...`;
                      setIsLoading(_wpLoadLabel);
                      setGenerationProgress(prev => prev ? { ...prev, subProgress: `WP ${wpIndex + 1}/${wpTotal}: ${wpTitle}` } : prev); // [EO-137b]
                    }
                  },
                  undefined, undefined, signal
                );
              } else if (mode === 'enhance') {
                activitiesResult = await generateSectionContent(
                  'activities', newData, language, 'enhance', null, signal, undefined, _compRefsEnabled
                );
              } else {
                const emptyWPIndices: number[] = [];
                existingWPs.forEach((wp: any, idx: number) => {
                  const hasTasks = wp.tasks?.length > 0 && wp.tasks.some((t: any) => t.title?.trim());
                  const hasMilestones = wp.milestones?.length > 0;
                  const hasDeliverables = wp.deliverables?.length > 0 && wp.deliverables.some((d: any) => d.title?.trim());
                  if (!hasTasks || !hasMilestones || !hasDeliverables) emptyWPIndices.push(idx);
                });

                if (emptyWPIndices.length > 0) {
                  activitiesResult = await generateActivitiesPerWP(
                    newData, language, 'fill',
                    (wpIndex: number, wpTotal: number, wpTitle: string) => {
                      if (wpIndex === -1) {
                        setIsLoading(stepLabel(currentStep, `Dopolnjujem ${emptyWPIndices.length} DS`, `Filling ${emptyWPIndices.length} WPs`));
                      } else {
                        setIsLoading(
                          language === 'si'
                            ? `Dopolnjujem DS ${wpIndex + 1}/${wpTotal}: ${wpTitle} (${currentStep}/${totalSteps})...`
                            : `Filling WP ${wpIndex + 1}/${wpTotal}: ${wpTitle} (${currentStep}/${totalSteps})...`
                        );
                      }
                    },
                    existingWPs, emptyWPIndices, signal
                  );
                } else {
                  activitiesResult = existingWPs;
                }
              }

              if (Array.isArray(activitiesResult)) {
                newData.activities = activitiesResult;
              } else if (activitiesResult && Array.isArray(activitiesResult.activities)) {
                newData.activities = activitiesResult.activities;
              }

              const schedResult = recalculateProjectSchedule(newData);
              newData = schedResult.projectData;

              // ★ EO-105: Run reference pipeline for each WP in activities
              // [EO-130h] Fix 5.4: Guard entire WP ref pipeline with chapter toggle
              if (_refsEnabled130h) {
                if (Array.isArray(newData.activities)) {
                  for (var _wpRefIdx = 0; _wpRefIdx < newData.activities.length; _wpRefIdx++) {
                    var _wpForRefs = newData.activities[_wpRefIdx];
                    if (_wpForRefs && typeof _wpForRefs === 'object') {
                      var _wpSectionKey = 'activities_wp' + (_wpRefIdx + 1);
                      // Temporarily put WP data under newData[sectionKey] for pipeline marker replacement
                      newData[_wpSectionKey] = _wpForRefs;
                      var _wpRefResult = _runFullReferencePipeline(_wpSectionKey, _wpForRefs, newData, {
                        setProjectData: setProjectData,
                        skipVerification: true,
                      });
                      // Copy back replaced data into activities array
                      if (newData[_wpSectionKey]) {
                        newData.activities[_wpRefIdx] = newData[_wpSectionKey];
                      }
                      // Clean up temporary key
                      delete newData[_wpSectionKey];
                      if (_wpRefResult.refsAdded > 0) {
                        console.log('[EO-105] WP' + (_wpRefIdx + 1) + ': ' + _wpRefResult.refsAdded + ' refs created (sectionKey: ' + _wpSectionKey + ')');
                      }
                    }
                  }
                  console.log('[EO-105] Activities reference pipeline complete — total refs: ' + (newData.references || []).length);
                }
              } else {
                console.log('[EO-130h] Refs OFF — skipping ENTIRE WP reference pipeline');
                // Strip [N] markers from all WP descriptions
                if (Array.isArray(newData.activities)) {
                  for (var _wpStripIdx = 0; _wpStripIdx < newData.activities.length; _wpStripIdx++) {
                    newData.activities[_wpStripIdx] = _stripRefsFromObj(newData.activities[_wpStripIdx]);
                  }
                  console.log('[EO-130h] Stripped [N] markers from ' + newData.activities.length + ' WP descriptions');
                }
              }

              successCount++;

              // [EO-138] Record activities usage (enhance path carries _usage directly)
              if ((activitiesResult as any)?._usage) _recordUsage(newData, 'activities', (activitiesResult as any)._usage, 'composite');
              _updatePhase('step3_activities', 'completed'); // [EO-137b]
              setGenerationProgress(prev => prev ? { ...prev, subProgress: '' } : prev); // [EO-137b] clear WP detail

              // ★ EO-095: Cache successful activities result
              if (currentProjectId) _cacheSectionResult(currentProjectId, 'activities', language, newData.activities);
              console.log(`[Composite/activities] Step 3/5: activities ✅ (${(newData.activities || []).length} WPs)`);
            } catch (e: any) {
              if (e.name === 'AbortError') throw e;
              console.error('[Composite/activities] activities failed:', e);
              _updatePhase('step3_activities', 'failed', undefined, e?.message?.substring(0, 60)); // [EO-137b]
              // ★ EO-104: Fast fallback for ModelOverloadedError
              if (e.name === 'ModelOverloadedError' && e.fallbackModel) {
                console.warn('[EO-104] ModelOverloadedError at Step 3 (Activities) — showing fallback dialog');
                if (!firstFatalError) firstFatalError = e;
                setProjectData(function(prev: any) {
                  var savedData = Object.assign({}, prev, newData);
                  if (currentProjectId) {
                    storageService.saveProject(savedData, language, currentProjectId).catch(function(se: any) { console.error('[EO-104] Save failed:', se); });
                  }
                  return savedData;
                });
                handleAIError(e, 'compositeActivities');
                setIsLoading(false);
                isGeneratingRef.current = false;
                abortControllerRef.current = null;
                return;
              }

              // ★ EO-095: Try to restore from cache
              if (currentProjectId) {
                var _cachedActivities = _getCachedSectionResult(currentProjectId, 'activities', language);
                if (_cachedActivities) {
                  newData.activities = _cachedActivities;
                  successCount++;
                  console.log('[EO-095] Restored activities from cache');
                } else {
                  if (!firstFatalError) firstFatalError = e;
                }
              } else {
                if (!firstFatalError) firstFatalError = e;
              }
            }

            // ★ EO-094: 15s rate-limiting pause between composite steps
            console.log('[EO-094] Waiting 15s before next composite step...');
            await new Promise(r => setTimeout(r, 15000));

            // ── Step 4: Partner Allocations ──

            currentStep++;
            if (signal.aborted) throw new DOMException('Generation cancelled', 'AbortError');

            const pa_partners = Array.isArray(newData.partners) ? newData.partners : [];
            const pa_activities = Array.isArray(newData.activities) ? newData.activities : [];

            if (pa_partners.length > 0 && pa_activities.length > 0) {
              setIsLoading(stepLabel(currentStep, 'Generiram alokacije partnerjev', 'Generating partner allocations'));
              _updatePhase('step4_allocations', 'running'); // [EO-137b]

              try {
                const allocResult = await generatePartnerAllocations(
                  newData, language,
                  (msg: string) => setIsLoading(`${msg} (${currentStep}/${totalSteps})`),
                  signal
                );

                const updatedActivities = pa_activities.map((wp: any) => ({
                  ...wp,
                  tasks: (wp.tasks || []).map((task: any) => {
                    const taskAlloc = allocResult.find((a: any) => a.taskId === task.id);
                    if (taskAlloc?.allocations?.length > 0) {
                      return { ...task, partnerAllocations: taskAlloc.allocations };
                    }
                    return task;
                  }),
                }));
                newData.activities = updatedActivities;

                const totalAllocations = allocResult.reduce((s: number, t: any) => s + (t.allocations?.length || 0), 0);
                successCount++;
                _updatePhase('step4_allocations', 'completed'); // [EO-137b]
                console.log(`[Composite/activities] Step 4/5: partnerAllocations ✅ (${totalAllocations} allocations)`);
                } catch (e: any) {
                if (e.name === 'AbortError') throw e;
                console.error('[Composite/activities] partnerAllocations failed:', e);
                _updatePhase('step4_allocations', 'failed', undefined, e?.message?.substring(0, 60)); // [EO-137b]
                // ★ EO-104: Fast fallback for ModelOverloadedError
                if (e.name === 'ModelOverloadedError' && e.fallbackModel) {
                  console.warn('[EO-104] ModelOverloadedError at Step 4 (Allocations) — showing fallback dialog');
                  if (!firstFatalError) firstFatalError = e;
                  setProjectData(function(prev: any) {
                    var savedData = Object.assign({}, prev, newData);
                    if (currentProjectId) {
                      storageService.saveProject(savedData, language, currentProjectId).catch(function(se: any) { console.error('[EO-104] Save failed:', se); });
                    }
                    return savedData;
                  });
                  handleAIError(e, 'compositeActivities');
                  setIsLoading(false);
                  isGeneratingRef.current = false;
                  abortControllerRef.current = null;
                  return;
                }
                if (!firstFatalError) firstFatalError = e;
              }
            } else {
              console.log(`[Composite/activities] Step 4/5: partnerAllocations ⏭ SKIPPED (partners: ${pa_partners.length}, activities: ${pa_activities.length})`);
              _updatePhase('step4_allocations', 'skipped'); // [EO-137b]
            }

            // ★ EO-094: 15s rate-limiting pause between composite steps
            console.log('[EO-094] Waiting 15s before next composite step...');
            await new Promise(r => setTimeout(r, 15000));

            // ── Step 5: Risks ──
            currentStep++;
            if (signal.aborted) throw new DOMException('Generation cancelled', 'AbortError');
            setIsLoading(stepLabel(currentStep, 'Generiram tveganja', 'Generating risks'));
            _updatePhase('step5_risks', 'running'); // [EO-137b]

                        try {
            var risksContentRaw = await generateSectionContent(
                'risks', newData, language, mode, null, signal, undefined, _compRefsEnabled
              );
              // ★ EO-102B: Step A — Extract _references from raw
              var _risksExtractedAiRefs: any[] = [];
              if (risksContentRaw && typeof risksContentRaw === 'object' && !Array.isArray(risksContentRaw)) {
                if (Array.isArray(risksContentRaw._references)) {
                  _risksExtractedAiRefs = risksContentRaw._references;
                  delete risksContentRaw._references;
                  console.log('[EO-102B] Risks: extracted ' + _risksExtractedAiRefs.length + ' _references from top-level');
                }
              }

              // ★ EO-102B: Step B — Unwrap FIRST
              var risksContent = risksContentRaw;
              if (risksContent && typeof risksContent === 'object' && !Array.isArray(risksContent) && Array.isArray((risksContent as any).risks)) {
                risksContent = (risksContent as any).risks;
              }

              // ★ EO-102B: Step C — Save unwrapped risks into newData
              if (Array.isArray(risksContent)) {
                newData.risks = risksContent;
              } else {
                console.warn('[Composite/activities] risks: unexpected format, keeping original');
              }

              // ★ EO-102B: Step D — Run pipeline on FINAL unwrapped data with re-attached refs
              // [EO-130h] Fix 5.3: Guard pipeline with chapter toggle
              if (_refsEnabled130h && Array.isArray(newData.risks) && _risksExtractedAiRefs.length > 0) {
                var _risksWrapper = { risks: newData.risks, _references: _risksExtractedAiRefs };
                var _risksRefResult = _runFullReferencePipeline('risks', _risksWrapper, newData, {
                  setProjectData: setProjectData,
                  skipVerification: true, // EO-118: skip async URL verify inside composite — prevents post-renumber overwrite
                });
                var _risksFixed = newData.risks;
                if (_risksFixed && !Array.isArray(_risksFixed)) {
                  if (_risksFixed._references) delete _risksFixed._references;
                  if (Array.isArray(_risksFixed.risks)) {
                    newData.risks = _risksFixed.risks;
                  }
                }
                if (_risksRefResult.refsAdded > 0) {
                  console.log('[EO-102B] Risks: ' + _risksRefResult.refsAdded + ' refs extracted, markers replaced in UNWRAPPED data');
                }
              } else if (!_refsEnabled130h) {
                console.log('[EO-130h] Refs OFF — skipping _runFullReferencePipeline for "risks"');
                newData.risks = _stripRefsFromObj(newData.risks);
                console.log('[EO-130h] Safety strip applied to "risks"');
              }

              if (Array.isArray(newData.risks)) {
                newData.risks = newData.risks.map((item: any, idx: number) => ({
                  ...item,
                  id: (item.id && item.id.trim()) ? item.id : `RISK${idx + 1}`,
                }));
              }
              successCount++;
              // [EO-138] Record risks usage
              if (risksContentRaw?._usage) _recordUsage(newData, 'risks', risksContentRaw._usage, 'composite');
              _updatePhase('step5_risks', 'completed'); // [EO-137b]
              // ★ EO-095: Cache successful risks result
              if (currentProjectId) _cacheSectionResult(currentProjectId, 'risks', language, newData.risks);
              console.log(`[Composite/activities] Step 5/5: risks ✅`);
            } catch (e: any) {
              if (e.name === 'AbortError') throw e;
              console.error('[Composite/activities] risks failed:', e);
              _updatePhase('step5_risks', 'failed', undefined, e?.message?.substring(0, 60)); // [EO-137b]
              if (e.name === 'ModelOverloadedError' && e.fallbackModel) {
                console.warn('[EO-104] ModelOverloadedError at Step 5 (Risks) — showing fallback dialog');
                if (!firstFatalError) firstFatalError = e;
                setProjectData(function(prev: any) {
                  var savedData = Object.assign({}, prev, newData);
                  if (currentProjectId) {
                    storageService.saveProject(savedData, language, currentProjectId).catch(function(se: any) { console.error('[EO-104] Save failed:', se); });
                  }
                  return savedData;
                });
                handleAIError(e, 'compositeActivities');
                setIsLoading(false);
                isGeneratingRef.current = false;
                abortControllerRef.current = null;
                return;
              }

              // ★ EO-095: Try to restore from cache
              if (currentProjectId) {
                var _cachedRisks = _getCachedSectionResult(currentProjectId, 'risks', language);
                if (_cachedRisks) {
                  newData.risks = _cachedRisks;
                  successCount++;
                  console.log('[EO-095] Restored risks from cache');
                } else {
                  if (!firstFatalError) firstFatalError = e;
                }
              } else {
                if (!firstFatalError) firstFatalError = e;
              }
            }

            console.log(`[Composite/activities] Result: ${successCount}/${totalSteps} steps succeeded`);
            // ★ EO-104: Detect slow-but-successful composite — offer model switch even when all steps succeed
// If total composite time exceeded 10 minutes, the model is clearly struggling
var _compositeEndTime = Date.now();
var _compositeElapsedMs = _compositeEndTime - _compositeStartTime;
var _compositeElapsedMin = Math.round(_compositeElapsedMs / 60000);
console.log('[EO-104] Composite total time: ' + _compositeElapsedMin + ' min (' + _compositeElapsedMs + 'ms)');

if (_compositeElapsedMs > 600000 && successCount === totalSteps) {
  // All steps succeeded, but it took >10 minutes — model is overloaded
  var _eo104Config = getProviderConfig();
  var _eo104Fallback = getFallbackModel(_eo104Config.model);
  if (_eo104Fallback) {
    console.warn('[EO-104] All steps succeeded but took ' + _compositeElapsedMin + ' min — suggesting model switch');
    setModalConfig({
      isOpen: true,
      title: language === 'si' ? 'Generiranje uspelo — model je počasen' : 'Generation succeeded — model is slow',
      message: language === 'si'
        ? 'Vse aktivnosti so bile uspešno generirane, vendar je trajalo ' + _compositeElapsedMin + ' minut (normalno: 3–5 min).\n\n'
          + 'Model "' + _eo104Config.model + '" je trenutno pod velikim pritiskom.\n\n'
          + 'Za hitrejše generiranje priporočamo zamenjavo na:\n'
          + '★ ' + _eo104Fallback.name + '\n\n'
          + 'Ta model je na ločeni infrastrukturi in je bistveno hitrejši.'
        : 'All activities were generated successfully, but it took ' + _compositeElapsedMin + ' minutes (normal: 3–5 min).\n\n'
          + 'Model "' + _eo104Config.model + '" is currently under heavy load.\n\n'
          + 'For faster generation, we recommend switching to:\n'
          + '★ ' + _eo104Fallback.name + '\n\n'
          + 'This model runs on separate infrastructure and is significantly faster.',
      confirmText: language === 'si' ? 'Preklopi na ' + _eo104Fallback.name : 'Switch to ' + _eo104Fallback.name,
      secondaryText: language === 'si' ? 'Obdrži trenutni model' : 'Keep current model',
      cancelText: '',
      onConfirm: function() {
        closeModal();
        storageService.setCustomModel(_eo104Fallback.id);
        console.log('[EO-104] User switched to fallback: ' + _eo104Fallback.id);
        setError(language === 'si' ? 'Model spremenjen na ' + _eo104Fallback.name + '.' : 'Model switched to ' + _eo104Fallback.name + '.');
        setTimeout(function() { setError(null); }, 5000);
      },
      onSecondary: closeModal,
      onCancel: closeModal,
    });
  }
}
            if (successCount === 0 && firstFatalError) {
              console.error('[Composite/activities] ★ ALL STEPS FAILED — showing error modal');
              handleAIError(firstFatalError, 'compositeActivities');
              return;
            }

            // ★ v7.12 EO-045: Validation gate for activities composite — validate key sections
            try {
              var _actValCtx = _buildValidationContext(newData, language);
              var _actValWarnings: string[] = [];
              var _actValSectionsToCheck = ['activities', 'risks', 'partners', 'projectManagement'];
              for (var _avsi = 0; _avsi < _actValSectionsToCheck.length; _avsi++) {
                var _avSec = _actValSectionsToCheck[_avsi];
                var _avData = newData[_avSec];
                if (_avData) {
                  try {
                    var _avReport = validateSectionOutput(_avSec, _avData, _actValCtx);
                    var _avFiltered = _filterValidationIssues(_avReport);
                    console.log('[EO-045 VALIDATION composite/activities] ' + _avSec + ': raw FATAL=' + _avReport.fatalCount + ' → filtered FATAL=' + _avFiltered.fatalCount + ' HIGH=' + _avFiltered.highCount);
                    if (_avFiltered.fatalCount > 0 || _avFiltered.highCount > 0) {
                      _actValWarnings.push(_avSec + ': ' + _avFiltered.fatalCount + (language === 'si' ? ' dopolnitev' : ' needs attention') + ', ' + _avFiltered.highCount + (language === 'si' ? ' priporocil' : ' recommendations'));
                      }
                  } catch (_avErr) {
                    console.error('[EO-045 VALIDATION composite/activities] Validator crashed for ' + _avSec + ':', _avErr);
                  }
                }
              }
              if (_actValWarnings.length > 0) {
                console.warn('[EO-045 VALIDATION composite/activities] ★ WARNINGS:\n' + _actValWarnings.join('\n'));
                setModalConfig({
                  isOpen: true,
                  title: language === 'si' ? '\uD83D\uDCA1 Priporocila za aktivnosti' : '\uD83D\uDCA1 Activities Suggestions',
                  message: (language === 'si'
                    ? 'Aktivnosti so bile shranjene. Nekaj priporocil za izboljsavo:\n\n'
                    : 'Activities were saved. Here are some suggestions for improvement:\n\n')
                    + _actValWarnings.join('\n')
                    + (language === 'si' ? '\n\nPreveri vsebino in po potrebi popravi.' : '\n\nReview the content and fix if needed.'),
                  confirmText: language === 'si' ? 'V redu' : 'OK',
                  secondaryText: '',
                  cancelText: '',
                  onConfirm: closeModal,
                  onSecondary: null,
                  onCancel: closeModal,
                });
              }
            } catch (_actValErr) {
              console.error('[EO-045 VALIDATION composite/activities] Validator crashed (non-fatal):', _actValErr);
            }

            // ★ EO-106: Auto-fill empty critical fields after composite — BEFORE save
            if (successCount > 0 && !signal.aborted) {
              newData = await _autoFillEmptyCriticalFields(
                newData, ['projectManagement', 'problemAnalysis', 'projectIdea'],
                language, signal, setIsLoading, generateObjectFill
              );
            }

            // [EO-130h] Fix 5.7 — Final cleanup BEFORE save: remove stray refs + strip [N] from all sub-sections
            if (!_refsEnabled130h) {
              if (Array.isArray(newData.references)) {
                var _finalBefore130h = newData.references.length;
                newData.references = newData.references.filter(function(r: any) {
                  if (!r.sectionKey) return true;
                  if (getChapterForSection(r.sectionKey) === 'activities') return false;
                  if (r.sectionKey.startsWith('activities_wp')) return false;
                  return true;
                });
                var _finalRemoved130h = _finalBefore130h - newData.references.length;
                if (_finalRemoved130h > 0) {
                  console.log('[EO-130h] Final cleanup: removed ' + _finalRemoved130h + ' stray refs. Total now: ' + newData.references.length);
                }
              }
              // Strip [N] from all activities sub-sections
              var _actSubKeys130h = ['projectManagement', 'partners', 'risks'];
              for (var _askIdx = 0; _askIdx < _actSubKeys130h.length; _askIdx++) {
                if (newData[_actSubKeys130h[_askIdx]]) {
                  newData[_actSubKeys130h[_askIdx]] = _stripRefsFromObj(newData[_actSubKeys130h[_askIdx]]);
                }
              }
              if (Array.isArray(newData.activities)) {
                for (var _fwpIdx = 0; _fwpIdx < newData.activities.length; _fwpIdx++) {
                  newData.activities[_fwpIdx] = _stripRefsFromObj(newData.activities[_fwpIdx]);
                }
              }
              console.log('[EO-130h] Final composite cleanup DONE — all activities refs and [N] markers removed');
            }

            // EO-115: Renumber all references sequentially after composite
            // [EO-130h] Fix 5.8 — skip renumber if refs disabled (nothing to renumber)
            _updatePhase('referenceProcessing', _refsEnabled130h ? 'running' : 'skipped'); // [EO-137b]
            if (_refsEnabled130h) {
              _renumberAllReferences(newData);
              _updatePhase('referenceProcessing', 'completed'); // [EO-137b]
            } else {
              console.log('[EO-130h] Refs OFF — skipping EO-115 renumber for activities composite');
            }

            _updatePhase('saving', 'running'); // [EO-137b]
            setProjectData((prev: any) => {
              const savedData = { ...prev, ...newData };
              if (currentProjectId) {
                storageService.saveProject(savedData, language, currentProjectId)
                  .then(() => {
                    console.log(`[Composite/activities] ★ Explicit save — SUCCESS`);
                    _updatePhase('saving', 'completed'); // [EO-137b]
                  })
                  .catch((e: any) => console.error(`[Composite/activities] ★ Explicit save failed:`, e));
              }
              return savedData;
            });
            // EO-131: Async URL verification AFTER renumber + save — fire-and-forget, never overwrites inlineMarker
            // [EO-130h] Fix 5.6 — skip URL verification when refs disabled
            if (!_refsEnabled130h) {
              console.log('[EO-130h] Refs OFF — skipping URL verification after activities composite');
              _updatePhase('urlVerification', 'skipped'); // [EO-137b]
            } else if (Array.isArray(newData.references) && newData.references.length > 0) {
              _updatePhase('urlVerification', 'running'); // [EO-137b]
              _verifyUrlsAfterSave(newData.references, setProjectData, currentProjectId, language, storageService);
              setTimeout(() => _updatePhase('urlVerification', 'completed'), 500); // [EO-137b]
            } else {
              _updatePhase('urlVerification', 'skipped'); // [EO-137b]
            }
            setHasUnsavedTranslationChanges(true);
            console.log(`[Composite/activities] DONE — ${successCount}/${totalSteps} steps succeeded ✅`);

                               if (successCount > 0 && successCount < totalSteps && firstFatalError) {
              const failedCount = totalSteps - successCount;
              // ★ EO-099: Check for ModelOverloadedError with fallback suggestion
              if (firstFatalError.name === 'ModelOverloadedError' && firstFatalError.fallbackModel) {
                var _fbm = firstFatalError.fallbackModel;
                var _waitMin = Math.ceil(firstFatalError.totalWaitMs / 60000);
                setModalConfig({
                  isOpen: true,
                  title: language === 'si' ? 'Model preobremenjen — predlagamo zamenjavo' : 'Model Overloaded — Switch Recommended',
                  message: language === 'si'
                    ? `Uspešno generirano: ${successCount} od ${totalSteps} korakov.\n\n${failedCount} korakov ni uspelo ker je model "${firstFatalError.model}" preobremenjen (${firstFatalError.retriesExhausted} poskusov v ~${_waitMin} min).\n\nTo se zgodi zaradi velikega prometa pri AI ponudniku.\n\nPriporočamo zamenjavo na hitrejši model:\n★ ${_fbm.name}\n\nTa model je na ločeni infrastrukturi in je skoraj vedno dosegljiv.`
                    : `Successfully generated: ${successCount} of ${totalSteps} steps.\n\n${failedCount} steps failed because model "${firstFatalError.model}" is overloaded (${firstFatalError.retriesExhausted} retries over ~${_waitMin} min).\n\nThis happens due to high traffic at the AI provider.\n\nWe recommend switching to a faster model:\n★ ${_fbm.name}\n\nThis model runs on separate infrastructure and is almost always available.`,
                  confirmText: language === 'si' ? 'Preklopi na ' + _fbm.name : 'Switch to ' + _fbm.name,
                  secondaryText: language === 'si' ? 'Počakaj 2 min in poskusi znova' : 'Wait 2 min and retry',
                  cancelText: language === 'si' ? 'V redu' : 'OK',
                  onConfirm: function() {
                    closeModal();
                    storageService.setCustomModel(_fbm.id);
                    console.log('[EO-099] Switched model to fallback: ' + _fbm.id);
                    setError(language === 'si' ? 'Model spremenjen na ' + _fbm.name + '. Poskusite ponovno.' : 'Model switched to ' + _fbm.name + '. Please try again.');
                    setTimeout(function() { setError(null); }, 5000);
                  },
                  onSecondary: function() {
                    closeModal();
                    setError(language === 'si' ? 'Čakam 2 minuti...' : 'Waiting 2 minutes...');
                    setTimeout(function() { setError(null); }, 120000);
                  },
                  onCancel: () => closeModal(),
                });
              } else if (firstFatalError && ((firstFatalError.message || '').includes('INVALID_JSON') || (firstFatalError.message || '').includes('not valid JSON'))) {
                // ★ EO-111: INVALID_JSON in composite — offer retry + model switch (not just generic dialog)
                var _eo111Config = getProviderConfig();
                var _eo111Fallback = getFallbackModel(_eo111Config.model);
                var _eo111FailedCount = totalSteps - successCount;
                setModalConfig({
                  isOpen: true,
                  title: language === 'si' ? 'Napaka formata — ponovi?' : 'Format Error — Retry?',
                  message: language === 'si'
                    ? 'Uspešno generirano: ' + successCount + ' od ' + totalSteps + ' korakov.\n\n' + _eo111FailedCount + ' korakov ni uspelo ker je AI vrnil nepravilen format (ni veljaven JSON).\n\nTo se občasno zgodi — AI modeli niso vedno 100% zanesljivi pri strukturiranih odgovorih.\n\nPoskusite ponovno ali zamenjajte model.'
                    : 'Successfully generated: ' + successCount + ' of ' + totalSteps + ' steps.\n\n' + _eo111FailedCount + ' steps failed because the AI returned invalid format (not valid JSON).\n\nThis happens occasionally — AI models are not always 100% reliable with structured responses.\n\nTry again or switch models.',
                  confirmText: language === 'si' ? 'Poskusi znova' : 'Try again',
                  secondaryText: _eo111Fallback
                    ? (language === 'si' ? 'Preklopi na ' + _eo111Fallback.name : 'Switch to ' + _eo111Fallback.name)
                    : (language === 'si' ? 'Odpri nastavitve' : 'Open Settings'),
                  cancelText: language === 'si' ? 'V redu' : 'OK',
                  onConfirm: function() { closeModal(); runComposite(mode); },
                  onSecondary: _eo111Fallback
                    ? function() {
                        closeModal();
                        storageService.setCustomModel(_eo111Fallback.id);
                        console.log('[EO-111] Switched model to fallback: ' + _eo111Fallback.id);
                        setError(language === 'si'
                          ? 'Model spremenjen na ' + _eo111Fallback.name + '. Poskusite ponovno.'
                          : 'Model switched to ' + _eo111Fallback.name + '. Please try again.');
                        setTimeout(function() { setError(null); }, 5000);
                      }
                    : function() { closeModal(); setIsSettingsOpen(true); },
                  onCancel: closeModal,
                });
              } else {
                const isRL = isRateLimitError(firstFatalError);
                setModalConfig({
                  isOpen: true,
                  title: language === 'si'
                    ? (isRL ? 'Omejitev API klicev' : 'Delna generacija aktivnosti')
                    : (isRL ? 'API Rate Limit Reached' : 'Partial Activities Generation'),
                  message: language === 'si'
                    ? `Uspešno generirano: ${successCount} od ${totalSteps} korakov.\n\n${failedCount} korakov ni uspelo${isRL ? ' zaradi omejitve API ponudnika.\n\nPočakajte 1–2 minuti in poskusite ponovno za manjkajoče dele, ali preklopite na drug model v Nastavitvah.' : '.\n\nPoskusite ponovno za manjkajoče dele.'}`
                    : `Successfully generated: ${successCount} of ${totalSteps} steps.\n\n${failedCount} steps failed${isRL ? ' due to API rate limits.\n\nWait 1–2 minutes and try again for missing parts, or switch models in Settings.' : '.\n\nTry again for missing parts.'}`,
                  confirmText: language === 'si' ? 'V redu' : 'OK',
                  secondaryText: language === 'si' ? 'Odpri nastavitve' : 'Open Settings',
                  cancelText: '',
                  onConfirm: () => closeModal(),
                  onSecondary: () => { closeModal(); setIsSettingsOpen(true); },
                  onCancel: () => closeModal(),
                });
              }
            }

          } else {
            // ═══════════════════════════════════════════════
            // EXPECTED RESULTS COMPOSITE — with v7.7 smart merge
            // ═══════════════════════════════════════════════

            let successCount = 0;
            let skippedCount = 0;
            let lastError: any = null;

            let sectionsToProcess: { key: string; action: 'fill' | 'generate' | 'enhance' | 'regenerate'; emptyIndices: number[] }[] = [];

            if (mode === 'fill') {
              for (const s of allSections) {
                const status = sectionNeedsGeneration(s);
                if (status.needsFullGeneration) {
                  sectionsToProcess.push({ key: s, action: 'generate', emptyIndices: [] });
                } else if (status.needsFill) {
                  sectionsToProcess.push({ key: s, action: 'fill', emptyIndices: status.emptyIndices });
                }
              }

              if (sectionsToProcess.length === 0) {
                setModalConfig({
                  isOpen: true,
                  title: language === 'si' ? 'Vse je izpolnjeno' : 'Everything is filled',
                  message: language === 'si'
                    ? 'Vsi razdelki pričakovanih rezultatov so že izpolnjeni. Če želite izboljšati vsebino, uporabite možnost "Izboljšaj obstoječe".'
                    : 'All expected results sections are already filled. To improve content, use the "Enhance existing" option.',
                  confirmText: language === 'si' ? 'V redu' : 'OK',
                  secondaryText: '',
                  cancelText: '',
                  onConfirm: () => closeModal(),
                  onSecondary: null,
                  onCancel: () => closeModal(),
                });
                setIsLoading(false);
                isGeneratingRef.current = false;
                abortControllerRef.current = null;
                return;
              }
            } else if (mode === 'enhance') {
              for (const s of allSections) {
                const status = sectionNeedsGeneration(s);
                if (!status.needsFullGeneration) {
                  sectionsToProcess.push({ key: s, action: 'enhance', emptyIndices: [] });
                }
              }
              if (sectionsToProcess.length === 0) {
                setModalConfig({
                  isOpen: true,
                  title: language === 'si' ? 'Ni vsebine za izboljšanje' : 'No content to enhance',
                  message: language === 'si'
                    ? 'Nobeden razdelek nima vsebine za izboljšanje. Uporabite možnost "Generiraj vse na novo".'
                    : 'No sections have content to enhance. Use the "Regenerate all" option.',
                  confirmText: language === 'si' ? 'V redu' : 'OK',
                  secondaryText: '',
                  cancelText: '',
                  onConfirm: () => closeModal(),
                  onSecondary: null,
                  onCancel: () => closeModal(),
                });
                setIsLoading(false);
                isGeneratingRef.current = false;
                abortControllerRef.current = null;
                return;
              }
            } else {
              sectionsToProcess = allSections.map(s => ({ key: s, action: 'regenerate' as const, emptyIndices: [] }));
            }

            const totalToProcess = sectionsToProcess.length;
            skippedCount = allSections.length - totalToProcess;

            const modeLabels: Record<string, { si: string; en: string }> = {
              fill: { si: 'Dopolnjujem', en: 'Filling' },
              generate: { si: 'Generiram', en: 'Generating' },
              enhance: { si: 'Izboljšujem', en: 'Enhancing' },
              regenerate: { si: 'Generiram na novo', en: 'Regenerating' },
            };

            const waitLabel = language === 'si' ? 'Čakam na API kvoto' : 'Waiting for API quota';

            // [EO-137b] Initialize progress modal for Expected Results composite
            const _erSectionKeys = sectionsToProcess.map(sp => sp.key);
            const _erPhases = _makeExpectedResultsCompositePhases(_erSectionKeys, _compRefsEnabled);
            setGenerationProgress({
              visible: true,
              sectionName: language === 'si' ? 'Pričakovani rezultati' : 'Expected Results',
              sectionKey: 'expectedResults',
              phases: _erPhases,
              startTime: Date.now(),
              estimatedTotalMs: _getEstimatedTime('composite_expectedResults', _erPhases),
              subProgress: '',
            });
            setIsLoading(true); // [EO-137b-FIX2] After progress modal — no fallback flash
            console.log('[EO-137b] Expected Results composite: progress modal initialized with', _erPhases.length, 'phases');

            // EO-129: Running refs accumulator — prevents marker collisions across ER sections.
            // Each section starts from the refs accumulated by ALL previous sections in this composite,
            // not from the stale projectData.references snapshot (which causes all sections to reuse the same marker numbers).

            // [EO-130i] Fix 6.2 — Pre-composite cleanup: remove ALL old expectedResults references
            if (Array.isArray((projectData as any).references)) {
              const _erPreBefore = (projectData as any).references.length;
              const _erChildKeys = ['outputs', 'outcomes', 'impacts', 'kers'];
              (projectData as any).references = (projectData as any).references.filter(function(r: any) {
                if (!r.sectionKey) return true;
                if (_erChildKeys.indexOf(r.sectionKey) >= 0) return false;
                if (getChapterForSection(r.sectionKey) === 'expectedResults') return false;
                return true;
              });
              const _erPreRemoved = _erPreBefore - (projectData as any).references.length;
              if (_erPreRemoved > 0) {
                console.log('[EO-130i] Pre-composite cleanup: removed ' + _erPreRemoved + ' old refs for expectedResults chapter. Remaining: ' + (projectData as any).references.length);
              }
            }

            var _erRunningRefs: any[] = Array.isArray(projectData.references) ? projectData.references.slice() : [];

            for (let idx = 0; idx < sectionsToProcess.length; idx++) {
              if (signal.aborted) throw new DOMException('Generation cancelled', 'AbortError');

              const { key: s, action, emptyIndices } = sectionsToProcess[idx];
              const label = modeLabels[action]?.[language] || modeLabels['generate'][language];
              var sectionLabel = getPrettyName(s, language);

              setIsLoading(`${label} ${sectionLabel} (${idx + 1}/${totalToProcess})...`);
              _updatePhase('step_' + s, 'running'); // [EO-137b]

              let success = false;
              let retries = 0;
              const maxRetries = 3;

              while (!success && retries <= maxRetries) {
                try {
                  let generatedData: any;

                  if (action === 'fill' && emptyIndices.length > 0) {
                    generatedData = await generateTargetedFill(
                      s, projectData, projectData[s], language, signal
                    );
                  } else {
                    const genMode = action === 'generate' ? 'regenerate' : action;
                    generatedData = await generateSectionContent(
                      s, projectData, language, genMode, null, signal
                    );
                  }

                  // ★ v7.12 EO-045: Validation gate for composite expectedResults section
                  try {
                    var _compValCtx = _buildValidationContext(projectData, language);
                    var _compValReport = validateSectionOutput(s, generatedData, _compValCtx);
                    var _compFiltered = _filterValidationIssues(_compValReport);
                    console.log('[EO-045 VALIDATION composite] ' + s + ': raw FATAL=' + _compValReport.fatalCount + ' → filtered FATAL=' + _compFiltered.fatalCount + ' HIGH=' + _compFiltered.highCount);
                    if (_compFiltered.fatalCount > 0) {
                      var _compRejectSummary = _formatValidationIssues(_compFiltered, 5, language);
                      console.error('[EO-045 VALIDATION composite] ★ REJECTED — ' + s + ':\n' + _compRejectSummary);
                      setModalConfig({
                        isOpen: true,
                        title: language === 'si' ? '\uD83D\uDD27 Vsebina potrebuje dopolnitev' : '\uD83D\uDD27 Content Needs Attention',
                        message: (language === 'si'
                          ? 'AI-generirana vsebina za "' + getPrettyName(s, language) + '" potrebuje dopolnitve:\n\n'
                          : 'AI-generated content for "' + getPrettyName(s, language) + '" needs improvements:\n\n')
                          + _compRejectSummary
                          + (language === 'si' ? '\n\nTa del bo preskocen.' : '\n\nThis section will be skipped.'),
                        confirmText: language === 'si' ? 'V redu' : 'OK',
                        secondaryText: '',
                        cancelText: '',
                        onConfirm: closeModal,
                        onSecondary: null,
                        onCancel: closeModal,
                      });
                      throw new Error('VALIDATION_REJECTED');
                    }
                    if (_compFiltered.highCount > 0) {
                      var _compWarnSummary = _formatValidationIssues(_compFiltered, 5, language);
                      console.warn('[EO-045 VALIDATION composite] ★ WARNINGS — ' + s + ':\n' + _compWarnSummary);
                    }
                  } catch (_compValErr: any) {
                    if (_compValErr.message === 'VALIDATION_REJECTED') throw _compValErr;
                    console.error('[EO-045 VALIDATION composite] Validator crashed (non-fatal):', _compValErr);
                  }

                  // [EO-138] Record usage per ER composite step
                  if (generatedData?._usage) {
                    _recordUsage(projectData as any, s, generatedData._usage, 'composite');
                  }

                  // [EO-130i] Guard: only run reference pipeline when refs are enabled for this chapter
                  if (_compRefsEnabled) {
                    // ★ EO-100: Full reference pipeline for expectedResults sections
                    // EO-129: Use _erRunningRefs (accumulates across ER steps) not stale projectData.references
                    var _compTempData: any = { references: _erRunningRefs.slice(), [s]: generatedData };
                    var _compRefResult = _runFullReferencePipeline(s, generatedData, _compTempData, {
                      setProjectData: setProjectData,
                      skipVerification: true, // EO-118: skip async URL verify inside composite — prevents post-renumber overwrite
                      parentSectionKey: 'expectedResults',
                    });
                    // ★ EO-107: Use marker-replaced version from _compTempData, not cleanData
                    generatedData = _compTempData[s] || _compRefResult.cleanData;
                    var _compNewRefs = _compTempData.references;
                    // EO-129: Accumulate refs for next ER section so it starts with correct numbering
                    _erRunningRefs = _compNewRefs.slice();

                    setProjectData((prev: any) => {
                      const next = { ...prev };
                      // ★ EO-097: Merge composite step references
                      if (_compRefResult.refsAdded > 0) {
                        var _prevRefs = Array.isArray(next.references) ? next.references : [];
                        // Only add refs that don't already exist
                        var _toAdd = _compNewRefs.filter(function(nr: any) {
                          return !_prevRefs.some(function(pr: any) { return pr.id === nr.id; });
                        });
                        if (_toAdd.length > 0) {
                          next.references = _prevRefs.concat(_toAdd);
                          console.log('[EO-097] expectedResults/' + s + ': merged ' + _toAdd.length + ' refs (total: ' + next.references.length + ')');
                        }
                      }
                      // ★ FIX: Auto-assign IDs for kers if missing
                      if (s === 'kers' && Array.isArray(generatedData)) {
                        generatedData = generatedData.map((item: any, idx: number) => ({
                          ...item,
                          id: item.id && item.id.trim() ? item.id : `KER${idx + 1}`,
                        }));
                      }
                      // ★ FIX: Auto-assign IDs for risks if missing
                      if (s === 'risks' && Array.isArray(generatedData)) {
                        generatedData = generatedData.map((item: any, idx: number) => ({
                          ...item,
                          id: (item.id && item.id.trim()) ? item.id : `RISK${idx + 1}`,
                        }));
                      }

                      // ★ v7.7 FIX: Unwrap + Smart merge for composite sections
                      var _compositeData = generatedData;

                      // Step 1: Unwrap if AI returned { outputs: [...] } instead of [...]
                      if (_compositeData && typeof _compositeData === 'object' && !Array.isArray(_compositeData)) {
                        var _wrappedArr = _compositeData[s];
                        if (Array.isArray(_wrappedArr)) {
                          console.log('[runComposite] ★ UNWRAP: extracted array from "' + s + '" wrapper (' + _wrappedArr.length + ' items)');
                          _compositeData = _wrappedArr;
                        } else {
                          // Try to find any nested array
                          var _anyArr = Object.values(_compositeData).find(function(v: any) { return Array.isArray(v) && v.length > 0; });
                          if (_anyArr) {
                            console.log('[runComposite] ★ UNWRAP: extracted nested array (' + (_anyArr as any[]).length + ' items) from "' + s + '"');
                            _compositeData = _anyArr;
                          }
                        }
                      }

                      // Step 2: Smart merge — don't overwrite existing content with empty AI items
                      if (Array.isArray(_compositeData) && Array.isArray(next[s]) && next[s].length > 0) {
                        next[s] = _smartMergeArray(next[s], _compositeData, s);
                      } else if (Array.isArray(_compositeData)) {
                        next[s] = _compositeData;
                      } else {
                        next[s] = _compositeData;
                      }

                      return next;
                    });
                  } else {
                    // [EO-130i] Refs OFF — strip markers, skip pipeline, update state directly
                    console.log('[EO-130i] Refs OFF — skipping _runFullReferencePipeline for "' + s + '"');
                    generatedData = _stripRefsFromObj(generatedData);
                    console.log('[EO-130i] Safety strip applied to "' + s + '"');

                    // ★ FIX: Auto-assign IDs for kers if missing (refs OFF path)
                    if (s === 'kers' && Array.isArray(generatedData)) {
                      generatedData = generatedData.map((item: any, idx: number) => ({
                        ...item,
                        id: item.id && item.id.trim() ? item.id : `KER${idx + 1}`,
                      }));
                    }
                    if (s === 'risks' && Array.isArray(generatedData)) {
                      generatedData = generatedData.map((item: any, idx: number) => ({
                        ...item,
                        id: (item.id && item.id.trim()) ? item.id : `RISK${idx + 1}`,
                      }));
                    }

                    setProjectData((prev: any) => {
                      const next = { ...prev };
                      var _compositeDataOff = generatedData;
                      if (_compositeDataOff && typeof _compositeDataOff === 'object' && !Array.isArray(_compositeDataOff)) {
                        var _wArr = _compositeDataOff[s];
                        if (Array.isArray(_wArr)) _compositeDataOff = _wArr;
                      }
                      if (Array.isArray(_compositeDataOff) && Array.isArray(next[s]) && next[s].length > 0) {
                        next[s] = _smartMergeArray(next[s], _compositeDataOff, s);
                      } else {
                        next[s] = _compositeDataOff;
                      }
                      return next;
                    });
                  }
                  successCount++;
                  success = true;
                  _updatePhase('step_' + s, 'completed'); // [EO-137b]
                  } catch (e: any) {
                  if (e.name === 'AbortError') throw e;

                  // ★ EO-104: Fast fallback for ModelOverloadedError in expectedResults composite
                  if (e.name === 'ModelOverloadedError' && e.fallbackModel) {
                    console.warn('[EO-104] ModelOverloadedError in expectedResults/' + s + ' — showing fallback dialog');
                    _updatePhase('step_' + s, 'failed', undefined, 'Model overloaded'); // [EO-137b]
                    if (successCount > 0) {
                      setHasUnsavedTranslationChanges(true);
                    }
                    handleAIError(e, 'compositeExpectedResults');
                    setIsLoading(false);
                    isGeneratingRef.current = false;
                    abortControllerRef.current = null;
                    return;
                  }

                  const emsg = e.message || '';
                  const isRateLimit = emsg.includes('429') || emsg.includes('Quota') || emsg.includes('rate limit') || emsg.includes('RESOURCE_EXHAUSTED');

                  // ★ v7.12: VALIDATION_REJECTED is not retryable
                  if (emsg === 'VALIDATION_REJECTED') {

                    console.warn('[runComposite] Validation rejected ' + s + ' — skipping (not retryable)');
                    _updatePhase('step_' + s, 'failed', undefined, 'Validation rejected'); // [EO-137b]
                    lastError = e;
                    break;
                  }

                  if (isRateLimit && retries < maxRetries) {
                    retries++;
                    const waitSeconds = retries * 20;
                    console.warn(`[runComposite] Rate limit on ${s}, retry ${retries}/${maxRetries} in ${waitSeconds}s...`);
                    for (let countdown = waitSeconds; countdown > 0; countdown--) {
                      if (signal.aborted) throw new DOMException('Generation cancelled', 'AbortError');
                      setIsLoading(`${waitLabel}... ${countdown}s → ${sectionLabel}`);
                      await new Promise((r) => setTimeout(r, 1000));
                    }
                  } else {
                    console.error(`[runComposite] Failed to generate ${s}:`, e);
                    _updatePhase('step_' + s, 'failed', undefined, e?.message?.substring(0, 60)); // [EO-137b]
                    lastError = e;
                    break;
                  }
                }
              }

              if (success) {
                await new Promise((r) => setTimeout(r, 3000));
              }
            }

            if (successCount > 0) {
              _updatePhase('referenceProcessing', _compRefsEnabled ? 'running' : 'skipped'); // [EO-137b]
              if (_compRefsEnabled) {
                // EO-115: Renumber all references sequentially after composite
                setProjectData((prev: any) => {
                  const renumData = { ...prev };
                  _renumberAllReferences(renumData);
                  _updatePhase('referenceProcessing', 'completed'); // [EO-137b]
                  if (currentProjectId) {
                    _updatePhase('saving', 'running'); // [EO-137b]
                    storageService.saveProject(renumData, language, currentProjectId)
                      .then(() => {
                        console.log('[EO-115] expectedResults composite: renumber save SUCCESS');
                        _updatePhase('saving', 'completed'); // [EO-137b]
                        // EO-131: Async URL verification AFTER renumber + save
                        if (Array.isArray(renumData.references) && renumData.references.length > 0) {
                          _updatePhase('urlVerification', 'running'); // [EO-137b]
                          _verifyUrlsAfterSave(renumData.references, setProjectData, currentProjectId, language, storageService);
                          setTimeout(() => _updatePhase('urlVerification', 'completed'), 500); // [EO-137b]
                        } else {
                          _updatePhase('urlVerification', 'skipped'); // [EO-137b]
                        }
                      })
                      .catch((e: any) => console.error('[EO-115] expectedResults composite: renumber save failed', e));
                  }
                  return renumData;
                });
              } else {
                // [EO-130i] Refs OFF — final cleanup: strip any stray refs before save
                _updatePhase('urlVerification', 'skipped'); // [EO-137b]
                setProjectData((prev: any) => {
                  const cleanData = { ...prev };
                  if (Array.isArray(cleanData.references)) {
                    const _erChildKeys = ['outputs', 'outcomes', 'impacts', 'kers'];
                    const _finalBefore = cleanData.references.length;
                    cleanData.references = cleanData.references.filter(function(r: any) {
                      if (!r.sectionKey) return true;
                      return _erChildKeys.indexOf(r.sectionKey) < 0 && getChapterForSection(r.sectionKey) !== 'expectedResults';
                    });
                    const _finalRemoved = _finalBefore - cleanData.references.length;
                    if (_finalRemoved > 0) {
                      console.log('[EO-130i] Final cleanup: removed ' + _finalRemoved + ' stray refs for expectedResults. Remaining: ' + cleanData.references.length);
                    }
                  }
                  // Final safety strip on all ER sub-sections
                  const _erSubKeys = ['outputs', 'outcomes', 'impacts', 'kers'];
                  for (var _eri = 0; _eri < _erSubKeys.length; _eri++) {
                    const _erk = _erSubKeys[_eri];
                    if (cleanData[_erk]) cleanData[_erk] = _stripRefsFromObj(cleanData[_erk]);
                  }
                  console.log('[EO-130i] Final composite cleanup DONE for expectedResults — refs OFF');
                  if (currentProjectId) {
                    _updatePhase('saving', 'running'); // [EO-137b]
                    storageService.saveProject(cleanData, language, currentProjectId)
                      .then(() => {
                        console.log('[EO-130i] expectedResults composite: no-refs save SUCCESS');
                        _updatePhase('saving', 'completed'); // [EO-137b]
                      })
                      .catch((e: any) => console.error('[EO-130i] expectedResults composite: no-refs save failed', e));
                  }
                  return cleanData;
                });
                console.log('[EO-130i] Refs OFF — skipping _renumberAllReferences + _verifyUrlsAfterSave for expectedResults composite');
              }
              setHasUnsavedTranslationChanges(true);
            }

            if (!lastError && successCount === totalToProcess) {
              if (skippedCount > 0) {
                const skippedNames = allSections
                  .filter(s => !sectionsToProcess.find(sp => sp.key === s))
                  .map(s => s.charAt(0).toUpperCase() + s.slice(1))
                  .join(', ');

                setModalConfig({
                  isOpen: true,
                  title: language === 'si' ? 'Dopolnjevanje končano' : 'Fill complete',
                  message: language === 'si'
                    ? `Uspešno dopolnjeno: ${successCount} razdelkov.\n\nPreskočeni razdelki (že izpolnjeni): ${skippedNames}.`
                    : `Successfully filled: ${successCount} sections.\n\nSkipped sections (already complete): ${skippedNames}.`,
                  confirmText: language === 'si' ? 'V redu' : 'OK',
                  secondaryText: '',
                  cancelText: '',
                  onConfirm: () => closeModal(),
                  onSecondary: null,
                  onCancel: () => closeModal(),
                });
              }
            } else if (lastError && successCount < totalToProcess) {
              const failedCount = totalToProcess - successCount;
              const emsg = lastError.message || '';
              const isRateLimit = emsg.includes('429') || emsg.includes('Quota') || emsg.includes('rate limit') || emsg.includes('RESOURCE_EXHAUSTED');
              const isCredits = emsg.includes('afford') || emsg.includes('credits') || emsg.includes('402');
              const isJSON = emsg.includes('JSON') || emsg.includes('Unexpected token') || emsg.includes('parse');
              const isNetwork = emsg.includes('fetch') || emsg.includes('network') || emsg.includes('Failed to fetch') || emsg.includes('ERR_');

              let modalTitle: string;
              let modalMessage: string;

              if (isRateLimit) {
                modalTitle = language === 'si' ? 'Omejitev API klicev' : 'API Rate Limit Reached';
                modalMessage = language === 'si'
                  ? `Uspešno generirano: ${successCount} od ${totalToProcess} razdelkov.\n\n${failedCount} razdelkov ni bilo mogoče generirati, ker je bil dosežen limit AI ponudnika.\n\nPočakajte 1–2 minuti in poskusite ponovno, ali preklopite na drug model v Nastavitvah.`
                  : `Successfully generated: ${successCount} of ${totalToProcess} sections.\n\n${failedCount} sections could not be generated due to AI provider rate limits.\n\nWait 1–2 minutes and try again, or switch models in Settings.`;
              } else if (isCredits) {
                modalTitle = language === 'si' ? 'Nezadostna sredstva AI' : 'Insufficient AI Credits';
                modalMessage = language === 'si'
                  ? `Uspešno generirano: ${successCount} od ${totalToProcess} razdelkov.\n\n${failedCount} razdelkov ni bilo mogoče generirati, ker vaš AI ponudnik nima dovolj sredstev.`
                  : `Successfully generated: ${successCount} of ${totalToProcess} sections.\n\n${failedCount} sections could not be generated due to insufficient AI credits.`;
              } else if (isJSON) {
                modalTitle = language === 'si' ? 'Napaka formata' : 'Format Error';
                modalMessage = language === 'si'
                  ? `Uspešno generirano: ${successCount} od ${totalToProcess} razdelkov.\n\n${failedCount} razdelkov ni bilo mogoče generirati, ker je AI vrnil nepravilen format.\n\nPoskusite ponovno.`
                  : `Successfully generated: ${successCount} of ${totalToProcess} sections.\n\n${failedCount} sections could not be generated because the AI returned an invalid format.\n\nPlease try again.`;
              } else if (isNetwork) {
                modalTitle = language === 'si' ? 'Omrežna napaka' : 'Network Error';
                modalMessage = language === 'si'
                  ? `Uspešno generirano: ${successCount} od ${totalToProcess} razdelkov.\n\n${failedCount} razdelkov ni bilo mogoče generirati zaradi omrežne napake.`
                  : `Successfully generated: ${successCount} of ${totalToProcess} sections.\n\n${failedCount} sections could not be generated due to a network error.`;
              } else {
                modalTitle = language === 'si' ? 'Delna generacija' : 'Partial Generation';
                modalMessage = language === 'si'
                  ? `Uspešno generirano: ${successCount} od ${totalToProcess} razdelkov.\n\n${failedCount} razdelkov ni bilo mogoče generirati.`
                  : `Successfully generated: ${successCount} of ${totalToProcess} sections.\n\n${failedCount} sections could not be generated.`;
              }

              setModalConfig({
                isOpen: true,
                title: modalTitle,
                message: modalMessage,
                confirmText: language === 'si' ? 'V redu' : 'OK',
                secondaryText: language === 'si' ? 'Odpri nastavitve' : 'Open Settings',
                cancelText: '',
                onConfirm: () => closeModal(),
                onSecondary: () => { closeModal(); setIsSettingsOpen(true); },
                onCancel: () => closeModal(),
              });
            }
          }

        } catch (e: any) {
          if (e.name !== 'AbortError') {
            handleAIError(e, `compositeGeneration(${compositeSectionKey})`);
          }
        } finally {
          setIsLoading(false);
          isGeneratingRef.current = false;
          abortControllerRef.current = null;
          // [EO-137b] Close progress modal and persist phase timings to localStorage
          setGenerationProgress(prev => {
            if (prev) _savePhaseTimings(
              isActivities ? 'composite_activities' : 'composite_expectedResults',
              prev.phases
            );
            return prev ? { ...prev, visible: false } : null;
          });
        }
      };

  // ── Translation vs Generation decision ──
      const sectionLabel = isActivities
        ? (language === 'si' ? 'Aktivnosti' : 'Activities')
        : (language === 'si' ? 'Rezultati' : 'Results');

      if (isActivities) {
        if (hasContentInSections) {
          show3OptionModal(
            () => runComposite('enhance'),
            () => runComposite('fill'),
            () => runComposite('regenerate')
          );
        } else {
          runComposite('regenerate');
        }
        return;
      }

      // ── expectedResults: keep translation logic ──
      if (otherLangData && !hasContentInSections) {
        setModalConfig({
          isOpen: true,
          title: language === 'si'
            ? `${sectionLabel} obstajajo v ${otherLang}`
            : `${sectionLabel} exist in ${otherLang}`,
          message: language === 'si'
            ? `${sectionLabel} že obstajajo v ${otherLang} jeziku. Želite prevesti ali generirati na novo?`
            : `${sectionLabel} already exist in ${otherLang}. Would you like to translate or generate new?`,
          confirmText: language === 'si'
            ? `Prevedi iz ${otherLang}`
            : `Translate from ${otherLang}`,
          secondaryText: language === 'si' ? 'Generiraj novo' : 'Generate new',
          cancelText: language === 'si' ? 'Prekliči' : 'Cancel',
          onConfirm: () => performTranslationFromOther(otherLangData),
          onSecondary: () => runComposite('regenerate'),
          onCancel: closeModal,
        });
      } else if (otherLangData && hasContentInSections) {
        setModalConfig({
          isOpen: true,
          title: language === 'si'
            ? `${sectionLabel} obstajajo v obeh jezikih`
            : `${sectionLabel} exist in both languages`,
          message: language === 'si'
            ? `${sectionLabel} obstajajo v slovenščini in angleščini. Kaj želite storiti?`
            : `${sectionLabel} exist in both SI and EN. What would you like to do?`,
          confirmText: language === 'si'
            ? 'Generiraj / izboljšaj trenutno'
            : 'Generate / enhance current',
          secondaryText: language === 'si'
            ? `Prevedi iz ${otherLang}`
            : `Translate from ${otherLang}`,
          cancelText: language === 'si' ? 'Prekliči' : 'Cancel',
          onConfirm: () => {
            closeModal();
            setTimeout(() => {
              show3OptionModal(
                () => runComposite('enhance'),
                () => runComposite('fill'),
                () => runComposite('regenerate')
              );
            }, 100);
          },
          onSecondary: () => performTranslationFromOther(otherLangData),
          onCancel: closeModal,
        });
      } else if (hasContentInSections) {
        show3OptionModal(
          () => runComposite('enhance'),
          () => runComposite('fill'),
          () => runComposite('regenerate')
        );
      } else {
        runComposite('regenerate');
      }
      },
    [
      ensureApiKey,
      robustCheckSectionHasContent,
      sectionNeedsGeneration,
      checkOtherLanguageHasContent,
      projectData,
      language,
      t,
      closeModal,
      setProjectData,
      setHasUnsavedTranslationChanges,
      setIsSettingsOpen,
      setModalConfig,
      handleAIError,
      performTranslationFromOther,
      show3OptionModal,
      preGenerationGuard,
      currentProjectId,
    ]
  );
    // ─── Single field generation ───────────────────────────────────

  const handleGenerateField = useCallback(
    async (path: (string | number)[]) => {
      if (!ensureApiKey()) {
        setIsSettingsOpen(true);
        return;
      }

      const fieldName = path[path.length - 1];
      setIsLoading(t.generating + ' ' + getPrettyName(String(fieldName), language) + '...');
      setError(null);

      const fieldAbort = new AbortController();
      abortControllerRef.current = fieldAbort;

      try {
        const fieldPathStr = path.map(String).join('.');
        console.log('[handleGenerateField] ▶ fieldPathStr:', fieldPathStr);
        const content = await generateFieldContent(fieldPathStr, projectData, language, fieldAbort.signal);
        console.log('[handleGenerateField] ◀ content:', JSON.stringify(content).substring(0, 300), '| type:', typeof content, '| length:', content?.length);
        handleUpdateData(path, content);
        console.log('[handleGenerateField] ✅ handleUpdateData DONE');

        try {
          if (currentProjectId) {
            const updatedData = set(projectData, path, content);
            await storageService.saveProject(updatedData, language, currentProjectId);
            console.log('[handleGenerateField] ★ Explicit save — SUCCESS');
          }
        } catch (saveErr) {
          console.error('[handleGenerateField] ★ Explicit save failed:', saveErr);
        }

      } catch (e: any) {
        if (e.name !== 'AbortError') {
          handleAIError(e, `generateField(${String(fieldName)})`);
        }

      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [ensureApiKey, projectData, language, t, handleUpdateData, setIsSettingsOpen, handleAIError, currentProjectId]
  );

  // ─── Summary generation ────────────────────────────────────────

  const runSummaryGeneration = useCallback(async () => {
    setIsGeneratingSummary(true);
    setSummaryText('');

    const summaryAbort = new AbortController();
    abortControllerRef.current = summaryAbort;

    try {
      const text = await generateProjectSummary(projectData, language, summaryAbort.signal);
      setSummaryText(text);
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setSummaryText(
          language === 'si' ? 'Generiranje preklicano.' : 'Generation cancelled.'
        );
      } else {
        const msg = e.message || '';
        if (msg.includes('credits') || msg.includes('Quota') || msg.includes('afford')) {
          setSummaryText(
            language === 'si'
              ? 'Nezadostna sredstva AI. Dopolnite kredit ali zamenjajte model v Nastavitvah.'
              : 'Insufficient AI credits. Top up credits or switch model in Settings.'
          );
        } else {
          setSummaryText(
            language === 'si'
              ? 'Napaka pri generiranju povzetka. Poskusite ponovno.'
              : 'Error generating summary. Please try again.'
          );
        }
        console.error('[Summary Error]:', e);
      }
    } finally {
      setIsGeneratingSummary(false);
      abortControllerRef.current = null;
    }
  }, [projectData, language]);

  const handleExportSummary = useCallback(() => {
    setSummaryModalOpen(true);
    if (!summaryText) {
      runSummaryGeneration();
    }
  }, [summaryText, runSummaryGeneration]);

    const handleDownloadSummaryDocx = useCallback(async () => {
    try {
      const blob = await generateSummaryDocx(
        summaryText,
        projectData.projectIdea?.projectTitle,
        language
      );
      const fileName = `Summary - ${projectData.projectIdea?.projectTitle || 'Project'}.docx`;
      if (typeof (window as any).showSaveFilePicker === 'function') {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: fileName,
            types: [{ description: 'Word Document', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
        } catch (saveErr: any) {
          if (saveErr.name !== 'AbortError') {
            console.error('Save dialog failed, falling back:', saveErr);
            downloadBlob(blob, fileName);
          }
        }
      } else {
        downloadBlob(blob, fileName);
      }
    } catch (e: any) {
      console.error(e);
      alert(
        language === 'si'
          ? 'Napaka pri generiranju DOCX datoteke.'
          : 'Failed to generate DOCX file.'
      );
    }
  }, [summaryText, projectData, language]);

    // ★ EO-040: AI Asistent per-field — uses generateFieldContent with full Instructions/rules
  var handleFieldAIGenerate = useCallback(async function(
    fieldPath: (string | number)[],
    currentValue: string,
    fieldLabel: string,
    userInstructions: string
  ): Promise<string> {
    if (!ensureApiKey()) {
      throw new Error('MISSING_API_KEY');
    }

    var fieldPathStr = fieldPath.map(String).join('.');
    console.log('[handleFieldAIGenerate] EO-040 ▶ path:', fieldPathStr, '| label:', fieldLabel, '| hasInstructions:', !!userInstructions.trim(), '| hasCurrentValue:', !!currentValue.trim());

    var result = await generateFieldContent(
      fieldPathStr,
      projectData,
      language,
      undefined,
      {
        userInstructions: userInstructions,
        currentValue: currentValue,
        fieldLabel: fieldLabel,
      }
    );

    console.log('[handleFieldAIGenerate] EO-040 ◀ result length:', result.length);
    return result;
  }, [projectData, language, ensureApiKey]);

  // ★ v7.17 EO-070: Generate and verify references with AI
  const generateAndVerifyReferences = useCallback(
    async (): Promise<{ newRefs: any[]; unverifiedClaims: any[] } | null> => {
      if (!ensureApiKey()) {
        setIsSettingsOpen(true);
        return null;
      }
      if (!preGenerationGuard('generateAndVerifyReferences')) return null;

      isGeneratingRef.current = true;
      sessionCallCountRef.current++;
      var abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        // Build full project text for AI analysis
        var fullText = '';
        var sectionKeysAI = [
          'problemAnalysis', 'projectIdea', 'generalObjectives', 'specificObjectives',
          'projectManagement', 'activities', 'outputs', 'outcomes', 'impacts', 'risks', 'kers',
          'methodology', 'impact', 'dissemination',
        ];
        for (var si = 0; si < sectionKeysAI.length; si++) {
          var sk = sectionKeysAI[si];
          if (projectData[sk]) {
            fullText += '\n\n--- SECTION: ' + sk + ' ---\n' + JSON.stringify(projectData[sk]);
          }
        }

        var instruction = getCollectReferencesInstruction();
        var prompt = instruction
          + '\n\nIMPORTANT: If web search is available to you, USE IT for EVERY citation to verify the source and find the real URL.'
          + '\n\nFULL PROJECT TEXT:\n' + fullText;

        // Use generateSectionContent with custom prompt override
        var result = await generateSectionContentRaw(
          'problemAnalysis',
          { ...projectData, _customPromptOverride: prompt },
          language,
          'regenerate',
          null,
          abortController.signal
        );

        var newRefs: any[] = [];
        var unverifiedClaims: any[] = [];

        if (result && typeof result === 'object') {
          var existingRefs = Array.isArray(projectData.references) ? projectData.references : [];

          if (Array.isArray(result.references)) {
            newRefs = _convertAiRefsToReferences(
              result.references.filter(function(r: any) { return r.verified !== false; }),
              'general',
              existingRefs
            );
          }
          if (Array.isArray(result.unverifiedClaims)) {
            unverifiedClaims = result.unverifiedClaims;
          }
        }

        console.log('[EO-070] generateAndVerifyReferences: ' + newRefs.length + ' verified refs, ' + unverifiedClaims.length + ' unverified claims');
        return { newRefs: newRefs, unverifiedClaims: unverifiedClaims };
      } catch (e: any) {
        handleAIError(e, 'generateAndVerifyReferences');
        return null;
      } finally {
        isGeneratingRef.current = false;
        abortControllerRef.current = null;
      }
    },
    [projectData, language, ensureApiKey, preGenerationGuard, handleAIError]
  );

    return {
    isLoading,
    setIsLoading,
    error,
    setError,
    summaryModalOpen,
    setSummaryModalOpen,
    summaryText,
    isGeneratingSummary,
    generationProgress,       // EO-137: progress modal state
    handleGenerateSection,
    handleGenerateCompositeSection,
    handleGenerateField,
    handleFieldAIGenerate,
    handleExportSummary,
    runSummaryGeneration,
    handleDownloadSummaryDocx,
    cancelGeneration,
    generateAndVerifyReferences,
  };
};

// END OF useGeneration.ts v7.60
