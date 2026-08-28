import {
  JUST_INTERVALS,
  centsBetween,
  justInterval,
  noteToFrequency,
  type JustIntervalName,
} from '../music/theory.js';
import { preset } from './make.js';
import type { FrequencyPreset, PopularAssociation } from './types.js';

/**
 * The pitch shelves: Solfeggio, Harmonic / Chakra, the tuning lab, the Cosmic
 * Octave and Acoustic Fundamentals.
 *
 * Everything here is a number you can actually hear as a pitch, which makes
 * these the easy rows technically and the hard ones editorially: a tone with a
 * name attached is exactly where a claim slips in unnoticed. The rule applied
 * throughout is that the preset states what the number *is* — a 1999
 * publication, a nineteenth-century congress, a small-integer ratio, a period
 * divided by two enough times — and links the record that carries the claim
 * rather than restating it.
 */

// ── 03 · Solfeggio ───────────────────────────────────────────────────────────

/**
 * The nine tones, with the factory names.
 *
 * The names are deliberately plain verbs and nouns. The circulating names for
 * these tones are things like "DNA repair", "toxin cleanse" and "God
 * frequency"; each of those is a claim, and shipping a claim as a label would
 * put it beyond the reach of the evidence panel that is supposed to answer it.
 *
 * Every row links the archive record that holds its documented origin and the
 * claim attached to it. None of them restates that claim here — the archive
 * versions its historical record and its evidence assessment separately, and a
 * second copy in the preset would drift the first time either changed.
 */
interface SolfeggioRow {
  id: string;
  label: string;
  hz: number;
  archiveId: string;
  summary: string;
  aliases: string[];
  /** Extra archive links, where a tone has research at the value as well as an origin. */
  alsoLinks?: string[];
  /**
   * Associations that belong to the preset rather than to the linked record.
   * Only 528 has any — see the note below it.
   */
  associations?: PopularAssociation[];
}

const SOLFEGGIO_ROWS: SolfeggioRow[] = [
  {
    id: 'solf-174',
    label: 'GROUND',
    hz: 174,
    archiveId: 'solfeggio-174',
    summary:
      'The lowest tone of the modern nine-tone set, and one of the three that arrived without the derivation the other six were given. Roughly F3 on a piano.',
    aliases: ['174', '174 Hz', 'solfeggio 174'],
  },
  {
    id: 'solf-285',
    label: 'RESTORE',
    hz: 285,
    archiveId: 'solfeggio-285',
    summary:
      'The second tone of the nine, also added without a stated derivation. It sits in the same digit-permutation family as 528 and 852.',
    aliases: ['285', '285 Hz', 'solfeggio 285'],
  },
  {
    id: 'solf-396',
    label: 'RELEASE',
    hz: 396,
    archiveId: 'solfeggio-396',
    summary:
      'The first of the six tones actually published in 1999, derived by digit-reducing verse numbers from Numbers chapter 7.',
    aliases: ['396', '396 Hz', 'UT 396', 'solfeggio 396'],
  },
  {
    id: 'solf-417',
    label: 'CHANGE',
    hz: 417,
    archiveId: 'solfeggio-417',
    summary:
      'The second published tone, and a digit rotation of 174 — the construction of the whole set is rotations of 174, 285 and 396.',
    aliases: ['417', '417 Hz', 'RE 417', 'solfeggio 417'],
  },
  {
    id: 'solf-528',
    label: 'TRANSFORM',
    hz: 528,
    archiveId: 'solfeggio-528',
    summary:
      'The best known tone of the set: a clear, bright pitch a little above the C above middle C. Its origin is a 1999 publication, not a surviving historical tuning, and it is the one tone here with any peer-reviewed work at the value at all.',
    aliases: ['528', '528 Hz', 'MI 528', 'solfeggio 528', 'love frequency', 'miracle tone'],
    // The archive holds the historical record and the DNA claim. What it cannot
    // hold, from a record about a 1999 book, is the distinction people actually
    // need: between *a study that played a 528 Hz-tuned recording* and *a claim
    // that 528 Hz repairs DNA*. Those are two different sentences, and the gap
    // between them is where every "scientifically proven" caption comes from —
    // so it is stated here, on the preset, where someone about to press play
    // will see it.
    alsoLinks: ['tone-528-study'],
    associations: [
      {
        claim:
          'That 528 Hz repairs DNA — the claim behind "the love frequency" and "the miracle tone" — and that this has been scientifically demonstrated.',
        medical: true,
        currentEvidence:
          'Nothing has demonstrated it. DNA repair is carried out by enzymes acting on chemical damage; no research shows an audible pitch influencing it and no mechanism has been proposed by which one would. The claim originates in a 1999 book of numerology, not in a laboratory.',
      },
      {
        claim: 'That the published 528 Hz research supports the DNA claim, because a study exists.',
        medical: true,
        currentEvidence:
          'A study exists and it is about something else. In 2018 nine people listened for five minutes to piano music tuned toward 528 Hz and to the same music at 440 Hz; salivary cortisol fell and oxytocin rose after the 528 Hz condition. That is nine participants, one session, several biomarkers and a low-tier journal — and it measured endocrine markers, not DNA. Acoustic exposure at 528 Hz having been studied is true; 528 Hz repairing DNA does not follow from it and remains unsupported.',
      },
    ],
  },
  {
    id: 'solf-639',
    label: 'CONNECT',
    hz: 639,
    archiveId: 'solfeggio-639',
    summary: 'The fourth published tone, a digit rotation of 396.',
    aliases: ['639', '639 Hz', 'FA 639', 'solfeggio 639'],
  },
  {
    id: 'solf-741',
    label: 'CLARIFY',
    hz: 741,
    archiveId: 'solfeggio-741',
    summary: 'The fifth published tone, a digit rotation of 174 and 417.',
    aliases: ['741', '741 Hz', 'SOL 741', 'solfeggio 741'],
  },
  {
    id: 'solf-852',
    label: 'REFLECT',
    hz: 852,
    archiveId: 'solfeggio-852',
    summary: 'The highest of the six published tones, a digit rotation of 285 and 528.',
    aliases: ['852', '852 Hz', 'LA 852', 'solfeggio 852'],
  },
  {
    id: 'solf-963',
    label: 'TRANSCEND',
    hz: 963,
    archiveId: 'solfeggio-963',
    summary:
      'The highest tone of the nine and the third of those added without a derivation. A rotation of 396, which is the only stated reason it is in the set.',
    aliases: ['963', '963 Hz', 'solfeggio 963', 'god frequency'],
  },
];

