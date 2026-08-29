import type { Rng } from '../math/rng.js';

/**
 * The sound bath: what an organic layer *is*, before anything is scheduled.
 *
 * A sound bath is not a playlist and this type is the reason it cannot become
 * one. Nothing here names a file or fixes a moment in time. A layer says what
 * kind of material it wants, how loud, how often, how many at once and how
 * likely — and the scheduler turns that into events. Two sessions from the same
 * preset are the same instrument played twice, not the same recording twice.
 *
 * Read `scheduler.ts` next: this file is the vocabulary, that one is the
 * grammar.
 */

/** What a layer is doing in the mix, as sound design rather than as a claim. */
export type LayerRole =
  | 'BED'
  | 'DRONE'
  | 'PRIMARY_BOWL'
  | 'SECONDARY_BOWL'
  | 'BELL'
  | 'CHIME'
  | 'TUNING_FORK'
  | 'MELODIC_ACCENT'
  | 'KALIMBA'
  | 'TRANSITION'
  | 'TEXTURAL'
  | 'LOW_RESONANCE'
  | 'HIGH_RESONANCE'
  | 'SPARKLE'
  | 'GROUNDING'
  | 'AIR';

/**
 * How a layer picks pitches.
 *
 * `FREE` ignores pitch entirely, which is the honest default for a library
 * where 161 of 369 assets have no determinable note at all. The tonal
 * strategies apply only to assets that actually carry a pitch, and an
 * inharmonic bowl is never forced into a key it does not have (§22).
 */
export type PitchStrategy = 'FREE' | 'TONAL' | 'HARMONIC' | 'MONO_PITCH' | 'ADAPTIVE';

export interface Range {
  min: number;
  max: number;
}

/**
 * What a layer will draw from.
 *
 * A query, never a list of ids — that is what keeps the engine working when the
 * library grows (§86) and what stops filenames leaking into the runtime (§44).
 * `assetIds` exists for the one case the spec asks for, a user hand-picking
 * sounds (§35), and is the exception that proves the rule.
 */
export interface AssetPool {
  instruments?: string[];
  durationClasses?: string[];
  requiredTags?: string[];
  preferredTags?: string[];
  excludedTags?: string[];
  /** Explicit selection. Overrides the query when present. */
  assetIds?: string[];
}

export interface SoundBathLayer {
  id: string;
  role: LayerRole;
  pool: AssetPool;

  /** Seconds between the *start* of one event and the next attempt on this layer. */
  intervalSec: Range;
  /** Chance an attempt actually fires, 0..1. Below 1 the layer breathes. */
  probability: number;
  gainDb: Range;
  panRange: Range;
  /**
   * Start this layer's sounds anywhere in the recording rather than at the top.
   *
   * For continuous material only — waves, wind, anything with no attack to
   * miss. Setting it on struck material would cut the onset off every strike,
   * so `planSoundBath` also refuses to offset anything shorter than
   * `MIN_ENTER_ANYWHERE_SEC`, where there is not enough sound to enter into.
   */
  enterAnywhere?: boolean;
  /**
   * Why this layer is allowed a pool below the usual floor.
   *
   * The floor exists because the scheduler penalises the six most recently
   * played ids, so a small pool rotates rather than chooses. That reasoning is
   * about *events*: six struck bells alternating is audible. It is weaker for
   * a continuous bed entered at a different point each time, and this field is
   * how that case is admitted — with a stated reason, in the data, rather than
   * by lowering the floor for everything. The validator still reports the pool
   * as thin; what this changes is whether that is a defect.
   */
  acknowledgedThinPool?: string;
  maxVoices: number;
  /** Seconds of enforced quiet on this layer after a sound ends. */
  minimumRestSec?: number;
  reverbSend?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  pitchStrategy?: PitchStrategy;
  /**
   * Relative likelihood against other layers when polyphony is contended.
   * Higher wins. A bed outranks a sparkle when only one voice is free.
   */
  priority?: number;
  /** Per-asset weight multipliers, keyed by tag (§17). */
  tagWeights?: Record<string, number>;
}

export interface SoundBathGlobals {
  /**
   * 0..1. Scales interval, probability and polyphony together — never gain.
   * Turning density up must add *events*, not volume (§19).
   */
  density: number;
  /** 0..1. Biases selection toward sharper, more present material (§20). */
  energy: number;
  /** 0..1. Biases selection by measured spectral brightness (§21). */
  brightness: number;
  reverbPreset?: string;
  width?: number;
  tonalCenter?: string;
  /** A4 reference for any retuning. 440 unless the preset says otherwise (§24). */
  tuningReferenceHz?: number;
}

