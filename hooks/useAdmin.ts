// hooks/useAdmin.ts
// ═══════════════════════════════════════════════════════════════
// Admin hook — user management, role changes, delete users,
// delete organizations, self-delete, instructions, audit log.
// ★ v1.6: fetchAdminLog() org-scoped — admin sees logs where admin OR target is in same org
// v1.5 — 2026-03-01
//   ★ v1.5: fetchUsers() returns orgName per user.
//           New: changeUserOrganization() for Admin/SuperAdmin.
//   ★ v1.4: Organization isolation — users only see their own org members
//     - fetchUsers() filters by active organization for admin/owner
//     - SuperAdmin still sees ALL users across all organizations
//     - fetchAdminLog() scoped to org for non-superadmin
//   ★ v1.3: RPC-based delete (SECURITY DEFINER bypass RLS)
//     - deleteSelf()  → calls supabase.rpc('delete_user_account')
//     - deleteUser()  → calls supabase.rpc('admin_delete_user')
//     - deleteOrgUser() and deleteOrganization() retained
//   ★ v1.2: Delete capabilities (3 levels)
//   ★ v1.1: Superadmin support
//   v1.0: Initial implementation
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient.ts';
import { storageService } from '../services/storageService.ts';
import { organizationService } from '../services/organizationService.ts';
import { invalidateGlobalInstructionsCache } from '../services/globalInstructionsService.ts';

// ─── Types ───────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user' | 'superadmin';
  createdAt: string;
  lastSignIn: string | null;
  orgRole?: string; // ★ v1.4: role within the organization (owner/admin/member)
  orgName?: string; // ★ v1.5: organization name for display
}

export interface AdminLogEntry {
  id: string;
  adminId: string;
  adminEmail?: string;
  action: string;
  targetUserId: string | null;
  targetEmail?: string;
  details: Record<string, any>;
  createdAt: string;
}

export interface GlobalInstructions {
  custom_instructions: Record<string, string> | null;
  updated_at: string | null;
  updated_by: string | null;
}

// ─── Hook ────────────────────────────────────────────────────

