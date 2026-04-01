// ═══════════════════════════════════════════════════════════════
// services/geminiService.ts
// v7.41 — 2026-04-01 — EO-175R PATCH 2 CHANGE A: generateActivitiesPerWP scaffold prompt and
//         per-WP wpPrompt both replaced INLINE_CITATION_FORMAT_ENFORCEMENT (prefix 'N', no MANDATORY
//         SOURCE RULE) with _buildCitationEnforcement('AC') so that activities prompts receive the
//         full MANDATORY SOURCE RULE block introduced in EO-175R CHANGE 1.
// v7.40 — 2026-04-01 — EO-175R: Enforce "cite ONLY from approved sources" at prompt and pipeline level.
//         CHANGE 1: _buildCitationEnforcement() appends MANDATORY SOURCE RULE block — when an
//           APPROVED SOURCES block is present, Gemini is explicitly forbidden from inventing URLs.
//         CHANGE 2: getPromptAndSchemaForSection() moves approved sources injection to BEFORE the
//           task instruction (after context) with strict bordered header/footer and source-only rule.
//           Old position (after _repairInstructions at bottom) removed.
//         CHANGE 3: generateActivitiesPerWP() strengthens the approved sources block with the same
//           bordered header/footer used by getPromptAndSchemaForSection.
// v7.39 — 2026-04-01 — EO-174b: Add approvedSourcesBlock and referencesEnabledParam optional
//         parameters to generateActivitiesPerWP. approvedSourcesBlock is injected into each
//         per-WP prompt after the context block. referencesEnabledParam (default: false)
//         controls whether Gemini returns a _references array for the per-WP generateContent
//         call. Scaffold generation always keeps referencesEnabled: false (scaffold has no refs).
// v7.38 — 2026-04-01 — EO-169: Add risks + projectManagement to ACADEMIC_RIGOR_SECTIONS.
//         Both sections now get _buildCitationEnforcement('RS') / _buildCitationEnforcement('PM')
//         injected into their prompts when referencesEnabled=true.
//         EO-130 refs-OFF strip logic updated to also strip per-section enforcement blocks by
//         detecting the '═══ INLINE CITATION FORMAT ENFORCEMENT' sentinel header.
// v7.37 — 2026-03-31 — EO-MASTER: Per-WP sectionKey (activities_wp, activities_scaffold),
//         partnerAllocations_wp expectedItemCount, _maxOutputTokens override (E5).
// v7.36 — 2026-03-31 — EO-167d: Fix getExpectedItemCountFromProjectData to return real counts.
//         problemAnalysis = 1 + causes.length + consequences.length (≈11).
//         activities = total tasks across all WPs (not WP count).
//         projectIdea = 10, projectManagement = 5, stateOfTheArt = 5, proposedSolution = 5.
//         default changed from 1 to 3 (safe fallback for unrecognised sections).
// v7.35 — 2026-03-31 — EO-167c: schema: → jsonSchema: confirmed already done by EO-162b (0 matches).
//         No code changes needed in this file for EO-167c (token fixes are in aiProvider.ts).
// v7.34 — 2026-03-31 — EO-167 Part B: Fix Activities per-WP token overflow.
//         previousWPsContext trimmed to compact summaries (id+title+taskIds only — no descriptions).
//         Per-WP generateContent now passes expectedItemCount:4 → 17408 tokens instead of 5120.
//         [EO-167] progress logs added at scaffold + each WP call.
// v7.33 — 2026-03-27 — (skipped — reserved for intermediate build)
// v7.32 — 2026-03-27 — EO-162b: Fixed schema: → jsonSchema: in all generateContent calls.
//         getPromptAndSchemaForSection now returns jsonSchema: (not schema:).
//         Destructure updated. All 4 call sites fixed (lines ~1355, ~1461, ~1585, ~2128).
//         EO-119 had already fixed WP allocation calls (lines ~2501, ~2520). Gemini now
//         receives responseSchema and returns raw JSON instead of markdown-wrapped blocks.
// v7.31 — 2026-03-26 — EO-161: Truncation detection + auto-retry (up to 2x, doubling token limit).
//         generateSectionContent passes referencesEnabled/expectedItemCount/isComposite into generateContent.
//         Bilingual truncation-specific error messages. getExpectedItemCountFromProjectData() helper added.
// v7.30 — 2026-03-26 — EO-159: BUG12 object-root schema for objectives/results/risks/kers.
//         BUG18: _referenceEntrySchema requires year+inlineMarker. BUG28: conditional getReferencesRequirement.
// v7.29 — 2026-03-23 — EO-141: Per-chapter citation prefix. _GS_CHAPTER_PREFIX + _gsGetPrefix + _buildCitationEnforcement(prefix).
//         INLINE_CITATION_FORMAT_ENFORCEMENT now dynamic per sectionKey prefix. Prompt uses [PA-N],[PI-N] etc.
// v7.28 — 2026-03-20 — EO-138: generateSectionContent captures _usage from generateContent result and attaches to parsed for cost tracking in useGeneration.
// v7.27 — 2026-03-20 — EO-130f: Fix ?? true fallback → ?? false in referencesEnabled resolution.
// v7.26 — 2026-03-18 — EO-130: generateSectionContent uses CITATION_WITHOUT_REFERENCES when referencesEnabled=false.
// v7.25 — 2026-03-18 — EO-127: Per-WP allocation retry on parse fail + raw response logging (first 300 chars). sectionKey token raised to 16384 in aiProvider.
// v7.24 — 2026-03-18 — EO-119: Fix schema→jsonSchema in per-WP generateContent call (Gemini responseSchema now active).
// v7.23 — 2026-03-17 — EO-117: Split partnerAllocations into per-WP calls (prevents truncation).
//         Reference quantity limits added to prompt (target 20-30 total refs).
// v7.22 — 2026-03-17 — EO-116: Activities WP prompt limits refs to 1-2 per WP (operational, not academic).
//         FIX: EO-102C dropped marker cleanup now also applied to newData[sectionKey] (prevents PM "not found").
// v7.20 — 2026-03-17 — EO-114b: FIX allocations recovery — added 4-step JSON recovery
//         (fence strip, array extract, object→array, truncated repair) in generatePartnerAllocations catch block.
//         EO-115b: INLINE_CITATION_FORMAT_ENFORCEMENT rewritten — BOTH (Author, Year) AND [N] mandatory.
// v7.19 — 2026-03-17 — EO-114: Allocations JSON recovery pipeline — same recovery steps as generateSectionContent
//         (fence strip, brace extraction, array extraction, EO-092 truncated repair).
//         Also FIX sanitizeJSONResponse: trim leading whitespace/newlines BEFORE fence detection.
// v7.18 — 2026-03-17 — EO-110: Partners/PM/Risks plain-text fallback — retry with strict JSON-only prompt
//         when AI returns prose instead of JSON. Prevents cascading composite failure.
// v7.17 — 2026-03-16 — EO-092: Truncated JSON recovery — repairs incomplete AI responses
//         by closing unclosed brackets/braces after stripping trailing partial content.
// v7.16 — 2026-03-16 — FIX: Enforce inline citation format (Author/Institution, Year) [N]
//   - Added INLINE_CITATION_FORMAT_ENFORCEMENT prompt block
//   - Bare numeric markers [N] alone are forbidden for factual claims
//   - Prompt builder repeats short-attribution citation requirement near output instructions
//   - Field generation also enforces the new inline citation standard
//   - Sub-section focus strings updated to reflect author-year + [N] format
// v7.15 — 2026-03-13 — EO-084: Approved source pool injection into prompt
//   - Import getApprovedSourcePoolRules from Instructions.ts
//   - getPromptAndSchemaForSection accepts optional approvedSourcesBlock parameter
//   - generateSectionContent accepts optional approvedSourcesBlock and forwards to prompt builder
//   - Approved source pool is injected BEFORE the references requirement for AI visibility
// v7.14 — 2026-03-11 — EO-080: URL Provenance — post-process _references to set urlVerified based on [VERIFIED_URL] tags and DOI
// v7.13 — 2026-03-11 — EO-075: sanitizeJSONResponse integrated — strips markdown fences, BOM, trailing commas before all JSON.parse calls
// v7.12 — 2026-03-08 — EO-048b: Pass _repairInstructions from projectData into prompt for targeted regeneration
// v7.11 — 2026-03-08 — EO-049: JSON recovery — extract JSON from text-wrapped AI responses before throwing parse error
// v7.10 — 2026-03-06 — EO-042 FIX: Removed Serper web search — now handled natively by aiProvider (google_search for Gemini, web plugin for OpenRouter)
// v7.9 — 2026-03-06 — EO-042: Web Search integration — searchForEvidence injected into prompts (REPLACED by v7.10)
// v7.8 — 2026-03-06 — EO-040: generateFieldContent supports userInstructions + currentValue + full rules
// v7.7 — 2026-03-01 — FIX: Partner allocations use correct categoryKeys per funding model
// v7.6 — 2026-03-01 — POST-PROCESSING BUDGET ENFORCEMENT
// v7.5 — 2026-02-24 — TOKEN OPTIMIZATION + ABORT SIGNAL
// ═══════════════════════════════════════════════════════════════

import { storageService } from './storageService.ts';
import { knowledgeBaseService } from './knowledgeBaseService.ts';

import {
  getLanguageDirective,
  getInterventionLogicFramework,
  getAcademicRigorRules,
  getHumanizationRules,
  getProjectTitleRules,
  getModeInstruction,
  getQualityGates,
  getCrossChapterGates,
  getTaskInstruction,
  getRulesForSection,
  getGlobalRules,
  getFieldRules,
  getSummaryRules,
  getTranslationRules,
  getTemporalIntegrityRule,
  getLanguageMismatchTemplate,
  getConsortiumAllocationRules,
  getResourceCoherenceRules,
  getOpenRouterSystemPrompt,
  getReferencesRequirement,
  getApprovedSourcePoolRules,
  getCitationWithoutReferences,
  DEFAULT_REFS_ENABLED,
  isValidSectionKey,
  isValidPartnerType,
  SECTION_TO_CHAPTER_MAP,
} from './Instructions.ts';

import { detectProjectLanguage as detectLanguage, detectTextLanguage } from '../utils.ts';
import { getChapterPrefix as _getSharedChapterPrefix } from '../utils/referencePrefixMap.ts';

import {
  generateContent,
  hasValidProviderKey,
  validateProviderKey,
  getProviderConfig,
  sanitizeJSONResponse,
  calculateDynamicTokenLimit,
  type AIProviderType
} from './aiProvider.ts';

import { Type } from "@google/genai";

// ─── BACKWARD COMPATIBILITY EXPORTS ─────────────────────────────

export const hasValidApiKey = hasValidProviderKey;

export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  const provider = storageService.getAIProvider() || 'gemini';
  return validateProviderKey(provider, apiKey);
};

export const validateProviderApiKey = validateProviderKey;

// ─── SAFE RULES FORMATTER ────────────────────────────────────────

const formatRules = (rules: string | string[]): string => {
  if (Array.isArray(rules)) return rules.join('\n');
  if (typeof rules === 'string' && rules.trim().length > 0) return rules;
  return '';
};

const formatRulesAsList = (rules: string | string[]): string => {
  if (Array.isArray(rules)) return rules.map(r => `- ${r}`).join('\n');
  if (typeof rules === 'string' && rules.trim().length > 0) return rules;
  return '';
};

// ─── EO-141: Per-chapter reference prefix (local copy for geminiService) ───────
const _GS_CHAPTER_PREFIX: Record<string, string> = {
  problemAnalysis: 'PA', projectIdea: 'PI', generalObjectives: 'GO',
  specificObjectives: 'SO', activities: 'AC', expectedResults: 'ER',
  projectManagement: 'PM', partners: 'PT', risks: 'RS',
  coreProblem: 'PA', causes: 'PA', consequences: 'PA',
  mainAim: 'PI', stateOfTheArt: 'PI', proposedSolution: 'PI', policies: 'PI',
  outputs: 'OU', outcomes: 'OC', impacts: 'IM', kers: 'KE',
};
function _gsGetPrefix(sectionKey: string): string {
  if (_GS_CHAPTER_PREFIX[sectionKey]) return _GS_CHAPTER_PREFIX[sectionKey];
  if (sectionKey.startsWith('activities')) return 'AC';
  if (sectionKey.startsWith('expectedResults')) return 'ER';
  return 'RF';
}

// ─── INLINE CITATION FORMAT ENFORCEMENT ─────────────────────────

function _buildCitationEnforcement(prefix: string): string {
  return `
═══ INLINE CITATION FORMAT ENFORCEMENT (MANDATORY) ═══
CHAPTER PREFIX FOR THIS RESPONSE: "${prefix}"
For every factual, empirical, comparative, legal, or literature-based claim, use:
- (Author, Year) [${prefix}-N]
- (Author et al., Year) [${prefix}-N]
- (Institution, Year) [${prefix}-N]

Start numbering at 1: [${prefix}-1], [${prefix}-2], [${prefix}-3]...

MANDATORY: Every factual citation MUST contain BOTH components:
  1. Short attribution: (Author/Institution, Year)
  2. Prefixed marker: [${prefix}-N]
Together: "...claim (Author, Year) [${prefix}-1]."

FORBIDDEN:
- Bare [N] alone (e.g. [1], [2], [3] without prefix)
- (Author, Year) alone without [${prefix}-N] following it
- Using a different prefix or format

If you cannot produce BOTH components for a claim, do NOT cite it at all.

Examples of correct output:
- "DMD affects approximately 1 in 3,500 live male births worldwide (Birnkrant et al., 2018) [${prefix}-1]."
- "Care burden remains substantial across the EU (European Commission, 2024) [${prefix}-2]."

Rules:
1. The short attribution MUST reflect real source metadata.
2. Use institution + year for institutional sources.
3. Use first author + et al. + year for multi-author academic sources.
4. Do NOT invent missing metadata.
5. The [${prefix}-N] marker MUST match the inlineMarker field in the _references entry.
6. _references entries MUST use the same [${prefix}-N] format in their inlineMarker field.
7. If you cannot produce a defensible short attribution, do NOT fabricate it.

REFERENCE QUANTITY LIMITS (EO-117):
- Problem Analysis: 5-6 references maximum
- Project Idea: 5-6 references maximum
- General/Specific Objectives: 2-4 references maximum
- Project Management: 3-5 references maximum
- Activities (per work package): 1-2 references maximum
- Risks: 5-6 references maximum
- Expected Results (per sub-section): 2-3 references maximum
- Total project references should be 20-30, not more.

Quality over quantity. Only cite sources that DIRECTLY support a specific claim.
Do NOT add references for general knowledge or obvious facts.

MANDATORY SOURCE RULE (when APPROVED SOURCES block is present in this prompt):
If an APPROVED SOURCES block is provided below, you MUST cite ONLY from those sources.
Do NOT invent, guess, or hallucinate any URLs or DOIs.
Every URL you write in _references MUST come verbatim from the APPROVED SOURCES list.
If you need to cite a fact but no approved source covers it, write the claim WITHOUT a citation marker — do NOT fabricate a reference.
If the APPROVED SOURCES block contains a DOI, construct the URL as https://doi.org/<DOI>. Do NOT make up alternative URLs.
FORBIDDEN: Any URL that you did not copy verbatim from the approved sources list or construct directly from a provided DOI.
═══════════════════════════════════════════════════════════════════
`;
}

