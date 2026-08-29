import type { MixerGroup } from '@frequencylab/dsp-core';
import type { OrganicAssetPayload } from './delivery';

/**
 * The organic bus, as the shared code is allowed to see it.
 *
 * §1 and §39 are the reason this interface has the shape it has. The precision
 * DSP bus and the organic acoustic bus are two separate paths into the master
 * mixer, and the separation is enforced structurally rather than by convention:
 *
 *  - The backend builds both buses and keeps the precision one private. There
 *    is **no method here that reaches it**. The organic layer cannot pan, widen,
 *    crossfeed, filter or otherwise touch the core, because it is not handed
 *    anything that would let it.
 *  - Every organic voice is created by `start`, which wires it into the organic
 *    bus and nowhere else. A panner exists on that path and only on that path.
 *
 * That matters most when the core is binaural. A binaural pair *is* the
 * difference between the two channels; anything that mixes them — a pan law, a
 * width control, a mono-compatible reverb, a downmix on a node whose channel
 * count was left to be inferred — destroys the effect while leaving something
 * that still sounds like a tone. It would not be obvious, and it would make
 * every binaural session in the app quietly wrong. The organic sounds may be
 * panned and spatialised as freely as the sound designer likes; the core is
 * carried to the mixer as two channels and arrives as the same two channels.
 *
 * Two implementations satisfy this: `createWebOrganicGraph` over the browser's
 * Web Audio API, and `createNativeOrganicGraph` over `react-native-audio-api`.
 * Everything above this line — cache, voice manager, look-ahead scheduler — is
 * platform independent and is the code the browser run actually exercises.
 */

/**
 * A decoded asset, held by the platform graph.
 *
 * `handle` is the platform's own buffer object and the shared code never looks
 * inside it: keeping it opaque is what stops a DOM `AudioBuffer` type leaking
 * into code that also has to run on Hermes.
 */
export interface OrganicDecodedBuffer {
  readonly durationSec: number;
  readonly sampleRate: number;
  readonly channels: number;
  /**
   * Decoded footprint in bytes, estimated as frames × channels × 4.
   *
   * An estimate on purpose. The bytes live in the audio engine rather than on
   * the JS heap, so nothing here can measure them; what the cache needs is a
   * number that is proportional to the real cost and stable between platforms,
   * which this is (§53).
   */
  readonly bytes: number;
  readonly handle: unknown;
}

/** Everything one scheduled event needs, in the units the platform wants. */
export interface OrganicVoiceRequest {
  /** Context time to start at. Sample accurate — this is not a JS timer (§54). */
  readonly when: number;
  /** Linear gain, already converted from the event's dB and the asset's trim. */
  readonly gain: number;
  /** -1..1. Applies to this voice alone, never to the core (§1, §39). */
  readonly pan: number;
  /** Cents, and 0 for everything the pipeline did not actually measure (§24). */
  readonly detuneCents: number;
  /** Where in the file to begin, from the manifest's measured lead-in. */
  readonly offsetSec: number;
  /** How much of the file to play, tail included. */
  readonly playSec: number;
  /** Onset ramp. Short, and only to keep a mid-sample start from clicking. */
  readonly fadeInSec: number;
  /** Release ramp applied at the end of `playSec`. */
  readonly fadeOutSec: number;
  /**
   * Which mixer channel this voice belongs to (§31).
   *
   * The event's own group, decided by the scheduler from the asset's
   * instrument. The graph uses it to pick the gain node the voice is wired
   * into, which is the entire mechanism by which a fader reaches a sound that
   * is already playing.
   */
  readonly group: MixerGroup;
  /**
   * How much of this voice the preset wants in the room, 0..1.
   *
   * From the layer, by way of the event. It is a *proportion of the send*, not
   * a level: the amount that actually reaches the reverb is this multiplied by
   * the group's fader and by the mixer's Space control, so turning an
   * instrument down takes its reflections with it.
   */
  readonly reverbSend: number;
}

export interface OrganicPlatformVoice {
  /**
   * Fades this voice out and stops it.
   *
   * A fade rather than a stop, always. A voice that is dropped for polyphony,
   * or cut short because the session is ending, must not click — §28's rule
   * that nothing gets sharper than the manual stop fade applies to a bowl as
   * much as it applies to the session.
   */
  release(at: number, fadeSec: number): void;
  /** Fires when the source has genuinely finished, for voice bookkeeping. */
  onEnded(callback: () => void): void;
}

export interface OrganicAudioGraph {
  readonly name: string;
  /** The audio clock, in the same time base as `OrganicVoiceRequest.when`. */
  now(): number;
  /** Decodes off the audio path. Called by the look-ahead, never by `render`. */
  decode(payload: OrganicAssetPayload): Promise<OrganicDecodedBuffer>;
  /** Wires one voice into the organic bus — and only into the organic bus. */
  start(buffer: OrganicDecodedBuffer, request: OrganicVoiceRequest): OrganicPlatformVoice;
  /**
   * Ramps the organic bus.
   *
   * The one place the whole layer's level is set, so a stop fades the bus on
   * the audio thread rather than by touching every voice from JavaScript —
   * which is what makes the fade immune to a stalled or throttled JS thread.
   */
  rampBus(target: number, at: number, seconds: number): void;
  /**
   * Ramps one instrument group's fader (§31).
   *
   * The same argument as `rampBus`, one level down. A group is a permanent gain
   * node standing between its voices and the bus, so moving a fader is one
   * `AudioParam` ramp that reaches every bowl already ringing *and* every bowl
   * the look-ahead commits afterwards — without cancelling the envelope
   * automation each of those voices is running, which is what touching the
   * voices themselves would do.
   *
   * A ramp rather than a step, always. A fader dragged across a live mix is the
   * most obvious place in the app to introduce a click (§28).
   */
  rampGroup(group: MixerGroup, target: number, at: number, seconds: number): void;
  /**
   * Ramps the reverb return — the mixer's `Space` control.
   *
   * The return rather than the send, so one number governs how much room the
   * whole layer has while the per-layer send amounts the presets declare keep
   * their proportions. At zero the reverb is not merely inaudible: the graph
   * does not build it at all until something asks for it, because a convolution
   * over a two-and-a-half second impulse is real work and §52 says the core
   * signal never pays for decoration.
   */
  rampSpace(target: number, at: number, seconds: number): void;
  dispose(): void;
}

