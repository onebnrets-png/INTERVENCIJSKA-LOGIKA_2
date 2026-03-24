// components/DashboardHome.tsx
// ═══════════════════════════════════════════════════════════════════
// EURO-OFFICE Dashboard Home — Main view after login
// v7.2.3 — 2026-03-22 — EO-140c-HOTFIX5: Added useResponsive() to DashboardCard, ProjectChartsCard, AIChatbot (rc was undefined in their scope).
// v7.2.2 — 2026-03-22 — EO-140c-HOTFIX4: Moved containerRef from AIChatbot to DashboardHome (correct scope).
// v7.2.1 — 2026-03-22 — EO-140c-HOTFIX3: Added missing containerRef declaration (was causing ReferenceError crash).
// v7.2 — 2026-03-06
//
// CHANGES v7.2:
//   ★ AI Chatbot: replaced <input> with auto-resize <textarea>
//   ★ AI Chatbot: textarea grows with content up to 150px max
//   ★ AI Chatbot: Shift+Enter for new line, Enter to send
//   ★ AI Chatbot: height resets after sending message
// v7.1 — 2026-03-03
//
// CHANGES v7.1:
//   ★ AI Chatbot: text selectable + copy button on every AI response
//   ★ AI Chatbot: regenerate last response button
//   ★ AI Chatbot: thumbs up/down feedback on AI responses
//   ★ AI Chatbot: system prompt — always respond in user's question language
//   ★ AI Chatbot: system prompt — always cite verified sources with clickable links
//   ★ AI Chatbot: renderFormattedText — markdown links + bare URLs rendered as clickable
//   ★ AI Chatbot: export conversation as .md file
//   ★ AI Chatbot: search through conversation history
//   ★ AI Chatbot: improved typing animation (3-dot bounce)
//
// CHANGES v7.0:
//   ★ CRITICAL FIX: AI Chatbot now uses FULL Knowledge Base context (getAllExtractedTexts)
//   ★ AI Chatbot now includes Instructions.ts rules + global/org overrides
//   ★ AI Chatbot now injects active project context (title, acronym, objectives)
//   ★ AI Chatbot now uses taskType:'chatbot' for light model routing + rate limit
//   ★ System prompt completely rebuilt — EU project expert persona
//   ★ KB search still used for relevance ranking, but full context always included
//
// CHANGES v6.1:
//   ★ Responsive grid — 1 column on mobile (<768px), 2 on desktop
//   ★ Reduced padding on mobile, adaptive gap sizes
//   ★ Card resize buttons use dynamic gridCols
//   ★ Header text scales on mobile
//
// CHANGES v6.0:
//   - NEW: EmailModal — fullscreen overlay za pošiljanje emaila članu
//   - NEW: 3 send opcije: Gmail, Outlook, Default email klient
//   - NEW: Modal se odpre IZVEN kartice (fullscreen overlay z backdrop blur)
//   - FIX: Removed inline compose from OrganizationCard (replaced with modal trigger)
//
// CHANGES v5.0:
//   - FIX: AI chat markdown symbols now rendered as formatted text
//   - FIX: AI chat scroll positioning fixed (no more 20-line jump)
//   - REMOVED: Quick Statistics card
//   - REMOVED: AI Settings card
//   - NEW: Organization card shows members + their projects
//   - NEW: Project Charts card is now resizable (not forced wide)
//   - NEW: Modern Bento-grid inspired fluid layout
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { colors as lightColors, darkColors, shadows, radii, spacing, animation, typography } from '../design/theme.ts';
import { getThemeMode, onThemeChange } from '../services/themeService.ts';
import { storageService } from '../services/storageService.ts';
import { organizationService } from '../services/organizationService.ts';
import type { OrganizationMember } from '../services/organizationService.ts';
import { knowledgeBaseService } from '../services/knowledgeBaseService.ts';
import { getEffectiveOverrideSync } from '../services/globalInstructionsService.ts';
import { INTERVENTION_LOGIC_FRAMEWORK, HUMANIZATION_RULES, ACADEMIC_RIGOR_RULES } from '../services/Instructions.ts';
import { TEXT } from '../locales.ts';
import { generateContent, getRateLimitStatus } from '../services/aiProvider.ts';
import { extractStructuralData } from '../services/DataExtractionService.ts';
import type { ExtractedChartData } from '../services/DataExtractionService.ts';
import ChartRenderer from './ChartRenderer.tsx';
import { ProgressRing as DesignProgressRing } from '../design/index.ts';
import { supabase } from '../services/supabaseClient.ts';
import UsageDashboard from './UsageDashboard.tsx'; // EO-140c
import { useResponsive } from '../hooks/useResponsive.ts'; // EO-140c

// ——— Types ———————————————————————————————————————

interface DashboardHomeProps {
  language: 'en' | 'si';
  projectsMeta: any[];
  currentProjectId: string | null;
  projectData: any;
  activeOrg: any | null;
  userOrgs: any[];
  isAdmin: boolean;
  onOpenProject: (projectId: string) => void;
  onCreateProject: () => void;
  onOpenAdmin: (tab?: string) => void;
  onOpenSettings: () => void;
  onSwitchOrg: (orgId: string) => void;
}

interface ChatMessage { role: 'user' | 'assistant'; content: string; timestamp: number; rating?: 'up' | 'down' | null; }
interface ChatConversation { id: string; title: string; messages: ChatMessage[]; createdAt: number; updatedAt: number; }

type CardId = 'projects' | 'chatbot' | 'admin' | 'organization' | 'activity';

const DEFAULT_CARD_ORDER: CardId[] = ['projects', 'chatbot', 'organization', 'admin', 'activity'];
const DEFAULT_CARD_SIZES: Record<string, number> = { projects: 1, chatbot: 1, organization: 1, admin: 1, activity: 2 };

const CHAT_STORAGE_KEY = 'euro-office-chat-conversations';
const MAX_CONVERSATIONS = 20;
const GRID_COLS_DESKTOP = 2;
const GRID_COLS_MOBILE = 1;
const CHART_WIDTH = 260;
const CHART_HEIGHT = 160;

// ——— Markdown → Formatted Text (NO visible markdown symbols) ——

function renderFormattedText(text: string): React.ReactNode {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  const formatInline = (line: string, key: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let partIdx = 0;

    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);
      const codeMatch = remaining.match(/`(.+?)`/);
      const mdLinkMatch = remaining.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
      const bareLinkMatch = remaining.match(/(?<!\[|]\()https?:\/\/[^\s<>)\]]+/);

      const matches = [
        boldMatch ? { type: 'bold', match: boldMatch, idx: remaining.indexOf(boldMatch[0]) } : null,
        italicMatch ? { type: 'italic', match: italicMatch, idx: remaining.indexOf(italicMatch[0]) } : null,
        codeMatch ? { type: 'code', match: codeMatch, idx: remaining.indexOf(codeMatch[0]) } : null,
        mdLinkMatch ? { type: 'mdLink', match: mdLinkMatch, idx: remaining.indexOf(mdLinkMatch[0]) } : null,
        bareLinkMatch ? { type: 'bareLink', match: bareLinkMatch, idx: remaining.indexOf(bareLinkMatch[0]) } : null,
      ].filter(Boolean).sort((a, b) => a!.idx - b!.idx);

      if (matches.length >= 2 && matches[0]!.type === 'bareLink' && matches[1]!.type === 'mdLink' && matches[1]!.idx <= matches[0]!.idx + matches[0]!.match[0].length) {
        matches.splice(0, 1);
      }

      if (matches.length === 0) {
        parts.push(<span key={key + '-' + partIdx++}>{remaining}</span>);
        break;
      }

      const first = matches[0]!;
      if (first.idx > 0) {
        parts.push(<span key={key + '-' + partIdx++}>{remaining.substring(0, first.idx)}</span>);
      }

      const inner = first.match[1];
      if (first.type === 'bold') {
        parts.push(<strong key={key + '-' + partIdx++} style={{ fontWeight: 700 }}>{inner}</strong>);
      } else if (first.type === 'italic') {
        parts.push(<em key={key + '-' + partIdx++}>{inner}</em>);
      } else if (first.type === 'code') {
        parts.push(<code key={key + '-' + partIdx++} style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 4px', borderRadius: '3px', fontSize: '0.9em', fontFamily: 'monospace' }}>{inner}</code>);
      } else if (first.type === 'mdLink') {
        const linkText = first.match[1];
        const linkUrl = first.match[2];
        parts.push(<a key={key + '-' + partIdx++} href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', textDecoration: 'underline', wordBreak: 'break-all' as const }}>{linkText}</a>);
      } else if (first.type === 'bareLink') {
        const linkUrl = first.match[0];
        parts.push(<a key={key + '-' + partIdx++} href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', textDecoration: 'underline', wordBreak: 'break-all' as const }}>{linkUrl}</a>);
      }

      remaining = remaining.substring(first.idx + first.match[0].length);
    }

    return <span key={key}>{parts}</span>;
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('### ')) {
      elements.push(<div key={'l-' + i} style={{ fontWeight: 700, fontSize: '1em', margin: '8px 0 4px' }}>{formatInline(trimmed.slice(4), 'h3-' + i)}</div>);
    } else if (trimmed.startsWith('## ')) {
      elements.push(<div key={'l-' + i} style={{ fontWeight: 700, fontSize: '1.05em', margin: '8px 0 4px' }}>{formatInline(trimmed.slice(3), 'h2-' + i)}</div>);
    } else if (trimmed.startsWith('# ')) {
      elements.push(<div key={'l-' + i} style={{ fontWeight: 700, fontSize: '1.1em', margin: '10px 0 4px' }}>{formatInline(trimmed.slice(2), 'h1-' + i)}</div>);
    } else if (trimmed === '---' || trimmed === '***') {
      elements.push(<hr key={'l-' + i} style={{ border: 'none', borderTop: '1px solid rgba(128,128,128,0.2)', margin: '8px 0' }} />);
    } else if (/^[\*\-]\s/.test(trimmed)) {
      elements.push(<div key={'l-' + i} style={{ paddingLeft: '12px', margin: '2px 0', display: 'flex', gap: '6px' }}><span style={{ flexShrink: 0 }}>•</span><span>{formatInline(trimmed.slice(2), 'li-' + i)}</span></div>);
    } else if (/^\d+\.\s/.test(trimmed)) {
      const numEnd = trimmed.indexOf('. ');
      const num = trimmed.substring(0, numEnd + 1);
      elements.push(<div key={'l-' + i} style={{ paddingLeft: '12px', margin: '2px 0', display: 'flex', gap: '6px' }}><span style={{ flexShrink: 0 }}>{num}</span><span>{formatInline(trimmed.slice(numEnd + 2), 'nl-' + i)}</span></div>);
    } else if (trimmed === '') {
      elements.push(<div key={'l-' + i} style={{ height: '6px' }} />);
    } else {
      elements.push(<div key={'l-' + i} style={{ margin: '2px 0' }}>{formatInline(trimmed, 'p-' + i)}</div>);
    }
  });

  return <>{elements}</>;
}

// ——— Completeness helpers ————————————————————

const SKIP_KEYS = new Set(['id','project_id','created_at','updated_at','category','likelihood','impact','type','dependencies','startDate','durationMonths','_calculatedEndDate','_projectTimeframe']);
const hasRealStringContent = (v: any): boolean => typeof v === 'string' && v.trim().length > 0;
const arrayHasRealContent = (arr: any[]): boolean => {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  return arr.some((item: any) => {
    if (typeof item === 'string') return item.trim().length > 0;
    if (typeof item !== 'object' || item === null) return false;
    return Object.entries(item).some(([k, v]) => { if (SKIP_KEYS.has(k)) return false; if (typeof v === 'string') return v.trim().length > 0; if (Array.isArray(v)) return arrayHasRealContent(v); return false; });
  });
};
const objectHasRealContent = (obj: any): boolean => {
  if (!obj || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) return arrayHasRealContent(obj);
  return Object.entries(obj).some(([k, v]) => { if (SKIP_KEYS.has(k)) return false; if (typeof v === 'string') return v.trim().length > 0; if (Array.isArray(v)) return arrayHasRealContent(v); if (typeof v === 'object' && v !== null) return objectHasRealContent(v); return false; });
};

