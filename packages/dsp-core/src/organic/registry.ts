import {
  ORGANIC_CHARACTER_TAGS,
  ORGANIC_DURATION_CLASSES,
  ORGANIC_INSTRUMENTS,
  ORGANIC_PITCH_CLASSES,
  ORGANIC_ROLES,
  ORGANIC_SCHEMA_VERSION,
  type OrganicAudioManifest,
  type OrganicCharacterTag,
  type OrganicDurationClass,
  type OrganicInstrument,
  type OrganicManifestAsset,
  type OrganicNoteSource,
  type OrganicPitchClass,
  type OrganicRole,
  type OrganicTonality,
} from './manifest.generated.js';

/**
 * The organic sample library at runtime (§42, §43, §46).
 *
 * The registry loads the manifest, exposes what is in it, and answers pool
 * queries: *give me the ids of the long, deep, warm singing bowls*. That is the
 * whole job. It has three hard boundaries, and each one is here because the
 * obvious alternative is a defect.
 *
 * **It does not analyse anything.** No pitch detection, no loudness
 * measurement, no classification. Every one of those already happened once,
 * offline, over the whole library, with numpy and several minutes of CPU. A
 * runtime copy would be a second implementation of a measurement that already
 * has an answer — slower, worse, and free to disagree with the manifest sitting
 * next to it. Where a value is missing here it is missing because the analysis
 * could not determine it, and inventing one at playback time would turn an
 * honest blank into a confident guess (§14).
 *
 * **It contains no filename logic** (§44). Nothing here reads `source.filename`
 * or `source.relativePath`, splits a path, checks an extension, or tests a
 * string for `bell` or `bowl`. This is not fastidiousness: the pipeline's own
 * classifier tried exactly that and got it comprehensively wrong. This library
 * ships under a root folder named `Healing_Sounds_-_Bells_&_Chimes`, so all 369
 * paths contain both words, and a substring search over the full path
 * classified every asset in the library as a chime — no bells, no bowls at all —
 * while the real answer sat two directories further down. Preprocessing fixed
 * that by reading path segments from the file outwards and recording the result
 * in `classification`. If something at runtime wants to know what an asset is,
 * it reads that field. If the field cannot answer, the metadata is missing and
 * the fix belongs in preprocessing, not in a string test here.
 *
 * **It does not re-validate the manifest.** Uniqueness, field types, closed
 * sets, and whether the referenced audio exists are all checked by the pipeline
 * and again by `tools/audio_pipeline/check_manifest.py` in CI. The one thing
 * checked at construction is the schema version, because that is the check a
 * consumer has to make for itself: a manifest written to a shape this code does
 * not know is refused outright rather than read field by field until something
 * comes back `undefined` (§33).
 *
 * PERFORMANCE (§50). The app builds this at startup, so construction is a
 * single pass over the records that fills posting lists — instrument, duration
 * class, tag, role, pitch class, approved, loopable — plus typed arrays for the
 * numeric filters. A query then picks the *smallest* posting list among the
 * filters it was given and scans only that: asking for `deep` looks at eleven
 * records rather than 369. What is left lazy is the `OrganicAsset` view, which
 * is built on first request per asset and cached, so loading the manifest costs
 * one pass and no object graph.
 */

/**
 * One asset, in the shape a sound-bath engine actually schedules (§46).
 *
 * A flattened, decoupled view rather than the manifest record: the storage shape
 * is nested by *how it was measured* (levels, timing, spectral) and a scheduler
 * wants it flat and named by *what it is for*. Keeping them separate means the
 * pipeline can move a field between sections without touching the engine, and
 * — the part that matters — an engine holding one of these has no `source`
 * block to reach into. `OrganicManifestAsset` is still there for the tool that
 * genuinely needs a path or a hash; see `record`.
 */
