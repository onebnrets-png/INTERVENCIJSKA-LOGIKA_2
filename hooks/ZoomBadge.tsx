// components/ZoomBadge.tsx v1.0
// Displays current zoom level + reset button overlay

import React from 'react';

interface ZoomBadgeProps {
  zoomText: string;
  onReset: () => void;
  language?: 'sl' | 'en';
}

export const ZoomBadge: React.FC<ZoomBadgeProps> = ({
  zoomText,
  onReset,
  language = 'sl',
}) => {
  if (!zoomText) return null; // Don't show at 100%

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'rgba(30, 41, 59, 0.85)',
        color: '#fff',
        borderRadius: 6,
        padding: '4px 10px',
        fontSize: 12,
        fontWeight: 600,
        backdropFilter: 'blur(4px)',
        userSelect: 'none',
        pointerEvents: 'auto',
      }}
    >
      <span>{zoomText}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onReset();
        }}
        title={language === 'sl' ? 'Ponastavi povečavo' : 'Reset zoom'}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: 'none',
          color: '#fff',
          borderRadius: 4,
          padding: '2px 6px',
          cursor: 'pointer',
          fontSize: 11,
          lineHeight: 1,
        }}
        onMouseEnter={(e) =>
          ((e.target as HTMLButtonElement).style.background =
            'rgba(255,255,255,0.35)')
        }
        onMouseLeave={(e) =>
          ((e.target as HTMLButtonElement).style.background =
            'rgba(255,255,255,0.2)')
        }
      >
        ✕
      </button>
    </div>
  );
};
