// App.tsx
// ═══════════════════════════════════════════════════════════════
// Main application shell — orchestration only.
// v5.8.1 — 2026-03-24 — EO-147b: URL verification after inject references
// v5.8 — 2026-03-23 — EO-147: Retroactive Reference Injection
// v5.7 — 2026-03-23 — EO-146: Fix collectFromSection — prefixed markers, URL verification
// v5.6 — 2026-03-22 — EO-140: Responsive toolbar via useResponsive hook.
// v5.5 — 2026-03-20 — EO-137: Pass generationProgress prop to ProjectDisplay
// v5.4 — 2026-03-09 — EO-058: Pass primaryLang through handleSwitchProjectAndClose
// v5.3 — 2026-03-08 — EO-053: Dashboard click deselects active project
//         AND resets projectData to empty — onOpenDashboard now calls
//         setCurrentProjectId(null) + setProjectData(createEmptyProjectData())
//         before switching to dashboard view. Clears stale step progress
//         from Sidebar and enables free language switching.
// v5.2 — 2026-03-06 — EO-039: Pass onFieldAIGenerate to ProjectDisplay
// v5.1 - Undo/Redo gumbi + Ctrl+Z/Y + Clone handler (EO-037, EO-038)
// v5.0 — 2026-03-06
// ★ v5.0: EO-030 — Delete confirmation for projects and all remove operations
//   - handleDeleteProjectWrapped: ConfirmationModal before project delete
//   - handleRemoveItemWithConfirm: ConfirmationModal before removing WP, partner, objective, etc.
//   - Context-aware labels (EN/SI) with item name display
// v4.9 — 2026-02-21
//   ★ v4.9: Responsive breakpoints — mobile/tablet/desktop layout adaptation
//           DashboardPanel hidden on mobile/tablet, marginLeft responsive
//           Toolbar padding adaptive
//   ★ v4.8: displayTitle prioritizes projectAcronym over projectTitle
//   ★ v4.7: FIX: displayTitle based on currentProjectId
//   ★ v4.6: FIX: hasActiveProject based on currentProjectId, not activeView
//   ★ v4.5: Import Project button added to Dashboard toolbar (RIGHT section)
//           FIX: Center section was corrupted with dashboard buttons — now clean
//   ★ v4.4: FIX: Removed duplicate hasActiveProject declaration
//   ★ v4.3: FIX: "No Project Selected" when no project chosen after login
//   ★ v4.1: FIX: Dashboard scroll — overflow: auto on main when in dashboard view
//   ★ v4.0: Dashboard Home as default view after login
//   ★ v3.0: Multi-Tenant Organization integration
//   v2.4 — 2026-02-18: StepNavigationBar moved to ProjectDisplay
//   v2.3 — 2026-02-18: WelcomeScreen removed
//   v2.2 — 2026-02-18: Toolbar center — project acronym badge
//   v2.1 — 2026-02-17: Sidebar collapse responsive marginLeft
// ═══════════════════════════════════════════════════════════════

import React, { useState, useMemo, useEffect } from 'react';
import ProjectDisplay from './components/ProjectDisplay.tsx';
import PrintLayout from './components/PrintLayout.tsx';
import GanttChart from './components/GanttChart.tsx';
import PERTChart from './components/PERTChart.tsx';
import Organigram from './components/Organigram.tsx';
import ConfirmationModal from './components/ConfirmationModal.tsx';
import AuthScreen from './components/AuthScreen.tsx';
import AdminPanel from './components/AdminPanel.tsx';
import ProjectListModal from './components/ProjectListModal.tsx';
import ProjectDashboard from './components/ProjectDashboard.tsx';
import DashboardPanel from './components/DashboardPanel.tsx';
import DashboardHome from './components/DashboardHome.tsx';
import Sidebar from './components/Sidebar.tsx';
import SummaryModal from './components/SummaryModal.tsx';
import ReferencesEditor from './components/ReferencesEditor.tsx';  // ★ EO-069
import AddReferenceModal from './components/AddReferenceModal.tsx';  // ★ EO-069
import { useAdmin } from './hooks/useAdmin.ts';
import { useOrganization } from './hooks/useOrganization.ts';
import { ensureGlobalInstructionsLoaded } from './services/globalInstructionsService.ts';
import { ICONS, getSteps, BRAND_ASSETS } from './constants.tsx';
import { TEXT } from './locales.ts';
import { isStepCompleted, createEmptyProjectData } from './utils.ts';
import { colors as lightColors, darkColors, shadows, radii, spacing, animation, typography } from './design/theme.ts';
import { initTheme, getThemeMode, onThemeChange } from './services/themeService.ts';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { useAuth } from './hooks/useAuth.ts';
import { useProjectManager } from './hooks/useProjectManager.ts';
import { useTranslation } from './hooks/useTranslation.ts';
import { useGeneration } from './hooks/useGeneration.ts';
import { collectReferencesFromSection, collectReferencesFromText, enrichReferencesWithAI, injectReferencesToText } from './hooks/useGeneration.ts';
import { useResponsive } from './hooks/useResponsive.ts'; // EO-140
 
type ColorScheme = typeof lightColors | typeof darkColors;

/* ═══ SMALL UI COMPONENTS ═══ */

const HamburgerIcon = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="p-2 rounded-md text-slate-500 hover:bg-slate-200 lg:hidden" style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 24, height: 24 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  </button>
);

const ToolbarButton = ({
  onClick, title, icon, disabled = false, variant = 'default', colors: c,
}: {
  onClick: () => void; title: string; icon: React.ReactNode; disabled?: boolean;
  variant?: 'default' | 'primary' | 'success' | 'warning'; colors: ColorScheme;
}) => {
  const variantColors: Record<string, { hover: string; active: string }> = {
    default: { hover: c.primary[50], active: c.primary[600] },
    primary: { hover: c.primary[50], active: c.primary[600] },
    success: { hover: c.success[50], active: c.success[600] },
    warning: { hover: c.warning[50], active: c.warning[600] },
  };
  const vc = variantColors[variant] || variantColors.default;
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{
        padding: spacing.sm, borderRadius: radii.lg, border: 'none', background: 'transparent',
        color: disabled ? c.text.muted : c.text.body, cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: `all ${animation.duration.fast} ${animation.easing.default}`, opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = vc.hover; e.currentTarget.style.color = vc.active; } }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = disabled ? c.text.muted : c.text.body; }}
    >
      {icon}
    </button>
  );
};

const ToolbarSeparator = ({ colors: c }: { colors: ColorScheme }) => (
  <div style={{ width: 1, height: 24, background: c.border.light, margin: `0 ${spacing.xs}`, flexShrink: 0 }} />
);

