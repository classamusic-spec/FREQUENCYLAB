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
/**
 * Time constant for the cross-fade's block statistics, in seconds.
 *
 * Long enough that the correction never steps audibly, short enough to follow
 * the beat between two detuned stages — which is the case that needs it, and
 * which runs anywhere from a fraction of a hertz to a few hertz. Expressed in
 * seconds rather than as a per-block coefficient because a fixed coefficient
 * would silently mean 88 ms at 48 kHz and 265 ms at 16 kHz, and the second is
 * too slow to see a 0.8 Hz beat at all.
 */
const FADE_STATS_TAU_SEC = 0.04;

/*
 * Bounds on the correction, in amplitude.
 *
 * The lower bound can never bind. By AM-GM the cross term is at most the sum of
 * the two power terms, so the mix is never more than twice the power the
 * equal-power law was aiming for, and the correction is never below 1/sqrt(2).
 * Half is belt and braces against a degenerate statistic, not a design choice.
 *
 * The upper bound is a real limit and does bind, on two stages that detune
 * during the fade and drift towards cancellation. It is safe to make it
 * generous: the correction is above 1 only when the mix is *below* the level
 * the fade was aiming for, and it restores exactly to that level and no
 * further, so a large bound can never make anything louder than the stage it is
 * fading between — it only decides how deep an interference notch gets filled.
 * Four is where the returns stop: on the Frequency Sweep Demo's exponential
 * carrier drift, the worst boundary in the shipped set, raising it from 2 to 4
 * lifts the notch from -8.78 dB to -3.40 dB and going on to 8 buys 0.14 dB
 * more. What is left there is two detuning tones genuinely interfering, which
 * is physics rather than a fade law, and no gain the two signals share can
 * remove it.
 */
const MIN_FADE_CORRECTION = 0.5;
const MAX_FADE_CORRECTION = 4;

/**
 * Fade applied when a sleep timer stops a session, in seconds.
 *
 * It lives beside the renderer rather than in the app because it is an
 * audio-safety figure and not a preference: §28 says a session never cuts into
 * someone's ears, and this is the one stop nobody is awake to anticipate. Six
 * seconds reads as the sound receding rather than being switched off, and is
 * still short enough that a listener who is awake is not left waiting for
 * silence. Callers pass it to `beginStopFade`; nothing may stop *faster* than a
 * manual stop, which is an order of magnitude quicker than this.
 */
