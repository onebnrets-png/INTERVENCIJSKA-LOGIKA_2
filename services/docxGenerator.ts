// services/docxGenerator.ts
// ═══════════════════════════════════════════════════════════════
// v6.4 — 2026-03-25 — EO-158b + EO-158c: Footnote markers + Word repair fix
//   ★ v6.4: EO-158b: Footnotes now show [XX-N] marker (bold) at start
//            for cross-referencing with bibliography
//   ★ v6.4: EO-158c: postProcessDocx() — JSZip post-processing to fix:
//            - Separator/continuation footnotes (strip w:footnoteRef + w:rStyle)
//            - Missing endnotes.xml (add with relationships + content types)
//            - Missing w:space="0" on table borders
//            Word repair dialog ("Sprožne opombe") no longer appears.
//   - v6.3: EO-158: DOCX footnotes + bibliography (base implementation)
//   - v6.2: safeArray defensive handling
//   - v6.1: Partnership & Finance sections
// ═══════════════════════════════════════════════════════════════

import * as docx from 'docx';
import JSZip from 'jszip';
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

const { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, VerticalAlign, ImageRun, TableOfContents,
  FootnoteReferenceRun, ExternalHyperlink, TabStopType, TabStopPosition
} = docx;

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
// ★ v6.3: EO-158 — Reference footnotes + bibliography helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Finds all references for a given project from projectData.references
 * Returns a map: inlineMarker → Reference
 */
const buildReferenceMap = (references: any[]): Map<string, any> => {
  const map = new Map<string, any>();
  if (!references || !Array.isArray(references)) return map;
  references.forEach(ref => {
    if (ref.inlineMarker) {
      map.set(ref.inlineMarker, ref);
    }
  });
  return map;
};

/**
 * Assigns a global sequential footnote ID for each unique reference marker.
 * docx library requires footnote IDs to be unique positive integers.
 * Returns Map<inlineMarker, footnoteId>
 */
const assignFootnoteIds = (references: any[]): Map<string, number> => {
  const idMap = new Map<string, number>();
  if (!references || !Array.isArray(references)) return idMap;
  let nextId = 1;
  references.forEach(ref => {
    if (ref.inlineMarker && !idMap.has(ref.inlineMarker)) {
      idMap.set(ref.inlineMarker, nextId++);
    }
  });
  return idMap;
};

/**
 * Builds the footnotes config object for the Document constructor.
 * Each footnote contains: Author (Year). Title. Source. URL
 */
const buildFootnotesConfig = (references: any[], footnoteIdMap: Map<string, number>): Record<number, any> => {
  const config: Record<number, any> = {};
  if (!references || !Array.isArray(references)) return config;

  references.forEach(ref => {
    const fnId = footnoteIdMap.get(ref.inlineMarker);
    if (fnId === undefined) return;

    const children: any[] = [];

    // ★ EO-158b: Add original marker [XX-N] at start of footnote for identification
    if (ref.inlineMarker) {
      children.push(new TextRun({ text: `${ref.inlineMarker} `, bold: true, font: 'Calibri', size: 18 }));
    }

    if (ref.authors) {
      children.push(new TextRun({ text: ref.authors + ' ', font: 'Calibri', size: 18 }));
    }
    if (ref.year) {
      children.push(new TextRun({ text: `(${ref.year}). `, font: 'Calibri', size: 18 }));
    }
    if (ref.title) {
      children.push(new TextRun({ text: ref.title + '. ', italics: true, font: 'Calibri', size: 18 }));
    }
    if (ref.source) {
      children.push(new TextRun({ text: ref.source + '. ', font: 'Calibri', size: 18 }));
    }
    if (ref.url) {
      children.push(new ExternalHyperlink({
        children: [new TextRun({ text: ref.url, style: 'Hyperlink', font: 'Calibri', size: 18 })],
        link: ref.url,
      }));
    }
    if (ref.doi && !ref.url?.includes(ref.doi)) {
      children.push(new TextRun({ text: ` DOI: ${ref.doi}`, font: 'Calibri', size: 18 }));
    }

    if (children.length === 0) {
      children.push(new TextRun({ text: ref.inlineMarker || 'Unknown reference', font: 'Calibri', size: 18 }));
    }

    config[fnId] = {
      children: [new Paragraph({ children })],
    };
  });

  return config;
};

