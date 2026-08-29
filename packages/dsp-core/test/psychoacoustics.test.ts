import { describe, expect, it } from 'vitest';

import {
  AB_BEAT_HZ,
  EQUAL_LOUDNESS_HIGH_HZ,
  EQUAL_LOUDNESS_LOW_HZ,
  LADDER_BASE_HZ,
  LADDER_SEPARATIONS_HZ,
  RESIDUE_CARRIER_HZ,
  RESIDUE_FUNDAMENTAL_HZ,
  RESIDUE_HARMONIC_NUMBERS,
  RESIDUE_PARTIALS_HZ,
  factoryPreset,
  presetsInCollection,
} from '../src/presets/factory.js';
import { presetToProtocol } from '../src/presets/compile.js';
import { renderProtocolOffline } from '../src/engine/offline.js';
import type { FrequencyPreset } from '../src/presets/types.js';
import { crossingRate, envelope, magnitudeAt, peak, rms } from './helpers.js';

/**
 * The psychoacoustics rows on Acoustic Fundamentals.
 *
 * Every other preset test in this suite checks what a row *says*. These check
 * what it *does*, because each of these rows makes a claim about a difference
 * between a signal and the hearing of it — "there is no 100 Hz in this sound",
 * "neither channel fluctuates", "the envelope is still at full depth" — and a
 * claim of that shape is worth nothing unless the shipped configuration is
 * rendered and measured.
 *
 * So every assertion below runs the real `SessionRenderer` through
 * `renderProtocolOffline`, on the real shipped preset row, and measures the
 * output. Where a row says a frequency is absent, the test asks for its
 * magnitude and requires a floor; where a row says three partials stand in a
 * 1 : 2 : 1 ratio, the test measures all three and divides.
 *
 * ## Measurement conventions
 *
 * Windows start at ten seconds, which is past the four-second master fade-in
 * and nowhere near the fade-out, so what is measured is the signal rather than
 * an envelope. `magnitudeAt` runs a Goertzel over exactly one second, giving
 * one-hertz bins: every frequency named here is a whole number of hertz and
 * therefore exactly on a bin, so a component that is genuinely absent reads as
 * numerical noise rather than as leakage from its neighbours.
 */

/** Seconds of rendered audio each measurement works from. */
const RENDER_SEC = 20;
/** Where a measurement window opens. Past the fade-in, far from the fade-out. */
const MEASURE_AT_SEC = 10;

/**
 * The largest magnitude a frequency may show and still count as absent.
 *
 * Four orders below the quietest component any of these rows actually emits
 * (0.045 for a missing-fundamental sideband), and far above the numerical floor
 * of a one-second Goertzel on an on-bin sinusoid, which measures below 1e-8.
 */
const ABSENT = 1e-4;

function render(id: string) {
  const row = factoryPreset(id);
  expect(row, id).toBeDefined();
  const compiled = presetToProtocol(row!);
  if (!compiled.ok) throw new Error(`${id}: ${compiled.failure.code}: ${compiled.failure.message}`);
  const rendered = renderProtocolOffline(compiled.protocol, { maxSeconds: RENDER_SEC });
  return { row: row!, statement: compiled.statement, ...rendered };
}

/** Magnitude of one frequency in one channel, over a one-second window. */
function at(signal: Float32Array, hz: number, sampleRate: number): number {
  return magnitudeAt(signal, hz, sampleRate, MEASURE_AT_SEC, 1);
}

/**
 * Peak divided by RMS, over a window long enough to contain several beats.
 *
 * A cutoff-free way to ask how many equal tones are summed in a channel. One
 * sine gives √2; two equal sines summed give 2, because their peaks coincide
 * once per beat while the mean power only doubles. It is the measurement that
 * still works at a hundred beats a second, where an envelope follower cannot
 * separate the beat from the rectified carrier.
 */
function crestFactor(signal: Float32Array, sampleRate: number): number {
  const from = MEASURE_AT_SEC * sampleRate;
  const to = signal.length;
  return peak(signal, from, to) / rms(signal, from, to);
}