const SOLFEGGIO: FrequencyPreset[] = SOLFEGGIO_ROWS.map((row) =>
  preset({
    id: row.id,
    name: `${row.label} — ${row.hz} Hz`,
    collection: 'solfeggio',
    summary: row.summary,
    sourceFrequency: { value: row.hz, unit: 'Hz', role: 'carrier' },
    representation: { kind: 'direct' },
    durationSec: 900,
    intent: ['meditation', 'listening', 'relaxation'],
    classification: 'traditional',
    libraryEntryIds: ['solfeggio'],
    archiveEntryIds: [row.archiveId, ...(row.alsoLinks ?? [])],
    associations: row.associations ?? [],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: true,
      output: 'headphones-or-speakers',
    },
    aliases: [...row.aliases, 'solfeggio', 'healing frequencies', 'solfeggio frequencies'],
    tags: ['solfeggio', 'traditional', 'tone', String(row.hz)],
  }),
);

// ── 07 · Harmonic / Chakra ───────────────────────────────────────────────────

/**
 * What these seven numbers actually are.
 *
 * Checked rather than assumed: dividing each by 256 gives 1/1, 9/8, 5/4, 4/3,
 * 3/2, 5/3 and 15/8 — the just-intonation major scale, the one Ptolemy wrote
 * down as the intense diatonic and every subsequent theorist has re-derived.
 * Two of the seven are published as rounded decimals: the just fourth is
 * 1024/3 = 341.333… and the just sixth is 1280/3 = 426.666…, so 341.3 and 426.7
 * are off by −0.17 and +0.14 cents respectively — around a fiftieth of the
 * smallest pitch difference most people can hear, and far too small to matter
 * acoustically, but worth stating rather than quietly correcting.
 *
 * The frequencies below are therefore computed from the ratios by
 * `justInterval`, and the published decimal is carried separately, so the two
 * can be compared instead of conflated.
 *
 * The chakra names laid over the scale are a twentieth-century Western
 * addition. The classical Indian sources describe seed syllables and visualised
 * centres, not frequencies in hertz — there is no ancient tuning being
 * recovered here, and the presets use neutral names for that reason.
 */
export interface HarmonicScaleStep {
  presetId: string;
  /** The neutral factory name. */
  name: string;
  /** The value as the modern lists publish it, which is what people search for. */
  publishedHz: number;
  interval: JustIntervalName;
  ratio: readonly [number, number];
  /** The exact just frequency above C = 256 Hz. */
  exactHz: number;
  /** Published minus exact, in cents. Zero for the five that are exact integers. */
  centsFromJust: number;
}

/** The base of the scale: C = 256 Hz, Sauveur's scientific pitch. */
export const HARMONIC_ROOT_HZ = 256;

