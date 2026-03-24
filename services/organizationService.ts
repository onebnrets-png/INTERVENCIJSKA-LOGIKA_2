// services/organizationService.ts
// ═══════════════════════════════════════════════════════════════
// Organization Service — Multi-Tenant organization management
// v1.4 — 2026-03-01
//
// CHANGES:
//   ★ v1.4: normalizeOrgName() — case-insensitive + legal-suffix normalization
//           createOrg() — deduplication check before insert
//           findSimilarOrgs() — fuzzy search for AuthScreen suggestions
//           mergeOrganizations() — SuperAdmin merge tool
//   ★ v1.3: getOrgMembers() — separate queries instead of embedded JOIN
//           — fixes RLS issue where profiles JOIN returns null
//           — also fetches first_name, last_name from profiles
//   ★ v1.2: createOrg() — slug is now optional (auto-generated from name)
//           — return now includes orgId for convenience
//   v1.1: Complete implementation of all service methods
//
// ARCHITECTURE:
//   - Manages organizations, members, and org-level instructions
//   - Provides organization switching (active_organization_id)
//   - Caches active org data in memory
//   - Used by useOrganization hook and storageService
//
// TABLES:
//   - organizations
//   - organization_members
//   - organization_instructions
//   - profiles.active_organization_id
//   - projects.organization_id
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabaseClient.ts';

// ─── Types ───────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  orgRole: 'member' | 'admin' | 'owner';
  joinedAt: string;
  email?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
}

export interface OrganizationInstructions {
  instructions: Record<string, string> | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export type OrgRole = 'member' | 'admin' | 'owner';

// ─── Cache ───────────────────────────────────────────────────

let cachedActiveOrg: Organization | null = null;
let cachedUserOrgs: Organization[] | null = null;
let cachedOrgInstructions: Record<string, string> | null = null;
let cachedOrgInstructionsOrgId: string | null = null;

// ─── Helpers ─────────────────────────────────────────────────

async function getAuthUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

function mapOrg(row: any): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[čćž]/g, (c) => ({ 'č': 'c', 'ć': 'c', 'ž': 'z' }[c] || c))
    .replace(/[šđ]/g, (c) => ({ 'š': 's', 'đ': 'd' }[c] || c))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    + '-' + Date.now().toString(36);
}

// ─── Organization Name Normalization ─────────────────────

// Legal suffixes: map all variants to a canonical form
const LEGAL_SUFFIX_MAP: Record<string, string> = {
  // Slovenian
  'doo': 'd.o.o.', 'd.o.o': 'd.o.o.', 'd.o.o.': 'd.o.o.',
  'd. o. o.': 'd.o.o.', 'd . o . o .': 'd.o.o.',
  'sp': 's.p.', 's.p': 's.p.', 's.p.': 's.p.',
  'zoo': 'z.o.o.', 'z.o.o': 'z.o.o.', 'z.o.o.': 'z.o.o.',
  'z. o. o.': 'z.o.o.',
  'kd': 'k.d.', 'k.d': 'k.d.', 'k.d.': 'k.d.',
  'dd': 'd.d.', 'd.d': 'd.d.', 'd.d.': 'd.d.',
  // German
  'gmbh': 'GmbH', 'g.m.b.h.': 'GmbH', 'g.m.b.h': 'GmbH',
  'eu': 'e.U.', 'e.u.': 'e.U.', 'e.u': 'e.U.',
  'ag': 'AG', 'a.g.': 'AG',
  'kg': 'KG', 'k.g.': 'KG',
  'ohg': 'OHG', 'o.h.g.': 'OHG',
  // English / International
  'ltd': 'Ltd.', 'ltd.': 'Ltd.',
  'llc': 'LLC', 'l.l.c.': 'LLC',
  'inc': 'Inc.', 'inc.': 'Inc.',
  'plc': 'PLC', 'p.l.c.': 'PLC',
  'corp': 'Corp.', 'corp.': 'Corp.',
  // Croatian / Serbian
  'jdoo': 'j.d.o.o.', 'j.d.o.o.': 'j.d.o.o.',
};

