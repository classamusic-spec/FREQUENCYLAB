import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { planSoundBath, resolvePool } from '../src/organic/scheduler.js';
import type { SchedulableAsset, SoundBathPreset } from '../src/organic/soundbath.js';

/**
 * The scheduler, tested against the real library rather than a fixture.
 *
 * Every number these tests assert comes from the 369 assets actually in the
 * repository, measured by the offline pipeline. A synthetic fixture would let
 * the scheduler pass while being wrong about the material it will really be
 * given — which is the failure mode §59 of the pipeline brief exists to
 * prevent.
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

function preset(overrides: Partial<SoundBathPreset['globals']> = {}): SoundBathPreset {
  return {
    id: 'test.deep_calm',
    version: 1,
    name: 'Test',
    description: '',
    globals: { density: 0.3, energy: 0.2, brightness: 0.25, ...overrides },
    layers: [
      {
        id: 'bowls',
        role: 'PRIMARY_BOWL',
        pool: { instruments: ['SINGING_BOWL'], durationClasses: ['LONG'] },
        intervalSec: { min: 50, max: 110 },
        probability: 0.8,
        gainDb: { min: -24, max: -18 },
        panRange: { min: -0.25, max: 0.25 },
        maxVoices: 2,
        reverbSend: 0.4,
      },
      {
        id: 'chimes',
        role: 'CHIME',
        pool: { instruments: ['CHIME'], durationClasses: ['SHORT', 'MEDIUM'] },
        intervalSec: { min: 20, max: 60 },
        probability: 0.4,
        gainDb: { min: -28, max: -22 },
        panRange: { min: -0.6, max: 0.6 },
        maxVoices: 2,
        reverbSend: 0.3,
      },
    ],
  };
}

const plan = (options: Partial<Parameters<typeof planSoundBath>[0]> = {}) =>
  planSoundBath({
    preset: preset(),
    library: LIBRARY,
    durationSec: 1500,
    seed: 7281921,
    // Nothing in the library is curator-approved yet, so the shipping default
    // would correctly return an empty plan. These tests exercise the scheduler,
    // not the approval gate, which has its own test below.
    requireApproved: false,
    ...options,
  });

describe('the library the scheduler actually gets', () => {
  it('is the real one', () => {
    expect(LIBRARY.length).toBe(369);
    expect(LIBRARY.every((asset) => asset.durationSeconds > 0)).toBe(true);
  });
});

describe('deterministic reproduction', () => {
  // The whole reason a seed can live in Protocol DNA (§18, §48). If this fails,
  // a shared session is not the session that was shared.
  it('produces identical events for the same seed', () => {
    expect(plan().events).toEqual(plan().events);
  });

  it('produces different events for a different seed', () => {
    expect(plan({ seed: 99 }).events).not.toEqual(plan().events);
  });

  it('is unaffected by the order the library happens to arrive in', () => {
    const reversed = [...LIBRARY].reverse();
    // Pool resolution preserves library order, so this legitimately changes the
    // outcome — what must not change is that it stays deterministic.
    expect(plan({ library: reversed }).events).toEqual(plan({ library: reversed }).events);
  });
});

describe('density changes events, never volume', () => {
  /*
   * §19 is explicit that density must not simply raise the volume, and this is
   * the test that keeps it honest: the two quantities are asserted in opposite
   * directions at once.
   */
  it('adds events as it rises', () => {
    const counts = [0, 0.25, 0.5, 0.75, 1].map((density) =>
      plan({ preset: { ...preset(), globals: { ...preset().globals, density } } }).events.length,
    );
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i], `density step ${i} did not add events`).toBeGreaterThanOrEqual(counts[i - 1]);
    }
    expect(counts[4]).toBeGreaterThan(counts[0] * 3);
  });

  it('does not make anything louder', () => {
    const mean = (density: number) => {
      const events = plan({ preset: { ...preset(), globals: { ...preset().globals, density } } }).events;
      return events.reduce((sum, event) => sum + event.gainDb, 0) / events.length;
    };
    // Gain comes from the layer and the asset; density appears nowhere in it.
    expect(Math.abs(mean(1) - mean(0))).toBeLessThan(4);
  });
});

