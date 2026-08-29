import { describe, expect, it } from 'vitest';
import {
  SLEEP_TIMER_FADE_SEC,
  SessionRenderer,
  buildStage,
  createProtocol,
  WavPcmEncoder,
  encodeWav,
  wavHeader,
  wavPadding,
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

  it('recovers from an aborted stop without a click', () => {
    // Auto-resume after an interruption cancels a stop fade part-way through.
    // The fade multiplies the buffers before the master chain, so nothing
    // downstream would smooth a jump — cancelling used to snap the gain to full
    // in one sample.
    const protocol = sweepProtocol(30, 10, 10);
    const renderer = new SessionRenderer(protocol, { sampleRate: SR, blockSize: 128 });
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    const trace: number[] = [];

    const pump = (blocks: number) => {
      for (let i = 0; i < blocks; i++) {
        renderer.render(left, right, 128);
        for (let j = 0; j < 128; j++) trace.push(left[j]);
      }
    };

    pump(40);
    renderer.beginStopFade(0.4);
    pump(60);
    renderer.cancelStopFade();
    pump(200);

    // The largest single-sample jump across the whole trace, including the
    // cancel, must stay within what one cycle of the signal can move.
    let biggestStep = 0;
    for (let i = 1; i < trace.length; i++) {
      biggestStep = Math.max(biggestStep, Math.abs(trace[i] - trace[i - 1]));
    }
    expect(biggestStep, 'a discontinuity in the recovery').toBeLessThan(0.05);

    // And the level really does come back, rather than staying faded.
    const tail = trace.slice(-2000);
    expect(Math.max(...tail.map(Math.abs))).toBeGreaterThan(0.05);
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

  /*
   * The two tests above pass against a cross-fade that swings +3 dB in the
   * middle, because they average over two whole seconds and a fade artefact
   * lasts a fraction of that. This one looks at the level in 50 ms windows,
   * which is the timescale you actually hear.
   *
   * It sweeps the first stage's duration on purpose. The two stages hold the
   * same carrier, so what changes with duration is only where the outgoing
   * oscillators happen to be when the incoming ones start. That used to decide
   * everything: the incoming graph began every oscillator at phase zero, so the
   * two met at an offset that was an accident of the stage length, and the
   * shipped presets landed anywhere from +3.00 dB (Calm, Focus) to -19.37 dB
   * (Meditation's return to alpha, a near-total dropout mid-session). A fade
   * between two stages must not depend on how long the first one ran.
   */
  const boundaryLevelSpreadDb = (firstStageSec: number): number => {
    const stage = (id: string, name: string, durationSec: number, crossfadeSec: number) =>
      buildStage({
        id,
        name,
        durationSec,
        engine: 'binaural',
        carrierHz: 220,
        beatHz: 8,
        amplitude: 0.36,
        crossfadeSec,
      });
    const protocol = createProtocol({
      id: 'fade-probe',
      name: 'Fade probe',
      intent: 'explore',
      createdAt: FIXED_DATE,
      generatedBy: 'preset',
      // No session fade, so the only level shape in the window is the one the
      // cross-fade puts there.
      master: { fadeInSec: 0, fadeOutSec: 0 },
      stages: [stage('a', 'A', firstStageSec, 0), stage('b', 'B', 12, 4)],
    });

    const rendered = renderProtocolOffline(protocol, { sampleRate: SR });
    const window = Math.round(SR * 0.05);
    let quietest = Infinity;
    let loudest = 0;
    // The whole fade, plus a second either side for a reference level.
    const from = Math.round((firstStageSec - 1) * SR);
    const to = Math.round((firstStageSec + 5) * SR);
    for (let i = from; i + window <= to; i += window) {
      const level = rms(rendered.left.subarray(i, i + window));
      if (level < quietest) quietest = level;
      if (level > loudest) loudest = level;
    }
    return 20 * Math.log10(loudest / quietest);
  };

  it('holds its level through the fade whatever phase the stages meet at', () => {
    // Fractional seconds so the 220 Hz carrier lands somewhere different in its
    // cycle each time, which is exactly what used to vary the outcome.
    for (const durationSec of [20, 20.13, 20.37, 20.61, 20.89]) {
      expect(boundaryLevelSpreadDb(durationSec), `${durationSec}s first stage`).toBeLessThan(0.5);
    }
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

/*
 * The sleep timer is the one stop nobody is awake to expect, so what is checked
 * here is the shape of what a listener hears rather than the flag that starts
 * it: the level has to come down smoothly, all the way to true silence, over
 * the whole fade — never a cut, and never quicker than the stop the user hears
 * when they press the button themselves (§28).
 */
describe('the sleep timer fade', () => {
  const WINDOW_SEC = 0.25;

  /** Peak level per 250 ms window from the moment a stop fade begins. */
  function fadeProfile(fadeSec: number): {
    peaks: number[];
    trace: Float32Array;
    silentAfterSec: number;
    complete: boolean;
  } {
    const protocol = sweepProtocol(120, 10, 10);
    const renderer = new SessionRenderer(protocol, { sampleRate: SR });
    const block = 4096;
    const left = new Float32Array(block);
    const right = new Float32Array(block);

    // Ten seconds in: past the session fade-in, nowhere near the fade-out.
    for (let i = 0; i < Math.ceil((10 * SR) / block); i++) renderer.render(left, right, block);

    renderer.beginStopFade(fadeSec);
    const total = Math.ceil((fadeSec + 1) * SR);
    const trace = new Float32Array(total);
    let written = 0;
    while (written < total) {
      renderer.render(left, right, block);
      trace.set(left.subarray(0, Math.min(block, total - written)), written);
      written += block;
    }

    const size = Math.round(WINDOW_SEC * SR);
    const peaks: number[] = [];
    for (let i = 0; i + size <= total; i += size) peaks.push(peak(trace, i, i + size));
    const firstSilent = peaks.findIndex((level) => level < 1e-6);
    return {
      peaks,
      trace,
      silentAfterSec: firstSilent < 0 ? Infinity : firstSilent * WINDOW_SEC,
      complete: renderer.stopFadeComplete,
    };
  }

  it('takes the level all the way down to silence over the whole fade', () => {
    const { peaks, trace, silentAfterSec, complete } = fadeProfile(SLEEP_TIMER_FADE_SEC);

    // It starts from a session that was genuinely audible...
    expect(peaks[0]).toBeGreaterThan(0.2);
    // ...comes down monotonically, window by window, with no step back up...
    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i], `window ${i} is louder than the one before it`).toBeLessThanOrEqual(peaks[i - 1]);
    }
    // ...is still clearly audible a second in, so this is a fade and not a cut...
    expect(peaks[4]).toBeGreaterThan(peaks[0] * 0.5);
    // ...and ends in real silence, not merely something quiet.
    expect(peak(trace, Math.round((SLEEP_TIMER_FADE_SEC + 0.5) * SR))).toBeLessThan(1e-9);
    expect(complete).toBe(true);

    // Silence arrives when the fade says it does, to within one window.
    expect(silentAfterSec).toBeGreaterThan(SLEEP_TIMER_FADE_SEC - 2 * WINDOW_SEC);
    expect(silentAfterSec).toBeLessThan(SLEEP_TIMER_FADE_SEC + 2 * WINDOW_SEC);

    // And nothing in it steps further than one cycle of the tone can carry it.
    const slope = (2 * Math.PI * 230 * peak(trace)) / SR;
    expect(maxStep(trace)).toBeLessThan(slope * 1.5);
  });

  it('never fades faster than a manual stop', () => {
    // The floor is the fade a user hears when they press stop themselves. A
    // sleep timer may be gentler than that; it may never be sharper.
    const manual = fadeProfile(0.45);
    expect(manual.silentAfterSec).toBeLessThan(SLEEP_TIMER_FADE_SEC);
    expect(fadeProfile(SLEEP_TIMER_FADE_SEC).silentAfterSec).toBeGreaterThan(manual.silentAfterSec);
  });

  it('leaves a session that is still playing untouched until it is asked to stop', () => {
    // Arming is not a level change: nothing may be audible about a timer until
    // the moment it expires.
    const protocol = sweepProtocol(120, 10, 10);
    const renderer = new SessionRenderer(protocol, { sampleRate: SR });
    const left = new Float32Array(4096);
    const right = new Float32Array(4096);
    for (let i = 0; i < 200; i++) renderer.render(left, right, 4096);
    expect(renderer.stopFadeComplete).toBe(false);
    expect(peak(left)).toBeGreaterThan(0.2);
  });
});

describe('streaming a WAV produces the same bytes as encoding one', () => {
  /*
   * The property the streaming export depends on, and the reason `encodeWav`
   * is now built out of the same three pieces rather than being a second
   * implementation. A 60-minute export at 48 kHz is 1.7 GB of Float32 and
   * encoded buffer if it is assembled in memory, so the app writes it a chunk
   * at a time — and a chunked file that is not byte-identical to the one-shot
   * one is a different export, not the same export delivered differently.
   *
   * The dither is what makes this a real risk. It is a deterministic sequence
   * so two renders match, which means its state has to survive a chunk
   * boundary: an encoder restarted per chunk produces a file that depends on
   * the chunk size.
   */
  const SR = 48000;
  const frames = 5000;

  function signal(): { left: Float32Array; right: Float32Array } {
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      left[i] = Math.sin((2 * Math.PI * 220 * i) / SR) * 0.5;
      // Quiet, where dither actually matters, and asymmetric so the channels
      // cannot pass by being identical.
      right[i] = Math.sin((2 * Math.PI * 227 * i) / SR) * 0.0004;
    }
    return { left, right };
  }

  function streamed(chunkFrames: number, bitDepth: 16 | 24 | 32): Uint8Array {
    const { left, right } = signal();
    const options = { bitDepth, metadata: { title: 'Chunked', software: 'test' } };
    const parts: Uint8Array[] = [wavHeader(frames, SR, options)];
    const encoder = new WavPcmEncoder(bitDepth);
    for (let at = 0; at < frames; at += chunkFrames) {
      const count = Math.min(chunkFrames, frames - at);
      parts.push(
        encoder.encode(left.subarray(at, at + count), right.subarray(at, at + count), count),
      );
    }
    parts.push(wavPadding(frames, bitDepth));

    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    return bytes;
  }

  for (const bitDepth of [16, 24, 32] as const) {
    it(`matches at ${bitDepth}-bit, whatever the chunk size`, () => {
      const { left, right } = signal();
      const whole = encodeWav(left, right, SR, {
        bitDepth,
        metadata: { title: 'Chunked', software: 'test' },
      });
      // Chunk sizes that divide the length and one that deliberately does not,
      // so the last short chunk is exercised too.
      for (const chunkFrames of [frames, 2500, 1000, 333, 1]) {
        expect(Array.from(streamed(chunkFrames, bitDepth)), `chunk ${chunkFrames}`).toEqual(
          Array.from(whole),
        );
      }
    });
  }

  it('writes a header whose declared size matches the samples that follow', () => {
    for (const bitDepth of [16, 24, 32] as const) {
      const bytes = streamed(1000, bitDepth);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(view.getUint32(4, true), `RIFF size at ${bitDepth}`).toBe(bytes.length - 8);

      // Find the data chunk and check its declared length against what is left.
      let at = 12;
      while (at < bytes.length - 8) {
        const id = String.fromCharCode(...bytes.subarray(at, at + 4));
        const size = view.getUint32(at + 4, true);
        if (id === 'data') {
          expect(size, `data size at ${bitDepth}`).toBe(frames * 2 * (bitDepth / 8));
          expect(at + 8 + size).toBeLessThanOrEqual(bytes.length);
          break;
        }
        at += 8 + size + (size % 2);
      }
    }
  });
});
