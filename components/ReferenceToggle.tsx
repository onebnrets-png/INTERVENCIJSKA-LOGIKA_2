// components/ReferenceToggle.tsx
// ═══════════════════════════════════════════════════════════════
// v1.1 — 2026-03-22 — EO-140c: Responsive via useResponsive() — pill, icon, track, knob scale with tier.
// v1.0 — 2026-03-18 — EO-130: Per-section reference toggle ON/OFF
//   Pill-shaped toggle shown left of "Generate with AI" button.
//   ON  = full (Author, Year) [N] with reference list and URL verification.
//   OFF = inline (Author, Year) only — no [N] markers, no reference list.
// ═══════════════════════════════════════════════════════════════

import React from 'react';
import { useResponsive } from '../hooks/useResponsive.ts';

interface ReferenceToggleProps {
  sectionKey: string;
  enabled: boolean;
  onChange: (sectionKey: string, value: boolean) => void;
  language?: string;
}

const ReferenceToggle: React.FC<ReferenceToggleProps> = ({ sectionKey, enabled, onChange, language = 'en' }) => {
  const onLabel  = language === 'si' ? 'Reference' : 'References';
  const offLabel = language === 'si' ? 'Reference' : 'References';

  const tooltipOn  = language === 'si'
    ? 'Polne reference z oštevilčenimi markerji [N] in referenčno listo'
    : 'Full citations with numbered references [N] and reference list';
  const tooltipOff = language === 'si'
    ? 'Samo (Avtor, Leto) — brez številk, brez referenčne liste'
    : 'Inline (Author, Year) only — no numbered markers, no reference list';

  // EO-140c: Responsive sizing
  const { config: rc, isCompact, isUltraCompact } = useResponsive();
  const trackW = isUltraCompact ? 22 : isCompact ? 25 : 28;
  const trackH = isUltraCompact ? 12 : isCompact ? 14 : 16;
  const knobSize = isUltraCompact ? 8 : isCompact ? 10 : 12;
  const knobTranslate = trackW - knobSize - 4;
  const iconSize = isUltraCompact ? 12 : isCompact ? 13 : 14;

  return (
    <button
      type="button"
      onClick={() => onChange(sectionKey, !enabled)}
      title={enabled ? tooltipOn : tooltipOff}
      className="inline-flex items-center gap-1.5 rounded-full font-medium transition-all duration-200 select-none"
      style={{
        padding: isUltraCompact ? '2px 6px' : isCompact ? '2px 8px' : '4px 10px',
        fontSize: rc.content.fontSize.xs,
        background: enabled ? '#dcfce7' : '#f3f4f6',
        color: enabled ? '#15803d' : '#9ca3af',
        border: '1px solid',
        borderColor: enabled ? '#86efac' : '#d1d5db',
        opacity: 1,
      }}
    >
      {/* Book icon */}
      <svg
        style={{ width: iconSize, height: iconSize, flexShrink: 0, opacity: enabled ? 1 : 0.5 }}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>

      {/* Label */}
      <span style={{ opacity: enabled ? 1 : 0.5 }}>{enabled ? onLabel : offLabel}</span>

      {/* Toggle track */}
      <span
        className="inline-flex items-center rounded-full transition-colors duration-200 flex-shrink-0"
        style={{
          width: trackW,
          height: trackH,
          background: enabled ? '#22c55e' : '#d1d5db',
          padding: '2px',
        }}
      >
        <span
          className="rounded-full bg-white shadow-sm transition-transform duration-200"
          style={{
            width: knobSize,
            height: knobSize,
            transform: enabled ? `translateX(${knobTranslate}px)` : 'translateX(0)',
          }}
        />
      </span>

      {/* ON/OFF label */}
      <span style={{ fontSize: isUltraCompact ? '8px' : '10px', opacity: enabled ? 1 : 0.6, fontWeight: 600 }}>
        {enabled ? 'ON' : 'OFF'}
      </span>
    </button>
  );
};

export default ReferenceToggle;

// END OF ReferenceToggle.tsx v1.1
