// types.ts
// ═══════════════════════════════════════════════════════════════
// TypeScript type definitions for the EU Project Idea Draft app.
// v8.6 — 2026-03-23 — EO-142: Added Policy type alias (maps to PolicyItem {name, description}).
// v8.5 — 2026-03-23 — EO-141: Added chapterPrefix?: string to Reference interface.
// v8.4 — 2026-03-20 — EO-138:
//   → NEW: UsageRecord — single API call cost record
//   → NEW: ChapterUsage — accumulated usage per chapter
//   → NEW: ProjectUsage — top-level usage container in projectData._usage
// v8.3 — 2026-03-13 — CHANGES:
//   - ★ v8.3: EO-084 — Approved source pool and retrieval-only citation pipeline
//     → NEW: ApprovedSource interface — authoritative source with authority score
//     → NEW: AuthorityScore type — numeric ranking (50–100) for source credibility
//     → CHANGED: ProjectData extended with approvedSources?: ApprovedSource[]
//     → CHANGED: Reference extended with sourceId?: string (links to ApprovedSource.id)
// v8.2 — 2026-03-12 — CHANGES:
//   - ★ v8.2: EO-083 — Real URL verification via Edge Function + CrossRef DOI fallback
//     → NEW: verificationMethod?: string on Reference interface
//     → NEW: verificationStatus?: string on Reference interface
//     → NEW: resolvedUrl?: string on Reference interface
//     → NEW: canonicalUrl?: string on Reference interface
//     → NEW: metadataVerified?: boolean on Reference interface
// v8.1 — 2026-03-11 — CHANGES:
//   - ★ v8.1: EO-080 — urlVerified tracks whether URL is from a trusted source
//     → NEW: urlVerified?: boolean on Reference interface
// v8.0 — 2026-03-10 — CHANGES:
//   - ★ v8.0: EO-069 — Reference system:
//     → NEW: Reference interface for academic citations
//     → CHANGED: ProjectData extended with references?: Reference[]
// v7.0 — 2026-02-22 — CHANGES:
//   - ★ v7.0: BREAKING CHANGES for Finance/Partners refactor:
//     → FIX: "Potovalni stroški" → "Potni stroški"
//     → NEW: PartnerType union type (faculty, researchInstitute, sme, etc.)
//     → CHANGED: ProjectPartner now includes partnerType field
//     → NEW: IndirectCostSettings — project-level % and applicable categories
//     → CHANGED: TaskPartnerAllocation simplified — indirectCosts removed
//       (indirect costs now calculated centrally from IndirectCostSettings)
//     → CHANGED: ProjectData extended with indirectCostSettings
//     → REMOVED: CENTRALIZED_INDIRECT_COSTS, DECENTRALIZED_INDIRECT_COSTS
//       (replaced by project-level IndirectCostSettings)
//   - v6.0: Partnership & Finance data model (base)
//   - v5.1: Multi-tenant organization types
//   - v5.0: Chart image data, admin logs, extraction types
// ═══════════════════════════════════════════════════════════════

// ─── EU STANDARD: PERSON-MONTH ───────────────────────────────────
export const PM_HOURS_PER_MONTH = 143;

// ─── FUNDING MODEL ───────────────────────────────────────────────
export type FundingModel = 'centralized' | 'decentralized';
export type CostModelType = 'actual' | 'unit' | 'lumpSum' | 'flatRate';

// ─── PARTNER TYPES ───────────────────────────────────────────────
// ★ v7.0: Strongly-typed partner categories
export type PartnerType =
  | 'faculty'
  | 'researchInstitute'
  | 'sme'
  | 'publicAgency'
  | 'internationalAssociation'
  | 'ministry'
  | 'ngo'
  | 'largeEnterprise'
  | 'other';

// ─── COST CATEGORY CONSTANTS ─────────────────────────────────────
// ★ v7.0: FIX "Potovalni stroški" → "Potni stroški"

