// services/DataExtractionService.ts
// ═══════════════════════════════════════════════════════════════
// v1.8 — 2026-02-25 — Finance charts in extractStructuralData (budget, partners, PM, hours)
// v1.7 — 2026-02-25 — Reduced token budget via sectionKey 'chartExtraction' (1024 tokens)
// v1.6 — 2026-02-25 — Lowered extraction thresholds + expanded prompt for objectives/results
// v1.5 — 2026-02-25 — FIX: Re-throw RATE_LIMIT, INSUFFICIENT_CREDITS, MISSING_API_KEY
// v1.4 — 2026-02-21 — Risk severity/category normalization
// v1.3 — 2026-02-21 — Bilingual extractStructuralData
// v1.2 — 2026-02-18 — Completeness calculation fix
// ═══════════════════════════════════════════════════════════════

import {
  generateContent,
  hasValidProviderKey,
  getProviderConfig,
} from './aiProvider.ts';
import { Type } from '@google/genai';
import {
  PM_HOURS_PER_MONTH,
  CENTRALIZED_DIRECT_COSTS,
  DECENTRALIZED_DIRECT_COSTS,
} from '../types.ts';

// ─── Types ───────────────────────────────────────────────────

export interface ExtractedDataPoint {
  label: string;
  value: number;
  unit?: string;
  category?: string;
  source?: string;
  year?: number;
}

export type ChartType =
  | 'comparison_bar'
  | 'donut'
  | 'line'
  | 'radar'
  | 'heatmap'
  | 'gauge'
  | 'stacked_bar'
  | 'progress'
  | 'sankey';

export interface ExtractedChartData {
  id: string;
  chartType: ChartType;
  title: string;
  subtitle?: string;
  dataPoints: ExtractedDataPoint[];
  source?: string;
  textSnippet: string;
  confidence: number;
}

// ─── JSON Schema for AI extraction ──────────────────────────

var extractionSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      subtitle: { type: Type.STRING },
      suggestedChartType: {
        type: Type.STRING,
        enum: ['comparison_bar', 'donut', 'line', 'radar', 'gauge', 'stacked_bar', 'progress']
      },
      dataPoints: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            label: { type: Type.STRING },
            value: { type: Type.NUMBER },
            unit: { type: Type.STRING },
            category: { type: Type.STRING },
            source: { type: Type.STRING },
            year: { type: Type.INTEGER },
          },
          required: ['label', 'value']
        }
      },
      source: { type: Type.STRING },
      textSnippet: { type: Type.STRING },
      confidence: { type: Type.NUMBER },
    },
    required: ['title', 'suggestedChartType', 'dataPoints', 'textSnippet', 'confidence']
  }
};

// ─── Schema to text (for OpenRouter) ─────────────────────────

var schemaToText = function (schema: any): string {
  try {
    return '\n\nRESPONSE JSON SCHEMA (follow exactly):\n' + JSON.stringify(schema, null, 2) + '\n';
  } catch (e) {
    return '';
  }
};

// ─── Extraction prompt ───────────────────────────────────────
// ★ v1.6: Expanded prompt for objectives, expected results, before/after comparisons

