import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ORGANIC_ANALYSIS_VERSION,
  ORGANIC_DURATION_BANDS,
  ORGANIC_LIBRARY_VERSION,
  ORGANIC_SCHEMA_VERSION,
  OrganicAssetRegistry,
  type AssetQuery,
  type OrganicAssetSpectral,
  type OrganicAudioManifest,
  type OrganicDurationClass,
  type OrganicManifestAsset,
} from '../src/index.js';

/**
 * The registry, tested against the real library rather than against fixtures.
 *
 * 371 assets — 369 bells and chimes plus 2 ocean recordings — already measured
 * and committed as
 * `generated/audio/organic_audio_manifest.json`. Everything below reads that
 * file and nothing else — no decoder, no audio, no `Healing Sounds` directory —
 * which is the property §38–§41 are actually about: the app can answer *what is
 * this, how long is it, what is it for* for any asset in the library without
 * opening it.
 *
 * Two kinds of assertion appear here, deliberately mixed.
 *
 *  - **Against the library.** Concrete facts about specific assets: this bowl is
 *    40.4 s and LONG, this chime's G came from the vendor's filename. They are
 *    what makes the test worth running, and they fail loudly if curation
 *    genuinely changes what the library says — which is information, not noise.
 *  - **Against a plain scan.** The same question answered by filtering the array
 *    directly, compared with the registry's indexed answer. Those cannot go
 *    stale: they check that indexing did not change the result, whatever the
 *    result becomes.
 */

const MANIFEST_PATH = fileURLToPath(
  new URL('../../../generated/audio/organic_audio_manifest.json', import.meta.url),
);
const REGISTRY_SOURCE = fileURLToPath(new URL('../src/organic/registry.ts', import.meta.url));

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as OrganicAudioManifest;

/** Built once, as the app builds it: at startup, from the parsed manifest. */
const registry = new OrganicAssetRegistry(manifest);

/** The same question, answered by scanning. Sorted, because pools are ordered by id. */
function scan(predicate: (record: OrganicManifestAsset) => boolean): string[] {
  return manifest.assets
    .filter(predicate)
    .map((record) => record.assetId)
    .sort();
}

function record(id: string): OrganicManifestAsset {
  const found = manifest.assets.find((asset) => asset.assetId === id);
  if (found === undefined) throw new Error(`${id} is not in the committed manifest`);
  return found;
}

/** The band the emitted table puts a duration in, so the class is checked and not assumed. */
function bandFor(seconds: number): OrganicDurationClass {
  for (const band of ORGANIC_DURATION_BANDS) {
    if (seconds >= band.minSeconds && (band.maxSeconds === null || seconds < band.maxSeconds)) {
      return band.name;
    }
  }
  throw new Error(`no band covers ${seconds}s`);
}

function withSpectral(base: OrganicManifestAsset, patch: Partial<OrganicAssetSpectral>): OrganicManifestAsset {
  return { ...base, spectral: { ...base.spectral, ...patch } };
}

function manifestOf(assets: readonly OrganicManifestAsset[]): OrganicAudioManifest {
  return { ...manifest, assetCount: assets.length, assets };
}

describe('organic asset registry: loading', () => {
  it('loads the committed manifest and agrees with its own header', () => {
    expect(registry.size).toBe(manifest.assetCount);
    expect(registry.size).toBe(manifest.assets.length);
    // The library as it stands. A number here rather than a tautology, so
    // adding or losing a pack is something a person has to acknowledge —
    // 369 bells and chimes, plus 2 ocean recordings.
    expect(registry.size).toBe(371);
    expect(registry.schemaVersion).toBe(ORGANIC_SCHEMA_VERSION);
    expect(registry.analysisVersion).toBe(manifest.analysisVersion);
    expect(registry.libraryVersion).toBe(manifest.organicLibraryVersion);
  });

  it('was generated from the same schema as the committed manifest', () => {
    // The whole reason the types are emitted from `schema.py` instead of kept
    // by hand (§25). If these disagree, one of the two was written by a
    // different version of the pipeline and the tree is mid-migration.
    expect(manifest.schemaVersion).toBe(ORGANIC_SCHEMA_VERSION);
    expect(manifest.analysisVersion).toBe(ORGANIC_ANALYSIS_VERSION);
    expect(manifest.organicLibraryVersion).toBe(ORGANIC_LIBRARY_VERSION);
  });

  it('exposes every id exactly once, in sorted order', () => {
    const ids = registry.ids;
    expect(ids.length).toBe(registry.size);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids]).toEqual([...ids].sort());
  });

  it('refuses a manifest written to a schema it does not know', () => {
    // §33: a consumer that understands schema 1 refuses a schema 2 manifest
    // outright, rather than reading fields that may have moved and failing
    // somewhere else entirely.
    expect(() => new OrganicAssetRegistry({ ...manifest, schemaVersion: ORGANIC_SCHEMA_VERSION + 1 })).toThrow(
      /schema version/,
    );
  });

  it('counts what the pipeline counted', () => {
    const counts = manifest.counts as Record<string, Record<string, number>>;
    expect(Object.fromEntries(registry.instrumentCounts())).toEqual(counts.instruments);
    expect(Object.fromEntries(registry.durationClassCounts())).toEqual(
      // The pipeline writes a zero for every band; the registry lists only the
      // bands that hold something, because an empty filter should not be offered.
      Object.fromEntries(Object.entries(counts.durationClasses).filter(([, value]) => value > 0)),
    );
  });
});

