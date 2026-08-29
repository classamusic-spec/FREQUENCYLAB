import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planSoundBath } from '../src/organic/scheduler.js';
import { buildSoundBathPresets, soundBathPreset } from '../src/organic/presets.js';
import { ORGANIC_INSTRUMENTS } from '../src/organic/manifest.generated.js';
import {
  DEFAULT_ACOUSTIC_MIX,
  MIXER_GROUPS,
  MIXER_GROUP_LABELS,
  MIXER_MAX_DB,
  MIXER_MIN_DB,
  MIXER_SPACE_MAX_DB,
  MIXER_UNITY_DB,
  isDefaultMix,
  mixerDb,
  mixerGain,
  mixerGroupForInstrument,
  withGroupLevel,
  withSpace,
  type MixerGroup,
  type SchedulableAsset,
} from '../src/organic/soundbath.js';

/**
 * The acoustic mixer's routing and its arithmetic (§31, §92).
 *
 * The mixer is a set of faders and a promise: every fader on screen governs
 * sound that is really playing, and every sound that is really playing is under
 * some fader. Both halves are checkable without a speaker, because the plan
 * says which group each event belongs to and the manifest says what every asset
 * in the library is. That is what these tests do — against the 371 assets
 * actually committed, not a fixture, so a curation change that put material
 * outside the mixer's reach fails here rather than in someone's ears.
 */