export interface SoundBathPreset {
  id: string;
  version: number;
  name: string;
  description: string;
  globals: SoundBathGlobals;
  layers: SoundBathLayer[];
}

/**
 * The subset of an asset's metadata the scheduler needs.
 *
 * Declared structurally rather than imported so the scheduler depends on the
 * *shape* of an asset and not on the manifest's storage format: anything
 * carrying these fields can be scheduled, which is what lets a second library
 * arrive later without touching this file (§86). Every field here is measured
 * offline — the scheduler never analyses anything (§42).
 */
export interface SchedulableAsset {
  assetId: string;
  durationSeconds: number;
  instrument: string;
  durationClass: string;
  roles: string[];
  tags: string[];
  /** 0..1, or null where the analysis could not determine it. */
  brightness: number | null;
  transientStrength: number | null;
  /** dB the mixer should apply to bring this into line with the library. */
  recommendedGainDb: number | null;
  pitchClass: string | null;
  /** How the pitch was established. A vendor label is not a measurement. */
  noteSource: 'measured' | 'filename' | null;
  maxRecommendedVoices: number;
  loopable: boolean;
  approved: boolean;
}

// ---------------------------------------------------------------------------
// The acoustic mixer (§31)
// ---------------------------------------------------------------------------

/**
 * A channel strip on the acoustic mixer.
 *
 * The listener's vocabulary, not the pipeline's. `SINGING_BOWL` is what the
 * manifest calls the material and `bowls` is what a person turns down, and the
 * two are kept apart on purpose: the closed set of instruments belongs to the
 * library and may grow with the next pack, while the set of faders is a
 * decision about the interface. Mapping one onto the other in a single function
 * is what lets a new instrument arrive without either a new fader appearing
 * unannounced or its sound escaping the mixer entirely.
 *
 * `texture` is the second half of that guarantee. The schema declares four
 * instruments this library has no assets for — `TEXTURE`, `DRONE`, `AMBIENT`
 * and `UNKNOWN` — and they are grouped rather than dropped, because a sound
 * with no fader is a sound the mixer cannot turn down. Nothing in the shipped
 * library reaches it today, which is why the mixer screen draws a strip only
 * where the session actually has events: §92 forbids a control that does
 * nothing, and a `Texture` fader over an empty group is exactly that.
 */
export type MixerGroup =
  | 'bowls'
  | 'bells'
  | 'chimes'
  | 'kalimba'
  | 'forks'
  | 'water'
  | 'texture';

/** Fader order, top to bottom. Sustained material first, accents after. */
export const MIXER_GROUPS: readonly MixerGroup[] = [
  'bowls',
  'bells',
  'chimes',
  'kalimba',
  'forks',
  'water',
  'texture',
];

export const MIXER_GROUP_LABELS: Readonly<Record<MixerGroup, string>> = {
  bowls: 'Bowls',
  bells: 'Bells',
  chimes: 'Chimes',
  kalimba: 'Kalimba',
  forks: 'Tuning forks',
  water: 'Water',
  texture: 'Texture',
};

/**
 * Instrument to fader.
 *
 * Keyed by the manifest's own `instrument` string rather than by
 * `OrganicInstrument`, so `soundbath.ts` keeps depending on the *shape* of an
 * asset and not on the generated manifest types — the same reason
 * `SchedulableAsset` is declared structurally a few lines above. The test suite
 * holds the two in agreement by walking `ORGANIC_INSTRUMENTS` and checking that
 * none of them falls through to the default.
 */
const INSTRUMENT_GROUPS: Readonly<Record<string, MixerGroup>> = {
  SINGING_BOWL: 'bowls',
  BELL: 'bells',
  CHIME: 'chimes',
  KALIMBA: 'kalimba',
  TUNING_FORK: 'forks',
  WATER: 'water',
  TEXTURE: 'texture',
  DRONE: 'texture',
  AMBIENT: 'texture',
  UNKNOWN: 'texture',
};

export function mixerGroupForInstrument(instrument: string): MixerGroup {
  return INSTRUMENT_GROUPS[instrument] ?? 'texture';
}

/**
 * The bottom of every fader, and the point at which it is genuinely off.
 *
 * −40 dB is a hundredth of the amplitude, which under a session is inaudible
 * but not silent, and a fader that leaves a whisper at its floor is a fader
 * that cannot be used to remove an instrument. `mixerGain` therefore returns
 * exactly zero here rather than 0.01: the last step of the travel is a mute,
 * and the readout says `OFF` rather than a number.
 */