const INLINE_CITATION_FORMAT_ENFORCEMENT = _buildCitationEnforcement('N'); // static fallback — overridden per section below

// ─── SAFE PROJECT END DATE CALCULATOR ────────────────────────────

const calculateProjectEndDate = (startDateStr: string, durationMonths: number): string => {
  const parts = startDateStr.split('-').map(Number);
  const startYear = parts[0];
  const startMonth = parts[1] - 1;
  const startDay = parts[2];

  let targetMonth = startMonth + durationMonths;
  const targetYear = startYear + Math.floor(targetMonth / 12);
  targetMonth = targetMonth % 12;

  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(startDay, daysInTargetMonth);

  const endDate = new Date(targetYear, targetMonth, targetDay);
  endDate.setDate(endDate.getDate() - 1);

  const y = endDate.getFullYear();
  const m = String(endDate.getMonth() + 1).padStart(2, '0');
  const d = String(endDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// ─── INPUT LANGUAGE DETECTION ────────────────────────────────────

const detectInputLanguageMismatch = (
  projectData: any,
  uiLanguage: 'en' | 'si'
): string => {
  const sampleTexts: string[] = [];

  const collectStrings = (obj: any, depth = 0) => {
    if (depth > 3 || sampleTexts.length >= 5) return;
    if (typeof obj === 'string' && obj.length > 30) {
      sampleTexts.push(obj);
    } else if (typeof obj === 'object' && obj !== null) {
      for (const val of Object.values(obj)) {
        collectStrings(val, depth + 1);
        if (sampleTexts.length >= 5) break;
      }
    }
  };

  collectStrings(projectData?.problemAnalysis);
  collectStrings(projectData?.projectIdea);
  collectStrings(projectData?.objectives);

  if (sampleTexts.length === 0) return '';

  let mismatchCount = 0;
  const checked = Math.min(sampleTexts.length, 5);

  for (let i = 0; i < checked; i++) {
    const detected = detectTextLanguage(sampleTexts[i]);
    if (detected !== 'unknown' && detected !== uiLanguage) {
      mismatchCount++;
    }
  }

  if (mismatchCount > checked / 2) {
    const template = getLanguageMismatchTemplate();
    const detectedLang = uiLanguage === 'en' ? 'si' : 'en';
    const detectedName = detectedLang === 'en' ? 'English' : 'Slovenian';
    const targetName = uiLanguage === 'en' ? 'English' : 'Slovenian';
    return template
      .replace(/\{\{detectedName\}\}/g, detectedName)
      .replace(/\{\{targetName\}\}/g, targetName);
  }

  return '';
};

// ─── SANITIZE PROJECT TITLE ─────────────────────────────────────

const sanitizeProjectTitle = (title: string): string => {
  if (!title || typeof title !== 'string') return title;

  let clean = title.trim();

  clean = clean
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1');

  clean = clean.replace(/^["'«»„""]|["'«»"""]$/g, '').trim();
  clean = clean.replace(/^(Project\s*Title|Naziv\s*projekta)\s*[:–—-]\s*/i, '').trim();

  const acronymPattern = /^[A-ZČŠŽ]{2,10}\s*[–—:-]\s*/;
  if (acronymPattern.test(clean)) {
    const withoutAcronym = clean.replace(acronymPattern, '').trim();
    if (withoutAcronym.length > 20) {
      clean = withoutAcronym;
    }
  }

  if (clean.length > 200) {
    clean = clean.substring(0, 200).replace(/\s+\S*$/, '').trim();
  }

  return clean;
};

// ─── STRIP MARKDOWN ──────────────────────────────────────────────

const stripMarkdown = (obj: any): any => {
  if (typeof obj === 'string') {
    return obj
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/`([^`]+)`/g, '$1');
  }
  if (Array.isArray(obj)) {
    return obj.map(item => stripMarkdown(item));
  }
  if (typeof obj === 'object' && obj !== null) {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      cleaned[key] = stripMarkdown(value);
    }
    return cleaned;
  }
  return obj;
};

// ═══════════════════════════════════════════════════════════════
// TOKEN OPTIMIZATION — SECTION RELEVANCE SETS
// ═══════════════════════════════════════════════════════════════

const KB_RELEVANT_SECTIONS = new Set([
  'problemAnalysis', 'projectIdea', 'stateOfTheArt', 'proposedSolution',
  'policies', 'causes', 'consequences', 'coreProblem', 'mainAim',
  'generalObjectives', 'specificObjectives',
  'outputs', 'outcomes', 'impacts', 'kers',
  'partners',
]);

const INTERVENTION_LOGIC_SECTIONS = new Set([
  'problemAnalysis', 'projectIdea', 'coreProblem', 'causes', 'consequences',
  'mainAim', 'stateOfTheArt', 'proposedSolution', 'policies',
  'generalObjectives', 'specificObjectives',
  'activities', 'outputs', 'outcomes', 'impacts', 'kers',
]);

const ACADEMIC_RIGOR_SECTIONS = new Set([
  'problemAnalysis', 'projectIdea', 'coreProblem', 'causes', 'consequences',
  'mainAim', 'stateOfTheArt', 'proposedSolution', 'policies',
  'generalObjectives', 'specificObjectives',
  'outputs', 'outcomes', 'impacts', 'kers',
  // EO-169: risks + projectManagement now get full inline citation enforcement
  // ([RS-N] and [PM-N] markers respectively) when references are enabled.
  'risks', 'projectManagement',
]);

// ═══════════════════════════════════════════════════════════════
// RELEVANT CONTEXT BUILDER
// ═══════════════════════════════════════════════════════════════

const SECTION_CONTEXT_MAP: Record<string, string[]> = {
  problemAnalysis: ['problemAnalysis', 'projectIdea'],
  coreProblem: ['problemAnalysis'],
  causes: ['problemAnalysis'],
  consequences: ['problemAnalysis'],

  projectIdea: ['problemAnalysis', 'projectIdea'],
  projectTitleAcronym: ['projectIdea'],
  mainAim: ['problemAnalysis', 'projectIdea'],
  stateOfTheArt: ['problemAnalysis', 'projectIdea'],
  proposedSolution: ['problemAnalysis', 'projectIdea'],
  readinessLevels: ['projectIdea'],
  policies: ['problemAnalysis', 'projectIdea'],

  generalObjectives: ['problemAnalysis', 'projectIdea'],
  specificObjectives: ['problemAnalysis', 'projectIdea', 'generalObjectives'],

  activities: ['problemAnalysis', 'projectIdea', 'generalObjectives', 'specificObjectives', 'partners'],
  projectManagement: ['projectIdea', 'activities', 'partners'],
  risks: ['projectIdea', 'activities'],

  outputs: ['projectIdea', 'specificObjectives', 'activities'],
  outcomes: ['projectIdea', 'specificObjectives', 'outputs'],
  impacts: ['problemAnalysis', 'projectIdea', 'specificObjectives', 'outputs', 'outcomes'],
  kers: ['projectIdea', 'activities', 'outputs'],

  partners: ['problemAnalysis', 'projectIdea', 'activities'],

  partnerAllocations: ['partners', 'activities', 'projectIdea'],
};

const getRelevantContext = (sectionKey: string, projectData: any): string => {
  const relevantKeys = SECTION_CONTEXT_MAP[sectionKey] || Object.keys(SECTION_CONTEXT_MAP);
  const sections: string[] = [];

  for (const key of relevantKeys) {
    const data = projectData[key];
    if (!data) continue;

    if (key === 'problemAnalysis') {
      const pa = data;
      if (
        pa?.coreProblem?.title ||
        pa?.coreProblem?.description ||
        pa?.causes?.length > 0 ||
        pa?.consequences?.length > 0
      ) {
        sections.push(`Problem Analysis:\n${JSON.stringify(pa, null, 2)}`);
      }
    } else if (key === 'projectIdea') {
      const pi = data;
      if (pi?.mainAim || pi?.stateOfTheArt || pi?.proposedSolution || pi?.projectTitle) {
        let endDateStr = '';
        if (pi?.startDate && pi?.durationMonths) {
          endDateStr = calculateProjectEndDate(pi.startDate, pi.durationMonths);
        }
        const piWithDates = {
          ...pi,
          _calculatedEndDate: endDateStr,
          _projectTimeframe: pi?.startDate && endDateStr
            ? `Project runs from ${pi.startDate} to ${endDateStr} (${pi.durationMonths} months). ALL tasks, milestones, and deliverables MUST fall within this timeframe. NO exceptions.`
            : ''
        };
        sections.push(`Project Idea:\n${JSON.stringify(piWithDates, null, 2)}`);
      }
    } else if (key === 'generalObjectives' && Array.isArray(data) && data.length > 0) {
      sections.push(`General Objectives:\n${JSON.stringify(data, null, 2)}`);
    } else if (key === 'specificObjectives' && Array.isArray(data) && data.length > 0) {
      sections.push(`Specific Objectives:\n${JSON.stringify(data, null, 2)}`);
    } else if (key === 'activities' && Array.isArray(data) && data.length > 0) {
      sections.push(`Activities (Work Packages):\n${JSON.stringify(data, null, 2)}`);
    } else if (key === 'partners' && Array.isArray(data) && data.length > 0) {
      sections.push(`Partners (Consortium):\n${JSON.stringify(data, null, 2)}`);
    } else if (key === 'outputs' && Array.isArray(data) && data.length > 0) {
      sections.push(`Outputs:\n${JSON.stringify(data, null, 2)}`);
    } else if (key === 'outcomes' && Array.isArray(data) && data.length > 0) {
      sections.push(`Outcomes:\n${JSON.stringify(data, null, 2)}`);
    } else if (key === 'impacts' && Array.isArray(data) && data.length > 0) {
      sections.push(`Impacts:\n${JSON.stringify(data, null, 2)}`);
    } else if (key === 'fundingModel' && typeof data === 'string') {
      sections.push(`Funding Model: ${data}`);
    }
  }

  return sections.length > 0
    ? `Here is the relevant project context:\n${sections.join('\n')}`
    : 'No project data available yet.';
};

// ═══════════════════════════════════════════════════════════════
// KNOWLEDGE BASE CONTEXT
// ═══════════════════════════════════════════════════════════════

let _kbCache: { orgId: string; texts: string; timestamp: number } | null = null;
const KB_CACHE_TTL = 60000;

const getKnowledgeBaseContext = async (): Promise<string> => {
  try {
    const orgId = storageService.getActiveOrgId();
    if (!orgId) return '';

    if (_kbCache && _kbCache.orgId === orgId && (Date.now() - _kbCache.timestamp) < KB_CACHE_TTL) {
      return _kbCache.texts;
    }

    const documents = await knowledgeBaseService.getAllExtractedTexts(orgId);

    if (documents.length === 0) {
      _kbCache = { orgId, texts: '', timestamp: Date.now() };
      return '';
    }

    const header =
      '\u2550\u2550\u2550 MANDATORY KNOWLEDGE BASE DOCUMENTS \u2550\u2550\u2550\n' +
      'The following documents are uploaded by the organization admin.\n' +
      'You MUST consider this information when generating content.\n' +
      'Treat these as authoritative reference material.\n\n';

    const body = documents.map((doc, idx) =>
      `\u2500\u2500 Document ${idx + 1}: ${doc.fileName} \u2500\u2500\n${doc.text.substring(0, 8000)}`
    ).join('\n\n');

    const result = header + body;

    _kbCache = { orgId, texts: result, timestamp: Date.now() };

    console.log(`[KnowledgeBase] Injected ${documents.length} documents (${result.length} chars) into AI context`);

    return result;
  } catch (e) {
    console.warn('[KnowledgeBase] Failed to load KB context:', e);
    return '';
  }
};

// ─── ORIGINAL getContext() — backward compatibility ─────────────

const getContext = (projectData: any): string => {
  const sections: string[] = [];

  const pa = projectData.problemAnalysis;
  if (
    pa?.coreProblem?.title ||
    pa?.coreProblem?.description ||
    pa?.causes?.length > 0 ||
    pa?.consequences?.length > 0
  ) {
    sections.push(`Problem Analysis:\n${JSON.stringify(pa, null, 2)}`);
  }

  const pi = projectData.projectIdea;
  if (pi?.mainAim || pi?.stateOfTheArt || pi?.proposedSolution || pi?.projectTitle) {
    let endDateStr = '';
    if (pi?.startDate && pi?.durationMonths) {
      endDateStr = calculateProjectEndDate(pi.startDate, pi.durationMonths);
    }
    const piWithDates = {
      ...pi,
      _calculatedEndDate: endDateStr,
      _projectTimeframe: pi?.startDate && endDateStr
        ? `Project runs from ${pi.startDate} to ${endDateStr} (${pi.durationMonths} months). ALL tasks, milestones, and deliverables MUST fall within this timeframe. NO exceptions.`
        : ''
    };
    sections.push(`Project Idea:\n${JSON.stringify(piWithDates, null, 2)}`);
  }

  if (projectData.generalObjectives?.length > 0) {
    sections.push(`General Objectives:\n${JSON.stringify(projectData.generalObjectives, null, 2)}`);
  }
  if (projectData.specificObjectives?.length > 0) {
    sections.push(`Specific Objectives:\n${JSON.stringify(projectData.specificObjectives, null, 2)}`);
  }
  if (projectData.activities?.length > 0) {
    sections.push(`Activities (Work Packages):\n${JSON.stringify(projectData.activities, null, 2)}`);
  }
  if (projectData.outputs?.length > 0) {
    sections.push(`Outputs:\n${JSON.stringify(projectData.outputs, null, 2)}`);
  }
  if (projectData.outcomes?.length > 0) {
    sections.push(`Outcomes:\n${JSON.stringify(projectData.outcomes, null, 2)}`);
  }
  if (projectData.impacts?.length > 0) {
    sections.push(`Impacts:\n${JSON.stringify(projectData.impacts, null, 2)}`);
  }
  if (projectData.partners?.length > 0) {
    sections.push(`Partners (Consortium):\n${JSON.stringify(projectData.partners, null, 2)}`);
  }
  if (projectData.fundingModel) {
    sections.push(`Funding Model: ${projectData.fundingModel}`);
  }

  return sections.length > 0
    ? `Here is the current project information (Context):\n${sections.join('\n')}`
    : 'No project data available yet.';
};

// ─── JSON SCHEMA TEXT INSTRUCTION ───────────────────────────────

const schemaToTextInstruction = (schema: any): string => {
  try {
    const typeToString = (t: any): string => {
      if (!t) return 'string';
      if (typeof t === 'string') return t.toLowerCase();
      const str = String(t);
      return str ? str.toLowerCase() : 'string';
    };

    const simplify = (s: any): any => {
      if (!s) return 'any';
      const sType = typeToString(s.type);

      if (sType === 'object') {
        const props: any = {};
        if (s.properties) {
          for (const [key, val] of Object.entries(s.properties)) {
            props[key] = simplify(val);
          }
        }
        return { type: 'object', properties: props, required: s.required || [] };
      }

      if (sType === 'array') return { type: 'array', items: simplify(s.items) };
      if (s.enum) return { type: sType, enum: s.enum };
      return sType;
    };

    return `\n\nRESPONSE JSON SCHEMA (you MUST follow this structure exactly):\n${JSON.stringify(simplify(schema), null, 2)}\n`;
  } catch (e) {
    console.warn('[schemaToTextInstruction] Failed to convert schema:', e);
    return '';
  }
};

// ─── JSON SCHEMAS ───────────────────────────────────────────────

const problemNodeSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    description: { type: Type.STRING },
  },
  required: ['title', 'description']
};

const readinessLevelValueSchema = {
  type: Type.OBJECT,
  properties: {
    level: { type: Type.INTEGER },
    justification: { type: Type.STRING }
  },
  required: ['level', 'justification']
};

const _referenceEntrySchema = {
  type: Type.OBJECT,
  properties: {
    inlineMarker: { type: Type.STRING },
    authors: { type: Type.STRING },
    year: { type: Type.STRING },
    title: { type: Type.STRING },
    source: { type: Type.STRING },
    url: { type: Type.STRING },
    doi: { type: Type.STRING },
    sectionKey: { type: Type.STRING },
  },
  // ★ EO-159 BUG 18: Require critical fields to prevent incomplete refs
  required: ['authors', 'title', 'year', 'inlineMarker'],
};

const _referencesArraySchema = {
  type: Type.ARRAY,
  items: _referenceEntrySchema
};

const schemas: Record<string, any> = {
  problemAnalysis: {
    type: Type.OBJECT,
    properties: {
      coreProblem: problemNodeSchema,
      causes: { type: Type.ARRAY, items: problemNodeSchema },
      consequences: { type: Type.ARRAY, items: problemNodeSchema },
      _references: _referencesArraySchema,
    },
    required: ['coreProblem', 'causes', 'consequences']
  },

  projectIdea: {
    type: Type.OBJECT,
    properties: {
      projectTitle: { type: Type.STRING },
      projectAcronym: { type: Type.STRING },
      mainAim: { type: Type.STRING },
      stateOfTheArt: { type: Type.STRING },
      proposedSolution: { type: Type.STRING },
      policies: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING }
          },
          required: ['name', 'description']
        }
      },
      readinessLevels: {
        type: Type.OBJECT,
        properties: {
          TRL: readinessLevelValueSchema,
          SRL: readinessLevelValueSchema,
          ORL: readinessLevelValueSchema,
          LRL: readinessLevelValueSchema,
        },
        required: ['TRL', 'SRL', 'ORL', 'LRL']
      },
      _references: _referencesArraySchema,
    },
    required: ['projectTitle', 'projectAcronym', 'mainAim', 'stateOfTheArt', 'proposedSolution', 'policies', 'readinessLevels']
  },

  // ★ EO-159 BUG 12: Wrap objectives in object to allow _references sibling
  objectives: {
    type: Type.OBJECT,
    properties: {
      items: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'Objective title' },
            description: { type: Type.STRING, description: 'Objective description with in-text citations' },
            indicator: { type: Type.STRING, description: 'Measurable indicator' },
          },
          required: ['title', 'description', 'indicator'],
        },
      },
      _references: _referencesArraySchema,
    },
    required: ['items'],
  },

  projectManagement: {
    type: Type.OBJECT,
    properties: {
      description: { type: Type.STRING },
      structure: {
        type: Type.OBJECT,
        properties: {
          coordinator: { type: Type.STRING },
          steeringCommittee: { type: Type.STRING },
          advisoryBoard: { type: Type.STRING },
          wpLeaders: { type: Type.STRING }
        },
        required: ['coordinator', 'steeringCommittee', 'wpLeaders']
      },
      _references: _referencesArraySchema,
    },
    required: ['description', 'structure']
  },

  activities: {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        title: { type: Type.STRING },
        tasks: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              startDate: { type: Type.STRING },
              endDate: { type: Type.STRING },
              dependencies: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    predecessorId: { type: Type.STRING },
                    type: { type: Type.STRING, enum: ['FS', 'SS', 'FF', 'SF'] }
                  },
                  required: ['predecessorId', 'type']
                }
              }
            },
            required: ['id', 'title', 'description', 'startDate', 'endDate']
          }
        },
        milestones: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              description: { type: Type.STRING },
              date: { type: Type.STRING }
            },
            required: ['id', 'description', 'date']
          }
        },
        deliverables: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              indicator: { type: Type.STRING }
            },
            required: ['id', 'title', 'description', 'indicator']
          }
        }
      },
      required: ['id', 'title', 'tasks', 'milestones', 'deliverables']
    }
  },

  // ★ EO-159 BUG 12: Wrap results in object to allow _references sibling
  results: {
    type: Type.OBJECT,
    properties: {
      items: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            indicator: { type: Type.STRING }
          },
          required: ['title', 'description', 'indicator']
        },
      },
      _references: _referencesArraySchema,
    },
    required: ['items'],
  },

  // ★ EO-159 BUG 12: Wrap risks in object to allow _references sibling
  risks: {
    type: Type.OBJECT,
    properties: {
      items: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            category: { type: Type.STRING, enum: ['technical', 'social', 'economic', 'environmental'] },
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            likelihood: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
            impact: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
            mitigation: { type: Type.STRING }
          },
          required: ['id', 'category', 'title', 'description', 'likelihood', 'impact', 'mitigation']
        },
      },
      _references: _referencesArraySchema,
    },
    required: ['items'],
  },

  // ★ EO-159 BUG 12: Wrap kers in object to allow _references sibling
  kers: {
    type: Type.OBJECT,
    properties: {
      items: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            exploitationStrategy: { type: Type.STRING }
          },
          required: ['id', 'title', 'description', 'exploitationStrategy']
        },
      },
      _references: _referencesArraySchema,
    },
    required: ['items'],
  },

  coreProblem: problemNodeSchema,
  causes: { type: Type.ARRAY, items: problemNodeSchema },
  consequences: { type: Type.ARRAY, items: problemNodeSchema },

  projectTitleAcronym: {
    type: Type.OBJECT,
    properties: {
      projectTitle: { type: Type.STRING },
      projectAcronym: { type: Type.STRING }
    },
    required: ['projectTitle', 'projectAcronym']
  },

  mainAim: {
    type: Type.OBJECT,
    properties: {
      mainAim: { type: Type.STRING },
      _references: _referencesArraySchema
    },
    required: ['mainAim']
  },

  stateOfTheArt: {
    type: Type.OBJECT,
    properties: {
      stateOfTheArt: { type: Type.STRING },
      _references: _referencesArraySchema
    },
    required: ['stateOfTheArt']
  },

  proposedSolution: {
    type: Type.OBJECT,
    properties: {
      proposedSolution: { type: Type.STRING },
      _references: _referencesArraySchema
    },
    required: ['proposedSolution']
  },

  readinessLevels: {
    type: Type.OBJECT,
    properties: {
      TRL: readinessLevelValueSchema,
      SRL: readinessLevelValueSchema,
      ORL: readinessLevelValueSchema,
      LRL: readinessLevelValueSchema,
    },
    required: ['TRL', 'SRL', 'ORL', 'LRL']
  },

  policies: {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        description: { type: Type.STRING }
      },
      required: ['name', 'description']
    }
  },

  partners: {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        code: { type: Type.STRING },
        name: { type: Type.STRING },
        expertise: { type: Type.STRING },
        pmRate: { type: Type.NUMBER },
        partnerType: {
          type: Type.STRING,
          enum: [
            'faculty',
            'researchInstitute',
            'sme',
            'publicAgency',
            'internationalAssociation',
            'ministry',
            'ngo',
            'largeEnterprise',
            'other'
          ]
        },
      },
      required: ['id', 'code', 'name', 'expertise', 'pmRate', 'partnerType']
    }
  },
};

// ─── SECTION / CHAPTER / SCHEMA MAPPINGS ────────────────────────

const SECTION_TO_CHAPTER: Record<string, string> = {
  ...SECTION_TO_CHAPTER_MAP,
  expectedResults: 'chapter6_results',
  coreProblem: 'chapter1_problemAnalysis',
  causes: 'chapter1_problemAnalysis',
  consequences: 'chapter1_problemAnalysis',
  projectTitleAcronym: 'chapter2_projectIdea',
  mainAim: 'chapter2_projectIdea',
  stateOfTheArt: 'chapter2_projectIdea',
  proposedSolution: 'chapter2_projectIdea',
  readinessLevels: 'chapter2_projectIdea',
  policies: 'chapter2_projectIdea',
};

const SECTION_TO_SCHEMA: Record<string, string> = {
  problemAnalysis: 'problemAnalysis',
  projectIdea: 'projectIdea',
  generalObjectives: 'objectives',
  specificObjectives: 'objectives',
  projectManagement: 'projectManagement',
  activities: 'activities',
  outputs: 'results',
  outcomes: 'results',
  impacts: 'results',
  risks: 'risks',
  kers: 'kers',
  expectedResults: 'results',
  coreProblem: 'coreProblem',
  causes: 'causes',
  consequences: 'consequences',
  projectTitleAcronym: 'projectTitleAcronym',
  mainAim: 'mainAim',
  stateOfTheArt: 'stateOfTheArt',
  proposedSolution: 'proposedSolution',
  readinessLevels: 'readinessLevels',
  policies: 'policies',
  partners: 'partners',
};

// ─── HELPERS ─────────────────────────────────────────────────────

const isValidDate = (d: any): boolean => d instanceof Date && !isNaN(d.getTime());

const sanitizeActivities = (activities: any[]): any[] => {
  const taskMap = new Map<string, { startDate: Date; endDate: Date }>();

  activities.forEach(wp => {
    if (wp.tasks) {
      wp.tasks.forEach((task: any) => {
        if (task.id && task.startDate && task.endDate) {
          taskMap.set(task.id, {
            startDate: new Date(task.startDate),
            endDate: new Date(task.endDate)
          });
        }
      });
    }
  });

  activities.forEach(wp => {
    if (wp.tasks) {
      wp.tasks.forEach((task: any) => {
        if (task.dependencies && Array.isArray(task.dependencies)) {
          task.dependencies.forEach((dep: any) => {
            const pred = taskMap.get(dep.predecessorId);
            const curr = taskMap.get(task.id);
            if (pred && curr && isValidDate(pred.startDate) && isValidDate(pred.endDate) && isValidDate(curr.startDate)) {
              if (dep.type === 'FS' && curr.startDate <= pred.endDate) dep.type = 'SS';
            }
          });
        }
      });
    }
  });

  return activities;
};

// ═══════════════════════════════════════════════════════════════
// TEMPORAL INTEGRITY ENFORCER
// ═══════════════════════════════════════════════════════════════

const enforceTemporalIntegrity = (activities: any[], projectData: any): any[] => {
  const startStr = projectData.projectIdea?.startDate;
  const months = projectData.projectIdea?.durationMonths || 24;

  if (!startStr) return activities;
  if (!activities || activities.length === 0) return activities;

  const startISO = startStr;
  const endISO = calculateProjectEndDate(startStr, months);
  const projectStart = new Date(startISO + 'T00:00:00Z');
  const projectEnd = new Date(endISO + 'T00:00:00Z');

  console.log(`[TemporalIntegrity] Enforcing project envelope: ${startISO} → ${endISO} (${months} months)`);

  let fixCount = 0;

  activities.forEach((wp) => {
    if (wp.tasks && Array.isArray(wp.tasks)) {
      wp.tasks.forEach((task: any) => {
        if (task.startDate) {
          const taskStart = new Date(task.startDate);
          if (taskStart < projectStart) {
            task.startDate = startISO;
            fixCount++;
          }
        }
        if (task.endDate) {
          const taskEnd = new Date(task.endDate);
          if (taskEnd > projectEnd) {
            task.endDate = endISO;
            fixCount++;
          }
        }
        if (task.startDate && task.endDate && task.startDate > task.endDate) {
          task.startDate = task.endDate;
          fixCount++;
        }
      });
    }

    if (wp.milestones && Array.isArray(wp.milestones)) {
      wp.milestones.forEach((ms: any) => {
        if (ms.date) {
          const msDate = new Date(ms.date);
          if (msDate < projectStart) { ms.date = startISO; fixCount++; }
          if (msDate > projectEnd) { ms.date = endISO; fixCount++; }
        }
      });
    }
  });

  if (activities.length >= 2) {
    const pmWP = activities[activities.length - 1];
    const dissWP = activities[activities.length - 2];

    [pmWP, dissWP].forEach((wp) => {
      if (wp.tasks && wp.tasks.length > 0) {
        const sorted = [...wp.tasks].sort((a: any, b: any) =>
          new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        );
        if (sorted[0].startDate !== startISO) {
          sorted[0].startDate = startISO;
          fixCount++;
        }
        const lastTask = sorted[sorted.length - 1];
        if (lastTask.endDate !== endISO) {
          lastTask.endDate = endISO;
          fixCount++;
        }
      }
    });
  }

  if (fixCount > 0) {
    console.log(`[TemporalIntegrity] Applied ${fixCount} date corrections.`);
  }

  return activities;
};

// ─── SMART MERGE ────────────────────────────────────────────────

const smartMerge = (original: any, generated: any): any => {
  if (original === undefined || original === null) return generated;
  if (generated === undefined || generated === null) return original;

  if (typeof original === 'string') {
    return original.trim().length > 0 ? original : generated;
  }

  if (Array.isArray(original) && Array.isArray(generated)) {
    const length = Math.max(original.length, generated.length);
    const mergedArray: any[] = [];
    for (let i = 0; i < length; i++) {
      mergedArray.push(i < original.length ? smartMerge(original[i], generated[i]) : generated[i]);
    }
    return mergedArray;
  }

  if (typeof original === 'object' && typeof generated === 'object') {
    const mergedObj = { ...generated };
    for (const key in original) {
      if (Object.prototype.hasOwnProperty.call(original, key)) {
        mergedObj[key] = smartMerge(original[key], generated?.[key]);
      }
    }
    return mergedObj;
  }

  return original !== null && original !== undefined ? original : generated;
};

// ─── TASK INSTRUCTION BUILDER ───────────────────────────────────

const buildTaskInstruction = (
  sectionKey: string,
  projectData: any,
  language: 'en' | 'si'
): string => {
  const SUB_TO_PARENT_TASK: Record<string, string> = {
    coreProblem: 'problemAnalysis',
    causes: 'problemAnalysis',
    consequences: 'problemAnalysis',
    projectTitleAcronym: 'projectIdea',
    mainAim: 'projectIdea',
    stateOfTheArt: 'projectIdea',
    proposedSolution: 'projectIdea',
    readinessLevels: 'projectIdea',
    policies: 'projectIdea',
  };

  const effectiveKey = SUB_TO_PARENT_TASK[sectionKey] || sectionKey;
  let taskInstr = getTaskInstruction(effectiveKey, language);

  switch (effectiveKey) {
    case 'problemAnalysis': {
      const cp = projectData.problemAnalysis?.coreProblem;
      const titleStr = cp?.title?.trim() || '';
      const descStr = cp?.description?.trim() || '';
      const contextParts: string[] = [];
      if (titleStr) contextParts.push(`Title: "${titleStr}"`);
      if (descStr) contextParts.push(`Description: "${descStr}"`);
      const userInput = contextParts.length > 0 ? contextParts.join('\n') : '(no user input yet)';
      taskInstr = taskInstr.replace('{{userInput}}', userInput);
      break;
    }

    case 'projectIdea': {
      const userTitle = projectData.projectIdea?.projectTitle?.trim() || '';
      if (userTitle) {
        const titleContext =
          `USER INPUT FOR PROJECT TITLE: "${userTitle}"\n` +
          `TITLE RULES:\n` +
          `- If the user's input is acceptable (30–200 chars, noun phrase, no acronym), KEEP IT UNCHANGED.\n` +
          `- If the user's input is too short, too long, or contains a verb, IMPROVE it following the project title rules above.\n` +
          `- NEVER generate a completely different title — stay on the user's topic.\n\n`;
        taskInstr = taskInstr.replace('{{titleContext}}', titleContext);
      } else {
        taskInstr = taskInstr.replace('{{titleContext}}', '');
      }
      break;
    }

    case 'partners': {
      const wpCount = (projectData.activities || []).length;
      const wpTitles = (projectData.activities || []).map((wp: any) => wp.title || wp.id).join(', ');
      const fundingModel = projectData.fundingModel || 'centralized';
      if (wpCount > 0) {
        taskInstr += `\n\nADDITIONAL CONTEXT FOR PARTNER GENERATION:\n- Funding Model: ${fundingModel}\n- Number of WPs: ${wpCount}\n- WP Titles: ${wpTitles}`;
      }
      break;
    }

    case 'activities': {
      const today = new Date().toISOString().split('T')[0];
      const pStart = projectData.projectIdea?.startDate || today;
      const pMonths = projectData.projectIdea?.durationMonths || 24;
      const pEnd = calculateProjectEndDate(pStart, pMonths);
      taskInstr = taskInstr
        .replaceAll('{{projectStart}}', pStart)
        .replaceAll('{{projectEnd}}', pEnd)
        .replaceAll('{{projectDurationMonths}}', String(pMonths));
      break;
    }
  }

  return taskInstr;
};
// ───────────────────────────────────────────────────────────────
// PROMPT BUILDER
// v7.16: inline citation enforcement added
// ───────────────────────────────────────────────────────────────

