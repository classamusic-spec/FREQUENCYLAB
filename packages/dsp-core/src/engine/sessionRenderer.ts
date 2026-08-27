import { RenderGraph } from '../graph/renderGraph.js';
import type { RenderContext } from '../graph/nodes/base.js';
import { DEFAULT_BLOCK_SIZE } from '../math/constants.js';
import { clamp } from '../math/util.js';
import { evaluateAutomation } from '../protocol/automation.js';
import { stageOffsets, totalDurationSec, type Protocol, type ProtocolStage } from '../protocol/schema.js';
import { MasterChain, type MasterTelemetry } from './master.js';

interface CompiledStage {
  index: number;
  stage: ProtocolStage;
  graph: RenderGraph;
  startSec: number;
  endSec: number;
  /** True once automation has been snapped for this stage's first block. */
  primed: boolean;
}

export interface SessionTelemetry extends MasterTelemetry {
  sampleRate: number;
  blockSize: number;
  positionSec: number;
  durationSec: number;
  stageIndex: number;
  stageName: string;
  stagePositionSec: number;
  stageDurationSec: number;
  /** Live smoothed values of the parameters the instrument display shows. */
  readouts: Record<string, number>;
  crossfading: boolean;
  finished: boolean;
  activeNodes: number;
}

export interface SessionRendererOptions {
  sampleRate?: number;
  blockSize?: number;
  /** Stage compilation strategy. `eager` is used offline; `lazy` on device. */
  compile?: 'eager' | 'lazy';
}

/**
 * Deterministic protocol playback.
 *
 * The renderer owns the protocol clock. Given the same protocol, sample rate
 * and block size it produces bit-identical audio every time — that is what
 * makes a Protocol DNA a reproducible experiment rather than a label.
 *
 * Real-time contract: `render` allocates nothing, takes no locks, and never
 * touches the UI. Stage graphs are compiled ahead of the boundary that needs
 * them so a compile never happens inside a render call.
 */
export class SessionRenderer {
  readonly sampleRate: number;
  readonly blockSize: number;
  readonly durationSec: number;

  private readonly protocol: Protocol;
  private readonly offsets: number[];
  private readonly compiled: Array<CompiledStage | undefined>;
  private readonly master: MasterChain;
  private readonly automationValues = new Map<string, number>();
  private readonly scratchL: Float32Array;
  private readonly scratchR: Float32Array;
  private readonly context: RenderContext;

  private positionSamples = 0;
  private stopFadeGain = 1;
  private stopFadeRate = 0;
  private lastStageIndex = -1;

  constructor(protocol: Protocol, options: SessionRendererOptions = {}) {
    this.protocol = protocol;
    this.sampleRate = options.sampleRate ?? protocol.sampleRate ?? 48000;
    this.blockSize = options.blockSize ?? DEFAULT_BLOCK_SIZE;
    this.durationSec = totalDurationSec(protocol);
    this.offsets = stageOffsets(protocol);
    this.compiled = new Array(protocol.stages.length).fill(undefined);
    this.master = new MasterChain(this.sampleRate, protocol.master);
    this.scratchL = new Float32Array(this.blockSize);
    this.scratchR = new Float32Array(this.blockSize);
    this.context = { sampleRate: this.sampleRate, blockSize: this.blockSize, timeSec: 0 };

    if ((options.compile ?? 'lazy') === 'eager') {
      for (let i = 0; i < protocol.stages.length; i++) this.compileStage(i);
    } else if (protocol.stages.length > 0) {
      this.compileStage(0);
      if (protocol.stages.length > 1) this.compileStage(1);
    }
  }

  private compileStage(index: number): CompiledStage | undefined {
    if (index < 0 || index >= this.protocol.stages.length) return undefined;
    const existing = this.compiled[index];
    if (existing) return existing;
    const stage = this.protocol.stages[index];
    const compiled: CompiledStage = {
      index,
      stage,
      graph: new RenderGraph(stage.graph, this.sampleRate, this.blockSize),
      startSec: this.offsets[index],
      endSec: this.offsets[index] + Math.max(0, stage.durationSec),
      primed: false,
    };
    this.compiled[index] = compiled;
    return compiled;
  }

