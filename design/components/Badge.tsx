// design/components/Badge.tsx
// ═══════════════════════════════════════════════════════════════
// Badge component — EURO-OFFICE Design System
// v1.0 — 2026-02-17
// For role badges, status indicators, step labels, risk levels
// ═══════════════════════════════════════════════════════════════

import React from 'react';
import { colors, radii, animation } from '../theme.ts';

type BadgeVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'neutral';
type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: React.ReactNode;
  pulse?: boolean;
  className?: string;
}

const variantMap: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
  primary:   { bg: colors.primary[100],   text: colors.primary[700],   border: colors.primary[200] },
  secondary: { bg: colors.secondary[50],  text: colors.secondary[700], border: colors.secondary[200] },
  success:   { bg: colors.success[100],   text: colors.success[700],   border: colors.success[200] },
  warning:   { bg: colors.warning[100],   text: colors.warning[700],   border: colors.warning[200] },
  error:     { bg: colors.error[100],     text: colors.error[700],     border: colors.error[200] },
  neutral:   { bg: '#F1F5F9',             text: '#475569',             border: '#E2E8F0' },
};

const sizeMap: Record<BadgeSize, { padding: string; fontSize: string; iconSize: string }> = {
  sm: { padding: '2px 8px',  fontSize: '0.7rem',   iconSize: '10px' },
  md: { padding: '3px 10px', fontSize: '0.75rem',  iconSize: '12px' },
  lg: { padding: '4px 14px', fontSize: '0.8rem',   iconSize: '14px' },
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  icon,
  pulse = false,
  className = '',
}) => {
  const v = variantMap[variant];
  const s = sizeMap[size];

  const styles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: s.padding,
    fontSize: s.fontSize,
    fontWeight: '600',
    lineHeight: '1.4',
    color: v.text,
    background: v.bg,
    border: `1px solid ${v.border}`,
    borderRadius: radii.full,
    whiteSpace: 'nowrap',
    transition: `all ${animation.duration.fast} ${animation.easing.default}`,
    position: 'relative',
  };

  return (
    <span style={styles} className={className}>
      {pulse && (
        <span style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: v.text,
          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          flexShrink: 0,
        }} />
      )}
      {icon && (
        <span style={{ display: 'flex', alignItems: 'center', width: s.iconSize, height: s.iconSize, flexShrink: 0 }}>
          {icon}
        </span>
      )}
      {children}
    </span>
  );
};

// ─── Role Badge (pre-configured) ─────────────────────────────

interface RoleBadgeProps {
  role: 'admin' | 'user';
  language?: 'en' | 'si';
  size?: BadgeSize;
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({ role, language = 'en', size = 'md' }) => {
  if (role === 'admin') {
    return (
      <Badge variant="primary" size={size}>
        🛡️ {language === 'si' ? 'Admin' : 'Admin'}
      </Badge>
    );
  }
  return (
    <Badge variant="neutral" size={size}>
      👤 {language === 'si' ? 'Uporabnik' : 'User'}
    </Badge>
  );
};

// ─── Status Badge (pre-configured) ───────────────────────────

interface StatusBadgeProps {
  status: 'complete' | 'in_progress' | 'not_started' | 'error';
  language?: 'en' | 'si';
  size?: BadgeSize;
}

const statusConfig: Record<string, { variant: BadgeVariant; en: string; si: string }> = {
  complete:    { variant: 'success', en: 'Complete',    si: 'Dokončano' },
  in_progress: { variant: 'warning', en: 'In Progress', si: 'V teku' },
  not_started: { variant: 'neutral', en: 'Not Started', si: 'Ni začeto' },
  error:       { variant: 'error',   en: 'Error',       si: 'Napaka' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, language = 'en', size = 'md' }) => {
  const config = statusConfig[status] || statusConfig.not_started;
  return (
    <Badge variant={config.variant} size={size} pulse={status === 'in_progress'}>
      {language === 'si' ? config.si : config.en}
    </Badge>
  );
};

export default Badge;