export const CENTRALIZED_DIRECT_COSTS = [
  { key: 'labourCosts', en: 'Staff/Personnel costs', si: 'Stroški dela' },
  { key: 'subContractorCosts', en: 'Sub-contractor costs', si: 'Stroški podizvajalcev' },
  { key: 'travelCosts', en: 'Travel costs', si: 'Potni stroški' },
  { key: 'materials', en: 'Materials / Consumables', si: 'Material / Potrošni material' },
  { key: 'depreciationEquipment', en: 'Depreciation of equipment', si: 'Amortizacija opreme' },
  { key: 'otherProjectCosts', en: 'Other project costs', si: 'Drugi projektni stroški' },
  { key: 'investmentCosts', en: 'Investment costs', si: 'Investicijski stroški' },
];

export const DECENTRALIZED_DIRECT_COSTS = [
  { key: 'salariesReimbursements', en: 'Salaries and work-related reimbursements', si: 'Stroški plač in povračila stroškov v zvezi z delom' },
  { key: 'externalServiceCosts', en: 'External service provider costs', si: 'Stroški zunanjih izvajalcev storitev' },
  { key: 'vat', en: 'VAT', si: 'DDV' },
  { key: 'intangibleAssetInvestment', en: 'Investments in intangible assets', si: 'Investicije v neopredmetena sredstva' },
  { key: 'depreciationBasicAssets', en: 'Depreciation of basic assets', si: 'Amortizacija osnovnih sredstev' },
  { key: 'infoCommunication', en: 'Information & communication costs', si: 'Stroški informiranja in komuniciranja' },
  { key: 'tangibleAssetInvestment', en: 'Investments in tangible assets', si: 'Investicije v opredmetena osnovna sredstva' },
];

// ★ v7.0: Indirect cost categories kept for REFERENCE in Finance settings UI
// (user picks which direct categories the indirect % applies to)
export const INDIRECT_COST_REFERENCE_CATEGORIES = [
  { key: 'rent', en: 'Rent', si: 'Najemnina' },
  { key: 'operatingCosts', en: 'Operating costs', si: 'Obratovalni stroški' },
  { key: 'telecommunications', en: 'Telecommunications', si: 'Telekomunikacije' },
  { key: 'smallConsumables', en: 'Small consumables', si: 'Drobni potrošni material' },
  { key: 'administrativeCosts', en: 'Administrative costs', si: 'Administrativni stroški' },
];

// ★ v7.0: BACKWARD COMPAT — keep old names as aliases
export const CENTRALIZED_INDIRECT_COSTS = INDIRECT_COST_REFERENCE_CATEGORIES;
export const DECENTRALIZED_INDIRECT_COSTS = INDIRECT_COST_REFERENCE_CATEGORIES;

// ─── PROBLEM ANALYSIS ────────────────────────────────────────────

export interface ProblemItem {
  title: string;
  description: string;
}

export interface CoreProblem {
  title: string;
  description: string;
}

export interface ProblemAnalysis {
  coreProblem: CoreProblem;
  causes: ProblemItem[];
  consequences: ProblemItem[];
}

// ─── POLICIES ────────────────────────────────────────────────────

export interface PolicyItem {
  name: string;
  description: string;
}

// EO-142: Policy is an alias for PolicyItem — ensures {name, description} schema is explicit
export type Policy = PolicyItem;

// ─── OBJECTIVES ──────────────────────────────────────────────────

export interface ObjectiveItem {
  title: string;
  description: string;
  indicator: string;
}

// ─── READINESS LEVELS ────────────────────────────────────────────

export interface ReadinessLevel {
  level: number | null;
  justification: string;
}

export interface ReadinessLevels {
  TRL: ReadinessLevel;
  SRL: ReadinessLevel;
  ORL: ReadinessLevel;
  LRL: ReadinessLevel;
}

// ─── PARTNERSHIP ─────────────────────────────────────────────────
// ★ v7.0: Added partnerType field

export interface ProjectPartner {
  id: string;
  code: string;
  name: string;
  expertise: string;
  pmRate: number;
  partnerType?: PartnerType;
}

