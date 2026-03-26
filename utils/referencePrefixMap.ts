// utils/referencePrefixMap.ts
// ★ EO-159: Shared chapter prefix map — used by 7+ files
// v1.0 — 2026-03-26

export const SECTION_PREFIX_MAP: Record<string, string> = {
  'problemAnalysis': 'PA', 'coreProblem': 'PA', 'causes': 'PA', 'consequences': 'PA',
  'projectIdea': 'PI', 'mainAim': 'PI', 'stateOfTheArt': 'PI', 'proposedSolution': 'PI',
  'policies': 'PI', 'readinessLevels': 'PI',
  'generalObjectives': 'GO',
  'specificObjectives': 'SO',
  'activities': 'AC', 'projectManagement': 'PM',
  'risks': 'RI',
  'outputs': 'ER', 'outcomes': 'ER', 'impacts': 'ER',
  'kers': 'KE',
  'partners': 'PC',
};

export const getChapterPrefix = (sectionKey: string): string => {
  return SECTION_PREFIX_MAP[sectionKey] || 'REF';
};

/** Extract numeric part from marker: '[PA-4]' → 4, '[12]' → 12, '(Author, 2024)' → 0 */
export const extractMarkerNumber = (marker: string): number => {
  if (!marker) return 0;
  const prefixed = marker.match(/\[(?:[A-Z]{2,4}-)?(\d+)\]/);
  if (prefixed) return parseInt(prefixed[1], 10) || 0;
  const bare = marker.match(/^(\d+)$/);
  if (bare) return parseInt(bare[1], 10) || 0;
  return 0;
};

/** Normalize URL for matching: strip query, fragment, trailing slash, lowercase */
export const normalizeUrlForMatch = (url: string): string => {
  if (!url) return '';
  return url.split('?')[0].split('#')[0].trim().toLowerCase().replace(/\/+$/, '');
};

/** Strip brackets from inlineMarker: '[PA-4]' → 'PA-4' */
export const stripBrackets = (marker: string): string => {
  if (!marker) return '';
  return marker.replace(/^\[/, '').replace(/\]$/, '');
};
