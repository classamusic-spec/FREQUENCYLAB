import { TWO_PI } from './constants.js';

/**
 * Radix-2 in-place FFT. Powers both the on-device spectrum analyser and the
 * offline DSP validation suite, so the same code path proves what the user sees.
 * Twiddle factors are cached per size; nothing is allocated per call once warm.
 */
export class Fft {
  readonly size: number;
  private readonly cosTable: Float64Array;
  private readonly sinTable: Float64Array;
  private readonly reverseTable: Uint32Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) {
      throw new Error(`FFT size must be a power of two, received ${size}`);
    }
    this.size = size;
    const half = size >> 1;
    this.cosTable = new Float64Array(half);
    this.sinTable = new Float64Array(half);
    for (let i = 0; i < half; i++) {
      this.cosTable[i] = Math.cos((TWO_PI * i) / size);
      this.sinTable[i] = Math.sin((TWO_PI * i) / size);
    }
    this.reverseTable = new Uint32Array(size);
    const bits = Math.log2(size);
    for (let i = 0; i < size; i++) {
      let reversed = 0;
      for (let b = 0; b < bits; b++) {
        reversed = (reversed << 1) | ((i >>> b) & 1);
      }
      this.reverseTable[i] = reversed;
    }
  }

  /** In-place complex transform. `real` and `imag` must both be `size` long. */
  transform(real: Float64Array, imag: Float64Array): void {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      const j = this.reverseTable[i];
      if (j > i) {
        let tmp = real[i];
        real[i] = real[j];
        real[j] = tmp;
        tmp = imag[i];
        imag[i] = imag[j];
        imag[j] = tmp;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const halfSize = size >> 1;
      const tableStep = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + halfSize; j++, k += tableStep) {
          const cos = this.cosTable[k];
          const sin = this.sinTable[k];
          const l = j + halfSize;
          const tre = real[l] * cos + imag[l] * sin;
          const tim = -real[l] * sin + imag[l] * cos;
          real[l] = real[j] - tre;
          imag[l] = imag[j] - tim;
          real[j] += tre;
          imag[j] += tim;
        }
      }
    }
  }

  /**
   * Magnitude spectrum of a real signal, normalised so a full-scale sine reads
   * 1.0 at its bin. Output length is `size / 2`.
   */
  magnitudeSpectrum(input: Float32Array | Float64Array, window: Float64Array | null = null): Float64Array {
    const n = this.size;
    const real = new Float64Array(n);
    const imag = new Float64Array(n);
    let coherentGain = 1;
    if (window) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        real[i] = (input[i] ?? 0) * window[i];
        sum += window[i];
      }
      coherentGain = sum / n;
    } else {
      for (let i = 0; i < n; i++) real[i] = input[i] ?? 0;
    }
    this.transform(real, imag);
    const half = n >> 1;
    const out = new Float64Array(half);
    const scale = 2 / (n * coherentGain);
    for (let i = 0; i < half; i++) {
      out[i] = Math.hypot(real[i], imag[i]) * scale;
    }
    out[0] *= 0.5;
    return out;
  }
}

export function hannWindow(size: number): Float64Array {
  const w = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((TWO_PI * i) / (size - 1)));
  }
  return w;
}

export function blackmanHarrisWindow(size: number): Float64Array {
  const w = new Float64Array(size);
  const a0 = 0.35875;
  const a1 = 0.48829;
  const a2 = 0.14128;
  const a3 = 0.01168;
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    w[i] =
      a0 -
      a1 * Math.cos(TWO_PI * t) +
      a2 * Math.cos(2 * TWO_PI * t) -
      a3 * Math.cos(3 * TWO_PI * t);
  }
  return w;
}

/**
 * Goertzel magnitude at one frequency. Far cheaper than a full FFT when a test
 * only needs to confirm energy at a known frequency (channel separation,
 * modulation sideband checks).
 */
export function goertzelMagnitude(
  signal: Float32Array | Float64Array,
  frequency: number,
  sampleRate: number,
  offset = 0,
  length = signal.length - offset,
): number {
  const k = (length * frequency) / sampleRate;
  const omega = (TWO_PI * k) / length;
  const cosine = Math.cos(omega);
  const coeff = 2 * cosine;
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < length; i++) {
    s0 = (signal[offset + i] ?? 0) + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const real = s1 - s2 * cosine;
  const imag = s2 * Math.sin(omega);
  return (2 * Math.hypot(real, imag)) / length;
}

/**
 * Estimates the dominant frequency of a signal by parabolic interpolation
 * around the largest FFT bin. Accurate to well under a bin for steady tones,
 * which is what the oscillator accuracy tests require.
 */
export function estimateDominantFrequency(
  signal: Float32Array | Float64Array,
  sampleRate: number,
  fftSize = 1 << 15,
): number {
  const n = Math.min(fftSize, 1 << Math.floor(Math.log2(signal.length)));
  const fft = new Fft(n);
  const window = blackmanHarrisWindow(n);
  const spectrum = fft.magnitudeSpectrum(signal.subarray(0, n) as Float32Array, window);
  let peak = 1;
  for (let i = 2; i < spectrum.length - 1; i++) {
    if (spectrum[i] > spectrum[peak]) peak = i;
  }
  const alpha = Math.log(Math.max(spectrum[peak - 1], 1e-20));
  const beta = Math.log(Math.max(spectrum[peak], 1e-20));
  const gamma = Math.log(Math.max(spectrum[peak + 1], 1e-20));
  const denominator = alpha - 2 * beta + gamma;
  const delta = denominator === 0 ? 0 : (0.5 * (alpha - gamma)) / denominator;
  return ((peak + delta) * sampleRate) / n;
}
