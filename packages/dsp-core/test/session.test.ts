import { describe, expect, it } from 'vitest';
import {
  SessionRenderer,
  buildStage,
  createProtocol,
  encodeWav,
  makeSweepLane,
  protocolFromSimple,
  renderProtocolOffline,
  totalDurationSec,
  type Protocol,
} from '../src/index.js';
import { maxStep, measureFrequency, peak, rms } from './helpers.js';


const SR = 48000;
const FIXED_DATE = '2026-01-01T00:00:00.000Z';

/**
 * `measureFrequency` analyses a 32768-sample window, so a swept tone is
 * measured at the *centre* of that window rather than at its start. The sweep
 * tests compare against the sweep's true value there instead of its endpoint,
 * which keeps them honest about what is actually being measured.
 */
const ANALYSIS_WINDOW_SEC = 32768 / SR;

function linearSweepValueAt(
  from: number,
  to: number,
  durationSec: number,
  absoluteSec: number,
): number {
  const centre = absoluteSec + ANALYSIS_WINDOW_SEC / 2;
  return from + (to - from) * Math.min(1, Math.max(0, centre / durationSec));
}

/** Beat rate as the difference between the two channels' measured tones. */
function measureBeat(left: Float32Array, right: Float32Array, offsetSec: number): number {
  return measureFrequency(right, SR, offsetSec) - measureFrequency(left, SR, offsetSec);
}

function sweepProtocol(durationSec: number, from: number, to: number): Protocol {
  const stage = buildStage({
    id: 'stage-1',
    name: 'Sweep',
    durationSec,
    engine: 'binaural',
    carrierHz: 220,
    beatHz: from,
    beatToHz: to,
    amplitude: 0.4,
    sweepCurve: { kind: 'linear' },
    crossfadeSec: 0,
  });
  return createProtocol({
    id: 'sweep-test',
    name: 'Sweep Test',
    stages: [stage],
    master: { fadeInSec: 0.5, fadeOutSec: 0.5, gain: 0.8 },
    createdAt: FIXED_DATE,
  });
}

describe('frequency sweeps', () => {
  it('tracks a linear sweep at both ends of the stage', () => {
    const protocol = sweepProtocol(120, 10, 6);
    const head = renderProtocolOffline(protocol, { sampleRate: SR, maxSeconds: 3, startSec: 1 });
    const tail = renderProtocolOffline(protocol, { sampleRate: SR, startSec: 116, maxSeconds: 3 });
    expect(measureBeat(head.left, head.right, 0.5)).toBeCloseTo(
      linearSweepValueAt(10, 6, 120, 1.5),
      1,
    );
    expect(measureBeat(tail.left, tail.right, 2)).toBeCloseTo(
      linearSweepValueAt(10, 6, 120, 118),
      1,
    );
  });

  it('stays accurate at the midpoint of a long sweep', () => {
    const durationSec = 10 * 60;
    const protocol = sweepProtocol(durationSec, 10, 6);
    const middle = renderProtocolOffline(protocol, {
      sampleRate: SR,
      startSec: durationSec / 2 - 1,
      maxSeconds: 3,
    });
    // Halfway through a linear 10 → 6 Hz sweep the beat must read 8 Hz.
    expect(measureBeat(middle.left, middle.right, 1)).toBeCloseTo(
      linearSweepValueAt(10, 6, durationSec, durationSec / 2),
      1,
    );
  });

  it('sweeps without a click', () => {
    const protocol = sweepProtocol(60, 12, 4);
    const { left } = renderProtocolOffline(protocol, { sampleRate: SR, startSec: 5, maxSeconds: 10 });
    const slope = (2 * Math.PI * 232 * peak(left)) / SR;
    expect(maxStep(left)).toBeLessThan(slope * 1.3);
  });
});