/**
 * Normalize an organization name for comparison purposes.
 * - lowercase
 * - replace Slovenian/Croatian diacritics
 * - normalize legal suffixes
 * - collapse whitespace
 * - trim
 *
 * Returns a "comparison key" — NOT a display name.
 */
export function normalizeOrgName(name: string): string {
  let n = name.trim().toLowerCase();

  // Replace diacritics
  n = n.replace(/[čć]/g, 'c')
       .replace(/ž/g, 'z')
       .replace(/š/g, 's')
       .replace(/đ/g, 'd');

  // Collapse all whitespace + dots around letters to find legal suffix
  // e.g., "d. o. o." → "d.o.o." ; "d o o" → "doo"
  // Strategy: try to match known suffixes at end of string

  // Remove trailing dots and whitespace for matching
  const cleaned = n.replace(/\s+/g, ' ').trim();

  // Try to extract a legal suffix from the end
  // We check progressively longer tail strings
  let bestSuffix = '';
  let bestSuffixNorm = '';
  let bestLen = 0;

  // Generate possible tail substrings (up to 15 chars from the end)
  const tail = cleaned.slice(-15);
  for (const [variant, canonical] of Object.entries(LEGAL_SUFFIX_MAP)) {
    // Check if the cleaned string ends with this variant
    // Allowing for flexible whitespace/dots
    const variantRegex = variant
      .replace(/\./g, '\\.?\\s*')
      .replace(/\s+/g, '\\s*');
    const regex = new RegExp('[\\s,\\-]*' + variantRegex + '[\\s.]*$', 'i');
    const match = cleaned.match(regex);
    if (match && match[0].length > bestLen) {
      bestLen = match[0].length;
      bestSuffix = match[0];
      bestSuffixNorm = canonical;
    }
  }

  let coreName = cleaned;
  if (bestSuffix && bestSuffixNorm) {
    coreName = cleaned.slice(0, cleaned.length - bestSuffix.length).trim();
    // Remove trailing comma, dash, space
    coreName = coreName.replace(/[\s,\-]+$/, '');
  }

  // Final normalization of core name
  const normalizedCore = coreName
    .replace(/\s+/g, ' ')
    .trim();

  // Return normalized key: "corename|suffix"
  return bestSuffixNorm
    ? `${normalizedCore}|${bestSuffixNorm.toLowerCase()}`
    : normalizedCore;
}

/**
 * Find existing organizations whose normalized name matches or is similar
 * to the given input. Used for fuzzy-match suggestions in AuthScreen.
 *
 * @param input - The user-typed org name
 * @param limit - Max number of suggestions (default: 5)
 * @returns Array of matching organizations (id + name)
 */
async function findSimilarOrgsInternal(input: string): Promise<Array<{ id: string; name: string; normalized: string }>> {
  const inputNorm = normalizeOrgName(input);
  if (!inputNorm || inputNorm.length < 2) return [];

  // Fetch all orgs (for small-to-medium deployments this is fine;
  // for large scale, use a DB function with trigram search)
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name')
    .order('name');

  if (error || !data) return [];

  const results: Array<{ id: string; name: string; normalized: string; score: number }> = [];

  const inputCore = inputNorm.split('|')[0] || inputNorm;

  for (const org of data) {
    const orgNorm = normalizeOrgName(org.name);
    const orgCore = orgNorm.split('|')[0] || orgNorm;

    // Exact normalized match
    if (orgNorm === inputNorm) {
      results.push({ id: org.id, name: org.name, normalized: orgNorm, score: 100 });
      continue;
    }

    // Core name match (ignoring suffix differences)
    if (orgCore === inputCore) {
      results.push({ id: org.id, name: org.name, normalized: orgNorm, score: 90 });
      continue;
    }

    // "Starts with" match
    if (orgCore.startsWith(inputCore) || inputCore.startsWith(orgCore)) {
      const lenRatio = Math.min(orgCore.length, inputCore.length) / Math.max(orgCore.length, inputCore.length);
      if (lenRatio > 0.6) {
        results.push({ id: org.id, name: org.name, normalized: orgNorm, score: 70 });
        continue;
      }
    }

    // Simple Levenshtein-like: check if edit distance is small
    if (orgCore.length > 3 && inputCore.length > 3) {
      const dist = levenshteinDistance(orgCore, inputCore);
      const maxLen = Math.max(orgCore.length, inputCore.length);
      const similarity = 1 - (dist / maxLen);
      if (similarity > 0.7) {
        results.push({ id: org.id, name: org.name, normalized: orgNorm, score: Math.round(similarity * 80) });
      }
    }
  }

  // Sort by score descending, return top 5
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 5);
}