export const MIXER_MIN_DB = -40;
/**
 * The top.
 *
 * Six decibels of make-up is enough to bring a layer forward without inviting
 * the acoustic bed in front of the core signal, which §25 and the presets' own
 * −18…−4 dB trims are both about. Everything the faders can sum to still meets
 * the organic bus's soft clipper before it reaches the master.
 */
export const MIXER_MAX_DB = 6;

/** Where every fader sits until somebody moves it: the preset as written. */
export const MIXER_UNITY_DB = 0;

/**
 * The reverb return, which has its own ceiling.
 *
 * A send is not a level. At 0 dB the wet path is already as loud as the dry
 * signal that fed it, scaled by the per-layer send the preset asked for, and
 * anything above that stops being a room and becomes an effect.
 */
export const MIXER_SPACE_MAX_DB = 0;

/**
 * Linear gain for a fader position, with the floor treated as a mute.
 *
 * Clamped at both ends so a stored mix from a build with a wider range cannot
 * ask the audio graph for a gain it was never meant to apply.
 */
export function mixerGain(db: number): number {
  if (!Number.isFinite(db) || db <= MIXER_MIN_DB) return 0;
  return Math.pow(10, Math.min(db, MIXER_MAX_DB) / 20);
}

/**
 * The inverse, for a level that is already stored as an amplitude.
 *
 * The core signal's level is one of those: it has been a linear 0..1 since
 * calibration was written, and the mixer shows it in decibels beside the
 * acoustic faders rather than introducing a second unit on the same screen.
 * Zero maps to the floor, which is where the fader reads `OFF`.
 */
export function mixerDb(gain: number): number {
  if (!Number.isFinite(gain) || gain <= 0) return MIXER_MIN_DB;
  return Math.max(MIXER_MIN_DB, Math.min(MIXER_MAX_DB, 20 * Math.log10(gain)));
}

/**
 * One person's settings for the acoustic layer.
 *
 * Deliberately *only* the acoustic layer. The core signal has a level too and
 * the mixer shows it, but that value already belongs to the user's comfortable
 * output level — the number calibration sets, the session screen's intensity
 * control moves and every protocol starts at — and a second copy of it here
 * would be a second source of truth free to disagree with the first.
 */
export interface AcousticMix {
  /** Fader position per group, in dB. `MIXER_MIN_DB` is off. */
  readonly levels: Readonly<Record<MixerGroup, number>>;
  /** The reverb return, in dB. `MIXER_MIN_DB` is off, and is the default. */
  readonly spaceDb: number;
}

/**
 * Every fader at unity and the room switched off.
 *
 * Unity because a preset's own gain staging is the mix it was written with, and
 * the room off because the acoustic layer has never had one: the presets have
 * always declared a `reverbSend` and nothing has ever read it, so the sound
 * every shipped session makes today is the dry sound. Introducing a reverb by
 * default would change all nineteen presets on an aesthetic judgement nothing
 * here can measure. The send amounts are real and the control is real; where it
 * starts is the listener's call.
 */
export const DEFAULT_ACOUSTIC_MIX: AcousticMix = {
  levels: {
    bowls: MIXER_UNITY_DB,
    bells: MIXER_UNITY_DB,
    chimes: MIXER_UNITY_DB,
    kalimba: MIXER_UNITY_DB,
    forks: MIXER_UNITY_DB,
    water: MIXER_UNITY_DB,
    texture: MIXER_UNITY_DB,
  },
  spaceDb: MIXER_MIN_DB,
};

/** True when nothing has been moved, so the mixer can say so. */
export function isDefaultMix(mix: AcousticMix): boolean {
  if (mix.spaceDb !== DEFAULT_ACOUSTIC_MIX.spaceDb) return false;
  return MIXER_GROUPS.every((group) => mix.levels[group] === MIXER_UNITY_DB);
}

/** A copy with one fader moved, clamped to the fader's own travel. */
export function withGroupLevel(mix: AcousticMix, group: MixerGroup, db: number): AcousticMix {
  return {
    ...mix,
    levels: { ...mix.levels, [group]: clampFader(db, MIXER_MAX_DB) },
  };
}

/** A copy with the reverb return moved. */
export function withSpace(mix: AcousticMix, db: number): AcousticMix {
  return { ...mix, spaceDb: clampFader(db, MIXER_SPACE_MAX_DB) };
}

