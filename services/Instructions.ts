// services/Instructions.ts
// ═══════════════════════════════════════════════════════════════════
// SINGLE SOURCE OF TRUTH for ALL AI content rules.
// Version 8.9 – 2026-03-23
// CHANGES v8.9 (2026-03-23):
// EO-142: Explicit JSON field spec for policies (name/description). Validation rule updated.
// Version 8.8 – 2026-03-20
// CHANGES v8.8 (2026-03-20):
// EO-130d: DEFAULT_REFS_ENABLED confirmed at 6 chapter-level keys only. No sub-section keys.
// Version 8.7 – 2026-03-20
// CHANGES v8.7 (2026-03-20):
// EO-130c: DEFAULT_REFS_ENABLED reduced to 6 chapter-level keys only.
//          Removed sub-section keys (projectManagement, partners, risks).
//          Sub-sections inherit via getChapterForSection() in useGeneration.ts.
// Version 8.6 – 2026-03-18
// CHANGES v8.6 (2026-03-18):
// EO-130: Added CITATION_WITHOUT_REFERENCES prompt + getCitationWithoutReferences() getter.
//         Added DEFAULT_REFS_ENABLED map for per-section reference toggle defaults.
// Version 8.5 – 2026-03-18
// CHANGES v8.5 (2026-03-18):
// EO-121: outputs/outcomes/impacts/kers — reduced count caps and added "3–4 sentences MAXIMUM"
//         to prevent token truncation (primary fix: aiProvider.ts tokens raised to 8192).
// Version 8.4 – 2026-03-16
// CHANGES v8.4 (2026-03-16):
//   - FIX: Inline citation format upgraded from bare [N] markers to mandatory short attribution + marker format
//   - New required format: (Author/Institution, Year) [N]
//   - Bare numeric markers [N] alone are now forbidden for factual claims
//   - REFERENCES_REQUIREMENT, ACADEMIC_RIGOR_RULES, MODE_INSTRUCTIONS, QUALITY_GATES,
//     SECTION_TASK_INSTRUCTIONS, HUMANIZATION_RULES, FIELD_RULES, QA_VALIDATION_CHECKLIST
//     updated accordingly
// CHANGES v8.3 (2026-03-13):
//   - EO-084: Approved source pool and retrieval-only citation pipeline
//   - ACADEMIC_RIGOR_RULES: Rule 1 updated — AI must cite ONLY from approved source pool when provided
//   - ACADEMIC_RIGOR_RULES: New Rule 8 — APPROVED SOURCE POOL CONSTRAINT
//   - REFERENCES_REQUIREMENT: added APPROVED SOURCE POOL section mandating pool-only citations
//   - NEW: APPROVED_SOURCE_POOL_RULES constant — strict rules for pool-constrained citation
//   - NEW: getApprovedSourcePoolRules() getter
// CHANGES v8.2 (2026-03-12):
//   - EO-083: Strengthened ACADEMIC_RIGOR_RULES Rule 5 & 6 wording for explicit verification
//   - EO-083: REFERENCES_REQUIREMENT updated to note that URLs will be verified by real HEAD/GET + CrossRef
//   - EO-083: Added POST-GENERATION VERIFICATION note to REFERENCES_REQUIREMENT
// CHANGES v8.1 (2026-03-11):
//   - EO-081: Inline citation markers [1],[2],[3] in AI-generated text
//   - ACADEMIC_RIGOR_RULES Rule 2: switched from APA inline (Author, Year) to numbered markers [N]
//   - REFERENCES_REQUIREMENT: updated example _references entry with inlineMarker field;
//     AI must use [1],[2],[3] markers in text and match each to _references by index
//   - QUALITY_GATES: citation format references updated from (Source, Year) to [N] markers
//   - SECTION_TASK_INSTRUCTIONS: citation format instructions updated across all sections
//   - HUMANIZATION_RULES Rule 7: citation rule updated for numbered markers
//   - MODE_INSTRUCTIONS: enhance/regenerate instructions updated for [N] markers
//   - COLLECT_REFERENCES_INSTRUCTION: output format updated for numbered markers
// CHANGES v8.0 (2026-03-11):
//   - EO-080: URL Provenance & Verified-URL Architecture
//   - REFERENCES_REQUIREMENT: forbids AI-invented URLs, adds URL provenance policy
//   - NEW: URL_PROVENANCE_POLICY constant — rules for [VERIFIED_URL] tagging
//   - NEW: VERIFIED_URL_CONSTANTS — regex-safe tags injected by aiProvider
//   - ACADEMIC_RIGOR_RULES: Rules 5–6 updated for URL provenance awareness
//   - COLLECT_REFERENCES_INSTRUCTION: updated for urlVerified flag propagation
//   - MODE_INSTRUCTIONS: enhance/regenerate reference URL provenance note
//   - QUALITY_GATES: _default updated with URL verification gate
//   - HUMANIZATION_RULES: Rule 7 expanded with urlVerified logic
// CHANGES v7.9 (2026-03-10):
//   - EO-073: Search-First Citation Architecture
//   - ACADEMIC_RIGOR_RULES: Rules 1,2,5,6 rewritten for search-first citation policy, verified-only sources
//   - REFERENCES_REQUIREMENT: enforces real URLs, strict fields, quality-over-quantity guidance
//   - COLLECT_REFERENCES_INSTRUCTION: JSON-only output with mandatory web-search verification
//   - QUALITY_GATES: problemAnalysis gates updated to require verified citations with URLs; _default updated
//   - MODE_INSTRUCTIONS: enhance/regenerate changed from "MINIMUM 3-4" to "1–3 verified citations"
//   - HUMANIZATION_RULES: Rule 7 expanded with citation verification bullet
// CHANGES v7.8 (2026-03-10):
//   - EO-070: REFERENCES REQUIREMENT block appended to every section-generation instruction
//   - EO-070: NEW: getCollectReferencesInstruction() — instruction for AI-based reference verification
//   - EO-070: NEW: REFERENCES_REQUIREMENT constant — instructs AI to include _references in JSON
// CHANGES v7.7 (2026-03-08):
//   - EO-050: Strengthened SECTION_TASK_INSTRUCTIONS.projectIdea:
//     * stateOfTheArt MUST end with "Capitalisation and Synergies" concluding paragraph (min 4 sentences)
//     * Every numerical claim in stateOfTheArt MUST have inline citation (Author/Institution, Year)
//     * proposedSolution intro paragraph: EXACTLY 5-8 sentences BEFORE phases (stricter wording)
//     * EU policies: MUST include full document name, year, specific article/chapter reference
//   - EO-050: Added 4 new QUALITY_GATES for projectIdea section matching above requirements
// CHANGES v7.6 (2026-03-08):
//   - FIX: Restored MANDATORY empirical data density from v7.4 that v7.5 removed
//   - FIX: Restored minimum citation counts (3-4 per paragraph, 30% author-named)
//   - FIX: Restored "ALWAYS provide a number with source" policy (no qualitative escape)
//   - KEPT from v7.5: Terminology Discipline, Claim Calibration, improved source hierarchy
//   - MERGED: Best of v7.4 (mandatory empirics) + v7.5 (calibration + terminology)
// CHANGES v7.5 (2026-03-08):
//   - REWORK: Replaced forced-quantification rules with evidence-calibrated writing rules
//   - NEW: Claim Calibration Standard (fact vs analysis vs project design)
//   - NEW: Numerical Claim Standard (metric + geography + time + source)
//   - NEW: Terminology and Category Discipline (avoid conflating legal/organisational categories)
//   - FIX: Removed hidden incentives for fabricated "best-estimate" statistics
//   - FIX: Allowed legitimate EU technical terms such as synergies/capitalisation where contextually correct
//   - FIX: Resolved markdown contradiction by creating summary-mode exception
//   - FIX: Corrected acronym rule inconsistency (3–12 characters, optional hyphen)
//   - FIX: Corrected indicator semantics by section type
//   - FIX: Replaced bracketed partner placeholders with plain-text generic labels
// CHANGES v7.4 (2026-03-06):
//   - FIX: Removed last 3 "[Insert verified data/project: ...]" placeholders from
//     SECTION_TASK_INSTRUCTIONS (problemAnalysis, projectIdea) and QUALITY_GATES (problemAnalysis)
//   - All placeholder instructions now replaced with best-estimate-with-attribution policy
// CHANGES v7.3 (2026-03-06):
//   - FIX: REMOVED all "[Insert verified data: ...]" placeholder instructions — placeholders are now FORBIDDEN
//   - NEW: Best-estimate policy replaced by evidence-calibrated approach (v7.5)
//   - NEW: Local/regional data requirement — use country-specific statistics or closest proxy
// CHANGES v7.2 (2026-03-06):
//   - NEW: TEMPERATURE_DEFAULTS documentation — differentiated AI temperature
//     settings per task type and section (EO-031). Actual logic in aiProvider.ts.
// Version 7.0 – 2026-02-22
//
// ARCHITECTURE PRINCIPLE:
//   This file is the ONLY place where content rules are defined.
//   geminiService.ts reads from here — it has ZERO own rules.
//   Anything changed here IS THE LAW — no exceptions.
//
// CHANGES v7.0 (2026-02-22):
//   - MAJOR: Full Intervention Logic Framework (Section 0) integrated
//   - MAJOR: Cross-Chapter Consistency Gate (7e) — binding cross-references
//   - NEW: DNSH (Do No Significant Harm) principle — projectIdea, proposedSolution, globals
//   - NEW: Key Impact Pathways (KIPs) — Scientific, Societal, Economic for impacts
//   - NEW: 3-Pillar Sustainability Strategy for KER exploitation (Financial, Institutional, Political)
//   - NEW: Synergies & Capitalisation — mandatory in State of the Art + WP1
//   - NEW: Target Group vs End-User strict segmentation
//   - NEW: DMP (Data Management Plan) mandatory deliverable by M6
//   - NEW: Lump Sum compliance — binary, verifiable indicators
//   - NEW: AI Act / GDPR ethical compliance for digital/data projects
//   - NEW: CDE separation — Communication, Dissemination, Exploitation strictly separated
//   - NEW: Gender Equality Plans (GEPs) in quality assurance
//   - NEW: Expanded banned AI phrases list
//   - NEW: Consortium & partner allocation rules (Section 16)
//   - NEW: Resource coherence rules (Section 17)
//   - NEW: JSON edge-case rules for OpenRouter
//   - NEW: partnerType field in partners task instructions + quality gate
//   - CHANGED: partners schema includes partnerType enum (9 values)
//   - CHANGED: Quality gates expanded for all sections
//   - All previous v5.0 / v4.6 architecture preserved (getters, overrides, EN-only)
//
// CHANGES v5.0 (2026-02-17):
//   - EN-ONLY REFACTORING: All .si variants REMOVED from every constant
//     EXCEPT LANGUAGE_DIRECTIVES (which tells AI "write in Slovenian").
//   - All getter functions now ALWAYS return .en regardless of language param.
//   - getLanguageDirective() is the ONLY function that respects language param.
//
// CHANGES v4.6:
//   - Global Instructions override integration via globalInstructionsService.ts
//   - Every exported accessor function checks getGlobalOverrideSync() first.
//
// English-only rules — AI interprets in English regardless of output language.
// LANGUAGE_DIRECTIVES tells the AI which language to WRITE in.
// ═══════════════════════════════════════════════════════════════════

import { storageService } from './storageService';
import { getEffectiveOverrideSync as getGlobalOverrideSync } from './globalInstructionsService.ts';

// ═══════════════════════════════════════════════════════════════════
// SECTION 0 — INTERVENTION LOGIC FRAMEWORK
// ═══════════════════════════════════════════════════════════════════
// This is injected into EVERY prompt as foundational context.
// AI must understand the logical chain before generating any content.

export const INTERVENTION_LOGIC_FRAMEWORK = `═══ INTERVENTION LOGIC FRAMEWORK (MANDATORY CONTEXT) ═══

Intervention logic is the structured, cause-and-effect framework that represents
the entire logical architecture of a project — from the identified problem to
its long-term impacts. It is the golden thread connecting WHY a project is needed,
WHAT it intends to achieve, and HOW it will get there.

In European projects (Horizon Europe, Erasmus+, Interreg, LIFE, Digital Europe, etc.),
intervention logic is the backbone of any project proposal. Evaluators use it to verify
whether a project is internally consistent — whether each chapter logically flows from
the previous one and feeds into the next.

THE LOGICAL CHAIN:

  PROBLEM ANALYSIS (why is the project needed?)
    ↓
  PROJECT IDEA / SOLUTION (what do we propose?)
    ↓
  OBJECTIVES (what do we want to achieve — measurably?)
    ↓
  ACTIVITIES (how will we do it?)
    ↓
  OUTPUTS → OUTCOMES → IMPACTS (what will the project deliver?)

HOW THE CHAIN IS BUILT — SIX CHAPTERS:

Chapter 1 — Problem Analysis: Everything starts here. This is the foundation of the
entire intervention logic. The chapter demands a clear definition of the core problem,
supported by quantitative evidence. The problem is then broken down into its root and
proximate causes, and its consequences are mapped in an escalating chain from local
through regional and national all the way to EU-level impact. Without a solid problem
analysis, everything that follows is built on sand.

Chapter 2 — Project Idea: The problem analysis flows directly into the proposed
solution. This chapter defines the main aim of the project in a single sentence,
reviews the state of the art with references to real existing projects and studies
(including mandatory synergies and capitalisation), outlines the proposed solution
in phases, assesses readiness levels (technological, societal, organisational,
legislative), and aligns the project with relevant EU policies and the strict DNSH
(Do No Significant Harm) principle. This is also where the project title and
acronym are born.

Chapters 3–4 — Objectives: From the project idea emerge measurable objectives at
two levels. General objectives connect the project to broader EU goals and use
infinitive verb formulations. Specific objectives are shaped according to the
S.M.A.R.T. method — Specific, Measurable, Achievable, Relevant, and Time-bound —
each accompanied by a KPI indicator. Together, they translate ambition into
accountability.

Chapter 5 — Activities, Management and Risks: This is the operational core of the
project, divided into three sections. Project Management provides a detailed narrative
covering governance structure, decision-making, quality assurance (including Gender
Equality Plans and Ethical/Regulatory compliance), risk management, communication,
conflict resolution, and data management. The Work Plan organises the project into
work packages that follow a logical sequence — from a foundational analytical package,
through content and thematic packages, to dissemination and project coordination
packages that run throughout the entire project duration. Each package contains tasks,
milestones, and deliverables with clearly defined dependencies. The Risk Register
identifies risks across technical, social, economic, and environmental categories,
each assessed for likelihood and impact and paired with a mitigation strategy.

Chapter 6 — Expected Results and Key Exploitable Results: The final link in the chain
answers the question: what will the project actually deliver? Results are structured
across four ascending levels. Outputs are the direct, tangible deliverables of the
activities. Outcomes represent the medium-term changes those outputs generate. Impacts
capture the long-term strategic shifts linked to EU policy objectives and must map to
Key Impact Pathways (KIPs). Key Exploitable Results (KERs) are the specific assets or
products that carry lasting value beyond the project, each with a defined 3-pillar
sustainability strategy (Financial, Institutional, Political).

BINDING RULES:
1. Every cause identified in the Problem Analysis MUST be addressed by at least one
   Activity (Work Package or Task).
2. Every Specific Objective MUST be measurable through a KPI that maps to at least
   one Output or Outcome.
3. Every long-term Impact MUST connect back to at least one Consequence from the
   Problem Analysis AND to at least one EU policy referenced in the Project Idea,
   structured via Key Impact Pathways.
4. The Proposed Solution (Chapter 2) MUST logically respond to the causes identified
   in Chapter 1 and EXPLICITLY respect the DNSH principle.
5. Key Exploitable Results MUST derive from concrete Outputs produced by specific
   Work Packages.

CROSS-REFERENCE INTEGRITY:
When generating or enhancing any chapter, the AI MUST check that the content is
consistent with all other chapters. A broken link in the intervention logic chain
is a critical failure.
═══════════════════════════════════════════════════════════════════`;

// ───────────────────────────────────────────────────────────────
// LANGUAGE DIRECTIVES — ★ ONLY constant that keeps .si ★
// ───────────────────────────────────────────────────────────────

export const LANGUAGE_DIRECTIVES: Record<string, string> = {
  en: `═══ LANGUAGE DIRECTIVE (MANDATORY — OVERRIDES ALL OTHER INSTRUCTIONS) ═══
You MUST write ALL output content — every title, every description,
every indicator, every single text value — EXCLUSIVELY in British
English. Do NOT use any other language, even if the context below
is partially or fully in Slovenian.
═══════════════════════════════════════════════════════════════════`,

  si: `═══ LANGUAGE DIRECTIVE (MANDATORY — OVERRIDES ALL OTHER INSTRUCTIONS) ═══
You MUST write ALL output content — every title, every description,
every indicator, every single text value — EXCLUSIVELY in Slovenian
(slovenščina). Do NOT use English for ANY field value, even if the
context below is partially or fully in English. Translate concepts
into Slovenian; do not copy English phrases.
═══════════════════════════════════════════════════════════════════`
};

// ───────────────────────────────────────────────────────────────
// LANGUAGE MISMATCH TEMPLATE
// ───────────────────────────────────────────────────────────────

export const LANGUAGE_MISMATCH_TEMPLATE = `═══ INPUT LANGUAGE NOTICE ═══
The user's existing content appears to be written in {{detectedName}},
but the current application language is set to {{targetName}}.
INSTRUCTIONS:
1. UNDERSTAND and PRESERVE the semantic meaning of the user's input regardless of its language.
2. Generate ALL new content in {{targetName}} as required by the Language Directive.
3. If enhancing existing content, translate it into {{targetName}} while improving it.
4. Do NOT discard or ignore the user's input just because it is in a different language.
5. The user's input defines the TOPIC — always stay on that topic.
═══════════════════════════════════════════════════════════════════`;

// ───────────────────────────────────────────────────────────────
// ACADEMIC RIGOR RULES — EN only
// ───────────────────────────────────────────────────────────────