/** Peak-to-trough depth of the amplitude envelope, 0 for a steady tone. */
function envelopeDepth(signal: Float32Array, sampleRate: number, cutoffHz: number): number {
  const window = signal.subarray(MEASURE_AT_SEC * sampleRate) as Float32Array;
  const env = envelope(window, sampleRate, cutoffHz);
  // The follower needs a moment to charge; the first half-second is its
  // settling transient rather than the signal's.
  const skip = Math.round(0.5 * sampleRate);
  let min = Infinity;
  let max = 0;
  for (let i = skip; i < env.length; i++) {
    if (env[i] < min) min = env[i];
    if (env[i] > max) max = env[i];
  }
  return (max - min) / (max + min);
}

/** Rate of the amplitude envelope, in fluctuations per second. */
function envelopeRate(signal: Float32Array, sampleRate: number, cutoffHz: number): number {
  const window = signal.subarray(MEASURE_AT_SEC * sampleRate) as Float32Array;
  const env = envelope(window, sampleRate, cutoffHz);
  return crossingRate(env, sampleRate, Math.round(0.5 * sampleRate), env.length);
}

const DEMONSTRATIONS = [
  'af-beat-binaural',
  'af-beat-monaural',
  'af-roughness-25',
  'af-two-tones-100',
  'af-missing-fundamental',
  'af-100',
  'af-loudness-3000',
  'af-loudness-60',
];

describe('the demonstration rows are on the shelf and make no claim', () => {
  it('adds eight rows to Acoustic Fundamentals without disturbing the six arithmetic ones', () => {
    const shelf = presetsInCollection('acoustic-fundamentals').map((row) => row.id);
    expect(shelf).toEqual([
      'af-110',
      'af-220',
      'af-440',
      'af-880',
      'af-harmonics-110',
      'af-fifth-comparison',
      ...DEMONSTRATIONS,
    ]);
  });

  it('classifies every one as arithmetic or as measured hearing, and never as wellness', () => {
    for (const id of DEMONSTRATIONS) {
      const row = factoryPreset(id)!;
      // These rows demonstrate how hearing works. They make no claim about an
      // effect on anybody, so they must not carry a classification that reads
      // as one — `traditional`, `experimental` and the rest all imply a purpose
      // these have not got.
      expect(['mathematical', 'research'], id).toContain(row.classification);
      expect(
        row.associations.some((entry) => entry.medical),
        id,
      ).toBe(false);
      // Wellness vocabulary, not physics vocabulary: "energy at 300 Hz" is a
      // spectrum reading and belongs in a summary, while any of these would be
      // this shelf quietly acquiring a purpose.
      for (const surface of [row.name, row.summary, ...row.intent, ...row.tags]) {
        expect(
          /heal|cure|therap|treatment|chakra|detox|wellness|realign/i.test(surface),
          `${id}: ${surface}`,
        ).toBe(false);
      }
    }
  });

  it('compiles every one, and says what it will play before it plays it', () => {
    for (const id of DEMONSTRATIONS) {
      const compiled = presetToProtocol(factoryPreset(id)!);
      expect(compiled.ok, id).toBe(true);
      if (!compiled.ok) continue;
      expect(compiled.statement.summary.length, id).toBeGreaterThan(20);
    }
  });
});

