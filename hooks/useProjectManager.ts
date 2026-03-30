// hooks/useProjectManager.ts
// ═══════════════════════════════════════════════════════════════
// Project CRUD, import/export, save, auto-save, navigation.
// On login: shows project list instead of auto-loading last project.
// v1.11 — 2026-03-30 — EO-163b: AutoSave null-guard — also block when loadedProjectIdRef is null
//         (project switch in progress). Updated all [EO-163] log prefixes to [EO-163b].
// v1.10 — 2026-03-30 — EO-163 BUG3: AutoSave cross-project guard — track loadedProjectIdRef
//         to detect project switch before auto-save fires. Block save when projectId mismatch.
// v1.9 — 2026-03-23 — EO-143: Smart AutoSave acronym guard — allow AI-generated acronym changes, update metadata
// v1.8 — 2026-03-10 — EO-065: Fix SI project loading — language closure stale bug
//   - loadActiveProject accepts langOverride parameter (setLanguage is batched)
//   - handleSwitchProject passes targetLang explicitly to loadActiveProject
//   - Fixes: clicking SI project loaded EN (empty) data
// v1.7 — 2026-03-10 — EO-067: Fix BLOCKED_EMPTY_OVERWRITE root cause (phase 2)
//   - handleSwitchProject: clear projectData BEFORE language change to prevent
//     auto-save useEffect from firing with stale data + new language combination
//   - Reorder: setProjectData(empty) → setLanguage → loadActiveProject
// v1.6 — 2026-03-10 — EO-067: Fix BLOCKED_EMPTY_OVERWRITE root cause
//   - isLoadingProjectRef timeout 3500ms → 5000ms + requestAnimationFrame
//   - Auto-save: extra hasContent guard to prevent empty skeleton saves
// v1.5 — 2026-03-09 — EO-058: Bilingual project list + primary language switch
//   - refreshProjectList uses getUserProjectsWithLanguages()
//   - handleSwitchProject accepts primaryLang parameter
// v1.5 — 2026-03-09 — EO-059: Fix auto-save race condition (data corruption prevention)
//   - Auto-save acronym guard: blocks save if projectData doesn't match currentProjectId
//   - isLoadingProjectRef timeout 100ms → 3500ms (covers full auto-save cycle)
//   - handleSwitchProject sets isLoadingProjectRef IMMEDIATELY before any async work
// v1.4 — 2026-03-06 — Undo/Redo + Clone (EO-037, EO-038)
//   - FIX: handleUpdateData double setProjectData bug
//   - handleCloneProject: copies both EN/SI with _V1.1 suffix
//   - canUndo, canRedo, handleUndo, handleRedo exported in return
// v1.3 — 2026-02-23 — FIX: Project duplication/loss race condition
//   - NEW: isLoadingProjectRef guard — prevents auto-save and sync effect
//     from interfering during loadActiveProject
//   - FIX: setProjectVersions now called BEFORE setProjectData in loadActiveProject
//   - FIX: sync useEffect and auto-save both skip when isLoadingProjectRef is true
//   - Resolves: project data mixing between EN/SI, project "disappearing"
//
// v1.2 — 2026-02-23 — FIX: WP/Task prefix migration on project load
//   - NEW: migrateActivityPrefixes() — auto-fixes WP/Task IDs per language
//   - EN: WP1, T1.1 | SI: DS1, N1.1
//   - Runs on every loadActiveProject, zero overhead if already correct
// v1.1 — 2026-02-21 — FIX: IMPORT SOURCE
//   - CHANGED: detectProjectLanguage imported from utils.ts instead of
//     geminiService.ts (was never re-exported from geminiService)
//   - All previous logic preserved.
// ═══════════════════════════════════════════════════════════════

import { useState, useCallback, useRef, useEffect } from 'react';
import { storageService } from '../services/storageService.ts';
import { generateDocx } from '../services/docxGenerator.ts';
import {
  set,
  createEmptyProjectData,
  downloadBlob,
  recalculateProjectSchedule,
  safeMerge,
  detectProjectLanguage,
} from '../utils.ts';
import html2canvas from 'html2canvas';

