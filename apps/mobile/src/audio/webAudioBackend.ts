import { softClipCurve, type OrganicAudioGraph } from './organic/graph';
import { createWebOrganicGraph } from './organic/webGraph';
import {
  AudioBackendUnavailableError,
  DEFAULT_BACKEND_OPTIONS,
  type AudioBackend,
  type AudioBackendOptions,
  type BackendState,
  type BackendStats,
  type RenderSource,
} from './types';

/**
 * The web audio backend.
 *
 * On native, FREQUENCY LAB hands self-rendered PCM to `AudioBufferQueueSourceNode`.
 * That node has no web build, which is why the browser preview otherwise falls
 * back to silence — so on web we go straight to the browser's own Web Audio API
 * instead of the react-native-audio-api wrapper.
 *
 * Scheduling model: render a buffer, drop it on an `AudioBufferSourceNode`, and
 * `start(when)` it at the running edge of a look-ahead window; a timer keeps the
 * window filled. This is the standard "play-ahead" pattern — no deprecated
 * `ScriptProcessorNode`, no `AudioWorklet`, and no `SharedArrayBuffer` (which
 * would need cross-origin-isolation headers a static host does not send by
 * default). The trade is latency: `queueDepth × bufferFrames`, ~256 ms at the
 * defaults, which is fine for a preview and audibly worse than native.
 *
 * Two browser realities are handled explicitly:
 *  - **Autoplay policy.** An `AudioContext` starts suspended until a user
 *    gesture resumes it. `start()` is always reached through a tap (Start /
 *    Audition), so the resume lands inside the user-activation window.
 *  - **Context sample rate.** A browser may refuse the requested rate and run
 *    at 44.1 kHz. Buffers are created at the engine's own rate regardless; a
 *    mismatched `AudioBuffer` is resampled by the browser on playback, so the
 *    pitch stays correct rather than the whole session playing sharp.
 */
export class WebAudioBackend implements AudioBackend {
  readonly name = 'WebAudio';
  readonly audible = true;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /**
   * The two buses (§1, §39).
   *
   * `precisionBus` carries the self-rendered PCM and nothing else. It is
   * private: no reference to it leaves this class, so nothing in the organic
   * layer can pan, widen or crossfeed the core. That matters most for binaural
   * material, where the effect *is* the difference between the channels — a
   * downmix or a pan law applied here would destroy it while leaving something
   * that still sounds like a tone, which is the kind of defect nobody notices
   * until every binaural session in the app is quietly wrong.
   */
  private precisionBus: GainNode | null = null;
  private organicBus: GainNode | null = null;
  private organic: OrganicAudioGraph | null = null;
  private source: RenderSource | null = null;
  private options: AudioBackendOptions;
  private timer: ReturnType<typeof setInterval> | null = null;

  // Backed by an ArrayBuffer explicitly: copyToChannel rejects a view over a
  // SharedArrayBuffer, which is what a bare Float32Array widens to.
  private scratchL: Float32Array<ArrayBuffer>;
  private scratchR: Float32Array<ArrayBuffer>;

  private nextTime = 0;
  private buffersRendered = 0;
  private underruns = 0;
  private currentState: BackendState = 'idle';

  constructor(options: Partial<AudioBackendOptions> = {}) {
    this.options = { ...DEFAULT_BACKEND_OPTIONS, ...options };
    this.scratchL = new Float32Array(this.options.bufferFrames);
    this.scratchR = new Float32Array(this.options.bufferFrames);
  }

  get sampleRate(): number {
    // The engine's rate, not the context's. Buffers are authored at this rate
    // and the browser resamples them if the hardware runs at another.
    return this.options.sampleRate;
  }

  get state(): BackendState {
    return this.currentState;
  }

  private get lookaheadSec(): number {
    return (this.options.bufferFrames / this.options.sampleRate) * this.options.queueDepth;
  }

