// design/index.ts
// ═══════════════════════════════════════════════════════════════
// Design System barrel export — import everything from 'design/'
// v1.0 — 2026-02-17
// ═══════════════════════════════════════════════════════════════

// Theme tokens
export { default as theme } from './theme.ts';
export {
  colors,
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
  type StepColorKey,
  type Theme,
} from './theme.ts';

// Components
export { Card, CardHeader, CardFooter } from './components/Card.tsx';
export { Button, SparkleIcon } from './components/Button.tsx';
export { Badge, RoleBadge, StatusBadge } from './components/Badge.tsx';
export { ProgressRing } from './components/ProgressRing.tsx';
export { Skeleton, SkeletonText, SkeletonCard, SkeletonTable } from './components/Skeleton.tsx';
