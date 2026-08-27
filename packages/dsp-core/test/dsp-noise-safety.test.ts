import { describe, expect, it } from 'vitest';
import {
  NoiseSource,
  StereoLimiter,
  dbToGain,
  gainToDb,
  renderGraphOffline,
} from '../src/index.js';
import { bandPower, peak, rms, singleNodeGraph } from './helpers.js';

const SR = 48000;

/** dB per octave of a noise source, measured between two octave-spaced bands. */
function spectralSlope(signal: Float32Array): number {
  const low = bandPower(signal, SR, 250, 500);
  const high = bandPower(signal, SR, 500, 1000);
  return 10 * Math.log10(high / low);
}

describe('noise engine', () => {
  it('generates a flat spectrum for white noise', () => {
    const graph = singleNodeGraph(
      'noise',
      { level: 0.5, width: 1, cutoff: 18000, resonance: 0.707, modDepth: 0, modRate: 0.1 },
      { color: 'white', filter: 'off' },
    );
    const { left } = renderGraphOffline(graph, 4, SR);
    expect(Math.abs(spectralSlope(left))).toBeLessThan(1.5);
  });

  it('rolls off at about -3 dB per octave for pink noise', () => {
    const graph = singleNodeGraph(
      'noise',
      { level: 0.5, width: 1, cutoff: 18000, resonance: 0.707, modDepth: 0, modRate: 0.1 },
      { color: 'pink', filter: 'off' },
    );
    const { left } = renderGraphOffline(graph, 4, SR);
    expect(spectralSlope(left)).toBeGreaterThan(-4.5);
    expect(spectralSlope(left)).toBeLessThan(-1.5);
  });

  it('rolls off at about -6 dB per octave for brown noise', () => {
    const graph = singleNodeGraph(
      'noise',
      { level: 0.5, width: 1, cutoff: 18000, resonance: 0.707, modDepth: 0, modRate: 0.1 },
      { color: 'brown', filter: 'off' },
    );
    const { left } = renderGraphOffline(graph, 4, SR);
    expect(spectralSlope(left)).toBeGreaterThan(-7.5);
    expect(spectralSlope(left)).toBeLessThan(-4.5);
  });

  it('never repeats — the second minute differs from the first', () => {
    const source = new NoiseSource('pink', 'repeat-check');
    const first: number[] = [];
    for (let i = 0; i < 4096; i++) first.push(source.next());
    // Advance a simulated minute, then compare.
    for (let i = 0; i < SR * 60; i++) source.next();
    let identical = 0;
    for (let i = 0; i < 4096; i++) if (Math.abs(source.next() - first[i]) < 1e-9) identical++;
    expect(identical).toBeLessThan(10);
  });

  it('is deterministic for a given node id', () => {
    const graph = singleNodeGraph(
      'noise',
      { level: 0.5, width: 0.5, cutoff: 8000, resonance: 0.707, modDepth: 0, modRate: 0.1 },
      { color: 'pink', filter: 'lowpass' },
    );
    const a = renderGraphOffline(graph, 0.5, SR);
    const b = renderGraphOffline(graph, 0.5, SR);
    expect(Array.from(a.left)).toEqual(Array.from(b.left));
    expect(Array.from(a.right)).toEqual(Array.from(b.right));
  });

  it('decorrelates the channels as width increases', () => {
    const correlationAt = (width: number): number => {
      const graph = singleNodeGraph(
        'noise',
        { level: 0.5, width, cutoff: 18000, resonance: 0.707, modDepth: 0, modRate: 0.1 },
        { color: 'white', filter: 'off' },
      );
      const { left, right } = renderGraphOffline(graph, 2, SR);
      let sumLR = 0;
      let sumLL = 0;
      let sumRR = 0;
      for (let i = SR; i < left.length; i++) {
        sumLR += left[i] * right[i];
        sumLL += left[i] * left[i];
        sumRR += right[i] * right[i];
      }
      return sumLR / Math.sqrt(sumLL * sumRR);
    };
    expect(correlationAt(0)).toBeGreaterThan(0.99);
    expect(correlationAt(1)).toBeLessThan(0.1);
  });

  it('keeps a roughly constant level across the width control', () => {
    const levelAt = (width: number): number => {
      const graph = singleNodeGraph(
        'noise',
        { level: 0.5, width, cutoff: 18000, resonance: 0.707, modDepth: 0, modRate: 0.1 },
        { color: 'white', filter: 'off' },
      );
      const { left } = renderGraphOffline(graph, 2, SR);
      return rms(left, SR);
    };
    const centre = levelAt(0);
    for (const width of [0.25, 0.5, 0.75, 1]) {
      expect(levelAt(width) / centre).toBeGreaterThan(0.7);
      expect(levelAt(width) / centre).toBeLessThan(1.4);
    }
  });
});