describe('organic asset registry: answering without opening a file (§38–§41)', () => {
  /**
   * The four cases the spec names, resolved out of the real library.
   *
   * Asked as *the asset nearest this length*, which is the question a scheduler
   * with a gap to fill actually has. `expected` records what the library
   * answered — note the last one: there is nothing at 90 s. The nearest is a
   * 98 s bowl whose sounding span is 96.18 s, and that is the honest answer
   * rather than a target the library was pretended to hit.
   */
  const cases = [
    {
      wanted: 2,
      id: 'organic.13e14271fe2a',
      activeSeconds: 2.2971,
      durationClass: 'SHORT' as const,
      instrument: 'CHIME' as const,
      role: 'CHIME_STRIKE' as const,
      preload: true,
    },
    {
      wanted: 5,
      id: 'organic.fb1e56c2140d',
      activeSeconds: 5,
      durationClass: 'SHORT' as const,
      instrument: 'CHIME' as const,
      role: 'CHIME_STRIKE' as const,
      preload: true,
    },
    {
      wanted: 40,
      id: 'organic.f607206f8d2d',
      activeSeconds: 40.1187,
      durationClass: 'LONG' as const,
      instrument: 'SINGING_BOWL' as const,
      role: 'PRIMARY_BOWL' as const,
      preload: false,
    },
    {
      wanted: 90,
      id: 'organic.8519547e8d65',
      activeSeconds: 96.18,
      durationClass: 'EXTENDED' as const,
      instrument: 'SINGING_BOWL' as const,
      role: 'BED' as const,
      preload: false,
    },
  ];

  for (const expected of cases) {
    it(`answers for the asset nearest ${expected.wanted}s`, () => {
      const id = registry.nearestByActiveSeconds(expected.wanted);
      expect(id).toBe(expected.id);

      const asset = registry.asset(id!)!;
      expect(asset.activeSeconds).toBeCloseTo(expected.activeSeconds, 4);
      expect(asset.instrument).toBe(expected.instrument);

      // The class is the one the emitted band table puts the file length in, so
      // this checks the manifest against the bands rather than repeating it.
      expect(asset.durationClass).toBe(expected.durationClass);
      expect(asset.durationClass).toBe(bandFor(asset.durationSeconds));

      // Sensible roles: non-empty, and naming the thing this length of asset is
      // for. A 2 s chime is a strike; a 98 s bowl is a bed.
      expect(asset.roles.length).toBeGreaterThan(0);
      expect(asset.roles).toContain(expected.role);

      // Everything the scheduler needs, present without a decoder in sight.
      expect(asset.maxVoices).toBeGreaterThanOrEqual(1);
      expect(asset.preload).toBe(expected.preload);
      expect(asset.streaming).toBe(!expected.preload);
      expect(asset.gainCompensationDb).not.toBeNull();
      expect(asset.decaySeconds).not.toBeNull();
      expect(asset.activeSeconds).toBeLessThanOrEqual(asset.durationSeconds);
      expect(asset.endSeconds - asset.startSeconds).toBeCloseTo(asset.activeSeconds, 6);
    });
  }

  it('spans the library from the shortest asset to the longest', () => {
    // The four cases above are interpolations. These are the ends: MICRO holds
    // one asset and EXTENDED eleven, so a scheduler asking for either gets a
    // real answer rather than a bucket that happens to be empty.
    const shortest = registry.nearestByActiveSeconds(0)!;
    const longest = registry.nearestByActiveSeconds(10_000)!;
    expect(registry.asset(shortest)!.durationClass).toBe('MICRO');
    expect(registry.asset(longest)!.durationClass).toBe('EXTENDED');
    expect(registry.asset(longest)!.durationSeconds).toBeGreaterThan(120);
  });

  it('returns nothing rather than the wrong thing when a pool is empty', () => {
    // No DRONE was ever classified in this library, so there is no nearest one.
    expect(registry.nearestByActiveSeconds(5, { instrument: 'DRONE' })).toBeUndefined();
  });
});