var EXTRACTION_PROMPT = 'You are a data extraction specialist. Analyze the following text and extract ALL empirical data points that could be visualized in a chart or graph.\n\nWHAT TO EXTRACT:\n- Percentages (e.g., "37% of citizens", "increased by 23%")\n- Absolute numbers (e.g., "6,000 professionals", "35 EU projects")\n- Comparisons (e.g., "50% perceive X while only 37% feel Y")\n- Time series data (e.g., "grew from 12% in 2019 to 28% in 2023")\n- Rankings or distributions (e.g., "Technical 40%, Social 30%, Economic 30%")\n- Scores or levels (e.g., "TRL 4", "readiness level 6 out of 9")\n- Targets and goals (e.g., "reduce from 10% to 5%", "increase by 30%", "reach 500 participants")\n- Before/after comparisons (e.g., "current state: 15%, expected: 25%")\n- Indicators and milestones (e.g., "train 200 teachers", "publish 5 toolkits")\n- Any mentioned counts, quantities, durations, or measurable outcomes\n\nRULES:\n1. Extract ONLY data explicitly stated in the text — do NOT infer or calculate.\n2. Each visualization should have 1–8 data points.\n3. Include the source/citation if mentioned in the text.\n4. Include the exact text snippet that contains the data.\n5. Set confidence: 0.9+ for explicit numbers, 0.5-0.9 for clear implications, below 0.5 for rough approximations.\n6. If NO empirical data is found at all, return an empty array [].\n7. suggestedChartType: use comparison_bar for comparisons and before/after targets, donut for distributions, line for time series, gauge for single metrics, progress for completion/readiness levels.\n8. If the text describes targets, goals, indicators, expected changes, or before/after comparisons, extract these as data points even if they are qualitative targets. For each such target, create a comparison chart with chartType "comparison_bar" showing current state vs. expected result.\n9. Be generous in extraction — if a number or percentage appears in the text, include it as a data point. Even a SINGLE number is worth extracting as a gauge chart.\n\nTEXT TO ANALYZE:\n';

// ─── Main extraction function ────────────────────────────────
// ★ v1.5: Re-throws RATE_LIMIT, INSUFFICIENT_CREDITS, MISSING_API_KEY
// ★ v1.6: Lowered filter thresholds (1 datapoint, 0.3 confidence)

export var extractEmpiricalData = async function (
  text: string,
  fieldContext?: string
): Promise<ExtractedChartData[]> {
  if (!text || text.trim().length < 20) return [];
  if (!hasValidProviderKey()) throw new Error('MISSING_API_KEY');

  var config = getProviderConfig();
  var needsTextSchema = config.provider !== 'gemini';
  var textSchemaStr = needsTextSchema ? schemaToText(extractionSchema) : '';

  var contextNote = fieldContext
    ? '\n[Context: This text is from the "' + fieldContext + '" section of an EU project proposal.]\n'
    : '';

  var prompt = EXTRACTION_PROMPT + contextNote + '\n---\n' + text + '\n---' + textSchemaStr;
    
  try {
    var result = await generateContent({
      prompt: prompt,
      jsonSchema: config.provider === 'gemini' ? extractionSchema : undefined,
      temperature: 0.2,
      sectionKey: 'chartExtraction',
    });

    if (!result || !result.text) return [];

    var parsed: any[];
    var cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return [];
    }

    if (!Array.isArray(parsed)) return [];

    // ★ v1.6: Lowered thresholds — 1 data point minimum, 0.3 confidence minimum
    var extracted: ExtractedChartData[] = parsed
      .filter(function (item: any) {
        return item.dataPoints &&
          Array.isArray(item.dataPoints) &&
          item.dataPoints.length >= 1 &&
          (typeof item.confidence !== 'number' || item.confidence >= 0.3);
      })
      .map(function (item: any, index: number) {
        return {
          id: 'chart-' + Date.now() + '-' + index,
          chartType: item.suggestedChartType || 'comparison_bar',
          title: item.title || 'Data Visualization',
          subtitle: item.subtitle || undefined,
          dataPoints: item.dataPoints.map(function (dp: any) {
            return {
              label: dp.label || 'Unknown',
              value: typeof dp.value === 'number' ? dp.value : parseFloat(dp.value) || 0,
              unit: dp.unit || undefined,
              category: dp.category || undefined,
              source: dp.source || undefined,
              year: dp.year || undefined,
            };
          }),
          source: item.source || undefined,
          textSnippet: item.textSnippet || '',
          confidence: typeof item.confidence === 'number' ? item.confidence : 0.7,
        };
      });

    console.log('[DataExtraction] Extracted ' + extracted.length + ' visualizable dataset(s) from text.');
    return extracted;

  } catch (err: any) {
    var errMsg = (err && err.message) ? err.message : String(err);
    console.warn('[DataExtraction] Extraction failed:', errMsg);

    // ★ v1.5: Re-throw critical errors so caller can show proper UI
    if (errMsg.indexOf('RATE_LIMIT') >= 0 || errMsg.indexOf('429') >= 0 || errMsg.indexOf('Quota') >= 0) {
      throw err;
    }
    if (errMsg.indexOf('INSUFFICIENT_CREDITS') >= 0 || errMsg.indexOf('402') >= 0 || errMsg.indexOf('afford') >= 0) {
      throw err;
    }
    if (errMsg.indexOf('MISSING_API_KEY') >= 0) {
      throw err;
    }
    return [];
  }
};

