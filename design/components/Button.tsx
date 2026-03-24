// design/components/Button.tsx
// ═══════════════════════════════════════════════════════════════
// Universal Button component — EURO-OFFICE Design System
// v1.0 — 2026-02-17
// Variants: primary, secondary, ghost, danger, ai
// ═══════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { colors, shadows, radii, animation } from '../theme.ts';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ai';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
  className?: string;
}

const sizeMap: Record<ButtonSize, { padding: string; fontSize: string; height: string; iconSize: string }> = {
  sm: { padding: '6px 12px', fontSize: '0.8rem', height: '32px', iconSize: '14px' },
  md: { padding: '8px 16px', fontSize: '0.875rem', height: '38px', iconSize: '16px' },
  lg: { padding: '10px 24px', fontSize: '1rem', height: '44px', iconSize: '18px' },
};

const getVariantStyles = (
  variant: ButtonVariant,
  isHovered: boolean,
  isPressed: boolean,
  disabled: boolean
): React.CSSProperties => {
  const opacity = disabled ? 0.5 : 1;
  const cursor = disabled ? 'not-allowed' : 'pointer';
  const scale = isPressed ? 'scale(0.98)' : isHovered && !disabled ? 'scale(1.02)' : 'scale(1)';

  const base: React.CSSProperties = {
    opacity,
    cursor,
    transform: scale,
    transition: `all ${animation.duration.fast} ${animation.easing.default}`,
    borderRadius: radii.lg,
    fontWeight: '600',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    border: 'none',
    outline: 'none',
    position: 'relative',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  };

  switch (variant) {
    case 'primary':
      return {
        ...base,
        background: isHovered && !disabled ? colors.primary.gradientHover : colors.primary.gradient,
        color: colors.text.inverse,
        boxShadow: isHovered && !disabled ? shadows.primaryGlow : shadows.sm,
      };

    case 'secondary':
      return {
        ...base,
        background: isHovered && !disabled ? colors.primary[50] : 'transparent',
        color: colors.primary[600],
        border: `1.5px solid ${colors.primary[300]}`,
        boxShadow: isHovered && !disabled ? shadows.sm : 'none',
      };

    case 'ghost':
      return {
        ...base,
        background: isHovered && !disabled ? colors.surface.sidebar : 'transparent',
        color: colors.text.body,
        boxShadow: 'none',
      };

    case 'danger':
      return {
        ...base,
        background: isHovered && !disabled
          ? `linear-gradient(135deg, ${colors.error[600]} 0%, ${colors.error[700]} 100%)`
          : `linear-gradient(135deg, ${colors.error[500]} 0%, ${colors.error[600]} 100%)`,
        color: colors.text.inverse,
        boxShadow: isHovered && !disabled ? '0 0 20px rgba(239, 68, 68, 0.3)' : shadows.sm,
      };

    case 'ai':
      return {
        ...base,
        background: isHovered && !disabled
          ? `linear-gradient(135deg, ${colors.secondary[500]} 0%, ${colors.primary[500]} 100%)`
          : `linear-gradient(135deg, ${colors.secondary[400]} 0%, ${colors.primary[400]} 100%)`,
        color: colors.text.inverse,
        boxShadow: isHovered && !disabled
          ? '0 0 25px rgba(99, 102, 241, 0.3), 0 0 25px rgba(6, 182, 212, 0.2)'
          : shadows.sm,
      };

    default:
      return base;
  }
};

// ─── Spinner ─────────────────────────────────────────────────

const Spinner: React.FC<{ size: string }> = ({ size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    style={{ animation: 'spin 1s linear infinite' }}
  >
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.25" />
    <path d="M12 2a10 10 0 019.75 7.75" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

// ─── AI Sparkle Icon ─────────────────────────────────────────

export const SparkleIcon: React.FC<{ size?: string }> = ({ size = '16px' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L13.09 8.26L18 6L15.74 10.91L22 12L15.74 13.09L18 18L13.09 15.74L12 22L10.91 15.74L6 18L8.26 13.09L2 12L8.26 10.91L6 6L10.91 8.26L12 2Z" />
  </svg>
);

// ─── Main Button Component ───────────────────────────────────

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  iconRight,
  fullWidth = false,
  onClick,
  type = 'button',
  title,
  className = '',
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const isDisabled = disabled || loading;
  const sizeConfig = sizeMap[size];
  const variantStyles = getVariantStyles(variant, isHovered, isPressed, isDisabled);

  const combinedStyles: React.CSSProperties = {
    ...variantStyles,
    padding: sizeConfig.padding,
    fontSize: sizeConfig.fontSize,
    minHeight: sizeConfig.height,
    width: fullWidth ? '100%' : 'auto',
  };

  return (
    <button
      type={type}
      style={combinedStyles}
      className={className}
      disabled={isDisabled}
      onClick={isDisabled ? undefined : onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      title={title}
    >
      {loading ? (
        <Spinner size={sizeConfig.iconSize} />
      ) : icon ? (
        <span style={{ display: 'flex', alignItems: 'center', width: sizeConfig.iconSize, height: sizeConfig.iconSize }}>
          {icon}
        </span>
      ) : null}
      {children}
      {iconRight && !loading && (
        <span style={{ display: 'flex', alignItems: 'center', width: sizeConfig.iconSize, height: sizeConfig.iconSize }}>
          {iconRight}
        </span>
      )}
    </button>
  );
};

export default Button;