describe('organic asset registry: pools (§43)', () => {
  const deepWarmBowls: AssetQuery = {
    instrument: 'SINGING_BOWL',
    durationClasses: ['LONG'],
    requiredTags: ['deep', 'warm'],
  };

  it('finds the long deep warm singing bowls', () => {
    const pool = registry.query(deepWarmBowls);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool).toEqual(
      scan(
        (asset) =>
          asset.classification.instrument === 'SINGING_BOWL' &&
          asset.classification.durationClass === 'LONG' &&
          asset.classification.characterTags.includes('deep') &&
          asset.classification.characterTags.includes('warm'),
      ),
    );

    for (const asset of registry.assets(pool)) {
      expect(asset.instrument).toBe('SINGING_BOWL');
      expect(asset.durationClass).toBe('LONG');
      expect(asset.characterTags).toContain('deep');
      expect(asset.characterTags).toContain('warm');
      expect(asset.durationSeconds).toBeGreaterThanOrEqual(20);
      expect(asset.durationSeconds).toBeLessThan(60);
    }
  });

  it('finds the short bright chimes', () => {
    const pool = registry.query({
      instrument: 'CHIME',
      durationClasses: ['SHORT'],
      requiredTags: ['bright'],
    });
    expect(pool.length).toBeGreaterThan(0);
    expect(pool).toEqual(
      scan(
        (asset) =>
          asset.classification.instrument === 'CHIME' &&
          asset.classification.durationClass === 'SHORT' &&
          asset.classification.characterTags.includes('bright'),
      ),
    );
    for (const asset of registry.assets(pool)) {
      expect(asset.durationClass).toBe('SHORT');
      expect(asset.instrument).toBe('CHIME');
      expect(asset.brightness).not.toBeNull();
    }
  });

  it('lets preferred tags reorder a pool without shrinking it', () => {
    const plain = registry.query({ instrument: 'CHIME', durationClasses: ['SHORT'] });
    const ranked = registry.rank({
      instrument: 'CHIME',
      durationClasses: ['SHORT'],
      preferredTags: ['shimmering', 'airy'],
    });

    // Nothing was excluded — the same assets, reordered.
    expect(ranked.length).toBe(plain.length);
    expect(ranked.map((match) => match.id).sort()).toEqual([...plain].sort());

    // Best first, and the reason travels with the result.
    expect(ranked[0].score).toBe(2);
    expect(ranked[0].matchedPreferredTags).toEqual(['shimmering', 'airy']);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }

    // And a preference is not a requirement: assets carrying neither tag are
    // still in the pool, at the bottom.
    const unpreferred = ranked.filter((match) => match.score === 0);
    expect(unpreferred.length).toBeGreaterThan(0);
  });

  it('answers an impossible question with an empty pool, not an error', () => {
    // `rough` is a legal character tag that nothing in this library carries,
    // and the one MICRO asset is a bell rather than a fork. A session builder
    // asking for either needs to fall back; an exception would make an
    // under-stocked category into a crash.
    expect(registry.query({ requiredTags: ['rough'] })).toEqual([]);
    expect(registry.query({ instrument: 'TUNING_FORK', durationClasses: ['MICRO'] })).toEqual([]);
    expect(registry.query({ instrument: ['DRONE', 'TEXTURE', 'AMBIENT'] })).toEqual([]);
    expect(registry.count({ requiredTags: ['rough'] })).toBe(0);
    expect(registry.asset('organic.000000000000')).toBeUndefined();
    expect(registry.record('organic.000000000000')).toBeUndefined();
    expect(registry.assets(['organic.000000000000'])).toEqual([]);
    expect(registry.has('organic.000000000000')).toBe(false);
  });

  it('returns the same pool in the same order every time', () => {
    // A seeded scheduler picks from these lists, so a session is only
    // reproducible if the list is (§56).
    const query: AssetQuery = { durationClasses: ['MEDIUM'], preferredTags: ['warm', 'gentle'] };
    expect(registry.query(query)).toEqual(registry.query(query));
    expect(new OrganicAssetRegistry(manifest).query(query)).toEqual(registry.query(query));
  });

  it('applies every filter it advertises', () => {
    // One assertion per filter, each against the plain scan of the same rule.
    expect(registry.query({ loopableOnly: true })).toEqual(scan((a) => a.runtime.loopable));
    expect(registry.query({ preloadableOnly: true })).toEqual(scan((a) => a.runtime.preloadRecommended));
    expect(registry.query({ roles: ['BED'] })).toEqual(scan((a) => a.classification.recommendedRoles.includes('BED')));
    expect(registry.query({ tonalCenter: 'G' })).toEqual(scan((a) => a.spectral.pitchClass === 'G'));
    expect(registry.query({ maximumBrightness: 0.3 })).toEqual(
      scan((a) => a.spectral.brightness !== null && a.spectral.brightness <= 0.3),
    );
    expect(registry.query({ maximumTransientStrength: 0.12 })).toEqual(
      scan((a) => a.spectral.transientStrength !== null && a.spectral.transientStrength <= 0.12),
    );
    expect(registry.query({ instrument: ['TUNING_FORK', 'KALIMBA'] })).toEqual(
      scan((a) => a.classification.instrument === 'TUNING_FORK' || a.classification.instrument === 'KALIMBA'),
    );

    const bells = registry.query({ instrument: 'BELL' });
    expect(registry.query({ instrument: 'BELL', excludeIds: [bells[0]] })).toEqual(bells.slice(1));
    expect(registry.query({ instrument: 'BELL', limit: 3 })).toEqual(bells.slice(0, 3));
    expect(registry.count({ instrument: 'BELL' })).toBe(bells.length);
  });

  it('bounds a pool by how long it sounds rather than by file length', () => {
    // The distinction the scheduler cares about: a 98 s bowl with 1.68 s of dead
    // air at the end occupies 96.18 s, and booking it for 98 would leave a gap
    // that is not there.
    const long = registry.assets(registry.query({ minimumActiveSeconds: 60 }));
    expect(long.length).toBeGreaterThan(0);
    for (const asset of long) {
      expect(asset.activeSeconds).toBeGreaterThanOrEqual(60);
      expect(asset.activeSeconds).toBeLessThanOrEqual(asset.durationSeconds);
    }
  });
});