/**
 * Parses text containing [XX-N] markers and returns an array of TextRun/FootnoteReferenceRun.
 * Replaces each [XX-N] with a superscript footnote reference.
 * If the marker has no corresponding reference, it stays as plain text.
 */
const splitTextWithFootnotes = (
  text: string,
  refMap: Map<string, any>,
  footnoteIdMap: Map<string, number>
): any[] => {
  if (!text) return [];

  const markerRegex = /\[([A-Z]{2,3}-\d+)\]/g;
  const runs: any[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = markerRegex.exec(text)) !== null) {
    const before = text.substring(lastIndex, match.index);
    if (before) {
      const lines = before.split('\n');
      lines.forEach((line, i) => {
        runs.push(new TextRun(line));
        if (i < lines.length - 1) {
          runs.push(new TextRun({ break: 1 }));
        }
      });
    }

    const fullMarker = match[0];
    const fnId = footnoteIdMap.get(fullMarker);

    if (fnId !== undefined) {
      runs.push(new FootnoteReferenceRun(fnId));
    } else {
      runs.push(new TextRun(fullMarker));
    }

    lastIndex = match.index + match[0].length;
  }

  const remaining = text.substring(lastIndex);
  if (remaining) {
    const lines = remaining.split('\n');
    lines.forEach((line, i) => {
      runs.push(new TextRun(line));
      if (i < lines.length - 1) {
        runs.push(new TextRun({ break: 1 }));
      }
    });
  }

  return runs;
};

/**
 * Enhanced P() — creates a paragraph with footnote-aware text splitting.
 */
const PWithRefs = (
  text: string,
  refMap: Map<string, any>,
  footnoteIdMap: Map<string, number>
) => new Paragraph({ children: splitTextWithFootnotes(text, refMap, footnoteIdMap) });

/**
 * Builds the Bibliography / "Seznam virov" section at the end of the document.
 * Groups references by chapterPrefix (PA, PI, GO, SO, AC, ER).
 */
const buildBibliographySection = (
  references: any[],
  language: string
): (docx.Paragraph | docx.Table)[] => {
  const elements: (docx.Paragraph | docx.Table)[] = [];
  if (!references || references.length === 0) return elements;

  const title = language === 'si' ? 'SEZNAM VIROV' : 'REFERENCES';
  elements.push(H1(title));

  const chapterLabels: Record<string, Record<string, string>> = {
    'PA': { si: 'Analiza problemov', en: 'Problem Analysis' },
    'PI': { si: 'Projektna ideja', en: 'Project Idea' },
    'GO': { si: 'Splošni cilji', en: 'General Objectives' },
    'SO': { si: 'Specifični cilji', en: 'Specific Objectives' },
    'AC': { si: 'Aktivnosti', en: 'Activities' },
    'PM': { si: 'Upravljanje projekta', en: 'Project Management' },
    'ER': { si: 'Pričakovani rezultati', en: 'Expected Results' },
  };

  const grouped: Record<string, any[]> = {};
  references.forEach(ref => {
    const prefix = ref.chapterPrefix || 'OTHER';
    if (!grouped[prefix]) grouped[prefix] = [];
    grouped[prefix].push(ref);
  });

  const order = ['PA', 'PI', 'GO', 'SO', 'AC', 'PM', 'ER', 'OTHER'];

  order.forEach(prefix => {
    const refs = grouped[prefix];
    if (!refs || refs.length === 0) return;

    const lang = language === 'si' ? 'si' : 'en';
    const label = chapterLabels[prefix]?.[lang] || prefix;
    elements.push(H2(label));

    refs.sort((a, b) => {
      const aNum = parseInt(a.inlineMarker?.match(/\d+/)?.[0] || '0');
      const bNum = parseInt(b.inlineMarker?.match(/\d+/)?.[0] || '0');
      return aNum - bNum;
    });

    refs.forEach(ref => {
      const children: any[] = [];

      children.push(new TextRun({ text: `${ref.inlineMarker || '—'} `, bold: true }));

      if (ref.authors) {
        children.push(new TextRun({ text: ref.authors + ' ' }));
      }
      if (ref.year) {
        children.push(new TextRun({ text: `(${ref.year}). ` }));
      }
      if (ref.title) {
        children.push(new TextRun({ text: ref.title + '. ', italics: true }));
      }
      if (ref.source) {
        children.push(new TextRun({ text: ref.source + '. ' }));
      }
      if (ref.url) {
        children.push(new ExternalHyperlink({
          children: [new TextRun({ text: ref.url, style: 'Hyperlink' })],
          link: ref.url,
        }));
      }
      if (ref.doi && !ref.url?.includes(ref.doi)) {
        children.push(new TextRun({ text: ` DOI: ${ref.doi}` }));
      }

      elements.push(new Paragraph({ children, spacing: { after: 80 } }));
    });
  });

  return elements;
};