describe('brightness steers selection', () => {
  // §92: a control that exists must do something. The first version of this
  // weighting moved the mean from 0.548 to 0.581 across the entire range — a
  // control in name only — on a library whose bowls span 0.224 to 0.811.
  it('moves what gets chosen, monotonically', () => {
    const means = [0, 0.25, 0.5, 0.75, 1].map((brightness) => {
      const events = plan({
        durationSec: 7200,
        preset: { ...preset(), globals: { ...preset().globals, density: 1, brightness } },
      }).events;
      const values = events
        .map((event) => byId.get(event.assetId)!.brightness)
        .filter((value): value is number => value !== null);
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    });
    for (let i = 1; i < means.length; i++) {
      expect(means[i], `brightness step ${i} went the wrong way`).toBeGreaterThan(means[i - 1]);
    }
    expect(means[4] - means[0]).toBeGreaterThan(0.1);
  });
});

describe('repetition', () => {
  it('never plays the same asset twice in a row on one layer', () => {
    const events = plan({ preset: { ...preset(), globals: { ...preset().globals, density: 0.8 } } }).events;
    for (const layerId of ['bowls', 'chimes']) {
      const ids = events.filter((event) => event.layerId === layerId).map((event) => event.assetId);
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i], `${layerId} repeated ${ids[i]} immediately`).not.toBe(ids[i - 1]);
      }
    }
  });

  it('does not fall into an ABAB alternation', () => {
    const events = plan({
      durationSec: 3600,
      preset: { ...preset(), globals: { ...preset().globals, density: 1 } },
    }).events;
    for (const layerId of ['bowls', 'chimes']) {
      const ids = events.filter((event) => event.layerId === layerId).map((event) => event.assetId);
      let alternations = 0;
      for (let i = 3; i < ids.length; i++) {
        if (ids[i] === ids[i - 2] && ids[i - 1] === ids[i - 3]) alternations++;
      }
      expect(alternations, `${layerId} alternated between two assets`).toBe(0);
    }
  });
});

describe('polyphony', () => {
  it('never exceeds the global voice cap', () => {
    const events = plan({
      maxVoices: 4,
      preset: { ...preset(), globals: { ...preset().globals, density: 1 } },
    }).events;
    for (const event of events) {
      const overlapping = events.filter(
        (other) => other.atSec <= event.atSec && other.atSec + other.durationSec > event.atSec,
      );
      expect(overlapping.length).toBeLessThanOrEqual(4);
    }
  });

  it('never exceeds a layer cap', () => {
    const events = plan({ preset: { ...preset(), globals: { ...preset().globals, density: 1 } } }).events;
    const bowls = events.filter((event) => event.layerId === 'bowls');
    for (const event of bowls) {
      const overlapping = bowls.filter(
        (other) => other.atSec <= event.atSec && other.atSec + other.durationSec > event.atSec,
      );
      expect(overlapping.length).toBeLessThanOrEqual(2);
    }
  });
});

describe('the shape of a session', () => {
  it('leaves the opening to the core frequency', () => {
    // §77: nothing arrives in the first stretch. The instrument is heard before
    // the room is furnished.
    const events = plan({ arrivalSec: 30 }).events;
    expect(Math.min(...events.map((event) => event.atSec))).toBeGreaterThanOrEqual(30);
  });

  it('never starts a sound that cannot finish', () => {
    // §78, §79: no 47-second bowl twenty seconds from the end. Cutting a tail is
    // forbidden, so the only honest option is not to begin one.
    for (const density of [0.3, 1]) {
      const result = plan({
        durationSec: 900,
        tailAllowanceSec: 10,
        preset: { ...preset(), globals: { ...preset().globals, density } },
      });
      for (const event of result.events) {
        expect(event.atSec + event.durationSec).toBeLessThanOrEqual(910);
      }
    }
  });

  it('reports where its tail actually ends', () => {
    // The UI shows FINISHING against this, so it has to be the real number.
    const result = plan();
    const latest = Math.max(...result.events.map((event) => event.atSec + event.durationSec));
    expect(result.lastTailEndsAtSec).toBeCloseTo(latest, 3);
  });
});