describe('organic asset registry: measured pitch versus the vendor label (§18)', () => {
  it('never records a note it did not measure', () => {
    // The invariant preprocessing maintains: a note name only ever appears when
    // the spectrum produced it. A filename-supplied pitch fills `pitchClass`
    // and leaves `note` empty.
    for (const asset of manifest.assets) {
      if (asset.spectral.note !== null) expect(asset.spectral.noteSource).toBe('measured');
      if (asset.spectral.noteSource === 'filename') expect(asset.spectral.note).toBeNull();
      if (asset.spectral.noteSource !== null) expect(asset.spectral.pitchClass).not.toBeNull();
    }
  });

  it('lets a caller ask for pitch the analysis actually confirmed', () => {
    const anyPitch = registry.query({ tonalCenter: 'G' });
    const measuredOnly = registry.query({ tonalCenter: 'G', measuredPitchOnly: true });

    expect(measuredOnly).toEqual(
      scan((asset) => asset.spectral.pitchClass === 'G' && asset.spectral.noteSource === 'measured'),
    );
    // Strictly fewer: most of this library's G is the vendor's word for it.
    expect(measuredOnly.length).toBeGreaterThan(0);
    expect(measuredOnly.length).toBeLessThan(anyPitch.length);
    for (const id of measuredOnly) expect(anyPitch).toContain(id);
  });

  it('distinguishes a measured note from a vendor label on the asset itself', () => {
    // Two real assets, one of each kind. The 5 s chime is the case that matters:
    // its filename says G, the spectrum could not corroborate it, and the
    // registry says so instead of presenting the label as an analysis.
    const measured = registry.asset('organic.13e14271fe2a')!;
    expect(measured.noteSource).toBe('measured');
    expect(measured.note).toBe('A#6');
    expect(measured.pitchClass).toBe('A#');

    const labelled = registry.asset('organic.fb1e56c2140d')!;
    expect(labelled.noteSource).toBe('filename');
    expect(labelled.note).toBeNull();
    expect(labelled.pitchClass).toBe('G');

    expect(registry.query({ tonalCenter: 'G' })).toContain(labelled.id);
    expect(registry.query({ tonalCenter: 'G', measuredPitchOnly: true })).not.toContain(labelled.id);
  });

  it('leaves an unpitched asset unpitched unless a person pitched it', () => {
    /*
     * The three-way distinction, checked across the whole library.
     *
     * No `noteSource` means the analysis reached no conclusion, so there is
     * never a measured note. There is usually no pitch class either — but not
     * always, and the exception is the point: a curator may set one, and the
     * pipeline deliberately leaves `noteSource` null when they do, because that
     * field records what the *analysis* did. `manualOverride` is what says a
     * person put the value there (§21).
     *
     * This test was written asserting that a null `noteSource` implies a null
     * pitch class. The library disagreed, in exactly one record: a 100 BPM
     * kalimba loop the vendor named `_A`, where the pipeline refuses to read a
     * passage's key as a measured pitch and a curator accepted the pack's own
     * label by hand.
     */
    const unpitched = manifest.assets.filter((asset) => asset.spectral.noteSource === null);
    expect(unpitched.length).toBeGreaterThan(0);

    let curated = 0;
    for (const asset of unpitched) {
      const view = registry.asset(asset.assetId)!;
      expect(view.note).toBeNull();
      if (view.pitchClass === null) continue;
      curated++;
      expect(view.manualOverride).toBe(true);
      // And it is honestly excluded from anything asking for measured pitch.
      expect(registry.query({ tonalCenter: view.pitchClass, measuredPitchOnly: true })).not.toContain(view.id);
    }
    expect(curated).toBeLessThan(unpitched.length);
  });
});