export const ACADEMIC_RIGOR_RULES: Record<string, string> = {
  en: '═══ MANDATORY ACADEMIC RIGOR, EVIDENCE & CITATION RULES ═══\n'
    + 'These rules apply to ALL generated content WITHOUT EXCEPTION.\n\n'

    + '1. SEARCH-FIRST CITATION POLICY (MANDATORY)\n'
    + '   - BEFORE writing any paragraph that contains a factual claim, you MUST first search for real, verifiable sources.\n'
    + '   - Target: 1–3 verified citations per major paragraph. Quality over quantity — every citation MUST be a real, traceable publication.\n'
    + '   - Every citation MUST have: real author(s), real title, real publication year, and a real URL or DOI.\n'
    + '   - WRONG: "Pollution is a growing concern in the region." — no specific data, no verifiable source, no citation marker.\n'
    + '   - RIGHT: "The region generates approximately 450,000 tonnes of plastic waste annually, of which only 12% is recycled [1][2]." — specific data with traceable sources and numbered markers matching _references.\n'
    + '   - Do NOT generate plausible-sounding but unverifiable statements.\n'
    + '   - Source hierarchy (in order of preference):\n'
    + '     a) Peer-reviewed journal articles with named authors and DOI (HIGHEST academic value)\n'
    + '     b) Official statistical databases: Eurostat, OECD.Stat, World Bank Open Data, UN Data, IEA, ACER\n'
    + '     c) Institutional reports: European Commission, JRC, EEA, CEDEFOP, Eurofound, WHO\n'
    + '     d) National statistical offices and government ministry reports\n'
    + '     e) EU-funded project results cited by project acronym\n'
    + '   - For LOCAL/REGIONAL topics: you MUST include country-specific or region-specific data. If exact local data is unavailable, use the closest proxy (national data, comparable regions) and state: "Based on national-level data for [Country] ([Source], [Year])..."\n'
    + '   - MINIMUM data density: 2 specific data points per cause description, 2 per consequence description, 3 per core problem description. This is MANDATORY — do NOT write causes or consequences without numbers.\n'
    + '   - For GLOBAL topics: use international databases (Eurostat, OECD, World Bank, UN agencies, peer-reviewed meta-analyses). Prefer recent data (2019-2025).\n\n'

    + '2. INLINE CITATION FORMAT — SHORT ATTRIBUTION + NUMBERED MARKER (MANDATORY)\n'
    + '   - Bare numeric citation markers [N] alone are NOT sufficient for factual claims.\n'
    + '   - For every factual, comparative, empirical, legal, or literature-based claim, use this format:\n'
    + '     (Author, Year) [N]\n'
    + '     (Author et al., Year) [N]\n'
    + '     (Institution, Year) [N]\n'
    + '   - The [N] marker MUST still correspond to the 1-based index in the _references array.\n'
    + '   - Place the short attribution naturally in the sentence immediately before the numbered marker.\n'
    + '   - Correct examples:\n'
    + '     "The region generates approximately 450,000 tonnes of plastic waste annually (Jambeck et al., 2015) [1]."\n'
    + '     "Only 12% of plastic waste is recycled in the target area (Eurostat, 2023) [1], while the EU average stands at 32.5% (European Commission, 2024) [2]."\n'
    + '     "Multiple studies confirm this trend (Birnkrant et al., 2018) [1][2]."\n'
    + '   - Institutional sources MUST use institution + year, for example: (WHO, 2022) [3] or (European Commission, 2024) [4].\n'
    + '   - For multi-author academic sources, prefer first author + "et al." + year.\n'
    + '   - If reliable author/year metadata is unavailable, do NOT invent it. Use the best conservative real attribution available from the source metadata.\n'
    + '   - EVERY citation marker [N] you include MUST have a corresponding entry at index N-1 in the _references array.\n'
    + '   - When multiple sources support one claim, markers may still appear consecutively after one attribution chunk if semantically appropriate, but the prose should remain human-readable.\n'
    + '   - Marker numbers MUST be sequential starting from [1] and MUST match the _references array order.\n\n'

    + '3. TERMINOLOGY AND CATEGORY DISCIPLINE\n'
    + '   - NEVER conflate legal categories, organisational forms, or population groups.\n'
    + '   - Distinguish carefully between related but non-equivalent terms.\n'
    + '   - If a term has a formal EU legal meaning, use it consistently.\n'
    + '   - Example pairs to distinguish: Energy Community vs Renewable Energy Community vs Citizen Energy Community; cooperative vs community vs initiative; target groups vs end users vs beneficiaries.\n\n'

    + '4. CLAIM CALIBRATION STANDARD\n'
    + '   - Match the strength of the wording to the strength of the evidence.\n'
    + '   - Use weaker wording for limited evidence: "suggests", "is associated with", "appears to", "may constrain".\n'
    + '   - Use medium-strength wording for converging evidence: "limits", "reduces", "contributes to".\n'
    + '   - Use strong wording only when clearly justified by robust evidence: "prevents", "is the primary barrier".\n'
    + '   - HOWEVER: calibrated wording does NOT exempt you from providing empirical data. Even a cautious claim MUST include a number and source. Example: "Energy poverty appears to affect approximately 6.9% of Slovenian households who reported inability to keep their home adequately warm (Eurostat, 2022; SURS, 2023)."\n\n'

    + '5. ZERO-HALLUCINATION POLICY — NO INVENTED CITATIONS OR URLs (VERIFIED POST-GENERATION)\n'
    + '   - NEVER invent author names, organisation names, project names, or study titles.\n'
    + '   - NEVER fabricate statistics or percentages.\n'
    + '   - NEVER invent or guess URLs. If you do not have a verified URL for a citation, set the url field to an EMPTY STRING — do NOT fabricate a plausible-looking URL. Invented URLs are a FATAL ERROR that destroys user trust.\n'
    + '   - NEVER write placeholder text like "[Insert verified data: ...]", "Title not available", "Unknown source", "URL not available", "details pending", or "please fill manually". Placeholders are a FATAL ERROR.\n'
    + '   - If you do not know an exact number, use the BEST AVAILABLE ESTIMATE from your training data and clearly mark the source, author(s), and year. An honest estimate with attribution is ALWAYS better than a qualitative rewording.\n'
    + '   - Only if you genuinely cannot provide ANY defensible number, rephrase the sentence — but this should be RARE, not the default approach.\n'
    + '   - If you are not confident that a named author or project exists, DO NOT CITE IT. Prefer a high-confidence institutional source instead.\n'
    + '   - A paragraph with 1 verified citation is BETTER than a paragraph with 4 unverifiable citations.\n'
    + '   - NOTE: After generation, ALL URLs in _references will be AUTOMATICALLY VERIFIED via real HTTP HEAD/GET requests and CrossRef DOI lookup. Invented URLs WILL be detected and flagged as broken. Only include URLs you are confident are real.\n\n'

    + '6. MANDATORY WEB SEARCH + URL PROVENANCE — SEARCH BEFORE YOU WRITE\n'
    + '   - When web search capability is available (google_search tool, web plugin), you MUST actively search for current, verified empirical data BEFORE generating content.\n'
    + '   - For EVERY citation you intend to include, SEARCH for it first: verify the author exists, the title is real, and find the URL or DOI.\n'
    + '   - Web search results MUST be prioritised over training data when they provide more recent or more specific information.\n'
    + '   - If web search finds that a citation does NOT exist, DO NOT include it. Replace it with a verified alternative.\n'
    + '   - If web search is NOT available, use the best data from your training knowledge — but reduce citation count to only those you are highly confident about.\n'
    + '   - URL PROVENANCE: URLs that appear in the prompt context tagged with [VERIFIED_URL: <url>] are TRUSTED — they come from real-time web search results. Prefer these URLs in your _references entries. If no verified URL is available for a citation, leave the url field EMPTY — never invent one.\n\n'

    + '7. DOUBLE-VERIFICATION STANDARD\n'
    + '   - Before including any factual claim, verify from your training data:\n'
    + '     a) Does this author/organisation/report actually exist?\n'
    + '     b) Is this statistic plausible and from a credible source?\n'
    + '     c) Is the year/date accurate and recent enough?\n'
    + '     d) Does the metric match the claim? Are geography and year stated?\n'
    + '   - Cross-check: if you cite an author, make sure the topic matches their known field of research.\n\n'

    + '8. APPROVED SOURCE POOL CONSTRAINT (EO-084)\n'
    + '   - When an APPROVED SOURCE POOL is provided in the prompt, you MUST cite ONLY from that pool.\n'
    + '   - Copy authors, title, year, source, url, and doi EXACTLY as given in the pool. DO NOT modify them.\n'
    + '   - If the pool does not contain a source for a particular claim, either:\n'
    + '     a) Omit the claim entirely, OR\n'
    + '     b) Rephrase without a citation and state that no approved source was available.\n'
    + '   - NEVER invent additional sources not present in the pool. This is a FATAL ERROR.\n'
    + '   - You MAY reuse the same pool source for multiple claims (same [N] marker).\n'
    + '   - The pool sources are pre-verified via CrossRef and OpenAlex — their metadata is authoritative.\n'
    + '   - If NO approved source pool is provided, fall back to the search-first citation policy (Rule 1).\n'
    + '═══════════════════════════════════════════════════════════════════'
};

// ───────────────────────────────────────────────────────────────
// HUMANIZATION RULES — EN only — ★ v7.0: Expanded banned phrases + TG/EU segmentation
// ───────────────────────────────────────────────────────────────

export const HUMANIZATION_RULES: Record<string, string> = {
  en: `═══ HUMANIZATION RULES (MANDATORY) ═══
Content must read as if written by an experienced human EU project consultant.

1. SENTENCE STRUCTURE VARIATION
   - Mix short, medium, and occasional longer sentences.
   - Do NOT write 3+ consecutive sentences with the same rhythm or structure.
   - Vary openings: noun-led, evidence-led, contrast-led, or causality-led.

2. BANNED AI FINGERPRINT PHRASES — do NOT use as generic filler
   - "In today's rapidly evolving..."
   - "It is important to note that..."
   - "plays a crucial/pivotal/key role"
   - "comprehensive/holistic/multifaceted approach"
   - "foster", "leverage", "harness", "robust", "cutting-edge"
   - "paving the way for", "serves as a catalyst", "the landscape of"
   - "navigating the complexities", "it is worth noting", "a testament to"
   - "in light of the above", "cannot be overstated"
   - "In an era of...", "In an increasingly..."
   - "game-changer", "paradigm shift"
   - "bridge the gap", "fill the gap", "unlock the potential", "empower"
   - "various stakeholders" when the groups can be named specifically
   - IMPORTANT: legitimate EU technical terms such as "synergies", "capitalisation", "DNSH", "interoperability", or "flexibility markets" MAY be used when they are semantically correct and necessary. Do NOT ban valid domain terminology.

3. PROFESSIONAL IMPERFECTION
   - Avoid mechanical symmetry across list items.
   - Vary sentence counts slightly across items.
   - Use occasional parenthetical clarifications and em-dashes where natural.

4. CONCRETE OVER ABSTRACT
   - Replace abstract wording with concrete actors, quantities, timeframes, systems, or mechanisms.
   - Write "12 municipal energy agencies across 4 regions" instead of "multiple local stakeholders".
   - Distinguish clearly between Target Groups, End Users, Beneficiaries, and Partners.

5. VARIED LOGICAL CONNECTORS
   - Use connectors such as: "Consequently,", "In parallel,", "A related challenge is", "Against this backdrop,", "By contrast,", "At the system level,".
   - Avoid repeating "Furthermore,", "Moreover,", and "Additionally," as default transitions.

6. ACTIVE VOICE WITH CALIBRATION
   - Prefer active voice where the actor is known.
   - Use cautious verbs for evidence-based interpretation: "suggests", "indicates", "is associated with", "appears to limit".
   - Do not use strong causal verbs unless the evidence justifies them.

7. QUANTIFIED SPECIFICITY
   - Never "significant improvement" — say "a 23% reduction in processing time."
   - Never "multiple partners" — say "7 partners across 4 EU Member States."
   - Never "various activities" — say "3 workshops, 2 pilots, and 1 hackathon."
   - Use precise quantities based on your best available knowledge. If exact numbers are uncertain, use approximate language with source: "approximately 12,000 tonnes annually (Eurostat, 2023)."
   - CITATION RULE: For quantified or factual claims, use short human-readable inline attribution plus marker: (Author/Institution, Year) [N]. Bare [N] alone is not acceptable final output for factual claims.
   - Only attach a citation when the source is verified and you can provide a real reference entry in the _references array. An omitted citation is better than a fabricated citation.
   - URL RULE: When attaching a URL to a _references entry, ONLY use URLs you have verified — either from web search results, from [VERIFIED_URL] tags in the context, or DOI-based URLs (https://doi.org/<DOI>). A reference with an empty URL is acceptable; a reference with an INVENTED URL is a FATAL ERROR.
═══════════════════════════════════════════════════════════════════`
};

// ───────────────────────────────────────────────────────────────
// PROJECT TITLE RULES — EN only
// ───────────────────────────────────────────────────────────────

export const PROJECT_TITLE_RULES: Record<string, string> = {
  en: `═══ STRICT RULES FOR PROJECT TITLE (projectTitle) ═══
ATTENTION: These rules apply ONLY to the "projectTitle" field.
The acronym is generated separately — the title MUST NOT contain an acronym.

1. LENGTH: between 30 and 200 characters
2. FORMAT: concise noun phrase — NOT a full sentence, NOT a conjugated verb form
3. NO ACRONYM in the title
4. NO generic AI filler phrases
5. NO comma-separated laundry lists
6. NO adjective stacking
7. The title MUST answer: "What does this project deliver or achieve?"
8. The title should read like a professional project brand

GOOD TITLE EXAMPLES:
- "Digital Transformation of Artisan Skills in Cross-Border Regions"
- "Circular Economy in the Wood Processing Industry of the Danube Region"
- "Green Mobility Transition in Medium-Sized Cities"
- "Strengthening Digital Competences of Rural Youth"
- "Sustainable Food Supply Chains in the Alpine Space"

BAD TITLE EXAMPLES:
- "Project for developing innovative solutions for sustainable transformation"
- "We develop new approaches to comprehensively solving challenges"
- "Innovative, sustainable, comprehensive and advanced solution"
- "GREENTRANS – Green Urban Transport Transformation"
- "The project will establish a platform for..."
═══════════════════════════════════════════════════════════════════`
};

// ───────────────────────────────────────────────────────────────
// MODE INSTRUCTIONS (fill / enhance / regenerate) — EN only
// ───────────────────────────────────────────────────────────────

export const MODE_INSTRUCTIONS: Record<string, Record<string, string>> = {
  fill: {
    en: `MODE: FILL MISSING ONLY.
RULES:
1. KEEP all existing non-empty fields exactly as they are.
2. GENERATE professional content ONLY for fields that are empty strings ("") or missing.
3. If a list has fewer items than recommended, ADD NEW ITEMS.
4. Do NOT introduce unsupported statistics or citations merely to make the text look stronger.
5. Ensure valid JSON output.`
  },
  enhance: {
    en: `MODE: PROFESSIONAL ENHANCEMENT OF EXISTING CONTENT.

Task: Professionally refine, deepen, and strengthen the existing content.

RULES:
1. PRESERVE the meaning and thematic focus.
2. IMPROVE precision, intervention logic, and EU relevance.
3. ADD citations from REAL, VERIFIED sources using inline short attribution + numbered markers in the format (Author/Institution, Year) [N] — target 1–3 verified citations per major paragraph. Every citation MUST have a real URL or DOI. Prefer URLs tagged [VERIFIED_URL] in the context. Markers MUST match the _references array index (1-based).
4. ADD empirical data (numbers, percentages, quantities) to support every factual claim.
5. NEVER invent statistics or citations. Use best available estimates with source attribution.
6. Expand short fields where needed, but do not pad with generic filler.
7. CORRECT conceptual conflations, metric ambiguity, and overclaims.
8. NEVER REMOVE existing items unless they are clearly invalid and the output schema requires replacement.
9. NO MARKDOWN in structured content fields.
10. HUMANIZE: write like an experienced human consultant with varied sentence structure.
11. NEVER invent URLs — if no verified URL is available, leave the url field empty.
12. Ensure valid JSON output.`
  },
  regenerate: {
    en: 'MODE: FULL REGENERATION. Generate completely new, comprehensive, professional content. Every description MUST contain citations from REAL, VERIFIED sources using inline short attribution + numbered markers in the format (Author/Institution, Year) [N], supported by empirical data (numbers, percentages, quantities). Target 1–3 verified citations per major paragraph — every marker [N] MUST have a corresponding entry at index N-1 in the _references array with a real URL or DOI. Prefer URLs tagged [VERIFIED_URL] in the context. NEVER invent URLs — if no verified URL is available for a citation, leave the url field empty. NO markdown. Write like an experienced human consultant — vary sentence structures. If exact data unknown, use best available estimate with source and year — NEVER use placeholder brackets. Do NOT fabricate sources, authors, statistics, or URLs. Ensure valid JSON output.'
  }
};

// ───────────────────────────────────────────────────────────────
// QUALITY GATES (per section) — EN only
// ★ v7.0: Expanded with DNSH, KIPs, DMP, Lump Sum, CDE, partnerType,
//          Cross-Chapter Consistency Gate (7e)
// ───────────────────────────────────────────────────────────────

