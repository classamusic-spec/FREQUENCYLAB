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
  // The instrument's case. Porcelain white with a cool undertone, stepped by
  // real luminance so raised and recessed forms separate without any hue shift.
  void: '#EEF1F5',
  chassis: '#F4F6F9',
  panelRecessed: '#E6EAF0',
  panel: '#FDFDFE',
  panelRaised: '#FFFFFF',
  panelHigh: '#FFFFFF',
  bezel: '#DCE1E8',

  // Ink is printed onto porcelain, so it is near-black rather than pure black.
  inkPrimary: '#171B21',
  inkSecondary: '#5C6675',
  inkTertiary: '#8B95A2',
  inkDisabled: '#B9C1CC',

  /** The single illumination colour: instrument blue. */
  signal: '#3B8BF5',
  signalDim: '#A7C9F7',
  signalGlow: 'rgba(59, 139, 245, 0.22)',

  // Display wells. The readout areas are recessed porcelain now, not dark
  // glass: values are printed in ink and lit in signal blue.
  display: '#F1F4F8',
  displayDeep: '#EAEEF3',
  displayInk: '#171B21',
  displaySignal: '#2E7FE8',
  displayDim: 'rgba(23, 27, 33, 0.38)',

  warning: '#D98600',
  limit: '#E5484D',
  experiment: '#8B5CF6',
  evidenceStrong: '#1E9E6A',
  evidencePromising: '#3B8BF5',
  evidenceLimited: '#B98900',
  evidenceTraditional: '#7A7594',
  evidenceUnsupported: '#E5484D',
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
  edgeDark: 'rgba(116, 130, 152, 0.20)',
  hairline: 'rgba(96, 108, 128, 0.12)',
  hairlineStrong: 'rgba(88, 100, 120, 0.22)',
  engraving: 'rgba(70, 80, 99, 0.28)',

  scrim: 'rgba(30, 38, 50, 0.38)',

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

/**
 * The archive's ratings, on the same ramp.
 *
 * The archive rates two independent things — how well sourced a record is, and
 * how well supported the effect is — so it needs two scales. They share this
 * palette so a user reads them the same way, but they are never combined into a
 * single score: a perfectly documented historical claim is still a claim.
 */
export const archiveEvidenceColors = {
  'research-supported': palette.evidenceStrong,
  preliminary: palette.evidencePromising,
  historical: palette.evidenceTraditional,
  traditional: palette.evidenceTraditional,
  experimental: palette.evidenceLimited,
  'unsupported-medical-claim': palette.evidenceUnsupported,
} as const;

export const verificationColors = {
  'primary-historical': palette.evidenceStrong,
  'secondary-historical': palette.evidencePromising,
  'modern-compilation': palette.evidenceLimited,
  'community-submitted': palette.evidenceLimited,
  'source-unclear': palette.evidenceTraditional,
  unverified: palette.inkTertiary,
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
  engraved: 4,
  control: 14,
  panel: 18,
  card: 22,
  sheet: 30,
  pill: 999,
} as const;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;

/** Minimum touch target, per the accessibility guidelines (§50). */
export const MIN_TOUCH_TARGET = 44;

export const fonts = {
  /** Interface sans. Falls back to the platform face until fonts load. */
  sans: 'Inter_400Regular',
  sansLight: 'Inter_300Light',
  sansMedium: 'Inter_500Medium',
  sansSemibold: 'Inter_600SemiBold',
  /** Small technical readouts (DNA, fingerprints) stay monospaced. */
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
  hero: { fontFamily: fonts.sansLight, fontSize: 64, letterSpacing: -2, lineHeight: 68 },
  readoutXl: { fontFamily: fonts.sansLight, fontSize: 46, letterSpacing: -1.2, lineHeight: 50 },
  readoutLg: { fontFamily: fonts.sansLight, fontSize: 30, letterSpacing: -0.6, lineHeight: 34 },
  readout: { fontFamily: fonts.sans, fontSize: 19, letterSpacing: -0.2, lineHeight: 24 },
  readoutSm: { fontFamily: fonts.sansMedium, fontSize: 13, letterSpacing: 0, lineHeight: 17 },
  readoutXs: { fontFamily: fonts.sansMedium, fontSize: 11, letterSpacing: 0.2, lineHeight: 14 },

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