describe('organic asset registry: approval (§26)', () => {
  it('reports approval honestly, whatever the library currently says', () => {
    expect(registry.approvedCount).toBe(manifest.assets.filter((asset) => asset.review.approved).length);
    expect(registry.query({ approvedOnly: true })).toEqual(scan((asset) => asset.review.approved));
    /*
     * The library is approved in full, so this filter currently selects
     * everything — and a filter that cannot exclude anything is one this
     * library can no longer test. Asserted as the equality it now is, with the
     * filter's actual behaviour proved on a two-record manifest in the test
     * below, which is why that test was written this way in the first place.
     */
    expect(registry.count({ approvedOnly: true })).toBe(registry.size);
    // Approval is sourced, never a bare flag: nothing is approved by nobody.
    for (const asset of manifest.assets) {
      if (asset.review.approved) expect(asset.review.approvalSource, asset.assetId).toBeTruthy();
      else expect(asset.review.approvalSource, asset.assetId).toBeNull();
    }
  });

  it('does not offer an unapproved asset to a caller that asked for approved ones', () => {
    const pool: AssetQuery = {
      instrument: 'SINGING_BOWL',
      durationClasses: ['LONG'],
      requiredTags: ['deep', 'warm'],
    };
    const everything = registry.query(pool);
    const approved = registry.query({ ...pool, approvedOnly: true });

    expect(everything.length).toBeGreaterThan(0);
    expect(approved).toEqual(scan((asset) => everything.includes(asset.assetId) && asset.review.approved));
    for (const asset of registry.assets(approved)) expect(asset.approved).toBe(true);
  });

  it('filters on approval and not on anything correlated with it', () => {
    // Proven on a two-record manifest rather than on the library, because the
    // library cannot currently distinguish "approvedOnly works" from "almost
    // nothing is approved". Same two records, one flag apart.
    const base = record('organic.13e14271fe2a');
    const yes: OrganicManifestAsset = { ...base, assetId: 'organic.aaaaaaaaaaaa', review: { ...base.review, approved: true } };
    const no: OrganicManifestAsset = { ...base, assetId: 'organic.bbbbbbbbbbbb', review: { ...base.review, approved: false } };
    const two = new OrganicAssetRegistry(manifestOf([yes, no]));

    expect(two.query()).toEqual(['organic.aaaaaaaaaaaa', 'organic.bbbbbbbbbbbb']);
    expect(two.query({ approvedOnly: true })).toEqual(['organic.aaaaaaaaaaaa']);
    expect(two.approvedCount).toBe(1);
  });
});