describe('the missing fundamental is genuinely missing', () => {
  /*
   * The one row on this shelf whose whole point is an absence. Full-depth
   * amplitude modulation of a carrier C at rate R is, by the product-to-sum
   * identity, three steady tones at C - R, C and C + R in the amplitude ratio
   * 1 : 2 : 1. With C = 3R those are harmonics 2, 3 and 4 of R — and the
   * spectrum has nothing at R at all. Everything below measures that.
   */

  it('derives its partials from the carrier and the rate rather than listing them', () => {
    expect(RESIDUE_CARRIER_HZ).toBe(RESIDUE_FUNDAMENTAL_HZ * 3);
    expect([...RESIDUE_PARTIALS_HZ]).toEqual([200, 300, 400]);
    expect([...RESIDUE_HARMONIC_NUMBERS]).toEqual([2, 3, 4]);

    const row = factoryPreset('af-missing-fundamental')!;
    expect(row.sourceFrequency.value).toBe(RESIDUE_FUNDAMENTAL_HZ);
    // A rate, not a pitch — which is exactly the claim, since the pitch heard
    // is a hundred hertz and no part of the signal is.
    expect(row.sourceFrequency.role).toBe('modulation');
    expect(row.safety.directToneAllowed).toBe(false);
    expect(row.representation.kind).toBe('am');
    expect(row.representation.carrierHz).toBe(RESIDUE_CARRIER_HZ);
    // Anything below full depth shrinks the sidebands, and the sidebands are
    // two of the three harmonics the demonstration is made of.
    expect(row.representation.modulationDepth).toBe(1);
  });

  it('puts energy at 200, 300 and 400 Hz and none whatever at 100 Hz', () => {
    const { left, right, sampleRate } = render('af-missing-fundamental');

    for (const channel of [left, right]) {
      // The absence, first, because it is the claim.
      expect(at(channel, RESIDUE_FUNDAMENTAL_HZ, sampleRate)).toBeLessThan(ABSENT);

      for (const hz of RESIDUE_PARTIALS_HZ) {
        expect(at(channel, hz, sampleRate), `${hz} Hz`).toBeGreaterThan(0.04);
      }

      // Nothing anywhere else either: not the fifth and sixth harmonics, not a
      // subharmonic, not a stray sideband of the sidebands.
      for (const hz of [50, 100, 150, 250, 350, 500, 600, 700, 800]) {
        expect(at(channel, hz, sampleRate), `${hz} Hz`).toBeLessThan(ABSENT);
      }
    }
  });

  it('stands the three partials in the 1 : 2 : 1 ratio the identity predicts', () => {
    const { left, sampleRate } = render('af-missing-fundamental');
    const [low, middle, high] = RESIDUE_PARTIALS_HZ.map((hz) => at(left, hz, sampleRate));

    expect(low / middle).toBeCloseTo(0.5, 3);
    expect(high / middle).toBeCloseTo(0.5, 3);
    expect(low / high).toBeCloseTo(1, 3);
  });

  it('repeats as a group a hundred times a second, which is the pitch people report', () => {
    const { left, sampleRate } = render('af-missing-fundamental');
    // The three partials are consecutive harmonics of 100 Hz, so the waveform
    // they sum to is periodic at 100 Hz even though no component is.
    expect(envelopeRate(left, sampleRate, 400)).toBeCloseTo(RESIDUE_FUNDAMENTAL_HZ, 0);
  });

  it('names in its summary exactly the frequencies the spectrum contains', () => {
    const row = factoryPreset('af-missing-fundamental')!;
    for (const hz of RESIDUE_PARTIALS_HZ) expect(row.summary).toContain(String(hz));
    expect(row.summary).toContain(String(RESIDUE_FUNDAMENTAL_HZ));
  });

  it('is answered by a reference tone that is the exact mirror of it', () => {
    // The demonstration is an assertion unless the pitch can be checked against
    // the real thing, so the reference row has to be the one signal the
    // demonstration is not: energy at 100 Hz and nothing at the partials.
    const { row, left, sampleRate } = render('af-100');
    expect(row.sourceFrequency.value).toBe(RESIDUE_FUNDAMENTAL_HZ);
    expect(row.sourceFrequency.role).toBe('carrier');
    expect(row.representation.kind).toBe('direct');

    expect(at(left, RESIDUE_FUNDAMENTAL_HZ, sampleRate)).toBeGreaterThan(0.1);
    for (const hz of RESIDUE_PARTIALS_HZ) {
      expect(at(left, hz, sampleRate), `${hz} Hz`).toBeLessThan(ABSENT);
    }
  });
});

