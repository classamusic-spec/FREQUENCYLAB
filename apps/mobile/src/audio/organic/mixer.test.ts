import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACOUSTIC_MIX,
  MIXER_GROUPS,
  MIXER_MIN_DB,
  mixerGain,
  withGroupLevel,
  withSpace,
  type MixerGroup,
  type Plan,
  type SoundBathEvent,
} from '@frequencylab/dsp-core';
import { renderReverbImpulse, type OrganicAudioGraph, type OrganicVoiceRequest } from './graph';
import { createWebOrganicGraph } from './webGraph';
import { OrganicSession } from './session';
import type { OrganicRuntimeAsset } from './assets';

/**
 * The acoustic mixer, at the level where it is actually a mixer (§31, §92).
 *
 * The screen is checked by driving the real web build in a browser, which is
 * the only way to prove a fader moves a gain the browser is really applying.
 * What a unit test is better at is the wiring underneath it: that a voice is
 * connected *through* its group's gain node rather than around it, that moving
 * one fader leaves the other six alone, and that the reverb is not built until
 * somebody asks for it. Those are the facts the browser measurement rests on,
 * and a graph built against a fake context can state them exactly.
 */

// ---------------------------------------------------------------------------
// A Web Audio API small enough to reason about
// ---------------------------------------------------------------------------

interface Automation {
  kind: 'set' | 'linear' | 'exponential' | 'cancel';
  value: number;
  time: number;
}

/**
 * An `AudioParam` with the one behaviour that matters here.
 *
 * A real parameter has two values: the *intrinsic* one, which `setValueAtTime`
 * and a direct assignment write, and the one automation has computed, which is
 * what `.value` reads back mid-ramp. `cancelScheduledValues` throws the
 * automation away and the parameter drops back to the intrinsic value — which
 * is why every ramp in this codebase reads `.value` *before* it cancels and
 * writes it back. Model only one value and that discipline becomes untestable,
 * because the wrong order produces the same answer.
 */
class FakeParam {
  private intrinsic: number;
  private computed: number;
  readonly automation: Automation[] = [];

  constructor(initial: number) {
    this.intrinsic = initial;
    this.computed = initial;
  }

  get value(): number {
    return this.computed;
  }

  set value(next: number) {
    this.intrinsic = next;
    this.computed = next;
  }

  setValueAtTime(value: number, time: number): void {
    this.automation.push({ kind: 'set', value, time });
    this.intrinsic = value;
    this.computed = value;
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.automation.push({ kind: 'linear', value, time });
    // The value a ramp *reaches*, and only the computed one: a ramp does not
    // move the parameter's intrinsic value, which is the whole point.
    this.computed = value;
  }

  exponentialRampToValueAtTime(value: number, time: number): void {
    this.automation.push({ kind: 'exponential', value, time });
    this.computed = value;
  }

  cancelScheduledValues(time: number): void {
    this.automation.push({ kind: 'cancel', value: this.computed, time });
    this.computed = this.intrinsic;
  }

  /** Test-only: where a ramp currently is, part-way through. */
  partWayTo(value: number): void {
    this.computed = value;
  }
}

class FakeNode {
  readonly outputs: FakeNode[] = [];
  connect(target: FakeNode): FakeNode {
    this.outputs.push(target);
    return target;
  }
  disconnect(): void {
    this.outputs.length = 0;
  }
  /** Every node reachable from here, for asking whether a signal path exists. */
  reaches(target: FakeNode, seen = new Set<FakeNode>()): boolean {
    if (this === target) return true;
    if (seen.has(this)) return false;
    seen.add(this);
    return this.outputs.some((next) => next.reaches(target, seen));
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
  constructor(readonly tag = 'gain') {
    super();
  }
}

class FakeSource extends FakeNode {
  buffer: unknown = null;
  readonly detune = new FakeParam(0);
  started: [number, number, number] | null = null;
  onended: (() => void) | null = null;
  start(when: number, offset: number, duration: number): void {
    this.started = [when, offset, duration];
  }
  stop(): void {}
}

class FakePanner extends FakeNode {
  readonly pan = new FakeParam(0);
}

class FakeConvolver extends FakeNode {
  buffer: unknown = null;
  normalize = true;
}

class FakeBuffer {
  readonly channels: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  copyToChannel(source: Float32Array, channel: number): void {
    this.channels[channel].set(source);
  }
}

class FakeContext {
  currentTime = 0;
  readonly sampleRate = 48000;
  convolvers = 0;
  readonly sources: FakeSource[] = [];
  createGain(): FakeGain {
    return new FakeGain();
  }
  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  createStereoPanner(): FakePanner {
    return new FakePanner();
  }
  createConvolver(): FakeConvolver {
    this.convolvers++;
    return new FakeConvolver();
  }
  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
    return new FakeBuffer(channels, length, sampleRate);
  }
}