// ─── FINANCE: COST ITEMS ─────────────────────────────────────────

export interface DirectCostItem {
  id: string;
  categoryKey: string;
  name: string;
  amount: number;
  costModel?: CostModelType;
}

// ★ v7.0: Kept for backward compat but no longer used on task level
export interface IndirectCostItem {
  id: string;
  categoryKey: string;
  name: string;
  percentage: number;
  appliesTo: string[];
  calculatedAmount: number;
}

// ★ v7.0: Project-level indirect cost settings (defined in Finance sub-chapter)
export interface IndirectCostSettings {
  percentage: number;                // e.g. 7, 15, 25
  appliesToCategories: string[];     // keys from direct cost categories that this % applies to
}

// ─── TASK-LEVEL PARTNER ALLOCATION ───────────────────────────────
// ★ v7.0: Simplified — indirect costs calculated centrally, not per-task

export interface TaskPartnerAllocation {
  partnerId: string;
  hours: number;
  pm: number;
  directCosts: DirectCostItem[];
  totalDirectCost: number;
  // ★ v7.0: indirectCosts[] REMOVED from task level
  //   Indirect cost = totalDirectCost(applicable categories) × indirectCostSettings.percentage / 100
  //   Calculated dynamically in UI, not stored per task
  totalCost: number;
}

// ─── TASKS, WPs ──────────────────────────────────────────────────

export interface TaskDependency {
  predecessorId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
}

export interface Task {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  dependencies: TaskDependency[];
  partnerAllocations?: TaskPartnerAllocation[];
}

export interface Milestone {
  id: string;
  description: string;
  date: string;
}

export interface Deliverable {
  id: string;
  title: string;
  description: string;
  indicator: string;
}

export interface WorkPackage {
  id: string;
  title: string;
  tasks: Task[];
  milestones: Milestone[];
  deliverables: Deliverable[];
}

// ─── RISK ────────────────────────────────────────────────────────

export interface RiskItem {
  id: string;
  category: 'technical' | 'social' | 'economic' | 'environmental';
  title: string;
  description: string;
  likelihood: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  mitigation: string;
}

// ─── KER ─────────────────────────────────────────────────────────

export interface KERItem {
  id: string;
  title: string;
  description: string;
  exploitationStrategy: string;
}

// ─── RESULT ITEMS ────────────────────────────────────────────────

export interface ResultItem {
  title: string;
  description: string;
  indicator: string;
}

// ─── PROJECT MANAGEMENT ──────────────────────────────────────────

export interface ProjectManagementStructure {
  coordinator: string;
  steeringCommittee: string;
  advisoryBoard: string;
  wpLeaders: string;
}

export interface ProjectManagement {
  description: string;
  structure: ProjectManagementStructure;
}

// ─── PROJECT IDEA ────────────────────────────────────────────────

export interface ProjectIdea {
  projectTitle: string;
  projectAcronym: string;
  startDate: string;
  durationMonths: number;
  mainAim: string;
  proposedSolution: string;
  stateOfTheArt: string;
  readinessLevels: ReadinessLevels;
  policies: PolicyItem[];
}

// ─── FULL PROJECT DATA ───────────────────────────────────────────
// ★ v7.0: Added indirectCostSettings

export interface ProjectData {
  problemAnalysis: ProblemAnalysis;
  projectIdea: ProjectIdea;
  generalObjectives: ObjectiveItem[];
  specificObjectives: ObjectiveItem[];
  projectManagement: ProjectManagement;
  activities: WorkPackage[];
  outputs: ResultItem[];
  outcomes: ResultItem[];
  impacts: ResultItem[];
  risks: RiskItem[];
  kers: KERItem[];
  partners?: ProjectPartner[];
  fundingModel?: FundingModel;
  maxPartners?: number;
  indirectCostSettings?: IndirectCostSettings;
  references?: Reference[];  // ★ EO-069: collected references array
  approvedSources?: ApprovedSource[];  // ★ EO-084: authoritative source pool
}

