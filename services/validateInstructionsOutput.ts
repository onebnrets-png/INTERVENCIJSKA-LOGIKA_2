/* eslint-disable no-control-regex */
// validateInstructionsOutput.ts v1.5 — EO-154 (2026-03-24)
// v1.5 — 2026-03-24 — EO-154: Extended looksBinaryIndicator + looksChangeIndicator with Slovenian/Croatian/Serbian equivalents for format, verification, horizon, method terms. Validator now correctly recognises multilingual indicators.
// validateInstructionsOutput.ts v1.4 — EO-070 (2026-03-10)
// CHANGES v1.4:
//   - NEW: 'reference-url-check' rule (MEDIUM) — flags references with empty URLs
//   - NEW: 'reference-completeness' rule (LOW→MEDIUM) — flags references missing title or authors
//   - NEW: '_references' added to ignored fields list (not validated as section content)
// CHANGES v1.3:
//   - FIX: hasMarkdown() regex was too aggressive — now only matches actual
//     markdown headings (## at start of line), bold (**...**), inline code
//     (`...`), and bullet lists (- or * at start of line). No longer triggers
//     on normal text like "risk - high" or "Phase #2".
//   - FIX: isMetaField() expanded with 'name', 'slug', 'key', 'level', 'status'
//     to prevent label/title fields from triggering markdown/AI-fingerprint checks.
//   - FIX: Short label fields (name, title, label < 200 chars) skip markdown check.
//   - NEW: getDisplaySeverity() for friendly UI labels with mentoring tone.
//   - NEW: summariseValidation() now shows quality score instead of raw counts.
// CHANGES v1.2:
//   - FIX: Indicator fields (outputs, outcomes, impacts, objectives) no longer
//     trigger 'numeric-claim-no-citation' — these are project TARGET metrics,
//     not empirical claims requiring literature citations.
//   - FIX: Sections generalObjectives, specificObjectives, risks, kers,
//     projectManagement excluded from numeric-claim-no-citation entirely.
//   - FIX: indicator, mitigation, exploitationStrategy added to isDesignField.
// CHANGES v1.1:
//   - FIX: policies/proposedSolution/readinessLevels fields no longer trigger
//     'numeric-claim-no-citation' for target years (2030, 2050) and design numbers
//     (phases, months, regions). Only empirical units (%, EUR, MW, tonnes) trigger HIGH.
//   - FIX: Expanded capitalisation/duplication regex to catch AI synonyms:
//     build upon, draws upon/on/from, reuses, integrates results/findings,
//     leverages results/findings, informed by, complementary to, advances beyond, etc.

export type Severity = 'FATAL' | 'HIGH' | 'MEDIUM';
export type KnownSectionKey =
  | 'problemAnalysis'
  | 'projectIdea'
  | 'generalObjectives'
  | 'specificObjectives'
  | 'projectManagement'
  | 'activities'
  | 'outputs'
  | 'outcomes'
  | 'impacts'
  | 'risks'
  | 'kers'
  | 'partners'
  | 'summary';

export interface ValidationIssue {
  severity: Severity;
  code: string;
  section: string;
  fieldPath?: string;
  message: string;
  suggestion?: string;
}

export interface ValidationReport {
  valid: boolean;
  fatalCount: number;
  highCount: number;
  mediumCount: number;
  issues: ValidationIssue[];
}

export interface ValidationContext {
  language?: 'en' | 'si';
  mode?: 'structured' | 'summary';
  projectStart?: string;
  projectEnd?: string;
  projectDurationMonths?: number;
  strictSemanticMapping?: boolean;
}

type JsonRecord = Record<string, unknown>;

const KNOWN_SECTION_KEYS: KnownSectionKey[] = [
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
  'summary',
];

const GENERIC_WORD_BLACKLIST = new Set([
  'PROJECT',
  'EUROPE',
  'DIGITAL',
  'GREEN',
  'SMART',
  'INNOVATION',
]);

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'through', 'across',
  'will', 'have', 'has', 'had', 'are', 'was', 'were', 'been', 'being', 'than',
  'then', 'their', 'there', 'which', 'while', 'where', 'what', 'when', 'whose',
  'about', 'above', 'below', 'over', 'under', 'between', 'among', 'towards',
  'could', 'should', 'would', 'might', 'must', 'can', 'may', 'also', 'more',
  'most', 'some', 'such', 'very', 'into', 'onto', 'within', 'without', 'each',
  'every', 'other', 'than', 'them', 'they', 'those', 'these', 'local', 'regional',
  'national', 'european', 'project', 'projects', 'results', 'result', 'approach',
  'system', 'systems', 'development', 'implementation', 'support', 'solution',
  'solutions', 'activities', 'activity', 'analysis', 'management', 'coordination'
]);

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\[(Insert|Assign|Add|Verify|Source|Citation|Project|Data|To do|TODO).*?\]/i,
  /<\s*(insert|assign|add|verify|source|citation|project|data).*?>/i,
  /\bTBD\b/i,
  /\bXXX\b/,
];

const BANNED_AI_PATTERNS: RegExp[] = [
  /In today's rapidly evolving/i,
  /It is important to note/i,
  /plays a crucial role/i,
  /plays a pivotal role/i,
  /plays a key role/i,
  /holistic approach/i,
  /comprehensive approach/i,
  /multifaceted approach/i,
  /cutting-edge/i,
  /game-changer/i,
  /paradigm shift/i,
  /unlock the potential/i,
  /bridge the gap/i,
  /fill the gap/i,
  /\bempower\b/i,
];

const STRONG_CLAIM_PATTERN =
  /\b(prevents|proves|primary barrier|fundamental barrier|critical barrier|demonstrates conclusively|guarantees|without exception)\b/i;