const getPromptAndSchemaForSection = (
  sectionKey: string,
  projectData: any,
  language: 'en' | 'si' = 'en',
  mode: string = 'regenerate',
  currentSectionData: any = null,
  approvedSourcesBlock: string = ''
) => {
  const context = getRelevantContext(sectionKey, projectData);
  const schemaKey = SECTION_TO_SCHEMA[sectionKey];
  const schema = schemas[schemaKey];

  if (!schema) throw new Error(`Unknown section key: ${sectionKey}`);

  const config = getProviderConfig();
  const needsTextSchema = config.provider !== 'gemini';
  const textSchema = needsTextSchema ? schemaToTextInstruction(schema) : '';

  const interventionLogic = INTERVENTION_LOGIC_SECTIONS.has(sectionKey)
    ? getInterventionLogicFramework()
    : '';

  const langDirective = getLanguageDirective(language);
  const langMismatchNotice = detectInputLanguageMismatch(projectData, language);
  const globalRules = getGlobalRules();
  const sectionRules = getRulesForSection(sectionKey, language);
  const academicRules = ACADEMIC_RIGOR_SECTIONS.has(sectionKey)
    ? getAcademicRigorRules(language)
    : '';
  const humanRules = getHumanizationRules(language);
  const titleRules = (sectionKey === 'projectIdea' || sectionKey === 'projectTitleAcronym')
    ? getProjectTitleRules(language)
    : '';

  const consortiumRules = (sectionKey === 'partners' || sectionKey === 'activities')
    ? getConsortiumAllocationRules()
    : '';

  const resourceRules = (sectionKey === 'partners' || sectionKey === 'activities')
    ? getResourceCoherenceRules()
    : '';

  let modeInstruction = getModeInstruction(mode, language);
  if ((mode === 'fill' || mode === 'enhance') && currentSectionData) {
    modeInstruction = `${modeInstruction}\nExisting data: ${JSON.stringify(currentSectionData)}`;
  }

  const taskInstruction = buildTaskInstruction(sectionKey, projectData, language);

  const qualityGates = getQualityGates(sectionKey, language);
  const qualityGateBlock = qualityGates.length > 0
    ? `\nQUALITY GATE — verify ALL before returning JSON:\n${formatRulesAsList(qualityGates)}`
    : '';

  let temporalRuleBlock = '';
  if (sectionKey === 'activities') {
    const today = new Date().toISOString().split('T')[0];
    const pStart = projectData.projectIdea?.startDate || today;
    const pMonths = projectData.projectIdea?.durationMonths || 24;
    const pEnd = calculateProjectEndDate(pStart, pMonths);
    temporalRuleBlock = getTemporalIntegrityRule(language)
      .replace(/\{\{projectStart\}\}/g, pStart)
      .replace(/\{\{projectEnd\}\}/g, pEnd)
      .replace(/\{\{projectDurationMonths\}\}/g, String(pMonths));
  }

  const SUB_SECTION_FOCUS: Record<string, string> = {
    coreProblem:
      'FOCUS: Generate ONLY the Core Problem (title + description). Do NOT generate causes or consequences.',

    causes:
      'FOCUS: Generate ONLY the Causes array (4-6 causes, each with title + description + real citations using the format (Author/Institution, Year) [N]). Do NOT generate core problem or consequences.',

    consequences:
      'FOCUS: Generate ONLY the Consequences array (4-6 consequences, each with title + description + real citations using the format (Author/Institution, Year) [N]). Do NOT generate core problem or causes.',

    projectTitleAcronym:
      'FOCUS: Generate ONLY projectTitle and projectAcronym. Follow the PROJECT TITLE RULES and ACRONYM RULES strictly. Return JSON object with exactly 2 fields.',

    mainAim:
      'FOCUS: Generate ONLY the Main Aim — one comprehensive sentence starting with an infinitive verb. If factual support is included, citations must use the format (Author/Institution, Year) [N], never bare [N]. Return JSON object: { "mainAim": "..." }',

    stateOfTheArt:
      'FOCUS: Generate ONLY the State of the Art — a thorough analysis of the current situation with ≥3 citations from real sources using the format (Author/Institution, Year) [N]. Return JSON object: { "stateOfTheArt": "..." }',

    proposedSolution:
      'FOCUS: Generate ONLY the Proposed Solution — start with 5-8 sentence introduction, then phases with plain text headers. If citations are used, use the format (Author/Institution, Year) [N]. Return JSON object: { "proposedSolution": "..." }',

    readinessLevels:
      'FOCUS: Generate ONLY the Readiness Levels (TRL, SRL, ORL, LRL) — each with a numeric level and justification. Return JSON object with exactly 4 sub-objects.',

    policies:
      'FOCUS: Generate ONLY the EU Policies array (3-5 policies, each with name + description). If factual or legal claims are cited, use the format (Author/Institution, Year) [N]. Do NOT generate other project idea fields.',
  };

  const focusInstruction = SUB_SECTION_FOCUS[sectionKey] || '';

  const prompt = [
    interventionLogic,
    focusInstruction ? `\n★★★ ${focusInstruction} ★★★\n` : '',
    temporalRuleBlock ? `\n${temporalRuleBlock}\n` : '',
    langDirective,
    langMismatchNotice ? `\n${langMismatchNotice}\n` : '',
    `\nGLOBAL RULES:\n${globalRules}`,
    sectionRules ? `\nDETAILED CHAPTER RULES:\n${sectionRules}` : '',
    academicRules ? `\n${academicRules}` : '',
    ACADEMIC_RIGOR_SECTIONS.has(sectionKey) ? `\n${_buildCitationEnforcement(_gsGetPrefix(sectionKey))}` : '',
    humanRules ? `\n${humanRules}` : '',
    titleRules ? `\n${titleRules}` : '',
    consortiumRules ? `\n${consortiumRules}` : '',
    resourceRules ? `\n${resourceRules}` : '',
    `\n${context}`,
    // ★ EO-175R: Approved sources injected HERE (before task instruction) so Gemini sees
    // the real DOI/URL pool BEFORE it reads the generation task. Previous position (after
    // _repairInstructions at the bottom) meant Gemini had already planned its citations.
    approvedSourcesBlock
      ? `\n═══ APPROVED SOURCES — CITE ONLY FROM THIS LIST ═══\n${approvedSourcesBlock}\n═══ END APPROVED SOURCES ═══\nYou MUST cite ONLY from the sources listed above. Do NOT invent URLs or DOIs. If a claim has no matching approved source, write it without a citation marker.\n${getApprovedSourcePoolRules()}`
      : '',
    taskInstruction ? `\n${taskInstruction}` : '',
    modeInstruction ? `\n${modeInstruction}` : '',
    textSchema,
    qualityGateBlock,
    temporalRuleBlock ? `\n${temporalRuleBlock}` : '',
    focusInstruction ? `\n★★★ REMINDER: ${focusInstruction} ★★★` : '',
    projectData._repairInstructions ? `\n★★★ ${projectData._repairInstructions} ★★★` : '',
    // ★ EO-175R: approvedSourcesBlock moved to BEFORE taskInstruction (see above) — removed from here.
    ACADEMIC_RIGOR_SECTIONS.has(sectionKey)
      ? `\nFINAL CITATION FORMAT REMINDER:\nUse short inline attribution + marker: (Author/Institution, Year) [${_gsGetPrefix(sectionKey)}-N]. Bare [N] without prefix is invalid. Start at [${_gsGetPrefix(sectionKey)}-1].\n`
      : '',
    // ★ EO-159 BUG 28: Only inject full reference requirement for schemas that support _references
    (() => {
      const schemaSupportsRefs = ['problemAnalysis', 'projectIdea', 'projectManagement',
        'mainAim', 'stateOfTheArt', 'proposedSolution'].includes(sectionKey);
      const wrappedSchemaSupportsRefs = ['generalObjectives', 'specificObjectives',
        'outputs', 'outcomes', 'impacts', 'kers', 'risks'].includes(sectionKey);
      if (schemaSupportsRefs || wrappedSchemaSupportsRefs) {
        return getReferencesRequirement();
      }
      return `Use in-text citations in format (Author, Year) where relevant.`;
    })(),
    (sectionKey === 'projectIdea' || sectionKey === 'stateOfTheArt' || sectionKey === 'proposedSolution')
      ? '\n★★★ REFERENCE QUALITY REQUIREMENT ★★★\nReturn between 3 and 10 references in the _references array — ONLY high-quality, verifiable sources.\nEVERY reference MUST have ALL of these fields filled with REAL data:\n- authors (full author names — NEVER empty)\n- year (publication year)\n- title (exact publication title)\n- source (journal, institution, or publisher)\n- url (real, working URL — preferably https://doi.org/... format)\n- doi (if available)\n- inlineMarker (matching the [N] citation in the text)\nDo NOT return references with empty authors or empty titles.\nDo NOT fabricate references — only cite sources you can verify.\nPrefer recent publications (2018–2025) from peer-reviewed journals, EU institutions, or WHO/UN agencies.\nFEWER high-quality references are BETTER than many incomplete ones.\n★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★\n'
      : '',
  ].filter(Boolean).join('\n');

  return {
    prompt,
    jsonSchema: needsTextSchema ? undefined : schema  // ★ EO-162b: was schema: (unknown field) + null → undefined
  };
};

