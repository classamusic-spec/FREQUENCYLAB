/**
 * The audio backend seam.
 *
 * Everything above this interface — the session controller, the UI, the
 * telemetry — is platform independent. Everything below it is the specific way
 * one platform gets rendered blocks to a speaker. Keeping that boundary sharp
 * is what lets the same `SessionRenderer` drive live playback, the offline
 * renderer and the test suite (§66).
 */

export interface RenderSource {
  /** Fills `left` and `right` with `frames` samples and advances its clock. */
  render(left: Float32Array, right: Float32Array, frames: number): void;
}

export interface AudioBackendOptions {
  sampleRate: number;
  /**
   * Frames per enqueued buffer. Smaller means a shorter delay between turning
   * a control and hearing it; larger means more tolerance for a stalled JS
   * thread. 2048 at 48 kHz is ~43 ms.
   */
  bufferFrames: number;
  /** Buffers kept queued ahead of playback. Total latency is depth × frames. */
  queueDepth: number;
}

export const DEFAULT_BACKEND_OPTIONS: AudioBackendOptions = {
  sampleRate: 48000,
  bufferFrames: 2048,
  queueDepth: 6,
};

export interface BackendStats {
  /** Buffers rendered since start. */
  buffersRendered: number;
  /** Times the queue ran dry — an audible gap. */
  underruns: number;
  /** Seconds of audio currently queued ahead of the playhead. */
  bufferedSec: number;
  /** Mean wall-clock milliseconds spent rendering one buffer. */
  renderMsAverage: number;
  /** Render time as a fraction of the buffer's duration. Below 1 is real time. */
  load: number;
  outputLatencySec: number;
}

export type BackendState = 'idle' | 'starting' | 'running' | 'suspended' | 'stopped' | 'failed';

export interface AudioBackend {
  readonly name: string;
  readonly sampleRate: number;
  readonly state: BackendState;
  /** True when this backend actually produces sound on this device. */
  readonly audible: boolean;
  start(source: RenderSource): Promise<void>;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
  stats(): BackendStats;
}

export class AudioBackendUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'AudioBackendUnavailableError';
  }
}