export const QUALITY_GATES: Record<string, Record<string, string[]>> = {
  problemAnalysis: {
    en: [
      'Every cause description contains >=1 verified citation as a numbered marker [N] with empirical data — each marker MUST have a corresponding _references entry with a real URL',
      'Every consequence description contains >=1 verified citation as a numbered marker [N] with empirical data — each marker MUST have a corresponding _references entry with a real URL',
      'The core problem statement includes at least one quantitative indicator with metric, geography, year, and source',
      'Every numerical claim specifies metric/unit, geography, and year or period',
      'Observed facts are clearly distinguished from analytical interpretation and projected effects',
      'At least 4 distinct, non-overlapping causes are listed',
      'At least 4 distinct consequences are listed, with at least one consequence linked to EU-level relevance or policy',
      'Causes are logically ordered from structural/root causes to proximate causes',
      'Terminology is used consistently and legal/organisational categories are not conflated',
      'Claim strength is calibrated: avoid absolute wording such as "prevents", "primary barrier", "proves", or "critical" unless strongly supported',
      'If unsure about a number, use your best available estimate with source attribution — NEVER use placeholder brackets or leave gaps',
      'No banned AI filler phrases',
      'Sentence lengths vary naturally',
      'CROSS-CHECK: Every cause listed here is addressable by at least one Activity/WP in Chapter 5',
      'CROSS-CHECK: Every consequence listed here can connect to at least one Impact in Chapter 6',
      'ZERO EMPTY FIELDS: Every field in the JSON output contains substantive content'
    ]
  },
  projectIdea: {
    en: [
      'projectTitle is a concise noun phrase (30–200 chars), with no acronym and no full sentence',
      'projectAcronym is 3–12 characters in uppercase letters, optionally with one hyphen, derived from projectTitle keywords, and is not a generic word',
      'State of the Art references at least 3 real and relevant existing projects, studies, or institutional initiatives',
      'State of the Art explicitly describes capitalisation on past results and avoidance of duplication',
      'State of the Art clearly separates established evidence from the project\'s own proposed innovation or hypothesis',
      'Proposed Solution begins with a 5–8 sentence introductory paragraph before phases',
      'Proposed Solution includes an explicit DNSH compliance statement',
      'Main Aim is one comprehensive sentence starting with an infinitive/base verb form',
      'At least 3 relevant EU policies or legal frameworks are listed with specific alignment descriptions',
      'TRL, SRL, ORL, and LRL each include a justified level and project-specific reasoning',
      'Expected effects are framed as plausible contributions or tested assumptions unless already validated by evidence',
      'No invented project names, acronyms, policy instruments, or technical standards',
      'No banned AI filler phrases',
      'Sentence lengths and structures vary naturally',
      'CROSS-CHECK: The Proposed Solution logically responds to the causes identified in Problem Analysis',
      'State of the Art MUST end with a clearly separated concluding paragraph titled "Capitalisation and Synergies" that summarises reuse of past results, duplication avoidance, and new added value (minimum 4 sentences)',
      'Every numerical claim or statistic in the State of the Art has an inline citation marker [N] — a number without citation is a validation failure',
      'Proposed Solution introductory paragraph contains EXACTLY 5 to 8 sentences BEFORE any phase listing — fewer than 5 is a validation failure',
      'Each EU policy description includes: (a) full official document name, (b) year of adoption, (c) specific article/chapter/priority reference where possible — generic mentions without specifics are a validation failure',
      'ZERO EMPTY FIELDS: Every field in the JSON output contains substantive content'
    ]
  },
  activities: {
    en: [
      'The LAST WP (highest number) is "Project Management and Coordination" — NOT any other topic',
      'The SECOND-TO-LAST WP is "Dissemination, Communication and Exploitation"',
      'WP1 is a foundational/analytical WP — NOT project management',
      'WP1 MUST include a specific task focusing on "Capitalisation and Synergies" (reviewing/integrating past EU project results)',
      'Total number of WPs is between 6 and 10',
      'A Data Management Plan (DMP) MUST be generated as a specific Deliverable or Milestone no later than Month 6 (M6) in WP1 or the PM WP',
      'Every WP has at least 1 milestone with a date in YYYY-MM-DD format',
      'Every WP has at least 1 deliverable with separate title and description fields',
      'Every task has startDate and endDate in YYYY-MM-DD format',
      'All WP and task titles use NOUN PHRASES, not infinitive verbs',
      'No markdown formatting in any text field',
      'Every task (except the very first task T1.1) has at least 1 dependency in its dependencies array',
      'Dependencies reference only valid predecessorId values from tasks that exist in the project',
      'Dependency types are valid: FS (Finish-to-Start), SS (Start-to-Start), FF (Finish-to-Finish), or SF (Start-to-Finish)',
      'Cross-WP dependencies exist — at least some tasks depend on tasks in OTHER work packages',
      'Every deliverable title is a concise noun phrase (3–10 words)',
      'Every deliverable description has 2–4 substantive sentences explaining scope, format, and content',
      'Every deliverable indicator is specific, BINARY, and verifiable (Lump Sum compliant) — includes quantity, format, and verification method',
      'Project Management WP spans the ENTIRE project duration (M1 to final month)',
      'Dissemination WP spans the ENTIRE project duration (M1 to final month)',
      'The Dissemination WP MUST clearly separate CDE tasks: Communication (general public), Dissemination (peers/experts/target groups), and Exploitation (end-users/policymakers/market)',
      'No content/technical WP spans the entire project — each covers a specific phase',
      'Tasks within each WP are sequential or staggered — NOT all sharing identical start and end dates',
      'NO task endDate exceeds the project end date ({{projectEnd}})',
      'NO milestone date exceeds the project end date ({{projectEnd}})',
      'Final reporting task and closing milestone are scheduled ON or BEFORE the project end date',
      'LUMP SUM: Every Deliverable and Milestone indicator MUST be a BINARY, verifiable proof of completion (e.g., "1 PDF report of min 30 pages, approved by Steering Committee and published on website")',
      'CROSS-CHECK: Every cause from Problem Analysis is addressed by at least one WP or Task',
      'ZERO EMPTY FIELDS: Every field in the JSON output MUST contain substantive content — no empty strings, no "N/A", no whitespace-only values. This is a FATAL validation check.',
    ]
  },
  generalObjectives: {
    en: [
      'Each objective has a title starting with an INFINITIVE VERB (e.g., "Strengthen...", "Develop...")',
      'Each description has 3 or more substantive sentences linking to broader EU goals',
      'EVERY objective has a non-empty "indicator" field with a specific, measurable KPI — NO exceptions',
      'Indicators are quantitative where possible (include numbers, percentages, timeframes)',
      'No markdown formatting, no banned AI phrases',
      'Sentence lengths vary naturally',
      'ZERO EMPTY FIELDS: title, description, AND indicator MUST ALL contain substantive content for EVERY objective. An empty indicator is a FATAL error.',
    ]
  },
  specificObjectives: {
    en: [
      'Each objective has a title starting with an INFINITIVE VERB (e.g., "Develop...", "Increase...")',
      'Each description has 3 or more substantive sentences',
      'EVERY objective has a non-empty "indicator" field with a S.M.A.R.T. KPI — NO exceptions',
      'Indicators include: quantitative target, baseline reference, and timeframe (e.g., "from X% to Y% by M24")',
      'No markdown formatting, no banned AI phrases',
      'CROSS-CHECK: Each KPI maps to at least one Output or Outcome',
      'ZERO EMPTY FIELDS: title, description, AND indicator MUST ALL contain substantive content for EVERY objective. An empty indicator is a FATAL error.',
    ]
  },
  outputs: {
    en: [
      'Each output has a concise noun phrase title',
      'Each description has 3 or more substantive sentences',
      'EVERY output has a non-empty "indicator" field with a BINARY, verifiable proof of completion — NO exceptions',
      'Indicators include quantity/format, scope, and verification method (Lump Sum compliant)',
      'No markdown formatting, no banned AI phrases',
      'CROSS-CHECK: Each output links to a specific WP/Task',
      'ZERO EMPTY FIELDS: title, description, AND indicator MUST ALL contain substantive content. An empty indicator is a FATAL error.',
    ]
  },
  outcomes: {
    en: [
      'Each outcome has a concise noun phrase title',
      'Each description has 3 or more substantive sentences',
      'EVERY outcome has a non-empty "indicator" field with a measurable change indicator — NO exceptions',
      'Indicators include quantitative target and measurement method',
      'No markdown formatting, no banned AI phrases',
      'CROSS-CHECK: Each outcome links to at least one Output and one Specific Objective',
      'ZERO EMPTY FIELDS: title, description, AND indicator MUST ALL contain substantive content. An empty indicator is a FATAL error.',
    ]
  },
  impacts: {
    en: [
      'Each impact has a concise noun phrase title',
      'Each description has 3 or more substantive sentences linking to EU policy',
      'EVERY impact has a non-empty "indicator" field with a long-term measurable indicator — NO exceptions',
      'Indicators include quantitative target, timeframe (3-5 years post-project), and data source',
      'Each impact specifies its Key Impact Pathway (KIP): Scientific, Societal, or Economic',
      'No markdown formatting, no banned AI phrases',
      'CROSS-CHECK: Each impact links to a Consequence from Problem Analysis',
      'ZERO EMPTY FIELDS: title, description, AND indicator MUST ALL contain substantive content. An empty indicator is a FATAL error.',
    ]
  },
  kers: {
    en: [
      'Each KER has a concise noun phrase title',
      'Each description has 3 or more substantive sentences',
      'EVERY KER has a non-empty "exploitationStrategy" field covering all 3 sustainability pillars — NO exceptions',
      'exploitationStrategy covers: Financial sustainability, Institutional sustainability, Political sustainability',
      'No markdown formatting, no banned AI phrases',
      'CROSS-CHECK: Each KER originates from an identifiable Output',
      'ZERO EMPTY FIELDS: title, description, AND exploitationStrategy MUST ALL contain substantive content. An empty exploitationStrategy is a FATAL error.',
    ]
  },
  risks: {
    en: [
      'Each risk has id, category, title, description, likelihood, impact, and mitigation',
      'Categories are from: technical, social, economic, environmental',
      'At least 1 risk per category, at least 6 risks total',
      'Mitigation strategies are CONCRETE and ACTIONABLE with 2-4 sentences (not generic)',
      'No markdown formatting, no banned AI phrases',
      'ZERO EMPTY FIELDS: ALL fields including mitigation MUST contain substantive content. An empty mitigation is a FATAL error.',
    ]
  },
  _default: {
    en: [
      'Every description has at least 3 substantive sentences unless the schema explicitly requires shorter content',
      'Titles follow the correct format for their section type',
      'No vague filler phrases; the text is specific, analytical, and relevant to the project context',
      'Every factual claim MUST include empirical data (numbers, percentages) with 1–3 verified source citations using inline short attribution + numbered marker format: (Author/Institution, Year) [N]',
      'Numerical claims include metric, geography, year, and source — MANDATORY for all analytical sections',
      'No invented citations, invented projects, invented legal references, or invented URLs — a reference with an empty URL is acceptable, a reference with an invented URL is FATAL',
      'No markdown formatting in structured content fields unless the specific section explicitly requires it',
      'No banned AI filler phrases',
      'Sentence lengths vary naturally',
      'Target Groups, End Users, Beneficiaries, and Partners are clearly distinguished where relevant',
      'ZERO EMPTY FIELDS: Every field in the JSON output contains substantive content'
    ]
  },
  partners: {
    en: [
      'P1 is designated as Lead Partner / Coordinator with strong management capacity',
      'Every partner name is a TYPE DESCRIPTION (e.g., "Research University in X"), NEVER a real organisation name',
      'Every partner MUST have a partnerType value from the allowed enum (faculty, researchInstitute, sme, publicAgency, internationalAssociation, ministry, ngo, largeEnterprise, other)',
      'The partnerType MUST match the partner name description (e.g., "Research University..." → partnerType: "faculty")',
      'Expertise descriptions are 2–4 substantive sentences linking to specific WPs',
      'PM rates are realistic for each organisation type (2500–7000 EUR range)',
      'The consortium covers all competences required by the work packages',
      'At least one research/academic partner is included if the project has R&D components',
      'At least one practice/implementation partner (public authority, SME, NGO) is included',
      'Geographic diversity is reflected where the project scope requires it',
      'Partner count is appropriate for the project complexity (not too few, not too many)',
      'No markdown formatting, no banned AI phrases',
      'CROSS-CHECK: Every WP should have at least one partner with relevant expertise',
      'ZERO EMPTY FIELDS: Every field in the JSON output MUST contain substantive content — no empty strings, no "N/A", no whitespace-only values. This is a FATAL validation check.',
    ]
  },
  // ★ v7.0: NEW — Cross-Chapter Consistency Gate
  _crossChapter: {
    en: [
      'Every CAUSE in Problem Analysis is addressed by at least one WP or Task',
      'Every SPECIFIC OBJECTIVE has a corresponding KPI reflected in at least one Output or Outcome indicator',
      'Every IMPACT links to at least one Consequence from Problem Analysis and aligns with a Key Impact Pathway',
      'KERs originate from identifiable Outputs',
      'The Proposed Solution logically responds to all major causes in Chapter 1',
      'Terminology remains consistent across chapters; legal and organisational categories are not conflated',
      'Partner expertise covers all WP competence requirements',
      'ZERO EMPTY FIELDS: Every field across all chapters contains substantive content'
    ]
  }
};

// ───────────────────────────────────────────────────────────────
// SECTION TASK INSTRUCTIONS — EN only
// ★ v7.0: All sections updated with Intervention Logic cross-references,
//          DNSH, KIPs, DMP, Lump Sum, CDE, synergies, partnerType
// ───────────────────────────────────────────────────────────────

