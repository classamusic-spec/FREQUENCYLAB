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
 *
 * ## Why the detector is a max-then-average rather than an envelope follower
 *
 * The obvious design — track the input level with an attack/release follower and
 * scale a delayed copy — cannot actually hold a ceiling, for two independent
 * reasons, and this stage used to have both.
 *
 * The first was that the follower read the *instantaneous* input while the
 * output read a sample one lookahead older, so the gain applied to a sample was
 * derived from one several cycles in its future: uncorrelated in phase with what
 * it was scaling. The product routinely overshot and the hard-clip safety net
 * below did the real limiting — 3,248 clipped samples per second on a 200 Hz
 * sine at unity, 11,974 at 2.0. The ceiling held, but by clipping, which is the
 * one thing this stage exists not to do.
 *
 * The second is intrinsic: an exponential follower only ever *approaches* its
 * target. Sizing the attack at five time constants inside the lookahead still
 * leaves it 0.7% short in dB when the peak lands, so a 2.6 dB reduction arrives
 * as 2.58 dB and the crest of every cycle grazes the clipper. Measured, that was
 * ~800 clipped samples per second: far better than 12,000, still not zero, and
 * no choice of coefficient makes it zero.
 *
 * So the detector is built to satisfy the bound outright. Two windows, each
 * `window` samples long:
 *
 *   M[n] = max |x| over [n-window+1, n]        (running max, monotone deque)
 *   A[n] = mean of M over [n-window+1, n]      (box average, ring + running sum)
 *
 * Every M in A's window contains sample `n - window + 1`, so `A[n]` is at least
 * the level of the sample leaving the delay line — that is the whole trick, and
 * it holds sample by sample rather than in the limit. Because the gain is then
 * at most `ceiling / A[n]`, the output is at most `ceiling`, with no appeal to
 * a clipper. And because A is a box average of a bounded signal, it moves by at
 * most `(max - min) / window` per sample: continuous, so no zipper artefacts,
 * and no faster than the lookahead, so no gain step ever outruns the delay.
 *
 * The box average alone would release in one window (5 ms), which pumps audibly
 * on bass. `releaseMs` is restored by holding the detector above A with a
 * one-pole decay toward it; holding it *above* A is what keeps the bound intact.
 */
export class StereoLimiter {
  private delayL: Float32Array;
  private delayR: Float32Array;
  private delayIndex = 0;
  private lookaheadSamples: number;
  private releaseCoefficient: number;
  private ceiling: number;
  private options: LimiterOptions;
  private sampleRate: number;

  /**
   * Length of both detector windows.
   *
   * One more than the delay, which is what makes the containment argument above
   * work: the sample being output sits at the oldest position the running max
   * still covers, rather than one past it.
   */
  private window: number;

  /* Running max over the window, as a monotone deque: values kept in decreasing
   * order so the front is always the window maximum, each sample pushed and
   * popped at most once. O(1) amortised, allocation free. */
  private dequeValue: Float32Array;
  private dequeAt: Float64Array;
  private dequeHead = 0;
  private dequeTail = 0;
  private dequeCapacity: number;
  /** Absolute input-sample counter, for windowing the deque. */
  private cursor = 0;

  /* Box average of the running max: ring buffer plus a running sum. */
  private averageRing: Float32Array;
  private averageIndex = 0;
  private averageSum = 0;

  /** Detector level, held above the box average to give a musical release. */
  private held = 0;

  /** Peak gain reduction, in dB, observed since the last `readGainReduction`. */
  private peakReductionDb = 0;
  /** Number of samples the hard-clip safety net had to engage on. */
  private clipEvents = 0;

  constructor(sampleRate: number, options: Partial<LimiterOptions> = {}) {
    this.sampleRate = sampleRate;
    this.options = { ...DEFAULT_LIMITER_OPTIONS, ...options };
    this.lookaheadSamples = Math.max(1, Math.round((this.options.lookaheadMs / 1000) * sampleRate));
    this.window = this.lookaheadSamples + 1;
    this.delayL = new Float32Array(this.lookaheadSamples);
    this.delayR = new Float32Array(this.lookaheadSamples);
    this.dequeCapacity = this.window + 1;
    this.dequeValue = new Float32Array(this.dequeCapacity);
    this.dequeAt = new Float64Array(this.dequeCapacity);
    this.averageRing = new Float32Array(this.window);
    this.ceiling = dbToGain(this.options.ceilingDb);
    this.releaseCoefficient = Math.exp(-1 / ((this.options.releaseMs / 1000) * sampleRate));
  }

