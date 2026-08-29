import type { AudioBuffer, AudioContext, GainNode } from 'react-native-audio-api';
import type { OrganicAssetPayload } from './delivery';
import type {
  OrganicAudioGraph,
  OrganicDecodedBuffer,
  OrganicPlatformVoice,
  OrganicVoiceRequest,
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
  stopped: boolean;
}

export function createNativeOrganicGraph(context: AudioContext, bus: GainNode): OrganicAudioGraph {
  const live = new Set<LiveVoice>();

  function teardown(voice: LiveVoice): void {
    if (!live.delete(voice)) return;
    try {
      voice.source.disconnect();
      voice.panner.disconnect();
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
      gain.gain.linearRampToValueAtTime(0, endsAt);

      source.connect(panner);
      panner.connect(gain);
      gain.connect(bus);

      source.start(start, Math.max(0, request.offsetSec), play);

      const voice: LiveVoice = { source, gain, panner, stopped: false };
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
          gain.gain.setValueAtTime(gain.gain.value, t);
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
      const t = Math.max(at, context.currentTime);
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(bus.gain.value, t);
      if (seconds <= 0) {
        bus.gain.setValueAtTime(target, t);
        return;
      }
      bus.gain.linearRampToValueAtTime(target, t + seconds);
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
    },
  };
}