// ═══════════════════════════════════════════════════════════════
// renderProblemNode — EO-158: accepts refMap/footnoteIdMap
// ═══════════════════════════════════════════════════════════════
const renderProblemNode = (node, title, refMap: Map<string, any>, footnoteIdMap: Map<string, number>) => [
  H3(title),
  PWithRefs(node.description, refMap, footnoteIdMap),
];

// ═══════════════════════════════════════════════════════════════
// renderResultList — EO-158: accepts refMap/footnoteIdMap
// ═══════════════════════════════════════════════════════════════
const renderResultList = (items, title, prefix, indicatorLabel, descriptionLabel, refMap: Map<string, any>, footnoteIdMap: Map<string, number>) => [
  H2(title),
  ...safeArray(items).flatMap((item, index) => item.title ? [
    H3(`${prefix}${index + 1}: ${item.title}`),
    new Paragraph({ children: [Bold(`${descriptionLabel}: `), ...splitTextWithFootnotes(item.description, refMap, footnoteIdMap)] }),
    new Paragraph({ children: [Bold(`${indicatorLabel}: `), ...splitTextWithFootnotes(item.indicator, refMap, footnoteIdMap)] }),
  ] : []),
];


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
    const rawBlob = await Packer.toBlob(doc);
    return postProcessDocx(rawBlob);  // ★ EO-158c: Fix Word repair dialog
};


// ═══════════════════════════════════════════════════════════════
// ★ v6.4: EO-158c — Post-process DOCX to fix Word repair dialog
//   Fixes separator/continuation footnotes that docx-js generates
//   with invalid <w:footnoteRef/> and <w:rStyle> elements.
//   Also adds missing endnotes.xml if absent.
// ═══════════════════════════════════════════════════════════════

