import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { planSoundBath, resolvePool } from '../src/organic/scheduler.js';
import {
  ACOUSTIC_LAYER_NOTICE,
  SOUND_BATH_PRESET_IDS,
  buildSoundBathPresets,
  soundBathPreset,
} from '../src/organic/presets.js';
import {
  MINIMUM_EFFECTIVE_POOL_SIZE,
  MINIMUM_POOL_SIZE,
  effectivePoolSize,
  validateSoundBath,
  validateSoundBathApproval,
  validateSoundBathSet,
} from '../src/organic/validate.js';
import type { SchedulableAsset, SoundBathPreset } from '../src/organic/soundbath.js';

/**
 * The seventeen factory sound baths, against the library they will actually be
 * given.
 *
 * The same choice `soundbath.test.ts` made, for the same reason and with more
 * riding on it: a preset is a set of *queries*, so a fixture cannot tell you
 * whether one is any good. `{ instruments: ['SINGING_BOWL'], durationClasses:
 * ['MEDIUM'] }` passes every type check, reads like a bowl layer, and resolves
 * to two assets on the real library. Only the real manifest catches that, and
 * only the real manifest catches it *again* when a future sound pack changes
 * the counts underneath a preset nobody has touched.
 *
 * That second case is what most of this file is for. The presets are checked
 * against floors rather than against the numbers they happen to produce today,
 * so a library change that quietly guts a layer fails here rather than being
 * discovered by somebody listening to twenty-five minutes of two alternating
 * bowls.
 */

const manifest = JSON.parse(
  readFileSync(new URL('../../../generated/audio/organic_audio_manifest.json', import.meta.url), 'utf8'),
) as { assets: Array<Record<string, any>> };

const LIBRARY: SchedulableAsset[] = manifest.assets.map((asset) => ({
  assetId: asset.assetId,
  durationSeconds: asset.audio.durationSeconds,
  instrument: asset.classification.instrument,
  durationClass: asset.classification.durationClass,
  roles: asset.classification.recommendedRoles,
  tags: asset.classification.characterTags,
  brightness: asset.spectral.brightness,
  transientStrength: asset.spectral.transientStrength,
  recommendedGainDb: asset.levels.recommendedGainDb,
  pitchClass: asset.spectral.pitchClass,
  noteSource: asset.spectral.noteSource,
  maxRecommendedVoices: asset.runtime.maxRecommendedVoices,
  loopable: asset.runtime.loopable,
  approved: asset.review.approved,
}));

const byId = new Map(LIBRARY.map((asset) => [asset.assetId, asset]));

/** Twenty-five minutes, the length every count in this file is stated for. */
const SESSION_SEC = 25 * 60;

/**
 * Twelve seeds, not one.
 *
 * A generative preset has a distribution, not a value. One seed would pin these
 * tests to a single draw and would pass or fail for reasons that have nothing
 * to do with the preset — the point is that *every* session a preset produces
 * is a sensible one, so every assertion below is made across all twelve.
 */
const SEEDS = [1, 2, 3, 42, 555, 2024, 31337, 99999, 123456, 4242, 8675309, 7281921];

/**
 * Nothing in the library is curator-approved — one asset is, and it is the
 * worked example in the overrides file — so every plan here opts out of the
 * approval gate. Approval has its own test at the bottom, which is the point of
 * keeping the two checks apart.
 */
function plan(preset: SoundBathPreset, seed: number | string, maxVoices = 8) {
  return planSoundBath({
    preset,
    library: LIBRARY,
    durationSec: SESSION_SEC,
    seed,
    maxVoices,
    requireApproved: false,
  });
}

/** The most voices ringing at once among a set of events. */
function peakConcurrency(events: Array<{ atSec: number; durationSec: number }>): number {
  let peak = 0;
  for (const event of events) {
    const overlapping = events.filter(
      (other) => other.atSec <= event.atSec && other.atSec + other.durationSec > event.atSec,
    ).length;
    peak = Math.max(peak, overlapping);
  }
  return peak;
}

// ---------------------------------------------------------------------------
// The shelf
// ---------------------------------------------------------------------------

