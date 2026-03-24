// components/AdminPanel.tsx
// ═══════════════════════════════════════════════════════════════
// Unified Admin / Settings Panel
// v5.2 - Web Search simplified — checkbox only, no Serper key (EO-042 fix)
// v5.1 - Web Search settings in AI tab (EO-042) (REPLACED by v5.2)
// v5.0 - Changelog Admin filtering (EO-033)
// v4.9 — 2026-03-06
// ★ v4.9: Instructions org isolation — Admin saves to organization_instructions, not global_settings
//   - handleSaveGlobalInstructions: SuperAdmin → global_settings, Admin → organization_instructions
//   - handleResetGlobalInstructions: SuperAdmin → resetAppInstructions, Admin → resetOrgInstructions
//   - useEffect load: Admin sees merged view (defaults + global + org overrides)
//   - UI notice for Admin: "You are editing instructions for YOUR organization only"
//   - Audit log for org instruction changes (org_instructions_update action)
// v4.8 — 2026-03-05
// ★ v4.8: Export TXT/JSON + Import JSON across all admin tabs (SuperAdmin only)
//   - Instructions: Export TXT + JSON + Import JSON
//   - Guide Editor: Export TXT + JSON + Import JSON  
//   - Users: Export TXT + JSON
//   - Organizations: Export TXT + JSON
//   - Statistics: Export TXT + JSON
//   - Changelog: Export TXT + JSON
// ★ v4.8: Instructions Export TXT/JSON + Import JSON (SuperAdmin only) with validation + audit log
// v4.7 — 2026-03-04
// ★ v4.7: Statistics tab — org-scoped for Admin (only own org projects/users), global for SuperAdmin
// ★ v4.6: NEW "Changelog" tab — version history with EO codes, type badges, grouped by version
// ★ v4.5: Guide Editor textarea shows default content (editable), same pattern as Instructions
// v4.4 — 2026-03-02
// v4.3 — 2026-03-02
// ★ v4.3: NEW "Statistics" tab — usage overview, projects per user, project details
// ★ v4.3: Drag & drop tab reordering — saved per user in user_settings.admin_tab_order
// ★ v4.2: NEW "Organizations" tab for SuperAdmin
//          delete empty orgs, merge duplicate orgs
// ★ v4.1: Organization column + edit, Expandable Error Log + export, Audit Log export
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react';
import { useAdmin, type AdminUser, type AdminLogEntry } from '../hooks/useAdmin.ts';
import { Card, CardHeader } from '../design/components/Card.tsx';
import { Button, SparkleIcon } from '../design/components/Button.tsx';
import { Badge, RoleBadge } from '../design/components/Badge.tsx';
import { SkeletonTable, SkeletonText } from '../design/components/Skeleton.tsx';
import { colors as lightColors, darkColors, shadows, radii, animation, typography, spacing } from '../design/theme.ts';
import { getThemeMode, onThemeChange } from '../services/themeService.ts';
import { TEXT } from '../locales.ts';
import { storageService } from '../services/storageService.ts';
import { validateProviderKey, OPENROUTER_MODELS, GEMINI_MODELS, OPENAI_MODELS, RECOMMENDED_LIGHT_MODELS, getModelsForProvider, type AIProviderType } from '../services/aiProvider.ts';
import {
  getFullInstructions, getDefaultInstructions, saveAppInstructions, resetAppInstructions,
  LANGUAGE_DIRECTIVES, LANGUAGE_MISMATCH_TEMPLATE, ACADEMIC_RIGOR_RULES, HUMANIZATION_RULES,
  PROJECT_TITLE_RULES, MODE_INSTRUCTIONS, QUALITY_GATES, SECTION_TASK_INSTRUCTIONS,
  TEMPORAL_INTEGRITY_RULE, CHAPTER_LABELS, FIELD_RULE_LABELS, CHAPTERS,
  GLOBAL_RULES, FIELD_RULES, SUMMARY_RULES, TRANSLATION_RULES,
} from '../services/Instructions.ts';
import { errorLogService, type ErrorLogEntry, type AuditLogExportEntry } from '../services/errorLogService.ts';
import { organizationService } from '../services/organizationService.ts';
import { invalidateOrgInstructionsCache } from '../services/globalInstructionsService.ts';
import { supabase } from '../services/supabaseClient.ts';
import { knowledgeBaseService, type KBDocument } from '../services/knowledgeBaseService.ts';
import { getAllGuideKeys, getFieldGuide, fetchGuideOverrides, saveGuideOverrides, invalidateGuideOverridesCache, buildGuideOverrideKey } from '../services/guideContent.ts';
import { changelogService, TYPE_CONFIG, type ChangelogEntry, type VersionGroup } from '../services/changelogService.ts';
interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'en' | 'si';
  initialTab?: string;
}

type TabId = 'users' | 'organizations' | 'statistics' | 'instructions' | 'guideEditor' | 'ai' | 'profile' | 'audit' | 'errors' | 'knowledge' | 'changelog';

