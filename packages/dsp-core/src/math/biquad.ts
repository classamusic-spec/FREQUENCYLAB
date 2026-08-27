import { clamp } from './util.js';

export type BiquadKind = 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'lowshelf' | 'highshelf' | 'peaking';

interface Coefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/**
 * Transposed direct form II biquad. Used by the noise engine's tone control and
 * by the pink-noise shaping validation tests. Coefficients follow the Audio EQ
 * Cookbook (Robert Bristow-Johnson).
 */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private z1 = 0;
  private z2 = 0;

  constructor(
    private sampleRate: number,
    kind: BiquadKind = 'lowpass',
    frequency = 1000,
    q = Math.SQRT1_2,
    gainDb = 0,
  ) {
    this.set(kind, frequency, q, gainDb);
  }

  setSampleRate(sampleRate: number): void {
    this.sampleRate = sampleRate;
  }

  set(kind: BiquadKind, frequency: number, q: number, gainDb = 0): void {
    const nyquist = this.sampleRate * 0.5;
    const f = clamp(frequency, 1, nyquist * 0.99);
    const safeQ = Math.max(1e-4, q);
    const c = designBiquad(kind, f, safeQ, gainDb, this.sampleRate);
    this.b0 = c.b0;
    this.b1 = c.b1;
    this.b2 = c.b2;
    this.a1 = c.a1;
    this.a2 = c.a2;
  }

  reset(): void {
    this.z1 = 0;
    this.z2 = 0;
  }

  process(input: number): number {
    const output = this.b0 * input + this.z1;
    this.z1 = this.b1 * input - this.a1 * output + this.z2;
    this.z2 = this.b2 * input - this.a2 * output;
    return output;
  }

  processBlock(buffer: Float32Array, frames: number): void {
    for (let i = 0; i < frames; i++) buffer[i] = this.process(buffer[i]);
  }
}

function designBiquad(
  kind: BiquadKind,
  frequency: number,
  q: number,
  gainDb: number,
  sampleRate: number,
): Coefficients {
  const w0 = (2 * Math.PI * frequency) / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * q);
  const A = Math.pow(10, gainDb / 40);

  let b0: number;
  let b1: number;
  let b2: number;
  let a0: number;
  let a1: number;
  let a2: number;

  switch (kind) {
    case 'lowpass':
      b0 = (1 - cosW0) / 2;
      b1 = 1 - cosW0;
      b2 = (1 - cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    case 'highpass':
      b0 = (1 + cosW0) / 2;
      b1 = -(1 + cosW0);
      b2 = (1 + cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    case 'bandpass':
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    case 'notch':
      b0 = 1;
      b1 = -2 * cosW0;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    case 'peaking':
      b0 = 1 + alpha * A;
      b1 = -2 * cosW0;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cosW0;
      a2 = 1 - alpha / A;
      break;
    case 'lowshelf': {
      const sq = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cosW0 + sq);
      b1 = 2 * A * (A - 1 - (A + 1) * cosW0);
      b2 = A * (A + 1 - (A - 1) * cosW0 - sq);
      a0 = A + 1 + (A - 1) * cosW0 + sq;
      a1 = -2 * (A - 1 + (A + 1) * cosW0);
      a2 = A + 1 + (A - 1) * cosW0 - sq;
      break;
    }
    case 'highshelf': {
      const sq = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cosW0 + sq);
      b1 = -2 * A * (A - 1 + (A + 1) * cosW0);
      b2 = A * (A + 1 + (A - 1) * cosW0 - sq);
      a0 = A + 1 - (A - 1) * cosW0 + sq;
      a1 = 2 * (A - 1 - (A + 1) * cosW0);
      a2 = A + 1 - (A - 1) * cosW0 - sq;
      break;
    }
    default:
      return { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };
  }

  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** First-order DC blocker. Keeps modulated signals centred before the limiter. */
export class DcBlocker {
  private x1 = 0;
  private y1 = 0;

  constructor(private readonly r = 0.9995) {}

  reset(): void {
    this.x1 = 0;
    this.y1 = 0;
  }

  process(input: number): number {
    const output = input - this.x1 + this.r * this.y1;
    this.x1 = input;
    this.y1 = output;
    return output;
  }
}