/** dB to linear amplitude. */
export function gainFromDb(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * A soft-clip curve for the organic bus.
 *
 * The precision path ends in the DSP master chain's look-ahead limiter; the
 * organic path has nothing equivalent, because neither platform's audio graph
 * offers a limiter this app could trust with someone's ears (`react-native-audio-api`
 * has no compressor node at all). Gain staging and the polyphony cap are what
 * keep the bus in range — the pipeline trimmed every asset toward -23 LUFS and
 * the layer gains sit below that — and this is the guarantee underneath them,
 * for the case where several sharp attacks land on the same sample.
 *
 * `tanh` because its slope at zero is exactly one: below about -20 dBFS it is
 * indistinguishable from a wire, so it colours nothing in ordinary use and only
 * asserts itself where the alternative is a full-scale sum. It cannot pump,
 * cannot ring and has no release, which a compressor put here would.
 */
export function softClipCurve(points = 1024): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    // -3..3 covers everything the bus can produce; beyond it tanh is flat.
    const x = (i / (points - 1)) * 6 - 3;
    curve[i] = Math.tanh(x);
  }
  return curve;
}

// ---------------------------------------------------------------------------
// The room
// ---------------------------------------------------------------------------

/**
 * How long the reverb tail runs, and how far behind the source it starts.
 *
 * A little over two and a half seconds is a hall rather than a plate: long
 * enough that a bell
 * strike leaves something behind it, short enough that a sound bath at three
 * events a minute does not turn into a wash. The pre-delay is what keeps the
 * onset of a strike intact — reflections that arrive with the direct sound
 * smear the attack, and a bell without its attack is the same defect
 * `enterAnywhere` is guarded against in the scheduler.
 */
export const REVERB_SECONDS = 2.6;
export const REVERB_PREDELAY_SEC = 0.02;

/**
 * The impulse response, rendered rather than shipped.
 *
 * A recorded impulse would be another licensed asset in a bundle that is
 * already 1.5 GB, for a room nobody chose. This is decaying noise through a
 * low-pass that closes as the tail falls — which is what a room does, since air
 * and soft surfaces absorb the top end first — and it is deterministic, so the
 * same build always produces the same room. Generated once, off the audio path,
 * the first time anybody raises `Space`.
 *
 * The two channels run different noise streams. A mono impulse convolved onto a
 * stereo bus returns the same reflections to both ears, which collapses the
 * width of everything the panner just placed.
 */
export function renderReverbImpulse(
  sampleRate: number,
): readonly [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const frames = Math.max(2, Math.round(sampleRate * REVERB_SECONDS));
  const predelay = Math.min(frames - 1, Math.max(0, Math.round(sampleRate * REVERB_PREDELAY_SEC)));
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  // Divided by the last written index, not the count, so `t` reaches exactly 1
  // on the final sample and the envelope below reaches exactly 0 there. Off by
  // one and the impulse ends a few billionths above silence, which convolves
  // into a discontinuity at the end of every reflection.
  const tail = Math.max(1, frames - predelay - 1);

  /*
   * Two independent noise streams from one deterministic generator, seeded
   * apart. `Math.imul` rather than `*`, because the product of a 32-bit state
   * and this multiplier lands within a factor of 1.3 of the largest integer a
   * double represents exactly — true today and not a thing to leave resting on
   * a reader noticing it.
   */
  let stateL = 0x9e3779b9;
  let stateR = 0x85ebca6b;
  let lowL = 0;
  let lowR = 0;

  for (let i = predelay; i < frames; i++) {
    const t = (i - predelay) / tail;
    /*
     * Exponential decay, taken to exactly zero at the end.
     *
     * The `(1 - t)` factor is not cosmetic: an impulse response that is still
     * non-zero at its last sample convolves into a click at the end of every
     * reflection, which is the one artefact this codebase refuses everywhere
     * else (§28).
     */
    const envelope = Math.exp(-4.6 * t) * (1 - t);
    // A one-pole low-pass whose cutoff falls across the tail. Wide open at the
    // first reflections, closed by the end.
    const cutoff = Math.max(0.05, 0.45 - 0.4 * t);
    stateL = (Math.imul(stateL, 1664525) + 1013904223) >>> 0;
    stateR = (Math.imul(stateR, 1664525) + 1013904223) >>> 0;
    const noiseL = (stateL / 0x100000000) * 2 - 1;
    const noiseR = (stateR / 0x100000000) * 2 - 1;
    lowL += (noiseL - lowL) * cutoff;
    lowR += (noiseR - lowR) * cutoff;
    left[i] = lowL * envelope;
    right[i] = lowR * envelope;
  }

  return [left, right];
}
