import { StereoNoise } from '../../dsp/noise.js';
import {
  HarmonicOscillator,
  Phasor,
  pulseEnvelope,
  waveformSample,
  type EnvelopeShape,
  type Waveform,
} from '../../dsp/oscillator.js';
import { Biquad, type BiquadKind } from '../../math/biquad.js';
import { TWO_PI } from '../../math/constants.js';
import { clamp, equalPowerPan } from '../../math/util.js';
import type { GraphNode } from '../types.js';
import { RuntimeNode, type RenderContext } from './base.js';

/**
 * Unipolar modulator, 0..1, shared by the AM and noise engines.
 * `sine` is a true raised sine (no gating); the remaining shapes reuse the
 * pulse envelope at 50% duty so a single control set covers both engines.
 */
function unipolarModulator(shape: EnvelopeShape, t: number): number {
  if (shape === 'sine') return 0.5 * (1 + Math.sin(TWO_PI * t));
  return pulseEnvelope(t, { shape, dutyCycle: 0.5, attack: 0.2, release: 0.2 });
}

/** A single tone with equal-power panning. */
export class OscillatorNode extends RuntimeNode {
  private readonly phasor: Phasor;

  constructor(node: GraphNode) {
    super(node);
    this.phasor = new Phasor(48000, node.params.phase ?? 0);
  }

  protected override onPrepare(): void {
    this.phasor.setSampleRate(this.sampleRate);
    this.phasor.resetPhase(this.raw.get('phase') ?? 0);
  }

  override reset(): void {
    this.phasor.resetPhase(this.raw.get('phase') ?? 0);
  }

  render(frames: number, _ctx: RenderContext): void {
    const waveform = this.getOption('waveform', 'sine') as Waveform;
    const frequency = this.smoother('frequency');
    const amplitude = this.smoother('amplitude');
    const panParam = this.smoother('pan');

    for (let i = 0; i < frames; i++) {
      const f = frequency.next();
      const a = amplitude.next();
      const dt = this.phasor.increment(f);
      const t = this.phasor.advance(f);
      const sample = waveformSample(waveform, t, dt) * a;
      const { left, right } = equalPowerPan(panParam.next());
      // Equal-power pan of a mono source needs the √2 make-up so a centred
      // signal keeps the amplitude the user dialled in.
      this.outL[i] = sample * left * Math.SQRT2;
      this.outR[i] = sample * right * Math.SQRT2;
    }
  }
}

/**
 * Binaural engine.
 *
 * Two independent oscillators, one per ear. `separation` cross-bleeds the two
 * channels: at 1 each ear hears only its own tone (the classic configuration);
 * at 0 both tones reach both ears, which collapses the effect into an acoustic
 * monaural beat. Exposing the control this way makes the mechanism legible
 * rather than magical — see §13 of the product brief.
 */
export class BinauralNode extends RuntimeNode {
  private readonly leftPhasor: Phasor;
  private readonly rightPhasor: Phasor;

  constructor(node: GraphNode) {
    super(node);
    this.leftPhasor = new Phasor(48000, node.params.phase ?? 0);
    this.rightPhasor = new Phasor(48000, node.params.phase ?? 0);
  }

  protected override onPrepare(): void {
    this.leftPhasor.setSampleRate(this.sampleRate);
    this.rightPhasor.setSampleRate(this.sampleRate);
    this.reset();
  }

  override reset(): void {
    const phase = this.raw.get('phase') ?? 0;
    this.leftPhasor.resetPhase(phase);
    this.rightPhasor.resetPhase(phase);
  }

  /** Left and right tone frequencies for the current smoothed parameters. */
  channelFrequencies(): { left: number; right: number } {
    return binauralFrequencies(
      this.currentValue('carrier'),
      this.currentValue('beat'),
      this.getOption('mode', 'offset'),
    );
  }

