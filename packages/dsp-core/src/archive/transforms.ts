import { getParamDescriptor } from '../graph/descriptors.js';
import { binauralFrequencies } from '../graph/nodes/generators.js';
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
 *
 * The later transforms — centred binaural, monaural, FM, stereo movement, noise
 * modulation, the harmonic stack and the subharmonic — obey the same rule.
 * Each is a statement about **one** value: what the engine emits for it, and
 * why that is not the value itself. Anything needing a second value or a set of
 * them — a sweep between two frequencies, a stack of layers — is not a
 * translation of a number at all, and lives with whatever assembles a protocol
 * rather than here.
 */

export type TransformKind =
  | 'direct'
  | 'octave-down'
  | 'octave-up'
  | 'subharmonic'
  | 'harmonic-stack'
  | 'binaural-beat'
  | 'binaural-centered'
  | 'binaural-carrier'
  | 'monaural-beat'
  | 'am-rate'
  | 'isochronic-rate'
  | 'fm-rate'
  | 'stereo-motion-rate'
  | 'noise-modulation-rate';

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
  /**
   * Peak swing either side of the carrier, where the transform moves it.
   *
   * Carried as a number rather than left in the prose because a rate alone does
   * not describe an FM signal: without the swing, two very different sounds
   * would print the same statement.
   */
  deviationHz?: number;
  /**
   * The two tones a binaural transform actually emits, one per ear.
   *
   * Present as numbers so a screen prints the pair rather than re-deriving it.
   * Re-deriving is where the centred arithmetic goes wrong — `C` and `C + B`
   * instead of `C - B/2` and `C + B/2` — and this field exists to make that
   * mistake impossible downstream.
   */
  channels?: { leftHz: number; rightHz: number };
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

/**
 * Limits read from the engine's own parameter descriptors instead of restated.
 *
 * A transform may only be offered if the engine can actually produce it, so its
 * boundaries have to be the engine's boundaries. A copy of the numbers here
 * would be free to drift, and a drifted limit shows up as an option that is
 * offered and then refuses to build — the silent substitution this module
 * exists to prevent, arriving by the back door.
 */
const MOTION_MAX_HZ = getParamDescriptor('stereoMotion', 'rate')!.max;
const HARMONIC_MIN_HZ = getParamDescriptor('harmonic', 'fundamental')!.min;
const HARMONIC_MAX_HZ = getParamDescriptor('harmonic', 'fundamental')!.max;
const DEFAULT_DEVIATION_HZ = getParamDescriptor('fm', 'deviation')!.default;