const postProcessDocx = async (blob: Blob): Promise<Blob> => {
  try {
    const zip = await JSZip.loadAsync(blob);

    // ── Fix 1: Clean separator/continuation footnotes in word/footnotes.xml ──
    const footnotesFile = zip.file('word/footnotes.xml');
    if (footnotesFile) {
      let xml = await footnotesFile.async('string');

      xml = xml.replace(
        /<w:footnote\s+w:type="separator"\s+w:id="-1">[^]*?<\/w:footnote>/g,
        '<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>'
      );

      xml = xml.replace(
        /<w:footnote\s+w:type="continuationSeparator"\s+w:id="0">[^]*?<\/w:footnote>/g,
        '<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>'
      );

      zip.file('word/footnotes.xml', xml);
      console.log('[EO-158c] Footnotes XML cleaned — separator/continuation footnotes fixed');
    }

    // ── Fix 2: Add endnotes.xml if missing (Word requires it when footnotes exist) ──
    if (!zip.file('word/endnotes.xml') && footnotesFile) {
      const endnotesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:endnotes xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" ' +
        'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
        'xmlns:o="urn:schemas-microsoft-com:office:office" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
        'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
        'xmlns:v="urn:schemas-microsoft-com:vml" ' +
        'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
        'xmlns:w10="urn:schemas-microsoft-com:office:word" ' +
        'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
        'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ' +
        'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" ' +
        'xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" ' +
        'xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" ' +
        'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" ' +
        'mc:Ignorable="w14 wp14">' +
        '<w:endnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:endnote>' +
        '<w:endnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:endnote>' +
        '</w:endnotes>';
      zip.file('word/endnotes.xml', endnotesXml);

      // Add endnotes relationship to word/_rels/document.xml.rels if missing
      const relsFile = zip.file('word/_rels/document.xml.rels');
      if (relsFile) {
        let relsXml = await relsFile.async('string');
        if (!relsXml.includes('endnotes.xml')) {
          const rIdMatches = relsXml.match(/Id="rId(\d+)"/g) || [];
          const maxId = rIdMatches.reduce((max, m) => {
            const num = parseInt(m.match(/\d+/)?.[0] || '0');
            return num > max ? num : max;
          }, 0);
          const newRId = `rId${maxId + 1}`;
          relsXml = relsXml.replace(
            '</Relationships>',
            `<Relationship Id="${newRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/></Relationships>`
          );
          zip.file('word/_rels/document.xml.rels', relsXml);
        }
      }

      // Add content type for endnotes if missing
      const contentTypesFile = zip.file('[Content_Types].xml');
      if (contentTypesFile) {
        let ctXml = await contentTypesFile.async('string');
        if (!ctXml.includes('endnotes.xml')) {
          ctXml = ctXml.replace(
            '</Types>',
            '<Override PartName="/word/endnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"/></Types>'
          );
          zip.file('[Content_Types].xml', ctXml);
        }
      }

      console.log('[EO-158c] Missing endnotes.xml added with relationships');
    }

    // ── Fix 3: Add w:space="0" to table borders if missing ──
    const documentFile = zip.file('word/document.xml');
    if (documentFile) {
      let docXml = await documentFile.async('string');
      docXml = docXml.replace(
        /<w:(top|bottom|left|right|insideH|insideV|start|end)\s+w:val="([^"]+)"\s+w:color="([^"]+)"\s+w:sz="(\d+)"\/>/g,
        (match, side, val, color, sz) => {
          if (match.includes('w:space=')) return match;
          return `<w:${side} w:val="${val}" w:color="${color}" w:sz="${sz}" w:space="0"/>`;
        }
      );
      zip.file('word/document.xml', docXml);
    }

    const cleanedBlob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    console.log('[EO-158c] DOCX post-processing complete — repair dialog should not appear');
    return cleanedBlob;

  } catch (err) {
    console.warn('[EO-158c] Post-processing failed, returning original blob:', err);
    return blob;
  }
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

  // ★ EO-158: Reference system setup
  const references = projectData.references || [];
  const refMap = buildReferenceMap(references);
  const footnoteIdMap = assignFootnoteIds(references);
  const footnotesConfig = buildFootnotesConfig(references, footnoteIdMap);

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
  children.push(PWithRefs(problemAnalysis.coreProblem.description, refMap, footnoteIdMap));
  children.push(H2(t.causes));
  problemAnalysis.causes.forEach((cause, i) => cause.title && children.push(...renderProblemNode(cause, `${t.causeTitle} #${i + 1}: ${cause.title}`, refMap, footnoteIdMap)));
  children.push(H2(t.consequences));
  problemAnalysis.consequences.forEach((consequence, i) => consequence.title && children.push(...renderProblemNode(consequence, `${t.consequenceTitle} #${i + 1}: ${consequence.title}`, refMap, footnoteIdMap)));

  // ─── 2. PROJECT IDEA ───
  children.push(H1(STEPS[1].title));
  children.push(H2(t.mainAim));
  children.push(PWithRefs(projectIdea.mainAim, refMap, footnoteIdMap));
  children.push(H2(t.stateOfTheArt));
  children.push(PWithRefs(projectIdea.stateOfTheArt, refMap, footnoteIdMap));
  children.push(H2(t.proposedSolution));
  children.push(PWithRefs(projectIdea.proposedSolution, refMap, footnoteIdMap));

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
  projectIdea.policies.forEach((policy) => policy.name && children.push(H3(policy.name), PWithRefs(policy.description, refMap, footnoteIdMap)));

  // ─── 3. GENERAL OBJECTIVES ───
  children.push(H1(STEPS[2].title));
  children.push(...renderResultList(generalObjectives, t.generalObjectives, 'GO', t.indicator, t.description, refMap, footnoteIdMap));

  // ─── 4. SPECIFIC OBJECTIVES ───
  children.push(H1(STEPS[3].title));
  children.push(...renderResultList(specificObjectives, t.specificObjectives, 'SO', t.indicator, t.description, refMap, footnoteIdMap));

  // ─── 5. ACTIVITIES ───
  children.push(H1(STEPS[4].title));

  // Project Management
  if (projectManagement) {
      children.push(H2(t.management.title));
      if (projectManagement.description && projectManagement.description.trim() !== '') {
          children.push(PWithRefs(projectManagement.description, refMap, footnoteIdMap));
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

    children.push(H4(t.tasks));
    const taskRows = wp.tasks.map(task => new TableRow({
        children: [
            new TableCell({ children: [P(task.id)] }),
            new TableCell({ children: [P(task.title)] }),
            new TableCell({ children: [PWithRefs(task.description, refMap, footnoteIdMap)] }),
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
        wp.milestones.forEach(m => m.description && children.push(new Paragraph({
            children: [new TextRun({ text: `${m.id}: `, bold: true }), ...splitTextWithFootnotes(m.description, refMap, footnoteIdMap)],
            bullet: { level: 0 }
        })));
    }

    // Deliverables
    if (wp.deliverables?.length > 0 && wp.deliverables.some(d => d.description)) {
        children.push(H4(t.deliverables));
        wp.deliverables.forEach(d => d.description && children.push(new Paragraph({
            children: [
                new TextRun({ text: `${d.id}: `, bold: true }),
                ...splitTextWithFootnotes(d.description, refMap, footnoteIdMap),
                new TextRun(` (${t.indicator}: `),
                ...splitTextWithFootnotes(d.indicator || '', refMap, footnoteIdMap),
                new TextRun(')'),
            ],
            bullet: { level: 0 }
        })));
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

      children.push(new Paragraph({ children: [
          Bold(`${tf.totalDirectCosts || 'Total Direct'}: `), new TextRun(`€${grandDirect.toLocaleString()}  |  `),
          Bold(`${tf.totalIndirectCosts || 'Total Indirect'}: `), new TextRun(`€${grandIndirect.toLocaleString()}  |  `),
          Bold(`${tf.grandTotal || 'Grand Total'}: `), new TextRun({ text: `€${grandTotal.toLocaleString()}`, bold: true }),
      ], spacing: { before: 150, after: 150 } }));

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
          children.push(PWithRefs(risk.description, refMap, footnoteIdMap));
          children.push(new Paragraph({ children: [Bold(`${t.risks.likelihood}: `), new TextRun({ text: t.risks.levels[risk.likelihood.toLowerCase()] || risk.likelihood, bold: true, color: getRiskColor(risk.likelihood) })] }));
          children.push(new Paragraph({ children: [Bold(`${t.risks.impact}: `), new TextRun({ text: t.risks.levels[risk.impact.toLowerCase()] || risk.impact, bold: true, color: getRiskColor(risk.impact) })] }));
          children.push(new Paragraph({ children: [Bold(`${t.risks.mitigation}: `)] }));
          children.push(PWithRefs(risk.mitigation, refMap, footnoteIdMap));
      });
  }

  // ─── 6. EXPECTED RESULTS ───
  children.push(H1(STEPS[5].title));
  children.push(...renderResultList(outputs, t.outputs, 'D', t.indicator, t.description, refMap, footnoteIdMap));
  children.push(...renderResultList(outcomes, t.outcomes, 'R', t.indicator, t.description, refMap, footnoteIdMap));
  children.push(...renderResultList(impacts, t.impacts, 'I', t.indicator, t.description, refMap, footnoteIdMap));

  if (safeArray(kers).length > 0) {
      children.push(H2(t.kers.kerTitle));
      safeArray(kers).forEach((ker, i) => {
          if (!ker.title) return;
          children.push(H3(`${ker.id || `KER${i+1}`}: ${ker.title}`));
          children.push(new Paragraph({ children: [Bold(`${t.description}: `), ...splitTextWithFootnotes(ker.description, refMap, footnoteIdMap)] }));
          children.push(new Paragraph({ children: [Bold(`${t.kers.exploitationStrategy}: `), ...splitTextWithFootnotes(ker.exploitationStrategy, refMap, footnoteIdMap)] }));
      });
  }

  // ★ EO-158: Bibliography / Seznam virov
  const bibliographySection = buildBibliographySection(references, language);
  children.push(...bibliographySection);

  // ─── BUILD DOCUMENT ───
  const doc = new Document({
    features: { updateFields: true },
    footnotes: footnotesConfig,  // ★ EO-158: Footnote definitions
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

  const rawBlob = await Packer.toBlob(doc);
  return postProcessDocx(rawBlob);  // ★ EO-158c: Fix Word repair dialog
};
