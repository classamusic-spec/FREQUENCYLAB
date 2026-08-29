import { describe, expect, it } from 'vitest';

import { archiveEntry } from '../src/archive/entries.js';
import { libraryEntry } from '../src/library/entries.js';
import { justInterval } from '../src/music/theory.js';
import { BAND_BOUNDARY_NOTE, BRAINWAVE_BANDS, bandForRate } from '../src/presets/bands.js';
import {
  COSMIC_OCTAVE_DERIVATIONS,
  COSMIC_OCTAVE_TOLERANCE_HZ,
  FACTORY_PRESETS,
  FIFTH_BEAT_HZ,
  FIFTH_CENTS_NARROW,
  HARMONIC_ROOT_HZ,
  HARMONIC_SCALE,
  JUST_FIFTH_HZ,
  TEMPERED_FIFTH_HZ,
  factoryCollections,
  factoryPreset,
  presetsInCollection,
  referencedEvidenceIds,
} from '../src/presets/factory.js';
import {
  presetsAtFrequency,
  presetsWithMedicalAssociations,
  searchPresets,
} from '../src/presets/search.js';
import { AUDIBLE_MAX_HZ, AUDIBLE_MIN_HZ } from '../src/archive/types.js';
import { FACTORY_COLLECTIONS, type CollectionId, type RepresentationKind } from '../src/presets/types.js';

/**
 * The factory preset library.
 *
 * These tests are less about behaviour than about promises. A preset is a claim
 * about what will be played and where the evidence for it lives, and the only
 * way that stays true through a hundred future edits is if a broken link, a
 * duplicated id, a rate quietly described as a tone or a medical claim shipped
 * without its answer fails the build.
 */

// Which representations are a *rate* riding on something audible, and which are
// a pitch you hear directly. Nothing may be in both lists.
const RATE_KINDS = new Set<RepresentationKind>([
  'binaural',
  'binaural-centered',
  'monaural',
  'am',
  'isochronic',
  'fm',
  'noise-modulation',
]);

const TONE_KINDS = new Set<RepresentationKind>([
  'direct',
  'harmonic',
  'subharmonic',
  'multi-layer',
  'stereo-motion',
  'sweep',
]);