const HARMONIC_ROWS: Array<{
  presetId: string;
  name: string;
  publishedHz: number;
  interval: JustIntervalName;
  chakra: string;
  summary: string;
}> = [
  {
    presetId: 'ht-256',
    name: 'ROOT',
    publishedHz: 256,
    interval: 'unison',
    chakra: 'first (root)',
    summary:
      'C = 256 Hz, the base of the scale. Sauveur proposed it in 1713 so that every octave of C would be a power of two; it was never adopted by orchestras and in equal temperament it implies A = 430.54 Hz, which is not 432.',
  },
  {
    presetId: 'ht-288',
    name: 'SACRAL',
    publishedHz: 288,
    interval: 'majorSecond',
    chakra: 'second (sacral)',
    summary: 'D at a just 9:8 above the root — 288 Hz exactly. The interval two stacked fifths reduce to.',
  },
  {
    presetId: 'ht-320',
    name: 'SOLAR',
    publishedHz: 320,
    interval: 'majorThird',
    chakra: 'third (solar plexus)',
    summary:
      'E at a just 5:4 above the root — 320 Hz exactly. Fourteen cents narrower than the major third a piano plays.',
  },
  {
    presetId: 'ht-341-3',
    name: 'HEART',
    publishedHz: 341.3,
    interval: 'perfectFourth',
    chakra: 'fourth (heart)',
    summary:
      'F at a just 4:3 above the root. The exact value is 341.333… Hz; the published 341.3 is that figure rounded, about a sixth of a cent flat.',
  },
  {
    presetId: 'ht-384',
    name: 'THROAT',
    publishedHz: 384,
    interval: 'perfectFifth',
    chakra: 'fifth (throat)',
    summary: 'G at a just 3:2 above the root — 384 Hz exactly. The purest interval after the octave.',
  },
  {
    presetId: 'ht-426-7',
    name: 'INSIGHT',
    publishedHz: 426.7,
    interval: 'majorSixth',
    chakra: 'sixth (third eye)',
    summary:
      'A at a just 5:3 above the root. The exact value is 426.666… Hz; the published 426.7 is that figure rounded up, about an eighth of a cent sharp.',
  },
  {
    presetId: 'ht-480',
    name: 'CROWN',
    publishedHz: 480,
    interval: 'majorSeventh',
    chakra: 'seventh (crown)',
    summary:
      'B at a just 15:8 above the root — 480 Hz exactly, a just semitone (16:15) below the octave at 512 Hz.',
  },
];

export const HARMONIC_SCALE: HarmonicScaleStep[] = HARMONIC_ROWS.map((row) => {
  const exactHz = justInterval(HARMONIC_ROOT_HZ, row.interval);
  const definition = JUST_INTERVALS.find((entry) => entry.name === row.interval);
  return {
    presetId: row.presetId,
    name: row.name,
    publishedHz: row.publishedHz,
    interval: row.interval,
    ratio: definition ? definition.ratio : ([1, 1] as const),
    exactHz,
    centsFromJust: centsBetween(exactHz, row.publishedHz),
  };
});

