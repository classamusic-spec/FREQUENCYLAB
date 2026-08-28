/** Shared numeric constants for the FREQUENCY LAB DSP core. */

export const TWO_PI = Math.PI * 2;
export const HALF_PI = Math.PI / 2;

/** Amplitude below which a signal is treated as silence (~ -140 dBFS). */
export const SILENCE_FLOOR = 1e-7;

/** Lowest carrier frequency the engine will synthesise, in Hz. */
export const MIN_CARRIER_HZ = 20;
/** Highest carrier frequency the engine will synthesise, in Hz. */
export const MAX_CARRIER_HZ = 1500;

/**
 * Highest frequency the plain oscillator will synthesise.
 *
 * Wider than `MAX_CARRIER_HZ` on purpose: a binaural carrier should stay in a
 * comfortable range over a long session, but a direct tone auditioned from the
 * historical archive has to be able to reproduce the archived value itself.
 */
export const MAX_TONE_HZ = 18000;

/** Lowest beat / modulation frequency, in Hz. */
export const MIN_BEAT_HZ = 0.1;
/** Highest beat / modulation frequency, in Hz. */
export const MAX_BEAT_HZ = 100;

/** Default render block size. Chosen so 48 kHz / 128 = 2.67 ms of control resolution. */
export const DEFAULT_BLOCK_SIZE = 128;

/** Supported sample rates. */
export const SUPPORTED_SAMPLE_RATES = [44100, 48000] as const;
export type SupportedSampleRate = (typeof SUPPORTED_SAMPLE_RATES)[number];