export interface TransformOptions {
  /** Carrier for the modulation-based transforms. */
  carrierHz?: number;
  /** Peak swing either side of the carrier for the FM transform. */
  deviationHz?: number;
  /** Signed whole-octave shift applied to the harmonic stack's fundamental. */
  harmonicOctaveShift?: number;
  /** Whole octaves the subharmonic transform divides by. Defaults to one. */
  subharmonicOctaves?: number;
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
  const deviation = options.deviationHz ?? DEFAULT_DEVIATION_HZ;
  return [
    directTransform(hz),
    octaveDownTransform(hz),
    octaveUpTransform(hz),
    binauralBeatTransform(hz, carrier),
    binauralCenteredTransform(hz, carrier),
    binauralCarrierTransform(hz),
    monauralBeatTransform(hz, carrier),
    amRateTransform(hz, carrier),
    isochronicRateTransform(hz, carrier),
    fmRateTransform(hz, carrier, deviation),
    stereoMotionRateTransform(hz, carrier),
    noiseModulationRateTransform(hz),
    harmonicStackTransform(hz, options.harmonicOctaveShift ?? 0),
    subharmonicTransform(hz, options.subharmonicOctaves ?? 1),
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
  // Straight from the engine's own function, so the pair stated here is the
  // pair rendered. `mode` is spelled out rather than defaulted because the two
  // modes differ by exactly the arithmetic this module is here to keep honest.
  const { left, right } = binauralFrequencies(carrierHz, hz, 'offset');
  return {
    kind: 'binaural-beat',
    originalHz: hz,
    playbackHz: hz,
    octaveShift: 0,
    carrierHz,
    channels: { leftHz: left, rightHz: right },
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
 * The value as a beat split either side of the carrier.
 *
 * This is the arithmetic people get wrong. A beat of B on a carrier C is
 * `C - B/2` and `C + B/2` — not C in one ear and `C + B` in the other, which is
 * what the offset mode above produces. Both are offered because they are
 * genuinely different signals: offset leaves one ear on the named carrier,
 * centred leaves neither ear on it and makes the carrier a midpoint nothing
 * emits. The two are labelled so nobody has to guess which they are hearing.
 */
function binauralCenteredTransform(hz: number, carrierHz: number): PlaybackTransform {
  const { left, right } = binauralFrequencies(carrierHz, hz, 'centered');
  const rateUsable = hz > 0 && hz <= MAX_MODULATION_HZ;
  // Only the centred mode needs this check: splitting the beat moves *both*
  // tones off the carrier, so a wide beat on a low carrier can push the lower
  // channel out of the band even though the carrier itself is comfortable.
  const channelsAudible = left >= AUDIBLE_MIN_HZ && right <= AUDIBLE_MAX_HZ;
  const usable = rateUsable && channelsAudible;
  return {
    kind: 'binaural-centered',
    originalHz: hz,
    playbackHz: hz,
    octaveShift: 0,
    carrierHz,
    channels: { leftHz: left, rightHz: right },
    label: 'Binaural difference (centred)',
    description: `A ${format(left)} Hz tone in one ear and ${format(right)} Hz in the other, centred on ${format(carrierHz)} Hz, a difference of ${format(hz)} Hz.`,
    equivalenceNote: `Your headphones produce ${format(left)} Hz and ${format(right)} Hz. Neither ear receives ${format(carrierHz)} Hz — that is the midpoint between the two. The ${format(hz)} Hz figure is the rate at which they beat once your hearing combines them; it is not an acoustic tone, and no speaker emits it.`,
    available: usable,
    unavailableReason: usable
      ? undefined
      : !rateUsable
        ? `${format(hz)} Hz is too fast to perceive as a beat; above about ${MAX_MODULATION_HZ} Hz the two tones are heard as separate pitches.`
        : `Centring a ${format(hz)} Hz beat on ${format(carrierHz)} Hz would put a channel at ${format(left < AUDIBLE_MIN_HZ ? left : right)} Hz, outside what headphones reproduce.`,
  };
}

/**
 * The value as the difference between two tones summed before the output.
 *
 * A separate option from the binaural pair because it is a separate claim: the
 * interference happens in the air rather than in perception, so it survives a
 * single speaker and does not depend on channel separation (§39). A record that
 * asks for one must not be played as the other.
 */
function monauralBeatTransform(hz: number, carrierHz: number): PlaybackTransform {
  const usable = hz > 0 && hz <= MAX_MODULATION_HZ;
  return {
    kind: 'monaural-beat',
    originalHz: hz,
    playbackHz: hz,
    octaveShift: 0,
    carrierHz,
    label: 'Monaural difference',
    description: `A ${format(carrierHz)} Hz tone and a ${format(carrierHz + hz)} Hz tone summed into both ears, pulsing ${format(hz)} times per second.`,
    equivalenceNote: `The tones in the air are ${format(carrierHz)} Hz and ${format(carrierHz + hz)} Hz. The ${format(hz)} Hz figure is the rate at which the summed pair rises and falls, not a tone. Unlike a binaural beat this pulsation is acoustic, so it is present on a speaker as well as in headphones.`,
    available: usable,
    unavailableReason: usable
      ? undefined
      : `${format(hz)} Hz is too fast to be heard as a pulsation; above about ${MAX_MODULATION_HZ} Hz the two tones are heard as separate pitches.`,
  };
}

/**
 * The value as the rate at which a carrier's pitch swings.
 *
 * The size of the swing is stated and carried rather than implied, because a
 * rate on its own does not describe an FM signal: the same number with a 2 Hz
 * swing and with a 200 Hz swing are two unrelated sounds.
 */
function fmRateTransform(hz: number, carrierHz: number, deviationHz: number): PlaybackTransform {
  const low = carrierHz - deviationHz;
  const high = carrierHz + deviationHz;
  const rateUsable = hz > 0 && hz <= MAX_MODULATION_HZ;
  const swingAudible = low >= AUDIBLE_MIN_HZ && high <= AUDIBLE_MAX_HZ;
  const usable = rateUsable && swingAudible;
  return {
    kind: 'fm-rate',
    originalHz: hz,
    playbackHz: hz,
    octaveShift: 0,
    carrierHz,
    deviationHz,
    label: 'FM rate',
    description: `A ${format(carrierHz)} Hz tone whose pitch swings between ${format(low)} and ${format(high)} Hz, ${format(hz)} times per second.`,
    equivalenceNote: `The ${format(hz)} Hz figure is how often the pitch swings, not a tone. What reaches your ears is a tone moving between ${format(low)} and ${format(high)} Hz.`,
    available: usable,
    unavailableReason: usable
      ? undefined
      : !rateUsable
        ? `${format(hz)} Hz is outside the practical modulation range.`
        : `A swing of ${format(deviationHz)} Hz either side of ${format(carrierHz)} Hz reaches ${format(low < AUDIBLE_MIN_HZ ? low : high)} Hz, outside what headphones reproduce.`,
  };
}

/**
 * The value as the rate at which the signal crosses the stereo field.
 *
 * The representation most easily mistaken for a tone, because nothing emits the
 * value at all: it is the speed of a movement applied to a carrier. Its ceiling
 * is the stereo movement module's own, so an option is never offered that the
 * engine would then refuse to build.
 */
function stereoMotionRateTransform(hz: number, carrierHz: number): PlaybackTransform {
  const usable = hz > 0 && hz <= MOTION_MAX_HZ;
  return {
    kind: 'stereo-motion-rate',
    originalHz: hz,
    playbackHz: hz,
    octaveShift: 0,
    carrierHz,
    label: 'Stereo movement rate',
    description: `A ${format(carrierHz)} Hz tone moved from one ear to the other and back ${format(hz)} times per second.`,
    equivalenceNote: `The ${format(hz)} Hz figure is the speed of the movement. The only frequency in the air is the ${format(carrierHz)} Hz tone being moved, and the movement needs two channels to exist at all.`,
    available: usable,
    unavailableReason: usable
      ? undefined
      : `${format(hz)} Hz is outside the range the stereo movement module produces, which reaches ${MOTION_MAX_HZ} Hz.`,
  };
}

/**
 * The value as the rate at which a noise bed rises and falls.
 *
 * The one modulation representation with no carrier to state: noise is
 * broadband, so there is no tone underneath it. The rate range is the same as
 * the other modulations because it is the same amplitude modulator applied to a
 * different source, and the same reason bounds it: past about 100 Hz a
 * modulation stops being felt as a rate.
 */
function noiseModulationRateTransform(hz: number): PlaybackTransform {
  const usable = hz > 0 && hz <= MAX_MODULATION_HZ;
  return {
    kind: 'noise-modulation-rate',
    originalHz: hz,
    playbackHz: hz,
    octaveShift: 0,
    label: 'Noise modulation rate',
    description: `A noise bed whose level rises and falls ${format(hz)} times per second.`,
    equivalenceNote: `The ${format(hz)} Hz figure is the rate at which the bed's level moves. Noise is broadband — nothing here emits a ${format(hz)} Hz tone.`,
    available: usable,
    unavailableReason: usable
      ? undefined
      : `${format(hz)} Hz is outside the practical modulation range.`,
  };
}

/**
 * The value as a fundamental with its harmonic partials sounding above it.
 *
 * The partials are additional real tones at 2×, 3× and so on, not a colouring
 * of the value, and the note says so: someone comparing this against a direct
 * tone of the same number is not comparing the same signal.
 *
 * The optional shift moves the fundamental by whole octaves, for a value whose
 * partials would otherwise sit above the band. A shifted stack states the shift
 * for the same reason `octave-down` does.
 */
function harmonicStackTransform(hz: number, octaveShift: number): PlaybackTransform {
  const wholeShift = Number.isInteger(octaveShift);
  const fundamental = wholeShift ? hz * Math.pow(2, octaveShift) : hz;
  const inRange = fundamental >= HARMONIC_MIN_HZ && fundamental <= HARMONIC_MAX_HZ;
  const usable = wholeShift && inRange;
  const factor = octaveShift > 0 ? `×${Math.pow(2, octaveShift)}` : `÷${Math.pow(2, -octaveShift)}`;
  const shiftNote =
    octaveShift === 0
      ? ''
      : `This sounds on ${format(fundamental)} Hz, not ${format(hz)} Hz — they are ${Math.abs(octaveShift)} octave${Math.abs(octaveShift) === 1 ? '' : 's'} apart, which is exact arithmetic and not an equivalent effect. `;
  return {
    kind: 'harmonic-stack',
    originalHz: hz,
    playbackHz: fundamental,
    octaveShift: wholeShift ? octaveShift : 0,
    label: octaveShift === 0 ? 'Harmonic stack' : `Harmonic stack ${factor}`,
    description: `A ${format(fundamental)} Hz tone with its harmonic partials sounding above it — ${format(fundamental * 2)} Hz, ${format(fundamental * 3)} Hz and so on.`,
    equivalenceNote: `${shiftNote}The partials above ${format(fundamental)} Hz are tones in their own right, not a timbre applied to it.`,
    available: usable,
    unavailableReason: usable
      ? undefined
      : !wholeShift
        ? 'An octave shift is a whole number of octaves; a fractional one is not a power of two.'
        : `${format(fundamental)} Hz is outside the range the harmonic module takes as a fundamental (${HARMONIC_MIN_HZ} to ${HARMONIC_MAX_HZ} Hz).`,
  };
}

/**
 * A stated division of a value by a whole number of octaves.
 *
 * Distinct from `octave-down`, which exists to rescue a value that sits above
 * the band and divides only as far as it must. A subharmonic is a choice made
 * about a value that may already be audible, so it is offered on its own terms
 * — and carries the same warning, because the divided tone is not the value.
 */
function subharmonicTransform(hz: number, octaves: number): PlaybackTransform {
  const whole = Number.isInteger(octaves) && octaves >= 1;
  const divisor = Math.pow(2, octaves);
  const playback = whole ? hz / divisor : hz;
  const inBand = playback >= AUDIBLE_MIN_HZ && playback <= AUDIBLE_MAX_HZ;
  const usable = whole && inBand;
  return {
    kind: 'subharmonic',
    originalHz: hz,
    playbackHz: playback,
    octaveShift: whole ? -octaves : 0,
    label: whole ? `Subharmonic ÷${divisor}` : 'Subharmonic',
    description: whole
      ? `${format(hz)} Hz divided by ${divisor} gives ${format(playback)} Hz, ${octaves} octave${octaves === 1 ? '' : 's'} below the archived value.`
      : 'A subharmonic divides the value by a whole number of octaves.',
    equivalenceNote: `This plays ${format(playback)} Hz, not ${format(hz)} Hz. An exact octave relationship is a fact about the two numbers and not an equivalent effect.`,
    available: usable,
    unavailableReason: usable
      ? undefined
      : !whole
        ? 'A subharmonic divides by a whole number of octaves; a fractional shift is not a power of two.'
        : playback < AUDIBLE_MIN_HZ
          ? `Dividing ${format(hz)} Hz by ${divisor} gives ${format(playback)} Hz, below what headphones reproduce.`
          : `Dividing ${format(hz)} Hz by ${divisor} gives ${format(playback)} Hz, still above the practical range of consumer audio hardware.`,
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