export interface OrganicAsset {
  readonly id: string;
  /**
   * Human-readable name, for a log line or a curation screen.
   *
   * For a person to read and never for a program to parse. It is derived from
   * the source filename, so anything that reads meaning out of it has
   * reintroduced the filename logic §44 forbids — the fields below are the
   * answer to every question it looks like it could answer.
   */
  readonly label: string;
  readonly instrument: OrganicInstrument;
  readonly durationClass: OrganicDurationClass;
  /** The whole file, silence at either end included. */
  readonly durationSeconds: number;
  /** Where playback should begin, so a strike never starts mid-attack. */
  readonly startSeconds: number;
  /** Where the sound is finished. The end of the file unless it has dead air. */
  readonly endSeconds: number;
  /**
   * `endSeconds - startSeconds`: how long this asset actually occupies.
   *
   * The number a scheduler reserves. Using `durationSeconds` instead would book
   * a 98 s bowl for its 1.68 s of trailing silence too, and using the decay
   * estimate would book it for a ring-down that has already been counted.
   */
  readonly activeSeconds: number;
  /** Measured dead air after the last audible frame. Overlappable. */
  readonly trailingSilenceSeconds: number;
  /**
   * T60-style ring-down estimate in seconds, or null where none was measured.
   *
   * How long the sound keeps colouring the mix after it stops being an event —
   * the gap a scheduler leaves before the next strike if it wants the tail to
   * clear rather than to be landed on.
   */
  readonly decaySeconds: number | null;
  /** 0..1 attack sharpness, or null. Sharp attacks are what `maxVoices` limits. */
  readonly transientStrength: number | null;
  /** 0..1 spectral centroid, or null where the spectrum gave no answer. */
  readonly brightness: number | null;
  /**
   * dB the mixer may apply to bring this asset toward the library's target
   * loudness (§11). Null means it was never measured — which is not 0 dB, and a
   * caller that silently treats it as unity is claiming a measurement it does
   * not have.
   */
  readonly gainCompensationDb: number | null;
  readonly integratedLufs: number | null;
  readonly roles: readonly OrganicRole[];
  readonly characterTags: readonly OrganicCharacterTag[];
  readonly tonality: OrganicTonality;
  /** Note with octave, e.g. `A#6`. Only ever present when it was measured. */
  readonly note: string | null;
  /** Note without octave, from measurement *or* from the library's own label. */
  readonly pitchClass: OrganicPitchClass | null;
  /**
   * Where `pitchClass` came from, which is the reason more than one kind of
   * pitch is allowed to be here at all (§18).
   *
   * `measured` is an analysis. `filename` is the vendor's label, which for
   * inharmonic material is very often the better answer and is still not a
   * measurement. Null with a pitch class present is the third case: a curator
   * supplied it, and `manualOverride` is what says so — the field records what
   * the *analysis* did, so a human decision does not get to fill it in (§21).
   * Anything that shows a pitch to a listener, or tunes a drone to one, should
   * know which of the three it is holding.
   */
  readonly noteSource: OrganicNoteSource | null;
  /** How many copies may sound at once before the attacks pile up (§12). */
  readonly maxVoices: number;
  /** The library's own statement that the file repeats, never a guess. */
  readonly loopable: boolean;
  readonly preload: boolean;
  readonly streaming: boolean;
  /** Curated and cleared to ship. */
  readonly approved: boolean;
  /** True when a curator's values were merged into this record (§21). */
  readonly manualOverride: boolean;
}

/**
 * A pool query (§43).
 *
 * Every field is optional and every one narrows: an empty query is the whole
 * library. `requiredTags` excludes, `preferredTags` only reorders — a query for
 * *deep, warm, and preferably shimmering* must not come back empty because
 * nothing in the library is all three.
 *
 * A filter naming a value that no asset carries returns an empty pool. That is
 * an answer, not an error: a session builder asking for something the library
 * does not have needs to fall back, and an exception would make the ordinary
 * case of an under-stocked category into a crash.
 */
export interface AssetQuery {
  /** One instrument or any of several. */
  instrument?: OrganicInstrument | readonly OrganicInstrument[];
  durationClasses?: readonly OrganicDurationClass[];
  /** Every one of these must be present. */
  requiredTags?: readonly OrganicCharacterTag[];
  /** Ranks results without excluding any. */
  preferredTags?: readonly OrganicCharacterTag[];
  /** Any one of these roles. */
  roles?: readonly OrganicRole[];
  /** Pitch class, from measurement or from the library's label. */
  tonalCenter?: OrganicPitchClass;
  /**
   * Restricts `tonalCenter` — and the pool generally — to assets whose pitch
   * the spectrum actually corroborated. What a caller sets when it is going to
   * tune something to the answer rather than print it.
   */
  measuredPitchOnly?: boolean;
  /** Inclusive 0..1 bounds. An asset with no measured brightness fails both. */
  maximumBrightness?: number;
  minimumBrightness?: number;
  /** Inclusive bounds on the sounding span, not on the file length. */
  minimumActiveSeconds?: number;
  maximumActiveSeconds?: number;
  /** For §12: keeps hard attacks out of a pool meant to sit underneath. */
  maximumTransientStrength?: number;
  loopableOnly?: boolean;
  /** Only assets short enough to hold decoded in memory (§23). */
  preloadableOnly?: boolean;
  approvedOnly?: boolean;
  /** Ids the caller has already used and does not want offered again. */
  excludeIds?: readonly string[];
  /** Keeps the best `limit` matches. Omit for the whole pool. */
  limit?: number;
}

