// design/theme.ts
// ═══════════════════════════════════════════════════════════════
// EURO-OFFICE Design System — Central Theme Configuration
// v1.5 — 2026-03-22 — EO-140c: Extended responsive config with iconSize, buttonPadding,
//         inputPadding, modalMaxWidth, modalPadding, buttonFontSize, inputFontSize,
//         fontSize.xxs, borderRadius per tier. Full coverage for all UI components.
// v1.4 — 2026-03-22 — EO-140: Responsive scale system (3 tiers: normal/compact/ultraCompact)
//
// CHANGES (v1.3):
//   - ★ Added 'superadmin' to roleBadge with gold/amber styling + 👑 icon
//
// v1.2 — 2026-02-17: Full dark palette with gradients
//
// Single source of truth for all visual tokens.
// All components reference this file — NEVER hardcode colors/sizes.
// ═══════════════════════════════════════════════════════════════

// ─── COLOR PALETTE ───────────────────────────────────────────

export const colors = {
  primary: {
    50:  '#EEF2FF',
    100: '#E0E7FF',
    200: '#C7D2FE',
    300: '#A5B4FC',
    400: '#818CF8',
    500: '#6366F1',
    600: '#4F46E5',
    700: '#4338CA',
    800: '#3730A3',
    900: '#312E81',
    gradient: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
    gradientHover: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
  },
  secondary: {
    50:  '#ECFEFF',
    100: '#CFFAFE',
    200: '#A5F3FC',
    300: '#67E8F9',
    400: '#22D3EE',
    500: '#06B6D4',
    600: '#0891B2',
    700: '#0E7490',
    800: '#155E75',
    900: '#164E63',
    gradient: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)',
  },
  success: {
    50:  '#ECFDF5',
    100: '#D1FAE5',
    200: '#A7F3D0',
    300: '#6EE7B7',
    400: '#34D399',
    500: '#10B981',
    600: '#059669',
    700: '#047857',
    800: '#065F46',
    900: '#064E3B',
  },
  warning: {
    50:  '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },
  error: {
    50:  '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
  },
  surface: {
    background: '#F8FAFC',
    card: '#FFFFFF',
    sidebar: '#F1F5F9',
    overlay: 'rgba(15, 23, 42, 0.5)',
    overlayBlur: 'rgba(15, 23, 42, 0.3)',
  },
  text: {
    heading: '#0F172A',
    body: '#334155',
    muted: '#94A3B8',
    inverse: '#FFFFFF',
    link: '#6366F1',
    linkHover: '#4F46E5',
  },
  border: {
    light: '#E2E8F0',
    medium: '#CBD5E1',
    heavy: '#94A3B8',
    focus: '#6366F1',
  },
} as const;

// ─── STEP COLORS ─────────────────────────────────────────────