export const SECTION_TASK_INSTRUCTIONS: Record<string, Record<string, string>> = {
  problemAnalysis: {
    en: `USER INPUT FOR CORE PROBLEM:
{{userInput}}

TASK: Based STRICTLY on the USER INPUT ABOVE, create (or complete) a detailed problem analysis.

INTERVENTION LOGIC ROLE:
This is Chapter 1 — the foundation of the intervention logic. Every major cause
identified here MUST later be addressed by at least one Activity (WP/Task).
Every major consequence MUST later connect to at least one Impact in Chapter 6.

MANDATORY:
- The title and description MUST stay directly related to the user's topic.
- Do NOT introduce unrelated thematic directions.
- The core problem MUST include at least one robust quantitative indicator where defensible.
- Every CAUSE requires: title + 3–5 sentence description.
- Every CONSEQUENCE requires: title + 3–5 sentence description.
- Add numbered citation markers [N] when a sentence makes an empirical, legal, or comparative claim. Each marker must match a _references entry.
- Do NOT force statistics into every sentence. Use numbers only when they are defensible.
- Every numerical claim MUST specify, where relevant: metric, geography, time period, and source.
- Causes must be logically ordered: structural/root causes first, proximate causes second.
- Consequences should show escalation where relevant: local → regional → national → EU relevance.
- Distinguish clearly between observed facts, analytical interpretation, and projected effects.
- Never conflate categories or formal terms. If two concepts are related but not identical, do not use them interchangeably.
- Use calibrated wording. Prefer "limits", "constrains", "is associated with", or "reduces" unless strong evidence justifies "prevents", "is the primary barrier", or other absolute formulations.
- If exact local data is unavailable, use the nearest defensible proxy and label it explicitly. If no defensible number is available, rewrite the sentence qualitatively.
- NEVER invent author names, sources, project acronyms, or statistics.
- NO markdown (**, ##, \`).
- Write like an experienced human consultant with varied sentence structures.
- Distinguish Target Groups from End Users where relevant.`
  },
  projectIdea: {
    en: `{{titleContext}}Based on the problem analysis, develop (or complete) a comprehensive project idea.

INTERVENTION LOGIC ROLE:
This is Chapter 2. The Proposed Solution MUST logically respond to the causes
identified in Chapter 1. The State of the Art MUST demonstrate awareness of
existing work and explain how this project builds on it without duplication.

ACRONYM RULES (projectAcronym field):
- Generate a project acronym derived from the key words of the projectTitle.
- LENGTH: 3–12 characters, uppercase letters, with an optional single hyphen.
- The acronym should be pronounceable or a recognisable abbreviation.
- The acronym MUST NOT be a generic word such as "PROJECT", "EUROPE", or "DIGITAL".
- Place the acronym ONLY in the "projectAcronym" field, never inside projectTitle.

STATE OF THE ART & CAPITALISATION (MANDATORY):
- Reference at least 3 REAL existing projects, studies, institutional initiatives, or policy-supported pilots.
- Use only names, acronyms, and dates that you are confident are real.
- Explicitly state how this project capitalises on validated results, methods, tools, datasets, or lessons learned from previous work.
Explicitly explain how duplication will be avoided.
- The State of the Art section MUST end with a clearly separated concluding paragraph titled "Capitalisation and Synergies" (written as plain text, not a heading). This paragraph (minimum 4 sentences) MUST explicitly summarise: (a) which specific results, tools, methods, or datasets from the referenced projects will be reused or adapted, (b) how the current project avoids duplication of effort, and (c) what new value this project adds beyond existing work. This concluding paragraph is MANDATORY — omitting it is a validation failure.
- Every numerical claim or statistic within the State of the Art MUST have an inline citation marker [N] matching a _references entry. A number without a citation marker is a validation failure.
- Distinguish clearly between:
  a) what existing evidence already shows,
  b) what this project will adapt or extend,
  c) what this project still needs to test or validate.

PROPOSED SOLUTION (MANDATORY):
- MUST begin with a comprehensive introductory paragraph of EXACTLY 5 to 8 sentences BEFORE listing any phases. This paragraph summarises the overall solution approach, its innovation, its connection to the problem analysis, and why this approach was chosen over alternatives. Fewer than 5 sentences is a validation failure. Do NOT jump directly into "Phase 1:" — the introduction comes first.
- Use plain text phase headers, for example: "Phase 1: Baseline Analysis".
- Include an explicit DNSH compliance statement.
- Present expected effects as plausible contributions, validated pathways, or testable assumptions — not as guaranteed outcomes unless strong prior evidence already exists.

READINESS LEVELS:
- TRL, SRL, ORL, and LRL must each include:
  a) a numerical level,
  b) a label,
  c) a 2–3 sentence project-specific justification.
- Justifications must reflect actual maturity, not aspirational wording.

GENERAL:
- EU policies and legal frameworks must be real and relevant. Each policy description MUST include: (a) the full official name of the document or legal act (e.g., "Directive (EU) 2018/2001 on the promotion of energy from renewable sources"), (b) the year of adoption or publication, and (c) a specific reference to the relevant article, chapter, or priority area where possible (e.g., "Article 22 on Renewable Energy Communities"). A generic mention like "aligned with the European Green Deal" without document name, year, and specific area is a validation failure.
- The "policies" array in your JSON response MUST use EXACTLY these field names for each policy object:
  { "name": "<full official document name with year>", "description": "<3-5 sentences: specific article/chapter reference, how the project aligns, why this policy is relevant>" }
  Do NOT use alternative field names such as "title", "relevanceDescription", "alignment", or "policyName". Only "name" and "description" are accepted. Any other field name is a validation failure.
- If the exact name of a previous project is uncertain, prefer a high-confidence institutional study or a clearly described real initiative rather than inventing a project acronym.
- Do NOT present scenario results, pilot assumptions, or intended impact pathways as proven system-wide outcomes.
- NO markdown (**, ##, \`).
- Write like an experienced human consultant with varied sentence structures and calibrated claims.`
  },
  generalObjectives: {
    en: `Define 3–5 general objectives.

INTERVENTION LOGIC ROLE:
General objectives connect the project to broader EU goals. Each objective MUST
be traceable back to the problem analysis and forward to the expected impacts.

MANDATORY:
- Title MUST use INFINITIVE VERB (e.g., "Strengthen…", "Develop…", "Enhance…").
- Each description: 3–5 substantive sentences linking to broader EU goals.
- Each objective MUST have an "indicator" field containing a SPECIFIC, MEASURABLE KPI (Key Performance Indicator) that demonstrates progress toward the objective. The indicator MUST be quantitative where possible (e.g., "Reduction in early school leaving rates by 15% across pilot regions by project end") or clearly verifiable (e.g., "Adoption of the developed methodology by at least 10 regional education authorities within 2 years post-project"). NEVER leave the indicator field empty.
- No markdown. Vary sentence structures.
- No banned AI phrases.`
  },
  specificObjectives: {
    en: `You MUST generate EXACTLY 5 to 7 S.M.A.R.T. specific objectives. Generating fewer than 5 is a FATAL ERROR that will be rejected.

INTERVENTION LOGIC ROLE:
Every Specific Objective MUST be measurable through a KPI that maps to at
least one Output or Outcome in Chapter 6. This is the accountability bridge
between ambition and delivery.

MANDATORY:
- Title MUST use INFINITIVE VERB (e.g., "Develop…", "Increase…").
- Each description: 3–5 substantive sentences explaining the objective in detail.
- Each objective MUST have an "indicator" field containing a SPECIFIC, MEASURABLE, TIME-BOUND KPI (Key Performance Indicator). The indicator MUST follow the S.M.A.R.T. format and include a quantitative target, a baseline reference, and a timeframe. Examples: "Increase the percentage of pilot school students completing the academic year from 82% to 93% by M24" or "Train 200 educators across 5 partner regions in the new mediation methodology, verified by completion certificates, by M18". NEVER leave the indicator field empty — this is a FATAL error.
- S.M.A.R.T.: Specific, Measurable, Achievable, Relevant, Time-bound.
- No markdown. Vary sentence structures.
- No banned AI phrases.
- CROSS-CHECK: Each KPI should be verifiable through at least one Output or Outcome.`
  },
  projectManagement: {
    en: `Create a DETAILED project management section with TWO distinct parts:

PART 1 — DESCRIPTION FIELD (projectManagement.description):
This is the MAIN content field. It MUST contain a comprehensive text (minimum 500 words) covering ALL of the following:
1. MANAGEMENT STRUCTURE – Roles with EU abbreviations: PK, UO, SO, VDS. Responsibilities and authority of each.
2. DECISION-MAKING MECHANISMS – Operational, strategic, escalation levels. Voting, quorum, meeting frequency.
3. QUALITY ASSURANCE – Internal reviews, peer evaluations, external audits, benchmarks, reporting standards. MUST include verification/monitoring of Gender Equality Plans (GEPs), environmental standards, and ethical/regulatory compliance (e.g., AI Act, GDPR where applicable).
4. RISK MANAGEMENT APPROACH – Identification, assessment, monitoring, mitigation. Reference risk register (5C).
5. INTERNAL COMMUNICATION – Tools, schedules, reporting chains, document management.
6. CONFLICT RESOLUTION – Escalation: informal → mediation by coordinator → formal arbitration.
7. DATA MANAGEMENT AND OPEN SCIENCE – FAIR principles, access types, repository details. Reference the mandatory DMP deliverable (due by M6).
Write as flowing prose paragraphs, not bullet lists. No markdown. Write like an experienced consultant.

FORMATTING OF DESCRIPTION:
- Structure the description into CLEAR PARAGRAPHS separated by double newlines (\\n\\n).
- Each major topic (management structure, decision-making, quality assurance, risk management, communication, conflict resolution, data management) should be its OWN PARAGRAPH.
- Begin each paragraph with the topic as a plain text header on its own line, e.g.: "Management Structure" followed by a newline, then the descriptive text.
- Do NOT write one continuous block of text. The text must be readable with clear visual separation between topics.

PART 2 — STRUCTURE FIELDS (projectManagement.structure):
These fields appear as LABELS in the organigram chart. They MUST contain ONLY short role titles (max 5–8 words each):
- coordinator: e.g., "Project Coordinator (PK)"
- steeringCommittee: e.g., "Steering Committee (UO)"
- advisoryBoard: e.g., "Advisory Board (SO)"
- wpLeaders: e.g., "WP Leaders (VDS)"
CRITICAL: Do NOT put descriptions, explanations, or long text in structure fields. These are chart labels ONLY. All detailed descriptions go in the description field above.`
  },
  activities: {
    en: `Generate between 6 and 10 Work Packages with tasks, milestones and deliverables.

INTERVENTION LOGIC ROLE:
Activities are the operational core of the intervention logic. Every cause from
Problem Analysis MUST be addressed by at least one WP or Task. The logical
sequence of WPs translates the Proposed Solution into actionable steps.

ABSOLUTE PROJECT TIMEFRAME CONSTRAINT:
- Project START date: {{projectStart}}
- Project END date: {{projectEnd}} ({{projectDurationMonths}} months total)
- EVERY task startDate MUST be ≥ {{projectStart}}
- EVERY task endDate MUST be ≤ {{projectEnd}}
- EVERY milestone date MUST be ≤ {{projectEnd}}
- EVERY WP must start on or after {{projectStart}} and end on or before {{projectEnd}}
- NO activity, task, milestone, or deliverable may be scheduled AFTER {{projectEnd}}
- Dissemination, exploitation, and reporting tasks MUST be completed by {{projectEnd}}
- The final project report and closing milestone MUST be on or before {{projectEnd}}
- This is NON-NEGOTIABLE — any date outside this range is a FATAL ERROR

TITLE FORMAT RULES:
- WP titles: noun phrase (e.g., "Baseline Analysis and Stakeholder Mapping")
- Task titles: noun phrase (e.g., "Development of Training Curriculum")
- Milestone descriptions: noun phrase (e.g., "Completion of Pilot Phase")
- Deliverable titles: noun phrase (e.g., "Stakeholder Engagement Report")
- Do NOT use infinitive verbs for any of these.

WORK PACKAGE ORDERING (MANDATORY):
- WP1: foundational/analytical (e.g., "Baseline Analysis and Needs Assessment"). WP1 MUST include a specific task focusing on "Capitalisation and Synergies" (reviewing and integrating past EU project results relevant to this project).
- WP2–WP(N-2): content/thematic work packages in logical sequence
- WP(N-1) (second-to-last): "Dissemination, Communication and Exploitation of Results"
- WP(N) (last): "Project Management and Coordination"

MANDATORY DATA MANAGEMENT PLAN:
- A Data Management Plan (DMP) MUST be scheduled as a specific Deliverable no later than Month 6 (M6), either in WP1 or the PM WP.
- The DMP deliverable indicator: "1 PDF document (min. 15 pages) covering data types, FAIR compliance, storage, access rights, and ethical considerations, approved by the Steering Committee by M6"

WP DURATION RULES (MANDATORY):
- "Project Management and Coordination" WP MUST span the ENTIRE project duration — from the first month (M1) to the final month.
- "Dissemination, Communication and Exploitation" WP MUST also span the ENTIRE project duration — from M1 to the final month.
- Content/thematic WPs (WP1 to WP(N-2)) should be SEQUENTIAL with partial overlaps. Example for a 36-month project: WP1 covers M1–M10, WP2 covers M6–M18, WP3 covers M14–M26, WP4 covers M22–M34, etc.
- NO content/thematic WP should span the entire project duration.
- Tasks WITHIN each WP must be sequential or staggered — do NOT give all tasks in a WP the same startDate and endDate.

CDE SEPARATION IN DISSEMINATION WP (MANDATORY):
The Dissemination WP MUST clearly separate three types of tasks:
- Communication tasks — targeting the GENERAL PUBLIC (raising awareness, visibility)
- Dissemination tasks — targeting PEERS, EXPERTS, and TARGET GROUPS (sharing results, publications, conferences)
- Exploitation tasks — targeting END USERS, POLICYMAKERS, and MARKET (adoption, commercialisation, policy integration)
Do NOT mix these three categories into a single generic "dissemination" task.

TASK DEPENDENCIES (MANDATORY):
- The very first task of the project (T1.1) has NO dependencies (it is the starting point).
- EVERY OTHER task MUST have at least 1 dependency in its "dependencies" array.
- Each dependency object has: { "predecessorId": "T<wp>.<task>", "type": "FS" | "SS" | "FF" | "SF" }
- FS (Finish-to-Start) is the most common: the successor starts after the predecessor finishes.
- SS (Start-to-Start): both tasks start at the same time.
- FF (Finish-to-Finish): both tasks finish at the same time.
- SF (Start-to-Finish): the successor finishes when the predecessor starts (rare).
- CROSS-WP dependencies MUST exist: e.g., T2.1 depends on T1.3 (FS), T3.1 depends on T2.2 (FS).
- Within a WP, sequential tasks should have FS dependencies: T1.2 depends on T1.1, T1.3 depends on T1.2, etc.
- Parallel tasks within a WP can use SS dependencies.

DELIVERABLE FIELDS (MANDATORY — LUMP SUM COMPLIANT):
- Each deliverable MUST have THREE separate fields:
  1. "title" — a concise noun phrase (3–10 words), e.g., "Stakeholder Engagement Report"
  2. "description" — 2–4 substantive sentences explaining what the deliverable contains, its format, scope, and intended audience. Do NOT just repeat the title.
  3. "indicator" — a SPECIFIC, BINARY, and VERIFIABLE proof of completion (Lump Sum compliant). Include: quantity/format (e.g., "1 PDF report"), scope (e.g., "covering all 12 partner regions"), and verification method (e.g., "reviewed and approved by the Steering Committee").
- WRONG indicator: "Report delivered" (too vague, NOT binary)
- RIGHT indicator: "1 PDF report (min. 40 pages) covering baseline data from 12 regions, peer-reviewed by 2 external experts and approved by the Steering Committee by M10"

TASKS:
- Each WP must have 2–5 tasks.
- Each task: id, title, description (2–4 sentences), startDate, endDate, dependencies.
- Task descriptions should explain methodology, not just restate the title.

MILESTONES:
- Each WP must have at least 1 milestone.
- Milestone date in YYYY-MM-DD format. Place at logical completion points.
- Milestone indicators MUST also be BINARY and verifiable (Lump Sum compliant).

No markdown. Write like an experienced EU project consultant.

WP AND TASK ID PREFIX RULES (LANGUAGE-DEPENDENT — MANDATORY):
When the LANGUAGE DIRECTIVE specifies Slovenian output:
- Work Package IDs MUST use "DS" prefix: DS1, DS2, DS3, ...
- Task IDs MUST use "N" prefix: N1.1, N1.2, N2.1, ...
- Milestone IDs: M1.1, M2.1, ... (unchanged)
- Deliverable IDs: D1.1, D2.1, ... (unchanged)
When the LANGUAGE DIRECTIVE specifies English output:
- Work Package IDs MUST use "WP" prefix: WP1, WP2, WP3, ...
- Task IDs MUST use "T" prefix: T1.1, T1.2, T2.1, ...
- Milestone IDs: M1.1, M2.1, ... (unchanged)
- Deliverable IDs: D1.1, D2.1, ... (unchanged)
This is NON-NEGOTIABLE — wrong prefixes are a FATAL ERROR.`
  },
  outputs: {
    en: `Generate 5–6 concrete project outputs (direct deliverables). MAXIMUM 6 outputs — do not exceed this.

INTERVENTION LOGIC ROLE:
Outputs are the direct, tangible deliverables of Activities. Every Output MUST
be traceable to a specific WP. Outputs feed into Outcomes and eventually Impacts.

MANDATORY:
- Title MUST be a result-oriented noun phrase: "Digital Competence Curriculum" NOT "Develop a curriculum".
- Each description: 3–4 sentences MAXIMUM explaining what the output is, how it is produced, and who benefits. Mentions specific WP link.
- Each output MUST have an "indicator" field containing a SPECIFIC, BINARY, and VERIFIABLE proof of completion. The indicator MUST include: quantity/format (e.g., "1 online platform"), scope (e.g., "covering 5 languages"), and verification method (e.g., "accessible at project URL, verified by external evaluator"). Lump Sum compliant — the indicator must allow YES/NO verification. Examples: "1 PDF handbook (min. 80 pages) in 5 languages, peer-reviewed by 3 external experts and published on the project website by M18" or "1 functional online dashboard with at least 500 registered users, verified by server analytics report at M24". NEVER leave the indicator field empty — this is a FATAL error.
- Clearly state which Target Groups will directly receive/use each output.
- No markdown. Vary sentence structures. No banned AI phrases.
- CROSS-CHECK: Each output should be producible by a specific WP/Task.`
  },
  outcomes: {
    en: `Generate 4–5 medium-term project outcomes (changes resulting from outputs). MAXIMUM 5 outcomes — do not exceed this.

INTERVENTION LOGIC ROLE:
Outcomes represent the medium-term changes that Outputs generate. They bridge
the gap between what the project delivers and the long-term Impacts.

MANDATORY:
- Title MUST be result-oriented noun phrase: "Increased Digital Literacy Among Rural Youth" NOT "Increase digital literacy".
- Each description: 3–4 sentences MAXIMUM explaining the expected change, who is affected, and the evidence base.
- Each outcome MUST have an "indicator" field containing a SPECIFIC, MEASURABLE indicator that demonstrates the change has occurred. Include a quantitative target and measurement method. Examples: "75% of trained educators report increased confidence in applying mediation techniques, measured via post-training survey at M20" or "30% reduction in disciplinary incidents in pilot schools compared to baseline, verified by school administration records at M24". NEVER leave the indicator field empty — this is a FATAL error.
- Clearly distinguish Target Groups (those involved during the project) from End Users (those adopting results post-project).
- No markdown. Vary sentence structures. No banned AI phrases.
- CROSS-CHECK: Each outcome should link to at least one Specific Objective KPI.`
  },
  impacts: {
    en: `Generate 3–4 long-term strategic impacts aligned with EU policy objectives. MAXIMUM 4 impacts — do not exceed this.

INTERVENTION LOGIC ROLE:
Impacts are the long-term strategic shifts resulting from the project. They MUST
connect back to Consequences from Problem Analysis AND to EU policies from Project Idea.

KEY IMPACT PATHWAYS (KIPs) — MANDATORY:
Categorise each impact into one of the three Key Impact Pathways:
- Scientific Impact — advancing knowledge, methods, standards
- Societal Impact — addressing societal challenges, improving quality of life
- Economic Impact — innovation, competitiveness, growth, employment
Explicitly state the pathway in each impact description.

MANDATORY:
- Title MUST be result-oriented noun phrase: "Enhanced Cross-Border Innovation Ecosystem" NOT "Enhance the ecosystem".
- Each description: 3–4 sentences MAXIMUM linking to EU-level policy goals, explaining the causal pathway from project outcomes to long-term change.
- Each impact MUST have an "indicator" field containing a SPECIFIC, MEASURABLE long-term indicator. Include a quantitative target, a timeframe (typically 3–5 years post-project), and a data source. Examples: "5% reduction in early school leaving rates in participating regions within 3 years post-project, measured via Eurostat regional education statistics" or "Adoption of the project methodology by at least 3 national education ministries within 5 years, verified by policy documents and MoUs". NEVER leave the indicator field empty — this is a FATAL error.
- Each impact MUST specify its Key Impact Pathway (KIP): Scientific, Societal, or Economic.
- No markdown. Vary sentence structures. No banned AI phrases.
- CROSS-CHECK: Every impact links to at least one Consequence from Problem Analysis.`
  },
  risks: {
    en: `Generate 8–12 project risks across ALL FOUR categories:
- technical (technology failures, integration issues)
- social (stakeholder resistance, low engagement)
- economic (budget overruns, market changes)
- environmental (climate events, regulatory changes, environmental compliance)

MANDATORY:
- Each risk MUST have ALL fields filled: id, category (lowercase: technical/social/economic/environmental), title, description (2–4 sentences), likelihood (low/medium/high), impact (low/medium/high), and mitigation strategy.
- The "mitigation" field MUST contain 2–4 sentences with CONCRETE, ACTIONABLE countermeasures — not generic statements. Include who is responsible, what triggers the mitigation, and what the backup plan is. NEVER leave the mitigation field empty — this is a FATAL error.
- Use NOUN PHRASES for titles: "Insufficient Partner Engagement" NOT "Partners might not engage".
- If the project includes digital/AI components, MUST include an "Ethical and Regulatory Compliance (AI Act/GDPR)" risk with appropriate mitigation strategy.
- No markdown. Vary sentence structures. No banned AI phrases.`
  },
  kers: {
    en: `Generate 4–5 Key Exploitable Results (KERs). MAXIMUM 5 KERs — do not exceed this.

INTERVENTION LOGIC ROLE:
KERs are the specific assets or products that carry lasting value beyond the
project lifetime. They MUST derive from concrete Outputs produced by specific WPs.

3-PILLAR SUSTAINABILITY STRATEGY (MANDATORY):
Every KER exploitation strategy MUST address all three pillars:
1. Financial Sustainability — how it will be funded/maintained post-project
   (licensing, freemium model, membership fees, integration into existing budgets)
2. Institutional Sustainability — who takes ownership and operational responsibility
   (which partner, which institution, what governance structure)
3. Political/Regulatory Sustainability — how it integrates into local/regional/EU
   policies and regulatory frameworks (alignment with directives, endorsement paths)

MANDATORY:
- Title MUST be a specific asset/product name: "GreenGrid Decision Support Tool" NOT "Development of a tool".
- Each description: 3–4 sentences MAXIMUM about what it is, who will use it, and how it differs from existing solutions.
- Each KER MUST have an "exploitationStrategy" field containing 3–4 sentences covering ALL THREE sustainability pillars above. The exploitationStrategy MUST specifically address: (1) how the KER will be financially sustained post-project, (2) which institution takes ownership, and (3) how it aligns with policy frameworks. NEVER leave the exploitationStrategy field empty — this is a FATAL error.
- No markdown. Vary sentence structures. No banned AI phrases.
- CROSS-CHECK: Each KER must originate from a concrete Output produced by a specific WP.`
  },
  partners: {
    en: `Generate a realistic consortium (partnership) for this EU project.

CONTEXT AWARENESS:
- Analyse the project's problem analysis, objectives, activities (work packages), and expected results.
- The consortium must cover ALL competences needed to deliver ALL work packages.
- The number of partners depends on project complexity: typically 4–8 for Interreg, 6–15 for Horizon Europe, 3–6 for Erasmus+.

FUNDING MODEL:
- The user has ALREADY selected the funding model (centralized or decentralized). Do NOT change it.
- Use the fundingModel value from the project data context.

WHAT TO GENERATE FOR EACH PARTNER:
1. "id" — unique string: "partner-1", "partner-2", etc.
2. "code" — short code: "CO" for the coordinator (index 0), "P2", "P3", etc. for others.
3. "name" — PARTNER TYPE description (NOT a real organisation name). Examples:
   - "Research University specialising in Environmental Science"
   - "SME in Digital Technologies and Software Development"
   - "Regional Development Agency with cross-border experience"
   - "Public Authority responsible for Urban Mobility"
   - "NGO focused on Social Inclusion and Youth Empowerment"
   - "Technology Transfer Centre in Renewable Energy"
   - "Chamber of Commerce with Industry Network Access"
   - "Vocational Training Institute for Green Skills"
4. "expertise" — 2–4 sentences describing what specific expertise this partner type brings to the project, which WPs they would lead or contribute to, and what unique value they add.
5. "pmRate" — realistic EU Person-Month cost rate for this organisation type (in EUR):
   - Large Research University: 5500–7000
   - Applied Sciences University: 4500–6000
   - SME (technology): 4000–5500
   - SME (consulting): 3500–5000
   - Public Authority: 3000–4500
   - NGO / Non-profit: 2500–4000
   - Chamber / Association: 3000–4500
   - Vocational Training: 3500–5000
6. "partnerType" — MANDATORY. You MUST assign exactly ONE of these values to EVERY partner:
   - "faculty" — for universities, faculties, academic institutions
   - "researchInstitute" — for dedicated research centres and institutes
   - "sme" — for small and medium enterprises
   - "publicAgency" — for public agencies, regional development agencies
   - "internationalAssociation" — for international associations, chambers of commerce
   - "ministry" — for ministries, government bodies
   - "ngo" — for NGOs, non-profits, civil society organisations
   - "largeEnterprise" — for large corporations
   - "other" — only if none of the above fits

RULES for partnerType:
   - EVERY partner MUST have a partnerType — it is NEVER empty or missing.
   - The partnerType MUST match the partner's "name" description.
   - Example: if name is "Research University...", then partnerType MUST be "faculty".
   - Example: if name is "SME in Digital...", then partnerType MUST be "sme".
   - Example: if name is "Regional Development Agency...", then partnerType MUST be "publicAgency".

PARTNER COMPOSITION RULES:
- P1 / CO (Lead Partner / Coordinator): must have strong project management capacity and topic expertise.
- Include at LEAST one research/academic partner if the project has innovation or R&D components.
- Include at LEAST one practice/implementation partner (public authority, SME, or NGO).
- Ensure geographic diversity where the project scope implies cross-border/transnational work.
- Every WP should have at least one partner with relevant expertise.
- Do NOT include more partners than the project complexity justifies.

CRITICAL RULES:
- NEVER use real organisation names — always use PARTNER TYPE descriptions.
- The "name" field describes WHAT KIND of organisation, not WHO specifically.
- PM rates must be realistic for EU-funded projects (not too low, not too high).
- The total consortium must be balanced: not all universities, not all SMEs.
- Write expertise descriptions like an experienced EU project consultant.
- No markdown formatting. No banned AI phrases.`
  }
};

