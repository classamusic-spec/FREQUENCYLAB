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
}

export function lerp(range: Range, t: number): number {
  return range.min + (range.max - range.min) * t;
}

export function sample(range: Range, rng: Rng): number {
  return lerp(range, rng.nextFloat());
}
