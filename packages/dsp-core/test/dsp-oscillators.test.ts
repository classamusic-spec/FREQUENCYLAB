import { describe, expect, it } from 'vitest';
import {
  RenderGraph,
  binauralFrequencies,
  makeNode,
  renderGraphOffline,
  type RoutingGraph,
} from '../src/index.js';
import { magnitudeAt, maxStep, measureFrequency, peak, singleNodeGraph } from './helpers.js';

const SR = 48000;

describe('oscillator accuracy', () => {
  it('renders a numerically accurate sine', () => {
    for (const frequency of [40, 110, 220.5, 440, 1000]) {
      const graph = singleNodeGraph('oscillator', { frequency, amplitude: 0.5, pan: 0 });
      const { left } = renderGraphOffline(graph, 1.5, SR);
      expect(measureFrequency(left, SR, 0.2)).toBeCloseTo(frequency, 1);
    }
  });

  it('honours the requested amplitude at centre pan', () => {
    const graph = singleNodeGraph('oscillator', { frequency: 220, amplitude: 0.5, pan: 0 });
    const { left, right } = renderGraphOffline(graph, 0.5, SR);
    // Skip the first 50 ms while the amplitude smoother settles.
    expect(peak(left, SR * 0.1)).toBeCloseTo(0.5, 2);
    expect(peak(right, SR * 0.1)).toBeCloseTo(0.5, 2);
  });

  it('pans with an equal-power law', () => {
    const graph = singleNodeGraph('oscillator', { frequency: 220, amplitude: 0.5, pan: -1 });
    const { left, right } = renderGraphOffline(graph, 0.5, SR);
    expect(peak(left, SR * 0.2)).toBeGreaterThan(0.65);
    expect(peak(right, SR * 0.2)).toBeLessThan(0.01);
  });

  it('keeps square and saw free of gross aliasing at a musical carrier', () => {
    for (const waveform of ['square', 'saw'] as const) {
      const graph = singleNodeGraph('oscillator', { frequency: 220, amplitude: 0.5, pan: 0 }, { waveform });
      const { left } = renderGraphOffline(graph, 1, SR);
      // An inharmonic image would land here; with PolyBLEP it stays tiny.
      const alias = magnitudeAt(left, 137, SR, 0.3);
      const fundamental = magnitudeAt(left, 220, SR, 0.3);
      expect(alias / fundamental).toBeLessThan(0.02);
    }
  });

  it('produces no discontinuity larger than the waveform slope allows', () => {
    const graph = singleNodeGraph('oscillator', { frequency: 220, amplitude: 0.5, pan: 0 });
    const { left } = renderGraphOffline(graph, 2, SR);
    const theoreticalMax = (2 * Math.PI * 220 * 0.5) / SR;
    expect(maxStep(left, SR * 0.2)).toBeLessThan(theoreticalMax * 1.2);
  });
});

describe('phase continuity under frequency change', () => {
  it('does not click when the carrier is moved mid-render', () => {
    // Two connected oscillators would not exercise this; instead render a
    // sweep protocol-style by driving the node's parameter directly.
    const graph = singleNodeGraph('oscillator', { frequency: 200, amplitude: 0.5, pan: 0 });
    const compiled = new RenderGraph(graph, SR, 128);
    const out = new Float32Array(SR);
    const context = { sampleRate: SR, blockSize: 128, timeSec: 0 };
    let written = 0;
    while (written < SR) {
      if (written > SR / 2) compiled.setParam('src', 'frequency', 400);
      compiled.render(128, context);
      out.set(compiled.outL.subarray(0, 128), written);
      written += 128;
    }
    const theoreticalMax = (2 * Math.PI * 400 * 0.5) / SR;
    expect(maxStep(out, 1000)).toBeLessThan(theoreticalMax * 1.3);
  });
});