// ───────────────────────────────────────────────────────────────
// CHAPTERS (long-form rules for each section) — EN only
// ★ v7.0: Updated with DNSH, KIPs, 3-Pillar, Synergies, DMP,
//          Lump Sum, CDE, GEPs, AI Act, partnerType
// ───────────────────────────────────────────────────────────────

export const CHAPTERS: Record<string, string> = {
  chapter1_problemAnalysis: `CHAPTER 1 — PROBLEM ANALYSIS

The Problem Analysis is the foundation of the entire intervention logic.
It must demonstrate a rigorous understanding of the problem the project addresses.

STRUCTURE:
1. Core Problem — a clear, concise statement of the central problem with at least one robust quantitative indicator where defensible.
2. Causes — at least 4 distinct root and proximate causes. Add citations when a sentence makes an empirical, legal, or comparative claim.
3. Consequences — at least 4 distinct consequences, at least one linking to EU-level policy.

QUALITY:
- Every cause and consequence must have a title AND a detailed description (3–5 sentences).
- Descriptions must include evidence-based arguments with inline citation markers [N] for empirical, legal, or comparative claims.
- Causes must be logically ordered: structural/root causes first, proximate causes second.
- Consequences must show the chain: local → regional → national → EU impact.
- Distinguish clearly between observed facts, analytical interpretation, and projected effects.
- Use calibrated wording: "limits", "constrains", "is associated with" unless strong evidence justifies absolute formulations.
- If exact local data is unavailable, use the nearest defensible proxy and label it explicitly.
- Never conflate legal categories, organisational forms, or population groups.
- Every numerical claim specifies metric/unit, geography, and year or period.

INTERVENTION LOGIC BINDING:
- Every cause listed here MUST be addressable by at least one Activity (WP/Task) in Chapter 5.
- Every consequence listed here MUST connect to at least one Impact in Chapter 6.
- A broken link between causes and activities is a critical failure for EU evaluators.`,

  chapter2_projectIdea: `CHAPTER 2 — PROJECT IDEA

The Project Idea translates the problem analysis into a proposed intervention.

STRUCTURE:
1. Main Aim — ONE comprehensive sentence starting with an infinitive verb.
2. State of the Art — references to at least 3 REAL existing projects/studies.
   MUST explicitly describe synergies and capitalisation: how this project builds on
   past results and avoids duplication of effort.
   Clearly separate: (a) what evidence already shows, (b) what this project adapts or extends,
   (c) what this project still needs to test or validate.
3. Proposed Solution — begins with 5–8 sentence overview paragraph, then phases.
   MUST include an explicit DNSH (Do No Significant Harm) compliance statement:
   confirm that all activities have been screened against the six DNSH environmental
   objectives (climate mitigation, climate adaptation, water and marine resources,
   circular economy, pollution prevention, biodiversity) and no significant negative
   impact has been identified.
   Expected effects framed as plausible contributions, validated pathways, or testable
   assumptions — not as guaranteed outcomes unless strong prior evidence already exists.
4. Readiness Levels — TRL, SRL, ORL, LRL with justifications (numerical level + label + 2–3 sentences).
   Justifications must reflect actual maturity, not aspirational wording.
5. EU Policies — at least 3 relevant EU policies. Each policy MUST be a JSON object with exactly two fields: "name" (full official document name with year) and "description" (3-5 sentences on alignment). No alternative field names.
6. Project Acronym — a short, memorable code (3–12 uppercase characters, optionally with one hyphen) derived from the project title keywords.

TITLE RULES:
- Project title: noun phrase, 30–200 characters, no acronym, no verb.
- Project acronym: 3–12 uppercase characters (optionally with one hyphen), pronounceable or recognisable, placed ONLY in projectAcronym field.

INTERVENTION LOGIC BINDING:
- The Proposed Solution MUST logically respond to ALL causes identified in Chapter 1.
- If a cause exists in the Problem Analysis but the solution does not address it, this is a critical gap.`,

  chapter3_4_objectives: `CHAPTERS 3–4 — OBJECTIVES

General Objectives (3–5):
- Each title uses INFINITIVE VERB: "Strengthen…", "Develop…", "Enhance…"
- Each description: 3–5 sentences linking to broader EU goals.

Specific Objectives (≥5):
- S.M.A.R.T. format: Specific, Measurable, Achievable, Relevant, Time-bound.
- Each title uses INFINITIVE VERB.
- Each must have a measurable KPI indicator.

INTERVENTION LOGIC BINDING:
- Every Specific Objective MUST have a KPI that maps to at least one Output or Outcome in Chapter 6.
- If a Specific Objective has no corresponding measurable result, this is a critical gap.`,

  chapter5_activities: `CHAPTER 5 — ACTIVITIES, MANAGEMENT AND RISKS

SECTION 5A — PROJECT MANAGEMENT (projectManagement):
The projectManagement object has TWO parts:
1. description field — detailed narrative (≥500 words) covering management structure,
   decision-making, quality assurance (including GEPs, AI Act/GDPR compliance where applicable),
   risk management, communication, conflict resolution, data management (referencing the
   mandatory DMP deliverable due by M6). Written as prose paragraphs separated by \\n\\n.
   Each topic gets its own paragraph with a plain-text header on the first line.
   Structure fields contain ONLY short labels for the organigram.
2. structure fields — short role labels (5–8 words max) for organigram chart display.

SECTION 5B — WORK PLAN (activities):
Between 6 and 10 work packages (WPs):
- WP1: foundational/analytical (NOT project management). MUST include a "Capitalisation and
  Synergies" task reviewing and integrating past EU project results.
- WP2 to WP(N-2): content/thematic WPs in logical sequence
- WP(N-1): Dissemination, Communication and Exploitation of Results — spans ENTIRE project
  (M1–final month). MUST strictly separate CDE tasks:
    → Communication tasks (general public, visibility, awareness)
    → Dissemination tasks (peers, experts, target groups, publications, conferences)
    → Exploitation tasks (end users, policymakers, market, adoption, commercialisation)
- WP(N): Project Management and Coordination — spans ENTIRE project (M1–final month)

MANDATORY DELIVERABLE:
- A Data Management Plan (DMP) MUST be scheduled as a deliverable by Month 6 (M6).

Content/thematic WPs are sequential with overlaps — none spans the entire project.
Tasks within each WP are sequential or staggered, not all identical dates.

Each WP: id (WP1, WP2…), title (noun phrase), tasks (2–5 each), milestones (≥1), deliverables (≥1).
Each task: id (T1.1, T1.2…), title, description, startDate, endDate, dependencies.
Each deliverable: id, title (noun phrase), description (2–4 sentences), indicator (specific,
  BINARY, verifiable — Lump Sum compliant).
All task dates in YYYY-MM-DD.

Task dependencies are MANDATORY:
- T1.1 has no dependencies.
- Every other task has ≥1 dependency with predecessorId and type (FS/SS/FF/SF).
- Cross-WP dependencies must exist.

TITLE FORMAT:
- WP, task, milestone, deliverable titles: NOUN PHRASES.
- NOT infinitive verbs.

LUMP SUM COMPLIANCE:
Every Deliverable and Milestone indicator MUST be a BINARY, verifiable proof of
completion. "Report delivered" is NOT acceptable. "1 PDF report (min. 30 pages),
approved by Steering Committee and published on website" IS acceptable.

SECTION 5C — RISK REGISTER (risks):
8–12 risks across categories: technical, social, economic, environmental.
Each: id, category (lowercase), title, description, likelihood, impact, mitigation.
If the project involves digital/AI components, MUST include an "Ethical and Regulatory
Compliance (AI Act/GDPR)" risk with appropriate mitigation.

INTERVENTION LOGIC BINDING:
- Every cause from Problem Analysis (Chapter 1) MUST be addressed by at least one WP or Task.
- If a cause has no corresponding activity, this is a critical gap for evaluators.`,

  chapter6_results: `CHAPTER 6 — EXPECTED RESULTS AND KEY EXPLOITABLE RESULTS

SECTION 6A — OUTPUTS (5–8 direct deliverables)
Title format: result-oriented noun phrase.
Each output MUST be traceable to a specific WP.
Indicators MUST be BINARY and verifiable (Lump Sum compliant).
Clearly state which Target Groups will directly receive/use each output.

SECTION 6B — OUTCOMES (4–6 medium-term changes)
Title format: result-oriented noun phrase.
Clearly distinguish Target Groups from End Users.
Each outcome MUST link to at least one Specific Objective KPI.
Indicators are MEASURABLE change indicators (quantitative target + measurement method).

SECTION 6C — IMPACTS (3–5 long-term strategic changes)
Title format: result-oriented noun phrase.
Must link to EU policy objectives.
MANDATORY: Categorise each impact into a Key Impact Pathway (KIP):
  - Scientific Impact — advancing knowledge, methods, standards
  - Societal Impact — addressing societal challenges, quality of life
  - Economic Impact — innovation, competitiveness, growth, employment
Explicitly state the KIP in each impact description.
Every impact MUST connect back to at least one Consequence from Problem Analysis.
Impact indicators are LONG-TERM measurable indicators (quantitative target + timeframe + data source).

SECTION 6D — KEY EXPLOITABLE RESULTS (4–6 KERs)
Title format: specific asset/product name (noun phrase).
Each KER MUST derive from a concrete Output produced by a specific WP.
Each exploitation strategy MUST address the 3-Pillar Sustainability Strategy:
  1. Financial Sustainability — post-project funding model
  2. Institutional Sustainability — ownership and governance
  3. Political/Regulatory Sustainability — policy integration and endorsement

INDICATOR SEMANTICS BY SECTION TYPE:
- Outputs → BINARY, verifiable proof of completion (Lump Sum): "1 PDF report (min. 30 pages), approved by SC"
- Outcomes → MEASURABLE change: "75% of trained educators report increased confidence (post-training survey, M20)"
- Impacts → LONG-TERM measurable: "5% reduction in early school leaving within 3 years (Eurostat)"
- KERs → exploitation strategy covers 3 pillars; no separate indicator field required.

INTERVENTION LOGIC BINDING:
- KERs originate from Outputs (6A).
- Outputs originate from Activities (Chapter 5).
- Impacts connect back to Consequences (Chapter 1).
- Every Specific Objective KPI is reflected in at least one Output or Outcome indicator.`,

  chapter5b_partners: `CHAPTER 5B — PARTNERSHIP (CONSORTIUM)

The Partnership section defines the consortium composition for the EU project.
AI generates PARTNER TYPES, not specific organisation names.

STRUCTURE:
Each partner entry includes: id, code (CO for coordinator, P2, P3...), name (type description),
expertise (2–4 sentences), pmRate (EUR per person-month), and partnerType (mandatory enum).

CO (P1) is always the Lead Partner / Coordinator.

PARTNER TYPE ENUM (partnerType field — MANDATORY for every partner):
- "faculty" — universities, faculties, academic institutions
- "researchInstitute" — dedicated research centres and institutes
- "sme" — small and medium enterprises
- "publicAgency" — public agencies, regional development agencies
- "internationalAssociation" — international associations, chambers of commerce
- "ministry" — ministries, government bodies
- "ngo" — NGOs, non-profits, civil society organisations
- "largeEnterprise" — large corporations
- "other" — only if none of the above fits

RULES:
- Partner "name" field = ORGANISATION TYPE, e.g., "Research University in Marine Biology"
- NEVER use real organisation names (no "University of Ljubljana", no "Fraunhofer", etc.)
- PM rates must be realistic for the partner type
- Consortium must cover all WP competences
- Include a mix of academia, industry/SME, public sector, and civil society as needed
- Number of partners is determined by project complexity and scope
- partnerType MUST match the partner name description — NEVER leave it empty`
};

// ───────────────────────────────────────────────────────────────
// GLOBAL RULES — ★ v7.0: Added DNSH, TG/EU segmentation, GEPs, gender
// ───────────────────────────────────────────────────────────────

export const GLOBAL_RULES = `
1. All content must be directly relevant to the specific project context.
2. Every factual, contextual, legal, or comparative claim must be evidence-based with verifiable citations. Project design choices do not require citations unless they rely on a named external method or standard.
3. STRICT COMPLIANCE with the Do No Significant Harm (DNSH) principle across all proposed solutions.
4. Clear distinction between Target Groups (engaged during project) and End Users (adopting results post-project).
5. No markdown formatting (**, ##, \`) in any structured content field. Exception: summary mode uses ## headings only.
6. Write like an experienced human EU project consultant.
7. Vary sentence structures and lengths — no AI-pattern repetition.
8. No banned AI phrases (see HUMANIZATION RULES).
9. NEVER use placeholder text like "[Insert verified data: ...]" or any bracket-enclosed instructions. If exact data is unavailable, use the nearest defensible proxy and label it explicitly. If no defensible number is available, rewrite the sentence qualitatively.
10. Dates must be in YYYY-MM-DD format.
11. All content must support the intervention logic chain: Problem → Objectives → Activities → Results.
12. Use precise quantities only when they are defensible. Do NOT invent percentages, counts, or ranges merely to make the text look empirical. If an exact number is unavailable, prefer a narrower qualitative statement over fabricated precision.
13. Content should reflect the gender dimension and inclusivity principles (GEPs) in line with EU standards.
14. Every deliverable and milestone indicator should be BINARY and verifiable (Lump Sum compliant).
15. ZERO EMPTY FIELDS RULE (SUPREME — NO EXCEPTIONS): Every field defined in the JSON schema MUST contain substantive, meaningful content. An empty string (""), a placeholder like "N/A", or a field with only whitespace is a FATAL ERROR that causes the ENTIRE output to be REJECTED. This applies to EVERY field in EVERY section without exception: titles, descriptions, indicators, mitigations, exploitation strategies, justifications, names, dates — ALL fields. If you are unsure what to write for a field, generate your best professional attempt rather than leaving it empty.
`;
// ───────────────────────────────────────────────────────────────
// TEMPERATURE DEFAULTS — ★ v7.2 EO-031
// Documentation only — actual logic is in aiProvider.ts getDefaultTemperature()
// These values control AI creativity vs determinism per task type.
// ───────────────────────────────────────────────────────────────