describe('the factory set', () => {
  it('ships exactly the seventeen declared, in the declared order', () => {
    const presets = buildSoundBathPresets();
    expect(presets.map((preset) => preset.id)).toEqual([...SOUND_BATH_PRESET_IDS]);
    expect(new Set(presets.map((preset) => preset.id)).size).toBe(presets.length);
    expect(new Set(presets.map((preset) => preset.name)).size).toBe(presets.length);
  });

  it('hands out a fresh object every time, so a caller cannot edit the shelf', () => {
    // A session record points at a preset id. If a caller could mutate the
    // shipped object, the record would keep pointing at something that no
    // longer describes what was played.
    const first = buildSoundBathPresets()[0];
    first.globals.density = 0.99;
    expect(buildSoundBathPresets()[0].globals.density).not.toBe(0.99);
    expect(soundBathPreset('soundbath.deep_calm')!.globals.density).not.toBe(0.99);
  });

  it('finds a preset by id and nothing by a wrong one', () => {
    expect(soundBathPreset('soundbath.gamma_light')!.name).toBe('Gamma Light');
    expect(soundBathPreset('soundbath.nope')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §88 — the presets against the validator
// ---------------------------------------------------------------------------

describe('validation against the real library', () => {
  it('produces no issue of any severity, warnings included', () => {
    /*
     * The validator reports a thin pool as a warning because `assetIds` exists
     * for a user hand-picking three bells (§35), and three bells somebody chose
     * is a choice. A factory preset with a thin pool is not a choice, it is a
     * preset that will alternate audibly, so here a warning is a failure.
     */
    const result = validateSoundBathSet(buildSoundBathPresets(), LIBRARY);
    expect(
      result.issues.map((issue) => `${issue.severity} ${issue.code} ${issue.field ?? ''}: ${issue.message}`),
    ).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('gives every layer a pool with room for the no-repeat window', () => {
    /*
     * The floor, and the reason for it: the scheduler penalises the six most
     * recently played ids on a layer, so a pool of six or fewer is one where
     * every candidate is always penalised and the layer rotates rather than
     * chooses (§16). This is the test that catches a future sound pack
     * silently gutting a preset — it asserts the floor, never today's counts.
     */
    for (const preset of buildSoundBathPresets()) {
      const report = validateSoundBath({ preset, library: LIBRARY });
      for (const layer of report.layers) {
        expect(layer.size, `${preset.id}/${layer.layerId} resolved ${layer.size} assets`).toBeGreaterThanOrEqual(
          MINIMUM_POOL_SIZE,
        );
        expect(
          layer.effectiveSize,
          `${preset.id}/${layer.layerId} resolves ${layer.size} assets but the globals leave ${layer.effectiveSize.toFixed(1)}`,
        ).toBeGreaterThanOrEqual(MINIMUM_EFFECTIVE_POOL_SIZE);
      }
    }
  });

  it('never plans a session with a layer that found nothing', () => {
    for (const preset of buildSoundBathPresets()) {
      expect(plan(preset, 7281921).emptyLayers, preset.id).toEqual([]);
    }
  });

  it('only ever plays assets the layer actually asked for', () => {
    for (const preset of buildSoundBathPresets()) {
      const pools = new Map(
        preset.layers.map((layer) => [
          layer.id,
          new Set(resolvePool(layer.pool, LIBRARY, false).map((asset) => asset.assetId)),
        ]),
      );
      for (const event of plan(preset, 4242).events) {
        expect(pools.get(event.layerId)!.has(event.assetId), `${preset.id}/${event.layerId}`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The floor has to be able to fail
// ---------------------------------------------------------------------------

describe('the pool floor catches a library that has been cut from under a preset', () => {
  /*
   * A guard nobody has ever seen fire is a guard nobody knows works. These two
   * reproduce the failure the test above exists to prevent, on the same presets
   * and the same code path, by shrinking the library rather than by inventing a
   * broken preset — which is exactly how it would arrive in real life: a sound
   * pack is replaced, the counts move, and no preset file changes at all.
   */

  /**
   * The same library with the bowls cut to five of each kind Pure Bowls asks
   * for, and nothing else changed. This is the shape the real failure takes: a
   * sound pack is replaced, the counts move, and no preset file is touched.
   */
  const fiveBowlsEach = (): SchedulableAsset[] => {
    const bowls = (bright: boolean) =>
      LIBRARY.filter(
        (asset) =>
          asset.instrument === 'SINGING_BOWL' &&
          asset.durationClass === 'LONG' &&
          asset.tags.includes('bright') === bright,
      ).slice(0, 5);
    return [
      ...LIBRARY.filter((asset) => asset.instrument !== 'SINGING_BOWL'),
      ...bowls(false),
      ...bowls(true),
    ];
  };

  it('warns, and still lets the preset run, when a pool drops below the floor', () => {
    const library = fiveBowlsEach();
    const preset = soundBathPreset('soundbath.pure_bowls')!;
    const result = validateSoundBath({ preset, library });

    const thin = result.issues.filter((issue) => issue.code === 'pool-thin');
    expect(thin).toHaveLength(preset.layers.length);
    expect(thin.every((issue) => issue.severity === 'warning')).toBe(true);
    expect(thin.every((issue) => issue.message.includes('no-repeat window'))).toBe(true);
    for (const layer of result.layers) {
      expect(layer.size, layer.layerId).toBe(5);
      expect(layer.effectiveSize, layer.layerId).toBeLessThan(MINIMUM_POOL_SIZE);
    }

    // `ok` is still true, because a thin pool plays. That is the whole danger
    // of it, and it is why the factory test above refuses warnings as well as
    // errors — this preset would ship, and alternate.
    expect(result.ok).toBe(true);
    expect(plan(preset, 1).events.length).toBeGreaterThan(0);
  });

  it('errors when a pool disappears entirely', () => {
    // Every bowl removed: a bowl-led preset now has layers that can never play.
    const withoutBowls = LIBRARY.filter((asset) => asset.instrument !== 'SINGING_BOWL');
    const result = validateSoundBath({ preset: soundBathPreset('soundbath.pure_bowls')!, library: withoutBowls });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('pool-empty');
    // And the scheduler agrees, which is the behaviour the error is describing.
    expect(
      planSoundBath({
        preset: soundBathPreset('soundbath.pure_bowls')!,
        library: withoutBowls,
        durationSec: SESSION_SEC,
        seed: 1,
        requireApproved: false,
      }).emptyLayers,
    ).toEqual(['body', 'answer']);
  });
});

// ---------------------------------------------------------------------------
// A twenty-five minute session
// ---------------------------------------------------------------------------

/**
 * The number of acoustic events each preset is designed to place in twenty-five
 * minutes, and what that works out to as seconds between events:
 *
 * ```
 *   Gamma Light        187    8 s      432 Meditation      44   35 s
 *   Morning Clarity    134   11 s      Deep Calm           38   40 s
 *   Silver Chimes      107   14 s      Earth Resonance     36   42 s
 *   Chime Garden       105   14 s      Deep Bowls          32   48 s
 *   Alpha Air           78   19 s      Tuning Fork Space   31   48 s
 *   528 Organic         72   21 s      Sleep Descent       29   52 s
 *   Float               60   25 s      Focus Minimal       27   55 s
 *   Theta Bath          47   32 s      Pure Bowls          26   57 s
 *                                      Inner Space         23   64 s
 * ```
 *
 * Each figure is the mean over two hundred seeds, which is what a preset is: a
 * distribution, not a value. Everything asserted below is derived from these
 * seventeen numbers, so there is one place to change when a preset changes.
 *
 * The spread that band has to allow is real. `Earth Resonance` runs from 21 to
 * 50 events across two hundred seeds — better than two to one — because a layer
 * re-samples its interval on every attempt and a run of long draws thins a
 * whole session. So the per-session band is wide on purpose, and its edges are
 * set by two limits that belong to the material rather than to taste:
 *
 *  - Below about one event every two and a half minutes a layer stops reading
 *    as a room and starts reading as isolated sounds with waiting in between.
 *  - Above about one every five seconds the strikes stop being separable and
 *    the layer becomes texture rather than events.
 *
 * A wide band catches a preset that has fallen out of its category and little
 * else, so the *mean* is asserted separately and tightly. Means are stable —
 * across twelve seeds none of these lands more than 9% from its design figure —
 * which makes a 20% envelope a real regression guard on a parameter edit that a
 * per-session bound would sleep through.
 */
const DESIGN_EVENTS: Record<string, number> = {
  'soundbath.deep_calm': 38,
  'soundbath.earth_resonance': 36,
  'soundbath.deep_bowls': 32,
  'soundbath.pure_bowls': 26,
  'soundbath.float': 60,
  'soundbath.inner_space': 23,
  'soundbath.sleep_descent': 29,
  'soundbath.theta_bath': 47,
  'soundbath.432_meditation': 44,
  'soundbath.528_organic': 72,
  'soundbath.alpha_air': 78,
  'soundbath.silver_chimes': 107,
  'soundbath.chime_garden': 105,
  'soundbath.tuning_fork_space': 31,
  'soundbath.morning_clarity': 134,
  'soundbath.focus_minimal': 27,
  'soundbath.gamma_light': 187,
};

/** Sparsest and busiest a twenty-five minute session may be, as event counts. */
const SPARSEST = SESSION_SEC / 150;
const BUSIEST = SESSION_SEC / 5;

/** Half the design figure to one and three quarter times it, inside those limits. */
function band(design: number): { min: number; max: number } {
  return {
    min: Math.max(SPARSEST, Math.round(design * 0.5)),
    max: Math.min(BUSIEST, Math.round(design * 1.75)),
  };
}

describe('a twenty-five minute session', () => {
  it('has a design figure for every shipped preset, and none outside the limits', () => {
    expect(Object.keys(DESIGN_EVENTS).sort()).toEqual([...SOUND_BATH_PRESET_IDS].sort());
    for (const [id, design] of Object.entries(DESIGN_EVENTS)) {
      expect(design, `${id} is sparser than one event every two and a half minutes`).toBeGreaterThanOrEqual(
        SPARSEST,
      );
      expect(design, `${id} is busier than one event every five seconds`).toBeLessThanOrEqual(BUSIEST);
    }
  });

  it('produces a sensible number of events on every seed', () => {
    for (const preset of buildSoundBathPresets()) {
      const { min, max } = band(DESIGN_EVENTS[preset.id]);
      for (const seed of SEEDS) {
        const count = plan(preset, seed).events.length;
        expect(count, `${preset.id} seed ${seed}: ${count} events, band ${min}-${max}`).toBeGreaterThanOrEqual(
          min,
        );
        expect(count, `${preset.id} seed ${seed}: ${count} events, band ${min}-${max}`).toBeLessThanOrEqual(max);
      }
    }
  });

  it('averages what it was designed to average', () => {
    // The tight half of the pair. A parameter edit that moves a preset 30% and
    // still lands inside the per-session band fails here.
    for (const preset of buildSoundBathPresets()) {
      const design = DESIGN_EVENTS[preset.id];
      const counts = SEEDS.map((seed) => plan(preset, seed).events.length);
      const mean = counts.reduce((sum, count) => sum + count, 0) / counts.length;
      expect(
        Math.abs(mean - design) / design,
        `${preset.id} averaged ${mean.toFixed(1)} against a design figure of ${design}`,
      ).toBeLessThan(0.2);
    }
  });

  it('leaves the opening to the core signal and never overruns the end', () => {
    // §77, §78, §79. The acoustic layer arrives after the core frequency has
    // been alone for a while, and no sound is started that cannot finish.
    for (const preset of buildSoundBathPresets()) {
      const result = plan(preset, 555);
      expect(Math.min(...result.events.map((event) => event.atSec)), preset.id).toBeGreaterThanOrEqual(20);
      for (const event of result.events) {
        expect(event.atSec + event.durationSec, `${preset.id}/${event.assetId}`).toBeLessThanOrEqual(
          SESSION_SEC + 8,
        );
      }
      expect(result.lastTailEndsAtSec, preset.id).toBeLessThanOrEqual(SESSION_SEC + 8);
    }
  });

  it('is reproducible from its seed', () => {
    // §18, §48: a seed in Protocol DNA only means something if it reproduces.
    for (const preset of buildSoundBathPresets()) {
      expect(plan(preset, 31337).events, preset.id).toEqual(plan(preset, 31337).events);
    }
  });
});

// ---------------------------------------------------------------------------
// Voices
// ---------------------------------------------------------------------------

describe('voice caps', () => {
  it('never exceeds a layer cap, on any seed', () => {
    for (const preset of buildSoundBathPresets()) {
      for (const seed of SEEDS) {
        const events = plan(preset, seed).events;
        for (const layer of preset.layers) {
          const mine = events.filter((event) => event.layerId === layer.id);
          expect(peakConcurrency(mine), `${preset.id}/${layer.id} seed ${seed}`).toBeLessThanOrEqual(
            layer.maxVoices,
          );
        }
      }
    }
  });

  it('never exceeds the global cap, including the one a weak device sets', () => {
    // §15, §52: the global cap is lowered on weaker hardware, so it has to hold
    // at a value no preset was written against as well as at the default.
    for (const preset of buildSoundBathPresets()) {
      for (const maxVoices of [8, 4, 2]) {
        for (const seed of [1, 4242, 99999]) {
          const events = plan(preset, seed, maxVoices).events;
          expect(peakConcurrency(events), `${preset.id} at ${maxVoices} voices, seed ${seed}`).toBeLessThanOrEqual(
            maxVoices,
          );
        }
      }
    }
  });

  it('still produces a session when a device allows only two voices', () => {
    // A cap this low thins every preset; it must not silence one.
    for (const preset of buildSoundBathPresets()) {
      expect(plan(preset, 2024, 2).events.length, preset.id).toBeGreaterThan(5);
    }
  });
});

// ---------------------------------------------------------------------------
// §84 and §25 — what the copy is allowed to say
// ---------------------------------------------------------------------------

describe('what a preset says about itself', () => {
  it('names no condition and claims no effect', () => {
    /*
     * §84. Deliberately a wider net than the validator's, and asserted on the
     * same surfaces a user can read plus the layer ids a support conversation
     * would quote. `Sleep Descent` survives it and is meant to: it names when
     * somebody might reach for a preset, which is what `Deep Calm` and `Alpha
     * Focus` next door already do.
     */
    const forbidden = [
      'cure',
      'treat',
      'heal',
      'therapy',
      'therapeutic',
      'remedy',
      'diagnos',
      'symptom',
      'disease',
      'illness',
      'disorder',
      'anxiety',
      'depression',
      'insomnia',
      'migraine',
      'tinnitus',
      'cancer',
      'immune',
      'detox',
      'chakra',
    ];
    for (const preset of buildSoundBathPresets()) {
      const surfaces = [preset.name, preset.description, ...preset.layers.map((layer) => layer.id)];
      for (const surface of surfaces.map((text) => text.toLowerCase())) {
        for (const word of forbidden) {
          expect(surface.includes(word), `${preset.id}: "${surface}" contains "${word}"`).toBe(false);
        }
      }
    }
  });

  it('keeps the acoustic layer and the core signal separate, in every description', () => {
    // §25. The bowl is not producing the modulation, and every preset has to
    // say so — appended by the builder rather than typed seventeen times, so
    // the one that gets forgotten cannot exist.
    for (const preset of buildSoundBathPresets()) {
      expect(preset.description.endsWith(ACOUSTIC_LAYER_NOTICE), preset.id).toBe(true);
      expect(preset.description.length, preset.id).toBeGreaterThan(ACOUSTIC_LAYER_NOTICE.length + 80);
    }
  });

  it('says outright that Earth Resonance does not reproduce the atmospheric resonance', () => {
    // §28. The name points at the core signal it accompanies; the Schumann
    // resonance is electromagnetic and no loudspeaker produces one.
    const preset = soundBathPreset('soundbath.earth_resonance')!;
    expect(preset.description).toContain('electromagnetic');
    expect(preset.description.toLowerCase()).toContain('nothing acoustic reproduces it');
  });

  it('says outright that Gamma Light contains nothing at 40 Hz', () => {
    // The organic layer cannot produce a 40 Hz relationship and the name would
    // otherwise imply it does.
    const preset = soundBathPreset('soundbath.gamma_light')!;
    expect(preset.description).toContain('40 Hz');
    expect(preset.description.toLowerCase()).toContain('nothing here happens at 40 hz');
  });

  it('attaches no claim to 528', () => {
    // §29. The preset is a tuning offset. The claim usually carried by this
    // number is answered in the archive and is not restated as a benefit here.
    const preset = soundBathPreset('soundbath.528_organic')!;
    expect(preset.description).toContain('unsupported');
    expect(preset.description).toContain('444 Hz');
  });
});

// ---------------------------------------------------------------------------
// Retuning
// ---------------------------------------------------------------------------

describe('the two retuned presets', () => {
  it('moves only material whose pitch was measured', () => {
    /*
     * §8, §22, §24. 121 assets carry a note that came from the vendor's
     * filename and 161 carry none at all; shifting audio on the strength of a
     * label would be inventing precision the pipeline refused to claim.
     */
    for (const [id, cents] of [
      ['soundbath.528_organic', 15.667],
      ['soundbath.432_meditation', -31.767],
    ] as const) {
      const events = plan(soundBathPreset(id)!, 8675309).events;
      expect(events.length, id).toBeGreaterThan(0);
      let moved = 0;
      for (const event of events) {
        const asset = byId.get(event.assetId)!;
        if (asset.noteSource === 'measured') {
          expect(event.detuneCents, `${id}/${asset.assetId}`).toBeCloseTo(cents, 2);
          moved++;
        } else {
          expect(event.detuneCents, `${id}/${asset.assetId} has a ${asset.noteSource} note`).toBe(0);
        }
      }
      // Not a rounding error's worth: the retuning has to be audible somewhere
      // or the preset is a label rather than a tuning.
      expect(moved, `${id} moved nothing`).toBeGreaterThan(5);
    }
  });

  it('puts C5 where 528 Organic says it does', () => {
    // Three semitones above A4 = 444 Hz. Asserted rather than described,
    // because the whole content of the preset is this number.
    const preset = soundBathPreset('soundbath.528_organic')!;
    expect(preset.globals.tuningReferenceHz).toBe(444);
    expect(444 * 2 ** (3 / 12)).toBeCloseTo(528.008, 3);
  });

  it('leaves every other preset at concert pitch', () => {
    for (const preset of buildSoundBathPresets()) {
      if (preset.globals.tuningReferenceHz !== undefined) continue;
      expect(plan(preset, 123456).events.every((event) => event.detuneCents === 0), preset.id).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Approval, which is a different question
// ---------------------------------------------------------------------------

describe('approval', () => {
  it('reports every preset as designed but not yet approved', () => {
    /*
     * Curation has not started: one asset in the manifest is approved and it is
     * the worked example in the overrides file, not a decision anybody made
     * about the library. So the design-time validator passes everything and the
     * approval check passes nothing, which is the correct state of the world
     * and the reason the two are separate functions.
     */
    expect(LIBRARY.filter((asset) => asset.approved)).toHaveLength(1);
    for (const preset of buildSoundBathPresets()) {
      const report = validateSoundBathApproval(preset, LIBRARY);
      expect(report.ready, preset.id).toBe(false);
      for (const layer of report.layers) {
        expect(layer.size, `${preset.id}/${layer.layerId}`).toBeGreaterThanOrEqual(MINIMUM_POOL_SIZE);
        expect(layer.approvedSize, `${preset.id}/${layer.layerId}`).toBeLessThan(MINIMUM_POOL_SIZE);
      }
    }
  });

  it('would become ready if a curator approved enough of a pool', () => {
    // The same preset, the same library, one field changed on enough assets.
    const preset = soundBathPreset('soundbath.pure_bowls')!;
    const approved = LIBRARY.map((asset) =>
      asset.instrument === 'SINGING_BOWL' ? { ...asset, approved: true } : asset,
    );
    expect(validateSoundBathApproval(preset, approved).ready).toBe(true);
    // And only then does the scheduler's shipping default produce anything.
    expect(
      planSoundBath({ preset, library: approved, durationSec: SESSION_SEC, seed: 1 }).events.length,
    ).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The validator itself
// ---------------------------------------------------------------------------

describe('the validator', () => {
  const base = (): SoundBathPreset => JSON.parse(JSON.stringify(soundBathPreset('soundbath.deep_calm')));
  const codes = (preset: SoundBathPreset, library = LIBRARY) =>
    validateSoundBath({ preset, library }).issues.map((issue) => issue.code);

  it('counts the effective pool, not just the pool', () => {
    /*
     * The check a count cannot make, on the mistake most likely to be made: a
     * tuning fork layer dropped into an energetic preset. The forks still
     * resolve to ten and ten clears the floor — but five of them are struck
     * softly enough to be weighted almost out of existence at an energy of 0.7,
     * and what is left is a layer playing five sounds for half an hour.
     */
    const preset = base();
    preset.globals = { ...preset.globals, energy: 0.7 };
    preset.layers[0].pool = { instruments: ['TUNING_FORK'] };
    const pool = resolvePool(preset.layers[0].pool, LIBRARY, false);
    expect(pool).toHaveLength(10);
    expect(pool.length).toBeGreaterThanOrEqual(MINIMUM_POOL_SIZE);
    expect(effectivePoolSize(pool, preset.layers[0], preset)).toBeLessThan(MINIMUM_EFFECTIVE_POOL_SIZE);
    expect(codes(preset)).toContain('pool-collapsed-by-globals');

    // And the preset that actually ships a fork layer keeps well clear of it.
    const forkSpace = soundBathPreset('soundbath.tuning_fork_space')!;
    const forks = validateSoundBath({ preset: forkSpace, library: LIBRARY }).layers.find(
      (layer) => layer.layerId === 'forks',
    )!;
    expect(forks.size).toBe(10);
    expect(forks.effectiveSize).toBeGreaterThan(9);
  });

  it('calls an empty pool an error and a thin one a warning', () => {
    const empty = base();
    empty.layers[0].pool = { instruments: ['GONG'] };
    const emptyResult = validateSoundBath({ preset: empty, library: LIBRARY });
    expect(emptyResult.ok).toBe(false);
    expect(emptyResult.issues.find((issue) => issue.code === 'pool-empty')!.severity).toBe('error');

    const thin = base();
    thin.layers[0].pool = { assetIds: LIBRARY.slice(0, 2).map((asset) => asset.assetId) };
    const thinResult = validateSoundBath({ preset: thin, library: LIBRARY });
    // A hand-picked pair is somebody's choice (§35), so it warns and still runs.
    expect(thinResult.ok).toBe(true);
    expect(thinResult.issues.find((issue) => issue.code === 'pool-thin')!.severity).toBe('warning');

    const single = base();
    single.layers[0].pool = { assetIds: [LIBRARY[0].assetId] };
    expect(
      validateSoundBath({ preset: single, library: LIBRARY }).issues.find((issue) => issue.code === 'pool-thin')!
        .message,
    ).toContain('single asset');
  });

  it('catches a layer that would ask the mixer to amplify', () => {
    // Twelve assets carry a positive `recommendedGainDb` and the largest is
    // +8.44 dB, so a trim that looks conservative can still add up to a boost.
    const preset = base();
    preset.layers[0].pool = { instruments: ['SINGING_BOWL'], durationClasses: ['LONG'] };
    preset.layers[0].gainDb = { min: -6, max: -2 };
    const issue = validateSoundBath({ preset, library: LIBRARY }).issues.find(
      (candidate) => candidate.code === 'layer-gain-exceeds-reference',
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
    expect(issue!.message).toContain('6.44 dB');
  });

  it('refuses copy that names a condition or claims an effect', () => {
    const named = base();
    named.name = 'Migraine Relief';
    expect(codes(named)).toContain('medical-language');

    const claimed = base();
    claimed.description = `A preset that will heal you. ${ACOUSTIC_LAYER_NOTICE}`;
    expect(codes(claimed)).toContain('medical-language');

    // And does not fire on ordinary words that merely contain those letters.
    const innocent = base();
    innocent.description = `An obscure treatise on secure bowls. ${ACOUSTIC_LAYER_NOTICE}`;
    expect(codes(innocent)).not.toContain('medical-language');
  });

  it('refuses a description that lets the acoustic layer and the core signal blur', () => {
    const preset = base();
    preset.description = 'Bowls tuned to 7.83 Hz.';
    expect(codes(preset)).toContain('acoustic-layer-notice-missing');
  });

  it('catches the structural mistakes a type cannot', () => {
    const inverted = base();
    inverted.layers[0].intervalSec = { min: 90, max: 30 };
    expect(codes(inverted)).toContain('interval-inverted');

    const impossible = base();
    impossible.globals = { ...impossible.globals, brightness: 1.4 };
    expect(codes(impossible)).toContain('global-out-of-range');

    const collided = base();
    collided.layers[1].id = collided.layers[0].id;
    expect(codes(collided)).toContain('layer-id-duplicated');

    const voiceless = base();
    voiceless.layers[0].maxVoices = 0;
    expect(codes(voiceless)).toContain('max-voices-not-a-count');

    const transposed = base();
    transposed.globals = { ...transposed.globals, tuningReferenceHz: 400 };
    expect(codes(transposed)).toContain('tuning-reference-is-a-transposition');
  });

  it('catches a duplicated preset id, which neither preset can see', () => {
    const duplicated = validateSoundBathSet([base(), base()], LIBRARY);
    expect(duplicated.ok).toBe(false);
    expect(duplicated.issues.map((issue) => issue.code)).toContain('preset-id-duplicated');
  });
});