/** One result, with why it ranked where it did. */
export interface AssetMatch {
  readonly id: string;
  /** Number of `preferredTags` this asset carries. Zero is a full match, not a miss. */
  readonly score: number;
  /** Which ones, so a screen can say why this asset was chosen. */
  readonly matchedPreferredTags: readonly OrganicCharacterTag[];
}

// Flags that a query filters on, packed into one byte per asset so a scan reads
// one array rather than four booleans off four nested objects. `streaming` is
// not among them: the pipeline defines it as the exact complement of `preload`,
// so a filter for it would be a second name for the same question.
const APPROVED = 1;
const LOOPABLE = 2;
const PRELOAD = 4;
const MEASURED_PITCH = 8;

const NO_TAGS: readonly OrganicCharacterTag[] = [];
const EMPTY: readonly number[] = [];

export class OrganicAssetRegistry {
  private readonly records: readonly OrganicManifestAsset[];
  private readonly indexById = new Map<string, number>();

  // Posting lists. Every one is ascending, and because the records are sorted
  // by asset id before they are indexed, ascending position is also ascending
  // id — which is what makes every result order deterministic without a sort
  // key of its own (§56).
  private readonly byInstrument = new Map<OrganicInstrument, number[]>();
  private readonly byDurationClass = new Map<OrganicDurationClass, number[]>();
  private readonly byTag = new Map<OrganicCharacterTag, number[]>();
  private readonly byRole = new Map<OrganicRole, number[]>();
  private readonly byPitchClass = new Map<OrganicPitchClass, number[]>();
  private readonly approvedList: number[] = [];
  private readonly loopableList: number[] = [];
  private readonly everything: number[] = [];

  // Numeric filters, kept out of the record graph so a scan touches one flat
  // array instead of chasing four object references per asset. A null
  // measurement is stored as NaN, which fails every comparison — an asset whose
  // brightness was never measured is not quietly counted as dark (§14).
  private readonly activeSeconds: Float64Array;
  private readonly brightness: Float64Array;
  private readonly transient: Float64Array;
  private readonly flags: Uint8Array;

  /** Built per asset on first request. Loading the manifest costs one pass, not 369 objects. */
  private readonly views = new Map<number, OrganicAsset>();
  private cachedIds: readonly string[] | null = null;

  readonly schemaVersion: number;
  readonly analysisVersion: string;
  readonly libraryVersion: string;

  constructor(manifest: OrganicAudioManifest) {
    if (manifest.schemaVersion !== ORGANIC_SCHEMA_VERSION) {
      // Refused rather than read. A manifest at another schema version may have
      // moved a field this code reads, and reading it anyway produces
      // `undefined` somewhere far from here, at playback time, in a query that
      // used to work (§33).
      throw new Error(
        `Organic manifest is schema version ${manifest.schemaVersion}; this build reads ` +
          `version ${ORGANIC_SCHEMA_VERSION}. Re-run tools/audio_pipeline/index_audio.py ` +
          'so the manifest and the generated types come from the same schema.',
      );
    }

    this.schemaVersion = manifest.schemaVersion;
    this.analysisVersion = manifest.analysisVersion;
    this.libraryVersion = manifest.organicLibraryVersion;

    // Sorted here rather than trusted: the pipeline writes them sorted, but the
    // determinism of every pool this registry returns rests on the order, and
    // one sort at startup is a cheap way to stop depending on someone else's
    // promise. Duplicate ids are preprocessing's business (§26) and are checked
    // in CI; re-checking them here would be the duplication §42 warns about.
    const records = [...manifest.assets].sort((a, b) => (a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0));
    this.records = records;

    const count = records.length;
    this.activeSeconds = new Float64Array(count);
    this.brightness = new Float64Array(count);
    this.transient = new Float64Array(count);
    this.flags = new Uint8Array(count);

    for (let index = 0; index < count; index++) {
      const record = records[index];
      const { classification, spectral, runtime, review } = record;

      this.indexById.set(record.assetId, index);
      this.everything.push(index);

      push(this.byInstrument, classification.instrument, index);
      push(this.byDurationClass, classification.durationClass, index);
      for (const tag of classification.characterTags) push(this.byTag, tag, index);
      for (const role of classification.recommendedRoles) push(this.byRole, role, index);
      if (spectral.pitchClass !== null) push(this.byPitchClass, spectral.pitchClass, index);

      this.activeSeconds[index] = activeSecondsOf(record);
      this.brightness[index] = spectral.brightness ?? Number.NaN;
      this.transient[index] = spectral.transientStrength ?? Number.NaN;

      let flags = 0;
      if (review.approved) {
        flags |= APPROVED;
        this.approvedList.push(index);
      }
      if (runtime.loopable) {
        flags |= LOOPABLE;
        this.loopableList.push(index);
      }
      if (runtime.preloadRecommended) flags |= PRELOAD;
      if (spectral.noteSource === 'measured') flags |= MEASURED_PITCH;
      this.flags[index] = flags;
    }
  }