  render(frames: number, _ctx: RenderContext): void {
    const waveform = this.getOption('waveform', 'sine') as Waveform;
    const centered = this.getOption('mode', 'offset') === 'centered';
    const carrier = this.smoother('carrier');
    const beat = this.smoother('beat');
    const amplitude = this.smoother('amplitude');
    const separation = this.smoother('separation');

    for (let i = 0; i < frames; i++) {
      const c = carrier.next();
      const b = beat.next();
      const a = amplitude.next();
      const s = clamp(separation.next(), 0, 1);

      const fL = centered ? c - b / 2 : c;
      const fR = centered ? c + b / 2 : c + b;

      const dtL = this.leftPhasor.increment(fL);
      const dtR = this.rightPhasor.increment(fR);
      const sampleL = waveformSample(waveform, this.leftPhasor.advance(fL), dtL);
      const sampleR = waveformSample(waveform, this.rightPhasor.advance(fR), dtR);

      // bleed = 0 at full separation, 0.5 at zero separation (equal sum).
      const bleed = (1 - s) * 0.5;
      const direct = 1 - bleed;
      this.outL[i] = (sampleL * direct + sampleR * bleed) * a;
      this.outR[i] = (sampleR * direct + sampleL * bleed) * a;
    }
  }
}

export function binauralFrequencies(
  carrier: number,
  beat: number,
  mode: string,
): { left: number; right: number } {
  if (mode === 'centered') {
    return { left: carrier - beat / 2, right: carrier + beat / 2 };
  }
  return { left: carrier, right: carrier + beat };
}

/**
 * Monaural engine. Both tones are summed *before* the output, so the amplitude
 * envelope exists acoustically and survives a single speaker — unlike a
 * binaural beat, which only exists once two ears combine two channels.
 */
export class MonauralNode extends RuntimeNode {
  private readonly phasorA = new Phasor(48000, 0);
  private readonly phasorB = new Phasor(48000, 0);

  protected override onPrepare(): void {
    this.phasorA.setSampleRate(this.sampleRate);
    this.phasorB.setSampleRate(this.sampleRate);
    this.reset();
  }

  override reset(): void {
    this.phasorA.resetPhase(0);
    this.phasorB.resetPhase(0);
  }

  render(frames: number, _ctx: RenderContext): void {
    const waveform = this.getOption('waveform', 'sine') as Waveform;
    const carrier = this.smoother('carrier');
    const beat = this.smoother('beat');
    const mix = this.smoother('mix');
    const amplitude = this.smoother('amplitude');
    const panParam = this.smoother('pan');

    for (let i = 0; i < frames; i++) {
      const c = carrier.next();
      const b = beat.next();
      const m = clamp(mix.next(), 0, 1);
      const a = amplitude.next();

      const fA = c;
      const fB = c + b;
      const sampleA = waveformSample(waveform, this.phasorA.advance(fA), this.phasorA.increment(fA));
      const sampleB = waveformSample(waveform, this.phasorB.advance(fB), this.phasorB.increment(fB));

      // Amplitudes sum to 1 so the peak stays bounded regardless of mix.
      const summed = sampleA * (1 - m) + sampleB * m;
      const { left, right } = equalPowerPan(panParam.next());
      this.outL[i] = summed * a * left * Math.SQRT2;
      this.outR[i] = summed * a * right * Math.SQRT2;
    }
  }
}

/** Isochronic engine: an audible carrier gated by a pulse envelope. */
export class IsochronicNode extends RuntimeNode {
  private readonly carrierPhasor = new Phasor(48000, 0);
  private readonly pulsePhasor = new Phasor(48000, 0);

  protected override onPrepare(): void {
    this.carrierPhasor.setSampleRate(this.sampleRate);
    this.pulsePhasor.setSampleRate(this.sampleRate);
    this.reset();
  }

  override reset(): void {
    this.carrierPhasor.resetPhase(0);
    this.pulsePhasor.resetPhase(0);
  }

  render(frames: number, _ctx: RenderContext): void {
    const waveform = this.getOption('waveform', 'sine') as Waveform;
    const shape = this.getOption('envelope', 'softSquare') as EnvelopeShape;
    const carrier = this.smoother('carrier');
    const pulse = this.smoother('pulse');
    const duty = this.smoother('duty');
    const depth = this.smoother('depth');
    const attack = this.smoother('attack');
    const release = this.smoother('release');
    const amplitude = this.smoother('amplitude');
    const panParam = this.smoother('pan');

    for (let i = 0; i < frames; i++) {
      const c = carrier.next();
      const p = pulse.next();
      const a = amplitude.next();
      const d = clamp(depth.next(), 0, 1);

      const envelopeValue = pulseEnvelope(this.pulsePhasor.advance(p), {
        shape,
        dutyCycle: duty.next(),
        attack: attack.next(),
        release: release.next(),
      });

      const gate = 1 - d + d * envelopeValue;
      const dt = this.carrierPhasor.increment(c);
      const sample = waveformSample(waveform, this.carrierPhasor.advance(c), dt) * gate * a;
      const { left, right } = equalPowerPan(panParam.next());
      this.outL[i] = sample * left * Math.SQRT2;
      this.outR[i] = sample * right * Math.SQRT2;
    }
  }
}