// ─── VERSIONING & META ───────────────────────────────────────────

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  language: 'en' | 'si';
  version: number;
}

export interface SavedProject {
  meta: ProjectMeta;
  data: ProjectData;
  translations?: Record<string, ProjectData>;
}

// ─── MODAL CONFIGURATION ─────────────────────────────────────────

export interface ModalConfig {
  isOpen: boolean;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'confirm' | 'choice';
  actions?: ModalAction[];
}

export interface ModalAction {
  label: string;
  variant: 'primary' | 'secondary' | 'danger';
  onClick: () => void;
}

// ─── EXPORT & CHART TYPES ────────────────────────────────────────

export interface ExportData {
  projectName: string;
  exportDate: string;
  data: ProjectData;
}

export interface ChartImageData {
  stepKey: string;
  subStepKey: string;
  imageDataUrl: string;
  width: number;
  height: number;
}

// ─── AUTH ─────────────────────────────────────────────────────────

export interface AuthRecord {
  id: string;
  email: string;
  displayName?: string;
  apiKey?: string;
  modelName?: string;
  createdAt: string;
}

// ─── INSTRUCTIONS ────────────────────────────────────────────────

export interface InstructionSet {
  id: string;
  name: string;
  systemPrompt: string;
  isDefault: boolean;
}

// ─── GANTT / PERT ────────────────────────────────────────────────

export interface GanttTask {
  id: string;
  wpId: string;
  title: string;
  startDate: string;
  endDate: string;
  dependencies: TaskDependency[];
  progress?: number;
}

export interface PERTTask {
  id: string;
  wpId: string;
  title: string;
  duration: number;
  earliestStart: number;
  earliestFinish: number;
  latestStart: number;
  latestFinish: number;
  slack: number;
  isCritical: boolean;
  dependencies: string[];
}

// ─── READINESS LEVEL DEFINITIONS ─────────────────────────────────

export interface ReadinessLevelDefinition {
  level: number;
  title: string;
}

export interface ReadinessLevelCategory {
  name: string;
  description: string;
  levels: ReadinessLevelDefinition[];
}

export interface ReadinessLevelsDefinitions {
  TRL: ReadinessLevelCategory;
  SRL: ReadinessLevelCategory;
  ORL: ReadinessLevelCategory;
  LRL: ReadinessLevelCategory;
}

// ─── STEP NAVIGATION ─────────────────────────────────────────────

export interface StepDefinition {
  id: number;
  key: string;
  title: string;
  color: string;
}

export interface SubStepDefinition {
  id: string;
  key: string;
  title: string;
}

// ─── ADMIN ───────────────────────────────────────────────────────

export type AdminRole = 'superadmin' | 'admin' | 'user';

export interface AdminUserProfile {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  createdAt: string;
  lastLogin?: string;
  apiKey?: string;
  modelName?: string;
}

export interface AdminLog {
  id: string;
  userId: string;
  action: string;
  details: string;
  timestamp: string;
}

// ─── CHART VISUALIZATION ─────────────────────────────────────────

export type ChartType =
  | 'bar'
  | 'pie'
  | 'line'
  | 'radar'
  | 'doughnut'
  | 'polarArea'
  | 'bubble'
  | 'scatter'
  | 'treemap'
  | 'sankey'
  | 'horizontalBar'
  | 'stackedBar'
  | 'heatmap'
  | 'funnel'
  | 'waterfall'
  | 'gauge'
  | 'timeline'
  | 'orgChart'
  | 'flowChart'
  | 'mindMap'
  | 'network';

export interface ExtractedDataPoint {
  label: string;
  value: number;
  category?: string;
  group?: string;
}

export interface ChartDataExtraction {
  chartType: ChartType;
  title: string;
  data: ExtractedDataPoint[];
  labels?: string[];
  datasets?: any[];
}

// ─── APPROVED SOURCES ────────────────────────────────────────────
// ★ v8.3: EO-084 — Authoritative source pool for retrieval-only citation

export type AuthorityScore = number; // 50–100 scale