// ─── Helpers for structural extraction ───────────────────────

var SKIP_KEYS = new Set([
  'id', 'project_id', 'created_at', 'updated_at',
  'category', 'likelihood', 'impact', 'type', 'dependencies',
]);

var hasRealString = function (v: any): boolean {
  return typeof v === 'string' && v.trim().length > 0;
};

var arrayHasRealContent = function (arr: any[]): boolean {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  return arr.some(function (item: any) {
    if (typeof item === 'string') return item.trim().length > 0;
    if (typeof item !== 'object' || item === null) return false;
    return Object.entries(item).some(function (entry) {
      var k = entry[0];
      var v = entry[1];
      if (SKIP_KEYS.has(k)) return false;
      if (typeof v === 'string') return v.trim().length > 0;
      if (Array.isArray(v)) return arrayHasRealContent(v);
      return false;
    });
  });
};

// ─── Per-section completeness calculator ─────────────────────

var getSectionCompleteness = function (projectData: any, sectionKey: string): number {
  var data = projectData && projectData[sectionKey];
  if (!data) return 0;

  switch (sectionKey) {
    case 'problemAnalysis': {
      var score = 0, total = 3;
      if (hasRealString(data.coreProblem && data.coreProblem.title) || hasRealString(data.coreProblem && data.coreProblem.description)) score++;
      if (arrayHasRealContent(data.causes)) score++;
      if (arrayHasRealContent(data.consequences)) score++;
      return Math.round((score / total) * 100);
    }

    case 'projectIdea': {
      var s2 = 0, t2 = 5;
      if (hasRealString(data.projectTitle)) s2++;
      if (hasRealString(data.projectAcronym)) s2++;
      if (hasRealString(data.mainAim)) s2++;
      if (hasRealString(data.stateOfTheArt)) s2++;
      if (hasRealString(data.proposedSolution)) s2++;
      if (arrayHasRealContent(data.policies)) { s2++; t2++; }
      var rl2 = data.readinessLevels;
      if (rl2 && (rl2.TRL || rl2.SRL || rl2.ORL || rl2.LRL)) {
        var levels = [rl2.TRL, rl2.SRL, rl2.ORL, rl2.LRL];
        var hasAnyLevel = levels.some(function (r: any) {
          return r && typeof r.level === 'number' && r.level > 0;
        });
        if (hasAnyLevel) { s2++; t2++; }
      }
      return t2 === 0 ? 0 : Math.round((s2 / t2) * 100);
    }

    case 'generalObjectives':
    case 'specificObjectives': {
      if (!Array.isArray(data) || data.length === 0) return 0;
      var filled = data.filter(function (item: any) {
        return hasRealString(item.title) || hasRealString(item.description);
      });
      return filled.length === 0 ? 0 : Math.round((filled.length / data.length) * 100);
    }

    case 'activities': {
      if (!Array.isArray(data) || data.length === 0) return 0;
      var filledWp = data.filter(function (wp: any) {
        return hasRealString(wp.title) ||
          arrayHasRealContent(wp.tasks) ||
          arrayHasRealContent(wp.milestones) ||
          arrayHasRealContent(wp.deliverables);
      });
      return filledWp.length === 0 ? 0 : Math.round((filledWp.length / data.length) * 100);
    }

    case 'outputs':
    case 'outcomes':
    case 'impacts':
    case 'kers': {
      if (!Array.isArray(data) || data.length === 0) return 0;
      var filledR = data.filter(function (item: any) {
        return hasRealString(item.title) || hasRealString(item.description);
      });
      return filledR.length === 0 ? 0 : Math.round((filledR.length / data.length) * 100);
    }

    case 'risks': {
      if (!Array.isArray(data) || data.length === 0) return 0;
      var filledRisk = data.filter(function (item: any) {
        return hasRealString(item.title) || hasRealString(item.description) || hasRealString(item.mitigation);
      });
      return filledRisk.length === 0 ? 0 : Math.round((filledRisk.length / data.length) * 100);
    }

    default:
      return 0;
  }
};