function build() {
  const context = new FakeContext();
  const bus = new FakeGain('bus');
  const graph = createWebOrganicGraph(
    context as unknown as AudioContext,
    bus as unknown as GainNode,
  );
  return { context, bus, graph };
}

const BUFFER = { durationSec: 4, sampleRate: 48000, channels: 2, bytes: 1, handle: {} };

function voice(overrides: Partial<OrganicVoiceRequest> = {}): OrganicVoiceRequest {
  return {
    when: 0,
    gain: 0.5,
    pan: 0,
    detuneCents: 0,
    offsetSec: 0,
    playSec: 3,
    fadeInSec: 0.02,
    fadeOutSec: 0.4,
    group: 'bowls',
    reverbSend: 0,
    ...overrides,
  };
}

/** The gain node a `start` created for its voice, found by what it is wired to. */
function voiceGainOf(source: FakeSource): FakeGain {
  const first = source.outputs[0];
  const gain = first instanceof FakePanner ? first.outputs[0] : first;
  return gain as FakeGain;
}

// ---------------------------------------------------------------------------

describe('a voice is wired through its fader, not around it', () => {
  it('does not connect a voice straight to the bus', () => {
    const { context, bus, graph } = build();
    graph.start(BUFFER, voice({ group: 'bowls' }));
    const gain = voiceGainOf(lastSource(context));
    // The voice reaches the bus — it has to be audible — but never directly.
    expect(gain.reaches(bus)).toBe(true);
    expect(gain.outputs).not.toContain(bus);
  });

  it('puts a bowl under the bowl fader and a bell under the bell fader', () => {
    const { context, bus, graph } = build();
    graph.start(BUFFER, voice({ group: 'bowls', gain: 1 }));
    const bowl = voiceGainOf(lastSource(context));
    graph.start(BUFFER, voice({ group: 'bells', gain: 1 }));
    const bell = voiceGainOf(lastSource(context));

    // Silence the bowls. The bowl voice loses its path to the bus at a node
    // whose gain is zero; the bell voice does not.
    graph.rampGroup('bowls', 0, 0, 0.08);
    expect(pathGain(bowl, bus)).toBe(0);
    expect(pathGain(bell, bus)).toBe(1);

    graph.rampGroup('bowls', mixerGain(-6.0206), 0, 0.08);
    expect(pathGain(bowl, bus)).toBeCloseTo(0.5, 5);
    expect(pathGain(bell, bus)).toBe(1);
  });

  it('reaches a voice that started before the fader moved', () => {
    const { context, bus, graph } = build();
    graph.start(BUFFER, voice({ group: 'chimes' }));
    const before = voiceGainOf(lastSource(context));
    graph.rampGroup('chimes', 0.25, 0, 0.08);
    graph.start(BUFFER, voice({ group: 'chimes' }));
    const after = voiceGainOf(lastSource(context));
    // Both, because the fader is a node they share rather than a value copied
    // into each of them at the moment they were created.
    expect(pathGain(before, bus)).toBeCloseTo(0.25, 6);
    expect(pathGain(after, bus)).toBeCloseTo(0.25, 6);
  });

  it('ramps rather than steps', () => {
    const { context, graph } = build();
    const param = groupParam(context, graph, 'bowls');
    graph.rampGroup('bowls', 0.3, 0, 0.08);
    expect(param.automation.map((entry) => entry.kind)).toEqual(['cancel', 'set', 'linear']);
    const ramp = param.automation.at(-1)!;
    expect(ramp.time).toBeCloseTo(0.08, 6);
  });

  /*
   * A drag fires one of these every few milliseconds, each landing on a ramp
   * that has not finished. Reading the parameter after cancelling reads the
   * value it fell back to rather than the value it was at, and the difference
   * between those two is a step — a click, in the one control most likely to
   * be moved while something is ringing (§28).
   */
  it('holds the parameter where it is before cancelling, so a drag cannot click', () => {
    const { context, graph } = build();
    const param = groupParam(context, graph, 'bowls');
    graph.rampGroup('bowls', 0.4, 0, 0.08);
    param.partWayTo(0.37);
    graph.rampGroup('bowls', 0.2, 0, 0.08);
    const [cancel, hold] = param.automation.slice(-3);
    expect(cancel.kind).toBe('cancel');
    expect(hold.kind).toBe('set');
    // Where the fader actually was, not where its automation had been anchored.
    expect(hold.value).toBe(0.37);
  });
});

