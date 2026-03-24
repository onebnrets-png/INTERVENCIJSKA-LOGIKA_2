// components/StepNavigationBar.tsx
// ═══════════════════════════════════════════════════════════════
// Horizontal intervention logic navigation bar with connected circles.
// v1.2 — 2026-03-22 — EO-140b: Integrate with global useResponsive hook.
//         3-tier sizing (normal/compact/ultraCompact) matching EO-140 system.
//         Removed local resize listener — uses shared useResponsive() hook.
// v1.1 — 2026-02-21
//   ★ v1.1: Responsive sizing — circles and arrows scale on smaller screens
// ═══════════════════════════════════════════════════════════════

import React from 'react';
import { ICONS, getSteps } from '../constants.tsx';
import { stepColors, radii, animation, typography, type StepColorKey } from '../design/theme.ts';
import { lightColors, darkColors } from '../design/theme.ts';
import { getThemeMode } from '../services/themeService.ts';
import { useResponsive } from '../hooks/useResponsive.ts';

interface StepNavigationBarProps {
  language: 'en' | 'si';
  currentStepId: number;
  completedStepsStatus: boolean[];
  onStepClick: (stepId: number) => void;
  isProblemAnalysisComplete: boolean;
}

const StepNavigationBar: React.FC<StepNavigationBarProps> = ({
  language,
  currentStepId,
  completedStepsStatus,
  onStepClick,
  isProblemAnalysisComplete,
}) => {
  const isDark = getThemeMode() === 'dark';
  const colors = isDark ? darkColors : lightColors;
  const STEPS = getSteps(language);

  // EO-140b: 3-tier sizing matching global responsive system — replaces local isCompact state
  const { tier } = useResponsive();

  const sizes = {
    normal: {
      activeSize: 42, inactiveSize: 36, arrowWidth: 28, arrowHeight: 16,
      checkSize: 16, activeFontSize: '12px', inactiveFontSize: '10px',
      labelFontSize: '9px', borderActive: 3, borderInactive: 2,
      glowSize: 12, padding: '0 8px', showLabel: true,
    },
    compact: {
      activeSize: 32, inactiveSize: 28, arrowWidth: 18, arrowHeight: 11,
      checkSize: 13, activeFontSize: '10px', inactiveFontSize: '9px',
      labelFontSize: '8px', borderActive: 2.5, borderInactive: 1.5,
      glowSize: 8, padding: '0 4px', showLabel: true,
    },
    ultraCompact: {
      activeSize: 26, inactiveSize: 22, arrowWidth: 12, arrowHeight: 8,
      checkSize: 10, activeFontSize: '8px', inactiveFontSize: '7px',
      labelFontSize: '0px', borderActive: 2, borderInactive: 1,
      glowSize: 4, padding: '0 1px', showLabel: false,
    },
  };

  const s = sizes[tier];
  const lineStrokeWidth = tier === 'ultraCompact' ? 0.75 : tier === 'compact' ? 1 : 1.5;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 0,
      padding: s.padding,
      height: '100%',
    }}>
      {STEPS.map((step, idx) => {
        const stepKey = step.key as StepColorKey;
        const sc = stepColors[stepKey];
        const isActive = currentStepId === step.id;
        const isCompleted = completedStepsStatus[idx];
        const isClickable = step.id === 1 || isProblemAnalysisComplete;
        const size = isActive ? s.activeSize : s.inactiveSize;

        return (
          <React.Fragment key={step.id}>
            {/* Arrow before each step (except first) */}
            {idx > 0 && (
              <svg width={s.arrowWidth} height={s.arrowHeight} viewBox={`0 0 ${s.arrowWidth} ${s.arrowHeight}`} style={{ flexShrink: 0, opacity: 0.4 }}>
                <line x1="0" y1={s.arrowHeight / 2} x2={s.arrowWidth - 8} y2={s.arrowHeight / 2} stroke={colors.border.medium} strokeWidth={lineStrokeWidth} />
                <polygon points={`${s.arrowWidth - 8},${s.arrowHeight / 2 - 4} ${s.arrowWidth},${s.arrowHeight / 2} ${s.arrowWidth - 8},${s.arrowHeight / 2 + 4}`} fill={colors.border.medium} />
              </svg>
            )}

            {/* Step circle */}
            <button
              onClick={() => isClickable && onStepClick(step.id)}
              disabled={!isClickable}
              title={step.title}
              style={{
                width: size,
                height: size,
                borderRadius: '50%',
                background: isActive
                  ? sc.main
                  : isCompleted
                    ? sc.main
                    : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                border: isActive
                  ? `${s.borderActive}px solid ${sc.border}`
                  : isCompleted
                    ? `${s.borderInactive}px solid ${sc.main}`
                    : `${s.borderInactive}px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isClickable ? 'pointer' : 'not-allowed',
                opacity: isClickable ? 1 : 0.35,
                transition: `all ${animation.duration.fast} ${animation.easing.default}`,
                flexShrink: 0,
                position: 'relative',
                boxShadow: isActive ? `0 0 ${s.glowSize}px ${sc.main}40` : 'none',
                padding: 0,
              }}
            >
              {isCompleted && !isActive ? (
                <ICONS.CHECK style={{
                  width: s.checkSize, height: s.checkSize, color: 'white',
                }} />
              ) : (
                <span style={{
                  fontSize: isActive ? s.activeFontSize : s.inactiveFontSize,
                  fontWeight: 800,
                  color: (isActive || isCompleted) ? 'white' : colors.text.muted,
                  lineHeight: 1,
                  fontFamily: typography.fontFamily.sans,
                }}>
                  {step.id}
                </span>
              )}

              {/* Step label — active only, hidden in ultraCompact */}
              {isActive && s.showLabel && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginTop: '4px',
                  whiteSpace: 'nowrap',
                  fontSize: s.labelFontSize,
                  fontWeight: 700,
                  color: sc.main,
                  letterSpacing: '0.02em',
                  pointerEvents: 'none',
                }}>
                  {step.title}
                </div>
              )}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default StepNavigationBar;

