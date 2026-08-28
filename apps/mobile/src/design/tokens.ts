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
  // The instrument's case. A cool anodised light grey, stepped by real
  // luminance so raised and recessed forms separate without any hue shift.
  void: '#DDE2E9',
  chassis: '#E6EAF0',
  panelRecessed: '#D3D9E2',
  panel: '#F4F6FA',
  panelRaised: '#FBFCFE',
  panelHigh: '#FFFFFF',
  bezel: '#2B323C',

  // Ink is engraved into metal, so it is near-black rather than pure black —
  // a cut in aluminium never reads as ink on paper.
  inkPrimary: '#141920',
  inkSecondary: '#525C6A',
  inkTertiary: '#7D8794',
  inkDisabled: '#A8B0BC',

  /** The single illumination colour, on the chassis. */
  signal: '#0E9E8F',
  signalDim: '#7FBFB7',
  signalGlow: 'rgba(14, 158, 143, 0.18)',

  // Display glass and the light emitted through it. Readouts live here, and
  // this is the one place the interface is genuinely dark.
  display: '#0B0F14',
  displayDeep: '#070A0E',
  displayInk: '#E9F6F3',
  displaySignal: '#35D6C4',
  displayDim: 'rgba(233, 246, 243, 0.34)',

  warning: '#C97A1E',
  limit: '#C4483A',
  experiment: '#A8517A',
  evidenceStrong: '#0E9E8F',
  evidencePromising: '#3D7EA6',
  evidenceLimited: '#9A8340',
  evidenceTraditional: '#6F6A82',
  evidenceUnsupported: '#C4483A',
} as const;

export const colors = {
  ...palette,

  background: palette.void,
  surface: palette.panel,
  surfaceRecessed: palette.panelRecessed,
  surfaceRaised: palette.panelRaised,
  surfaceHigh: palette.panelHigh,

  /** Top edge of a raised form, catching the light. */
  edgeLight: 'rgba(255, 255, 255, 0.95)',
  /** Underside of a raised form, in its own shadow. */
  edgeDark: 'rgba(83, 95, 112, 0.28)',
  hairline: 'rgba(90, 102, 120, 0.14)',
  hairlineStrong: 'rgba(84, 96, 114, 0.26)',
  engraving: 'rgba(72, 83, 99, 0.30)',

  scrim: 'rgba(28, 34, 44, 0.44)',

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
      shadowColor: '#2A3140',
      shadowOpacity: 0.16,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
    },
    default: { elevation: 8 },
  }) as object,
  control: Platform.select({
    ios: {
      shadowColor: '#1D2430',
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
    },
    default: { elevation: 4 },
  }) as object,
  sheet: Platform.select({
    ios: {
      shadowColor: '#161C26',
      shadowOpacity: 0.34,
      shadowRadius: 40,
      shadowOffset: { width: 0, height: -12 },
    },
    default: { elevation: 24 },
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