function clampFader(db: number, max: number): number {
  if (!Number.isFinite(db)) return MIXER_MIN_DB;
  return Math.min(max, Math.max(MIXER_MIN_DB, db));
}

/** One scheduled sound. The scheduler's entire output is a list of these. */
export interface SoundBathEvent {
  /** Seconds from session start. */
  atSec: number;
  assetId: string;
  layerId: string;
  role: LayerRole;
  /**
   * Which fader on the acoustic mixer governs this sound (§31).
   *
   * Taken from the *asset*, not the layer. A layer's pool is a query and a
   * query may widen — `ALL_CHIMES` is one instrument today and a pool naming
   * two would be legal tomorrow — so a mixer keyed on the layer would put a
   * bowl and a bell under the same fader as soon as one pool asked for both.
   * The thing that sounds is an asset, and an asset is exactly one instrument.
   *
   * Carried on the event rather than looked up at playback because the plan is
   * the whole contract between the scheduler and the player: resolving it here
   * keeps the audio path to a map lookup it was already doing (§55), and makes
   * the routing checkable by planning a session and reading the list.
   */
  group: MixerGroup;
  gainDb: number;
  pan: number;
  reverbSend: number;
  /** How long this event occupies a voice, including its natural tail. */
  durationSec: number;
  /** Cents of retuning, 0 when none. Only ever applied to pitched material. */
  detuneCents: number;
  /**
   * Seconds into the asset's own sounding span to begin, normally 0.
   *
   * A struck sound must start at its attack — entering a bell three seconds in
   * is not a bell. Continuous material is the opposite: a forty-three second
   * wave recording entered at the same place every time is audibly the same
   * recording every time, and entering it anywhere is what lets two files
   * carry a bed. Only layers that set `enterAnywhere` ever get a non-zero
   * value here.
   */
  offsetSec: number;
}

export function lerpRange(range: Range, t: number): number {
  return range.min + (range.max - range.min) * t;
}

export function sampleRange(range: Range, rng: Rng): number {
  return lerpRange(range, rng.nextFloat());
}

/**
 * How long a voice should take to fade out, from how loud it still is.
 *
 * A single release time cannot serve this library. Measured over the last half
 * second before playback ends, a singing bowl sits about 64 dB below its own
 * peak — it has already decayed, and any fade at all is inaudible. A kalimba
 * loop sits about 18 dB below peak, because a loop does not decay, it stops.
 * Ocean waves sit at about 20. Fifty-five of the library's assets are still
 * above −20 dB at their end, and a half-second ramp on those is the abrupt cut
 * a listener actually hears rather than a release.
 *
 * So the fade covers the distance left to travel, at a fixed and gentle rate.
 * Everything quieter than `INAUDIBLE_DB` has no distance to travel and takes
 * the floor; everything louder takes proportionally longer, up to a ceiling
 * that stops a very loud ending from fading for so long it reads as a separate
 * musical gesture.
 *
 *   −64 dB (a bowl)        -> 0.4 s, the floor
 *   −44 dB (a soft bell)   -> 0.8 s
 *   −20 dB (ocean waves)   -> 2.0 s
 *   −10 dB (a kalimba loop)-> 2.5 s
 *
 * `null` — an asset too short to measure — takes the floor, which is what a
 * sound that brief needs anyway.
 */
export const RELEASE_FLOOR_SEC = 0.4;
export const RELEASE_CEILING_SEC = 3.5;
/** Below this an asset has effectively already ended. */
export const RELEASE_INAUDIBLE_DB = -60;
/** Decibels of release per second. Gentle enough to read as a decay. */
export const RELEASE_DB_PER_SEC = 20;

export function releaseSecondsFor(releaseTailDb: number | null | undefined): number {
  if (releaseTailDb === null || releaseTailDb === undefined || !Number.isFinite(releaseTailDb)) {
    return RELEASE_FLOOR_SEC;
  }
  // Distance from where the sound still is *down* to inaudible, so a loud
  // ending has further to go and takes longer. The other way round is negative
  // for every asset in the library and clamps them all to the floor.
  const toTravel = releaseTailDb - RELEASE_INAUDIBLE_DB;
  if (toTravel <= 0) return RELEASE_FLOOR_SEC;
  const seconds = toTravel / RELEASE_DB_PER_SEC;
  return Math.min(RELEASE_CEILING_SEC, Math.max(RELEASE_FLOOR_SEC, seconds));
}