  /** How many assets the manifest carries. */
  get size(): number {
    return this.records.length;
  }

  /** How many a curator has cleared to ship. Zero is the honest answer before anyone has. */
  get approvedCount(): number {
    return this.approvedList.length;
  }

  /** Every id, in the order every query returns them. */
  get ids(): readonly string[] {
    if (this.cachedIds === null) this.cachedIds = this.records.map((record) => record.assetId);
    return this.cachedIds;
  }

  has(id: string): boolean {
    return this.indexById.has(id);
  }

  /** The engine's view of one asset, or undefined for an id this library has never held. */
  asset(id: string): OrganicAsset | undefined {
    const index = this.indexById.get(id);
    return index === undefined ? undefined : this.view(index);
  }

  /** Views for a list of ids, skipping any that are not here. */
  assets(ids: readonly string[]): OrganicAsset[] {
    const out: OrganicAsset[] = [];
    for (const id of ids) {
      const asset = this.asset(id);
      if (asset !== undefined) out.push(asset);
    }
    return out;
  }

  /**
   * The stored record, storage shape and all.
   *
   * The escape hatch for a tool that genuinely needs a path, a hash or a byte
   * count — a preloader, a curation screen, an integrity check. Deliberately
   * separate from `asset`, so reaching for the source tree is a visible choice
   * in the diff rather than a field that was always to hand (§44).
   */
  record(id: string): OrganicManifestAsset | undefined {
    const index = this.indexById.get(id);
    return index === undefined ? undefined : this.records[index];
  }

  /** Matching ids, best first. Empty when nothing matches. */
  query(query: AssetQuery = {}): string[] {
    return this.rank(query).map((match) => match.id);
  }

  /** How many assets match, without building the result list. */
  count(query: AssetQuery = {}): number {
    let total = 0;
    for (const index of this.candidates(query)) {
      if (this.matches(index, query)) total++;
    }
    return total;
  }

  /**
   * Matching assets with their scores (§43).
   *
   * `preferredTags` decide the order and nothing else: a match carrying none of
   * them still appears, at the bottom. Ties are broken by asset id, so the same
   * query over the same manifest returns the same list in the same order on
   * every platform and every run — which is what lets a seeded scheduler
   * reproduce a session (§56).
   */
  rank(query: AssetQuery = {}): AssetMatch[] {
    const preferred = query.preferredTags ?? NO_TAGS;
    const matches: AssetMatch[] = [];

    for (const index of this.candidates(query)) {
      if (!this.matches(index, query)) continue;
      const record = this.records[index];

      let matchedPreferredTags: readonly OrganicCharacterTag[] = NO_TAGS;
      if (preferred.length > 0) {
        const found: OrganicCharacterTag[] = [];
        for (const tag of preferred) {
          if (record.classification.characterTags.includes(tag)) found.push(tag);
        }
        matchedPreferredTags = found;
      }

      matches.push({ id: record.assetId, score: matchedPreferredTags.length, matchedPreferredTags });
    }

    matches.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return query.limit === undefined ? matches : matches.slice(0, Math.max(0, query.limit));
  }