const calculateCompleteness = (pd: any): number => {
  if (!pd) return 0;
  const checks: { key: string; check: (d: any) => boolean }[] = [
    { key: 'problemAnalysis', check: (d) => d && (hasRealStringContent(d.coreProblem?.title) || hasRealStringContent(d.coreProblem?.description) || arrayHasRealContent(d.causes) || arrayHasRealContent(d.consequences)) },
    { key: 'projectIdea', check: (d) => d && (hasRealStringContent(d.projectTitle) || hasRealStringContent(d.projectAcronym) || hasRealStringContent(d.mainAim) || hasRealStringContent(d.stateOfTheArt) || hasRealStringContent(d.proposedSolution) || arrayHasRealContent(d.policies) || (d.readinessLevels && [d.readinessLevels.TRL, d.readinessLevels.SRL, d.readinessLevels.ORL, d.readinessLevels.LRL].some((r: any) => typeof r?.level === 'number' && r.level > 0))) },
    { key: 'generalObjectives', check: (d) => arrayHasRealContent(d) },
    { key: 'specificObjectives', check: (d) => arrayHasRealContent(d) },
    { key: 'projectManagement', check: (d) => d && (hasRealStringContent(d.description) || objectHasRealContent(d.structure)) },
    { key: 'activities', check: (d) => Array.isArray(d) && d.some((wp: any) => hasRealStringContent(wp.title) || arrayHasRealContent(wp.tasks) || arrayHasRealContent(wp.milestones) || arrayHasRealContent(wp.deliverables)) },
    { key: 'outputs', check: (d) => arrayHasRealContent(d) },
    { key: 'outcomes', check: (d) => arrayHasRealContent(d) },
    { key: 'impacts', check: (d) => arrayHasRealContent(d) },
    { key: 'risks', check: (d) => Array.isArray(d) && d.some((r: any) => hasRealStringContent(r.title) || hasRealStringContent(r.description) || hasRealStringContent(r.mitigation)) },
    { key: 'kers', check: (d) => arrayHasRealContent(d) },
  ];
  let filled = 0, total = 0;
  for (const { key, check } of checks) { const data = pd?.[key]; if (data === undefined || data === null) continue; total++; if (check(data)) filled++; }
  return total === 0 ? 0 : Math.round((filled / total) * 100);
};

function getProjectProgress(pd: any): number {
  if (!pd) return 0;
  let f = 0; const t = 8;
  if (pd.problemAnalysis?.coreProblem?.title?.trim()) f++;
  if (pd.projectIdea?.mainAim?.trim()) f++;
  if (pd.generalObjectives?.some((o: any) => o.title?.trim())) f++;
  if (pd.specificObjectives?.some((o: any) => o.title?.trim())) f++;
  if (pd.activities?.some((a: any) => a.title?.trim())) f++;
  if (pd.outputs?.some((o: any) => o.title?.trim())) f++;
  if (pd.outcomes?.some((o: any) => o.title?.trim())) f++;
  if (pd.impacts?.some((o: any) => o.title?.trim())) f++;
  return Math.round((f / t) * 100);
}

const LocalProgressRing: React.FC<{ percent: number; size?: number; strokeWidth?: number; color: string; bgColor: string }> = ({ percent, size = 64, strokeWidth = 6, color, bgColor }) => {
  const r = (size - strokeWidth) / 2; const c = 2 * Math.PI * r; const o = c - (percent / 100) * c;
  return (<svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={bgColor} strokeWidth={strokeWidth}/><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={c} strokeDashoffset={o} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.6s ease' }}/></svg>);
};

// ——— DashboardCard ————————————————————————

interface CardProps {
  id: CardId; title: string; icon: string; children: React.ReactNode;
  isDark: boolean; colors: any; colSpan: number; language: 'en' | 'si';
  gridCols: number;
  onResize: (id: CardId, span: number) => void;
  dragHandlers: { onDragStart: (e: React.DragEvent, id: CardId) => void; onDragOver: (e: React.DragEvent) => void; onDrop: (e: React.DragEvent, id: CardId) => void; onDragEnd: () => void; };
  draggingId: CardId | null;
}

const DashboardCard: React.FC<CardProps> = ({ id, title, icon, children, isDark, colors: c, colSpan, language, gridCols, onResize, dragHandlers, draggingId }) => {
  const { config: rc } = useResponsive(); // EO-140c-HOTFIX5
  const isDragging = draggingId === id;
  const span = Math.min(colSpan, gridCols);
  const cardDragRef = useRef(true);
  return (
    <div draggable={cardDragRef.current} onDragStart={function(e) { if (!cardDragRef.current) { e.preventDefault(); return; } dragHandlers.onDragStart(e, id); }} onDragOver={dragHandlers.onDragOver} onDrop={function(e) { dragHandlers.onDrop(e, id); }} onDragEnd={dragHandlers.onDragEnd}
      style={{ background: c.surface.card, borderRadius: radii.xl, border: '1px solid ' + (isDragging ? c.primary[400] : c.border.light), boxShadow: isDragging ? shadows.xl : shadows.card, overflow: 'hidden', opacity: isDragging ? 0.7 : 1, transform: isDragging ? 'scale(1.02)' : 'scale(1)', transition: 'all ' + animation.duration.fast + ' ' + animation.easing.default, gridColumn: 'span ' + span, display: 'flex', flexDirection: 'column' as const, minHeight: 0 }}>
      <div style={{ padding: spacing.md + ' ' + spacing.lg, borderBottom: '1px solid ' + c.border.light, display: 'flex', alignItems: 'center', gap: spacing.sm, flexShrink: 0, cursor: 'grab' }}>
        <span style={{ fontSize: '18px' }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: c.text.heading, flex: 1 }}>{title}</h3>
        {gridCols > 1 && (
          <div style={{ display: 'flex', gap: '2px', marginRight: spacing.xs }}>
            {span > 1 && <button onClick={(e) => { e.stopPropagation(); onResize(id, span - 1); }} draggable={false} title={language === 'si' ? 'Zoži' : 'Narrow'} style={{ background: 'none', border: '1px solid ' + c.border.light, borderRadius: radii.sm, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: c.text.muted, fontSize: rc.sidebar.fontSize.body }} onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? c.primary[900] + '30' : c.primary[50]; e.currentTarget.style.color = c.primary[600]; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = c.text.muted; }}>◂</button>}
            {span < gridCols && <button onClick={(e) => { e.stopPropagation(); onResize(id, span + 1); }} draggable={false} title={language === 'si' ? 'Razširi' : 'Widen'} style={{ background: 'none', border: '1px solid ' + c.border.light, borderRadius: radii.sm, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: c.text.muted, fontSize: rc.sidebar.fontSize.body }} onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? c.primary[900] + '30' : c.primary[50]; e.currentTarget.style.color = c.primary[600]; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = c.text.muted; }}>▸</button>}
          </div>
        )}
        <div style={{ cursor: 'grab', color: c.text.muted, display: 'flex' }}><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="3" r="1.5"/><circle cx="11" cy="3" r="1.5"/><circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/><circle cx="5" cy="13" r="1.5"/><circle cx="11" cy="13" r="1.5"/></svg></div>
      </div>
      <div onMouseEnter={function() { cardDragRef.current = false; }} onMouseLeave={function() { cardDragRef.current = true; }} style={{ padding: spacing.lg, flex: 1, overflow: 'auto', minHeight: 0, cursor: 'auto' }}>{children}</div>
    </div>
  );
};

