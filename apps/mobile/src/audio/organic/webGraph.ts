import type { OrganicAssetPayload } from './delivery';
import type {
  OrganicAudioGraph,
  OrganicDecodedBuffer,
  OrganicPlatformVoice,
  OrganicVoiceRequest,
} from './graph';

/**
 * The organic bus on the browser's Web Audio API.
 *
 * Sample playback is the one thing the web build can do *better* than it does
 * the core: `AudioBufferSourceNode.start(when)` is scheduled on the audio
 * thread, so a bowl lands on its intended sample even though the core's own PCM
 * is being pushed through a look-ahead window by a JS timer. That is why the
 * look-ahead scheduler above hands out context timestamps rather than calling
 * anything at the moment a sound is due (§54).
 *
 * The context and the bus node are built by `WebAudioBackend`, which also owns
 * the precision bus this module is deliberately not given a reference to
 * (§1, §39).
 */

/** Nothing shorter, or a mid-file start clicks. */
const MIN_FADE_SEC = 0.01;

interface LiveVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  panner: StereoPannerNode | null;
  stopped: boolean;
}

export function createWebOrganicGraph(context: AudioContext, bus: GainNode): OrganicAudioGraph {
  const live = new Set<LiveVoice>();

  /*
   * Checked once, here, rather than per voice.
   *
   * A `createStereoPanner` that throws inside `start` would drop a voice on the
   * scheduling path with nothing to show for it. Every browser this app targets
   * has had the node for years; the fallback exists so that if one does not, the
   * organic layer loses its stereo placement and keeps its sound rather than the
   * other way round.
   */
  const panSupported = typeof context.createStereoPanner === 'function';

  function teardown(voice: LiveVoice): void {
    if (!live.delete(voice)) return;
    try {
      voice.source.disconnect();
      voice.panner?.disconnect();
      voice.gain.disconnect();
    } catch {
      // A node disconnected twice is not worth surfacing; the point is that it
      // is no longer in the graph.
    }
  }

  return {
    name: 'WebAudio',

    now(): number {
      return context.currentTime;
    },

    async decode(payload: OrganicAssetPayload): Promise<OrganicDecodedBuffer> {
      const bytes =
        payload.kind === 'bytes'
          ? payload.data
          : await fetch(payload.uri).then((response) => {
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              return response.arrayBuffer();
            });
      // `decodeAudioData` detaches the ArrayBuffer it is given, so nothing may
      // hold on to `payload.data` after this point and nothing does — the cache
      // keeps the decoded buffer, never the encoded bytes.
      const buffer = await context.decodeAudioData(bytes);
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
      // Only ever non-zero for material whose pitch the pipeline actually
      // measured — a vendor's filename is a label, not something to retune on
      // (§24). Guarded because `detune` arrived late on some engines.
      if (request.detuneCents !== 0 && source.detune) {
        source.detune.value = request.detuneCents;
      }

      const gain = context.createGain();
      const panner = panSupported ? context.createStereoPanner() : null;
      if (panner) panner.pan.value = Math.max(-1, Math.min(1, request.pan));

      const start = Math.max(request.when, context.currentTime);
      const play = Math.max(MIN_FADE_SEC * 4, request.playSec);
      // Both ramps are bounded by the sound itself: a 6 s fade-out on a 1.3 s
      // chime would otherwise schedule its release before its onset and invert
      // the envelope.
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

      if (panner) {
        source.connect(panner);
        panner.connect(gain);
      } else {
        source.connect(gain);
      }
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
          // Hold whatever the envelope is at right now before ramping, or
          // cancelling the scheduled automation would step the gain back to the
          // last set value — a click in the one place §28 says there must never
          // be one.
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
            // A source that already ended rejects `stop`. It is already silent,
            // which is what was being asked for.
          }
        },
        onEnded(callback: () => void): void {
          source.onended = () => {
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

    /**
     * Disposal is not a fade.
     *
     * By the time the controller disposes a backend the stop fade has already
     * run to silence and been given the backend's look-ahead to leave the
     * speaker (`SessionController.stop`). Anything still sounding here is a
     * voice that fade did not reach, and it is stopped rather than left ringing
     * into a context that is about to close.
     */
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