export const TEMPERATURE_DEFAULTS: Record<string, { temperature: number; rationale: string }> = {
  'chartExtraction':      { temperature: 0.0, rationale: 'Data extraction — must be exact, no creativity' },
  'allocation':           { temperature: 0.1, rationale: 'Budget/hour calculations — near-deterministic' },
  'translation':          { temperature: 0.2, rationale: 'Translation — high accuracy, minimal paraphrasing variance' },
  'chatbot':              { temperature: 0.3, rationale: 'Conversational — natural but focused responses' },
  'summary':              { temperature: 0.3, rationale: 'Condensation — precision over creativity' },
  'field':                { temperature: 0.4, rationale: 'Single field generation — moderate creativity for descriptions' },
  'field_deterministic':  { temperature: 0.0, rationale: 'Likelihood/impact selectors — must pick correct value' },
  'generation':           { temperature: 0.5, rationale: 'Full section generation — balanced creativity and structure' },
  'projectTitleAcronym':  { temperature: 0.7, rationale: 'Title/acronym — needs most creativity for memorable branding' },
  'fallback':             { temperature: 0.4, rationale: 'Default when task type is unknown' },
};

// ───────────────────────────────────────────────────────────────
// FIELD-SPECIFIC RULES — EN only — ★ v7.0: Updated indicator + exploitation
// ───────────────────────────────────────────────────────────────

export const FIELD_RULES: Record<string, Record<string, string>> = {
  title: {
    en: 'Generate a concise, professional title. Follow the title format rules for this section type. Use noun phrases, not infinitive verbs (except for objective titles which use infinitives).'
  },
  description: {
    en: 'Generate a detailed professional description. Minimum 3 substantive sentences. Include evidence and citations where the text makes factual, contextual, legal, or comparative claims. Use inline citation format (Author/Institution, Year) [N], not bare [N] alone. Project design choices do not require citations. No markdown.'
  },
  indicator: {
    en: 'Generate a specific indicator appropriate to the section type. For outputs/deliverables/milestones: BINARY, verifiable (Lump Sum compliant), e.g., "1 PDF report (min. 30 pages), approved by SC by M10". For outcomes: MEASURABLE change indicator with target and method, e.g., "75% of trained educators report increased confidence (survey, M20)". For impacts: LONG-TERM measurable with timeframe and data source, e.g., "5% reduction in early school leaving within 3 years (Eurostat)". For objectives: quantitative KPI with baseline, target, and timeframe.'
  },
  mitigation: {
    en: 'Generate a detailed risk mitigation strategy. 2–4 sentences covering preventive measures, contingency plans, responsible parties, and monitoring triggers.'
  },
  exploitationStrategy: {
    en: 'Generate a detailed exploitation strategy addressing the 3 Pillars of Sustainability: (1) Financial Sustainability — post-project funding model; (2) Institutional Sustainability — ownership and governance; (3) Political/Regulatory Sustainability — policy integration. 3–5 sentences covering all three pillars, plus target market and scaling potential.'
  },
  mainAim: {
    en: 'Generate the project main aim as ONE comprehensive sentence starting with an infinitive verb (e.g., "To establish...", "To develop..."). Must capture the project\'s core purpose.'
  },
  projectTitle: {
    en: 'Generate a project title following the STRICT PROJECT TITLE RULES: noun phrase, 30–200 characters, no acronym, no verb, no generic AI phrases. Must be a project brand.'
  },
  projectAcronym: {
    en: 'Generate a project acronym: 3–12 uppercase characters, optionally with one hyphen, derived from the project title keywords. Must be pronounceable or a recognisable abbreviation. Must NOT be a generic word (e.g., PROJECT, EUROPE). Place ONLY in projectAcronym field, never inside projectTitle.'
  }
};

// ───────────────────────────────────────────────────────────────
// SUMMARY RULES — EN only — ★ v7.0: Added DNSH, KIPs, IL traceability
// ───────────────────────────────────────────────────────────────

export const SUMMARY_RULES: Record<string, string> = {
  en: `
YOU ARE A CONDENSATION ENGINE — NOT A COPY-PASTE ENGINE.
Your job is to DISTILL the project into a SHORT executive summary.
You must RADICALLY SHORTEN every section — capture only the ESSENCE.

TOTAL MAXIMUM: 800 words. If your output exceeds 800 words, it is REJECTED.

MANDATORY STRUCTURE — exactly 5 sections with ## headings:

## 1. Project Overview
MAXIMUM 80 WORDS. Extract: title, acronym, duration, budget, programme/call (only if they exist in the data). Add 1-2 sentences capturing the core idea. Nothing more.

## 2. Problem & Need
MAXIMUM 120 WORDS. State the core problem in 2-3 sentences. Mention only the 2-3 MOST IMPORTANT causes — do NOT list all causes. Do NOT list all consequences. Capture the ESSENCE, not the detail. No bullet points.

## 3. Solution & Approach
MAXIMUM 150 WORDS. Describe the solution concept in 2-3 sentences. Must mention DNSH compliance. List work packages ONLY by name in one sentence (e.g., "The project is structured into 6 work packages covering baseline analysis, agent development, digital twin validation, pilot demonstrations, dissemination, and project management."). Do NOT describe each WP in detail. No bullet points.

## 4. Key Results & Impact
MAXIMUM 200 WORDS. Mention only the 3-4 MOST SIGNIFICANT outputs/deliverables in 1-2 sentences. State 2-3 key measurable outcomes. State 2-3 long-term impacts with their Key Impact Pathways (Scientific/Societal/Economic). Do NOT list every single output, outcome, impact, objective, and KER. RADICALLY SELECT only the most important. No bullet points — write flowing prose.

## 5. EU Added Value & Relevance
MAXIMUM 100 WORDS. Mention EU policy alignment ONLY if the user wrote about it. 2-4 sentences maximum. If no EU relevance content exists in the project, write: "Not yet defined in the project."

STRICT FORMATTING RULES:
- NO bullet points (*, -, •) anywhere in the summary — write ONLY flowing prose paragraphs
- NO bold text (**) anywhere
- NO numbered sub-lists within sections
- Each section is 1-2 short paragraphs of prose, nothing more
- Use ## headings ONLY for the 5 section titles
- Preserve the user's terminology where possible but CONDENSE drastically
- Do NOT copy-paste entire paragraphs from the project — REPHRASE and SHORTEN
- If data for a section does not exist, write: "Not yet defined in the project."
- NEVER add content that is not in the project data
- NO preamble before section 1, NO closing after section 5

INTERVENTION LOGIC IN SUMMARY:
Even within the 800-word limit, the summary MUST reflect the intervention logic chain:
problem → solution → expected results. Do not write the sections as isolated blocks.
The reader must see the golden thread connecting all parts.
`
};

// ───────────────────────────────────────────────────────────────
// TRANSLATION RULES — EN only
// ───────────────────────────────────────────────────────────────

export const TRANSLATION_RULES: Record<string, string[]> = {
  en: [
    'Translate all text values to British English',
    'Keep JSON structure identical — do not add/remove keys',
    'Maintain professional EU project terminology',
    'Keep citation markers in [N] format — do not convert to APA or other styles',
    'Do not translate proper nouns, organization names, or acronyms',
    'Preserve all dates in YYYY-MM-DD format',
    'Translate technical terms accurately with domain-specific vocabulary',
  ]
};

// ───────────────────────────────────────────────────────────────
// TEMPORAL INTEGRITY RULE — EN only
// ───────────────────────────────────────────────────────────────

export const TEMPORAL_INTEGRITY_RULE: Record<string, string> = {
  en: `═══ TEMPORAL INTEGRITY RULE (SUPREME — OVERRIDES ALL OTHER SCHEDULING) ═══

★★★ THIS IS THE #1 MOST IMPORTANT RULE IN THE ENTIRE PROMPT. ★★★
ANY DATE VIOLATION MAKES THE ENTIRE OUTPUT INVALID AND UNUSABLE.

THE IRON LAW:
The Project Management WP (LAST WP) = the MAXIMUM TEMPORAL ENVELOPE.
NOTHING in the entire project may have a date outside this envelope.

PROJECT BOUNDARIES (ABSOLUTE, NON-NEGOTIABLE):
  Start: {{projectStart}}
  End:   {{projectEnd}}
  Duration: {{projectDurationMonths}} months exactly

FORMAL CONSTRAINTS:
1. PM WP (last WP): starts EXACTLY {{projectStart}}, ends EXACTLY {{projectEnd}}.
2. Dissemination WP (second-to-last): starts EXACTLY {{projectStart}}, ends EXACTLY {{projectEnd}}.
   - Dissemination WP MUST NOT extend even 1 day beyond PM WP.
   - Both WPs end on the SAME date: {{projectEnd}}.
3. ALL tasks across ALL WPs: startDate ≥ {{projectStart}} AND endDate ≤ {{projectEnd}}.
4. ALL milestones: date ≥ {{projectStart}} AND date ≤ {{projectEnd}}.
5. Content/technical WPs: each covers only a PHASE, NONE spans the full duration.

COMMON AI MISTAKES — YOU MUST AVOID THESE:
✗ Dissemination WP ending 1–3 months AFTER PM WP → WRONG. They end SAME day.
✗ "Final report" task scheduled after {{projectEnd}} → WRONG. Must be ON or BEFORE.
✗ Exploitation tasks extending beyond project → WRONG. All within envelope.
✗ 28-month schedule for 24-month project → WRONG. Count precisely.
✗ Last task of Dissemination ending later than last task of PM → WRONG. NEVER.

SELF-CHECK (MANDATORY before returning JSON):
For EVERY task: is endDate ≤ {{projectEnd}}? If NO → set it to {{projectEnd}} or earlier.
For EVERY milestone: is date ≤ {{projectEnd}}? If NO → set it to {{projectEnd}} or earlier.
Does PM WP last task end exactly on {{projectEnd}}? Must be YES.
Does Dissemination last task end ≤ {{projectEnd}}? Must be YES.

VIOLATION OF ANY OF THE ABOVE = ENTIRE JSON IS REJECTED.
═══════════════════════════════════════════════════════════════════`
};

// ───────────────────────────────────────────────────────────────
// CONSORTIUM AND PARTNER ALLOCATION RULES — ★ v7.0 NEW (Section 16)
// ───────────────────────────────────────────────────────────────

export const CONSORTIUM_ALLOCATION_RULES = `═══ CONSORTIUM AND PARTNER ALLOCATION RULES ═══

If partner data is available in the project context:
1. Every WP MUST have a designated WP Leader (a specific partner).
2. Every Task SHOULD indicate which partner(s) are responsible.
3. The Project Management WP Leader MUST be the coordinating organisation (CO/P1).
4. Partner allocation should reflect geographic and competence diversity.
5. No single partner should lead more than 40% of WPs (unless justified by scope).

If partner data is NOT available:
- Use plain-text generic references: "Lead Partner", "Partner 2", etc.
- Describe the competence needed in prose, e.g., "a partner with expertise in digital transformation".
═══════════════════════════════════════════════════════════════════`;

// ───────────────────────────────────────────────────────────────
// RESOURCE COHERENCE RULES — ★ v7.0 NEW (Section 17)
// ───────────────────────────────────────────────────────────────

export const RESOURCE_COHERENCE_RULES = `═══ RESOURCE COHERENCE RULES (MANDATORY FOR AI-GENERATED ALLOCATIONS) ═══

These rules are BINDING when generating partner allocations with AI.
They are NOT UI validation rules — they are AI prompt instructions only.

RULE 1 — PROJECT MANAGEMENT WP (LAST WP) — MAXIMUM BUDGET SHARE:
The last WP is ALWAYS Project Management and Coordination.
Its total budget (sum of all partner allocations in that WP) MUST NOT exceed
the percentage below, based on the total project budget:

  Total project budget         | Max % for PM WP
  up to 500,000 EUR            | 15%
  500,001 - 1,000,000 EUR      | 10%
  1,000,001 - 3,000,000 EUR    | 10%
  3,000,001 - 5,000,000 EUR    | 7%
  5,000,001 - 10,000,000 EUR   | 7%
  over 10,000,000 EUR          | 5%

RULE 2 — DISSEMINATION WP (SECOND-TO-LAST WP) — BUDGET SHARE:
The second-to-last WP is ALWAYS Dissemination, Communication and Exploitation.
Its total budget should be approximately 15% of the total project budget.
This applies to ALL project sizes.

RULE 3 — CONTENT/THEMATIC WPs — REMAINING BUDGET:
The remaining budget (after PM WP and Dissemination WP) is distributed across
content/thematic WPs proportionally to their scope, complexity, and duration.
No single content WP should exceed 30% of total budget unless justified.

RULE 4 — PERSON-MONTHS COHERENCE:
Person-months per WP should be proportional to its scope and duration.
1 PM = 143 hours (EU standard).

RULE 5 — LUMP SUM COMPLIANCE:
If budget is specified, deliverables and activities must be achievable within
the allocated resources and strictly tied to 100% completion verified by
binary indicators.

HOW TO APPLY:
1. First, estimate the total project budget from all partner allocations.
2. Calculate the PM WP budget ceiling using the table in Rule 1.
3. Allocate approximately 15% to the Dissemination WP.
4. Distribute the rest across content/thematic WPs.
5. Adjust partner hours and costs to stay within these limits.
═══════════════════════════════════════════════════════════════════`;

// ───────────────────────────────────────────────────────────────
// OPENROUTER SYSTEM PROMPT — ★ v7.0: Added JSON edge-case rules
// ───────────────────────────────────────────────────────────────

export const OPENROUTER_SYSTEM_PROMPT = `You are a professional EU project proposal writing assistant with deep expertise in EU funding programmes (Horizon Europe, Interreg, Erasmus+, LIFE, Digital Europe, etc.).

RESPONSE FORMAT RULES:
1. You MUST respond with valid JSON only.
2. No markdown, no code fences, no explanations — just the raw JSON object or array.
3. Do NOT wrap your response in \`\`\`json ... \`\`\` or any other formatting.
4. The JSON must be parseable by JSON.parse() without any preprocessing.
5. All string values must be properly escaped (no unescaped newlines, quotes, or backslashes).
6. Follow the exact schema/structure specified in the user prompt.

JSON INTEGRITY RULES:
- All string values containing line breaks MUST use \\n
- Quotation marks inside strings MUST be escaped as \\"
- Do NOT use trailing commas in arrays or objects
- Do NOT use single quotes — JSON requires double quotes only
- Empty arrays [] are preferred over null`;
// ───────────────────────────────────────────────────────────────
// REFERENCES REQUIREMENT — ★ v7.8 EO-070
// Appended to EVERY section-generation instruction so AI returns
// structured references alongside content.
// ───────────────────────────────────────────────────────────────