// ═══════════════════════════════════════════════════════════════
// PUBLIC API: SECTION GENERATION
// ═══════════════════════════════════════════════════════════════

// ★ EO-161/EO-167d: Estimate expected item count for dynamic token calculation.
// Returns REAL item counts so calculateDynamicTokenLimit can size output correctly.
function getExpectedItemCountFromProjectData(sectionKey: string, projectData: any): number {
  switch (sectionKey) {
    // ── Object-structure sections — logical sub-item counts ──
    case 'problemAnalysis': {
      // coreProblem (1) + causes + consequences
      const pa = projectData?.problemAnalysis;
      const causesLen = pa?.causes?.length || 4;
      const consequencesLen = pa?.consequences?.length || 4;
      return 1 + causesLen + consequencesLen;  // ≈ 11 with defaults
    }
    case 'projectIdea':
      return 10;  // mainAim + stateOfTheArt + proposedSolution + policies + logical sub-structure
    case 'projectManagement':
      return 5;   // operational description sub-sections
    case 'stateOfTheArt':
      return 5;   // research overview paragraphs / thematic clusters
    case 'proposedSolution':
      return 5;   // phased solution sections
    case 'mainAim':
    case 'coreProblem':
      return 1;   // single output object

    // ── Array sections — actual array length ──
    case 'generalObjectives':
      return Math.max(3, projectData?.generalObjectives?.length || 3);
    case 'specificObjectives':
      return Math.max(5, projectData?.specificObjectives?.length || 5);
    case 'outputs':
      return Math.max(3, projectData?.outputs?.length || 3);
    case 'outcomes':
      return Math.max(3, projectData?.outcomes?.length || 3);
    case 'impacts':
      return Math.max(3, projectData?.impacts?.length || 3);
    case 'risks':
      return Math.max(5, projectData?.risks?.length || 5);
    case 'kers':
      return Math.max(3, projectData?.kers?.length || 3);
    case 'causes':
      return Math.max(3, projectData?.problemAnalysis?.causes?.length || 3);
    case 'consequences':
      return Math.max(3, projectData?.problemAnalysis?.consequences?.length || 3);
    case 'policies':
      return Math.max(3, projectData?.projectIdea?.policies?.length || 3);
    case 'readinessLevels':
      return 4;   // always TRL/SRL/ORL/LRL

    // ── Composite / chunked sections ──
    case 'activities': {
      // Count total tasks across all WPs, not just WP count
      const wps: any[] = projectData?.activities || [];
      const totalTasks = wps.reduce((sum: number, wp: any) => {
        return sum + (wp?.tasks?.length || wp?.activities?.length || 3);
      }, 0);
      return Math.max(3, totalTasks);  // ≈ 18 for a typical 6-WP project with 3 tasks each
    }
    case 'partners':
      return Math.max(3, projectData?.partners?.length || 3);

    default:
      return 3;  // Safe fallback for unrecognised sections (was 1 — too low)
  }
}

