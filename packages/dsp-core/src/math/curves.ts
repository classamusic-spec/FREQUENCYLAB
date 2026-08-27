import { clamp, lerp } from './util.js';

/**
 * Interpolation shapes shared by automation lanes, frequency sweeps and stage
 * cross-fades. `bezier` uses a single tension control point expressed as a
 * normalised (x, y) pair so a curve can be dragged in the timeline editor.
 */
export type CurveKind = 'linear' | 'exponential' | 'logarithmic' | 'smooth' | 'stepped' | 'bezier';

export interface CurveSpec {
  kind: CurveKind;
  /** Bezier control point x, 0..1. Ignored for other kinds. */
  cx?: number;
  /** Bezier control point y, 0..1. Ignored for other kinds. */
  cy?: number;
}

const EXP_K = 3.5;

/**
 * Maps a normalised progress `t` (0..1) through a curve shape.
 * Returns a normalised 0..1 position, which callers then map onto a value range.
 */
export function curveShape(t: number, spec: CurveSpec): number {
  const x = clamp(t, 0, 1);
  switch (spec.kind) {
    case 'linear':
      return x;
    case 'stepped':
      // Holds the start value for the whole segment; the jump happens at the end.
      return x >= 1 ? 1 : 0;
    case 'smooth':
      // Smoothstep: zero first derivative at both ends, so parameter changes
      // start and finish without an audible corner.
      return x * x * (3 - 2 * x);
    case 'exponential':
      // Slow start, fast finish. exp(k*x) normalised so f(0)=0 and f(1)=1.
      return (Math.exp(EXP_K * x) - 1) / (Math.exp(EXP_K) - 1);
    case 'logarithmic':
      // Mirror of exponential: fast start, slow finish.
      return Math.log1p(EXP_K * x) / Math.log1p(EXP_K);
    case 'bezier':
      return cubicBezierY(x, spec.cx ?? 0.5, spec.cy ?? 0.5);
    default:
      return x;
  }
}

/**
 * Interpolates between two values through a curve.
 * For `exponential` on strictly positive endpoints the interpolation happens in
 * the log domain, which is what the ear expects from a frequency sweep
 * (constant ratio per unit time rather than constant Hz per unit time).
 */
export function curveValue(from: number, to: number, t: number, spec: CurveSpec): number {
  if (spec.kind === 'exponential' && from > 0 && to > 0) {
    const x = clamp(t, 0, 1);
    return from * Math.pow(to / from, x);
  }
  return lerp(from, to, curveShape(t, spec));
}

/**
 * Evaluates the y of a cubic bezier with endpoints (0,0) and (1,1) and a single
 * mirrored control point, for a given x. Newton iterations then a bisection
 * fallback — the same approach browsers use for `cubic-bezier()` easing.
 */
export function cubicBezierY(x: number, cx: number, cy: number): number {
  const x1 = clamp(cx, 0, 1);
  const y1 = clamp(cy, 0, 1);
  const x2 = 1 - x1;
  const y2 = 1 - y1;

  const bezX = (t: number): number => {
    const mt = 1 - t;
    return 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t;
  };
  const bezXDerivative = (t: number): number => {
    const mt = 1 - t;
    return 3 * mt * mt * x1 + 6 * mt * t * (x2 - x1) + 3 * t * t * (1 - x2);
  };
  const bezY = (t: number): number => {
    const mt = 1 - t;
    return 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t;
  };

  let t = x;
  for (let i = 0; i < 6; i++) {
    const error = bezX(t) - x;
    if (Math.abs(error) < 1e-6) return bezY(t);
    const d = bezXDerivative(t);
    if (Math.abs(d) < 1e-9) break;
    t -= error / d;
  }
  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < 32; i++) {
    const value = bezX(t);
    if (Math.abs(value - x) < 1e-6) break;
    if (value > x) hi = t;
    else lo = t;
    t = (lo + hi) * 0.5;
  }
  return bezY(t);
}

export const CURVE_KINDS: readonly CurveKind[] = [
  'linear',
  'smooth',
  'exponential',
  'logarithmic',
  'stepped',
  'bezier',
];