const DropZone: React.FC<{ index: number; isDark: boolean; colors: any; draggingId: CardId | null; onDropAtEnd: (e: React.DragEvent) => void }> = ({ isDark, colors: c, draggingId, onDropAtEnd }) => {
  const [isOver, setIsOver] = useState(false);
  if (!draggingId) return null;
  return (<div onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setIsOver(true); }} onDragLeave={() => setIsOver(false)} onDrop={(e) => { e.preventDefault(); setIsOver(false); onDropAtEnd(e); }} style={{ gridColumn: 'span 1', minHeight: 80, borderRadius: radii.xl, border: '2px dashed ' + (isOver ? c.primary[400] : c.border.light), background: isOver ? (isDark ? c.primary[900] + '20' : c.primary[50]) : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', color: c.text.muted, fontSize: typography.fontSize.xs }}>{isOver ? '↓' : ''}</div>);
};

// ——— Project Charts Card — v6.2 — acronyms preloaded + auto-load first ————————

const ProjectChartsCard: React.FC<{
  language: 'en' | 'si'; isDark: boolean; colors: any; colSpan: number;
  projectsMeta: any[]; projectData: any;
  currentProjectId: string | null;
  onOpenProject: (projectId: string) => void;
}> = ({ language, isDark, colors: c, colSpan, projectsMeta, projectData, currentProjectId, onOpenProject }) => {
  const { config: rc } = useResponsive(); // EO-140c-HOTFIX5
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [loadedData, setLoadedData] = useState<Record<string, any>>({});
  const [loadedLang, setLoadedLang] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [acronyms, setAcronyms] = useState<Record<string, string>>({});
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoLoadedRef = useRef(false);
  const acronymsLoadedRef = useRef(false);

  useEffect(() => {
    if (acronymsLoadedRef.current || projectsMeta.length === 0) return;
    acronymsLoadedRef.current = true;

    const projectIds = projectsMeta.map(p => p.id);

    (async function() {
      try {
        var result = await supabase
          .from('project_data')
          .select('project_id, language, data->projectIdea->projectAcronym')
          .in('project_id', projectIds);
        var data = result.data;
        var error = result.error;
        if (!error && data) {
          var map: Record<string, string> = {};
          data.forEach(function(row: any) {
            var acr = row.projectAcronym;
            if (acr && typeof acr === 'string' && acr.trim()) {
              if (!map[row.project_id] || row.language === language) {
                map[row.project_id] = acr.trim();
              }
            }
          });
          setAcronyms(map);
        }
      } catch (err) {
        console.warn('ProjectChartsCard: Failed to preload acronyms', err);
      }
    })();

     }, [projectsMeta, language]);

  useEffect(function() {
    if (currentProjectId && projectData) {
      setLoadedData(function(prev) { return Object.assign({}, prev, { [currentProjectId]: projectData }); });
      setLoadedLang(function(prev) { return Object.assign({}, prev, { [currentProjectId]: language }); });
      if (!activeProjectId) setActiveProjectId(currentProjectId);
    }
  }, [currentProjectId, projectData, language]);

  const loadProjectData = useCallback(async function(projectId: string) {
    if (loadedData[projectId]) { setActiveProjectId(projectId); return; }
    if (projectId === currentProjectId && projectData) {
      setLoadedData(function(prev) { return Object.assign({}, prev, { [projectId]: projectData }); });
      setLoadedLang(function(prev) { return Object.assign({}, prev, { [projectId]: language }); });
      setActiveProjectId(projectId);
      return;
    }
    setLoadingId(projectId); setActiveProjectId(projectId);
    try {
      var usedLang = language;
      var data = await storageService.loadProject(language, projectId);
      if (!data) {
        usedLang = language === 'en' ? 'si' : 'en';
        data = await storageService.loadProject(usedLang, projectId);
      }
      if (data) {
        setLoadedData(function(prev) { return Object.assign({}, prev, { [projectId]: data }); });
        setLoadedLang(function(prev) { return Object.assign({}, prev, { [projectId]: usedLang }); });
      }
    } catch (err) {
      console.warn('ProjectChartsCard: Failed to load', projectId, err);
    } finally {
      setLoadingId(null);
    }
  }, [loadedData, currentProjectId, projectData, language]);
  useEffect(() => {
    if (autoLoadedRef.current) return;
    if (projectsMeta.length === 0) return;
    if (activeProjectId && loadedData[activeProjectId]) {
      autoLoadedRef.current = true;
      return;
    }

    const targetId = currentProjectId || projectsMeta[0]?.id;
    if (!targetId) return;
    autoLoadedRef.current = true;

    if (targetId === currentProjectId && projectData) {
      setLoadedData(prev => ({ ...prev, [targetId]: projectData }));
      setActiveProjectId(targetId);
      return;
    }

    (async function() {
      setLoadingId(targetId);
      setActiveProjectId(targetId);
      try {
        var usedLang = language;
        var data = await storageService.loadProject(language, targetId);
        if (!data) {
          usedLang = language === 'en' ? 'si' : 'en';
          data = await storageService.loadProject(usedLang, targetId);
        }
        if (data) {
          setLoadedData(function(prev) { return Object.assign({}, prev, { [targetId]: data }); });
          setLoadedLang(function(prev) { return Object.assign({}, prev, { [targetId]: usedLang }); });
        }
      } catch (err) {
        console.warn('ProjectChartsCard: Auto-load failed', targetId, err);
      } finally {
        setLoadingId(null);
      }
    })();
  }, [projectsMeta, currentProjectId, projectData, language]);

  const handleClick = useCallback((pid: string) => { loadProjectData(pid); }, [loadProjectData]);
  const handleMouseEnter = useCallback((pid: string) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => loadProjectData(pid), 300);
  }, [loadProjectData]);
  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
  }, []);
  useEffect(() => { return () => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); }; }, []);

  const activeData = activeProjectId ? loadedData[activeProjectId] : null;
  const chartsData = useMemo(function() {
    if (!activeData || !activeProjectId) return null;
    var dataLang = (loadedLang[activeProjectId]) || language;
    try { return extractStructuralData(activeData, dataLang); } catch { return null; }
  }, [activeData, activeProjectId, loadedLang, language]);
  const isLoading = loadingId === activeProjectId;
  const chartW = colSpan >= 2 ? CHART_WIDTH : Math.min(200, CHART_WIDTH);
  const chartH = colSpan >= 2 ? CHART_HEIGHT : Math.min(130, CHART_HEIGHT);
  const isNarrow = colSpan < 2;

  const getAcronym = (p: any): string => {
    if (acronyms[p.id]) return acronyms[p.id];
    const pData = loadedData[p.id];
    if (pData?.projectIdea?.projectAcronym?.trim()) return pData.projectIdea.projectAcronym.trim();
    if (p.acronym?.trim()) return p.acronym.trim();
    return '…';
  };
  return (
    <div style={{ display: 'flex', flexDirection: isNarrow ? 'column' as const : 'row' as const, gap: spacing.md, minHeight: isNarrow ? 300 : 220 }}>
      <div style={{
        width: isNarrow ? '100%' : 130, minWidth: isNarrow ? undefined : 110, flexShrink: 0,
        borderRight: isNarrow ? 'none' : '1px solid ' + c.border.light,
        borderBottom: isNarrow ? '1px solid ' + c.border.light : 'none',
        overflowY: 'auto', overflowX: isNarrow ? 'auto' : 'hidden',
        paddingRight: isNarrow ? 0 : spacing.xs, paddingBottom: isNarrow ? spacing.xs : 0,
        display: isNarrow ? 'flex' : 'block', gap: isNarrow ? spacing.xs : undefined,
        maxHeight: isNarrow ? 60 : undefined,
      }}>
        {!isNarrow && (
          <div style={{
            fontSize: rc.content.fontSize.xxs, color: c.text.muted, fontWeight: typography.fontWeight.semibold,
            marginBottom: spacing.sm, textTransform: 'uppercase' as const, letterSpacing: '0.05em',
          }}>
            {language === 'si' ? 'Projekti' : 'Projects'} ({projectsMeta.length})
          </div>
        )}
        {projectsMeta.map(p => {
          const isCurrent = p.id === currentProjectId;
          const isActive = p.id === activeProjectId;
          const acronym = getAcronym(p);
          const hasData = !!loadedData[p.id];

          return (
            <div
              key={p.id}
              onMouseEnter={() => handleMouseEnter(p.id)}
              onMouseLeave={handleMouseLeave}
              onClick={() => handleClick(p.id)}
              title={p.title || p.name || ''}
              style={{
                padding: isNarrow ? '3px 8px' : '6px ' + spacing.xs,
                borderRadius: radii.sm, cursor: 'pointer',
                background: isActive ? (isDark ? c.primary[900] + '60' : c.primary[100]) : 'transparent',
                borderLeft: isNarrow ? 'none' : (isActive ? '3px solid ' + c.primary[500] : '3px solid transparent'),
                borderBottom: isNarrow ? (isActive ? '2px solid ' + c.primary[500] : '2px solid transparent') : 'none',
                marginBottom: isNarrow ? 0 : 3,
                transition: 'background 0.15s ease',
                display: 'flex', alignItems: 'center', gap: spacing.xs, flexShrink: 0,
              }}
            >
              {hasData ? (
                <DesignProgressRing
                  value={calculateCompleteness(loadedData[p.id])}
                  size={22} strokeWidth={3} showLabel={true} labelSize="0.4rem"
                />
              ) : (
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: isDark ? '#334155' : c.primary[50],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: rc.content.fontSize.xxs, color: c.text.muted, fontWeight: 700,
                }}>
                  {p.id === loadingId ? '…' : acronym[0]}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: rc.sidebar.fontSize.body,
                  fontWeight: isActive ? typography.fontWeight.bold : typography.fontWeight.semibold,
                  color: isActive ? c.primary[600] : c.text.heading,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  maxWidth: isNarrow ? 80 : 90,
                }}>
                  {acronym}
                </div>
                {isCurrent && !isNarrow && (
                  <div style={{
                    fontSize: rc.content.fontSize.xxs, color: c.success[600], fontWeight: typography.fontWeight.semibold,
                  }}>
                    ● {language === 'si' ? 'naložen' : 'loaded'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' as const, gap: spacing.xs }}>
        {activeProjectId && (() => {
          const meta = projectsMeta.find(p => p.id === activeProjectId);
          if (!meta) return null;
          const acronym = getAcronym(meta);
          const fullTitle = activeData?.projectIdea?.projectTitle || meta.title || meta.name || '';

          return (
            <div style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs,
            }}>
              <span style={{
                fontSize: rc.content.fontSize.xs,
                background: isDark ? c.primary[900] : c.primary[100],
                color: c.primary[700], padding: '2px 8px', borderRadius: radii.full,
                fontWeight: typography.fontWeight.bold,
              }}>
                {acronym}
              </span>
              <span style={{
                fontSize: typography.fontSize.xs, color: c.text.heading,
                fontWeight: typography.fontWeight.semibold,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {fullTitle}
              </span>
              {activeProjectId !== currentProjectId && (
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenProject(activeProjectId); }}
                  style={{
                    background: 'none', border: '1px solid ' + c.border.light, borderRadius: radii.md,
                    padding: '2px 8px', fontSize: rc.content.fontSize.xxs, cursor: 'pointer',
                    color: c.primary[600], fontWeight: typography.fontWeight.semibold,
                    marginLeft: 'auto', flexShrink: 0,
                  }}
                >
                  {language === 'si' ? 'Odpri' : 'Open'}
                </button>
              )}
            </div>
          );
        })()}

        {!activeProjectId && (
          <div style={{
            color: c.text.muted, fontSize: typography.fontSize.sm, textAlign: 'center' as const,
            padding: spacing.xl, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {language === 'si' ? 'Izberite projekt' : 'Select a project'}
          </div>
        )}

        {activeProjectId && isLoading && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: typography.fontSize.xs, color: c.text.muted }}>
              {language === 'si' ? 'Nalagam...' : 'Loading...'}
              <span style={{ animation: 'pulse 1.5s infinite' }}> ●</span>
            </div>
          </div>
        )}

        {activeProjectId && !isLoading && activeData && (
          <div style={{
            flex: 1, overflowX: 'auto', overflowY: 'hidden',
            display: 'flex', flexDirection: 'row' as const,
            flexWrap: isNarrow ? 'wrap' as const : 'nowrap' as const,
            gap: spacing.sm, paddingBottom: spacing.xs, alignItems: 'flex-start',
          }}>
            {chartsData && chartsData.length > 0 && chartsData.map((chart: ExtractedChartData, idx: number) => (
              <div key={'c-' + idx + '-' + chart.chartType} style={{ flexShrink: 0, width: chartW }}>
                <ChartRenderer data={chart} width={chartW} height={chartH} showTitle={true} showSource={false} />
              </div>
            ))}

            {(!chartsData || chartsData.length === 0) && (
              <div style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: typography.fontSize.xs, color: c.text.muted, padding: spacing.lg, fontStyle: 'italic',
              }}>
                {language === 'si' ? 'Ni podatkov za grafike.' : 'No chart data.'}
              </div>
            )}
          </div>
        )}

        {/* EO-140c: API usage for active project */}
        {activeProjectId && !isLoading && activeData && (
          <div style={{ flexShrink: 0, paddingTop: spacing.xs }}>
            {activeData._usage && typeof UsageDashboard !== 'undefined' && UsageDashboard ? (
              <UsageDashboard usage={activeData._usage} language={language} variant="compact" isDark={isDark} />
            ) : (
              <div style={{ fontSize: typography.fontSize.xs, color: c.text.muted, fontStyle: 'italic', padding: spacing.xs + ' 0' }}>
                {language === 'si' ? 'Odprite projekt za prikaz porabe' : 'Open project to see usage'}
              </div>
            )}
          </div>
        )}

        {activeProjectId && !isLoading && !activeData && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: typography.fontSize.xs, color: c.text.muted, fontStyle: 'italic' }}>
              {language === 'si' ? 'Podatki niso na voljo.' : 'Data not available.'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
// ═══════════════════════════════════════════════════════════
// EMAIL MODAL — v6.0 — Fullscreen overlay with Gmail/Outlook/Mailto
// ═══════════════════════════════════════════════════════════

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipientName: string;
  recipientEmail: string;
  orgName: string;
  senderName: string;
  language: 'en' | 'si';
  isDarkMode: boolean;
}

