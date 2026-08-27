import { onePoleCoefficient } from './util.js';

/**
 * Per-sample parameter smoothing. Every audible parameter in the graph passes
 * through one of these so that automation, encoder gestures and stage changes
 * cannot produce zipper noise or step discontinuities (see §25 of the product
 * brief). Smoothers allocate once and are reset, never reallocated.
 */
export class OnePoleSmoother {
  private coefficient: number;
  private current: number;
  private target: number;

  constructor(
    initial: number,
    private readonly timeConstantSeconds: number,
    sampleRate: number,
  ) {
    this.current = initial;
    this.target = initial;
    this.coefficient = onePoleCoefficient(timeConstantSeconds, sampleRate);
  }

  setSampleRate(sampleRate: number): void {
    this.coefficient = onePoleCoefficient(this.timeConstantSeconds, sampleRate);
  }

  /** Jumps to a value with no smoothing. Only safe while output is silent. */
  reset(value: number): void {
    this.current = value;
    this.target = value;
  }

  setTarget(value: number): void {
    this.target = value;
  }

  get value(): number {
    return this.current;
  }

  get targetValue(): number {
    return this.target;
  }

  /** Advances one sample and returns the smoothed value. */
  next(): number {
    this.current += (this.target - this.current) * this.coefficient;
    return this.current;
  }

  /** True once the smoother has effectively converged. */
  isSettled(epsilon = 1e-6): boolean {
    return Math.abs(this.target - this.current) < epsilon;
  }
}

/**
 * Linear ramp across exactly one render block. Automation is evaluated at block
 * boundaries; this interpolates between the previous and next control value so
 * the audio rate signal stays continuous even at large block sizes.
 */
export class BlockRamp {
  private current = 0;
  private increment = 0;

  constructor(initial = 0) {
    this.current = initial;
  }

  reset(value: number): void {
    this.current = value;
    this.increment = 0;
  }

  /** Prepares a ramp from the current value to `target` over `frames` samples. */
  prepare(target: number, frames: number): void {
    this.increment = frames > 0 ? (target - this.current) / frames : 0;
  }

  next(): number {
    const value = this.current;
    this.current += this.increment;
    return value;
  }

  get value(): number {
    return this.current;
  }
}