export const generateSectionContent = async (
  sectionKey: string,
  projectData: any,
  language: 'en' | 'si' = 'en',
  mode: string = 'regenerate',
  currentSectionData: any = null,
  signal?: AbortSignal,
  approvedSourcesBlock?: string,
  referencesEnabled?: boolean,   // EO-130: when false, uses CITATION_WITHOUT_REFERENCES prompt variant
  _eo161IsComposite?: boolean,   // ★ EO-161: composite runner flag for token estimation
  _eo161RetryCount?: number      // ★ EO-161: internal truncation retry counter (do not pass from callers)
): Promise<any> => {
  if (signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');

  let fullPrompt: string;
  let schemaForRequest: any;

  // EO-130: resolve references-enabled for this section
  const _refsOn = referencesEnabled !== undefined
    ? referencesEnabled
    : (projectData._settings?.referencesEnabled?.[sectionKey] ?? DEFAULT_REFS_ENABLED[sectionKey] ?? false);

  if (projectData._customPromptOverride) {
    fullPrompt = projectData._customPromptOverride;
    schemaForRequest = undefined;
  } else {
    const { prompt, jsonSchema: _sectionJsonSchema } = getPromptAndSchemaForSection(  // ★ EO-162b: renamed schema→jsonSchema
      sectionKey,
      projectData,
      language,
      mode,
      currentSectionData,
      approvedSourcesBlock || ''
    );

    fullPrompt = prompt;

    // EO-130: When references are OFF, replace the INLINE_CITATION_FORMAT_ENFORCEMENT block
    // with CITATION_WITHOUT_REFERENCES (inline Author, Year only — no [N] markers, no _references)
    if (!_refsOn) {
      // EO-169: strip both the static 'N'-prefix version AND any per-section prefix version
      // (e.g. _buildCitationEnforcement('RS'), _buildCitationEnforcement('PM')) by targeting
      // the shared sentinel header that starts every enforcement block.
      const _citationSentinel = '═══ INLINE CITATION FORMAT ENFORCEMENT (MANDATORY) ═══';
      if (fullPrompt.includes(_citationSentinel)) {
        // Replace the entire enforcement block (from sentinel to closing ═══ line) with CWR
        fullPrompt = fullPrompt.replace(
          /═══ INLINE CITATION FORMAT ENFORCEMENT \(MANDATORY\) ═══[\s\S]*?═══+\s*\n/,
          getCitationWithoutReferences()
        );
      } else {
        // Fallback: try exact match on static constant (original behaviour)
        fullPrompt = fullPrompt.split(INLINE_CITATION_FORMAT_ENFORCEMENT).join(getCitationWithoutReferences());
      }
      // Also strip FINAL CITATION FORMAT REMINDER line
      fullPrompt = fullPrompt.replace(/\nFINAL CITATION FORMAT REMINDER:[^\n]*\n/g, '');
      console.log('[EO-130] generateSectionContent: references OFF for "' + sectionKey + '" — using CITATION_WITHOUT_REFERENCES');
    }

    if (KB_RELEVANT_SECTIONS.has(sectionKey)) {
      const kbContext = await getKnowledgeBaseContext();
      if (kbContext) fullPrompt = kbContext + '\n\n' + fullPrompt;
    }

    schemaForRequest = _sectionJsonSchema || undefined;
  }

  // ★ EO-MASTER E5: Honor _maxOutputTokens override from callers (e.g. enrichReferencesWithAI)
  if (projectData._maxOutputTokens && typeof projectData._maxOutputTokens === 'number') {
    if (!(window as any).__lastOutputTokens) (window as any).__lastOutputTokens = {};
    (window as any).__lastOutputTokens[sectionKey] = projectData._maxOutputTokens;
    console.log('[EO-MASTER E5] Token override: ' + projectData._maxOutputTokens + ' for "' + sectionKey + '"');
  }

  if (signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');

  // ★ EO-161: Compute dynamic token params from projectData
  const _eo161ExpectedItems = getExpectedItemCountFromProjectData(sectionKey, projectData);
  const _eo161PrevTokens: number | undefined =
    (_eo161RetryCount && _eo161RetryCount > 0)
      ? undefined  // retry path: previousOutputTokens is already baked into the forced limit below
      : ((window as any).__lastOutputTokens?.[sectionKey] || undefined);

  const result = await generateContent({
    prompt: fullPrompt,
    jsonSchema: schemaForRequest,  // ★ EO-162b: was schema: (silently ignored by AIGenerateOptions)
    jsonMode: true,
    sectionKey,
    signal,
    // ★ EO-161: dynamic token estimation params
    referencesEnabled: _refsOn,
    expectedItemCount: _eo161ExpectedItems,
    previousOutputTokens: _eo161PrevTokens,
    isComposite: _eo161IsComposite ?? false,
  });

  // [EO-138] Capture token usage for cost tracking — will be attached to parsed before return
  const _sectionUsage = result._usage || null;

  let parsed: any;
  const _rawText = result.text || '';

  try {
    parsed = JSON.parse(sanitizeJSONResponse(_rawText));
  } catch (parseErr) {
    console.warn('[geminiService] Initial JSON.parse failed — attempting recovery...');

    let recovered = false;

    try {
      const firstBrace = _rawText.indexOf('{');
      const lastBrace = _rawText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const jsonCandidate = _rawText.substring(firstBrace, lastBrace + 1);
        parsed = JSON.parse(jsonCandidate);
        recovered = true;
        console.log('[geminiService] JSON recovered from text (object)');
      }
    } catch (_recoverErr1) {}

    if (!recovered) {
      try {
        const firstBracket = _rawText.indexOf('[');
        const lastBracket = _rawText.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket > firstBracket) {
          const arrayCandidate = _rawText.substring(firstBracket, lastBracket + 1);
          parsed = JSON.parse(arrayCandidate);
          recovered = true;
          console.log('[geminiService] JSON recovered from text (array)');
        }
      } catch (_recoverErr2) {}
    }

    if (!recovered) {
      try {
        const fenceMatch = _rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch && fenceMatch[1]) {
          parsed = JSON.parse(fenceMatch[1].trim());
          recovered = true;
          console.log('[geminiService] JSON recovered from markdown code fence');
        }
      } catch (_recoverErr3) {}
    }

    // ★ EO-092: Truncated JSON repair — close open brackets/braces
    if (!recovered) {
      try {
        // Strip markdown fence if present
        let truncated = _rawText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
        // Find first { or [
        const firstOpen = Math.min(
          truncated.indexOf('{') === -1 ? Infinity : truncated.indexOf('{'),
          truncated.indexOf('[') === -1 ? Infinity : truncated.indexOf('[')
        );
        if (firstOpen !== Infinity) {
          truncated = truncated.substring(firstOpen);
          // Remove trailing incomplete key-value (cut at last complete comma or closing bracket)
          truncated = truncated.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '');
          truncated = truncated.replace(/,\s*\{[^}]*$/, '');
          truncated = truncated.replace(/,\s*$/, '');
          // Count open/close brackets and braces
          let openBraces = 0, openBrackets = 0;
          let inString = false, escape = false;
          for (let ci = 0; ci < truncated.length; ci++) {
            const ch = truncated[ci];
            if (escape) { escape = false; continue; }
            if (ch === '\\') { escape = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (ch === '{') openBraces++;
            else if (ch === '}') openBraces--;
            else if (ch === '[') openBrackets++;
            else if (ch === ']') openBrackets--;
          }
          // Close unclosed structures
          let suffix = '';
          while (openBrackets > 0) { suffix += ']'; openBrackets--; }
          while (openBraces > 0) { suffix += '}'; openBraces--; }
          const repaired = truncated + suffix;
          // Sanitize control characters inside JSON strings (Gemini sometimes emits raw newlines/tabs)
          const sanitized = repaired.replace(/[\x00-\x1F\x7F]/g, function(ch) {
            if (ch === '\n') return '\\n';
            if (ch === '\r') return '\\r';
            if (ch === '\t') return '\\t';
            return '';
          });
          parsed = JSON.parse(sanitized);
          recovered = true;
          console.log('[geminiService] ★ EO-092: JSON recovered via truncated repair (' + suffix.length + ' closers added)');
        }
      } catch (_repairErr) {
        console.warn('[geminiService] EO-092 truncated repair also failed:', (_repairErr as any)?.message);
      }
    }

   // ★ EO-110: Plain-text fallback — retry with STRICT JSON enforcement for critical sections
    // Root cause: Gemini Flash with google_search sometimes "forgets" JSON schema and returns prose
    // This causes cascading failure: empty partners → skipped allocations → "Partial Generation" dialog
    if (!recovered && (sectionKey === 'partners' || sectionKey === 'risks' || sectionKey === 'projectManagement')) {
      console.warn('[geminiService] EO-110: "' + sectionKey + '" response was plain text (' + _rawText.length + ' chars) — retrying with strict JSON-only prompt');
      try {
        var _eo110IsArray = (sectionKey === 'partners' || sectionKey === 'risks');
        var _eo110RetryPrompt = '\u2605\u2605\u2605 CRITICAL: YOUR PREVIOUS RESPONSE WAS PLAIN TEXT. THIS IS FORBIDDEN. \u2605\u2605\u2605\n'
          + 'You MUST return ONLY valid JSON. No explanatory text. No prose. No markdown.\n'
          + 'Return ONLY a JSON ' + (_eo110IsArray ? 'array: [{...}, {...}, ...]' : 'object: {...}') + '\n'
          + 'DO NOT wrap in markdown fences. DO NOT add any text before or after the JSON.\n\n'
          + fullPrompt;
        var _eo110Result = await generateContent({
          prompt: _eo110RetryPrompt,
          jsonSchema: schemaForRequest,  // ★ EO-162b: was schema: (silently ignored)
          jsonMode: true,
          sectionKey: sectionKey,
          signal: signal,
        });
        var _eo110Text = sanitizeJSONResponse(_eo110Result.text || '');
        parsed = JSON.parse(_eo110Text);
        recovered = true;
        console.log('[geminiService] EO-110: "' + sectionKey + '" recovered via strict JSON retry (' + (_eo110Text.length) + ' chars)');
      } catch (_eo110Err: any) {
        console.warn('[geminiService] EO-110: strict retry also failed for "' + sectionKey + '":', (_eo110Err as any)?.message);
      }
    }

    if (!recovered) {
      console.error('[geminiService] All JSON recovery attempts FAILED (including EO-110). Raw text:', _rawText.substring(0, 500));

      // ★ EO-161 CHANGE E: Detect truncation and auto-retry with higher token limit
      const _isLikelyTruncated = _rawText && _rawText.length > 500 &&
        !_rawText.trim().endsWith('}') && !_rawText.trim().endsWith(']');

      const _retryCount = _eo161RetryCount || 0;

      if (_isLikelyTruncated && _retryCount < 2) {
        // Estimate current limit from previous tokens or ABSOLUTE_MAX / 2 as floor
        const _currentPrevTokens = (window as any).__lastOutputTokens?.[sectionKey] || 8192;
        const _newForcedTokens = Math.min(_currentPrevTokens * 2, 65536);

        console.warn(`[EO-161] Truncated JSON detected for "${sectionKey}" ` +
          `(response ends with: "...${_rawText.slice(-50)}"). ` +
          `Auto-retrying (${_retryCount + 1}/2) with forced previousOutputTokens ${_currentPrevTokens} → ${_newForcedTokens}`);

        // Store the forced higher limit so calculateDynamicTokenLimit picks it up
        if (!(window as any).__lastOutputTokens) (window as any).__lastOutputTokens = {};
        (window as any).__lastOutputTokens[sectionKey] = _newForcedTokens;

        return await generateSectionContent(
          sectionKey,
          projectData,
          language,
          mode,
          currentSectionData,
          signal,
          approvedSourcesBlock,
          referencesEnabled,
          _eo161IsComposite,
          _retryCount + 1
        );
      }

      // ★ EO-161 CHANGE F: Descriptive bilingual error messages
      if (_isLikelyTruncated) {
        const _truncMsg = language === 'si'
          ? 'AI model je vrnil predolg odgovor, ki je bil prekinjen. Sistem je poskusil znova z večjim limitom, ampak ni uspel. Poskusite generirati z manj elementi ali krajšimi opisi.'
          : 'The AI model generated a response that was too long and got cut off. The system retried with a higher limit but did not succeed. Try generating with fewer items or shorter descriptions.';
        throw new Error('AI response was truncated after ' + _retryCount + ' retries. ' + _truncMsg);
      }

      throw new Error('AI response was not valid JSON. Please try again.');
    }
  }

  parsed = stripMarkdown(parsed);

  try {
    const parsedText = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    const hasBareMarker = /(^|[\s(,.;:])\[\d+\](?=[\s).,;:]|$)/.test(parsedText);
    const hasAuthorYearMarker = /\(([A-Z][^)]+?,\s?\d{4})\)\s?\[\d+\]/.test(parsedText);

    if (hasBareMarker && !hasAuthorYearMarker && ACADEMIC_RIGOR_SECTIONS.has(sectionKey)) {
      console.warn('[geminiService] Bare numeric citation markers detected without author/year attribution in section:', sectionKey);
    }
  } catch (_citationWarnErr) {
    // no-op
  }

  if (parsed && typeof parsed === 'object' && Array.isArray(parsed._references)) {
    console.log(
      '[geminiService] _references found (' +
      parsed._references.length +
      ') — urlVerified will be set by Edge Function verification'
    );
  }

  if (['mainAim', 'stateOfTheArt', 'proposedSolution'].includes(sectionKey)) {
    if (parsed && typeof parsed === 'object' && parsed[sectionKey]) {
      if (Array.isArray(parsed._references) && parsed._references.length > 0) {
        const _savedRefs = parsed._references;
        const _unwrappedVal = parsed[sectionKey];

        if (typeof _unwrappedVal === 'string') {
          return { [sectionKey]: _unwrappedVal, _references: _savedRefs };
        } else if (typeof _unwrappedVal === 'object') {
          _unwrappedVal._references = _savedRefs;
          return _unwrappedVal;
        }
      }
      return parsed[sectionKey];
    }
  }

  if (sectionKey === 'projectIdea' && parsed?.projectTitle) {
    parsed.projectTitle = sanitizeProjectTitle(parsed.projectTitle);
  }

  if (sectionKey === 'projectTitleAcronym' && parsed?.projectTitle) {
    parsed.projectTitle = sanitizeProjectTitle(parsed.projectTitle);
  }

  if (sectionKey === 'activities' && Array.isArray(parsed)) {
    parsed = sanitizeActivities(parsed);
    parsed = enforceTemporalIntegrity(parsed, projectData);
  }

  if (sectionKey === 'partners' && Array.isArray(parsed)) {
    parsed = parsed.map((p: any, idx: number) => ({
      ...p,
      id: p.id || `partner-${idx + 1}`,
      code: p.code || (idx === 0 ? (language === 'si' ? 'KO' : 'CO') : `P${idx + 1}`),
      partnerType: (p.partnerType && isValidPartnerType(p.partnerType))
        ? p.partnerType
        : 'other',
    }));
  }

  if (mode === 'fill' && currentSectionData) {
    parsed = smartMerge(currentSectionData, parsed);
  }

  const logEmptyFields = (obj: any, path: string = ''): void => {
    if (Array.isArray(obj)) {
      obj.forEach((item: any, idx: number) => logEmptyFields(item, path + '[' + idx + ']'));
    } else if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && value.trim() === '') {
          console.warn(`[geminiService] Empty field: "${path ? path + '.' : ''}${key}" in section "${sectionKey}"`);
        } else if (typeof value === 'object' && value !== null) {
          logEmptyFields(value, path ? path + '.' + key : key);
        }
      }
    }
  };

  logEmptyFields(parsed);

  // [EO-138] Attach usage metadata to parsed result for cost tracking in useGeneration
  if (_sectionUsage && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    parsed._usage = _sectionUsage;
  } else if (_sectionUsage) {
    // parsed is array or primitive — wrap in container for usage passthrough
    if (Array.isArray(parsed)) {
      // Store usage on array object property (arrays are objects)
      (parsed as any)._usage = _sectionUsage;
    }
  }

  return parsed;
};

// ═══════════════════════════════════════════════════════════════
// PUBLIC API: PER-WP ACTIVITIES GENERATION
// ═══════════════════════════════════════════════════════════════