/**
 * Amplitude modulation. With no upstream connection it generates and modulates
 * its own carrier; with an input it acts as an insert and modulates that.
 */
export class AmNode extends RuntimeNode {
  private readonly carrierPhasor = new Phasor(48000, 0);
  private readonly modPhasor = new Phasor(48000, 0);

  protected override onPrepare(): void {
    this.carrierPhasor.setSampleRate(this.sampleRate);
    this.modPhasor.setSampleRate(this.sampleRate);
    this.reset();
  }

  override reset(): void {
    this.carrierPhasor.resetPhase(0);
    this.modPhasor.resetPhase(0);
  }

  render(frames: number, _ctx: RenderContext): void {
    const waveform = this.getOption('waveform', 'sine') as Waveform;
    const shape = this.getOption('envelope', 'sine') as EnvelopeShape;
    const carrier = this.smoother('carrier');
    const modFrequency = this.smoother('modFrequency');
    const depth = this.smoother('depth');
    const amplitude = this.smoother('amplitude');
    const panParam = this.smoother('pan');
    const insert = this.hasInput;

    for (let i = 0; i < frames; i++) {
      const modulator = unipolarModulator(shape, this.modPhasor.advance(modFrequency.next()));
      const d = clamp(depth.next(), 0, 1);
      const gain = 1 - d + d * modulator;
      const a = amplitude.next();

      if (insert) {
        this.outL[i] = this.inL[i] * gain * a;
        this.outR[i] = this.inR[i] * gain * a;
        // Keep the carrier phasor advancing so switching modes stays continuous.
        this.carrierPhasor.advance(carrier.next());
        panParam.next();
      } else {
        const c = carrier.next();
        const dt = this.carrierPhasor.increment(c);
        const sample = waveformSample(waveform, this.carrierPhasor.advance(c), dt) * gain * a;
        const { left, right } = equalPowerPan(panParam.next());
        this.outL[i] = sample * left * Math.SQRT2;
        this.outR[i] = sample * right * Math.SQRT2;
      }
    }
  }
}

/** Frequency modulation with a sine modulator. */
export class FmNode extends RuntimeNode {
  private readonly carrierPhasor = new Phasor(48000, 0);
  private readonly modPhasor = new Phasor(48000, 0);

  protected override onPrepare(): void {
    this.carrierPhasor.setSampleRate(this.sampleRate);
    this.modPhasor.setSampleRate(this.sampleRate);
    this.reset();
  }

  override reset(): void {
    this.carrierPhasor.resetPhase(0);
    this.modPhasor.resetPhase(0);
  }

  render(frames: number, _ctx: RenderContext): void {
    const waveform = this.getOption('waveform', 'sine') as Waveform;
    const carrier = this.smoother('carrier');
    const modFrequency = this.smoother('modFrequency');
    const deviation = this.smoother('deviation');
    const depth = this.smoother('depth');
    const amplitude = this.smoother('amplitude');
    const panParam = this.smoother('pan');
    const nyquist = this.sampleRate * 0.45;

    for (let i = 0; i < frames; i++) {
      const modulator = Math.sin(TWO_PI * this.modPhasor.advance(modFrequency.next()));
      const swing = deviation.next() * clamp(depth.next(), 0, 1) * modulator;
      // Clamp the instantaneous frequency so a deep sweep cannot fold over
      // Nyquist or go negative, both of which alias audibly.
      const instantaneous = clamp(carrier.next() + swing, 0.1, nyquist);
      const dt = this.carrierPhasor.increment(instantaneous);
      const sample =
        waveformSample(waveform, this.carrierPhasor.advance(instantaneous), dt) * amplitude.next();
      const { left, right } = equalPowerPan(panParam.next());
      this.outL[i] = sample * left * Math.SQRT2;
      this.outR[i] = sample * right * Math.SQRT2;
    }
  }
}

/** Additive stack of eight partials over one shared fundamental phase. */
export class HarmonicNode extends RuntimeNode {
  private readonly stack = new HarmonicOscillator(48000, []);