describe('the send follows the fader', () => {
  it('carries a voice’s reverb send into its own group’s send', () => {
    const { context, graph } = build();
    graph.start(BUFFER, voice({ group: 'bowls', reverbSend: 0.4 }));
    const gain = voiceGainOf(lastSource(context));
    // Dry and wet: the strip's two inputs.
    expect(gain.outputs).toHaveLength(2);
    const send = gain.outputs[1] as FakeGain;
    expect(send.gain.value).toBeCloseTo(0.4, 6);
  });

  it('creates no send node for a layer the preset wanted dry', () => {
    const { context, graph } = build();
    graph.start(BUFFER, voice({ group: 'bowls', reverbSend: 0 }));
    expect(voiceGainOf(lastSource(context)).outputs).toHaveLength(1);
  });

  /*
   * Post-fader. Turning an instrument down has to take its reflections with
   * it, or the result is not "quieter" but "drier and further away".
   */
  it('moves the wet path with the dry one', () => {
    const { context, graph } = build();
    graph.rampSpace(1, 0, 0);
    graph.start(BUFFER, voice({ group: 'bowls', reverbSend: 0.5 }));
    const gain = voiceGainOf(lastSource(context));
    const send = gain.outputs[1] as FakeGain;
    const groupSend = send.outputs[0] as FakeGain;

    graph.rampGroup('bowls', 0.25, 0, 0.08);
    expect(groupSend.gain.value).toBeCloseTo(0.25, 6);
    // The whole wet path: the voice's own send amount times the fader.
    expect(send.gain.value * groupSend.gain.value).toBeCloseTo(0.125, 6);
  });
});

describe('the room is not built until it is asked for', () => {
  it('creates no convolver while Space is off', () => {
    const { context, graph } = build();
    graph.start(BUFFER, voice({ reverbSend: 0.5 }));
    graph.rampSpace(0, 0, 0.08);
    expect(context.convolvers).toBe(0);
  });

  it('creates exactly one the first time Space is raised, and reuses it', () => {
    const { context, bus, graph } = build();
    graph.rampSpace(0.5, 0, 0.08);
    expect(context.convolvers).toBe(1);
    graph.rampSpace(0.2, 0, 0.08);
    graph.rampSpace(0.7, 0, 0.08);
    expect(context.convolvers).toBe(1);

    graph.start(BUFFER, voice({ group: 'bells', reverbSend: 0.3 }));
    const gain = voiceGainOf(lastSource(context));
    const send = gain.outputs[1] as FakeGain;
    // The wet path is real: it arrives at the bus by a different route from
    // the dry one, and both routes exist.
    expect(send.reaches(bus)).toBe(true);
  });
});

describe('the impulse response', () => {
  it('is deterministic, so the same build is always the same room', () => {
    const [a] = renderReverbImpulse(48000);
    const [b] = renderReverbImpulse(48000);
    expect(Array.from(a.slice(2000, 2010))).toEqual(Array.from(b.slice(2000, 2010)));
  });

  it('decorrelates the two channels, or the reverb collapses the stereo field', () => {
    const [left, right] = renderReverbImpulse(48000);
    const identical = left.every((value, index) => value === right[index]);
    expect(identical).toBe(false);
  });

  it('ends at exactly zero, so a reflection cannot click', () => {
    const [left, right] = renderReverbImpulse(48000);
    // `Math.abs`, because the last sample is a signed zero and −0 is silence.
    expect(Math.abs(left.at(-1)!)).toBe(0);
    expect(Math.abs(right.at(-1)!)).toBe(0);
  });

  it('decays', () => {
    const [left] = renderReverbImpulse(48000);
    const early = rms(left.subarray(2000, 12000));
    const late = rms(left.subarray(left.length - 12000, left.length - 2000));
    expect(early).toBeGreaterThan(late * 8);
  });
});