export const REFERENCES_REQUIREMENT = `
═══ REFERENCES REQUIREMENT (MANDATORY FOR EVERY SECTION) ═══

In addition to the section content, you MUST include a "_references" array as a SIBLING key in your JSON response.
For EVERY numbered inline citation marker you use in the generated text, create a corresponding entry in _references.

★ EO-159 BUG 10 — REFERENCE FORMAT — CRITICAL RULES:
1. In TEXT BODY: write APA in-text citation followed by prefixed marker:
   (Author, Year) [XX-N]
   Example: "...significant results (Smith, 2024) [PA-1] and confirmed by (WHO, 2023) [PA-2]."
2. In JSON _references array: inlineMarker MUST be ONLY the bracketed marker: "[PA-1]"
   NEVER put the APA citation "(Author, Year)" inside inlineMarker.
   NEVER use bare numbers "[1]" — ALWAYS use the chapter prefix format "[PA-1]", "[SO-2]", etc.
3. Prefix must match the section being generated:
   PA = problemAnalysis, PI = projectIdea, GO = generalObjectives, SO = specificObjectives,
   AC = activities, PM = projectManagement, RI = risks, ER = outputs/outcomes/impacts, KE = kers
4. Numbers are sequential within each prefix group: [PA-1], [PA-2], [PA-3]...
5. NEVER generate URLs containing: example.com, example.org, fictional-, placeholder, genericjournal
6. NEVER generate DOIs with prefixes: 10.1000, 10.9999, 10.0000, 10.1234, 10.5555 (these are placeholders)

SEARCH-FIRST APPROACH: Before including ANY citation, verify it exists. If web search is available, use it to confirm the publication is real and find the URL.

Each "_references" entry MUST be an object with ALL these fields populated with REAL, VERIFIED data:
  - "inlineMarker": string — ONLY the bracketed marker, e.g. "[PA-1]", "[SO-2]". NEVER "(Author, Year)" here.
  - "authors": string — full author names, e.g. "Jambeck, J. R., Geyer, R., Wilcox, C." or "European Commission"
  - "year": number or string — publication year, e.g. 2023
  - "title": string — the REAL, VERIFIED title of the publication. NEVER "Unknown", NEVER empty, NEVER a placeholder.
  - "source": string — the REAL journal name, institutional publisher, or database. NEVER "Unknown", NEVER empty.
  - "url": string — a VERIFIED URL only. Use ONLY URLs from: (a) web search results, (b) [VERIFIED_URL] tags in the context, or (c) DOI-based URLs (https://doi.org/<DOI>). If you do NOT have a verified URL, set this to an EMPTY STRING "". An INVENTED URL is a FATAL ERROR. An empty URL is acceptable.
  - "doi": string — the DOI if available, otherwise empty string
  - "sectionKey": string — the section key where this citation appears (e.g. "problemAnalysis", "stateOfTheArt")

URL PROVENANCE POLICY:
- URLs tagged [VERIFIED_URL: <url>] in the prompt context are TRUSTED — they come from real-time web search.
- ALWAYS prefer verified URLs from the context over URLs from your training data.
- If a DOI is known, construct the URL as https://doi.org/<DOI> — this is always trustworthy.
- If NO verified URL is available for a citation, set url to "" (empty string). This is acceptable.
- NEVER invent or guess a URL. A plausible-looking but fake URL (e.g., made up from domain patterns) is a FATAL ERROR.

STRICT RULES:
- QUALITY OVER QUANTITY: 1–3 verified citations per paragraph is better than 5 unverifiable ones.
- Include ALL citation markers used in the generated text — missing any is a FATAL ERROR.
- Every marker [XX-N] in the text MUST have a corresponding _references entry with a real title and real source.
- Do NOT fabricate references that do not exist. Only include citations you are confident are real.
- NEVER use placeholder text: "Title not available", "Unknown source", "URL not available", "details pending", "please fill manually", "AI did not generate this field" — ALL are FORBIDDEN.
- If you cannot verify a citation, DO NOT include it in the text or in _references.
- If you used the same source for multiple claims, give it ONE marker number and reuse that same marker.
- If web search is available, USE IT to find real URLs for every citation.
- If no citations were used (rare), return "_references": [].

Example _references entry (note inlineMarker is ONLY the bracket — NO APA text):
{
  "inlineMarker": "[PA-1]",
  "authors": "Jambeck, J. R., Geyer, R., Wilcox, C.",
  "year": 2015,
  "title": "Plastic waste inputs from land into the ocean",
  "source": "Science",
  "url": "https://doi.org/10.1126/science.1260352",
  "doi": "10.1126/science.1260352",
  "sectionKey": "problemAnalysis"
}

APPROVED SOURCE POOL (EO-084):
When an APPROVED SOURCE POOL section appears above in this prompt, you are in RETRIEVAL-ONLY mode:
- You MUST cite ONLY from the provided pool. Copy authors, title, year, source, url, and doi EXACTLY.
- Each _references entry MUST correspond to a source in the pool. Non-pool citations are a FATAL ERROR.
- If the pool lacks a source for a claim, omit the claim or state the limitation without a citation.
- Pool sources have been pre-verified via CrossRef and OpenAlex — trust their metadata.

POST-GENERATION VERIFICATION (EO-083):
After you generate content, ALL URLs in your _references will be AUTOMATICALLY VERIFIED by a real server-side process:
- Each URL is checked via HTTP HEAD/GET requests (follows redirects, detects 404s and broken links).
- Each DOI is resolved via doi.org and cross-checked against CrossRef API metadata.
- If CrossRef metadata matches your title/authors, the reference is marked as "metadata confirmed".
- Invented or broken URLs will be detected and flagged to the user as "broken" or "not-found".
- ONLY include URLs you are confident are real. An empty URL ("") is ALWAYS better than a fabricated one.
═══════════════════════════════════════════════════════════════════
`;

// ───────────────────────────────────────────────────────────────
// URL PROVENANCE POLICY — ★ v8.0 EO-080
// Constant used by aiProvider.ts to tag verified URLs and by
// geminiService.ts to detect them in post-processing.
// ───────────────────────────────────────────────────────────────

export const VERIFIED_URL_TAG_PREFIX = '[VERIFIED_URL: ';
export const VERIFIED_URL_TAG_SUFFIX = ']';

export const COLLECT_REFERENCES_INSTRUCTION = `You are an academic reference verification assistant. You MUST use web search for EVERY citation.

TASK: Analyse the full project text below and:
1. Identify ALL inline citation markers [N] (numbered markers in square brackets).
2. For EACH citation marker found, USE WEB SEARCH to verify the referenced source exists and find the real URL.
3. Create a structured reference entry ONLY for citations you can verify.
4. Citations you CANNOT verify go into "unverifiedClaims" (maximum 5 items).

SEARCH-FIRST RULE: Do NOT guess or infer publication details. SEARCH for each citation first, then populate the fields from the search results.

OUTPUT FORMAT — strict JSON only, no markdown, no explanation:
{
  "references": [
    {
      "inlineMarker": "[1]",
      "authors": "Full author names from search results — NEVER 'Unknown'",
      "year": 2023,
      "title": "Exact title from search results — NEVER guessed, NEVER empty",
      "source": "Real journal or publisher from search results — NEVER 'Unknown'",
      "url": "Real URL found via search. For DOI: https://doi.org/<DOI>. If not found, use empty string — NEVER invent a URL.",
      "doi": "DOI if found via search, otherwise empty string",
      "sectionKey": "section where citation appears",
      "verified": true
    }
  ],
  "unverifiedClaims": [
    {
      "marker": "[N]",
      "sectionKey": "problemAnalysis",
      "reason": "Web search found no matching publication"
    }
  ]
}

STRICT RULES:
- USE WEB SEARCH for every citation marker before including it in "references".
- Every reference MUST have a real, non-empty title and source. URL should be real if found, or empty string if not verified — NEVER invent a URL.
- For Eurostat: construct URL like https://ec.europa.eu/eurostat/databrowser/view/<dataset>/default/table
- For European Commission: use https://data.europa.eu/ or official EC publication links.
- For journals with DOI: construct https://doi.org/<DOI>.
- If web search cannot verify a citation, put it in "unverifiedClaims" — do NOT guess.
- Keep unverifiedClaims to a maximum of 5 items.
- Return valid JSON only, no markdown wrapping, no explanation before or after the JSON.
- NEVER use placeholder text: "Unknown", "Not available", "details pending", "AI did not generate this field" — ALL FORBIDDEN.
- NEVER invent URLs. A fabricated URL is worse than no URL at all.
`;

// ═══════════════════════════════════════════════════════════════════
// EXPORTED ACCESSOR FUNCTIONS
// ═══════════════════════════════════════════════════════════════════
// These are the ONLY way other files should access rules from this file.
// Every function checks for global overrides first (via globalInstructionsService).
// Language parameter is accepted for API compatibility but IGNORED for content
// (always returns .en) — EXCEPT getLanguageDirective() which respects language.
// ═══════════════════════════════════════════════════════════════════

/**
 * Returns the language directive for the given language.
 * ★ THIS IS THE ONLY FUNCTION THAT RESPECTS THE LANGUAGE PARAMETER ★
 * 'en' → write in English directive, 'si' → write in Slovenian directive.
 */
export function getLanguageDirective(language: string): string {
  const override = getGlobalOverrideSync('languageDirective');
  if (override) return override;
  return LANGUAGE_DIRECTIVES[language] || LANGUAGE_DIRECTIVES['en'];
}

/**
 * Returns the Intervention Logic Framework context.
 * Injected into EVERY prompt as foundational context.
 */
export function getInterventionLogicFramework(): string {
  const override = getGlobalOverrideSync('interventionLogicFramework');
  if (override) return override;
  return INTERVENTION_LOGIC_FRAMEWORK;
}

/**
 * Returns academic rigor rules. Always returns .en.
 */
export function getAcademicRigorRules(_language?: string): string {
  const override = getGlobalOverrideSync('academicRigorRules');
  if (override) return override;
  return ACADEMIC_RIGOR_RULES.en;
}

/**
 * Returns humanization rules. Always returns .en.
 */
export function getHumanizationRules(_language?: string): string {
  const override = getGlobalOverrideSync('humanizationRules');
  if (override) return override;
  return HUMANIZATION_RULES.en;
}

/**
 * Returns project title rules. Always returns .en.
 */
export function getProjectTitleRules(_language?: string): string {
  const override = getGlobalOverrideSync('projectTitleRules');
  if (override) return override;
  return PROJECT_TITLE_RULES.en;
}

/**
 * Returns mode instructions for the given mode (fill/enhance/regenerate).
 * Always returns .en variant.
 */
export function getModeInstruction(mode: string, _language?: string): string {
  const override = getGlobalOverrideSync(`modeInstruction_${mode}`);
  if (override) return override;
  const modeObj = MODE_INSTRUCTIONS[mode];
  if (!modeObj) return MODE_INSTRUCTIONS['regenerate'].en;
  return modeObj.en;
}

/**
 * Returns quality gates for a given section key.
 * Falls back to _default if no section-specific gates exist.
 * Always returns .en variant.
 */
export function getQualityGates(sectionKey: string, _language?: string): string[] {
  const override = getGlobalOverrideSync(`qualityGates_${sectionKey}`);
  if (override) {
    try {
      return JSON.parse(override);
    } catch {
      return [override];
    }
  }
  const gates = QUALITY_GATES[sectionKey] || QUALITY_GATES['_default'];
  return gates.en || QUALITY_GATES['_default'].en;
}

/**
 * Returns the Cross-Chapter Consistency Gate.
 * Used for final validation across all chapters.
 */
export function getCrossChapterGates(): string[] {
  const override = getGlobalOverrideSync('qualityGates_crossChapter');
  if (override) {
    try {
      return JSON.parse(override);
    } catch {
      return [override];
    }
  }
  return QUALITY_GATES['_crossChapter']?.en || [];
}

/**
 * Returns task instructions for a given section key.
 * Always returns .en variant.
 */
export function getTaskInstruction(sectionKey: string, _language?: string): string {
  const override = getGlobalOverrideSync(`taskInstruction_${sectionKey}`);
  if (override) return override;
  const instruction = SECTION_TASK_INSTRUCTIONS[sectionKey];
  if (!instruction) return '';
  return instruction.en;
}

/**
 * Returns chapter rules for a given chapter key.
 * Chapter keys: chapter1_problemAnalysis, chapter2_projectIdea,
 * chapter3_4_objectives, chapter5_activities, chapter6_results,
 * chapter5b_partners
 */
export function getChapterRules(chapterKey: string, _language?: string): string {
  const override = getGlobalOverrideSync(`chapter_${chapterKey}`);
  if (override) return override;
  return CHAPTERS[chapterKey] || '';
}

/**
 * Returns rules for a specific section by mapping section keys to chapter keys.
 * This is the main function used by geminiService.ts to get chapter-level rules.
 */
export function getRulesForSection(sectionKey: string, _language?: string): string {
  const SECTION_TO_CHAPTER: Record<string, string> = {
    problemAnalysis: 'chapter1_problemAnalysis',
    projectIdea: 'chapter2_projectIdea',
    generalObjectives: 'chapter3_4_objectives',
    specificObjectives: 'chapter3_4_objectives',
    projectManagement: 'chapter5_activities',
    activities: 'chapter5_activities',
    outputs: 'chapter6_results',
    outcomes: 'chapter6_results',
    impacts: 'chapter6_results',
    risks: 'chapter5_activities',
    kers: 'chapter6_results',
    partners: 'chapter5b_partners',
  };

  const chapterKey = SECTION_TO_CHAPTER[sectionKey];
  if (!chapterKey) return '';
  return getChapterRules(chapterKey, _language);
}

/**
 * Returns global rules string.
 */
export function getGlobalRules(): string {
  const override = getGlobalOverrideSync('globalRules');
  if (override) return override;
  return GLOBAL_RULES;
}

/**
 * Returns field-specific rules for a given field key.
 * Always returns .en variant.
 */
export function getFieldRules(fieldKey: string, _language?: string): string {
  const override = getGlobalOverrideSync(`fieldRules_${fieldKey}`);
  if (override) return override;
  const rules = FIELD_RULES[fieldKey];
  if (!rules) return '';
  return rules.en;
}

/**
 * Returns summary rules. Always returns .en.
 */
export function getSummaryRules(_language?: string): string {
  const override = getGlobalOverrideSync('summaryRules');
  if (override) return override;
  return SUMMARY_RULES.en;
}

/**
 * Returns translation rules. Always returns .en.
 */
export function getTranslationRules(_language?: string): string[] {
  const override = getGlobalOverrideSync('translationRules');
  if (override) {
    try {
      return JSON.parse(override);
    } catch {
      return [override];
    }
  }
  return TRANSLATION_RULES.en;
}

/**
 * Returns temporal integrity rule with date placeholders.
 * Always returns .en.
 */
export function getTemporalIntegrityRule(_language?: string): string {
  const override = getGlobalOverrideSync('temporalIntegrityRule');
  if (override) return override;
  return TEMPORAL_INTEGRITY_RULE.en;
}

/**
 * Returns the language mismatch template.
 */
export function getLanguageMismatchTemplate(): string {
  const override = getGlobalOverrideSync('languageMismatchTemplate');
  if (override) return override;
  return LANGUAGE_MISMATCH_TEMPLATE;
}

/**
 * Returns consortium allocation rules.
 */
export function getConsortiumAllocationRules(): string {
  const override = getGlobalOverrideSync('consortiumAllocationRules');
  if (override) return override;
  return CONSORTIUM_ALLOCATION_RULES;
}

/**
 * Returns resource coherence rules.
 */
export function getResourceCoherenceRules(): string {
  const override = getGlobalOverrideSync('resourceCoherenceRules');
  if (override) return override;
  return RESOURCE_COHERENCE_RULES;
}

/**
 * Returns the OpenRouter system prompt.
 */
export function getOpenRouterSystemPrompt(): string {
  const override = getGlobalOverrideSync('openRouterSystemPrompt');
  if (override) return override;
  return OPENROUTER_SYSTEM_PROMPT;
}

/**
 * Returns the references requirement block to append to section instructions.
 * ★ v7.8 EO-070
 */
export function getReferencesRequirement(): string {
  return REFERENCES_REQUIREMENT;
}

/**
 * Returns the approved source pool rules block.
 * ★ v8.3 EO-084
 */
export const APPROVED_SOURCE_POOL_RULES = `
═══ APPROVED SOURCE POOL CONSTRAINT (EO-084) ═══
When an APPROVED SOURCE POOL is injected into this prompt:
1. You are in RETRIEVAL-ONLY citation mode — cite ONLY from the provided pool.
2. Copy authors, title, year, source, url, and doi EXACTLY from pool entries.
3. Each _references entry MUST correspond to a pool source. Non-pool citations = FATAL ERROR.
4. If the pool does not cover a claim, omit the claim or state "no approved source available".
5. You MAY reuse pool sources across multiple claims (same [N] marker).
6. Pool sources were pre-verified via CrossRef and OpenAlex — trust their metadata.
7. If NO pool is provided, fall back to the search-first citation policy.
═══════════════════════════════════════════════════════════════════
`;

export function getApprovedSourcePoolRules(): string {
  return APPROVED_SOURCE_POOL_RULES;
}

/**
 * Returns the instruction for AI-based reference collection and verification.
 * ★ v7.8 EO-070
 */
export function getCollectReferencesInstruction(): string {
  return COLLECT_REFERENCES_INSTRUCTION;
}

/**
 * Builds a complete prompt context block for a given section.
 * This is a convenience function that assembles all relevant rules
 * for a section into a single string. Used internally by geminiService.ts.
 *
 * @param sectionKey - The section being generated
 * @param language - The target language ('en' or 'si')
 * @param mode - The generation mode ('fill', 'enhance', 'regenerate')
 * @param options - Additional context (projectStart, projectEnd, projectDurationMonths, userInput, titleContext)
 * @returns Complete assembled prompt context string
 */
export function buildFullPromptContext(
  sectionKey: string,
  language: string,
  mode: string,
  options?: {
    projectStart?: string;
    projectEnd?: string;
    projectDurationMonths?: number;
    userInput?: string;
    titleContext?: string;
  }
): {
  interventionLogic: string;
  languageDirective: string;
  globalRules: string;
  academicRules: string;
  humanRules: string;
  chapterRules: string;
  taskInstruction: string;
  modeInstruction: string;
  qualityGates: string[];
  temporalRule: string;
  consortiumRules: string;
  resourceRules: string;
  titleRules: string;
} {
  // Get all rule components
  let taskInstr = getTaskInstruction(sectionKey, language);
  let temporalRule = getTemporalIntegrityRule(language);

  // Replace placeholders in task instruction
  if (options?.userInput) {
    taskInstr = taskInstr.replace('{{userInput}}', options.userInput);
  }
  if (options?.titleContext) {
    taskInstr = taskInstr.replace('{{titleContext}}', options.titleContext);
  }
  if (options?.projectStart) {
    taskInstr = taskInstr.replaceAll('{{projectStart}}', options.projectStart);
    temporalRule = temporalRule.replaceAll('{{projectStart}}', options.projectStart);
  }
  if (options?.projectEnd) {
    taskInstr = taskInstr.replaceAll('{{projectEnd}}', options.projectEnd);
    temporalRule = temporalRule.replaceAll('{{projectEnd}}', options.projectEnd);
  }
  if (options?.projectDurationMonths !== undefined) {
    const months = String(options.projectDurationMonths);
    taskInstr = taskInstr.replaceAll('{{projectDurationMonths}}', months);
    temporalRule = temporalRule.replaceAll('{{projectDurationMonths}}', months);
  }

  return {
    interventionLogic: getInterventionLogicFramework(),
    languageDirective: getLanguageDirective(language),
    globalRules: getGlobalRules(),
    academicRules: getAcademicRigorRules(language),
    humanRules: getHumanizationRules(language),
    chapterRules: getRulesForSection(sectionKey, language),
    taskInstruction: taskInstr,
    modeInstruction: getModeInstruction(mode, language),
    qualityGates: getQualityGates(sectionKey, language),
    temporalRule: temporalRule,
    consortiumRules: getConsortiumAllocationRules(),
    resourceRules: getResourceCoherenceRules(),
    titleRules: (sectionKey === 'projectIdea') ? getProjectTitleRules(language) : '',
  };
}
// ═══════════════════════════════════════════════════════════════════
// UTILITY EXPORTS — Type-safe section key lists and validation
// ═══════════════════════════════════════════════════════════════════

