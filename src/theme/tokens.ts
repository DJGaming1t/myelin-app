export const colors = {
  bg: '#070707',
  panel: '#0F0F10',
  panelRaised: '#171719',
  panelHighlight: '#1D1D20',
  text: '#F5F5F2',
  muted: '#9A9A96',
  subtle: '#676763',
  line: 'rgba(255,255,255,0.08)',
  lineStrong: 'rgba(255,255,255,0.15)',
  accent: '#FF805B',
  accentSoft: 'rgba(255,128,91,0.14)',
  accentFaint: 'rgba(255,128,91,0.07)',
  accentLine: 'rgba(255,128,91,0.28)',
  success: '#B4D8AE',
  danger: '#FFA191',
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const layout = {
  contentMax: 820,
  readingMax: 620,
  minTouch: 48,
} as const;