export const stepColors = {
  problemAnalysis:     { main: '#EF4444', light: '#FEF2F2', border: '#FECACA', text: '#991B1B' },
  projectIdea:         { main: '#6366F1', light: '#EEF2FF', border: '#C7D2FE', text: '#3730A3' },
  generalObjectives:   { main: '#06B6D4', light: '#ECFEFF', border: '#A5F3FC', text: '#155E75' },
  specificObjectives:  { main: '#8B5CF6', light: '#F5F3FF', border: '#DDD6FE', text: '#5B21B6' },
  activities:          { main: '#F59E0B', light: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
  expectedResults:     { main: '#10B981', light: '#ECFDF5', border: '#A7F3D0', text: '#065F46' },
  references:          { main: '#818CF8', light: '#EEF2FF', border: '#C7D2FE', text: '#4338CA' },  // ★ EO-069
} as const;

export type StepColorKey = keyof typeof stepColors;

// ─── SPACING SCALE ───────────────────────────────────────────

export const spacing = {
  xs:  '4px',
  sm:  '8px',
  md:  '12px',
  lg:  '16px',
  xl:  '20px',
  '2xl': '24px',
  '3xl': '32px',
  '4xl': '40px',
  '5xl': '48px',
  '6xl': '64px',
} as const;

// ─── SHADOW SCALE ────────────────────────────────────────────

export const shadows = {
  none: 'none',
  xs:   '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  sm:   '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
  md:   '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg:   '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl:   '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  '2xl':'0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  card:      '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
  cardHover: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 10px -4px rgba(0, 0, 0, 0.08)',
  primaryGlow: '0 0 20px rgba(99, 102, 241, 0.3)',
  successGlow: '0 0 20px rgba(16, 185, 129, 0.3)',
} as const;

// ─── BORDER RADIUS ───────────────────────────────────────────

export const radii = {
  none: '0',
  sm:   '4px',
  md:   '6px',
  lg:   '8px',
  xl:   '12px',
  '2xl':'16px',
  '3xl':'24px',
  full: '9999px',
} as const;

// ─── Z-INDEX SCALE ───────────────────────────────────────────

export const zIndex = {
  base:       0,
  card:       1,
  dropdown:   10,
  sticky:     20,
  sidebar:    30,
  overlay:    40,
  modal:      50,
  loading:    60,
  tooltip:    70,
  toast:      80,
  max:        100,
} as const;

// ─── ANIMATION ───────────────────────────────────────────────

export const animation = {
  duration: {
    fast:    '150ms',
    normal:  '250ms',
    slow:    '350ms',
    slower:  '500ms',
  },
  easing: {
    default: 'cubic-bezier(0.4, 0, 0.2, 1)',
    in:      'cubic-bezier(0.4, 0, 1, 1)',
    out:     'cubic-bezier(0, 0, 0.2, 1)',
    inOut:   'cubic-bezier(0.4, 0, 0.2, 1)',
    bounce:  'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
} as const;

// ─── TYPOGRAPHY ──────────────────────────────────────────────

export const typography = {
  fontFamily: {
    sans:  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    mono:  "'JetBrains Mono', 'Fira Code', monospace",
  },
  fontSize: {
    xs:   '0.75rem',
    sm:   '0.875rem',
    base: '1rem',
    lg:   '1.125rem',
    xl:   '1.25rem',
    '2xl':'1.5rem',
    '3xl':'1.875rem',
    '4xl':'2.25rem',
  },
  fontWeight: {
    normal:   '400',
    medium:   '500',
    semibold: '600',
    bold:     '700',
    extrabold:'800',
  },
  lineHeight: {
    tight:  '1.25',
    normal: '1.5',
    relaxed:'1.75',
  },
} as const;

// ─── BREAKPOINTS ─────────────────────────────────────────────

export const breakpoints = {
  sm:  '640px',
  md:  '768px',
  lg:  '1024px',
  xl:  '1280px',
  '2xl':'1536px',
} as const;

// ─── ROLE BADGES ─────────────────────────────────────────────
// ★ v1.3: Added superadmin with gold/amber styling

export const roleBadge = {
  superadmin: {
    bg: '#FEF3C7',
    text: '#92400E',
    border: '#FDE68A',
    icon: '👑',
    label: { en: 'Super Admin', si: 'Super Admin' },
  },
  admin: {
    bg: colors.primary[100],
    text: colors.primary[700],
    border: colors.primary[200],
    icon: '🛡️',
    label: { en: 'Admin', si: 'Admin' },
  },
  user: {
    bg: colors.secondary[50],
    text: colors.secondary[700],
    border: colors.secondary[200],
    icon: '👤',
    label: { en: 'User', si: 'Uporabnik' },
  },
} as const;

// ─── CHART COLORS ────────────────────────────────────────────

export const chartColors = {
  sequential: ['#6366F1', '#818CF8', '#A5B4FC', '#C7D2FE', '#E0E7FF'],
  categorical: [
    '#6366F1', '#06B6D4', '#10B981', '#F59E0B',
    '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6',
  ],
  diverging: {
    positive: '#10B981',
    neutral:  '#94A3B8',
    negative: '#EF4444',
  },
  riskMatrix: {
    low_low:     '#D1FAE5',
    low_med:     '#FEF3C7',
    low_high:    '#FDE68A',
    med_low:     '#CFFAFE',
    med_med:     '#FDE68A',
    med_high:    '#FECACA',
    high_low:    '#FEF3C7',
    high_med:    '#FECACA',
    high_high:   '#FEE2E2',
  },
  gradientFills: {
    primary:   { start: '#6366F1', end: '#8B5CF6' },
    secondary: { start: '#06B6D4', end: '#0891B2' },
    success:   { start: '#10B981', end: '#059669' },
    warning:   { start: '#F59E0B', end: '#D97706' },
    danger:    { start: '#EF4444', end: '#DC2626' },
  },
} as const;

// ─── DARK MODE COLORS ────────────────────────────────────────

export const darkColors = {
  primary: {
    ...colors.primary,
    gradient: 'linear-gradient(135deg, #818CF8 0%, #A78BFA 100%)',
    gradientHover: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
  },
  secondary: {
    ...colors.secondary,
    gradient: 'linear-gradient(135deg, #22D3EE 0%, #06B6D4 100%)',
  },
  success: { ...colors.success },
  warning: { ...colors.warning },
  error: { ...colors.error },
  surface: {
    background: '#0F172A',
    card: '#1E293B',
    sidebar: '#1A2332',
    overlay: 'rgba(0, 0, 0, 0.6)',
    overlayBlur: 'rgba(0, 0, 0, 0.5)',
    hover: '#253348',
    cardAlt: '#162032',
  },
  text: {
    heading: '#F1F5F9',
    body: '#CBD5E1',
    muted: '#64748B',
    inverse: '#0F172A',
    link: '#818CF8',
    linkHover: '#A5B4FC',
  },
  border: {
    light: '#334155',
    medium: '#475569',
    heavy: '#64748B',
    focus: '#818CF8',
  },
} as const;

export const lightColors = colors;

// ─── RESPONSIVE SCALE ────────────────────────────────────────
// Three tiers based on viewport height. Components read these values
// via the useResponsive() hook.
// EO-140: normal ≥900px, compact 700-899px, ultraCompact <700px

export const responsive = {
  heightBreakpoints: {
    compact: 900,
    ultraCompact: 700,
  },
  tiers: {
    normal: {
      fontScale: 1,
      spacingScale: 1,
      iconScale: 1,
      ringSize: { sidebar: 32, sidebarCollapsed: 36, overall: 36 },
      sidebar: {
        headerPadding: '16px 16px',
        infoPadding: '8px 16px',
        cardPadding: '8px 12px',
        stepPadding: '12px 16px',
        stepGap: '2px',
        footerPadding: '16px',
        fontSize: { label: '10px', body: '0.875rem', step: '0.875rem', footer: '0.875rem' },
        logoHeight: 36,
        dashboardIconSize: 32,
        progressBarHeight: 4,
      },
      content: {
        padding: '24px',
        headerPadding: '12px 16px',
        sectionGap: '32px',
        cardPadding: '20px',
        fontSize: { heading: '1.125rem', body: '1rem', label: '0.875rem', xs: '0.75rem', xxs: '0.65rem' },
        iconSize: { button: 16, section: 18, field: 14, inline: 14 },
        buttonPadding: { primary: '6px 14px', secondary: '4px 10px', field: '6px' },
        buttonFontSize: '0.875rem',
        inputPadding: '8px 14px',
        inputFontSize: '1rem',
        textareaRows: 5,
        borderRadius: { card: '0.75rem', button: '0.5rem', input: '0.75rem' },
        modalMaxWidth: '520px',
        modalPadding: '24px',
      },
      toolbar: {
        height: 48,
        padding: '8px 16px',
        iconSize: 20,
        fontSize: '13px',
      },
    },
    compact: {
      fontScale: 0.9,
      spacingScale: 0.75,
      iconScale: 0.85,
      ringSize: { sidebar: 26, sidebarCollapsed: 30, overall: 28 },
      sidebar: {
        headerPadding: '10px 12px',
        infoPadding: '6px 12px',
        cardPadding: '6px 10px',
        stepPadding: '8px 12px',
        stepGap: '1px',
        footerPadding: '10px',
        fontSize: { label: '9px', body: '0.8rem', step: '0.8rem', footer: '0.8rem' },
        logoHeight: 28,
        dashboardIconSize: 24,
        progressBarHeight: 3,
      },
      content: {
        padding: '16px',
        headerPadding: '8px 12px',
        sectionGap: '20px',
        cardPadding: '14px',
        fontSize: { heading: '1rem', body: '0.9rem', label: '0.8rem', xs: '0.7rem', xxs: '0.6rem' },
        iconSize: { button: 14, section: 16, field: 12, inline: 12 },
        buttonPadding: { primary: '5px 11px', secondary: '3px 8px', field: '5px' },
        buttonFontSize: '0.8rem',
        inputPadding: '6px 11px',
        inputFontSize: '0.9rem',
        textareaRows: 4,
        borderRadius: { card: '0.625rem', button: '0.4rem', input: '0.625rem' },
        modalMaxWidth: '460px',
        modalPadding: '18px',
      },
      toolbar: {
        height: 40,
        padding: '6px 12px',
        iconSize: 18,
        fontSize: '12px',
      },
    },
    ultraCompact: {
      fontScale: 0.8,
      spacingScale: 0.6,
      iconScale: 0.75,
      ringSize: { sidebar: 22, sidebarCollapsed: 26, overall: 24 },
      sidebar: {
        headerPadding: '8px 10px',
        infoPadding: '4px 10px',
        cardPadding: '4px 8px',
        stepPadding: '6px 10px',
        stepGap: '0px',
        footerPadding: '8px',
        fontSize: { label: '8px', body: '0.75rem', step: '0.75rem', footer: '0.75rem' },
        logoHeight: 24,
        dashboardIconSize: 20,
        progressBarHeight: 2,
      },
      content: {
        padding: '12px',
        headerPadding: '6px 10px',
        sectionGap: '14px',
        cardPadding: '10px',
        fontSize: { heading: '0.9rem', body: '0.85rem', label: '0.75rem', xs: '0.688rem', xxs: '0.563rem' },
        iconSize: { button: 12, section: 14, field: 11, inline: 11 },
        buttonPadding: { primary: '4px 9px', secondary: '3px 7px', field: '4px' },
        buttonFontSize: '0.75rem',
        inputPadding: '5px 9px',
        inputFontSize: '0.85rem',
        textareaRows: 3,
        borderRadius: { card: '0.5rem', button: '0.375rem', input: '0.5rem' },
        modalMaxWidth: '400px',
        modalPadding: '14px',
      },
      toolbar: {
        height: 36,
        padding: '4px 10px',
        iconSize: 16,
        fontSize: '11px',
      },
    },
  },
} as const;

export type ResponsiveTier = 'normal' | 'compact' | 'ultraCompact';
export type ResponsiveConfig = typeof responsive.tiers.normal;

// ─── EXPORT COMPLETE THEME ───────────────────────────────────

export const theme = {
  colors,
  darkColors,
  stepColors,
  spacing,
  shadows,
  radii,
  zIndex,
  animation,
  typography,
  breakpoints,
  roleBadge,
  chartColors,
  responsive,
} as const;

export type Theme = typeof theme;
export default theme;
