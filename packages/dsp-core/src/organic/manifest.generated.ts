/**
 * AUTO-GENERATED — DO NOT EDIT DIRECTLY.
 *
 * Emitted by `tools/audio_pipeline/pipeline/emit_ts.py` from the declarations in
 * `tools/audio_pipeline/pipeline/schema.py`, which is the one definition of what
 * an asset record is (§25). To change anything in this file, change the schema
 * and run:
 *
 *     python3 tools/audio_pipeline/index_audio.py all
 *
 * An edit made here survives until the next run and no longer. Until then it is
 * a second schema quietly disagreeing with the first, which is the failure §25
 * exists to prevent and the whole reason these types are generated instead of
 * being kept by hand beside the code that consumes them.
 *
 * Nothing time-varying, machine-specific or absolute is written, and every list
 * is in declaration order, so re-running the pipeline over an unchanged schema
 * leaves this file byte-identical (§56). A diff here always means the schema
 * moved.
 */

/**
 * The record shape this file describes. A manifest carrying a different number is not a
 * manifest these types describe, and should be refused rather than read (§33).
 */
export const ORGANIC_SCHEMA_VERSION = 1;

/**
 * What the measuring code did. Changes whenever a number the pipeline computes would
 * come out differently, which is what invalidates the analysis cache.
 */
export const ORGANIC_ANALYSIS_VERSION = '1.8.0';

/**
 * The content of the sample library itself, which is a curatorial fact rather than a
 * technical one (§34).
 */
export const ORGANIC_LIBRARY_VERSION = '0.2.0';

// --------------------------------------------------------------------------
// Closed sets
//
// Each one is emitted twice: as a frozen array, so a UI can offer exactly the
// values that exist, and as the union type derived from it, so a typo in a
// query is a compile error rather than an empty result.
// --------------------------------------------------------------------------

export const ORGANIC_INSTRUMENTS = [
  'SINGING_BOWL',
  'BELL',
  'CHIME',
  'TUNING_FORK',
  'KALIMBA',
  'WATER',
  'TEXTURE',
  'DRONE',
  'AMBIENT',
  'UNKNOWN',
] as const;
export type OrganicInstrument = (typeof ORGANIC_INSTRUMENTS)[number];

export const ORGANIC_DURATION_CLASSES = [
  'MICRO',
  'SHORT',
  'MEDIUM',
  'LONG',
  'EXTENDED',
] as const;
export type OrganicDurationClass = (typeof ORGANIC_DURATION_CLASSES)[number];

export const ORGANIC_ROLES = [
  'ACCENT',
  'TRANSITION',
  'DETAIL',
  'BELL_STRIKE',
  'CHIME_STRIKE',
  'FORK_EVENT',
  'FOREGROUND_GESTURE',
  'RESONANT_HIT',
  'PHRASE',
  'SECONDARY_LAYER',
  'PRIMARY_BOWL',
  'LONG_RESONANCE',
  'MAJOR_EVENT',
  'BED',
  'EXTENDED_TEXTURE',
  'LONG_PERFORMANCE',
] as const;
export type OrganicRole = (typeof ORGANIC_ROLES)[number];

export const ORGANIC_CHARACTER_TAGS = [
  'deep',
  'warm',
  'bright',
  'airy',
  'dark',
  'gentle',
  'strong',
  'metallic',
  'shimmering',
  'smooth',
  'rough',
  'low',
  'mid',
  'high',
  'short_decay',
  'medium_decay',
  'long_decay',
  'tonal',
  'inharmonic',
  'percussive',
  'sustained',
] as const;
export type OrganicCharacterTag = (typeof ORGANIC_CHARACTER_TAGS)[number];

export const ORGANIC_TONALITY = [
  'TONAL',
  'PARTIALLY_TONAL',
  'INHARMONIC',
  'ATONAL',
  'UNKNOWN',
] as const;
export type OrganicTonality = (typeof ORGANIC_TONALITY)[number];

export const ORGANIC_PITCH_CLASSES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;
export type OrganicPitchClass = (typeof ORGANIC_PITCH_CLASSES)[number];

export const ORGANIC_NOTE_SOURCES = [
  'measured',
  'filename',
] as const;
export type OrganicNoteSource = (typeof ORGANIC_NOTE_SOURCES)[number];

export const ORGANIC_APPROVAL_SOURCES = [
  'curator',
  'library',
] as const;
export type OrganicApprovalSource = (typeof ORGANIC_APPROVAL_SOURCES)[number];

/**
 * One duration class and the range that puts an asset in it. Bounds are seconds,
 * lower-inclusive and upper-exclusive, so an asset of exactly 2.0 s lands in SHORT
 * rather than in both or neither.
 */
export interface OrganicDurationBand {
  readonly name: OrganicDurationClass;
  readonly minSeconds: number;
  /** Null on the last band, which has no upper bound. */
  readonly maxSeconds: number | null;
}

