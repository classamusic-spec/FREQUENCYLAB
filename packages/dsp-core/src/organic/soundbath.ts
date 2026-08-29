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

/** One scheduled sound. The scheduler's entire output is a list of these. */
export interface SoundBathEvent {
  /** Seconds from session start. */
  atSec: number;
  assetId: string;
  layerId: string;
  role: LayerRole;
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
