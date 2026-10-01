export const colors = {
  bg: '#060607',
  bgRaised: '#0A0A0C',
  panel: '#101013',
  panelRaised: '#17171B',
  panelHighlight: '#202026',
  panelGlass: 'rgba(22,22,27,0.88)',
  panelWarm: 'rgba(255,128,91,0.075)',
  text: '#F7F5F2',
  textDim: '#C6C2BC',
  muted: '#9F9A94',
  subtle: '#89847D',
  line: 'rgba(255,255,255,0.075)',
  lineStrong: 'rgba(255,255,255,0.15)',
  accent: '#FF825D',
  accentBright: '#FFA07A',
  accentSoft: 'rgba(255,130,93,0.15)',
  accentFaint: 'rgba(255,130,93,0.075)',
  accentLine: 'rgba(255,130,93,0.30)',
  accentGlow: 'rgba(255,130,93,0.22)',
  success: '#B8DDB1',
  danger: '#FFA596',
  shadow: '#000000',
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 30,
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
