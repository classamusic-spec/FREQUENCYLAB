import { AUDIBLE_MAX_HZ, AUDIBLE_MIN_HZ, type ArchiveEntry } from './types.js';

/**
 * The frequency translator (§9, §10, §11, §41).
 *
 * Historical frequency lists are just numbers. Some are audible pitches, some
 * are far below anything a headphone reproduces, and some are above the audio
 * band entirely. This module turns a number into an explicit, honest statement
 * of what will actually be generated.
 *
 * The rule it exists to enforce: **no silent clamping and no implied
 * equivalence.** A 50 kHz value is not quietly played at 18 kHz; it is either
 * divided by a stated power of two, or refused. Every transform carries the
 * original value, the played value, and a plain-language note saying the two
 * are not physiologically equivalent.
 */

export type TransformKind =
  | 'direct'
  | 'octave-down'
  | 'octave-up'
  | 'binaural-beat'
  | 'binaural-carrier'
  | 'am-rate'
  | 'isochronic-rate';

export interface PlaybackTransform {
  kind: TransformKind;
  /** The value exactly as the archive holds it. */
  originalHz: number;
  /** The frequency actually synthesised. */
  playbackHz: number;
  /** Signed power-of-two shift, e.g. -4 for ÷16. Zero when none applied. */
  octaveShift: number;
  /** Audible carrier the value modulates, where the transform uses one. */
  carrierHz?: number;
  /** Short label for the UI: `÷16`, `Direct tone`, `Binaural difference`. */
  label: string;
  /** One line describing exactly what is generated. */
  description: string;
  /**
   * The honesty note. Present whenever the played signal is not the original
   * value, which the UI is required to display alongside the transform.
   */
  equivalenceNote?: string;
  /** False when the transform cannot be applied to this value. */
  available: boolean;
  /** Why it is unavailable, when it is. */
  unavailableReason?: string;
}

/** Rates fast enough to be heard as a pitch rather than felt as a pulse. */
const MAX_MODULATION_HZ = 100;
const DEFAULT_CARRIER_HZ = 220;

export interface TransformOptions {
  /** Carrier for the modulation-based transforms. */
  carrierHz?: number;
}

/**
 * Every transform for a value, viable or not.
 *
 * Unavailable options are returned rather than hidden, with the reason
 * attached — a user looking at a 50 kHz entry should be able to see *why*
 * direct playback is not offered, not just find it missing.
 */
export function transformsFor(hz: number, options: TransformOptions = {}): PlaybackTransform[] {
  const carrier = options.carrierHz ?? DEFAULT_CARRIER_HZ;
  return [
    directTransform(hz),
    octaveDownTransform(hz),
    octaveUpTransform(hz),
    binauralBeatTransform(hz, carrier),
    binauralCarrierTransform(hz),
    amRateTransform(hz, carrier),
    isochronicRateTransform(hz, carrier),
  ];
}

export function availableTransforms(hz: number, options: TransformOptions = {}): PlaybackTransform[] {
  return transformsFor(hz, options).filter((t) => t.available);
}

/**
 * The transform the archive suggests first.
 *
 * A value that is already an audible pitch is played directly; a slow rate is
 * offered as a binaural difference, because that is the only way a headphone
 * can represent it at all; anything outside the band is divided into it.
 */
export function recommendedTransform(hz: number, options: TransformOptions = {}): PlaybackTransform {
  const all = transformsFor(hz, options);
  const by = (kind: TransformKind) => all.find((t) => t.kind === kind)!;

  if (hz < AUDIBLE_MIN_HZ) {
    const beat = by('binaural-beat');
    if (beat.available) return beat;
  }
  const direct = by('direct');
  if (direct.available) return direct;

  const down = by('octave-down');
  if (down.available) return down;

  const up = by('octave-up');
  if (up.available) return up;

  return direct;
}

function directTransform(hz: number): PlaybackTransform {
  const inRange = hz >= AUDIBLE_MIN_HZ && hz <= AUDIBLE_MAX_HZ;
  return {
    kind: 'direct',
    originalHz: hz,
    playbackHz: hz,
    octaveShift: 0,
    label: 'Direct tone',
    description: `A tone at ${format(hz)} Hz — the archived value itself, unmodified.`,
    available: inRange,
    unavailableReason: inRange
      ? undefined
      : hz < AUDIBLE_MIN_HZ
        ? `${format(hz)} Hz is below what headphones reproduce. Nothing audible would be produced.`
        : `${format(hz)} Hz is above the practical range of consumer audio hardware.`,
  };
}

