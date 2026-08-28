import { Rng } from '../math/rng.js';
import { clamp } from '../math/util.js';

export type NoiseColor = 'white' | 'pink' | 'brown';

export const NOISE_COLORS: readonly NoiseColor[] = ['white', 'pink', 'brown'];

/**
 * Procedural noise generator. Nothing here loops a recorded file (§6): every
 * sample is synthesised, so a 90-minute session never repeats and the spectrum
 * is exactly what the tests measure.
 *
 * - white: flat spectrum, uniform source.
 * - pink: -3 dB/octave via Paul Kellet's economy filter, gain-matched to white.
 * - brown: -6 dB/octave via a leaky integrator with a soft reflecting bound so
 *   the random walk cannot drift into DC offset over long sessions.
 */
/**
 * Per-colour gain corrections.
 *
 * Pink is the reference, for two reasons: it is the default colour and the one
 * most shipped content uses, so leaving it untouched means existing protocols
 * sound exactly as they did; and it has by far the highest crest factor, so
 * matching the others *up* to white's RMS would push pink's peaks past full
 * scale (measured 2.3) while matching down to pink keeps every colour's peak
 * comfortably under 1.
 *
 * What this replaces: brown ran at +6.3 dBFS RMS with a peak of 3.5 — over full
 * scale before any level control had touched it, and 20 dB louder than pink at
 * the same nominal level. `NoiseNode.setOption` swaps colour with no smoothing
 * and no re-gain, so that mismatch arrived as a step discontinuity mid-session.
 */
const WHITE_GAIN = 0.338;
const PINK_GAIN = 0.11;
const BROWN_GAIN = 0.3298;

export class NoiseSource {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private b3 = 0;
  private b4 = 0;
  private b5 = 0;
  private b6 = 0;
  private brown = 0;
  private readonly rng: Rng;

  constructor(
    public color: NoiseColor = 'pink',
    seed: number | string = 0x1a7e,
  ) {
    this.rng = new Rng(seed);
  }

  reset(seed?: number | string): void {
    if (seed !== undefined) this.rng.reseed(seed);
    this.b0 = this.b1 = this.b2 = this.b3 = this.b4 = this.b5 = this.b6 = 0;
    this.brown = 0;
  }

  /**
   * One sample, RMS-matched across colours.
   *
   * The three colours are normalised to the same RMS as white (1/√3, the RMS
   * of a uniform bipolar sample), so changing colour changes timbre and not
   * loudness. That matters more here than in a mixer: `NoiseNode.setOption`
   * swaps the colour with no smoothing and no re-gain, so any mismatch would
   * arrive as a step discontinuity mid-session.
   *
   * The constants below are measured, not derived — each filter's cumulative
   * gain is fixed, so the correction is a single number per colour and
   * `noise.test.ts` asserts the three stay within a decibel of each other.
   */
  next(): number {
    const white = this.rng.nextBipolar();
    switch (this.color) {
      case 'white':
        return white * WHITE_GAIN;
      case 'pink': {
        this.b0 = 0.99886 * this.b0 + white * 0.0555179;
        this.b1 = 0.99332 * this.b1 + white * 0.0750759;
        this.b2 = 0.969 * this.b2 + white * 0.153852;
        this.b3 = 0.8665 * this.b3 + white * 0.3104856;
        this.b4 = 0.55 * this.b4 + white * 0.5329522;
        this.b5 = -0.7616 * this.b5 - white * 0.016898;
        const pink =
          this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + white * 0.5362;
        this.b6 = white * 0.115926;
        return pink * PINK_GAIN;
      }
      case 'brown': {
        this.brown += white * 0.02;
        // Reflect rather than clip: clipping a random walk creates audible
        // flat spots, reflection keeps the increment statistics intact.
        if (this.brown > 1) this.brown = 2 - this.brown;
        else if (this.brown < -1) this.brown = -2 - this.brown;
        return this.brown * BROWN_GAIN;
      }
      default:
        return white * WHITE_GAIN;
    }
  }
}

/**
 * Stereo noise bed with a continuously variable width.
 *
 * Width 0 renders one decorrelated source to both channels (mono, centred).
 * Width 1 renders two independent sources (fully decorrelated, wide).
 * Intermediate widths cross-fade with a constant-power law so perceived level
 * does not dip in the middle of the control's travel.
 */
export class StereoNoise {
  private readonly mono: NoiseSource;
  private readonly left: NoiseSource;
  private readonly right: NoiseSource;

  constructor(color: NoiseColor = 'pink', seed: number | string = 0x1a7e) {
    this.mono = new NoiseSource(color, `${seed}:m`);
    this.left = new NoiseSource(color, `${seed}:l`);
    this.right = new NoiseSource(color, `${seed}:r`);
  }

  setColor(color: NoiseColor): void {
    if (this.mono.color === color) return;
    this.mono.color = color;
    this.left.color = color;
    this.right.color = color;
  }

  reset(seed: number | string = 0x1a7e): void {
    this.mono.reset(`${seed}:m`);
    this.left.reset(`${seed}:l`);
    this.right.reset(`${seed}:r`);
  }

  /** Writes one stereo sample into `out` (length 2) at the requested width. */
  next(width: number, out: [number, number]): void {
    const w = clamp(width, 0, 1);
    const monoSample = this.mono.next();
    const l = this.left.next();
    const r = this.right.next();
    const wideGain = Math.sin((w * Math.PI) / 2);
    const monoGain = Math.cos((w * Math.PI) / 2);
    out[0] = monoSample * monoGain + l * wideGain;
    out[1] = monoSample * monoGain + r * wideGain;
  }
}
