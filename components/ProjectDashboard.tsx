// components/ProjectDashboard.tsx
// ═══════════════════════════════════════════════════════════════
// v2.5 — 2026-02-24 — DEFENSIVE ARRAY HANDLING
//   ★ v2.5: NEW safeArray() utility — handles AI returning objects
//           instead of arrays (e.g. { objectives: [...] } vs [...])
//   ★ v2.5: All .filter/.some/.length calls now use safeArray()
//   ★ v2.5: calculateOverallCompleteness uses safeArray() for
//           activities, risks, generalObjectives, specificObjectives
//   ★ v2.4: Responsive — charts grid adapts to screen width
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect, useMemo } from 'react';
import { extractStructuralData } from '../services/DataExtractionService.ts';
import ChartRenderer from './ChartRenderer.tsx';
import { lightColors, darkColors, shadows, radii, spacing, typography } from '../design/theme.ts';
import { getThemeMode, onThemeChange } from '../services/themeService.ts';
import { ProgressRing } from '../design/index.ts';
import UsageDashboard from './UsageDashboard.tsx'; // EO-140c

interface ProjectDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  projectData: any;
  language: 'en' | 'si';
}

const DashboardIcons = {
  document: (color: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  tag: (color: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
  calendar: (color: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  play: (color: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" />
    </svg>
  ),
  layers: (color: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  shield: (color: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  target: (color: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
};

const SKIP_KEYS = new Set([
  'id', 'project_id', 'created_at', 'updated_at',
  'category', 'likelihood', 'impact', 'type', 'dependencies',
  'startDate', 'durationMonths', '_calculatedEndDate', '_projectTimeframe',
]);

const hasRealStr = (v: any): boolean => typeof v === 'string' && v.trim().length > 0;

// ★ v2.5: Safe array extractor — AI sometimes returns { objectives: [...] }
// instead of [...]. This function always returns a proper array.
const safeArray = (v: any): any[] => {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    // Look for first array property inside the object
    const keys = Object.keys(v);
    for (const k of keys) {
      if (Array.isArray(v[k])) return v[k];
    }
  }
  return [];
};

// ★ v2.5: arrHasContent now accepts any type safely
const arrHasContent = (arr: any): boolean => {
  const safe = safeArray(arr);
  if (safe.length === 0) return false;
  return safe.some((item: any) => {
    if (typeof item === 'string') return item.trim().length > 0;
    if (typeof item !== 'object' || item === null) return false;
    return Object.entries(item).some(([k, v]) => {
      if (SKIP_KEYS.has(k)) return false;
      if (typeof v === 'string') return v.trim().length > 0;
      if (Array.isArray(v)) return arrHasContent(v);
      return false;
    });
  });
};

const objHasContent = (obj: any): boolean => {
  if (!obj || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) return arrHasContent(obj);
  return Object.entries(obj).some(([k, v]) => {
    if (SKIP_KEYS.has(k)) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    if (Array.isArray(v)) return arrHasContent(v);
    if (typeof v === 'object' && v !== null) return objHasContent(v);
    return false;
  });
};

// ★ v2.5: calculateOverallCompleteness uses safeArray for array sections
const calculateOverallCompleteness = (projectData: any): number => {
  if (!projectData) return 0;
  const sectionChecks: { key: string; check: (data: any) => boolean }[] = [
    { key: 'problemAnalysis', check: (d) => { if (!d) return false; return hasRealStr(d.coreProblem?.title) || hasRealStr(d.coreProblem?.description) || arrHasContent(d.causes) || arrHasContent(d.consequences); } },
    { key: 'projectIdea', check: (d) => { if (!d) return false; return hasRealStr(d.projectTitle) || hasRealStr(d.projectAcronym) || hasRealStr(d.mainAim) || hasRealStr(d.stateOfTheArt) || hasRealStr(d.proposedSolution) || arrHasContent(d.policies) || (d.readinessLevels && [d.readinessLevels.TRL, d.readinessLevels.SRL, d.readinessLevels.ORL, d.readinessLevels.LRL].some((r: any) => typeof r?.level === 'number' && r.level > 0)); } },
    { key: 'generalObjectives', check: (d) => arrHasContent(d) },
    { key: 'specificObjectives', check: (d) => arrHasContent(d) },
    { key: 'projectManagement', check: (d) => { if (!d) return false; return hasRealStr(d.description) || objHasContent(d.structure); } },
    { key: 'activities', check: (d) => { const safe = safeArray(d); return safe.some((wp: any) => hasRealStr(wp.title) || arrHasContent(wp.tasks) || arrHasContent(wp.milestones) || arrHasContent(wp.deliverables)); } },
    { key: 'outputs', check: (d) => arrHasContent(d) },
    { key: 'outcomes', check: (d) => arrHasContent(d) },
    { key: 'impacts', check: (d) => arrHasContent(d) },
    { key: 'risks', check: (d) => { const safe = safeArray(d); return safe.some((r: any) => hasRealStr(r.title) || hasRealStr(r.description) || hasRealStr(r.mitigation)); } },
    { key: 'kers', check: (d) => arrHasContent(d) },
  ];
  let filledCount = 0;
  let totalCount = 0;
  for (const { key, check } of sectionChecks) {
    const data = projectData?.[key];
    if (data === undefined || data === null) continue;
    totalCount++;
    try {
      if (check(data)) filledCount++;
    } catch (e) {
      // ★ v2.5: Never crash on data inspection
      console.warn(`[ProjectDashboard] Error checking ${key}:`, e);
    }
  }
  return totalCount === 0 ? 0 : Math.round((filledCount / totalCount) * 100);
};

const ProjectDashboard: React.FC<ProjectDashboardProps> = ({ isOpen, onClose, projectData, language }) => {
  const [isDark, setIsDark] = useState(getThemeMode() === 'dark');
  useEffect(() => { const unsub = onThemeChange((m) => setIsDark(m === 'dark')); return unsub; }, []);
  const colors = isDark ? darkColors : lightColors;

  // ★ v2.4: Responsive breakpoint
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const t = language === 'si' ? {
    title: 'Pregled projekta', projectTitle: 'Naziv projekta', acronym: 'Akronim',
    duration: 'Trajanje', startDate: 'Začetek', months: 'mesecev',
    overallProgress: 'Skupni napredek', noData: 'Še ni podatkov za vizualizacijo.',
    close: 'Zapri', workPackages: 'Delovni sklopi', risks: 'Tveganja', objectives: 'Cilji',
  } : {
    title: 'Project Dashboard', projectTitle: 'Project Title', acronym: 'Acronym',
    duration: 'Duration', startDate: 'Start Date', months: 'months',
    overallProgress: 'Overall Progress', noData: 'No data available for visualization yet.',
    close: 'Close', workPackages: 'Work Packages', risks: 'Risks', objectives: 'Objectives',
  };

  const structuralCharts = useMemo(() => extractStructuralData(projectData), [projectData]);
  const overallCompleteness = useMemo(() => calculateOverallCompleteness(projectData), [projectData]);

  const pi = projectData?.projectIdea;
  // ★ v2.5: All stat counts use safeArray() — never crashes
  const wpCount = safeArray(projectData?.activities).filter((wp: any) => hasRealStr(wp.title)).length;
  const riskCount = safeArray(projectData?.risks).filter((r: any) => hasRealStr(r.title)).length;
  const genObjCount = safeArray(projectData?.generalObjectives).filter((o: any) => hasRealStr(o.title)).length;
  const specObjCount = safeArray(projectData?.specificObjectives).filter((o: any) => hasRealStr(o.title)).length;
  const objCount = genObjCount + specObjCount;

  if (!isOpen) return null;

  const iconColors = { primary: colors.primary[500], secondary: colors.secondary[500], warning: colors.warning[500], success: colors.success[500] };

  const MetaCard = ({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) => (
    <div style={{ backgroundColor: colors.surface.card, borderRadius: radii.lg, border: `1px solid ${colors.border.light}`, padding: isMobile ? '12px 14px' : '16px 20px', display: 'flex', alignItems: 'center', gap: isMobile ? '10px' : '14px' }}>
      <div style={{ width: isMobile ? 32 : 40, height: isMobile ? 32 : 40, borderRadius: radii.lg, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: '11px', fontWeight: 600, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{label}</p>
        <p style={{ fontSize: isMobile ? '13px' : '15px', fontWeight: 700, color: colors.text.heading, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || '—'}</p>
      </div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '8px' : '16px', backgroundColor: colors.surface.overlayBlur, backdropFilter: 'blur(4px)' }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ backgroundColor: colors.surface.background, borderRadius: isMobile ? radii.lg : radii.xl, boxShadow: shadows.xl, width: '100%', maxWidth: isMobile ? '100%' : '1100px', maxHeight: '95vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: `1px solid ${colors.border.light}`, animation: 'fadeIn 0.2s ease-out' }}>

        {/* Header */}
        <div style={{ padding: isMobile ? '14px 16px' : '20px 24px', borderBottom: `1px solid ${colors.border.light}`, backgroundColor: colors.surface.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '10px' : '16px' }}>
            <h2 style={{ margin: 0, fontSize: isMobile ? '16px' : '20px', fontWeight: 700, color: colors.text.heading }}>{t.title}</h2>
            <ProgressRing value={overallCompleteness} size={isMobile ? 36 : 48} strokeWidth={isMobile ? 4 : 5} color={overallCompleteness >= 80 ? colors.success[500] : overallCompleteness >= 40 ? colors.warning[500] : colors.error[500]} label={`${overallCompleteness}%`} />
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: radii.md, color: colors.text.muted, fontSize: '20px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.backgroundColor = colors.surface.sidebar; }} onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.backgroundColor = 'transparent'; }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '14px' : '24px' }}>
          {/* Meta cards — top row */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: isMobile ? '16px' : '24px' }}>
            <MetaCard label={t.projectTitle} value={pi?.projectTitle || ''} icon={DashboardIcons.document(iconColors.primary)} />
            <MetaCard label={t.acronym} value={pi?.projectAcronym || ''} icon={DashboardIcons.tag(iconColors.secondary)} />
            <MetaCard label={t.duration} value={pi?.durationMonths ? `${pi.durationMonths} ${t.months}` : ''} icon={DashboardIcons.calendar(iconColors.primary)} />
            <MetaCard label={t.startDate} value={pi?.startDate || ''} icon={DashboardIcons.play(iconColors.success)} />
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '12px', marginBottom: isMobile ? '16px' : '24px' }}>
            <MetaCard label={t.workPackages} value={String(wpCount)} icon={DashboardIcons.layers(iconColors.primary)} />
            <MetaCard label={t.risks} value={String(riskCount)} icon={DashboardIcons.shield(iconColors.warning)} />
            <MetaCard label={t.objectives} value={String(objCount)} icon={DashboardIcons.target(iconColors.success)} />
          </div>

          {/* Charts */}
          {structuralCharts.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
              {structuralCharts.map(chart => (
                <ChartRenderer key={chart.id} data={chart} height={isMobile ? 220 : 280} showTitle={true} showSource={false} />
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: isMobile ? '40px 16px' : '60px 20px', color: colors.text.muted, fontSize: '14px' }}>{t.noData}</div>
          )}
          {/* API Usage & Costs — EO-140c */}
          {typeof UsageDashboard !== 'undefined' && UsageDashboard && projectData?._usage && (
            <div style={{ marginTop: isMobile ? '16px' : '24px' }}>
              <div style={{ padding: '10px 0 10px', borderBottom: '1px solid ' + colors.border.light, marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: colors.text.heading }}>
                  💰 {language === 'si' ? 'Poraba API in stroški' : 'API Usage & Costs'}
                </h3>
              </div>
              <UsageDashboard usage={projectData._usage} language={language} variant="full" isDark={isDark} />
            </div>
          )}
        </div>
        <div style={{ padding: isMobile ? '12px 16px' : '16px 24px', borderTop: `1px solid ${colors.border.light}`, backgroundColor: colors.surface.card, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 20px', fontSize: '14px', fontWeight: 600, color: colors.text.body, backgroundColor: colors.surface.sidebar, border: `1px solid ${colors.border.light}`, borderRadius: radii.md, cursor: 'pointer' }} onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.backgroundColor = colors.border.light; }} onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.backgroundColor = colors.surface.sidebar; }}>
            {t.close}
          </button>
        </div>

      </div>
    </div>
  );
};

export default ProjectDashboard;
