import { clamp, dbToGain, gainToDb } from '../math/util.js';

export interface LimiterOptions {
  /** Ceiling in dBFS. Nothing leaves the engine above this. */
  ceilingDb: number;
  /** Lookahead in milliseconds. */
  lookaheadMs: number;
  /** Release time in milliseconds. */
  releaseMs: number;
  /** Soft knee width in dB. */
  kneeDb: number;
}

export const DEFAULT_LIMITER_OPTIONS: LimiterOptions = {
  ceilingDb: -1,
  lookaheadMs: 5,
  releaseMs: 120,
  kneeDb: 3,
};

/**
 * Stereo lookahead limiter — the last stage before the output and the one piece
 * of the chain the user cannot bypass (§28).
 *
 * The detector runs on the linked maximum of both channels so the stereo image
 * never shifts under gain reduction, which matters here because a wandering
 * image would be indistinguishable from the binaural effect being measured.
 *
 * All buffers are allocated in the constructor; `process` performs no
 * allocation and takes no locks, so it is safe to call from a render callback.
 */
export class StereoLimiter {
  private delayL: Float32Array;
  private delayR: Float32Array;
  private delayIndex = 0;
  private lookaheadSamples: number;
  private envelope = 0;
  private releaseCoefficient: number;
  private attackCoefficient: number;
  private ceiling: number;
  private options: LimiterOptions;
  private sampleRate: number;

  /** Peak gain reduction, in dB, observed since the last `readGainReduction`. */
  private peakReductionDb = 0;
  /** Number of samples the hard-clip safety net had to engage on. */
  private clipEvents = 0;

  constructor(sampleRate: number, options: Partial<LimiterOptions> = {}) {
    this.sampleRate = sampleRate;
    this.options = { ...DEFAULT_LIMITER_OPTIONS, ...options };
    this.lookaheadSamples = Math.max(1, Math.round((this.options.lookaheadMs / 1000) * sampleRate));
    this.delayL = new Float32Array(this.lookaheadSamples);
    this.delayR = new Float32Array(this.lookaheadSamples);
    this.ceiling = dbToGain(this.options.ceilingDb);
    this.attackCoefficient = Math.exp(-1 / (0.0005 * sampleRate));
    this.releaseCoefficient = Math.exp(-1 / ((this.options.releaseMs / 1000) * sampleRate));
  }

  configure(sampleRate: number, options: Partial<LimiterOptions> = {}): void {
    const next = { ...this.options, ...options };
    const lookahead = Math.max(1, Math.round((next.lookaheadMs / 1000) * sampleRate));
    if (lookahead !== this.lookaheadSamples || sampleRate !== this.sampleRate) {
      this.lookaheadSamples = lookahead;
      this.delayL = new Float32Array(lookahead);
      this.delayR = new Float32Array(lookahead);
      this.delayIndex = 0;
    }
    this.sampleRate = sampleRate;
    this.options = next;
    this.ceiling = dbToGain(next.ceilingDb);
    this.attackCoefficient = Math.exp(-1 / (0.0005 * sampleRate));
    this.releaseCoefficient = Math.exp(-1 / ((next.releaseMs / 1000) * sampleRate));
  }

  reset(): void {
    this.delayL.fill(0);
    this.delayR.fill(0);
    this.delayIndex = 0;
    this.envelope = 0;
    this.peakReductionDb = 0;
    this.clipEvents = 0;
  }

  /** Latency the limiter introduces, in samples. */
  get latencySamples(): number {
    return this.lookaheadSamples;
  }

  /**
   * Processes a stereo block in place.
   * `left` and `right` must each hold at least `frames` samples.
   */
  process(left: Float32Array, right: Float32Array, frames: number): void {
    const ceiling = this.ceiling;
    const knee = this.options.kneeDb;

    for (let i = 0; i < frames; i++) {
      const inL = left[i];
      const inR = right[i];

      // Look ahead: the detector reads the *incoming* sample while the output
      // reads the sample delayed by the lookahead window, so gain reduction is
      // already in place by the time the transient arrives at the output.
      const detector = Math.max(Math.abs(inL), Math.abs(inR));
      const overDb = gainToDb(detector) - this.options.ceilingDb;

      let targetReductionDb = 0;
      if (Number.isFinite(overDb)) {
        if (overDb > knee / 2) {
          targetReductionDb = overDb;
        } else if (overDb > -knee / 2) {
          // Soft knee: quadratic transition into limiting.
          const x = overDb + knee / 2;
          targetReductionDb = (x * x) / (2 * knee);
        }
      }

      const coefficient =
        targetReductionDb > this.envelope ? this.attackCoefficient : this.releaseCoefficient;
      this.envelope = targetReductionDb + coefficient * (this.envelope - targetReductionDb);
      if (this.envelope < 0) this.envelope = 0;
      if (this.envelope > this.peakReductionDb) this.peakReductionDb = this.envelope;

      const gain = dbToGain(-this.envelope);

      const delayedL = this.delayL[this.delayIndex];
      const delayedR = this.delayR[this.delayIndex];
      this.delayL[this.delayIndex] = inL;
      this.delayR[this.delayIndex] = inR;
      this.delayIndex = this.delayIndex + 1 >= this.lookaheadSamples ? 0 : this.delayIndex + 1;

      let outL = delayedL * gain;
      let outR = delayedR * gain;

      // Safety net. The envelope follower cannot be faster than its attack, so
      // a pathological input could still momentarily exceed the ceiling; this
      // guarantees the invariant the safety tests assert.
      if (outL > ceiling || outL < -ceiling) {
        outL = clamp(outL, -ceiling, ceiling);
        this.clipEvents++;
      }
      if (outR > ceiling || outR < -ceiling) {
        outR = clamp(outR, -ceiling, ceiling);
        this.clipEvents++;
      }

      left[i] = outL;
      right[i] = outR;
    }
  }

  /** Reads and clears the peak gain reduction since the last call. */
  readGainReduction(): number {
    const value = this.peakReductionDb;
    this.peakReductionDb = 0;
    return value;
  }

  /** Reads and clears the safety-net clip counter. */
  readClipEvents(): number {
    const value = this.clipEvents;
    this.clipEvents = 0;
    return value;
  }
}