describe('binaural against monaural, the same rate by two mechanisms', () => {
  const beatHz = AB_BEAT_HZ;
  const upperHz = LADDER_BASE_HZ + beatHz;

  it('puts one tone in each ear, and nothing in either that fluctuates', () => {
    const { left, right, sampleRate } = render('af-beat-binaural');

    // Left is the carrier alone; right is the carrier plus the beat alone.
    expect(at(left, LADDER_BASE_HZ, sampleRate)).toBeGreaterThan(0.1);
    expect(at(left, upperHz, sampleRate)).toBeLessThan(ABSENT);
    expect(at(right, upperHz, sampleRate)).toBeGreaterThan(0.1);
    expect(at(right, LADDER_BASE_HZ, sampleRate)).toBeLessThan(ABSENT);
    // And no acoustic component at the beat rate anywhere.
    expect(at(left, beatHz, sampleRate)).toBeLessThan(ABSENT);
    expect(at(right, beatHz, sampleRate)).toBeLessThan(ABSENT);

    // A single sine has a crest factor of √2 and a flat envelope. Both
    // channels do, which is the claim: the fluctuation is in neither of them.
    expect(crestFactor(left, sampleRate)).toBeCloseTo(Math.SQRT2, 2);
    expect(crestFactor(right, sampleRate)).toBeCloseTo(Math.SQRT2, 2);
    expect(envelopeDepth(left, sampleRate, 30)).toBeLessThan(0.05);
    expect(envelopeDepth(right, sampleRate, 30)).toBeLessThan(0.05);
  });

  it('puts both tones in both ears monaurally, so each channel beats on its own', () => {
    const { left, right, sampleRate } = render('af-beat-monaural');

    for (const channel of [left, right]) {
      expect(at(channel, LADDER_BASE_HZ, sampleRate)).toBeGreaterThan(0.05);
      expect(at(channel, upperHz, sampleRate)).toBeGreaterThan(0.05);
      // Still nothing acoustic at 8 Hz: the beat is an envelope, not a tone,
      // and no speaker emits it either.
      expect(at(channel, beatHz, sampleRate)).toBeLessThan(ABSENT);

      expect(crestFactor(channel, sampleRate)).toBeCloseTo(2, 1);
      expect(envelopeDepth(channel, sampleRate, 30)).toBeGreaterThan(0.7);
      expect(envelopeRate(channel, sampleRate, 30)).toBeCloseTo(beatHz, 0);
    }
  });

  it('shows what a speaker does to the binaural row, which is the whole distinction', () => {
    // Mixing the two channels is what a speaker does before the sound reaches
    // either ear. Do it to the binaural row and the result beats — identically
    // to the monaural row, because at that point it *is* the monaural row. The
    // preset says as much in as many words; this measures it.
    const binaural = render('af-beat-binaural');
    const monaural = render('af-beat-monaural');
    const { sampleRate } = binaural;

    const downmix = new Float32Array(binaural.left.length);
    for (let i = 0; i < downmix.length; i++) {
      downmix[i] = 0.5 * (binaural.left[i] + binaural.right[i]);
    }

    const downmixDepth = envelopeDepth(downmix, sampleRate, 30);
    const monauralDepth = envelopeDepth(monaural.left, sampleRate, 30);
    expect(downmixDepth).toBeGreaterThan(0.7);
    expect(downmixDepth).toBeCloseTo(monauralDepth, 3);
    expect(envelopeRate(downmix, sampleRate, 30)).toBeCloseTo(beatHz, 0);

    // Which is why the pair has to stay a pair: two mechanisms, one rate, and
    // only one of them offered on a speaker.
    const binauralRow = factoryPreset('af-beat-binaural')!;
    const monauralRow = factoryPreset('af-beat-monaural')!;
    expect(binauralRow.representation.kind).toBe('binaural');
    expect(monauralRow.representation.kind).toBe('monaural');
    expect(binauralRow.sourceFrequency.value).toBe(monauralRow.sourceFrequency.value);
    expect(binauralRow.representation.carrierHz).toBe(monauralRow.representation.carrierHz);
    expect(binauralRow.safety.output).toBe('headphones');
    expect(monauralRow.safety.output).toBe('headphones-or-speakers');
  });
});