/**
 * All valid section keys that have task instructions defined.
 * Used by geminiService.ts to validate incoming section keys.
 */
export const VALID_SECTION_KEYS = [
  'problemAnalysis',
  'projectIdea',
  'generalObjectives',
  'specificObjectives',
  'projectManagement',
  'activities',
  'outputs',
  'outcomes',
  'impacts',
  'risks',
  'kers',
  'partners',
] as const;

export type ValidSectionKey = typeof VALID_SECTION_KEYS[number];

/**
 * Checks whether a given string is a valid section key.
 */
export function isValidSectionKey(key: string): key is ValidSectionKey {
  return VALID_SECTION_KEYS.includes(key as ValidSectionKey);
}

/**
 * Maps section keys to their corresponding chapter keys.
 * Exported for use in geminiService.ts and other services.
 */
export const SECTION_TO_CHAPTER_MAP: Record<string, string> = {
  problemAnalysis: 'chapter1_problemAnalysis',
  projectIdea: 'chapter2_projectIdea',
  generalObjectives: 'chapter3_4_objectives',
  specificObjectives: 'chapter3_4_objectives',
  projectManagement: 'chapter5_activities',
  activities: 'chapter5_activities',
  outputs: 'chapter6_results',
  outcomes: 'chapter6_results',
  impacts: 'chapter6_results',
  risks: 'chapter5_activities',
  kers: 'chapter6_results',
  partners: 'chapter5b_partners',
};

/**
 * All valid chapter keys.
 */
export const VALID_CHAPTER_KEYS = [
  'chapter1_problemAnalysis',
  'chapter2_projectIdea',
  'chapter3_4_objectives',
  'chapter5_activities',
  'chapter6_results',
  'chapter5b_partners',
] as const;

export type ValidChapterKey = typeof VALID_CHAPTER_KEYS[number];

/**
 * All valid partner type values — mirrored from types.ts for instruction-level validation.
 */
export const VALID_PARTNER_TYPES = [
  'faculty',
  'researchInstitute',
  'sme',
  'publicAgency',
  'internationalAssociation',
  'ministry',
  'ngo',
  'largeEnterprise',
  'other',
] as const;

export type InstructionPartnerType = typeof VALID_PARTNER_TYPES[number];

/**
 * Validates that a partner type string is a valid enum value.
 * Used in post-processing to ensure AI-generated partnerType is valid.
 */
export function isValidPartnerType(type: string): type is InstructionPartnerType {
  return VALID_PARTNER_TYPES.includes(type as InstructionPartnerType);
}

/**
 * Returns all available rule keys for the Admin Panel override system.
 * Each key corresponds to a getGlobalOverrideSync() lookup.
 */
export function getAvailableOverrideKeys(): string[] {
  return [
    'languageDirective',
    'interventionLogicFramework',
    'academicRigorRules',
    'humanizationRules',
    'projectTitleRules',
    'modeInstruction_fill',
    'modeInstruction_enhance',
    'modeInstruction_regenerate',
    'globalRules',
    'summaryRules',
    'translationRules',
    'temporalIntegrityRule',
    'languageMismatchTemplate',
    'consortiumAllocationRules',
    'resourceCoherenceRules',
    'openRouterSystemPrompt',
    // Per-section quality gates
    ...VALID_SECTION_KEYS.map(k => `qualityGates_${k}`),
    'qualityGates_crossChapter',
    // Per-section task instructions
    ...VALID_SECTION_KEYS.map(k => `taskInstruction_${k}`),
    // Per-chapter rules
    ...VALID_CHAPTER_KEYS.map(k => `chapter_${k}`),
    // Per-field rules
    'fieldRules_title',
    'fieldRules_description',
    'fieldRules_indicator',
    'fieldRules_mitigation',
    'fieldRules_exploitationStrategy',
    'fieldRules_mainAim',
    'fieldRules_projectTitle',
    'fieldRules_projectAcronym',
  ];
}
// ═══════════════════════════════════════════════════════════════════
// BACKWARD COMPATIBILITY — exports required by AdminPanel.tsx
// ═══════════════════════════════════════════════════════════════════

/** Labels for chapter keys — used in AdminPanel Instructions editor */
export const CHAPTER_LABELS: Record<string, string> = {
  chapter1_problemAnalysis: 'Chapter 1 — Problem Analysis',
  chapter2_projectIdea: 'Chapter 2 — Project Idea',
  chapter3_4_objectives: 'Chapters 3–4 — Objectives',
  chapter5_activities: 'Chapter 5 — Activities, Management & Risks',
  chapter6_results: 'Chapter 6 — Expected Results & KERs',
  chapter5b_partners: 'Chapter 5B — Partnership (Consortium)',
};

/** Labels for field rule keys — used in AdminPanel Instructions editor */
export const FIELD_RULE_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  indicator: 'Indicator',
  mitigation: 'Mitigation Strategy',
  exploitationStrategy: 'Exploitation Strategy',
  mainAim: 'Main Aim',
  projectTitle: 'Project Title',
  projectAcronym: 'Project Acronym',
};

/** Get full instructions object — used by AdminPanel to display all rules */
export function getFullInstructions(): any {
  return {
    GLOBAL_RULES,
    LANGUAGE_DIRECTIVES,
    LANGUAGE_MISMATCH_TEMPLATE,
    ACADEMIC_RIGOR_RULES,
    HUMANIZATION_RULES,
    PROJECT_TITLE_RULES,
    MODE_INSTRUCTIONS,
    QUALITY_GATES,
    SECTION_TASK_INSTRUCTIONS,
    CHAPTERS,
    FIELD_RULES,
    SUMMARY_RULES,
    TRANSLATION_RULES,
    TEMPORAL_INTEGRITY_RULE,
    INTERVENTION_LOGIC_FRAMEWORK,
    CONSORTIUM_ALLOCATION_RULES,
    RESOURCE_COHERENCE_RULES,
    OPENROUTER_SYSTEM_PROMPT,
  };
}

/** Get default instructions — used by AdminPanel for reset */
export function getDefaultInstructions(): any {
  return getFullInstructions();
}

/** Save app instructions — stores overrides via globalInstructionsService */
export async function saveAppInstructions(instructions: any): Promise<void> {
  // AdminPanel saves via its own admin.saveGlobalInstructions() path
  // This is a no-op placeholder for backward compatibility
  console.log('[Instructions] saveAppInstructions called — AdminPanel handles saving via useAdmin hook');
}

/** Reset app instructions — returns defaults */
export async function resetAppInstructions(): Promise<any> {
  console.log('[Instructions] resetAppInstructions called — returning defaults');
  return getDefaultInstructions();
}

// ═══════════════════════════════════════════════════════════════════
// QA VALIDATION CHECKLIST — euro-office.net
// ═══════════════════════════════════════════════════════════════════
// This checklist is used for automated and manual QA of AI-generated
// project proposal content. Each validation has a severity level.
// FATAL = output is rejected; WARNING = flagged for manual review.
// ═══════════════════════════════════════════════════════════════════

export const QA_VALIDATION_CHECKLIST = {
  structural: {
    description: 'Structural integrity checks',
    severity: 'FATAL',
    checks: [
      'Every field defined in the JSON schema is present and non-empty',
      'All dates are in YYYY-MM-DD format',
      'All task startDate >= projectStart and endDate <= projectEnd',
      'All milestone dates are within project boundaries',
      'WP ordering follows mandatory pattern: WP1 foundational, WP(N-1) dissemination, WP(N) management',
      'PM WP and Dissemination WP span the entire project duration',
      'No content/thematic WP spans the entire project',
      'Every task except T1.1 has at least one dependency',
      'Dependency predecessorIds reference valid existing tasks',
    ],
  },
  antiPlaceholder: {
    description: 'No bracketed placeholders or system-generated stubs',
    severity: 'FATAL',
    checks: [
      'No "[Insert ...]" or "[Add ...]" or "[TBD]" or "[TODO]" strings in any field',
      'No "N/A" or "Not applicable" as sole field content',
      'No "[Assign partner: ...]" patterns',
      'No visible system notes such as "Generated without real-time web access"',
    ],
  },
  overClaim: {
    description: 'Claim calibration and overclaim detection',
    severity: 'WARNING',
    checks: [
      'No absolute causal wording ("prevents", "is the primary barrier", "proves") unless strongly justified',
      'Projections and forecasts are explicitly labelled as such',
      'Expected effects are framed as plausible contributions, not guaranteed outcomes',
      'Pilot estimates and scenario results are framed as context-specific, not universal',
    ],
  },
  numericClaim: {
    description: 'Numerical claim integrity',
    severity: 'WARNING',
    checks: [
      'Every numerical claim specifies metric/unit, geography, and year or period',
      'Percentages include the denominator, baseline, or comparator where necessary',
      'No invented statistics or fabricated precision',
      'If exact local data unavailable, the proxy is labelled explicitly',
    ],
  },
  citation: {
    description: 'Citation quality and density',
    severity: 'WARNING',
    checks: [
      'Citations use short inline attribution + numbered marker format, e.g. (Author/Institution, Year) [N], matching the _references array',
      'Citation density is 1–3 per claim cluster, not artificially inflated',
      'Cited sources plausibly exist (no invented author names, project names, or legal acts)',
      'Source type matches claim type (statistical claim → statistical source)',
      'Project design choices are not forced to have citations',
    ],
  },
  terminology: {
    description: 'Terminology and category discipline',
    severity: 'WARNING',
    checks: [
      'Legal categories are not conflated (e.g., Energy Community vs. Renewable Energy Community)',
      'Target Groups, End Users, Beneficiaries, and Partners are clearly distinguished',
      'EU technical terms are used consistently when they have formal meaning',
    ],
  },
  indicator: {
    description: 'Indicator semantics by section type',
    severity: 'FATAL',
    checks: [
      'Output indicators are BINARY and verifiable (Lump Sum compliant)',
      'Outcome indicators are MEASURABLE change indicators with target and measurement method',
      'Impact indicators are LONG-TERM measurable with timeframe and data source',
      'Objective KPIs follow S.M.A.R.T. format with quantitative target, baseline, and timeframe',
      'KER exploitation strategies cover all 3 sustainability pillars',
      'No indicator field is empty',
    ],
  },
  markdown: {
    description: 'No markdown in structured fields',
    severity: 'FATAL',
    checks: [
      'No **, ##, or ` characters in structured content fields',
      'Exception: summary mode uses ## headings only for the 5 section titles',
      'No bullet points (*, -, •) in non-summary fields',
    ],
  },
  bannedPhrase: {
    description: 'No banned AI fingerprint phrases',
    severity: 'WARNING',
    checks: [
      'None of the phrases from HUMANIZATION_RULES banned list appear as generic filler',
      'Legitimate EU technical terms (synergies, capitalisation, DNSH, interoperability) are allowed when semantically correct',
    ],
  },
  crossChapter: {
    description: 'Cross-chapter consistency (intervention logic binding)',
    severity: 'WARNING',
    checks: [
      'Every cause in Problem Analysis is addressed by at least one WP or Task',
      'Every specific objective KPI maps to at least one Output or Outcome',
      'Every impact links to at least one Consequence from Problem Analysis',
      'KERs originate from identifiable Outputs',
      'Proposed Solution responds to all major causes in Chapter 1',
      'Terminology is consistent across chapters',
      'Partner expertise covers all WP competence requirements',
    ],
  },
  stateOfTheArt: {
    description: 'State of the Art quality',
    severity: 'WARNING',
    checks: [
      'At least 3 real existing projects, studies, or institutional initiatives referenced',
      'Capitalisation on past results is explicitly described',
      'Duplication avoidance is explicitly addressed',
      'Clear separation between existing evidence, project adaptation, and new testing',
    ],
  },
  dnsh: {
    description: 'DNSH compliance',
    severity: 'WARNING',
    checks: [
      'Proposed Solution includes explicit DNSH compliance statement',
      'All six DNSH environmental objectives are referenced in the screening',
    ],
  },
  acronym: {
    description: 'Project acronym compliance',
    severity: 'FATAL',
    checks: [
      'Acronym is 3–12 uppercase characters, optionally with one hyphen',
      'Acronym is derived from project title keywords',
      'Acronym is not a generic word (PROJECT, EUROPE, DIGITAL)',
      'Acronym appears ONLY in projectAcronym field, never inside projectTitle',
    ],
  },
  severityMatrix: {
    FATAL: 'Output is REJECTED — must be fixed before acceptance',
    WARNING: 'Output is FLAGGED — review recommended but not blocking',
  },
};

// ═══════════════════════════════════════════════════════════════════
// TYPESCRIPT VALIDATOR SKELETON — example for automated QA
// ═══════════════════════════════════════════════════════════════════

/**
 * Minimal TypeScript validator skeleton for euro-office.net QA.
 * This is an illustrative example — extend as needed for production.
 *
 * @param text - The text block to validate
 * @param sectionType - The section type for context-aware validation
 * @returns Array of validation findings with severity and message
 */
export function validateTextBlock(
  text: string,
  sectionType?: string
): Array<{ severity: 'FATAL' | 'WARNING'; rule: string; message: string }> {
  const findings: Array<{ severity: 'FATAL' | 'WARNING'; rule: string; message: string }> = [];

  // FATAL: Empty or placeholder content
  if (!text || text.trim().length === 0) {
    findings.push({ severity: 'FATAL', rule: 'antiPlaceholder', message: 'Field is empty or whitespace-only' });
  }
  if (/\[Insert\s/i.test(text) || /\[TBD\]/i.test(text) || /\[TODO\]/i.test(text)) {
    findings.push({ severity: 'FATAL', rule: 'antiPlaceholder', message: 'Contains bracketed placeholder text' });
  }
  if (text.trim() === 'N/A' || text.trim() === 'Not applicable') {
    findings.push({ severity: 'FATAL', rule: 'antiPlaceholder', message: 'Field contains only "N/A" or "Not applicable"' });
  }

  // FATAL: Markdown in structured fields (except summary)
  if (sectionType !== 'summary') {
    if (/\*\*[^*]+\*\*/.test(text)) {
      findings.push({ severity: 'FATAL', rule: 'markdown', message: 'Contains bold markdown (**...**)' });
    }
    if (/^##\s/m.test(text)) {
      findings.push({ severity: 'FATAL', rule: 'markdown', message: 'Contains heading markdown (##)' });
    }
  }

  // WARNING: Banned AI phrases
  const bannedPatterns = [
    /in today'?s rapidly evolving/i,
    /it is important to note that/i,
    /plays a (crucial|pivotal|key) role/i,
    /comprehensive\/holistic\/multifaceted approach/i,
    /paving the way for/i,
    /serves as a catalyst/i,
    /the landscape of/i,
    /cannot be overstated/i,
    /in an era of/i,
    /game-?changer/i,
    /paradigm shift/i,
    /bridge the gap/i,
    /unlock the potential/i,
  ];
  for (const pattern of bannedPatterns) {
    if (pattern.test(text)) {
      findings.push({ severity: 'WARNING', rule: 'bannedPhrase', message: `Contains banned AI phrase matching: ${pattern.source}` });
    }
  }

  // WARNING: Overclaim detection
  const overclaimPatterns = [
    /\bprevents\b(?!.*(?:evidence|demonstrated|proven))/i,
    /\bis the primary barrier\b/i,
    /\bproves conclusively\b/i,
  ];
  for (const pattern of overclaimPatterns) {
    if (pattern.test(text)) {
      findings.push({ severity: 'WARNING', rule: 'overClaim', message: `Possible overclaim: ${pattern.source}` });
    }
  }

  // FATAL: Date format validation
  const dateMatches = text.match(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g);
  if (dateMatches) {
    for (const d of dateMatches) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        findings.push({ severity: 'FATAL', rule: 'structural', message: `Date not in YYYY-MM-DD format: ${d}` });
      }
    }
  }
  // WARNING: Bare numeric citation markers without short author/institution + year attribution
  const bareCitationPattern = /(^|[\s(,.;:])\[\d+\](?=[\s).,;:]|$)/g;
  const hasBareMarker = bareCitationPattern.test(text);
  const hasAuthorYearStyle = /\(([A-Z][^)]+?,\s?\d{4})\)\s?\[\d+\]/.test(text);

  if (hasBareMarker && !hasAuthorYearStyle) {
    findings.push({
      severity: 'WARNING',
      rule: 'citation',
      message: 'Bare numeric citation marker detected without author/institution + year attribution',
    });
  }
  return findings;
}

// ═══════════════════════════════════════════════════════════════════
// EO-130: Citation without numbered references (for References OFF mode)
// ═══════════════════════════════════════════════════════════════════

export const CITATION_WITHOUT_REFERENCES = `
═══ CITATION MODE: INLINE ONLY (no reference list) ═══
Include inline citations as (Author/Institution, Year) in the text where
you reference external knowledge, research, or established facts.
Example: "...as demonstrated in recent studies (Smith et al., 2024)."
Example: "...aligned with EU policy goals (European Commission, 2023)."

RULES:
- Do NOT add numbered reference markers like [1], [2], [3] etc.
- Do NOT include a _references array in your JSON response.
- Keep citations factual, verifiable, and relevant.
- Every empirical, comparative, or legal claim MUST have an inline citation.
- Format: (Author/Institution, Year) — no brackets, no numbers.
═══════════════════════════════════════════════════════════════════
`;

export function getCitationWithoutReferences(): string {
  return CITATION_WITHOUT_REFERENCES;
}

/**
 * EO-130: Default references-enabled settings per section.
 * true = full references with [N] markers (academic sections)
 * false = inline (Author, Year) only — no [N] markers, no reference list
 */
export const DEFAULT_REFS_ENABLED: Record<string, boolean> = {
  // EO-130c: CHAPTER-LEVEL keys only — sub-sections inherit via getChapterForSection()
  problemAnalysis: true,
  projectIdea: true,
  generalObjectives: true,
  specificObjectives: true,
  activities: false,
  expectedResults: true,
};

// ═══════════════════════════════════════════════════════════════════
// END OF Instructions.ts v8.8
// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════