  get positionSec(): number {
    return this.positionSamples / this.sampleRate;
  }

  get finished(): boolean {
    return this.positionSec >= this.durationSec;
  }

  get masterChain(): MasterChain {
    return this.master;
  }

  /** Index of the stage containing the current position, clamped to the last. */
  get stageIndex(): number {
    const position = this.positionSec;
    for (let i = 0; i < this.protocol.stages.length; i++) {
      if (position < this.offsets[i] + Math.max(0, this.protocol.stages[i].durationSec)) return i;
    }
    return Math.max(0, this.protocol.stages.length - 1);
  }

  /** Live graph for the current stage, for the UI's parameter readouts. */
  get activeGraph(): RenderGraph | undefined {
    return this.compiled[this.stageIndex]?.graph;
  }

  /** Jumps the clock. Phases are reset, so a seek is not sample-continuous. */
  seek(timeSec: number): void {
    this.positionSamples = Math.round(clamp(timeSec, 0, this.durationSec) * this.sampleRate);
    for (const stage of this.compiled) {
      if (stage) stage.primed = false;
    }
    this.master.reset();
    this.lastStageIndex = -1;
  }

  reset(): void {
    this.seek(0);
    this.stopFadeGain = 1;
    this.stopFadeRate = 0;
    for (const stage of this.compiled) {
      if (stage) stage.graph.resetPhases();
    }
  }

  /**
   * Begins a smooth stop. The renderer keeps producing blocks until the fade
   * completes, so a stop is never a discontinuity — including a stop triggered
   * by a headphone disconnect (§57).
   */
  beginStopFade(seconds = 0.4): void {
    this.stopFadeRate = seconds > 0 ? 1 / (seconds * this.sampleRate) : 1;
  }

  cancelStopFade(): void {
    this.stopFadeRate = 0;
    this.stopFadeGain = 1;
  }

  get stopFadeComplete(): boolean {
    return this.stopFadeRate > 0 && this.stopFadeGain <= 0;
  }

  /** Live master gain, 0..1.5. Used by the intensity control during playback. */
  setMasterGain(value: number): void {
    this.master.setGain(value);
  }

  /**
   * Renders `frames` samples into `outL` / `outR` and advances the clock.
   * Blocks are split at stage boundaries so a transition is always sample-exact.
   */
  render(outL: Float32Array, outR: Float32Array, frames: number): void {
    let written = 0;
    while (written < frames) {
      const remaining = frames - written;
      const chunk = Math.min(remaining, this.blockSize, this.samplesUntilStageEnd());
      const size = Math.max(1, chunk);
      this.renderChunk(outL, outR, written, size);
      written += size;
    }
  }

  private samplesUntilStageEnd(): number {
    const index = this.stageIndex;
    const compiled = this.compiled[index] ?? this.compileStage(index);
    if (!compiled) return this.blockSize;
    const remainingSec = compiled.endSec - this.positionSec;
    if (remainingSec <= 0) return this.blockSize;
    return Math.max(1, Math.min(this.blockSize, Math.ceil(remainingSec * this.sampleRate)));
  }