export const generateActivitiesPerWP = async (
  projectData: any,
  language: 'en' | 'si' = 'en',
  mode: string = 'regenerate',
  onProgress?: ((wpIndex: number, wpTotal: number, wpTitle: string) => void) | ((msg: string) => void),
  existingActivities?: any[],
  onlyIndices?: number[],
  signal?: AbortSignal,
  approvedSourcesBlock?: string,   // ★ EO-174b: CrossRef/OpenAlex approved sources for citation
  referencesEnabledParam?: boolean // ★ EO-174b: when true, Gemini returns _references for each WP
): Promise<any[]> => {
  if (signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');

  const context = getContext(projectData);
  const globalRules = getGlobalRules();
  const sectionRules = getRulesForSection('activities', language);
  const academicRules = getAcademicRigorRules(language);
  const humanRules = getHumanizationRules(language);
  const interventionLogic = getInterventionLogicFramework();
  const consortiumRules = getConsortiumAllocationRules();
  const resourceRules = getResourceCoherenceRules();

  const today = new Date().toISOString().split('T')[0];
  const pStart = projectData.projectIdea?.startDate || today;
  const pMonths = projectData.projectIdea?.durationMonths || 24;
  const pEnd = calculateProjectEndDate(pStart, pMonths);

  const temporalRule = getTemporalIntegrityRule(language)
    .replace(/\{\{projectStart\}\}/g, pStart)
    .replace(/\{\{projectEnd\}\}/g, pEnd)
    .replace(/\{\{projectDurationMonths\}\}/g, String(pMonths));

  let kbContext = '';
  if (KB_RELEVANT_SECTIONS.has('activities')) {
    kbContext = await getKnowledgeBaseContext();
  }

  if (signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');

  const scaffoldPrompt = [
    kbContext || '',
    interventionLogic,
    temporalRule,
    getLanguageDirective(language),
    `\nGLOBAL RULES:\n${globalRules}`,
    sectionRules ? `\nDETAILED CHAPTER RULES:\n${sectionRules}` : '',
    academicRules ? `\n${academicRules}` : '',
    `\n${_buildCitationEnforcement('AC')}`,
    humanRules ? `\n${humanRules}` : '',
    consortiumRules ? `\n${consortiumRules}` : '',
    resourceRules ? `\n${resourceRules}` : '',
    `\n${context}`,
    `\nTASK: Create a SCAFFOLD for work packages. Return a JSON array of objects with ONLY: id, title, dateRange (startDate, endDate). Do NOT generate tasks, milestones, or deliverables.
MANDATORY WPs: Second-to-last WP MUST be "Dissemination, Communication & Exploitation", last WP MUST be "Project Management & Coordination". Both must span the full project duration (${pStart} to ${pEnd}).
WP1 MUST be foundational/analytical and include a "Capitalisation and Synergies" task.
Total 5-8 WPs.
WP/TASK ID PREFIX RULES: ${language === 'si' ? 'Use DS prefix for WP IDs (DS1, DS2...) and N prefix for Task IDs (N1.1, N1.2...).' : 'Use WP prefix for WP IDs (WP1, WP2...) and T prefix for Task IDs (T1.1, T1.2...).'}`
  ].filter(Boolean).join('\n');

  if (onProgress) {
    if (onProgress.length === 1) {
      (onProgress as (msg: string) => void)(
        language === 'si'
          ? 'Generiranje ogrodja delovnih paketov...'
          : 'Generating work package scaffold...'
      );
    } else {
      (onProgress as (wpIndex: number, wpTotal: number, wpTitle: string) => void)(-1, 0, '');
    }
  }

  const scaffoldResult = await generateContent({
    prompt: scaffoldPrompt,
    jsonMode: true,
    sectionKey: 'activities_scaffold',  // ★ EO-MASTER E2: dedicated key → correct token sizing
    signal,
    expectedItemCount: 1,
    referencesEnabled: false,
  });

  let scaffold: any[];

  try {
    const jsonStr = sanitizeJSONResponse(scaffoldResult.text);
    scaffold = JSON.parse(jsonStr);

    if (!Array.isArray(scaffold)) {
      if (scaffold && typeof scaffold === 'object') {
        const scaffoldKeys = Object.keys(scaffold);
        for (let ski = 0; ski < scaffoldKeys.length; ski++) {
          if (Array.isArray(scaffold[scaffoldKeys[ski]])) {
            console.log(`[geminiService] Scaffold extracted from key "${scaffoldKeys[ski]}"`);
            scaffold = scaffold[scaffoldKeys[ski]];
            break;
          }
        }
      }
      if (!Array.isArray(scaffold)) throw new Error('Scaffold is not an array');
    }
  } catch (e) {
    const _rawScaffold = scaffoldResult.text || '';
    let scaffoldRecovered = false;

    try {
      const firstBracket = _rawScaffold.indexOf('[');
      const lastBracket = _rawScaffold.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        const arrayCandidate = _rawScaffold.substring(firstBracket, lastBracket + 1);
        scaffold = JSON.parse(arrayCandidate);
        if (Array.isArray(scaffold)) {
          scaffoldRecovered = true;
          console.log('[geminiService] Scaffold recovered via array extraction');
        }
      }
    } catch (_scaffoldRecover1) {}

    if (!scaffoldRecovered) {
      try {
        const firstBrace = _rawScaffold.indexOf('{');
        const lastBrace = _rawScaffold.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          const objCandidate = JSON.parse(_rawScaffold.substring(firstBrace, lastBrace + 1));
          const objKeys = Object.keys(objCandidate);
          for (let oki = 0; oki < objKeys.length; oki++) {
            if (Array.isArray(objCandidate[objKeys[oki]])) {
              scaffold = objCandidate[objKeys[oki]];
              scaffoldRecovered = true;
              console.log('[geminiService] Scaffold recovered via object→array extraction');
              break;
            }
          }
        }
      } catch (_scaffoldRecover2) {}
    }

    if (!scaffoldRecovered) {
      try {
        const fenceMatch = _rawScaffold.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch && fenceMatch[1]) {
          scaffold = JSON.parse(fenceMatch[1].trim());
          if (!Array.isArray(scaffold) && scaffold && typeof scaffold === 'object') {
            const fenceKeys = Object.keys(scaffold);
            for (let fki = 0; fki < fenceKeys.length; fki++) {
              if (Array.isArray(scaffold[fenceKeys[fki]])) {
                scaffold = scaffold[fenceKeys[fki]];
                break;
              }
            }
          }
          if (Array.isArray(scaffold)) {
            scaffoldRecovered = true;
            console.log('[geminiService] Scaffold recovered from markdown fence');
          }
        }
      } catch (_scaffoldRecover3) {}
    }

    if (!scaffoldRecovered) {
      console.error('[geminiService] All scaffold recovery attempts failed');
      throw new Error('AI scaffold response was not valid JSON');
    }
  }

  const fullActivities: any[] = [];

  for (let wpIdx = 0; wpIdx < scaffold.length; wpIdx++) {
    if (signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');

    const wpScaffold = scaffold[wpIdx];
    const wpPfx = language === 'si' ? 'DS' : 'WP';
    const wpId = wpScaffold.id || `${wpPfx}${wpIdx + 1}`;

    if (onProgress) {
      if (onProgress.length === 1) {
        (onProgress as (msg: string) => void)(
          language === 'si'
            ? `Generiranje ${wpId}: ${wpScaffold.title || ''}...`
            : `Generating ${wpId}: ${wpScaffold.title || ''}...`
        );
      } else {
        (onProgress as (wpIndex: number, wpTotal: number, wpTitle: string) => void)(
          wpIdx, scaffold.length, wpScaffold.title || ''
        );
      }
    }

    const previousWPsContext = fullActivities.length > 0
      ? `\nALREADY GENERATED WORK PACKAGES:\n${JSON.stringify(fullActivities, null, 2)}`
      : '';

    const wpPrompt = [
      kbContext || '',
      interventionLogic,
      temporalRule,
      getLanguageDirective(language),
      `\nGLOBAL RULES:\n${globalRules}`,
      sectionRules ? `\nDETAILED CHAPTER RULES:\n${sectionRules}` : '',
      academicRules ? `\n${academicRules}` : '',
      `\n${_buildCitationEnforcement('AC')}`,
      humanRules ? `\n${humanRules}` : '',
      consortiumRules ? `\n${consortiumRules}` : '',
      resourceRules ? `\n${resourceRules}` : '',
      `\n${context}`,
      // ★ EO-175R: Inject approved sources with explicit citation restriction so Gemini
      // cites ONLY verified DOI/URL pairs and does not hallucinate alternative URLs.
      approvedSourcesBlock
        ? `\n═══ APPROVED SOURCES — CITE ONLY FROM THIS LIST ═══\n${approvedSourcesBlock}\n═══ END APPROVED SOURCES ═══\nYou MUST cite ONLY URLs and DOIs from the list above. Do NOT invent or guess URLs. If no approved source matches a claim, omit the citation entirely.`
        : '',
      previousWPsContext,
      `\nSCAFFOLD:\n${JSON.stringify(scaffold, null, 2)}`,
      `\nTASK: Generate the COMPLETE work package ${wpId} ("${wpScaffold.title}").
WP/TASK ID PREFIX RULES: ${language === 'si'
        ? 'Use DS prefix for WP IDs (DS1, DS2...) and N prefix for Task IDs (N1.1, N1.2...). Milestone IDs: M1.1, Deliverable IDs: D1.1.'
        : 'Use WP prefix for WP IDs (WP1, WP2...) and T prefix for Task IDs (T1.1, T1.2...). Milestone IDs: M1.1, Deliverable IDs: D1.1.'}
Return ONE JSON object with: id, title, tasks (3-5 tasks with id, title, description, startDate, endDate, dependencies), milestones (1-2), deliverables (1-3 with id, title, description, indicator).

All task dates must be within ${wpScaffold.dateRange?.startDate || pStart} - ${wpScaffold.dateRange?.endDate || pEnd}.
Consider dependencies on tasks in previous WPs.
Every deliverable indicator MUST be BINARY and verifiable (Lump Sum compliant).
If this is WP1, include a "Capitalisation and Synergies" task and a DMP deliverable by M6.
If this is the Dissemination WP, strictly separate CDE tasks (Communication, Dissemination, Exploitation).

REFERENCE LIMIT (EO-116): Work package descriptions are OPERATIONAL, not academic. Use AT MOST 1-2 references per work package total. Only cite methodology frameworks or standards DIRECTLY relevant to the task approach. Do NOT add references to task descriptions, milestones, or deliverables. If no directly relevant standard exists, omit references entirely.`,
    ].filter(Boolean).join('\n');

    if (wpIdx > 0) {
      await new Promise(r => setTimeout(r, 1500));
    }

    const wpResult = await generateContent({
      prompt: wpPrompt,
      jsonMode: true,
      sectionKey: 'activities_wp',  // ★ EO-MASTER E3: dedicated key → ~14k tokens per WP
      signal,
      expectedItemCount: 4,
      // ★ EO-174b: honour caller's referencesEnabledParam (default: false per EO-MASTER E2).
      // When true (composite/standalone with refs ON), Gemini returns a _references array
      // that the caller's WP pipeline (_runFullReferencePipeline) can process.
      referencesEnabled: referencesEnabledParam ?? false,
    });

    try {
      const jsonStr = sanitizeJSONResponse(wpResult.text);
      let wpData = JSON.parse(jsonStr);
      if (Array.isArray(wpData)) wpData = wpData[0] || wpData;
      wpData = stripMarkdown(wpData);

      if (wpData.tasks && !Array.isArray(wpData.tasks)) {
        console.warn(`[geminiService] WP ${wpId}: tasks was not an array, resetting to []`);
        wpData.tasks = [];
      }
      if (wpData.milestones && !Array.isArray(wpData.milestones)) wpData.milestones = [];
      if (wpData.deliverables && !Array.isArray(wpData.deliverables)) wpData.deliverables = [];

      fullActivities.push(wpData);
    } catch (e) {
      let wpRecovered = false;
      const _rawWp = wpResult.text || '';

      try {
        const wpFirstBrace = _rawWp.indexOf('{');
        const wpLastBrace = _rawWp.lastIndexOf('}');
        if (wpFirstBrace !== -1 && wpLastBrace > wpFirstBrace) {
          const wpObjCandidate = JSON.parse(_rawWp.substring(wpFirstBrace, wpLastBrace + 1));
          const cleaned = stripMarkdown(wpObjCandidate);
          if (cleaned.tasks && !Array.isArray(cleaned.tasks)) cleaned.tasks = [];
          if (cleaned.milestones && !Array.isArray(cleaned.milestones)) cleaned.milestones = [];
          if (cleaned.deliverables && !Array.isArray(cleaned.deliverables)) cleaned.deliverables = [];
          fullActivities.push(cleaned);
          wpRecovered = true;
          console.log(`[geminiService] WP ${wpId} recovered via brace extraction`);
        }
      } catch (_wpRecover) {}

      if (!wpRecovered) {
        console.error(`[geminiService] Failed to parse WP ${wpId}:`, e);
        fullActivities.push({
          id: wpId,
          title: wpScaffold.title || '',
          tasks: [],
          milestones: [],
          deliverables: []
        });
      }
    }
  }

  let result = sanitizeActivities(fullActivities);
  result = enforceTemporalIntegrity(result, projectData);

  const wpPfxFinal = language === 'si' ? 'DS' : 'WP';
  const tskPfxFinal = language === 'si' ? 'N' : 'T';

  result.forEach((wp: any, wpIdx: number) => {
    wp.id = `${wpPfxFinal}${wpIdx + 1}`;

    if (wp.tasks && Array.isArray(wp.tasks)) {
      wp.tasks.forEach((task: any, tIdx: number) => {
        const oldId = task.id;
        task.id = `${tskPfxFinal}${wpIdx + 1}.${tIdx + 1}`;

        result.forEach((otherWp: any) => {
          (otherWp.tasks || []).forEach((otherTask: any) => {
            (otherTask.dependencies || []).forEach((dep: any) => {
              if (dep.predecessorId === oldId) dep.predecessorId = task.id;
            });
          });
        });
      });
    }

    if (wp.milestones && Array.isArray(wp.milestones)) {
      wp.milestones.forEach((ms: any, mIdx: number) => {
        ms.id = `M${wpIdx + 1}.${mIdx + 1}`;
      });
    }

    if (wp.deliverables && Array.isArray(wp.deliverables)) {
      wp.deliverables.forEach((del: any, dIdx: number) => {
        del.id = `D${wpIdx + 1}.${dIdx + 1}`;
      });
    }
  });

  return result;
};

// ═══════════════════════════════════════════════════════════════
// PUBLIC API: TARGETED FILL
// ═══════════════════════════════════════════════════════════════

export const generateTargetedFill = async (
  sectionKey: string,
  projectData: any,
  currentData: any,
  language: 'en' | 'si' = 'en',
  signal?: AbortSignal
): Promise<any> => {
  const result = await generateSectionContent(
    sectionKey,
    projectData,
    language,
    'fill',
    currentData,
    signal
  );

  if (sectionKey === 'activities' && Array.isArray(result)) {
    let processed = sanitizeActivities(result);
    processed = enforceTemporalIntegrity(processed, projectData);
    return processed;
  }

  return result;
};

// ═══════════════════════════════════════════════════════════════
// PUBLIC API: OBJECT FILL
// ═══════════════════════════════════════════════════════════════