describe('binaural engine', () => {
  it('places the correct tone in each ear in offset mode', () => {
    const graph = singleNodeGraph(
      'binaural',
      { carrier: 200, beat: 7.83, amplitude: 0.5, separation: 1 },
      { mode: 'offset' },
    );
    const { left, right } = renderGraphOffline(graph, 2, SR);
    expect(measureFrequency(left, SR, 0.5)).toBeCloseTo(200, 1);
    expect(measureFrequency(right, SR, 0.5)).toBeCloseTo(207.83, 1);
  });

  it('splits the beat symmetrically in centred mode', () => {
    const graph = singleNodeGraph(
      'binaural',
      { carrier: 200, beat: 8, amplitude: 0.5, separation: 1 },
      { mode: 'centered' },
    );
    const { left, right } = renderGraphOffline(graph, 2, SR);
    expect(measureFrequency(left, SR, 0.5)).toBeCloseTo(196, 1);
    expect(measureFrequency(right, SR, 0.5)).toBeCloseTo(204, 1);
  });

  it('agrees with the documented calculation modes', () => {
    expect(binauralFrequencies(200, 7.83, 'offset')).toEqual({ left: 200, right: 207.83 });
    expect(binauralFrequencies(200, 8, 'centered')).toEqual({ left: 196, right: 204 });
  });

  it('achieves full channel separation at separation = 1', () => {
    const graph = singleNodeGraph(
      'binaural',
      { carrier: 200, beat: 10, amplitude: 0.5, separation: 1 },
      { mode: 'offset' },
    );
    const { left, right } = renderGraphOffline(graph, 2, SR);
    const leakIntoLeft = magnitudeAt(left, 210, SR, 0.5, 1);
    const wantedInLeft = magnitudeAt(left, 200, SR, 0.5, 1);
    const leakIntoRight = magnitudeAt(right, 200, SR, 0.5, 1);
    const wantedInRight = magnitudeAt(right, 210, SR, 0.5, 1);
    // Better than 60 dB of separation between the two ears.
    expect(20 * Math.log10(leakIntoLeft / wantedInLeft)).toBeLessThan(-60);
    expect(20 * Math.log10(leakIntoRight / wantedInRight)).toBeLessThan(-60);
  });

  it('collapses to an equal acoustic sum at separation = 0', () => {
    const graph = singleNodeGraph(
      'binaural',
      { carrier: 200, beat: 10, amplitude: 0.5, separation: 0 },
      { mode: 'offset' },
    );
    const { left, right } = renderGraphOffline(graph, 2, SR);
    for (let i = SR; i < SR + 1000; i++) {
      expect(left[i]).toBeCloseTo(right[i], 6);
    }
  });
});

describe('monaural engine', () => {
  it('produces an acoustic beat present in a single channel', () => {
    const graph = singleNodeGraph('monaural', {
      carrier: 200,
      beat: 10,
      mix: 0.5,
      amplitude: 0.5,
      pan: 0,
    });
    const { left } = renderGraphOffline(graph, 3, SR);
    expect(magnitudeAt(left, 200, SR, 1, 1)).toBeGreaterThan(0.1);
    expect(magnitudeAt(left, 210, SR, 1, 1)).toBeGreaterThan(0.1);
  });
});

describe('harmonic engine', () => {
  it('places energy at each requested partial', () => {
    const graph: RoutingGraph = {
      nodes: [
        makeNode('src', 'harmonic', {
          fundamental: 110,
          h1: 1,
          h2: 0.5,
          h3: 0.25,
          h4: 0,
          h5: 0,
          h6: 0,
          h7: 0,
          h8: 0,
          amplitude: 0.5,
          pan: 0,
        }),
        makeNode('output', 'output'),
      ],
      connections: [{ from: 'src', to: 'output' }],
    };
    const { left } = renderGraphOffline(graph, 2, SR);
    const h1 = magnitudeAt(left, 110, SR, 0.5, 1);
    const h2 = magnitudeAt(left, 220, SR, 0.5, 1);
    const h3 = magnitudeAt(left, 330, SR, 0.5, 1);
    const h4 = magnitudeAt(left, 440, SR, 0.5, 1);
    expect(h2 / h1).toBeCloseTo(0.5, 1);
    expect(h3 / h1).toBeCloseTo(0.25, 1);
    expect(h4 / h1).toBeLessThan(0.01);
  });
});
