// components/ErrorBoundary.tsx
// ═══════════════════════════════════════════════════════════════
// React Error Boundary — catches render crashes and logs to DB
// v1.0 — 2026-03-01
//
// PURPOSE:
//   Without this, if any React component throws during render,
//   the entire app crashes to a white screen with ZERO logging.
//   This component catches the crash, logs it to error_log DB,
//   and shows a user-friendly recovery screen.
// ═══════════════════════════════════════════════════════════════

import React from 'react';
import { errorLogService } from '../services/errorLogService.ts';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    // ★ Log to DB — this is the ONLY way to capture render crashes
    errorLogService.logError({
      errorMessage: error.message,
      errorCode: 'REACT_RENDER_CRASH',
      errorStack: error.stack || '',
      component: 'ErrorBoundary',
      context: {
        componentStack: errorInfo.componentStack
          ? errorInfo.componentStack.substring(0, 2000)
          : '',
      },
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F8FAFC',
          padding: '2rem',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: 16,
            padding: '3rem',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            maxWidth: 520,
            width: '100%',
            textAlign: 'center',
            border: '1px solid #E2E8F0',
          }}>
            {/* Gradient top bar */}
            <div style={{
              position: 'absolute' as any,
              top: 0, left: 0, right: 0, height: 4,
              background: 'linear-gradient(135deg, #EF4444, #F59E0B)',
              borderRadius: '16px 16px 0 0',
            }} />

            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>

            <h1 style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#1E293B',
              marginBottom: '0.75rem',
              marginTop: 0,
            }}>
              Nepričakovana napaka / Unexpected Error
            </h1>

            <p style={{
              color: '#64748B',
              fontSize: '0.9rem',
              marginBottom: '1.5rem',
              lineHeight: 1.7,
            }}>
              Prišlo je do napake pri prikazu aplikacije.
              Napaka je bila <strong>avtomatsko zabeležena</strong> v sistemu.
              <br /><br />
              <span style={{ fontSize: '0.85rem', fontStyle: 'italic' }}>
                An unexpected rendering error occurred. The error has been automatically logged.
              </span>
            </p>

            {/* Error detail box */}
            {this.state.error && (
              <div style={{
                background: '#FEF2F2',
                border: '1px solid #FEE2E2',
                borderRadius: 8,
                padding: '0.75rem 1rem',
                marginBottom: '1.5rem',
                textAlign: 'left',
                fontSize: '0.75rem',
                color: '#991B1B',
                fontFamily: 'ui-monospace, "Cascadia Code", "Fira Code", monospace',
                maxHeight: 140,
                overflow: 'auto',
                wordBreak: 'break-all',
                lineHeight: 1.5,
              }}>
                <strong>Error:</strong> {this.state.error.message}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={this.handleReload}
                style={{
                  background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 10,
                  padding: '0.75rem 2rem',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(99,102,241,0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.3)';
                }}
              >
                🔄 Ponovno naloži / Reload
              </button>

              <button
                onClick={() => {
                  window.location.href = window.location.origin;
                }}
                style={{
                  background: 'transparent',
                  color: '#64748B',
                  border: '1px solid #CBD5E1',
                  borderRadius: 10,
                  padding: '0.75rem 1.5rem',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                Domov / Home
              </button>
            </div>

            {/* Admin hint */}
            <p style={{
              marginTop: '1.5rem',
              fontSize: '0.75rem',
              color: '#94A3B8',
              lineHeight: 1.5,
            }}>
              Admini: napaka je vidna v Error Log zavihku Admin panela.
              <br />
              Admins: the error is visible in the Error Log tab of the Admin panel.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
