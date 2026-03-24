// design/components/Card.tsx
// ═══════════════════════════════════════════════════════════════
// Universal Card component — EURO-OFFICE Design System
// v1.0 — 2026-02-17
// ═══════════════════════════════════════════════════════════════

import React from 'react';
import { colors, shadows, radii, animation, stepColors, type StepColorKey } from '../theme.ts';

interface CardProps {
  children: React.ReactNode;
  /** Optional color accent bar at top (4px) */
  accent?: StepColorKey;
  /** Hover lift effect */
  hoverable?: boolean;
  /** Extra padding variant */
  padded?: boolean;
  /** Custom className override */
  className?: string;
  /** Click handler (makes card clickable) */
  onClick?: () => void;
  /** HTML id */
  id?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  accent,
  hoverable = false,
  padded = true,
  className = '',
  onClick,
  id,
}) => {
  const accentColor = accent ? stepColors[accent].main : undefined;
  const isClickable = !!onClick;

  const baseStyles: React.CSSProperties = {
    background: colors.surface.card,
    borderRadius: radii['2xl'],
    boxShadow: shadows.card,
    border: `1px solid ${colors.border.light}`,
    padding: padded ? '24px' : '0',
    position: 'relative',
    overflow: 'hidden',
    transition: `box-shadow ${animation.duration.normal} ${animation.easing.default}, 
                 transform ${animation.duration.normal} ${animation.easing.default}`,
    cursor: isClickable ? 'pointer' : 'default',
    ...(accentColor && {
      borderTop: `4px solid ${accentColor}`,
    }),
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (hoverable || isClickable) {
      e.currentTarget.style.boxShadow = shadows.cardHover;
      e.currentTarget.style.transform = 'translateY(-2px)';
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    if (hoverable || isClickable) {
      e.currentTarget.style.boxShadow = shadows.card;
      e.currentTarget.style.transform = 'translateY(0)';
    }
  };

  return (
    <div
      id={id}
      style={baseStyles}
      className={className}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      {children}
    </div>
  );
};

// ─── Card Header ─────────────────────────────────────────────

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  accent?: StepColorKey;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  subtitle,
  icon,
  action,
  accent,
}) => {
  const accentColor = accent ? stepColors[accent].text : colors.text.heading;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '16px',
      paddingBottom: '12px',
      borderBottom: `1px solid ${colors.border.light}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {icon && (
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: radii.lg,
            background: accent ? stepColors[accent].light : colors.primary[50],
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: accentColor,
            flexShrink: 0,
          }}>
            {icon}
          </div>
        )}
        <div>
          <h3 style={{
            fontSize: '1rem',
            fontWeight: '600',
            color: accentColor,
            margin: 0,
            lineHeight: '1.25',
          }}>
            {title}
          </h3>
          {subtitle && (
            <p style={{
              fontSize: '0.8rem',
              color: colors.text.muted,
              margin: '2px 0 0',
              lineHeight: '1.4',
            }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && (
        <div style={{ flexShrink: 0 }}>
          {action}
        </div>
      )}
    </div>
  );
};

// ─── Card Footer ─────────────────────────────────────────────

interface CardFooterProps {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right' | 'between';
}

export const CardFooter: React.FC<CardFooterProps> = ({
  children,
  align = 'right',
}) => {
  const justifyMap = {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
    between: 'space-between',
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: justifyMap[align],
      marginTop: '16px',
      paddingTop: '12px',
      borderTop: `1px solid ${colors.border.light}`,
      gap: '8px',
    }}>
      {children}
    </div>
  );
};

export default Card;