// ─── Normalization helpers ───────────────────────────────────

var normalizeSeverity = function (val: string | undefined): 'low' | 'medium' | 'high' | null {
  if (!val) return null;
  var v = val.toString().toLowerCase().trim();
  if (v === 'high' || v === 'visoka' || v === 'visok' || v === 'veliko' || v === 'velika' || v === '3') return 'high';
  if (v === 'medium' || v === 'srednja' || v === 'srednji' || v === 'srednje' || v === '2') return 'medium';
  if (v === 'low' || v === 'nizka' || v === 'nizek' || v === 'nizko' || v === 'malo' || v === 'majhna' || v === '1') return 'low';
  if (v.indexOf('visok') >= 0 || v.indexOf('high') >= 0 || v.indexOf('kriticn') >= 0 || v.indexOf('critical') >= 0) return 'high';
  if (v.indexOf('sredn') >= 0 || v.indexOf('medium') >= 0 || v.indexOf('zmern') >= 0 || v.indexOf('moderate') >= 0) return 'medium';
  if (v.indexOf('nizk') >= 0 || v.indexOf('low') >= 0 || v.indexOf('majhn') >= 0 || v.indexOf('zanemarljiv') >= 0) return 'low';
  return null;
};

var normalizeCategory = function (val: string | undefined, language: 'en' | 'si'): string {
  if (!val) return language === 'si' ? 'Neznano' : 'Unknown';
  var v = val.toString().toLowerCase().trim();
  var catMap: Record<string, { en: string; si: string }> = {
    'technical': { en: 'Technical', si: 'Tehnicno' },
    'tehnicno': { en: 'Technical', si: 'Tehnicno' },
    'social': { en: 'Social', si: 'Druzbeno' },
    'druzbeno': { en: 'Social', si: 'Druzbeno' },
    'economic': { en: 'Economic', si: 'Ekonomsko' },
    'ekonomsko': { en: 'Economic', si: 'Ekonomsko' },
    'financial': { en: 'Financial', si: 'Financno' },
    'financno': { en: 'Financial', si: 'Financno' },
    'environmental': { en: 'Environmental', si: 'Okoljsko' },
    'okoljsko': { en: 'Environmental', si: 'Okoljsko' },
    'legal': { en: 'Legal', si: 'Pravno' },
    'pravno': { en: 'Legal', si: 'Pravno' },
    'organizational': { en: 'Organizational', si: 'Organizacijsko' },
    'organizacijsko': { en: 'Organizational', si: 'Organizacijsko' },
    'political': { en: 'Political', si: 'Politicno' },
    'politicno': { en: 'Political', si: 'Politicno' },
  };
  var mapped = catMap[v];
  if (mapped) return mapped[language];
  return val.charAt(0).toUpperCase() + val.slice(1);
};

// ─── Extract from structured project data ────────────────────
// ★ v1.8: Added finance charts (budget overview, per WP, per partner, PM, hours, partner count)

