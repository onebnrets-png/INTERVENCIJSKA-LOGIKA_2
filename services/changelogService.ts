// services/changelogService.ts
// ═══════════════════════════════════════════════════════════════
// Changelog Service — reads/writes app version history from Supabase
// v1.0 — 2026-03-03 — Initial version
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabaseClient.ts';

// ─── TYPES ───────────────────────────────────────────────────

export interface ChangelogEntry {
  id: number;
  version: string;
  code: string;
  type: 'FEAT' | 'FIX' | 'UI' | 'PERF' | 'REFACTOR' | 'SECURITY' | 'DB';
  title: string;
  description: string;
  user_description: string;
  files_changed: string[];
  author: string;
  released_at: string;
  created_at: string;
}

export interface VersionGroup {
  version: string;
  entries: ChangelogEntry[];
  latestDate: string;
}

// ─── CACHE ───────────────────────────────────────────────────

var _cache: ChangelogEntry[] | null = null;
var _cacheTime: number = 0;
var CACHE_TTL = 5 * 60 * 1000; // 5 minutes

var _versionCache: string | null = null;
var _versionCacheTime: number = 0;

// ─── PUBLIC API ──────────────────────────────────────────────

export var changelogService = {

  // Fetch all changelog entries (cached)
  async getAll(): Promise<ChangelogEntry[]> {
    var now = Date.now();
    if (_cache && (now - _cacheTime) < CACHE_TTL) {
      return _cache;
    }

    var result = await supabase
      .from('app_changelog')
      .select('*')
      .order('released_at', { ascending: false });

    var data = result.data;
    var error = result.error;

    if (error) {
      console.error('[changelogService] Failed to load changelog:', error.message);
      return _cache || [];
    }

    _cache = (data || []) as ChangelogEntry[];
    _cacheTime = now;
    return _cache;
  },

  // Get entries grouped by version
  async getGroupedByVersion(): Promise<VersionGroup[]> {
    var entries = await this.getAll();
    var versionMap: Record<string, ChangelogEntry[]> = {};

    entries.forEach(function(entry) {
      if (!versionMap[entry.version]) {
        versionMap[entry.version] = [];
      }
      versionMap[entry.version].push(entry);
    });

    var groups: VersionGroup[] = Object.keys(versionMap).map(function(version) {
      var vEntries = versionMap[version];
      var latestDate = vEntries.reduce(function(latest, e) {
        return e.released_at > latest ? e.released_at : latest;
      }, '');
      return {
        version: version,
        entries: vEntries,
        latestDate: latestDate,
      };
    });

    // Sort versions descending (newest first)
    groups.sort(function(a, b) {
      return compareVersions(b.version, a.version);
    });

    return groups;
  },

  // Get entries filtered by type
  async getByType(type: string): Promise<ChangelogEntry[]> {
    var entries = await this.getAll();
    return entries.filter(function(e) { return e.type === type; });
  },

  // Search entries by title or description
  async search(query: string): Promise<ChangelogEntry[]> {
    var entries = await this.getAll();
    var q = query.toLowerCase().trim();
    if (!q) return entries;
    return entries.filter(function(e) {
      return e.title.toLowerCase().indexOf(q) >= 0
        || e.description.toLowerCase().indexOf(q) >= 0
        || (e.user_description || '').toLowerCase().indexOf(q) >= 0
        || e.code.toLowerCase().indexOf(q) >= 0;
    });
  },

  // Get current app version from global_settings
  async getCurrentVersion(): Promise<string> {
    var now = Date.now();
    if (_versionCache && (now - _versionCacheTime) < CACHE_TTL) {
      return _versionCache;
    }

    var result = await supabase
      .from('global_settings')
      .select('app_version')
      .eq('id', 'global')
      .single();

    var data = result.data;
    var error = result.error;

    if (error || !data || !data.app_version) {
      console.warn('[changelogService] Failed to load app version:', error ? error.message : 'no data');
      return _versionCache || '1.0.0';
    }

    _versionCache = data.app_version;
    _versionCacheTime = now;
    return _versionCache;
  },

  // Add a new changelog entry (superadmin only)
  async addEntry(entry: {
    version: string;
    code: string;
    type: string;
    title: string;
    description?: string;
    files_changed?: string[];
    author?: string;
    released_at?: string;
  }): Promise<{ success: boolean; error?: string }> {
    var result = await supabase
      .from('app_changelog')
      .insert({
        version: entry.version,
        code: entry.code,
        type: entry.type,
        title: entry.title,
        description: entry.description || '',
        files_changed: entry.files_changed || [],
        author: entry.author || 'Beno Stern',
        released_at: entry.released_at || new Date().toISOString(),
      });

    var error = result.error;

    if (error) {
      console.error('[changelogService] Failed to add entry:', error.message);
      return { success: false, error: error.message };
    }

    // Invalidate cache
    _cache = null;
    _cacheTime = 0;
    return { success: true };
  },

  // Update app version in global_settings (superadmin only)
  async setCurrentVersion(version: string): Promise<{ success: boolean; error?: string }> {
    var result = await supabase
      .from('global_settings')
      .update({ app_version: version })
      .eq('id', 'global');

    var error = result.error;

    if (error) {
      console.error('[changelogService] Failed to update version:', error.message);
      return { success: false, error: error.message };
    }

    _versionCache = version;
    _versionCacheTime = Date.now();
    return { success: true };
  },

  // Delete a changelog entry (superadmin only)
  async deleteEntry(id: number): Promise<{ success: boolean; error?: string }> {
    var result = await supabase
      .from('app_changelog')
      .delete()
      .eq('id', id);

    var error = result.error;

    if (error) {
      console.error('[changelogService] Failed to delete entry:', error.message);
      return { success: false, error: error.message };
    }

    _cache = null;
    _cacheTime = 0;
    return { success: true };
  },

  // Invalidate all caches
  invalidateCache: function() {
    _cache = null;
    _cacheTime = 0;
    _versionCache = null;
    _versionCacheTime = 0;
  },

  // Get next EO code
  async getNextCode(): Promise<string> {
    var entries = await this.getAll();
    var maxNum = 0;
    entries.forEach(function(e) {
      var match = e.code.match(/^EO-(\d+)$/);
      if (match) {
        var num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    var next = maxNum + 1;
    var padded = next.toString();
    while (padded.length < 3) padded = '0' + padded;
    return 'EO-' + padded;
  },
};

// ─── HELPERS ─────────────────────────────────────────────────

function compareVersions(a: string, b: string): number {
  var partsA = a.split('.').map(Number);
  var partsB = b.split('.').map(Number);
  for (var i = 0; i < 3; i++) {
    var va = partsA[i] || 0;
    var vb = partsB[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

// ─── TYPE LABELS & COLORS ────────────────────────────────────

export var TYPE_CONFIG: Record<string, { label: { en: string; si: string }; color: string; bgColor: string; icon: string }> = {
  FEAT: {
    label: { en: 'Feature', si: 'Funkcionalnost' },
    color: '#059669',
    bgColor: '#ECFDF5',
    icon: '\u2728',
  },
  FIX: {
    label: { en: 'Fix', si: 'Popravek' },
    color: '#DC2626',
    bgColor: '#FEF2F2',
    icon: '\uD83D\uDEE0\uFE0F',
  },
  UI: {
    label: { en: 'UI/UX', si: 'Vmesnik' },
    color: '#7C3AED',
    bgColor: '#F5F3FF',
    icon: '\uD83C\uDFA8',
  },
  PERF: {
    label: { en: 'Performance', si: 'Zmogljivost' },
    color: '#D97706',
    bgColor: '#FFFBEB',
    icon: '\u26A1',
  },
  REFACTOR: {
    label: { en: 'Refactor', si: 'Refaktor' },
    color: '#2563EB',
    bgColor: '#EFF6FF',
    icon: '\uD83D\uDD27',
  },
  SECURITY: {
    label: { en: 'Security', si: 'Varnost' },
    color: '#BE185D',
    bgColor: '#FDF2F8',
    icon: '\uD83D\uDD12',
  },
  DB: {
    label: { en: 'Database', si: 'Baza' },
    color: '#0891B2',
    bgColor: '#ECFEFF',
    icon: '\uD83D\uDDC4\uFE0F',
  },
};
