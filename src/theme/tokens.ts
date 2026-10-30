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

  // Semantic aliases for the redesigned system. Keep the legacy names above
  // while screens migrate so there is still one source of truth.
  background: '#060607',
  surface: '#101013',
  surfaceRaised: '#17171B',
  surfaceStrong: '#202026',
  textPrimary: '#F7F5F2',
  textSecondary: '#C6C2BC',
  textTertiary: '#9F9A94',
  divider: 'rgba(255,255,255,0.075)',
  dividerStrong: 'rgba(255,255,255,0.15)',

  // Bioluminescent Cognitive State Palette (MYELIN Identity)
  synapse: '#4CE0D2',
  synapseBright: '#80F5EA',
  synapseSoft: 'rgba(76,224,210,0.14)',
  synapseFaint: 'rgba(76,224,210,0.065)',
  synapseLine: 'rgba(76,224,210,0.34)',
  synapseGlow: 'rgba(76,224,210,0.22)',

  consolidated: '#6EE7B7',
  consolidatedSoft: 'rgba(110,231,183,0.14)',
  consolidatedLine: 'rgba(110,231,183,0.32)',

  pulseAmber: '#FBBF24',
  pulseAmberSoft: 'rgba(251,191,36,0.14)',
  pulseAmberLine: 'rgba(251,191,36,0.34)',

  twilight: '#818CF8',
  twilightSoft: 'rgba(129,140,248,0.14)',
  twilightLine: 'rgba(129,140,248,0.32)',
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 30,
  pill: 999,
} as const;

// Legacy spacing aliases remain while older screens migrate.
export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// New work uses the 4/8-point rhythm below.
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const type = {
  display: { fontSize: 40, lineHeight: 44, fontWeight: '600' as const, letterSpacing: -1.2 },
  pageTitle: { fontSize: 30, lineHeight: 36, fontWeight: '600' as const, letterSpacing: -0.8 },
  hero: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const, letterSpacing: -0.45 },
  section: { fontSize: 19, lineHeight: 25, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' as const },
  meta: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700' as const, letterSpacing: 0.25 },
} as const;

export const motion = {
  pressMs: 110,
  stateMs: 190,
  hierarchyMs: 260,
  enterMs: 320,
  pressScale: 0.985,
  pressSpring: {
    stiffness: 320,
    damping: 24,
    mass: 0.58,
    overshootClamping: true,
  },
  releaseSpring: {
    stiffness: 245,
    damping: 24,
    mass: 0.58,
    overshootClamping: true,
  },
  revealSpring: {
    damping: 20,
    stiffness: 170,
    mass: 0.68,
    overshootClamping: true,
  },
} as const;

export const shadow = {
  floating: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  quiet: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
} as const;

export const layout = {
  contentMax: 820,
  readingMax: 620,
  minTouch: 48,
  pageInset: 24,
} as const;
