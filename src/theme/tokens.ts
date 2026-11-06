// Myelin's shared editorial + customizable Grey & White theme system.
// Coral fills and terracotta text remain separate roles so small links stay
// readable across warm editorial paper, architectural grey, and crisp white surfaces.

export type ThemePaletteId = 'grey' | 'white' | 'editorial';

export type ThemeColorTokens = {
  bg: string;
  bgRaised: string;
  panel: string;
  panelRaised: string;
  panelHighlight: string;
  panelGlass: string;
  panelWarm: string;
  text: string;
  textDim: string;
  muted: string;
  subtle: string;
  line: string;
  lineStrong: string;
  accent: string;
  accentFill: string;
  onAccent: string;
  accentBright: string;
  accentSoft: string;
  accentFaint: string;
  accentLine: string;
  accentGlow: string;
  success: string;
  danger: string;
  shadow: string;
  stage: string;
  onStage: string;
  stageMuted: string;
  stageTrack: string;
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceStrong: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  divider: string;
  dividerStrong: string;
  synapse: string;
  synapseBright: string;
  synapseSoft: string;
  synapseFaint: string;
  synapseLine: string;
  synapseGlow: string;
  consolidated: string;
  consolidatedSoft: string;
  consolidatedLine: string;
  pulseAmber: string;
  pulseAmberSoft: string;
  pulseAmberLine: string;
  twilight: string;
  twilightSoft: string;
  twilightLine: string;
};

export type ThemeCustomOverrides = Partial<Pick<
  ThemeColorTokens,
  'bg' | 'bgRaised' | 'panel' | 'panelRaised' | 'panelGlass' | 'text' | 'textDim' | 'muted' | 'line' | 'accent' | 'accentFill'
>>;

export type ChalkThemeTokens = {
  hero: string;
  heroDeep: string;
  paper: string;
  paperRaised: string;
  paperLine: string;
  paperContour: string;
  graphite: string;
  inkSoft: string;
  mutedCream: string;
  onStage: string;
  watermark: string;
  pillBg: string;
  pillBorder: string;
  progressBlue: string;
  progressBlueBright: string;
  nextUpBadge: string;
  dock: string;
  dockBorder: string;
  dockActivePill: string;
  dockInactiveText: string;
  customAccent: string;
  customAccentFill: string;
};

export const chalkTheme: ChalkThemeTokens = {
  hero: '#151514',
  heroDeep: '#0E0E0D',
  paper: '#F2E7D0',
  paperRaised: '#DFD4C0',
  paperLine: 'rgba(44, 43, 40, 0.16)',
  paperContour: 'rgba(44, 43, 40, 0.28)',
  graphite: '#2C2B28',
  inkSoft: '#66635C',
  mutedCream: '#C6BEAD',
  onStage: '#F2E7D0',
  watermark: 'rgba(242, 231, 208, 0.045)',
  pillBg: 'rgba(28, 28, 26, 0.72)',
  pillBorder: 'rgba(226, 216, 195, 0.28)',
  progressBlue: '#7E98A4',
  progressBlueBright: '#9BB8C6',
  nextUpBadge: '#4A5860',
  dock: '#252522',
  dockBorder: '#3A3833',
  dockActivePill: '#E5DAC3',
  dockInactiveText: '#D7CEBC',
  customAccent: '#7E98A4',
  customAccentFill: '#7E98A4',
} as const;

