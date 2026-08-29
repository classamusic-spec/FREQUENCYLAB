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
  dispose(): void;
}

/** dB to linear amplitude. */
export function gainFromDb(db: number): number {
  return Math.pow(10, db / 20);
}