const CITATION_PATTERN =
  /\(([A-Z][A-Za-zÀ-ÖØ-öø-ÿ.'&\- ]+),\s?(19|20)\d{2}\)/g;

const APA_CITATION_LIKE_PATTERN =
  /\(([A-Z][A-Za-zÀ-ÖØ-öø-ÿ.'&\- ]+(?:\s(?:&|et al\.)\s[A-Z][A-Za-zÀ-ÖØ-öø-ÿ.'&\- ]+)?|[A-Z][A-Za-zÀ-ÖØ-öø-ÿ.'&\- ]+),\s?(19|20)\d{2}\)/g;

const NUMBER_PATTERN =
  /\b\d{1,3}(?:[.,]\d+)?(?:\s?(?:%|EUR|€|MW|GW|kWh|MWh|TWh|kg|tonnes|tons|km|m2|m³|years|months|days|participants|partners|regions|schools|enterprises|users))?\b/g;

const YEAR_PATTERN = /\b(19|20)\d{2}\b/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ACRONYM_PATTERN = /^[A-Z]{3,12}(?:-[A-Z]{2,12})?$/;

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toPath(path: Array<string | number>): string {
  return path.map(String).join('.');
}

function createReport(issues: ValidationIssue[]): ValidationReport {
  const fatalCount = issues.filter(i => i.severity === 'FATAL').length;
  const highCount = issues.filter(i => i.severity === 'HIGH').length;
  const mediumCount = issues.filter(i => i.severity === 'MEDIUM').length;
  return {
    valid: fatalCount === 0,
    fatalCount,
    highCount,
    mediumCount,
    issues,
  };
}

function pushIssue(
  issues: ValidationIssue[],
  severity: Severity,
  code: string,
  section: string,
  message: string,
  fieldPath?: string,
  suggestion?: string
): void {
  issues.push({ severity, code, section, fieldPath, message, suggestion });
}

function parseISODate(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const check = date.toISOString().slice(0, 10);
  return check === value ? date : null;
}

function compareDates(a: string, b: string): number {
  const da = parseISODate(a);
  const db = parseISODate(b);
  if (!da || !db) return 0;
  return da.getTime() - db.getTime();
}

function addMonths(dateString: string, months: number): string | null {
  const date = parseISODate(dateString);
  if (!date) return null;
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);
}

function countCitations(text: string): number {
  return (text.match(APA_CITATION_LIKE_PATTERN) || []).length;
}

function hasCitation(text: string): boolean {
  return APA_CITATION_LIKE_PATTERN.test(text);
}

function hasMarkdown(text: string): boolean {
  // ## heading: only at start of line (with optional leading whitespace)
  if (/(?:^|\n)\s*#{1,6}\s+\S/m.test(text)) return true;
  // **bold**: must have ** on both sides of content
  if (/\*\*[^*]+\*\*/m.test(text)) return true;
  // `code`: inline code backticks with content inside
  if (/`[^`]+`/m.test(text)) return true;
  // bullet list: - or * at start of line followed by space and content
  if (/(?:^|\n)\s*[-*]\s+\S/m.test(text)) return true;
  return false;
}

function isMetaField(fieldName: string): boolean {
  return [
    'id',
    'code',
    'type',
    'category',
    'likelihood',
    'impact',
    'startDate',
    'endDate',
    'date',
    'predecessorId',
    'partnerType',
    'name',
    'slug',
    'key',
    'level',
    'status',
    '_references',
    'inlineMarker',
    'addedBy',
    'accessedDate',
    'sectionKey',
    'fieldKey',
    'verified',
  ].includes(fieldName);
}

function isNarrativeField(fieldName: string): boolean {
  return [
    'description',
    'coreProblem',
    'stateOfTheArt',
    'proposedSolution',
    'mainAim',
    'title',
    'indicator',
    'mitigation',
    'exploitationStrategy',
  ].includes(fieldName);
}

function looksBinaryIndicator(text: string): boolean {
  const hasQuantity = /\b\d+\b/.test(text);

  const hasFormat = /\b(PDF|report|handbook|toolkit|platform|dashboard|website|manual|dataset|guideline|protocol|video|workshop|training|pilot|deliverable|document|study|analysis|framework|strategy|plan|model|system|module|course|curriculum|application|portal|database|catalogue|inventory|map|atlas|index|register|publication|article|paper|chapter|book|journal|magazine|newsletter|brochure|flyer|poster|infographic|presentation|webinar|seminar|conference|event|meeting|session|programme|scheme|network|cluster|hub|centre|center|office|unit|lab|observatory|agency|institute|forum|council|board|committee|panel|group|team|task.?force|working.?group|action.?plan|road.?map|white.?paper|green.?paper|policy.?brief|best.?practice|case.?study|benchmark|standard|specification|certification|accreditation|licence|license|patent|trademark|copyright|award|prize|grant|subsidy|dokument|priročnik|platforma|spletna.?stran|orodje|nabor.?podatkov|smernice|protokol|delavnica|usposabljanje|pilotni|izdelek|poročilo|zbornik|kurikulum|učbenik|aplikacija|portal|baza.?podatkov|katalog|letak|infografika|predstavitev|seminar|konferenca|dogodek|program|mreža|študija|analiza|strategija|načrt|model|sistem|modul|tečaj|izobraževanje|metodologija|okvir|gradivo|material|brošura|plakat|zemljevid|indeks|register|publikacija|članek|knjiga|revija|glasilo|certifikat|akreditacija|licenca|standard|specifikacija|ocena|evalvacija|pregled|revizija|nadzor|spremljanje|poizvedba)\b/i.test(text);

  const hasVerification = /\b(approved|verified|published|peer.?reviewed|reviewed|accessible|validated|signed|adopted|confirmed|endorsed|certified|accredited|licensed|registered|completed|delivered|submitted|accepted|launched|operational|functional|tested|piloted|evaluated|assessed|audited|inspected|monitored|documented|archived|disseminated|distributed|available|online|uploaded|downloaded|printed|issued|released|circulated|odobren|preverjen|objavljen|recenziran|dostopen|validiran|podpisan|sprejet|potrjen|potrdi|odobritev|validacija|verificiran|recenzija|certificiran|akreditiran|licenciran|registriran|zaključen|dostavljen|oddan|zagnan|operativen|funkcionalen|testiran|pilotiran|ovrednoten|ocenjen|revidiran|pregledan|nadzorovan|dokumentiran|arhiviran|razširjen|distribuiran|na.?voljo|naložen|natisnjen|izdan|razposlano)\b/i.test(text);

  return hasQuantity && hasFormat && hasVerification;
}

function looksChangeIndicator(text: string): boolean {
  const hasTarget = /\b\d+\s*%|\b\d+\b/.test(text);

  const hasHorizon = /\b(by\s+\d{4}|within\s+\d+\s+(year|month)|after\s+\d+\s+(year|month)|end\s+of\s+project|post.?project|mid.?term|final|long.?term|short.?term|medium.?term|annual|yearly|monthly|quarterly|weekly|daily|bi.?annual|do\s+\d{4}|v\s+roku\s+\d+|po\s+\d+\s+(let|mesec)|ob\s+koncu\s+projekta|po\s+projektu|vmesn|končn|dolgoročn|kratkoročn|srednjeročn|letn|mese[čc]n|četrtletn|tedensko|dnevno|polletn)\b/i.test(text);

  const hasMethod = /\b(survey|questionnaire|interview|focus.?group|observation|test|exam|assessment|evaluation|monitoring|tracking|report|register|database|log|record|measurement|statistic|census|sample|baseline|comparison|control.?group|pre.?post|longitudinal|cross.?sectional|meta.?analysis|systematic.?review|case.?study|benchmark|index|indicator|metric|KPI|rate|ratio|proportion|percentage|score|grade|rank|level|scale|anketa|vprašalnik|intervju|fokusna.?skupina|opazovanje|test|preizkus|ocenjevanje|evalvacija|spremljanje|sledenje|poročilo|register|baza.?podatkov|evidenca|zapis|meritev|statistika|popis|vzorec|izhodiščn|primerjava|kontrolna.?skupina|pred.?po|vzdolžn|prečn|meta.?analiza|sistematičen.?pregled|študija.?primera|referenčna.?vrednost|kazalnik|kazalec|merilo|KPI|stopnja|razmerje|delež|odstotek|ocena|lestvica)\b/i.test(text);

  return hasTarget && hasHorizon && hasMethod;
}

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9À-ÖØ-öø-ÿ\s-]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

function keywordOverlapScore(a: string, b: string): number {
  const setA = new Set(extractKeywords(a));
  const setB = new Set(extractKeywords(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  return intersection;
}

function getArrayCandidate(obj: unknown, keys: string[]): unknown[] {
  if (Array.isArray(obj)) return obj;
  if (!isRecord(obj)) return [];
  for (const key of keys) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function getStringCandidate(obj: unknown, paths: string[][]): string | null {
  if (!isRecord(obj)) return null;
  for (const path of paths) {
    let current: unknown = obj;
    let valid = true;
    for (const segment of path) {
      if (!isRecord(current) || !(segment in current)) {
        valid = false;
        break;
      }
      current = current[segment];
    }
    if (valid && typeof current === 'string' && current.trim()) {
      return current.trim();
    }
  }
  return null;
}

function walkObject(
  value: unknown,
  visitor: (value: unknown, path: Array<string | number>) => void,
  path: Array<string | number> = []
): void {
  visitor(value, path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkObject(item, visitor, [...path, index]));
    return;
  }
  if (isRecord(value)) {
    Object.entries(value).forEach(([key, val]) => walkObject(val, visitor, [...path, key]));
  }
}

function validateGenericStrings(
  section: string,
  data: unknown,
  ctx: ValidationContext,
  issues: ValidationIssue[]
): void {
  const summaryMode = ctx.mode === 'summary' || section === 'summary';

  walkObject(data, (value, path) => {
    if (typeof value !== 'string') return;

    const fieldPath = toPath(path);
    const fieldName = String(path[path.length - 1] ?? '');

    if (!value.trim()) {
      pushIssue(
        issues,
        'FATAL',
        'empty-field',
        section,
        'Empty string detected in required output field.',
        fieldPath,
        'Generate substantive content instead of an empty value.'
      );
      return;
    }

    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(value)) {
        pushIssue(
          issues,
          'FATAL',
          'placeholder-detected',
          section,
          'Placeholder or drafting note detected.',
          fieldPath,
          'Remove bracketed drafting instructions and replace them with final content.'
        );
        break;
      }
    }

    // ★ v1.3 EO-061: Skip markdown check for short label fields (names, titles)
    const isShortLabelField = value.length < 200 && ['name', 'title', 'label', 'projectTitle', 'projectAcronym'].includes(fieldName);
    if (!summaryMode && !isMetaField(fieldName) && !isShortLabelField && hasMarkdown(value)) {
      pushIssue(
        issues,
        'FATAL',
        'markdown-forbidden',
        section,
        'Markdown formatting detected in a structured content field.',
        fieldPath,
        'Remove **, ##, bullets, and code formatting from structured fields.'
      );
    }

    if (summaryMode && /(^|\s)\*\*|`|(^|\n)\s*[-*]\s/m.test(value)) {
      pushIssue(
        issues,
        'HIGH',
        'summary-markdown-misuse',
        section,
        'Summary mode should only use ## headings and plain prose.',
        fieldPath,
        'Use only the 5 required ## section headings and prose paragraphs.'
      );
    }

    if (!isMetaField(fieldName)) {
      for (const pattern of BANNED_AI_PATTERNS) {
        if (pattern.test(value)) {
          pushIssue(
            issues,
            'MEDIUM',
            'ai-fingerprint',
            section,
            `Banned AI-style phrase detected: ${pattern}`,
            fieldPath,
            'Rewrite in a more direct and concrete consultant style.'
          );
        }
      }
    }

    if (isNarrativeField(fieldName)) {
      if (STRONG_CLAIM_PATTERN.test(value) && !hasCitation(value)) {
        pushIssue(
          issues,
          'HIGH',
          'overclaim-without-support',
          section,
          'Strong claim wording detected without nearby citation support.',
          fieldPath,
          'Use calibrated wording such as "limits", "constrains", or add robust evidence.'
        );
      }

      const hasNumber = NUMBER_PATTERN.test(value);
      const hasYear = YEAR_PATTERN.test(value);
      const citationCount = countCitations(value);

      // ★ EO-057: numeric-claim-no-citation only applies to sections where
      // empirical data from external sources is expected (problemAnalysis,
      // projectIdea, partners, summary). Sections containing project DESIGN
      // targets (objectives, activities, outputs, outcomes, impacts, risks,
      // kers, projectManagement) are excluded — their numbers are project
      // goals, not literature claims.
      if (
        hasNumber &&
        !summaryMode &&
        section !== 'activities' &&
        section !== 'outputs' &&
        section !== 'outcomes' &&
        section !== 'impacts' &&
        section !== 'generalObjectives' &&
        section !== 'specificObjectives' &&
        section !== 'risks' &&
        section !== 'kers' &&
        section !== 'projectManagement' &&
        citationCount === 0
      ) {
        // ★ EO-051+057: Design fields use softer check — only empirical
        // units (%, EUR, MW, tonnes etc.) trigger HIGH, not target years
        // or design numbers (phases, months, regions).
        // ★ EO-057: indicator, mitigation, exploitationStrategy added.
        const isDesignField =
          fieldName === 'proposedSolution' ||
          fieldName === 'indicator' ||
          fieldName === 'mitigation' ||
          fieldName === 'exploitationStrategy' ||
          fieldPath.startsWith('policies') ||
          fieldPath.startsWith('readinessLevels');
        const hasOnlyTargetYearsOrDesignNumbers =
          isDesignField &&
          !(/\b\d{1,3}(?:[.,]\d+)?\s?(?:%|EUR|€|MW|GW|kWh|MWh|TWh|kg|tonnes|tons|km|m2|m³|billion|million|trillion)\b/i.test(value));

        if (!hasOnlyTargetYearsOrDesignNumbers) {
          pushIssue(
            issues,
            'HIGH',
            'numeric-claim-no-citation',
            section,
            'A numerical claim appears without citation support.',
            fieldPath,
            'Add a source or rewrite the statement qualitatively.'
          );
        }
      }

      if (
        hasNumber &&
        !summaryMode &&
        section === 'problemAnalysis' &&
        !hasYear
      ) {
        pushIssue(
          issues,
          'HIGH',
          'numeric-claim-no-year',
          section,
          'A numerical claim in problem analysis appears without a visible year or period.',
          fieldPath,
          'Specify the year or time period for the metric.'
        );
      }

      const sentences = splitSentences(value);
      if (
        ['description', 'stateOfTheArt', 'proposedSolution', 'mitigation', 'exploitationStrategy'].includes(fieldName) &&
        sentences.length < 2
      ) {
        pushIssue(
          issues,
          'MEDIUM',
          'too-short-narrative',
          section,
          'Narrative field appears too short for the expected level of substance.',
          fieldPath,
          'Expand to at least 2–3 substantive sentences.'
        );
      }
    }
  });
}

function validateDatesRecursive(
  section: string,
  data: unknown,
  ctx: ValidationContext,
  issues: ValidationIssue[]
): void {
  walkObject(data, (value, path) => {
    if (typeof value !== 'string') return;
    const fieldName = String(path[path.length - 1] ?? '');
    const fieldPath = toPath(path);

    if (['startDate', 'endDate', 'date', 'dueDate'].includes(fieldName)) {
      if (!DATE_PATTERN.test(value) || !parseISODate(value)) {
        pushIssue(
          issues,
          'FATAL',
          'invalid-date-format',
          section,
          'Invalid date format detected. Expected YYYY-MM-DD.',
          fieldPath,
          'Use a valid ISO date in YYYY-MM-DD format.'
        );
        return;
      }

      if (ctx.projectStart && compareDates(value, ctx.projectStart) < 0) {
        pushIssue(
          issues,
          'FATAL',
          'date-before-project-start',
          section,
          'Date is earlier than the project start date.',
          fieldPath,
          `Move the date to ${ctx.projectStart} or later.`
        );
      }

      if (ctx.projectEnd && compareDates(value, ctx.projectEnd) > 0) {
        pushIssue(
          issues,
          'FATAL',
          'date-after-project-end',
          section,
          'Date is later than the project end date.',
          fieldPath,
          `Move the date to ${ctx.projectEnd} or earlier.`
        );
      }
    }
  });
}

function validateProblemAnalysis(sectionData: unknown, issues: ValidationIssue[]): void {
  const section = 'problemAnalysis';
  const causes = getArrayCandidate(sectionData, ['causes']);
  const consequences = getArrayCandidate(sectionData, ['consequences']);
  const coreProblemText =
    getStringCandidate(sectionData, [
      ['coreProblem', 'description'],
      ['coreProblem'],
      ['description'],
    ]) || '';

  if (!coreProblemText) {
    pushIssue(
      issues,
      'FATAL',
      'missing-core-problem',
      section,
      'Core problem statement is missing.',
      'problemAnalysis.coreProblem',
      'Provide a clear core problem statement.'
    );
  } else {
    if (!NUMBER_PATTERN.test(coreProblemText)) {
      pushIssue(
        issues,
        'HIGH',
        'core-problem-no-quant',
        section,
        'Core problem statement lacks a visible quantitative indicator.',
        'problemAnalysis.coreProblem',
        'Add one robust quantitative indicator where defensible.'
      );
    }
  }

  if (causes.length < 4) {
    pushIssue(
      issues,
      'HIGH',
      'too-few-causes',
      section,
      'Fewer than 4 causes are listed.',
      'problemAnalysis.causes',
      'Provide at least 4 distinct causes.'
    );
  }

  if (consequences.length < 4) {
    pushIssue(
      issues,
      'HIGH',
      'too-few-consequences',
      section,
      'Fewer than 4 consequences are listed.',
      'problemAnalysis.consequences',
      'Provide at least 4 distinct consequences.'
    );
  }

  const possibleConflationPatterns = [
    /\bEnergy Communities\b.*\brenewable energy cooperatives\b/i,
    /\benergy citizens\b.*\bEnergy Communities\b/i,
    /\bTarget Groups\b.*\bEnd Users\b/i,
  ];

  walkObject(sectionData, (value, path) => {
    if (typeof value !== 'string') return;
    const fieldPath = toPath(path);
    for (const pattern of possibleConflationPatterns) {
      if (pattern.test(value)) {
        pushIssue(
          issues,
          'HIGH',
          'potential-term-conflation',
          section,
          'Potential terminology conflation detected.',
          fieldPath,
          'Define the terms separately and avoid using them interchangeably unless equivalence is justified.'
        );
      }
    }
  });
}

function validateProjectIdea(sectionData: unknown, issues: ValidationIssue[]): void {
  const section = 'projectIdea';

  const title = getStringCandidate(sectionData, [['projectTitle'], ['title']]) || '';
  const acronym = getStringCandidate(sectionData, [['projectAcronym'], ['acronym']]) || '';
  const stateOfTheArt = getStringCandidate(sectionData, [['stateOfTheArt']]) || '';
  var _proposedSolutionRaw = isRecord(sectionData) ? (sectionData as any).proposedSolution : undefined;
  var proposedSolution = '';
  if (typeof _proposedSolutionRaw === 'string') {
    proposedSolution = _proposedSolutionRaw;
  } else if (_proposedSolutionRaw && typeof _proposedSolutionRaw === 'object') {
    proposedSolution = JSON.stringify(_proposedSolutionRaw);
  }

  const mainAim = getStringCandidate(sectionData, [['mainAim']]) || '';

  if (title) {
    if (title.length < 30 || title.length > 200) {
      pushIssue(
        issues,
        'HIGH',
        'project-title-length',
        section,
        'Project title length is outside the expected 30–200 character range.',
        'projectIdea.projectTitle',
        'Shorten or expand the title to stay within range.'
      );
    }

    if (/\b(The project|We|This project will)\b/i.test(title) || /[.!?]$/.test(title)) {
      pushIssue(
        issues,
        'HIGH',
        'project-title-sentence-like',
        section,
        'Project title looks like a sentence rather than a noun phrase.',
        'projectIdea.projectTitle',
        'Rewrite as a concise noun phrase.'
      );
    }

    if (/[A-Z]{3,12}(?:-[A-Z]{2,12})?\s*[-–]/.test(title)) {
      pushIssue(
        issues,
        'HIGH',
        'project-title-contains-acronym',
        section,
        'Project title appears to contain an acronym.',
        'projectIdea.projectTitle',
        'Remove the acronym from the title field.'
      );
    }
  } else {
    pushIssue(
      issues,
      'FATAL',
      'missing-project-title',
      section,
      'Project title is missing.',
      'projectIdea.projectTitle'
    );
  }

  if (acronym) {
    if (!ACRONYM_PATTERN.test(acronym)) {
      pushIssue(
        issues,
        'FATAL',
        'invalid-acronym-format',
        section,
        'Project acronym format is invalid.',
        'projectIdea.projectAcronym',
        'Use 3–12 uppercase characters, optionally with one hyphen.'
      );
    }

    if (GENERIC_WORD_BLACKLIST.has(acronym)) {
      pushIssue(
        issues,
        'HIGH',
        'generic-acronym',
        section,
        'Project acronym is too generic.',
        'projectIdea.projectAcronym',
        'Use a more distinctive acronym derived from the title.'
      );
    }
  } else {
    pushIssue(
      issues,
      'FATAL',
      'missing-project-acronym',
      section,
      'Project acronym is missing.',
      'projectIdea.projectAcronym'
    );
  }

  if (!stateOfTheArt) {
    pushIssue(
      issues,
      'FATAL',
      'missing-state-of-the-art',
      section,
      'State of the Art section is missing.',
      'projectIdea.stateOfTheArt'
    );
  } else {
    if (countCitations(stateOfTheArt) < 3) {
      pushIssue(
        issues,
        'HIGH',
        'weak-state-of-the-art-grounding',
        section,
        'State of the Art contains fewer than 3 visible reference-style citations.',
        'projectIdea.stateOfTheArt',
        'Add at least 3 real and relevant projects, studies, or institutional references.'
      );
    }

    if (!/\b(capitalis\w*|capitaliz\w*|builds? on|build upon|building upon|draws? upon|draws? on|draws? from|extends?\b|adapts?\b|reuses?|re-uses?|integrates? results|integrates? findings|leverages? results|leverages? findings|informed by|avoids? duplication|duplication will be avoided|avoiding duplication|without duplicating|complementary to|complements? existing|advances? beyond)\b/i.test(stateOfTheArt)) {
      pushIssue(
        issues,
        'HIGH',
        'missing-capitalisation-logic',
        section,
        'State of the Art does not clearly explain capitalisation or duplication avoidance.',
        'projectIdea.stateOfTheArt',
        'Explain what prior work is reused, adapted, or extended.'
      );
    }
  }

  if (!proposedSolution) {
    pushIssue(
      issues,
      'FATAL',
      'missing-proposed-solution',
      section,
      'Proposed Solution is missing.',
      'projectIdea.proposedSolution'
    );
  } else {
    if (!/\b(DNSH|Do No Significant Harm)\b/i.test(proposedSolution)) {
      pushIssue(
        issues,
        'HIGH',
        'missing-dnsh-statement',
        section,
        'Proposed Solution does not contain an explicit DNSH statement.',
        'projectIdea.proposedSolution',
        'Add a clear DNSH compliance statement.'
      );
    }

    const introSentences = splitSentences(splitParagraphs(proposedSolution)[0] || '');
    if (introSentences.length < 5) {
      pushIssue(
        issues,
        'HIGH',
        'short-solution-intro',
        section,
        'Proposed Solution should begin with a fuller introductory paragraph.',
        'projectIdea.proposedSolution',
        'Expand the opening paragraph to roughly 5–8 sentences before phases.'
      );
    }

    if (/\bguarantees\b|\bwill definitively\b|\bproves\b/i.test(proposedSolution)) {
      pushIssue(
        issues,
        'HIGH',
        'solution-overclaim',
        section,
        'Proposed Solution contains wording that overstates certainty.',
        'projectIdea.proposedSolution',
        'Frame expected effects as plausible contributions, validated pathways, or testable assumptions.'
      );
    }
  }

  if (!mainAim) {
    pushIssue(
      issues,
      'HIGH',
      'missing-main-aim',
      section,
      'Main Aim is missing.',
      'projectIdea.mainAim'
    );
  } else if (!/^(To\s+[A-Z]?[a-z]+|Develop|Strengthen|Enhance|Improve|Establish|Create|Support|Increase|Reduce)\b/.test(mainAim)) {
    pushIssue(
      issues,
      'MEDIUM',
      'main-aim-format',
      section,
      'Main Aim may not start with an infinitive/base verb form.',
      'projectIdea.mainAim',
      'Start with "To ..." or a clear base verb formulation.'
    );
  }
}
function extractWorkPackages(sectionData: unknown): JsonRecord[] {
  const arr = getArrayCandidate(sectionData, ['workPackages', 'activities', 'wps']);
  return arr.filter(isRecord);
}

function extractTasksFromWP(wp: JsonRecord): JsonRecord[] {
  const tasks = wp['tasks'];
  return Array.isArray(tasks) ? tasks.filter(isRecord) : [];
}

function extractDeliverablesFromWP(wp: JsonRecord): JsonRecord[] {
  const deliverables = wp['deliverables'];
  return Array.isArray(deliverables) ? deliverables.filter(isRecord) : [];
}

function extractMilestonesFromWP(wp: JsonRecord): JsonRecord[] {
  const milestones = wp['milestones'];
  return Array.isArray(milestones) ? milestones.filter(isRecord) : [];
}

function validateActivities(sectionData: unknown, ctx: ValidationContext, issues: ValidationIssue[]): void {
  const section = 'activities';
  const wps = extractWorkPackages(sectionData);

  if (wps.length < 6 || wps.length > 10) {
    pushIssue(
      issues,
      'HIGH',
      'wp-count-out-of-range',
      section,
      'The number of work packages is outside the expected 6–10 range.',
      'activities',
      'Generate between 6 and 10 WPs.'
    );
  }

  if (wps.length >= 2) {
    const penultimateTitle = String(wps[wps.length - 2]?.title ?? '');
    const lastTitle = String(wps[wps.length - 1]?.title ?? '');

    if (!/Dissemination.*Communication.*Exploitation/i.test(penultimateTitle)) {
      pushIssue(
        issues,
        'FATAL',
        'wrong-penultimate-wp',
        section,
        'The second-to-last WP is not the required Dissemination, Communication and Exploitation WP.',
        `activities.${wps.length - 2}.title`,
        'Rename/reorder the second-to-last WP accordingly.'
      );
    }

    if (!/Project Management and Coordination/i.test(lastTitle)) {
      pushIssue(
        issues,
        'FATAL',
        'wrong-last-wp',
        section,
        'The last WP is not Project Management and Coordination.',
        `activities.${wps.length - 1}.title`,
        'Rename/reorder the last WP accordingly.'
      );
    }
  }

  let foundDMP = false;
  const dmpDeadline = ctx.projectStart ? addMonths(ctx.projectStart, 6) : null;
  const language = ctx.language || 'en';
  const expectedWpPrefix = language === 'si' ? 'DS' : 'WP';
  const expectedTaskPrefix = language === 'si' ? 'N' : 'T';

  wps.forEach((wp, wpIndex) => {
    const wpId = String(wp.id ?? '');
    const wpTitle = String(wp.title ?? '');
    const tasks = extractTasksFromWP(wp);
    const deliverables = extractDeliverablesFromWP(wp);
    const milestones = extractMilestonesFromWP(wp);

    if (wpId && !wpId.startsWith(expectedWpPrefix)) {
      pushIssue(
        issues,
        'FATAL',
        'wrong-wp-prefix',
        section,
        `WP id "${wpId}" does not match the expected prefix "${expectedWpPrefix}".`,
        `activities.workPackages.${wpIndex}.id`
      );
    }

    if (wpIndex === 0 && !/Capitalisation and Synergies|Capitalisation|Synergies/i.test(JSON.stringify(tasks))) {
      pushIssue(
        issues,
        'HIGH',
        'missing-capitalisation-task',
        section,
        'WP1 does not appear to contain a Capitalisation and Synergies task.',
        `activities.workPackages.${wpIndex}.tasks`,
        'Add a specific task on review and integration of past EU project results.'
      );
    }

    tasks.forEach((task, taskIndex) => {
      const taskId = String(task.id ?? '');
      const startDate = String(task.startDate ?? '');
      const endDate = String(task.endDate ?? '');
      const deps = Array.isArray(task.dependencies) ? task.dependencies : [];

      if (taskId && !taskId.startsWith(expectedTaskPrefix)) {
        pushIssue(
          issues,
          'FATAL',
          'wrong-task-prefix',
          section,
          `Task id "${taskId}" does not match the expected prefix "${expectedTaskPrefix}".`,
          `activities.workPackages.${wpIndex}.tasks.${taskIndex}.id`
        );
      }

      if (startDate && endDate && parseISODate(startDate) && parseISODate(endDate) && compareDates(startDate, endDate) > 0) {
        pushIssue(
          issues,
          'FATAL',
          'task-date-order',
          section,
          'Task startDate is later than endDate.',
          `activities.workPackages.${wpIndex}.tasks.${taskIndex}`
        );
      }

      const isFirstTask =
        wpIndex === 0 &&
        taskIndex === 0 &&
        ((language === 'si' && taskId === 'N1.1') || (language !== 'si' && taskId === 'T1.1'));

      if (!isFirstTask && deps.length === 0) {
        pushIssue(
          issues,
          'HIGH',
          'missing-task-dependency',
          section,
          'Task has no dependency although all tasks except the first should have one.',
          `activities.workPackages.${wpIndex}.tasks.${taskIndex}.dependencies`
        );
      }
    });

    deliverables.forEach((del, delIndex) => {
      const title = String(del.title ?? '');
      const description = String(del.description ?? '');
      const indicator = String(del.indicator ?? '');
      const dueDate = String(del.date ?? del.dueDate ?? '');

      const dmpText = `${title} ${description} ${indicator}`;
      if (/\b(Data Management Plan|DMP)\b/i.test(dmpText)) {
        foundDMP = true;
        if (dmpDeadline && dueDate && parseISODate(dueDate) && compareDates(dueDate, dmpDeadline) > 0) {
          pushIssue(
            issues,
            'HIGH',
            'dmp-late',
            section,
            'DMP deliverable exists but appears later than Month 6.',
            `activities.workPackages.${wpIndex}.deliverables.${delIndex}.date`,
            'Move the DMP deliverable to M6 or earlier.'
          );
        }
      }

      if (!looksBinaryIndicator(indicator)) {
        pushIssue(
          issues,
          'FATAL',
          'weak-deliverable-indicator',
          section,
          'Deliverable indicator is not binary/verifiable enough.',
          `activities.workPackages.${wpIndex}.deliverables.${delIndex}.indicator`,
          'Use quantity + format + verification method.'
        );
      }
    });

    milestones.forEach((ms, msIndex) => {
      const indicator = String(ms.indicator ?? ms.description ?? '');
      if (!indicator || !/\b(completed|approved|validated|adopted|confirmed|signed|launched|published)\b/i.test(indicator)) {
        pushIssue(
          issues,
          'HIGH',
          'weak-milestone-indicator',
          section,
          'Milestone indicator/description may not be binary enough.',
          `activities.workPackages.${wpIndex}.milestones.${msIndex}`,
          'Use a yes/no verifiable milestone completion statement.'
        );
      }
    });

    if (/Dissemination.*Communication.*Exploitation/i.test(wpTitle)) {
      const flatTasksText = tasks.map(t => `${t.title ?? ''} ${t.description ?? ''}`).join(' || ');
      const hasCommunication = /\bCommunication\b/i.test(flatTasksText);
      const hasDissemination = /\bDissemination\b/i.test(flatTasksText);
      const hasExploitation = /\bExploitation\b/i.test(flatTasksText);

      if (!(hasCommunication && hasDissemination && hasExploitation)) {
        pushIssue(
          issues,
          'HIGH',
          'missing-cde-separation',
          section,
          'Dissemination WP does not clearly separate Communication, Dissemination, and Exploitation tasks.',
          `activities.workPackages.${wpIndex}.tasks`,
          'Create distinct tasks for Communication, Dissemination, and Exploitation.'
        );
      }
    }
  });

  if (!foundDMP) {
    pushIssue(
      issues,
      'HIGH',
      'missing-dmp',
      section,
      'No Data Management Plan deliverable detected.',
      'activities.workPackages',
      'Add a DMP deliverable by Month 6.'
    );
  }
}

function validateObjectives(section: 'generalObjectives' | 'specificObjectives', sectionData: unknown, issues: ValidationIssue[]): void {
  const arr = getArrayCandidate(sectionData, ['objectives']);
  const items = (Array.isArray(sectionData) ? sectionData : arr).filter(isRecord);

  if (section === 'specificObjectives' && items.length < 5) {
    pushIssue(
      issues,
      'FATAL',
      'too-few-specific-objectives',
      section,
      'Fewer than 5 specific objectives were detected.',
      section,
      'Generate exactly 5 to 7 specific objectives.'
    );
  }

  items.forEach((item, idx) => {
    const title = String(item.title ?? '');
    const indicator = String(item.indicator ?? '');

    if (!/^(To\s+[A-Z]?[a-z]+|Develop|Increase|Strengthen|Enhance|Improve|Support|Reduce|Establish|Create)\b/.test(title)) {
      pushIssue(
        issues,
        'MEDIUM',
        'objective-title-format',
        section,
        'Objective title may not begin with an infinitive/base verb form.',
        `${section}.${idx}.title`
      );
    }

    if (!indicator.trim()) {
      pushIssue(
        issues,
        'FATAL',
        'missing-objective-indicator',
        section,
        'Objective indicator is missing.',
        `${section}.${idx}.indicator`
      );
    } else if (!looksChangeIndicator(indicator)) {
      pushIssue(
        issues,
        'HIGH',
        'weak-objective-indicator',
        section,
        'Objective indicator does not look sufficiently measurable/time-bound.',
        `${section}.${idx}.indicator`,
        'Use target + timeframe + measurement method/source.'
      );
    }
  });
}

function validateOutputs(sectionData: unknown, issues: ValidationIssue[]): void {
  const section = 'outputs';
  const arr = (Array.isArray(sectionData) ? sectionData : getArrayCandidate(sectionData, ['outputs'])).filter(isRecord);

  arr.forEach((item, idx) => {
    const indicator = String(item.indicator ?? '');
    if (!indicator.trim()) {
      pushIssue(issues, 'FATAL', 'missing-output-indicator', section, 'Output indicator is missing.', `${section}.${idx}.indicator`);
    } else if (!looksBinaryIndicator(indicator)) {
      pushIssue(
        issues,
        'FATAL',
        'weak-output-indicator',
        section,
        'Output indicator is not binary/verifiable enough.',
        `${section}.${idx}.indicator`,
        'Use quantity + format + verification method.'
      );
    }
  });
}

function validateOutcomes(sectionData: unknown, issues: ValidationIssue[]): void {
  const section = 'outcomes';
  const arr = (Array.isArray(sectionData) ? sectionData : getArrayCandidate(sectionData, ['outcomes'])).filter(isRecord);

  arr.forEach((item, idx) => {
    const indicator = String(item.indicator ?? '');
    if (!indicator.trim()) {
      pushIssue(issues, 'FATAL', 'missing-outcome-indicator', section, 'Outcome indicator is missing.', `${section}.${idx}.indicator`);
    } else if (!looksChangeIndicator(indicator)) {
      pushIssue(
        issues,
        'HIGH',
        'weak-outcome-indicator',
        section,
        'Outcome indicator does not appear to measure change robustly.',
        `${section}.${idx}.indicator`,
        'Use target + timeframe + measurement method.'
      );
    }
  });
}

function validateImpacts(sectionData: unknown, issues: ValidationIssue[]): void {
  const section = 'impacts';
  const arr = (Array.isArray(sectionData) ? sectionData : getArrayCandidate(sectionData, ['impacts'])).filter(isRecord);

  arr.forEach((item, idx) => {
    const description = String(item.description ?? '');
    const indicator = String(item.indicator ?? '');

    if (!/\b(Scientific|Societal|Economic)\b/i.test(description)) {
      pushIssue(
        issues,
        'HIGH',
        'missing-kip',
        section,
        'Impact description does not explicitly state a Key Impact Pathway.',
        `${section}.${idx}.description`,
        'Explicitly indicate Scientific, Societal, or Economic impact.'
      );
    }

    if (!indicator.trim()) {
      pushIssue(issues, 'FATAL', 'missing-impact-indicator', section, 'Impact indicator is missing.', `${section}.${idx}.indicator`);
    } else if (!looksChangeIndicator(indicator)) {
      pushIssue(
        issues,
        'HIGH',
        'weak-impact-indicator',
        section,
        'Impact indicator does not appear to be sufficiently measurable and long-term.',
        `${section}.${idx}.indicator`,
        'Use target + 3–5 year horizon + source/method.'
      );
    }
  });
}

function validateRisks(sectionData: unknown, issues: ValidationIssue[]): void {
  const section = 'risks';
  const arr = (Array.isArray(sectionData) ? sectionData : getArrayCandidate(sectionData, ['risks'])).filter(isRecord);

  if (arr.length < 6) {
    pushIssue(
      issues,
      'HIGH',
      'too-few-risks',
      section,
      'Fewer than 6 risks were detected.',
      section,
      'Generate at least 6 risks across all categories.'
    );
  }

  const categories = new Set(arr.map(r => String(r.category ?? '').toLowerCase()));
  ['technical', 'social', 'economic', 'environmental'].forEach(cat => {
    if (!categories.has(cat)) {
      pushIssue(
        issues,
        'HIGH',
        'missing-risk-category',
        section,
        `No risk detected for category "${cat}".`,
        section,
        'Add at least one risk for each required category.'
      );
    }
  });

  arr.forEach((risk, idx) => {
    const mitigation = String(risk.mitigation ?? '');
    if (!mitigation.trim()) {
      pushIssue(
        issues,
        'FATAL',
        'missing-risk-mitigation',
        section,
        'Risk mitigation field is missing.',
        `${section}.${idx}.mitigation`
      );
    }
  });

  const flatText = JSON.stringify(sectionData);
  const likelyDigitalProject = /\b(AI|platform|dashboard|data|GDPR|analytics|digital|algorithm)\b/i.test(flatText);
  if (likelyDigitalProject && !/\b(GDPR|AI Act|Ethical and Regulatory Compliance)\b/i.test(flatText)) {
    pushIssue(
      issues,
      'HIGH',
      'missing-ai-gdpr-risk',
      section,
      'Digital/data-heavy project appears to lack an ethical or regulatory compliance risk.',
      section,
      'Add a GDPR/AI Act/ethical compliance risk with mitigation.'
    );
  }
}

function validateKERs(sectionData: unknown, issues: ValidationIssue[]): void {
  const section = 'kers';
  const arr = (Array.isArray(sectionData) ? sectionData : getArrayCandidate(sectionData, ['kers'])).filter(isRecord);

  arr.forEach((item, idx) => {
    const strategy = String(item.exploitationStrategy ?? '');
    if (!strategy.trim()) {
      pushIssue(
        issues,
        'FATAL',
        'missing-exploitation-strategy',
        section,
        'KER exploitationStrategy is missing.',
        `${section}.${idx}.exploitationStrategy`
      );
      return;
    }

    const hasFinancial = /\b(financial|funding|revenue|budget|licensing|membership|maintenance cost)\b/i.test(strategy);
    const hasInstitutional = /\b(institutional|ownership|owner|governance|responsibility|partner)\b/i.test(strategy);
    const hasPolitical = /\b(policy|regulatory|endorsement|directive|ministry|regional plan|integration)\b/i.test(strategy);

    if (!(hasFinancial && hasInstitutional && hasPolitical)) {
      pushIssue(
        issues,
        'HIGH',
        'incomplete-3-pillar-strategy',
        section,
        'KER exploitationStrategy does not clearly cover all 3 sustainability pillars.',
        `${section}.${idx}.exploitationStrategy`,
        'Cover financial, institutional, and political/regulatory sustainability.'
      );
    }
  });
}

function validatePartners(sectionData: unknown, issues: ValidationIssue[]): void {
  const section = 'partners';
  const arr = (Array.isArray(sectionData) ? sectionData : getArrayCandidate(sectionData, ['partners'])).filter(isRecord);

  if (arr.length === 0) {
    pushIssue(
      issues,
      'HIGH',
      'missing-partners',
      section,
      'No partners detected.',
      section
    );
    return;
  }

  const first = arr[0];
  if (String(first.code ?? '') !== 'CO') {
    pushIssue(
      issues,
      'HIGH',
      'missing-coordinator-code',
      section,
      'The first partner should normally use code "CO".',
      `${section}.0.code`
    );
  }

  arr.forEach((partner, idx) => {
    const name = String(partner.name ?? '');
    const partnerType = String(partner.partnerType ?? '');
    const pmRate = Number(partner.pmRate ?? NaN);

    if (!partnerType) {
      pushIssue(
        issues,
        'FATAL',
        'missing-partner-type',
        section,
        'partnerType is missing.',
        `${section}.${idx}.partnerType`
      );
    }

    if (/\bUniversity of|Ltd\.|GmbH|d\.o\.o\.|Inc\.|Association of|Ministry of [A-Z]/.test(name)) {
      pushIssue(
        issues,
        'HIGH',
        'real-organisation-name-likely',
        section,
        'Partner name looks like a real organisation name instead of a type description.',
        `${section}.${idx}.name`,
        'Use a partner type description, not a specific real entity.'
      );
    }

    if (!Number.isFinite(pmRate) || pmRate < 2500 || pmRate > 7000) {
      pushIssue(
        issues,
        'HIGH',
        'pm-rate-out-of-range',
        section,
        'pmRate is outside the expected 2500–7000 EUR range.',
        `${section}.${idx}.pmRate`
      );
    }

    if (name && partnerType) {
      const checks: Array<[RegExp, string]> = [
        [/\bUniversity|Faculty|Academic\b/i, 'faculty'],
        [/\bResearch Institute|Research Centre|Research Center\b/i, 'researchInstitute'],
        [/\bSME\b/i, 'sme'],
        [/\bAgency|Public Authority|Regional Development\b/i, 'publicAgency'],
        [/\bAssociation|Chamber\b/i, 'internationalAssociation'],
        [/\bMinistry|Government\b/i, 'ministry'],
        [/\bNGO|Non-profit|Civil Society\b/i, 'ngo'],
        [/\bLarge Enterprise|Corporation\b/i, 'largeEnterprise'],
      ];

      for (const [pattern, expectedType] of checks) {
        if (pattern.test(name) && partnerType !== expectedType) {
          pushIssue(
            issues,
            'HIGH',
            'partner-type-mismatch',
            section,
            `partnerType "${partnerType}" may not match the partner name description.`,
            `${section}.${idx}.partnerType`,
            `Expected something closer to "${expectedType}".`
          );
          break;
        }
      }
    }
  });
}

// ★ v1.4 EO-070: Reference validation rules
function validateReferences(references: unknown, issues: ValidationIssue[]): void {
  const section = 'references';
  if (!Array.isArray(references)) return;

  references.forEach((ref: any, idx: number) => {
    if (!ref || typeof ref !== 'object') return;

    // reference-completeness: check for missing authors or title
    if (!ref.authors || (typeof ref.authors === 'string' && ref.authors.trim().length === 0)) {
      pushIssue(
        issues,
        'MEDIUM',
        'reference-completeness',
        section,
        'Reference is missing authors.',
        `references.${idx}.authors`,
        'Add author names for this reference.'
      );
    }
    if (!ref.title || (typeof ref.title === 'string' && ref.title.trim().length === 0)) {
      pushIssue(
        issues,
        'MEDIUM',
        'reference-completeness',
        section,
        'Reference is missing a title.',
        `references.${idx}.title`,
        'Add the publication title for this reference.'
      );
    }

    // reference-url-check: flag references with empty URLs
    if (!ref.url || (typeof ref.url === 'string' && ref.url.trim().length === 0)) {
      pushIssue(
        issues,
        'MEDIUM',
        'reference-url-check',
        section,
        'Reference has no URL.',
        `references.${idx}.url`,
        'Add a URL or DOI link for verification.'
      );
    }
  });
}

function validateSummary(sectionData: unknown, issues: ValidationIssue[]): void {
  const section = 'summary';
  const summaryText =
    typeof sectionData === 'string'
      ? sectionData
      : getStringCandidate(sectionData, [['summary'], ['text'], ['content']]) || '';

  if (!summaryText) {
    pushIssue(
      issues,
      'HIGH',
      'missing-summary',
      section,
      'Summary content is missing.',
      section
    );
    return;
  }

  const requiredHeadings = [
    '## 1. Project Overview',
    '## 2. Problem & Need',
    '## 3. Solution & Approach',
    '## 4. Key Results & Impact',
    '## 5. EU Added Value & Relevance',
  ];

  for (const heading of requiredHeadings) {
    if (!summaryText.includes(heading)) {
      pushIssue(
        issues,
        'HIGH',
        'missing-summary-heading',
        section,
        `Missing required summary heading: ${heading}`,
        section
      );
    }
  }

  if (splitSentences(summaryText).length > 30) {
    pushIssue(
      issues,
      'MEDIUM',
      'summary-may-be-too-long',
      section,
      'Summary appears relatively long and may exceed the intended executive style.',
      section
    );
  }
}

function validateCrossChapter(projectData: JsonRecord, ctx: ValidationContext, issues: ValidationIssue[]): void {
  const strict = !!ctx.strictSemanticMapping;
  const severity: Severity = strict ? 'FATAL' : 'HIGH';

  const problem = isRecord(projectData.problemAnalysis) ? projectData.problemAnalysis : null;
  const activities = projectData.activities;
  const outputs = projectData.outputs;
  const outcomes = projectData.outcomes;
  const impacts = projectData.impacts;
  const kers = projectData.kers;
  const specificObjectives = projectData.specificObjectives;

  if (problem && activities) {
    const causes = getArrayCandidate(problem, ['causes']).filter(isRecord);
    const wps = extractWorkPackages(activities);
    const activityCorpus = wps
      .flatMap(wp => {
        const tasks = extractTasksFromWP(wp);
        return [
          `${wp.title ?? ''} ${wp.description ?? ''}`,
          ...tasks.map(t => `${t.title ?? ''} ${t.description ?? ''}`),
        ];
      })
      .join(' || ');

    causes.forEach((cause, idx) => {
      const causeText = `${cause.title ?? ''} ${cause.description ?? ''}`;
      if (keywordOverlapScore(causeText, activityCorpus) < 2) {
        pushIssue(
          issues,
          severity,
          'cause-not-clearly-addressed',
          'crossChapter',
          'A cause from Problem Analysis is not clearly reflected in Activities based on heuristic keyword mapping.',
          `problemAnalysis.causes.${idx}`,
          'Review activities and explicitly address this cause in a WP/task title or description.'
        );
      }
    });
  }

  if (problem && impacts) {
    const consequences = getArrayCandidate(problem, ['consequences']).filter(isRecord);
    const impactArr = (Array.isArray(impacts) ? impacts : getArrayCandidate(impacts, ['impacts'])).filter(isRecord);
    const impactCorpus = impactArr.map(i => `${i.title ?? ''} ${i.description ?? ''}`).join(' || ');

    consequences.forEach((cons, idx) => {
      const consText = `${cons.title ?? ''} ${cons.description ?? ''}`;
      if (keywordOverlapScore(consText, impactCorpus) < 2) {
        pushIssue(
          issues,
          severity,
          'consequence-not-clearly-mapped-to-impact',
          'crossChapter',
          'A consequence is not clearly reflected in Impacts based on heuristic keyword mapping.',
          `problemAnalysis.consequences.${idx}`,
          'Make at least one impact explicitly respond to this consequence.'
        );
      }
    });
  }

  if (specificObjectives && (outputs || outcomes)) {
    const objArr = (Array.isArray(specificObjectives)
      ? specificObjectives
      : getArrayCandidate(specificObjectives, ['objectives'])).filter(isRecord);
    const outArr = (Array.isArray(outputs) ? outputs : getArrayCandidate(outputs, ['outputs'])).filter(isRecord);
    const outcArr = (Array.isArray(outcomes) ? outcomes : getArrayCandidate(outcomes, ['outcomes'])).filter(isRecord);
    const resultCorpus = [...outArr, ...outcArr]
      .map(r => `${r.title ?? ''} ${r.description ?? ''} ${r.indicator ?? ''}`)
      .join(' || ');

    objArr.forEach((obj, idx) => {
      const indicatorText = `${obj.title ?? ''} ${obj.description ?? ''} ${obj.indicator ?? ''}`;
      if (keywordOverlapScore(indicatorText, resultCorpus) < 2) {
        pushIssue(
          issues,
          severity,
          'objective-kpi-not-reflected',
          'crossChapter',
          'A specific objective/KPI is not clearly reflected in Outputs or Outcomes based on heuristic keyword mapping.',
          `specificObjectives.${idx}`,
          'Align at least one output/outcome indicator more explicitly with this KPI.'
        );
      }
    });
  }

  if (kers && outputs) {
    const kerArr = (Array.isArray(kers) ? kers : getArrayCandidate(kers, ['kers'])).filter(isRecord);
    const outArr = (Array.isArray(outputs) ? outputs : getArrayCandidate(outputs, ['outputs'])).filter(isRecord);
    const outputCorpus = outArr.map(o => `${o.title ?? ''} ${o.description ?? ''}`).join(' || ');

    kerArr.forEach((ker, idx) => {
      const kerText = `${ker.title ?? ''} ${ker.description ?? ''}`;
      if (keywordOverlapScore(kerText, outputCorpus) < 2) {
        pushIssue(
          issues,
          severity,
          'ker-not-clearly-derived-from-output',
          'crossChapter',
          'A KER is not clearly traceable to an Output based on heuristic keyword mapping.',
          `kers.${idx}`,
          'Reference the originating output or align the KER title/description more explicitly.'
        );
      }
    });
  }
}

function detectSectionsFromProject(data: JsonRecord): KnownSectionKey[] {
  return KNOWN_SECTION_KEYS.filter(key => key in data);
}

export function validateSectionOutput(
  sectionKey: KnownSectionKey,
  sectionData: unknown,
  ctx: ValidationContext = {}
): ValidationReport {
  const issues: ValidationIssue[] = [];

  validateGenericStrings(sectionKey, sectionData, ctx, issues);
  validateDatesRecursive(sectionKey, sectionData, ctx, issues);

  switch (sectionKey) {
    case 'problemAnalysis':
      validateProblemAnalysis(sectionData, issues);
      break;
    case 'projectIdea':
      validateProjectIdea(sectionData, issues);
      break;
    case 'generalObjectives':
    case 'specificObjectives':
      validateObjectives(sectionKey, sectionData, issues);
      break;
    case 'activities':
      validateActivities(sectionData, ctx, issues);
      break;
    case 'outputs':
      validateOutputs(sectionData, issues);
      break;
    case 'outcomes':
      validateOutcomes(sectionData, issues);
      break;
    case 'impacts':
      validateImpacts(sectionData, issues);
      break;
    case 'risks':
      validateRisks(sectionData, issues);
      break;
    case 'kers':
      validateKERs(sectionData, issues);
      break;
    case 'partners':
      validatePartners(sectionData, issues);
      break;
    case 'summary':
      validateSummary(sectionData, issues);
      break;
    default:
      break;
  }

  return createReport(issues);
}

export function validateProjectOutput(
  projectData: unknown,
  ctx: ValidationContext = {}
): ValidationReport {
  const issues: ValidationIssue[] = [];

  if (!isRecord(projectData)) {
    pushIssue(
      issues,
      'FATAL',
      'invalid-root',
      'root',
      'Project output must be a JSON object at the root.'
    );
    return createReport(issues);
  }

  const sections = detectSectionsFromProject(projectData);

  if (sections.length === 0) {
    pushIssue(
      issues,
      'HIGH',
      'no-known-sections',
      'root',
      'No known project sections were detected in the provided object.'
    );
  }

  for (const section of sections) {
    const sectionReport = validateSectionOutput(section, projectData[section], {
      ...ctx,
      mode: section === 'summary' ? 'summary' : 'structured',
    });
    issues.push(...sectionReport.issues);
  }

  validateCrossChapter(projectData, ctx, issues);

  return createReport(issues);
}

export function shouldRejectOutput(report: ValidationReport): boolean {
  return report.fatalCount > 0;
}

export function shouldRepairOutput(report: ValidationReport): boolean {
  return report.fatalCount === 0 && report.highCount > 0;
}

export function summariseValidation(report: ValidationReport, language: 'en' | 'si' = 'en'): string {
  if (report.fatalCount === 0 && report.highCount === 0 && report.mediumCount === 0) {
    return language === 'si'
      ? 'Odlicno! Vsebina je pripravljena za oddajo.'
      : 'Excellent! Content is ready for submission.';
  }

  const score = Math.max(0, Math.round(100 - (report.fatalCount * 15) - (report.highCount * 5) - (report.mediumCount * 1)));

  const parts: string[] = [];
  if (report.fatalCount > 0) {
    parts.push(language === 'si'
      ? `${report.fatalCount} dopolnitev pred oddajo`
      : `${report.fatalCount} items need attention`);
  }
  if (report.highCount > 0) {
    parts.push(language === 'si'
      ? `${report.highCount} priporocil za izboljsavo`
      : `${report.highCount} recommendations`);
  }
  if (report.mediumCount > 0) {
    parts.push(language === 'si'
      ? `${report.mediumCount} namigov`
      : `${report.mediumCount} suggestions`);
  }

  const header = language === 'si'
    ? `Ocena kakovosti: ${score}/100`
    : `Quality Score: ${score}/100`;

  return header + ' | ' + parts.join(' | ');
}

export function getDisplaySeverity(severity: Severity, language: 'en' | 'si' = 'en'): { label: string; icon: string; color: string; bgColor: string; borderColor: string } {
  const map = {
    FATAL: {
      en: { label: 'Needs Attention', icon: '\uD83D\uDD27' },
      si: { label: 'Potrebna dopolnitev', icon: '\uD83D\uDD27' },
      color: '#C2410C',
      bgColor: '#FFF7ED',
      borderColor: '#FDBA74',
    },
    HIGH: {
      en: { label: 'Recommendation', icon: '\uD83D\uDCA1' },
      si: { label: 'Priporocilo', icon: '\uD83D\uDCA1' },
      color: '#1D4ED8',
      bgColor: '#EFF6FF',
      borderColor: '#93C5FD',
    },
    MEDIUM: {
      en: { label: 'Suggestion', icon: '\uD83D\uDCDD' },
      si: { label: 'Namig', icon: '\uD83D\uDCDD' },
      color: '#4B5563',
      bgColor: '#F9FAFB',
      borderColor: '#D1D5DB',
    },
  };
  const entry = map[severity];
  const lang = language === 'si' ? 'si' : 'en';
  return {
    label: entry[lang].label,
    icon: entry[lang].icon,
    color: entry.color,
    bgColor: entry.bgColor,
    borderColor: entry.borderColor,
  };
}