/**
 * The bands this manifest was classified with.
 *
 * Here so a label can say what LONG means, not so anything can re-derive a class: every
 * asset carries the class it was given, and computing a second opinion at runtime is
 * how the app and the manifest come to disagree.
 */
export const ORGANIC_DURATION_BANDS: readonly OrganicDurationBand[] = [
  { name: 'MICRO', minSeconds: 0, maxSeconds: 2 },
  { name: 'SHORT', minSeconds: 2, maxSeconds: 6 },
  { name: 'MEDIUM', minSeconds: 6, maxSeconds: 20 },
  { name: 'LONG', minSeconds: 20, maxSeconds: 60 },
  { name: 'EXTENDED', minSeconds: 60, maxSeconds: null },
];

/**
 * One item of `spectral.resonantPeaksHz`. The strongest partials the analysis kept, in
 * ascending frequency order. `strength` is relative to the loudest of them, which is
 * therefore 1.
 */
export interface OrganicResonantPeak {
  readonly hz: number;
  readonly strength: number;
}

// --------------------------------------------------------------------------
// The record, section by section
// --------------------------------------------------------------------------

/**
 * Where the audio came from.
 *
 * Storage detail, carried so a tool can find the file again. Runtime code must not read
 * meaning out of these strings (§44): the pipeline's own classifier proved why, by
 * reading this library's root folder name and classifying all 369 assets as chimes.
 */
export interface OrganicAssetSource {
  readonly filename: string;
  readonly relativePath: string;
  /**
   * SHA-256 of the file's bytes. The asset id is derived from it, so a rename keeps the
   * id and a re-encode changes it (§7).
   */
  readonly contentHash: string;
  readonly format: string;
  /** Size of the source file on disk. */
  readonly bytes: number;
}

/** The decoded facts: how long, how fast, how many channels. */
export interface OrganicAssetAudio {
  /**
   * The whole file, including any silence at either end. `timing` says where the sound
   * is inside it.
   */
  readonly durationSeconds: number;
  readonly sampleRate: number;
  readonly channels: number;
  /** Null for formats that do not carry one. */
  readonly bitDepth: number | null;
  readonly frameCount: number;
}

/**
 * Loudness, measured once so nothing has to measure it again.
 *
 * `recommendedGainDb` is a suggestion for the mixer, not a normalisation target: the
 * natural dynamics stay in the audio (§11).
 */
export interface OrganicAssetLevels {
  readonly peakDbFS: number | null;
  /** Inter-sample peak, which can sit above the sample peak. */
  readonly truePeakDbFS: number | null;
  readonly rmsDbFS: number | null;
  /** Integrated loudness. Null when it could not be measured. */
  readonly integratedLufs: number | null;
  /**
   * dB the mixer may apply to bring this asset toward the pipeline's target loudness.
   * Null means unmeasured, which is not the same as 0 dB — decide what to do about it
   * rather than treating it as unity.
   */
  readonly recommendedGainDb: number | null;
  readonly releaseTailDb: number | null;
}

/**
 * Where the sound actually starts and stops inside the file.
 *
 * Silence is measured with a hold, because a bowl's partials beat against each other
 * and dip below any fixed threshold on the way down. Without the hold the first dip
 * reads as the end of the sound (§13).
 */
export interface OrganicAssetTiming {
  /** Silence before the first audible frame. */
  readonly leadingSilenceSeconds: number | null;
  /** Silence after the last audible frame. */
  readonly trailingSilenceSeconds: number | null;
  /**
   * Where playback may begin. Stops short of the audio so a strike never starts
   * mid-attack. Null when there is no lead-in worth skipping.
   */
  readonly recommendedStartOffset: number | null;
  /**
   * Where the sound is finished, half a second past the last audible frame. Null when
   * the file has under a second of trailing silence.
   */
  readonly recommendedEndOffset: number | null;
}

/**
 * What the spectrum says: pitch, colour, decay.
 *
 * Every field here is nullable and means it. An unknown pitch is a fact about a bell,
 * not a gap to be filled with a guess (§14).
 */