const EmailModal: React.FC<EmailModalProps> = ({
  isOpen, onClose, recipientName, recipientEmail, orgName, senderName, language, isDarkMode,
}) => {
  const t = (en: string, si: string) => language === 'si' ? si : en;
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSubject('EURO-OFFICE: ' + t('Message from', 'Sporočilo od') + ' ' + senderName);
      setBody('');
      setSent(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const c = isDarkMode ? darkColors : lightColors;

  const buildSignature = () =>
    '\n\n---\n' + t('Sent via EURO-OFFICE', 'Poslano prek EURO-OFFICE') + '\n' + t('Organization', 'Organizacija') + ': ' + orgName + '\n' + t('From', 'Od') + ': ' + senderName;

  const fullBody = body + buildSignature();

  const handleGmail = () => {
    const url = 'https://mail.google.com/mail/?view=cm&to=' + encodeURIComponent(recipientEmail) + '&su=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(fullBody);
    window.open(url, '_blank');
    setSent(true);
    setTimeout(onClose, 600);
  };

  const handleOutlook = () => {
    const url = 'https://outlook.office.com/mail/deeplink/compose?to=' + encodeURIComponent(recipientEmail) + '&subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(fullBody);
    window.open(url, '_blank');
    setSent(true);
    setTimeout(onClose, 600);
  };

  const handleMailto = () => {
    window.open('mailto:' + recipientEmail + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(fullBody), '_blank');
    setSent(true);
    setTimeout(onClose, 600);
  };

  const canSend = subject.trim().length > 0 && body.trim().length > 0;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 8,
    border: '1px solid ' + (isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'),
    background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
    color: c.text?.heading || c.text, fontSize: 14, outline: 'none',
    boxSizing: 'border-box' as const, fontFamily: 'inherit',
    transition: 'border-color 0.2s',
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000, backdropFilter: 'blur(4px)', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: isDarkMode ? '#1e1e2e' : '#ffffff',
          borderRadius: 16, width: '100%', maxWidth: 600, maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 25px 60px rgba(0,0,0,0.35)',
          border: '1px solid ' + (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
        }}
      >
        <div style={{
          padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: '1px solid ' + (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'),
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontSize: 18,
          }}>
            ✉
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: c.text?.heading || c.text }}>
              {t('Send Message', 'Pošlji sporočilo')}
            </div>
            <div style={{ fontSize: 13, color: c.text?.muted || c.textSecondary, marginTop: 2 }}>
              {orgName}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: c.text?.muted || c.textSecondary, fontSize: 22, padding: 4,
            lineHeight: 1, borderRadius: 6,
          }}>
            ✕
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: c.text?.muted || c.textSecondary, display: 'block', marginBottom: 6 }}>
              {t('Recipient', 'Prejemnik')}
            </label>
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
              border: '1px solid ' + (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'),
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0,
              }}>
                {recipientName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: c.text?.heading || c.text }}>{recipientName}</div>
                <div style={{ fontSize: 12, color: c.text?.muted || c.textSecondary }}>{recipientEmail}</div>
              </div>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: c.text?.muted || c.textSecondary, display: 'block', marginBottom: 6 }}>
              {t('Subject', 'Zadeva')}
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#6366f1'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'; }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: c.text?.muted || c.textSecondary, display: 'block', marginBottom: 6 }}>
              {t('Message', 'Sporočilo')}
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder={t('Write your message here...', 'Napišite svoje sporočilo tukaj...')}
              style={{
                ...inputStyle,
                resize: 'vertical' as const,
                minHeight: 180,
                lineHeight: 1.6,
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#6366f1'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'; }}
            />
          </div>

          <div style={{
            fontSize: 12, color: c.text?.muted || c.textSecondary, padding: '10px 12px',
            background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            borderRadius: 8, lineHeight: 1.5,
          }}>
            {t(
              'Choose your preferred email service below. The message will be pre-filled in a new tab.',
              'Izberite želeno email storitev spodaj. Sporočilo bo vnaprej izpolnjeno v novem zavihku.'
            )}
          </div>
        </div>

        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid ' + (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'),
          display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', alignItems: 'center',
        }}>
          {sent && (
            <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 600, marginRight: 'auto' }}>
              {t('Opening email client...', 'Odpiranje email odjemalca...')}
            </span>
          )}

          <button onClick={onClose} style={{
            padding: '9px 18px', borderRadius: 8,
            border: '1px solid ' + (isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'),
            background: 'transparent', color: c.text?.muted || c.textSecondary,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            {t('Cancel', 'Prekliči')}
          </button>

          <button onClick={handleGmail} disabled={!canSend} style={{
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: canSend ? '#EA4335' : (isDarkMode ? '#334' : '#ddd'),
            color: canSend ? '#fff' : (c.text?.muted || '#999'),
            fontSize: 13, fontWeight: 700, cursor: canSend ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
          }}>
            Gmail
          </button>

          <button onClick={handleOutlook} disabled={!canSend} style={{
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: canSend ? '#0078D4' : (isDarkMode ? '#334' : '#ddd'),
            color: canSend ? '#fff' : (c.text?.muted || '#999'),
            fontSize: 13, fontWeight: 700, cursor: canSend ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
          }}>
            Outlook
          </button>

          <button onClick={handleMailto} disabled={!canSend} style={{
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: canSend ? '#6366f1' : (isDarkMode ? '#334' : '#ddd'),
            color: canSend ? '#fff' : (c.text?.muted || '#999'),
            fontSize: 13, fontWeight: 700, cursor: canSend ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
          }}>
            ✉ {t('Email Client', 'Email odjemalec')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// OrganizationCard — v6.0 — 2026-02-20
// ═══════════════════════════════════════════════════════════════

const OrganizationCard: React.FC<{
  language: 'en' | 'si';
  isDark: boolean;
  colors: any;
  activeOrg: any;
  userOrgs: any[];
  isAdmin: boolean;
  onSwitchOrg: (orgId: string) => void;
  onOpenProject?: (projectId: string) => void;
  onOpenEmailModal: (recipient: { name: string; email: string; orgName: string }) => void;
}> = ({ language, isDark, colors, activeOrg, userOrgs, isAdmin, onSwitchOrg, onOpenProject, onOpenEmailModal }) => {
  const t = (en: string, si: string) => language === 'si' ? si : en;

  interface OrgData {
    id: string; name: string; slug: string;
    members: { userId: string; displayName: string; email: string; orgRole: string; joinedAt: string; projectCount: number; }[];
    projects: { id: string; title: string; ownerName: string; ownerEmail: string; updatedAt: string; }[];
  }

  const [orgDataList, setOrgDataList] = React.useState<OrgData[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedOrgId, setExpandedOrgId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'members' | 'projects'>('members');

  const isSuperAdmin = storageService.isSuperAdmin();
  const isOrgAdmin = isAdmin;

  React.useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        let orgsToShow: any[] = [];

        if (isSuperAdmin) {
          orgsToShow = await organizationService.getAllOrgs();
        } else if (isOrgAdmin && activeOrg) {
          orgsToShow = [activeOrg];
        } else if (activeOrg) {
          orgsToShow = [activeOrg];
        }

        if (cancelled) return;

        const results: OrgData[] = [];

        for (const org of orgsToShow) {
          let members: any[] = [];
          try {
            members = await organizationService.getOrgMembers(org.id);
          } catch (e) {
            console.warn('Failed to load members for org ' + org.name + ':', e);
          }

          if (!isSuperAdmin && !isOrgAdmin) {
            const currentUserId = await storageService.getCurrentUserId();
            members = members.filter(m => m.userId === currentUserId);
          }

          let projects: any[] = [];
          try {
            const { data: projData, error: projErr } = await supabase
              .from('projects')
              .select('id, title, owner_id, updated_at')
              .eq('organization_id', org.id)
              .order('updated_at', { ascending: false });

            if (!projErr && projData) {
              if (!isSuperAdmin && !isOrgAdmin) {
                const currentUserId = await storageService.getCurrentUserId();
                projects = projData.filter(p => p.owner_id === currentUserId);
              } else {
                projects = projData;
              }
            }
          } catch (e) {
            console.warn('Failed to load projects for org ' + org.name + ':', e);
          }

          const memberMap = new Map(members.map(m => [m.userId, m]));
          const mappedProjects = projects.map(p => ({
            id: p.id,
            title: p.title || 'Untitled',
            ownerName: memberMap.get(p.owner_id)?.displayName || 'Unknown',
            ownerEmail: memberMap.get(p.owner_id)?.email || '',
            updatedAt: p.updated_at,
          }));

          const memberProjectCounts = new Map<string, number>();
          projects.forEach(p => {
            memberProjectCounts.set(p.owner_id, (memberProjectCounts.get(p.owner_id) || 0) + 1);
          });

          results.push({
            id: org.id, name: org.name, slug: org.slug || '',
            members: members.map(m => ({
              userId: m.userId,
              displayName: m.displayName || m.email?.split('@')[0] || 'Unknown',
              email: m.email || '',
              orgRole: m.orgRole || 'member',
              joinedAt: m.joinedAt || '',
              projectCount: memberProjectCounts.get(m.userId) || 0,
            })),
            projects: mappedProjects,
          });
        }

        if (!cancelled) {
          setOrgDataList(results);
          if (results.length === 1) {
            setExpandedOrgId(results[0].id);
          } else if (activeOrg) {
            setExpandedOrgId(activeOrg.id);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load organization data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [isSuperAdmin, isOrgAdmin, activeOrg?.id]);

  const roleColors: Record<string, string> = { owner: '#f59e0b', admin: '#3b82f6', member: '#10b981', superadmin: '#ef4444' };
  const roleLabels: Record<string, string> = { owner: t('Owner', 'Lastnik'), admin: 'Admin', member: t('Member', 'Član'), superadmin: 'Super Admin' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'auto' }}>
      {isSuperAdmin && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 8,
          background: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
          border: '1px solid ' + (isDark ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.2)'),
          flexWrap: 'wrap' as const,
        }}>
          <span style={{ fontSize: 16 }}>👑</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#ef4444' }}>SUPER ADMIN</span>
          <span style={{ fontSize: 12, color: colors.textSecondary, marginLeft: 'auto' }}>
            {orgDataList.length} {t('organizations', 'organizacij')} · {' '}
            {orgDataList.reduce((s, o) => s + o.members.length, 0)} {t('users', 'uporabnikov')} · {' '}
            {orgDataList.reduce((s, o) => s + o.projects.length, 0)} {t('projects', 'projektov')}
          </span>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, color: colors.textSecondary }}>
          <span style={{ fontSize: 13 }}>{t('Loading...', 'Nalaganje...')}</span>
        </div>
      )}

      {error && (
        <div style={{ padding: 12, borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <div style={{ display: 'flex', gap: 4, padding: '2px', borderRadius: 8, background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }}>
          {(['members', 'projects'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              flex: 1, padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
              background: activeTab === tab ? colors.primary : 'transparent',
              color: activeTab === tab ? '#fff' : colors.textSecondary,
            }}>
              {tab === 'members' ? t('Members', 'Člani') : t('Projects', 'Projekti')}
            </button>
          ))}
        </div>
      )}

      {!loading && !error && orgDataList.map(org => {
        const isExpanded = expandedOrgId === org.id;
        const isActive = activeOrg?.id === org.id;

        return (
          <div key={org.id} style={{
            borderRadius: 10, overflow: 'hidden',
            border: '1px solid ' + (isActive ? colors.primary + '60' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')),
            background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          }}>
            <div
              onClick={() => setExpandedOrgId(isExpanded ? null : org.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', cursor: 'pointer',
                background: isExpanded ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)') : 'transparent',
                transition: 'background 0.2s', flexWrap: 'wrap' as const,
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? colors.primary : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'),
                color: isActive ? '#fff' : colors.textSecondary,
                fontWeight: 700, fontSize: 15, flexShrink: 0,
              }}>
                {org.name.charAt(0).toUpperCase()}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {org.name}
                </div>
                <div style={{ fontSize: 11, color: colors.textSecondary }}>
                  {org.members.length} {t('members', 'članov')} · {org.projects.length} {t('projects', 'projektov')}
                </div>
              </div>

              {isActive && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                  background: colors.primary + '20', color: colors.primary,
                }}>ACTIVE</span>
              )}

              {isSuperAdmin && !isActive && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSwitchOrg(org.id); }}
                  style={{
                    padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 600, background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                    color: colors.textSecondary,
                  }}
                >
                  {t('Switch', 'Preklopi')}
                </button>
              )}

              <span style={{ fontSize: 14, color: colors.textSecondary, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                ▼
              </span>
            </div>

            {isExpanded && (
              <div style={{ padding: '4px 14px 14px' }}>
                {activeTab === 'members' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {org.members.length === 0 && (
                      <div style={{ padding: 16, textAlign: 'center', color: colors.textSecondary, fontSize: 13 }}>
                        {t('No members found', 'Ni najdenih članov')}
                      </div>
                    )}
                    {org.members.map(member => (
                      <div key={member.userId} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', borderRadius: 8,
                        background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                        border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
                        flexWrap: 'wrap' as const,
                      }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: roleColors[member.orgRole] + '20',
                          color: roleColors[member.orgRole] || colors.primary,
                          fontWeight: 700, fontSize: 14, flexShrink: 0,
                        }}>
                          {member.displayName.charAt(0).toUpperCase()}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {member.displayName}
                          </div>
                          <div style={{ fontSize: 11, color: colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {member.email}
                          </div>
                        </div>

                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                          background: (roleColors[member.orgRole] || '#666') + '20',
                          color: roleColors[member.orgRole] || '#666',
                          textTransform: 'uppercase', flexShrink: 0,
                        }}>
                          {roleLabels[member.orgRole] || member.orgRole}
                        </span>

                        <span style={{ fontSize: 11, color: colors.textSecondary, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                          📁 {member.projectCount}
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenEmailModal({ name: member.displayName, email: member.email, orgName: org.name });
                          }}
                          title={t('Send message to ' + member.displayName, 'Pošlji sporočilo ' + member.displayName)}
                          style={{
                            width: 30, height: 30, borderRadius: '50%', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            background: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)',
                            color: colors.primary, fontSize: 14,
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = isDark ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.18)';
                            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.background = isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)';
                            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                          }}
                        >
                          ✉
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'projects' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {org.projects.length === 0 && (
                      <div style={{ padding: 16, textAlign: 'center', color: colors.textSecondary, fontSize: 13 }}>
                        {t('No projects found', 'Ni najdenih projektov')}
                      </div>
                    )}
                    {org.projects.map(project => (
                      <div
                        key={project.id}
                        onClick={() => onOpenProject?.(project.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', borderRadius: 8, cursor: onOpenProject ? 'pointer' : 'default',
                          background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                          border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
                          transition: 'background 0.15s', flexWrap: 'wrap' as const,
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'; }}
                      >
                        <div style={{
                          width: 34, height: 34, borderRadius: 8,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: colors.primary + '15', color: colors.primary, fontSize: 16, flexShrink: 0,
                        }}>📋</div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {project.title}
                          </div>
                          <div style={{ fontSize: 11, color: colors.textSecondary }}>
                            {project.ownerName} {project.ownerEmail ? '(' + project.ownerEmail + ')' : ''}
                          </div>
                        </div>

                        <span style={{ fontSize: 11, color: colors.textSecondary, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString(language === 'si' ? 'sl-SI' : 'en-GB') : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {!loading && !error && orgDataList.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: colors.textSecondary, fontSize: 13 }}>
          {t('No organizations found', 'Ni najdenih organizacij')}
        </div>
      )}
    </div>
  );
};
// ——— AI Chatbot — v7.1 — selectable text, copy, regenerate, rating, sources, links ————————

const AIChatbot: React.FC<{ language: 'en' | 'si'; isDark: boolean; colors: any; activeOrg: any | null; projectData: any }> = ({ language, isDark, colors: c, activeOrg, projectData }) => {
  const { config: rc } = useResponsive(); // EO-140c-HOTFIX5
  const [conversations, setConversations] = useState<ChatConversation[]>(() => { try { const s = localStorage.getItem(CHAT_STORAGE_KEY); return s ? JSON.parse(s) : []; } catch { return []; } });
  const [activeConvoId, setActiveConvoId] = useState<string | null>(() => conversations[0]?.id || null);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeConvo = conversations.find(cv => cv.id === activeConvoId) || null;
  const messages = activeConvo?.messages || [];
  const handleCopy = useCallback(function(text: string, idx: number) {
    var plainText = text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`(.+?)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^#{1,3}\s/gm, '').replace(/^[\*\-]\s/gm, '• ');
    navigator.clipboard.writeText(plainText).then(function() {
      setCopiedIdx(idx);
      setTimeout(function() { setCopiedIdx(null); }, 2000);
    }).catch(function() {
      var ta = document.createElement('textarea');
      ta.value = plainText;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedIdx(idx);
      setTimeout(function() { setCopiedIdx(null); }, 2000);
    });
  }, []);

  const handleExportConversation = useCallback(function() {
    if (!activeConvo || activeConvo.messages.length === 0) return;
    var md = '# ' + activeConvo.title + '\n\n';
    md = md + 'Exported: ' + new Date().toLocaleString() + '\n\n---\n\n';
    activeConvo.messages.forEach(function(msg) {
      var role = msg.role === 'user' ? '**You**' : '**AI Assistant**';
      var time = new Date(msg.timestamp).toLocaleTimeString();
      md = md + role + ' (' + time + '):\n\n' + msg.content + '\n\n---\n\n';
    });
    var blob = new Blob([md], { type: 'text/markdown' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'chat-' + (activeConvo.title || 'conversation').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40) + '.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeConvo]);

  const handleRating = useCallback(function(msgIdx: number, rating: 'up' | 'down') {
    if (!activeConvoId) return;
    setConversations(function(prev) {
      return prev.map(function(cv) {
        if (cv.id !== activeConvoId) return cv;
        var newMsgs = cv.messages.map(function(m, i) {
          if (i !== msgIdx) return m;
          return { ...m, rating: m.rating === rating ? null : rating };
        });
        return { ...cv, messages: newMsgs };
      });
    });
  }, [activeConvoId]);

  const handleRegenerate = useCallback(function() {
    if (!activeConvoId || messages.length < 2 || isGenerating) return;
    var lastUserIdx = -1;
    for (var i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;
    var lastUserMsg = messages[lastUserIdx].content;
    var trimmedMessages = messages.slice(0, lastUserIdx);
    updateConvoMessages(activeConvoId, trimmedMessages);
    setInput(lastUserMsg);
    setTimeout(function() {
      var sendBtn = document.querySelector('[data-chatbot-send]') as HTMLButtonElement;
      if (sendBtn) sendBtn.click();
    }, 100);
  }, [activeConvoId, messages, isGenerating]);

  useEffect(() => { try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(conversations)); } catch {} }, [conversations]);

  const prevMsgCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      requestAnimationFrame(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      });
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = 0;
    }
  }, [activeConvoId]);

  const createNewConvo = useCallback(() => {
    const id = 'chat-' + Date.now();
    const newConvo: ChatConversation = { id, title: language === 'si' ? 'Nov pogovor' : 'New conversation', messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    setConversations(prev => { let u = [newConvo, ...prev]; if (u.length > MAX_CONVERSATIONS) u = u.slice(0, MAX_CONVERSATIONS); return u; });
    setActiveConvoId(id); setShowHistory(false);
  }, [language]);

  const deleteConvo = useCallback((id: string) => { setConversations(prev => prev.filter(cv => cv.id !== id)); if (activeConvoId === id) setActiveConvoId(null); }, [activeConvoId]);

  const updateConvoMessages = useCallback((convoId: string, newMessages: ChatMessage[]) => {
    setConversations(prev => prev.map(cv => { if (cv.id !== convoId) return cv; const title = newMessages.find(m => m.role === 'user')?.content.substring(0, 40) || cv.title; return { ...cv, messages: newMessages, title, updatedAt: Date.now() }; }));
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;
  const autoResizeTextarea = useCallback(function() {
    var el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    var maxH = 150;
    var newH = Math.min(el.scrollHeight, maxH);
    el.style.height = newH + 'px';
  }, []);
    const rlStatus = getRateLimitStatus();
    if (rlStatus.requestsInWindow >= rlStatus.maxRequests - 1) {
      const waitMsg = language === 'si'
        ? '⏳ Preveč zahtev — počakajte ' + Math.ceil(rlStatus.cooldownRemaining / 1000) + 's.'
        : '⏳ Too many requests — please wait ' + Math.ceil(rlStatus.cooldownRemaining / 1000) + 's.';
      const waitChatMsg: ChatMessage = { role: 'assistant', content: waitMsg, timestamp: Date.now() };
      if (activeConvoId) {
        updateConvoMessages(activeConvoId, [...messages, { role: 'user', content: trimmed, timestamp: Date.now() }, waitChatMsg]);
      }
      return;
    }

    let convoId = activeConvoId;
    if (!convoId) {
      convoId = 'chat-' + Date.now();
      const newConvo: ChatConversation = {
        id: convoId, title: trimmed.substring(0, 40), messages: [],
        createdAt: Date.now(), updatedAt: Date.now()
      };
      setConversations(prev => {
        let u = [newConvo, ...prev];
        if (u.length > MAX_CONVERSATIONS) u = u.slice(0, MAX_CONVERSATIONS);
        return u;
      });
      setActiveConvoId(convoId);
    }

    const userMsg: ChatMessage = { role: 'user', content: trimmed, timestamp: Date.now() };
    const currentMessages = [...messages, userMsg];
    updateConvoMessages(convoId, currentMessages);
    setInput('');
    setIsGenerating(true);

    try {
      // ═══ v7.0: Build rich context for chatbot ═══

      // 1. KNOWLEDGE BASE
      let kbContext = '';
      if (activeOrg?.id) {
        try {
          const allTexts = await knowledgeBaseService.getAllExtractedTexts(activeOrg.id);
          if (allTexts.length > 0) {
            const MAX_KB_CHARS = 8000;
            let totalChars = 0;
            const includedTexts: string[] = [];

            let relevantFiles: Set<string> = new Set();
            try {
              const searchResults = await knowledgeBaseService.searchKnowledgeBase(activeOrg.id, trimmed, 5);
              searchResults.forEach(r => {
                const match = r.match(/\[Source: (.+?)\]/);
                if (match) relevantFiles.add(match[1]);
              });
            } catch {}

            const sorted = [...allTexts].sort((a, b) => {
              const aRel = relevantFiles.has(a.fileName) ? 0 : 1;
              const bRel = relevantFiles.has(b.fileName) ? 0 : 1;
              return aRel - bRel;
            });

            for (const doc of sorted) {
              const entry = '[' + doc.fileName + ']: ' + doc.text.substring(0, 2000);
              if (totalChars + entry.length > MAX_KB_CHARS) break;
              includedTexts.push(entry);
              totalChars += entry.length;
            }

            if (includedTexts.length > 0) {
              kbContext = '\n\n══ KNOWLEDGE BASE (organization documents) ══\n' +
                includedTexts.join('\n---\n') +
                '\n══ END KNOWLEDGE BASE ══';
            }
          }
        } catch (e) {
          console.warn('[AIChatbot] KB load failed:', e);
        }
      }

      // 2. INSTRUCTIONS
      let instructionsContext = '';
      try {
        const parts: string[] = [];

        if (INTERVENTION_LOGIC_FRAMEWORK) parts.push(INTERVENTION_LOGIC_FRAMEWORK);
        if (HUMANIZATION_RULES?.en) parts.push(HUMANIZATION_RULES.en);
        if (ACADEMIC_RIGOR_RULES?.en) parts.push(ACADEMIC_RIGOR_RULES.en);

        const chatbotRole = getEffectiveOverrideSync('chatbot_system_role');
        if (chatbotRole) parts.push('Admin Override: ' + chatbotRole);

        const globalRules = getEffectiveOverrideSync('global_rules');
        if (globalRules) parts.push('Global Rules: ' + globalRules);

        if (activeOrg?.id) {
          try {
            const ins = await organizationService.getActiveOrgInstructions?.();
            if (ins) {
              const orgStr = Object.entries(ins)
                .filter(([_, v]) => typeof v === 'string' && (v as string).trim().length > 0)
                .map(([k, v]) => k + ': ' + v)
                .join('\n');
              if (orgStr) parts.push('Organization Instructions:\n' + orgStr);
            }
          } catch {}
        }

        if (parts.length > 0) {
          instructionsContext = '\n\n══ INSTRUCTIONS & RULES ══\n' + parts.join('\n\n') + '\n══ END INSTRUCTIONS ══';
        }
      } catch (e) {
        console.warn('[AIChatbot] Instructions load failed:', e);
      }

      // 3. ACTIVE PROJECT CONTEXT
      let projectContext = '';
      if (projectData) {
        try {
          const MAX_FIELD = 600;
          const MAX_SHORT = 200;
          const parts: string[] = [];

          const pi = projectData.projectIdea;
          if (pi?.projectTitle) parts.push('Project Title: ' + pi.projectTitle);
          if (pi?.projectAcronym) parts.push('Acronym: ' + pi.projectAcronym);
          if (pi?.mainAim) parts.push('Main Aim: ' + pi.mainAim);
          if (pi?.stateOfTheArt) parts.push('State of the Art: ' + pi.stateOfTheArt.substring(0, MAX_FIELD));
          if (pi?.proposedSolution) parts.push('Proposed Solution: ' + pi.proposedSolution.substring(0, MAX_FIELD));
          if (pi?.startDate) parts.push('Start Date: ' + pi.startDate);
          if (pi?.durationMonths) parts.push('Duration: ' + pi.durationMonths + ' months');
          if (pi?.policies?.length > 0) {
            const pols = pi.policies.filter((p: any) => p.name?.trim()).map((p: any) => '- ' + p.name + ': ' + (p.description || '').substring(0, 120)).join('\n');
            if (pols) parts.push('EU Policies:\n' + pols);
          }
          if (pi?.readinessLevels) {
            const rl = pi.readinessLevels;
            const rls = ['TRL', 'SRL', 'ORL', 'LRL'].map(k => {
              const r = rl[k];
              return r?.level != null ? k + ': Level ' + r.level + ' — ' + (r.justification || '').substring(0, 80) : null;
            }).filter(Boolean).join('; ');
            if (rls) parts.push('Readiness Levels: ' + rls);
          }

          const pa = projectData.problemAnalysis;
          if (pa?.coreProblem?.title) parts.push('Core Problem: ' + pa.coreProblem.title);
          if (pa?.coreProblem?.description) parts.push('Problem Description: ' + pa.coreProblem.description.substring(0, MAX_FIELD));
          if (pa?.causes?.length > 0) {
            const causes = pa.causes.filter((cc: any) => cc.title?.trim()).map((cc: any) => '- ' + cc.title + ': ' + (cc.description || '').substring(0, MAX_SHORT)).join('\n');
            if (causes) parts.push('Causes:\n' + causes);
          }
          if (pa?.consequences?.length > 0) {
            const conseqs = pa.consequences.filter((cc: any) => cc.title?.trim()).map((cc: any) => '- ' + cc.title + ': ' + (cc.description || '').substring(0, MAX_SHORT)).join('\n');
            if (conseqs) parts.push('Consequences:\n' + conseqs);
          }

          if (projectData.generalObjectives?.length > 0) {
            const objs = projectData.generalObjectives.filter((o: any) => o.title?.trim()).map((o: any) => '- ' + o.title + ': ' + (o.description || '').substring(0, MAX_SHORT) + ' [KPI: ' + (o.indicator || 'n/a') + ']').join('\n');
            if (objs) parts.push('General Objectives:\n' + objs);
          }
          if (projectData.specificObjectives?.length > 0) {
            const sObjs = projectData.specificObjectives.filter((o: any) => o.title?.trim()).map((o: any) => '- ' + o.title + ': ' + (o.description || '').substring(0, MAX_SHORT) + ' [KPI: ' + (o.indicator || 'n/a') + ']').join('\n');
            if (sObjs) parts.push('Specific Objectives:\n' + sObjs);
          }

          const pm = projectData.projectManagement;
          if (pm?.description) parts.push('Project Management:\n' + pm.description.substring(0, MAX_FIELD));
          if (pm?.structure) {
            const s = pm.structure;
            const struct = [s.coordinator, s.steeringCommittee, s.advisoryBoard, s.wpLeaders].filter(Boolean).join(' | ');
            if (struct) parts.push('Management Structure: ' + struct);
          }

          if (projectData.activities?.length > 0) {
            const wps = projectData.activities.filter((wp: any) => wp.title?.trim()).map((wp: any) => {
              const tasks = (wp.tasks || []).filter((tt: any) => tt.title?.trim()).map((tt: any) =>
                '  · ' + tt.id + ': ' + tt.title + ' (' + (tt.startDate || '?') + ' → ' + (tt.endDate || '?') + ')'
              ).join('\n');
              const delivs = (wp.deliverables || []).filter((d: any) => d.title?.trim()).map((d: any) =>
                '  » D: ' + d.title + ' — ' + (d.description || '').substring(0, 100)
              ).join('\n');
              const miles = (wp.milestones || []).filter((m: any) => m.description?.trim()).map((m: any) =>
                '  ◆ M: ' + m.description + ' (' + (m.date || '?') + ')'
              ).join('\n');
              return '- ' + wp.id + ': ' + wp.title + (tasks ? '\n' + tasks : '') + (delivs ? '\n' + delivs : '') + (miles ? '\n' + miles : '');
            }).join('\n');
            if (wps) parts.push('Work Packages, Tasks, Deliverables & Milestones:\n' + wps);
          }

          if (projectData.risks?.length > 0) {
            const risks = projectData.risks.filter((r: any) => r.title?.trim()).map((r: any) =>
              '- [' + (r.category || '?') + '] ' + r.title + ' (Likelihood: ' + (r.likelihood || '?') + ', Impact: ' + (r.impact || '?') + ')\n  Description: ' + (r.description || '').substring(0, MAX_SHORT) + '\n  Mitigation: ' + (r.mitigation || '').substring(0, MAX_SHORT)
            ).join('\n');
            if (risks) parts.push('Risk Register:\n' + risks);
          }

          if (projectData.outputs?.length > 0) {
            const outputs = projectData.outputs.filter((o: any) => o.title?.trim()).map((o: any) =>
              '- ' + o.title + ': ' + (o.description || '').substring(0, MAX_SHORT) + ' [Indicator: ' + (o.indicator || '').substring(0, 100) + ']'
            ).join('\n');
            if (outputs) parts.push('Outputs:\n' + outputs);
          }

          if (projectData.outcomes?.length > 0) {
            const outcomes = projectData.outcomes.filter((o: any) => o.title?.trim()).map((o: any) =>
              '- ' + o.title + ': ' + (o.description || '').substring(0, MAX_SHORT) + ' [Indicator: ' + (o.indicator || '').substring(0, 100) + ']'
            ).join('\n');
            if (outcomes) parts.push('Outcomes:\n' + outcomes);
          }

          if (projectData.impacts?.length > 0) {
            const impacts = projectData.impacts.filter((o: any) => o.title?.trim()).map((o: any) =>
              '- ' + o.title + ': ' + (o.description || '').substring(0, MAX_SHORT) + ' [Indicator: ' + (o.indicator || '').substring(0, 100) + ']'
            ).join('\n');
            if (impacts) parts.push('Impacts:\n' + impacts);
          }

          if (projectData.kers?.length > 0) {
            const kers = projectData.kers.filter((k: any) => k.title?.trim()).map((k: any) =>
              '- ' + k.title + ': ' + (k.description || '').substring(0, MAX_SHORT) + '\n  Exploitation: ' + (k.exploitationStrategy || '').substring(0, MAX_SHORT)
            ).join('\n');
            if (kers) parts.push('Key Exploitable Results (KERs):\n' + kers);
          }

          if (projectData.partners?.length > 0) {
            const partners = projectData.partners.filter((p: any) => p.name?.trim()).map((p: any) =>
              '- ' + (p.code || '?') + ': ' + p.name + ' (' + (p.partnerType || '?') + ', PM rate: €' + (p.pmRate || '?') + '/month)\n  Expertise: ' + (p.expertise || '').substring(0, 150)
            ).join('\n');
            if (partners) parts.push('Partnership:\n' + partners);
          }

          if (projectData.fundingModel) parts.push('Funding Model: ' + projectData.fundingModel);
          if (projectData.indirectCostSettings) {
            parts.push('Indirect Costs: ' + projectData.indirectCostSettings.percentage + '% on [' + (projectData.indirectCostSettings.appliesToCategories || []).join(', ') + ']');
          }

          if (parts.length > 0) {
            projectContext = '\n\n══ ACTIVE PROJECT — COMPLETE DATA ══\n' + parts.join('\n\n') + '\n══ END PROJECT ══';
          }
        } catch (e) {
          console.warn('[AIChatbot] Project context build failed:', e);
        }
      }

      // 4. CONVERSATION HISTORY
      const hist = currentMessages.slice(-10)
        .map(m => (m.role === 'user' ? 'User' : 'Assistant') + ': ' + m.content)
        .join('\n');

      // 5. BUILD FULL PROMPT — v7.1: language matching + verified sources
      const systemPrompt = 'You are EURO-OFFICE AI Assistant — an expert consultant specializing in EU project funding (Horizon Europe, Erasmus+, Interreg, Creative Europe, CERV, LIFE, Digital Europe, and other EU programs).\n\n' +
        'Your core competencies:\n' +
        '- EU project proposal writing and structure (problem analysis, objectives, work packages, deliverables, milestones, Gantt charts, PERT diagrams)\n' +
        '- Intervention logic and logical frameworks\n' +
        '- Partner consortium design and allocation\n' +
        '- Budget planning and co-financing rules\n' +
        '- Impact assessment, KERs, dissemination strategies\n' +
        '- Readiness levels (TRL, SRL, ORL, LRL)\n\n' +
        'RESPONSE LANGUAGE: CRITICAL RULE — You MUST ALWAYS respond in the SAME LANGUAGE as the user\'s question. If the user writes in Slovenian, respond in Slovenian. If the user writes in English, respond in English. If the user writes in German, respond in German. NEVER switch languages unless the user explicitly asks you to.\n\n' +
        'VERIFIED SOURCES: You MUST cite verified, real sources with clickable URLs whenever possible. Use markdown link format [Source Name](https://url). Prioritize official EU sources:\n' +
        '- European Commission: https://ec.europa.eu\n' +
        '- CORDIS: https://cordis.europa.eu\n' +
        '- Funding & Tenders Portal: https://ec.europa.eu/info/funding-tenders/opportunities/portal\n' +
        '- EUR-Lex: https://eur-lex.europa.eu\n' +
        'If you reference a Knowledge Base document, cite it as [KB: filename]. If you cannot verify a source, clearly state that the information is based on your general expertise.\n\n' +
        'IMPORTANT RULES:\n' +
        '- Use the KNOWLEDGE BASE documents below as your primary reference — cite document names when relevant\n' +
        '- Consider the ACTIVE PROJECT context — tailor advice to the user\'s specific project\n' +
        '- Follow INSTRUCTIONS & RULES set by the organization administrator\n' +
        '- Be precise, actionable, and concrete — avoid vague generalities\n' +
        '- When discussing EU project sections, reference the specific fields the user should fill in\n' +
        '- Format responses clearly with markdown (headers, bullets, bold) for readability\n' +
        '- At the end of substantive answers, include a "Sources:" section with numbered clickable links';

      const prompt = systemPrompt + kbContext + instructionsContext + projectContext +
        '\n\n══ CONVERSATION ══\n' + hist + '\n\nUser: ' + trimmed + '\nAssistant:';

      // 6. CALL AI
      const result = await generateContent({
        prompt,
        taskType: 'chatbot',
        sectionKey: 'chatbot',
      });

      const aiResp = result?.text || (language === 'si' ? 'Napaka pri generiranju odgovora.' : 'Error generating response.');
      updateConvoMessages(convoId, [...currentMessages, { role: 'assistant', content: aiResp, timestamp: Date.now() }]);

    } catch (e: any) {
      console.error('[AIChatbot] Generation error:', e);
      const errorMsg = language === 'si'
        ? 'Napaka: ' + (e.message || 'Neznana napaka')
        : 'Error: ' + (e.message || 'Unknown error');
      updateConvoMessages(convoId, [...currentMessages, { role: 'assistant', content: errorMsg, timestamp: Date.now() }]);
    } finally {
      setIsGenerating(false);
      inputRef.current?.focus();
    }
  }, [input, isGenerating, activeConvoId, messages, activeOrg, language, projectData, updateConvoMessages]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, height: '100%', minHeight: 300 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm, flexShrink: 0, flexWrap: 'wrap' as const }}>
        <button onClick={createNewConvo} style={{ background: c.primary[500], color: '#fff', border: 'none', borderRadius: radii.md, padding: spacing.xs + ' ' + spacing.sm, fontSize: typography.fontSize.xs, cursor: 'pointer', fontWeight: typography.fontWeight.semibold }}>+ {language === 'si' ? 'Nov pogovor' : 'New chat'}</button>
        <button onClick={function() { setShowHistory(!showHistory); }} style={{ background: showHistory ? c.primary[100] : 'transparent', color: c.text.body, border: '1px solid ' + c.border.light, borderRadius: radii.md, padding: spacing.xs + ' ' + spacing.sm, fontSize: typography.fontSize.xs, cursor: 'pointer' }}>{language === 'si' ? 'Zgodovina (' + conversations.length + ')' : 'History (' + conversations.length + ')'}</button>
        {activeConvo && activeConvo.messages.length > 0 && (
          <button onClick={handleExportConversation} title={language === 'si' ? 'Izvozi pogovor' : 'Export conversation'} style={{ background: 'transparent', color: c.text.muted, border: '1px solid ' + c.border.light, borderRadius: radii.md, padding: spacing.xs + ' ' + spacing.sm, fontSize: typography.fontSize.xs, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>📥 {language === 'si' ? 'Izvozi' : 'Export'}</button>
        )}
      </div>
      {showHistory && (
        <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: spacing.sm, border: '1px solid ' + c.border.light, borderRadius: radii.md, background: isDark ? c.surface.sidebar : c.surface.main }}>
          <div style={{ padding: spacing.xs + ' ' + spacing.sm, borderBottom: '1px solid ' + c.border.light, position: 'sticky' as const, top: 0, background: isDark ? c.surface.sidebar : c.surface.main, zIndex: 1 }}>
            <input
              value={historySearch}
              onChange={function(e) { setHistorySearch(e.target.value); }}
              placeholder={language === 'si' ? 'Išči pogovore...' : 'Search conversations...'}
              style={{ width: '100%', padding: '4px 8px', borderRadius: radii.sm, border: '1px solid ' + c.border.light, background: 'transparent', color: c.text.body, fontSize: rc.content.fontSize.xs, outline: 'none', boxSizing: 'border-box' as const }}
            />
          </div>
          {conversations.length === 0 && <div style={{ padding: spacing.sm, fontSize: typography.fontSize.xs, color: c.text.muted, textAlign: 'center' as const }}>{language === 'si' ? 'Ni pogovorov' : 'No conversations'}</div>}
          {conversations.filter(function(conv) {
            if (!historySearch.trim()) return true;
            var q = historySearch.toLowerCase();
            if (conv.title.toLowerCase().indexOf(q) >= 0) return true;
            return conv.messages.some(function(m) { return m.content.toLowerCase().indexOf(q) >= 0; });
          }).map(function(conv) {
            return (
              <div key={conv.id} style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, padding: spacing.xs + ' ' + spacing.sm, background: conv.id === activeConvoId ? (isDark ? c.primary[900] + '30' : c.primary[50]) : 'transparent', cursor: 'pointer', borderBottom: '1px solid ' + c.border.light }}>
                <div onClick={function() { setActiveConvoId(conv.id); setShowHistory(false); setHistorySearch(''); }} style={{ flex: 1, fontSize: typography.fontSize.xs, color: c.text.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.title}</div>
                <div style={{ fontSize: rc.content.fontSize.xxs, color: c.text.muted, flexShrink: 0 }}>{new Date(conv.updatedAt).toLocaleDateString()}</div>
                <button onClick={function(e) { e.stopPropagation(); deleteConvo(conv.id); }} style={{ background: 'none', border: 'none', color: c.error[500], cursor: 'pointer', fontSize: rc.content.fontSize.body, padding: '2px', lineHeight: 1 }}>×</button>
              </div>
            );
          })}
        </div>
      )}
      <div ref={chatContainerRef} draggable={false} style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column' as const, gap: spacing.xs, marginBottom: spacing.sm, userSelect: 'text' as const }}>
        {messages.length === 0 && <div style={{ textAlign: 'center' as const, color: c.text.muted, fontSize: typography.fontSize.xs, padding: spacing.xl }}>{language === 'si' ? 'Pozdravljen! Sem EURO-OFFICE AI pomočnik.' : 'Hello! I\'m the EURO-OFFICE AI Assistant.'}</div>}
        {messages.map(function(msg, idx) {
          var isAssistant = msg.role === 'assistant';
          var isLastAssistant = isAssistant && idx === messages.length - 1;
          return (
            <div key={idx} style={{ alignSelf: isAssistant ? 'flex-start' : 'flex-end', maxWidth: '85%', position: 'relative' as const }}>
              <div
                draggable={false}
                onMouseDown={function(e) { e.stopPropagation(); }}
                onDragStart={function(e) { e.preventDefault(); e.stopPropagation(); }}
                style={{
                background: isAssistant ? (isDark ? c.surface.sidebar : c.surface.main) : c.primary[500],
                color: isAssistant ? c.text.body : '#fff',
                borderRadius: radii.lg,
                padding: spacing.xs + ' ' + spacing.sm,
                fontSize: typography.fontSize.xs,
                border: isAssistant ? '1px solid ' + c.border.light : 'none',
                wordBreak: 'break-word' as const,
                lineHeight: 1.5,
                userSelect: 'text' as const,
                cursor: 'text',
                WebkitUserSelect: 'text' as const,
                MozUserSelect: 'text' as const,
              }}>
                {isAssistant ? renderFormattedText(msg.content) : msg.content}
              </div>
              {isAssistant && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', flexWrap: 'wrap' as const }}>
                  <button
                    onClick={function() { handleCopy(msg.content, idx); }}
                    title={language === 'si' ? 'Kopiraj' : 'Copy'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: radii.sm, fontSize: rc.content.fontSize.xs, color: copiedIdx === idx ? c.success[600] : c.text.muted, display: 'flex', alignItems: 'center', gap: '3px', transition: 'color 0.2s' }}
                    onMouseEnter={function(e) { if (copiedIdx !== idx) (e.currentTarget as HTMLElement).style.color = c.primary[500]; }}
                    onMouseLeave={function(e) { if (copiedIdx !== idx) (e.currentTarget as HTMLElement).style.color = c.text.muted; }}
                  >
                    {copiedIdx === idx ? '✓' : '📋'} {copiedIdx === idx ? (language === 'si' ? 'Kopirano!' : 'Copied!') : ''}
                  </button>
                  <button
                    onClick={function() { handleRating(idx, 'up'); }}
                    title={language === 'si' ? 'Dober odgovor' : 'Good response'}
                    style={{ background: msg.rating === 'up' ? (isDark ? c.success[900] + '40' : c.success[50]) : 'none', border: msg.rating === 'up' ? '1px solid ' + c.success[400] : 'none', cursor: 'pointer', padding: '2px 5px', borderRadius: radii.sm, fontSize: rc.content.fontSize.xs, color: msg.rating === 'up' ? c.success[600] : c.text.muted, transition: 'all 0.2s' }}
                  >
                    👍
                  </button>
                  <button
                    onClick={function() { handleRating(idx, 'down'); }}
                    title={language === 'si' ? 'Slab odgovor' : 'Poor response'}
                    style={{ background: msg.rating === 'down' ? (isDark ? c.error[900] + '40' : c.error[50]) : 'none', border: msg.rating === 'down' ? '1px solid ' + c.error[400] : 'none', cursor: 'pointer', padding: '2px 5px', borderRadius: radii.sm, fontSize: rc.content.fontSize.xs, color: msg.rating === 'down' ? c.error[600] : c.text.muted, transition: 'all 0.2s' }}
                  >
                    👎
                  </button>
                  {isLastAssistant && !isGenerating && (
                    <button
                      onClick={handleRegenerate}
                      title={language === 'si' ? 'Regeneriraj odgovor' : 'Regenerate response'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: radii.sm, fontSize: rc.content.fontSize.xs, color: c.text.muted, display: 'flex', alignItems: 'center', gap: '3px', transition: 'color 0.2s' }}
                      onMouseEnter={function(e) { (e.currentTarget as HTMLElement).style.color = c.primary[500]; }}
                      onMouseLeave={function(e) { (e.currentTarget as HTMLElement).style.color = c.text.muted; }}
                    >
                      🔄 {language === 'si' ? 'Regeneriraj' : 'Regenerate'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {isGenerating && (
          <div style={{ alignSelf: 'flex-start', maxWidth: '85%', background: isDark ? c.surface.sidebar : c.surface.main, borderRadius: radii.lg, padding: spacing.xs + ' ' + spacing.sm, fontSize: typography.fontSize.xs, color: c.text.muted, border: '1px solid ' + c.border.light, display: 'flex', alignItems: 'center', gap: '6px' }}>
            {language === 'si' ? 'Generiram' : 'Generating'}
            <span style={{ display: 'inline-flex', gap: '3px' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.primary[400], animation: 'chatDot1 1.4s infinite ease-in-out' }}></span>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.primary[400], animation: 'chatDot2 1.4s infinite ease-in-out' }}></span>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.primary[400], animation: 'chatDot3 1.4s infinite ease-in-out' }}></span>
            </span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
            <div style={{ display: 'flex', gap: spacing.xs, flexShrink: 0, alignItems: 'flex-end' }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={function(e) {
            setInput(e.target.value);
            var el = e.target;
            el.style.height = 'auto';
            var maxH = 150;
            var newH = Math.min(el.scrollHeight, maxH);
            el.style.height = newH + 'px';
          }}
          onKeyDown={function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
              var el = e.target as HTMLTextAreaElement;
              setTimeout(function() { el.style.height = 'auto'; }, 50);
            }
          }}
          placeholder={language === 'si' ? 'Vprašajte AI pomočnika... (Shift+Enter za novo vrstico)' : 'Ask the AI assistant... (Shift+Enter for new line)'}
          disabled={isGenerating}
          rows={1}
          style={{
            flex: 1,
            padding: spacing.xs + ' ' + spacing.sm,
            borderRadius: radii.md,
            border: '1px solid ' + c.border.light,
            background: isDark ? c.surface.sidebar : c.surface.main,
            color: c.text.body,
            fontSize: typography.fontSize.xs,
            outline: 'none',
            resize: 'none',
            overflow: 'auto',
            minHeight: '36px',
            maxHeight: '150px',
            lineHeight: '1.5',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
        <button
          data-chatbot-send
          onClick={function() {
            handleSend();
            setTimeout(function() {
              if (inputRef.current) inputRef.current.style.height = 'auto';
            }, 50);
          }}
          disabled={isGenerating || !input.trim()}
          style={{
            background: c.primary[500],
            color: '#fff',
            border: 'none',
            borderRadius: radii.md,
            padding: spacing.xs + ' ' + spacing.md,
            fontSize: typography.fontSize.xs,
            cursor: isGenerating ? 'not-allowed' : 'pointer',
            opacity: isGenerating || !input.trim() ? 0.5 : 1,
            fontWeight: typography.fontWeight.semibold,
            alignSelf: 'flex-end',
            minHeight: '36px',
          }}
        >
          {isGenerating ? '...' : '➤'}
        </button>
      </div>
    </div>
  );
};

// ——— Main DashboardHome ————————————————————————

const DashboardHome: React.FC<DashboardHomeProps> = ({
  language, projectsMeta, currentProjectId, projectData, activeOrg, userOrgs,
  isAdmin, onOpenProject, onCreateProject, onOpenAdmin, onOpenSettings, onSwitchOrg,
}) => {
  const [isDark, setIsDark] = useState(getThemeMode() === 'dark');
  const c = isDark ? darkColors : lightColors;
  const { config: rc } = useResponsive(); // EO-140c
  const containerRef = useRef<HTMLDivElement>(null); // EO-140c-HOTFIX4

  const [gridCols, setGridCols] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768 ? GRID_COLS_MOBILE : GRID_COLS_DESKTOP);

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      setGridCols(w < 768 ? GRID_COLS_MOBILE : GRID_COLS_DESKTOP);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [emailModal, setEmailModal] = useState<{ name: string; email: string; orgName: string } | null>(null);
  const currentUserName = storageService.getCurrentUserDisplayName() || 'User';

  useEffect(() => { const u = onThemeChange((m) => setIsDark(m === 'dark')); return u; }, []);
  useEffect(() => { if (containerRef.current) containerRef.current.scrollTop = 0; const ca = document.getElementById('main-content-area'); if (ca) ca.scrollTop = 0; window.scrollTo(0, 0); }, []);

  const [cardOrder, setCardOrder] = useState<CardId[]>(() => {
    try { const s = localStorage.getItem('euro-office-card-order'); if (s) { const p = JSON.parse(s); const valid = p.filter((x: string) => DEFAULT_CARD_ORDER.includes(x as CardId)); return [...new Set([...valid, ...DEFAULT_CARD_ORDER])] as CardId[]; } } catch {}
    return DEFAULT_CARD_ORDER;
  });

  const [cardSizes, setCardSizes] = useState<Record<string, number>>(() => {
    try { const s = localStorage.getItem('euro-office-card-sizes'); if (s) return { ...DEFAULT_CARD_SIZES, ...JSON.parse(s) }; } catch {}
    return { ...DEFAULT_CARD_SIZES };
  });

  const [draggingId, setDraggingId] = useState<CardId | null>(null);

  useEffect(() => { try { localStorage.setItem('euro-office-card-order', JSON.stringify(cardOrder)); } catch {} }, [cardOrder]);
  useEffect(() => { try { localStorage.setItem('euro-office-card-sizes', JSON.stringify(cardSizes)); } catch {} }, [cardSizes]);

  const handleResize = useCallback((id: CardId, span: number) => { setCardSizes(prev => ({ ...prev, [id]: span })); }, []);

  const dragHandlers = useMemo(() => ({
    onDragStart: (e: React.DragEvent, id: CardId) => { setDraggingId(id); e.dataTransfer.effectAllowed = 'move'; },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; },
    onDrop: (e: React.DragEvent, targetId: CardId) => {
      e.preventDefault(); if (!draggingId || draggingId === targetId) return;
      setCardOrder(prev => { const n = [...prev]; const fi = n.indexOf(draggingId); const ti = n.indexOf(targetId); if (fi === -1 || ti === -1) return prev; n.splice(fi, 1); n.splice(ti, 0, draggingId); return n; });
      setDraggingId(null);
    },
    onDragEnd: () => setDraggingId(null),
  }), [draggingId]);

  const handleDropAtEnd = useCallback((e: React.DragEvent) => {
    e.preventDefault(); if (!draggingId) return;
    setCardOrder(prev => { const n = prev.filter(id => id !== draggingId); n.push(draggingId); return n; });
    setDraggingId(null);
  }, [draggingId]);

  const totalProjects = projectsMeta.length;
  const orgName = activeOrg?.name || (language === 'si' ? 'Osebni prostor' : 'Personal workspace');

  const visibleCards = cardOrder.filter(id => !(id === 'admin' && !isAdmin));

  return (
    <div ref={containerRef} style={{ padding: gridCols === 1 ? spacing.md : spacing.xl, maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column' as const, gap: spacing.lg }}>
      <div style={{ marginBottom: spacing.sm }}>
        <h1 style={{ margin: 0, fontSize: gridCols === 1 ? typography.fontSize.xl : typography.fontSize['2xl'], fontWeight: typography.fontWeight.bold, color: c.text.heading }}>{language === 'si' ? 'Nadzorna plošča' : 'Dashboard'}</h1>
        <p style={{ margin: spacing.xs + ' 0 0', color: c.text.muted, fontSize: typography.fontSize.sm }}>{orgName}{totalProjects > 0 ? ' · ' + totalProjects + ' ' + (language === 'si' ? 'projektov' : 'projects') : ''}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + gridCols + ', minmax(0, 1fr))', gap: gridCols === 1 ? spacing.md : spacing.lg, alignItems: 'start' }}>
        {visibleCards.map(cardId => {
          const cardConfig: Record<CardId, { title: string; icon: string }> = {
            projects: { title: language === 'si' ? 'Moji projekti' : 'My Projects', icon: '📁' },
            chatbot: { title: language === 'si' ? 'AI Pomočnik' : 'AI Chatbot', icon: '🤖' },
            admin: { title: 'Super Admin', icon: '🛡️' },
            organization: { title: language === 'si' ? 'Organizacija' : 'Organization', icon: '🏢' },
            activity: { title: language === 'si' ? 'Projektne grafike' : 'Project Charts', icon: '📈' },
          };
          const config = cardConfig[cardId];
          if (!config) return null;
          const colSpan = cardSizes[cardId] || DEFAULT_CARD_SIZES[cardId] || 1;

          return (
            <DashboardCard key={cardId} id={cardId} title={config.title} icon={config.icon}
              isDark={isDark} colors={c} colSpan={colSpan} language={language}
              gridCols={gridCols}
              onResize={handleResize} dragHandlers={dragHandlers} draggingId={draggingId}>

              {cardId === 'projects' && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: spacing.sm }}>
                  <button onClick={onCreateProject} style={{ background: c.primary[500], color: '#fff', border: 'none', borderRadius: radii.md, padding: spacing.sm + ' ' + spacing.md, fontSize: typography.fontSize.sm, cursor: 'pointer', fontWeight: typography.fontWeight.semibold, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.xs }}>+ {language === 'si' ? 'Nov projekt' : 'New Project'}</button>
                  {projectsMeta.length === 0 && <div style={{ textAlign: 'center' as const, color: c.text.muted, fontSize: typography.fontSize.xs, padding: spacing.md }}>{language === 'si' ? 'Še nimate projektov.' : 'No projects yet.'}</div>}
                  {projectsMeta.map(p => {
                    const progress = getProjectProgress(p.id === currentProjectId ? projectData : null);
                    return (
                      <div key={p.id} onClick={() => onOpenProject(p.id)} style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.md, border: '1px solid ' + (p.id === currentProjectId ? c.primary[400] : c.border.light), cursor: 'pointer', background: p.id === currentProjectId ? (isDark ? c.primary[900] + '20' : c.primary[50]) : 'transparent', transition: 'all ' + animation.duration.fast + ' ' + animation.easing.default }}>
                        <LocalProgressRing percent={progress} size={40} strokeWidth={4} color={c.primary[500]} bgColor={c.border.light} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: c.text.heading, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || p.name || (language === 'si' ? 'Brez imena' : 'Untitled')}</div>
                          {p.acronym && <div style={{ fontSize: rc.content.fontSize.xxs, color: c.text.muted }}>{p.acronym}</div>}
                        </div>
                        <div style={{ fontSize: typography.fontSize.xs, color: c.text.muted, flexShrink: 0 }}>{progress}%</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {cardId === 'chatbot' && <AIChatbot language={language} isDark={isDark} colors={c} activeOrg={activeOrg} projectData={projectData} />}

              {cardId === 'admin' && isAdmin && (
                <div style={{ display: 'grid', gridTemplateColumns: gridCols === 1 ? '1fr' : '1fr 1fr', gap: spacing.xs }}>
                  {[
                    { label: language === 'si' ? 'Uporabniki' : 'Users', tab: 'users', icon: '👥' },
                    { label: language === 'si' ? 'Navodila' : 'Instructions', tab: 'instructions', icon: '📝' },
                    { label: language === 'si' ? 'AI nastavitve' : 'AI Settings', tab: 'ai', icon: '🤖' },
                    { label: language === 'si' ? 'Dnevnik napak' : 'Error Log', tab: 'errors', icon: '🐛' },
                    { label: language === 'si' ? 'Revizijska sled' : 'Audit Trail', tab: 'audit', icon: '📋' },
                    { label: language === 'si' ? 'Profil' : 'Profile', tab: 'profile', icon: '👤' },
                    { label: language === 'si' ? 'Baza znanja' : 'Knowledge Base', tab: 'knowledge', icon: '📚' },
                  ].map(item => (
                    <button key={item.tab} onClick={() => onOpenAdmin(item.tab)} style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, borderRadius: radii.md, border: '1px solid ' + c.border.light, background: 'transparent', cursor: 'pointer', color: c.text.body, fontSize: typography.fontSize.xs, textAlign: 'left' as const }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? c.primary[900] + '30' : c.primary[50]; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                      <span>{item.icon}</span> {item.label}
                    </button>
                  ))}
                </div>
              )}

              {cardId === 'organization' && (
                <OrganizationCard
                  language={language} isDark={isDark} colors={c}
                  activeOrg={activeOrg} userOrgs={userOrgs} isAdmin={isAdmin}
                  onSwitchOrg={onSwitchOrg} onOpenProject={onOpenProject}
                  onOpenEmailModal={(recipient) => setEmailModal(recipient)}
                />
              )}

              {cardId === 'activity' && (
                <ProjectChartsCard language={language} isDark={isDark} colors={c} colSpan={colSpan}
                  projectsMeta={projectsMeta} projectData={projectData}
                  currentProjectId={currentProjectId} onOpenProject={onOpenProject} />
              )}
            </DashboardCard>
          );
        })}

        <DropZone index={visibleCards.length} isDark={isDark} colors={c} draggingId={draggingId} onDropAtEnd={handleDropAtEnd} />
      </div>

      {/* ★ v7.1: CSS keyframes for chatbot typing dots */}
      <style>{'\n@keyframes chatDot1 { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }\n@keyframes chatDot2 { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; } 50% { transform: scale(1); opacity: 1; } }\n@keyframes chatDot3 { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; } 60% { transform: scale(1); opacity: 1; } }\n'}</style>

      {/* ★ v6.0: EmailModal — renders at root level, OUTSIDE all cards */}
      <EmailModal
        isOpen={emailModal !== null}
        onClose={() => setEmailModal(null)}
        recipientName={emailModal?.name || ''}
        recipientEmail={emailModal?.email || ''}
        orgName={emailModal?.orgName || ''}
        senderName={currentUserName}
        language={language}
        isDarkMode={isDark}
      />
    </div>
  );
};

export default DashboardHome;