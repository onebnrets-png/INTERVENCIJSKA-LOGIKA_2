// design/components/Skeleton.tsx
// ═══════════════════════════════════════════════════════════════
// Loading skeleton placeholders — EURO-OFFICE Design System
// v1.0 — 2026-02-17
// ═══════════════════════════════════════════════════════════════

import React from 'react';
import { radii } from '../theme.ts';

interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '20px',
  borderRadius = radii.md,
  className = '',
}) => (
  <div
    className={className}
    style={{
      width,
      height,
      borderRadius,
      background: 'linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s ease-in-out infinite',
    }}
  />
);

// ─── Preset Skeletons ────────────────────────────────────────

export const SkeletonText: React.FC<{ lines?: number }> = ({ lines = 3 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        width={i === lines - 1 ? '60%' : '100%'}
        height="14px"
      />
    ))}
  </div>
);

export const SkeletonCard: React.FC = () => (
  <div style={{
    background: '#FFFFFF',
    borderRadius: radii['2xl'],
    padding: '24px',
    border: '1px solid #E2E8F0',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
      <Skeleton width="36px" height="36px" borderRadius={radii.lg} />
      <div style={{ flex: 1 }}>
        <Skeleton width="40%" height="16px" />
        <Skeleton width="60%" height="12px" borderRadius={radii.sm} />
      </div>
    </div>
    <SkeletonText lines={3} />
  </div>
);

export const SkeletonTable: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 5,
  cols = 4,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
    {/* Header */}
    <div style={{ display: 'flex', gap: '8px', padding: '12px 0', borderBottom: '2px solid #E2E8F0' }}>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={`h-${i}`} width={`${100 / cols}%`} height="14px" />
      ))}
    </div>
    {/* Rows */}
    {Array.from({ length: rows }).map((_, r) => (
      <div key={`r-${r}`} style={{ display: 'flex', gap: '8px', padding: '10px 0', borderBottom: '1px solid #F1F5F9' }}>
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={`r-${r}-c-${c}`} width={`${100 / cols}%`} height="14px" />
        ))}
      </div>
    ))}
  </div>
);

export default Skeleton;