  private renderChunk(outL: Float32Array, outR: Float32Array, offset: number, frames: number): void {
    const positionSec = this.positionSec;
    const index = this.stageIndex;
    const current = this.compiled[index] ?? this.compileStage(index);

    if (!current) {
      outL.fill(0, offset, offset + frames);
      outR.fill(0, offset, offset + frames);
      this.positionSamples += frames;
      return;
    }

    // Compile the next stage a stage ahead of time, never inside a boundary.
    if (index !== this.lastStageIndex) {
      this.compileStage(index + 1);
      this.lastStageIndex = index;
    }

    const stageTime = positionSec - current.startSec;
    this.applyAutomation(current, stageTime);
    this.context.timeSec = positionSec;
    current.graph.render(frames, this.context);

    const crossfade = current.stage.crossfadeSec;
    const previous = index > 0 ? this.compiled[index - 1] : undefined;
    const crossfading = crossfade > 0 && index > 0 && stageTime < crossfade && previous !== undefined;

    if (crossfading && previous) {
      // The outgoing stage keeps rendering with its automation held at its final
      // value, so the two graphs are phase-continuous across the boundary.
      this.applyAutomation(previous, previous.stage.durationSec);
      previous.graph.render(frames, this.context);
    }

    const srcL = current.graph.outL;
    const srcR = current.graph.outR;
    const inverseRate = 1 / this.sampleRate;

    if (crossfading && previous) {
      const prevL = previous.graph.outL;
      const prevR = previous.graph.outR;
      for (let i = 0; i < frames; i++) {
        const t = clamp((stageTime + i * inverseRate) / crossfade, 0, 1);
        // Equal-power cross-fade: two uncorrelated signals sum without a dip.
        const gainIn = Math.sin((t * Math.PI) / 2);
        const gainOut = Math.cos((t * Math.PI) / 2);
        this.scratchL[i] = srcL[i] * gainIn + prevL[i] * gainOut;
        this.scratchR[i] = srcR[i] * gainIn + prevR[i] * gainOut;
      }
    } else {
      this.scratchL.set(srcL.subarray(0, frames));
      this.scratchR.set(srcR.subarray(0, frames));
    }

    if (this.stopFadeRate > 0) {
      for (let i = 0; i < frames; i++) {
        const g = Math.max(0, this.stopFadeGain - this.stopFadeRate * i);
        this.scratchL[i] *= g;
        this.scratchR[i] *= g;
      }
      this.stopFadeGain = Math.max(0, this.stopFadeGain - this.stopFadeRate * frames);
    }

    this.master.process(this.scratchL, this.scratchR, frames, positionSec, this.durationSec);

    for (let i = 0; i < frames; i++) {
      outL[offset + i] = this.scratchL[i];
      outR[offset + i] = this.scratchR[i];
    }

    this.positionSamples += frames;
  }

  private applyAutomation(compiled: CompiledStage, stageTimeSec: number): void {
    if (compiled.stage.automation.length === 0) {
      compiled.primed = true;
      return;
    }
    evaluateAutomation(compiled.stage.automation, stageTimeSec, this.automationValues);
    if (!compiled.primed) {
      // Snap on the first block of a stage: the stored parameter and the lane's
      // value at t=0 can differ, and ramping between them would be an artefact
      // of the editor rather than something the protocol asked for.
      for (const [address, value] of this.automationValues) {
        const parsed = address.split(':');
        if (parsed.length < 2) continue;
        compiled.graph.getNode(parsed[0])?.setParamImmediate(parsed.slice(1).join(':'), value);
      }
      compiled.primed = true;
      return;
    }
    for (const [address, value] of this.automationValues) {
      compiled.graph.setParamByAddress(address, value);
    }
  }

  telemetry(): SessionTelemetry {
    const index = this.stageIndex;
    const compiled = this.compiled[index];
    const stage = this.protocol.stages[index];
    const graph = compiled?.graph;
    const readouts: Record<string, number> = {};
    if (graph) {
      for (const nodeId of graph.nodeIds) {
        const node = graph.getNode(nodeId);
        if (!node) continue;
        for (const key of ['carrier', 'beat', 'pulse', 'frequency', 'level', 'amplitude', 'modFrequency']) {
          const value = node.currentValue(key);
          if (value !== 0 || key === 'level') readouts[`${nodeId}:${key}`] = value;
        }
      }
    }
    return {
      ...this.master.telemetry(),
      sampleRate: this.sampleRate,
      blockSize: this.blockSize,
      positionSec: this.positionSec,
      durationSec: this.durationSec,
      stageIndex: index,
      stageName: stage?.name ?? '—',
      stagePositionSec: compiled ? this.positionSec - compiled.startSec : 0,
      stageDurationSec: stage?.durationSec ?? 0,
      readouts,
      crossfading:
        compiled !== undefined &&
        index > 0 &&
        this.positionSec - compiled.startSec < compiled.stage.crossfadeSec,
      finished: this.finished,
      activeNodes: graph?.nodeIds.length ?? 0,
    };
  }
}
