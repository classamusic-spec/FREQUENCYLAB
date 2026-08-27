import { Phasor } from '../../dsp/oscillator.js';
import { Biquad, type BiquadKind } from '../../math/biquad.js';
import { TWO_PI } from '../../math/constants.js';
import { clamp, equalPowerPan } from '../../math/util.js';
import { RuntimeNode, type RenderContext } from './base.js';

/** Linear level trim. */
export class GainNode extends RuntimeNode {
  render(frames: number, _ctx: RenderContext): void {
    const gain = this.smoother('gain');
    if (this.bypass) {
      this.passThrough(frames);
      return;
    }
    for (let i = 0; i < frames; i++) {
      const g = gain.next();
      this.outL[i] = this.inL[i] * g;
      this.outR[i] = this.inR[i] * g;
    }
  }
}

/** Stereo biquad. Coefficients update once per block; state is per channel. */
export class FilterNode extends RuntimeNode {
  private readonly left = new Biquad(48000);
  private readonly right = new Biquad(48000);
  private lastCutoff = -1;
  private lastQ = -1;
  private lastGain = Number.NaN;
  private lastKind = '';

  protected override onPrepare(): void {
    this.left.setSampleRate(this.sampleRate);
    this.right.setSampleRate(this.sampleRate);
    this.reset();
  }

  override reset(): void {
    this.left.reset();
    this.right.reset();
    this.lastCutoff = -1;
  }

  render(frames: number, _ctx: RenderContext): void {
    if (this.bypass) {
      this.passThrough(frames);
      return;
    }
    const cutoff = this.smoother('cutoff');
    const resonance = this.smoother('resonance');
    const gainDb = this.smoother('gainDb');
    const kind = this.getOption('kind', 'lowpass');

    const targetCutoff = cutoff.targetValue;
    const targetQ = resonance.targetValue;
    const targetGain = gainDb.targetValue;
    if (
      Math.abs(targetCutoff - this.lastCutoff) > 0.5 ||
      targetQ !== this.lastQ ||
      targetGain !== this.lastGain ||
      kind !== this.lastKind
    ) {
      this.left.set(kind as BiquadKind, targetCutoff, targetQ, targetGain);
      this.right.set(kind as BiquadKind, targetCutoff, targetQ, targetGain);
      this.lastCutoff = targetCutoff;
      this.lastQ = targetQ;
      this.lastGain = targetGain;
      this.lastKind = kind;
    }

    for (let i = 0; i < frames; i++) {
      // Advance the smoothers so their reported values track the automation
      // even though the coefficients are refreshed at block rate.
      cutoff.next();
      resonance.next();
      gainDb.next();
      this.outL[i] = this.left.process(this.inL[i]);
      this.outR[i] = this.right.process(this.inR[i]);
    }
  }
}

/**
 * Static stereo placement.
 *
 * Applied to an already-stereo signal, so it re-balances the two channels
 * rather than collapsing them; a binaural pair passed through a hard-panned
 * Pan node keeps both tones, just at different levels.
 */
export class PanNode extends RuntimeNode {
  render(frames: number, _ctx: RenderContext): void {
    if (this.bypass) {
      this.passThrough(frames);
      return;
    }
    const panParam = this.smoother('pan');
    for (let i = 0; i < frames; i++) {
      const { left, right } = equalPowerPan(panParam.next());
      this.outL[i] = this.inL[i] * left * Math.SQRT2;
      this.outR[i] = this.inR[i] * right * Math.SQRT2;
    }
  }
}

/**
 * Slow bilateral stereo movement — the "0.75 Hz stereo movement" of the brief's
 * closing example. Implemented as a smooth equal-power sweep so the sensation
 * is of the sound moving rather than of two channels being ducked.
 */
export class StereoMotionNode extends RuntimeNode {
  private readonly lfo = new Phasor(48000, 0);

  protected override onPrepare(): void {
    this.lfo.setSampleRate(this.sampleRate);
    this.reset();
  }

  override reset(): void {
    this.lfo.resetPhase(0);
  }

  render(frames: number, _ctx: RenderContext): void {
    if (this.bypass) {
      this.passThrough(frames);
      return;
    }
    const rate = this.smoother('rate');
    const depth = this.smoother('depth');
    const center = this.smoother('center');
    const triangle = this.getOption('shape', 'sine') === 'triangle';

    for (let i = 0; i < frames; i++) {
      const t = this.lfo.advance(rate.next());
      const wave = triangle ? (t < 0.5 ? 4 * t - 1 : 3 - 4 * t) : Math.sin(TWO_PI * t);
      const position = clamp(center.next() + wave * clamp(depth.next(), 0, 1), -1, 1);
      const { left, right } = equalPowerPan(position);
      this.outL[i] = this.inL[i] * left * Math.SQRT2;
      this.outR[i] = this.inR[i] * right * Math.SQRT2;
    }
  }
}

/** Sums upstream signals with one output trim. */
export class MixerNode extends RuntimeNode {
  render(frames: number, _ctx: RenderContext): void {
    const gain = this.smoother('gain');
    for (let i = 0; i < frames; i++) {
      const g = this.bypass ? 1 : gain.next();
      this.outL[i] = this.inL[i] * g;
      this.outR[i] = this.inR[i] * g;
    }
  }
}

/** Terminal node. The master chain reads its output buffers. */
export class OutputNode extends RuntimeNode {
  render(frames: number, _ctx: RenderContext): void {
    this.passThrough(frames);
  }
}