export const themePalettes: Record<ThemePaletteId, ThemeColorTokens> = {
  grey: {
    bg: '#EAECEF',
    bgRaised: '#F2F4F7',
    panel: '#F7F8FA',
    panelRaised: '#E2E5EA',
    panelHighlight: '#D7DBE2',
    panelGlass: 'rgba(242, 244, 247, 0.76)',
    panelWarm: '#E6E9EE',
    text: '#121417',
    textDim: '#2D3238',
    muted: '#4C525A',
    subtle: '#4F555D',
    line: '#CFD4DC',
    lineStrong: '#AEB5C0',
    accent: '#8F3823',
    accentFill: '#FF9176',
    onAccent: '#1E1512',
    accentBright: '#A3442D',
    accentSoft: '#F3DDD2',
    accentFaint: '#F7EAE3',
    accentLine: '#C4826E',
    accentGlow: 'rgba(255,145,118,0.22)',
    success: '#2B5B3C',
    danger: '#9B3127',
    shadow: '#121417',
    stage: '#111312',
    onStage: '#F2F4F7',
    stageMuted: '#D4D8DF',
    stageTrack: '#202521',
    background: '#EAECEF',
    surface: '#F7F8FA',
    surfaceRaised: '#E2E5EA',
    surfaceStrong: '#D7DBE2',
    textPrimary: '#121417',
    textSecondary: '#2D3238',
    textTertiary: '#4C525A',
    divider: '#CFD4DC',
    dividerStrong: '#AEB5C0',
    synapse: '#4CE0D2',
    synapseBright: '#7DF5E9',
    synapseSoft: 'rgba(76, 224, 210, 0.16)',
    synapseFaint: 'rgba(76, 224, 210, 0.09)',
    synapseLine: 'rgba(76, 224, 210, 0.34)',
    synapseGlow: 'rgba(76, 224, 210, 0.24)',
    consolidated: '#7AD69E',
    consolidatedSoft: 'rgba(122, 214, 158, 0.16)',
    consolidatedLine: 'rgba(122, 214, 158, 0.34)',
    pulseAmber: '#F3B454',
    pulseAmberSoft: 'rgba(243, 180, 84, 0.16)',
    pulseAmberLine: 'rgba(243, 180, 84, 0.34)',
    twilight: '#919EEB',
    twilightSoft: 'rgba(145, 158, 235, 0.16)',
    twilightLine: 'rgba(145, 158, 235, 0.34)',
  },
  white: {
    bg: '#FFFFFF',
    bgRaised: '#F8F9FA',
    panel: '#F4F5F7',
    panelRaised: '#EAECEF',
    panelHighlight: '#E1E4E8',
    panelGlass: 'rgba(255, 255, 255, 0.80)',
    panelWarm: '#F3F4F6',
    text: '#111315',
    textDim: '#2E3338',
    muted: '#50565E',
    subtle: '#535961',
    line: '#DCE0E5',
    lineStrong: '#B8BFC7',
    accent: '#943B25',
    accentFill: '#FF9176',
    onAccent: '#1F1612',
    accentBright: '#A94A32',
    accentSoft: '#F9E3D8',
    accentFaint: '#FCF0EA',
    accentLine: '#C88773',
    accentGlow: 'rgba(255,145,118,0.22)',
    success: '#2D603E',
    danger: '#A1342A',
    shadow: '#111315',
    stage: '#111312',
    onStage: '#FFFFFF',
    stageMuted: '#D5D9DF',
    stageTrack: '#202521',
    background: '#FFFFFF',
    surface: '#F4F5F7',
    surfaceRaised: '#EAECEF',
    surfaceStrong: '#E1E4E8',
    textPrimary: '#111315',
    textSecondary: '#2E3338',
    textTertiary: '#50565E',
    divider: '#DCE0E5',
    dividerStrong: '#B8BFC7',
    synapse: '#4CE0D2',
    synapseBright: '#7DF5E9',
    synapseSoft: 'rgba(76, 224, 210, 0.16)',
    synapseFaint: 'rgba(76, 224, 210, 0.09)',
    synapseLine: 'rgba(76, 224, 210, 0.34)',
    synapseGlow: 'rgba(76, 224, 210, 0.24)',
    consolidated: '#7AD69E',
    consolidatedSoft: 'rgba(122, 214, 158, 0.16)',
    consolidatedLine: 'rgba(122, 214, 158, 0.34)',
    pulseAmber: '#F3B454',
    pulseAmberSoft: 'rgba(243, 180, 84, 0.16)',
    pulseAmberLine: 'rgba(243, 180, 84, 0.34)',
    twilight: '#919EEB',
    twilightSoft: 'rgba(145, 158, 235, 0.16)',
    twilightLine: 'rgba(145, 158, 235, 0.34)',
  },
  editorial: {
    bg: '#F2EFE6',
    bgRaised: '#F8F6F0',
    panel: '#FCFAF5',
    panelRaised: '#EAE6DC',
    panelHighlight: '#E1DCD0',
    panelGlass: 'rgba(252, 250, 245, 0.78)',
    panelWarm: '#F6E7DC',
    text: '#161917',
    textDim: '#42483F',
    muted: '#62665C',
    subtle: '#5F6359',
    line: '#DDD8CB',
    lineStrong: '#B8B6A9',
    accent: '#9C432D',
    accentFill: '#FF9176',
    onAccent: '#241B17',
    accentBright: '#A94A32',
    accentSoft: '#F7DFD3',
    accentFaint: '#F6E7DC',
    accentLine: '#C88773',
    accentGlow: 'rgba(255,145,118,0.22)',
    success: '#3E6247',
    danger: '#AA3C32',
    shadow: '#161917',
    stage: '#111312',
    onStage: '#F2EFE6',
    stageMuted: '#DBDDD7',
    stageTrack: '#202521',
    background: '#F2EFE6',
    surface: '#FCFAF5',
    surfaceRaised: '#EAE6DC',
    surfaceStrong: '#E1DCD0',
    textPrimary: '#161917',
    textSecondary: '#42483F',
    textTertiary: '#62665C',
    divider: '#DDD8CB',
    dividerStrong: '#B8B6A9',
    synapse: '#4CE0D2',
    synapseBright: '#7DF5E9',
    synapseSoft: 'rgba(76, 224, 210, 0.16)',
    synapseFaint: 'rgba(76, 224, 210, 0.09)',
    synapseLine: 'rgba(76, 224, 210, 0.34)',
    synapseGlow: 'rgba(76, 224, 210, 0.24)',
    consolidated: '#7AD69E',
    consolidatedSoft: 'rgba(122, 214, 158, 0.16)',
    consolidatedLine: 'rgba(122, 214, 158, 0.34)',
    pulseAmber: '#F3B454',
    pulseAmberSoft: 'rgba(243, 180, 84, 0.16)',
    pulseAmberLine: 'rgba(243, 180, 84, 0.34)',
    twilight: '#919EEB',
    twilightSoft: 'rgba(145, 158, 235, 0.16)',
    twilightLine: 'rgba(145, 158, 235, 0.34)',
  },
} as const;

