import { Platform, type TextStyle } from 'react-native';

/**
 * FREQUENCY LAB design tokens.
 *
 * The visual target is a precision instrument rendered in software: anodised
 * graphite, engraved markings, recessed panels, and exactly one illumination
 * colour. Everything expensive about the interface comes from proportion,
 * spacing, hairlines and restraint — not from things glowing.
 *
 * Rules this file encodes:
 *  - one dominant accent (`signal`), used only where something is genuinely live;
 *  - secondary colour reserved for state (warning, limit, experiment, evidence);
 *  - surfaces separated by luminance and hairlines, never by hue;
 *  - a single spacing scale, so panel rhythm stays consistent across screens.
 */

const palette = {
  // Graphite stack. Each step is a real luminance change, so panels read as
  // physical layers rather than as translucent cards.
  void: '#08090B',
  chassis: '#0C0E12',
  panelRecessed: '#101318',
  panel: '#141820',
  panelRaised: '#1A1F28',
  panelHigh: '#222835',
  bezel: '#2C3340',

  inkPrimary: '#EDF1F5',
  inkSecondary: '#96A0AD',
  inkTertiary: '#5C6673',
  inkDisabled: '#3A424D',

  /** The single illumination colour. Used sparingly and never as a fill. */
  signal: '#4DD6C1',
  signalDim: '#2A7A6E',
  signalGlow: 'rgba(77, 214, 193, 0.22)',

  warning: '#E5A45C',
  limit: '#E0705C',
  experiment: '#C86F8C',
  evidenceStrong: '#5FC7B0',
  evidencePromising: '#8FB3D9',
  evidenceLimited: '#C4B58E',
  evidenceTraditional: '#9A93A8',
  evidenceUnsupported: '#E0705C',
} as const;

export const colors = {
  ...palette,

  background: palette.void,
  surface: palette.panel,
  surfaceRecessed: palette.panelRecessed,
  surfaceRaised: palette.panelRaised,
  surfaceHigh: palette.panelHigh,

  /** Top edge of a raised element catching light. */
  edgeLight: 'rgba(255, 255, 255, 0.07)',
  /** Bottom edge of a recessed element. */
  edgeDark: 'rgba(0, 0, 0, 0.55)',
  hairline: 'rgba(255, 255, 255, 0.055)',
  hairlineStrong: 'rgba(255, 255, 255, 0.10)',
  engraving: 'rgba(0, 0, 0, 0.45)',

  scrim: 'rgba(6, 7, 9, 0.82)',

  text: palette.inkPrimary,
  textSecondary: palette.inkSecondary,
  textTertiary: palette.inkTertiary,
  textDisabled: palette.inkDisabled,
} as const;

export const evidenceColors = {
  stronger: palette.evidenceStrong,
  promising: palette.evidencePromising,
  limited: palette.evidenceLimited,
  traditional: palette.evidenceTraditional,
  unsupported: palette.evidenceUnsupported,
} as const;

/** 4-point base scale. Panels align to it; nothing uses an arbitrary margin. */
export const space = {
  hair: 2,
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  vast: 56,
} as const;

export const radius = {
  engraved: 3,
  control: 8,
  panel: 12,
  card: 16,
  sheet: 24,
  pill: 999,
} as const;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;

/** Minimum touch target, per the accessibility guidelines (§50). */
export const MIN_TOUCH_TARGET = 44;

export const fonts = {
  /** Interface sans. Falls back to the platform face until fonts load. */
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemibold: 'Inter_600SemiBold',
  /** Numeric readouts. Monospaced so digits do not shift as values change. */
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoSemibold: 'IBMPlexMono_600SemiBold',
  monoLight: 'IBMPlexMono_300Light',
} as const;

/**
 * Type scale.
 *
 * `readout` sizes are for numbers and always use the mono face with tabular
 * figures; `label` sizes are the engraved hardware labels — small, uppercase,
 * widely tracked, and never used for sentences.
 */
export const type = {
  hero: { fontFamily: fonts.monoLight, fontSize: 64, letterSpacing: -1.5, lineHeight: 68 },
  readoutXl: { fontFamily: fonts.monoLight, fontSize: 44, letterSpacing: -0.8, lineHeight: 48 },
  readoutLg: { fontFamily: fonts.mono, fontSize: 28, letterSpacing: -0.3, lineHeight: 32 },
  readout: { fontFamily: fonts.mono, fontSize: 18, letterSpacing: 0, lineHeight: 22 },
  readoutSm: { fontFamily: fonts.mono, fontSize: 13, letterSpacing: 0, lineHeight: 16 },
  readoutXs: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.2, lineHeight: 14 },

  title: { fontFamily: fonts.sansSemibold, fontSize: 22, letterSpacing: -0.4, lineHeight: 28 },
  heading: { fontFamily: fonts.sansSemibold, fontSize: 17, letterSpacing: -0.2, lineHeight: 22 },
  body: { fontFamily: fonts.sans, fontSize: 15, letterSpacing: -0.1, lineHeight: 22 },
  bodySm: { fontFamily: fonts.sans, fontSize: 13, letterSpacing: 0, lineHeight: 19 },
  caption: { fontFamily: fonts.sans, fontSize: 12, letterSpacing: 0, lineHeight: 17 },

  /** Engraved hardware labels. */
  label: { fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 1.4, lineHeight: 13 },
  labelLg: { fontFamily: fonts.sansMedium, fontSize: 12, letterSpacing: 1.6, lineHeight: 15 },
} as const;

/** Tabular figures, so a changing readout never reflows. */
export const tabularNums: TextStyle = { fontVariant: ['tabular-nums'] };

export const shadows = {
  /** A panel sitting proud of the chassis. */
  raised: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.55,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
    },
    default: { elevation: 6 },
  }) as object,
  control: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.45,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    default: { elevation: 3 },
  }) as object,
  sheet: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.7,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: -8 },
    },
    default: { elevation: 18 },
  }) as object,
} as const;

/**
 * Motion.
 *
 * Durations and easings describe weight: controls have mass, panels settle,
 * nothing bounces. `reduced` is not a smaller version of the same animation —
 * it is the absence of movement, with state changes made instant.
 */
export const motion = {
  instant: 90,
  quick: 160,
  standard: 260,
  settle: 420,
  slow: 720,
  /** Cubic bezier control points for a weighted, decelerating movement. */
  easing: { x1: 0.16, y1: 1, x2: 0.3, y2: 1 },
  easingIn: { x1: 0.5, y1: 0, x2: 0.75, y2: 0 },
} as const;

export const layout = {
  screenPadding: space.xl,
  panelPadding: space.lg,
  maxContentWidth: 640,
  transportHeight: 88,
} as const;

/**
 * Frequency bands, shared by Explorer, the session display and the library.
 * The copy is deliberate: these are conventional descriptions of measured
 * activity, not switches, and the UI says so wherever it shows them.
 */
export const BANDS = [
  { key: 'delta', label: 'Delta', low: 0.5, high: 4 },
  { key: 'theta', label: 'Theta', low: 4, high: 8 },
  { key: 'alpha', label: 'Alpha', low: 8, high: 13 },
  { key: 'beta', label: 'Beta', low: 13, high: 30 },
  { key: 'gamma', label: 'Gamma', low: 30, high: 100 },
] as const;

export type BandKey = (typeof BANDS)[number]['key'];

export function bandForFrequency(hz: number): (typeof BANDS)[number] | undefined {
  return BANDS.find((band) => hz >= band.low && hz < band.high);
}