describe('the two-tone ladder: one signal, three readings of it', () => {
  const rungs: Array<{ id: string; separationHz: number }> = [
    { id: 'af-beat-monaural', separationHz: LADDER_SEPARATIONS_HZ[0] },
    { id: 'af-roughness-25', separationHz: LADDER_SEPARATIONS_HZ[1] },
    { id: 'af-two-tones-100', separationHz: LADDER_SEPARATIONS_HZ[2] },
  ];

  it('changes exactly one number from rung to rung', () => {
    expect([...LADDER_SEPARATIONS_HZ]).toEqual([8, 25, 100]);
    for (const { id, separationHz } of rungs) {
      const row: FrequencyPreset = factoryPreset(id)!;
      expect(row.representation.kind, id).toBe('monaural');
      expect(row.representation.carrierHz, id).toBe(LADDER_BASE_HZ);
      expect(row.sourceFrequency.value, id).toBe(separationHz);
      expect(row.sourceFrequency.role, id).toBe('modulation');
    }
  });

  it('emits two equal sine tones at every separation, and nothing else', () => {
    for (const { id, separationHz } of rungs) {
      const { left, sampleRate } = render(id);
      const lower = at(left, LADDER_BASE_HZ, sampleRate);
      const upper = at(left, LADDER_BASE_HZ + separationHz, sampleRate);

      expect(lower, id).toBeGreaterThan(0.05);
      expect(upper, id).toBeGreaterThan(0.05);
      // Equal to within a tenth of a percent, which is what puts the envelope
      // at full depth rather than merely deep.
      expect(upper / lower, id).toBeCloseTo(1, 3);

      // Neither the difference nor the sum is present as a tone: a difference
      // frequency you can hear is not a difference frequency in the air.
      expect(at(left, separationHz, sampleRate), `${id} difference`).toBeLessThan(ABSENT);
      expect(
        at(left, 2 * LADDER_BASE_HZ + separationHz, sampleRate),
        `${id} sum`,
      ).toBeLessThan(ABSENT);
      // Nor either of the classical combination tones. They are generated in
      // the ear, so a demonstration that had them in the file would be
      // demonstrating nothing.
      expect(
        at(left, LADDER_BASE_HZ - separationHz, sampleRate),
        `${id} 2f1 - f2`,
      ).toBeLessThan(ABSENT);
    }
  });

  it('keeps the envelope at full depth all the way up the ladder', () => {
    // The point the copy makes and the reason the ladder is worth shipping: the
    // signal does not change in kind between a beat, a roughness and two
    // pitches. Two equal sines always sum to a full-depth envelope at their
    // difference, so the crest factor is 2 at every rung — at eight
    // fluctuations a second, which you count, and at a hundred, which you do
    // not hear as fluctuation at all.
    for (const { id } of rungs) {
      const { left, sampleRate } = render(id);
      expect(crestFactor(left, sampleRate), id).toBeCloseTo(2, 1);
    }
  });

  it('measures the fluctuation rate at the two rungs slow enough to follow', () => {
    for (const { id, separationHz } of rungs.slice(0, 2)) {
      const { left, sampleRate } = render(id);
      // The follower's cutoff has to sit well above the rate being measured and
      // well below the 440 Hz carrier it is rectifying.
      expect(envelopeRate(left, sampleRate, separationHz * 4), id).toBeCloseTo(separationHz, 0);
    }
  });
});

describe('the same level is not the same loudness', () => {
  it('generates both tones at one amplitude, to within a few hundredths of a decibel', () => {
    const low = render('af-loudness-60');
    const high = render('af-loudness-3000');
    const from = MEASURE_AT_SEC * low.sampleRate;

    const lowRms = rms(low.left, from);
    const highRms = rms(high.left, from);
    const differenceDb = Math.abs(20 * Math.log10(lowRms / highRms));

    // Nothing in the app makes them different; the entire difference a listener
    // reports is their own frequency response. The residue measured here is the
    // master DC blocker leaning very slightly on 60 Hz.
    expect(differenceDb).toBeLessThan(0.05);
    expect(peak(low.left, from) / peak(high.left, from)).toBeCloseTo(1, 2);
  });

  it('plays each one as the single pure tone it says it is', () => {
    const cases: Array<{ id: string; hz: number; others: number[] }> = [
      { id: 'af-loudness-60', hz: EQUAL_LOUDNESS_LOW_HZ, others: [30, 120, 180, 3000] },
      { id: 'af-loudness-3000', hz: EQUAL_LOUDNESS_HIGH_HZ, others: [60, 1500, 6000, 9000] },
    ];
    for (const { id, hz, others } of cases) {
      const { row, left, sampleRate } = render(id);
      expect(row.sourceFrequency.value, id).toBe(hz);
      expect(row.sourceFrequency.role, id).toBe('carrier');
      expect(row.representation.kind, id).toBe('direct');

      expect(at(left, hz, sampleRate), id).toBeGreaterThan(0.1);
      for (const other of others) {
        expect(at(left, other, sampleRate), `${id} at ${other} Hz`).toBeLessThan(ABSENT);
      }
      // A pure sine and nothing else, harmonics included.
      expect(crestFactor(left, sampleRate), id).toBeCloseTo(Math.SQRT2, 2);
    }
  });

  it('sets the volume on the loud tone first, and says so on the row', () => {
    const shelf = presetsInCollection('acoustic-fundamentals').map((row) => row.id);
    // Order is data: whoever meets this pair should meet 3 kHz before 60 Hz, so
    // a level chosen for the quiet one is never inherited by the loud one.
    expect(shelf.indexOf('af-loudness-3000')).toBeLessThan(shelf.indexOf('af-loudness-60'));
    expect(factoryPreset('af-loudness-3000')!.summary).toMatch(/volume/i);
  });
});

