import {
  DEFAULT_BACKEND_OPTIONS,
  type AudioBackend,
  type AudioBackendOptions,
  type BackendState,
  type BackendStats,
  type RenderSource,
} from './types';

/**
 * A backend that advances the protocol clock but produces no sound.
 *
 * It exists for environments where the native audio module is not linked — a
 * managed Expo Go client, a screenshot harness — so the rest of the app can be
 * exercised. It reports `audible: false`, and the UI shows an explicit banner
 * whenever it is in use: the product's rule is that nothing may look like it is
 * working when it is not (§65).
 */
export class NullAudioBackend implements AudioBackend {
  readonly name = 'Unavailable';
  readonly audible = false;

  private source: RenderSource | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private options: AudioBackendOptions;
  private currentState: BackendState = 'idle';
  private buffersRendered = 0;

  private readonly scratchL: Float32Array;
  private readonly scratchR: Float32Array;

  constructor(
    readonly reason: string,
    options: Partial<AudioBackendOptions> = {},
  ) {
    this.options = { ...DEFAULT_BACKEND_OPTIONS, ...options };
    this.scratchL = new Float32Array(this.options.bufferFrames);
    this.scratchR = new Float32Array(this.options.bufferFrames);
  }

  get sampleRate(): number {
    return this.options.sampleRate;
  }

  get state(): BackendState {
    return this.currentState;
  }

  async start(source: RenderSource): Promise<void> {
    this.source = source;
    this.currentState = 'running';
    const intervalMs = (this.options.bufferFrames / this.options.sampleRate) * 1000;
    this.timer = setInterval(() => {
      this.source?.render(this.scratchL, this.scratchR, this.options.bufferFrames);
      this.buffersRendered++;
    }, intervalMs);
  }

  async suspend(): Promise<void> {
    this.currentState = 'suspended';
  }

  async resume(): Promise<void> {
    this.currentState = 'running';
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.currentState = 'stopped';
  }

  async dispose(): Promise<void> {
    await this.stop();
    this.source = null;
    this.currentState = 'idle';
  }

  stats(): BackendStats {
    return {
      buffersRendered: this.buffersRendered,
      underruns: 0,
      bufferedSec: 0,
      renderMsAverage: 0,
      load: 0,
      outputLatencySec: 0,
    };
  }
}