export const generateObjectFill = async (
  sectionKey: string,
  projectData: any,
  currentData: any,
  emptyFields: string[],
  language: 'en' | 'si' = 'en',
  signal?: AbortSignal
): Promise<any> => {
  if (signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');

  const { prompt, schema } = getPromptAndSchemaForSection(
    sectionKey,
    projectData,
    language,
    'fill',
    currentData
  );

  const fillInstruction =
    `\nEMPTY FIELDS TO FILL: ${emptyFields.join(', ')}\n` +
    `Fill ONLY the listed empty fields. Keep existing data UNCHANGED.`;

  const fullPrompt = prompt + fillInstruction;

  let finalPrompt = fullPrompt;
  if (KB_RELEVANT_SECTIONS.has(sectionKey)) {
    const kbContext = await getKnowledgeBaseContext();
    if (kbContext) finalPrompt = `${kbContext}\n\n${fullPrompt}`;
  }

  if (signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');

  const result = await generateContent({
    prompt: finalPrompt,
    jsonSchema: schema || undefined,  // ★ EO-162b: was schema: (silently ignored by AIGenerateOptions)
    jsonMode: true,
    sectionKey,
    signal,
  });

  let parsed: any;
  try {
    const jsonStr = sanitizeJSONResponse(result.text);
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('AI fill response was not valid JSON');
  }

  parsed = stripMarkdown(parsed);
  return smartMerge(currentData, parsed);
};
// ═══════════════════════════════════════════════════════════════
// PUBLIC API: PROJECT SUMMARY GENERATION
// ═══════════════════════════════════════════════════════════════

export const generateProjectSummary = async (
  projectData: any,
  language: 'en' | 'si' = 'en',
  signal?: AbortSignal
): Promise<string> => {
  if (signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');

  const context = getContext(projectData);
  const summaryRules = getSummaryRules(language);
  const langDirective = getLanguageDirective(language);

  const prompt = [
    langDirective,
    `\n${context}`,
    `\nSUMMARY RULES:`,
    formatRules(summaryRules),
    `\nTASK: Write a project summary based on the data above. The summary should be 150-300 words, structured in 3-4 paragraphs. Do not add new information — only condense existing data.`
  ].filter(Boolean).join('\n');

  const result = await generateContent({
    prompt,
    sectionKey: 'summary',
    signal,
  });

  return result.text.trim();
};

// ═══════════════════════════════════════════════════════════════
// PUBLIC API: FIELD-LEVEL GENERATION
// ═══════════════════════════════════════════════════════════════

export const generateFieldContent = async (
  fieldPath: string,
  projectData: any,
  language: 'en' | 'si' = 'en',
  signal?: AbortSignal,
  options?: { userInstructions?: string; currentValue?: string; fieldLabel?: string }
): Promise<string> => {
  if (signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');

  const fieldRule = getFieldRules(fieldPath, language);
  const sectionKey = fieldPath.split('.')[0] || 'projectIdea';
  const context = getRelevantContext(sectionKey, projectData);
  const langDirective = getLanguageDirective(language);
  const globalRules = getGlobalRules();
  const sectionRules = getRulesForSection(sectionKey, language);
  const academicRules = ACADEMIC_RIGOR_SECTIONS.has(sectionKey)
    ? getAcademicRigorRules(language)
    : '';
  const humanRules = getHumanizationRules(language);

  const userInstr = (options && options.userInstructions && options.userInstructions.trim())
    ? options.userInstructions.trim()
    : '';

  const currentVal = (options && options.currentValue && options.currentValue.trim())
    ? options.currentValue.trim()
    : '';

  const label = (options && options.fieldLabel) ? options.fieldLabel : fieldPath;

  let taskBlock = '';

  if (currentVal && userInstr) {
    taskBlock =
      '\nTASK: Improve the field "' + label + '" according to the user instructions.\n' +
      'Current content:\n"""\n' + currentVal + '\n"""\n' +
      'User instructions: ' + userInstr + '\n' +
      'Keep what is good, enhance what is requested. Return ONLY the improved text.\n';
  } else if (currentVal && !userInstr) {
    taskBlock =
      '\nTASK: Improve and enhance the field "' + label + '". Make it more professional, detailed, and aligned with EU project standards.\n' +
      'Current content:\n"""\n' + currentVal + '\n"""\n' +
      'Return ONLY the improved text.\n';
  } else if (!currentVal && userInstr) {
    taskBlock =
      '\nTASK: Generate content for the empty field "' + label + '" according to the user instructions and project context.\n' +
      'User instructions: ' + userInstr + '\n' +
      'Return ONLY the generated text.\n';
  } else {
    taskBlock =
      '\nTASK: Generate content for the field "' + label + '" based on the project context and field rule.\n';
  }

  let kbContext = '';
  if (KB_RELEVANT_SECTIONS.has(sectionKey)) {
    kbContext = await getKnowledgeBaseContext();
  }

  if (signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');

  const promptParts = [
    kbContext || '',
    langDirective,
    '\nGLOBAL RULES:\n' + globalRules,
    sectionRules ? '\nDETAILED CHAPTER RULES:\n' + sectionRules : '',
    academicRules ? '\n' + academicRules : '',
    ACADEMIC_RIGOR_SECTIONS.has(sectionKey) ? '\n' + INLINE_CITATION_FORMAT_ENFORCEMENT : '',
    humanRules ? '\n' + humanRules : '',
    '\n' + context,
    '\nFIELD RULE: ' + fieldRule,
    taskBlock,
    '\nIMPORTANT: Return ONLY plain text content. No JSON, no field names, no quotes, no markdown headers, no bold/italic formatting.\n' +
      'If citations are used, factual claims MUST use the format (Author/Institution, Year) [N]. Bare [N] alone is forbidden.\n',
  ].filter(Boolean).join('\n');

  const result = await generateContent({
    prompt: promptParts,
    sectionKey: 'field',
    signal,
    taskType: 'field',
  });

  return stripMarkdown(result.text.trim());
};

// ═══════════════════════════════════════════════════════════════
// PUBLIC API: PARTNER ALLOCATIONS GENERATION
// ═══════════════════════════════════════════════════════════════

export const generatePartnerAllocations = async (
  projectData: any,
  language: 'en' | 'si' = 'en',
  onProgress?: (msg: string) => void,
  signal?: AbortSignal
): Promise<any[]> => {
  if (signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');

  const partners = Array.isArray(projectData.partners) ? projectData.partners : [];
  const activities = Array.isArray(projectData.activities) ? projectData.activities : [];
  const fundingModel = projectData.fundingModel || 'centralized';
  const durationMonths = projectData.projectIdea?.durationMonths || 24;

  if (partners.length === 0) throw new Error('No partners defined');
  if (activities.length === 0) throw new Error('No activities defined');

  const taskList: {
    wpId: string;
    wpTitle: string;
    taskId: string;
    taskTitle: string;
    taskDesc: string;
    startDate: string;
    endDate: string;
  }[] = [];

  activities.forEach((wp: any) => {
    (wp.tasks || []).forEach((task: any) => {
      taskList.push({
        wpId: wp.id || '',
        wpTitle: wp.title || '',
        taskId: task.id || '',
        taskTitle: task.title || '',
        taskDesc: (task.description || '').substring(0, 200),
        startDate: task.startDate || '',
        endDate: task.endDate || '',
      });
    });
  });

  const partnerSummary = partners.map((p: any) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    expertise: (p.expertise || '').substring(0, 200),
    partnerType: p.partnerType || 'other',
    pmRate: p.pmRate || 0,
  }));

  const langDirective = getLanguageDirective(language);
  const consortiumRules = getConsortiumAllocationRules();
  const resourceRules = getResourceCoherenceRules();

  const CENTRALIZED_DC = [
    { key: 'labourCosts', en: 'Staff/Personnel costs', si: 'Stroški dela' },
    { key: 'subContractorCosts', en: 'Sub-contractor costs', si: 'Stroški podizvajalcev' },
    { key: 'travelCosts', en: 'Travel costs', si: 'Potni stroški' },
    { key: 'materials', en: 'Materials / Consumables', si: 'Material / Potrošni material' },
    { key: 'depreciationEquipment', en: 'Depreciation of equipment', si: 'Amortizacija opreme' },
    { key: 'otherProjectCosts', en: 'Other project costs', si: 'Drugi projektni stroški' },
    { key: 'investmentCosts', en: 'Investment costs', si: 'Investicijski stroški' },
  ];

  const DECENTRALIZED_DC = [
    { key: 'salariesReimbursements', en: 'Salaries and work-related reimbursements', si: 'Stroški plač in povračila stroškov v zvezi z delom' },
    { key: 'externalServiceCosts', en: 'External service provider costs', si: 'Stroški zunanjih izvajalcev storitev' },
    { key: 'vat', en: 'VAT', si: 'DDV' },
    { key: 'intangibleAssetInvestment', en: 'Investments in intangible assets', si: 'Investicije v neopredmetena sredstva' },
    { key: 'depreciationBasicAssets', en: 'Depreciation of basic assets', si: 'Amortizacija osnovnih sredstev' },
    { key: 'infoCommunication', en: 'Information & communication costs', si: 'Stroški informiranja in komuniciranja' },
    { key: 'tangibleAssetInvestment', en: 'Investments in tangible assets', si: 'Investicije v opredmetena osnovna sredstva' },
  ];

  const directCostDefsForPrompt = fundingModel === 'decentralized' ? DECENTRALIZED_DC : CENTRALIZED_DC;
  const labourCategoryKey = fundingModel === 'decentralized' ? 'salariesReimbursements' : 'labourCosts';
  const labourCategoryName = fundingModel === 'decentralized'
    ? (language === 'si' ? 'Stroški plač in povračila stroškov v zvezi z delom' : 'Salaries and work-related reimbursements')
    : (language === 'si' ? 'Stroški dela' : 'Staff / Personnel costs');

  const allocPrompt = [
    langDirective,
    consortiumRules ? `\n${consortiumRules}` : '',
    resourceRules ? `\n${resourceRules}` : '',
    `
═══ PARTNER ALLOCATION GENERATION TASK ═══

You are an expert EU project budget planner. Your task is to allocate partners
to tasks with realistic hours, person-months (PM), and direct costs.

PARTNERS IN THE CONSORTIUM:
${JSON.stringify(partnerSummary, null, 2)}

TASKS IN THE PROJECT:
${JSON.stringify(taskList, null, 2)}

FUNDING MODEL: ${fundingModel}
PROJECT DURATION: ${durationMonths} months

ALLOCATION RULES:
1. EVERY task MUST have at least 1 partner allocated.
2. Most tasks should have 2-4 partners allocated.
3. The COORDINATOR (first partner, code "CO") should be allocated to ALL Project Management tasks and have a presence in most WPs.
4. Match partner EXPERTISE to task TOPIC.
5. Hours and PM must be REALISTIC: 1 PM = 143 hours (EU standard).
6. Direct costs: AT MINIMUM the PRIMARY LABOUR category for every allocation. Labour cost = hours × (pmRate / 143).
7. totalDirectCost = sum of all directCosts amounts
8. totalCost = totalDirectCost

DIRECT COST CATEGORIES FOR THIS PROJECT (funding model: ${fundingModel}):
${directCostDefsForPrompt.map((cat, i) => `${i + 1}. categoryKey: "${cat.key}" — ${cat.en}`).join('\n')}

THE PRIMARY LABOUR CATEGORY KEY IS: "${labourCategoryKey}"
USE ONLY the categoryKey values listed above. Do NOT use keys from other funding models.

RESPONSE FORMAT — JSON array:
[
  {
    "wpId": "WP1",
    "taskId": "T1.1",
    "allocations": [
      {
        "partnerId": "partner-1",
        "hours": 286,
        "pm": 2.0,
        "directCosts": [
          { "id": "dc-1", "categoryKey": "${labourCategoryKey}", "name": "${labourCategoryName}", "amount": 11400 }
        ],
        "totalDirectCost": 11400,
        "totalCost": 11400
      }
    ]
  }
]

CRITICAL:
- partnerId MUST exactly match partner IDs above
- Every allocation MUST have labourCosts
- pm = hours / 143, rounded to 2 decimals
- Return EVERY task — do not skip any
═══════════════════════════════════════════════════════════════════`,
  ].filter(Boolean).join('\n');

  if (onProgress) {
    onProgress(
      language === 'si'
        ? 'Generiram partnerske alokacije na naloge...'
        : 'Generating partner allocations for tasks...'
    );
  }

  const config = getProviderConfig();
  const needsTextSchema = config.provider !== 'gemini';

  // ═══ EO-117: Per-WP allocation calls — prevents 29KB truncation ═══
  // Build per-WP task lists
  const wpTaskMap: { wp: any; tasks: typeof taskList }[] = activities.map((wp: any) => ({
    wp,
    tasks: taskList.filter((t) => t.wpId === (wp.id || '')),
  })).filter((entry: any) => entry.tasks.length > 0);

  // Helper: parse one allocation response text → array of {wpId, taskId, allocations}
  const parseAllocResponse = (rawText: string, wpId: string): any[] | null => {
    // Try direct parse after sanitize
    try {
      const jsonStr = sanitizeJSONResponse(rawText);
      let p = JSON.parse(jsonStr);
      if (!Array.isArray(p)) {
        if (p && Array.isArray((p as any).allocations)) p = (p as any).allocations;
        else if (p && Array.isArray((p as any).tasks)) p = (p as any).tasks;
        else { const vals = Object.values(p as any); if (Array.isArray(vals[0])) p = vals[0]; }
      }
      if (Array.isArray(p)) return p;
    } catch (_e) { /* try recovery */ }
    // Fence strip
    try {
      const stripped = rawText.replace(/^[\s\r\n]*```(?:json|JSON)?\s*\n?/, '').replace(/\n?\s*```[\s\r\n]*$/, '').trim();
      const p = JSON.parse(stripped);
      if (Array.isArray(p)) return p;
    } catch (_e) { /* continue */ }
    // Array extract
    try {
      const m = rawText.match(/\[[\s\S]*\]/);
      if (m) { const p = JSON.parse(m[0]); if (Array.isArray(p)) return p; }
    } catch (_e) { /* continue */ }
    // Truncated repair
    try {
      let rt = rawText.replace(/^[\s\r\n]*```(?:json|JSON)?\s*\n?/, '').replace(/\n?\s*```[\s\r\n]*$/, '').trim();
      rt = rt.replace(/,\s*([}\]])/g, '$1');
      let ob = 0, obr = 0;
      for (const ch of rt) { if (ch === '{') ob++; if (ch === '}') ob--; if (ch === '[') obr++; if (ch === ']') obr--; }
      while (ob > 0) { rt += '}'; ob--; }
      while (obr > 0) { rt += ']'; obr--; }
      const p = JSON.parse(rt);
      if (Array.isArray(p)) return p;
    } catch (_e) { /* all failed */ }
    console.error('[geminiService] EO-117: all parse recovery failed for WP', wpId);
    return null;
  };

  const wpAllocSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        wpId: { type: Type.STRING },
        taskId: { type: Type.STRING },
        allocations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              partnerId: { type: Type.STRING },
              hours: { type: Type.NUMBER },
              pm: { type: Type.NUMBER },
              directCosts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    categoryKey: { type: Type.STRING },
                    name: { type: Type.STRING },
                    amount: { type: Type.NUMBER },
                  },
                  required: ['id', 'categoryKey', 'name', 'amount'],
                },
              },
              totalDirectCost: { type: Type.NUMBER },
              totalCost: { type: Type.NUMBER },
            },
            required: ['partnerId', 'hours', 'pm', 'directCosts', 'totalDirectCost', 'totalCost'],
          },
        },
      },
      required: ['wpId', 'taskId', 'allocations'],
    },
  };

  const allParsed: any[] = [];
  let wpSuccessCount = 0;

  for (let i = 0; i < wpTaskMap.length; i++) {
    const { wp, tasks: wpTasks } = wpTaskMap[i];
    const wpId = wp.id || `WP${i + 1}`;

    if (signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');

    if (onProgress) {
      onProgress(
        language === 'si'
          ? `Generiram alokacije za ${wpId} (${i + 1}/${wpTaskMap.length})...`
          : `Generating allocations for ${wpId} (${i + 1}/${wpTaskMap.length})...`
      );
    }

    const wpAllocPrompt = [
      langDirective,
      consortiumRules ? `\n${consortiumRules}` : '',
      resourceRules ? `\n${resourceRules}` : '',
      `
═══ PARTNER ALLOCATION TASK — ${wpId}: ${wp.title || ''} ═══

You are an expert EU project budget planner. Allocate partners to tasks for THIS WORK PACKAGE ONLY.

PARTNERS IN THE CONSORTIUM:
${JSON.stringify(partnerSummary, null, 2)}

TASKS IN ${wpId}:
${JSON.stringify(wpTasks, null, 2)}

FUNDING MODEL: ${fundingModel}
PROJECT DURATION: ${durationMonths} months

ALLOCATION RULES:
1. EVERY task MUST have at least 1 partner allocated.
2. Most tasks should have 2-4 partners allocated.
3. The COORDINATOR (first partner, code "CO") should be allocated to all Project Management tasks.
4. Match partner EXPERTISE to task TOPIC.
5. Hours and PM must be REALISTIC: 1 PM = 143 hours (EU standard).
6. Direct costs: AT MINIMUM the PRIMARY LABOUR category for every allocation. Labour cost = hours × (pmRate / 143).
7. totalDirectCost = sum of all directCosts amounts
8. totalCost = totalDirectCost

DIRECT COST CATEGORIES (funding model: ${fundingModel}):
${directCostDefsForPrompt.map((cat, ci) => `${ci + 1}. categoryKey: "${cat.key}" — ${cat.en}`).join('\n')}

THE PRIMARY LABOUR CATEGORY KEY IS: "${labourCategoryKey}"
USE ONLY the categoryKey values listed above.

RESPONSE FORMAT — JSON array (one entry per task in ${wpId}):
[
  {
    "wpId": "${wpId}",
    "taskId": "T${i + 1}.1",
    "allocations": [
      {
        "partnerId": "partner-1",
        "hours": 286,
        "pm": 2.0,
        "directCosts": [
          { "id": "dc-1", "categoryKey": "${labourCategoryKey}", "name": "${labourCategoryName}", "amount": 11400 }
        ],
        "totalDirectCost": 11400,
        "totalCost": 11400
      }
    ]
  }
]

CRITICAL:
- partnerId MUST exactly match partner IDs above
- Every allocation MUST have the labour cost entry
- pm = hours / 143, rounded to 2 decimals
- Return ALL ${wpTasks.length} tasks for ${wpId} — do not skip any
═══════════════════════════════════════════════════════════════════`,
    ].filter(Boolean).join('\n');

    const textSchemaStr = needsTextSchema ? schemaToTextInstruction(wpAllocSchema) : '';
    const finalWpPrompt = textSchemaStr ? wpAllocPrompt + textSchemaStr : wpAllocPrompt;

    try {
      const wpResult = await generateContent({
        prompt: finalWpPrompt,
        jsonSchema: needsTextSchema ? undefined : wpAllocSchema, // EO-119: was 'schema' (unknown field in AIGenerateOptions) — must be 'jsonSchema'
        jsonMode: true,
        sectionKey: 'partnerAllocations_wp', // EO-117: 16384 tokens (EO-127: raised from 8192)
        signal,
        expectedItemCount: wpTasks.length * Math.min(partnerSummary.length, 4),  // ★ EO-MASTER E4
        referencesEnabled: false,
      });

      // EO-127: Log raw response for diagnostics BEFORE recovery
      const _rawLen = wpResult.text?.length || 0;
      console.log(`[geminiService] EO-127: ${wpId} raw response length: ${_rawLen} chars. First 300: ${(wpResult.text || '').substring(0, 300)}`);

      let wpParsed = parseAllocResponse(wpResult.text, wpId);

      // EO-127: Per-WP retry — if parse fails, retry once with a concise prompt
      if (!wpParsed || wpParsed.length === 0) {
        console.warn(`[geminiService] EO-127: ${wpId} parse failed — retrying with concise prompt`);
        const _retryPrompt = `Return ONLY a valid JSON array for ${wpId} allocations. No explanations, no markdown. Be concise.\n\n` + finalWpPrompt;
        try {
          const _retryResult = await generateContent({
            prompt: _retryPrompt,
            jsonSchema: needsTextSchema ? undefined : wpAllocSchema,
            jsonMode: true,
            sectionKey: 'partnerAllocations_wp',
            signal,
          });
          console.log(`[geminiService] EO-127: ${wpId} retry raw length: ${_retryResult.text?.length || 0}`);
          wpParsed = parseAllocResponse(_retryResult.text, wpId);
          if (wpParsed && wpParsed.length > 0) {
            console.log(`[geminiService] EO-127: ${wpId} retry succeeded — ${wpParsed.length} tasks`);
          } else {
            console.warn(`[geminiService] EO-127: ${wpId} retry also failed — skipping WP`);
          }
        } catch (_retryErr: any) {
          if (_retryErr.name === 'AbortError') throw _retryErr;
          console.warn(`[geminiService] EO-127: ${wpId} retry call failed:`, _retryErr.message);
        }
      }

      if (wpParsed && wpParsed.length > 0) {
        allParsed.push(...wpParsed);
        wpSuccessCount++;
        console.log(`[geminiService] EO-117: ${wpId} allocations OK — ${wpParsed.length} tasks`);
      } else {
        console.warn(`[geminiService] EO-117: ${wpId} allocations parse failed — skipping WP`);
      }
    } catch (wpErr: any) {
      if (wpErr.name === 'AbortError') throw wpErr;
      console.warn(`[geminiService] EO-117: ${wpId} allocations call failed — skipping WP:`, wpErr.message);
    }

    // Rate limiting between WP calls
    if (i < wpTaskMap.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  if (wpSuccessCount === 0) {
    console.error('[geminiService] EO-117: ALL WP allocation calls failed');
    throw new Error('INVALID_JSON|' + (config.provider || 'unknown'));
  }

  console.log(`[geminiService] EO-117: allocations complete — ${wpSuccessCount}/${wpTaskMap.length} WPs succeeded, ${allParsed.length} total tasks`);

  const parsed = allParsed;

  const validPartnerIds = new Set(partners.map((p: any) => p.id));
  const partnerRateMap = new Map(partners.map((p: any) => [p.id, p.pmRate || 0]));

  const processedAllocations = parsed.map((taskAlloc: any) => {
    const allocations = (taskAlloc.allocations || [])
      .filter((a: any) => validPartnerIds.has(a.partnerId))
      .map((a: any) => {
        const hours = Math.max(0, Math.round(a.hours || 0));
        const pm = parseFloat((hours / 143).toFixed(2));
        const rate = partnerRateMap.get(a.partnerId) || 0;
        const labourCost = Math.round(hours * (rate / 143));

        const directCosts = (a.directCosts || []).map((dc: any, dcIdx: number) => {
          if (dc.categoryKey === 'labourCosts') {
            return {
              ...dc,
              id: dc.id || `dc-${Date.now()}-${dcIdx}`,
              amount: labourCost
            };
          }
          return {
            ...dc,
            id: dc.id || `dc-${Date.now()}-${dcIdx}`,
            amount: Math.max(0, Math.round(dc.amount || 0))
          };
        });

        const hasLabour = directCosts.some((dc: any) =>
          dc.categoryKey === labourCategoryKey ||
          dc.categoryKey === 'labourCosts' ||
          dc.categoryKey === 'salariesReimbursements'
        );

        if (!hasLabour && hours > 0) {
          directCosts.unshift({
            id: 'dc-labour-' + Date.now(),
            categoryKey: labourCategoryKey,
            name: labourCategoryName,
            amount: labourCost,
          });
        }

        const centralToDecentralMap: Record<string, string> = {
          labourCosts: 'salariesReimbursements',
          subContractorCosts: 'externalServiceCosts',
          travelCosts: 'vat',
          depreciationEquipment: 'depreciationBasicAssets',
          investmentCosts: 'tangibleAssetInvestment',
          materials: 'intangibleAssetInvestment',
          otherProjectCosts: 'infoCommunication',
        };

        const decentralToCentralMap: Record<string, string> = {};
        Object.keys(centralToDecentralMap).forEach((k) => {
          decentralToCentralMap[centralToDecentralMap[k]] = k;
        });

        const validKeysSet = new Set(directCostDefsForPrompt.map((c) => c.key));
        const remapSource = fundingModel === 'decentralized' ? centralToDecentralMap : decentralToCentralMap;

        directCosts.forEach((dc: any) => {
          if (!validKeysSet.has(dc.categoryKey)) {
            const remapped = remapSource[dc.categoryKey];
            if (remapped) {
              console.log('[generatePartnerAllocations] REMAP:', dc.categoryKey, '->', remapped);
              const catDef = directCostDefsForPrompt.find((c) => c.key === remapped);
              dc.categoryKey = remapped;
              if (catDef) dc.name = catDef[language === 'si' ? 'si' : 'en'];
            }
          }
        });

        const totalDirectCost = directCosts.reduce((s: number, dc: any) => s + (dc.amount || 0), 0);

        return {
          partnerId: a.partnerId,
          hours,
          pm,
          directCosts,
          totalDirectCost,
          totalCost: totalDirectCost
        };
      });

    return {
      wpId: taskAlloc.wpId,
      taskId: taskAlloc.taskId,
      allocations
    };
  });

  const wpIds = activities.map((wp: any) => wp.id);
  const pmWpId = wpIds.length > 0 ? wpIds[wpIds.length - 1] : null;
  const dissWpId = wpIds.length > 1 ? wpIds[wpIds.length - 2] : null;

  const wpBudgets: Record<string, number> = {};
  let grandTotal = 0;

  processedAllocations.forEach((taskAlloc: any) => {
    const wpId = taskAlloc.wpId;
    if (!wpBudgets[wpId]) wpBudgets[wpId] = 0;

    (taskAlloc.allocations || []).forEach((alloc: any) => {
      const cost = alloc.totalCost || alloc.totalDirectCost || 0;
      wpBudgets[wpId] += cost;
      grandTotal += cost;
    });
  });

  if (grandTotal > 0 && pmWpId && dissWpId) {
    const pmBudget = wpBudgets[pmWpId] || 0;
    const dissBudget = wpBudgets[dissWpId] || 0;
    const pmPercent = (pmBudget / grandTotal) * 100;
    const dissPercent = (dissBudget / grandTotal) * 100;

    let pmMaxPercent = 15;
    if (grandTotal > 10000000) pmMaxPercent = 5;
    else if (grandTotal > 5000000) pmMaxPercent = 7;
    else if (grandTotal > 3000000) pmMaxPercent = 7;
    else if (grandTotal > 1000000) pmMaxPercent = 10;
    else if (grandTotal > 500000) pmMaxPercent = 10;

    const dissTargetPercent = 15;
    let budgetAdjusted = false;

    console.log(
      '[generatePartnerAllocations] BUDGET CHECK:',
      `grandTotal=${Math.round(grandTotal)} EUR, PM=${pmPercent.toFixed(1)}% (max ${pmMaxPercent}%), Diss=${dissPercent.toFixed(1)}%`
    );

    if (pmPercent > pmMaxPercent) {
      const pmTargetBudget = grandTotal * (pmMaxPercent / 100);
      const pmScale = pmTargetBudget / pmBudget;

      processedAllocations.forEach((taskAlloc: any) => {
        if (taskAlloc.wpId === pmWpId) {
          (taskAlloc.allocations || []).forEach((alloc: any) => {
            alloc.hours = Math.max(1, Math.round(alloc.hours * pmScale));
            alloc.pm = parseFloat((alloc.hours / 143).toFixed(2));
            alloc.directCosts = (alloc.directCosts || []).map((dc: any) => ({
              id: dc.id,
              categoryKey: dc.categoryKey,
              name: dc.name,
              amount: Math.round(dc.amount * pmScale)
            }));
            alloc.totalDirectCost = alloc.directCosts.reduce((s: number, dc: any) => s + (dc.amount || 0), 0);
            alloc.totalCost = alloc.totalDirectCost;
          });
        }
      });

      budgetAdjusted = true;
    }

    if (dissPercent > 20) {
      const dissTargetBudget = grandTotal * (dissTargetPercent / 100);
      const dissScale = dissTargetBudget / dissBudget;

      processedAllocations.forEach((taskAlloc: any) => {
        if (taskAlloc.wpId === dissWpId) {
          (taskAlloc.allocations || []).forEach((alloc: any) => {
            alloc.hours = Math.max(1, Math.round(alloc.hours * dissScale));
            alloc.pm = parseFloat((alloc.hours / 143).toFixed(2));
            alloc.directCosts = (alloc.directCosts || []).map((dc: any) => ({
              id: dc.id,
              categoryKey: dc.categoryKey,
              name: dc.name,
              amount: Math.round(dc.amount * dissScale)
            }));
            alloc.totalDirectCost = alloc.directCosts.reduce((s: number, dc: any) => s + (dc.amount || 0), 0);
            alloc.totalCost = alloc.totalDirectCost;
          });
        }
      });

      budgetAdjusted = true;
    }

    if (budgetAdjusted) {
      let newGrandTotal = 0;
      let newPmBudget = 0;
      let newDissBudget = 0;

      processedAllocations.forEach((taskAlloc: any) => {
        (taskAlloc.allocations || []).forEach((alloc: any) => {
          const cost = alloc.totalCost || 0;
          newGrandTotal += cost;
          if (taskAlloc.wpId === pmWpId) newPmBudget += cost;
          if (taskAlloc.wpId === dissWpId) newDissBudget += cost;
        });
      });

      console.log(
        '[generatePartnerAllocations] AFTER ADJUSTMENT:',
        `grandTotal=${Math.round(newGrandTotal)} EUR, PM=${newGrandTotal > 0 ? (newPmBudget / newGrandTotal * 100).toFixed(1) : '0'}%, Diss=${newGrandTotal > 0 ? (newDissBudget / newGrandTotal * 100).toFixed(1) : '0'}%`
      );
    }
  }

  console.log('[generatePartnerAllocations] Generated allocations for ' + processedAllocations.length + ' tasks');

  return processedAllocations;
};

// ═══════════════════════════════════════════════════════════════
// END OF geminiService.ts v7.29
// ═══════════════════════════════════════════════════════════════
