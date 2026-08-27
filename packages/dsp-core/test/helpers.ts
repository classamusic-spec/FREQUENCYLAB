import {
  Fft,
  blackmanHarrisWindow,
  estimateDominantFrequency,
  goertzelMagnitude,
  makeNode,
  type GraphNode,
  type NodeKind,
  type RoutingGraph,
} from '../src/index.js';

/** Builds a one-generator graph wired straight to the output. */
export function singleNodeGraph(
  kind: NodeKind,
  params: Record<string, number> = {},
  options: Record<string, string> = {},
): RoutingGraph {
  const node: GraphNode = makeNode('src', kind, params, options);
  return {
    nodes: [node, makeNode('output', 'output')],
    connections: [{ from: 'src', to: 'output' }],
  };
}

export function peak(signal: Float32Array, from = 0, to = signal.length): number {
  let max = 0;
  for (let i = from; i < to; i++) {
    const value = Math.abs(signal[i]);
    if (value > max) max = value;
  }
  return max;
}

export function rms(signal: Float32Array, from = 0, to = signal.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += signal[i] * signal[i];
  return Math.sqrt(sum / Math.max(1, to - from));
}

/** Largest single-sample step. A click shows up here before it shows up by ear. */
export function maxStep(signal: Float32Array, from = 1, to = signal.length): number {
  let max = 0;
  for (let i = from; i < to; i++) {
    const delta = Math.abs(signal[i] - signal[i - 1]);
    if (delta > max) max = delta;
  }
  return max;
}

export function measureFrequency(
  signal: Float32Array,
  sampleRate: number,
  offsetSec = 0,
  windowSec = 0.68,
): number {
  const start = Math.round(offsetSec * sampleRate);
  const size = 1 << Math.floor(Math.log2(windowSec * sampleRate));
  return estimateDominantFrequency(signal.subarray(start, start + size), sampleRate, size);
}

export function magnitudeAt(
  signal: Float32Array,
  frequency: number,
  sampleRate: number,
  offsetSec = 0,
  windowSec = 0.5,
): number {
  const start = Math.round(offsetSec * sampleRate);
  const length = Math.round(windowSec * sampleRate);
  return goertzelMagnitude(signal, frequency, sampleRate, start, length);
}

/**
 * Mean power per FFT bin across a frequency band — i.e. average power spectral
 * density. Averaging rather than summing is what makes the measurement
 * independent of band width, so an octave comparison reports the true slope:
 * flat for white, -3 dB/octave for pink, -6 dB/octave for brown.
 */
export function bandPower(
  signal: Float32Array,
  sampleRate: number,
  lowHz: number,
  highHz: number,
  fftSize = 1 << 14,
): number {
  const fft = new Fft(fftSize);
  const window = blackmanHarrisWindow(fftSize);
  const hops = Math.max(1, Math.floor(signal.length / fftSize));
  let total = 0;
  for (let h = 0; h < hops; h++) {
    const spectrum = fft.magnitudeSpectrum(
      signal.subarray(h * fftSize, (h + 1) * fftSize) as Float32Array,
      window,
    );
    const lowBin = Math.max(1, Math.floor((lowHz * fftSize) / sampleRate));
    const highBin = Math.min(spectrum.length - 1, Math.ceil((highHz * fftSize) / sampleRate));
    let hopPower = 0;
    let bins = 0;
    for (let bin = lowBin; bin <= highBin; bin++) {
      hopPower += spectrum[bin] * spectrum[bin];
      bins++;
    }
    total += hopPower / Math.max(1, bins);
  }
  return total / hops;
}

/**
 * Envelope of a signal via full-wave rectification and a one-pole lowpass.
 * Used to measure the beat rate a listener would actually perceive.
 */
export function envelope(signal: Float32Array, sampleRate: number, cutoffHz = 30): Float32Array {
  const out = new Float32Array(signal.length);
  const coefficient = 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  let state = 0;
  for (let i = 0; i < signal.length; i++) {
    state += (Math.abs(signal[i]) - state) * coefficient;
    out[i] = state;
  }
  return out;
}

/**
 * Rate of a slow periodic signal, measured by mean crossings with hysteresis.
 *
 * The hysteresis band matters: an envelope always carries a little residual
 * ripple from the rectified carrier, and without it a single slow crossing
 * would be counted several times.
 */
export function crossingRate(
  signal: Float32Array,
  sampleRate: number,
  from = 0,
  to = signal.length,
): number {
  let mean = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = from; i < to; i++) {
    mean += signal[i];
    if (signal[i] < min) min = signal[i];
    if (signal[i] > max) max = signal[i];
  }
  mean /= Math.max(1, to - from);
  const hysteresis = (max - min) * 0.1;

  let transitions = 0;
  let above = signal[from] > mean;
  for (let i = from + 1; i < to; i++) {
    const value = signal[i];
    if (above && value < mean - hysteresis) {
      above = false;
      transitions++;
    } else if (!above && value > mean + hysteresis) {
      above = true;
      transitions++;
    }
  }
  return transitions / 2 / ((to - from) / sampleRate);
}

/** Per-window RMS, for checking that a level is genuinely steady. */
export function rmsProfile(
  signal: Float32Array,
  sampleRate: number,
  windowSec: number,
  fromSec = 0,
  toSec = signal.length / sampleRate,
): number[] {
  const windowSize = Math.max(1, Math.round(windowSec * sampleRate));
  const start = Math.round(fromSec * sampleRate);
  const end = Math.min(signal.length, Math.round(toSec * sampleRate));
  const profile: number[] = [];
  for (let i = start; i + windowSize <= end; i += windowSize) {
    let sum = 0;
    for (let j = i; j < i + windowSize; j++) sum += signal[j] * signal[j];
    profile.push(Math.sqrt(sum / windowSize));
  }
  return profile;
}
