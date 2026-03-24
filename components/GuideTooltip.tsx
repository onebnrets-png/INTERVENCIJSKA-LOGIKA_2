// components/GuideTooltip.tsx
// ═══════════════════════════════════════════════════════════════
// v1.6 — 2026-03-02 — Async override support: reads SuperAdmin customized content from Supabase
// v1.5 — 2026-03-02 — FIX: Dynamic panel height — adapts to content + viewport
// v1.4 — 2026-03-02 — FIX: "Rendered more hooks" crash — moved early returns AFTER all hooks
// v1.3 — 2026-03-02 — FIX: position:fixed + viewport clamping (scroll container fix)
// v1.2 — 2026-03-02 — FIX: Use React Portal to render panel in document.body
// v1.1 — 2026-03-02 — FIX: z-index raised (insufficient — stacking context issue)
// v1.0 — 2026-03-02 — Initial version
// ═══════════════════════════════════════════════════════════════

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { getFieldGuide, getFieldGuideWithOverrides } from '../services/guideContent.ts';
import { colors, darkColors, typography, radii, shadows, zIndex, animation, spacing } from '../design/theme.ts';

// ─── TYPES ─────────────────────────────────────────────────────
interface GuideTooltipProps {
  stepKey: string;
  fieldKey: string;
  language: string;
  isDarkMode?: boolean;
  position?: 'right' | 'left' | 'bottom';
  size?: 'sm' | 'md';
}

interface GuideEntry {
  whatIsThis: string;
  whyImportant: string;
  whatToWrite: string;
  tips: string;
  euContext: string;
  example: string;
}

// ─── TAB DEFINITIONS ───────────────────────────────────────────
var TAB_KEYS = ['whatIsThis', 'whyImportant', 'whatToWrite', 'tips', 'euContext', 'example'];

var TAB_LABELS = {
  en: {
    whatIsThis: 'What is this?',
    whyImportant: 'Why important?',
    whatToWrite: 'What to write',
    tips: 'Tips',
    euContext: 'EU Context',
    example: 'Example',
  },
  si: {
    whatIsThis: 'Kaj je to?',
    whyImportant: 'Zakaj pomembno?',
    whatToWrite: 'Kaj napisati',
    tips: 'Nasveti',
    euContext: 'EU kontekst',
    example: 'Primer',
  },
};

var TAB_ICONS = {
  whatIsThis: '\u2139\uFE0F',
  whyImportant: '\u2B50',
  whatToWrite: '\u270F\uFE0F',
  tips: '\uD83D\uDCA1',
  euContext: '\uD83C\uDDEA\uD83C\uDDFA',
  example: '\uD83D\uDCCB',
};