// ★ v1.2: Migrate WP/Task ID prefixes based on language
// EN: WP1, T1.1 | SI: DS1, N1.1
const migrateActivityPrefixes = (data: any, lang: 'en' | 'si'): any => {
  const activities = data?.activities;
  if (!activities || !Array.isArray(activities) || activities.length === 0) return data;

  const wpPfx = lang === 'si' ? 'DS' : 'WP';
  const tskPfx = lang === 'si' ? 'N' : 'T';
  const wrongWpPfx = lang === 'si' ? 'WP' : 'DS';
  const wrongTskPfx = lang === 'si' ? 'T' : 'N';

  // Check ALL WP and Task IDs — if ANY has wrong prefix, migrate everything
  let needsMigration = false;
  for (const wp of activities) {
    const wpId = (wp.id || '').toString();
    if (wpId.startsWith(wrongWpPfx)) { needsMigration = true; break; }
    for (const task of (wp.tasks || [])) {
      const taskId = (task.id || '').toString();
      if (taskId.startsWith(wrongTskPfx)) { needsMigration = true; break; }
    }
    if (needsMigration) break;
  }

  if (!needsMigration) return data;

  console.log(`[PrefixMigration] Migrating activity prefixes to ${lang.toUpperCase()} (${wpPfx}/${tskPfx})`);

  // Build old→new ID map for dependency fixes
  const idMap = new Map<string, string>();

  const migratedActivities = activities.map((wp: any, wpIdx: number) => {
    const newWpId = `${wpPfx}${wpIdx + 1}`;
    if (wp.id && wp.id !== newWpId) idMap.set(wp.id, newWpId);

    const tasks = (wp.tasks || []).map((task: any, tIdx: number) => {
      const newTaskId = `${tskPfx}${wpIdx + 1}.${tIdx + 1}`;
      if (task.id && task.id !== newTaskId) idMap.set(task.id, newTaskId);
      return { ...task, id: newTaskId };
    });

    const milestones = (wp.milestones || []).map((ms: any, mIdx: number) => ({
      ...ms,
      id: `M${wpIdx + 1}.${mIdx + 1}`,
    }));

    const deliverables = (wp.deliverables || []).map((del: any, dIdx: number) => ({
      ...del,
      id: `D${wpIdx + 1}.${dIdx + 1}`,
    }));

    return { ...wp, id: newWpId, tasks, milestones, deliverables };
  });

  // Fix dependency predecessorId references
  migratedActivities.forEach((wp: any) => {
    (wp.tasks || []).forEach((task: any) => {
      if (task.dependencies && Array.isArray(task.dependencies)) {
        task.dependencies = task.dependencies.map((dep: any) => ({
          ...dep,
          predecessorId: idMap.get(dep.predecessorId) || dep.predecessorId,
        }));
      }
    });
  });

console.log('[PrefixMigration] Migrated ' + idMap.size + ' IDs');

  // ★ v1.2: Migrate partner coordinator code (EN=CO, SI=KO)
  let migratedPartners = data.partners;
  if (Array.isArray(data.partners) && data.partners.length > 0) {
    const correctCoCode = lang === 'si' ? 'KO' : 'CO';
    const wrongCoCode = lang === 'si' ? 'CO' : 'KO';
    if (data.partners[0]?.code === wrongCoCode) {
      migratedPartners = data.partners.map((p: any, idx: number) => {
        if (idx === 0) return { ...p, code: correctCoCode };
        return p;
      });
      console.log('[PrefixMigration] Coordinator code: ' + wrongCoCode + ' -> ' + correctCoCode);
    }
  }

    return { ...data, activities: migratedActivities, partners: migratedPartners };
};

interface UseProjectManagerProps {

  language: 'en' | 'si';
  setLanguage: (lang: 'en' | 'si') => void;
  currentUser: string | null;
}