  /**
   * The asset closest to a wanted length, within an optional pool.
   *
   * What a scheduler asks when it has a gap to fill: *something about forty
   * seconds long*. Measured against `activeSeconds` rather than file length,
   * because the gap is filled by the sound and not by the silence after it.
   * Ties go to the lower asset id, so the answer is stable.
   */
  nearestByActiveSeconds(seconds: number, query: AssetQuery = {}): string | undefined {
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const index of this.candidates(query)) {
      if (!this.matches(index, query)) continue;
      const distance = Math.abs(this.activeSeconds[index] - seconds);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return best === -1 ? undefined : this.records[best].assetId;
  }

  /** Instruments actually present, in schema order, with their counts. */
  instrumentCounts(): ReadonlyMap<OrganicInstrument, number> {
    return tally(ORGANIC_INSTRUMENTS, this.byInstrument);
  }

  durationClassCounts(): ReadonlyMap<OrganicDurationClass, number> {
    return tally(ORGANIC_DURATION_CLASSES, this.byDurationClass);
  }

  characterTagCounts(): ReadonlyMap<OrganicCharacterTag, number> {
    return tally(ORGANIC_CHARACTER_TAGS, this.byTag);
  }

  roleCounts(): ReadonlyMap<OrganicRole, number> {
    return tally(ORGANIC_ROLES, this.byRole);
  }