export const colors: ThemeColorTokens = {
  ...themePalettes.editorial,
};

let activePaletteId: ThemePaletteId = 'editorial';
let activeCustomOverrides: ThemeCustomOverrides = {};
const themeListeners = new Set<(palette: ThemePaletteId, tokens: ThemeColorTokens) => void>();

export function getThemeColors(
  palette: ThemePaletteId = activePaletteId,
  customOverrides: ThemeCustomOverrides = activeCustomOverrides,
): ThemeColorTokens {
  const base = themePalettes[palette] ?? themePalettes.editorial;
  const merged: ThemeColorTokens = {
    ...base,
    ...customOverrides,
  };
  if (customOverrides.bg) merged.background = customOverrides.bg;
  if (customOverrides.panel) merged.surface = customOverrides.panel;
  if (customOverrides.panelRaised) merged.surfaceRaised = customOverrides.panelRaised;
  if (customOverrides.text) merged.textPrimary = customOverrides.text;
  if (customOverrides.textDim) merged.textSecondary = customOverrides.textDim;
  if (customOverrides.muted) merged.textTertiary = customOverrides.muted;
  if (customOverrides.line) merged.divider = customOverrides.line;
  return merged;
}

export function getChalkThemeTokens(
  customOverrides: ThemeCustomOverrides = activeCustomOverrides,
  options: { applyCustomAccentToProgress?: boolean } = {},
): ChalkThemeTokens {
  const customAccent = customOverrides?.accent || chalkTheme.progressBlue;
  const customAccentFill = customOverrides?.accentFill || chalkTheme.progressBlue;
  return {
    ...chalkTheme,
    customAccent,
    customAccentFill,
    ...(options.applyCustomAccentToProgress && customOverrides?.accentFill
      ? { progressBlue: customOverrides.accentFill }
      : {}),
  };
}

