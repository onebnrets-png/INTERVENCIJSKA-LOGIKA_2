// hooks/useResponsive.ts
// ═══════════════════════════════════════════════════════════════
// v1.0 — 2026-03-22 — EO-140: Global responsive design hook
// Returns current responsive tier and config based on viewport height.
// Uses requestAnimationFrame debounce to avoid layout thrash on resize.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from 'react';
import { responsive, type ResponsiveTier, type ResponsiveConfig } from '../design/theme.ts';

export function useResponsive(): {
  tier: ResponsiveTier;
  config: ResponsiveConfig;
  viewportHeight: number;
  viewportWidth: number;
  isCompact: boolean;
  isUltraCompact: boolean;
} {
  const [dimensions, setDimensions] = useState({
    height: typeof window !== 'undefined' ? window.innerHeight : 1080,
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
  });

  useEffect(() => {
    let rafId: number;
    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setDimensions({
          height: window.innerHeight,
          width: window.innerWidth,
        });
      });
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  const tier: ResponsiveTier = useMemo(() => {
    if (dimensions.height < responsive.heightBreakpoints.ultraCompact) return 'ultraCompact';
    if (dimensions.height < responsive.heightBreakpoints.compact) return 'compact';
    return 'normal';
  }, [dimensions.height]);

  const config = responsive.tiers[tier] as ResponsiveConfig;

  return {
    tier,
    config,
    viewportHeight: dimensions.height,
    viewportWidth: dimensions.width,
    isCompact: tier === 'compact' || tier === 'ultraCompact',
    isUltraCompact: tier === 'ultraCompact',
  };
}

export default useResponsive;