const ApiWarningBanner = ({ onDismiss, onOpenSettings, language }: { onDismiss: () => void; onOpenSettings: () => void; language: 'en' | 'si'; }) => {
  const t = TEXT[language || 'en'].auth;
  return (
    <div className="bg-amber-100 border-b border-amber-200 text-amber-800 px-4 py-2 text-sm flex justify-between items-center z-[100] relative print:hidden">
      <div className="flex items-center gap-2">
        <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="font-medium">{t.manualModeBanner}</span>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={onOpenSettings} className="underline hover:text-amber-900 font-bold">{t.enterKeyAction}</button>
        <button onClick={onDismiss} className="text-amber-600 hover:text-amber-900">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

/* ═══ MAIN APP COMPONENT ═══ */

const App = () => {
  const [language, setLanguage] = useState<'en' | 'si'>('en');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [adminPanelInitialTab, setAdminPanelInitialTab] = useState<string | undefined>(undefined);
  const [isProjectListOpen, setIsProjectListOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [activeView, setActiveView] = useState<'dashboard' | 'project'>('dashboard');
  const adminHook = useAdmin();
  const orgHook = useOrganization();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dashboardCollapsed, setDashboardCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(getThemeMode() === 'dark');
  const colors = isDark ? darkColors : lightColors;

  // ★ EO-069: References system state
  const [addRefModalOpen, setAddRefModalOpen] = useState(false);
  const [addRefDefaultSection, setAddRefDefaultSection] = useState('');

  // ★ v4.9: Responsive breakpoints
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [isTablet, setIsTablet] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth < 1024);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      setIsMobile(w < 768);
      setIsTablet(w >= 768 && w < 1024);
      setIsDesktop(w >= 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const unsub = onThemeChange((mode) => setIsDark(mode === 'dark'));
    return unsub;
  }, []);

  const [modalConfig, setModalConfig] = useState({
    isOpen: false, title: '', message: '',
    onConfirm: () => {}, onSecondary: null as (() => void) | null,
    onCancel: () => {}, confirmText: '', secondaryText: '', cancelText: '',
  });
  const closeModal = () => { setModalConfig((prev) => ({ ...prev, isOpen: false })); };

  const auth = useAuth();
  const pm = useProjectManager({ language, setLanguage, currentUser: auth.currentUser });
  const openSettingsFromHook = (val: boolean) => { if (val) { setAdminPanelInitialTab('ai'); } setIsSettingsOpen(val); };

  // EO-140: Responsive toolbar config
  const { config: rc, isCompact: isToolbarCompact } = useResponsive();

  const generation = useGeneration({
    projectData: pm.projectData, setProjectData: pm.setProjectData, language,
    ensureApiKey: auth.ensureApiKey, setIsSettingsOpen: openSettingsFromHook,
    setHasUnsavedTranslationChanges: pm.setHasUnsavedTranslationChanges,
    handleUpdateData: pm.handleUpdateData, checkSectionHasContent: pm.checkSectionHasContent,
    setModalConfig, closeModal, currentProjectId: pm.currentProjectId,
    projectVersions: pm.projectVersions, setProjectVersions: pm.setProjectVersions,
    setLanguage,
  });

  const translation = useTranslation({
    language, setLanguage, projectData: pm.projectData, setProjectData: pm.setProjectData,
    projectVersions: pm.projectVersions, setProjectVersions: pm.setProjectVersions,
    currentProjectId: pm.currentProjectId, currentUser: auth.currentUser,
    hasUnsavedTranslationChanges: pm.hasUnsavedTranslationChanges,
    setHasUnsavedTranslationChanges: pm.setHasUnsavedTranslationChanges,
    hasContent: pm.hasContent, ensureApiKey: auth.ensureApiKey,
    setIsLoading: generation.setIsLoading, setError: generation.setError,
    setIsSettingsOpen: openSettingsFromHook, setModalConfig, closeModal,
  });

  /* ═══ EFFECTS ═══ */
  useEffect(() => { if (auth.currentUser) { ensureGlobalInstructionsLoaded(); adminHook.checkAdminStatus(); orgHook.loadOrgs(); } }, [auth.currentUser]);
  useEffect(() => { initTheme(); const unsub = onThemeChange((m) => setIsDark(m === 'dark')); return unsub; }, []);
  useEffect(() => { if (pm.showProjectListOnLogin) { setIsProjectListOpen(true); pm.setShowProjectListOnLogin(false); } }, [pm.showProjectListOnLogin]);
  // ★ v5.1: Keyboard shortcuts for Undo/Redo
  useEffect(function() {
    var handler = function(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (pm.canUndo && activeView === 'project') pm.handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        if (pm.canRedo && activeView === 'project') pm.handleRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return function() { window.removeEventListener('keydown', handler); };
  }, [pm.canUndo, pm.canRedo, pm.handleUndo, pm.handleRedo, activeView]);

  useEffect(() => {
    if (auth.currentUser) {
      setActiveView('dashboard');
    }
  }, [auth.currentUser]);

  useEffect(() => {
    if (activeView === 'project' && !pm.currentProjectId) {
      setActiveView('dashboard');
    }
  }, [activeView, pm.currentProjectId]);

  useEffect(() => {
    const contentArea = document.getElementById('main-content-area');
    if (contentArea) {
      contentArea.scrollTop = 0;
    }
  }, [activeView]);

  /* ═══ DERIVED STATE ═══ */
  const t = TEXT[language] || TEXT['en'];
  const STEPS = getSteps(language);
  const completedStepsStatus = useMemo(() => STEPS.map((step) => isStepCompleted(pm.projectData, step.key)), [pm.projectData, language, STEPS]);
  const currentProjectMeta = pm.userProjects.find((p: any) => p.id === pm.currentProjectId);
  const hasActiveProject = !!pm.currentProjectId;

  const displayTitle = pm.currentProjectId
    ? (pm.projectData.projectIdea?.projectAcronym?.trim() || currentProjectMeta?.title || pm.projectData.projectIdea?.projectTitle || t.projects.untitled)
    : (language === 'si' ? 'Ni izbranega projekta' : 'No Project Selected');

  /* ═══ HANDLERS ═══ */
  const handleSettingsClose = async () => { setIsSettingsOpen(false); setIsAdminPanelOpen(false); setAdminPanelInitialTab(undefined); await auth.checkApiKey(); auth.loadCustomLogo(); };
  const handleLogout = async () => { await auth.handleLogout(); pm.resetOnLogout(); setActiveView('dashboard'); };
  const handleSwitchProjectAndClose = async (projectId: string, primaryLang?: 'en' | 'si') => { await pm.handleSwitchProject(projectId, primaryLang); setIsProjectListOpen(false); setActiveView('project'); pm.setCurrentStepId(1); };
  const handleCreateProjectAndClose = async () => { try { await pm.handleCreateProject(); setIsProjectListOpen(false); setActiveView('project'); pm.setCurrentStepId(1); } catch (e: any) { generation.setError(e.message); } };
  const handleDeleteProjectWrapped = function(projectId: string) {
    var projectMeta = pm.userProjects.find(function(p) { return p.id === projectId; });
    var projectName = (projectMeta && projectMeta.title) ? projectMeta.title : 'Untitled';
    setModalConfig({
      isOpen: true,
      title: language === 'si' ? 'Izbriši projekt' : 'Delete Project',
      message: (language === 'si'
        ? 'Ali ste prepričani, da želite TRAJNO izbrisati projekt "' + projectName + '"? Tega ni mogoče razveljaviti.'
        : 'Are you sure you want to PERMANENTLY delete project "' + projectName + '"? This cannot be undone.'),
      confirmText: language === 'si' ? 'Izbriši' : 'Delete',
      cancelText: language === 'si' ? 'Prekliči' : 'Cancel',
      secondaryText: '',
      onSecondary: null,
      onConfirm: async function() {
        closeModal();
        await pm.handleDeleteProject(projectId);
        if (pm.currentProjectId === projectId || pm.userProjects.length <= 1) {
          setActiveView('dashboard');
          setIsProjectListOpen(false);
        }
      },
      onCancel: function() { closeModal(); },
    });
  };
   // ★ EO-038: Clone project handler
    var handleCloneProjectWrapped = async function(projectId: string) {
      try {
        generation.setIsLoading(language === 'si' ? 'Kloniram projekt...' : 'Cloning project...');
        var newProj = await pm.handleCloneProject(projectId);
        generation.setIsLoading(false);
        if (newProj) {
          await pm.handleSwitchProject(newProj.id);
          setActiveView('project');
          pm.setCurrentStepId(1);
        }
      } catch (e: any) {
        generation.setIsLoading(false);
        generation.setError(e.message);
      }
    };
    // ★ EO-030: Delete confirmation for all remove operations
  var REMOVE_ITEM_LABELS = {
    en: {
      activities: 'Work Package',
      generalObjectives: 'General Objective',
      specificObjectives: 'Specific Objective',
      partners: 'Partner',
      outputs: 'Output',
      outcomes: 'Outcome',
      impacts: 'Impact',
      risks: 'Risk',
      kers: 'Key Exploitable Result',
      expectedResults: 'Expected Result',
      causes: 'Cause',
      consequences: 'Consequence',
    },
    si: {
      activities: 'Delovni sklop',
      generalObjectives: 'Splošni cilj',
      specificObjectives: 'Specifični cilj',
      partners: 'Partner',
      outputs: 'Rezultat',
      outcomes: 'Učinek',
      impacts: 'Vpliv',
      risks: 'Tveganje',
      kers: 'Ključni izkoriščalni rezultat',
      expectedResults: 'Pričakovani rezultat',
      causes: 'Vzrok',
      consequences: 'Posledica',
    },
  };

  var handleRemoveItemWithConfirm = function(path: (string | number)[], index: number) {
    // Determine item type from path for a meaningful message
    var sectionKey = '';
    for (var i = 0; i < path.length; i++) {
      if (typeof path[i] === 'string' && REMOVE_ITEM_LABELS.en[path[i] as string]) {
        sectionKey = path[i] as string;
        break;
      }
    }
    var labels = REMOVE_ITEM_LABELS[language] || REMOVE_ITEM_LABELS.en;
    var itemLabel = labels[sectionKey] || (language === 'si' ? 'element' : 'item');

    // Try to find a name/title for the item being deleted
    var itemName = '';
    try {
      var list = path.reduce(function(acc: any, key: string | number) { return acc && acc[key] !== undefined ? acc[key] : undefined; }, pm.projectData);
      if (Array.isArray(list) && list[index]) {
        itemName = list[index].title || list[index].name || list[index].id || '';
      }
    } catch (e) { /* ignore */ }

    var displayName = itemName ? ' "' + (itemName.length > 50 ? itemName.substring(0, 50) + '...' : itemName) + '"' : '';

    setModalConfig({
      isOpen: true,
      title: language === 'si' ? 'Izbriši ' + itemLabel : 'Delete ' + itemLabel,
      message: language === 'si'
        ? 'Ali res želite izbrisati ' + itemLabel.toLowerCase() + displayName + '?'
        : 'Are you sure you want to delete ' + itemLabel.toLowerCase() + displayName + '?',
      confirmText: language === 'si' ? 'Izbriši' : 'Delete',
      cancelText: language === 'si' ? 'Prekliči' : 'Cancel',
      secondaryText: '',
      onSecondary: null,
      onConfirm: function() {
        closeModal();
        pm.handleRemoveItem(path, index);
      },
      onCancel: function() { closeModal(); },
    });
  };

  const handlePrint = () => window.print();
  const handleExportDocx = async () => { try { await pm.handleExportDocx(generation.setIsLoading, true); } catch (e: any) { alert(e.message); } };
  const handleImportProject = async (event: React.ChangeEvent<HTMLInputElement>) => { generation.setIsLoading(true); try { await pm.handleImportProject(event); setActiveView('project'); pm.setCurrentStepId(1); } catch (e: any) { generation.setError(`Failed to import: ${e.message}`); } finally { generation.setIsLoading(false); } };

  // ★ EO-069: References CRUD handlers
  const handleAddReference = (ref: any) => {
    const newRef = { ...ref, id: 'ref_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) };
    const currentRefs = Array.isArray(pm.projectData.references) ? pm.projectData.references : [];
    pm.handleUpdateData(['references'], [...currentRefs, newRef]);
    setAddRefModalOpen(false);
  };

  const handleEditReference = (id: string, updates: any) => {
    const currentRefs = Array.isArray(pm.projectData.references) ? pm.projectData.references : [];
    const updated = currentRefs.map((r: any) => r.id === id ? { ...r, ...updates } : r);
    pm.handleUpdateData(['references'], updated);
  };

  const handleDeleteReference = (id: string) => {
    const currentRefs = Array.isArray(pm.projectData.references) ? pm.projectData.references : [];
    pm.handleUpdateData(['references'], currentRefs.filter((r: any) => r.id !== id));
  };

  const handleOpenAddRefModal = (sectionKey?: string) => {
    setAddRefDefaultSection(sectionKey || '');
    setAddRefModalOpen(true);
  };

  // ★ EO-070: AI reference generation handlers
  const [isCollectingRefs, setIsCollectingRefs] = useState(false);
  const [isGeneratingRefs, setIsGeneratingRefs] = useState(false);
  const [unverifiedClaims, setUnverifiedClaims] = useState<any[]>([]);

  // EO-146: Inline chapter prefix helper (module-private _getChapterPrefix not exported)
  const _getChapterPrefixForCollect = (sectionKey: string): string => {
    const map: Record<string, string> = {
      problemAnalysis: 'PA', projectIdea: 'PI', generalObjectives: 'GO',
      specificObjectives: 'SO', projectManagement: 'PM', partners: 'PT',
      activities: 'AC', risks: 'RS', outputs: 'ER', outcomes: 'ER',
      impacts: 'ER', kers: 'ER', methodology: 'ME', dissemination: 'DI',
    };
    return map[sectionKey] || sectionKey.substring(0, 2).toUpperCase();
  };

  const handleCollectFromSection = async (sectionKey: string) => {
    const sectionData = pm.projectData[sectionKey] || (pm.projectData.projectIdea && pm.projectData.projectIdea[sectionKey]);
    if (!sectionData) return;
    const newRefs = collectReferencesFromSection(sectionKey, sectionData);
    if (newRefs.length === 0) {
      generation.setError(language === 'si' ? 'V besedilu ni najdenih citatov.' : 'No citations found in text.');
      setTimeout(() => generation.setError(null), 3000);
      return;
    }
    const currentRefs = Array.isArray(pm.projectData.references) ? pm.projectData.references : [];
    const deduped = newRefs.filter((nr: any) => !currentRefs.some((cr: any) => cr.authors === nr.authors && String(cr.year) === String(nr.year)));
    if (deduped.length === 0) {
      generation.setError(language === 'si' ? 'Vsi citati so že dodani.' : 'All citations already added.');
      setTimeout(() => generation.setError(null), 3000);
      return;
    }

    generation.setIsLoading(language === 'si' ? 'Obogatitev virov z AI...' : 'Enriching references with AI...');
    try {
      const enriched = await enrichReferencesWithAI(deduped, pm.projectData, language);

      // EO-146: Assign chapterPrefix and prefixed inlineMarker to each reference
      const chapterPrefix = _getChapterPrefixForCollect(sectionKey);
      const existingChapterRefs = currentRefs.filter((r: any) => r.chapterPrefix === chapterPrefix);
      let nextNum = existingChapterRefs.length + 1;

      enriched.forEach((ref: any) => {
        ref.sectionKey = sectionKey;
        ref.chapterPrefix = chapterPrefix;
        ref.inlineMarker = '[' + chapterPrefix + '-' + nextNum + ']';
        nextNum++;
      });

      const merged = [...currentRefs, ...enriched];
      pm.handleUpdateData(['references'], merged);

      generation.setError(language === 'si' ? enriched.length + ' novih virov dodanih z označbami [' + chapterPrefix + '-N].' : enriched.length + ' new references added with markers [' + chapterPrefix + '-N].');
      setTimeout(() => generation.setError(null), 3000);
    } catch (e: any) {
      // Fallback: add without enrichment but WITH markers
      const chapterPrefix = _getChapterPrefixForCollect(sectionKey);
      const existingChapterRefs = currentRefs.filter((r: any) => r.chapterPrefix === chapterPrefix);
      let nextNum = existingChapterRefs.length + 1;

      deduped.forEach((ref: any) => {
        ref.sectionKey = sectionKey;
        ref.chapterPrefix = chapterPrefix;
        ref.inlineMarker = '[' + chapterPrefix + '-' + nextNum + ']';
        nextNum++;
      });

      pm.handleUpdateData(['references'], [...currentRefs, ...deduped]);
      generation.setError(language === 'si' ? deduped.length + ' novih virov dodanih.' : deduped.length + ' new references added.');
      setTimeout(() => generation.setError(null), 3000);
    } finally {
      generation.setIsLoading(false);
    }
  };

  // EO-147: Retroactive Reference Injection — add citations to text that has none
  const handleInjectReferencesToSection = async (sectionKey: string) => {
    const sectionData = pm.projectData[sectionKey] || (pm.projectData.projectIdea && pm.projectData.projectIdea[sectionKey]);
    if (!sectionData) return;
    generation.setIsLoading(language === 'si' ? 'Dodajam reference k besedilu...' : 'Adding references to text...');
    try {
      const { updatedSectionData, newRefs } = await injectReferencesToText(sectionKey, sectionData, pm.projectData, language);
      const currentRefs = Array.isArray(pm.projectData.references) ? pm.projectData.references : [];
      pm.handleUpdateData([sectionKey], updatedSectionData);
      if (newRefs.length > 0) {
        pm.handleUpdateData(['references'], [...currentRefs, ...newRefs]);
      }

      // EO-147b: Trigger URL verification for injected references (fire-and-forget)
      if (newRefs.length > 0) {
        try {
          const { verifyReferencesBatch } = await import('./services/referenceVerificationService.ts');
          console.log('[EO-147b] Starting URL verification for ' + newRefs.length + ' injected refs...');
          const verResults = await verifyReferencesBatch(newRefs);
          if (verResults && verResults.length > 0) {
            const verifiedCount = verResults.filter((v: any) => v.urlVerified).length;
            const brokenCount = verResults.filter((v: any) => !v.urlVerified).length;
            console.log('[EO-147b] URL verification: ' + verifiedCount + ' verified, ' + brokenCount + ' broken');
            pm.setProjectData((prev: any) => {
              const updatedRefs = (prev.references || []).map((ref: any) => {
                const match = verResults.find((vr: any) => vr.id === ref.id);
                if (!match) return ref;
                return {
                  ...ref,
                  urlVerified: match.urlVerified,
                  verificationStatus: match.verificationStatus,
                  verificationMethod: match.verificationMethod,
                  resolvedUrl: match.resolvedUrl,
                };
              });
              const updated = { ...prev, references: updatedRefs };
              if (pm.currentProjectId) {
                storageService.saveProject(updated, language, pm.currentProjectId);
              }
              return updated;
            });
          }
        } catch (verErr: any) {
          console.warn('[EO-147b] URL verification failed (non-fatal):', verErr?.message);
        }
      }

      generation.setError(language === 'si'
        ? newRefs.length + ' referenc dodanih k besedilu.'
        : newRefs.length + ' references injected into text.');
      setTimeout(() => generation.setError(null), 3000);
    } catch (e: any) {
      generation.setError(language === 'si' ? 'Napaka pri dodajanju referenc.' : 'Failed to inject references.');
      setTimeout(() => generation.setError(null), 3000);
    } finally {
      generation.setIsLoading(false);
    }
  };

  const handleCollectAllReferences = async () => {
    setIsCollectingRefs(true);
    try {
      const newRefs = collectReferencesFromText(pm.projectData);
      if (newRefs.length === 0) {
        generation.setError(language === 'si' ? 'V projektu ni najdenih citatov.' : 'No citations found in project.');
        setTimeout(() => generation.setError(null), 3000);
        return;
      }
      const currentRefs = Array.isArray(pm.projectData.references) ? pm.projectData.references : [];
      const deduped = newRefs.filter((nr: any) => !currentRefs.some((cr: any) => cr.authors === nr.authors && String(cr.year) === String(nr.year)));
      if (deduped.length === 0) {
        generation.setError(language === 'si' ? 'Vsi citati so že dodani.' : 'All citations already added.');
        setTimeout(() => generation.setError(null), 3000);
        return;
      }
      // Enrich with AI
      generation.setIsLoading(language === 'si' ? 'Obogatitev virov z AI...' : 'Enriching references with AI...');
      try {
        const enriched = await enrichReferencesWithAI(deduped, pm.projectData, language);
        pm.handleUpdateData(['references'], [...currentRefs, ...enriched]);
        generation.setError(language === 'si' ? enriched.length + ' novih virov dodanih in obogatenih.' : enriched.length + ' new references added and enriched.');
        setTimeout(() => generation.setError(null), 3000);
      } catch (e: any) {
        // Fallback: add without enrichment
        pm.handleUpdateData(['references'], [...currentRefs, ...deduped]);
        generation.setError(language === 'si' ? deduped.length + ' novih virov dodanih.' : deduped.length + ' new references added.');
        setTimeout(() => generation.setError(null), 3000);
      } finally {
        generation.setIsLoading(false);
      }
    } finally {
      setIsCollectingRefs(false);
    }
  };

  const handleGenerateAndVerifyRefs = async () => {
    setIsGeneratingRefs(true);
    generation.setIsLoading(language === 'si' ? 'Generiram in preverjam vire z AI...' : 'Generating and verifying references with AI...');
    try {
      const result = await generation.generateAndVerifyReferences();
      if (result) {
        const currentRefs = Array.isArray(pm.projectData.references) ? pm.projectData.references : [];
        if (result.newRefs.length > 0) {
          pm.handleUpdateData(['references'], [...currentRefs, ...result.newRefs]);
        }
        if (result.unverifiedClaims.length > 0) {
          setUnverifiedClaims(result.unverifiedClaims);
        }
        const msg = language === 'si'
          ? result.newRefs.length + ' preverjenih virov dodanih' + (result.unverifiedClaims.length > 0 ? ', ' + result.unverifiedClaims.length + ' nepreverjenih' : '') + '.'
          : result.newRefs.length + ' verified references added' + (result.unverifiedClaims.length > 0 ? ', ' + result.unverifiedClaims.length + ' unverified' : '') + '.';
        generation.setError(msg);
        setTimeout(() => generation.setError(null), 5000);
      }
    } finally {
      setIsGeneratingRefs(false);
      generation.setIsLoading(false);
    }
  };

  // ★ EO-069: Section label map for references UI
  const referenceSectionLabels = useMemo(() => {
    const t = TEXT[language] || TEXT['en'];
    return {
      problemAnalysis: t.steps?.problemAnalysis || 'Problem Analysis',
      stateOfTheArt: t.subSteps?.stateOfTheArt || 'State of the Art',
      proposedSolution: t.subSteps?.proposedSolution || 'Proposed Solution',
      mainAim: t.subSteps?.mainAim || 'Main Aim',
      generalObjectives: t.steps?.generalObjectives || 'General Objectives',
      specificObjectives: t.steps?.specificObjectives || 'Specific Objectives',
      activities: t.steps?.activities || 'Activities',
      expectedResults: t.steps?.expectedResults || 'Expected Results',
      outputs: t.subSteps?.outputs || 'Outputs',
      outcomes: t.subSteps?.outcomes || 'Outcomes',
      impacts: t.subSteps?.impacts || 'Impacts',
      risks: t.subSteps?.riskMitigation || 'Risks',
      kers: t.subSteps?.kers || 'KER',
      methodology: t.methodology || 'Methodology',
      impact: t.impact || 'Impact',
      dissemination: t.dissemination || 'Dissemination',
      projectManagement: t.management?.title || 'Project Management',
    };
  }, [language]);


  const handleOpenProjectFromDashboard = async (projectId: string) => {
    await pm.handleSwitchProject(projectId);
    setActiveView('project');
    pm.setCurrentStepId(1);
  };

  const handleCreateProjectFromDashboard = async () => {
    try {
      await pm.handleCreateProject();
      setActiveView('project');
      pm.setCurrentStepId(1);
    } catch (e: any) {
      generation.setError(e.message);
    }
  };

  const handleSwitchOrg = async (orgId: string) => {
    const result = await orgHook.switchOrg(orgId);
    if (result.success) {
      await pm.refreshProjectList();
      pm.setCurrentProjectId(null);
      await pm.loadActiveProject();
      setActiveView('dashboard');
    }
  };

  /* ═══ UNAUTHENTICATED VIEW ═══ */
  if (!auth.currentUser) {
    return (
      <>
        {auth.shouldShowBanner && (
          <ApiWarningBanner onDismiss={auth.dismissWarning} onOpenSettings={() => { setAdminPanelInitialTab('ai'); setIsSettingsOpen(true); }} language={language} />
        )}
        <AdminPanel isOpen={isSettingsOpen} onClose={handleSettingsClose} language={language} initialTab="ai" />
        <AuthScreen
          onLoginSuccess={auth.handleLoginSuccess} language={language}
          setLanguage={(lang: string) => setLanguage(lang as 'en' | 'si')}
          onOpenSettings={() => { setAdminPanelInitialTab('ai'); setIsSettingsOpen(true); }}
          needsMFAVerify={auth.needsMFAVerify} mfaFactorId={auth.mfaFactorId}
          onMFAVerified={auth.handleMFAVerified} onMFACancel={handleLogout}
        />
      </>
    );
  }

  /* ═══ AUTHENTICATED VIEW ═══ */
  return (
    <>
      {/* ═══ MODALS ═══ */}
      <ConfirmationModal isOpen={modalConfig.isOpen} {...modalConfig} />
      <AdminPanel isOpen={isAdminPanelOpen || isSettingsOpen} onClose={handleSettingsClose} language={language} initialTab={adminPanelInitialTab} />
      <ProjectDashboard isOpen={isDashboardOpen} onClose={() => setIsDashboardOpen(false)} projectData={pm.projectData} language={language} />
      <ProjectListModal
        isOpen={isProjectListOpen} onClose={() => setIsProjectListOpen(false)}
        projects={pm.userProjects} currentProjectId={pm.currentProjectId}
        onSelectProject={handleSwitchProjectAndClose} onCreateProject={handleCreateProjectAndClose}
        onDeleteProject={handleDeleteProjectWrapped} onCloneProject={handleCloneProjectWrapped}
        language={language}
      />
      <SummaryModal
        isOpen={generation.summaryModalOpen} onClose={() => generation.setSummaryModalOpen(false)}
        summaryText={generation.summaryText} isGenerating={generation.isGeneratingSummary}
        onRegenerate={generation.runSummaryGeneration} onDownloadDocx={generation.handleDownloadSummaryDocx}
        language={language}
      />

      {/* ═══ MAIN APP LAYOUT ═══ */}
      <div style={{
        display: 'flex', flexDirection: 'column', height: '100dvh',
        background: colors.surface.background, fontFamily: typography.fontFamily.sans, overflow: 'hidden',
      }} className="print:hidden">
        {auth.shouldShowBanner && (
          <ApiWarningBanner
            onDismiss={auth.dismissWarning}
            onOpenSettings={() => { setAdminPanelInitialTab('ai'); setIsSettingsOpen(true); }}
            language={language}
          />
        )}

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
          {/* Loading overlay — hidden when GenerationProgressModal is active (EO-137b-FIX3) */}
          {generation.isLoading && !generation.generationProgress?.visible && (
            <div style={{
              position: 'fixed', inset: 0,
              background: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)',
              zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(4px)', cursor: 'wait',
            }}>
              <div style={{
                background: colors.surface.card, padding: spacing['3xl'],
                borderRadius: radii.xl, boxShadow: shadows.xl, textAlign: 'center',
                border: `1px solid ${colors.border.light}`,
              }}>
                <div style={{
                  width: 32, height: 32, border: `4px solid ${colors.primary[500]}`,
                  borderTopColor: 'transparent', borderRadius: '50%',
                  animation: 'spin 1s linear infinite', margin: '0 auto 16px',
                }} />
                <p style={{ fontWeight: typography.fontWeight.semibold, color: colors.text.heading, margin: '0 0 16px 0' }}>
  {typeof generation.isLoading === 'string' ? generation.isLoading : t.loading}
</p>
{generation.cancelGeneration && (
  <button
    onClick={generation.cancelGeneration}
    style={{
      marginTop: 4,
      padding: '8px 24px',
      fontSize: '14px',
      fontWeight: 700,
      color: '#fff',
      background: '#ef4444',
      border: 'none',
      borderRadius: radii.lg,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      transition: 'background 0.15s ease',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.background = '#dc2626'; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = '#ef4444'; }}
  >
    ✕ {language === 'si' ? 'Prekliči generiranje' : 'Cancel generation'}
  </button>
)}

              </div>
            </div>
          )}

          {/* ═══ SIDEBAR ═══ */}
          <Sidebar
            language={language} projectData={pm.projectData} currentStepId={pm.currentStepId}
            setCurrentStepId={(id: number) => { if (pm.currentProjectId) { pm.setCurrentStepId(id); setActiveView('project'); } }}
            completedStepsStatus={completedStepsStatus}
            displayTitle={displayTitle} currentUser={auth.displayName || auth.currentUser?.split('@')[0] || auth.currentUser || ''} appLogo={auth.appLogo}
            isAdmin={adminHook.isAdmin} isSidebarOpen={isSidebarOpen}
            activeOrg={orgHook.activeOrg} userOrgs={orgHook.userOrgs}
            onSwitchOrg={handleSwitchOrg} isSwitchingOrg={orgHook.isSwitching}
            onCloseSidebar={() => setIsSidebarOpen(false)}
            onBackToWelcome={() => setActiveView('dashboard')}
            onOpenProjectList={() => setIsProjectListOpen(true)}
            onOpenAdminPanel={(tab?: string) => { setAdminPanelInitialTab(tab); setIsAdminPanelOpen(true); }}
            onLogout={handleLogout} onLanguageSwitch={translation.handleLanguageSwitchRequest}
            onSubStepClick={(subStepId: string) => {
              setActiveView('project');
              requestAnimationFrame(() => {
                setTimeout(() => {
                  pm.handleSubStepClick(subStepId);
                }, 100);
              });
            }}
            isLoading={!!generation.isLoading}
            onCollapseChange={setSidebarCollapsed}
            activeView={activeView}
            onOpenDashboard={() => { pm.setCurrentProjectId(null); pm.setProjectData(createEmptyProjectData()); setActiveView('dashboard'); }}
            hasActiveProject={hasActiveProject}
          />

          {/* ═══ MAIN CONTENT ═══ */}
          <main style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            marginLeft: isDesktop ? (sidebarCollapsed ? 64 : 280) : 0,
            marginRight: 0,
            transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}>

            {/* ★ v4.9: TOOLBAR — ALWAYS VISIBLE, content adapts to activeView */}
            <div style={{
              background: colors.surface.card, borderBottom: `1px solid ${colors.border.light}`,
              padding: `${spacing.sm} ${isMobile ? spacing.sm : spacing.lg}`, display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: isMobile ? '2px' : spacing.sm, flexShrink: 0,
              minHeight: rc.toolbar.height,
            }}>

              {/* ═══ LEFT: hamburger (mobile) + context button ═══ */}
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexShrink: 0 }}>
                <div className="lg:hidden">
                  <HamburgerIcon onClick={() => setIsSidebarOpen(true)} />
                </div>
                {activeView === 'project' ? (
                  <ToolbarButton colors={colors} onClick={() => setActiveView('dashboard')}
                    title={language === 'si' ? 'Nazaj na nadzorno ploščo' : 'Back to Dashboard'} variant="default"
                    icon={<svg style={{ width: rc.toolbar.iconSize, height: rc.toolbar.iconSize }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>}
                  />
                ) : (
                  <ToolbarButton colors={colors} onClick={() => setIsProjectListOpen(true)}
                    title={language === 'si' ? 'Odpri projekt' : 'Open Project'} variant="primary"
                    icon={<svg style={{ width: rc.toolbar.iconSize, height: rc.toolbar.iconSize }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>}
                  />
                )}
              </div>

              {/* ═══ CENTER: Title — adapts to view ═══ */}
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '10px', minWidth: 0, overflow: 'hidden', padding: `0 ${isMobile ? spacing.xs : spacing.md}`,
              }}>
                {activeView === 'dashboard' ? (
                  <span style={{
                    fontSize: isMobile ? '12px' : rc.toolbar.fontSize, fontWeight: 600, color: colors.text.heading,
                    whiteSpace: 'nowrap', letterSpacing: '0.02em',
                  }}>
                    {language === 'si' ? 'Nadzorna plošča' : 'Dashboard'}
                  </span>
                ) : (
                  <>
                    {pm.projectData?.projectIdea?.projectAcronym?.trim() ? (
                      <>
                        <span style={{
                          fontSize: rc.toolbar.fontSize, fontWeight: 800, color: colors.primary[600],
                          background: isDark ? colors.primary[900] + '40' : colors.primary[50],
                          border: `1.5px solid ${isDark ? colors.primary[700] : colors.primary[200]}`,
                          padding: '3px 10px', borderRadius: radii.md, letterSpacing: '0.06em',
                          whiteSpace: 'nowrap', flexShrink: 0, textTransform: 'uppercase',
                        }}>
                          {pm.projectData.projectIdea.projectAcronym.trim()}
                        </span>
                        {!isMobile && (
                          <>
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: colors.border.medium, flexShrink: 0 }} />
                            <span style={{
                              fontSize: rc.toolbar.fontSize, fontWeight: 600, color: colors.text.heading,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
                            }} title={pm.projectData.projectIdea.projectTitle || ''}>
                              {pm.projectData.projectIdea.projectTitle?.trim() || ''}
                            </span>
                          </>
                        )}
                      </>
                    ) : pm.projectData?.projectIdea?.projectTitle?.trim() ? (
                      <span style={{
                        fontSize: rc.toolbar.fontSize, fontWeight: 600, color: colors.text.heading,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
                      }} title={pm.projectData.projectIdea.projectTitle}>
                        {pm.projectData.projectIdea.projectTitle.trim()}
                      </span>
                    ) : (
                      <span style={{
                        fontSize: rc.toolbar.fontSize, fontWeight: 500, color: colors.text.muted,
                        fontStyle: 'italic', letterSpacing: '0.03em', opacity: 0.6, whiteSpace: 'nowrap',
                      }}>
                        {language === 'si' ? 'NAZIV PROJEKTA' : 'PROJECT TITLE'}
                      </span>
                    )}
                  </>
                )}
              </div>

              {/* ═══ RIGHT: Action buttons — adapts to view ═══ */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                {activeView === 'dashboard' ? (
                  <>
                    <ToolbarButton colors={colors} onClick={handleCreateProjectFromDashboard}
                      title={language === 'si' ? 'Nov projekt' : 'New Project'} variant="success"
                      icon={<svg style={{ width: rc.toolbar.iconSize, height: rc.toolbar.iconSize }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>}
                    />
                    <label style={{
                      padding: spacing.sm, borderRadius: radii.lg, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', cursor: 'pointer', transition: `all ${animation.duration.fast}`,
                      color: colors.text.body,
                    }} title={language === 'si' ? 'Uvozi projekt' : 'Import Project'}>
                      <ICONS.IMPORT style={{ width: rc.toolbar.iconSize, height: rc.toolbar.iconSize }} />
                      <input type="file" accept=".json" onChange={handleImportProject} style={{ display: 'none' }} />
                    </label>
                    {!isMobile && <ToolbarSeparator colors={colors} />}
                    {!isMobile && (
                      <ToolbarButton colors={colors} onClick={() => setIsProjectListOpen(true)}
                        title={language === 'si' ? 'Moji projekti' : 'My Projects'} variant="primary"
                        icon={<svg style={{ width: rc.toolbar.iconSize, height: rc.toolbar.iconSize }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>}
                      />
                    )}
                    <ToolbarSeparator colors={colors} />
                    <ToolbarButton colors={colors} onClick={() => { setAdminPanelInitialTab('ai'); setIsSettingsOpen(true); }}
                      title={language === 'si' ? 'Nastavitve' : 'Settings'} variant="default"
                      icon={<svg style={{ width: rc.toolbar.iconSize, height: rc.toolbar.iconSize }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                    />
                  </>
                ) : (
                  <>
                    <ToolbarButton colors={colors} onClick={() => setIsDashboardOpen(true)}
                      title={language === 'si' ? 'Grafi projekta' : 'Project Graphs'} variant="primary"
                      icon={<svg style={{ width: rc.toolbar.iconSize, height: rc.toolbar.iconSize }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>}
                    />
                    <ToolbarButton colors={colors} onClick={pm.handleUndo}
                      title={language === 'si' ? 'Razveljavi (Ctrl+Z)' : 'Undo (Ctrl+Z)'}
                      disabled={!pm.canUndo} variant="default"
                      icon={<svg style={{ width: rc.toolbar.iconSize, height: rc.toolbar.iconSize }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>}
                    />
                     <ToolbarButton colors={colors} onClick={pm.handleRedo}
                      title={language === 'si' ? 'Ponovi (Ctrl+Y)' : 'Redo (Ctrl+Y)'}
                      disabled={!pm.canRedo} variant="default"
                      icon={<svg style={{ width: rc.toolbar.iconSize, height: rc.toolbar.iconSize }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" /></svg>}
                    />
                   <ToolbarSeparator colors={colors} />
                     <ToolbarButton colors={colors} onClick={async () => {
                      await pm.handleSaveToStorage();
                      try {
                        const exportData = {
                          meta: { version: '3.0', createdAt: new Date().toISOString(), activeLanguage: language, author: auth.currentUser, projectId: pm.currentProjectId },
                          data: { en: language === 'en' ? pm.projectData : (pm.projectVersions?.en || null), si: language === 'si' ? pm.projectData : (pm.projectVersions?.si || null) },
                        };
                        const jsonStr = JSON.stringify(exportData, null, 2);
                        const blob = new Blob([jsonStr], { type: 'application/json' });
                        const fileName = (pm.projectData.projectIdea?.projectAcronym?.trim() || pm.projectData.projectIdea?.projectTitle?.trim() || 'project') + '.json';
                        if (typeof (window as any).showSaveFilePicker === 'function') {
                          const handle = await (window as any).showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }] });
                          const writable = await handle.createWritable();
                          await writable.write(blob);
                          await writable.close();
                        } else {
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
                          URL.revokeObjectURL(url);
                        }
                      } catch (e: any) { if (e.name !== 'AbortError') console.error('Save-as failed:', e); }
                    }} title={language === 'si' ? 'Shrani projekt' : 'Save Project'} variant="success"
                      icon={<ICONS.SAVE style={{ width: rc.toolbar.iconSize, height: rc.toolbar.iconSize }} />}
                    />
                    <label style={{
                      padding: spacing.sm, borderRadius: radii.lg, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', cursor: 'pointer', transition: `all ${animation.duration.fast}`,
                      color: colors.text.body,
                    }} title={t.importProject}>
                      <ICONS.IMPORT style={{ width: rc.toolbar.iconSize, height: rc.toolbar.iconSize }} />
                      <input ref={pm.importInputRef} type="file" accept=".json" onChange={handleImportProject} style={{ display: 'none' }} />
                    </label>
                    {!isMobile && (
                      <>
                        <ToolbarSeparator colors={colors} />
                        <ToolbarButton colors={colors} onClick={handleExportDocx} title={language === 'si' ? 'Shrani kot DOCX' : 'Save as DOCX'}
                          icon={<ICONS.DOCX style={{ width: rc.toolbar.iconSize, height: rc.toolbar.iconSize }} />}
                        />
                        <ToolbarButton colors={colors} onClick={generation.handleExportSummary}
                          title={language === 'si' ? 'Shrani kot povzetek' : 'Save as Summary'}
                          disabled={auth.showAiWarning} variant={auth.showAiWarning ? 'warning' : 'default'}
                          icon={<ICONS.SUMMARY style={{ width: rc.toolbar.iconSize, height: rc.toolbar.iconSize }} />}
                        />
                        <ToolbarButton colors={colors} onClick={handlePrint} title={t.print}
                          icon={<ICONS.PRINT style={{ width: rc.toolbar.iconSize, height: rc.toolbar.iconSize }} />}
                        />
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* ★ v4.2: Content area below toolbar — scrollable */}
            <div id="main-content-area" style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
              {activeView === 'dashboard' ? (
                <DashboardHome
                  language={language}
                  projectsMeta={pm.userProjects}
                  currentProjectId={pm.currentProjectId}
                  projectData={pm.projectData}
                  activeOrg={orgHook.activeOrg}
                  userOrgs={orgHook.userOrgs}
                  isAdmin={adminHook.isAdmin}
                  onOpenProject={handleOpenProjectFromDashboard}
                  onCreateProject={handleCreateProjectFromDashboard}
                  onOpenAdmin={(tab) => { setAdminPanelInitialTab(tab); setIsAdminPanelOpen(true); }}
                  onOpenSettings={() => { setAdminPanelInitialTab('ai'); setIsSettingsOpen(true); }}
                  onSwitchOrg={handleSwitchOrg}
                />
              ) : pm.currentStepId === 7 ? (
                /* ★ EO-069: References full editor view */
                <ReferencesEditor
                  references={pm.projectData.references || []}
                  onAddReference={handleAddReference}
                  onEditReference={handleEditReference}
                  onDeleteReference={handleDeleteReference}
                  onOpenAddModal={handleOpenAddRefModal}
                  onCollectAllReferences={handleCollectAllReferences}
                  onGenerateAndVerify={handleGenerateAndVerifyRefs}
                  isCollecting={isCollectingRefs}
                  isGenerating={isGeneratingRefs}
                  unverifiedClaims={unverifiedClaims}
                  language={language}
                  sectionLabels={referenceSectionLabels}
                />
              ) : (
                                <ProjectDisplay
                  projectData={pm.projectData}
                  activeStepId={pm.currentStepId}
                  language={language}
                  onUpdateData={pm.handleUpdateData}
                  onGenerateSection={generation.handleGenerateSection}
                  onGenerateCompositeSection={generation.handleGenerateCompositeSection}
                  onGenerateField={generation.handleGenerateField}
                  onFieldAIGenerate={generation.handleFieldAIGenerate}
                  onAddItem={pm.handleAddItem}
                  onRemoveItem={handleRemoveItemWithConfirm}
                  isLoading={generation.isLoading}
                  error={generation.error}
                  missingApiKey={auth.showAiWarning}
                  completedStepsStatus={completedStepsStatus}
                  onStepClick={(stepId: number) => pm.setCurrentStepId(stepId)}
                  onCancelGeneration={generation.cancelGeneration}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  onAddReference={handleAddReference}
                  onEditReference={handleEditReference}
                  onDeleteReference={handleDeleteReference}
                  onOpenAddModal={handleOpenAddRefModal}
                  onCollectFromSection={handleCollectFromSection}
                  onInjectReferences={handleInjectReferencesToSection}
                  generationProgress={generation.generationProgress}
              />
              )}
            </div>
          </main>

          {/* ═══ DASHBOARD PANEL (right side) — only in project view on desktop ═══ */}
          {activeView === 'project' && isDesktop && (
            <DashboardPanel
              projectData={pm.projectData}
              language={language}
              onCollapseChange={setDashboardCollapsed}
            />
          )}
        </div>
      </div>
      {/* ★ EO-069: Add Reference Modal */}
      <AddReferenceModal
        isOpen={addRefModalOpen}
        onClose={() => setAddRefModalOpen(false)}
        onSave={handleAddReference}
        language={language}
        defaultSectionKey={addRefDefaultSection}
        sectionLabels={referenceSectionLabels}
      />

      {/* ═══ PRINT LAYOUT ═══ */}
      <div id="print-layout-container" style={{ display: 'none' }}>
        <PrintLayout projectData={pm.projectData} language={language} logo={auth.appLogo} />
      </div>
      {/* ═══ HIDDEN EXPORT CONTAINERS ═══ */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', pointerEvents: 'none' }}>
        <div id="gantt-chart-export" style={{ width: '2400px', background: 'white', padding: '20px', overflow: 'visible' }}>
          <GanttChart activities={pm.projectData.activities} language={language} forceViewMode="project" containerWidth={2400} printMode={true} id="gantt-export" />
        </div>
        <div id="pert-chart-export" style={{ width: '1200px', background: 'white', padding: '20px' }}>
          <PERTChart activities={pm.projectData.activities} language={language} forceViewMode={true} containerWidth={1200} printMode={true} />
        </div>
        <div id="organigram-export" style={{ width: '1000px', background: 'white', padding: '20px' }}>
          <Organigram projectManagement={pm.projectData.projectManagement} activities={pm.projectData.activities} language={language} forceViewMode={true} containerWidth={1000} printMode={true} />
        </div>
      </div>
    </>
  );
};

const AppWithErrorBoundary = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

export default AppWithErrorBoundary;