const HARMONIC_TRADITIONAL: FrequencyPreset[] = HARMONIC_ROWS.map((row) =>
  preset({
    id: row.presetId,
    name: `${row.name} — ${row.publishedHz} Hz`,
    collection: 'harmonic-traditional',
    summary: row.summary,
    sourceFrequency: { value: row.publishedHz, unit: 'Hz', role: 'carrier' },
    representation: { kind: 'direct' },
    durationSec: 900,
    intent: ['meditation', 'listening', 'comparison'],
    classification: 'traditional',
    libraryEntryIds: ['harmonic-series'],
    archiveEntryIds: row.presetId === 'ht-256' ? ['pitch-c256'] : [],
    associations: [
      {
        claim: `In modern sound-healing material this tone is paired with the ${row.chakra} chakra and described as balancing or opening it.`,
        medical: false,
        currentEvidence:
          'The pairing is a twentieth-century Western addition. The classical Indian sources describe visualised centres and seed syllables, not frequencies in hertz, so there is no ancient tuning being recovered — and no controlled evidence connects a pitch to a bodily or emotional centre. What is exactly true of this tone is its ratio to the root.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: true,
      output: 'headphones-or-speakers',
    },
    aliases: [
      String(row.publishedHz),
      `${row.publishedHz} Hz`,
      'chakra',
      'chakra frequencies',
      'healing frequencies',
      row.chakra,
    ],
    tags: ['chakra', 'harmonic', 'just-intonation', 'traditional', 'tone', String(row.publishedHz)],
  }),
);

// ── 04 · 432 / 528 Lab ───────────────────────────────────────────────────────

const TUNING_LAB: FrequencyPreset[] = [
  preset({
    id: 'tuning-a440',
    name: 'A440 — concert pitch',
    collection: 'tuning-lab',
    summary:
      'The international tuning reference, fixed by ISO 16 and reaffirmed since. The reference point every other preset on this shelf is argued against.',
    sourceFrequency: { value: 440, unit: 'Hz', role: 'carrier' },
    representation: { kind: 'direct' },
    durationSec: 300,
    intent: ['comparison', 'listening', 'tuning'],
    classification: 'traditional',
    libraryEntryIds: ['concert-pitch'],
    archiveEntryIds: ['concert-a440', 'carrier-440'],
    associations: [],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: true,
      output: 'headphones-or-speakers',
    },
    aliases: ['440', '440 Hz', 'A440', 'concert pitch', 'standard tuning'],
    tags: ['tuning', '440', 'reference', 'tone'],
  }),

  preset({
    id: 'tuning-a432',
    name: 'A432 — the Italian diapason',
    collection: 'tuning-lab',
    summary:
      'A = 432 Hz, about a third of a semitone (32 cents) below concert pitch. A real documented standard — voted at the Milan congress of 1881 and prescribed for Italian military bands in 1884 — and quite separate from the modern mythology attached to it.',
    sourceFrequency: { value: 432, unit: 'Hz', role: 'carrier' },
    representation: { kind: 'direct' },
    durationSec: 300,
    intent: ['comparison', 'listening', 'tuning'],
    classification: 'traditional',
    libraryEntryIds: ['concert-pitch'],
    archiveEntryIds: ['concert-a432', 'concert-a440', 'pitch-c256'],
    associations: [
      {
        claim:
          'That 432 Hz is the natural or cosmic tuning, that it follows from C = 256 Hz, and that 440 Hz was imposed to replace it.',
        medical: false,
        currentEvidence:
          'The arithmetic does not close: the 1988 campaign that made 432 famous actually argued for C = 256 Hz, and C = 256 in equal temperament gives A = 430.54 Hz, not 432. The documented origin is nineteenth-century Italian standardisation, not antiquity. Play this against A440 and hear a 32-cent difference — real, small, and carrying no health claim either way.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: true,
      output: 'headphones-or-speakers',
    },
    aliases: ['432', '432 Hz', 'A432', 'verdi tuning', '432 tuning', 'healing frequencies'],
    tags: ['tuning', '432', 'traditional', 'tone'],
  }),

  preset({
    id: 'tuning-c256',
    name: 'C256 — scientific pitch',
    collection: 'tuning-lab',
    summary:
      'Middle C at 256 Hz, so that every octave of C is a power of two. Proposed by the acoustician Joseph Sauveur in 1713, used in scientific writing, never adopted by orchestras.',
    sourceFrequency: { value: 256, unit: 'Hz', role: 'carrier' },
    representation: { kind: 'direct' },
    durationSec: 300,
    intent: ['comparison', 'listening', 'tuning'],
    classification: 'mathematical',
    libraryEntryIds: ['concert-pitch'],
    archiveEntryIds: ['pitch-c256', 'pitch-middle-c'],
    associations: [
      {
        claim: 'That 256 Hz is a natural constant, or that it is the same proposal as A = 432 Hz.',
        medical: false,
        currentEvidence:
          'It is a mathematical convenience — powers of two are tidy to write, which is the whole of it — and it is a different proposal from A432: C = 256 in equal temperament puts A at 430.54 Hz. Against the middle C of standard tuning (261.63 Hz) it sounds 38 cents flat.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: true,
      output: 'headphones-or-speakers',
    },
    aliases: ['256', '256 Hz', 'C256', 'scientific pitch', 'philosophical pitch'],
    tags: ['tuning', '256', 'reference', 'tone'],
  }),

  preset({
    id: 'tuning-a435',
    name: 'A435 — diapason normal',
    collection: 'tuning-lab',
    summary:
      'The French standard of 1859, and the pitch Verdi was rounding down from when he accepted 432 for what he called mathematical convenience.',
    sourceFrequency: { value: 435, unit: 'Hz', role: 'carrier' },
    representation: { kind: 'direct' },
    durationSec: 300,
    intent: ['comparison', 'listening', 'tuning'],
    classification: 'historical',
    libraryEntryIds: ['concert-pitch'],
    archiveEntryIds: ['pitch-a435', 'concert-a432', 'concert-a440'],
    associations: [],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: true,
      output: 'headphones-or-speakers',
    },
    aliases: ['435', '435 Hz', 'A435', 'diapason normal'],
    tags: ['tuning', '435', 'historical', 'tone'],
  }),

  preset({
    id: 'tuning-a415',
    name: 'A415 — baroque pitch',
    collection: 'tuning-lab',
    summary:
      'A = 415.3 Hz, almost exactly a semitone below concert pitch, and the convention modern period-instrument ensembles play at.',
    sourceFrequency: { value: 415.3, unit: 'Hz', role: 'carrier' },
    representation: { kind: 'direct' },
    durationSec: 300,
    intent: ['comparison', 'listening', 'tuning'],
    classification: 'historical',
    libraryEntryIds: ['concert-pitch'],
    archiveEntryIds: ['pitch-a415', 'concert-a440'],
    associations: [],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: true,
      output: 'headphones-or-speakers',
    },
    aliases: ['415', '415 Hz', 'A415', 'baroque pitch'],
    tags: ['tuning', '415', 'historical', 'tone'],
  }),

  preset({
    id: 'tuning-528',
    name: '528 Hz — the comparison tone',
    collection: 'tuning-lab',
    summary:
      'The same 528 Hz as the Solfeggio shelf, framed as the tuning argument instead: it sits 16 cents above the C5 of standard tuning, close enough that the two produce a slow beat about five times a second when played together.',
    sourceFrequency: { value: 528, unit: 'Hz', role: 'carrier' },
    representation: { kind: 'direct' },
    durationSec: 300,
    intent: ['comparison', 'listening', 'tuning'],
    classification: 'emerging-research',
    libraryEntryIds: ['solfeggio', 'concert-pitch'],
    archiveEntryIds: ['tone-528-study', 'solfeggio-528', 'concert-a440'],
    associations: [
      {
        claim: 'That music "tuned to 528 Hz" has been shown to lower stress hormones.',
        medical: true,
        currentEvidence:
          'One nine-person study in 2018 reported lower salivary cortisol and higher oxytocin after five minutes of piano music tuned toward 528 Hz, with no significant change after the same music at 440 Hz. Nine participants, a single session, several biomarkers at once and a low-tier publisher: that is a hint to test, not a finding to rely on, and nothing about it supports the separate DNA claim.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: true,
      output: 'headphones-or-speakers',
    },
    aliases: ['528', '528 Hz', 'miracle tone', '528 tuning', 'healing frequencies'],
    tags: ['tuning', '528', 'comparison', 'tone', 'research'],
  }),
];

// ── 08 · Cosmic Octave ───────────────────────────────────────────────────────

/**
 * Astronomical periods doubled into hearing.
 *
 * The method is one line of arithmetic: take a period, invert it to get a
 * frequency far below anything audible, then double it — one octave at a time —
 * until it lands in the audio band. That is all it is. Doubling a frequency
 * preserves its ratio to everything else, which is why the results feel musical
 * and why the exercise is worth doing; it says nothing whatever about the body
 * it started from.
 *
 * What these tones are **not**: the sound of a planet. Nothing about the Earth's
 * orbit emits 136 Hz, and no microphone anywhere would record it. The tone is a
 * number that has been multiplied by 2³².
 *
 * The derivations are held as data so the arithmetic can be checked rather than
 * trusted, and the shipped value is the published rounded figure — the number
 * people search for — with the exact computation beside it.
 */
export interface CosmicOctaveDerivation {
  presetId: string;
  /** The cycle being transposed. */
  label: string;
  /** The period as it is conventionally stated. */
  periodDescription: string;
  /** That period in seconds. */
  periodSeconds: number;
  /** How many times the frequency is doubled. */
  octaves: number;
  /** 2^octaves / periodSeconds — computed here, never transcribed. */
  computedHz: number;
  /** The figure as it is published and searched for. */
  publishedHz: number;
}

/** One tropical year in seconds: 365.242190 mean solar days. */
const TROPICAL_YEAR_SECONDS = 365.24219 * 86400;

function derive(
  presetId: string,
  label: string,
  periodDescription: string,
  periodSeconds: number,
  octaves: number,
  publishedHz: number,
): CosmicOctaveDerivation {
  return {
    presetId,
    label,
    periodDescription,
    periodSeconds,
    octaves,
    computedHz: Math.pow(2, octaves) / periodSeconds,
    publishedHz,
  };
}

/**
 * The tolerance the shipped values are held to against their own arithmetic.
 *
 * Five thousandths of a hertz. Every published figure below is the computation
 * rounded to two decimals, so this is a check that the rounding is honest, not
 * a fudge factor — the largest discrepancy in the set is 0.0022 Hz.
 */
export const COSMIC_OCTAVE_TOLERANCE_HZ = 0.005;

export const COSMIC_OCTAVE_DERIVATIONS: CosmicOctaveDerivation[] = [
  derive(
    'cosmic-136',
    'Tropical year',
    '365.242190 days — one cycle of the seasons',
    TROPICAL_YEAR_SECONDS,
    32,
    136.1,
  ),
  derive(
    'cosmic-194',
    'Mean solar day',
    '86,400 seconds — one average day',
    86400,
    24,
    194.18,
  ),
  derive(
    'cosmic-172',
    'Platonic year',
    '25,920 tropical years — the traditional round figure for the precession of the equinoxes',
    25920 * TROPICAL_YEAR_SECONDS,
    47,
    172.06,
  ),
  derive(
    'cosmic-210',
    'Synodic month',
    '29.530588 days — new moon to new moon',
    29.530588 * 86400,
    29,
    210.42,
  ),
];

const COSMIC_NOT_A_SOUND = {
  claim: 'That these are the sounds the Earth, the Sun or the Moon make, or their true vibrations.',
  medical: false,
  currentEvidence:
    'They are not sounds at all. Each tone is one over a period, doubled a stated number of times until it reaches the audio band — arithmetic performed on a number, not a recording of anything. Nothing in space emits it, and the doubling introduces no property the original period did not have.',
} as const;

const COSMIC_OCTAVE: FrequencyPreset[] = [
  preset({
    id: 'cosmic-136',
    name: '136.10 Hz — Tropical year',
    collection: 'cosmic-octave',
    summary:
      'One over the tropical year (365.242190 days = 31,556,925.216 seconds), doubled 32 times: 2³² ÷ 31,556,925.216 = 136.1022 Hz, published as 136.10.',
    sourceFrequency: { value: 136.1, unit: 'Hz', role: 'carrier' },
    representation: { kind: 'direct' },
    durationSec: 900,
    intent: ['meditation', 'listening', 'experimentation'],
    classification: 'mathematical',
    libraryEntryIds: [],
    archiveEntryIds: [],
    associations: [
      COSMIC_NOT_A_SOUND,
      {
        claim: 'That this tone is a documented ancient tuning, or the pitch of the Indian tambura.',
        medical: false,
        currentEvidence:
          'The octave-transposition method is usually credited to writing published in the 1980s under the name "the cosmic octave"; it is modern. Tamburas are tuned by ear to the singer, not to a fixed hertz value.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: true,
      output: 'headphones-or-speakers',
    },
    aliases: ['136.1', '136.10', '136.1 Hz', 'om frequency', 'earth year', 'cosmic octave'],
    tags: ['cosmic', 'octave', 'mathematical', 'tone', '136.1'],
  }),

  preset({
    id: 'cosmic-194',
    name: '194.18 Hz — Mean solar day',
    collection: 'cosmic-octave',
    summary:
      'One over the mean solar day (86,400 seconds), doubled 24 times: 2²⁴ ÷ 86,400 = 194.1807 Hz, published as 194.18. The tidiest derivation in the set, because the second is defined against the day.',
    sourceFrequency: { value: 194.18, unit: 'Hz', role: 'carrier' },
    representation: { kind: 'direct' },
    durationSec: 900,
    intent: ['listening', 'experimentation', 'comparison'],
    classification: 'mathematical',
    libraryEntryIds: [],
    archiveEntryIds: [],
    associations: [COSMIC_NOT_A_SOUND],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: true,
      output: 'headphones-or-speakers',
    },
    aliases: ['194.18', '194.18 Hz', 'solar day', 'cosmic octave'],
    tags: ['cosmic', 'octave', 'mathematical', 'tone', '194.18'],
  }),

  preset({
    id: 'cosmic-172',
    name: '172.06 Hz — Platonic year',
    collection: 'cosmic-octave',
    summary:
      'One over 25,920 tropical years, doubled 47 times: 2⁴⁷ ÷ 817,955,501,599 s = 172.0601 Hz, published as 172.06. The longest cycle in the set by a factor of twenty-five thousand.',
    sourceFrequency: { value: 172.06, unit: 'Hz', role: 'carrier' },
    representation: { kind: 'direct' },
    durationSec: 900,
    intent: ['meditation', 'listening', 'experimentation'],
    classification: 'mathematical',
    libraryEntryIds: [],
    archiveEntryIds: [],
    associations: [
      COSMIC_NOT_A_SOUND,
      {
        claim: 'That 25,920 years is the measured period of the precession of the equinoxes.',
        medical: false,
        currentEvidence:
          'It is the traditional round figure — 72 years per degree, times 360 — and it is convenient rather than measured. Modern determinations put the precession cycle nearer 25,772 years, which by the same 2⁴⁷ transposition would give about 173.05 Hz instead. The tone is exact arithmetic on an approximate input.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: true,
      output: 'headphones-or-speakers',
    },
    aliases: ['172.06', '172.06 Hz', 'platonic year', 'precession', 'cosmic octave'],
    tags: ['cosmic', 'octave', 'mathematical', 'tone', '172.06'],
  }),

  preset({
    id: 'cosmic-210',
    name: '210.42 Hz — Synodic month',
    collection: 'cosmic-octave',
    summary:
      'One over the mean synodic month (29.530588 days = 2,551,442.8 seconds), doubled 29 times: 2²⁹ ÷ 2,551,442.8 = 210.4186 Hz, published as 210.42.',
    sourceFrequency: { value: 210.42, unit: 'Hz', role: 'carrier' },
    representation: { kind: 'direct' },
    durationSec: 900,
    intent: ['meditation', 'listening', 'experimentation'],
    classification: 'mathematical',
    libraryEntryIds: [],
    archiveEntryIds: [],
    associations: [COSMIC_NOT_A_SOUND],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: true,
      output: 'headphones-or-speakers',
    },
    aliases: ['210.42', '210.42 Hz', 'synodic month', 'moon', 'cosmic octave'],
    tags: ['cosmic', 'octave', 'mathematical', 'tone', '210.42'],
  }),
];

// ── 10 · Acoustic Fundamentals ───────────────────────────────────────────────

/**
 * The interval comparison, computed rather than transcribed.
 *
 * Both fifths come out of `music/theory.ts`: the just one from the 3:2 ratio,
 * the tempered one from the note name, so neither is a decimal typed in from
 * memory that could quietly stop matching the tuning module. The difference
 * between them is the beat rate the preset actually plays — two tones summed
 * into one signal interfere at their difference, and here that difference is
 * about a third of a hertz.
 */
export const JUST_FIFTH_HZ = justInterval(220, 'perfectFifth');
/** E4 in 12-TET at A440: 329.6275569… Hz. */
export const TEMPERED_FIFTH_HZ = noteToFrequency('E4') ?? 0;
/** Just minus tempered: the audible swell, in hertz. */
export const FIFTH_BEAT_HZ = JUST_FIFTH_HZ - TEMPERED_FIFTH_HZ;
/** How far the tempered fifth sits below the just one, in cents. */
export const FIFTH_CENTS_NARROW = centsBetween(JUST_FIFTH_HZ, TEMPERED_FIFTH_HZ);

const ACOUSTIC_FUNDAMENTALS: FrequencyPreset[] = [
  preset({
    id: 'af-110',
    name: '110 Hz — A2',
    collection: 'acoustic-fundamentals',
    summary:
      'The bottom of the octave ladder: A two octaves below concert A. Low enough to feel in the chest on a decent speaker, and the fundamental the harmonic-series preset builds on.',
    sourceFrequency: { value: 110, unit: 'Hz', role: 'carrier' },
    representation: { kind: 'direct' },
    durationSec: 300,
    intent: ['listening', 'comparison', 'experimentation'],
    classification: 'mathematical',
    libraryEntryIds: ['harmonic-series', 'carrier-choice'],
    archiveEntryIds: ['hypogeum-110'],
    associations: [
      {
        claim:
          'That 110 Hz is the frequency megalithic chambers were deliberately tuned to, and that it produces an altered state.',
        medical: false,
        currentEvidence:
          'Several megalithic chambers do measure resonances around 95–120 Hz, which is a fact about small stone rooms. One 30-person pilot reported changes in regional brain activity at 110 Hz; it has not been replicated at scale, and no altered state, health effect or deliberate ancient tuning follows from it. The popular "111 Hz" is a rounding of those measurements.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: true,
      output: 'headphones-or-speakers',
    },
    aliases: ['110', '110 Hz', 'A2', '111 Hz'],
    tags: ['fundamentals', 'octave', 'tone', '110'],
  }),

  preset({
    id: 'af-220',
    name: '220 Hz — A3',
    collection: 'acoustic-fundamentals',
    summary:
      'One octave up: exactly twice 110 Hz. Also the carrier the Brainwave Lab holds constant, so this is what those presets sound like with the rate switched off.',
    sourceFrequency: { value: 220, unit: 'Hz', role: 'carrier' },
    representation: { kind: 'direct' },
    durationSec: 300,
    intent: ['listening', 'comparison', 'experimentation'],
    classification: 'mathematical',
    libraryEntryIds: ['carrier-choice', 'harmonic-series'],
    archiveEntryIds: ['carrier-440'],
    associations: [],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: true,
      output: 'headphones-or-speakers',
    },
    aliases: ['220', '220 Hz', 'A3', 'carrier'],
    tags: ['fundamentals', 'octave', 'carrier', 'tone', '220'],
  }),

  preset({
    id: 'af-440',
    name: '440 Hz — A4',
    collection: 'acoustic-fundamentals',
    summary:
      'Two octaves up from 110 Hz, and the international tuning reference. Also the carrier region where binaural beats are most easily detected.',
    sourceFrequency: { value: 440, unit: 'Hz', role: 'carrier' },
    representation: { kind: 'direct' },
    durationSec: 300,
    intent: ['listening', 'comparison', 'tuning'],
    classification: 'mathematical',
    libraryEntryIds: ['concert-pitch', 'carrier-choice'],
    archiveEntryIds: ['concert-a440', 'carrier-440'],
    associations: [],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: true,
      output: 'headphones-or-speakers',
    },
    aliases: ['440', '440 Hz', 'A4', 'concert pitch'],
    tags: ['fundamentals', 'octave', 'tuning', 'tone', '440'],
  }),

  preset({
    id: 'af-880',
    name: '880 Hz — A5',
    collection: 'acoustic-fundamentals',
    summary:
      'Three octaves up from 110 Hz — eight times the frequency, the same note name. Bright, and noticeably louder for the same level: hearing is far more sensitive here than at 110 Hz.',
    sourceFrequency: { value: 880, unit: 'Hz', role: 'carrier' },
    representation: { kind: 'direct' },
    durationSec: 240,
    intent: ['listening', 'comparison', 'experimentation'],
    classification: 'mathematical',
    libraryEntryIds: ['concert-pitch', 'harmonic-series'],
    archiveEntryIds: ['loudness-1000'],
    associations: [],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: true,
      output: 'headphones-or-speakers',
    },
    aliases: ['880', '880 Hz', 'A5'],
    tags: ['fundamentals', 'octave', 'tone', '880'],
  }),

  preset({
    id: 'af-harmonics-110',
    name: 'Harmonic series on 110 Hz',
    collection: 'acoustic-fundamentals',
    summary:
      'The first eight partials of 110 Hz sounded together: 110, 220, 330, 440, 550, 660, 770 and 880 Hz. Partials 2, 4 and 8 are the octaves; partial 3 is a fifth above the octave and partial 5 a major third above that — the octave and the interval relationships arriving together, from nothing but integer multiplication.',
    sourceFrequency: { value: 110, unit: 'Hz', role: 'carrier' },
    representation: { kind: 'harmonic' },
    durationSec: 300,
    intent: ['listening', 'comparison', 'experimentation'],
    classification: 'mathematical',
    libraryEntryIds: ['harmonic-series'],
    archiveEntryIds: [],
    associations: [
      {
        claim: 'That the harmonic series is a scale, or that every partial lands on a piano key.',
        medical: false,
        currentEvidence:
          'It is not and they do not. The seventh partial (770 Hz) sits about 31 cents flat of the nearest tempered note and the eleventh falls almost exactly between two keys. That mismatch is why natural-horn and barbershop intervals sound out of tune to a piano-trained ear and correct to everyone else.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: true,
      output: 'headphones-or-speakers',
    },
    aliases: ['harmonics', 'harmonic series', 'overtones', 'partials', '110 Hz'],
    tags: ['fundamentals', 'harmonics', 'timbre', 'tone', '110'],
  }),

  preset({
    id: 'af-fifth-comparison',
    name: 'Perfect fifth — just against tempered',
    collection: 'acoustic-fundamentals',
    summary:
      'Two tones summed into the same signal: the just fifth above 220 Hz, which is exactly 330 Hz (3:2), and the fifth an equal-tempered keyboard plays, which is 329.6276 Hz. They differ by 1.955 cents and interfere at 0.372 Hz — one slow swell roughly every 2.7 seconds. That swell is the size of the compromise temperament makes.',
    sourceFrequency: { value: FIFTH_BEAT_HZ, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'monaural', carrierHz: TEMPERED_FIFTH_HZ },
    durationSec: 240,
    intent: ['comparison', 'listening', 'experimentation'],
    classification: 'mathematical',
    libraryEntryIds: ['harmonic-series'],
    archiveEntryIds: [],
    associations: [
      {
        claim: 'That equal temperament is out of tune, or that just intonation is the natural tuning.',
        medical: false,
        currentEvidence:
          'Both are true and neither is a grievance. Twelve equal fifths overshoot seven octaves by the Pythagorean comma, so temperament spreads the error: each fifth loses about two cents, each major third gains about fourteen. That is the trade that lets one keyboard play in every key, and this preset lets you hear its exact size.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['fifth', 'perfect fifth', 'just intonation', 'interval', 'temperament', '330'],
    tags: ['fundamentals', 'interval', 'just-intonation', 'comparison', 'beat'],
  }),
];

export const TONE_PRESETS: FrequencyPreset[] = [
  ...SOLFEGGIO,
  ...HARMONIC_TRADITIONAL,
  ...TUNING_LAB,
  ...COSMIC_OCTAVE,
  ...ACOUSTIC_FUNDAMENTALS,
];