describe('pools', () => {
  it('reports a layer that can never play rather than failing silently', () => {
    // §88: a preset whose query resolves to nothing is broken, and has to say so
    // at build time rather than producing a session with a missing layer.
    const broken: SoundBathPreset = {
      ...preset(),
      layers: [{ ...preset().layers[0], id: 'nothing', pool: { instruments: ['GONG'] } }],
    };
    expect(plan({ preset: broken }).emptyLayers).toEqual(['nothing']);
  });

  it('gates on approval, in both directions', () => {
    /*
     * The library is approved in full now, so the shipping default produces a
     * real session — which is what the app will do — and the gate itself can no
     * longer be seen by looking at this library. It is checked by removing the
     * approval instead: same preset, same audio, one field cleared.
     */
    expect(plan({ requireApproved: true }).events.length).toBeGreaterThan(0);

    const unapproved = LIBRARY.map((asset) => ({ ...asset, approved: false }));
    expect(plan({ requireApproved: true, library: unapproved }).events).toEqual([]);
    // And the layers say why, rather than the session simply being quiet.
    expect(plan({ requireApproved: true, library: unapproved }).emptyLayers.length).toBeGreaterThan(0);
  });

  it('honours an explicit asset list', () => {
    const chosen = LIBRARY.slice(0, 3).map((asset) => asset.assetId);
    expect(resolvePool({ assetIds: chosen }, LIBRARY, false).map((a) => a.assetId)).toEqual(chosen);
  });
});

describe('retuning', () => {
  /*
   * §24 and §8 together: A432 is a tuning reference, and applying it to material
   * whose pitch was never established would be inventing precision the pipeline
   * deliberately refused to claim. 121 assets carry a note that came from the
   * vendor's filename rather than from measurement; none of them may be shifted.
   */
  it('leaves everything alone at the standard reference', () => {
    expect(plan().events.every((event) => event.detuneCents === 0)).toBe(true);
  });

  it('shifts only assets whose pitch was measured', () => {
    const events = plan({
      durationSec: 7200,
      preset: {
        ...preset(),
        globals: { ...preset().globals, density: 1, tuningReferenceHz: 432 },
      },
    }).events;
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      const asset = byId.get(event.assetId)!;
      if (asset.noteSource === 'measured') {
        expect(event.detuneCents).toBeCloseTo(-31.767, 2);
      } else {
        expect(event.detuneCents, `${asset.assetId} was retuned on a ${asset.noteSource} note`).toBe(0);
      }
    }
  });
});

describe('acceptance: the durations the spec names', () => {
  /*
   * §93 to §95. The point of each is that the scheduler knows how long a sound
   * lasts *before* it triggers it, from the manifest, without opening a file.
   */
  const find = (predicate: (asset: SchedulableAsset) => boolean) => {
    const asset = LIBRARY.find(predicate);
    expect(asset, 'the real library has no asset matching this case').toBeDefined();
    return asset!;
  };

  it('treats a ~2 second sample as a short accent, never a bed', () => {
    const asset = find((a) => a.durationSeconds >= 1.8 && a.durationSeconds <= 2.6);
    expect(['MICRO', 'SHORT']).toContain(asset.durationClass);
    expect(asset.roles).not.toContain('BED');
  });

  it('treats a ~40 second bowl as LONG and knows its exact length', () => {
    const asset = find(
      (a) => a.instrument === 'SINGING_BOWL' && a.durationSeconds >= 38 && a.durationSeconds <= 46,
    );
    expect(asset.durationClass).toBe('LONG');
    expect(asset.roles).toContain('PRIMARY_BOWL');

    const events = plan({
      preset: { ...preset(), layers: [{ ...preset().layers[0], pool: { assetIds: [asset.assetId] } }] },
    }).events;
    for (const event of events) {
      expect(event.durationSec).toBeCloseTo(asset.durationSeconds, 3);
    }
  });

  it('treats a 60 second-plus recording as EXTENDED and streams it', () => {
    const asset = find((a) => a.durationSeconds >= 60);
    expect(asset.durationClass).toBe('EXTENDED');
    expect(asset.maxRecommendedVoices).toBeLessThanOrEqual(4);
  });
});