describe('the session applies the mix', () => {
  it('sets every fader before the first sound, without a ramp', () => {
    const graph = recordingGraph();
    const session = sessionWith(graph, {
      ...withGroupLevel(DEFAULT_ACOUSTIC_MIX, 'bells', -12.0412),
    });
    session.start();
    expect(graph.groupCalls).toHaveLength(MIXER_GROUPS.length);
    for (const call of graph.groupCalls) expect(call.seconds).toBe(0);
    expect(gainFor(graph, 'bells')).toBeCloseTo(0.25, 5);
    expect(gainFor(graph, 'bowls')).toBe(1);
    // Space ships off, so the graph is asked for a return of exactly zero.
    expect(graph.spaceCalls.at(-1)!.target).toBe(0);
  });

  it('ramps when the mix moves under a playing session', () => {
    const graph = recordingGraph();
    const session = sessionWith(graph, DEFAULT_ACOUSTIC_MIX);
    session.start();
    graph.groupCalls.length = 0;
    graph.spaceCalls.length = 0;

    session.setMix(withSpace(withGroupLevel(DEFAULT_ACOUSTIC_MIX, 'water', MIXER_MIN_DB), -6.0206));
    expect(gainFor(graph, 'water')).toBe(0);
    expect(graph.spaceCalls.at(-1)!.target).toBeCloseTo(0.5, 5);
    for (const call of graph.groupCalls) expect(call.seconds).toBeGreaterThan(0);
    expect(graph.spaceCalls.at(-1)!.seconds).toBeGreaterThan(0);
  });

  it('reports a strip only for a group the plan has events for', () => {
    const graph = recordingGraph();
    const session = sessionWith(graph, DEFAULT_ACOUSTIC_MIX);
    const groups = session.diagnostics().groups;
    expect(groups.map((entry) => entry.group)).toEqual(['bowls', 'bells']);
    expect(groups.map((entry) => entry.planned)).toEqual([2, 1]);
    for (const entry of groups) expect(entry.scheduled).toBe(0);
  });

  it('remembers a mix set before anything is playing', () => {
    const graph = recordingGraph();
    const session = sessionWith(graph, DEFAULT_ACOUSTIC_MIX);
    session.setMix(withGroupLevel(DEFAULT_ACOUSTIC_MIX, 'bowls', MIXER_MIN_DB));
    // Nothing touched: the layer has not started, so there is no graph to ramp.
    expect(graph.groupCalls).toHaveLength(0);
    session.start();
    expect(gainFor(graph, 'bowls')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lastSource(context: FakeContext): FakeSource {
  const source = context.sources.at(-1);
  if (!source) throw new Error('no voice was started');
  return source;
}

/** The product of every gain node on the one path from `from` to `to`. */
function pathGain(from: FakeNode, to: FakeNode): number {
  if (from === to) return 1;
  for (const next of from.outputs) {
    if (!next.reaches(to)) continue;
    const factor = next instanceof FakeGain ? next.gain.value : 1;
    return factor * pathGain(next, to);
  }
  return Number.NaN;
}

/**
 * The gain parameter one fader moves.
 *
 * The strips are private to the graph, so this finds one the way a voice does:
 * start a voice in that group and follow its dry output, which is the strip.
 */
function groupParam(
  context: FakeContext,
  graph: OrganicAudioGraph,
  group: MixerGroup,
): FakeParam {
  graph.start(BUFFER, voice({ group }));
  const dry = voiceGainOf(lastSource(context)).outputs[0] as FakeGain;
  return dry.gain;
}

function recordingGraph(): RecordingGraph {
  return new RecordingGraph();
}

interface RampCall {
  group?: MixerGroup;
  target: number;
  seconds: number;
}

class RecordingGraph implements OrganicAudioGraph {
  readonly name = 'Recording';
  readonly groupCalls: RampCall[] = [];
  readonly spaceCalls: RampCall[] = [];
  now(): number {
    return 0;
  }
  async decode(): Promise<never> {
    throw new Error('not used');
  }
  start(): never {
    throw new Error('not used');
  }
  rampBus(): void {}
  rampGroup(group: MixerGroup, target: number, at: number, seconds: number): void {
    this.groupCalls.push({ group, target, seconds });
  }
  rampSpace(target: number, at: number, seconds: number): void {
    this.spaceCalls.push({ target, seconds });
  }
  dispose(): void {}
}

function gainFor(graph: RecordingGraph, group: MixerGroup): number {
  const call = [...graph.groupCalls].reverse().find((entry) => entry.group === group);
  if (!call) throw new Error(`the graph was never told about ${group}`);
  return call.target;
}

function event(group: MixerGroup, atSec: number): SoundBathEvent {
  return {
    atSec,
    assetId: `asset-${group}-${atSec}`,
    layerId: group,
    role: 'BELL',
    group,
    gainDb: -18,
    pan: 0,
    reverbSend: 0.4,
    durationSec: 4,
    detuneCents: 0,
    offsetSec: 0,
  };
}

function sessionWith(graph: OrganicAudioGraph, mix: Parameters<OrganicSession['setMix']>[0]) {
  const events = [event('bowls', 10), event('bells', 20), event('bowls', 30)];
  const plan: Plan = { events, emptyLayers: [], lastTailEndsAtSec: 34, seed: 'test' };
  const assets = new Map<string, OrganicRuntimeAsset>();
  for (const item of events) {
    assets.set(item.assetId, {
      id: item.assetId,
      durationSeconds: 4,
      startSeconds: 0,
      endSeconds: 4,
      preload: true,
      streaming: false,
      maxVoices: 2,
      releaseTailDb: -40,
    });
  }
  return new OrganicSession({
    plan,
    assets,
    graph,
    outputLatencySec: 0.1,
    protocolDurationSec: 600,
    mix,
  });
}

function rms(values: Float32Array): number {
  let sum = 0;
  for (const value of values) sum += value * value;
  return Math.sqrt(sum / values.length);
}
