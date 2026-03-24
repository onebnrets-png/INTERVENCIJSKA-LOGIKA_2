// services/docxGenerator.ts
// ═══════════════════════════════════════════════════════════════
// v6.2 — 2026-02-24 — DEFENSIVE ARRAY HANDLING (safeArray)
//   ★ v6.2: NEW safeArray() utility — handles AI returning objects
//           instead of arrays (e.g. { objectives: [...] } vs [...])
//   ★ v6.2: renderResultList, activities, risks, kers all use safeArray()
//   - v6.1: Partnership & Finance sections in DOCX export
//   - All previous changes preserved.
// ═══════════════════════════════════════════════════════════════

import * as docx from 'docx';
import { getSteps, getReadinessLevelsDefinitions } from '../constants.tsx';
import { TEXT } from '../locales.ts';
import {
    PM_HOURS_PER_MONTH,
    CENTRALIZED_DIRECT_COSTS,
    CENTRALIZED_INDIRECT_COSTS,
    DECENTRALIZED_DIRECT_COSTS,
    DECENTRALIZED_INDIRECT_COSTS
} from '../types.ts';

const safeArray = (v: any): any[] => {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      if (Array.isArray(v[k])) return v[k];
    }
  }
  return [];
};

const { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, VerticalAlign, ImageRun, TableOfContents } = docx;

// Helper to handle multi-line text from textareas
const splitText = (text) => {
  if (!text) return [];
  return text.split('\n').flatMap((line, i, arr) => {
    const runs = [new TextRun(line)];
    if (i < arr.length - 1) {
      runs.push(new TextRun({ break: 1 }));
    }
    return runs;
  });
};

// Helper to convert Base64 string to Uint8Array for docx image support
const base64DataToUint8Array = (base64Data) => {
    const binaryString = window.atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

// H1 now starts on a new page (pageBreakBefore)
const H1 = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 }, pageBreakBefore: true });
const H2 = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } });
const H3 = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } });
const H4 = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_4, spacing: { before: 200, after: 100 } });
const P = (text) => new Paragraph({ children: splitText(text) });
const Bold = (text) => new TextRun({ text, bold: true });

const renderProblemNode = (node, title) => [
  H3(title),
  P(node.description),
];

const renderResultList = (items, title, prefix, indicatorLabel, descriptionLabel) => [
  H2(title),
  ...safeArray(items).flatMap((item, index) => item.title ? [
    H3(`${prefix}${index + 1}: ${item.title}`),
    new Paragraph({ children: [Bold(`${descriptionLabel}: `), ...splitText(item.description)] }),
    new Paragraph({ children: [Bold(`${indicatorLabel}: `), new TextRun(item.indicator)] }),
  ] : []),
];

// Helper: create a shaded header cell for tables
const headerCell = (text, width = undefined) => new TableCell({
    children: [new Paragraph({ children: [Bold(text)], alignment: AlignmentType.CENTER })],
    shading: { type: ShadingType.SOLID, color: 'D9E2F3' },
    verticalAlign: VerticalAlign.CENTER,
    ...(width ? { width: { size: width, type: WidthType.PERCENTAGE } } : {}),
});

// Helper: create a regular cell
const cell = (text, align = AlignmentType.LEFT) => new TableCell({
    children: [new Paragraph({ children: [new TextRun(text || '—')], alignment: align })],
    verticalAlign: VerticalAlign.CENTER,
});

// Helper: create a bold total cell
const totalCell = (text, align = AlignmentType.LEFT) => new TableCell({
    children: [new Paragraph({ children: [Bold(text || '—')], alignment: align })],
    shading: { type: ShadingType.SOLID, color: 'f2f2f2' },
    verticalAlign: VerticalAlign.CENTER,
});

/**
 * Parses markdown-like text from Gemini summary and converts to Docx paragraphs.
 */