describe('two rules that were silently not holding', () => {
  /*
   * Both of these passed every test in this file while being wrong, which is
   * why they get their own. Neither is visible in an event list at a glance;
   * both were found by reading the arithmetic.
   */

  it('never makes a recently played asset more likely than an unplayed one', () => {
    /*
     * The penalty is `0.02 + 0.16 * position`, which passes 1 at the seventh
     * position and reaches 1.78 at the twelfth. Unclamped, an asset played seven
     * to eleven events ago was up to 1.8x *more* likely than one that had never
     * played — a penalty that inverts into a preference.
     *
     * The tell is not the mean gap between an asset's repeats, which is fixed by
     * the pool size and comes out at 9.95 either way. It is the *shape*: a
     * favoured window at 7-11 pulls the distribution into it and leaves a cliff
     * past the twelve-entry history, so long gaps stop happening. Measured on
     * the ten tuning forks — the smallest natural pool in the library, and where
     * a no-repeat rule matters most — gaps beyond the window are 26.2% of the
     * total when the penalty is clamped and 18.8% when it inverts.
     */
    const forks = LIBRARY.filter((asset) => asset.instrument === 'TUNING_FORK');
    expect(forks.length).toBe(10);

    const events = planSoundBath({
      preset: {
        id: 'repeat-probe',
        version: 1,
        name: 'Repeat probe',
        description: '',
        globals: { density: 1, energy: 0.2, brightness: 0.4 },
        layers: [
          {
            id: 'forks',
            role: 'TUNING_FORK',
            pool: { assetIds: forks.map((asset) => asset.assetId) },
            intervalSec: { min: 8, max: 16 },
            probability: 1,
            gainDb: { min: -20, max: -16 },
            panRange: { min: -0.3, max: 0.3 },
            maxVoices: 3,
          },
        ],
      },
      library: LIBRARY,
      durationSec: 7200,
      seed: 5,
      requireApproved: false,
    }).events;

    const gaps: number[] = [];
    const lastSeen = new Map<string, number>();
    events.forEach((event, index) => {
      const previous = lastSeen.get(event.assetId);
      if (previous !== undefined) gaps.push(index - previous);
      lastSeen.set(event.assetId, index);
    });

    expect(gaps.length).toBeGreaterThan(500);
    const beyondWindow = gaps.filter((gap) => gap > 12).length / gaps.length;
    expect(beyondWindow, 'long gaps are being suppressed, so the penalty has inverted').toBeGreaterThan(
      0.22,
    );
  });

  it('honours a layer that asks for rest between sounds', () => {
    // `minimumRestSec` was computed into a local and then discarded, so a layer
    // asking for rest got none. Two bowls back to back is exactly what a rest
    // exists to prevent.
    const REST = 90;
    const events = plan({
      durationSec: 3600,
      preset: {
        ...preset(),
        globals: { ...preset().globals, density: 1 },
        layers: [{ ...preset().layers[0], maxVoices: 1, minimumRestSec: REST }],
      },
    }).events;

    expect(events.length).toBeGreaterThan(3);
    for (let i = 1; i < events.length; i++) {
      const previous = events[i - 1];
      const gap = events[i].atSec - (previous.atSec + previous.durationSec);
      expect(gap, `only ${gap.toFixed(1)}s of rest after ${previous.assetId}`).toBeGreaterThanOrEqual(
        REST - 0.5,
      );
    }
  });
});
