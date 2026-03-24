// components/UsageDashboard.tsx
// ═══════════════════════════════════════════════════════════════
// v1.0 — 2026-03-22 — EO-140c: API Usage Dashboard component.
//   Two variants: 'full' (graphs modal, 3 summary cards + table + history)
//                 'compact' (DashboardPanel right sidebar, single-line + mini bar)
//   Bilingual EN/SI. Dark mode compatible. Responsive via useResponsive().
//   Reads from projectData._usage as defined by EO-138.
// ═══════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { useResponsive } from '../hooks/useResponsive.ts';

// ─── Types ──────────────────────────────────────────────────────
interface UsageRecord {
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

interface ChapterUsage {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostEUR: number;
  lastModel: string;
  lastGenerated: string;
  records: UsageRecord[];
}

interface ProjectUsage {
  chapters: Record<string, ChapterUsage>;
  grandTotalEUR: number;
  grandTotalTokens: number;
  usdToEurRate: number;
}

export interface UsageDashboardProps {
  usage: ProjectUsage | null | undefined;
  language: 'en' | 'si';
  variant: 'full' | 'compact';
  isDark?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────
function fmtEur(v: number): string {
  return '€' + v.toFixed(4);
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return String(n);
}

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function timeAgo(isoTs: string, lang: 'en' | 'si'): string {
  const diffMs = Date.now() - new Date(isoTs).getTime();
  const secs = Math.floor(diffMs / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  const ago = lang === 'si' ? 'nazaj' : 'ago';
  if (days > 0) return days + (lang === 'si' ? 'd nazaj' : 'd ago');
  if (hrs > 0) return hrs + (lang === 'si' ? 'h nazaj' : 'h ago');
  if (mins > 0) return mins + (lang === 'si' ? ' min nazaj' : ' min ago');
  return secs + (lang === 'si' ? 's nazaj' : 's ago');
}

const CHAPTER_LABELS: Record<string, { en: string; si: string }> = {
  problemAnalysis:    { en: 'Problem Analysis',    si: 'Analiza problema' },
  projectIdea:        { en: 'Project Idea',         si: 'Ideja projekta' },
  generalObjectives:  { en: 'General Objectives',  si: 'Splošni cilji' },
  specificObjectives: { en: 'Specific Objectives', si: 'Specifični cilji' },
  activities:         { en: 'Activities',           si: 'Aktivnosti' },
  expectedResults:    { en: 'Expected Results',     si: 'Pričakovani rezultati' },
};

function chapterLabel(key: string, lang: 'en' | 'si'): string {
  return CHAPTER_LABELS[key]?.[lang] || key;
}

// ─── Compact variant ────────────────────────────────────────────
const CompactUsage: React.FC<{ usage: ProjectUsage; language: 'en' | 'si'; isDark: boolean }> = ({ usage, language, isDark }) => {
  const [expanded, setExpanded] = useState(false);
  const { config: rc } = useResponsive();
  const isEN = language === 'en';

  const totalTokens = usage.grandTotalTokens;
  const totalCost = usage.grandTotalEUR;
  const chapters = Object.entries(usage.chapters);
  const totalCalls = chapters.reduce((s, [, c]) => s + c.totalCalls, 0);

  const textColor = isDark ? '#c0c0d8' : '#475569';
  const mutedColor = isDark ? '#8080a0' : '#94a3b8';
  const cardBg = isDark ? '#1a1a2e' : '#f8fafc';
  const borderColor = isDark ? '#2d2d4f' : '#e2e8f0';

  // Color palette for chapter bars
  const barColors = ['#6366f1', '#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444'];

  return (
    <div style={{ borderTop: '1px solid ' + borderColor, paddingTop: '12px', marginTop: '8px' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none',
          cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: '8px',
        }}
      >
        <span style={{ fontSize: rc.content.fontSize.xs, fontWeight: 600, color: mutedColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          💰 {isEN ? 'API Cost' : 'Strošek API'}
        </span>
        <span style={{ fontSize: rc.content.fontSize.xs, fontWeight: 700, color: textColor }}>
          {fmtEur(totalCost)} · {fmtTokens(totalTokens)} {isEN ? 'tok' : 'tok'} · {totalCalls}×
        </span>
      </button>

      {/* Mini proportional bar */}
      {chapters.length > 0 && (
        <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 6, gap: 1 }}>
          {chapters.map(([key, ch], i) => {
            const pct = totalCost > 0 ? (ch.totalCostEUR / totalCost) * 100 : 0;
            return pct > 1 ? (
              <div key={key} title={chapterLabel(key, language) + ': ' + fmtEur(ch.totalCostEUR)}
                style={{ width: pct + '%', background: barColors[i % barColors.length], borderRadius: 2, minWidth: 4 }} />
            ) : null;
          })}
        </div>
      )}

      {/* Expanded per-chapter breakdown */}
      {expanded && (
        <div style={{ marginTop: 10, background: cardBg, borderRadius: '0.5rem', border: '1px solid ' + borderColor, overflow: 'hidden' }}>
          {chapters.map(([key, ch], i) => (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '5px 10px', borderBottom: i < chapters.length - 1 ? '1px solid ' + borderColor : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: barColors[i % barColors.length], flexShrink: 0 }} />
                <span style={{ fontSize: rc.content.fontSize.xs, color: textColor }}>{chapterLabel(key, language)}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: rc.content.fontSize.xxs, color: mutedColor }}>{ch.totalCalls}×</span>
                <span style={{ fontSize: rc.content.fontSize.xs, fontWeight: 700, color: textColor }}>{fmtEur(ch.totalCostEUR)}</span>
              </div>
            </div>
          ))}
          <div style={{ padding: '5px 10px', background: isDark ? '#12121e' : '#f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: rc.content.fontSize.xs, fontWeight: 700, color: textColor }}>TOTAL</span>
            <span style={{ fontSize: rc.content.fontSize.xs, fontWeight: 800, color: isDark ? '#a5b4fc' : '#4f46e5' }}>{fmtEur(totalCost)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Full variant ────────────────────────────────────────────────
const FullUsage: React.FC<{ usage: ProjectUsage; language: 'en' | 'si'; isDark: boolean }> = ({ usage, language, isDark }) => {
  const { config: rc } = useResponsive();
  const isEN = language === 'en';

  const chapters = Object.entries(usage.chapters);
  const totalCalls = chapters.reduce((s, [, c]) => s + c.totalCalls, 0);

  // Gather all records across chapters, sort newest first
  const allRecords: UsageRecord[] = [];
  chapters.forEach(([, ch]) => allRecords.push(...(ch.records || [])));
  allRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const recentRecords = allRecords.slice(0, 10);

  // Cost per model
  const modelCosts: Record<string, number> = {};
  allRecords.forEach(r => {
    modelCosts[r.model] = (modelCosts[r.model] || 0) + r.costEUR;
  });
  const modelEntries = Object.entries(modelCosts).sort((a, b) => b[1] - a[1]);
  const maxModelCost = modelEntries[0]?.[1] || 1;

  const textColor = isDark ? '#c0c0d8' : '#334155';
  const mutedColor = isDark ? '#8080a0' : '#94a3b8';
  const headingColor = isDark ? '#e0e0f0' : '#0f172a';
  const cardBg = isDark ? '#1a1a2e' : '#ffffff';
  const borderColor = isDark ? '#2d2d4f' : '#e2e8f0';
  const altRowBg = isDark ? '#12121e' : '#f8fafc';
  const barColors = ['#6366f1', '#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444'];

  const pathBadge = (path: string) => {
    const colors: Record<string, string> = { single: '#6366f1', composite: '#f59e0b', field: '#10b981' };
    const labels: Record<string, string> = { single: isEN ? 'Single' : 'Enojno', composite: isEN ? 'Composite' : 'Kompozitno', field: isEN ? 'Field' : 'Polje' };
    const color = colors[path] || '#94a3b8';
    return (
      <span style={{ fontSize: '10px', fontWeight: 600, color, background: color + '1a', border: '1px solid ' + color + '40', borderRadius: '9999px', padding: '1px 6px', whiteSpace: 'nowrap' }}>
        {labels[path] || path}
      </span>
    );
  };

  return (
    <div style={{ fontFamily: 'inherit' }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: isEN ? 'Total Cost' : 'Skupni stroški', value: '€' + usage.grandTotalEUR.toFixed(4), accent: '#6366f1' },
          { label: isEN ? 'Total Tokens' : 'Skupni tokeni', value: fmtNum(usage.grandTotalTokens), accent: '#06b6d4' },
          { label: isEN ? 'Total API Calls' : 'Skupni klici', value: String(totalCalls), accent: '#10b981' },
        ].map((card, i) => (
          <div key={i} style={{ background: cardBg, border: '1px solid ' + borderColor, borderRadius: '0.75rem', padding: '14px 16px', boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: rc.content.fontSize.xs, color: mutedColor, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{card.label}</p>
            <p style={{ fontSize: '1.25rem', fontWeight: 800, color: card.accent, margin: 0, letterSpacing: '-0.01em' }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Per-chapter table */}
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: rc.content.fontSize.label, fontWeight: 700, color: headingColor, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {isEN ? 'Per-Chapter Breakdown' : 'Razčlenitev po poglavjih'}
        </h4>
        <div style={{ border: '1px solid ' + borderColor, borderRadius: '0.75rem', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: rc.content.fontSize.xs }}>
            <thead>
              <tr style={{ background: altRowBg }}>
                {[
                  isEN ? 'Chapter' : 'Poglavje',
                  isEN ? 'Calls' : 'Klici',
                  isEN ? 'Input Tok.' : 'Vhodni tok.',
                  isEN ? 'Output Tok.' : 'Izhodni tok.',
                  isEN ? 'Cost (EUR)' : 'Strošek (EUR)',
                  isEN ? 'Last Model' : 'Zadnji model',
                ].map((h, i) => (
                  <th key={i} style={{ padding: '8px 12px', textAlign: i === 0 ? 'left' : 'right', color: mutedColor, fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid ' + borderColor }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chapters.map(([key, ch], i) => (
                <tr key={key} style={{ background: i % 2 === 0 ? cardBg : altRowBg }}>
                  <td style={{ padding: '8px 12px', color: textColor, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: barColors[i % barColors.length], flexShrink: 0 }} />
                    {chapterLabel(key, language)}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: textColor }}>{ch.totalCalls}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: textColor }}>{fmtNum(ch.totalInputTokens)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: textColor }}>{fmtNum(ch.totalOutputTokens)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: isDark ? '#a5b4fc' : '#4f46e5' }}>{fmtEur(ch.totalCostEUR)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: mutedColor, fontSize: '11px' }}>{ch.lastModel?.split('/').pop() || '—'}</td>
                </tr>
              ))}
              <tr style={{ background: isDark ? '#12121e' : '#f1f5f9', borderTop: '2px solid ' + borderColor }}>
                <td style={{ padding: '8px 12px', fontWeight: 800, color: headingColor }}>TOTAL</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: textColor }}>{totalCalls}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: textColor }}>{fmtNum(chapters.reduce((s, [, c]) => s + c.totalInputTokens, 0))}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: textColor }}>{fmtNum(chapters.reduce((s, [, c]) => s + c.totalOutputTokens, 0))}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: isDark ? '#a5b4fc' : '#4f46e5', fontSize: '0.95rem' }}>{fmtEur(usage.grandTotalEUR)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Cost per model */}
      {modelEntries.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: rc.content.fontSize.label, fontWeight: 700, color: headingColor, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {isEN ? 'Cost per Model' : 'Strošek po modelu'}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {modelEntries.map(([model, cost], i) => (
              <div key={model} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ minWidth: 140, fontSize: rc.content.fontSize.xs, color: textColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{model.split('/').pop()}</span>
                <div style={{ flex: 1, height: 8, background: isDark ? '#1e1e38' : '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: (cost / maxModelCost * 100) + '%', height: '100%', background: barColors[i % barColors.length], borderRadius: 4, transition: 'width 0.5s' }} />
                </div>
                <span style={{ minWidth: 70, textAlign: 'right', fontSize: rc.content.fontSize.xs, fontWeight: 700, color: isDark ? '#a5b4fc' : '#4f46e5' }}>{fmtEur(cost)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent calls */}
      {recentRecords.length > 0 && (
        <div>
          <h4 style={{ fontSize: rc.content.fontSize.label, fontWeight: 700, color: headingColor, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {isEN ? 'Recent API Calls' : 'Zadnji API klici'}
          </h4>
          <div style={{ border: '1px solid ' + borderColor, borderRadius: '0.75rem', overflow: 'hidden' }}>
            {recentRecords.map((rec, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px',
                borderBottom: i < recentRecords.length - 1 ? '1px solid ' + borderColor : 'none',
                background: i % 2 === 0 ? cardBg : altRowBg, gap: 8,
              }}>
                <span style={{ fontSize: '11px', color: mutedColor, whiteSpace: 'nowrap' }}>{timeAgo(rec.timestamp, language)}</span>
                <span style={{ flex: 1, fontSize: rc.content.fontSize.xs, color: textColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chapterLabel(rec.chapterKey, language)}</span>
                <span style={{ fontSize: '11px', color: mutedColor, whiteSpace: 'nowrap' }}>{rec.model?.split('/').pop()}</span>
                <span style={{ fontSize: '11px', color: mutedColor, whiteSpace: 'nowrap' }}>{fmtTokens(rec.inputTokens + rec.outputTokens)} tok</span>
                {pathBadge(rec.generationPath)}
                <span style={{ fontSize: rc.content.fontSize.xs, fontWeight: 700, color: isDark ? '#a5b4fc' : '#4f46e5', whiteSpace: 'nowrap' }}>{fmtEur(rec.costEUR)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main component ──────────────────────────────────────────────
const UsageDashboard: React.FC<UsageDashboardProps> = ({ usage, language, variant, isDark = false }) => {
  const { config: rc } = useResponsive();
  const isEN = language === 'en';

  if (!usage || !usage.chapters || Object.keys(usage.chapters).length === 0) {
    if (variant === 'compact') return null; // hide compact if no data
    return (
      <div style={{
        textAlign: 'center', padding: '32px 16px', color: isDark ? '#8080a0' : '#94a3b8',
        fontSize: rc.content.fontSize.body,
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📊</div>
        <p style={{ margin: 0, fontWeight: 500 }}>
          {isEN ? 'No API usage data yet.' : 'Še ni podatkov o porabi.'}
        </p>
        <p style={{ margin: '4px 0 0', fontSize: rc.content.fontSize.xs }}>
          {isEN ? 'Generate content to see usage statistics.' : 'Generirajte vsebino za prikaz statistike.'}
        </p>
      </div>
    );
  }

  if (variant === 'compact') {
    return <CompactUsage usage={usage} language={language} isDark={isDark} />;
  }

  return <FullUsage usage={usage} language={language} isDark={isDark} />;
};

export default UsageDashboard;

// END OF UsageDashboard.tsx v1.0
