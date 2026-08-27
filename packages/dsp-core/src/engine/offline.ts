import { RenderGraph } from '../graph/renderGraph.js';
import type { RoutingGraph } from '../graph/types.js';
import { DEFAULT_BLOCK_SIZE } from '../math/constants.js';
import { totalDurationSec, type Protocol } from '../protocol/schema.js';
import { SessionRenderer } from './sessionRenderer.js';

export interface OfflineRenderResult {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  durationSec: number;
}

export interface OfflineRenderOptions {
  sampleRate?: number;
  blockSize?: number;
  /** Renders only the first N seconds. Used by tests and by preview export. */
  maxSeconds?: number;
  /** Skips the first N seconds of output (still rendered, so state is correct). */
  startSec?: number;
  onProgress?: (fraction: number) => void;
}

/**
 * Renders a whole protocol offline, faster than real time.
 *
 * This is the same `SessionRenderer` that drives live playback — the DSP
 * validation suite therefore tests the shipping engine, not a parallel
 * implementation of it (§54).
 */
export function renderProtocolOffline(
  protocol: Protocol,
  options: OfflineRenderOptions = {},
): OfflineRenderResult {
  const sampleRate = options.sampleRate ?? protocol.sampleRate ?? 48000;
  const blockSize = options.blockSize ?? DEFAULT_BLOCK_SIZE;
  const renderer = new SessionRenderer(protocol, { sampleRate, blockSize, compile: 'eager' });

  const startSec = Math.max(0, options.startSec ?? 0);
  const fullDuration = totalDurationSec(protocol);
  const endSec = Math.min(fullDuration, startSec + (options.maxSeconds ?? fullDuration));
  const totalFrames = Math.max(0, Math.round((endSec - startSec) * sampleRate));
  const skipFrames = Math.round(startSec * sampleRate);

  const left = new Float32Array(totalFrames);
  const right = new Float32Array(totalFrames);
  const blockL = new Float32Array(blockSize);
  const blockR = new Float32Array(blockSize);

  let produced = 0;
  let skipped = 0;
  while (produced < totalFrames) {
    renderer.render(blockL, blockR, blockSize);
    let readOffset = 0;
    let available = blockSize;
    if (skipped < skipFrames) {
      const skipHere = Math.min(available, skipFrames - skipped);
      skipped += skipHere;
      readOffset += skipHere;
      available -= skipHere;
    }
    if (available > 0) {
      const copy = Math.min(available, totalFrames - produced);
      left.set(blockL.subarray(readOffset, readOffset + copy), produced);
      right.set(blockR.subarray(readOffset, readOffset + copy), produced);
      produced += copy;
      options.onProgress?.(produced / totalFrames);
    }
  }

  return { left, right, sampleRate, durationSec: totalFrames / sampleRate };
}

/**
 * Renders a bare routing graph for a fixed duration with no protocol clock,
 * automation or master chain. The DSP unit tests use this to measure a single
 * module's output without the fade, gain or limiter in the way.
 */
export function renderGraphOffline(
  graph: RoutingGraph,
  seconds: number,
  sampleRate = 48000,
  blockSize = DEFAULT_BLOCK_SIZE,
): OfflineRenderResult {
  const compiled = new RenderGraph(graph, sampleRate, blockSize);
  const totalFrames = Math.round(seconds * sampleRate);
  const left = new Float32Array(totalFrames);
  const right = new Float32Array(totalFrames);
  const context = { sampleRate, blockSize, timeSec: 0 };

  let produced = 0;
  while (produced < totalFrames) {
    const frames = Math.min(blockSize, totalFrames - produced);
    context.timeSec = produced / sampleRate;
    compiled.render(frames, context);
    left.set(compiled.outL.subarray(0, frames), produced);
    right.set(compiled.outR.subarray(0, frames), produced);
    produced += frames;
  }

  return { left, right, sampleRate, durationSec: totalFrames / sampleRate };
}