const QRCodeImage = ({ value, size = 200, colors: c }: { value: string; size?: number; colors?: typeof lightColors }) => {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&margin=8`;
  const borderColor = c ? c.border.light : lightColors.border.light;
  return <img src={url} alt="QR Code" width={size} height={size} style={{ borderRadius: radii.lg, border: `1px solid ${borderColor}` }} />;
};

const CollapsibleSection = ({ title, defaultOpen = false, children, colors: c }: { title: string; defaultOpen?: boolean; children: React.ReactNode; colors: typeof lightColors }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div style={{ border: `1px solid ${c.border.light}`, borderRadius: radii.lg, overflow: 'hidden' }}>
      <button type="button" onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: c.surface.sidebar, border: 'none', cursor: 'pointer',
          textAlign: 'left', transition: `background ${animation.duration.fast}`,
          color: c.text.heading, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold,
        }}>
        <span>{title}</span>
        <svg style={{ width: 16, height: 16, color: c.text.muted, transition: `transform ${animation.duration.fast}`, transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div style={{ padding: '16px', borderTop: `1px solid ${c.border.light}`, background: c.surface.card }}>{children}</div>}
    </div>
  );
};

const ADMIN_TEXT = {
  en: {
    title: 'Admin / Settings',
    titleRegular: 'Settings',
    titleSuperAdmin: 'Super Admin / Settings',
    subtitle: 'Manage users, AI settings, instructions, and view audit log',
    subtitleRegular: 'Configure AI provider, profile and security',
    subtitleSuperAdmin: 'Full system control — users, AI, instructions, branding & audit',
    tabs: {
      users: 'Users', organizations: 'Organizations', statistics: 'Statistics', instructions: 'Instructions', guideEditor: 'Guide Editor', ai: 'AI Provider',
      profile: 'Profile & Security', audit: 'Audit Log', errors: 'Error Log', knowledge: 'Knowledge Base', changelog: 'Changelog',
    },
    users: {
      title: 'User Management', subtitle: 'View and manage all registered users',
      email: 'Email', displayName: 'Name', role: 'Role', registered: 'Registered',
      lastLogin: 'Last Login', actions: 'Actions', changeRole: 'Change Role',
      makeAdmin: 'Make Admin', makeUser: 'Make User',
      confirmRoleChange: 'Are you sure you want to change the role of',
      confirmToAdmin: 'to Admin? They will have full access to all settings and user management.',
      confirmToUser: 'to User? They will lose access to the Admin Panel and Instructions editor.',
      selfProtection: 'You cannot remove your own admin role.',
      roleUpdated: 'Role updated successfully.', roleUpdateFailed: 'Failed to update role:',
      noUsers: 'No users found.', totalUsers: 'Total users', totalAdmins: 'Admins',
      totalSuperAdmins: 'Super Admins', protected: 'Protected', never: 'Never',
      deleteUser: 'Delete User',
      deleteConfirm: 'Are you sure you want to PERMANENTLY delete user',
      deleteConfirmSuffix: '? All their projects and data will be removed. This cannot be undone.',
      deleteSuccess: 'User deleted successfully.', deleteFailed: 'Failed to delete user:',
      removeFromOrg: 'Remove from Org',
      removeFromOrgConfirm: 'Remove user from this organization? Their projects in this org will be deleted.',
      organization: 'Organization', changeOrg: 'Change Organization',
      orgChanged: 'Organization changed successfully.', orgChangeFailed: 'Failed to change organization:',
      selectOrg: 'Select organization...', noOrg: 'No organization',
    },
    organizations: {
      title: 'Organization Management',
      subtitle: 'View, delete empty, and merge duplicate organizations',
      name: 'Organization Name', members: 'Members', created: 'Created',
      actions: 'Actions', noOrgs: 'No organizations found.',
      totalOrgs: 'Total organizations',
      deleteOrg: 'Delete Organization',
      deleteConfirm: 'Are you sure you want to delete organization',
      deleteConfirmSuffix: '? This organization has no members and will be permanently removed.',
      deleteSuccess: 'Organization deleted successfully.',
      deleteFailed: 'Failed to delete organization:',
      cannotDeleteWithMembers: 'Cannot delete organization with active members. Remove members first.',
      mergeOrgs: 'Merge Organizations',
      mergeTitle: 'Merge Duplicate Organizations',
      mergeSource: 'Source (will be deleted)',
      mergeTarget: 'Target (will keep)',
      mergeConfirm: 'Merge source into target? All members, projects, and data from the source will be moved to the target. The source organization will be deleted.',
      mergeSuccess: 'Organizations merged successfully.',
      mergeFailed: 'Failed to merge organizations:',
      mergeButton: 'Merge',
      selectSource: 'Select source org...',
      selectTarget: 'Select target org...',
      empty: 'Empty',
      refreshing: 'Refreshing...',
      refresh: 'Refresh',
    },
    statistics: {
      title: 'Usage Statistics',
      subtitle: 'Overview of platform usage, projects, and user activity',
      totalProjects: 'Total Projects',
      activeUsers30: 'Active Users (30d)',
      avgProjectsPerUser: 'Avg Projects / User',
      totalErrors30: 'Errors (30d)',
      userTable: 'Users Overview',
      email: 'Email',
      organization: 'Organization',
      projects: 'Projects',
      lastActive: 'Last Active',
      aiProvider: 'AI Provider',
      registered: 'Registered',
      projectTable: 'Projects Overview',
      projectTitle: 'Project Title',
      owner: 'Owner',
      lang: 'Language',
      created: 'Created',
      lastModified: 'Last Modified',
      workPackages: 'WPs',
      partnersCol: 'Partners',
      noProjects: 'No projects found.',
      noUsers: 'No user data available.',
      loading: 'Loading statistics...',
    },
    instructions: {
      title: 'AI Instructions', subtitle: 'Edit the global AI instructions that apply to all users',
      save: 'Save Instructions', reset: 'Reset to Default',
      saved: 'Instructions saved successfully.', saveFailed: 'Failed to save instructions:',
      resetConfirm: 'Are you sure you want to reset all instructions to their default values? This cannot be undone.',
      resetDone: 'Instructions reset to default.', resetFailed: 'Failed to reset instructions:',
      lastUpdated: 'Last updated', by: 'by',
      usingDefaults: 'Currently using default instructions (no custom overrides).',
      sections: {
        global: 'Global Rules', language: 'Language Rules', academic: 'Academic Writing',
        humanization: 'Humanization', projectTitle: 'Project Title', mode: 'Mode Rules',
        qualityGates: 'Quality Gates', sectionTask: 'Section Tasks', fieldRules: 'Field Rules',
        translation: 'Translation', summary: 'Summary', chapter: 'Chapter Mapping', temporal: 'Temporal Integrity',
      },
    },
    log: {
      title: 'Audit Log', subtitle: 'Track all administrative actions',
      admin: 'Admin', action: 'Action', target: 'Target', details: 'Details', date: 'Date',
      noEntries: 'No log entries found.',
      exportTxt: 'Export TXT', exportJson: 'Export JSON',
      actions: {
        role_change: 'Role Change', instructions_update: 'Instructions Updated',
        instructions_reset: 'Instructions Reset', user_block: 'User Blocked',
        user_delete: 'User Deleted', org_user_remove: 'User Removed from Org',
        org_delete: 'Organization Deleted', org_change: 'Organization Changed',
        org_merge: 'Organizations Merged',
      },
    },
    errors: {
      title: 'Error Log', subtitle: 'System errors captured from all users',
      date: 'Date', user: 'User', component: 'Component', error: 'Error', code: 'Code',
      noErrors: 'No errors in system!', copyForDev: 'Copy for developer',
      clearAll: 'Clear all', clearConfirm: 'Clear all error logs?',
      copied: 'Logs copied to clipboard!', cleared: 'Logs cleared.',
      exportTxt: 'Export TXT', exportJson: 'Export JSON',
      stackTrace: 'Stack Trace', context: 'Context', collapse: 'Collapse',
      expand: 'Click row to expand full detail',
      filterComponent: 'Filter by component...', filterUser: 'Filter by user...',
    },
    selfDelete: {
      title: 'Delete My Account',
      warning: 'This will permanently delete your account, all your projects, and remove you from all organizations. This action cannot be undone.',
      button: 'Delete My Account', confirmTitle: 'Confirm Account Deletion',
      confirmMessage: 'Type DELETE to confirm permanent deletion of your account and all data:',
      success: 'Account deleted. You will be logged out.', failed: 'Failed to delete account:',
    },
    knowledge: {
      title: 'Knowledge Base',
      subtitle: 'Upload documents that the AI must always consider when generating content',
      upload: 'Upload Document', uploading: 'Uploading...', delete: 'Delete',
      deleteConfirm: 'Are you sure you want to delete this document? This cannot be undone.',
      deleteSuccess: 'Document deleted.', deleteFailed: 'Failed to delete document:',
      uploadSuccess: 'document(s) uploaded successfully.', uploadFailed: 'Upload failed:',
      noDocuments: 'No documents uploaded yet.', docCount: 'documents',
      maxDocs: 'Maximum', maxSize: 'Max file size', maxPages: 'Max pages per document',
      dragDrop: 'Drag & drop files here or click to browse',
      allowedTypes: 'Allowed: PDF, DOCX, XLSX, PPTX, JPG, PNG',
      fileName: 'File Name', fileType: 'Type', fileSize: 'Size',
      uploadedAt: 'Uploaded', uploadedBy: 'By', actions: 'Actions',
      info: 'Documents uploaded here serve as a knowledge base. The AI will ALWAYS use them as context when generating project content \u2014 just like the rules in Instructions.',
    },
    guideEditor: {
      title: 'Guide Content Editor',
      subtitle: 'Customize the contextual guide tooltips that appear next to each section (SuperAdmin only)',
      selectStep: 'Select step & field',
      language: 'Language',
      fieldLabel: 'Field',
      property: 'Property',
      currentValue: 'Current value (custom override)',
      defaultValue: 'Default value (read-only)',
      save: 'Save Changes',
      reset: 'Reset to Default',
      resetField: 'Reset This Field',
      resetAll: 'Reset All Guide Content',
      resetFieldConfirm: 'Reset this guide field to its default content? Your custom text will be removed.',
      resetAllConfirm: 'Reset ALL guide content to defaults? All custom overrides will be permanently removed.',
      saved: 'Guide content saved successfully.',
      saveFailed: 'Failed to save guide content:',
      resetDone: 'Guide content reset to default.',
      resetFailed: 'Failed to reset guide content:',
      noChanges: 'No changes to save.',
      overrideActive: 'Custom override active',
      usingDefault: 'Using default content',
      properties: {
        whatIsThis: 'What is this?',
        whyImportant: 'Why important?',
        whatToWrite: 'What to write',
        tips: 'Tips',
        euContext: 'EU Context',
        example: 'Example',
      },
    },
    whiteLabel: {
      logoTitle: 'Custom Logo',
      logoNotice: 'Logo customization is available only in the White-Label version. Contact us for more information.',
    },
    close: 'Close',
  },
  si: {
    title: 'Admin / Nastavitve',
    titleRegular: 'Nastavitve',
    titleSuperAdmin: 'Super Admin / Nastavitve',
    subtitle: 'Upravljanje uporabnikov, AI nastavitev, pravil in pregled dnevnika',
    subtitleRegular: 'Nastavi AI ponudnika, profil in varnost',
    subtitleSuperAdmin: 'Polni nadzor sistema \u2014 uporabniki, AI, pravila, blagovna znamka & dnevnik',
    tabs: {
      users: 'Uporabniki', organizations: 'Organizacije', statistics: 'Statistika', instructions: 'Pravila', guideEditor: 'Urejevalnik vodnika', ai: 'AI Ponudnik',
      profile: 'Profil & Varnost', audit: 'Dnevnik', errors: 'Dnevnik napak', knowledge: 'Baza znanja', changelog: 'Zgodovina verzij',
     },
    users: {
      title: 'Upravljanje uporabnikov', subtitle: 'Pregled in upravljanje vseh registriranih uporabnikov',
      email: 'E-po\u0161ta', displayName: 'Ime', role: 'Vloga', registered: 'Registriran',
      lastLogin: 'Zadnja prijava', actions: 'Akcije', changeRole: 'Spremeni vlogo',
      makeAdmin: 'Nastavi kot Admin', makeUser: 'Nastavi kot Uporabnik',
      confirmRoleChange: 'Ali ste prepri\u010Dani, da \u017Eelite spremeniti vlogo uporabnika',
      confirmToAdmin: 'v Admin? Imel bo poln dostop do vseh nastavitev in upravljanja uporabnikov.',
      confirmToUser: 'v Uporabnik? Izgubil bo dostop do Admin Panela in urejevalnika pravil.',
      selfProtection: 'Ne morete odstraniti lastne admin vloge.',
      roleUpdated: 'Vloga uspe\u0161no posodobljena.', roleUpdateFailed: 'Napaka pri posodobitvi vloge:',
      noUsers: 'Ni najdenih uporabnikov.', totalUsers: 'Skupaj uporabnikov', totalAdmins: 'Adminov',
      totalSuperAdmins: 'Super Adminov', protected: 'Za\u0161\u010Diteno', never: 'Nikoli',
      deleteUser: 'Izbri\u0161i uporabnika',
      deleteConfirm: 'Ali ste prepri\u010Dani, da \u017Eelite TRAJNO izbrisati uporabnika',
      deleteConfirmSuffix: '? Vsi njihovi projekti in podatki bodo odstranjeni. Tega ni mogo\u010De razveljaviti.',
      deleteSuccess: 'Uporabnik uspe\u0161no izbrisan.', deleteFailed: 'Napaka pri brisanju uporabnika:',
      removeFromOrg: 'Odstrani iz org.',
      removeFromOrgConfirm: 'Odstrani uporabnika iz te organizacije? Njegovi projekti v tej org bodo izbrisani.',
      organization: 'Organizacija', changeOrg: 'Spremeni organizacijo',
      orgChanged: 'Organizacija uspe\u0161no spremenjena.', orgChangeFailed: 'Napaka pri spremembi organizacije:',
      selectOrg: 'Izberi organizacijo...', noOrg: 'Brez organizacije',
    },
    organizations: {
      title: 'Upravljanje organizacij',
      subtitle: 'Pregled, brisanje praznih in zdru\u017Eevanje podvojenih organizacij',
      name: 'Ime organizacije', members: '\u010Clani', created: 'Ustvarjena',
      actions: 'Akcije', noOrgs: 'Ni najdenih organizacij.',
      totalOrgs: 'Skupaj organizacij',
      deleteOrg: 'Izbri\u0161i organizacijo',
      deleteConfirm: 'Ali ste prepri\u010Dani, da \u017Eelite izbrisati organizacijo',
      deleteConfirmSuffix: '? Ta organizacija nima \u010Dlanov in bo trajno odstranjena.',
      deleteSuccess: 'Organizacija uspe\u0161no izbrisana.',
      deleteFailed: 'Napaka pri brisanju organizacije:',
      cannotDeleteWithMembers: 'Ni mogo\u010De izbrisati organizacije z aktivnimi \u010Dlani. Najprej odstranite \u010Dlane.',
      mergeOrgs: 'Zdru\u017Ei organizacije',
      mergeTitle: 'Zdru\u017Ei podvojene organizacije',
      mergeSource: 'Vir (bo izbrisan)',
      mergeTarget: 'Cilj (ostane)',
      mergeConfirm: 'Zdru\u017Ei vir v cilj? Vsi \u010Dlani, projekti in podatki iz vira bodo prene\u0161eni v cilj. Izvorna organizacija bo izbrisana.',
      mergeSuccess: 'Organizaciji uspe\u0161no zdru\u017Eeni.',
      mergeFailed: 'Napaka pri zdru\u017Eevanju organizacij:',
      mergeButton: 'Zdru\u017Ei',
      selectSource: 'Izberi izvorno org...',
      selectTarget: 'Izberi ciljno org...',
      empty: 'Prazna',
      refreshing: 'Osve\u017Eujem...',
      refresh: 'Osve\u017Ei',
    },
      statistics: {
      title: 'Statistika uporabe',
      subtitle: 'Pregled uporabe platforme, projektov in aktivnosti uporabnikov',
      totalProjects: 'Skupaj projektov',
      activeUsers30: 'Aktivni uporabniki (30d)',
      avgProjectsPerUser: 'Povpr. projektov / uporabnik',
      totalErrors30: 'Napake (30d)',
      userTable: 'Pregled uporabnikov',
      email: 'E-po\u0161ta',
      organization: 'Organizacija',
      projects: 'Projekti',
      lastActive: 'Zadnja aktivnost',
      aiProvider: 'AI ponudnik',
      registered: 'Registriran',
      projectTable: 'Pregled projektov',
      projectTitle: 'Naslov projekta',
      owner: 'Lastnik',
      lang: 'Jezik',
      created: 'Ustvarjen',
      lastModified: 'Zadnja sprememba',
      workPackages: 'DS',
      partnersCol: 'Partnerji',
      noProjects: 'Ni najdenih projektov.',
      noUsers: 'Ni podatkov o uporabnikih.',
      loading: 'Nalagam statistiko...',
    },
    instructions: {
      title: 'AI Pravila', subtitle: 'Urejanje globalnih AI pravil, ki veljajo za vse uporabnike',
      save: 'Shrani pravila', reset: 'Ponastavi na privzeto',
      saved: 'Pravila uspe\u0161no shranjena.', saveFailed: 'Napaka pri shranjevanju pravil:',
      resetConfirm: 'Ali ste prepri\u010Dani, da \u017Eelite ponastaviti vsa pravila na privzete vrednosti? Tega ni mogo\u010De razveljaviti.',
      resetDone: 'Pravila ponastavljena na privzeto.', resetFailed: 'Napaka pri ponastavitvi pravil:',
      lastUpdated: 'Zadnja posodobitev', by: 'avtor',
      usingDefaults: 'Trenutno se uporabljajo privzeta pravila (brez prilagoditev).',
      sections: {
        global: 'Globalna pravila', language: 'Jezikovna pravila', academic: 'Akademsko pisanje',
        humanization: 'Humanizacija', projectTitle: 'Naslov projekta', mode: 'Pravila na\u010Dina',
        qualityGates: 'Kontrola kakovosti', sectionTask: 'Naloge sklopov', fieldRules: 'Pravila polj',
        translation: 'Prevod', summary: 'Povzetek', chapter: 'Mapiranje poglavij', temporal: '\u010Casovna celovitost',
      },
    },
    log: {
      title: 'Dnevnik sprememb', subtitle: 'Sledenje vsem administrativnim akcijam',
      admin: 'Admin', action: 'Akcija', target: 'Cilj', details: 'Podrobnosti', date: 'Datum',
      noEntries: 'Ni vnosov v dnevniku.',
      exportTxt: 'Izvoz TXT', exportJson: 'Izvoz JSON',
      actions: {
        role_change: 'Sprememba vloge', instructions_update: 'Pravila posodobljena',
        instructions_reset: 'Pravila ponastavljena', user_block: 'Uporabnik blokiran',
        user_delete: 'Uporabnik izbrisan', org_user_remove: 'Uporabnik odstranjen iz org',
        org_delete: 'Organizacija izbrisana', org_change: 'Sprememba organizacije',
        org_merge: 'Organizaciji zdru\u017Eeni',
      },
    },
    errors: {
      title: 'Dnevnik napak', subtitle: 'Sistemske napake vseh uporabnikov',
      date: 'Datum', user: 'Uporabnik', component: 'Komponenta', error: 'Napaka', code: 'Koda',
      noErrors: 'Ni napak v sistemu!', copyForDev: 'Kopiraj za razvijalca',
      clearAll: 'Po\u010Disti vse', clearConfirm: 'Izbri\u0161i vse error loge?',
      copied: 'Logi kopirani v odlo\u017Ei\u0161\u010De!', cleared: 'Logi izbrisani.',
      exportTxt: 'Izvoz TXT', exportJson: 'Izvoz JSON',
      stackTrace: 'Stack Trace', context: 'Kontekst', collapse: 'Zapri',
      expand: 'Klikni vrstico za celoten prikaz',
      filterComponent: 'Filtriraj po komponenti...', filterUser: 'Filtriraj po uporabniku...',
    },
    selfDelete: {
      title: 'Izbri\u0161i moj ra\u010Dun',
      warning: 'To bo trajno izbrisalo va\u0161 ra\u010Dun, vse va\u0161e projekte in vas odstranilo iz vseh organizacij. Tega dejanja ni mogo\u010De razveljaviti.',
      button: 'Izbri\u0161i moj ra\u010Dun', confirmTitle: 'Potrdite izbris ra\u010Duna',
      confirmMessage: 'Vnesite DELETE za potrditev trajnega izbrisa va\u0161ega ra\u010Duna in vseh podatkov:',
      success: 'Ra\u010Dun izbrisan. Odjavljeni boste.', failed: 'Napaka pri brisanju ra\u010Duna:',
    },
    knowledge: {
      title: 'Baza znanja',
      subtitle: 'Nalo\u017Eite dokumente, ki jih mora AI vedno upo\u0161tevati pri generiranju vsebin',
      upload: 'Nalo\u017Ei dokument', uploading: 'Nalaganje...', delete: 'Izbri\u0161i',
      deleteConfirm: 'Ali ste prepri\u010Dani, da \u017Eelite izbrisati ta dokument? Tega ni mogo\u010De razveljaviti.',
      deleteSuccess: 'Dokument izbrisan.', deleteFailed: 'Napaka pri brisanju dokumenta:',
      uploadSuccess: 'dokument(ov) uspe\u0161no nalo\u017Eenih.', uploadFailed: 'Nalaganje ni uspelo:',
      noDocuments: '\u0160e ni nalo\u017Eenih dokumentov.', docCount: 'dokumentov',
      maxDocs: 'Najve\u010D', maxSize: 'Najve\u010Dja velikost', maxPages: 'Najve\u010D strani',
      dragDrop: 'Povlecite datoteke sem ali kliknite za brskanje',
      allowedTypes: 'Dovoljeno: PDF, DOCX, XLSX, PPTX, JPG, PNG',
      fileName: 'Ime datoteke', fileType: 'Tip', fileSize: 'Velikost',
      uploadedAt: 'Nalo\u017Eeno', uploadedBy: 'Avtor', actions: 'Akcije',
      info: 'Dokumenti nalo\u017Eeni tukaj slu\u017Eijo kot baza znanja. AI jih bo VEDNO uporabil kot kontekst pri generiranju projektnih vsebin \u2014 enako kot pravila v Navodilih.',
    },
    guideEditor: {
      title: 'Urejevalnik vsebine vodnika',
      subtitle: 'Prilagodite kontekstualne nasvete, ki se prika\u017Eejo ob vsaki sekciji (samo SuperAdmin)',
      selectStep: 'Izberi korak in polje',
      language: 'Jezik',
      fieldLabel: 'Polje',
      property: 'Lastnost',
      currentValue: 'Trenutna vrednost (prilagojeno)',
      defaultValue: 'Privzeta vrednost (samo za branje)',
      save: 'Shrani spremembe',
      reset: 'Ponastavi na privzeto',
      resetField: 'Ponastavi to polje',
      resetAll: 'Ponastavi vso vsebino vodnika',
      resetFieldConfirm: 'Ponastavi to polje vodnika na privzeto vsebino? Va\u0161e prilagojeno besedilo bo odstranjeno.',
      resetAllConfirm: 'Ponastavi VSO vsebino vodnika na privzeto? Vse prilagoditve bodo trajno odstranjene.',
      saved: 'Vsebina vodnika uspe\u0161no shranjena.',
      saveFailed: 'Napaka pri shranjevanju vsebine vodnika:',
      resetDone: 'Vsebina vodnika ponastavljena na privzeto.',
      resetFailed: 'Napaka pri ponastavitvi vsebine vodnika:',
      noChanges: 'Ni sprememb za shranjevanje.',
      overrideActive: 'Prilagojena vsebina aktivna',
      usingDefault: 'Uporablja privzeto vsebino',
      properties: {
        whatIsThis: 'Kaj je to?',
        whyImportant: 'Zakaj pomembno?',
        whatToWrite: 'Kaj napisati',
        tips: 'Nasveti',
        euContext: 'EU kontekst',
        example: 'Primer',
      },
    },
    whiteLabel: {
      logoTitle: 'Logotip',
      logoNotice: 'Prilagoditev logotipa je na voljo samo v White-Label verziji. Kontaktirajte nas za ve\u010D informacij.',
    },
    close: 'Zapri',
  },
} as const;

const formatDate = (dateStr: string | null, short = false): string => {
  if (!dateStr) return '\u2014';
  try {
    const d = new Date(dateStr);
    if (short) return d.toLocaleDateString('sl-SI', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return d.toLocaleString('sl-SI', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr; }
};

const formatDateFull = (dateStr: string | null): string => {
  if (!dateStr) return '\u2014';
  try {
    var d = new Date(dateStr);
    return d.toLocaleString('sl-SI', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return dateStr; }
};
const UserAvatar: React.FC<{ name: string; email: string; size?: number }> = ({ name, email, size = 36 }) => {
  const initials = (name || email || '?').split(/[\s@]+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('');
  let hash = 0;
  for (let i = 0; i < email.length; i++) { hash = email.charCodeAt(i) + ((hash << 5) - hash); }
  const hue = Math.abs(hash) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: radii.full, background: `hsl(${hue}, 65%, 55%)`,
      color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: `${size * 0.38}px`, fontWeight: '700', flexShrink: 0, letterSpacing: '-0.5px',
    }}>{initials}</div>
  );
};

const buildDefaultInstructionsDisplay = (): Record<string, string> => {
  const fmtGates = (gates: string[]): string => gates.map((g, i) => `  ${i + 1}. ${g}`).join('\n');
  return {
    global: `\u2550\u2550\u2550 GLOBAL RULES \u2550\u2550\u2550\nThese are the master rules that govern ALL AI content generation.\n\nARCHITECTURE PRINCIPLE:\n  Instructions.ts is the SINGLE SOURCE OF TRUTH for all AI rules.\n  geminiService.ts reads from here \u2014 it has ZERO own rules.\n\n${GLOBAL_RULES}`,
    language: `\u2550\u2550\u2550 LANGUAGE DIRECTIVES \u2550\u2550\u2550\n\n\u2500\u2500 English \u2500\u2500\n${LANGUAGE_DIRECTIVES.en}\n\n\u2500\u2500 Sloven\u0161\u010Dina \u2500\u2500\n${LANGUAGE_DIRECTIVES.si}\n\n\u2500\u2500 Language Mismatch Template \u2500\u2500\n${LANGUAGE_MISMATCH_TEMPLATE}`,
    academic: `\u2550\u2550\u2550 ACADEMIC RIGOR & CITATION RULES \u2550\u2550\u2550\n\n${ACADEMIC_RIGOR_RULES.en}`,
    humanization: `\u2550\u2550\u2550 HUMANIZATION RULES \u2550\u2550\u2550\n\n${HUMANIZATION_RULES.en}`,
    projectTitle: `\u2550\u2550\u2550 PROJECT TITLE RULES \u2550\u2550\u2550\n\n${PROJECT_TITLE_RULES.en}`,
    mode: `\u2550\u2550\u2550 MODE INSTRUCTIONS \u2550\u2550\u2550\n\n${Object.entries(MODE_INSTRUCTIONS).map(([mode, langs]) => `\u2500\u2500 ${mode.toUpperCase()} \u2500\u2500\n\n${langs.en}`).join('\n\n')}`,
    qualityGates: `\u2550\u2550\u2550 QUALITY GATES \u2550\u2550\u2550\n\n${Object.entries(QUALITY_GATES).map(([section, langs]) => `\u2500\u2500 ${section} \u2500\u2500\n\n${fmtGates(langs.en || [])}`).join('\n\n')}`,
    sectionTask: `\u2550\u2550\u2550 SECTION TASK INSTRUCTIONS \u2550\u2550\u2550\n\n${Object.entries(SECTION_TASK_INSTRUCTIONS).map(([section, langs]) => `\u2500\u2500 ${section} \u2500\u2500\n\n${langs.en || '(empty)'}`).join('\n\n')}`,
    fieldRules: `\u2550\u2550\u2550 FIELD RULES \u2550\u2550\u2550\n\n${Object.entries(FIELD_RULES).map(([key, val]) => { const label = (FIELD_RULE_LABELS as Record<string, string>)[key] || key; return `\u2500\u2500 ${label} \u2500\u2500\n${val.en || '(empty)'}`; }).join('\n\n')}`,
    translation: `\u2550\u2550\u2550 TRANSLATION RULES \u2550\u2550\u2550\n\n${TRANSLATION_RULES.en.map((r: string, i: number) => `  ${i + 1}. ${r}`).join('\n')}`,
    summary: `\u2550\u2550\u2550 SUMMARY RULES \u2550\u2550\u2550\n\n${SUMMARY_RULES.en}`,
    chapter: `\u2550\u2550\u2550 CHAPTER RULES \u2550\u2550\u2550\n\n${Object.entries(CHAPTERS).map(([key, val]) => { const label = (CHAPTER_LABELS as Record<string, string>)[key] || key; return `\u2500\u2500 ${label} \u2500\u2500\n${val}`; }).join('\n\n')}`,
    temporal: `\u2550\u2550\u2550 TEMPORAL INTEGRITY RULE \u2550\u2550\u2550\n\n${TEMPORAL_INTEGRITY_RULE.en}`,
  };
};

const getDefaultPlaceholder = (section: string): string => {
  const defaults = buildDefaultInstructionsDisplay();
  return defaults[section] || `Enter custom ${section} instructions...`;
};
// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose, language, initialTab }) => {
  const admin = useAdmin();
  const t = ADMIN_TEXT[language] || ADMIN_TEXT.en;
  const tAuth = TEXT[language].auth;

  const [isDark, setIsDark] = useState(() => getThemeMode() === 'dark');
  useEffect(() => { const unsub = onThemeChange((mode) => setIsDark(mode === 'dark')); return unsub; }, []);
  const colors = isDark ? darkColors : lightColors;

  const isUserAdmin = admin.isAdmin;
  const isUserSuperAdmin = admin.isSuperAdmin;
  const adminTabs: TabId[] = isUserSuperAdmin
    ? ['users', 'organizations', 'statistics', 'instructions', 'guideEditor', 'ai', 'profile', 'audit', 'errors', 'knowledge', 'changelog']
    : ['users', 'statistics', 'instructions', 'ai', 'profile', 'audit', 'knowledge', 'changelog'];
  const regularTabs: TabId[] = ['ai', 'profile'];
  const availableTabs = isUserAdmin ? adminTabs : regularTabs;
  const defaultTab = initialTab && availableTabs.includes(initialTab as TabId) ? (initialTab as TabId) : (isUserAdmin ? 'users' : 'ai');

  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);
  useEffect(() => { if (isOpen) { admin.checkAdminStatus(); } }, [isOpen]);
  useEffect(() => { if (isOpen) { const tab = initialTab && availableTabs.includes(initialTab as TabId) ? (initialTab as TabId) : (isUserAdmin ? 'users' : 'ai'); setActiveTab(tab); } }, [isOpen, initialTab, isUserAdmin]);

  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [editedInstructions, setEditedInstructions] = useState<Record<string, string>>({});
  const [activeInstructionSection, setActiveInstructionSection] = useState<string>('global');

  const [aiProvider, setAiProvider] = useState<AIProviderType>('gemini');
  const [geminiKey, setGeminiKey] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [modelName, setModelName] = useState('');
  const [secondaryModelName, setSecondaryModelName] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mfaFactors, setMfaFactors] = useState<any[]>([]);
  const [mfaEnrolling, setMfaEnrolling] = useState(false);
  const [enrollData, setEnrollData] = useState<{ factorId: string; qrUri: string; secret: string } | null>(null);
  const [enrollCode, setEnrollCode] = useState('');
  const [enrollError, setEnrollError] = useState('');

  const [appInstructions, setAppInstructions] = useState<any>(null);
  const [instructionsSubTab, setInstructionsSubTab] = useState('global');
  const [instructionsChanged, setInstructionsChanged] = useState(false);

  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const [errorLogs, setErrorLogs] = useState<ErrorLogEntry[]>([]);
  const [errorLogsLoading, setErrorLogsLoading] = useState(false);
  const [selfDeleteInput, setSelfDeleteInput] = useState('');
  const [selfDeleteLoading, setSelfDeleteLoading] = useState(false);

  const [kbDocuments, setKbDocuments] = useState<KBDocument[]>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbUploading, setKbUploading] = useState(false);
  const [kbDragOver, setKbDragOver] = useState(false);
  // ★ v4.1: Error log expandable + filters
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
  const [errorFilterComponent, setErrorFilterComponent] = useState('');
  const [errorFilterUser, setErrorFilterUser] = useState('');
  // ★ v4.1: Organization change
  const [allOrgs, setAllOrgs] = useState<Array<{ id: string; name: string; created_at?: string }>>([]);
  const [editingOrgUserId, setEditingOrgUserId] = useState<string | null>(null);
  const [selectedNewOrgId, setSelectedNewOrgId] = useState('');
  // ★ v4.3: Drag & drop tab reordering
  const [tabOrder, setTabOrder] = useState<TabId[] | null>(null);
  const [draggedTab, setDraggedTab] = useState<TabId | null>(null);
  const [dragOverTab, setDragOverTab] = useState<TabId | null>(null);
  // ★ v4.3: Statistics tab state
  const [statsProjects, setStatsProjects] = useState<any[]>([]);
  const [statsUserProjects, setStatsUserProjects] = useState<Record<string, number>>({});
  const [statsUserSettings, setStatsUserSettings] = useState<Record<string, { ai_provider: string }>>({});
  const [statsLoading, setStatsLoading] = useState(false);
  // ★ v4.4: Guide Editor state (SuperAdmin only)
  const [guideOverrides, setGuideOverrides] = useState<Record<string, string>>({});
  const [guideEditorLoading, setGuideEditorLoading] = useState(false);
  const [guideEditorSaving, setGuideEditorSaving] = useState(false);
  const [guideSelectedStep, setGuideSelectedStep] = useState('');
  const [guideSelectedField, setGuideSelectedField] = useState('');
  const [guideSelectedLang, setGuideSelectedLang] = useState<'en' | 'si'>('en');
  const [guideSelectedProp, setGuideSelectedProp] = useState('whatIsThis');
  const [guideEditorText, setGuideEditorText] = useState('');
  const [guideEditorChanged, setGuideEditorChanged] = useState(false);
  // ★ v4.6: Changelog tab state
  const [changelogGroups, setChangelogGroups] = useState<VersionGroup[]>([]);
  const [changelogLoading, setChangelogLoading] = useState(false);
  const [changelogSearch, setChangelogSearch] = useState('');
  const [changelogTypeFilter, setChangelogTypeFilter] = useState('');
  // ★ v4.2: Organizations tab state
  const [orgMemberCounts, setOrgMemberCounts] = useState<Record<string, number>>({});
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [deletingOrgId, setDeletingOrgId] = useState<string | null>(null);
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [merging, setMerging] = useState(false);

  useEffect(() => { if (isOpen) { if (isUserAdmin) { admin.fetchUsers(); admin.fetchGlobalInstructions(); } loadSettingsData(); } }, [isOpen, isUserAdmin]);
  useEffect(() => { if (activeTab === 'audit' && isOpen && isUserAdmin) { admin.fetchAdminLog(); } }, [activeTab, isOpen, isUserAdmin]);
  useEffect(() => {
    if (activeTab === 'errors' && isOpen && isUserSuperAdmin) {
      setErrorLogsLoading(true);
      errorLogService.getErrorLogs(200).then(logs => { setErrorLogs(logs); setErrorLogsLoading(false); });
    }
  }, [activeTab, isOpen, isUserSuperAdmin]);
  // ★ v4.1: Load all organizations for org-change dropdown
  useEffect(() => {
    if ((activeTab === 'users' || activeTab === 'organizations') && isOpen && isUserAdmin) {
      loadAllOrgs();
    }
  }, [activeTab, isOpen, isUserAdmin]);

  // ★ v4.2: Load member counts when organizations tab is active
  useEffect(() => {
    if (activeTab === 'organizations' && isOpen && isUserSuperAdmin && allOrgs.length > 0) {
      loadOrgMemberCounts();
    }
  }, [activeTab, isOpen, isUserSuperAdmin, allOrgs]);
  // ★ v4.3: Load saved tab order
  useEffect(() => {
    if (isOpen) {
      var saved = storageService.getAdminTabOrder();
      if (saved && saved.length > 0) {
        // Filter: only keep tabs that are in availableTabs, preserve saved order
        var validOrder = saved.filter(function(t) { return availableTabs.indexOf(t as TabId) >= 0; }) as TabId[];
        // Add any new tabs that aren't in saved order (at the end)
        availableTabs.forEach(function(t) { if (validOrder.indexOf(t) < 0) validOrder.push(t); });
        setTabOrder(validOrder);
      } else {
        setTabOrder(null);
      }
    }
  }, [isOpen, isUserAdmin, isUserSuperAdmin]);
  // ★ v4.4: Load guide overrides when Guide Editor tab is active
  useEffect(() => {
    if (activeTab === 'guideEditor' && isOpen && isUserSuperAdmin) {
      setGuideEditorLoading(true);
      fetchGuideOverrides().then(function(overrides) {
        setGuideOverrides(overrides || {});
        setGuideEditorLoading(false);
        // Auto-select first step/field
        var allKeys = getAllGuideKeys();
        if (allKeys.length > 0 && !guideSelectedStep) {
          setGuideSelectedStep(allKeys[0].stepKey);
          setGuideSelectedField(allKeys[0].fieldKey);
        }
      }).catch(function() {
        setGuideEditorLoading(false);
      });
    }
  }, [activeTab, isOpen, isUserSuperAdmin]);

  // ★ v4.4: Update editor text when selection changes
  // Pattern: same as Instructions — show default content, user edits it, save only if changed
  useEffect(() => {
    if (!guideSelectedStep || !guideSelectedField || !guideSelectedProp) {
      setGuideEditorText('');
      setGuideEditorChanged(false);
      return;
    }
    var overrideKey = buildGuideOverrideKey(guideSelectedStep, guideSelectedField, guideSelectedLang, guideSelectedProp);
    var overrideValue = guideOverrides[overrideKey];
    if (overrideValue !== undefined && overrideValue !== null && overrideValue.trim() !== '') {
      // Custom override exists — show it
      setGuideEditorText(overrideValue);
    } else {
      // No override — show default content (editable, like Instructions tab)
      var defaultGuide = getFieldGuide(guideSelectedStep, guideSelectedField, guideSelectedLang);
      if (defaultGuide && defaultGuide[guideSelectedProp]) {
        setGuideEditorText(defaultGuide[guideSelectedProp]);
      } else {
        setGuideEditorText('');
      }
    }
    setGuideEditorChanged(false);
  }, [guideSelectedStep, guideSelectedField, guideSelectedLang, guideSelectedProp, guideOverrides]);

  // ★ v4.3: Load statistics when statistics tab is active
  useEffect(() => {
    if (activeTab === 'statistics' && isOpen && isUserAdmin) {
      loadStatistics();
    }
  }, [activeTab, isOpen, isUserAdmin]);

  // ★ v4.6: Load changelog when tab is active
  useEffect(function() {
    if (activeTab === 'changelog' && isOpen) {
      setChangelogLoading(true);
      changelogService.getGroupedByVersion().then(function(groups) {
        setChangelogGroups(groups);
        setChangelogLoading(false);
      }).catch(function() {
        setChangelogLoading(false);
      });
    }
  }, [activeTab, isOpen]);

  useEffect(() => {
    if (activeTab === 'knowledge' && isOpen && isUserAdmin) {
      const orgId = storageService.getActiveOrgId();
      if (orgId) {
        setKbLoading(true);
        knowledgeBaseService.getDocuments(orgId).then(docs => { setKbDocuments(docs); setKbLoading(false); });
      }
    }
  }, [activeTab, isOpen, isUserAdmin]);

    useEffect(function() {
    var defaults = buildDefaultInstructionsDisplay();

    if (isUserSuperAdmin) {
      // SuperAdmin: show global overrides merged with defaults
      var globalOverrides = admin.globalInstructions?.custom_instructions || {};
      var merged = {};
      Object.keys(defaults).forEach(function(key) {
        merged[key] = (globalOverrides[key] !== undefined && globalOverrides[key] !== null) ? globalOverrides[key] : defaults[key];
      });
      Object.keys(globalOverrides).forEach(function(key) {
        if (!(key in merged)) { merged[key] = globalOverrides[key]; }
      });
      setEditedInstructions(merged);
    } else {
      // Admin: show org overrides merged with (global + defaults)
      // First merge global overrides into defaults
      var globalOverrides2 = admin.globalInstructions?.custom_instructions || {};
      var baseLayer = {};
      Object.keys(defaults).forEach(function(key) {
        baseLayer[key] = (globalOverrides2[key] !== undefined && globalOverrides2[key] !== null) ? globalOverrides2[key] : defaults[key];
      });
      // Then merge org overrides on top
      var orgInstructions = organizationService.getActiveOrgInstructionsSync() || {};
      var merged2 = {};
      Object.keys(baseLayer).forEach(function(key) {
        merged2[key] = (orgInstructions[key] !== undefined && orgInstructions[key] !== null && orgInstructions[key].trim() !== '') ? orgInstructions[key] : baseLayer[key];
      });
      setEditedInstructions(merged2);
    }
  }, [admin.globalInstructions, language, isUserSuperAdmin]);


  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(null), 4000); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => { if (message) { const timer = setTimeout(() => setMessage(''), 4000); return () => clearTimeout(timer); } }, [message]);
      // ★ v4.3 → v4.7: Load statistics data — org-scoped for Admin, global for SuperAdmin
  const loadStatistics = async () => {
    setStatsLoading(true);
    try {
      var isSuperRole = storageService.isSuperAdmin();
      var activeOrgId = storageService.getActiveOrgId();

      var projects: any[] = [];

      if (isSuperRole) {
        // SuperAdmin: ALL projects across all organizations
        var projectsResultAll = await supabase
          .from('projects')
          .select('id, owner_id, title, created_at, updated_at, organization_id');
        projects = (projectsResultAll.data || []);
      } else if (activeOrgId) {
        // Admin: only projects in their own organization
        var projectsResultOrg = await supabase
          .from('projects')
          .select('id, owner_id, title, created_at, updated_at, organization_id')
          .eq('organization_id', activeOrgId);
        projects = (projectsResultOrg.data || []);
      } else {
        // No active org — show nothing
        projects = [];
      }

      // Get project IDs for filtering project_data
      var projectIds = projects.map(function(p) { return p.id; });

      // Load project_data only for relevant projects
      var projectDataMap = {};
      if (projectIds.length > 0) {
        var projectDataResult = await supabase
          .from('project_data')
          .select('project_id, language, data')
          .in('project_id', projectIds);
        (projectDataResult.data || []).forEach(function(pd) {
          if (!projectDataMap[pd.project_id]) projectDataMap[pd.project_id] = {};
          projectDataMap[pd.project_id][pd.language] = pd.data;
        });
      }

      // Enrich projects with data info
      var enriched = projects.map(function(proj) {
        var pData = projectDataMap[proj.id] || {};
        var data = pData['en'] || pData['si'] || {};
        var wpCount = Array.isArray(data.activities) ? data.activities.length : 0;
        var partnerCount = Array.isArray(data.partners) ? data.partners.length : 0;
        var languages = Object.keys(pData);
        // Find owner email from admin.users
        var ownerUser = admin.users.find(function(u) { return u.id === proj.owner_id; });
        return {
          id: proj.id,
          title: proj.title || '(Untitled)',
          ownerId: proj.owner_id,
          ownerEmail: ownerUser ? ownerUser.email : proj.owner_id.substring(0, 8) + '...',
          language: languages.join(', ') || '\u2014',
          createdAt: proj.created_at,
          updatedAt: proj.updated_at,
          wpCount: wpCount,
          partnerCount: partnerCount,
        };
      });

      setStatsProjects(enriched);

      // Count projects per user — only from filtered projects
      var userProjectCounts = {};
      projects.forEach(function(p) {
        if (!userProjectCounts[p.owner_id]) userProjectCounts[p.owner_id] = 0;
        userProjectCounts[p.owner_id]++;
      });
      setStatsUserProjects(userProjectCounts);

      // Load user settings (AI provider) — only for users visible to this admin
      var visibleUserIds = admin.users.map(function(u) { return u.id; });
      var settingsMap = {};
      if (visibleUserIds.length > 0) {
        var settingsResult = await supabase
          .from('user_settings')
          .select('user_id, ai_provider')
          .in('user_id', visibleUserIds);
        (settingsResult.data || []).forEach(function(s) {
          settingsMap[s.user_id] = { ai_provider: s.ai_provider || 'gemini' };
        });
      }
      setStatsUserSettings(settingsMap);

    } catch (err) {
      console.error('[Statistics] Failed to load:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  // ★ v4.2: Load all orgs helper
  const loadAllOrgs = async () => {
    setOrgsLoading(true);
    try {
      const orgs = await organizationService.getAllOrgs();
      setAllOrgs(orgs.map((o: any) => ({ id: o.id, name: o.name, created_at: o.created_at || null })));
    } catch (err) {
      console.error('Failed to load orgs:', err);
    } finally {
      setOrgsLoading(false);
    }
  };

  // ★ v4.2: Load member counts for all orgs
    const loadOrgMemberCounts = async () => {
    const counts: Record<string, number> = {};
    for (const org of allOrgs) {
      counts[org.id] = 0;
    }
    try {
      const { data, error } = await supabase
        .from('organization_members')
        .select('organization_id');
      if (!error && data) {
        for (const row of data) {
          if (counts[row.organization_id] !== undefined) {
            counts[row.organization_id]++;
          }
        }
      }
    } catch (err) {
      console.error('Failed to load org member counts:', err);
    }
    setOrgMemberCounts(counts);
  };


  // ★ v4.2: Delete empty organization
  const handleDeleteOrg = useCallback((orgId: string, orgName: string, memberCount: number) => {
    const tOrg = (t as any).organizations;
    if (memberCount > 0) {
      setToast({ message: tOrg.cannotDeleteWithMembers, type: 'error' });
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: tOrg.deleteOrg,
      message: `${tOrg.deleteConfirm} "${orgName}"${tOrg.deleteConfirmSuffix}`,
      onConfirm: async () => {
        setConfirmModal(null);
        setDeletingOrgId(orgId);
        try {
          const result = await organizationService.deleteOrg(orgId);
          if (result.success) {
            setToast({ message: tOrg.deleteSuccess, type: 'success' });
            // Log audit
            try { await admin.logAction('org_delete', null, { orgName, orgId }); } catch {}
            // Refresh list
            setAllOrgs(prev => prev.filter(o => o.id !== orgId));
            setOrgMemberCounts(prev => { const next = { ...prev }; delete next[orgId]; return next; });
          } else {
            setToast({ message: `${tOrg.deleteFailed} ${result.error || ''}`, type: 'error' });
          }
        } catch (err: any) {
          setToast({ message: `${tOrg.deleteFailed} ${err.message || ''}`, type: 'error' });
        } finally {
          setDeletingOrgId(null);
        }
      },
    });
  }, [t, admin]);

  // ★ v4.2: Merge organizations
  const handleMergeOrgs = useCallback(() => {
    const tOrg = (t as any).organizations;
    if (!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId) return;
    const sourceName = allOrgs.find(o => o.id === mergeSourceId)?.name || mergeSourceId;
    const targetName = allOrgs.find(o => o.id === mergeTargetId)?.name || mergeTargetId;
    setConfirmModal({
      isOpen: true,
      title: tOrg.mergeTitle,
      message: `${tOrg.mergeConfirm}\n\n${language === 'si' ? 'Vir' : 'Source'}: ${sourceName}\n${language === 'si' ? 'Cilj' : 'Target'}: ${targetName}`,
      onConfirm: async () => {
        setConfirmModal(null);
        setMerging(true);
        try {
          const result = await organizationService.mergeOrganizations(mergeSourceId, mergeTargetId);
          if (result.success) {
            setToast({ message: tOrg.mergeSuccess, type: 'success' });
            try { await admin.logAction('org_merge', null, { sourceOrgId: mergeSourceId, sourceName, targetOrgId: mergeTargetId, targetName }); } catch {}
            setMergeSourceId('');
            setMergeTargetId('');
            // Refresh
            await loadAllOrgs();
          } else {
            setToast({ message: `${tOrg.mergeFailed} ${result.error || ''}`, type: 'error' });
          }
        } catch (err: any) {
          setToast({ message: `${tOrg.mergeFailed} ${err.message || ''}`, type: 'error' });
        } finally {
          setMerging(false);
        }
      },
    });
  }, [mergeSourceId, mergeTargetId, allOrgs, t, language, admin]);

  const loadSettingsData = async () => {
    setSettingsLoading(true);
    try {
      await storageService.ensureSettingsLoaded();
      const provider = storageService.getAIProvider() || 'gemini';
      setAiProvider(provider);
      setGeminiKey(storageService.getApiKey() || '');
      setOpenRouterKey(storageService.getOpenRouterKey() || '');
      setOpenaiKey(storageService.getOpenAIKey() || '');
      const model = storageService.getCustomModel();
      setModelName(model || (provider === 'gemini' ? 'gemini-3-pro-preview' : provider === 'openai' ? 'gpt-5.2' : 'deepseek/deepseek-v3.2'));
      setSecondaryModelName(storageService.getSecondaryModel() || '');
      setCustomLogo(storageService.getCustomLogo());
      setWebSearchEnabled(storageService.getWebSearchEnabled());
      setAppInstructions(JSON.parse(JSON.stringify(getFullInstructions())));
      setInstructionsChanged(false);
      try { const { totp } = await storageService.getMFAFactors(); setMfaFactors(totp.filter((f: any) => f.status === 'verified')); } catch { setMfaFactors([]); }
      setNewPassword(''); setConfirmPassword('');
      setMfaEnrolling(false); setEnrollData(null); setEnrollCode(''); setEnrollError('');
      setMessage(''); setIsError(false); setInstructionsSubTab('global');
      setSelfDeleteInput(''); setSelfDeleteLoading(false);
    } finally { setSettingsLoading(false); }
  };

  const handleRoleChange = useCallback((user: AdminUser) => {
    if (user.role === 'superadmin') return;
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    const confirmMsg = user.role === 'admin'
      ? `${t.users.confirmRoleChange} "${user.email}" ${t.users.confirmToUser}`
      : `${t.users.confirmRoleChange} "${user.email}" ${t.users.confirmToAdmin}`;
    setConfirmModal({ isOpen: true, title: t.users.changeRole, message: confirmMsg,
      onConfirm: async () => { setConfirmModal(null); const result = await admin.updateUserRole(user.id, newRole); if (result.success) { setToast({ message: t.users.roleUpdated, type: 'success' }); } else { setToast({ message: `${t.users.roleUpdateFailed} ${result.message}`, type: 'error' }); } }
    });
  }, [admin, t]);

  const handleDeleteUser = useCallback((user: AdminUser) => {
    setConfirmModal({ isOpen: true, title: t.users.deleteUser, message: `${t.users.deleteConfirm} "${user.email}"${t.users.deleteConfirmSuffix}`,
      onConfirm: async () => { setConfirmModal(null); const result = await admin.deleteUser(user.id); if (result.success) { setToast({ message: t.users.deleteSuccess, type: 'success' }); } else { setToast({ message: `${t.users.deleteFailed} ${result.message}`, type: 'error' }); } }
    });
  }, [admin, t]);

  const handleRemoveOrgUser = useCallback((user: AdminUser) => {
    const activeOrgId = storageService.getActiveOrgId();
    if (!activeOrgId) return;
    setConfirmModal({ isOpen: true, title: t.users.removeFromOrg, message: `${t.users.removeFromOrgConfirm}\n\n${user.email}`,
      onConfirm: async () => { setConfirmModal(null); const result = await admin.deleteOrgUser(user.id, activeOrgId); if (result.success) { setToast({ message: t.users.deleteSuccess, type: 'success' }); } else { setToast({ message: `${t.users.deleteFailed} ${result.message}`, type: 'error' }); } }
    });
  }, [admin, t]);
  // ★ v4.1: Change user's organization
  const handleChangeOrg = useCallback(async (userId: string) => {
    if (!selectedNewOrgId) return;
    const orgInfo = allOrgs.find((o) => o.id === selectedNewOrgId);
    const orgName = orgInfo ? orgInfo.name : '';
    const result = await admin.changeUserOrganization(userId, selectedNewOrgId, orgName);
    if (result.success) {
      setToast({ message: (t.users as any).orgChanged || 'Organization changed.', type: 'success' });
      setEditingOrgUserId(null);
      setSelectedNewOrgId('');
    } else {
      setToast({ message: ((t.users as any).orgChangeFailed || 'Failed: ') + ' ' + result.message, type: 'error' });
    }
  }, [admin, selectedNewOrgId, allOrgs, t]);

  const handleSelfDelete = useCallback(async () => {
    if (selfDeleteInput !== 'DELETE') return;
    setSelfDeleteLoading(true);
    const result = await admin.deleteSelf();
    setSelfDeleteLoading(false);
    if (result.success) { setToast({ message: t.selfDelete.success, type: 'success' }); setTimeout(() => { window.location.reload(); }, 2000); }
    else { setToast({ message: `${t.selfDelete.failed} ${result.message}`, type: 'error' }); }
  }, [admin, selfDeleteInput, t]);

    const handleSaveGlobalInstructions = useCallback(async () => {
    if (isUserSuperAdmin) {
      // SuperAdmin: save to global_settings (applies to ALL orgs)
      var result = await admin.saveGlobalInstructions(editedInstructions);
      if (result.success) { setToast({ message: t.instructions.saved, type: 'success' }); }
      else { setToast({ message: t.instructions.saveFailed + ' ' + result.message, type: 'error' }); }
    } else {
      // Admin: save to organization_instructions (applies ONLY to their org)
      var activeOrgId = storageService.getActiveOrgId();
      if (!activeOrgId) {
        setToast({ message: language === 'si' ? 'Ni aktivne organizacije.' : 'No active organization.', type: 'error' });
        return;
      }
      // Build org overrides: only sections that differ from defaults
      var defaults = buildDefaultInstructionsDisplay();
      var orgOverrides = {};
      Object.keys(editedInstructions).forEach(function(key) {
        if (editedInstructions[key] !== defaults[key]) {
          orgOverrides[key] = editedInstructions[key];
        }
      });
      var result2 = await organizationService.saveOrgInstructions(activeOrgId, orgOverrides);
      if (result2.success) {
        invalidateOrgInstructionsCache();
        setToast({ message: t.instructions.saved, type: 'success' });
        // Audit log
        try {
          var userId = await storageService.getCurrentUserId();
          await supabase.from('admin_log').insert({
            admin_id: userId,
            action: 'org_instructions_update',
            target_user_id: null,
            details: { orgId: activeOrgId, orgName: storageService.getActiveOrgName(), sectionsChanged: Object.keys(orgOverrides).length },
          });
        } catch (logErr) { /* ignore */ }
      } else {
        setToast({ message: t.instructions.saveFailed + ' ' + (result2.message || ''), type: 'error' });
      }
    }
  }, [admin, editedInstructions, t, isUserSuperAdmin, language]);

    const handleResetGlobalInstructions = useCallback(function() {
    setConfirmModal({ isOpen: true, title: t.instructions.reset, message: t.instructions.resetConfirm,
      onConfirm: async function() {
        setConfirmModal(null);
        if (isUserSuperAdmin) {
          var result = await admin.resetInstructionsToDefault();
          if (result.success) {
            setEditedInstructions(buildDefaultInstructionsDisplay());
            setToast({ message: t.instructions.resetDone, type: 'success' });
          } else {
            setToast({ message: t.instructions.resetFailed + ' ' + result.message, type: 'error' });
          }
        } else {
          var activeOrgId = storageService.getActiveOrgId();
          if (!activeOrgId) {
            setToast({ message: language === 'si' ? 'Ni aktivne organizacije.' : 'No active organization.', type: 'error' });
            return;
          }
          var result2 = await organizationService.resetOrgInstructions(activeOrgId);
          if (result2.success) {
            invalidateOrgInstructionsCache();
            setEditedInstructions(buildDefaultInstructionsDisplay());
            setToast({ message: t.instructions.resetDone, type: 'success' });
          } else {
            setToast({ message: t.instructions.resetFailed + ' ' + (result2.message || ''), type: 'error' });
          }
        }
      }
    });
  }, [admin, t, isUserSuperAdmin, language]);

  const handleInstructionChange = useCallback((section: string, value: string) => { setEditedInstructions(prev => ({ ...prev, [section]: value })); }, []);

  const handleProviderChange = (provider: AIProviderType) => {
    setAiProvider(provider);
    if (provider === 'gemini') setModelName('gemini-3-pro-preview');
    else if (provider === 'openai') setModelName('gpt-5.2');
    else if (provider === 'openrouter') setModelName('deepseek/deepseek-v3.2');
    setSecondaryModelName('');
  };

  const handleAISave = async () => {
    setIsValidating(true); setMessage(tAuth.validating || "Validating..."); setIsError(false);
    await storageService.setAIProvider(aiProvider);
    await storageService.setCustomModel(modelName.trim());
    await storageService.setSecondaryModel(secondaryModelName.trim());
    await storageService.setApiKey(geminiKey.trim());
    await storageService.setOpenRouterKey(openRouterKey.trim());
    await storageService.setOpenAIKey(openaiKey.trim());
    await storageService.setWebSearchEnabled(webSearchEnabled);
    const activeKey = aiProvider === 'gemini' ? geminiKey.trim() : aiProvider === 'openai' ? openaiKey.trim() : openRouterKey.trim();
    if (activeKey === '') { setMessage(language === 'si' ? 'Nastavitve shranjene.' : 'Settings saved.'); setIsValidating(false); setTimeout(() => onClose(), 1000); return; }
    const isValid = await validateProviderKey(aiProvider, activeKey);
    setIsValidating(false);
    if (isValid) { setMessage(language === 'si' ? 'API klju\u010D potrjen in shranjen!' : 'API Key validated and saved!'); setTimeout(() => onClose(), 1000); }
    else { setIsError(true); setMessage(tAuth.invalidKey || "Invalid API Key"); }
  };

  const handlePasswordChange = async () => {
    setMessage(''); setIsError(false);
    if (!newPassword || !confirmPassword) { setIsError(true); setMessage(language === 'si' ? "Prosim izpolnite polja za novo geslo." : "Please fill password fields."); return; }
    if (newPassword !== confirmPassword) { setIsError(true); setMessage(tAuth.passwordMismatch || "Passwords do not match."); return; }
    const result = await storageService.changePassword('', newPassword);
    if (result.success) { setMessage(tAuth.passwordChanged || "Password changed!"); setNewPassword(''); setConfirmPassword(''); }
    else { setIsError(true); setMessage(result.message || tAuth.incorrectPassword || "Password change failed."); }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { const reader = new FileReader(); reader.onloadend = async () => { const b64 = reader.result as string; setCustomLogo(b64); await storageService.saveCustomLogo(b64); setMessage(tAuth.logoUpdated || "Logo updated!"); }; reader.readAsDataURL(file); }
  };
  const handleRemoveLogo = async () => { setCustomLogo(null); await storageService.saveCustomLogo(null); setMessage(language === 'si' ? "Logo odstranjen." : "Logo removed."); };

  const handleStartMFAEnroll = async () => {
    setEnrollError(''); setEnrollCode('');
    const result = await storageService.enrollMFA();
    if (result) { setEnrollData(result); setMfaEnrolling(true); }
    else setEnrollError(language === 'si' ? 'Napaka pri inicializaciji 2FA.' : 'Failed to initialize 2FA.');
  };

  const handleVerifyMFAEnroll = async () => {
    setEnrollError('');
    if (enrollCode.length !== 6) { setEnrollError(language === 'si' ? 'Vnesi 6-mestno kodo.' : 'Enter a 6-digit code.'); return; }
    if (!enrollData) return;
    const result = await storageService.challengeAndVerifyMFA(enrollData.factorId, enrollCode);
    if (result.success) { setMfaEnrolling(false); setEnrollData(null); const { totp } = await storageService.getMFAFactors(); setMfaFactors(totp.filter((f: any) => f.status === 'verified')); setMessage(language === 'si' ? '2FA uspe\u0161no aktiviran!' : '2FA enabled successfully!'); setIsError(false); }
    else { setEnrollError(result.message || (language === 'si' ? 'Napa\u010Dna koda.' : 'Invalid code.')); setEnrollCode(''); }
  };

  const handleDisableMFA = async (factorId: string) => {
    if (!confirm(language === 'si' ? 'Ali res \u017Eeli\u0161 deaktivirati 2FA?' : 'Disable two-factor authentication?')) return;
    const result = await storageService.unenrollMFA(factorId);
    if (result.success) { setMfaFactors(prev => prev.filter(f => f.id !== factorId)); setMessage(language === 'si' ? '2FA deaktiviran.' : '2FA disabled.'); setIsError(false); }
    else { setIsError(true); setMessage(result.message || (language === 'si' ? 'Napaka pri deaktivaciji.' : 'Failed to disable 2FA.')); }
  };

  const updateAppInstructions = (updater: (prev: any) => any) => { setAppInstructions((prev: any) => updater(prev)); setInstructionsChanged(true); };
  const handleSaveAppInstructions = async () => { await saveAppInstructions(appInstructions); setInstructionsChanged(false); setMessage(language === 'si' ? "Navodila shranjena!" : "Instructions saved!"); setIsError(false); };
  const handleResetAppInstructions = async () => { if (!confirm(language === 'si' ? "Povrni vsa navodila na privzete vrednosti? Vse spremembe bodo izgubljene." : "Revert ALL instructions to defaults? All changes will be lost.")) return; const defaults = await resetAppInstructions(); setAppInstructions(JSON.parse(JSON.stringify(defaults))); setInstructionsChanged(false); setMessage(language === 'si' ? "Navodila povrnjena na privzete." : "Instructions reverted to defaults."); setIsError(false); };
  const handleResetAppSection = (sectionKey: string) => {
    const defaults = getDefaultInstructions();
    if (sectionKey === 'GLOBAL_RULES') { updateAppInstructions(prev => ({ ...prev, GLOBAL_RULES: defaults.GLOBAL_RULES })); }
    else if (sectionKey === 'TRANSLATION_RULES') { updateAppInstructions(prev => ({ ...prev, TRANSLATION_RULES: defaults.TRANSLATION_RULES })); }
    else if (sectionKey === 'SUMMARY_RULES') { updateAppInstructions(prev => ({ ...prev, SUMMARY_RULES: defaults.SUMMARY_RULES })); }
    else if (sectionKey.startsWith('chapter')) { updateAppInstructions(prev => ({ ...prev, CHAPTERS: { ...prev.CHAPTERS, [sectionKey]: defaults.CHAPTERS[sectionKey] } })); }
    else if (defaults.FIELD_RULES[sectionKey] !== undefined) { updateAppInstructions(prev => ({ ...prev, FIELD_RULES: { ...prev.FIELD_RULES, [sectionKey]: defaults.FIELD_RULES[sectionKey] } })); }
    setMessage(language === 'si' ? 'Razdelek ponastavljen.' : 'Section reset to default.'); setIsError(false);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const handleKBUpload = useCallback(async (files: FileList | File[]) => {
    const orgId = storageService.getActiveOrgId();
    if (!orgId) { setToast({ message: language === 'si' ? 'Ni aktivne organizacije.' : 'No active organization.', type: 'error' }); return; }
    setKbUploading(true);
    let successCount = 0;
    let lastError = '';
    for (const file of Array.from(files)) {
      const result = await knowledgeBaseService.uploadDocument(orgId, file, isUserSuperAdmin);
      if (result.success) { successCount++; } else { lastError = result.message; }
    }
    const docs = await knowledgeBaseService.getDocuments(orgId);
    setKbDocuments(docs);
    setKbUploading(false);
    if (successCount > 0) { setToast({ message: `${successCount} ${t.knowledge.uploadSuccess}`, type: 'success' }); }
    if (lastError) { setToast({ message: `${t.knowledge.uploadFailed} ${lastError}`, type: 'error' }); }
  }, [t, language, isUserSuperAdmin]);

  const handleKBDelete = useCallback((doc: KBDocument) => {
    setConfirmModal({ isOpen: true, title: t.knowledge.delete, message: `${t.knowledge.deleteConfirm}\n\n${doc.file_name}`,
      onConfirm: async () => {
        setConfirmModal(null);
        const result = await knowledgeBaseService.deleteDocument(doc.id, doc.storage_path);
        if (result.success) { setKbDocuments(prev => prev.filter(d => d.id !== doc.id)); setToast({ message: t.knowledge.deleteSuccess, type: 'success' }); }
        else { setToast({ message: `${t.knowledge.deleteFailed} ${result.message}`, type: 'error' }); }
      }
    });
  }, [t]);

  const handleKBDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setKbDragOver(false);
    if (e.dataTransfer.files.length > 0) { handleKBUpload(e.dataTransfer.files); }
  }, [handleKBUpload]);
  // ★ v4.3: Drag & drop tab handlers
  const handleTabDragStart = useCallback(function(tab: TabId) {
    setDraggedTab(tab);
  }, []);

  const handleTabDragOver = useCallback(function(e: React.DragEvent, tab: TabId) {
    e.preventDefault();
    if (draggedTab && draggedTab !== tab) {
      setDragOverTab(tab);
    }
  }, [draggedTab]);

  const handleTabDrop = useCallback(function(tab: TabId) {
    if (!draggedTab || draggedTab === tab) {
      setDraggedTab(null);
      setDragOverTab(null);
      return;
    }
    var currentOrder = tabOrder || availableTabs.slice();
    var fromIndex = currentOrder.indexOf(draggedTab);
    var toIndex = currentOrder.indexOf(tab);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggedTab(null);
      setDragOverTab(null);
      return;
    }
    var newOrder = currentOrder.slice();
    newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, draggedTab);
    setTabOrder(newOrder);
    setDraggedTab(null);
    setDragOverTab(null);
    // Save to DB
    storageService.setAdminTabOrder(newOrder).catch(function(err) {
      console.error('[TabOrder] Failed to save:', err);
    });
  }, [draggedTab, tabOrder, availableTabs]);

  const handleTabDragEnd = useCallback(function() {
    setDraggedTab(null);
    setDragOverTab(null);
  }, []);
  const handleSave = () => { if (activeTab === 'ai') handleAISave(); else if (activeTab === 'profile') handlePasswordChange(); else if (activeTab === 'instructions') handleSaveGlobalInstructions(); };

  if (!isOpen) return null;

  const totalUsers = admin.users.length;
  const totalAdmins = admin.users.filter(u => u.role === 'admin').length;
  const totalSuperAdmins = admin.users.filter(u => u.role === 'superadmin').length;
  const instructionSections = Object.keys(t.instructions.sections) as (keyof typeof t.instructions.sections)[];
  const TAB_ICONS: Record<TabId, string> = { users: '\uD83D\uDC65', organizations: '\uD83C\uDFE2', statistics: '\uD83D\uDCCA', instructions: '\uD83D\uDCCB', guideEditor: '\uD83D\uDCD6', ai: '\uD83E\uDD16', profile: '\uD83D\uDC64', audit: '\uD83D\uDCDC', errors: '\uD83D\uDC1B', knowledge: '\uD83D\uDCDA', changelog: '\uD83D\uDCCB' };
  const currentModels = aiProvider === 'gemini' ? GEMINI_MODELS : aiProvider === 'openai' ? OPENAI_MODELS : OPENROUTER_MODELS;
  const hasMFA = mfaFactors.length > 0;

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', border: `1px solid ${colors.border.light}`, borderRadius: radii.lg, fontSize: typography.fontSize.sm, color: colors.text.body, background: colors.surface.card, outline: 'none', transition: `border-color ${animation.duration.fast}`, fontFamily: typography.fontFamily.mono };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, color: colors.text.heading, marginBottom: '6px' };

  const successBg = isDark ? 'rgba(16,185,129,0.12)' : lightColors.success[50];
  const successBorder = isDark ? 'rgba(16,185,129,0.25)' : lightColors.success[200];
  const successText = isDark ? '#6EE7B7' : lightColors.success[700];
  const errorBg = isDark ? 'rgba(239,68,68,0.12)' : lightColors.error[50];
  const errorBorder = isDark ? 'rgba(239,68,68,0.25)' : lightColors.error[200];
  const errorText = isDark ? '#FCA5A5' : lightColors.error[600];
  const primaryBadgeBg = isDark ? 'rgba(99,102,241,0.12)' : lightColors.primary[50];
  const primaryBadgeBorder = isDark ? 'rgba(99,102,241,0.25)' : lightColors.primary[200];
  const primaryBadgeText = isDark ? '#A5B4FC' : lightColors.primary[600];
  const warningBadgeBg = isDark ? 'rgba(245,158,11,0.12)' : lightColors.warning[50];
  const warningBadgeBorder = isDark ? 'rgba(245,158,11,0.25)' : lightColors.warning[200];
  const warningBadgeText = isDark ? '#FDE68A' : lightColors.warning[600];
  const secondaryInfoBg = isDark ? 'rgba(6,182,212,0.10)' : lightColors.secondary[50];
  const secondaryInfoBorder = isDark ? 'rgba(6,182,212,0.25)' : lightColors.secondary[200];
  const secondaryInfoText = isDark ? '#67E8F9' : lightColors.secondary[700];
  const rowHoverBg = isDark ? '#1C2940' : lightColors.primary[50];
  const rowDefaultBg = isDark ? '#162032' : 'transparent';
  const tabActiveColor = isDark ? '#A5B4FC' : lightColors.primary[600];
  const tabActiveBorder = isDark ? '#818CF8' : lightColors.primary[500];
  const superadminBadgeBg = isDark ? 'rgba(251,191,36,0.15)' : '#FEF3C7';
  const superadminBadgeBorder = isDark ? 'rgba(251,191,36,0.35)' : '#FDE68A';
  const superadminBadgeText = isDark ? '#FDE68A' : '#92400E';
  const dangerBg = isDark ? 'rgba(239,68,68,0.08)' : '#FEF2F2';
  const dangerBorder = isDark ? 'rgba(239,68,68,0.2)' : '#FECACA';
  const dangerBtnBg = isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2';
  const dangerBtnBorder = isDark ? 'rgba(239,68,68,0.3)' : '#FECACA';
  const dangerBtnText = isDark ? '#FCA5A5' : '#DC2626';
  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px', background: colors.surface.overlay, backdropFilter: 'blur(4px)', animation: 'fadeIn 0.2s ease-out',
    }}>
      <div style={{
        background: colors.surface.background, borderRadius: radii['2xl'], boxShadow: shadows['2xl'],
        width: '100%', maxWidth: '1400px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'scaleIn 0.25s ease-out',
      }}>

        {/* Header */}
        <div style={{ background: colors.primary.gradient, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ color: colors.text.inverse, fontSize: typography.fontSize['xl'], fontWeight: typography.fontWeight.bold, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              {isUserSuperAdmin ? '\uD83D\uDC51' : isUserAdmin ? '\uD83D\uDEE1\uFE0F' : '\u2699\uFE0F'}{' '}
              {isUserSuperAdmin ? t.titleSuperAdmin : isUserAdmin ? t.title : t.titleRegular}
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: typography.fontSize.sm, margin: '4px 0 0' }}>
              {isUserSuperAdmin ? t.subtitleSuperAdmin : isUserAdmin ? t.subtitle : t.subtitleRegular}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: radii.lg, padding: '8px', cursor: 'pointer', color: colors.text.inverse, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Tabs — ★ v4.3: Drag & drop reorderable */}
        <div style={{ display: 'flex', borderBottom: '1px solid ' + colors.border.light, background: colors.surface.card, flexShrink: 0, padding: '0 24px', overflowX: 'auto' }}>
          {(tabOrder || availableTabs).map(function(tab) {
            var isDragging = draggedTab === tab;
            var isDragOver = dragOverTab === tab;
            return (
              <button key={tab}
                draggable={true}
                onDragStart={function() { handleTabDragStart(tab); }}
                onDragOver={function(e) { handleTabDragOver(e, tab); }}
                onDrop={function() { handleTabDrop(tab); }}
                onDragEnd={handleTabDragEnd}
                onClick={function() { setActiveTab(tab); setMessage(''); }}
                style={{
                  padding: '12px 20px', fontSize: typography.fontSize.sm,
                  fontWeight: activeTab === tab ? typography.fontWeight.semibold : typography.fontWeight.medium,
                  color: activeTab === tab ? tabActiveColor : colors.text.muted,
                  background: isDragOver ? (isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)') : 'transparent',
                  border: 'none',
                  borderBottom: activeTab === tab ? '2px solid ' + tabActiveBorder : '2px solid transparent',
                  borderLeft: isDragOver ? '2px solid ' + colors.primary[400] : '2px solid transparent',
                  cursor: isDragging ? 'grabbing' : 'grab',
                  transition: 'all ' + animation.duration.fast,
                  whiteSpace: 'nowrap' as const,
                  opacity: isDragging ? 0.5 : 1,
                  userSelect: 'none' as const,
                }}>
                {TAB_ICONS[tab]} {t.tabs[tab]}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

          {/* TOAST */}
          {toast && (
            <div style={{
              padding: '12px 16px', marginBottom: '16px', borderRadius: radii.lg,
              background: toast.type === 'success' ? successBg : errorBg,
              border: `1px solid ${toast.type === 'success' ? successBorder : errorBorder}`,
              color: toast.type === 'success' ? successText : errorText,
              fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium,
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              {toast.type === 'success' ? '\u2705' : '\u274C'} {toast.message}
            </div>
          )}

          {/* CONFIRM MODAL */}
          {confirmModal?.isOpen && (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            }}>
              <div style={{ background: colors.surface.card, borderRadius: radii['2xl'], padding: '24px', maxWidth: '440px', width: '90%', boxShadow: shadows['2xl'] }}>
                <h3 style={{ color: colors.text.heading, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, margin: '0 0 12px' }}>{confirmModal.title}</h3>
                <p style={{ color: colors.text.body, fontSize: typography.fontSize.sm, margin: '0 0 20px', lineHeight: '1.5', whiteSpace: 'pre-line' }}>{confirmModal.message}</p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setConfirmModal(null)} style={{ padding: '8px 20px', borderRadius: radii.lg, border: `1px solid ${colors.border.light}`, background: colors.surface.card, color: colors.text.body, cursor: 'pointer', fontSize: typography.fontSize.sm }}>
                    {language === 'si' ? 'Prekli\u010Di' : 'Cancel'}
                  </button>
                  <button onClick={confirmModal.onConfirm} style={{ padding: '8px 20px', borderRadius: radii.lg, border: 'none', background: colors.primary[600], color: '#fff', cursor: 'pointer', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold }}>
                    {language === 'si' ? 'Potrdi' : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═══ USERS TAB ═══ */}
            {activeTab === 'users' && isUserAdmin && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3 style={{ color: colors.text.heading, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, margin: '0 0 4px' }}>{t.users.title}</h3>
                    <p style={{ color: colors.text.muted, fontSize: typography.fontSize.sm, margin: 0 }}>{t.users.subtitle}</p>
                  </div>
                  {isUserSuperAdmin && admin.users.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={function() {
                        var lines = [];
                        lines.push('=' .repeat(60));
                        lines.push('EURO-OFFICE USERS');
                        lines.push('Exported: ' + new Date().toISOString());
                        lines.push('Total: ' + admin.users.length);
                        lines.push('=' .repeat(60));
                        lines.push('');
                        admin.users.forEach(function(u, i) {
                          lines.push('-'.repeat(40));
                          lines.push('User #' + (i + 1));
                          lines.push('-'.repeat(40));
                          lines.push('Email:        ' + u.email);
                          lines.push('Name:         ' + (u.displayName || '-'));
                          lines.push('Role:         ' + u.role);
                          lines.push('Organization: ' + (u.orgName || '-'));
                          lines.push('Registered:   ' + formatDate(u.createdAt));
                          lines.push('Last Login:   ' + (u.lastSignIn ? formatDate(u.lastSignIn) : 'Never'));
                          lines.push('');
                        });
                        var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
                        var url = URL.createObjectURL(blob);
                        var a = document.createElement('a');
                        a.href = url;
                        a.download = 'euro-office-users-' + new Date().toISOString().split('T')[0] + '.txt';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                        style={{ fontSize: '11px', padding: '5px 10px', borderRadius: radii.md, border: '1px solid ' + colors.border.medium, background: colors.surface.card, color: colors.text.body, cursor: 'pointer' }}
                      >{'\u2193 '} {language === 'si' ? 'Izvoz TXT' : 'Export TXT'}</button>
                      <button onClick={function() {
                        var exportData = {
                          _meta: { format: 'euro-office-users', version: '1.0', exportedAt: new Date().toISOString(), exportedBy: storageService.getCurrentUser() || 'unknown', total: admin.users.length },
                          users: admin.users.map(function(u) {
                            return { email: u.email, displayName: u.displayName || '', role: u.role, organization: u.orgName || '', registeredAt: u.createdAt || '', lastSignIn: u.lastSignIn || '' };
                          })
                        };
                        var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8' });
                        var url = URL.createObjectURL(blob);
                        var a = document.createElement('a');
                        a.href = url;
                        a.download = 'euro-office-users-' + new Date().toISOString().split('T')[0] + '.json';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                        style={{ fontSize: '11px', padding: '5px 10px', borderRadius: radii.md, border: '1px solid ' + colors.border.medium, background: colors.surface.card, color: colors.text.body, cursor: 'pointer' }}
                      >{'\u2193 '} {language === 'si' ? 'Izvoz JSON' : 'Export JSON'}</button>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>

                  <span style={{ padding: '4px 12px', borderRadius: radii.full, background: primaryBadgeBg, border: `1px solid ${primaryBadgeBorder}`, color: primaryBadgeText, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold }}>{t.users.totalUsers}: {totalUsers}</span>
                  <span style={{ padding: '4px 12px', borderRadius: radii.full, background: warningBadgeBg, border: `1px solid ${warningBadgeBorder}`, color: warningBadgeText, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold }}>{t.users.totalAdmins}: {totalAdmins}</span>
                  <span style={{ padding: '4px 12px', borderRadius: radii.full, background: superadminBadgeBg, border: `1px solid ${superadminBadgeBorder}`, color: superadminBadgeText, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold }}>{'\uD83D\uDC51'} {t.users.totalSuperAdmins}: {totalSuperAdmins}</span>
                </div>
              </div>
              {admin.isLoadingUsers ? <SkeletonTable rows={4} cols={6} /> : admin.users.length === 0 ? (
                <p style={{ color: colors.text.muted, textAlign: 'center', padding: '40px' }}>{t.users.noUsers}</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typography.fontSize.sm }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${colors.border.light}` }}>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.users.email}</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.users.displayName}</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{(t.users as any).organization || 'Organization'}</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.users.role}</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.users.registered}</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.users.lastLogin}</th>
                        <th style={{ textAlign: 'right', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.users.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {admin.users.map((user) => (
                        <tr key={user.id} style={{ borderBottom: `1px solid ${colors.border.light}`, background: rowDefaultBg }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = rowHoverBg; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = rowDefaultBg; }}>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <UserAvatar name={user.displayName} email={user.email} size={32} />
                              <span style={{ color: colors.text.body }}>{user.email}</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', color: colors.text.body }}>{user.displayName}</td>
                          {/* ★ v4.1: Organization column */}
                          <td style={{ padding: '10px 12px', fontSize: typography.fontSize.sm }}>
                            {editingOrgUserId === user.id ? (
                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <select value={selectedNewOrgId} onChange={(e) => setSelectedNewOrgId(e.target.value)}
                                  style={{ fontSize: '11px', padding: '3px 6px', borderRadius: radii.md, border: '1px solid ' + colors.border.medium, background: colors.surface.card, color: colors.text.body, maxWidth: '150px' }}>
                                  <option value="">{(t.users as any).selectOrg || 'Select...'}</option>
                                  {allOrgs.map((org) => (<option key={org.id} value={org.id}>{org.name}</option>))}
                                </select>
                                <button onClick={() => handleChangeOrg(user.id)} disabled={!selectedNewOrgId}
                                  style={{ fontSize: '11px', padding: '2px 7px', borderRadius: radii.sm, border: 'none', cursor: selectedNewOrgId ? 'pointer' : 'default', background: selectedNewOrgId ? '#0ea5e9' : colors.border.light, color: '#fff' }}>{'\u2713'}</button>
                                <button onClick={() => { setEditingOrgUserId(null); setSelectedNewOrgId(''); }}
                                  style={{ fontSize: '11px', padding: '2px 7px', borderRadius: radii.sm, border: 'none', cursor: 'pointer', background: colors.border.light, color: colors.text.muted }}>{'\u2715'}</button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ color: user.orgName ? colors.text.body : colors.text.muted, fontSize: typography.fontSize.xs }}>{user.orgName || ((t.users as any).noOrg || '\u2014')}</span>
                                {isUserAdmin && (
                                  <button onClick={() => { setEditingOrgUserId(user.id); setSelectedNewOrgId(''); }}
                                    title={(t.users as any).changeOrg || 'Change'} style={{ fontSize: '10px', padding: '1px 5px', borderRadius: radii.sm, border: '1px solid ' + colors.border.light, background: 'transparent', color: colors.text.muted, cursor: 'pointer' }}>{'\u270E'}</button>
                                )}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            {user.role === 'superadmin' ? (
                              <span style={{ padding: '2px 10px', borderRadius: radii.full, background: superadminBadgeBg, border: `1px solid ${superadminBadgeBorder}`, color: superadminBadgeText, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold }}>{'\uD83D\uDC51'} Super Admin</span>
                            ) : user.role === 'admin' ? (
                              <span style={{ padding: '2px 10px', borderRadius: radii.full, background: warningBadgeBg, border: `1px solid ${warningBadgeBorder}`, color: warningBadgeText, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold }}>{'\uD83D\uDEE1\uFE0F'} Admin</span>
                            ) : (
                              <span style={{ padding: '2px 10px', borderRadius: radii.full, background: primaryBadgeBg, border: `1px solid ${primaryBadgeBorder}`, color: primaryBadgeText, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold }}>User</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', color: colors.text.muted }}>{formatDate(user.createdAt, true)}</td>
                          <td style={{ padding: '10px 12px', color: colors.text.muted }}>{user.lastSignIn ? formatDate(user.lastSignIn) : t.users.never}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                              {user.role === 'superadmin' ? (
                                <span style={{ padding: '4px 10px', borderRadius: radii.lg, background: superadminBadgeBg, border: `1px solid ${superadminBadgeBorder}`, color: superadminBadgeText, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium }}>{'\uD83D\uDD12'} {t.users.protected}</span>
                              ) : (
                                <button onClick={() => handleRoleChange(user)} style={{ background: user.role === 'admin' ? warningBadgeBg : primaryBadgeBg, border: `1px solid ${user.role === 'admin' ? warningBadgeBorder : primaryBadgeBorder}`, borderRadius: radii.lg, padding: '4px 10px', cursor: 'pointer', color: user.role === 'admin' ? warningBadgeText : primaryBadgeText, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium }}>
                                  {user.role === 'admin' ? t.users.makeUser : t.users.makeAdmin}
                                </button>
                              )}
                              {isUserSuperAdmin && user.role !== 'superadmin' && (
                                <button onClick={() => handleDeleteUser(user)} title={t.users.deleteUser} style={{ background: dangerBtnBg, border: `1px solid ${dangerBtnBorder}`, borderRadius: radii.lg, padding: '4px 10px', cursor: 'pointer', color: dangerBtnText, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(239,68,68,0.25)' : '#FEE2E2'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = dangerBtnBg; }}>
                                  {'\uD83D\uDDD1\uFE0F'} {language === 'si' ? 'Izbri\u0161i' : 'Delete'}
                                </button>
                              )}
                              {!isUserSuperAdmin && isUserAdmin && user.role !== 'superadmin' && user.role !== 'admin' && (
                                <button onClick={() => handleRemoveOrgUser(user)} title={t.users.removeFromOrg} style={{ background: dangerBtnBg, border: `1px solid ${dangerBtnBorder}`, borderRadius: radii.lg, padding: '4px 10px', cursor: 'pointer', color: dangerBtnText, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(239,68,68,0.25)' : '#FEE2E2'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = dangerBtnBg; }}>
                                  {'\uD83D\uDDD1\uFE0F'} {t.users.removeFromOrg}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ═══ ORGANIZATIONS TAB ═══ ★ v4.2 */}
          {activeTab === 'organizations' && isUserSuperAdmin && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3 style={{ color: colors.text.heading, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, margin: '0 0 4px' }}>
                      {'\uD83C\uDFE2'} {(t as any).organizations.title}
                    </h3>
                    <p style={{ color: colors.text.muted, fontSize: typography.fontSize.sm, margin: 0 }}>{(t as any).organizations.subtitle}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ padding: '4px 12px', borderRadius: radii.full, background: primaryBadgeBg, border: `1px solid ${primaryBadgeBorder}`, color: primaryBadgeText, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold }}>
                      {(t as any).organizations.totalOrgs}: {allOrgs.length}
                    </span>
                      {allOrgs.length > 0 && (
                      <button onClick={function() {
                        var lines = [];
                        lines.push('=' .repeat(60));
                        lines.push('EURO-OFFICE ORGANIZATIONS');
                        lines.push('Exported: ' + new Date().toISOString());
                        lines.push('Total: ' + allOrgs.length);
                        lines.push('=' .repeat(60));
                        lines.push('');
                        allOrgs.forEach(function(org, i) {
                          var mc = orgMemberCounts[org.id];
                          lines.push('-'.repeat(40));
                          lines.push('Org #' + (i + 1));
                          lines.push('-'.repeat(40));
                          lines.push('Name:    ' + org.name);
                          lines.push('ID:      ' + org.id);
                          lines.push('Members: ' + (mc !== undefined ? mc : '?'));
                          lines.push('Created: ' + formatDate(org.created_at || null, true));
                          lines.push('');
                        });
                        var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
                        var url = URL.createObjectURL(blob);
                        var a = document.createElement('a');
                        a.href = url;
                        a.download = 'euro-office-organizations-' + new Date().toISOString().split('T')[0] + '.txt';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                        style={{ fontSize: '11px', padding: '5px 10px', borderRadius: radii.md, border: '1px solid ' + colors.border.medium, background: colors.surface.card, color: colors.text.body, cursor: 'pointer' }}
                      >{'\u2193 '} TXT</button>
                    )}
                    {allOrgs.length > 0 && (
                      <button onClick={function() {
                        var exportData = {
                          _meta: { format: 'euro-office-organizations', version: '1.0', exportedAt: new Date().toISOString(), exportedBy: storageService.getCurrentUser() || 'unknown', total: allOrgs.length },
                          organizations: allOrgs.map(function(org) {
                            return { id: org.id, name: org.name, members: orgMemberCounts[org.id] !== undefined ? orgMemberCounts[org.id] : null, createdAt: org.created_at || '' };
                          })
                        };
                        var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8' });
                        var url = URL.createObjectURL(blob);
                        var a = document.createElement('a');
                        a.href = url;
                        a.download = 'euro-office-organizations-' + new Date().toISOString().split('T')[0] + '.json';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                        style={{ fontSize: '11px', padding: '5px 10px', borderRadius: radii.md, border: '1px solid ' + colors.border.medium, background: colors.surface.card, color: colors.text.body, cursor: 'pointer' }}
                      >{'\u2193 '} JSON</button>
                    )}
                    <button onClick={async () => { await loadAllOrgs(); }} disabled={orgsLoading}
                      style={{ fontSize: '11px', padding: '5px 12px', borderRadius: radii.md, border: '1px solid ' + colors.border.medium, background: colors.surface.card, color: colors.text.body, cursor: orgsLoading ? 'wait' : 'pointer' }}>
                      {orgsLoading ? (t as any).organizations.refreshing : '\u21BB ' + ((t as any).organizations.refresh)}
                    </button>
                  </div>
                </div>
              </div>

              {/* Merge section */}
              <div style={{ padding: '16px', borderRadius: radii.lg, background: secondaryInfoBg, border: `1px solid ${secondaryInfoBorder}`, marginBottom: '20px' }}>
                <h4 style={{ color: secondaryInfoText, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, margin: '0 0 12px' }}>
                  {'\uD83D\uDD00'} {(t as any).organizations.mergeTitle}
                </h4>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '180px' }}>
                    <label style={{ fontSize: typography.fontSize.xs, color: secondaryInfoText, display: 'block', marginBottom: '4px' }}>{(t as any).organizations.mergeSource}</label>
                    <select value={mergeSourceId} onChange={(e) => setMergeSourceId(e.target.value)}
                      style={{ width: '100%', fontSize: '12px', padding: '6px 10px', borderRadius: radii.md, border: '1px solid ' + secondaryInfoBorder, background: colors.surface.card, color: colors.text.body }}>
                      <option value="">{(t as any).organizations.selectSource}</option>
                      {allOrgs.filter(o => o.id !== mergeTargetId).map((org) => (
                        <option key={org.id} value={org.id}>{org.name} ({orgMemberCounts[org.id] !== undefined ? orgMemberCounts[org.id] : '?'} {(t as any).organizations.members})</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ fontSize: '20px', color: secondaryInfoText, paddingTop: '18px' }}>{'\u2192'}</div>
                  <div style={{ flex: 1, minWidth: '180px' }}>
                    <label style={{ fontSize: typography.fontSize.xs, color: secondaryInfoText, display: 'block', marginBottom: '4px' }}>{(t as any).organizations.mergeTarget}</label>
                    <select value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value)}
                      style={{ width: '100%', fontSize: '12px', padding: '6px 10px', borderRadius: radii.md, border: '1px solid ' + secondaryInfoBorder, background: colors.surface.card, color: colors.text.body }}>
                      <option value="">{(t as any).organizations.selectTarget}</option>
                      {allOrgs.filter(o => o.id !== mergeSourceId).map((org) => (
                        <option key={org.id} value={org.id}>{org.name} ({orgMemberCounts[org.id] !== undefined ? orgMemberCounts[org.id] : '?'} {(t as any).organizations.members})</option>
                      ))}
                    </select>
                  </div>
                  <button onClick={handleMergeOrgs} disabled={!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId || merging}
                    style={{ padding: '8px 20px', borderRadius: radii.lg, border: 'none', background: (mergeSourceId && mergeTargetId && mergeSourceId !== mergeTargetId && !merging) ? colors.primary[600] : colors.border.light, color: '#fff', cursor: (mergeSourceId && mergeTargetId && mergeSourceId !== mergeTargetId && !merging) ? 'pointer' : 'not-allowed', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, marginTop: '18px' }}>
                    {merging ? '...' : `\uD83D\uDD00 ${(t as any).organizations.mergeButton}`}
                  </button>
                </div>
              </div>

              {/* Organizations table */}
              {orgsLoading ? <SkeletonTable rows={5} cols={4} /> : allOrgs.length === 0 ? (
                <p style={{ color: colors.text.muted, textAlign: 'center', padding: '40px' }}>{(t as any).organizations.noOrgs}</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typography.fontSize.sm }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${colors.border.light}` }}>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{(t as any).organizations.name}</th>
                        <th style={{ textAlign: 'center', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{(t as any).organizations.members}</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{(t as any).organizations.created}</th>
                        <th style={{ textAlign: 'right', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{(t as any).organizations.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allOrgs
                        .sort((a, b) => {
                          const countA = orgMemberCounts[a.id] ?? 999;
                          const countB = orgMemberCounts[b.id] ?? 999;
                          if (countA === 0 && countB !== 0) return -1;
                          if (countB === 0 && countA !== 0) return 1;
                          return a.name.localeCompare(b.name);
                        })
                        .map((org) => {
                          const memberCount = orgMemberCounts[org.id];
                          const isEmpty = memberCount === 0;
                          const isDeleting = deletingOrgId === org.id;
                          return (
                            <tr key={org.id} style={{ borderBottom: `1px solid ${colors.border.light}`, background: isEmpty ? (isDark ? 'rgba(239,68,68,0.05)' : '#FEF2F2') : rowDefaultBg }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = isEmpty ? (isDark ? 'rgba(239,68,68,0.1)' : '#FEE2E2') : rowHoverBg; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = isEmpty ? (isDark ? 'rgba(239,68,68,0.05)' : '#FEF2F2') : rowDefaultBg; }}>
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '18px' }}>{'\uD83C\uDFE2'}</span>
                                  <div>
                                    <div style={{ color: colors.text.body, fontWeight: typography.fontWeight.medium }}>{org.name}</div>
                                    <div style={{ color: colors.text.muted, fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.mono }}>{org.id.substring(0, 8)}...</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                {memberCount !== undefined ? (
                                  <span style={{
                                    padding: '2px 10px', borderRadius: radii.full, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold,
                                    background: isEmpty ? dangerBtnBg : primaryBadgeBg,
                                    border: `1px solid ${isEmpty ? dangerBtnBorder : primaryBadgeBorder}`,
                                    color: isEmpty ? dangerBtnText : primaryBadgeText,
                                  }}>
                                    {isEmpty ? `0 — ${(t as any).organizations.empty}` : memberCount}
                                  </span>
                                ) : (
                                  <span style={{ color: colors.text.muted, fontSize: typography.fontSize.xs }}>...</span>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px', color: colors.text.muted }}>{formatDate(org.created_at || null, true)}</td>
                              <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                {isEmpty ? (
                                  <button onClick={() => handleDeleteOrg(org.id, org.name, memberCount)} disabled={isDeleting}
                                    style={{ background: dangerBtnBg, border: `1px solid ${dangerBtnBorder}`, borderRadius: radii.lg, padding: '4px 14px', cursor: isDeleting ? 'wait' : 'pointer', color: dangerBtnText, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, opacity: isDeleting ? 0.6 : 1 }}
                                    onMouseEnter={(e) => { if (!isDeleting) e.currentTarget.style.background = isDark ? 'rgba(239,68,68,0.25)' : '#FEE2E2'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = dangerBtnBg; }}>
                                    {isDeleting ? '...' : `\uD83D\uDDD1\uFE0F ${(t as any).organizations.deleteOrg}`}
                                  </button>
                                ) : (
                                  <span style={{ color: colors.text.muted, fontSize: typography.fontSize.xs }}>{'\u2014'}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
                    {/* ═══ STATISTICS TAB ═══ ★ v4.3 */}
          {activeTab === 'statistics' && isUserAdmin && (() => {
            var tStats = (t as any).statistics || {};
            var totalProjects = statsProjects.length;
            var now = new Date();
            var thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            var activeUsers = admin.users.filter(function(u) {
              return u.lastSignIn && new Date(u.lastSignIn) > thirtyDaysAgo;
            }).length;
            var avgProjects = admin.users.length > 0 ? (totalProjects / admin.users.length).toFixed(1) : '0';
            var recentErrors = errorLogs.filter(function(e) {
              return new Date(e.created_at) > thirtyDaysAgo;
            }).length;

            return (
              <div>
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ color: colors.text.heading, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, margin: '0 0 4px' }}>
                    {'\uD83D\uDCCA'} {tStats.title || 'Usage Statistics'}
                  </h3>
                    <p style={{ color: colors.text.muted, fontSize: typography.fontSize.sm, margin: 0 }}>{tStats.subtitle || ''}</p>
                </div>
                {isUserSuperAdmin && statsProjects.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={function() {
                      var lines = [];
                      lines.push('=' .repeat(60));
                      lines.push('EURO-OFFICE STATISTICS');
                      lines.push('Exported: ' + new Date().toISOString());
                      lines.push('=' .repeat(60));
                      lines.push('');
                      lines.push('SUMMARY');
                      lines.push('  Total Projects: ' + statsProjects.length);
                      lines.push('  Total Users:    ' + admin.users.length);
                      lines.push('');
                      lines.push('-'.repeat(40));
                      lines.push('USERS');
                      lines.push('-'.repeat(40));
                      admin.users.forEach(function(u) {
                        var projCount = statsUserProjects[u.id] || 0;
                        var settings = statsUserSettings[u.id];
                        lines.push('  ' + u.email + ' | Projects: ' + projCount + ' | Provider: ' + (settings ? settings.ai_provider : '-') + ' | Last: ' + (u.lastSignIn ? formatDate(u.lastSignIn) : 'Never'));
                      });
                      lines.push('');
                      lines.push('-'.repeat(40));
                      lines.push('PROJECTS');
                      lines.push('-'.repeat(40));
                      statsProjects.forEach(function(p) {
                        lines.push('  ' + p.title + ' | Owner: ' + p.ownerEmail + ' | Lang: ' + p.language + ' | WPs: ' + p.wpCount + ' | Partners: ' + p.partnerCount + ' | Modified: ' + formatDate(p.updatedAt));
                      });
                      var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
                      var url = URL.createObjectURL(blob);
                      var a = document.createElement('a');
                      a.href = url;
                      a.download = 'euro-office-statistics-' + new Date().toISOString().split('T')[0] + '.txt';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                      style={{ fontSize: '11px', padding: '5px 10px', borderRadius: radii.md, border: '1px solid ' + colors.border.medium, background: colors.surface.card, color: colors.text.body, cursor: 'pointer' }}
                    >{'\u2193 '} TXT</button>
                    <button onClick={function() {
                      var exportData = {
                        _meta: { format: 'euro-office-statistics', version: '1.0', exportedAt: new Date().toISOString(), exportedBy: storageService.getCurrentUser() || 'unknown' },
                        summary: { totalProjects: statsProjects.length, totalUsers: admin.users.length },
                        users: admin.users.map(function(u) {
                          return { email: u.email, projects: statsUserProjects[u.id] || 0, aiProvider: (statsUserSettings[u.id] || {}).ai_provider || '-', lastSignIn: u.lastSignIn || '', registeredAt: u.createdAt || '' };
                        }),
                        projects: statsProjects.map(function(p) {
                          return { id: p.id, title: p.title, ownerEmail: p.ownerEmail, language: p.language, wpCount: p.wpCount, partnerCount: p.partnerCount, createdAt: p.createdAt, updatedAt: p.updatedAt };
                        })
                      };
                      var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8' });
                      var url = URL.createObjectURL(blob);
                      var a = document.createElement('a');
                      a.href = url;
                      a.download = 'euro-office-statistics-' + new Date().toISOString().split('T')[0] + '.json';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                      style={{ fontSize: '11px', padding: '5px 10px', borderRadius: radii.md, border: '1px solid ' + colors.border.medium, background: colors.surface.card, color: colors.text.body, cursor: 'pointer' }}
                    >{'\u2193 '} JSON</button>
                  </div>
                )}

                {statsLoading ? <SkeletonTable rows={3} cols={4} /> : (
                  <>
                    {/* Summary cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                      <div style={{ padding: '16px', borderRadius: radii.lg, background: primaryBadgeBg, border: '1px solid ' + primaryBadgeBorder, textAlign: 'center' }}>
                        <div style={{ fontSize: typography.fontSize.xs, color: primaryBadgeText, fontWeight: typography.fontWeight.semibold, textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '4px' }}>{tStats.totalProjects || 'Total Projects'}</div>
                        <div style={{ fontSize: '28px', fontWeight: typography.fontWeight.bold, color: primaryBadgeText }}>{totalProjects}</div>
                      </div>
                      <div style={{ padding: '16px', borderRadius: radii.lg, background: successBg, border: '1px solid ' + successBorder, textAlign: 'center' }}>
                        <div style={{ fontSize: typography.fontSize.xs, color: successText, fontWeight: typography.fontWeight.semibold, textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '4px' }}>{tStats.activeUsers30 || 'Active Users (30d)'}</div>
                        <div style={{ fontSize: '28px', fontWeight: typography.fontWeight.bold, color: successText }}>{activeUsers}</div>
                      </div>
                      <div style={{ padding: '16px', borderRadius: radii.lg, background: secondaryInfoBg, border: '1px solid ' + secondaryInfoBorder, textAlign: 'center' }}>
                        <div style={{ fontSize: typography.fontSize.xs, color: secondaryInfoText, fontWeight: typography.fontWeight.semibold, textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '4px' }}>{tStats.avgProjectsPerUser || 'Avg Projects / User'}</div>
                        <div style={{ fontSize: '28px', fontWeight: typography.fontWeight.bold, color: secondaryInfoText }}>{avgProjects}</div>
                      </div>
                      <div style={{ padding: '16px', borderRadius: radii.lg, background: errorBg, border: '1px solid ' + errorBorder, textAlign: 'center' }}>
                        <div style={{ fontSize: typography.fontSize.xs, color: errorText, fontWeight: typography.fontWeight.semibold, textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '4px' }}>{tStats.totalErrors30 || 'Errors (30d)'}</div>
                        <div style={{ fontSize: '28px', fontWeight: typography.fontWeight.bold, color: errorText }}>{recentErrors}</div>
                      </div>
                    </div>

                    {/* Users table */}
                    <div style={{ marginBottom: '24px' }}>
                      <h4 style={{ color: colors.text.heading, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.bold, margin: '0 0 12px' }}>
                        {'\uD83D\uDC65'} {tStats.userTable || 'Users Overview'}
                      </h4>
                      {admin.users.length === 0 ? (
                        <p style={{ color: colors.text.muted, textAlign: 'center', padding: '20px' }}>{tStats.noUsers || 'No users.'}</p>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typography.fontSize.sm }}>
                            <thead>
                              <tr style={{ borderBottom: '2px solid ' + colors.border.light }}>
                                <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{tStats.email || 'Email'}</th>
                                <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{tStats.organization || 'Organization'}</th>
                                <th style={{ textAlign: 'center', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{tStats.projects || 'Projects'}</th>
                                <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{tStats.lastActive || 'Last Active'}</th>
                                <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{tStats.aiProvider || 'AI Provider'}</th>
                                <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{tStats.registered || 'Registered'}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {admin.users
                                .sort(function(a, b) { return (statsUserProjects[b.id] || 0) - (statsUserProjects[a.id] || 0); })
                                .map(function(user) {
                                  var projCount = statsUserProjects[user.id] || 0;
                                  var settings = statsUserSettings[user.id];
                                  var provider = settings ? settings.ai_provider : '—';
                                  var providerIcons = { gemini: '\uD83D\uDC8E', openai: '\uD83E\uDDE0', openrouter: '\uD83C\uDF10' };
                                  return (
                                    <tr key={user.id} style={{ borderBottom: '1px solid ' + colors.border.light, background: rowDefaultBg }}
                                      onMouseEnter={function(e) { e.currentTarget.style.background = rowHoverBg; }}
                                      onMouseLeave={function(e) { e.currentTarget.style.background = rowDefaultBg; }}>
                                      <td style={{ padding: '10px 12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <UserAvatar name={user.displayName} email={user.email} size={28} />
                                          <span style={{ color: colors.text.body }}>{user.email}</span>
                                        </div>
                                      </td>
                                      <td style={{ padding: '10px 12px', color: user.orgName ? colors.text.body : colors.text.muted, fontSize: typography.fontSize.xs }}>{user.orgName || '\u2014'}</td>
                                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                        <span style={{ padding: '2px 10px', borderRadius: radii.full, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold, background: projCount > 0 ? primaryBadgeBg : 'transparent', border: projCount > 0 ? '1px solid ' + primaryBadgeBorder : '1px solid ' + colors.border.light, color: projCount > 0 ? primaryBadgeText : colors.text.muted }}>{projCount}</span>
                                      </td>
                                      <td style={{ padding: '10px 12px', color: colors.text.muted }}>{user.lastSignIn ? formatDate(user.lastSignIn) : '\u2014'}</td>
                                      <td style={{ padding: '10px 12px' }}>
                                        <span style={{ fontSize: typography.fontSize.xs, color: colors.text.body }}>{(providerIcons[provider] || '') + ' ' + (provider || '\u2014')}</span>
                                      </td>
                                      <td style={{ padding: '10px 12px', color: colors.text.muted }}>{formatDate(user.createdAt, true)}</td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Projects table */}
                    <div>
                      <h4 style={{ color: colors.text.heading, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.bold, margin: '0 0 12px' }}>
                        {'\uD83D\uDCC1'} {tStats.projectTable || 'Projects Overview'}
                      </h4>
                      {statsProjects.length === 0 ? (
                        <p style={{ color: colors.text.muted, textAlign: 'center', padding: '20px' }}>{tStats.noProjects || 'No projects.'}</p>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typography.fontSize.sm }}>
                            <thead>
                              <tr style={{ borderBottom: '2px solid ' + colors.border.light }}>
                                <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{tStats.projectTitle || 'Project'}</th>
                                <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{tStats.owner || 'Owner'}</th>
                                <th style={{ textAlign: 'center', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{tStats.lang || 'Lang'}</th>
                                <th style={{ textAlign: 'center', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{tStats.workPackages || 'WPs'}</th>
                                <th style={{ textAlign: 'center', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{tStats.partnersCol || 'Partners'}</th>
                                <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{tStats.created || 'Created'}</th>
                                <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{tStats.lastModified || 'Modified'}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {statsProjects
                                .sort(function(a, b) { return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime(); })
                                .map(function(proj) {
                                  return (
                                    <tr key={proj.id} style={{ borderBottom: '1px solid ' + colors.border.light, background: rowDefaultBg }}
                                      onMouseEnter={function(e) { e.currentTarget.style.background = rowHoverBg; }}
                                      onMouseLeave={function(e) { e.currentTarget.style.background = rowDefaultBg; }}>
                                      <td style={{ padding: '10px 12px' }}>
                                        <div>
                                          <div style={{ color: colors.text.body, fontWeight: typography.fontWeight.medium }}>{proj.title}</div>
                                          <div style={{ color: colors.text.muted, fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.mono }}>{proj.id.substring(0, 12)}...</div>
                                        </div>
                                      </td>
                                      <td style={{ padding: '10px 12px', color: colors.text.body, fontSize: typography.fontSize.xs }}>{proj.ownerEmail}</td>
                                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                        <span style={{ padding: '2px 8px', borderRadius: radii.full, fontSize: typography.fontSize.xs, background: secondaryInfoBg, border: '1px solid ' + secondaryInfoBorder, color: secondaryInfoText }}>{proj.language}</span>
                                      </td>
                                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: typography.fontWeight.bold, color: proj.wpCount > 0 ? primaryBadgeText : colors.text.muted }}>{proj.wpCount}</td>
                                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: typography.fontWeight.bold, color: proj.partnerCount > 0 ? successText : colors.text.muted }}>{proj.partnerCount}</td>
                                      <td style={{ padding: '10px 12px', color: colors.text.muted }}>{formatDate(proj.createdAt, true)}</td>
                                      <td style={{ padding: '10px 12px', color: colors.text.muted }}>{formatDate(proj.updatedAt)}</td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* ═══ INSTRUCTIONS TAB ═══ ★ v4.8: Export TXT/JSON + Import JSON (SuperAdmin only) */}
          {activeTab === 'instructions' && isUserAdmin && (
            <div>
              {/* ★ v4.8: Export/Import toolbar — SuperAdmin only */}
              {isUserSuperAdmin && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '12px 16px', borderRadius: radii.lg, background: superadminBadgeBg, border: '1px solid ' + superadminBadgeBorder }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>{'\uD83D\uDC51'}</span>
                    <span style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: superadminBadgeText }}>
                      {language === 'si' ? 'Upravljanje pravil (SuperAdmin)' : 'Instructions Management (SuperAdmin)'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={function() {
                      // ═══ EXPORT TXT ═══
                      var sections = Object.keys(t.instructions.sections);
                      var lines = [];
                      lines.push('=' .repeat(60));
                      lines.push('EURO-OFFICE AI INSTRUCTIONS');
                      lines.push('Exported: ' + new Date().toISOString());
                      lines.push('Version: ' + (admin.globalInstructions?.app_version || '1.1.0'));
                      lines.push('=' .repeat(60));
                      lines.push('');
                      sections.forEach(function(section) {
                        var label = t.instructions.sections[section] || section;
                        var content = editedInstructions[section] || '';
                        lines.push('-'.repeat(60));
                        lines.push('SECTION: ' + label + ' [' + section + ']');
                        lines.push('-'.repeat(60));
                        lines.push('');
                        lines.push(content || '(empty)');
                        lines.push('');
                        lines.push('');
                      });
                      lines.push('=' .repeat(60));
                      lines.push('END OF INSTRUCTIONS');
                      lines.push('=' .repeat(60));
                      var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
                      var url = URL.createObjectURL(blob);
                      var a = document.createElement('a');
                      a.href = url;
                      a.download = 'euro-office-instructions-' + new Date().toISOString().split('T')[0] + '.txt';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                      style={{ fontSize: '11px', padding: '6px 12px', borderRadius: radii.md, border: '1px solid ' + superadminBadgeBorder, background: 'transparent', color: superadminBadgeText, cursor: 'pointer', fontWeight: typography.fontWeight.semibold }}
                    >
                      {'\u2193'} {language === 'si' ? 'Izvoz TXT' : 'Export TXT'}
                    </button>
                    <button onClick={function() {
                      // ═══ EXPORT JSON ═══
                      var exportData = {
                        _meta: {
                          format: 'euro-office-instructions',
                          version: '1.0',
                          exportedAt: new Date().toISOString(),
                          exportedBy: storageService.getCurrentUser() || 'unknown',
                          appVersion: admin.globalInstructions?.app_version || '1.1.0',
                          description: 'Edit the values below and re-import via SuperAdmin panel. Do NOT change the keys (global, language, academic, etc).'
                        }
                      };
                      var sections = Object.keys(t.instructions.sections);
                      sections.forEach(function(section) {
                        exportData[section] = editedInstructions[section] || '';
                      });
                      var jsonStr = JSON.stringify(exportData, null, 2);
                      var blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
                      var url = URL.createObjectURL(blob);
                      var a = document.createElement('a');
                      a.href = url;
                      a.download = 'euro-office-instructions-' + new Date().toISOString().split('T')[0] + '.json';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                      style={{ fontSize: '11px', padding: '6px 12px', borderRadius: radii.md, border: '1px solid ' + superadminBadgeBorder, background: 'transparent', color: superadminBadgeText, cursor: 'pointer', fontWeight: typography.fontWeight.semibold }}
                    >
                      {'\u2193'} {language === 'si' ? 'Izvoz JSON' : 'Export JSON'}
                    </button>
                    <label style={{ fontSize: '11px', padding: '6px 12px', borderRadius: radii.md, border: '1px solid ' + colors.primary[400], background: colors.primary[600], color: '#fff', cursor: 'pointer', fontWeight: typography.fontWeight.bold, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {'\u2191'} {language === 'si' ? 'Uvoz JSON' : 'Import JSON'}
                      <input type="file" accept=".json" style={{ display: 'none' }} onChange={function(e) {
                        var file = e.target.files?.[0];
                        if (!file) return;
                        var reader = new FileReader();
                        reader.onload = function(ev) {
                          try {
                            var parsed = JSON.parse(ev.target?.result);
                            // Validate structure
                            var validSections = Object.keys(t.instructions.sections);
                            var foundSections = [];
                            var invalidKeys = [];
                            Object.keys(parsed).forEach(function(key) {
                              if (key === '_meta') return;
                              if (validSections.indexOf(key) >= 0) {
                                foundSections.push(key);
                              } else {
                                invalidKeys.push(key);
                              }
                            });
                            if (foundSections.length === 0) {
                              setToast({ message: language === 'si' ? 'Neveljavna JSON datoteka — ni prepoznanih sekcij.' : 'Invalid JSON file — no recognized sections found.', type: 'error' });
                              e.target.value = '';
                              return;
                            }
                            var warningText = '';
                            if (invalidKeys.length > 0) {
                              warningText = (language === 'si' ? '\n\nNeznane sekcije (bodo ignorirane): ' : '\n\nUnknown sections (will be ignored): ') + invalidKeys.join(', ');
                            }
                            setConfirmModal({
                              isOpen: true,
                              title: language === 'si' ? 'Uvoz AI pravil' : 'Import AI Instructions',
                              message: (language === 'si'
                                ? 'To bo PREPISALO vsa AI pravila za VSE uporabnike v sistemu!\n\nDatoteka: ' + file.name + '\nPrepoznane sekcije: ' + foundSections.length + ' / ' + validSections.length
                                : 'This will OVERWRITE all AI instructions for ALL users in the system!\n\nFile: ' + file.name + '\nRecognized sections: ' + foundSections.length + ' / ' + validSections.length)
                                + warningText
                                + (language === 'si' ? '\n\nAli ste prepri\u010Dani?' : '\n\nAre you sure?'),
                              onConfirm: async function() {
                                setConfirmModal(null);
                                // Build new instructions object
                                var newInstructions = {};
                                foundSections.forEach(function(key) {
                                  newInstructions[key] = parsed[key];
                                });
                                // Save via admin
                                var result = await admin.saveGlobalInstructions(newInstructions);
                                if (result.success) {
                                  // Update local state
                                  var defaults = buildDefaultInstructionsDisplay();
                                  var merged = {};
                                  Object.keys(defaults).forEach(function(key) {
                                    merged[key] = newInstructions[key] !== undefined ? newInstructions[key] : defaults[key];
                                  });
                                  setEditedInstructions(merged);
                                  setToast({ message: (language === 'si' ? 'Pravila uspe\u0161no uvo\u017Eena! ' : 'Instructions imported successfully! ') + foundSections.length + (language === 'si' ? ' sekcij posodobljenih.' : ' sections updated.'), type: 'success' });
                                  // Audit log
                                  try {
                                    var userId = await storageService.getCurrentUserId();
                                    await supabase.from('admin_log').insert({
                                      admin_id: userId,
                                      action: 'instructions_import',
                                      target_user_id: null,
                                      details: { fileName: file.name, sectionsImported: foundSections.length, sectionsSkipped: invalidKeys.length, importedAt: new Date().toISOString() },
                                    });
                                  } catch (logErr) { /* ignore */ }
                                } else {
                                  setToast({ message: (language === 'si' ? 'Napaka pri uvozu: ' : 'Import failed: ') + (result.message || ''), type: 'error' });
                                }
                              },
                            });
                          } catch (parseErr) {
                            setToast({ message: language === 'si' ? 'Neveljavna JSON datoteka — napaka pri raz\u010Dlenjevanju.' : 'Invalid JSON file — parsing error.', type: 'error' });
                          }
                          e.target.value = '';
                        };
                        reader.readAsText(file);
                      }} />
                    </label>
                  </div>
                </div>
              )}
              {/* ★ v4.9: Org-scoped instructions notice for Admin */}
              {!isUserSuperAdmin && isUserAdmin && (
                <div style={{ padding: '12px 16px', borderRadius: radii.lg, background: secondaryInfoBg, border: '1px solid ' + secondaryInfoBorder, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px' }}>{'\uD83C\uDFE2'}</span>
                  <div>
                    <div style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: secondaryInfoText }}>
                      {language === 'si' ? 'Urejate pravila za va\u0161o organizacijo: ' : 'You are editing instructions for your organization: '}
                      <strong>{storageService.getActiveOrgName()}</strong>
                    </div>
                    <div style={{ fontSize: typography.fontSize.xs, color: secondaryInfoText, opacity: 0.85, marginTop: '2px' }}>
                      {language === 'si' ? 'Te spremembe veljajo SAMO za va\u0161o organizacijo. Globalna privzeta pravila dolo\u010Da SuperAdmin.' : 'These changes apply ONLY to your organization. Global defaults are set by SuperAdmin.'}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '20px', minHeight: '400px' }}>
                <div style={{ width: '200px', flexShrink: 0, borderRight: '1px solid ' + colors.border.light, paddingRight: '16px' }}>
                  {instructionSections.map(function(section) {
                    return (
                      <button key={section} onClick={function() { setActiveInstructionSection(section); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', marginBottom: '4px', borderRadius: radii.md, border: 'none', cursor: 'pointer', background: activeInstructionSection === section ? primaryBadgeBg : 'transparent', color: activeInstructionSection === section ? primaryBadgeText : colors.text.body, fontSize: typography.fontSize.xs, fontWeight: activeInstructionSection === section ? typography.fontWeight.semibold : typography.fontWeight.medium }}>
                        {t.instructions.sections[section]}
                      </button>
                    );
                  })}
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ color: colors.text.heading, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.bold, margin: '0 0 8px' }}>
                    {t.instructions.sections[activeInstructionSection] || activeInstructionSection}
                  </h3>
                  <textarea value={editedInstructions[activeInstructionSection] || ''} onChange={function(e) { handleInstructionChange(activeInstructionSection, e.target.value); }} placeholder={getDefaultPlaceholder(activeInstructionSection)} style={Object.assign({}, inputStyle, { minHeight: '300px', resize: 'vertical', fontFamily: typography.fontFamily.mono, fontSize: '12px', lineHeight: '1.6' })} />
                  <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                    <button onClick={handleSaveGlobalInstructions} style={{ padding: '8px 20px', borderRadius: radii.lg, border: 'none', background: colors.primary[600], color: '#fff', cursor: 'pointer', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold }}>{t.instructions.save}</button>
                    <button onClick={handleResetGlobalInstructions} style={{ padding: '8px 20px', borderRadius: radii.lg, border: '1px solid ' + colors.border.light, background: colors.surface.card, color: colors.text.body, cursor: 'pointer', fontSize: typography.fontSize.sm }}>{t.instructions.reset}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ AI TAB ═══ */}
          {activeTab === 'ai' && (
            <div>
              <h3 style={{ color: colors.text.heading, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, margin: '0 0 16px' }}>{'\uD83E\uDD16'} {language === 'si' ? 'AI Ponudnik' : 'AI Provider'}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                {(['gemini', 'openai', 'openrouter'] as AIProviderType[]).map((provider) => {
                  const isActive = aiProvider === provider;
                  const names: Record<string, string> = { gemini: 'Google Gemini', openai: 'OpenAI (ChatGPT)', openrouter: 'OpenRouter' };
                  const icons: Record<string, string> = { gemini: '\uD83D\uDC8E', openai: '\uD83E\uDDE0', openrouter: '\uD83C\uDF10' };
                  return (
                    <button key={provider} onClick={() => handleProviderChange(provider)} style={{ padding: '16px', borderRadius: radii.lg, cursor: 'pointer', textAlign: 'left', border: isActive ? `2px solid ${colors.primary[500]}` : `1px solid ${colors.border.light}`, background: isActive ? primaryBadgeBg : colors.surface.card }}>
                      <div style={{ fontSize: '24px', marginBottom: '8px' }}>{icons[provider]}</div>
                      <div style={{ color: colors.text.heading, fontWeight: typography.fontWeight.semibold, fontSize: typography.fontSize.sm }}>{names[provider]}</div>
                    </button>
                  );
                })}
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>{aiProvider === 'gemini' ? 'Gemini' : aiProvider === 'openai' ? 'OpenAI' : 'OpenRouter'} API Key</label>
                <input type="password" value={aiProvider === 'gemini' ? geminiKey : aiProvider === 'openai' ? openaiKey : openRouterKey} onChange={(e) => { if (aiProvider === 'gemini') setGeminiKey(e.target.value); else if (aiProvider === 'openai') setOpenaiKey(e.target.value); else setOpenRouterKey(e.target.value); }} placeholder={`Enter ${aiProvider} API key...`} style={inputStyle} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>{language === 'si' ? 'Glavni model (generiranje vsebine)' : 'Primary Model (content generation)'}</label>
                <select value={modelName} onChange={(e) => setModelName(e.target.value)} style={{ ...inputStyle, fontFamily: typography.fontFamily.body }}>
                  {currentModels.map((m: any) => <option key={m.id || m} value={m.id || m}>{m.name || m.id || m}</option>)}
                </select>
                <div style={{ marginTop: '6px', padding: '8px 12px', borderRadius: radii.md, background: secondaryInfoBg, border: `1px solid ${secondaryInfoBorder}`, fontSize: typography.fontSize.xs, color: secondaryInfoText }}>
                  {language === 'si'
                    ? `\uD83D\uDCA1 Priporo\u010Den: ${aiProvider === 'gemini' ? 'Gemini 2.5 Pro \u2014 najbolj\u0161i za kompleksno generiranje' : aiProvider === 'openai' ? 'GPT-5 Mini \u2014 odli\u010Dno razmerje cena/kvaliteta' : 'DeepSeek V3.2 \u2014 top open-source model'}`
                    : `\uD83D\uDCA1 Recommended: ${aiProvider === 'gemini' ? 'Gemini 2.5 Pro \u2014 best for complex generation' : aiProvider === 'openai' ? 'GPT-5 Mini \u2014 great price/quality ratio' : 'DeepSeek V3.2 \u2014 top open-source model'}`}
                  {(() => {
                    const recommended: Record<string, string> = { gemini: 'gemini-2.5-pro', openai: 'gpt-5-mini', openrouter: 'deepseek/deepseek-v3.2' };
                    return modelName !== recommended[aiProvider] ? (
                      <button
                        type="button"
                        onClick={() => setModelName(recommended[aiProvider])}
                        style={{ marginLeft: '8px', padding: '2px 10px', borderRadius: radii.md, border: `1px solid ${secondaryInfoBorder}`, background: 'transparent', color: secondaryInfoText, cursor: 'pointer', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold }}
                      >
                        {language === 'si' ? 'Uporabi priporo\u010Denega' : 'Use recommended'}
                      </button>
                    ) : null;
                  })()}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>{language === 'si' ? 'Hitri model (prevodi, chatbot, polja)' : 'Light Model (translations, chatbot, fields)'}</label>
                <select value={secondaryModelName} onChange={(e) => setSecondaryModelName(e.target.value)} style={{ ...inputStyle, fontFamily: typography.fontFamily.body }}>
                  <option value="">{language === 'si' ? '\u2014 Uporabi glavni model \u2014' : '\u2014 Use primary model \u2014'}</option>
                  {currentModels.map((m: any) => <option key={m.id || m} value={m.id || m}>{m.name || m.id || m}</option>)}
                </select>
                <div style={{ marginTop: '6px', padding: '8px 12px', borderRadius: radii.md, background: secondaryInfoBg, border: `1px solid ${secondaryInfoBorder}`, fontSize: typography.fontSize.xs, color: secondaryInfoText }}>
                  {language === 'si'
                    ? `\uD83D\uDCA1 Priporo\u010Den: ${RECOMMENDED_LIGHT_MODELS[aiProvider]?.name || '\u2014'} \u2014 hitrej\u0161i in cenej\u0161i za prevode in chatbot. Isti API klju\u010D.`
                    : `\uD83D\uDCA1 Recommended: ${RECOMMENDED_LIGHT_MODELS[aiProvider]?.name || '\u2014'} \u2014 faster & cheaper for translations and chatbot. Same API key.`}
                  {secondaryModelName !== (RECOMMENDED_LIGHT_MODELS[aiProvider]?.id || '') && (
                    <button
                      type="button"
                      onClick={() => setSecondaryModelName(RECOMMENDED_LIGHT_MODELS[aiProvider]?.id || '')}
                      style={{ marginLeft: '8px', padding: '2px 10px', borderRadius: radii.md, border: `1px solid ${secondaryInfoBorder}`, background: 'transparent', color: secondaryInfoText, cursor: 'pointer', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold }}
                    >
                      {language === 'si' ? 'Uporabi priporo\u010Denega' : 'Use recommended'}
                    </button>
                  )}
                </div>
              </div>

              {/* ═══ WEB SEARCH ═══ ★ v5.2 EO-042 */}
              <div style={{ marginTop: '28px', marginBottom: '20px', padding: '20px', borderRadius: radii.xl, background: secondaryInfoBg, border: '1px solid ' + secondaryInfoBorder }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '22px' }}>{'\uD83C\uDF10'}</span>
                  <div>
                    <h4 style={{ color: secondaryInfoText, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.bold, margin: 0 }}>
                      {language === 'si' ? 'Spletno iskanje za dokaze' : 'Web Search for Evidence'}
                    </h4>
                    <p style={{ color: secondaryInfoText, fontSize: typography.fontSize.xs, margin: '2px 0 0', opacity: 0.85 }}>
                      {language === 'si'
                        ? 'AI bo pri generiranju vsebine poiskal aktualne podatke, statistike in vire iz spleta. Deluje za Gemini in OpenRouter.'
                        : 'AI will search for current data, statistics and sources from the web when generating content. Works with Gemini and OpenRouter.'}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: radii.lg, background: colors.surface.card, border: '1px solid ' + colors.border.light }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}>
                    <input type="checkbox" checked={webSearchEnabled} onChange={function(e) { setWebSearchEnabled(e.target.checked); }}
                      style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: colors.primary[600] }} />
                    <span style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.text.heading }}>
                      {language === 'si' ? 'Omogo\u010Di spletno iskanje za dokaze' : 'Enable web search for evidence'}
                    </span>
                  </label>
                  <span style={{
                    padding: '3px 10px', borderRadius: radii.full, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold,
                    background: webSearchEnabled ? successBg : (isDark ? 'rgba(100,100,100,0.2)' : '#F3F4F6'),
                    border: '1px solid ' + (webSearchEnabled ? successBorder : colors.border.light),
                    color: webSearchEnabled ? successText : colors.text.muted,
                  }}>
                    {webSearchEnabled ? (language === 'si' ? 'VKLOPLJENO' : 'ON') : (language === 'si' ? 'IZKLOPLJENO' : 'OFF')}
                  </span>
                </div>
                {webSearchEnabled && aiProvider === 'openai' && (
                  <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: radii.md, background: warningBadgeBg, border: '1px solid ' + warningBadgeBorder, color: warningBadgeText, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium }}>
                    {'\u26A0\uFE0F'} {language === 'si' ? 'Spletno iskanje ne deluje z direktnim OpenAI ponudnikom. Uporabite Gemini ali OpenRouter.' : 'Web search is not supported with direct OpenAI provider. Use Gemini or OpenRouter instead.'}
                  </div>
                )}
              </div>

              {message && (<div style={{ padding: '10px 14px', borderRadius: radii.lg, marginBottom: '12px', background: isError ? errorBg : successBg, border: `1px solid ${isError ? errorBorder : successBorder}`, color: isError ? errorText : successText, fontSize: typography.fontSize.sm }}>{isError ? '\u274C' : '\u2705'} {message}</div>)}
              <button onClick={handleAISave} disabled={isValidating} style={{ padding: '10px 24px', borderRadius: radii.lg, border: 'none', background: colors.primary[600], color: '#fff', cursor: isValidating ? 'not-allowed' : 'pointer', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, opacity: isValidating ? 0.7 : 1 }}>
                {isValidating ? (language === 'si' ? 'Preverjam...' : 'Validating...') : (language === 'si' ? 'Shrani nastavitve' : 'Save Settings')}
              </button>
            </div>
          )}

          {/* ═══ PROFILE TAB ═══ */}
          {activeTab === 'profile' && (
            <div>
              <h3 style={{ color: colors.text.heading, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, margin: '0 0 16px' }}>{'\uD83D\uDC64'} {language === 'si' ? 'Profil & Varnost' : 'Profile & Security'}</h3>
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ color: colors.text.heading, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, margin: '0 0 12px' }}>{'\uD83D\uDD11'} {language === 'si' ? 'Spremeni geslo' : 'Change Password'}</h4>
                <div style={{ display: 'grid', gap: '12px', maxWidth: '400px' }}>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={language === 'si' ? 'Novo geslo' : 'New password'} style={inputStyle} />
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={language === 'si' ? 'Potrdi geslo' : 'Confirm password'} style={inputStyle} />
                  <button onClick={handlePasswordChange} style={{ padding: '10px 20px', borderRadius: radii.lg, border: 'none', background: colors.primary[600], color: '#fff', cursor: 'pointer', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, maxWidth: '200px' }}>{language === 'si' ? 'Spremeni geslo' : 'Change Password'}</button>
                </div>
                {message && activeTab === 'profile' && (<div style={{ padding: '10px 14px', borderRadius: radii.lg, marginTop: '12px', background: isError ? errorBg : successBg, border: `1px solid ${isError ? errorBorder : successBorder}`, color: isError ? errorText : successText, fontSize: typography.fontSize.sm, maxWidth: '400px' }}>{isError ? '\u274C' : '\u2705'} {message}</div>)}
              </div>
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ color: colors.text.heading, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, margin: '0 0 12px' }}>{'\uD83D\uDD10'} {language === 'si' ? 'Dvofaktorska avtentikacija (2FA)' : 'Two-Factor Authentication (2FA)'}</h4>
                {hasMFA ? (
                  <div>
                    <div style={{ padding: '12px 16px', borderRadius: radii.lg, background: successBg, border: `1px solid ${successBorder}`, color: successText, marginBottom: '12px', fontSize: typography.fontSize.sm }}>{'\u2705'} {language === 'si' ? '2FA je aktiviran' : '2FA is enabled'}</div>
                    {mfaFactors.map((f) => (
                      <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: `1px solid ${colors.border.light}`, borderRadius: radii.lg, marginBottom: '8px' }}>
                        <span style={{ color: colors.text.body, fontSize: typography.fontSize.sm }}>{f.friendly_name || 'TOTP'}</span>
                        <button onClick={() => handleDisableMFA(f.id)} style={{ padding: '4px 12px', borderRadius: radii.lg, border: `1px solid ${dangerBtnBorder}`, background: dangerBtnBg, color: dangerBtnText, cursor: 'pointer', fontSize: typography.fontSize.xs }}>{language === 'si' ? 'Deaktiviraj' : 'Disable'}</button>
                      </div>
                    ))}
                  </div>
                ) : mfaEnrolling && enrollData ? (
                  <div style={{ maxWidth: '400px' }}>
                    <p style={{ color: colors.text.body, fontSize: typography.fontSize.sm, marginBottom: '12px' }}>{language === 'si' ? 'Skeniraj QR kodo z avtentikatorjem:' : 'Scan this QR code with your authenticator app:'}</p>
                    <QRCodeImage value={enrollData.qrUri} size={200} colors={colors} />
                    <p style={{ color: colors.text.muted, fontSize: typography.fontSize.xs, margin: '8px 0', fontFamily: typography.fontFamily.mono, wordBreak: 'break-all' }}>{enrollData.secret}</p>
                    <input type="text" maxLength={6} value={enrollCode} onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" style={{ ...inputStyle, maxWidth: '150px', textAlign: 'center', letterSpacing: '4px', fontSize: typography.fontSize.lg, marginBottom: '8px' }} />
                    {enrollError && <p style={{ color: errorText, fontSize: typography.fontSize.xs, margin: '4px 0' }}>{'\u274C'} {enrollError}</p>}
                    <button onClick={handleVerifyMFAEnroll} style={{ padding: '8px 20px', borderRadius: radii.lg, border: 'none', background: colors.primary[600], color: '#fff', cursor: 'pointer', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, display: 'block', marginTop: '8px' }}>{language === 'si' ? 'Potrdi' : 'Verify'}</button>
                  </div>
                ) : (
                  <button onClick={handleStartMFAEnroll} style={{ padding: '10px 20px', borderRadius: radii.lg, border: `1px solid ${colors.border.light}`, background: colors.surface.card, color: colors.text.body, cursor: 'pointer', fontSize: typography.fontSize.sm }}>{language === 'si' ? 'Aktiviraj 2FA' : 'Enable 2FA'}</button>
                )}
              </div>
              {isUserSuperAdmin ? (
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ color: colors.text.heading, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, margin: '0 0 12px' }}>{'\uD83C\uDFA8'} {t.whiteLabel.logoTitle}</h4>
                  {customLogo && <img src={customLogo} alt="Custom Logo" style={{ maxWidth: 200, maxHeight: 60, marginBottom: '12px', borderRadius: radii.md }} />}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <label style={{ padding: '8px 16px', borderRadius: radii.lg, border: `1px solid ${colors.border.light}`, background: colors.surface.card, color: colors.text.body, cursor: 'pointer', fontSize: typography.fontSize.sm }}>{language === 'si' ? 'Nalo\u017Ei logo' : 'Upload Logo'}<input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} /></label>
                    {customLogo && (<button onClick={handleRemoveLogo} style={{ padding: '8px 16px', borderRadius: radii.lg, border: `1px solid ${dangerBtnBorder}`, background: dangerBtnBg, color: dangerBtnText, cursor: 'pointer', fontSize: typography.fontSize.sm }}>{language === 'si' ? 'Odstrani' : 'Remove'}</button>)}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '16px', borderRadius: radii.lg, background: secondaryInfoBg, border: `1px solid ${secondaryInfoBorder}`, marginBottom: '24px' }}>
                  <h4 style={{ color: secondaryInfoText, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, margin: '0 0 4px' }}>{t.whiteLabel.logoTitle}</h4>
                  <p style={{ color: secondaryInfoText, fontSize: typography.fontSize.xs, margin: 0, opacity: 0.85 }}>{t.whiteLabel.logoNotice}</p>
                </div>
              )}
                <div style={{ marginTop: '32px', padding: '20px', borderRadius: radii.lg, background: dangerBg, border: `1px solid ${dangerBorder}` }}>
                <h4 style={{ color: dangerBtnText, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.bold, margin: '0 0 8px' }}>{'\u26A0\uFE0F'} {t.selfDelete.title}</h4>
                <p style={{ color: isDark ? '#FDA4AF' : '#991B1B', fontSize: typography.fontSize.sm, margin: '0 0 16px', lineHeight: '1.5' }}>{t.selfDelete.warning}</p>
                {storageService.isSuperAdmin() ? (
                  <p style={{ color: colors.text.muted, fontSize: typography.fontSize.sm, fontStyle: 'italic' }}>{language === 'si' ? 'SuperAdmin ne more izbrisati lastnega ra\u010Duna. Najprej si odvzemite SuperAdmin vlogo.' : 'SuperAdmin cannot delete own account. Demote yourself first.'}</p>
                ) : (
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input type="text" value={selfDeleteInput} onChange={(e) => setSelfDeleteInput(e.target.value)} placeholder={language === 'si' ? 'Vnesite DELETE' : 'Type DELETE'} style={{ ...inputStyle, maxWidth: '200px', borderColor: dangerBtnBorder }} />
                    <button onClick={handleSelfDelete} disabled={selfDeleteInput !== 'DELETE' || selfDeleteLoading} style={{ padding: '10px 20px', borderRadius: radii.lg, border: 'none', background: selfDeleteInput === 'DELETE' ? '#DC2626' : (isDark ? '#4B1113' : '#FCA5A5'), color: '#fff', cursor: selfDeleteInput === 'DELETE' ? 'pointer' : 'not-allowed', fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, opacity: selfDeleteInput === 'DELETE' ? 1 : 0.5 }}>
                      {selfDeleteLoading ? '...' : `\uD83D\uDDD1\uFE0F ${t.selfDelete.button}`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ AUDIT LOG TAB ═══ */}
          {activeTab === 'audit' && isUserAdmin && (
            <div>
              <h3 style={{ color: colors.text.heading, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, margin: '0 0 4px' }}>{t.log.title}</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' as const, gap: '8px' }}>
                <p style={{ color: colors.text.muted, fontSize: typography.fontSize.sm, margin: 0 }}>{t.log.subtitle}</p>
                {admin.adminLog.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => { var exportData: AuditLogExportEntry[] = admin.adminLog.map(function(e) { return { id: e.id, adminEmail: e.adminEmail || '', action: e.action, targetEmail: e.targetEmail || null, details: e.details, createdAt: e.createdAt }; }); errorLogService.downloadAuditLogsAsFile(exportData, 'txt'); }}
                      style={{ fontSize: '11px', padding: '5px 10px', borderRadius: radii.md, border: '1px solid ' + colors.border.medium, background: colors.surface.card, color: colors.text.body, cursor: 'pointer' }}>{'\u2193 ' + ((t.log as any).exportTxt || 'Export TXT')}</button>
                    <button onClick={() => { var exportData: AuditLogExportEntry[] = admin.adminLog.map(function(e) { return { id: e.id, adminEmail: e.adminEmail || '', action: e.action, targetEmail: e.targetEmail || null, details: e.details, createdAt: e.createdAt }; }); errorLogService.downloadAuditLogsAsFile(exportData, 'json'); }}
                      style={{ fontSize: '11px', padding: '5px 10px', borderRadius: radii.md, border: '1px solid ' + colors.border.medium, background: colors.surface.card, color: colors.text.body, cursor: 'pointer' }}>{'\u2193 ' + ((t.log as any).exportJson || 'Export JSON')}</button>
                  </div>
                )}
              </div>
              {admin.isLoadingLog ? <SkeletonTable rows={5} cols={5} /> : admin.adminLog.length === 0 ? (
                <p style={{ color: colors.text.muted, textAlign: 'center', padding: '40px' }}>{t.log.noEntries}</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typography.fontSize.sm }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${colors.border.light}` }}>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.log.date}</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.log.admin}</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.log.action}</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.log.target}</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.log.details}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {admin.adminLog.map((entry) => (
                        <tr key={entry.id} style={{ borderBottom: `1px solid ${colors.border.light}`, background: rowDefaultBg }} onMouseEnter={(e) => { e.currentTarget.style.background = rowHoverBg; }} onMouseLeave={(e) => { e.currentTarget.style.background = rowDefaultBg; }}>
                          <td style={{ padding: '10px 12px', color: colors.text.muted, whiteSpace: 'nowrap' }}>{formatDate(entry.createdAt)}</td>
                          <td style={{ padding: '10px 12px', color: colors.text.body }}>{entry.adminEmail}</td>
                          <td style={{ padding: '10px 12px' }}><span style={{ padding: '2px 8px', borderRadius: radii.full, background: primaryBadgeBg, border: `1px solid ${primaryBadgeBorder}`, color: primaryBadgeText, fontSize: typography.fontSize.xs }}>{(t.log.actions as Record<string, string>)[entry.action] || entry.action}</span></td>
                          <td style={{ padding: '10px 12px', color: colors.text.body }}>{entry.targetEmail || '\u2014'}</td>
                          <td style={{ padding: '10px 12px', color: colors.text.muted, fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.mono, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{JSON.stringify(entry.details).substring(0, 80)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ═══ ERROR LOG TAB ═══ */}
          {activeTab === 'errors' && isUserSuperAdmin && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap' as const, gap: '10px' }}>
                <div>
                  <h3 style={{ color: colors.text.heading, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, margin: 0 }}>{'\uD83D\uDC1B'} {t.errors.title}</h3>
                  <p style={{ color: colors.text.muted, fontSize: typography.fontSize.sm, margin: '4px 0 0' }}>{t.errors.subtitle} {'\u2014'} {errorLogs.length} {language === 'si' ? 'vnosov' : 'entries'}</p>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
                  <button onClick={() => { errorLogService.downloadLogsAsFile(errorLogs, 'txt'); }} style={{ fontSize: '11px', padding: '5px 10px', borderRadius: radii.md, border: '1px solid ' + colors.border.medium, background: colors.surface.card, color: colors.text.body, cursor: 'pointer' }}>{'\u2193 ' + ((t.errors as any).exportTxt || 'Export TXT')}</button>
                  <button onClick={() => { errorLogService.downloadLogsAsFile(errorLogs, 'json'); }} style={{ fontSize: '11px', padding: '5px 10px', borderRadius: radii.md, border: '1px solid ' + colors.border.medium, background: colors.surface.card, color: colors.text.body, cursor: 'pointer' }}>{'\u2193 ' + ((t.errors as any).exportJson || 'Export JSON')}</button>
                  <button onClick={() => { var text = errorLogService.formatLogsForExport(errorLogs); navigator.clipboard.writeText(text); setToast({ message: t.errors.copied, type: 'success' }); }} style={{ fontSize: '11px', padding: '5px 10px', borderRadius: radii.md, border: '1px solid ' + colors.border.medium, background: colors.surface.card, color: colors.text.body, cursor: 'pointer' }}>{'\uD83D\uDCCB ' + t.errors.copyForDev}</button>
                  <button onClick={async () => { if (!confirm(t.errors.clearConfirm)) return; var result = await errorLogService.clearAllLogs(); if (result.success) { setErrorLogs([]); setToast({ message: t.errors.cleared, type: 'success' }); } }} style={{ fontSize: '11px', padding: '5px 10px', borderRadius: radii.md, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>{'\uD83D\uDDD1\uFE0F ' + t.errors.clearAll}</button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input type="text" placeholder={(t.errors as any).filterComponent || 'Filter component...'} value={errorFilterComponent} onChange={(e) => setErrorFilterComponent(e.target.value)}
                  style={{ flex: 1, fontSize: '12px', padding: '6px 10px', borderRadius: radii.md, border: '1px solid ' + colors.border.medium, background: colors.surface.card, color: colors.text.body }} />
                <input type="text" placeholder={(t.errors as any).filterUser || 'Filter user...'} value={errorFilterUser} onChange={(e) => setErrorFilterUser(e.target.value)}
                  style={{ flex: 1, fontSize: '12px', padding: '6px 10px', borderRadius: radii.md, border: '1px solid ' + colors.border.medium, background: colors.surface.card, color: colors.text.body }} />
              </div>

              <p style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, margin: '0 0 8px' }}>{(t.errors as any).expand || 'Click row to expand full detail'}</p>

              {errorLogsLoading ? <SkeletonTable rows={5} cols={5} colors={colors} /> : errorLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: colors.text.muted }}>{'\u2705'} {t.errors.noErrors}</div>
              ) : (() => {
                var filtered = errorLogs.filter(function(log) {
                  var matchComp = !errorFilterComponent || (log.component || '').toLowerCase().indexOf(errorFilterComponent.toLowerCase()) >= 0;
                  var matchUser = !errorFilterUser || (log.user_email || '').toLowerCase().indexOf(errorFilterUser.toLowerCase()) >= 0;
                  return matchComp && matchUser;
                });
                return (
                  <div style={{ overflowX: 'auto', maxHeight: '600px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typography.fontSize.sm }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid ' + colors.border.light, position: 'sticky' as const, top: 0, background: colors.surface.card, zIndex: 1 }}>
                          <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.errors.date}</th>
                          <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.errors.user}</th>
                          <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.errors.component}</th>
                          <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.errors.error}</th>
                          <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.errors.code}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(function(log) {
                          var isExpanded = expandedErrorId === log.id;
                          return (
                            <React.Fragment key={log.id}>
                              <tr onClick={() => setExpandedErrorId(isExpanded ? null : log.id)}
                                style={{ borderBottom: '1px solid ' + colors.border.light, background: isExpanded ? (isDark ? '#1C2940' : '#EFF6FF') : rowDefaultBg, cursor: 'pointer' }}
                                onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = rowHoverBg; }}
                                onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = rowDefaultBg; }}>
                                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: colors.text.muted }}>{formatDateFull(log.created_at)}</td>
                                <td style={{ padding: '10px 12px', color: colors.text.body }}>{log.user_email || '\u2014'}</td>
                                <td style={{ padding: '10px 12px' }}><span style={{ background: primaryBadgeBg, border: '1px solid ' + primaryBadgeBorder, color: primaryBadgeText, padding: '2px 8px', borderRadius: radii.full, fontSize: typography.fontSize.xs }}>{log.component || '\u2014'}</span></td>
                                <td style={{ padding: '10px 12px', color: colors.text.body, maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isExpanded ? 'normal' : 'nowrap' }}>{log.error_message}</td>
                                <td style={{ padding: '10px 12px', color: colors.text.muted, fontFamily: typography.fontFamily.mono, fontSize: typography.fontSize.xs }}>{log.error_code || '\u2014'}</td>
                              </tr>
                              {isExpanded && (
                                <tr>
                                  <td colSpan={5} style={{ padding: '0 12px 16px 12px', background: isDark ? '#1C2940' : '#EFF6FF' }}>
                                    <div style={{ padding: '12px', borderRadius: radii.lg, border: '1px solid ' + colors.border.light, background: colors.surface.card, fontSize: typography.fontSize.xs }}>
                                      <div style={{ marginBottom: '10px' }}>
                                        <strong style={{ color: colors.text.heading }}>{t.errors.error}:</strong>
                                        <pre style={{ margin: '4px 0', padding: '8px', background: isDark ? '#0A0E1A' : '#F8FAFC', borderRadius: radii.md, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: colors.text.body, fontFamily: typography.fontFamily.mono, fontSize: '11px', border: '1px solid ' + colors.border.light, maxHeight: '150px', overflow: 'auto' }}>{log.error_message}</pre>
                                      </div>
                                      {log.error_stack && (
                                        <div style={{ marginBottom: '10px' }}>
                                          <strong style={{ color: colors.text.heading }}>{(t.errors as any).stackTrace || 'Stack Trace'}:</strong>
                                          <pre style={{ margin: '4px 0', padding: '8px', background: isDark ? '#0A0E1A' : '#FEF2F2', borderRadius: radii.md, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: isDark ? '#FCA5A5' : '#991B1B', fontFamily: typography.fontFamily.mono, fontSize: '11px', border: '1px solid ' + (isDark ? 'rgba(239,68,68,0.2)' : '#FECACA'), maxHeight: '300px', overflow: 'auto' }}>{log.error_stack}</pre>
                                        </div>
                                      )}
                                      {log.context && Object.keys(log.context).length > 0 && (
                                        <div style={{ marginBottom: '10px' }}>
                                          <strong style={{ color: colors.text.heading }}>{(t.errors as any).context || 'Context'}:</strong>
                                          <pre style={{ margin: '4px 0', padding: '8px', background: isDark ? '#0A0E1A' : '#F0FDF4', borderRadius: radii.md, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: colors.text.body, fontFamily: typography.fontFamily.mono, fontSize: '11px', border: '1px solid ' + (isDark ? 'rgba(34,197,94,0.2)' : '#BBF7D0'), maxHeight: '200px', overflow: 'auto' }}>{JSON.stringify(log.context, null, 2)}</pre>
                                        </div>
                                      )}
                                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const, color: colors.text.muted, fontSize: '11px' }}>
                                        <span><strong>ID:</strong> {log.id}</span>
                                        <span><strong>User ID:</strong> {log.user_id || '\u2014'}</span>
                                        <span><strong>ISO:</strong> {log.created_at}</span>
                                      </div>
                                      <button onClick={(e) => { e.stopPropagation(); setExpandedErrorId(null); }}
                                        style={{ marginTop: '8px', fontSize: '11px', padding: '4px 12px', borderRadius: radii.md, border: '1px solid ' + colors.border.light, background: 'transparent', color: colors.text.muted, cursor: 'pointer' }}>{(t.errors as any).collapse || 'Collapse'}</button>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}

           {/* ═══ GUIDE EDITOR TAB ═══ ★ v4.4 — SuperAdmin only */}
          {activeTab === 'guideEditor' && isUserSuperAdmin && (() => {
            var tGuide = (t as any).guideEditor || {};
            var GUIDE_PROPS = ['whatIsThis', 'whyImportant', 'whatToWrite', 'tips', 'euContext', 'example'];
            var propLabels = tGuide.properties || { whatIsThis: 'What is this?', whyImportant: 'Why important?', whatToWrite: 'What to write', tips: 'Tips', euContext: 'EU Context', example: 'Example' };
            var allKeys = getAllGuideKeys();

            // Group by stepKey for left nav
            var stepGroups: Record<string, Array<{ fieldKey: string; stepTitle: string }>> = {};
            allKeys.forEach(function(item) {
              if (!stepGroups[item.stepKey]) stepGroups[item.stepKey] = [];
              stepGroups[item.stepKey].push({ fieldKey: item.fieldKey, stepTitle: item.stepTitle });
            });
            var stepKeysList = Object.keys(stepGroups);

            // Get default content for comparison
            var defaultContent = '';
            try {
              var defaultGuide = getFieldGuide(guideSelectedStep, guideSelectedField, guideSelectedLang);
              if (defaultGuide && defaultGuide[guideSelectedProp]) {
                defaultContent = defaultGuide[guideSelectedProp];
              }
            } catch (e) { /* ignore */ }

            var currentOverrideKey = buildGuideOverrideKey(guideSelectedStep, guideSelectedField, guideSelectedLang, guideSelectedProp);
            var hasOverride = guideOverrides[currentOverrideKey] !== undefined && guideOverrides[currentOverrideKey] !== null && guideOverrides[currentOverrideKey] !== '';

            // Count total overrides
            var totalOverrides = Object.keys(guideOverrides).filter(function(k) { return guideOverrides[k] && guideOverrides[k].trim() !== ''; }).length;

            var handleGuideSave = async function() {
              setGuideEditorSaving(true);
              try {
                var newOverrides = Object.assign({}, guideOverrides);
                if (guideEditorText.trim() === '') {
                  delete newOverrides[currentOverrideKey];
                } else {
                  newOverrides[currentOverrideKey] = guideEditorText;
                }
                var userId = await storageService.getCurrentUserId();
                var result = await saveGuideOverrides(newOverrides, userId || '');
                if (result.success) {
                  setGuideOverrides(newOverrides);
                  setGuideEditorChanged(false);
                  setToast({ message: tGuide.saved || 'Saved.', type: 'success' });
                  // Audit log
                  try {
                    await supabase.from('admin_log').insert({
                      admin_id: userId,
                      action: 'guide_content_update',
                      target_user_id: null,
                      details: { key: currentOverrideKey, action: guideEditorText.trim() === '' ? 'removed' : 'updated' },
                    });
                  } catch (e) { /* ignore */ }
                } else {
                  setToast({ message: (tGuide.saveFailed || 'Failed: ') + ' ' + (result.message || ''), type: 'error' });
                }
              } catch (err: any) {
                setToast({ message: (tGuide.saveFailed || 'Failed: ') + ' ' + (err.message || ''), type: 'error' });
              } finally {
                setGuideEditorSaving(false);
              }
            };

            var handleGuideResetField = function() {
              setConfirmModal({
                isOpen: true,
                title: tGuide.resetField || 'Reset Field',
                message: tGuide.resetFieldConfirm || 'Reset this field to default?',
                onConfirm: async function() {
                  setConfirmModal(null);
                  var newOverrides = Object.assign({}, guideOverrides);
                  // Remove all properties for this step/field/language
                  GUIDE_PROPS.forEach(function(prop) {
                    var key = buildGuideOverrideKey(guideSelectedStep, guideSelectedField, guideSelectedLang, prop);
                    delete newOverrides[key];
                  });
                  var userId = await storageService.getCurrentUserId();
                  var result = await saveGuideOverrides(newOverrides, userId || '');
                  if (result.success) {
                    setGuideOverrides(newOverrides);
                    setGuideEditorText('');
                    setGuideEditorChanged(false);
                    setToast({ message: tGuide.resetDone || 'Reset.', type: 'success' });
                  }
                },
              });
            };

            var handleGuideResetAll = function() {
              setConfirmModal({
                isOpen: true,
                title: tGuide.resetAll || 'Reset All',
                message: tGuide.resetAllConfirm || 'Reset ALL guide content?',
                onConfirm: async function() {
                  setConfirmModal(null);
                  setGuideEditorSaving(true);
                  var userId = await storageService.getCurrentUserId();
                  var result = await saveGuideOverrides({}, userId || '');
                  if (result.success) {
                    setGuideOverrides({});
                    setGuideEditorText('');
                    setGuideEditorChanged(false);
                    setToast({ message: tGuide.resetDone || 'Reset.', type: 'success' });
                    try {
                      await supabase.from('admin_log').insert({
                        admin_id: userId,
                        action: 'guide_content_reset',
                        target_user_id: null,
                        details: { action: 'reset_all' },
                      });
                    } catch (e) { /* ignore */ }
                  } else {
                    setToast({ message: (tGuide.resetFailed || 'Failed: ') + ' ' + (result.message || ''), type: 'error' });
                  }
                  setGuideEditorSaving(false);
                },
              });
            };

            // Pretty field name
            var prettyFieldName = function(fieldKey: string): string {
              return fieldKey.replace(/([A-Z])/g, ' $1').replace(/^./, function(s) { return s.toUpperCase(); });
            };

            var prettyStepName = function(stepKey: string): string {
              var names: Record<string, string> = {
                problemAnalysis: language === 'si' ? 'Analiza problema' : 'Problem Analysis',
                projectIdea: language === 'si' ? 'Projektna ideja' : 'Project Idea',
                generalObjectives: language === 'si' ? 'Splo\u0161ni cilji' : 'General Objectives',
                specificObjectives: language === 'si' ? 'Specifi\u010Dni cilji' : 'Specific Objectives',
                activities: language === 'si' ? 'Aktivnosti' : 'Activities',
                expectedResults: language === 'si' ? 'Pri\u010Dakovani rezultati' : 'Expected Results',
              };
              return names[stepKey] || stepKey;
            };

            return (
              <div>
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' as const, gap: '12px' }}>
                    <div>
                      <h3 style={{ color: colors.text.heading, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, margin: '0 0 4px' }}>
                        {'\uD83D\uDCD6'} {tGuide.title || 'Guide Content Editor'}
                      </h3>
                      <p style={{ color: colors.text.muted, fontSize: typography.fontSize.sm, margin: 0 }}>{tGuide.subtitle || ''}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' as const }}>
                      {totalOverrides > 0 && (
                        <span style={{ padding: '4px 12px', borderRadius: radii.full, background: warningBadgeBg, border: '1px solid ' + warningBadgeBorder, color: warningBadgeText, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold }}>
                          {totalOverrides} {language === 'si' ? 'prilagoditev' : 'override(s)'}
                        </span>
                      )}
                                              <button onClick={function() {
                        // ═══ GUIDE EXPORT TXT — FULL CONTENT (FIXED) ═══
                        var lines = [];
                        lines.push('='.repeat(60));
                        lines.push('EURO-OFFICE GUIDE CONTENT — FULL EXPORT');
                        lines.push('Exported: ' + new Date().toISOString());
                        lines.push('Total overrides: ' + totalOverrides);
                        lines.push('='.repeat(60));
                        lines.push('');
                        var guideSteps = ['problemAnalysis', 'projectIdea', 'generalObjectives', 'specificObjectives', 'activities', 'expectedResults'];
                        var guideProperties = ['whatIsThis', 'whyImportant', 'whatToWrite', 'tips', 'euContext', 'example'];
                        var exportPropLabels = tGuide.properties || { whatIsThis: 'What is this?', whyImportant: 'Why important?', whatToWrite: 'What to write', tips: 'Tips', euContext: 'EU Context', example: 'Example' };
                        var langs = ['en', 'si'];
                        var allKeysExport = getAllGuideKeys();
                        langs.forEach(function(lang) {
                            lines.push('');
                            lines.push('#'.repeat(60));
                            lines.push('LANGUAGE: ' + lang.toUpperCase());
                            lines.push('#'.repeat(60));
                            guideSteps.forEach(function(stepKey) {
                                var fieldNames = [];
                                allKeysExport.forEach(function(item) {
                                    if (item.stepKey === stepKey && fieldNames.indexOf(item.fieldKey) < 0) {
                                        fieldNames.push(item.fieldKey);
                                    }
                                });
                                if (fieldNames.length === 0) return;
                                lines.push('');
                                lines.push('='.repeat(50));
                                lines.push('STEP: ' + prettyStepName(stepKey));
                                lines.push('='.repeat(50));
                                fieldNames.forEach(function(fieldKey) {
                                    var entry = getFieldGuide(stepKey, fieldKey, lang);
                                    if (!entry) return;
                                    lines.push('');
                                    lines.push('-'.repeat(40));
                                    lines.push('FIELD: ' + stepKey + '.' + fieldKey + ' [' + lang + ']');
                                    lines.push('-'.repeat(40));
                                    guideProperties.forEach(function(prop) {
                                        var val = entry[prop] || '';
                                        var overrideKey = buildGuideOverrideKey(stepKey, fieldKey, lang, prop);
                                        var isOverride = guideOverrides[overrideKey] && guideOverrides[overrideKey].trim() !== '';
                                        lines.push('');
                                        lines.push('  [' + (exportPropLabels[prop] || prop) + ']' + (isOverride ? ' ** CUSTOM OVERRIDE **' : ''));
                                        if (val) {
                                            lines.push('  ' + val.replace(/\n/g, '\n  '));
                                        } else {
                                            lines.push('  (empty)');
                                        }
                                    });
                                });
                            });
                        });
                        lines.push('');
                        lines.push('='.repeat(60));
                        lines.push('END OF GUIDE CONTENT');
                        lines.push('='.repeat(60));
                        var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
                        var url = URL.createObjectURL(blob);
                        var a = document.createElement('a');
                        a.href = url;
                        a.download = 'euro-office-guide-FULL-' + new Date().toISOString().split('T')[0] + '.txt';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                        style={{ fontSize: '11px', padding: '5px 10px', borderRadius: radii.md, border: '1px solid ' + colors.border.medium, background: colors.surface.card, color: colors.text.body, cursor: 'pointer' }}
                      >{'\u2193 '} TXT</button>

                                            <button onClick={function() {
                        // ═══ GUIDE EXPORT JSON — FULL CONTENT (FIXED) ═══
                        var guideStepsJson = ['problemAnalysis', 'projectIdea', 'generalObjectives', 'specificObjectives', 'activities', 'expectedResults'];
                        var guidePropsJson = ['whatIsThis', 'whyImportant', 'whatToWrite', 'tips', 'euContext', 'example'];
                        var langsJson = ['en', 'si'];
                        var allKeysJson = getAllGuideKeys();
                        var guideFullContent = {};
                        langsJson.forEach(function(lang) {
                            guideFullContent[lang] = {};
                            guideStepsJson.forEach(function(stepKey) {
                                var fieldNames = [];
                                allKeysJson.forEach(function(item) {
                                    if (item.stepKey === stepKey && fieldNames.indexOf(item.fieldKey) < 0) {
                                        fieldNames.push(item.fieldKey);
                                    }
                                });
                                if (fieldNames.length === 0) return;
                                guideFullContent[lang][stepKey] = {};
                                fieldNames.forEach(function(fieldKey) {
                                    var entry = getFieldGuide(stepKey, fieldKey, lang);
                                    if (!entry) return;
                                    guideFullContent[lang][stepKey][fieldKey] = {};
                                    guidePropsJson.forEach(function(prop) {
                                        var overrideKey = buildGuideOverrideKey(stepKey, fieldKey, lang, prop);
                                        var isOverride = guideOverrides[overrideKey] && guideOverrides[overrideKey].trim() !== '';
                                        guideFullContent[lang][stepKey][fieldKey][prop] = {
                                            value: entry[prop] || '',
                                            isOverride: isOverride
                                        };
                                    });
                                });
                            });
                        });
                        var exportData = {
                            _meta: { format: 'euro-office-guide-full', version: '1.0', exportedAt: new Date().toISOString(), exportedBy: storageService.getCurrentUser() || 'unknown', totalOverrides: totalOverrides, description: 'Full guide content with override flags. To re-import, use the overrides section below.' },
                            guide: guideFullContent,
                            overrides: guideOverrides
                        };
                        var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8' });
                        var url = URL.createObjectURL(blob);
                        var a = document.createElement('a');
                        a.href = url;
                        a.download = 'euro-office-guide-FULL-' + new Date().toISOString().split('T')[0] + '.json';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                        style={{ fontSize: '11px', padding: '5px 10px', borderRadius: radii.md, border: '1px solid ' + colors.border.medium, background: colors.surface.card, color: colors.text.body, cursor: 'pointer' }}
                      >{'\u2193 '} JSON</button>
                      <label style={{ fontSize: '11px', padding: '5px 10px', borderRadius: radii.md, border: '1px solid ' + colors.primary[400], background: colors.primary[600], color: '#fff', cursor: 'pointer', fontWeight: typography.fontWeight.bold, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        {'\u2191 '} {language === 'si' ? 'Uvoz' : 'Import'}
                        <input type="file" accept=".json" style={{ display: 'none' }} onChange={function(ev) {
                          var file = ev.target.files?.[0];
                          if (!file) return;
                          var reader = new FileReader();
                          reader.onload = function(e) {
                            try {
                              var parsed = JSON.parse(e.target?.result);
                              var newOverrides = parsed.overrides || parsed;
                              // Remove _meta if present at top level
                              if (newOverrides._meta) delete newOverrides._meta;
                              var overrideCount = Object.keys(newOverrides).filter(function(k) { return newOverrides[k] && newOverrides[k].trim && newOverrides[k].trim() !== ''; }).length;
                              if (overrideCount === 0 && Object.keys(newOverrides).length === 0) {
                                setToast({ message: language === 'si' ? 'Neveljavna JSON datoteka.' : 'Invalid JSON file.', type: 'error' });
                                ev.target.value = '';
                                return;
                              }
                              setConfirmModal({
                                isOpen: true,
                                title: language === 'si' ? 'Uvoz vsebine vodnika' : 'Import Guide Content',
                                message: (language === 'si'
                                  ? 'To bo PREPISALO vso vsebino vodnika!\n\nDatoteka: ' + file.name + '\nPrilagoditve: ' + overrideCount
                                  : 'This will OVERWRITE all guide content overrides!\n\nFile: ' + file.name + '\nOverrides: ' + overrideCount)
                                  + (language === 'si' ? '\n\nAli ste prepri\u010Dani?' : '\n\nAre you sure?'),
                                onConfirm: async function() {
                                  setConfirmModal(null);
                                  setGuideEditorSaving(true);
                                  var userId = await storageService.getCurrentUserId();
                                  var result = await saveGuideOverrides(newOverrides, userId || '');
                                  if (result.success) {
                                    setGuideOverrides(newOverrides);
                                    setGuideEditorChanged(false);
                                    setToast({ message: (language === 'si' ? 'Vsebina vodnika uvo\u017Eena! ' : 'Guide content imported! ') + overrideCount + (language === 'si' ? ' prilagoditev.' : ' overrides.'), type: 'success' });
                                    try {
                                      await supabase.from('admin_log').insert({
                                        admin_id: userId,
                                        action: 'guide_content_import',
                                        target_user_id: null,
                                        details: { fileName: file.name, overrideCount: overrideCount, importedAt: new Date().toISOString() },
                                      });
                                    } catch (logErr) { /* ignore */ }
                                  } else {
                                    setToast({ message: (language === 'si' ? 'Napaka pri uvozu: ' : 'Import failed: ') + (result.message || ''), type: 'error' });
                                  }
                                  setGuideEditorSaving(false);
                                },
                              });
                            } catch (parseErr) {
                              setToast({ message: language === 'si' ? 'Neveljavna JSON datoteka.' : 'Invalid JSON file.', type: 'error' });
                            }
                            ev.target.value = '';
                          };
                          reader.readAsText(file);
                        }} />
                      </label>
                      <button onClick={handleGuideResetAll} disabled={totalOverrides === 0 || guideEditorSaving}
                        style={{ fontSize: '11px', padding: '5px 12px', borderRadius: radii.md, border: '1px solid ' + dangerBtnBorder, background: dangerBtnBg, color: dangerBtnText, cursor: totalOverrides === 0 ? 'not-allowed' : 'pointer', opacity: totalOverrides === 0 ? 0.5 : 1 }}>
                        {'\uD83D\uDDD1\uFE0F'} {tGuide.resetAll || 'Reset All'}
                      </button>

                    </div>
                  </div>
                </div>

                {guideEditorLoading ? <SkeletonTable rows={4} cols={3} /> : (
                  <div style={{ display: 'flex', gap: '20px', minHeight: '500px' }}>
                    {/* LEFT: Step/Field navigation */}
                    <div style={{ width: '220px', flexShrink: 0, borderRight: '1px solid ' + colors.border.light, paddingRight: '12px', maxHeight: '600px', overflowY: 'auto' as const }}>
                      {stepKeysList.map(function(stepKey) {
                        var fields = stepGroups[stepKey];
                        var isStepSelected = guideSelectedStep === stepKey;
                        return (
                          <div key={stepKey} style={{ marginBottom: '8px' }}>
                            <div style={{ fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold, color: colors.text.heading, padding: '6px 8px', textTransform: 'uppercase' as const, letterSpacing: '0.5px', borderBottom: '1px solid ' + colors.border.light, marginBottom: '2px' }}>
                              {prettyStepName(stepKey)}
                            </div>
                            {fields.map(function(f) {
                              var isFieldSelected = isStepSelected && guideSelectedField === f.fieldKey;
                              // Check if any override exists for this field
                              var fieldHasOverride = GUIDE_PROPS.some(function(prop) {
                                var k1 = buildGuideOverrideKey(stepKey, f.fieldKey, 'en', prop);
                                var k2 = buildGuideOverrideKey(stepKey, f.fieldKey, 'si', prop);
                                return (guideOverrides[k1] && guideOverrides[k1].trim() !== '') || (guideOverrides[k2] && guideOverrides[k2].trim() !== '');
                              });
                              return (
                                <button key={f.fieldKey} onClick={function() { setGuideSelectedStep(stepKey); setGuideSelectedField(f.fieldKey); }}
                                  style={{
                                    display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px 6px 16px', marginBottom: '1px',
                                    borderRadius: radii.md, border: 'none', cursor: 'pointer',
                                    background: isFieldSelected ? primaryBadgeBg : 'transparent',
                                    color: isFieldSelected ? primaryBadgeText : colors.text.body,
                                    fontSize: typography.fontSize.xs,
                                    fontWeight: isFieldSelected ? typography.fontWeight.semibold : typography.fontWeight.normal,
                                  }}>
                                  {fieldHasOverride ? '\u270F\uFE0F ' : ''}{prettyFieldName(f.fieldKey)}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>

                    {/* RIGHT: Editor */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {!guideSelectedStep || !guideSelectedField ? (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: colors.text.muted }}>
                          {'\u2190'} {tGuide.selectStep || 'Select a step and field from the left panel'}
                        </div>
                      ) : (
                        <div>
                          {/* Header: selected path */}
                          <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: radii.lg, background: primaryBadgeBg, border: '1px solid ' + primaryBadgeBorder }}>
                            <div style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, color: primaryBadgeText }}>
                              {prettyStepName(guideSelectedStep)} {'\u203A'} {prettyFieldName(guideSelectedField)}
                            </div>
                            <div style={{ fontSize: typography.fontSize.xs, color: primaryBadgeText, opacity: 0.8, fontFamily: typography.fontFamily.mono, marginTop: '2px' }}>
                              {guideSelectedStep}.{guideSelectedField}
                            </div>
                          </div>

                          {/* Controls row: Language + Property selectors */}
                          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' as const }}>
                            <div>
                              <label style={{ display: 'block', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: colors.text.heading, marginBottom: '4px' }}>
                                {tGuide.language || 'Language'}
                              </label>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                {(['en', 'si'] as const).map(function(lang) {
                                  var isActive = guideSelectedLang === lang;
                                  return (
                                    <button key={lang} onClick={function() { setGuideSelectedLang(lang); }}
                                      style={{
                                        padding: '6px 14px', borderRadius: radii.md, cursor: 'pointer',
                                        border: isActive ? '2px solid ' + colors.primary[500] : '1px solid ' + colors.border.medium,
                                        background: isActive ? primaryBadgeBg : colors.surface.card,
                                        color: isActive ? primaryBadgeText : colors.text.body,
                                        fontSize: typography.fontSize.sm, fontWeight: isActive ? typography.fontWeight.bold : typography.fontWeight.medium,
                                      }}>
                                      {lang === 'en' ? '\uD83C\uDDEC\uD83C\uDDE7 EN' : '\uD83C\uDDF8\uD83C\uDDEE SI'}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div style={{ flex: 1, minWidth: '200px' }}>
                              <label style={{ display: 'block', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: colors.text.heading, marginBottom: '4px' }}>
                                {tGuide.property || 'Property'}
                              </label>
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' as const }}>
                                {GUIDE_PROPS.map(function(prop) {
                                  var isActive = guideSelectedProp === prop;
                                  var propKey = buildGuideOverrideKey(guideSelectedStep, guideSelectedField, guideSelectedLang, prop);
                                  var propHasOverride = guideOverrides[propKey] && guideOverrides[propKey].trim() !== '';
                                  return (
                                    <button key={prop} onClick={function() { setGuideSelectedProp(prop); }}
                                      style={{
                                        padding: '4px 10px', borderRadius: radii.md, cursor: 'pointer',
                                        border: isActive ? '2px solid ' + colors.primary[500] : '1px solid ' + colors.border.light,
                                        background: isActive ? primaryBadgeBg : (propHasOverride ? warningBadgeBg : 'transparent'),
                                        color: isActive ? primaryBadgeText : (propHasOverride ? warningBadgeText : colors.text.body),
                                        fontSize: typography.fontSize.xs,
                                        fontWeight: isActive ? typography.fontWeight.semibold : typography.fontWeight.normal,
                                      }}>
                                      {propHasOverride ? '\u270F\uFE0F ' : ''}{propLabels[prop] || prop}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {/* Status indicator */}
                          <div style={{ marginBottom: '8px', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: hasOverride ? warningBadgeText : successText }}>
                            {hasOverride ? ('\u270F\uFE0F ' + (tGuide.overrideActive || 'Custom override active')) : ('\u2705 ' + (tGuide.usingDefault || 'Using default content'))}
                          </div>

                          {/* Editor textarea */}
                          <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: colors.text.heading, marginBottom: '4px' }}>
                              {tGuide.currentValue || 'Custom override'} {guideEditorChanged ? ' \u2022' : ''}
                            </label>
                            <textarea
                              value={guideEditorText}
                              onChange={function(e) { setGuideEditorText(e.target.value); setGuideEditorChanged(true); }}
                              placeholder={defaultContent ? (language === 'si' ? 'Pu\u0161\u010Dite prazno za privzeto vsebino...' : 'Leave empty to use default content...') : ''}
                              style={{
                                width: '100%', minHeight: '180px', padding: '12px', border: '1px solid ' + (guideEditorChanged ? colors.primary[400] : colors.border.light),
                                borderRadius: radii.lg, fontSize: typography.fontSize.sm, color: colors.text.body, background: colors.surface.card,
                                fontFamily: typography.fontFamily.body, lineHeight: '1.6', resize: 'vertical' as const, outline: 'none',
                              }}
                            />
                          </div>

                          {/* Default content reference (collapsed) */}
                          {defaultContent && (
                            <CollapsibleSection title={(tGuide.defaultValue || 'Default value') + ' (' + (language === 'si' ? 'samo za branje' : 'read-only') + ')'} colors={colors}>
                              <div style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, lineHeight: '1.6', whiteSpace: 'pre-wrap' as const, maxHeight: '300px', overflowY: 'auto' as const, fontFamily: typography.fontFamily.body }}>
                                {defaultContent}
                              </div>
                            </CollapsibleSection>
                          )}

                          {/* Action buttons */}
                          <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' as const }}>
                            <button onClick={handleGuideSave} disabled={!guideEditorChanged || guideEditorSaving}
                              style={{
                                padding: '8px 20px', borderRadius: radii.lg, border: 'none',
                                background: guideEditorChanged ? colors.primary[600] : colors.border.light,
                                color: '#fff', cursor: guideEditorChanged ? 'pointer' : 'not-allowed',
                                fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold,
                                opacity: guideEditorChanged ? 1 : 0.5,
                              }}>
                              {guideEditorSaving ? '...' : (tGuide.save || 'Save')}
                            </button>
                            <button onClick={handleGuideResetField}
                              style={{
                                padding: '8px 20px', borderRadius: radii.lg,
                                border: '1px solid ' + colors.border.light,
                                background: colors.surface.card, color: colors.text.body, cursor: 'pointer',
                                fontSize: typography.fontSize.sm,
                              }}>
                              {tGuide.resetField || 'Reset Field'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ═══ KNOWLEDGE BASE TAB ═══ */}
          {activeTab === 'knowledge' && isUserAdmin && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ color: colors.text.heading, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, margin: 0 }}>{'\uD83D\uDCDA'} {t.knowledge.title}</h3>
                  <p style={{ color: colors.text.muted, fontSize: typography.fontSize.sm, margin: '4px 0 0' }}>{t.knowledge.subtitle}</p>
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ padding: '4px 12px', borderRadius: radii.full, background: primaryBadgeBg, border: `1px solid ${primaryBadgeBorder}`, color: primaryBadgeText, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold }}>
                    {kbDocuments.length}{isUserSuperAdmin ? ' (\u221E)' : ` / ${knowledgeBaseService.MAX_DOCS_PER_ORG}`} {t.knowledge.docCount}
                  </span>
                  <span style={{ padding: '4px 12px', borderRadius: radii.full, background: secondaryInfoBg, border: `1px solid ${secondaryInfoBorder}`, color: secondaryInfoText, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold }}>
                    {t.knowledge.maxSize}: {knowledgeBaseService.MAX_FILE_SIZE / 1024 / 1024} MB
                  </span>
                  <span style={{ padding: '4px 12px', borderRadius: radii.full, background: warningBadgeBg, border: `1px solid ${warningBadgeBorder}`, color: warningBadgeText, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold }}>
                    {t.knowledge.maxPages}: {knowledgeBaseService.MAX_PAGES_PER_DOC}
                  </span>
                </div>
              </div>
              <div style={{ padding: '12px 16px', borderRadius: radii.lg, marginBottom: '16px', background: secondaryInfoBg, border: `1px solid ${secondaryInfoBorder}`, color: secondaryInfoText, fontSize: typography.fontSize.sm, display: 'flex', alignItems: 'center', gap: '8px' }}>
                {'\uD83D\uDCA1'} {t.knowledge.info}
              </div>
              <div
                onDrop={handleKBDrop}
                onDragOver={(e) => { e.preventDefault(); setKbDragOver(true); }}
                onDragLeave={() => setKbDragOver(false)}
                onClick={() => document.getElementById('kb-file-input')?.click()}
                style={{ border: `2px dashed ${kbDragOver ? colors.primary[400] : colors.border.light}`, borderRadius: radii.xl, padding: '24px', textAlign: 'center', marginBottom: '20px', background: kbDragOver ? (isDark ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.05)') : 'transparent', transition: `all ${animation.duration.fast}`, cursor: 'pointer' }}
              >
                <input id="kb-file-input" type="file" multiple accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={(e) => { if (e.target.files && e.target.files.length > 0) { handleKBUpload(e.target.files); e.target.value = ''; } }} />
                {kbUploading ? (
                  <div style={{ color: colors.primary[600], fontWeight: typography.fontWeight.semibold, fontSize: typography.fontSize.sm }}>{'\u23F3'} {t.knowledge.uploading}</div>
                ) : (
                  <React.Fragment>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>{'\uD83D\uDCC4'}</div>
                    <div style={{ color: colors.text.body, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium }}>{t.knowledge.dragDrop}</div>
                    <div style={{ color: colors.text.muted, fontSize: typography.fontSize.xs, marginTop: '4px' }}>{t.knowledge.allowedTypes}</div>
                  </React.Fragment>
                )}
              </div>
              {kbLoading ? <SkeletonTable rows={3} cols={5} /> : kbDocuments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: colors.text.muted, fontSize: typography.fontSize.sm }}>{'\uD83D\uDCC2'} {t.knowledge.noDocuments}</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typography.fontSize.sm }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${colors.border.light}` }}>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.knowledge.fileName}</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.knowledge.fileType}</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.knowledge.fileSize}</th>
                        <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.knowledge.uploadedAt}</th>
                        <th style={{ textAlign: 'right', padding: '10px 12px', color: colors.text.muted, fontWeight: typography.fontWeight.semibold }}>{t.knowledge.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kbDocuments.map((doc) => {
                        const typeIcons: Record<string, string> = { pdf: '\uD83D\uDCD5', docx: '\uD83D\uDCD8', xlsx: '\uD83D\uDCD7', pptx: '\uD83D\uDCD9', jpg: '\uD83D\uDDBC\uFE0F', jpeg: '\uD83D\uDDBC\uFE0F', png: '\uD83D\uDDBC\uFE0F' };
                        const icon = typeIcons[doc.file_type] || '\uD83D\uDCC4';
                        const hasText = doc.extracted_text && doc.extracted_text.length > 50 && !doc.extracted_text.startsWith('[');
                        return (
                          <tr key={doc.id} style={{ borderBottom: `1px solid ${colors.border.light}`, background: rowDefaultBg }} onMouseEnter={(e) => { e.currentTarget.style.background = rowHoverBg; }} onMouseLeave={(e) => { e.currentTarget.style.background = rowDefaultBg; }}>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '18px' }}>{icon}</span>
                                <div>
                                  <div style={{ color: colors.text.body, fontWeight: typography.fontWeight.medium }}>{doc.file_name}</div>
                                  <div style={{ fontSize: typography.fontSize.xs, color: hasText ? (isDark ? '#6EE7B7' : lightColors.success[600]) : (isDark ? '#FDE68A' : lightColors.warning[600]) }}>
                                    {hasText ? (language === 'si' ? '\u2713 Besedilo ekstrahirano' : '\u2713 Text extracted') : (language === 'si' ? '\u26A0 Brez besedila' : '\u26A0 No text')}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '10px 12px' }}><span style={{ padding: '2px 8px', borderRadius: radii.full, background: primaryBadgeBg, border: `1px solid ${primaryBadgeBorder}`, color: primaryBadgeText, fontSize: typography.fontSize.xs, textTransform: 'uppercase' }}>{doc.file_type}</span></td>
                            <td style={{ padding: '10px 12px', color: colors.text.muted }}>{formatFileSize(doc.file_size)}</td>
                            <td style={{ padding: '10px 12px', color: colors.text.muted }}>{formatDate(doc.uploaded_at, true)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                              <button onClick={() => handleKBDelete(doc)} style={{ background: dangerBtnBg, border: `1px solid ${dangerBtnBorder}`, borderRadius: radii.lg, padding: '4px 10px', cursor: 'pointer', color: dangerBtnText, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'rgba(239,68,68,0.25)' : '#FEE2E2'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = dangerBtnBg; }}>
                                {'\uD83D\uDDD1\uFE0F'} {t.knowledge.delete}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        {/* ═══ CHANGELOG TAB ═══ ★ v4.6 */}
          {activeTab === 'changelog' && (() => {
            var adminVisibleTypes = isUserSuperAdmin
            ? null
            : ['FEAT'];
          var filteredGroups = changelogGroups.map(function(group) {
            var filtered = group.entries.filter(function(entry) {
              var matchRole = !adminVisibleTypes || adminVisibleTypes.indexOf(entry.type) >= 0;
              var matchType = !changelogTypeFilter || entry.type === changelogTypeFilter;
              var matchSearch = !changelogSearch || entry.title.toLowerCase().indexOf(changelogSearch.toLowerCase()) >= 0 || entry.description.toLowerCase().indexOf(changelogSearch.toLowerCase()) >= 0 || entry.code.toLowerCase().indexOf(changelogSearch.toLowerCase()) >= 0;
              return matchRole && matchType && matchSearch;
            });
            return { version: group.version, entries: filtered, latestDate: group.latestDate };
          }).filter(function(g) { return g.entries.length > 0; });

            var allTypes = isUserSuperAdmin
            ? ['FEAT', 'FIX', 'UI', 'PERF', 'REFACTOR', 'SECURITY', 'DB']
            : ['FEAT'];

            return (
              <div>
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ color: colors.text.heading, fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, margin: '0 0 4px' }}>
                    {'\uD83D\uDCCB'} {language === 'si' ? 'Zgodovina verzij' : 'Version History'}
                  </h3>
                    <p style={{ color: colors.text.muted, fontSize: typography.fontSize.sm, margin: 0 }}>
                    {language === 'si' ? 'Kronolo\u0161ki pregled vseh sprememb aplikacije' : 'Chronological overview of all application changes'}
                  </p>
                </div>
                {isUserSuperAdmin && changelogGroups.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={function() {
                      var lines = [];
                      lines.push('=' .repeat(60));
                      lines.push('EURO-OFFICE CHANGELOG');
                      lines.push('Exported: ' + new Date().toISOString());
                      lines.push('=' .repeat(60));
                      lines.push('');
                      changelogGroups.forEach(function(group) {
                        lines.push('');
                        lines.push('=' .repeat(40));
                        lines.push('VERSION ' + group.version + ' (' + formatDate(group.latestDate, true) + ')');
                        lines.push('=' .repeat(40));
                        group.entries.forEach(function(entry) {
                          lines.push('');
                          lines.push('  [' + entry.code + '] [' + entry.type + '] ' + entry.title);
                          if (entry.description) lines.push('  ' + entry.description);
                          if (entry.files_changed && entry.files_changed.length > 0) lines.push('  Files: ' + entry.files_changed.join(', '));
                          lines.push('  Date: ' + formatDate(entry.released_at, true));
                        });
                      });
                      var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
                      var url = URL.createObjectURL(blob);
                      var a = document.createElement('a');
                      a.href = url;
                      a.download = 'euro-office-changelog-' + new Date().toISOString().split('T')[0] + '.txt';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                      style={{ fontSize: '11px', padding: '5px 10px', borderRadius: radii.md, border: '1px solid ' + colors.border.medium, background: colors.surface.card, color: colors.text.body, cursor: 'pointer' }}
                    >{'\u2193 '} TXT</button>
                    <button onClick={function() {
                      var allEntries = [];
                      changelogGroups.forEach(function(g) {
                        g.entries.forEach(function(e) {
                          allEntries.push({ version: g.version, code: e.code, type: e.type, title: e.title, description: e.description || '', filesChanged: e.files_changed || [], releasedAt: e.released_at || '' });
                        });
                      });
                      var exportData = {
                        _meta: { format: 'euro-office-changelog', version: '1.0', exportedAt: new Date().toISOString(), exportedBy: storageService.getCurrentUser() || 'unknown', totalEntries: allEntries.length },
                        changelog: allEntries
                      };
                      var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8' });
                      var url = URL.createObjectURL(blob);
                      var a = document.createElement('a');
                      a.href = url;
                      a.download = 'euro-office-changelog-' + new Date().toISOString().split('T')[0] + '.json';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                      style={{ fontSize: '11px', padding: '5px 10px', borderRadius: radii.md, border: '1px solid ' + colors.border.medium, background: colors.surface.card, color: colors.text.body, cursor: 'pointer' }}
                    >{'\u2193 '} JSON</button>
                  </div>
                )}

                {/* Filters */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' as const, alignItems: 'center' }}>
                  <input type="text" value={changelogSearch} onChange={function(e) { setChangelogSearch(e.target.value); }}
                    placeholder={language === 'si' ? 'I\u0161\u010Di po \u0161ifri, naslovu ali opisu...' : 'Search by code, title or description...'}
                    style={{ flex: 1, minWidth: '200px', fontSize: typography.fontSize.sm, padding: '8px 12px', borderRadius: radii.lg, border: '1px solid ' + colors.border.light, background: colors.surface.card, color: colors.text.body, outline: 'none' }} />
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' as const }}>
                    <button onClick={function() { setChangelogTypeFilter(''); }}
                      style={{ padding: '5px 12px', borderRadius: radii.md, border: !changelogTypeFilter ? '2px solid ' + colors.primary[500] : '1px solid ' + colors.border.light, background: !changelogTypeFilter ? primaryBadgeBg : 'transparent', color: !changelogTypeFilter ? primaryBadgeText : colors.text.muted, cursor: 'pointer', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold }}>
                      {language === 'si' ? 'Vse' : 'All'}
                    </button>
                    {allTypes.map(function(type) {
                      var conf = TYPE_CONFIG[type] || { label: { en: type, si: type }, color: '#666', bgColor: '#f0f0f0', icon: '' };
                      var isActive = changelogTypeFilter === type;
                      return (
                        <button key={type} onClick={function() { setChangelogTypeFilter(isActive ? '' : type); }}
                          style={{ padding: '5px 10px', borderRadius: radii.md, border: isActive ? '2px solid ' + conf.color : '1px solid ' + colors.border.light, background: isActive ? (isDark ? conf.color + '20' : conf.bgColor) : 'transparent', color: isActive ? conf.color : colors.text.muted, cursor: 'pointer', fontSize: typography.fontSize.xs, fontWeight: isActive ? typography.fontWeight.bold : typography.fontWeight.medium }}>
                          {conf.icon} {conf.label[language] || conf.label.en}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {changelogLoading ? <SkeletonTable rows={5} cols={4} /> : filteredGroups.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: colors.text.muted }}>
                    {changelogSearch || changelogTypeFilter ? (language === 'si' ? 'Ni rezultatov za iskanje.' : 'No results found.') : (language === 'si' ? 'Ni vnosov v zgodovini.' : 'No changelog entries.')}
                  </div>
                ) : (
                  <div>
                    {filteredGroups.map(function(group) {
                      return (
                        <div key={group.version} style={{ marginBottom: '28px' }}>
                          {/* Version header */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid ' + colors.border.light }}>
                            <span style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.primary[600], fontFamily: typography.fontFamily.mono }}>
                              v{group.version}
                            </span>
                            <span style={{ fontSize: typography.fontSize.xs, color: colors.text.muted }}>
                              {formatDate(group.latestDate, true)}
                            </span>
                            <span style={{ padding: '2px 10px', borderRadius: radii.full, background: primaryBadgeBg, border: '1px solid ' + primaryBadgeBorder, color: primaryBadgeText, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold }}>
                              {group.entries.length} {language === 'si' ? 'sprememb' : 'changes'}
                            </span>
                          </div>

                          {/* Entries */}
                          {group.entries.map(function(entry) {
                            var conf = TYPE_CONFIG[entry.type] || { label: { en: entry.type, si: entry.type }, color: '#666', bgColor: '#f0f0f0', icon: '' };
                            return (
                              <div key={entry.id} style={{ display: 'flex', gap: '12px', padding: '12px 16px', marginBottom: '6px', borderRadius: radii.lg, border: '1px solid ' + colors.border.light, background: colors.surface.card, alignItems: 'flex-start' }}>
                                {/* Code badge */}
                                <div style={{ flexShrink: 0, minWidth: '70px' }}>
                                  <span style={{ fontFamily: typography.fontFamily.mono, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold, color: colors.primary[600] }}>
                                    {entry.code}
                                  </span>
                                </div>
                                {/* Type badge */}
                                <div style={{ flexShrink: 0 }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 10px', borderRadius: radii.full, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, background: isDark ? conf.color + '20' : conf.bgColor, color: conf.color, border: '1px solid ' + conf.color + '40' }}>
                                    {conf.icon} {conf.label[language] || conf.label.en}
                                  </span>
                                </div>
                                {/* Content */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: typography.fontWeight.semibold, color: colors.text.heading, fontSize: typography.fontSize.sm, marginBottom: '2px' }}>
                                    {entry.title}
                                  </div>
                                  {/* Uporabniški opis – prijazen, viden vsem */}
                                  {entry.user_description && (
                                    <div style={{ 
                                      color: colors.text.body, 
                                      fontSize: typography.fontSize.sm, 
                                      lineHeight: '1.6', 
                                      marginBottom: '6px',
                                      padding: '8px 12px',
                                      borderRadius: radii.md,
                                      background: isDark ? 'rgba(99,102,241,0.06)' : '#F8FAFC',
                                      border: '1px solid ' + (isDark ? 'rgba(99,102,241,0.12)' : '#E2E8F0'),
                                    }}>
                                      {entry.user_description}
                                    </div>
                                  )}
                                  {/* Tehnični opis – samo za SuperAdmin */}
                                  {isUserSuperAdmin && entry.description && (
                                    <div style={{ color: colors.text.muted, fontSize: typography.fontSize.xs, lineHeight: '1.5', marginBottom: '4px', fontFamily: typography.fontFamily.mono }}>
                                      {entry.description}
                                    </div>
                                  )}

                                  {entry.files_changed && entry.files_changed.length > 0 && (
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' as const, marginTop: '4px' }}>
                                      {entry.files_changed.map(function(file, idx) {
                                        return (
                                          <span key={idx} style={{ padding: '1px 6px', borderRadius: radii.sm, background: isDark ? 'rgba(99,102,241,0.1)' : '#F0F0FF', color: isDark ? '#A5B4FC' : '#4F46E5', fontSize: '10px', fontFamily: typography.fontFamily.mono }}>
                                            {file}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                                {/* Date */}
                                <div style={{ flexShrink: 0, fontSize: typography.fontSize.xs, color: colors.text.muted, whiteSpace: 'nowrap' as const }}>
                                  {formatDate(entry.released_at, true)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