// ─── COMPONENT ─────────────────────────────────────────────────
var GuideTooltip = function GuideTooltip(props: GuideTooltipProps) {
  var stepKey = props.stepKey;
  var fieldKey = props.fieldKey;
  var language = props.language || 'en';
  var isDarkMode = props.isDarkMode || false;
  var position = props.position || 'right';
  var size = props.size || 'md';

  // ★ v1.4: ALL hooks MUST be called before any conditional return
  var panelRef = useRef<HTMLDivElement>(null);
  var buttonRef = useRef<HTMLButtonElement>(null);

  var stateOpen = useState(false);
  var isOpen = stateOpen[0];
  var setIsOpen = stateOpen[1];

  var stateTab = useState(0);
  var activeTab = stateTab[0];
  var setActiveTab = stateTab[1];

  var statePanelPos = useState({ top: 0, left: 0, availableHeight: 500 });
  var panelPos = statePanelPos[0];
  var setPanelPos = statePanelPos[1];

  // ★ v1.6: State for async guide content (with overrides)
  var stateGuide = useState<GuideEntry | null>(null);
  var guide = stateGuide[0];
  var setGuide = stateGuide[1];

  var stateLoading = useState(false);
  var isLoading = stateLoading[0];
  var setIsLoading = stateLoading[1];

  // ★ v1.6: Load default content synchronously first, then async override
  useEffect(function() {
    // Immediate: load default (sync)
    var defaultGuide = null;
    try {
      defaultGuide = getFieldGuide(stepKey, fieldKey, language);
    } catch (e) {
      defaultGuide = null;
    }
    setGuide(defaultGuide);

    // Then: load with overrides (async)
    setIsLoading(true);
    getFieldGuideWithOverrides(stepKey, fieldKey, language).then(function(result) {
      if (result) {
        setGuide(result);
      }
      setIsLoading(false);
    }).catch(function() {
      setIsLoading(false);
    });
  }, [stepKey, fieldKey, language]);

  // Check if guide has any content
  var hasContent = guide ? TAB_KEYS.some(function(key) {
    return guide && guide[key] && guide[key].trim() !== '';
  }) : false;

  // ★ v1.5: Panel dimensions
  var panelWidth = size === 'sm' ? 340 : 440;
  var PANEL_MARGIN = 16;
  var TAB_BAR_HEIGHT = 80;
  var CLOSE_HINT_HEIGHT = 32;
  var CONTENT_PADDING = 28;

  // ★ v1.5: Calculate panel position with dynamic available height
  var updatePanelPosition = useCallback(function() {
    if (!buttonRef.current) return;
    var rect = buttonRef.current.getBoundingClientRect();
    var viewH = window.innerHeight;
    var viewW = window.innerWidth;

    var top = 0;
    var left = 0;

    if (position === 'right') {
      top = rect.top - 8;
      left = rect.right + 8;
      if (left + panelWidth > viewW - PANEL_MARGIN) {
        left = rect.left - panelWidth - 8;
      }
    } else if (position === 'left') {
      top = rect.top - 8;
      left = rect.left - panelWidth - 8;
      if (left < PANEL_MARGIN) {
        left = rect.right + 8;
      }
    } else {
      top = rect.bottom + 8;
      left = rect.left + (rect.width / 2) - (panelWidth / 2);
      if (left < PANEL_MARGIN) left = PANEL_MARGIN;
      if (left + panelWidth > viewW - PANEL_MARGIN) left = viewW - PANEL_MARGIN - panelWidth;
    }

    // ★ v1.5: Clamp top and calculate how much vertical space is available
    if (top < PANEL_MARGIN) top = PANEL_MARGIN;

    var maxPanelHeight = viewH - top - PANEL_MARGIN;
    // Ensure minimum usable height
    if (maxPanelHeight < 200) {
      top = viewH - 200 - PANEL_MARGIN;
      if (top < PANEL_MARGIN) top = PANEL_MARGIN;
      maxPanelHeight = viewH - top - PANEL_MARGIN;
    }

    // ★ v1.5: Cap at 70% of viewport height for readability
    var cappedHeight = Math.min(maxPanelHeight, Math.floor(viewH * 0.7));

    setPanelPos({ top: top, left: left, availableHeight: cappedHeight });
  }, [position, size, panelWidth]);

  // ★ v1.4: Click outside handler
  useEffect(function() {
    if (!isOpen) return;
    var handleClickOutside = function(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return function() {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // ★ v1.4: Escape key handler
  useEffect(function() {
    if (!isOpen) return;
    var handleEsc = function(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleEsc);
    return function() {
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen]);

  // ★ v1.4: Scroll/resize handler
  useEffect(function() {
    if (!isOpen) return;
    updatePanelPosition();
    var handleScrollOrResize = function() {
      updatePanelPosition();
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return function() {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updatePanelPosition]);

  // ★ v1.4: EARLY RETURNS — now AFTER all hooks
  if (!guide) return null;
  if (!hasContent) return null;

  // Theme colors
  var c = isDarkMode ? darkColors : colors;
  var lang = (language === 'si' ? 'si' : 'en') as 'en' | 'si';
  var labels = TAB_LABELS[lang];

  // Filter tabs to only those with content
  var visibleTabs = TAB_KEYS.filter(function(key) {
    return guide && guide[key] && guide[key].trim() !== '';
  });

  // ★ v1.5: Dynamic content max height — uses available viewport space
  var contentMaxHeight = panelPos.availableHeight - TAB_BAR_HEIGHT - CLOSE_HINT_HEIGHT - CONTENT_PADDING;
  if (contentMaxHeight < 120) contentMaxHeight = 120;

  var handleToggle = function() {
    if (!isOpen) {
      updatePanelPosition();
    }
    setIsOpen(!isOpen);
    setActiveTab(0);
  };

  // ★ v1.2: Portal panel — rendered into document.body
  var portalPanel = isOpen ? ReactDOM.createPortal(
    React.createElement('div', {
      ref: panelRef,
      style: {
        position: 'fixed',
        top: panelPos.top + 'px',
        left: panelPos.left + 'px',
        width: panelWidth + 'px',
        maxHeight: panelPos.availableHeight + 'px',
        zIndex: 99999,
        background: isDarkMode ? c.surface.card : '#FFFFFF',
        border: '1px solid ' + c.border.light,
        borderRadius: radii.xl,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column' as const,
        animation: 'guideTooltipFadeIn ' + animation.duration.normal + ' ' + animation.easing.out,
      },
    },
      // Tab bar
      React.createElement('div', {
        style: {
          display: 'flex',
          flexWrap: 'wrap' as const,
          gap: '2px',
          padding: '8px 8px 0 8px',
          borderBottom: '1px solid ' + c.border.light,
          background: isDarkMode ? ((c as any).surface.cardAlt || c.surface.card) : '#F8FAFC',
          flexShrink: 0,
        },
      },
        visibleTabs.map(function(tabKey, idx) {
          var isActive = activeTab === idx;
          return React.createElement('button', {
            key: tabKey,
            onClick: function() { setActiveTab(idx); },
            style: {
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: isActive ? typography.fontWeight.semibold : typography.fontWeight.normal,
              color: isActive ? c.primary[700] : c.text.muted,
              background: isActive ? '#FFFFFF' : 'transparent',
              border: isActive ? '1px solid ' + c.border.light : '1px solid transparent',
              borderBottom: isActive ? '1px solid #FFFFFF' : '1px solid transparent',
              borderRadius: radii.md + ' ' + radii.md + ' 0 0',
              cursor: 'pointer',
              transition: 'all ' + animation.duration.fast,
              marginBottom: '-1px',
              whiteSpace: 'nowrap' as const,
              lineHeight: '1.3',
            },
            onMouseEnter: function(e) {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.color = c.primary[600];
                (e.currentTarget as HTMLElement).style.background = c.primary[50];
              }
            },
            onMouseLeave: function(e) {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.color = c.text.muted;
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }
            },
          }, TAB_ICONS[tabKey] + ' ' + labels[tabKey]);
        })
      ),

      // ★ v1.5: Tab content — flex-grow + dynamic maxHeight based on viewport
      React.createElement('div', {
        style: {
          padding: '14px 16px',
          maxHeight: contentMaxHeight + 'px',
          overflowY: 'auto' as const,
          fontSize: typography.fontSize.sm,
          lineHeight: typography.lineHeight.relaxed,
          color: c.text.body,
          flex: '1 1 auto',
        },
      }, guide[visibleTabs[activeTab]] || ''),

      // Close hint
      React.createElement('div', {
        style: {
          padding: '6px 16px 8px',
          borderTop: '1px solid ' + c.border.light,
          fontSize: '10px',
          color: c.text.muted,
          textAlign: 'right' as const,
          background: isDarkMode ? ((c as any).surface.cardAlt || c.surface.card) : '#F8FAFC',
          flexShrink: 0,
        },
      }, 'ESC ' + (lang === 'si' ? 'za zapiranje' : 'to close'))
    ),
    document.body
  ) : null;

  // ─── RENDER ────────────────────────────────────────────────
  return React.createElement('span', {
    style: { position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: '6px' },
  },
    // Info button
    React.createElement('button', {
      ref: buttonRef,
      onClick: handleToggle,
      'aria-label': 'Guide',
      style: {
        width: size === 'sm' ? '20px' : '22px',
        height: size === 'sm' ? '20px' : '22px',
        borderRadius: radii.full,
        border: '1.5px solid ' + (isOpen ? c.primary[500] : c.border.medium),
        background: isOpen ? c.primary[50] : 'transparent',
        color: isOpen ? c.primary[600] : c.text.muted,
        fontSize: size === 'sm' ? '11px' : '12px',
        fontWeight: typography.fontWeight.bold,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all ' + animation.duration.fast + ' ' + animation.easing.default,
        flexShrink: 0,
        lineHeight: 1,
        padding: 0,
      },
      onMouseEnter: function(e) {
        if (!isOpen) {
          (e.currentTarget as HTMLElement).style.borderColor = c.primary[400];
          (e.currentTarget as HTMLElement).style.color = c.primary[500];
          (e.currentTarget as HTMLElement).style.background = c.primary[50];
        }
      },
      onMouseLeave: function(e) {
        if (!isOpen) {
          (e.currentTarget as HTMLElement).style.borderColor = c.border.medium;
          (e.currentTarget as HTMLElement).style.color = c.text.muted;
          (e.currentTarget as HTMLElement).style.background = 'transparent';
        }
      },
    }, 'i'),

    // Portal panel (rendered in document.body)
    portalPanel,

    // Animation keyframes
    React.createElement('style', null, '\n@keyframes guideTooltipFadeIn {\n  from { opacity: 0; transform: translateY(4px); }\n  to { opacity: 1; transform: translateY(0); }\n}\n')
  );
};

export default GuideTooltip;