describe('protocol clock', () => {
  it('reports the correct stage at every boundary', () => {
    const protocol = protocolFromSimple({
      goal: 'relax',
      durationSec: 25 * 60,
      intensity: 'balanced',
      createdAt: FIXED_DATE,
    });
    const renderer = new SessionRenderer(protocol, { sampleRate: SR });
    const offsets = [0];
    for (const stage of protocol.stages) offsets.push(offsets[offsets.length - 1] + stage.durationSec);

    for (let i = 0; i < protocol.stages.length; i++) {
      renderer.seek(offsets[i] + 1);
      expect(renderer.telemetry().stageIndex).toBe(i);
      expect(renderer.telemetry().stageName).toBe(protocol.stages[i].name);
    }
    renderer.seek(totalDurationSec(protocol));
    expect(renderer.finished).toBe(true);
  });

  it('keeps the clock aligned with the sample count', () => {
    const protocol = sweepProtocol(30, 10, 6);
    const renderer = new SessionRenderer(protocol, { sampleRate: SR, blockSize: 128 });
    const left = new Float32Array(512);
    const right = new Float32Array(512);
    for (let i = 0; i < 100; i++) renderer.render(left, right, 512);
    expect(renderer.positionSec).toBeCloseTo((100 * 512) / SR, 9);
  });
});

describe('stage transitions', () => {
  it('cross-fades between stages without a discontinuity', () => {
    const protocol = protocolFromSimple({
      goal: 'meditate',
      durationSec: 15 * 60,
      intensity: 'balanced',
      createdAt: FIXED_DATE,
    });
    const boundary = protocol.stages[0].durationSec;
    const window = renderProtocolOffline(protocol, {
      sampleRate: SR,
      startSec: boundary - 3,
      maxSeconds: 8,
    });
    const slope = (2 * Math.PI * 220 * peak(window.left)) / SR;
    expect(maxStep(window.left)).toBeLessThan(slope * 1.5);
    expect(maxStep(window.right)).toBeLessThan(slope * 1.5);
  });

  it('holds a steady level through the cross-fade', () => {
    const protocol = protocolFromSimple({
      goal: 'relax',
      durationSec: 15 * 60,
      intensity: 'balanced',
      createdAt: FIXED_DATE,
    });
    const boundary = protocol.stages[0].durationSec;
    const before = renderProtocolOffline(protocol, { sampleRate: SR, startSec: boundary - 6, maxSeconds: 2 });
    const during = renderProtocolOffline(protocol, { sampleRate: SR, startSec: boundary, maxSeconds: 2 });
    const ratio = rms(during.left) / rms(before.left);
    expect(ratio).toBeGreaterThan(0.75);
    expect(ratio).toBeLessThan(1.3);
  });
});

describe('session fades', () => {
  it('starts from silence and ends in silence', () => {
    const protocol = sweepProtocol(40, 10, 8);
    const start = renderProtocolOffline(protocol, { sampleRate: SR, maxSeconds: 0.05 });
    const end = renderProtocolOffline(protocol, { sampleRate: SR, startSec: 39.95, maxSeconds: 0.05 });
    expect(peak(start.left)).toBeLessThan(0.02);
    expect(peak(end.left)).toBeLessThan(0.02);
  });

  it('reaches full level after the fade-in', () => {
    const protocol = sweepProtocol(40, 10, 8);
    const middle = renderProtocolOffline(protocol, { sampleRate: SR, startSec: 10, maxSeconds: 1 });
    expect(peak(middle.left)).toBeGreaterThan(0.2);
  });
});

describe('output safety', () => {
  it('never exceeds the limiter ceiling on any sample of a session', () => {
    const protocol = protocolFromSimple({
      goal: 'focus',
      durationSec: 5 * 60,
      intensity: 'strong',
      createdAt: FIXED_DATE,
    });
    // Master gain pushed far past unity: the limiter is the only thing between
    // this configuration and a painfully loud output.
    const loud: Protocol = { ...protocol, master: { ...protocol.master, gain: 1.5 } };
    const renderer = new SessionRenderer(loud, { sampleRate: SR, compile: 'eager' });
    const left = new Float32Array(8192);
    const right = new Float32Array(8192);
    const ceiling = Math.pow(10, protocol.master.limiterCeilingDb / 20);
    let highest = 0;
    let frames = 0;
    const total = totalDurationSec(loud) * SR;
    while (frames < total) {
      renderer.render(left, right, 8192);
      highest = Math.max(highest, peak(left), peak(right));
      frames += 8192;
    }
    expect(highest).toBeGreaterThan(0.1);
    expect(highest).toBeLessThanOrEqual(ceiling + 1e-6);
  });

  it('fades out smoothly when a stop is requested', () => {
    const protocol = sweepProtocol(60, 10, 8);
    const renderer = new SessionRenderer(protocol, { sampleRate: SR });
    const left = new Float32Array(4096);
    const right = new Float32Array(4096);
    for (let i = 0; i < 100; i++) renderer.render(left, right, 4096);
    renderer.beginStopFade(0.3);
    const collected = new Float32Array(SR);
    let written = 0;
    while (written < SR) {
      renderer.render(left, right, 4096);
      collected.set(left.subarray(0, Math.min(4096, SR - written)), written);
      written += 4096;
    }
    expect(renderer.stopFadeComplete).toBe(true);
    expect(peak(collected, SR - 4096)).toBeLessThan(1e-6);
    const slope = (2 * Math.PI * 230 * 0.5) / SR;
    expect(maxStep(collected)).toBeLessThan(slope * 1.5);
  });
});

