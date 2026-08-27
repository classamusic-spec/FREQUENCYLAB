import { LevelMeter, type LevelReading } from '../dsp/meter.js';
import { StereoLimiter } from '../dsp/limiter.js';
import { DcBlocker } from '../math/biquad.js';
import { clamp } from '../math/util.js';
import type { MasterSettings } from '../protocol/schema.js';

export interface MasterTelemetry {
  level: LevelReading;
  gainReductionDb: number;
  clipEvents: number;
  fadeGain: number;
}

/**
 * The master chain: DC block → gain → session fade → limiter → meter.
 *
 * Order matters. The fade sits *before* the limiter so a fade-out cannot be
 * undone by limiter release, and the DC blocker sits first so a deeply
 * modulated signal's offset never eats headroom.
 */
export class MasterChain {
  private readonly limiter: StereoLimiter;
  private readonly meter = new LevelMeter();
  private readonly dcL = new DcBlocker();
  private readonly dcR = new DcBlocker();
  private gain: number;
  private currentGain: number;
  private fadeGain = 0;
  private settings: MasterSettings;

  constructor(
    private sampleRate: number,
    settings: MasterSettings,
  ) {
    this.settings = settings;
    this.gain = settings.gain;
    this.currentGain = settings.gain;
    this.limiter = new StereoLimiter(sampleRate, {
      ceilingDb: settings.limiterCeilingDb,
      lookaheadMs: 5,
      releaseMs: 120,
      kneeDb: 3,
    });
  }

  configure(settings: MasterSettings, sampleRate = this.sampleRate): void {
    this.settings = settings;
    this.sampleRate = sampleRate;
    this.gain = settings.gain;
    this.limiter.configure(sampleRate, { ceilingDb: settings.limiterCeilingDb });
  }

  /** Master gain target. Smoothed over ~30 ms inside `process`. */
  setGain(value: number): void {
    this.gain = clamp(value, 0, 1.5);
  }

  get targetGain(): number {
    return this.gain;
  }

  reset(): void {
    this.limiter.reset();
    this.meter.reset();
    this.dcL.reset();
    this.dcR.reset();
    this.currentGain = this.gain;
    this.fadeGain = 0;
  }

  /**
   * Processes one block in place.
   *
   * `sessionTimeSec` is the time at the first sample of the block and
   * `totalSec` the protocol length; together they drive the session fades.
   * `stopFade` overrides both for user-initiated stops.
   */
  process(
    left: Float32Array,
    right: Float32Array,
    frames: number,
    sessionTimeSec: number,
    totalSec: number,
    stopFadeGain = 1,
  ): void {
    const smoothing = 1 - Math.exp(-1 / (0.03 * this.sampleRate));
    const inverseRate = 1 / this.sampleRate;

    for (let i = 0; i < frames; i++) {
      this.currentGain += (this.gain - this.currentGain) * smoothing;
      const t = sessionTimeSec + i * inverseRate;
      const fade = this.sessionFade(t, totalSec) * stopFadeGain;
      this.fadeGain = fade;
      const g = this.currentGain * fade;
      left[i] = this.dcL.process(left[i]) * g;
      right[i] = this.dcR.process(right[i]) * g;
    }

    if (this.settings.limiter) this.limiter.process(left, right, frames);
    this.meter.measure(left, right, frames);
  }

  /**
   * Raised-cosine session fade. A raised cosine has zero slope at both ends, so
   * the start of a session emerges from silence with no perceptible onset and
   * the end settles rather than stopping.
   */
  private sessionFade(timeSec: number, totalSec: number): number {
    const { fadeInSec, fadeOutSec } = this.settings;
    let gain = 1;
    if (fadeInSec > 0 && timeSec < fadeInSec) {
      gain *= 0.5 * (1 - Math.cos((Math.PI * clamp(timeSec / fadeInSec, 0, 1))));
    }
    const remaining = totalSec - timeSec;
    if (fadeOutSec > 0 && remaining < fadeOutSec) {
      gain *= 0.5 * (1 - Math.cos((Math.PI * clamp(remaining / fadeOutSec, 0, 1))));
    }
    return clamp(gain, 0, 1);
  }

  telemetry(): MasterTelemetry {
    return {
      level: this.meter.read(),
      gainReductionDb: this.limiter.readGainReduction(),
      clipEvents: this.limiter.readClipEvents(),
      fadeGain: this.fadeGain,
    };
  }

  get latencySamples(): number {
    return this.settings.limiter ? this.limiter.latencySamples : 0;
  }
}
