import { describe, expect, it } from 'vitest';
import { renderGraphOffline } from '../src/index.js';
import {
  crossingRate,
  envelope,
  magnitudeAt,
  maxStep,
  peak,
  rmsProfile,
  singleNodeGraph,
} from './helpers.js';

const SR = 48000;

describe('AM engine', () => {
  it('generates the expected sidebands', () => {
    const graph = singleNodeGraph('am', {
      carrier: 220,
      modFrequency: 40,
      depth: 1,
      amplitude: 0.5,
      pan: 0,
    });
    const { left } = renderGraphOffline(graph, 2, SR);
    const carrier = magnitudeAt(left, 220, SR, 0.5, 1);
    const lower = magnitudeAt(left, 180, SR, 0.5, 1);
    const upper = magnitudeAt(left, 260, SR, 0.5, 1);
    // A unipolar modulator at full depth is (1 + cos)/2, i.e. modulation
    // index 1, which places each sideband at half the carrier amplitude.
    expect(lower / carrier).toBeCloseTo(0.5, 1);
    expect(upper / carrier).toBeCloseTo(0.5, 1);
  });

  it('modulates the envelope at the modulation rate', () => {
    const graph = singleNodeGraph('am', {
      carrier: 300,
      modFrequency: 10,
      depth: 1,
      amplitude: 0.5,
      pan: 0,
    });
    const { left } = renderGraphOffline(graph, 4, SR);
    const env = envelope(left, SR, 40);
    expect(crossingRate(env, SR, SR, SR * 3)).toBeCloseTo(10, 0);
  });

  it('leaves the signal untouched at zero depth', () => {
    const graph = singleNodeGraph('am', {
      carrier: 220,
      modFrequency: 40,
      depth: 0,
      amplitude: 0.5,
      pan: 0,
    });
    const { left } = renderGraphOffline(graph, 1, SR);
    expect(magnitudeAt(left, 180, SR, 0.3, 0.5)).toBeLessThan(0.002);
    expect(peak(left, SR * 0.2)).toBeCloseTo(0.5, 2);
  });
});

describe('FM engine', () => {
  it('spreads energy into sidebands spaced by the modulation rate', () => {
    const graph = singleNodeGraph('fm', {
      carrier: 300,
      modFrequency: 20,
      deviation: 40,
      depth: 1,
      amplitude: 0.5,
      pan: 0,
    });
    const { left } = renderGraphOffline(graph, 2, SR);
    const carrier = magnitudeAt(left, 300, SR, 0.5, 1);
    expect(magnitudeAt(left, 320, SR, 0.5, 1) / carrier).toBeGreaterThan(0.2);
    expect(magnitudeAt(left, 280, SR, 0.5, 1) / carrier).toBeGreaterThan(0.2);
    // A frequency-modulated tone with no deviation would show nothing here.
    expect(magnitudeAt(left, 340, SR, 0.5, 1) / carrier).toBeGreaterThan(0.02);
  });

  it('reduces to a pure tone at zero deviation', () => {
    const graph = singleNodeGraph('fm', {
      carrier: 300,
      modFrequency: 20,
      deviation: 0,
      depth: 1,
      amplitude: 0.5,
      pan: 0,
    });
    const { left } = renderGraphOffline(graph, 1, SR);
    const carrier = magnitudeAt(left, 300, SR, 0.3, 0.5);
    expect(magnitudeAt(left, 320, SR, 0.3, 0.5) / carrier).toBeLessThan(0.01);
  });
});

describe('isochronic engine', () => {
  it('pulses at the requested rate', () => {
    const graph = singleNodeGraph(
      'isochronic',
      {
        carrier: 300,
        pulse: 10,
        duty: 0.5,
        depth: 1,
        attack: 0.2,
        release: 0.3,
        amplitude: 0.5,
        pan: 0,
      },
      { envelope: 'softSquare' },
    );
    const { left } = renderGraphOffline(graph, 4, SR);
    const env = envelope(left, SR, 60);
    expect(crossingRate(env, SR, SR, SR * 3)).toBeCloseTo(10, 0);
  });

  it('reaches silence between pulses at full depth', () => {
    const graph = singleNodeGraph(
      'isochronic',
      {
        carrier: 300,
        pulse: 4,
        duty: 0.4,
        depth: 1,
        attack: 0.1,
        release: 0.1,
        amplitude: 0.5,
        pan: 0,
      },
      { envelope: 'softSquare' },
    );
    const { left } = renderGraphOffline(graph, 2, SR);
    const env = envelope(left, SR, 80);
    let minimum = Infinity;
    for (let i = SR; i < SR * 2; i++) minimum = Math.min(minimum, env[i]);
    expect(minimum).toBeLessThan(0.01);
  });

  it('keeps softened edges click-free while a hard square does not', () => {
    const base = {
      carrier: 300,
      pulse: 8,
      duty: 0.5,
      depth: 1,
      amplitude: 0.5,
      pan: 0,
    };
    const soft = renderGraphOffline(
      singleNodeGraph('isochronic', { ...base, attack: 0.25, release: 0.25 }, { envelope: 'softSquare' }),
      2,
      SR,
    );
    const hard = renderGraphOffline(
      singleNodeGraph('isochronic', { ...base, attack: 0, release: 0 }, { envelope: 'square' }),
      2,
      SR,
    );
    const slope = (2 * Math.PI * 300 * 0.5) / SR;
    expect(maxStep(soft.left, SR * 0.5)).toBeLessThan(slope * 1.5);
    // The hard gate is a genuine discontinuity — the warning in the graph
    // validator exists precisely because this is audible.
    expect(maxStep(hard.left, SR * 0.5)).toBeGreaterThan(slope * 5);
  });

  it('holds a constant carrier at zero depth', () => {
    const graph = singleNodeGraph('isochronic', {
      carrier: 300,
      pulse: 10,
      duty: 0.5,
      depth: 0,
      attack: 0.2,
      release: 0.2,
      amplitude: 0.5,
      pan: 0,
    });
    const { left } = renderGraphOffline(graph, 1, SR);
    const profile = rmsProfile(left, SR, 0.05, 0.3, 1);
    const min = Math.min(...profile);
    const max = Math.max(...profile);
    expect(max / min).toBeLessThan(1.01);
  });
});

describe('stereo motion', () => {
  it('moves the signal between the channels at the requested rate', () => {
    const graph = {
      nodes: [
        { id: 'src', kind: 'oscillator' as const, params: { frequency: 300, amplitude: 0.5, phase: 0, pan: 0 }, options: { waveform: 'sine' } },
        { id: 'mov', kind: 'stereoMotion' as const, params: { rate: 1, depth: 1, center: 0 }, options: { shape: 'sine' } },
        { id: 'output', kind: 'output' as const, params: {}, options: {} },
      ],
      connections: [
        { from: 'src', to: 'mov' },
        { from: 'mov', to: 'output' },
      ],
    };
    const { left, right } = renderGraphOffline(graph, 4, SR);
    const envL = envelope(left, SR, 8);
    const envR = envelope(right, SR, 8);
    expect(crossingRate(envL, SR, SR, SR * 3)).toBeCloseTo(1, 0);
    // The two channels move in opposition: when one rises the other falls.
    let correlation = 0;
    for (let i = SR; i < SR * 3; i++) correlation += (envL[i] - 0.3) * (envR[i] - 0.3);
    expect(correlation).toBeLessThan(0);
  });
});
