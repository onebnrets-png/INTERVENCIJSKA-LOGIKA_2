// services/errorLogService.ts
// ═══════════════════════════════════════════════════════════════
// Global error logging service — captures frontend errors to DB
// v1.2 — 2026-03-01
//
// CHANGELOG:
//   ★ v1.2: Added logErrorQuick() — fire-and-forget convenience wrapper
//           for use in catch blocks across all services and hooks.
//   ★ v1.1: Enhanced export — formatLogsForExport now includes FULL
//           stack traces, full context JSON (pretty-printed), and
//           precise timestamps with seconds.
//           New: exportLogsAsJSON() for structured export.
//           New: downloadLogsAsFile() for direct .txt/.json download.
//           New: formatAuditLogsForExport() for Audit Log export.
//           New: downloadAuditLogsAsFile() for direct audit download.
//   v1.0: Initial implementation
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabaseClient.ts';

export interface ErrorLogEntry {
  id: string;
  user_id: string | null;
  user_email: string | null;
  error_code: string | null;
  error_message: string;
  error_stack: string | null;
  component: string | null;
  context: Record<string, any>;
  created_at: string;
}

export interface AuditLogExportEntry {
  id: string;
  adminEmail: string;
  action: string;
  targetEmail: string | null;
  details: Record<string, any>;
  createdAt: string;
}