/**
 * Halving until the value lands in the audible band.
 *
 * Powers of two only, so the relationship stays an exact octave and the divisor
 * can be stated precisely rather than approximated.
 */
function octaveDownTransform(hz: number): PlaybackTransform {
  if (hz <= AUDIBLE_MAX_HZ) {
    return {
      kind: 'octave-down',
      originalHz: hz,
      playbackHz: hz,
      octaveShift: 0,
      label: 'Divide',
      description: 'Not needed — the value is already within the audible band.',
      available: false,
      unavailableReason: 'The archived value is already audible.',
    };
  }
  let shift = 0;
  let playback = hz;
  while (playback > AUDIBLE_MAX_HZ && shift > -12) {
    playback /= 2;
    shift -= 1;
  }
  const divisor = Math.pow(2, -shift);
  const usable = playback >= AUDIBLE_MIN_HZ;
  return {
    kind: 'octave-down',
    originalHz: hz,
    playbackHz: playback,
    octaveShift: shift,
    label: `÷${divisor}`,
    description: `${format(hz)} Hz divided by ${divisor} gives ${format(playback)} Hz, which is audible.`,
    equivalenceNote: `This plays ${format(playback)} Hz, not ${format(hz)} Hz. They are ${-shift} octaves apart. A divided acoustic tone is not physiologically equivalent to the original value, and nothing here should be read as implying otherwise.`,
    available: usable,
    unavailableReason: usable ? undefined : 'No power-of-two division lands this value in the audible band.',
  };
}

/** Doubling a sub-audible value into the band, for the same reasons in reverse. */
function octaveUpTransform(hz: number): PlaybackTransform {
  if (hz >= AUDIBLE_MIN_HZ) {
    return {
      kind: 'octave-up',
      originalHz: hz,
      playbackHz: hz,
      octaveShift: 0,
      label: 'Multiply',
      description: 'Not needed — the value is already within the audible band.',
      available: false,
      unavailableReason: 'The archived value is already audible.',
    };
  }
  let shift = 0;
  let playback = hz;
  while (playback < AUDIBLE_MIN_HZ && shift < 16) {
    playback *= 2;
    shift += 1;
  }
  const multiplier = Math.pow(2, shift);
  return {
    kind: 'octave-up',
    originalHz: hz,
    playbackHz: playback,
    octaveShift: shift,
    label: `×${multiplier}`,
    description: `${format(hz)} Hz multiplied by ${multiplier} gives ${format(playback)} Hz, which is audible.`,
    equivalenceNote: `This plays ${format(playback)} Hz, not ${format(hz)} Hz. They are ${shift} octaves apart, which is a mathematical relationship and not an equivalent effect.`,
    available: playback <= AUDIBLE_MAX_HZ,
    unavailableReason:
      playback <= AUDIBLE_MAX_HZ ? undefined : 'No power-of-two multiple lands this value in the audible band.',
  };
}

/**
 * The value as the difference between two tones.
 *
 * For a low historical value this is usually the most faithful option
 * available: the *rate* is reproduced exactly even though no speaker emits it.
 */
function binauralBeatTransform(hz: number, carrierHz: number): PlaybackTransform {
  const usable = hz > 0 && hz <= MAX_MODULATION_HZ;
  return {
    kind: 'binaural-beat',
    originalHz: hz,
    playbackHz: hz,
    octaveShift: 0,
    carrierHz,
    label: 'Binaural difference',
    description: `A ${format(carrierHz)} Hz tone in one ear and ${format(carrierHz + hz)} Hz in the other, a difference of ${format(hz)} Hz.`,
    equivalenceNote: `Your headphones produce two tones near ${format(carrierHz)} Hz. The ${format(hz)} Hz figure is the rate at which they beat once your hearing combines them — it is not an acoustic tone, and no speaker emits it.`,
    available: usable,
    unavailableReason: usable
      ? undefined
      : `${format(hz)} Hz is too fast to perceive as a beat; above about ${MAX_MODULATION_HZ} Hz the two tones are heard as separate pitches.`,
  };
}

/** The value as the audible carrier, with the beat chosen separately. */
function binauralCarrierTransform(hz: number): PlaybackTransform {
  const usable = hz >= AUDIBLE_MIN_HZ && hz <= AUDIBLE_MAX_HZ;
  return {
    kind: 'binaural-carrier',
    originalHz: hz,
    playbackHz: hz,
    octaveShift: 0,
    label: 'Binaural carrier',
    description: `${format(hz)} Hz as the audible tone, with a separately chosen beat between the ears.`,
    available: usable,
    unavailableReason: usable ? undefined : `${format(hz)} Hz cannot serve as an audible carrier.`,
  };
}