  configure(sampleRate: number, options: Partial<LimiterOptions> = {}): void {
    const next = { ...this.options, ...options };
    const lookahead = Math.max(1, Math.round((next.lookaheadMs / 1000) * sampleRate));
    if (lookahead !== this.lookaheadSamples || sampleRate !== this.sampleRate) {
      this.lookaheadSamples = lookahead;
      this.window = lookahead + 1;
      this.delayL = new Float32Array(lookahead);
      this.delayR = new Float32Array(lookahead);
      this.dequeCapacity = this.window + 1;
      this.dequeValue = new Float32Array(this.dequeCapacity);
      this.dequeAt = new Float64Array(this.dequeCapacity);
      this.averageRing = new Float32Array(this.window);
      this.delayIndex = 0;
      this.dequeHead = 0;
      this.dequeTail = 0;
      this.cursor = 0;
      this.averageIndex = 0;
      this.averageSum = 0;
      this.held = 0;
    }
    this.sampleRate = sampleRate;
    this.options = next;
    this.ceiling = dbToGain(next.ceilingDb);
    this.releaseCoefficient = Math.exp(-1 / ((next.releaseMs / 1000) * sampleRate));
  }

  reset(): void {
    this.delayL.fill(0);
    this.delayR.fill(0);
    this.delayIndex = 0;
    this.peakReductionDb = 0;
    this.clipEvents = 0;
    this.dequeHead = 0;
    this.dequeTail = 0;
    this.cursor = 0;
    this.averageRing.fill(0);
    this.averageIndex = 0;
    this.averageSum = 0;
    this.held = 0;
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
    const window = this.window;
    const capacity = this.dequeCapacity;

    for (let i = 0; i < frames; i++) {
      const inL = left[i];
      const inR = right[i];

      // Running max: pop everything no larger than this sample off the back, so
      // the deque stays decreasing and the front is the window maximum.
      const level = Math.max(Math.abs(inL), Math.abs(inR));
      while (this.dequeTail !== this.dequeHead) {
        const back = (this.dequeTail + capacity - 1) % capacity;
        if (this.dequeValue[back] > level) break;
        this.dequeTail = back;
      }
      this.dequeValue[this.dequeTail] = level;
      this.dequeAt[this.dequeTail] = this.cursor;
      this.dequeTail = (this.dequeTail + 1) % capacity;

      // Drop whatever has fallen out of the back of the window.
      const oldest = this.cursor - window + 1;
      while (this.dequeAt[this.dequeHead] < oldest) {
        this.dequeHead = (this.dequeHead + 1) % capacity;
      }
      this.cursor++;
      const windowMax = this.dequeValue[this.dequeHead];

      // Box average of the running max. Subtracting the departing term rather
      // than re-summing keeps this O(1); the sum is float64 against float32
      // terms, so the drift over an hour is ~1e-12, but it is floored at zero
      // so a long tail of silence can never leave it slightly negative.
      this.averageSum -= this.averageRing[this.averageIndex];
      this.averageRing[this.averageIndex] = windowMax;
      this.averageSum += windowMax;
      this.averageIndex = this.averageIndex + 1 >= window ? 0 : this.averageIndex + 1;
      const average = this.averageSum > 0 ? this.averageSum / window : 0;

      // Hold above the average with a one-pole decay toward it. Staying at or
      // above `average` is what preserves the ceiling bound; the decay is only
      // ever how slowly we give reduction back.
      this.held =
        average >= this.held
          ? average
          : average + this.releaseCoefficient * (this.held - average);

      const overDb = gainToDb(this.held) - this.options.ceilingDb;

      let reductionDb = 0;
      if (Number.isFinite(overDb)) {
        if (overDb > knee / 2) {
          reductionDb = overDb;
        } else if (overDb > -knee / 2) {
          // Soft knee: quadratic transition into limiting. Note this curve sits
          // at or above the straight line through the whole knee, so it only
          // ever reduces more than strictly required — the bound is never
          // weakened by entering the knee.
          const x = overDb + knee / 2;
          reductionDb = (x * x) / (2 * knee);
        }
      }
      if (reductionDb > this.peakReductionDb) this.peakReductionDb = reductionDb;

      const gain = dbToGain(-reductionDb);

      const delayedL = this.delayL[this.delayIndex];
      const delayedR = this.delayR[this.delayIndex];
      this.delayL[this.delayIndex] = inL;
      this.delayR[this.delayIndex] = inR;
      this.delayIndex = this.delayIndex + 1 >= this.lookaheadSamples ? 0 : this.delayIndex + 1;

      let outL = delayedL * gain;
      let outR = delayedR * gain;

      /*
       * Safety net. The detector bound above is exact in real arithmetic, so in
       * ordinary operation this counter stays at zero and the branch never
       * taken — it exists for the pathological input and for the last ulp,
       * since `gain` comes back through a log/exp round trip and can land one
       * unit high on a sample already sitting exactly on the ceiling. The
       * epsilon is that one unit: without it the counter reports rounding as
       * clipping, which would make it useless as the alarm it is meant to be.
       */
      const trip = ceiling * (1 + 1e-6);
      if (outL > trip || outL < -trip) this.clipEvents++;
      if (outR > trip || outR < -trip) this.clipEvents++;
      outL = clamp(outL, -ceiling, ceiling);
      outR = clamp(outR, -ceiling, ceiling);

      left[i] = outL;
      right[i] = outR;
    }
  }

  /** True while the deque is empty — used only by the tests. */
  get windowIsEmpty(): boolean {
    return this.dequeHead === this.dequeTail;
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