export var extractStructuralData = function (projectData: any, language: 'en' | 'si'): ExtractedChartData[] {
  if (!language) language = 'en';
  var results: ExtractedChartData[] = [];
  var si = language === 'si';

  // 1. Readiness Levels Radar
  var rl = projectData && projectData.projectIdea && projectData.projectIdea.readinessLevels;
  if (rl) {
    var dataPoints: ExtractedDataPoint[] = [];
    var keys = ['TRL', 'SRL', 'ORL', 'LRL'];
    var hasData = false;

    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var rlEntry = rl[key];
      var level = rlEntry && rlEntry.level;
      if (typeof level === 'number' && level > 0) {
        hasData = true;
        dataPoints.push({
          label: key,
          value: level,
          unit: si ? 'stopnja' : 'level',
          category: 'readiness',
        });
      }
    }

    if (hasData && dataPoints.length >= 2) {
      results.push({
        id: 'structural-readiness-radar',
        chartType: 'radar',
        title: si ? 'Stopnje pripravljenosti' : 'Readiness Levels',
        subtitle: 'TRL / SRL / ORL / LRL',
        dataPoints: dataPoints,
        textSnippet: si ? 'Ocena stopenj pripravljenosti projekta' : 'Project readiness levels assessment',
        confidence: 1.0,
      });
    }
  }

  // 2. Risk Matrix Summary
  var risks = projectData && projectData.risks;
  if (risks && Array.isArray(risks) && risks.length >= 1) {
    var realRisks = risks.filter(function (r: any) {
      return hasRealString(r.title) || hasRealString(r.description);
    });

    if (realRisks.length >= 1) {
      var categoryCounts: Record<string, number> = {};
      var likelihoodCounts: Record<string, number> = { low: 0, medium: 0, high: 0 };
      var impactCounts: Record<string, number> = { low: 0, medium: 0, high: 0 };

      realRisks.forEach(function (r: any) {
        var normLikelihood = normalizeSeverity(r.likelihood);
        var normImpact = normalizeSeverity(r.impact);
        if (normLikelihood) likelihoodCounts[normLikelihood]++;
        if (normImpact) impactCounts[normImpact]++;

        var catLabel = normalizeCategory(r.category, language);
        categoryCounts[catLabel] = (categoryCounts[catLabel] || 0) + 1;
      });

      var catPoints: ExtractedDataPoint[] = Object.entries(categoryCounts)
        .filter(function (entry) { return entry[1] > 0; })
        .map(function (entry) {
          return {
            label: entry[0],
            value: entry[1],
            unit: si ? 'tveganj' : 'risks',
            category: 'risk_category',
          };
        });

      if (catPoints.length >= 1) {
        results.push({
          id: 'structural-risk-categories',
          chartType: 'donut',
          title: si ? 'Tveganja po kategorijah' : 'Risks by Category',
          dataPoints: catPoints,
          textSnippet: si ? 'Porazdelitev registra tveganj projekta' : 'Project risk register distribution',
          confidence: 1.0,
        });
      }

      var severityPoints: ExtractedDataPoint[] = [
        { label: si ? 'Visoka verjetnost' : 'High Likelihood', value: likelihoodCounts.high || 0, category: 'likelihood' },
        { label: si ? 'Srednja verjetnost' : 'Medium Likelihood', value: likelihoodCounts.medium || 0, category: 'likelihood' },
        { label: si ? 'Nizka verjetnost' : 'Low Likelihood', value: likelihoodCounts.low || 0, category: 'likelihood' },
        { label: si ? 'Visok vpliv' : 'High Impact', value: impactCounts.high || 0, category: 'impact' },
        { label: si ? 'Srednji vpliv' : 'Medium Impact', value: impactCounts.medium || 0, category: 'impact' },
        { label: si ? 'Nizek vpliv' : 'Low Impact', value: impactCounts.low || 0, category: 'impact' },
      ].filter(function (p) { return p.value > 0; });

      if (severityPoints.length >= 1) {
        results.push({
          id: 'structural-risk-severity',
          chartType: 'stacked_bar',
          title: si ? 'Porazdelitev resnosti tveganj' : 'Risk Severity Distribution',
          subtitle: si ? 'Verjetnost in vpliv' : 'Likelihood vs Impact',
          dataPoints: severityPoints,
          textSnippet: si ? 'Analiza verjetnosti in vpliva tveganj' : 'Risk likelihood and impact analysis',
          confidence: 1.0,
        });
      }
    }
  }

  // 3. Project Completeness
  var sections = [
    { key: 'problemAnalysis', label: si ? 'Analiza problema' : 'Problem Analysis' },
    { key: 'projectIdea', label: si ? 'Projektna ideja' : 'Project Idea' },
    { key: 'generalObjectives', label: si ? 'Splosni cilji' : 'General Obj.' },
    { key: 'specificObjectives', label: si ? 'Specificni cilji' : 'Specific Obj.' },
    { key: 'activities', label: si ? 'Aktivnosti' : 'Activities' },
    { key: 'outputs', label: si ? 'Pricak. rezultati' : 'Expected Results' },
  ];

  var completenessPoints: ExtractedDataPoint[] = [];

  for (var j = 0; j < sections.length; j++) {
    var completeness = getSectionCompleteness(projectData, sections[j].key);
    completenessPoints.push({
      label: sections[j].label,
      value: completeness,
      unit: '%',
    });
  }

  if (completenessPoints.some(function (p) { return p.value > 0; })) {
    results.push({
      id: 'structural-completeness',
      chartType: 'comparison_bar',
      title: si ? 'Zapolnjenost projekta' : 'Project Completeness',
      subtitle: si ? 'Napredek po razdelkih' : 'Section-by-section progress',
      dataPoints: completenessPoints,
      textSnippet: si ? 'Pregled stanja zapolnjenosti projekta' : 'Project completion status overview',
      confidence: 1.0,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ★ v1.8: FINANCE CHARTS
  // ═══════════════════════════════════════════════════════════

  var partners = Array.isArray(projectData.partners) ? projectData.partners : [];
  var activities = Array.isArray(projectData.activities) ? projectData.activities : [];
  var fundingModel = projectData.fundingModel || 'centralized';
  var indirectSettings = projectData.indirectCostSettings || { percentage: 0, appliesToCategories: [] };

  // Helper: calculate indirect cost for one allocation
  var calcIndirect = function (alloc: any): number {
    if (!indirectSettings.percentage || indirectSettings.percentage <= 0) return 0;
    var applicableCats = indirectSettings.appliesToCategories || [];
    if (applicableCats.length === 0) return 0;
    var directCostDefs = fundingModel === 'centralized' ? CENTRALIZED_DIRECT_COSTS : DECENTRALIZED_DIRECT_COSTS;
    var applicableSum = (alloc.directCosts || []).reduce(function (sum: number, dc: any) {
      var catKey = dc.categoryKey || (directCostDefs[dc.categoryIndex] ? directCostDefs[dc.categoryIndex].key : '');
      return applicableCats.includes(catKey) ? sum + (dc.amount || 0) : sum;
    }, 0);
    return Math.round(applicableSum * (indirectSettings.percentage / 100));
  };

  // Collect all allocations across all WPs/tasks
  var allAllocations: any[] = [];
  activities.forEach(function (wp: any) {
    (wp.tasks || []).forEach(function (task: any) {
      (task.partnerAllocations || []).forEach(function (alloc: any) {
        var partner = partners.find(function (p: any) { return p.id === alloc.partnerId; });
        var directTotal = (alloc.directCosts || []).reduce(function (sum: number, dc: any) { return sum + (dc.amount || 0); }, 0);
        var indirectTotal = calcIndirect(alloc);
        allAllocations.push({
          wpId: wp.id || '',
          wpTitle: wp.title || '',
          partnerId: alloc.partnerId,
          partnerCode: partner ? partner.code : '?',
          partnerName: partner ? partner.name : '?',
          hours: alloc.hours || 0,
          pm: alloc.pm || 0,
          directTotal: directTotal,
          indirectTotal: indirectTotal,
          total: directTotal + indirectTotal,
        });
      });
    });
  });

  var hasFinanceData = allAllocations.length > 0;
  var grandDirectTotal = allAllocations.reduce(function (s, a) { return s + a.directTotal; }, 0);
  var grandIndirectTotal = allAllocations.reduce(function (s, a) { return s + a.indirectTotal; }, 0);
  var grandTotal = grandDirectTotal + grandIndirectTotal;

  // 4. Partner Count (gauge)
  var namedPartners = partners.filter(function (p: any) { return hasRealString(p.name); });
  if (namedPartners.length >= 1) {
    results.push({
      id: 'structural-partner-count',
      chartType: 'gauge',
      title: si ? 'Stevilo partnerjev' : 'Number of Partners',
      subtitle: si ? 'Konzorcij' : 'Consortium',
      dataPoints: [{
        label: si ? 'Partnerji' : 'Partners',
        value: namedPartners.length,
        unit: si ? 'partnerjev' : 'partners',
      }],
      textSnippet: si
        ? 'Projekt ima ' + namedPartners.length + ' partnerjev v konzorciju'
        : 'Project has ' + namedPartners.length + ' partners in the consortium',
      confidence: 1.0,
    });
  }

  // 5. Budget Overview (donut — Direct vs Indirect)
  if (hasFinanceData && grandTotal > 0) {
    var budgetOverviewPoints: ExtractedDataPoint[] = [
      { label: si ? 'Neposredni stroski' : 'Direct Costs', value: grandDirectTotal, unit: 'EUR', category: 'direct' },
    ];
    if (grandIndirectTotal > 0) {
      budgetOverviewPoints.push({ label: si ? 'Posredni stroski' : 'Indirect Costs', value: grandIndirectTotal, unit: 'EUR', category: 'indirect' });
    }
    results.push({
      id: 'structural-budget-overview',
      chartType: 'donut',
      title: si ? 'Pregled proracuna' : 'Budget Overview',
      subtitle: si ? 'Neposredni vs posredni stroski' : 'Direct vs Indirect Costs',
      dataPoints: budgetOverviewPoints,
      textSnippet: si
        ? 'Skupni proracun: ' + grandTotal.toLocaleString('de-DE') + ' EUR'
        : 'Total budget: ' + grandTotal.toLocaleString('de-DE') + ' EUR',
      confidence: 1.0,
    });
  }

  // 6. Budget per Work Package (bar chart)
  if (hasFinanceData) {
    var wpGroups: Record<string, { direct: number; indirect: number; total: number }> = {};
    allAllocations.forEach(function (a) {
      if (!wpGroups[a.wpId]) wpGroups[a.wpId] = { direct: 0, indirect: 0, total: 0 };
      wpGroups[a.wpId].direct += a.directTotal;
      wpGroups[a.wpId].indirect += a.indirectTotal;
      wpGroups[a.wpId].total += a.total;
    });

    var wpBudgetPoints: ExtractedDataPoint[] = Object.entries(wpGroups)
      .filter(function (entry) { return entry[1].total > 0; })
      .map(function (entry) {
        return { label: entry[0], value: entry[1].total, unit: 'EUR', category: 'wp_budget' };
      });

    if (wpBudgetPoints.length >= 1) {
      results.push({
        id: 'structural-budget-per-wp',
        chartType: 'comparison_bar',
        title: si ? 'Proracun po delovnih sklopih' : 'Budget per Work Package',
        subtitle: si ? 'Skupni stroski na DS' : 'Total cost per WP',
        dataPoints: wpBudgetPoints,
        textSnippet: si ? 'Razdelitev proracuna po delovnih sklopih' : 'Budget distribution across work packages',
        confidence: 1.0,
      });
    }
  }

  // 7. Budget per Partner (bar chart)
  if (hasFinanceData) {
    var partnerBudgetGroups: Record<string, number> = {};
    allAllocations.forEach(function (a) {
      var code = a.partnerCode || '?';
      partnerBudgetGroups[code] = (partnerBudgetGroups[code] || 0) + a.total;
    });

    var partnerBudgetPoints: ExtractedDataPoint[] = Object.entries(partnerBudgetGroups)
      .filter(function (entry) { return entry[1] > 0; })
      .map(function (entry) {
        return { label: entry[0], value: entry[1], unit: 'EUR', category: 'partner_budget' };
      });

    if (partnerBudgetPoints.length >= 1) {
      results.push({
        id: 'structural-budget-per-partner',
        chartType: 'comparison_bar',
        title: si ? 'Proracun po partnerjih' : 'Budget per Partner',
        subtitle: si ? 'Skupni stroski na partnerja' : 'Total cost per partner',
        dataPoints: partnerBudgetPoints,
        textSnippet: si ? 'Razdelitev proracuna po partnerjih' : 'Budget distribution across partners',
        confidence: 1.0,
      });
    }
  }

  // 8. Person-Months per Partner (donut)
  if (hasFinanceData) {
    var partnerPMGroups: Record<string, number> = {};
    allAllocations.forEach(function (a) {
      var code = a.partnerCode || '?';
      partnerPMGroups[code] = (partnerPMGroups[code] || 0) + a.pm;
    });

    var pmPoints: ExtractedDataPoint[] = Object.entries(partnerPMGroups)
      .filter(function (entry) { return entry[1] > 0; })
      .map(function (entry) {
        return { label: entry[0], value: Math.round(entry[1] * 10) / 10, unit: 'PM', category: 'pm' };
      });

    if (pmPoints.length >= 1) {
      var totalPM = pmPoints.reduce(function (s, p) { return s + p.value; }, 0);
      results.push({
        id: 'structural-pm-per-partner',
        chartType: 'donut',
        title: si ? 'Clovek-meseci po partnerjih' : 'Person-Months per Partner',
        subtitle: si ? 'Skupaj: ' + totalPM.toFixed(1) + ' PM' : 'Total: ' + totalPM.toFixed(1) + ' PM',
        dataPoints: pmPoints,
        textSnippet: si ? 'Razdelitev clovek-mesecev po partnerjih' : 'Person-month distribution across partners',
        confidence: 1.0,
      });
    }
  }

  // 9. Hours per Work Package (bar chart)
  if (hasFinanceData) {
    var wpHoursGroups: Record<string, number> = {};
    allAllocations.forEach(function (a) {
      wpHoursGroups[a.wpId] = (wpHoursGroups[a.wpId] || 0) + a.hours;
    });

    var hoursPoints: ExtractedDataPoint[] = Object.entries(wpHoursGroups)
      .filter(function (entry) { return entry[1] > 0; })
      .map(function (entry) {
        return { label: entry[0], value: entry[1], unit: si ? 'ur' : 'hours', category: 'hours' };
      });

    if (hoursPoints.length >= 1) {
      var totalHours = hoursPoints.reduce(function (s, p) { return s + p.value; }, 0);
      results.push({
        id: 'structural-hours-per-wp',
        chartType: 'comparison_bar',
        title: si ? 'Ure po delovnih sklopih' : 'Hours per Work Package',
        subtitle: si ? 'Skupaj: ' + totalHours.toLocaleString('de-DE') + ' ur' : 'Total: ' + totalHours.toLocaleString('de-DE') + ' hours',
        dataPoints: hoursPoints,
        textSnippet: si ? 'Razdelitev ur po delovnih sklopih' : 'Hours distribution across work packages',
        confidence: 1.0,
      });
    }
  }

  return results;
};