const parseMarkdownToDocx = (text) => {
    const lines = text.split('\n');
    const elements = [];

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        if (trimmed.startsWith('# ')) { elements.push(H1(trimmed.substring(2))); return; }
        if (trimmed.startsWith('## ')) { elements.push(H2(trimmed.substring(3))); return; }
        if (trimmed.startsWith('### ')) { elements.push(H3(trimmed.substring(4))); return; }

        let isBullet = false;
        let content = trimmed;
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
            isBullet = true;
            content = trimmed.substring(2);
        }

        const parts = content.split(/(\*\*.*?\*\*)/g);
        const runs = parts.map(part => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return new TextRun({ text: part.slice(2, -2), bold: true });
            }
            return new TextRun({ text: part });
        });

        elements.push(new Paragraph({
            children: runs,
            bullet: isBullet ? { level: 0 } : undefined,
            spacing: { after: 120 }
        }));
    });

    return elements;
};

// ═══════════════════════════════════════════════════════════════
// ★ v6.1: Collect finance allocations from project data
// ═══════════════════════════════════════════════════════════════
const collectAllocations = (projectData) => {
    const partners = projectData.partners || [];
    const activities = Array.isArray(projectData.activities) ? projectData.activities : [];
    const allAllocations: any[] = [];

    activities.forEach((wp: any) => {
        (wp.tasks || []).forEach((task: any) => {
            (task.partnerAllocations || []).forEach((alloc: any) => {
                const partner = partners.find((p: any) => p.id === alloc.partnerId);
                const directTotal = (alloc.directCosts || []).reduce((sum: number, dc: any) => sum + (dc.amount || 0), 0);
                const indirectTotal = (alloc.indirectCosts || []).reduce((sum: number, ic: any) => {
                    return sum + Math.round(directTotal * ((ic.percentage || 0) / 100));
                }, 0);
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

    return allAllocations;
};


// ═══════════════════════════════════════════════════════════════
//  SUMMARY DOCX EXPORT (with TOC and page breaks)
// ═══════════════════════════════════════════════════════════════
export const generateSummaryDocx = async (summaryText, projectTitle, language = 'en') => {
    const parsedContent = parseMarkdownToDocx(summaryText);

    const doc = new Document({
        features: { updateFields: true },
        styles: {
            default: {
                document: { run: { font: "Calibri", size: 22 } },
                heading1: { run: { font: "Calibri", bold: true, size: 32, color: "2E74B5" }, paragraph: { spacing: { before: 240, after: 120 } } },
                heading2: { run: { font: "Calibri", bold: true, size: 26, color: "2E74B5" }, paragraph: { spacing: { before: 240, after: 120 } } },
                heading3: { run: { font: "Calibri", bold: true, size: 24, color: "1F4D78" } },
                title: { run: { font: "Calibri", bold: true, size: 56, color: "2E74B5" } }
            },
        },
        sections: [{
            properties: {},
            children: [
                new Paragraph({ text: projectTitle || 'Project Summary', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: language === 'si' ? 'Povzetek projekta' : 'Project Summary', bold: true, size: 28, color: "666666", italics: true })] }),
                new Paragraph({ children: [new TextRun({ text: language === 'si' ? 'KAZALO VSEBINE' : 'TABLE OF CONTENTS', bold: true, size: 32, color: "2E74B5" })], spacing: { before: 400, after: 200 } }),
                new TableOfContents(language === 'si' ? 'Kazalo vsebine' : 'Table of Contents', { hyperlink: true, headingStyleRange: '1-3', stylesWithLevels: [{ styleName: 'Heading1', level: 1 }, { styleName: 'Heading2', level: 2 }, { styleName: 'Heading3', level: 3 }] }),
                new Paragraph({ text: '', spacing: { after: 200 } }),
                ...parsedContent
            ]
        }]
    });
    return Packer.toBlob(doc);
};


// ═══════════════════════════════════════════════════════════════
//  FULL PROJECT DOCX EXPORT (with TOC and page breaks)
// ═══════════════════════════════════════════════════════════════
export const generateDocx = async (projectData, language = 'en', ganttData = null, pertData = null, organigramData = null) => {
  const { problemAnalysis, projectIdea, generalObjectives, specificObjectives, activities, outputs, outcomes, impacts, risks, kers, projectManagement } = projectData;
  const STEPS = getSteps(language);
  const t = TEXT[language];
  const tp = t.partners || {};
  const tf = t.finance || {};
  const READINESS_LEVELS_DEFINITIONS = getReadinessLevelsDefinitions(language);
  const partners = projectData.partners || [];
  const fundingModel = projectData.fundingModel || 'centralized';
  const lang = language === 'si' ? 'si' : 'en';

  const getRiskColor = (level) => {
      const l = level.toLowerCase();
      if (l === 'high') return "C00000";
      if (l === 'medium') return "FFC000";
      if (l === 'low') return "00B050";
      return "000000";
  };

  // ─── TITLE PAGE ───
  const children: (docx.Paragraph | docx.Table | docx.TableOfContents)[] = [
    new Paragraph({ text: projectIdea.projectTitle || 'Project Proposal', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: projectIdea.projectAcronym ? `(${projectIdea.projectAcronym})` : '', bold: true, size: 32, color: "2E74B5" })] }),
    new Paragraph({ children: [new TextRun({ text: language === 'si' ? 'KAZALO VSEBINE' : 'TABLE OF CONTENTS', bold: true, size: 32, color: "2E74B5" })], spacing: { before: 400, after: 200 } }),
    new TableOfContents(language === 'si' ? 'Kazalo vsebine' : 'Table of Contents', { hyperlink: true, headingStyleRange: '1-3', stylesWithLevels: [{ styleName: 'Heading1', level: 1 }, { styleName: 'Heading2', level: 2 }, { styleName: 'Heading3', level: 3 }] }),
    new Paragraph({ text: '', spacing: { after: 200 } }),
  ];

  // ─── 1. PROBLEM ANALYSIS ───
  children.push(H1(STEPS[0].title));
  children.push(H2(t.coreProblem));
  children.push(H3(problemAnalysis.coreProblem.title));
  children.push(P(problemAnalysis.coreProblem.description));
  children.push(H2(t.causes));
  problemAnalysis.causes.forEach((cause, i) => cause.title && children.push(...renderProblemNode(cause, `${t.causeTitle} #${i + 1}: ${cause.title}`)));
  children.push(H2(t.consequences));
  problemAnalysis.consequences.forEach((consequence, i) => consequence.title && children.push(...renderProblemNode(consequence, `${t.consequenceTitle} #${i + 1}: ${consequence.title}`)));

  // ─── 2. PROJECT IDEA ───
  children.push(H1(STEPS[1].title));
  children.push(H2(t.mainAim));
  children.push(P(projectIdea.mainAim));
  children.push(H2(t.stateOfTheArt));
  children.push(P(projectIdea.stateOfTheArt));
  children.push(H2(t.proposedSolution));
  children.push(P(projectIdea.proposedSolution));
  
  children.push(H2(t.readinessLevels));
  Object.entries(projectIdea.readinessLevels).forEach(([key, value]) => {
      const valueTyped = value as { level: number | null, justification: string };
      const def = READINESS_LEVELS_DEFINITIONS[key];
      if (valueTyped.level !== null) {
          children.push(H3(def.name));
          const levelInfo = def.levels.find(l => l.level === valueTyped.level);
          children.push(new Paragraph({ children: [Bold(`Level ${valueTyped.level}: `), new TextRun(levelInfo?.title || '')] }));
          children.push(P(valueTyped.justification));
      }
  });

  children.push(H2(t.euPolicies));
  projectIdea.policies.forEach((policy) => policy.name && children.push(H3(policy.name), P(policy.description)));

  // ─── 3. GENERAL OBJECTIVES ───
  children.push(H1(STEPS[2].title));
  children.push(...renderResultList(generalObjectives, t.generalObjectives, 'GO', t.indicator, t.description));

  // ─── 4. SPECIFIC OBJECTIVES ───
  children.push(H1(STEPS[3].title));
  children.push(...renderResultList(specificObjectives, t.specificObjectives, 'SO', t.indicator, t.description));
  
  // ─── 5. ACTIVITIES ───
  children.push(H1(STEPS[4].title));
  
  // Project Management
  if (projectManagement) {
      children.push(H2(t.management.title));
      if (projectManagement.description && projectManagement.description.trim() !== '') {
          children.push(P(projectManagement.description));
      }
      children.push(H3(t.management.organigram));
      if (organigramData && organigramData.dataUrl) {
          try {
              const imgWidth = 600; 
              const aspectRatio = organigramData.height / organigramData.width;
              const imgHeight = imgWidth * aspectRatio;
              const base64Data = organigramData.dataUrl.split(',')[1] || organigramData.dataUrl;
              const imageBuffer = base64DataToUint8Array(base64Data);
              children.push(new Paragraph({ children: [new ImageRun({ data: imageBuffer, transformation: { width: imgWidth, height: imgHeight }, type: "png" })] }));
          } catch (e) { console.warn("Could not embed Organigram image", e); }
      } else {
          children.push(new Paragraph({ children: [new TextRun({ text: "[Organigram Image Missing]", italics: true, color: "FF0000" })] }));
      }
      const s = projectManagement.structure;
      if (s) {
          if (s.coordinator) children.push(new Paragraph({ text: `${t.management.roles.coordinator}: ${s.coordinator}`, bullet: { level: 0 } }));
          if (s.steeringCommittee) children.push(new Paragraph({ text: `${t.management.roles.steering}: ${s.steeringCommittee}`, bullet: { level: 0 } }));
          if (s.technical) children.push(new Paragraph({ text: `${t.management.roles.technical}: ${s.technical}`, bullet: { level: 0 } }));
          if (s.advisoryBoard) children.push(new Paragraph({ text: `${t.management.roles.advisory}: ${s.advisoryBoard}`, bullet: { level: 0 } }));
      }
  }

  // ★ v6.1: PARTNERSHIP (CONSORTIUM)
  if (partners.length > 0) {
      children.push(H2(tp.title || 'Partnership (Consortium)'));
      children.push(new Paragraph({ children: [Bold(`${tp.fundingModel || 'Funding Model'}: `), new TextRun(fundingModel === 'centralized' ? (tp.centralized || 'Centralized') : (tp.decentralized || 'Decentralized'))] }));
      if (projectData.maxPartners) {
          children.push(new Paragraph({ children: [Bold(`${tp.maxPartners || 'Max Partners'}: `), new TextRun(String(projectData.maxPartners))] }));
      }
      children.push(new Paragraph({ text: '', spacing: { after: 100 } }));

      // Partner Table
      const partnerHeaderRow = new TableRow({
          children: [
              headerCell(tp.code || 'Code'),
              headerCell(tp.partnerName || 'Name'),
              headerCell(tp.expertise || 'Expertise'),
              headerCell(tp.partnerType || 'Type'),
              headerCell(tp.pmRate || 'PM Rate (EUR)'),
          ],
          tableHeader: true,
      });
      const partnerRows = partners.map((p, i) => new TableRow({
          children: [
              cell(p.code || (i === 0 ? 'CO' : `P${i + 1}`)),
              cell(p.name),
              cell(p.expertise),
              cell((tp.partnerTypes || {})[p.partnerType] || p.partnerType || ''),
              cell(p.pmRate ? `€${p.pmRate.toLocaleString()}` : '—', AlignmentType.RIGHT),
          ]
      }));
      children.push(new Table({
          rows: [partnerHeaderRow, ...partnerRows],
          width: { size: 100, type: WidthType.PERCENTAGE }
      }));
  }

  // Workplan
  children.push(H2(t.subSteps.workplan));
  safeArray(activities).forEach(wp => {
    if (!wp.title) return;
    children.push(H3(`${wp.id}: ${wp.title}`));
    
    // Tasks Table
    children.push(H4(t.tasks));
    const taskRows = wp.tasks.map(task => new TableRow({
        children: [
            new TableCell({ children: [P(task.id)] }),
            new TableCell({ children: [P(task.title)] }),
            new TableCell({ children: [P(task.description)] }),
            new TableCell({ children: [P(task.startDate)] }),
            new TableCell({ children: [P(task.endDate)] }),
        ]
    }));
    children.push(new Table({
        rows: [
            new TableRow({
                children: [t.id, t.title, t.description, t.startDate, t.endDate].map(header => new TableCell({ children: [new Paragraph({ children: [Bold(header)] })], shading: { type: ShadingType.SOLID, color: 'f2f2f2' } })),
                tableHeader: true,
            }),
            ...taskRows
        ],
        width: { size: 100, type: WidthType.PERCENTAGE }
    }));

    // ★ v6.1: Task-level Partner Allocations
    wp.tasks.forEach(task => {
        const taskAllocs = task.partnerAllocations || [];
        if (taskAllocs.length === 0) return;

        children.push(new Paragraph({ children: [Bold(`${task.id} — ${tp.partnerAllocation || 'Partner Allocations'}:`)], spacing: { before: 150, after: 80 } }));

        const allocHeaderRow = new TableRow({
            children: [
                headerCell(tp.code || 'Partner'),
                headerCell(tp.hours || 'Hours'),
                headerCell(tp.pm || 'PM'),
                headerCell(tf.directCosts || 'Direct'),
                headerCell(tf.indirectCosts || 'Indirect'),
                headerCell(tf.grandTotal || 'Total'),
            ],
            tableHeader: true,
        });
        const allocRows = taskAllocs.map(alloc => {
            const partner = partners.find(p => p.id === alloc.partnerId);
            const dTotal = (alloc.directCosts || []).reduce((s, dc) => s + (dc.amount || 0), 0);
            const iTotal = (alloc.indirectCosts || []).reduce((s, ic) => s + Math.round(dTotal * ((ic.percentage || 0) / 100)), 0);
            return new TableRow({
                children: [
                    cell(partner?.code || '?'),
                    cell(String(alloc.hours || 0), AlignmentType.RIGHT),
                    cell(String((alloc.pm || 0).toFixed(1)), AlignmentType.RIGHT),
                    cell(`€${dTotal.toLocaleString()}`, AlignmentType.RIGHT),
                    cell(`€${iTotal.toLocaleString()}`, AlignmentType.RIGHT),
                    cell(`€${(dTotal + iTotal).toLocaleString()}`, AlignmentType.RIGHT),
                ]
            });
        });
        children.push(new Table({
            rows: [allocHeaderRow, ...allocRows],
            width: { size: 100, type: WidthType.PERCENTAGE }
        }));
    });

    // Milestones
    if (wp.milestones?.length > 0 && wp.milestones.some(m => m.description)) {
        children.push(H4(t.milestones));
        wp.milestones.forEach(m => m.description && children.push(new Paragraph({ text: `${m.id}: ${m.description}`, bullet: { level: 0 } })));
    }
    
    // Deliverables
    if (wp.deliverables?.length > 0 && wp.deliverables.some(d => d.description)) {
        children.push(H4(t.deliverables));
        wp.deliverables.forEach(d => d.description && children.push(new Paragraph({ text: `${d.id}: ${d.description} (${t.indicator}: ${d.indicator})`, bullet: { level: 0 } })));
    }
  });

  // Gantt Chart
  children.push(H2(t.ganttChart));
  if (ganttData && ganttData.dataUrl) {
      try {
          const imgWidth = 680;
          const aspectRatio = ganttData.height / ganttData.width;
          const imgHeight = imgWidth * aspectRatio;
          const base64Data = ganttData.dataUrl.split(',')[1] || ganttData.dataUrl;
          const imageBuffer = base64DataToUint8Array(base64Data);
          children.push(new Paragraph({ children: [new ImageRun({ data: imageBuffer, transformation: { width: imgWidth, height: imgHeight }, type: "png" })] }));
      } catch (e) { console.warn("Could not embed Gantt image", e); }
  } else {
      children.push(new Paragraph({ children: [new TextRun({ text: "[Gantt Chart Image Missing]", italics: true, color: "FF0000" })] }));
  }

  // PERT Chart
  children.push(H2(t.pertChart));
  if (pertData && pertData.dataUrl) {
      try {
          const imgWidth = 680;
          const aspectRatio = pertData.height / pertData.width;
          const imgHeight = imgWidth * aspectRatio;
          const base64Data = pertData.dataUrl.split(',')[1] || pertData.dataUrl;
          const imageBuffer = base64DataToUint8Array(base64Data);
          children.push(new Paragraph({ children: [new ImageRun({ data: imageBuffer, transformation: { width: imgWidth, height: imgHeight }, type: "png" })] }));
      } catch (e) { console.warn("Could not embed PERT image", e); }
  } else {
      children.push(new Paragraph({ children: [new TextRun({ text: "[PERT Chart Image Missing]", italics: true, color: "FF0000" })] }));
  }

  // ★ v6.1: FINANCE (BUDGET) OVERVIEW
  const allAllocations = collectAllocations(projectData);
  if (allAllocations.length > 0) {
      children.push(H2(tf.title || 'Finance (Budget)'));
      children.push(new Paragraph({ children: [Bold(`${tf.costModel || 'Model'}: `), new TextRun(fundingModel === 'centralized' ? (tf.centralizedModel || 'Centralized') : (tf.decentralizedModel || 'Decentralized'))] }));

      const grandDirect = allAllocations.reduce((s, a) => s + a.directTotal, 0);
      const grandIndirect = allAllocations.reduce((s, a) => s + a.indirectTotal, 0);
      const grandTotal = grandDirect + grandIndirect;
      const grandHours = allAllocations.reduce((s, a) => s + a.hours, 0);
      const grandPM = allAllocations.reduce((s, a) => s + a.pm, 0);

      // Totals paragraph
      children.push(new Paragraph({ children: [
          Bold(`${tf.totalDirectCosts || 'Total Direct'}: `), new TextRun(`€${grandDirect.toLocaleString()}  |  `),
          Bold(`${tf.totalIndirectCosts || 'Total Indirect'}: `), new TextRun(`€${grandIndirect.toLocaleString()}  |  `),
          Bold(`${tf.grandTotal || 'Grand Total'}: `), new TextRun({ text: `€${grandTotal.toLocaleString()}`, bold: true }),
      ], spacing: { before: 150, after: 150 } }));

      // Per WP table
      children.push(H3(tf.perWP || 'Per Work Package'));
      const wpGroups: Record<string, any[]> = {};
      allAllocations.forEach(a => { if (!wpGroups[a.wpId]) wpGroups[a.wpId] = []; wpGroups[a.wpId].push(a); });

      const wpHeaderRow = new TableRow({
          children: [headerCell('WP'), headerCell(tf.directCosts || 'Direct'), headerCell(tf.indirectCosts || 'Indirect'), headerCell(tf.grandTotal || 'Total'), headerCell(tp.totalHours || 'Hours'), headerCell(tp.totalPM || 'PM')],
          tableHeader: true,
      });
      const wpDataRows = Object.entries(wpGroups).map(([wpId, items]) => {
          const d = items.reduce((s, a) => s + a.directTotal, 0);
          const ind = items.reduce((s, a) => s + a.indirectTotal, 0);
          const h = items.reduce((s, a) => s + a.hours, 0);
          const pm = items.reduce((s, a) => s + a.pm, 0);
          return new TableRow({ children: [cell(wpId), cell(`€${d.toLocaleString()}`, AlignmentType.RIGHT), cell(`€${ind.toLocaleString()}`, AlignmentType.RIGHT), cell(`€${(d + ind).toLocaleString()}`, AlignmentType.RIGHT), cell(String(h), AlignmentType.RIGHT), cell(pm.toFixed(1), AlignmentType.RIGHT)] });
      });
      const wpTotalRow = new TableRow({ children: [totalCell(tf.grandTotal || 'TOTAL'), totalCell(`€${grandDirect.toLocaleString()}`, AlignmentType.RIGHT), totalCell(`€${grandIndirect.toLocaleString()}`, AlignmentType.RIGHT), totalCell(`€${grandTotal.toLocaleString()}`, AlignmentType.RIGHT), totalCell(String(grandHours), AlignmentType.RIGHT), totalCell(grandPM.toFixed(1), AlignmentType.RIGHT)] });
      children.push(new Table({ rows: [wpHeaderRow, ...wpDataRows, wpTotalRow], width: { size: 100, type: WidthType.PERCENTAGE } }));

      // Per Partner table
      children.push(H3(tf.perPartner || 'Per Partner'));
      const partnerGroups: Record<string, any[]> = {};
      allAllocations.forEach(a => { if (!partnerGroups[a.partnerCode]) partnerGroups[a.partnerCode] = []; partnerGroups[a.partnerCode].push(a); });

      const pHeaderRow = new TableRow({
          children: [headerCell(tp.code || 'Partner'), headerCell(tf.directCosts || 'Direct'), headerCell(tf.indirectCosts || 'Indirect'), headerCell(tf.grandTotal || 'Total'), headerCell(tp.totalHours || 'Hours'), headerCell(tp.totalPM || 'PM')],
          tableHeader: true,
      });
      const pDataRows = Object.entries(partnerGroups).map(([code, items]) => {
          const d = items.reduce((s, a) => s + a.directTotal, 0);
          const ind = items.reduce((s, a) => s + a.indirectTotal, 0);
          const h = items.reduce((s, a) => s + a.hours, 0);
          const pm = items.reduce((s, a) => s + a.pm, 0);
          return new TableRow({ children: [cell(code), cell(`€${d.toLocaleString()}`, AlignmentType.RIGHT), cell(`€${ind.toLocaleString()}`, AlignmentType.RIGHT), cell(`€${(d + ind).toLocaleString()}`, AlignmentType.RIGHT), cell(String(h), AlignmentType.RIGHT), cell(pm.toFixed(1), AlignmentType.RIGHT)] });
      });
      const pTotalRow = new TableRow({ children: [totalCell(tf.grandTotal || 'TOTAL'), totalCell(`€${grandDirect.toLocaleString()}`, AlignmentType.RIGHT), totalCell(`€${grandIndirect.toLocaleString()}`, AlignmentType.RIGHT), totalCell(`€${grandTotal.toLocaleString()}`, AlignmentType.RIGHT), totalCell(String(grandHours), AlignmentType.RIGHT), totalCell(grandPM.toFixed(1), AlignmentType.RIGHT)] });
      children.push(new Table({ rows: [pHeaderRow, ...pDataRows, pTotalRow], width: { size: 100, type: WidthType.PERCENTAGE } }));
  }

  // Risks
  if (safeArray(risks).length > 0) {
      children.push(H2(t.subSteps.riskMitigation));
      safeArray(risks).forEach((risk, i) => {
          if (!risk.description) return;
          const categoryLabel = t.risks.categories[risk.category.toLowerCase()] || risk.category;
          children.push(H3(`${risk.id || `Risk ${i+1}`}: ${risk.title} (${categoryLabel})`));
          children.push(P(risk.description));
          children.push(new Paragraph({ children: [Bold(`${t.risks.likelihood}: `), new TextRun({ text: t.risks.levels[risk.likelihood.toLowerCase()] || risk.likelihood, bold: true, color: getRiskColor(risk.likelihood) })] }));
          children.push(new Paragraph({ children: [Bold(`${t.risks.impact}: `), new TextRun({ text: t.risks.levels[risk.impact.toLowerCase()] || risk.impact, bold: true, color: getRiskColor(risk.impact) })] }));
          children.push(new Paragraph({ children: [Bold(`${t.risks.mitigation}: `)] }));
          children.push(P(risk.mitigation));
      });
  }

  // ─── 6. EXPECTED RESULTS ───
  children.push(H1(STEPS[5].title));
  children.push(...renderResultList(outputs, t.outputs, 'D', t.indicator, t.description));
  children.push(...renderResultList(outcomes, t.outcomes, 'R', t.indicator, t.description));
  children.push(...renderResultList(impacts, t.impacts, 'I', t.indicator, t.description));

  if (safeArray(kers).length > 0) {
      children.push(H2(t.kers.kerTitle)); 
      safeArray(kers).forEach((ker, i) => {
          if (!ker.title) return;
          children.push(H3(`${ker.id || `KER${i+1}`}: ${ker.title}`));
          children.push(new Paragraph({ children: [Bold(`${t.description}: `), ...splitText(ker.description)] }));
          children.push(new Paragraph({ children: [Bold(`${t.kers.exploitationStrategy}: `), ...splitText(ker.exploitationStrategy)] }));
      });
  }

  // ─── BUILD DOCUMENT ───
  const doc = new Document({
    features: { updateFields: true },
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
        heading1: { run: { font: "Calibri", bold: true, size: 32, color: "2E74B5" } },
        heading2: { run: { font: "Calibri", bold: true, size: 26, color: "2E74B5" } },
        heading3: { run: { font: "Calibri", bold: true, size: 24, color: "1F4D78" } },
        heading4: { run: { font: "Calibri", bold: true, size: 22, color: "444444", italics: true } },
        title: { run: { font: "Calibri", bold: true, size: 56, color: "2E74B5" } }
      },
    },
    sections: [{ properties: {}, children }],
  });

  return Packer.toBlob(doc);
};
