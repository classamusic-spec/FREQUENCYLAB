import { gainToDb } from '../math/util.js';

export interface LevelReading {
  peakL: number;
  peakR: number;
  rmsL: number;
  rmsR: number;
  peakDbL: number;
  peakDbR: number;
  rmsDbL: number;
  rmsDbR: number;
  /** Pearson correlation between channels, -1..1. Drives the phase/vector view. */
  correlation: number;
}

/**
 * Block level meter with ballistic peak hold. Metering is read by the UI at
 * frame rate but computed in the audio path, so the displayed numbers are the
 * signal that actually left the engine rather than a UI-side re-synthesis.
 */
export class LevelMeter {
  private peakL = 0;
  private peakR = 0;
  private sumSqL = 0;
  private sumSqR = 0;
  private sumLR = 0;
  private frames = 0;
  private heldPeakL = 0;
  private heldPeakR = 0;

  constructor(private readonly peakDecayPerBlock = 0.85) {}

  reset(): void {
    this.peakL = this.peakR = 0;
    this.sumSqL = this.sumSqR = this.sumLR = 0;
    this.frames = 0;
    this.heldPeakL = this.heldPeakR = 0;
  }

  measure(left: Float32Array, right: Float32Array, frames: number): void {
    let peakL = 0;
    let peakR = 0;
    let sumSqL = 0;
    let sumSqR = 0;
    let sumLR = 0;
    for (let i = 0; i < frames; i++) {
      const l = left[i];
      const r = right[i];
      const al = l < 0 ? -l : l;
      const ar = r < 0 ? -r : r;
      if (al > peakL) peakL = al;
      if (ar > peakR) peakR = ar;
      sumSqL += l * l;
      sumSqR += r * r;
      sumLR += l * r;
    }
    this.peakL = peakL;
    this.peakR = peakR;
    this.sumSqL = sumSqL;
    this.sumSqR = sumSqR;
    this.sumLR = sumLR;
    this.frames = frames;
    this.heldPeakL = Math.max(peakL, this.heldPeakL * this.peakDecayPerBlock);
    this.heldPeakR = Math.max(peakR, this.heldPeakR * this.peakDecayPerBlock);
  }

  read(): LevelReading {
    const n = Math.max(1, this.frames);
    const rmsL = Math.sqrt(this.sumSqL / n);
    const rmsR = Math.sqrt(this.sumSqR / n);
    const denominator = Math.sqrt(this.sumSqL * this.sumSqR);
    const correlation = denominator > 1e-12 ? this.sumLR / denominator : 0;
    return {
      peakL: this.heldPeakL,
      peakR: this.heldPeakR,
      rmsL,
      rmsR,
      peakDbL: gainToDb(this.heldPeakL),
      peakDbR: gainToDb(this.heldPeakR),
      rmsDbL: gainToDb(rmsL),
      rmsDbR: gainToDb(rmsR),
      correlation,
    };
  }
}