  pitchClassCounts(): ReadonlyMap<OrganicPitchClass, number> {
    return tally(ORGANIC_PITCH_CLASSES, this.byPitchClass);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private view(index: number): OrganicAsset {
    const cached = this.views.get(index);
    if (cached !== undefined) return cached;
    const built = toAsset(this.records[index], this.activeSeconds[index]);
    this.views.set(index, built);
    return built;
  }

  /**
   * The smallest set of records that could possibly match.
   *
   * Each equality filter names a posting list; the shortest of them bounds the
   * work, and the rest are re-checked in `matches` on the way past. Asking for
   * `deep` singing bowls scans the eleven `deep` assets rather than the 68
   * bowls, and a query with no equality filter at all falls back to the whole
   * library — which is the one case where scanning 369 records is the correct
   * amount of work rather than a failure to index (§50).
   */
  private candidates(query: AssetQuery): readonly number[] {
    let smallest: readonly number[] | null = null;
    const consider = (list: readonly number[] | null): void => {
      if (list !== null && (smallest === null || list.length < smallest.length)) smallest = list;
    };

    if (query.instrument !== undefined) {
      consider(union(this.byInstrument, asArray(query.instrument)));
    }
    if (query.durationClasses !== undefined && query.durationClasses.length > 0) {
      consider(union(this.byDurationClass, query.durationClasses));
    }
    if (query.roles !== undefined && query.roles.length > 0) {
      consider(union(this.byRole, query.roles));
    }
    if (query.tonalCenter !== undefined) {
      consider(this.byPitchClass.get(query.tonalCenter) ?? EMPTY);
    }
    if (query.requiredTags !== undefined) {
      // Each required tag bounds the answer on its own, so the rarest one wins.
      for (const tag of query.requiredTags) consider(this.byTag.get(tag) ?? EMPTY);
    }
    if (query.approvedOnly) consider(this.approvedList);
    if (query.loopableOnly) consider(this.loopableList);

    return smallest ?? this.everything;
  }

  private matches(index: number, query: AssetQuery): boolean {
    const record = this.records[index];
    const { classification, spectral } = record;

    if (query.instrument !== undefined && !asArray(query.instrument).includes(classification.instrument)) {
      return false;
    }
    if (
      query.durationClasses !== undefined &&
      query.durationClasses.length > 0 &&
      !query.durationClasses.includes(classification.durationClass)
    ) {
      return false;
    }
    if (query.roles !== undefined && query.roles.length > 0) {
      if (!query.roles.some((role) => classification.recommendedRoles.includes(role))) return false;
    }
    if (query.requiredTags !== undefined) {
      for (const tag of query.requiredTags) {
        if (!classification.characterTags.includes(tag)) return false;
      }
    }

    const flags = this.flags[index];
    if (query.approvedOnly && (flags & APPROVED) === 0) return false;
    if (query.loopableOnly && (flags & LOOPABLE) === 0) return false;
    if (query.preloadableOnly && (flags & PRELOAD) === 0) return false;
    if (query.measuredPitchOnly && (flags & MEASURED_PITCH) === 0) return false;

    if (query.tonalCenter !== undefined && spectral.pitchClass !== query.tonalCenter) return false;

    // NaN stands for an unmeasured value here, and every comparison below is
    // false for NaN. That is the intended answer: an asset whose brightness was
    // never established does not belong in a pool defined by brightness.
    if (query.maximumBrightness !== undefined && !(this.brightness[index] <= query.maximumBrightness)) return false;
    if (query.minimumBrightness !== undefined && !(this.brightness[index] >= query.minimumBrightness)) return false;
    if (
      query.maximumTransientStrength !== undefined &&
      !(this.transient[index] <= query.maximumTransientStrength)
    ) {
      return false;
    }

    const active = this.activeSeconds[index];
    if (query.minimumActiveSeconds !== undefined && active < query.minimumActiveSeconds) return false;
    if (query.maximumActiveSeconds !== undefined && active > query.maximumActiveSeconds) return false;

    if (query.excludeIds !== undefined && query.excludeIds.includes(record.assetId)) return false;

    return true;
  }
}

function push<K>(index: Map<K, number[]>, key: K, value: number): void {
  const list = index.get(key);
  if (list === undefined) index.set(key, [value]);
  else list.push(value);
}

function asArray<T>(value: T | readonly T[]): readonly T[] {
  return Array.isArray(value) ? (value as readonly T[]) : ([value] as readonly T[]);
}

/**
 * The union of several posting lists, still ascending.
 *
 * A merge rather than a concatenation and sort, because the inputs are already
 * ordered and the order is what every result depends on.
 */
function union<K>(index: Map<K, number[]>, keys: readonly K[]): readonly number[] {
  if (keys.length === 1) return index.get(keys[0]) ?? EMPTY;
  const seen = new Set<number>();
  for (const key of keys) {
    const list = index.get(key);
    if (list === undefined) continue;
    for (const value of list) seen.add(value);
  }
  return [...seen].sort((a, b) => a - b);
}

function tally<T extends string>(order: readonly T[], index: Map<T, number[]>): ReadonlyMap<T, number> {
  const out = new Map<T, number>();
  for (const value of order) {
    const list = index.get(value);
    if (list !== undefined && list.length > 0) out.set(value, list.length);
  }
  return out;
}

/**
 * How long the asset sounds for.
 *
 * Arithmetic over two numbers preprocessing already published, not a second
 * opinion about where the sound is: `recommendedStartOffset` and
 * `recommendedEndOffset` were measured against a silence floor with a hold, so
 * a bowl's beating partials are not mistaken for the end of it (§13). Null on
 * either offset means there was nothing worth trimming at that end, so the file
 * boundary is the answer.
 */
function activeSecondsOf(record: OrganicManifestAsset): number {
  const start = record.timing.recommendedStartOffset ?? 0;
  const end = record.timing.recommendedEndOffset ?? record.audio.durationSeconds;
  return Math.max(0, end - start);
}

function toAsset(record: OrganicManifestAsset, activeSeconds: number): OrganicAsset {
  const { audio, levels, timing, spectral, classification, runtime, review } = record;
  return {
    id: record.assetId,
    label: record.label,
    instrument: classification.instrument,
    durationClass: classification.durationClass,
    durationSeconds: audio.durationSeconds,
    startSeconds: timing.recommendedStartOffset ?? 0,
    endSeconds: timing.recommendedEndOffset ?? audio.durationSeconds,
    activeSeconds,
    trailingSilenceSeconds: timing.trailingSilenceSeconds ?? 0,
    decaySeconds: spectral.decaySeconds,
    transientStrength: spectral.transientStrength,
    brightness: spectral.brightness,
    gainCompensationDb: levels.recommendedGainDb,
    integratedLufs: levels.integratedLufs,
    roles: classification.recommendedRoles,
    characterTags: classification.characterTags,
    tonality: spectral.tonality,
    note: spectral.note,
    pitchClass: spectral.pitchClass,
    noteSource: spectral.noteSource,
    maxVoices: runtime.maxRecommendedVoices,
    loopable: runtime.loopable,
    preload: runtime.preloadRecommended,
    streaming: runtime.streamingRecommended,
    approved: review.approved,
    manualOverride: review.manualOverride,
  };
}