export const SLEEP_TIMER_FADE_SEC = 6;

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
  /** Where the stop fade is heading: 0 while stopping, 1 while recovering. */
  private stopFadeTarget = 1;
  private lastStageIndex = -1;
  /** Stage index whose graph has already adopted the previous stage's phase. */
  private phaseAdoptedFor = -1;
  /*
   * Smoothed block statistics of the two graphs being cross-faded: mean square
   * of each and their mean product. See `render` for what they are for. Held
   * across blocks so the correction cannot jitter at the block rate; reset at
   * the start of every fade.
   */
  private fadePrevPower = 0;
  private fadeCurrentPower = 0;
  private fadeCovariance = 0;
  private fadeStatsPrimed = false;
  private readonly fadeStatsCoefficient: number;

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
    this.fadeStatsCoefficient =
      1 - Math.exp(-this.blockSize / this.sampleRate / FADE_STATS_TAU_SEC);

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
    // A seek can land mid-fade in a stage that already adopted phase, or jump
    // backwards past one that has; either way the adoption has to happen again
    // against whatever the graphs hold now.
    this.phaseAdoptedFor = -1;
    this.fadeStatsPrimed = false;
  }

  reset(): void {
    this.seek(0);
    this.stopFadeGain = 1;
    this.stopFadeRate = 0;
    this.stopFadeTarget = 1;
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
    this.stopFadeTarget = 0;
  }

  /**
   * Aborts a stop fade and brings the level back at the same rate.
   *
   * This used to assign `stopFadeGain = 1` outright. The fade multiplies the
   * scratch buffers *before* the master chain, so nothing downstream smoothed
   * it: cancelling part-way through — the documented auto-resume path after an
   * interruption — stepped the gain from wherever it had fallen to full in one
   * sample, which is a click in the one place the brief says there must never
   * be a discontinuity.
   */
  cancelStopFade(): void {
    this.stopFadeTarget = 1;
    if (this.stopFadeGain >= 1) {
      this.stopFadeGain = 1;
      this.stopFadeRate = 0;
    }
  }

  get stopFadeComplete(): boolean {
    return this.stopFadeTarget === 0 && this.stopFadeRate > 0 && this.stopFadeGain <= 0;
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
    const crossfade = current.stage.crossfadeSec;
    const previous = index > 0 ? this.compiled[index - 1] : undefined;
    const crossfading = crossfade > 0 && index > 0 && stageTime < crossfade && previous !== undefined;

    /*
     * Put the incoming graph's oscillators in a known relationship to the
     * outgoing one's — a quarter cycle behind — once, before either renders a
     * sample of this stage.
     *
     * Without this the incoming graph starts every oscillator at phase 0 while
     * the outgoing one sits at whatever `frequency x duration` left it, so the
     * two meet at an offset that is an accident of the stage length. Measured on
     * the shipped presets, that accident cost between +3.00 dB and -19.37 dB
     * across the fade: Calm and Focus bumped, and Meditation's return to alpha
     * very nearly cancelled itself to silence in the middle of a session.
     * `adoptPhasesFrom` explains why the answer is a quarter cycle rather than
     * flush alignment.
     */
    if (crossfading && previous && this.phaseAdoptedFor !== index) {
      current.graph.adoptPhasesFrom(previous.graph);
      this.phaseAdoptedFor = index;
      this.fadeStatsPrimed = false;
    }

    this.applyAutomation(current, stageTime);
    this.context.timeSec = positionSec;
    current.graph.render(frames, this.context);

    if (crossfading && previous) {
      // The outgoing stage keeps rendering with its automation held at its final
      // value, so it stays phase-continuous with itself across the boundary.
      this.applyAutomation(previous, previous.stage.durationSec);
      previous.graph.render(frames, this.context);
    }

    const srcL = current.graph.outL;
    const srcR = current.graph.outR;
    const inverseRate = 1 / this.sampleRate;

    if (crossfading && previous) {
      const prevL = previous.graph.outL;
      const prevR = previous.graph.outR;

      /*
       * Cross-fade with the correlation measured rather than assumed.
       *
       * The sine/cosine law is the right one for two *uncorrelated* signals,
       * whose powers add. Consecutive stages are usually the same carrier with
       * a different beat, which is about as correlated as two signals get — and
       * once phase-aligned above, deliberately so. Their amplitudes add, not
       * their powers, and sin + cos peaks at sqrt(2): the +3 dB bump measured on
       * Calm and Focus. Neither law is right in general, because a stage that
       * sweeps its carrier starts correlated and decorrelates as the fade runs.
       *
       * So measure it. With P for mean square and C for the mean product, the
       * power of the mix is
       *
       *   gOut^2 P_prev + gIn^2 P_cur + 2 gIn gOut C
       *
       * of which the first two terms are exactly what the equal-power law was
       * aiming for. Scaling both gains by the square root of their ratio to the
       * whole removes the third term's contribution, which collapses to the
       * equal-power law when C is 0 and to a linear-amplitude fade when the two
       * signals are identical. The correction is bounded either side: it is a
       * fade law, not a compressor, and a pair of signals that genuinely cancel
       * cannot be rescued by a gain they share.
       */
      let sumPrev = 0;
      let sumCurrent = 0;
      let sumProduct = 0;
      for (let i = 0; i < frames; i++) {
        sumPrev += prevL[i] * prevL[i] + prevR[i] * prevR[i];
        sumCurrent += srcL[i] * srcL[i] + srcR[i] * srcR[i];
        sumProduct += prevL[i] * srcL[i] + prevR[i] * srcR[i];
      }
      const inverseFrames = 1 / (2 * frames);
      const blockPrev = sumPrev * inverseFrames;
      const blockCurrent = sumCurrent * inverseFrames;
      const blockProduct = sumProduct * inverseFrames;

      // One-pole across blocks, so the correction tracks a sweep without
      // stepping at the block rate. Primed from the first block of the fade
      // rather than from zero, which would otherwise read as silence.
      if (!this.fadeStatsPrimed) {
        this.fadePrevPower = blockPrev;
        this.fadeCurrentPower = blockCurrent;
        this.fadeCovariance = blockProduct;
        this.fadeStatsPrimed = true;
      } else {
        const a = this.fadeStatsCoefficient;
        this.fadePrevPower += a * (blockPrev - this.fadePrevPower);
        this.fadeCurrentPower += a * (blockCurrent - this.fadeCurrentPower);
        this.fadeCovariance += a * (blockProduct - this.fadeCovariance);
      }

      const powerPrev = this.fadePrevPower;
      const powerCurrent = this.fadeCurrentPower;
      const covariance = this.fadeCovariance;

      for (let i = 0; i < frames; i++) {
        const t = clamp((stageTime + i * inverseRate) / crossfade, 0, 1);
        const gainIn = Math.sin((t * Math.PI) / 2);
        const gainOut = Math.cos((t * Math.PI) / 2);

        const uncorrelated = gainOut * gainOut * powerPrev + gainIn * gainIn * powerCurrent;
        const actual = uncorrelated + 2 * gainIn * gainOut * covariance;
        const correction =
          uncorrelated > 0 && actual > 0
            ? clamp(Math.sqrt(uncorrelated / actual), MIN_FADE_CORRECTION, MAX_FADE_CORRECTION)
            : 1;

        this.scratchL[i] = (srcL[i] * gainIn + prevL[i] * gainOut) * correction;
        this.scratchR[i] = (srcR[i] * gainIn + prevR[i] * gainOut) * correction;
      }
    } else {
      this.scratchL.set(srcL.subarray(0, frames));
      this.scratchR.set(srcR.subarray(0, frames));
    }

    if (this.stopFadeRate > 0) {
      const direction = this.stopFadeTarget > this.stopFadeGain ? 1 : -1;
      for (let i = 0; i < frames; i++) {
        const g = clamp(this.stopFadeGain + direction * this.stopFadeRate * i, 0, 1);
        this.scratchL[i] *= g;
        this.scratchR[i] *= g;
      }
      this.stopFadeGain = clamp(
        this.stopFadeGain + direction * this.stopFadeRate * frames,
        0,
        1,
      );
      // Once recovery reaches full level there is nothing left to apply.
      if (this.stopFadeTarget === 1 && this.stopFadeGain >= 1) this.stopFadeRate = 0;
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