function amRateTransform(hz: number, carrierHz: number): PlaybackTransform {
  const usable = hz > 0 && hz <= MAX_MODULATION_HZ;
  return {
    kind: 'am-rate',
    originalHz: hz,
    playbackHz: hz,
    octaveShift: 0,
    carrierHz,
    label: 'AM rate',
    description: `A ${format(carrierHz)} Hz tone whose amplitude rises and falls ${format(hz)} times per second.`,
    equivalenceNote: `The ${format(hz)} Hz figure is a modulation rate applied to an audible tone, not a tone itself.`,
    available: usable,
    unavailableReason: usable ? undefined : `${format(hz)} Hz is outside the practical modulation range.`,
  };
}

function isochronicRateTransform(hz: number, carrierHz: number): PlaybackTransform {
  const usable = hz > 0 && hz <= MAX_MODULATION_HZ;
  return {
    kind: 'isochronic-rate',
    originalHz: hz,
    playbackHz: hz,
    octaveShift: 0,
    carrierHz,
    label: 'Isochronic pulse',
    description: `A ${format(carrierHz)} Hz tone switched on and off ${format(hz)} times per second.`,
    equivalenceNote: `The ${format(hz)} Hz figure is a pulse rate applied to an audible tone, not a tone itself.`,
    available: usable,
    unavailableReason: usable ? undefined : `${format(hz)} Hz is outside the practical pulse range.`,
  };
}

/**
 * Mathematical relatives of a frequency (§27, §28).
 *
 * Labelled as arithmetic and nothing else. Two frequencies an octave apart are
 * related by a ratio of two; that is a fact about numbers, and carries no claim
 * that they do the same thing.
 */
export interface FrequencyRelation {
  ratio: string;
  frequency: number;
  label: string;
}

export function relatedFrequencies(hz: number): FrequencyRelation[] {
  const relations: FrequencyRelation[] = [
    { ratio: '1:4', frequency: hz / 4, label: 'Two octaves below' },
    { ratio: '1:2', frequency: hz / 2, label: 'One octave below' },
    { ratio: '1:1', frequency: hz, label: 'Archived value' },
    { ratio: '2:1', frequency: hz * 2, label: 'One octave above' },
    { ratio: '4:1', frequency: hz * 4, label: 'Two octaves above' },
    { ratio: '3:2', frequency: (hz * 3) / 2, label: 'Perfect fifth above' },
    { ratio: '4:3', frequency: (hz * 4) / 3, label: 'Perfect fourth above' },
  ];
  return relations.map((r) => ({ ...r, frequency: round(r.frequency) }));
}

/** Harmonic partials of a fundamental, for the acoustics explorer. */
export function harmonicSeries(fundamental: number, count = 8): FrequencyRelation[] {
  return Array.from({ length: count }, (_, i) => ({
    ratio: `${i + 1}:1`,
    frequency: round(fundamental * (i + 1)),
    label: i === 0 ? 'Fundamental' : `Harmonic ${i + 1}`,
  }));
}

/** Fills in the compatibility flags a record carries, from its value alone. */
export function playbackCompatibility(hz: number): ArchiveEntry['playback'] {
  return {
    directAudible: hz >= AUDIBLE_MIN_HZ && hz <= AUDIBLE_MAX_HZ,
    binauralBeatCompatible: hz > 0 && hz <= MAX_MODULATION_HZ,
    binauralCarrierCompatible: hz >= AUDIBLE_MIN_HZ && hz <= AUDIBLE_MAX_HZ,
    amCompatible: hz > 0 && hz <= MAX_MODULATION_HZ,
    isochronicCompatible: hz > 0 && hz <= MAX_MODULATION_HZ,
    outsidePracticalRange: hz > AUDIBLE_MAX_HZ || hz < AUDIBLE_MIN_HZ,
  };
}

/** Serialised into Protocol DNA so a transformed session stays reproducible (§29). */
export interface HistoricalReference {
  entryId: string;
  entryName: string;
  sourceVersion: number;
  originalFrequency: number;
  playbackFrequency: number;
  transform: TransformKind;
  octaveShift: number;
  carrierHz?: number;
}

export function referenceFor(entry: ArchiveEntry, transform: PlaybackTransform): HistoricalReference {
  return {
    entryId: entry.id,
    entryName: entry.name,
    sourceVersion: entry.sourceVersion,
    originalFrequency: transform.originalHz,
    playbackFrequency: transform.playbackHz,
    transform: transform.kind,
    octaveShift: transform.octaveShift,
    carrierHz: transform.carrierHz,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function format(value: number): string {
  const rounded = round(value);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}
