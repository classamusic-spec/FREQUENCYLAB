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
  it('matches every colour to the same loudness, with headroom to spare', () => {
    // Changing colour must change timbre and not loudness: `NoiseNode` swaps
    // colour with no smoothing and no re-gain, so a mismatch would arrive as a
    // step discontinuity in the middle of a session. Brown once ran 20 dB above
    // pink and peaked at 3.5 — over full scale before any level control.
    const measured = (['white', 'pink', 'brown'] as const).map((color) => {
      const source = new NoiseSource(color, 12345);
      const signal = new Float32Array(SR * 4);
      for (let i = 0; i < signal.length; i++) signal[i] = source.next();
      return { color, rms: rms(signal), peak: peak(signal) };
    });

    const loudest = Math.max(...measured.map((entry) => entry.rms));
    const quietest = Math.min(...measured.map((entry) => entry.rms));
    expect(gainToDb(loudest) - gainToDb(quietest), 'colours must be within 1 dB').toBeLessThan(1);

    for (const entry of measured) {
      // Full scale before the level control has touched it would leave the
      // limiter doing the work of a gain stage.
      expect(entry.peak, `${entry.color} peak`).toBeLessThan(1);
      expect(entry.rms, `${entry.color} is silent`).toBeGreaterThan(0.05);
    }
  });

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

  /**
   * Single-bin DFT. The segment must span a whole number of cycles of `hz`, or
   * spectral leakage from the fundamental swamps the harmonics being measured.
   */
  const bin = (x: Float32Array, from: number, length: number, hz: number): number => {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * hz) / SR;
    for (let n = 0; n < length; n++) {
      re += x[from + n] * Math.cos(w * n);
      im -= x[from + n] * Math.sin(w * n);
    }
    return (2 * Math.hypot(re, im)) / length;
  };

  /** Total harmonic distortion of a tone at `hz`, as a fraction of fundamental. */
  const thd = (x: Float32Array, from: number, length: number, hz: number): number => {
    const fundamental = bin(x, from, length, hz);
    let harmonics = 0;
    for (let k = 2; k * hz < SR / 2 && k <= 12; k++) {
      const a = bin(x, from, length, k * hz);
      harmonics += a * a;
    }
    return fundamental > 0 ? Math.sqrt(harmonics) / fundamental : 0;
  };

  /*
   * The three tests below are the ones that would have caught the detector this
   * stage used to have. Every other test here asserts the ceiling holds — and it
   * did hold, by clipping: the follower read the instantaneous input while the
   * output read a sample one lookahead older, so the gain was derived from audio
   * several cycles in the sample's future, the product overshot, and the safety
   * net below did the real limiting. A ceiling assertion cannot tell limiting
   * from clipping. These can.
   */

  it('limits without ever falling back on the clipper', () => {
    // The old detector clipped 3,248 samples per second here at unity and
    // 11,974 at 2.0, all while passing the ceiling assertions above.
    for (const hz of [40, 220, 1000]) {
      for (const amplitude of [1, 1.2, 2, 4, 10]) {
        const limiter = new StereoLimiter(SR, { ceilingDb: -1 });
        const left = new Float32Array(SR);
        const right = new Float32Array(SR);
        for (let i = 0; i < SR; i++) {
          const value = Math.sin((2 * Math.PI * hz * i) / SR) * amplitude;
          left[i] = value;
          right[i] = value;
        }
        limiter.process(left, right, SR);
        expect(limiter.readClipEvents(), `${hz} Hz at ${amplitude}`).toBe(0);
      }
    }
  });

  it('adds no audible harmonics to a tone it is holding down', () => {
    const limiter = new StereoLimiter(SR, { ceilingDb: -1 });
    const hz = 200;
    const left = new Float32Array(SR);
    const right = new Float32Array(SR);
    for (let i = 0; i < SR; i++) {
      const value = Math.sin((2 * Math.PI * hz * i) / SR) * 4;
      left[i] = value;
      right[i] = value;
    }
    limiter.process(left, right, SR);
    // Second half only, so attack and release have both settled; a whole number
    // of cycles so the bins are clean.
    const from = SR / 2;
    const length = Math.round((Math.floor((SR / 2 / SR) * hz) * SR) / hz);
    expect(thd(left, from, length, hz)).toBeLessThan(0.0001);
  });

  it('holds an isolated spike without clipping the bed it sits on', () => {
    const limiter = new StereoLimiter(SR, { ceilingDb: -1 });
    const left = new Float32Array(SR);
    const right = new Float32Array(SR);
    for (let i = 0; i < SR; i++) {
      const value = Math.sin((2 * Math.PI * 100 * i) / SR) * 0.1;
      left[i] = value;
      right[i] = value;
    }
    // One sample, 4x over full scale, with nothing around it: the case the
    // lookahead exists for and the one an envelope follower cannot catch.
    left[SR / 2] = 4;
    right[SR / 2] = 4;
    limiter.process(left, right, SR);
    expect(gainToDb(peak(left))).toBeLessThanOrEqual(-1 + 1e-6);
    expect(limiter.readClipEvents()).toBe(0);
  });
});