describe('factory preset library', () => {
  it('ships every shelf that is not sourced elsewhere, and nothing on the two that are', () => {
    for (const collection of factoryCollections()) {
      expect(presetsInCollection(collection.id).length).toBeGreaterThan(0);
    }
    expect(presetsInCollection('historical-rife')).toHaveLength(0);
    expect(presetsInCollection('my-frequencies')).toHaveLength(0);
  });

  it('has the documented number of rows on each shelf', () => {
    const counts: Record<string, number> = {};
    for (const row of FACTORY_PRESETS) counts[row.collection] = (counts[row.collection] ?? 0) + 1;

    expect(counts).toEqual({
      wellness: 8,
      'brainwave-lab': 12,
      solfeggio: 9,
      'tuning-lab': 6,
      'schumann-inspired': 5,
      'gamma-40': 5,
      'harmonic-traditional': 7,
      'cosmic-octave': 4,
      'noise-lab': 10,
      'acoustic-fundamentals': 6,
    });
  });

  it('has no duplicate ids', () => {
    const ids = FACTORY_PRESETS.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate names', () => {
    const names = FACTORY_PRESETS.map((row) => row.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('marks every row as factory, schema 1, at a positive version', () => {
    for (const row of FACTORY_PRESETS) {
      expect(row.factory).toBe(true);
      expect(row.schemaVersion).toBe(1);
      expect(row.version).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(row.version)).toBe(true);
    }
  });

  it('gives every row a summary, an intent and a sensible duration', () => {
    for (const row of FACTORY_PRESETS) {
      expect(row.summary.length, row.id).toBeGreaterThan(40);
      expect(row.intent.length, row.id).toBeGreaterThan(0);
      expect(row.durationSec, row.id).toBeGreaterThanOrEqual(60);
      expect(row.durationSec, row.id).toBeLessThanOrEqual(3600);
      expect(row.aliases.length, row.id).toBeGreaterThan(0);
      expect(row.tags.length, row.id).toBeGreaterThan(0);
    }
  });

  it('places every row on a declared collection', () => {
    const declared = new Set<CollectionId>(FACTORY_COLLECTIONS.map((entry) => entry.id));
    for (const row of FACTORY_PRESETS) expect(declared.has(row.collection), row.id).toBe(true);
  });
});

describe('evidence links', () => {
  it('resolves every library id to a real entry', () => {
    for (const row of FACTORY_PRESETS) {
      for (const id of row.libraryEntryIds) {
        expect(libraryEntry(id), `${row.id} -> library:${id}`).toBeDefined();
      }
    }
  });

  it('resolves every archive id to a real entry', () => {
    for (const row of FACTORY_PRESETS) {
      for (const id of row.archiveEntryIds) {
        expect(archiveEntry(id), `${row.id} -> archive:${id}`).toBeDefined();
      }
    }
  });

  it('resolves every id reported by referencedEvidenceIds', () => {
    const { library, archive } = referencedEvidenceIds();
    expect(library.length).toBeGreaterThan(0);
    expect(archive.length).toBeGreaterThan(0);
    for (const id of library) expect(libraryEntry(id), id).toBeDefined();
    for (const id of archive) expect(archiveEntry(id), id).toBeDefined();
  });

  it('never links a context-only archive record as if it were a frequency', () => {
    for (const row of FACTORY_PRESETS) {
      for (const id of row.archiveEntryIds) {
        expect(archiveEntry(id)?.contextOnly ?? false, `${row.id} -> ${id}`).toBe(false);
      }
    }
  });

  it('links evidence, or classifies as something that does not need any', () => {
    // A row with no links has to be one whose standing is the arithmetic itself
    // (mathematical) or an explicit acoustic experiment. Anything claiming
    // research or tradition has to point at the record that carries it.
    for (const row of FACTORY_PRESETS) {
      const linked = row.libraryEntryIds.length + row.archiveEntryIds.length;
      if (linked === 0) {
        expect(['mathematical', 'experimental'], row.id).toContain(row.classification);
        expect(row.associations.length, row.id).toBeGreaterThan(0);
      }
    }
  });
});

describe('representation matches what the number is', () => {
  it('never offers a rate as a direct tone', () => {
    for (const row of FACTORY_PRESETS) {
      const { role, value } = row.sourceFrequency;
      if (role === 'modulation' || role === 'electromagnetic') {
        expect(RATE_KINDS.has(row.representation.kind), row.id).toBe(true);
        expect(row.safety.directToneAllowed, row.id).toBe(false);
        expect(value, row.id).toBeGreaterThan(0);
      }
    }
  });

  it('gives every rate something audible to ride on', () => {
    for (const row of FACTORY_PRESETS) {
      const { role } = row.sourceFrequency;
      if (role !== 'modulation' && role !== 'electromagnetic') continue;
      const { kind, carrierHz, modulationDepth, noiseColor } = row.representation;

      if (kind === 'noise-modulation') {
        // Modulated noise has no carrier: the noise itself is the thing moving.
        expect(carrierHz, row.id).toBeUndefined();
        expect(noiseColor, row.id).toBeDefined();
        expect(modulationDepth, row.id).toBeGreaterThan(0);
      } else {
        expect(typeof carrierHz, row.id).toBe('number');
        expect(carrierHz as number, row.id).toBeGreaterThanOrEqual(AUDIBLE_MIN_HZ);
        expect(carrierHz as number, row.id).toBeLessThanOrEqual(AUDIBLE_MAX_HZ);
      }
    }
  });

  it('requires headphones wherever channel separation is how the preset works', () => {
    for (const row of FACTORY_PRESETS) {
      const binaural =
        row.representation.kind === 'binaural' || row.representation.kind === 'binaural-centered';
      if (!binaural) continue;
      expect(row.safety.headphonesRecommended, row.id).toBe(true);
      expect(row.safety.output, row.id).toBe('headphones');
      expect(row.representation.calculationMode, row.id).toBe(
        row.representation.kind === 'binaural-centered' ? 'centered' : 'offset',
      );
    }
  });

  it('only calls something a tone when it is one', () => {
    for (const row of FACTORY_PRESETS) {
      if (row.sourceFrequency.role !== 'carrier') continue;
      expect(TONE_KINDS.has(row.representation.kind), row.id).toBe(true);
      expect(row.safety.directToneAllowed, row.id).toBe(true);
      expect(row.sourceFrequency.value, row.id).toBeGreaterThanOrEqual(AUDIBLE_MIN_HZ);
      expect(row.sourceFrequency.value, row.id).toBeLessThanOrEqual(AUDIBLE_MAX_HZ);
      // A tone is its own carrier; a second carrier field would be two answers
      // to "what pitch is this".
      expect(row.representation.carrierHz, row.id).toBeUndefined();
    }
  });

  it('holds no frequency for the rows that genuinely have none', () => {
    const noneHeld = FACTORY_PRESETS.filter((row) => row.sourceFrequency.role === 'unspecified');
    expect(noneHeld.length).toBe(3); // white, pink, brown — noise has a slope, not a frequency
    for (const row of noneHeld) {
      expect(row.sourceFrequency.value, row.id).toBe(0);
      expect(row.representation.kind, row.id).toBe('noise-modulation');
      expect(row.representation.modulationDepth, row.id).toBe(0);
      expect(row.representation.noiseColor, row.id).toBeDefined();
      expect(row.safety.directToneAllowed, row.id).toBe(false);
    }
  });

  it('keeps every modulation depth and noise level inside unit range', () => {
    for (const row of FACTORY_PRESETS) {
      const { modulationDepth, noiseLevel } = row.representation;
      if (typeof modulationDepth === 'number') {
        expect(modulationDepth, row.id).toBeGreaterThanOrEqual(0);
        expect(modulationDepth, row.id).toBeLessThanOrEqual(1);
      }
      if (typeof noiseLevel === 'number') {
        expect(noiseLevel, row.id).toBeGreaterThan(0);
        expect(noiseLevel, row.id).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('claims never travel alone', () => {
  it('answers every association, and answers medical ones substantively', () => {
    for (const row of FACTORY_PRESETS) {
      for (const association of row.associations) {
        expect(association.claim.trim().length, row.id).toBeGreaterThan(0);
        expect(association.currentEvidence.trim().length, row.id).toBeGreaterThan(0);
        if (association.medical) {
          // A medical claim answered in six words is not answered.
          expect(association.currentEvidence.trim().length, row.id).toBeGreaterThan(80);
        }
      }
    }
  });

  it('finds the medical associations as a set, each one answered', () => {
    const medical = presetsWithMedicalAssociations();
    expect(medical.length).toBeGreaterThan(5);
    for (const { preset, claims } of medical) {
      expect(claims.length, preset.id).toBeGreaterThan(0);
      for (const claim of claims) expect(claim.currentEvidence.length, preset.id).toBeGreaterThan(80);
    }
  });

  it('keeps disease language out of names, intents and tags', () => {
    const forbidden = [
      'cure',
      'cancer',
      'alzheimer',
      'parasite',
      'virus',
      'tumour',
      'tumor',
      'disease',
      'therapy',
      'treatment',
      'dna repair',
    ];
    for (const row of FACTORY_PRESETS) {
      const surfaces = [row.name, ...row.intent, ...row.tags].map((text) => text.toLowerCase());
      for (const surface of surfaces) {
        for (const word of forbidden) {
          expect(surface.includes(word), `${row.id}: "${surface}"`).toBe(false);
        }
      }
      // Aliases may carry what people type ("healing frequencies") but never a
      // disease claim.
      for (const alias of row.aliases.map((text) => text.toLowerCase())) {
        for (const word of ['cure', 'cancer', 'alzheimer', 'parasite', 'virus', 'kill']) {
          expect(alias.includes(word), `${row.id}: alias "${alias}"`).toBe(false);
        }
      }
    }
  });

  it('states the 528 Hz distinction on the preset itself', () => {
    const solfeggio = factoryPreset('solf-528');
    expect(solfeggio).toBeDefined();
    expect(solfeggio?.classification).toBe('traditional');
    expect(solfeggio?.archiveEntryIds).toContain('solfeggio-528');
    expect(solfeggio?.archiveEntryIds).toContain('tone-528-study');

    const medical = solfeggio?.associations.filter((entry) => entry.medical) ?? [];
    expect(medical.length).toBe(2);
    // One half names the claim, the other separates it from the study.
    expect(medical.some((entry) => /dna/i.test(entry.claim))).toBe(true);
    expect(medical.some((entry) => /nine|9 /i.test(entry.currentEvidence))).toBe(true);
    for (const entry of medical) {
      expect(/dna/i.test(entry.currentEvidence) || /cortisol|oxytocin/i.test(entry.currentEvidence)).toBe(
        true,
      );
    }
  });

  it('never claims 40 Hz treats anything', () => {
    for (const row of presetsInCollection('gamma-40')) {
      expect(row.classification).toBe('research');
      const medical = row.associations.filter((entry) => entry.medical);
      expect(medical.length, row.id).toBeGreaterThan(0);
      expect(
        medical.some((entry) => /not established/i.test(entry.currentEvidence)),
        row.id,
      ).toBe(true);
    }
  });
});

describe('Schumann-inspired says what it is not', () => {
  const rows = presetsInCollection('schumann-inspired');

  it('carries the electromagnetic role on every row', () => {
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.sourceFrequency.role, row.id).toBe('electromagnetic');
      expect(row.safety.directToneAllowed, row.id).toBe(false);
    }
  });

  it('states on every electromagnetic row that headphones do not reproduce the phenomenon', () => {
    // Not just this shelf: any row anywhere that borrows an electromagnetic
    // number owes the same sentence, including the modulated-noise one.
    const electromagnetic = FACTORY_PRESETS.filter(
      (row) => row.sourceFrequency.role === 'electromagnetic',
    );
    expect(electromagnetic.length).toBeGreaterThan(rows.length);
    for (const row of electromagnetic) {
      const text = row.associations.map((entry) => entry.currentEvidence).join(' ');
      expect(/headphones produce sound/i.test(text), row.id).toBe(true);
      expect(/electromagnetic/i.test(text), row.id).toBe(true);
    }
  });

  it('holds the five measured modes', () => {
    expect(rows.map((row) => row.sourceFrequency.value)).toEqual([7.83, 14.3, 20.8, 27.3, 33.8]);
  });
});

describe('cosmic octave arithmetic', () => {
  it('derives every shipped value from its stated period and octave count', () => {
    for (const derivation of COSMIC_OCTAVE_DERIVATIONS) {
      const recomputed = Math.pow(2, derivation.octaves) / derivation.periodSeconds;
      // The derivation is the assertion: period, doubled `octaves` times.
      expect(derivation.computedHz, derivation.label).toBeCloseTo(recomputed, 12);
      expect(Math.abs(derivation.computedHz - derivation.publishedHz), derivation.label).toBeLessThan(
        COSMIC_OCTAVE_TOLERANCE_HZ,
      );
    }
  });

  it('states the periods it claims to use', () => {
    const byId = new Map(COSMIC_OCTAVE_DERIVATIONS.map((entry) => [entry.presetId, entry]));
    const tropicalYear = 365.24219 * 86400;

    expect(byId.get('cosmic-136')?.periodSeconds).toBeCloseTo(tropicalYear, 6);
    expect(byId.get('cosmic-136')?.octaves).toBe(32);

    expect(byId.get('cosmic-194')?.periodSeconds).toBe(86400);
    expect(byId.get('cosmic-194')?.octaves).toBe(24);

    expect(byId.get('cosmic-172')?.periodSeconds).toBeCloseTo(25920 * tropicalYear, 3);
    expect(byId.get('cosmic-172')?.octaves).toBe(47);

    expect(byId.get('cosmic-210')?.periodSeconds).toBeCloseTo(29.530588 * 86400, 6);
    expect(byId.get('cosmic-210')?.octaves).toBe(29);
  });

  it('ships exactly the four derivations it can account for', () => {
    const rows = presetsInCollection('cosmic-octave');
    expect(rows).toHaveLength(COSMIC_OCTAVE_DERIVATIONS.length);
    for (const derivation of COSMIC_OCTAVE_DERIVATIONS) {
      const row = factoryPreset(derivation.presetId);
      expect(row, derivation.presetId).toBeDefined();
      expect(row?.sourceFrequency.value, derivation.presetId).toBe(derivation.publishedHz);
      expect(row?.classification, derivation.presetId).toBe('mathematical');
    }
    // 126.22 Hz is deliberately absent: at 2^28 it implies a 24.615-day period,
    // which matches no astronomical figure this repository can source. It ships
    // when a period and a source can be stated, and not before.
    expect(presetsAtFrequency(126.22, 0.05)).toHaveLength(0);
  });
});

describe('the interval comparison comes out of the theory module', () => {
  it('derives both fifths rather than transcribing them', () => {
    expect(JUST_FIFTH_HZ).toBe(330);
    expect(TEMPERED_FIFTH_HZ).toBeCloseTo(329.6275569128699, 10);
    expect(FIFTH_BEAT_HZ).toBeCloseTo(JUST_FIFTH_HZ - TEMPERED_FIFTH_HZ, 12);
    // The tempered fifth is famously about two cents narrow.
    expect(FIFTH_CENTS_NARROW).toBeCloseTo(-1.955, 3);
  });

  it('plays that difference as the beat it actually is', () => {
    const row = factoryPreset('af-fifth-comparison');
    expect(row?.representation.kind).toBe('monaural');
    expect(row?.representation.carrierHz).toBe(TEMPERED_FIFTH_HZ);
    expect(row?.sourceFrequency.value).toBe(FIFTH_BEAT_HZ);
    expect(row?.sourceFrequency.role).toBe('modulation');
    expect(row?.safety.directToneAllowed).toBe(false);
  });
});

describe('the just scale under the chakra names', () => {
  it('is a just-intonation major scale on C = 256 Hz', () => {
    expect(HARMONIC_ROOT_HZ).toBe(256);
    expect(HARMONIC_SCALE.map((step) => step.ratio)).toEqual([
      [1, 1],
      [9, 8],
      [5, 4],
      [4, 3],
      [3, 2],
      [5, 3],
      [15, 8],
    ]);
    for (const step of HARMONIC_SCALE) {
      expect(step.exactHz, step.name).toBeCloseTo(justInterval(256, step.interval), 12);
      expect(step.exactHz, step.name).toBeCloseTo((256 * step.ratio[0]) / step.ratio[1], 12);
    }
  });

  it('is exact on five steps and rounded on two, by under a fifth of a cent', () => {
    const exact = HARMONIC_SCALE.filter((step) => step.centsFromJust === 0);
    expect(exact.map((step) => step.publishedHz)).toEqual([256, 288, 320, 384, 480]);

    const rounded = HARMONIC_SCALE.filter((step) => step.centsFromJust !== 0);
    expect(rounded.map((step) => step.publishedHz)).toEqual([341.3, 426.7]);
    for (const step of rounded) {
      expect(Math.abs(step.centsFromJust), step.name).toBeLessThan(0.2);
      expect(Math.abs(step.centsFromJust), step.name).toBeGreaterThan(0.1);
    }
  });

  it('ships one preset per step, with the published value', () => {
    const rows = presetsInCollection('harmonic-traditional');
    expect(rows).toHaveLength(HARMONIC_SCALE.length);
    for (const step of HARMONIC_SCALE) {
      const row = factoryPreset(step.presetId);
      expect(row?.sourceFrequency.value, step.presetId).toBe(step.publishedHz);
      expect(row?.classification, step.presetId).toBe('traditional');
      // The chakra mapping is named as modern on every row.
      const evidence = row?.associations.map((entry) => entry.currentEvidence).join(' ') ?? '';
      expect(/twentieth-century/i.test(evidence), step.presetId).toBe(true);
    }
  });
});

describe('brainwave bands are presented as conventions', () => {
  it('records both the conventional and the clinical boundaries', () => {
    expect(BRAINWAVE_BANDS.map((band) => band.id)).toEqual([
      'delta',
      'theta',
      'alpha',
      'beta',
      'gamma',
    ]);
    const beta = BRAINWAVE_BANDS.find((band) => band.id === 'beta');
    // The whole point: the two sources disagree, and the data says so.
    expect(beta?.conventional.fromHz).toBe(13);
    expect(beta?.clinical.fromHz).toBe(14);
    expect(BAND_BOUNDARY_NOTE).toMatch(/convention/i);
  });

  it('links every band to real entries', () => {
    for (const band of BRAINWAVE_BANDS) {
      expect(band.libraryEntryIds.length, band.id).toBeGreaterThan(0);
      for (const id of band.libraryEntryIds) expect(libraryEntry(id), id).toBeDefined();
      for (const id of band.archiveEntryIds) expect(archiveEntry(id), id).toBeDefined();
      expect(band.boundaryNote.length, band.id).toBeGreaterThan(40);
    }
  });

  it('places each lab rate in a band', () => {
    expect(bandForRate(2)?.id).toBe('delta');
    expect(bandForRate(6)?.id).toBe('theta');
    expect(bandForRate(10)?.id).toBe('alpha');
    expect(bandForRate(15)?.id).toBe('beta');
    expect(bandForRate(40)?.id).toBe('gamma');
    expect(bandForRate(0.1)).toBeUndefined();

    for (const row of presetsInCollection('brainwave-lab')) {
      expect(bandForRate(row.sourceFrequency.value), row.id).toBeDefined();
    }
  });

  it('holds the twelve documented rates, each as a rate and not a tone', () => {
    const rows = presetsInCollection('brainwave-lab');
    expect(rows.map((row) => row.sourceFrequency.value)).toEqual([
      2, 4, 5, 6, 7.5, 8, 10, 12, 15, 20, 30, 40,
    ]);
    for (const row of rows) {
      expect(row.sourceFrequency.role, row.id).toBe('modulation');
      expect(row.safety.directToneAllowed, row.id).toBe(false);
      expect(row.representation.kind, row.id).toBe('binaural');
      expect(row.representation.carrierHz, row.id).toBe(220);
    }
  });
});

describe('search finds what people type', () => {
  // The terms are not hypothetical: these are the words the product brief lists
  // as the ones someone arrives already carrying.
  const cases: Array<{ query: string; mustInclude: string[] }> = [
    { query: '528', mustInclude: ['solf-528', 'tuning-528'] },
    { query: '528 Hz', mustInclude: ['solf-528', 'tuning-528'] },
    { query: '432', mustInclude: ['tuning-a432'] },
    { query: '7.83', mustInclude: ['earth-783', 'noise-brown-783'] },
    { query: 'schumann', mustInclude: ['earth-783', 'earth-3380'] },
    { query: 'solfeggio', mustInclude: ['solf-174', 'solf-528', 'solf-963'] },
    { query: 'theta', mustInclude: ['bw-6', 'well-meditate', 'noise-pink-theta-6'] },
    { query: 'alpha', mustInclude: ['bw-10', 'well-relax'] },
    { query: 'gamma', mustInclude: ['gamma40-am', 'gamma40-isochronic'] },
    { query: '40 Hz', mustInclude: ['gamma40-am', 'bw-40', 'noise-pink-gamma-40'] },
    { query: 'meditation', mustInclude: ['well-meditate'] },
    { query: 'sleep', mustInclude: ['noise-sleep', 'well-deep-rest'] },
    { query: 'focus', mustInclude: ['well-focus', 'noise-focus'] },
    { query: 'healing frequencies', mustInclude: ['solf-528', 'ht-256'] },
    { query: 'brainwave', mustInclude: ['bw-2', 'bw-40'] },
    { query: 'chakra', mustInclude: ['ht-256', 'ht-480'] },
    { query: 'pink noise', mustInclude: ['noise-pink'] },
  ];

  for (const { query, mustInclude } of cases) {
    it(`finds something sensible for "${query}"`, () => {
      const results = searchPresets(query);
      expect(results.length, query).toBeGreaterThan(0);
      const ids = results.map((result) => result.preset.id);
      for (const id of mustInclude) expect(ids, query).toContain(id);
    });
  }

  it('labels every result with its classification', () => {
    for (const { query } of cases) {
      for (const result of searchPresets(query)) {
        expect(result.classification).toBe(result.preset.classification);
        expect(result.classificationLabel.length, query).toBeGreaterThan(0);
        expect(result.classificationNote.length, query).toBeGreaterThan(20);
        expect(result.matchedOn.length, `${query} -> ${result.preset.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('puts the tone people mean at the top for a bare number', () => {
    expect(searchPresets('528')[0]?.preset.sourceFrequency.value).toBe(528);
    expect(searchPresets('432')[0]?.preset.id).toBe('tuning-a432');
    expect(searchPresets('7.83')[0]?.preset.sourceFrequency.value).toBe(7.83);
  });

  it('returns the whole library for an empty query rather than nothing', () => {
    expect(searchPresets('  ')).toHaveLength(FACTORY_PRESETS.length);
    expect(searchPresets('')[0]?.preset.collection).toBe('wellness');
  });

  it('returns nothing for a query that means nothing here', () => {
    expect(searchPresets('zzzqqq')).toHaveLength(0);
  });

  it('narrows by collection, classification and limit', () => {
    expect(searchPresets('528', { collection: 'solfeggio' }).map((r) => r.preset.id)).toEqual([
      'solf-528',
    ]);
    const traditional = searchPresets('', { classification: 'traditional' });
    expect(traditional.every((r) => r.preset.classification === 'traditional')).toBe(true);
    expect(searchPresets('', { limit: 3 })).toHaveLength(3);
  });

  it('does not confuse an audible pitch with a band', () => {
    // 528 Hz is a pitch. It is not "gamma" merely because 528 > 30.
    const ids = searchPresets('gamma').map((result) => result.preset.id);
    expect(ids).not.toContain('solf-528');
    expect(ids).not.toContain('tuning-528');
  });

  it('finds presets at a frequency without counting carriers', () => {
    expect(presetsAtFrequency(528).map((row) => row.id).sort()).toEqual(['solf-528', 'tuning-528']);
    // 220 Hz is the Brainwave Lab carrier; only the tone preset is *at* 220 Hz.
    expect(presetsAtFrequency(220).map((row) => row.id)).toEqual(['af-220']);
  });
});

describe('a claim is findable, and answered when it is found', () => {
  /*
   * Someone types "DNA repair" because that is the phrase they met. If the
   * library answers with nothing, they go back to whatever told them the claim
   * in the first place — which is the one outcome worth avoiding. 528 Hz
   * carries the claim *and* the paragraph explaining that nothing has
   * demonstrated it, so being findable is how the answer reaches the person
   * asking the question.
   *
   * Search indexed names, aliases, tags and summaries but not the claims, so
   * before this the app's best-argued rebuttal was unreachable by the only
   * words anybody would use to look for it.
   */
  it('finds 528 Hz from the claim attached to it, not just its number', () => {
    for (const query of ['dna', 'dna repair', 'repairs dna']) {
      const results = searchPresets(query);
      expect(results.length, `"${query}" found nothing`).toBeGreaterThan(0);
      const found = results.find((result) => result.preset.id === 'solf-528');
      expect(found, `"${query}" did not reach 528 Hz`).toBeDefined();
      expect(found!.matchedOn).toContain('popular-claim');
    }
  });

  it('says the match came from a claim rather than from anything the app asserts', () => {
    const [top] = searchPresets('dna repair');
    // The row has to be able to say *why* it is here. A claim phrase reaching a
    // preset silently would read as the app agreeing with the phrase.
    expect(top.matchedOn).toContain('popular-claim');
    expect(top.classification).toBe('traditional');
  });

  it('never lets a claim phrase outrank a real name or number', () => {
    // '528' is an alias and a frequency; it must beat the claim match.
    const byNumber = searchPresets('528');
    expect(byNumber[0].matchedOn.some((field) => field !== 'popular-claim')).toBe(true);
  });

  it('answers every claim it can be found by', () => {
    // The pairing rule, at the point it actually matters: anything reachable by
    // a claim carries the sentence that answers that claim.
    for (const result of searchPresets('dna repair')) {
      for (const association of result.preset.associations) {
        expect(association.currentEvidence.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