  async start(source: RenderSource): Promise<void> {
    if (this.currentState === 'running') return;
    this.source = source;
    this.currentState = 'starting';

    const Ctor: typeof AudioContext | undefined =
      typeof window !== 'undefined'
        ? (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;
    if (!Ctor) {
      this.currentState = 'failed';
      throw new AudioBackendUnavailableError('This browser has no Web Audio API.');
    }

    try {
      this.ctx = new Ctor({ sampleRate: this.options.sampleRate });
    } catch {
      // Some browsers reject an explicit sampleRate; fall back to the default.
      this.ctx = new Ctor();
    }

    this.buildMixer(this.ctx);

    // Must run inside the gesture that led here, or the context stays suspended.
    await this.ctx.resume().catch(() => undefined);

    this.nextTime = this.ctx.currentTime + 0.08;
    this.fill();
    const intervalMs = Math.max(20, (this.options.bufferFrames / this.options.sampleRate) * 1000 * 0.5);
    this.timer = setInterval(() => this.fill(), intervalMs);
    this.currentState = 'running';
  }

  /**
   * Builds the master mixer and its two inputs.
   *
   * The order of the organic chain matters: bus gain, then the soft clipper,
   * then the master. Putting the clipper after the bus gain is what makes the
   * stop fade able to take the organic layer to silence — a saturator upstream
   * of the fade would be fading an already-limited signal, which is the same
   * mistake `MasterChain` avoids by placing the session fade before its limiter.
   */
  private buildMixer(ctx: AudioContext): void {
    this.master = ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(ctx.destination);

    this.precisionBus = ctx.createGain();
    this.precisionBus.gain.value = 1;
    /*
     * Two channels in, the same two channels out, with no matrixing (§39).
     *
     * Web Audio's default is `channelCountMode: 'max'` with a `'speakers'`
     * interpretation, which is a mixing *policy*: it decides for itself how to
     * fit an input's channels onto a node's, and its rule for going from two
     * channels to one is (L + R) / 2. Nothing in this graph should ever hand it
     * a mono node — but a binaural session is exactly the signal where being
     * wrong about that is inaudible as a fault and fatal as an effect, so the
     * policy is switched off rather than relied upon. Explicit and discrete
     * means channel 0 reaches channel 0 and channel 1 reaches channel 1.
     */
    this.precisionBus.channelCount = 2;
    this.precisionBus.channelCountMode = 'explicit';
    this.precisionBus.channelInterpretation = 'discrete';
    this.precisionBus.connect(this.master);

    this.organicBus = ctx.createGain();
    this.organicBus.gain.value = 1;
    const safety = ctx.createWaveShaper();
    safety.curve = softClipCurve();
    safety.oversample = '2x';
    this.organicBus.connect(safety);
    safety.connect(this.master);

    this.organic = createWebOrganicGraph(ctx, this.organicBus);
  }

  /**
   * The organic bus. The precision bus is not reachable from here on purpose.
   */
  organicGraph(): OrganicAudioGraph | null {
    return this.organic;
  }

  /** Renders and schedules buffers until the look-ahead window is full. */
  private fill(): void {
    const ctx = this.ctx;
    const source = this.source;
    const precision = this.precisionBus;
    if (!ctx || !source || !precision || this.currentState === 'stopped') return;

    if (this.nextTime < ctx.currentTime) {
      // The queue drained — the render loop fell behind real time.
      this.underruns++;
      this.nextTime = ctx.currentTime + 0.02;
    }

    const frames = this.options.bufferFrames;
    const horizon = ctx.currentTime + this.lookaheadSec;
    while (this.nextTime < horizon) {
      source.render(this.scratchL, this.scratchR, frames);
      const buffer = ctx.createBuffer(2, frames, this.options.sampleRate);
      buffer.copyToChannel(this.scratchL, 0);
      buffer.copyToChannel(this.scratchR, 1);
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(precision);
      node.start(this.nextTime);
      this.nextTime += frames / this.options.sampleRate;
      this.buffersRendered++;
    }
  }

  async suspend(): Promise<void> {
    if (!this.ctx || this.currentState !== 'running') return;
    await this.ctx.suspend().catch(() => undefined);
    this.currentState = 'suspended';
  }

  async resume(): Promise<void> {
    if (!this.ctx || this.currentState !== 'suspended') return;
    await this.ctx.resume().catch(() => undefined);
    this.nextTime = this.ctx.currentTime + 0.05;
    this.currentState = 'running';
    this.fill();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.currentState = 'stopped';
  }

  async dispose(): Promise<void> {
    await this.stop();
    try {
      // The organic graph first: it holds source nodes that are still scheduled
      // against this context, and closing the context underneath them logs a
      // stream of errors that say nothing about what went wrong.
      this.organic?.dispose();
      this.organicBus?.disconnect();
      this.precisionBus?.disconnect();
      this.master?.disconnect();
      await this.ctx?.close();
    } catch {
      // Closing an already-closed context is not worth surfacing.
    }
    this.ctx = null;
    this.master = null;
    this.precisionBus = null;
    this.organicBus = null;
    this.organic = null;
    this.source = null;
    this.currentState = 'idle';
  }

  stats(): BackendStats {
    return {
      buffersRendered: this.buffersRendered,
      underruns: this.underruns,
      bufferedSec: this.ctx ? Math.max(0, this.nextTime - this.ctx.currentTime) : 0,
      renderMsAverage: 0,
      load: 0,
      outputLatencySec: this.lookaheadSec,
    };
  }
}