describe('reproducibility', () => {
  it('renders identical audio twice from the same protocol', () => {
    const protocol = protocolFromSimple({
      goal: 'relax',
      durationSec: 6 * 60,
      intensity: 'balanced',
      createdAt: FIXED_DATE,
    });
    const a = renderProtocolOffline(protocol, { sampleRate: SR, maxSeconds: 4 });
    const b = renderProtocolOffline(protocol, { sampleRate: SR, maxSeconds: 4 });
    expect(Array.from(a.left)).toEqual(Array.from(b.left));
    expect(Array.from(a.right)).toEqual(Array.from(b.right));
  });

  it('is independent of the render block size', () => {
    const protocol = protocolFromSimple({
      goal: 'explore',
      durationSec: 6 * 60,
      intensity: 'gentle',
      createdAt: FIXED_DATE,
    });
    const small = renderProtocolOffline(protocol, { sampleRate: SR, blockSize: 64, maxSeconds: 2 });
    const large = renderProtocolOffline(protocol, { sampleRate: SR, blockSize: 512, maxSeconds: 2 });
    for (let i = 0; i < small.left.length; i += 97) {
      expect(small.left[i]).toBeCloseTo(large.left[i], 4);
    }
  });
});

describe('reference export', () => {
  it('writes a valid stereo WAV header', () => {
    const protocol = sweepProtocol(10, 10, 8);
    const { left, right } = renderProtocolOffline(protocol, { sampleRate: SR, maxSeconds: 1 });
    const wav = encodeWav(left, right, SR, {
      bitDepth: 24,
      metadata: { title: 'Sweep Test', software: 'FREQUENCY LAB', comment: '{"dna":"test"}' },
    });
    const text = String.fromCharCode(...wav.subarray(0, 4));
    expect(text).toBe('RIFF');
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe('WAVE');
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(SR);
    expect(view.getUint16(34, true)).toBe(24);
    expect(wav.byteLength).toBeGreaterThan(SR * 6);
  });

  it('exports the same bytes for the same protocol', () => {
    const protocol = sweepProtocol(5, 10, 8);
    const a = renderProtocolOffline(protocol, { sampleRate: SR, maxSeconds: 1 });
    const b = renderProtocolOffline(protocol, { sampleRate: SR, maxSeconds: 1 });
    expect(Array.from(encodeWav(a.left, a.right, SR))).toEqual(
      Array.from(encodeWav(b.left, b.right, SR)),
    );
  });
});

describe('automation with an explicit lane', () => {
  it('applies a multi-point lane at the right times', () => {
    const stage = buildStage({
      id: 'stage-1',
      name: 'Lane Test',
      durationSec: 60,
      engine: 'binaural',
      carrierHz: 200,
      beatHz: 10,
      amplitude: 0.4,
      crossfadeSec: 0,
    });
    stage.automation = [
      {
        id: 'beat',
        target: 'tone:beat',
        enabled: true,
        points: [
          { timeSec: 0, value: 12, curve: { kind: 'linear' } },
          { timeSec: 20, value: 4, curve: { kind: 'stepped' } },
          { timeSec: 40, value: 9, curve: { kind: 'linear' } },
        ],
      },
    ];
    const protocol = createProtocol({
      id: 'lane-test',
      name: 'Lane Test',
      stages: [stage],
      master: { fadeInSec: 0.5, fadeOutSec: 0.5, gain: 0.8 },
      createdAt: FIXED_DATE,
    });

    const at = (startSec: number): number => {
      const window = renderProtocolOffline(protocol, { sampleRate: SR, startSec, maxSeconds: 2 });
      return measureBeat(window.left, window.right, 0.5);
    };
    expect(at(1)).toBeCloseTo(11.4, 0);
    expect(at(25)).toBeCloseTo(4, 0);
    expect(at(45)).toBeCloseTo(9, 0);
  });
});