describe('master limiter', () => {
  const makeSine = (amplitude: number, frames: number): [Float32Array, Float32Array] => {
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      const value = Math.sin((2 * Math.PI * 220 * i) / SR) * amplitude;
      left[i] = value;
      right[i] = value;
    }
    return [left, right];
  };

  it('holds the ceiling on a signal four times too loud', () => {
    const limiter = new StereoLimiter(SR, { ceilingDb: -1 });
    const [left, right] = makeSine(4, SR);
    limiter.process(left, right, SR);
    const ceiling = dbToGain(-1);
    expect(peak(left, SR * 0.1)).toBeLessThanOrEqual(ceiling + 1e-6);
    expect(peak(right, SR * 0.1)).toBeLessThanOrEqual(ceiling + 1e-6);
  });

  it('reports the gain reduction it applied', () => {
    const limiter = new StereoLimiter(SR, { ceilingDb: -1 });
    const [left, right] = makeSine(2, SR);
    limiter.process(left, right, SR);
    const reduction = limiter.readGainReduction();
    // 2.0 against a -1 dBFS ceiling is about 7 dB of reduction.
    expect(reduction).toBeGreaterThan(5);
    expect(reduction).toBeLessThan(9);
  });

  it('passes a quiet signal through untouched', () => {
    const limiter = new StereoLimiter(SR, { ceilingDb: -1 });
    const [left, right] = makeSine(0.3, SR);
    const reference = Float32Array.from(left);
    limiter.process(left, right, SR);
    const latency = limiter.latencySamples;
    for (let i = SR / 2; i < SR - latency; i++) {
      expect(left[i]).toBeCloseTo(reference[i - latency], 5);
    }
    expect(limiter.readGainReduction()).toBeLessThan(0.01);
  });

  it('never lets a transient through before reduction is in place', () => {
    const limiter = new StereoLimiter(SR, { ceilingDb: -1, lookaheadMs: 5 });
    const left = new Float32Array(SR);
    const right = new Float32Array(SR);
    // Silence, then an instant full-scale burst — the hardest case for a limiter.
    for (let i = SR / 2; i < SR; i++) {
      const value = Math.sin((2 * Math.PI * 440 * i) / SR) * 3;
      left[i] = value;
      right[i] = value;
    }
    limiter.process(left, right, SR);
    expect(gainToDb(peak(left))).toBeLessThanOrEqual(-1 + 1e-6);
  });

  it('does not distort the stereo image while limiting', () => {
    const limiter = new StereoLimiter(SR, { ceilingDb: -1 });
    const left = new Float32Array(SR);
    const right = new Float32Array(SR);
    for (let i = 0; i < SR; i++) {
      left[i] = Math.sin((2 * Math.PI * 220 * i) / SR) * 3;
      right[i] = Math.sin((2 * Math.PI * 220 * i) / SR) * 1.5;
    }
    limiter.process(left, right, SR);
    // The 2:1 level ratio between the channels must survive.
    expect(rms(left, SR * 0.2) / rms(right, SR * 0.2)).toBeCloseTo(2, 1);
  });
});