export function applyThemePalette(
  palette: ThemePaletteId,
  customOverrides: ThemeCustomOverrides = {},
): ThemeColorTokens {
  activePaletteId = themePalettes[palette] ? palette : 'editorial';
  activeCustomOverrides = { ...customOverrides };
  const resolved = getThemeColors(activePaletteId, activeCustomOverrides);
  Object.assign(colors, resolved);
  for (const listener of themeListeners) {
    listener(activePaletteId, resolved);
  }
  return resolved;
}

export function getActiveThemePalette(): ThemePaletteId {
  return activePaletteId;
}

export function subscribeThemePalette(
  listener: (palette: ThemePaletteId, tokens: ThemeColorTokens) => void,
): () => void {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

export const liquidGlass = {
  grey: {
    surface: 'rgba(236, 239, 244, 0.78)',
    surfaceElevated: 'rgba(247, 248, 250, 0.84)',
    refractionTint: 'rgba(255, 255, 255, 0.42)',
    causticHighlight: 'rgba(255, 255, 255, 0.65)',
    borderOuter: 'rgba(255, 255, 255, 0.68)',
    borderInner: 'rgba(174, 181, 192, 0.36)',
    grabber: 'rgba(76, 82, 90, 0.34)',
  },
  white: {
    surface: 'rgba(255, 255, 255, 0.80)',
    surfaceElevated: 'rgba(248, 249, 250, 0.88)',
    refractionTint: 'rgba(240, 244, 248, 0.48)',
    causticHighlight: 'rgba(255, 255, 255, 0.82)',
    borderOuter: 'rgba(255, 255, 255, 0.88)',
    borderInner: 'rgba(220, 224, 229, 0.52)',
    grabber: 'rgba(80, 86, 94, 0.28)',
  },
  editorial: {
    surface: 'rgba(242, 239, 230, 0.80)',
    surfaceElevated: 'rgba(252, 250, 245, 0.86)',
    refractionTint: 'rgba(255, 252, 245, 0.46)',
    causticHighlight: 'rgba(255, 255, 255, 0.68)',
    borderOuter: 'rgba(255, 253, 248, 0.74)',
    borderInner: 'rgba(221, 216, 203, 0.48)',
    grabber: 'rgba(98, 102, 92, 0.32)',
  },
} as const;

export const legoPalette = [
  { name: 'Bright Red', hex: '#E3000B', baseColorFactor: [0.89, 0.0, 0.043, 1.0] as const },
  { name: 'Bright Yellow', hex: '#F5CD2F', baseColorFactor: [0.961, 0.804, 0.184, 1.0] as const },
  { name: 'Bright Blue', hex: '#0055BF', baseColorFactor: [0.0, 0.333, 0.749, 1.0] as const },
  { name: 'Bright Green', hex: '#237841', baseColorFactor: [0.137, 0.471, 0.255, 1.0] as const },
  { name: 'Bright Orange', hex: '#FE8A18', baseColorFactor: [0.996, 0.541, 0.094, 1.0] as const },
  { name: 'Medium Lavender', hex: '#923978', baseColorFactor: [0.573, 0.224, 0.471, 1.0] as const },
  { name: 'Bright Teal', hex: '#008F9B', baseColorFactor: [0.0, 0.561, 0.608, 1.0] as const },
  { name: 'Coral Red', hex: '#FF698F', baseColorFactor: [1.0, 0.412, 0.561, 1.0] as const },
] as const;

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
  display: { fontFamily: 'serif', fontSize: 40, lineHeight: 46, fontWeight: '400' as const, letterSpacing: -0.7 },
  pageTitle: { fontFamily: 'serif', fontSize: 32, lineHeight: 39, fontWeight: '400' as const, letterSpacing: -0.4 },
  hero: { fontFamily: 'serif', fontSize: 27, lineHeight: 34, fontWeight: '400' as const, letterSpacing: -0.3 },
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
  sheetSpring: {
    damping: 26,
    stiffness: 240,
    mass: 0.72,
    overshootClamping: false,
  },
} as const;

export const shadow = {
  floating: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  quiet: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  liquidSheet: {
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -10 },
    elevation: 12,
  },
} as const;

export const layout = {
  contentMax: 820,
  readingMax: 620,
  minTouch: 48,
  pageInset: 24,
} as const;
