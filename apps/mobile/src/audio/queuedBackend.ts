import {
  AudioContext,
  AudioManager,
  type AudioBuffer,
  type AudioBufferQueueSourceNode,
} from 'react-native-audio-api';
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
 * The shipping audio backend.
 *
 * FREQUENCY LAB synthesises every sample itself, so it needs a way to hand
 * self-rendered PCM to the platform's audio graph. `AudioBufferQueueSourceNode`
 * is that path: a queue of buffers the native side plays gaplessly, refilled
 * from JS as each one finishes.
 *
 * The design constraint is the one from §56 — the audio must not depend on the
 * UI frame rate. It does not: rendering is driven by buffer-completion events
 * from the audio thread, and a queue several buffers deep absorbs any JS-thread
 * stall (a layout pass, a garbage collection) without a dropout. A watchdog
 * timer refills the queue as well, so a dropped event cannot silently strand
 * playback.
 *
 * Total added latency is `queueDepth × bufferFrames`, which at the defaults is
 * about 256 ms. That is the price of running DSP in JavaScript rather than on
 * the audio thread; the trade is visible and tunable in the diagnostics screen.
 */
export class QueuedAudioBackend implements AudioBackend {
  readonly name = 'AudioBufferQueue';

  private context: AudioContext | null = null;
  private node: AudioBufferQueueSourceNode | null = null;
  private source: RenderSource | null = null;
  private options: AudioBackendOptions;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  // Explicitly backed by an ArrayBuffer: `copyToChannel` will not accept a
  // view over a SharedArrayBuffer, which is what a bare Float32Array widens to.
  private readonly scratchL: Float32Array<ArrayBuffer>;
  private readonly scratchR: Float32Array<ArrayBuffer>;

  private queued = 0;
  private buffersRendered = 0;
  private underruns = 0;
  private renderMsTotal = 0;
  private currentState: BackendState = 'idle';

  constructor(options: Partial<AudioBackendOptions> = {}) {
    this.options = { ...DEFAULT_BACKEND_OPTIONS, ...options };
    this.scratchL = new Float32Array(this.options.bufferFrames);
    this.scratchR = new Float32Array(this.options.bufferFrames);
  }

  get sampleRate(): number {
    return this.context?.sampleRate ?? this.options.sampleRate;
  }

  get state(): BackendState {
    return this.currentState;
  }

  get audible(): boolean {
    return true;
  }

  async start(source: RenderSource): Promise<void> {
    if (this.currentState === 'running') return;
    this.source = source;
    this.currentState = 'starting';

    try {
      // Playback category with background mode: sessions continue with the
      // screen locked, and the system treats us as media rather than as a UI
      // sound that can be silenced by the ringer switch.
      AudioManager.setAudioSessionOptions({
        iosCategory: 'playback',
        iosMode: 'default',
        iosOptions: ['allowBluetoothA2DP', 'allowAirPlay'],
        iosNotifyOthersOnDeactivation: true,
      });
      await AudioManager.setAudioSessionActivity(true);
      AudioManager.observeAudioInterruptions(true);
      AudioManager.observeVolumeChanges(true);

      this.context = new AudioContext({ sampleRate: this.options.sampleRate });
      this.node = this.context.createBufferQueueSource();
      this.node.connect(this.context.destination);
      this.node.onBufferEnded = () => {
        this.queued = Math.max(0, this.queued - 1);
        if (this.queued === 0) this.underruns++;
        this.fill();
      };

      this.fill();
      this.node.start();
      this.currentState = 'running';

      // Watchdog: if a completion event is ever dropped, this keeps the queue
      // topped up rather than letting the session stall silently.
      this.watchdog = setInterval(() => this.fill(), this.bufferDurationMs());
    } catch (error) {
      this.currentState = 'failed';
      await this.dispose();
      throw new AudioBackendUnavailableError(
        error instanceof Error ? error.message : 'The audio engine could not be started.',
      );
    }
  }

  private bufferDurationMs(): number {
    return Math.max(16, Math.round((this.options.bufferFrames / this.sampleRate) * 1000));
  }

  /** Renders and enqueues buffers until the queue is at its target depth. */
  private fill(): void {
    const context = this.context;
    const node = this.node;
    const source = this.source;
    if (!context || !node || !source || this.currentState === 'stopped') return;

    while (this.queued < this.options.queueDepth) {
      const started = Date.now();
      source.render(this.scratchL, this.scratchR, this.options.bufferFrames);
      const buffer: AudioBuffer = context.createBuffer(
        2,
        this.options.bufferFrames,
        context.sampleRate,
      );
      buffer.copyToChannel(this.scratchL, 0);
      buffer.copyToChannel(this.scratchR, 1);
      node.enqueueBuffer(buffer);
      this.queued++;
      this.buffersRendered++;
      this.renderMsTotal += Date.now() - started;
    }
  }

  async suspend(): Promise<void> {
    if (!this.context || this.currentState !== 'running') return;
    await this.context.suspend();
    this.currentState = 'suspended';
  }

  async resume(): Promise<void> {
    if (!this.context || this.currentState !== 'suspended') return;
    await this.context.resume();
    this.currentState = 'running';
    this.fill();
  }

  async stop(): Promise<void> {
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
    try {
      this.node?.stop();
      this.node?.clearBuffers();
    } catch {
      // Stopping an already-stopped node is not an error worth surfacing.
    }
    this.queued = 0;
    this.currentState = 'stopped';
  }

  async dispose(): Promise<void> {
    await this.stop();
    try {
      this.node?.disconnect();
      await this.context?.close();
      await AudioManager.setAudioSessionActivity(false);
    } catch {
      // Teardown is best effort; the session is going away regardless.
    }
    this.node = null;
    this.context = null;
    this.source = null;
    this.currentState = 'idle';
  }

  stats(): BackendStats {
    const bufferSec = this.options.bufferFrames / this.sampleRate;
    const average = this.buffersRendered > 0 ? this.renderMsTotal / this.buffersRendered : 0;
    return {
      buffersRendered: this.buffersRendered,
      underruns: this.underruns,
      bufferedSec: this.queued * bufferSec,
      renderMsAverage: average,
      load: bufferSec > 0 ? average / 1000 / bufferSec : 0,
      outputLatencySec: this.options.queueDepth * bufferSec,
    };
  }

  /** Buffer size and depth, for the diagnostics screen. */
  get configuration(): AudioBackendOptions {
    return { ...this.options };
  }
}