export interface ApprovedSource {
  id: string;                  // unique ID (nanoid-style)
  doi?: string;                // DOI if available
  title: string;               // publication/report title
  authors: string;             // 'Smith, J., Novak, A.' or 'European Commission'
  year: number | string;       // publication year
  source: string;              // journal / publisher / database
  url: string;                 // verified URL
  authorityScore: AuthorityScore; // 50–100: CrossRef DOI=100, OpenAlex DOI=90, EUR-Lex=85, Eurostat/OECD/WB=80, official=70, manual=50
  retrievedFrom: string;       // 'crossref' | 'openalex' | 'manual' | 'prompt-context'
  sectionKey?: string;         // section the source was retrieved for
  queryUsed?: string;          // search query that found this source
  retrievedAt?: string;        // ISO timestamp of retrieval
}

// ─── REFERENCES ─────────────────────────────────────────────────
// ★ v8.0: EO-069: Reference system for academic citations
// ★ v8.1: EO-080: urlVerified tracks whether URL is from a trusted source
// ★ v8.2: EO-083: Real URL verification fields (verificationMethod, verificationStatus, resolvedUrl, canonicalUrl, metadataVerified)
// ★ v8.3: EO-084: sourceId links Reference to an ApprovedSource

export interface Reference {
  id: string;               // unique ID (nanoid-style short id)
  sectionKey: string;       // e.g. 'stateOfTheArt', 'problemAnalysis'
  fieldKey: string;         // e.g. 'description', 'background'
  inlineMarker: string;     // marker in text, e.g. '[PA-1]' (EO-141) or legacy '[1]'
  chapterPrefix?: string;   // EO-141: 'PA','PI','GO','SO','AC','ER' — chapter-level grouping
  authors: string;          // 'Smith, J., Novak, A.'
  year: number | string;    // 2024
  title: string;            // publication/study title
  source: string;           // journal / conference / organization name
  url: string;              // full URL
  accessedDate?: string;    // access date (optional)
  doi?: string;             // DOI if available (optional)
  note?: string;            // user note (optional)
  addedBy: 'ai' | 'manual'; // whether AI generated or manually added
  urlVerified?: boolean;    // v8.1 EO-080: urlVerified tracks whether URL is from a trusted source
  verificationMethod?: string;   // v8.2 EO-083: method used to verify URL ('head'|'get'|'doi-resolve'|'crossref'|'none')
  verificationStatus?: string;   // v8.2 EO-083: verification result ('verified'|'broken'|'redirected'|'not-found'|'timeout'|'pending')
  resolvedUrl?: string;          // v8.2 EO-083: final resolved URL after following redirects
  canonicalUrl?: string;         // v8.2 EO-083: canonical URL from CrossRef or DOI resolution
  metadataVerified?: boolean;    // v8.2 EO-083: whether title/authors matched CrossRef metadata
  sourceId?: string;               // v8.3 EO-084: links to ApprovedSource.id when matched
}

// ─── ORGANIZATION / MULTI-TENANT (v5.1) ─────────────────────────

export type OrgRole = 'owner' | 'admin' | 'member';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  logoUrl?: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  email: string;
  displayName?: string;
  joinedAt: string;
}

export interface OrganizationInstructions {
  id: string;
  organizationId: string;
  systemPrompt: string;
  updatedAt: string;
  updatedBy: string;
}

// ─── EO-138: API Cost Tracking ───────────────────────────────

export interface UsageRecord {
  timestamp: string;
  provider: string;
  model: string;
  sectionKey: string;
  chapterKey: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUSD: number;
  costEUR: number;
  isRetry: boolean;
  generationPath: string;
}

export interface ChapterUsage {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostEUR: number;
  lastModel: string;
  lastGenerated: string;
  records: UsageRecord[];
}

export interface ProjectUsage {
  chapters: Record<string, ChapterUsage>;
  grandTotalEUR: number;
  grandTotalTokens: number;
  usdToEurRate: number;
}

// [EO-138 footer]