  protected override onPrepare(): void {
    this.stack.setSampleRate(this.sampleRate);
    this.stack.partials = Array.from({ length: 8 }, (_, index) => ({
      multiple: index + 1,
      amplitude: this.raw.get(`h${index + 1}`) ?? 0,
    }));
    this.reset();
  }

  override reset(): void {
    this.stack.resetPhase(0);
  }

  render(frames: number, _ctx: RenderContext): void {
    const fundamental = this.smoother('fundamental');
    const amplitude = this.smoother('amplitude');
    const panParam = this.smoother('pan');
    const partialSmoothers = this.stack.partials.map((_, index) => this.smoother(`h${index + 1}`));

    for (let i = 0; i < frames; i++) {
      for (let p = 0; p < this.stack.partials.length; p++) {
        this.stack.partials[p].amplitude = partialSmoothers[p].next();
      }
      const sample = this.stack.next(fundamental.next()) * amplitude.next();
      const { left, right } = equalPowerPan(panParam.next());
      this.outL[i] = sample * left * Math.SQRT2;
      this.outR[i] = sample * right * Math.SQRT2;
    }
  }
}

/** Procedural stereo noise bed with an optional filter and slow breathing. */
export class NoiseNode extends RuntimeNode {
  private readonly noise: StereoNoise;
  private readonly filterL: Biquad;
  private readonly filterR: Biquad;
  private readonly modPhasor = new Phasor(48000, 0);
  private readonly scratch: [number, number] = [0, 0];
  private lastCutoff = -1;
  private lastResonance = -1;

  constructor(node: GraphNode) {
    super(node);
    // Seeded from the node id so two noise beds in one graph are decorrelated
    // while a single protocol still renders identically every time.
    this.noise = new StereoNoise((node.options.color ?? 'pink') as never, node.id);
    this.filterL = new Biquad(48000);
    this.filterR = new Biquad(48000);
  }

  protected override onPrepare(): void {
    this.modPhasor.setSampleRate(this.sampleRate);
    this.filterL.setSampleRate(this.sampleRate);
    this.filterR.setSampleRate(this.sampleRate);
    this.noise.setColor(this.getOption('color', 'pink') as never);
    this.reset();
  }

  override reset(): void {
    this.noise.reset(this.id);
    this.filterL.reset();
    this.filterR.reset();
    this.modPhasor.resetPhase(0);
    this.lastCutoff = -1;
  }

  protected override onOptionChanged(key: string, value: string): void {
    if (key === 'color') this.noise.setColor(value as never);
    if (key === 'filter') this.lastCutoff = -1;
  }

  render(frames: number, _ctx: RenderContext): void {
    const level = this.smoother('level');
    const width = this.smoother('width');
    const cutoff = this.smoother('cutoff');
    const resonance = this.smoother('resonance');
    const modDepth = this.smoother('modDepth');
    const modRate = this.smoother('modRate');
    const filterKind = this.getOption('filter', 'lowpass');
    const filtering = filterKind !== 'off';

    // Filter coefficients are recomputed once per block, not per sample: the
    // cutoff smoother still moves per sample, so this is a control-rate
    // approximation that keeps the cost bounded without audible stepping.
    if (filtering) {
      const targetCutoff = cutoff.targetValue;
      const targetQ = resonance.targetValue;
      if (Math.abs(targetCutoff - this.lastCutoff) > 0.5 || targetQ !== this.lastResonance) {
        this.filterL.set(filterKind as BiquadKind, targetCutoff, targetQ);
        this.filterR.set(filterKind as BiquadKind, targetCutoff, targetQ);
        this.lastCutoff = targetCutoff;
        this.lastResonance = targetQ;
      }
    }

    for (let i = 0; i < frames; i++) {
      this.noise.next(width.next(), this.scratch);
      let l = this.scratch[0];
      let r = this.scratch[1];
      if (filtering) {
        l = this.filterL.process(l);
        r = this.filterR.process(r);
      }
      const depth = clamp(modDepth.next(), 0, 1);
      // The modulator phasor always advances, even at zero depth, so raising
      // the depth control mid-session does not jump the breathing waveform.
      const lfo = 0.5 * (1 + Math.sin(TWO_PI * this.modPhasor.advance(modRate.next())));
      const gain = level.next() * (1 - depth + depth * lfo);
      this.outL[i] = l * gain;
      this.outR[i] = r * gain;
    }
  }
}