const manifest = JSON.parse(
  readFileSync(
    new URL('../../../generated/audio/organic_audio_manifest.json', import.meta.url),
    'utf8',
  ),
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

describe('mixer groups', () => {
  it('gives every instrument the schema declares a fader', () => {
    for (const instrument of ORGANIC_INSTRUMENTS) {
      expect(MIXER_GROUPS).toContain(mixerGroupForInstrument(instrument));
    }
  });

  /*
   * The mapping is only useful if it *separates*. A version that returned
   * 'texture' for everything would satisfy the totality check above and leave
   * one fader controlling the whole library.
   */
  it('gives each of the six instruments in this library its own fader', () => {
    const mapped = {
      SINGING_BOWL: mixerGroupForInstrument('SINGING_BOWL'),
      BELL: mixerGroupForInstrument('BELL'),
      CHIME: mixerGroupForInstrument('CHIME'),
      KALIMBA: mixerGroupForInstrument('KALIMBA'),
      TUNING_FORK: mixerGroupForInstrument('TUNING_FORK'),
      WATER: mixerGroupForInstrument('WATER'),
    };
    expect(mapped).toEqual({
      SINGING_BOWL: 'bowls',
      BELL: 'bells',
      CHIME: 'chimes',
      KALIMBA: 'kalimba',
      TUNING_FORK: 'forks',
      WATER: 'water',
    });
    expect(new Set(Object.values(mapped)).size).toBe(6);
  });

  /** The real library, partitioned. These counts are the manifest's own. */
  it('partitions the whole committed library, with nothing left over', () => {
    const counts = new Map<MixerGroup, number>();
    for (const asset of LIBRARY) {
      const group = mixerGroupForInstrument(asset.instrument);
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual({
      bowls: 68,
      bells: 102,
      chimes: 89,
      kalimba: 100,
      forks: 10,
      water: 2,
    });
    const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
    expect(total).toBe(LIBRARY.length);
    expect(total).toBe(371);
  });

  it('names every fader, so nothing draws as an identifier', () => {
    for (const group of MIXER_GROUPS) {
      expect(MIXER_GROUP_LABELS[group]).toMatch(/^[A-Z]/);
    }
  });
});

describe('planned events carry their fader', () => {
  /**
   * The load-bearing claim: an event's `group` is the group of the asset that
   * will actually sound. Everything the audio graph does with the mixer follows
   * from this being true for every event in every plan.
   */
  it('agrees with the asset for every event of every factory preset', () => {
    let checked = 0;
    for (const preset of buildSoundBathPresets()) {
      const plan = planSoundBath({
        preset,
        library: LIBRARY,
        durationSec: 1500,
        seed: `mixer:${preset.id}`,
      });
      expect(plan.events.length).toBeGreaterThan(0);
      for (const event of plan.events) {
        const asset = byId.get(event.assetId)!;
        expect(event.group).toBe(mixerGroupForInstrument(asset.instrument));
        checked++;
      }
    }
    // A sanity floor on the coverage: nineteen presets over twenty-five
    // minutes is hundreds of events, and a plan that suddenly produced a
    // handful would make the assertion above vacuous.
    expect(checked).toBeGreaterThan(400);
  });

  it('routes a bowl preset to the bowl fader and a chime preset to the chime fader', () => {
    const bowls = planSoundBath({
      preset: soundBathPreset('soundbath.deep_bowls')!,
      library: LIBRARY,
      durationSec: 1800,
      seed: 'bowls',
    });
    expect(new Set(bowls.events.map((event) => event.group))).toEqual(new Set(['bowls']));

    const chimes = planSoundBath({
      preset: soundBathPreset('soundbath.silver_chimes')!,
      library: LIBRARY,
      durationSec: 1800,
      seed: 'chimes',
    });
    const groups = new Set(chimes.events.map((event) => event.group));
    expect(groups).toContain('chimes');
    // Silver Chimes has a bowl floor and a bell sparkle layer as well, so the
    // mixer must show three strips for it and not one.
    expect(groups.size).toBeGreaterThan(1);
  });

  it('reaches the water fader from the preset that uses the ocean recordings', () => {
    const preset = buildSoundBathPresets().find((candidate) =>
      candidate.layers.some((layer) => layer.pool.instruments?.includes('WATER')),
    )!;
    const plan = planSoundBath({
      preset,
      library: LIBRARY,
      durationSec: 1800,
      seed: 'water',
    });
    expect(plan.events.some((event) => event.group === 'water')).toBe(true);
  });

  it('never plans an event this build has no fader for', () => {
    for (const preset of buildSoundBathPresets()) {
      const plan = planSoundBath({
        preset,
        library: LIBRARY,
        durationSec: 900,
        seed: 'coverage',
      });
      for (const event of plan.events) {
        expect(MIXER_GROUPS).toContain(event.group);
      }
    }
  });
});

describe('fader arithmetic', () => {
  it('is unity at 0 dB', () => {
    expect(mixerGain(MIXER_UNITY_DB)).toBe(1);
  });

  it('halves the amplitude six decibels down', () => {
    expect(mixerGain(-6.0206)).toBeCloseTo(0.5, 5);
    expect(mixerGain(-12.0412)).toBeCloseTo(0.25, 5);
    expect(mixerGain(MIXER_MAX_DB)).toBeCloseTo(1.9953, 4);
  });

  /*
   * The floor is a mute, not a hundredth. A fader that leaves −40 dB of an
   * instrument in the mix cannot be used to remove it, which is the one thing
   * a per-instrument fader has to be able to do.
   */
  it('is exactly silent at and below the floor', () => {
    expect(mixerGain(MIXER_MIN_DB)).toBe(0);
    expect(mixerGain(MIXER_MIN_DB - 1)).toBe(0);
    expect(mixerGain(-1000)).toBe(0);
    expect(mixerGain(Number.NEGATIVE_INFINITY)).toBe(0);
    // Just above the floor is audible again — the mute is the last step of the
    // travel, not a dead zone at the bottom of it.
    expect(mixerGain(MIXER_MIN_DB + 0.5)).toBeGreaterThan(0);
  });

  it('refuses a gain above the fader’s own travel', () => {
    expect(mixerGain(60)).toBe(mixerGain(MIXER_MAX_DB));
  });

  it('is not fooled by a value that is not a number', () => {
    expect(mixerGain(Number.NaN)).toBe(0);
  });
});

describe('the mix itself', () => {
  it('starts at unity with the room off', () => {
    expect(isDefaultMix(DEFAULT_ACOUSTIC_MIX)).toBe(true);
    for (const group of MIXER_GROUPS) {
      expect(DEFAULT_ACOUSTIC_MIX.levels[group]).toBe(MIXER_UNITY_DB);
      expect(mixerGain(DEFAULT_ACOUSTIC_MIX.levels[group])).toBe(1);
    }
    expect(mixerGain(DEFAULT_ACOUSTIC_MIX.spaceDb)).toBe(0);
  });

  it('moves one fader and leaves the rest alone', () => {
    const moved = withGroupLevel(DEFAULT_ACOUSTIC_MIX, 'bells', -9);
    expect(moved.levels.bells).toBe(-9);
    expect(moved.levels.bowls).toBe(MIXER_UNITY_DB);
    expect(isDefaultMix(moved)).toBe(false);
    // The original is untouched: the mix is passed around and compared, so a
    // mutation in place would make a stale copy look current.
    expect(DEFAULT_ACOUSTIC_MIX.levels.bells).toBe(MIXER_UNITY_DB);
  });

  it('clamps a fader to its travel', () => {
    expect(withGroupLevel(DEFAULT_ACOUSTIC_MIX, 'bowls', 40).levels.bowls).toBe(MIXER_MAX_DB);
    expect(withGroupLevel(DEFAULT_ACOUSTIC_MIX, 'bowls', -400).levels.bowls).toBe(MIXER_MIN_DB);
    expect(withGroupLevel(DEFAULT_ACOUSTIC_MIX, 'bowls', Number.NaN).levels.bowls).toBe(
      MIXER_MIN_DB,
    );
  });

  it('holds the reverb return to its own lower ceiling', () => {
    expect(withSpace(DEFAULT_ACOUSTIC_MIX, 12).spaceDb).toBe(MIXER_SPACE_MAX_DB);
    expect(withSpace(DEFAULT_ACOUSTIC_MIX, -18).spaceDb).toBe(-18);
    expect(MIXER_SPACE_MAX_DB).toBeLessThan(MIXER_MAX_DB);
  });
});

describe('reading a level back', () => {
  it('round-trips an amplitude through decibels', () => {
    for (const gain of [1, 0.8, 0.65, 0.5, 0.4, 0.25, 0.05]) {
      expect(mixerGain(mixerDb(gain))).toBeCloseTo(gain, 6);
    }
  });

  it('calls silence the floor rather than minus infinity', () => {
    expect(mixerDb(0)).toBe(MIXER_MIN_DB);
    expect(mixerDb(-1)).toBe(MIXER_MIN_DB);
    expect(mixerDb(Number.NaN)).toBe(MIXER_MIN_DB);
  });

  /** The levels calibration and the session screen actually offer. */
  it('reads the app’s own output levels as the decibels they are', () => {
    expect(mixerDb(0.5)).toBeCloseTo(-6.02, 2);
    expect(mixerDb(0.25)).toBeCloseTo(-12.04, 2);
    expect(mixerDb(0.8)).toBeCloseTo(-1.94, 2);
  });
});
