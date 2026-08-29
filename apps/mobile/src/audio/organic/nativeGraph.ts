import { MIXER_GROUPS, type MixerGroup } from '@frequencylab/dsp-core';
import type { AudioBuffer, AudioContext, AudioParam, GainNode } from 'react-native-audio-api';
import type { OrganicAssetPayload } from './delivery';
import {
  renderReverbImpulse,
  type OrganicAudioGraph,
  type OrganicDecodedBuffer,
  type OrganicPlatformVoice,
  type OrganicVoiceRequest,
} from './graph';

/**
 * The organic bus on `react-native-audio-api`.
 *
 * The same graph as the browser's, over an API that mirrors Web Audio closely
 * enough that the two adapters are the same shape: `createBufferSource` with a
 * sample-accurate `start(when, offset, duration)`, `createStereoPanner`,
 * `createGain`, and `decodeAudioData` that takes a file path or a URL and never
 * marshals the bytes across the bridge — which matters, because the longest
 * asset in this library decodes to 58 MB.
 *
 * Everything above `OrganicAudioGraph` is shared with the web adapter and is
 * exercised by the browser run. **This file is not.** There is no device and no
 * linked native module in the environment it was written in, so it is written
 * against the module's published API and typechecked against its declarations,
 * and it has never made a sound. That is worth knowing before trusting it, and
 * it is the same honesty `NullAudioBackend` exists for (§65).
 */

const MIN_FADE_SEC = 0.01;

interface LiveVoice {
  source: ReturnType<AudioContext['createBufferSource']>;
  gain: GainNode;
  panner: ReturnType<AudioContext['createStereoPanner']>;
  send: GainNode | null;
  stopped: boolean;
}

/** The fader, twice: once to the bus and once to the reverb. See the web adapter. */
interface GroupStrip {
  dry: GainNode;
  send: GainNode;
}