/**
 * Simple Levenshtein distance implementation.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

// ─── Public API ──────────────────────────────────────────────

export const organizationService = {

  // ═══════════════════════════════════════════════════════════
  // ACTIVE ORGANIZATION
  // ═══════════════════════════════════════════════════════════

  getActiveOrg(): Organization | null {
    return cachedActiveOrg;
  },

  getActiveOrgId(): string | null {
    return cachedActiveOrg?.id || null;
  },

  getActiveOrgName(): string {
    return cachedActiveOrg?.name || 'No Organization';
  },

  async loadActiveOrg(): Promise<Organization | null> {
    const userId = await getAuthUserId();
    if (!userId) return null;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('active_organization_id')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.active_organization_id) {
      cachedActiveOrg = null;
      return null;
    }

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', profile.active_organization_id)
      .single();

    if (orgError || !org) {
      cachedActiveOrg = null;
      return null;
    }

    cachedActiveOrg = mapOrg(org);
    return cachedActiveOrg;
  },

  async switchOrg(orgId: string): Promise<{ success: boolean; message?: string }> {
    const userId = await getAuthUserId();
    if (!userId) return { success: false, message: 'Not authenticated' };

    const { data: membership, error: memError } = await supabase
      .from('organization_members')
      .select('id')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .single();

    if (memError || !membership) {
      return { success: false, message: 'You are not a member of this organization' };
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ active_organization_id: orgId })
      .eq('id', userId);

    if (updateError) {
      console.error('[OrgService] Failed to switch org:', updateError.message);
      return { success: false, message: updateError.message };
    }

    await this.loadActiveOrg();

    cachedOrgInstructions = null;
    cachedOrgInstructionsOrgId = null;

    console.log(`[OrgService] Switched to org: ${cachedActiveOrg?.name || orgId}`);
    return { success: true };
  },

  // ═══════════════════════════════════════════════════════════
  // USER'S ORGANIZATIONS
  // ═══════════════════════════════════════════════════════════

  async getUserOrgs(): Promise<Organization[]> {
    const userId = await getAuthUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from('organization_members')
      .select('organization_id, organizations(*)')
      .eq('user_id', userId);

    if (error || !data) {
      console.warn('[OrgService] Failed to load user orgs:', error?.message);
      return [];
    }

    cachedUserOrgs = data
      .map((row: any) => row.organizations)
      .filter(Boolean)
      .map(mapOrg);

    return cachedUserOrgs;
  },

  async getUserOrgRole(orgId: string): Promise<OrgRole | null> {
    const userId = await getAuthUserId();
    if (!userId) return null;

    const { data, error } = await supabase
      .from('organization_members')
      .select('org_role')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .single();

    if (error || !data) return null;
    return data.org_role as OrgRole;
  },

  // ═══════════════════════════════════════════════════════════
  // ORGANIZATION CRUD
  // ═══════════════════════════════════════════════════════════

    /**
   * ★ v1.4: Deduplication — before creating a new organization,
   * check if a normalized-match already exists. If yes, add user
   * as member of existing org instead of creating a duplicate.
   *
   * @param name       - Display name entered by user
   * @param slug       - Optional slug
   * @param forceNew   - If true, skip dedup check (for admin use)
   * @returns success + orgId + org + existingMatch flag
   */
  async createOrg(
    name: string,
    slug?: string,
    forceNew?: boolean
  ): Promise<{
    success: boolean;
    orgId?: string;
    org?: Organization;
    message?: string;
    existingMatch?: boolean;
  }> {
    const userId = await getAuthUserId();
    if (!userId) return { success: false, message: 'Not authenticated' };

    // ── Deduplication check ──────────────────────────────
    if (!forceNew) {
      const inputNorm = normalizeOrgName(name);

      const { data: allOrgs, error: allOrgsError } = await supabase
        .from('organizations')
        .select('id, name');

      if (!allOrgsError && allOrgs) {
        for (const existing of allOrgs) {
          const existingNorm = normalizeOrgName(existing.name);
          if (existingNorm === inputNorm) {
            // Exact normalized match found — add user as member
            console.log(`[OrgService] createOrg: Dedup match found! "${name}" ≈ "${existing.name}" (id: ${existing.id})`);

            // Check if already a member
            const { data: membership } = await supabase
              .from('organization_members')
              .select('id')
              .eq('organization_id', existing.id)
              .eq('user_id', userId)
              .single();

            if (!membership) {
              const { error: joinError } = await supabase
                .from('organization_members')
                .insert({ organization_id: existing.id, user_id: userId, org_role: 'member' });

              if (joinError) {
                console.warn('[OrgService] createOrg: Failed to add member to existing org:', joinError.message);
              }
            }

            // Set as active org
            await supabase
              .from('profiles')
              .update({ active_organization_id: existing.id })
              .eq('id', userId);

            const org = mapOrg(existing);
            cachedUserOrgs = null;
            return { success: true, orgId: existing.id, org, existingMatch: true };
          }
        }
      }
    }

    // ── No match found — create new org ──────────────────
    const finalSlug = slug?.trim() || generateSlug(name);

    const { data, error } = await supabase
      .from('organizations')
      .insert({ name, slug: finalSlug, created_by: userId })
      .select()
      .single();

    if (error) {
      return { success: false, message: error.message };
    }

    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({ organization_id: data.id, user_id: userId, org_role: 'owner' });

    if (memberError) {
      console.warn('[OrgService] createOrg: Failed to add owner membership:', memberError.message);
    }

    await supabase
      .from('organization_instructions')
      .insert({ organization_id: data.id, instructions: null, updated_by: userId });

    const org = mapOrg(data);
    cachedUserOrgs = null;
    return { success: true, orgId: data.id, org, existingMatch: false };
  },

  async updateOrg(orgId: string, updates: { name?: string; slug?: string; logo_url?: string | null }): Promise<{ success: boolean; message?: string }> {
    const { error } = await supabase
      .from('organizations')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', orgId);

    if (error) return { success: false, message: error.message };

    if (cachedActiveOrg?.id === orgId) {
      await this.loadActiveOrg();
    }
    cachedUserOrgs = null;
    return { success: true };
  },

  async deleteOrg(orgId: string): Promise<{ success: boolean; message?: string }> {
    const { error } = await supabase
      .from('organizations')
      .delete()
      .eq('id', orgId);

    if (error) return { success: false, message: error.message };

    if (cachedActiveOrg?.id === orgId) {
      cachedActiveOrg = null;
    }
    cachedUserOrgs = null;
    return { success: true };
  },

  async getAllOrgs(): Promise<Organization[]> {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .order('name');

    if (error || !data) return [];
    return data.map(mapOrg);
  },

  // ═══════════════════════════════════════════════════════════
  // MEMBER MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  /**
   * ★ v1.3: Two separate queries instead of embedded JOIN.
   * This avoids RLS issues where the PostgREST embedded query
   * on profiles returns null because RLS blocks cross-user reads.
   */
  async getOrgMembers(orgId: string): Promise<OrganizationMember[]> {
    // Step 1: Get member rows (organization_members only)
    const { data: memberRows, error: memberError } = await supabase
      .from('organization_members')
      .select('id, organization_id, user_id, org_role, joined_at')
      .eq('organization_id', orgId)
      .order('joined_at');

    if (memberError || !memberRows || memberRows.length === 0) {
      console.warn('[OrgService] getOrgMembers: No members found or error:', memberError?.message);
      return [];
    }

    // Step 2: Get profiles for all member user IDs
    const userIds = memberRows.map((r: any) => r.user_id);

    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, display_name, first_name, last_name, role')
      .in('id', userIds);

    if (profileError) {
      console.warn('[OrgService] getOrgMembers: Profiles query failed:', profileError.message);
    }

    // Step 3: Build profile lookup map
    const profileMap = new Map<string, any>();
    if (profileRows) {
      for (const p of profileRows) {
        profileMap.set(p.id, p);
      }
    }

    // Step 4: Merge members + profiles
    return memberRows.map((row: any) => {
      const profile = profileMap.get(row.user_id);
      const firstName = profile?.first_name || '';
      const lastName = profile?.last_name || '';
      const displayName = profile?.display_name
        || (firstName && lastName ? `${firstName} ${lastName}` : '')
        || profile?.email?.split('@')[0]
        || 'Unknown';

      return {
        id: row.id,
        organizationId: row.organization_id,
        userId: row.user_id,
        orgRole: row.org_role as OrgRole,
        joinedAt: row.joined_at,
        email: profile?.email || '',
        displayName,
        firstName,
        lastName,
      };
    });
  },

  async addMember(orgId: string, userEmail: string, role: OrgRole = 'member'): Promise<{ success: boolean; message?: string }> {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', userEmail)
      .single();

    if (profileError || !profile) {
      return { success: false, message: 'User not found with this email' };
    }

    const { data: existing } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', orgId)
      .eq('user_id', profile.id)
      .single();

    if (existing) {
      return { success: false, message: 'User is already a member of this organization' };
    }

    const { error } = await supabase
      .from('organization_members')
      .insert({ organization_id: orgId, user_id: profile.id, org_role: role });

    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  async updateMemberRole(orgId: string, userId: string, newRole: OrgRole): Promise<{ success: boolean; message?: string }> {
    const { error } = await supabase
      .from('organization_members')
      .update({ org_role: newRole })
      .eq('organization_id', orgId)
      .eq('user_id', userId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  async removeMember(orgId: string, userId: string): Promise<{ success: boolean; message?: string }> {
    const { error } = await supabase
      .from('organization_members')
      .delete()
      .eq('organization_id', orgId)
      .eq('user_id', userId);

    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  // ═══════════════════════════════════════════════════════════
  // ORGANIZATION INSTRUCTIONS
  // ═══════════════════════════════════════════════════════════

  async getOrgInstructions(orgId: string): Promise<OrganizationInstructions | null> {
    const { data, error } = await supabase
      .from('organization_instructions')
      .select('*')
      .eq('organization_id', orgId)
      .single();

    if (error || !data) return null;

    return {
      instructions: data.instructions || null,
      updatedAt: data.updated_at || null,
      updatedBy: data.updated_by || null,
    };
  },

  async getActiveOrgInstructions(): Promise<Record<string, string> | null> {
    const orgId = cachedActiveOrg?.id;
    if (!orgId) return null;

    if (cachedOrgInstructionsOrgId === orgId && cachedOrgInstructions !== undefined) {
      return cachedOrgInstructions;
    }

    const result = await this.getOrgInstructions(orgId);
    cachedOrgInstructions = result?.instructions || null;
    cachedOrgInstructionsOrgId = orgId;
    return cachedOrgInstructions;
  },

  getActiveOrgInstructionsSync(): Record<string, string> | null {
    if (cachedOrgInstructionsOrgId === cachedActiveOrg?.id) {
      return cachedOrgInstructions;
    }
    return null;
  },

  async saveOrgInstructions(orgId: string, instructions: Record<string, string>): Promise<{ success: boolean; message?: string }> {
    const userId = await getAuthUserId();

    const { error } = await supabase
      .from('organization_instructions')
      .upsert(
        {
          organization_id: orgId,
          instructions,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        },
        { onConflict: 'organization_id' }
      );

    if (error) return { success: false, message: error.message };

    if (cachedActiveOrg?.id === orgId) {
      cachedOrgInstructions = instructions;
      cachedOrgInstructionsOrgId = orgId;
    }

    return { success: true };
  },

  async resetOrgInstructions(orgId: string): Promise<{ success: boolean; message?: string }> {
    const userId = await getAuthUserId();

    const { error } = await supabase
      .from('organization_instructions')
      .upsert(
        {
          organization_id: orgId,
          instructions: null,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        },
        { onConflict: 'organization_id' }
      );

    if (error) return { success: false, message: error.message };

    if (cachedActiveOrg?.id === orgId) {
      cachedOrgInstructions = null;
      cachedOrgInstructionsOrgId = orgId;
    }

    return { success: true };
  },

  // ═══════════════════════════════════════════════════════════
  // CACHE MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  invalidateOrgInstructionsCache(): void {
    cachedOrgInstructions = null;
    cachedOrgInstructionsOrgId = null;
  },

    clearCache(): void {
    cachedActiveOrg = null;
    cachedUserOrgs = null;
    cachedOrgInstructions = null;
    cachedOrgInstructionsOrgId = null;
  },

  // ═══════════════════════════════════════════════════════════
  // DEDUPLICATION & FUZZY SEARCH
  // ═══════════════════════════════════════════════════════════

  /**
   * ★ v1.4: Public API for fuzzy org search (used by AuthScreen).
   * Returns suggestions of existing organizations that match the input.
   */
  async findSimilarOrgs(input: string): Promise<Array<{ id: string; name: string }>> {
    const results = await findSimilarOrgsInternal(input);
    return results.map(r => ({ id: r.id, name: r.name }));
  },

  /**
   * ★ v1.4: Merge two organizations (SuperAdmin only).
   * Moves all members, projects, and instructions from sourceOrg to targetOrg,
   * then deletes the source organization.
   *
   * @param sourceOrgId - The duplicate org to be merged away
   * @param targetOrgId - The canonical org to keep
   */
  async mergeOrganizations(
    sourceOrgId: string,
    targetOrgId: string
  ): Promise<{ success: boolean; message?: string; movedMembers: number; movedProjects: number }> {
    let movedMembers = 0;
    let movedProjects = 0;

    try {
      // 1. Get all members of source org
      const { data: sourceMembers, error: memError } = await supabase
        .from('organization_members')
        .select('user_id, org_role')
        .eq('organization_id', sourceOrgId);

      if (memError) throw new Error(`Failed to fetch source members: ${memError.message}`);

      // 2. Move members to target org (skip if already a member)
      for (const member of (sourceMembers || [])) {
        const { data: existing } = await supabase
          .from('organization_members')
          .select('id')
          .eq('organization_id', targetOrgId)
          .eq('user_id', member.user_id)
          .single();

        if (!existing) {
          await supabase
            .from('organization_members')
            .insert({
              organization_id: targetOrgId,
              user_id: member.user_id,
              org_role: member.org_role === 'owner' ? 'admin' : member.org_role,
            });
          movedMembers++;
        }

        // Update active_organization_id for these users
        await supabase
          .from('profiles')
          .update({ active_organization_id: targetOrgId })
          .eq('id', member.user_id)
          .eq('active_organization_id', sourceOrgId);
      }

      // 3. Move projects
      const { data: projects, error: projError } = await supabase
        .from('projects')
        .select('id')
        .eq('organization_id', sourceOrgId);

      if (!projError && projects) {
        for (const proj of projects) {
          await supabase
            .from('projects')
            .update({ organization_id: targetOrgId })
            .eq('id', proj.id);
          movedProjects++;
        }
      }

      // 4. Remove source org members
      await supabase
        .from('organization_members')
        .delete()
        .eq('organization_id', sourceOrgId);

      // 5. Remove source org instructions
      await supabase
        .from('organization_instructions')
        .delete()
        .eq('organization_id', sourceOrgId);

      // 6. Delete source organization
      await supabase
        .from('organizations')
        .delete()
        .eq('id', sourceOrgId);

      cachedUserOrgs = null;
      console.log(`[OrgService] Merged org ${sourceOrgId} → ${targetOrgId}: ${movedMembers} members, ${movedProjects} projects`);

      return { success: true, movedMembers, movedProjects };
    } catch (err: any) {
      console.error('[OrgService] mergeOrganizations failed:', err);
      return { success: false, message: err.message, movedMembers, movedProjects };
    }
  },

  /**
   * ★ v1.4: Normalize org name — public wrapper for external use.
   */
  normalizeOrgName(name: string): string {
    return normalizeOrgName(name);
  },
};

