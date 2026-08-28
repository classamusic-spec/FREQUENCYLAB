import { OnePoleSmoother } from '../../math/smoother.js';
import { clamp } from '../../math/util.js';
import { getDescriptor } from '../descriptors.js';
import type { GraphNode, NodeKind } from '../types.js';

export interface RenderContext {
  sampleRate: number;
  blockSize: number;
  /** Absolute session time in seconds at the first sample of the current block. */
  timeSec: number;
}

/**
 * Base class for every runtime graph node.
 *
 * Contract for the real-time path:
 *  - `prepare` is the only place buffers are allocated.
 *  - `render` must not allocate, throw, or take a lock.
 *  - Parameter writes only move smoother targets; the audio thread reads the
 *    smoothed value, so a UI write can never produce a discontinuity.
 */
export abstract class RuntimeNode {
  readonly id: string;
  readonly kind: NodeKind;

  /** Summed input from all upstream connections. */
  inL: Float32Array = EMPTY;
  inR: Float32Array = EMPTY;
  /** This node's stereo output. */
  outL: Float32Array = EMPTY;
  outR: Float32Array = EMPTY;

  /** True when at least one upstream node wrote into the input buffers. */
  hasInput = false;
  bypass = false;

  protected sampleRate = 48000;
  protected blockSize = 128;
  protected readonly smoothers = new Map<string, OnePoleSmoother>();
  protected readonly raw = new Map<string, number>();
  protected options: Record<string, string> = {};

  constructor(node: GraphNode) {
    this.id = node.id;
    this.kind = node.kind;
    this.bypass = node.bypass === true;
    this.options = { ...node.options };
    for (const [key, value] of Object.entries(node.params)) this.raw.set(key, value);
  }

  /**
   * Declared range per parameter, captured when the node is prepared.
   *
   * `prepare` clamped the *initial* value and nothing clamped after that, so an
   * automation lane — which calls `setParamTarget` every block — could drive a
   * parameter arbitrarily far outside its descriptor. A lane holding an
   * oscillator's amplitude at 50 rendered a peak of 20 with the limiter off,
   * and above Nyquist a frequency lane aliased. The descriptor is the contract;
   * it has to hold on every write, not just the first.
   */
  private ranges = new Map<string, { min: number; max: number }>();

  prepare(sampleRate: number, blockSize: number): void {
    this.sampleRate = sampleRate;
    this.blockSize = blockSize;
    this.inL = new Float32Array(blockSize);
    this.inR = new Float32Array(blockSize);
    this.outL = new Float32Array(blockSize);
    this.outR = new Float32Array(blockSize);
    this.smoothers.clear();
    this.ranges.clear();
    for (const param of getDescriptor(this.kind).params) {
      this.ranges.set(param.key, { min: param.min, max: param.max });
      const initial = clamp(this.raw.get(param.key) ?? param.default, param.min, param.max);
      this.smoothers.set(
        param.key,
        new OnePoleSmoother(initial, param.smoothingSeconds ?? 0.02, sampleRate),
      );
    }
    this.onPrepare();
  }

  /** Hook for subclasses to build their own state once buffers exist. */
  protected onPrepare(): void {}

  /** Clamps to the declared range. Non-finite input holds the current value. */
  private bounded(key: string, value: number): number | null {
    if (!Number.isFinite(value)) return null;
    const range = this.ranges.get(key);
    return range ? clamp(value, range.min, range.max) : value;
  }

  /** Moves a parameter's smoother target. Safe to call from any thread. */
  setParamTarget(key: string, value: number): void {
    const next = this.bounded(key, value);
    if (next === null) return;
    const smoother = this.smoothers.get(key);
    if (!smoother) {
      this.raw.set(key, next);
      return;
    }
    smoother.setTarget(next);
    this.raw.set(key, next);
  }

  /** Snaps a parameter with no ramp. Only valid while the engine is silent. */
  setParamImmediate(key: string, value: number): void {
    const next = this.bounded(key, value);
    if (next === null) return;
    const smoother = this.smoothers.get(key);
    if (smoother) smoother.reset(next);
    this.raw.set(key, next);
  }

  getOption(key: string, fallback = ''): string {
    return this.options[key] ?? fallback;
  }

  setOption(key: string, value: string): void {
    this.options[key] = value;
    this.onOptionChanged(key, value);
  }

  protected onOptionChanged(_key: string, _value: string): void {}

  protected smoother(key: string): OnePoleSmoother {
    const found = this.smoothers.get(key);
    if (found) return found;
    // Defensive: a descriptor change should never silently render a constant.
    const created = new OnePoleSmoother(this.raw.get(key) ?? 0, 0.02, this.sampleRate);
    this.smoothers.set(key, created);
    return created;
  }

  /** Current smoothed value of a parameter, for telemetry and the UI. */
  currentValue(key: string): number {
    return this.smoothers.get(key)?.value ?? this.raw.get(key) ?? 0;
  }

  clearInput(frames: number): void {
    this.inL.fill(0, 0, frames);
    this.inR.fill(0, 0, frames);
    this.hasInput = false;
  }

  clearOutput(frames: number): void {
    this.outL.fill(0, 0, frames);
    this.outR.fill(0, 0, frames);
  }

  /** Copies the summed input straight to the output. Used when bypassed. */
  protected passThrough(frames: number): void {
    this.outL.set(this.inL.subarray(0, frames));
    this.outR.set(this.inR.subarray(0, frames));
  }

  abstract render(frames: number, ctx: RenderContext): void;

  /** Called when playback restarts, so oscillators can re-align phase. */
  reset(): void {}

  /**
   * Writes this node's oscillator phases, in the normalised 0..1 domain, into
   * `out`, and returns how many it wrote.
   *
   * A stage boundary compiles a fresh graph whose oscillators all start at
   * phase 0, while the outgoing stage's are wherever `frequency x duration`
   * happened to leave them. The two signals therefore meet at an offset that is
   * an accident of the stage length, and a cross-fade between them lands
   * anywhere between +3 dB and near-total cancellation depending on that
   * accident. Capturing and re-adopting phase removes the accident.
   *
   * `out` is caller-owned and reused, so this allocates nothing. Order is fixed
   * per node kind and is the only thing `adoptPhases` relies on; a node that
   * writes nothing simply keeps whatever phase it started with.
   */
  capturePhases(_out: Float64Array): number {
    return 0;
  }

  /** Adopts the first `count` phases captured from the same node kind. */
  adoptPhases(_phases: Float64Array, _count: number): void {}
}

/** Most oscillator phases any one node holds. */
export const MAX_NODE_PHASES = 4;

const EMPTY = new Float32Array(0);