export const errorLogService = {

  /**
   * Log an error to the database.
   * Called from catch blocks, error boundaries, etc.
   */
  async logError(params: {
    errorMessage: string;
    errorCode?: string;
    errorStack?: string;
    component?: string;
    context?: Record<string, any>;
  }): Promise<void> {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id || null;
      const userEmail = authData.user?.email || null;

      await supabase.from('error_log').insert({
        user_id: userId,
        user_email: userEmail,
        error_code: params.errorCode || null,
        error_message: params.errorMessage,
        error_stack: params.errorStack || null,
        component: params.component || null,
        context: params.context || {},
      });
    } catch (e) {
      // Fallback: log to console if DB insert fails
      console.error('[errorLogService] Failed to log error to DB:', e);
      console.error('[errorLogService] Original error:', params.errorMessage);
    }
  },

  /**
   * Fetch error logs (admin/superadmin only).
   * Returns most recent first, up to `limit` entries.
   */
  async getErrorLogs(limit: number = 100, offset: number = 0): Promise<ErrorLogEntry[]> {
    const { data, error } = await supabase
      .from('error_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[errorLogService] getErrorLogs error:', error.message);
      return [];
    }
    return data || [];
  },

  /**
   * Clear all error logs (superadmin only).
   */
  async clearAllLogs(): Promise<{ success: boolean; message?: string }> {
    const { error } = await supabase
      .from('error_log')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all rows

    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true };
  },

  /**
   * ★ v1.1: Export logs as formatted text — FULL detail for developer.
   * Includes: precise timestamp, user, component, code, FULL message,
   * FULL stack trace (no truncation), pretty-printed context JSON.
   */
  formatLogsForExport(logs: ErrorLogEntry[]): string {
    var header = 'EURO-OFFICE ERROR LOG EXPORT\n'
      + 'Generated: ' + new Date().toISOString() + '\n'
      + 'Total entries: ' + logs.length + '\n'
      + '='.repeat(100) + '\n\n';

    var entries = logs.map(function(log, i) {
      var date = new Date(log.created_at).toLocaleString('sl-SI', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      var lines = [
        '─── ERROR #' + (i + 1) + ' (' + log.id + ') ───',
        'Datum:        ' + date,
        'ISO:          ' + log.created_at,
        'Uporabnik:    ' + (log.user_email || 'Neznan'),
        'User ID:      ' + (log.user_id || '—'),
        'Komponenta:   ' + (log.component || '—'),
        'Koda napake:  ' + (log.error_code || '—'),
        'Opis napake:  ' + log.error_message,
      ];
      if (log.error_stack) {
        lines.push('');
        lines.push('Stack Trace:');
        lines.push(log.error_stack);
      }
      if (log.context && Object.keys(log.context).length > 0) {
        lines.push('');
        lines.push('Context (JSON):');
        lines.push(JSON.stringify(log.context, null, 2));
      }
      lines.push('');
      lines.push('─'.repeat(100));
      lines.push('');
      return lines.join('\n');
    }).join('\n');

    return header + entries;
  },

  /**
   * ★ v1.1: Export logs as structured JSON (for programmatic analysis).
   */
  exportLogsAsJSON(logs: ErrorLogEntry[]): string {
    var exportObj = {
      exportType: 'EURO-OFFICE_ERROR_LOG',
      generated: new Date().toISOString(),
      totalEntries: logs.length,
      entries: logs.map(function(log) {
        return {
          id: log.id,
          timestamp: log.created_at,
          userEmail: log.user_email,
          userId: log.user_id,
          component: log.component,
          errorCode: log.error_code,
          errorMessage: log.error_message,
          stackTrace: log.error_stack,
          context: log.context,
        };
      }),
    };
    return JSON.stringify(exportObj, null, 2);
  },

  /**
   * ★ v1.1: Download logs as a file (triggers browser download).
   * @param logs - Error log entries
   * @param format - 'txt' or 'json'
   */
  downloadLogsAsFile(logs: ErrorLogEntry[], format: 'txt' | 'json'): void {
    var content = format === 'json'
      ? this.exportLogsAsJSON(logs)
      : this.formatLogsForExport(logs);

    var mimeType = format === 'json' ? 'application/json' : 'text/plain';
    var dateStr = new Date().toISOString().slice(0, 10);
    var fileName = 'euro-office-error-log-' + dateStr + '.' + format;

    var blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * ★ v1.1: Format audit log entries for text export.
   */
  formatAuditLogsForExport(logs: AuditLogExportEntry[]): string {
    var header = 'EURO-OFFICE AUDIT LOG EXPORT\n'
      + 'Generated: ' + new Date().toISOString() + '\n'
      + 'Total entries: ' + logs.length + '\n'
      + '='.repeat(100) + '\n\n';

    var entries = logs.map(function(log, i) {
      var date = new Date(log.createdAt).toLocaleString('sl-SI', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      var lines = [
        '─── AUDIT #' + (i + 1) + ' (' + log.id + ') ───',
        'Datum:        ' + date,
        'ISO:          ' + log.createdAt,
        'Admin:        ' + log.adminEmail,
        'Akcija:       ' + log.action,
        'Cilj:         ' + (log.targetEmail || '—'),
      ];
      if (log.details && Object.keys(log.details).length > 0) {
        lines.push('');
        lines.push('Podrobnosti (JSON):');
        lines.push(JSON.stringify(log.details, null, 2));
      }
      lines.push('');
      lines.push('─'.repeat(100));
      lines.push('');
      return lines.join('\n');
    }).join('\n');

    return header + entries;
  },

  /**
   * ★ v1.1: Download audit logs as a file.
   */
  downloadAuditLogsAsFile(logs: AuditLogExportEntry[], format: 'txt' | 'json'): void {
    var content = '';
    if (format === 'json') {
      var exportObj = {
        exportType: 'EURO-OFFICE_AUDIT_LOG',
        generated: new Date().toISOString(),
        totalEntries: logs.length,
        entries: logs,
      };
      content = JSON.stringify(exportObj, null, 2);
    } else {
      content = this.formatAuditLogsForExport(logs);
    }

    var mimeType = format === 'json' ? 'application/json' : 'text/plain';
    var dateStr = new Date().toISOString().slice(0, 10);
    var fileName = 'euro-office-audit-log-' + dateStr + '.' + format;

    var blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

// ─── Convenience wrapper for use in catch blocks ─────────────
/**
 * ★ v1.2: Quick-log — call from any catch block to ensure error
 * lands in the error_log DB table. Fire-and-forget — does not
 * block the caller, does not throw.
 *
 * Usage:
 *   import { logErrorQuick } from './errorLogService.ts';
 *   logErrorQuick('storageService.login', error, { email });
 */
export function logErrorQuick(
  component: string,
  error: any,
  context?: Record<string, any>
): void {
  var msg = error?.message || String(error) || 'Unknown error';
  var stack = error?.stack || null;
  var code = error?.code || error?.status || error?.statusCode || null;

  // Fire and forget — don't await, don't block caller
  errorLogService.logError({
    errorMessage: msg,
    errorCode: code ? String(code) : undefined,
    errorStack: stack,
    component: component,
    context: context || {},
  }).catch(function() {
    // Last resort — if even DB logging fails, at least console has it
    console.error('[logErrorQuick] Failed to log to DB: ' + component + ': ' + msg);
  });
}

// ─── Global error handler (auto-captures unhandled errors) ───
// Filters out harmless browser noise (e.g. ResizeObserver)
var IGNORED_ERRORS = [
  'ResizeObserver loop',
  'ResizeObserver loop completed',
];

function shouldIgnore(message: string): boolean {
  return IGNORED_ERRORS.some(function(pattern) { return message.includes(pattern); });
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', function(event) {
    var msg = event.message || 'Unhandled error';
    if (shouldIgnore(msg)) return;

    errorLogService.logError({
      errorMessage: msg,
      errorStack: event.error?.stack || (event.filename + ':' + event.lineno + ':' + event.colno),
      component: 'window.onerror',
      context: { filename: event.filename, lineno: event.lineno, colno: event.colno },
    });
  });

  window.addEventListener('unhandledrejection', function(event) {
    var msg = event.reason?.message || String(event.reason) || 'Unhandled promise rejection';
    if (shouldIgnore(msg)) return;

    errorLogService.logError({
      errorMessage: msg,
      errorStack: event.reason?.stack || null,
      component: 'unhandledrejection',
    });
  });
}