export const useAdmin = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [adminLog, setAdminLog] = useState<AdminLogEntry[]>([]);
  const [globalInstructions, setGlobalInstructions] = useState<GlobalInstructions | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingLog, setIsLoadingLog] = useState(false);
  const [isLoadingInstructions, setIsLoadingInstructions] = useState(false);
  const [isSavingInstructions, setIsSavingInstructions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Check admin status ────────────────────────────────────

  const checkAdminStatus = useCallback(() => {
    const role = storageService.getUserRole();
    const isAdminRole = role === 'admin' || role === 'superadmin';
    const isSuperRole = role === 'superadmin';
    setIsAdmin(isAdminRole);
    setIsSuperAdmin(isSuperRole);
    return isAdminRole;
  }, []);

  useEffect(() => {
    checkAdminStatus();
  }, [checkAdminStatus]);

  // ─── ★ v1.4: Fetch users — org-scoped for admin, global for superadmin ───

  const fetchUsers = useCallback(async () => {
    if (!checkAdminStatus()) return;

    setIsLoadingUsers(true);
    setError(null);

    try {
      const isSuperRole = storageService.isSuperAdmin();
      console.log('[AuditLog] isSuperAdmin:', isSuperRole, '| email:', storageService.getCurrentUser());
      const activeOrgId = storageService.getActiveOrgId();

      if (isSuperRole) {
        // ────────────────────────────────────────────────────
        // SuperAdmin: sees ALL users across ALL organizations
        // ────────────────────────────────────────────────────
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select('id, email, display_name, role, created_at, last_sign_in')
          .order('created_at', { ascending: true });

        if (fetchError) {
          console.error('fetchUsers error:', fetchError.message);
          setError(fetchError.message);
          return;
        }

                var mapped: AdminUser[] = (data || []).map(function(p: any) {
          return {
            id: p.id,
            email: p.email,
            displayName: p.display_name || p.email?.split('@')[0] || 'Unknown',
            role: p.role || 'user',
            createdAt: p.created_at,
            lastSignIn: p.last_sign_in,
          };
        });

        // ★ v1.5: Fetch organization names for all users
        try {
          var userIdsForOrg = mapped.map(function(u) { return u.id; });
          var membershipsResult = await supabase
            .from('organization_members')
            .select('user_id, organization_id, org_role, organizations(name)')
            .in('user_id', userIdsForOrg);

          if (membershipsResult.data) {
            var orgMap: Record<string, { name: string; role: string }> = {};
            for (var m of membershipsResult.data) {
              var orgData = (m as any).organizations;
              var orgNameVal = orgData ? (orgData.name || '') : '';
              if (!orgMap[m.user_id]) {
                orgMap[m.user_id] = { name: orgNameVal, role: m.org_role || 'member' };
              }
            }
            mapped = mapped.map(function(u) {
              var info = orgMap[u.id];
              return Object.assign({}, u, {
                orgName: info ? info.name : '',
                orgRole: info ? info.role : undefined,
              });
            });
          }
        } catch (orgErr) {
          console.warn('fetchUsers: org lookup failed:', orgErr);
        }

       setUsers(mapped);

      } else {
        // ────────────────────────────────────────────────────
        // Admin/Owner: sees ONLY users in their own organization
        // ────────────────────────────────────────────────────
        if (!activeOrgId) {
          console.warn('fetchUsers: No active organization — cannot list users.');
          setUsers([]);
          return;
        }

        // Step 1: Get all member user_ids + org_roles for this org
        const { data: orgMembers, error: membersError } = await supabase
          .from('organization_members')
          .select('user_id, org_role')
          .eq('organization_id', activeOrgId);

        if (membersError) {
          console.error('fetchUsers: org members query error:', membersError.message);
          setError(membersError.message);
          return;
        }

        if (!orgMembers || orgMembers.length === 0) {
          setUsers([]);
          return;
        }

        const memberIds = orgMembers.map(m => m.user_id);
        const orgRoleMap: Record<string, string> = {};
        for (const m of orgMembers) {
          orgRoleMap[m.user_id] = m.org_role;
        }

        // Step 2: Fetch profiles only for these member IDs
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select('id, email, display_name, role, created_at, last_sign_in')
          .in('id', memberIds)
          .order('created_at', { ascending: true });

        if (fetchError) {
          console.error('fetchUsers error:', fetchError.message);
          setError(fetchError.message);
          return;
        }

        // ★ v1.5: Get org name for display
        var activeOrgName = '';
        try {
          var orgNameResult = await supabase
            .from('organizations')
            .select('name')
            .eq('id', activeOrgId)
            .single();
          activeOrgName = orgNameResult.data?.name || '';
        } catch (e) { /* ignore */ }

        var mapped: AdminUser[] = (data || []).map(function(p: any) {
          return {
            id: p.id,
            email: p.email,
            displayName: p.display_name || p.email?.split('@')[0] || 'Unknown',
            role: p.role || 'user',
            createdAt: p.created_at,
            lastSignIn: p.last_sign_in,
            orgRole: orgRoleMap[p.id] || 'member',
            orgName: activeOrgName,
          };
        });

        setUsers(mapped);

      }
    } catch (err: any) {
      console.error('fetchUsers exception:', err);
      setError(err.message || 'Failed to fetch users');
    } finally {
      setIsLoadingUsers(false);
    }
  }, [checkAdminStatus]);

  // ─── Update user role ──────────────────────────────────────

  const updateUserRole = useCallback(async (
    targetUserId: string,
    newRole: 'admin' | 'user' | 'superadmin'
  ): Promise<{ success: boolean; message?: string }> => {
    if (!checkAdminStatus()) {
      return { success: false, message: 'Not authorized' };
    }

    const currentUserId = await storageService.getCurrentUserId();
    if (targetUserId === currentUserId) {
      return { success: false, message: 'You cannot change your own role' };
    }

    const targetUser = users.find(u => u.id === targetUserId);
    if ((newRole === 'superadmin' || targetUser?.role === 'superadmin') && !storageService.isSuperAdmin()) {
      return { success: false, message: 'Only Super Admin can modify Super Admin roles' };
    }

    // ★ v1.4: Non-superadmin can only change roles within their org
    if (!storageService.isSuperAdmin()) {
      const activeOrgId = storageService.getActiveOrgId();
      if (activeOrgId) {
        const { data: membership } = await supabase
          .from('organization_members')
          .select('user_id')
          .eq('organization_id', activeOrgId)
          .eq('user_id', targetUserId)
          .limit(1);

        if (!membership || membership.length === 0) {
          return { success: false, message: 'User is not in your organization' };
        }
      }
    }

    try {
      const oldRole = targetUser?.role || 'user';
      if (oldRole === newRole) return { success: true, message: 'Role unchanged' };

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', targetUserId);

      if (updateError) return { success: false, message: updateError.message };

      await supabase.from('admin_log').insert({
        admin_id: currentUserId,
        action: 'role_change',
        target_user_id: targetUserId,
        details: { old_role: oldRole, new_role: newRole, target_email: targetUser?.email || 'unknown' },
      });

      setUsers(prev => prev.map(u => u.id === targetUserId ? { ...u, role: newRole } : u));
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to update role' };
    }
  }, [checkAdminStatus, users]);

  // ═══════════════════════════════════════════════════════════
  // ★ v1.3: DELETE OPERATIONS — RPC-based (SECURITY DEFINER)
  // ═══════════════════════════════════════════════════════════

  /**
   * Internal helper: Remove all data for a given user ID.
   * Used by deleteOrgUser as fallback.
   * Deletes: project_data → projects → user_settings → org_memberships → profile
   */
  const _purgeUserData = useCallback(async (userId: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const { data: userProjects } = await supabase
        .from('projects')
        .select('id')
        .eq('owner_id', userId);

      if (userProjects && userProjects.length > 0) {
        for (const p of userProjects) {
          await supabase.from('project_data').delete().eq('project_id', p.id);
        }
        await supabase.from('projects').delete().eq('owner_id', userId);
      }

      await supabase.from('user_settings').delete().eq('user_id', userId);
      await supabase.from('organization_members').delete().eq('user_id', userId);

      const { error: profileError } = await supabase.from('profiles').delete().eq('id', userId);
      if (profileError) {
        console.error('_purgeUserData: profiles delete error:', profileError.message);
        return { success: false, message: `Profile delete failed: ${profileError.message}` };
      }

      return { success: true };
    } catch (err: any) {
      console.error('_purgeUserData error:', err);
      return { success: false, message: err.message || 'Purge failed' };
    }
  }, []);

  // ─────────────────────────────────────────────────────────
  // LEVEL 1: SuperAdmin deletes ANY user (via RPC)
  // ─────────────────────────────────────────────────────────
  const deleteUser = useCallback(async (userId: string): Promise<{ success: boolean; message?: string }> => {
    try {
      if (!isSuperAdmin) {
        return { success: false, message: 'Only SuperAdmin can delete users globally.' };
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, message: 'No authenticated user' };

      if (userId === user.id) {
        return { success: false, message: 'Cannot delete your own account from here. Use "Delete my account" instead.' };
      }

      const targetUser = users.find(u => u.id === userId);
      if (targetUser?.role === 'superadmin') {
        return { success: false, message: 'Cannot delete another SuperAdmin.' };
      }

      // ★ RPC klic na SECURITY DEFINER funkcijo
      const { data, error } = await supabase.rpc('admin_delete_user', {
        target_user_id: userId
      });

      if (error) {
        console.error('deleteUser RPC error:', error);
        return { success: false, message: error.message };
      }

      // Preveri odgovor iz DB funkcije
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (!result.success) {
        return { success: false, message: result.message || 'Delete failed in database' };
      }

      // Audit log
      try {
        await supabase.from('admin_log').insert({
          admin_id: user.id,
          action: 'user_delete',
          target_user_id: userId,
          details: {
            deleted_email: targetUser?.email || 'unknown',
            deleted_by: 'superadmin',
            method: 'admin_delete_user_rpc',
            deleted_at: new Date().toISOString(),
          },
        });
      } catch (logErr) {
        console.warn('Audit log insert failed:', logErr);
      }

      // Osveži seznam userjev
      await fetchUsers();
      return { success: true, message: 'User deleted successfully' };

    } catch (err: any) {
      console.error('deleteUser exception:', err);
      return { success: false, message: err.message || 'Delete failed' };
    }
  }, [isSuperAdmin, users, fetchUsers]);

  // ─────────────────────────────────────────────────────────
  // LEVEL 2: Org Owner/Admin removes user from THEIR org
  // ─────────────────────────────────────────────────────────
  const deleteOrgUser = useCallback(async (
    userId: string,
    orgId: string,
    alsoDeleteAccount: boolean = false
  ): Promise<{ success: boolean; message?: string }> => {
    const currentUserId = await storageService.getCurrentUserId();
    if (!currentUserId) return { success: false, message: 'Not authenticated' };

    if (userId === currentUserId) {
      return { success: false, message: 'Cannot remove yourself. Use "Delete my account" instead.' };
    }

    const callerOrgRole = await organizationService.getUserOrgRole(orgId);
    const callerIsSuperAdmin = storageService.isSuperAdmin();

    if (!callerIsSuperAdmin && callerOrgRole !== 'owner' && callerOrgRole !== 'admin') {
      return { success: false, message: 'Only organization owner, admin, or SuperAdmin can remove users.' };
    }

    const { data: targetMembership } = await supabase
      .from('organization_members')
      .select('org_role')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .single();

    if (targetMembership?.org_role === 'owner' && !callerIsSuperAdmin) {
      return { success: false, message: 'Cannot remove the organization owner. Only SuperAdmin can do this.' };
    }

    try {
      // Delete user's projects in this org
      const { data: orgProjects } = await supabase
        .from('projects')
        .select('id')
        .eq('owner_id', userId)
        .eq('organization_id', orgId);

      if (orgProjects && orgProjects.length > 0) {
        for (const p of orgProjects) {
          await supabase.from('project_data').delete().eq('project_id', p.id);
        }
        await supabase.from('projects').delete().eq('owner_id', userId).eq('organization_id', orgId);
      }

      // Remove membership
      await supabase
        .from('organization_members')
        .delete()
        .eq('organization_id', orgId)
        .eq('user_id', userId);

      // Clear active_org if it was this one
      await supabase
        .from('profiles')
        .update({ active_organization_id: null })
        .eq('id', userId)
        .eq('active_organization_id', orgId);

      // Check remaining memberships
      const { data: remainingMemberships } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', userId);

      // Full purge if requested or no orgs left
      if (alsoDeleteAccount || !remainingMemberships || remainingMemberships.length === 0) {
        // Use RPC for reliable purge
        const { data: rpcData, error: rpcError } = await supabase.rpc('delete_user_account', {
          target_user_id: userId
        });
        if (rpcError) {
          console.warn('RPC fallback for full purge failed, using _purgeUserData:', rpcError);
          await _purgeUserData(userId);
        }
      }

      // Audit log
      const targetUser = users.find(u => u.id === userId);
      await supabase.from('admin_log').insert({
        admin_id: currentUserId,
        action: 'org_user_remove',
        target_user_id: userId,
        details: {
          org_id: orgId,
          removed_email: targetUser?.email || 'unknown',
          also_deleted_account: alsoDeleteAccount || (!remainingMemberships || remainingMemberships.length === 0),
          deleted_at: new Date().toISOString(),
        },
      });

      await fetchUsers();
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Remove failed' };
    }
  }, [users, _purgeUserData, fetchUsers]);

  // ─────────────────────────────────────────────────────────
  // LEVEL 3: User deletes OWN account (self-delete via RPC)
  // ─────────────────────────────────────────────────────────
  const deleteSelf = useCallback(async (): Promise<{ success: boolean; message?: string }> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, message: 'No authenticated user' };

      // SuperAdmin cannot self-delete (safety)
      if (isSuperAdmin) {
        return { success: false, message: 'SuperAdmin cannot delete own account. Demote yourself first.' };
      }

      // ★ RPC klic na SECURITY DEFINER funkcijo
      const { data, error } = await supabase.rpc('delete_user_account', {
        target_user_id: user.id
      });

      if (error) {
        console.error('deleteSelf RPC error:', error);
        return { success: false, message: error.message };
      }

      // Preveri odgovor iz DB funkcije
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (!result.success) {
        return { success: false, message: result.message || 'Self-delete failed in database' };
      }

      // Odjava
      try {
        await storageService.logout();
      } catch (logoutErr) {
        console.warn('Logout after self-delete failed, forcing signOut:', logoutErr);
        await supabase.auth.signOut();
      }

      return { success: true, message: 'Account deleted successfully' };

    } catch (err: any) {
      console.error('deleteSelf exception:', err);
      return { success: false, message: err.message || 'Self-delete failed' };
    }
  }, [isSuperAdmin]);

  // ─────────────────────────────────────────────────────────
  // Delete entire organization (owner or superadmin)
  // ─────────────────────────────────────────────────────────
  const deleteOrganization = useCallback(async (orgId: string): Promise<{ success: boolean; message?: string }> => {
    const currentUserId = await storageService.getCurrentUserId();
    if (!currentUserId) return { success: false, message: 'Not authenticated' };

    const callerOrgRole = await organizationService.getUserOrgRole(orgId);
    const callerIsSuperAdmin = storageService.isSuperAdmin();

    if (!callerIsSuperAdmin && callerOrgRole !== 'owner') {
      return { success: false, message: 'Only the organization owner or SuperAdmin can delete an organization.' };
    }

    try {
      // Get all projects in this org
      const { data: orgProjects } = await supabase
        .from('projects')
        .select('id')
        .eq('organization_id', orgId);

      // Delete project_data
      if (orgProjects && orgProjects.length > 0) {
        for (const p of orgProjects) {
          await supabase.from('project_data').delete().eq('project_id', p.id);
        }
        await supabase.from('projects').delete().eq('organization_id', orgId);
      }

      // Delete org instructions
      await supabase.from('organization_instructions').delete().eq('organization_id', orgId);

      // Get members before deleting
      const { data: members } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', orgId);

      // Delete all memberships
      await supabase.from('organization_members').delete().eq('organization_id', orgId);

      // Clear active_organization_id for affected users
      if (members && members.length > 0) {
        for (const m of members) {
          await supabase
            .from('profiles')
            .update({ active_organization_id: null })
            .eq('id', m.user_id)
            .eq('active_organization_id', orgId);
        }
      }

      // Delete the organization
      const { error: deleteError } = await supabase
        .from('organizations')
        .delete()
        .eq('id', orgId);

      if (deleteError) {
        return { success: false, message: `Failed to delete org: ${deleteError.message}` };
      }

      // Audit log
      await supabase.from('admin_log').insert({
        admin_id: currentUserId,
        action: 'org_delete',
        target_user_id: null,
        details: {
          org_id: orgId,
          projects_deleted: orgProjects?.length || 0,
          members_affected: members?.length || 0,
          deleted_at: new Date().toISOString(),
        },
      });

      organizationService.clearCache();
      await fetchUsers();
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Organization delete failed' };
    }
  }, [fetchUsers]);

  // ─── ★ v1.4: Fetch audit log — org-scoped for non-superadmin ───

  const fetchAdminLog = useCallback(async (limit: number = 50) => {
    if (!checkAdminStatus()) return;

    setIsLoadingLog(true);
    setError(null);

    try {
      const isSuperRole = storageService.isSuperAdmin();

      let logData: any[] = [];

      if (isSuperRole) {
        // SuperAdmin sees ALL audit logs
        const { data, error: logError } = await supabase
          .from('admin_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (logError) {
          console.error('fetchAdminLog error:', logError.message);
          setError(logError.message);
          return;
        }
        logData = data || [];
                 } else {
        // ★ v1.6 FIX: Admin sees audit logs ONLY where action is within their org
        // Rule: admin_id must be in org AND (target_user_id is in org OR target_user_id is NULL)
        var activeOrgId = storageService.getActiveOrgId();
        if (!activeOrgId) {
          logData = [];
        } else {
          // Get all user IDs in this organization
          var orgMembersResult = await supabase
            .from('organization_members')
            .select('user_id')
            .eq('organization_id', activeOrgId);

          var orgUserIds = (orgMembersResult.data || []).map(function(m) { return m.user_id; });

          if (orgUserIds.length === 0) {
            logData = [];
          } else {
            // Fetch all logs where admin_id is in org
            var logByOrgAdmin = await supabase
              .from('admin_log')
              .select('*')
              .in('admin_id', orgUserIds)
              .order('created_at', { ascending: false })
              .limit(limit * 2);

            // Filter client-side: keep only entries where target is also in org OR target is null
            var orgUserIdSet = {};
            orgUserIds.forEach(function(uid) { orgUserIdSet[uid] = true; });

            // Build set of org member emails for fallback check
            var orgEmailsResult = await supabase
              .from('profiles')
              .select('id, email')
              .in('id', orgUserIds);
            var orgEmailSet = {};
            (orgEmailsResult.data || []).forEach(function(p) {
              if (p.email) orgEmailSet[p.email.toLowerCase()] = true;
            });

                        logData = (logByOrgAdmin.data || []).filter(function(entry) {
              if (!entry.target_user_id) {
                // No target — check details for hidden email
                var detailEmail = entry.details?.target_email || entry.details?.deleted_email || entry.details?.removed_email || null;
                if (!detailEmail) return false;
                // Must be org member
                return orgEmailSet[detailEmail.toLowerCase()] === true;
              }
              // Target must be in the same org
              return orgUserIdSet[entry.target_user_id] === true;
            });

            // Sort by created_at descending and apply limit
            logData.sort(function(a, b) {
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });
            logData = logData.slice(0, limit);
          }
        }
      }

      const entries: AdminLogEntry[] = logData.map((entry: any) => {
        const adminUser = users.find(u => u.id === entry.admin_id);
        const targetUser = users.find(u => u.id === entry.target_user_id);

        return {
          id: entry.id,
          adminId: entry.admin_id,
          adminEmail: adminUser?.email || entry.details?.admin_email || 'Unknown',
          action: entry.action,
          targetUserId: entry.target_user_id,
          targetEmail: targetUser?.email || entry.details?.target_email || entry.details?.deleted_email || entry.details?.removed_email || null,
          details: entry.details || {},
          createdAt: entry.created_at,
        };
      });

      setAdminLog(entries);
    } catch (err: any) {
      console.error('fetchAdminLog exception:', err);
      setError(err.message || 'Failed to fetch audit log');
    } finally {
      setIsLoadingLog(false);
    }
  }, [checkAdminStatus, users]);

  // ─── Fetch global instructions ─────────────────────────────

  const fetchGlobalInstructions = useCallback(async () => {
    setIsLoadingInstructions(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('global_settings')
        .select('*')
        .eq('id', 'global')
        .single();

      if (fetchError) {
        console.error('fetchGlobalInstructions error:', fetchError.message);
        setError(fetchError.message);
        return;
      }

      setGlobalInstructions({
        custom_instructions: data?.custom_instructions || null,
        updated_at: data?.updated_at || null,
        updated_by: data?.updated_by || null,
      });
    } catch (err: any) {
      console.error('fetchGlobalInstructions exception:', err);
      setError(err.message || 'Failed to fetch instructions');
    } finally {
      setIsLoadingInstructions(false);
    }
  }, []);

  // ─── Save global instructions ──────────────────────────────

  const saveGlobalInstructions = useCallback(async (
    instructions: Record<string, string>
  ): Promise<{ success: boolean; message?: string }> => {
    if (!checkAdminStatus()) return { success: false, message: 'Not authorized' };

    setIsSavingInstructions(true);

    try {
      const currentUserId = await storageService.getCurrentUserId();

      const { error: updateError } = await supabase
        .from('global_settings')
        .update({
          custom_instructions: instructions,
          updated_at: new Date().toISOString(),
          updated_by: currentUserId,
        })
        .eq('id', 'global');

      if (updateError) return { success: false, message: updateError.message };

      await supabase.from('admin_log').insert({
        admin_id: currentUserId,
        action: 'instructions_update',
        target_user_id: null,
        details: { sections_updated: Object.keys(instructions).length, timestamp: new Date().toISOString() },
      });

      setGlobalInstructions(prev => ({
        ...prev!,
        custom_instructions: instructions,
        updated_at: new Date().toISOString(),
        updated_by: currentUserId,
      }));

      invalidateGlobalInstructionsCache();
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to save instructions' };
    } finally {
      setIsSavingInstructions(false);
    }
  }, [checkAdminStatus]);

  // ─── Reset instructions to default ─────────────────────────

  const resetInstructionsToDefault = useCallback(async (): Promise<{ success: boolean; message?: string }> => {
    if (!checkAdminStatus()) return { success: false, message: 'Not authorized' };

    setIsSavingInstructions(true);

    try {
      const currentUserId = await storageService.getCurrentUserId();

      const { error: updateError } = await supabase
        .from('global_settings')
        .update({
          custom_instructions: null,
          updated_at: new Date().toISOString(),
          updated_by: currentUserId,
        })
        .eq('id', 'global');

      if (updateError) return { success: false, message: updateError.message };

      await supabase.from('admin_log').insert({
        admin_id: currentUserId,
        action: 'instructions_reset',
        target_user_id: null,
        details: { reset_to: 'default', timestamp: new Date().toISOString() },
      });

      setGlobalInstructions(prev => ({
        ...prev!,
        custom_instructions: null,
        updated_at: new Date().toISOString(),
        updated_by: currentUserId,
      }));

      invalidateGlobalInstructionsCache();
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to reset' };
    } finally {
      setIsSavingInstructions(false);
    }
  }, [checkAdminStatus]);
    // ─── ★ v1.5: Change user's organization ─────────────────────
  const changeUserOrganization = useCallback(async (
    userId: string,
    newOrgId: string,
    newOrgName: string
  ): Promise<{ success: boolean; message?: string }> => {
    if (!checkAdminStatus()) return { success: false, message: 'Not authorized' };
    var currentUserId = await storageService.getCurrentUserId();

    try {
      // Remove from ALL current organizations
      var removeResult = await supabase
        .from('organization_members')
        .delete()
        .eq('user_id', userId);

      if (removeResult.error) {
        return { success: false, message: 'Failed to remove from current org: ' + removeResult.error.message };
      }

      // Add to new organization as member
      var addResult = await supabase
        .from('organization_members')
        .insert({ organization_id: newOrgId, user_id: userId, org_role: 'member' });

      if (addResult.error) {
        return { success: false, message: 'Failed to add to new org: ' + addResult.error.message };
      }

      // Update active_organization_id in profile
      await supabase
        .from('profiles')
        .update({ active_organization_id: newOrgId })
        .eq('id', userId);

      // Move projects to new org
      await supabase
        .from('projects')
        .update({ organization_id: newOrgId })
        .eq('owner_id', userId);

      // Audit log
      var targetUser = users.find(function(u) { return u.id === userId; });
      await supabase.from('admin_log').insert({
        admin_id: currentUserId,
        action: 'org_change',
        target_user_id: userId,
        details: {
          target_email: targetUser?.email || 'unknown',
          old_org: targetUser?.orgName || 'unknown',
          new_org: newOrgName,
          new_org_id: newOrgId,
          changed_at: new Date().toISOString(),
        },
      });

      // Refresh user list
      await fetchUsers();
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to change organization' };
    }
  }, [checkAdminStatus, users, fetchUsers]);

  // ─── Return ────────────────────────────────────────────────

  return {
    // State
    isAdmin,
    isSuperAdmin,
    users,
    adminLog,
    globalInstructions,
    isLoadingUsers,
    isLoadingLog,
    isLoadingInstructions,
    isSavingInstructions,
    error,

    // Actions — existing
    checkAdminStatus,
    fetchUsers,
    updateUserRole,
    fetchAdminLog,
    fetchGlobalInstructions,
    saveGlobalInstructions,
    resetInstructionsToDefault,
    clearError: () => setError(null),

    // ★ v1.3: Delete actions (RPC-based)
    deleteUser,          // Level 1: SuperAdmin deletes any user (RPC)
    deleteOrgUser,       // Level 2: Org owner/admin removes user from org
    deleteSelf,          // Level 3: User deletes own account (RPC)
    deleteOrganization,  // Org owner/SuperAdmin deletes entire org
    changeUserOrganization, // ★ v1.5: Admin/SuperAdmin changes user's org
  };
};

export default useAdmin;