export const useProjectManager = ({
  language,
  setLanguage,
  currentUser,
}: UseProjectManagerProps) => {
  const [projectData, setProjectData] = useState(createEmptyProjectData());
  const [projectVersions, setProjectVersions] = useState<{ en: any; si: any }>({
    en: null,
    si: null,
  });
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [userProjects, setUserProjects] = useState<any[]>([]);
  const [hasUnsavedTranslationChanges, setHasUnsavedTranslationChanges] =
    useState(false);
  const [currentStepId, setCurrentStepId] = useState<number | null>(null);
  
  // NEW: Flag to show project list on login
  const [showProjectListOnLogin, setShowProjectListOnLogin] = useState(false);

  const importInputRef = useRef<HTMLInputElement | null>(null);
  const isLoadingProjectRef = useRef(false);
  // ★ EO-163 BUG3: Track which projectId was last fully loaded — AutoSave guard uses this
  // to detect project switches where projectData belongs to the NEW project but
  // currentProjectId still points to the OLD project (or vice versa during React batching).
  const loadedProjectIdRef = useRef<string | null>(null);
  
  // ★ v1.4: Undo/Redo history stack (50 steps max)
  const MAX_HISTORY = 50;
  const undoStackRef = useRef<any[]>([]);
  const redoStackRef = useRef<any[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const skipHistoryRef = useRef(false);
  
  // ─── Helpers ───────────────────────────────────────────────────

  const hasContent = useCallback((data: any): boolean => {
    if (!data) return false;
    // Check core fields
    if ((data.problemAnalysis?.coreProblem?.title || '') !== '') return true;
    if ((data.projectIdea?.projectTitle || '') !== '') return true;
    if ((data.projectIdea?.mainAim || '') !== '') return true;
    // Check array sections — if any has content, project should be saved
    const arraySections = ['generalObjectives', 'specificObjectives', 'activities', 'outputs', 'outcomes', 'impacts', 'risks', 'kers', 'partners'];
    for (const key of arraySections) {
      const arr = data[key];
      if (Array.isArray(arr) && arr.length > 0) {
        if (arr.some((item: any) => 
          (item.title && item.title.trim() !== '') || 
          (item.description && item.description.trim() !== '') ||
          (item.name && item.name.trim() !== '')
        )) return true;
      }
    }
    return false;
  }, []);

  // ★ v1.4: Push current state to undo stack before any change
const pushToHistory = useCallback(function(data: any) {
  if (skipHistoryRef.current) return;
  var stack = undoStackRef.current;
  // Don't push if data is identical to last snapshot
  if (stack.length > 0) {
    var lastJson = JSON.stringify(stack[stack.length - 1]);
    var currentJson = JSON.stringify(data);
    if (lastJson === currentJson) return;
  }
  stack.push(JSON.parse(JSON.stringify(data)));
  if (stack.length > MAX_HISTORY) {
    stack.shift();
  }
  undoStackRef.current = stack;
  redoStackRef.current = [];
  setCanUndo(stack.length > 0);
  setCanRedo(false);
}, []);

  // ★ v1.4: Undo — restore previous state
var handleUndo = useCallback(function() {
  var stack = undoStackRef.current;
  if (stack.length === 0) return;
  var previousState = stack.pop();
  undoStackRef.current = stack;
  // Push current state to redo
  redoStackRef.current.push(JSON.parse(JSON.stringify(projectData)));
  if (redoStackRef.current.length > MAX_HISTORY) redoStackRef.current.shift();
  // Restore without pushing to history
  skipHistoryRef.current = true;
  setProjectData(previousState);
  setHasUnsavedTranslationChanges(true);
  skipHistoryRef.current = false;
  setCanUndo(stack.length > 0);
  setCanRedo(redoStackRef.current.length > 0);
}, [projectData]);

// ★ v1.4: Redo — restore next state
var handleRedo = useCallback(function() {
  var stack = redoStackRef.current;
  if (stack.length === 0) return;
  var nextState = stack.pop();
  redoStackRef.current = stack;
  // Push current state to undo
  undoStackRef.current.push(JSON.parse(JSON.stringify(projectData)));
  if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift();
  // Restore without pushing to history
  skipHistoryRef.current = true;
  setProjectData(nextState);
  setHasUnsavedTranslationChanges(true);
  skipHistoryRef.current = false;
  setCanUndo(undoStackRef.current.length > 0);
  setCanRedo(stack.length > 0);
}, [projectData]);

  
  const generateFilename = useCallback((extension: string): string => {
    const acronym = projectData.projectIdea?.projectAcronym?.trim();
    const title = projectData.projectIdea?.projectTitle?.trim();
    let baseName = 'eu-project';
    if (acronym && title) baseName = `${acronym} - ${title}`;
    else if (title) baseName = title;
    else if (acronym) baseName = acronym;
    const sanitized = baseName.replace(/[<>:"/\\|?*]/g, '_');
    return `${sanitized}.${extension}`;
  }, [projectData.projectIdea?.projectAcronym, projectData.projectIdea?.projectTitle]);

  const getNestedValue = (obj: any, path: (string | number)[]): any => {
    return path.reduce(
      (acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined),
      obj
    );
  };

  const checkSectionHasContent = useCallback((sectionKey: string): boolean => {
    const data = (projectData as any)[sectionKey];
    if (Array.isArray(data)) {
      return data.some(
        (item: any) =>
          (item.title && item.title.trim() !== '') ||
          (item.description && item.description.trim() !== '')
      );
    }
    if (sectionKey === 'problemAnalysis') {
      return (
        !!data.coreProblem.title ||
        data.causes.some((c: any) => c.title) ||
        data.consequences.some((c: any) => c.title)
      );
    }
    if (sectionKey === 'projectIdea') {
      return !!data.mainAim || !!data.proposedSolution;
    }
    return false;
  }, [projectData]);

  // ─── Project list ──────────────────────────────────────────────

  const refreshProjectList = useCallback(async () => {
        const list = await storageService.getUserProjectsWithLanguages();
    setUserProjects(list);
    return list;
  }, []);

  // ─── Load active project ──────────────────────────────────────
  // ★ v1.2: Added migrateActivityPrefixes call after safeMerge

    const loadActiveProject = useCallback(
    async (specificId: string | null = null, langOverride?: 'en' | 'si') => {
      // ★ v1.8 EO-065: Use langOverride when provided — setLanguage() is batched,
      // so the language closure value is stale during handleSwitchProject
      var activeLang: 'en' | 'si' = langOverride || language;
      // ★ v1.3: Guard — prevent auto-save and sync effect during load
      isLoadingProjectRef.current = true;
      undoStackRef.current = [];
      redoStackRef.current = [];
      setCanUndo(false);
      setCanRedo(false);
      
      try {
        const loadedData = await storageService.loadProject(activeLang, specificId);

        if (loadedData) {
          // ★ v1.2: Migrate WP/Task prefixes to match current language
          const mergedData = migrateActivityPrefixes(safeMerge(loadedData), activeLang);
          var otherLang: 'en' | 'si' = activeLang === 'en' ? 'si' : 'en';
          const otherData = await storageService.loadProject(otherLang, specificId);
          const mergedOther = otherData ? migrateActivityPrefixes(safeMerge(otherData), otherLang) : null;

          // ★ v1.3: Set projectVersions BEFORE projectData to prevent sync effect from overwriting
          setProjectVersions({
            en: activeLang === 'en' ? mergedData : mergedOther,
            si: activeLang === 'si' ? mergedData : mergedOther,
          });
          setProjectData(mergedData);
          // ★ EO-163 BUG3: Record which project was loaded so AutoSave can detect stale saves
          loadedProjectIdRef.current = specificId || storageService.getCurrentProjectId() || null;
        } else {
          setProjectData(createEmptyProjectData());
          setProjectVersions({ en: null, si: null });
          loadedProjectIdRef.current = null;
        }

        const activeId = storageService.getCurrentProjectId();
        setCurrentProjectId(activeId);
      } finally {
        // ★ v1.6 EO-067: Release guard after React settles — increased from 3500ms to 5000ms
        // to cover slow network loads where two loadProject() calls may exceed 3.5s.
        // Also using requestAnimationFrame to ensure React render cycle has completed.
        setTimeout(() => {
          requestAnimationFrame(() => {
            isLoadingProjectRef.current = false;
          });
        }, 5000);
      }
    },
    [language]
  );

  // ─── Initialize on login ──────────────────────────────────────
  // CHANGED: Don't auto-load last project. Instead, load project list
  // and signal App.tsx to show the project selection modal.

  useEffect(() => {
    if (currentUser) {
      const init = async () => {
        await storageService.loadSettings();
        const projects = await refreshProjectList();
        
        // Always show project list on login so user can choose
        if (projects.length > 0) {
          setShowProjectListOnLogin(true);
        } else {
          // No projects — create first one and go directly
          const newProj = await storageService.createProject();
          if (newProj) {
            setCurrentProjectId(newProj.id);
            storageService.setCurrentProjectId(newProj.id);
            await loadActiveProject(newProj.id);
            await refreshProjectList();
          }
        }
      };
      init();
    }
  }, [currentUser]); // intentionally omit refreshProjectList, loadActiveProject

  // ─── Sync project versions ────────────────────────────────────
  // ★ v1.3: Skip sync during loadActiveProject to prevent overwriting other language

  useEffect(() => {
    if (isLoadingProjectRef.current) return;
    setProjectVersions((prev) => ({
      en: language === 'en' ? projectData : prev.en,
      si: language === 'si' ? projectData : prev.si,
    }));
  }, [projectData, language]);

  // ─── Auto-save (debounced 2s) ─────────────────────────────────
  // ★ v1.3: Skip auto-save during loadActiveProject to prevent saving migrated data prematurely

  // ★ v1.5 EO-059: Safe auto-save — verify projectData matches currentProjectId before saving
  useEffect(() => {
    if (!currentProjectId) return;
    
    const timer = setTimeout(async () => {
      if (isLoadingProjectRef.current) return;
      if (!currentUser) return;
      if (!hasContent(projectData)) return;

      // ★ EO-163b BUG3: Block save if projectData belongs to a different project than currentProjectId.
      // Happens during project switch: React batches state updates so projectData (new project)
      // may render before currentProjectId updates, causing the new project's data to be saved
      // under the old project's ID. loadedProjectIdRef is set synchronously after load completes.
      // Case 1: loadedProjectIdRef is null — switch is in progress, no project is fully loaded yet.
      if (loadedProjectIdRef.current === null) {
        console.warn('[EO-163b] AutoSave BLOCKED — loadedProjectIdRef is null (project switch in progress), skipping save');
        return;
      }
      // Case 2: loadedProjectIdRef mismatch — stale projectData from previous project.
      if (loadedProjectIdRef.current !== currentProjectId) {
        console.warn('[EO-163b] AutoSave BLOCKED — project ID mismatch:', loadedProjectIdRef.current, '!==', currentProjectId, '— skipping save');
        return;
      }

      // EO-143: Smart acronym guard — allow legitimate AI-generated acronym changes
      // Only block if projectId mismatch is detected, not acronym text changes
      var pdAcronym = (projectData.projectIdea && projectData.projectIdea.projectAcronym) ? projectData.projectIdea.projectAcronym.trim() : '';
      var pdTitle = (projectData.projectIdea && projectData.projectIdea.projectTitle) ? projectData.projectIdea.projectTitle.trim() : '';
      var currentMeta = userProjects.find(function(p) { return p.id === currentProjectId; });

      if (currentMeta && currentMeta.primary && currentMeta.primary.acronym) {
        var expectedAcronym = currentMeta.primary.acronym;
        if (pdAcronym && expectedAcronym && pdAcronym !== expectedAcronym) {
          // Acronym changed — this is legitimate if it happened during AI generation
          // Log as INFO (not error), update the metadata to reflect the new acronym, and allow save
          console.log('[AutoSave] EO-143: Acronym changed from "' + expectedAcronym + '" to "' + pdAcronym + '" (id=' + currentProjectId + '). Updating metadata and allowing save.');

          // Update the project metadata in userProjects so future saves don't trigger the guard again
          currentMeta.primary.acronym = pdAcronym;
          if (pdTitle) {
            currentMeta.primary.title = pdTitle;
          }
          // Note: storageService.renameProject not available — in-memory update is sufficient.
          // Supabase project name will be updated on next explicit save/rename by the user.
        }
      }

      await storageService.saveProject(projectData, language, currentProjectId);
    }, 3000);
    return () => clearTimeout(timer);
  }, [projectData, currentUser, language, currentProjectId, hasContent, userProjects]);

  // ─── Logout cleanup ───────────────────────────────────────────

  const resetOnLogout = useCallback(() => {
    setCurrentProjectId(null);
    setProjectData(createEmptyProjectData());
    setCurrentStepId(null);
    setHasUnsavedTranslationChanges(false);
    setShowProjectListOnLogin(false);
  }, []);

  // ─── CRUD handlers ────────────────────────────────────────────

    const handleSwitchProject = useCallback(
    async (projectId: string, primaryLang?: 'en' | 'si') => {
      if (projectId === currentProjectId && !primaryLang) {
        setShowProjectListOnLogin(false);
        return;
      }

      // ★ v1.5 EO-059: Set loading flag IMMEDIATELY to block auto-save during switch
      isLoadingProjectRef.current = true;
      // ★ EO-163 BUG3: Clear loadedProjectIdRef immediately so AutoSave guard detects the switch
      loadedProjectIdRef.current = null;

      // Save current project before switching (if one is loaded)
      if (currentProjectId && hasContent(projectData)) {
        await storageService.saveProject(projectData, language, currentProjectId);
      }

      // ★ v1.7 EO-067: Clear projectData BEFORE language change to prevent
      // auto-save useEffect from firing with stale data + new language
      setProjectData(createEmptyProjectData());

      storageService.setCurrentProjectId(projectId);

      // ★ v1.7 EO-067: Set language AFTER clearing data and BEFORE loadActiveProject
      // so loadActiveProject uses the correct language for loading
      if (primaryLang && primaryLang !== language) {
        setLanguage(primaryLang);
      }

      // ★ v1.8 EO-065: Pass target language explicitly — setLanguage is batched,
      // language in closure is still the OLD value at this point
      await loadActiveProject(projectId, primaryLang || language);
      setCurrentStepId(null);
      setHasUnsavedTranslationChanges(false);
      setShowProjectListOnLogin(false);
    },
    [currentProjectId, projectData, language, loadActiveProject, hasContent, setLanguage]
  );

  const handleCreateProject = useCallback(async () => {
    if (currentProjectId && hasContent(projectData)) {
      await storageService.saveProject(projectData, language, currentProjectId);
    }

    const newProj = await storageService.createProject();
    if (!newProj || !newProj.id) {
      throw new Error('Failed to create project. Check your session.');
    }

    await refreshProjectList();
    setCurrentProjectId(newProj.id);
    storageService.setCurrentProjectId(newProj.id);
    await loadActiveProject(newProj.id);
    setCurrentStepId(1);
    setShowProjectListOnLogin(false);
    return newProj;
  }, [currentProjectId, projectData, language, hasContent, refreshProjectList, loadActiveProject]);

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      await storageService.deleteProject(projectId);
      await refreshProjectList();

      if (projectId === currentProjectId) {
        setCurrentProjectId(null);
        setProjectData(createEmptyProjectData());
        setCurrentStepId(null);
      }
    },
    [currentProjectId, refreshProjectList]
  );
// ★ v1.4: Clone project with _V1.1 suffix (EO-038)
  var handleCloneProject = useCallback(async function(projectId: string) {
    var newProj = await storageService.createProject();
    if (!newProj || !newProj.id) {
      throw new Error('Failed to create cloned project.');
    }

    // Load source project data in both languages
    var enData = await storageService.loadProject('en', projectId);
    var siData = await storageService.loadProject('si', projectId);

    // Add version suffix to title and acronym
    var addVersionSuffix = function(data: any) {
      if (!data) return data;
      var cloned = JSON.parse(JSON.stringify(data));
      if (cloned.projectIdea) {
        var title = cloned.projectIdea.projectTitle || '';
        var acronym = cloned.projectIdea.projectAcronym || '';
        // Check if already has version suffix
        var versionMatch = title.match(/_V(\d+)\.(\d+)$/);
        if (versionMatch) {
          var minor = parseInt(versionMatch[2], 10) + 1;
          cloned.projectIdea.projectTitle = title.replace(/_V\d+\.\d+$/, '_V' + versionMatch[1] + '.' + minor);
        } else {
          cloned.projectIdea.projectTitle = title + '_V1.1';
        }
        var acrVersionMatch = acronym.match(/_V(\d+)\.(\d+)$/);
        if (acrVersionMatch) {
          var acrMinor = parseInt(acrVersionMatch[2], 10) + 1;
          cloned.projectIdea.projectAcronym = acronym.replace(/_V\d+\.\d+$/, '_V' + acrVersionMatch[1] + '.' + acrMinor);
        } else if (acronym) {
          cloned.projectIdea.projectAcronym = acronym + '_V1.1';
        }
      }
      return cloned;
    };

    if (enData) {
      await storageService.saveProject(addVersionSuffix(enData), 'en', newProj.id);
    }
    if (siData) {
      await storageService.saveProject(addVersionSuffix(siData), 'si', newProj.id);
    }

    // Update project title in projects table
    var sourceTitle = '';
    if (enData && enData.projectIdea && enData.projectIdea.projectTitle) {
      sourceTitle = enData.projectIdea.projectTitle;
    } else if (siData && siData.projectIdea && siData.projectIdea.projectTitle) {
      sourceTitle = siData.projectIdea.projectTitle;
    } else {
      sourceTitle = 'Untitled';
    }
    var clonedTitle = sourceTitle + '_V1.1';
    try {
      const { supabase } = await import('../services/supabaseClient.ts');
      await supabase.from('projects').update({ title: clonedTitle }).eq('id', newProj.id);
    } catch (e) { console.warn('Failed to update cloned project title:', e); }

    await refreshProjectList();
    return newProj;
  }, [refreshProjectList]);
  // ─── Data update ──────────────────────────────────────────────

  const handleUpdateData = useCallback(
    (path: (string | number)[], value: any) => {
      setProjectData((prevData: any) => {
        pushToHistory(prevData);
        let newData = set(prevData, path, value);
        if (path[0] === 'activities') {
          const scheduleResult = recalculateProjectSchedule(newData);
          newData = scheduleResult.projectData;
          if (scheduleResult.warnings.length > 0) {
            console.warn('Schedule warnings:', scheduleResult.warnings);
          }
        }
        return newData;
      });
      setHasUnsavedTranslationChanges(true);
    },
    [pushToHistory]
  );

  const handleAddItem = useCallback(
    (path: (string | number)[], newItem: any) => {
      setProjectData((prev: any) => {
        pushToHistory(prev);
        const list = getNestedValue(prev, path) || [];
        return set(prev, path, [...list, newItem]);
      });
      setHasUnsavedTranslationChanges(true);
    },
    [pushToHistory]
  );

  const handleRemoveItem = useCallback(
    (path: (string | number)[], index: number) => {
      setProjectData((prev: any) => {
        pushToHistory(prev);
        const list = getNestedValue(prev, path);
        if (!Array.isArray(list)) return prev;
        const newList = list.filter((_: any, i: number) => i !== index);
        return set(prev, path, newList);
      });
      setHasUnsavedTranslationChanges(true);
    },
    [pushToHistory]
  );

  // ─── Save + Export JSON ────────────────────────────────────────

  const handleSaveToStorage = useCallback(async () => {
    if (!currentUser) {
      alert('Not logged in!');
      return;
    }

    try {
      await storageService.saveProject(projectData, language, currentProjectId);
      const otherLang = language === 'en' ? 'si' : 'en';
      if (projectVersions[otherLang]) {
        await storageService.saveProject(
          projectVersions[otherLang],
          otherLang,
          currentProjectId
        );
      }
      await refreshProjectList();
    } catch (e: any) {
      console.error('Save error:', e);
      alert('Error saving project: ' + e.message);
    }
  }, [currentUser, projectData, language, currentProjectId, projectVersions, refreshProjectList]);

  // ─── Import JSON ───────────────────────────────────────────────

  const handleImportProject = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      return new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const text = e.target?.result;
            if (typeof text !== 'string')
              throw new Error('File content is not valid text.');
            const importedJson = JSON.parse(text);

            const newProj = await storageService.createProject();
            if (!newProj || !newProj.id) {
              throw new Error(
                'Failed to create new project. Please check your login session.'
              );
            }

            let finalData = createEmptyProjectData();
            let targetLang: 'en' | 'si' = 'en';

            if (importedJson.meta && importedJson.data) {
              const { en, si } = importedJson.data;
              const preferredLang = importedJson.meta.activeLanguage || 'en';
              const safeEn = en ? safeMerge(en) : null;
              const safeSi = si ? safeMerge(si) : null;

              // ★ EO-160c: Reset costs ONLY when a DIFFERENT user imports the project
              const _eo160cCurrentUser = await storageService.getCurrentUserId();
              const _eo160cOwner = importedJson._ownerId
                || importedJson.meta?.userId
                || importedJson.meta?.ownerId
                || (en?._ownerId) || (si?._ownerId) || null;
              const _eo160cDifferentUser = _eo160cCurrentUser && _eo160cOwner && _eo160cCurrentUser !== _eo160cOwner;
              if (_eo160cDifferentUser) {
                console.log('[EO-160c] Different user detected (current:', _eo160cCurrentUser, 'owner:', _eo160cOwner, ') — resetting cost data');
                const _resetCosts = (d: any) => { if (!d) return; d._usage = {}; d._projectUsage = { totalTokensIn: 0, totalTokensOut: 0, totalCost: 0, totalCalls: 0 }; d._generationMeta = {}; d._costRecords = []; };
                if (safeEn) _resetCosts(safeEn);
                if (safeSi) _resetCosts(safeSi);
              } else {
                console.log('[EO-160c] Same user or unknown owner — preserving cost data');
              }

              if (safeEn) await storageService.saveProject(safeEn, 'en', newProj.id);
              if (safeSi) await storageService.saveProject(safeSi, 'si', newProj.id);

              if (preferredLang === 'si' && safeSi) {
                finalData = safeSi;
                targetLang = 'si';
              } else {
                finalData = safeEn || safeSi || createEmptyProjectData();
                targetLang = safeEn ? 'en' : 'si';
              }
            } else if (importedJson.problemAnalysis) {
              const detectedLang = detectProjectLanguage(importedJson);
              finalData = safeMerge(importedJson);
              targetLang = detectedLang as 'en' | 'si';

              // ★ EO-160c: Reset costs ONLY when a DIFFERENT user imports the project
              const _eo160cCurrentUser2 = await storageService.getCurrentUserId();
              const _eo160cOwner2 = importedJson._ownerId || importedJson.metadata?.userId || importedJson.metadata?.ownerId || null;
              if (_eo160cCurrentUser2 && _eo160cOwner2 && _eo160cCurrentUser2 !== _eo160cOwner2) {
                console.log('[EO-160c] Different user detected (current:', _eo160cCurrentUser2, 'owner:', _eo160cOwner2, ') — resetting cost data');
                finalData._usage = {};
                finalData._projectUsage = { totalTokensIn: 0, totalTokensOut: 0, totalCost: 0, totalCalls: 0 };
                finalData._generationMeta = {};
                finalData._costRecords = [];
              } else {
                console.log('[EO-160c] Same user or unknown owner — preserving cost data');
              }

              await storageService.saveProject(finalData, targetLang, newProj.id);
            } else {
              throw new Error(
                'Unrecognized JSON format. Expected project data with meta+data or problemAnalysis.'
              );
            }

            await refreshProjectList();
            setCurrentProjectId(newProj.id);
            storageService.setCurrentProjectId(newProj.id);
            setProjectData(finalData);
            setLanguage(targetLang);
            setCurrentStepId(1);
            setShowProjectListOnLogin(false);
            resolve();
          } catch (err: any) {
            reject(err);
          }
        };
        reader.readAsText(file);
        event.target.value = '';
      });
    },
    [refreshProjectList, setLanguage]
  );

  // ─── Export DOCX ───────────────────────────────────────────────

  const handleExportDocx = useCallback(
    async (setIsLoading: (val: boolean | string) => void, useSaveDialog?: boolean) => {
      // ★ EO-061: Acquire file handle FIRST while user-activation is still valid
      // showSaveFilePicker requires a recent user gesture — it expires after
      // long async work (html2canvas, generateDocx), so we must call it immediately.
      let fileHandle: any = null;
      if (useSaveDialog && typeof (window as any).showSaveFilePicker === 'function') {
        try {
          fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: generateFilename('docx'),
            types: [{ description: 'Word Document', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } }],
          });
        } catch (pickErr: any) {
          if (pickErr.name === 'AbortError') return; // user cancelled
          console.warn('showSaveFilePicker failed, will fall back to download:', pickErr);
        }
      }

      setIsLoading('Rendering Graphs...');
      await new Promise((r) => setTimeout(r, 2000));

      const exportOptions = {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        allowTaint: true,
      };

      let ganttData = null;
      const ganttEl = document.getElementById('gantt-chart-export');
      if (ganttEl) {
        try {
          const ganttExportOptions = {
            ...exportOptions,
            width: ganttEl.scrollWidth,
            height: ganttEl.scrollHeight,
            windowWidth: ganttEl.scrollWidth,
            windowHeight: ganttEl.scrollHeight,
          };
          const canvas = await html2canvas(ganttEl as HTMLElement, ganttExportOptions);
          ganttData = {
            dataUrl: canvas.toDataURL('image/png'),
            width: canvas.width,
            height: canvas.height,
          };
        } catch (e) {
          console.warn('Gantt capture failed', e);
        }
      }

      let pertData = null;
      const pertEl = document.getElementById('pert-chart-export');
      if (pertEl) {
        try {
          const canvas = await html2canvas(pertEl as HTMLElement, exportOptions);
          pertData = {
            dataUrl: canvas.toDataURL('image/png'),
            width: canvas.width,
            height: canvas.height,
          };
        } catch (e) {
          console.warn('PERT capture failed', e);
        }
      }

      let organigramData = null;
      const orgEl = document.getElementById('organigram-export');
      if (orgEl) {
        try {
          const canvas = await html2canvas(orgEl as HTMLElement, exportOptions);
          organigramData = {
            dataUrl: canvas.toDataURL('image/png'),
            width: canvas.width,
            height: canvas.height,
          };
        } catch (e) {
          console.warn('Organigram capture failed', e);
        }
      }

      setIsLoading('Generating DOCX...');
      try {
        const blob = await generateDocx(projectData, language, ganttData, pertData, organigramData);
        if (fileHandle) {
          try {
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
          } catch (writeErr: any) {
            console.error('Writing to file handle failed, falling back:', writeErr);
            downloadBlob(blob, generateFilename('docx'));
          }
        } else {
          downloadBlob(blob, generateFilename('docx'));
        }
      } catch (e: any) {
        throw new Error('Failed to generate DOCX file: ' + e.message);
      } finally {
        setIsLoading(false);
      }
    },
    [projectData, language, generateFilename]
  );

  // ─── Navigation ────────────────────────────────────────────────

  const handleStartEditing = useCallback((stepId: number) => {
    setCurrentStepId(stepId);
  }, []);

  const handleBackToWelcome = useCallback(() => {
    setCurrentStepId(null);
  }, []);

  const handleSubStepClick = useCallback((subStepId: string) => {
    const el = document.getElementById(subStepId);
    const container = document.getElementById('main-content-area');
    if (el && container) {
      const elRect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const relativeTop = elRect.top - containerRect.top;
      container.scrollBy({ top: relativeTop - 24, behavior: 'smooth' });
    } else if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return {
    projectData,
    setProjectData,
    projectVersions,
    setProjectVersions,
    currentProjectId,
    setCurrentProjectId,
    userProjects,
    currentStepId,
    setCurrentStepId,
    hasUnsavedTranslationChanges,
    setHasUnsavedTranslationChanges,
    showProjectListOnLogin,
    setShowProjectListOnLogin,
    importInputRef,
    hasContent,
    checkSectionHasContent,
    generateFilename,
    refreshProjectList,
    loadActiveProject,
    resetOnLogout,
    handleSwitchProject,
    handleCreateProject,
    handleDeleteProject,
    handleCloneProject,
    handleUpdateData,
    handleAddItem,
    handleRemoveItem,
    handleSaveToStorage,
    handleImportProject,
    handleExportDocx,
    handleStartEditing,
    handleBackToWelcome,
    handleSubStepClick,
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
  };
};
