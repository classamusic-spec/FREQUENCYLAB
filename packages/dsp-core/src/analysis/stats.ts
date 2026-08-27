import { Rng } from '../math/rng.js';

/**
 * Small statistics toolkit for N-of-1 analysis.
 *
 * Everything here reports uncertainty alongside the estimate. The product's
 * review standard (§73) is that no comparison is shown without its sample size
 * and spread, so these functions are shaped to make that easy rather than
 * optional.
 */

export interface Summary {
  n: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  median: number;
  /** Standard error of the mean. */
  sem: number;
}

export function summarise(values: readonly number[]): Summary {
  const n = values.length;
  if (n === 0) {
    return { n: 0, mean: 0, sd: 0, min: 0, max: 0, median: 0, sem: 0 };
  }
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    sum += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const mean = sum / n;
  let variance = 0;
  for (const value of values) variance += (value - mean) ** 2;
  // Sample variance (n-1): these are samples from the user's ongoing
  // behaviour, not a complete population.
  const sd = n > 1 ? Math.sqrt(variance / (n - 1)) : 0;
  const sorted = [...values].sort((a, b) => a - b);
  const median =
    n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return { n, mean, sd, min, max, median, sem: n > 0 ? sd / Math.sqrt(n) : 0 };
}

/** Cohen's d with a pooled standard deviation. */
export function cohensD(a: readonly number[], b: readonly number[]): number {
  const sa = summarise(a);
  const sb = summarise(b);
  if (sa.n < 2 || sb.n < 2) return 0;
  const pooled = Math.sqrt(
    ((sa.n - 1) * sa.sd ** 2 + (sb.n - 1) * sb.sd ** 2) / (sa.n + sb.n - 2),
  );
  return pooled === 0 ? 0 : (sa.mean - sb.mean) / pooled;
}

export interface WelchResult {
  t: number;
  df: number;
  /** Two-tailed p-value. */
  p: number;
}

/**
 * Welch's t-test — the unequal-variance form, which is the right default when
 * two arms may differ in how consistently they perform, not just on average.
 */
export function welchTTest(a: readonly number[], b: readonly number[]): WelchResult {
  const sa = summarise(a);
  const sb = summarise(b);
  if (sa.n < 2 || sb.n < 2) return { t: 0, df: 0, p: 1 };
  const va = sa.sd ** 2 / sa.n;
  const vb = sb.sd ** 2 / sb.n;
  const denominator = Math.sqrt(va + vb);
  if (denominator === 0) return { t: 0, df: 0, p: 1 };
  const t = (sa.mean - sb.mean) / denominator;
  const df =
    (va + vb) ** 2 / (va ** 2 / (sa.n - 1) + vb ** 2 / (sb.n - 1));
  return { t, df, p: 2 * (1 - studentTCdf(Math.abs(t), df)) };
}

/** CDF of Student's t, via the regularised incomplete beta function. */
export function studentTCdf(t: number, df: number): number {
  if (df <= 0) return 0.5;
  const x = df / (df + t * t);
  const probability = 0.5 * incompleteBeta(x, df / 2, 0.5);
  return t > 0 ? 1 - probability : probability;
}

function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta =
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  // Continued fraction converges quickly on the correct side of the symmetry.
  if (x < (a + 1) / (a + b + 2)) {
    return (Math.exp(lbeta) * betaContinuedFraction(x, a, b)) / a;
  }
  return 1 - (Math.exp(lbeta) * betaContinuedFraction(1 - x, b, a)) / b;
}

function betaContinuedFraction(x: number, a: number, b: number): number {
  const tiny = 1e-30;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let result = d;

  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let numerator = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + numerator / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    result *= d * c;

    numerator = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + numerator / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) < 3e-7) break;
  }
  return result;
}

function logGamma(x: number): number {
  // Lanczos approximation, g = 7, n = 9.
  const coefficients = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const z = x - 1;
  let a = coefficients[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += coefficients[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

export interface ConfidenceInterval {
  low: number;
  high: number;
  level: number;
}

/**
 * Bootstrap confidence interval for the difference in means.
 *
 * Bootstrapping rather than a normal approximation because N-of-1 samples are
 * small and often skewed. Seeded so the same data always yields the same
 * interval — a user who reopens a result must not see the numbers move.
 */
export function bootstrapDifferenceCi(
  a: readonly number[],
  b: readonly number[],
  level = 0.95,
  iterations = 4000,
  seed = 'frequencylab-bootstrap',
): ConfidenceInterval {
  if (a.length < 2 || b.length < 2) return { low: 0, high: 0, level };
  const rng = new Rng(seed);
  const differences = new Float64Array(iterations);
  for (let i = 0; i < iterations; i++) {
    let sumA = 0;
    for (let j = 0; j < a.length; j++) sumA += a[rng.nextInt(a.length)];
    let sumB = 0;
    for (let j = 0; j < b.length; j++) sumB += b[rng.nextInt(b.length)];
    differences[i] = sumA / a.length - sumB / b.length;
  }
  const sorted = Array.from(differences).sort((x, y) => x - y);
  const tail = (1 - level) / 2;
  return {
    low: sorted[Math.floor(tail * iterations)],
    high: sorted[Math.min(iterations - 1, Math.floor((1 - tail) * iterations))],
    level,
  };
}

/** Pearson correlation. Returns 0 rather than NaN for degenerate input. */
export function correlation(xs: readonly number[], ys: readonly number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const denominator = Math.sqrt(sxx * syy);
  return denominator === 0 ? 0 : sxy / denominator;
}

export interface Trend {
  /** Change in y per unit of x. */
  slope: number;
  intercept: number;
  /** Coefficient of determination. */
  r2: number;
}

export function linearTrend(xs: readonly number[], ys: readonly number[]): Trend {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { slope: 0, intercept: n === 1 ? ys[0] : 0, r2: 0 };
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - meanX) * (ys[i] - meanY);
    sxx += (xs[i] - meanX) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;
  let ssTotal = 0;
  let ssResidual = 0;
  for (let i = 0; i < n; i++) {
    ssTotal += (ys[i] - meanY) ** 2;
    ssResidual += (ys[i] - (intercept + slope * xs[i])) ** 2;
  }
  return { slope, intercept, r2: ssTotal === 0 ? 0 : 1 - ssResidual / ssTotal };
}