// ---------------------------------------------------------------------------
// The harmonic series, which used to be four partials calling itself eight
// ---------------------------------------------------------------------------

describe('Harmonic series on 110 Hz sounds every partial it names', () => {
  /*
   * A row that had been shipping wrong. Its summary names eight partials —
   * 110 through 880 Hz — and explains that partial 5 is a major third and that
   * the seventh sits 31 cents flat of a tempered note. The harmonic node
   * carries `h1` to `h8`, but nothing could set them, so every stack in the
   * product took the descriptor's defaults, which are exactly zero from the
   * fifth partial up. The row produced four partials and described eight, and
   * the note about the seventh described a frequency that was not there.
   *
   * The test measures every partial the summary names, so the copy and the
   * audio cannot drift apart again in either direction.
   */
  const FUNDAMENTAL_HZ = 110;
  const PARTIALS = 8;

  it('emits all eight, in a falling series', () => {
    const { left, sampleRate } = render('af-harmonics-110');
    const levels = Array.from({ length: PARTIALS }, (_, index) =>
      at(left, FUNDAMENTAL_HZ * (index + 1), sampleRate),
    );

    for (const [index, level] of levels.entries()) {
      expect(level, `partial ${index + 1} at ${FUNDAMENTAL_HZ * (index + 1)} Hz`).toBeGreaterThan(
        ABSENT,
      );
    }
    // Each partial quieter than the one below it: a 1/n series, which is what
    // makes the stack read as one tone with a timbre rather than eight tones.
    for (let index = 1; index < levels.length; index++) {
      expect(levels[index], `partial ${index + 1} against ${index}`).toBeLessThan(levels[index - 1]);
    }
  });

  it('places them where integer multiplication puts them, and nowhere between', () => {
    const { left, sampleRate } = render('af-harmonics-110');
    // Half-way between partials: if the stack were mistuned, or if the levels
    // were being applied to the wrong node, energy would show up off the grid.
    for (let index = 1; index < PARTIALS; index++) {
      const between = FUNDAMENTAL_HZ * index + FUNDAMENTAL_HZ / 2;
      expect(at(left, between, sampleRate), `${between} Hz, between partials`).toBeLessThan(ABSENT);
    }
    // And nothing above the eighth, which is where the series is declared to stop.
    expect(at(left, FUNDAMENTAL_HZ * 9, sampleRate), '990 Hz').toBeLessThan(ABSENT);
  });

  it('names in its summary exactly the frequencies it emits', () => {
    // The assertion that ties the two halves together. Every frequency the copy
    // states is measured; a summary edit that adds a partial without adding the
    // level, or vice versa, fails here.
    const { row, left, sampleRate } = render('af-harmonics-110');
    const named = [...row.summary.matchAll(/(\d{3})\s*(?:,|and|Hz)/g)].map((m) => Number(m[1]));
    const partials = new Set(
      Array.from({ length: PARTIALS }, (_, index) => FUNDAMENTAL_HZ * (index + 1)),
    );
    const namedPartials = [...new Set(named)].filter((hz) => partials.has(hz));
    expect(namedPartials.length, 'the summary names partials by number').toBeGreaterThanOrEqual(7);
    for (const hz of namedPartials) {
      expect(at(left, hz, sampleRate), `${hz} Hz is named in the summary`).toBeGreaterThan(ABSENT);
    }
  });
});