export interface OrganicAssetSpectral {
  /** Estimated fundamental. Null when no estimate was confident enough. */
  readonly fundamentalHz: number | null;
  /**
   * 0..1. Below the pipeline's floor no note is recorded at all: a confident wrong note
   * is worse than an honest blank (§14).
   */
  readonly pitchConfidence: number | null;
  /** Note name with octave, such as `A#6`. Only ever a measured note. */
  readonly note: string | null;
  /**
   * The note without its octave. Present when either the spectrum or the library's
   * filename supplied one — `noteSource` says which.
   */
  readonly pitchClass: OrganicPitchClass | null;
  /**
   * Where the note came from, and never blank when a note is present.
   *
   * `measured` means the spectrum corroborated it. `filename` means the library
   * labelled it and the audio could neither confirm nor deny, which for inharmonic
   * material is often the better answer and is still not a measurement. A caller that
   * cannot tell the two apart will eventually present a vendor's label as an analysis
   * (§18).
   */
  readonly noteSource: OrganicNoteSource | null;
  readonly tonality: OrganicTonality;
  readonly spectralCentroidHz: number | null;
  readonly spectralRolloffHz: number | null;
  /** Spectral centroid mapped onto 0..1 across the range this library spans. */
  readonly brightness: number | null;
  /**
   * 0..1 attack sharpness. Sharp attacks stack badly, which is what
   * `maxRecommendedVoices` limits (§12).
   */
  readonly transientStrength: number | null;
  /**
   * Seconds from the peak until the envelope has fallen 60 dB. A T60-style estimate,
   * reported as an estimate.
   */
  readonly decaySeconds: number | null;
  /**
   * The strongest partials the analysis kept, in ascending frequency order. `strength`
   * is relative to the loudest of them, which is therefore 1.
   */
  readonly resonantPeaksHz: readonly OrganicResonantPeak[];
}

/**
 * What the asset is, and what it is good for.
 *
 * Read from the path where the library names the instrument, and from the audio where
 * it does not (§19). A curator's override wins over both (§21).
 */
export interface OrganicAssetClassification {
  readonly instrument: OrganicInstrument;
  /**
   * The band `durationSeconds` falls in. Carried so nothing downstream has to re-derive
   * it, and so a change to the bands is a pipeline change rather than a change in what
   * the app happens to compute.
   */
  readonly durationClass: OrganicDurationClass;
  /** What this asset can do in a session (§10). */
  readonly recommendedRoles: readonly OrganicRole[];
  /** How it sounds, in words a query can use (§20). */
  readonly characterTags: readonly OrganicCharacterTag[];
}

/** Playback hints: memory strategy, looping, and how many may sound at once (§23). */
export interface OrganicAssetRuntime {
  /** Too long to hold decoded in memory on a phone (§23). */
  readonly streamingRecommended: boolean;
  /** Short enough to hold decoded in memory (§23). */
  readonly preloadRecommended: boolean;
  /**
   * The library's own statement that a file is meant to repeat, never a guess from the
   * audio. A seamless loop point is a property of how a file was produced, and guessing
   * wrong clicks on every repeat.
   */
  readonly loopable: boolean;
  /** How many copies may sound at once before the attacks pile up (§12). */
  readonly maxRecommendedVoices: number;
}

/** Curation state. Nothing is approved until a person approves it. */
export interface OrganicAssetReview {
  /** Cleared to ship. False until a person says otherwise. */
  readonly approved: boolean;
  readonly approvalSource: OrganicApprovalSource | null;
  /** True when a curator's overrides were merged into this record (§21). */
  readonly manualOverride: boolean;
  /** A curator's note, for a human reader. */
  readonly notes: string | null;
}

/**
 * One analysed asset, exactly as the manifest stores it.
 *
 * This is the storage shape. What a sound-bath engine consumes is `OrganicAsset` in
 * `registry.ts`, which is a different and smaller thing on purpose (§46) — an engine
 * that reaches into `source` is an engine that has started reading filenames.
 */
export interface OrganicManifestAsset {
  readonly assetId: string;
  readonly label: string;
  readonly source: OrganicAssetSource;
  readonly audio: OrganicAssetAudio;
  readonly levels: OrganicAssetLevels;
  readonly timing: OrganicAssetTiming;
  readonly spectral: OrganicAssetSpectral;
  readonly classification: OrganicAssetClassification;
  readonly runtime: OrganicAssetRuntime;
  readonly review: OrganicAssetReview;
}

/**
 * The summary block, deliberately not typed field by field.
 *
 * It is produced by the pipeline's report rather than by the record schema, so spelling
 * its keys out here would be a copy of a function nothing keeps in step with it — the
 * second-schema problem again, one level up. It is for a person looking at the file.
 * Anything a program depends on should be counted from `assets`.
 */
export type OrganicManifestCounts = Readonly<Record<string, unknown>>;

/**
 * The manifest file.
 *
 * Written by `tools/audio_pipeline`, read at startup, and the only thing the app knows
 * about the sample library. Nothing at runtime opens an audio file to find any of this
 * out (§44).
 */
export interface OrganicAudioManifest {
  /** Why this file must never be hand-edited (§22). */
  readonly _comment: string;
  /** The record shape. Refuse a manifest whose version you do not know (§33). */
  readonly schemaVersion: number;
  /** What the measuring code did. Changes when a measured number would. */
  readonly analysisVersion: string;
  /** The content of the sample library, as a curatorial fact (§34). */
  readonly organicLibraryVersion: string;
  /** `assets.length`, carried so a truncated file is obvious. */
  readonly assetCount: number;
  /** The summary block; see the type. */
  readonly counts: OrganicManifestCounts;
  /** Sorted by `assetId`, so two runs over the same library are byte-identical (§56). */
  readonly assets: readonly OrganicManifestAsset[];
}