export function createNativeOrganicGraph(context: AudioContext, bus: GainNode): OrganicAudioGraph {
  const live = new Set<LiveVoice>();

  const groups = {} as Record<MixerGroup, GroupStrip>;
  const reverbInput = context.createGain();
  reverbInput.gain.value = 1;
  for (const group of MIXER_GROUPS) {
    const dry = context.createGain();
    dry.gain.value = 1;
    dry.connect(bus);
    const send = context.createGain();
    send.gain.value = 1;
    send.connect(reverbInput);
    groups[group] = { dry, send };
  }

  let convolver: ReturnType<AudioContext['createConvolver']> | null = null;
  let spaceReturn: GainNode | null = null;

  /** Built on the first request for `Space`, and not before. See the web adapter. */
  function ensureReverb(): GainNode {
    if (spaceReturn) return spaceReturn;
    const [leftIr, rightIr] = renderReverbImpulse(context.sampleRate);
    const impulse = context.createBuffer(2, leftIr.length, context.sampleRate);
    impulse.copyToChannel(leftIr, 0);
    impulse.copyToChannel(rightIr, 1);
    const node = context.createConvolver();
    node.normalize = true;
    node.buffer = impulse;
    const ret = context.createGain();
    ret.gain.value = 0;
    reverbInput.connect(node);
    node.connect(ret);
    ret.connect(bus);
    convolver = node;
    spaceReturn = ret;
    return ret;
  }

  function ramp(param: AudioParam, target: number, at: number, seconds: number): void {
    const t = Math.max(at, context.currentTime);
    const from = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(from, t);
    if (seconds <= 0) {
      param.setValueAtTime(target, t);
      return;
    }
    param.linearRampToValueAtTime(target, t + seconds);
  }

  function teardown(voice: LiveVoice): void {
    if (!live.delete(voice)) return;
    try {
      voice.source.disconnect();
      voice.panner.disconnect();
      voice.send?.disconnect();
      voice.gain.disconnect();
    } catch {
      // A node disconnected twice is not worth surfacing.
    }
  }

  return {
    name: 'NativeAudioAPI',

    now(): number {
      return context.currentTime;
    },

    async decode(payload: OrganicAssetPayload): Promise<OrganicDecodedBuffer> {
      // A URI is handed straight to the native decoder: it reads and decodes the
      // file on its own thread, so a 152-second bowl never becomes a 58 MB
      // ArrayBuffer on the JS heap on its way to the audio engine.
      const buffer: AudioBuffer = await context.decodeAudioData(
        payload.kind === 'uri' ? payload.uri : payload.data,
      );
      return {
        durationSec: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        bytes: buffer.length * buffer.numberOfChannels * 4,
        handle: buffer,
      };
    },

    start(buffer: OrganicDecodedBuffer, request: OrganicVoiceRequest): OrganicPlatformVoice {
      const source = context.createBufferSource();
      source.buffer = buffer.handle as AudioBuffer;
      if (request.detuneCents !== 0) source.detune.value = request.detuneCents;

      const gain = context.createGain();
      const panner = context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, request.pan));

      const start = Math.max(request.when, context.currentTime);
      const play = Math.max(MIN_FADE_SEC * 4, request.playSec);
      const fadeIn = Math.max(MIN_FADE_SEC, Math.min(request.fadeInSec, play * 0.25));
      const fadeOut = Math.max(MIN_FADE_SEC, Math.min(request.fadeOutSec, play * 0.5));
      const endsAt = start + play;

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(request.gain, start + fadeIn);
      gain.gain.setValueAtTime(request.gain, endsAt - fadeOut);
      /*
       * Exponential, not linear. A linear ramp in *gain* spends most of its
       * time in the top few decibels and then falls off a cliff — the ear
       * hears loudness logarithmically, so a straight line to zero reads as an
       * abrupt stop no matter how long it is. An exponential ramp is a
       * straight line in decibels, which is what a decay actually sounds like.
       *
       * It cannot reach zero, so it goes to a thousandth — 60 dB down, below
       * anything audible under a session — and one 10 ms linear step closes
       * the gap. That last step is short enough to be a de-click and not a
       * fade, and `AudioParam` requires a non-zero exponential target.
       */
      gain.gain.exponentialRampToValueAtTime(
        Math.max(request.gain * 0.001, 1e-6),
        endsAt - MIN_FADE_SEC,
      );
      gain.gain.linearRampToValueAtTime(0, endsAt);

      source.connect(panner);
      panner.connect(gain);

      // Into this instrument's strip rather than onto the bus, so the fader
      // multiplies the voice's envelope instead of being bypassed by it (§31).
      // See the web adapter: an unrecognised group lands on `texture` rather
      // than throwing away the voice.
      const strip = groups[request.group] ?? groups.texture;
      gain.connect(strip.dry);

      let send: GainNode | null = null;
      if (request.reverbSend > 0) {
        send = context.createGain();
        send.gain.value = Math.min(1, request.reverbSend);
        gain.connect(send);
        send.connect(strip.send);
      }

      source.start(start, Math.max(0, request.offsetSec), play);

      const voice: LiveVoice = { source, gain, panner, send, stopped: false };
      live.add(voice);

      return {
        release(at: number, fadeSec: number): void {
          if (voice.stopped) return;
          voice.stopped = true;
          const t = Math.max(at, context.currentTime);
          const seconds = Math.max(MIN_FADE_SEC, fadeSec);
          // Hold the envelope where it is before ramping. Cancelling scheduled
          // automation without this steps the gain back to the last set value,
          // which is a click (§28).
          gain.gain.cancelScheduledValues(t);
          const from = Math.max(gain.gain.value, 1e-6);
          gain.gain.setValueAtTime(from, t);
          // The same shape as the natural release above, for the same reason:
          // a stolen voice must recede rather than be cut, and linear-in-gain
          // is a cut with a ramp in front of it.
          gain.gain.exponentialRampToValueAtTime(
            Math.max(from * 0.001, 1e-6),
            t + Math.max(MIN_FADE_SEC, seconds - MIN_FADE_SEC),
          );
          gain.gain.linearRampToValueAtTime(0, t + seconds);
          try {
            source.stop(t + seconds + 0.02);
          } catch {
            // `stop` throws on a source that was never started or has already
            // ended. Either way it is silent, which is what was asked for.
          }
        },
        onEnded(callback: () => void): void {
          source.onEnded = () => {
            teardown(voice);
            callback();
          };
        },
      };
    },

    rampBus(target: number, at: number, seconds: number): void {
      ramp(bus.gain, target, at, seconds);
    },

    rampGroup(group: MixerGroup, target: number, at: number, seconds: number): void {
      const strip = groups[group];
      if (!strip) return;
      ramp(strip.dry.gain, target, at, seconds);
      ramp(strip.send.gain, target, at, seconds);
    },

    rampSpace(target: number, at: number, seconds: number): void {
      if (target <= 0 && !spaceReturn) return;
      ramp(ensureReverb().gain, target, at, seconds);
    },

    /** See the web adapter: disposal is not a fade, it is after one. */
    dispose(): void {
      for (const voice of [...live]) {
        try {
          if (!voice.stopped) {
            voice.stopped = true;
            voice.source.stop();
          }
        } catch {
          // Teardown is best effort; the context is going away regardless.
        }
        teardown(voice);
      }
      live.clear();
      try {
        for (const group of MIXER_GROUPS) {
          groups[group].dry.disconnect();
          groups[group].send.disconnect();
        }
        reverbInput.disconnect();
        convolver?.disconnect();
        spaceReturn?.disconnect();
      } catch {
        // Best effort; the context is closing behind this.
      }
    },
  };
}