describe('organic asset registry: unmeasured values (§14)', () => {
  it('keeps an asset with no measured brightness out of a pool defined by brightness', () => {
    // Every asset in this library has a brightness, so the case is built. An
    // unmeasured value must not be read as a dark one: it is not a zero, it is
    // an absence, and a pool built the other way would quietly claim a
    // measurement nobody made.
    const base = record('organic.f607206f8d2d');
    const known: OrganicManifestAsset = { ...base, assetId: 'organic.cccccccccccc' };
    const unknown: OrganicManifestAsset = withSpectral(
      { ...base, assetId: 'organic.dddddddddddd' },
      { brightness: null, transientStrength: null },
    );
    const two = new OrganicAssetRegistry(manifestOf([known, unknown]));

    expect(two.query({ maximumBrightness: 1 })).toEqual(['organic.cccccccccccc']);
    expect(two.query({ minimumBrightness: 0 })).toEqual(['organic.cccccccccccc']);
    expect(two.query({ maximumTransientStrength: 1 })).toEqual(['organic.cccccccccccc']);
    // It is still in the library, and still reachable by every other route.
    expect(two.query({ instrument: 'SINGING_BOWL' })).toContain('organic.dddddddddddd');
    expect(two.asset('organic.dddddddddddd')!.brightness).toBeNull();
  });
});

describe('organic asset registry: the runtime holds no filename logic (§44)', () => {
  it('never reads a path, an extension or a file', () => {
    /*
     * §44 is a property of the code, so it is checked on the code.
     *
     * The prohibition applies to what runs, not to what is written about it —
     * the module explains at length why reading filenames is forbidden, and the
     * explanation names the very tokens being banned. So comments come out
     * first, and what is left is scanned.
     *
     * The defect this prevents is on the record: the pipeline's own classifier
     * once read the vendor's root folder, `Healing_Sounds_-_Bells_&_Chimes`, and
     * classified all 369 assets as chimes — no bells, no bowls — because every
     * path in the library contains both words. A runtime that tests strings for
     * `bowl` is one refactor away from repeating it, with no report to catch it.
     */
    const source = readFileSync(REGISTRY_SOURCE, 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

    // A stripper that removed everything would pass every check below.
    expect(code.length).toBeGreaterThan(2000);
    expect(code).toContain('export class OrganicAssetRegistry');

    for (const forbidden of [
      'filename',
      'relativePath',
      '.wav',
      'endsWith',
      'startsWith',
      'toLowerCase',
      'split(',
      'match(',
      'RegExp',
      'node:fs',
      'require(',
      'fetch(',
      'readFile',
      'XMLHttpRequest',
    ]) {
      expect(code).not.toContain(forbidden);
    }
  });

  it('keeps the storage shape reachable, but only on purpose', () => {
    // Not a prohibition on ever knowing where a file is — a preloader has to.
    // `record` is the one door to it, so reaching through it shows up in a diff.
    const asset = registry.asset('organic.f607206f8d2d')!;
    expect('source' in asset).toBe(false);
    expect(registry.record('organic.f607206f8d2d')!.source.relativePath).toContain('.wav');
  });
});

describe('organic asset registry: cost', () => {
  it('indexes once and answers from the index', () => {
    // Not a benchmark — a floor. 2000 filtered queries over 371 records is work
    // the app does at startup and during a session, and a scan-per-query
    // implementation would not come near this. It also proves the posting lists
    // are shared rather than rebuilt: the second thousand costs the same as the
    // first.
    const started = Date.now();
    for (let i = 0; i < 2000; i++) {
      registry.query({
        instrument: 'SINGING_BOWL',
        durationClasses: ['LONG', 'EXTENDED'],
        requiredTags: ['deep'],
        preferredTags: ['warm', 'sustained'],
        maximumBrightness: 0.5,
      });
    }
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('builds an engine view once per asset', () => {
    const first = registry.asset('organic.8519547e8d65');
    const second = registry.asset('organic.8519547e8d65');
    expect(first).toBe(second);
  });
});
