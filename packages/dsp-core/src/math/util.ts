import { SILENCE_FLOOR, TWO_PI } from './constants.js';

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Maps `value` from range [inMin,inMax] onto [outMin,outMax] without clamping. */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return outMin;
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  const g = Math.abs(gain);
  return g < SILENCE_FLOOR ? -Infinity : 20 * Math.log10(g);
}

/** Wraps a phase in radians into [0, 2π). */
export function wrapPhase(phase: number): number {
  let p = phase % TWO_PI;
  if (p < 0) p += TWO_PI;
  return p;
}

/** Wraps a normalised phase into [0, 1). */
export function wrapUnit(phase: number): number {
  let p = phase % 1;
  if (p < 0) p += 1;
  return p;
}

/**
 * Rounds to a fixed number of decimals using a stable string round-trip.
 * Used by protocol canonicalisation so fingerprints are reproducible across
 * platforms with slightly different floating point printing.
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  const scaled = value * factor;
  // Nudge away from binary representation error before rounding half-up.
  const rounded = Math.round(scaled + (scaled >= 0 ? 1e-9 : -1e-9));
  const result = rounded / factor;
  return Object.is(result, -0) ? 0 : result;
}

/** Formats a Hz value the way the instrument displays it: `007.830`. */
export function formatHz(value: number, integerDigits = 3, decimals = 3): string {
  const safe = Number.isFinite(value) ? value : 0;
  const fixed = Math.abs(safe).toFixed(decimals);
  const [whole, frac] = fixed.split('.');
  const padded = whole.padStart(integerDigits, '0');
  const sign = safe < 0 ? '-' : '';
  return frac ? `${sign}${padded}.${frac}` : `${sign}${padded}`;
}

/** Formats seconds as `MM:SS`, or `H:MM:SS` past an hour. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Equal-power pan law. `pan` runs -1 (hard left) .. +1 (hard right). */
export function equalPowerPan(pan: number): { left: number; right: number } {
  const p = (clamp(pan, -1, 1) + 1) * 0.5;
  const angle = p * (Math.PI / 2);
  return { left: Math.cos(angle), right: Math.sin(angle) };
}

/** Time constant for a one-pole smoother reaching ~63% in `seconds`. */
export function onePoleCoefficient(seconds: number, sampleRate: number): number {
  if (seconds <= 0) return 1;
  return 1 - Math.exp(-1 / (seconds * sampleRate));
}
