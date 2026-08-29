import { LAB_PRESETS } from './factoryLab.js';
import { PSYCHOACOUSTIC_PRESETS } from './factoryPsychoacoustics.js';
import { TONE_PRESETS } from './factoryTones.js';
import { preset } from './make.js';
import { FACTORY_COLLECTIONS } from './types.js';
import type { CollectionId, FrequencyCollection, FrequencyPreset, PresetReference } from './types.js';

/**
 * The shipped preset library.
 *
 * Ten shelves of factory rows live here. The other two collections declared in
 * `types.ts` — Historical / Rife and My Frequencies — carry `sourcedElsewhere`
 * and deliberately have no rows in this file: the first is assembled at runtime
 * from `archive/`, where every number already has provenance and its own
 * version counters, and the second from the user's own records. Writing factory
 * copies of either would fork data that is already versioned elsewhere, which
 * is the one failure this whole design is arranged to prevent.
 *
 * ## What a row is allowed to say
 *
 * A preset names a number, says what that number is, and says exactly what the
 * DSP will do with it. Where a claim attaches to the number, the preset links
 * the `library/` or `archive/` record that carries the claim *and* the answer to
 * it. Where the claim belongs to this particular configuration rather than to a
 * record — "40 Hz binaural is the signal from the gamma studies", which is
 * false about the configuration rather than about the number — it is written
 * out as a `PopularAssociation`, both halves filled.
 *
 * No row names a disease. No `intent` holds a therapeutic claim.
 */

// ── 01 · Wellness ────────────────────────────────────────────────────────────

/**
 * The approachable front end.
 *
 * These are the eight presets someone reaches for when they do not want to
 * think about frequencies at all — and every one of them still prints its
 * actual signal in the summary: the rate, the carrier, the noise colour and
 * level, the duration. There is no hidden configuration anywhere in this file
 * and there is not going to be one. A preset that will not tell you what it is
 * doing is asking to be trusted rather than understood, and the moment this
 * shelf becomes a black box it becomes indistinguishable from every app this
 * one exists to be an alternative to.
 *
 * All eight are classified `experimental`: the individual ingredients have
 * research behind them at the level of "this evokes a measurable auditory
 * response", but a particular combination assembled for a particular context is
 * a design choice, not a finding.
 */
const WELLNESS: FrequencyPreset[] = [
  preset({
    id: 'well-relax',
    name: 'Relax',
    collection: 'wellness',
    summary:
      'Twenty minutes of a 10 Hz binaural beat on a 220 Hz carrier — 220 Hz in your left ear, 230 Hz in your right, no noise bed. The plainest configuration on this shelf.',
    sourceFrequency: { value: 10, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'binaural', carrierHz: 220, calculationMode: 'offset' },
    durationSec: 1200,
    intent: ['relaxation', 'listening'],
    classification: 'experimental',
    libraryEntryIds: ['binaural-beats', 'alpha-range', 'carrier-choice'],
    archiveEntryIds: ['alpha-10', 'alpha-beat-10'],
    associations: [
      {
        claim: 'That a preset called Relax will relax you.',
        medical: false,
        currentEvidence:
          'The name describes what it is for, not what it does. A 2019 meta-analysis found small-to-medium effects for binaural beats across a heterogeneous set of studies, and a 2023 review found the entrainment evidence mixed and inconsistent. Twenty quiet minutes with your eyes shut is doing some of the work here, and that is fine.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['relax', 'relaxation', 'calm', 'unwind', 'alpha'],
    tags: ['wellness', 'relaxation', 'alpha', 'binaural'],
  }),

  preset({
    id: 'well-focus',
    name: 'Focus',
    collection: 'wellness',
    summary:
      'Forty-five minutes of a 15 Hz binaural beat on a 240 Hz carrier — 240 Hz left, 255 Hz right — under a quiet bed of pink noise at 15%. Long enough for a work block.',
    sourceFrequency: { value: 15, unit: 'Hz', role: 'modulation' },
    representation: {
      kind: 'binaural',
      carrierHz: 240,
      calculationMode: 'offset',
      noiseColor: 'pink',
      noiseLevel: 0.15,
    },
    durationSec: 2700,
    intent: ['focus', 'study', 'background listening'],
    classification: 'experimental',
    libraryEntryIds: ['binaural-beats', 'beta-range', 'pink-noise'],
    archiveEntryIds: ['ifcn-alpha-10'],
    associations: [
      {
        claim: 'That beta-rate audio measurably improves concentration.',
        medical: false,
        currentEvidence:
          'Beat studies of attention and vigilance report small and inconsistent effects, and none of them tested this combination. The reliable part of this preset is the pink noise: covering intermittent sound removes interruptions, which is ordinary masking rather than anything happening at 15 Hz.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['focus', 'concentration', 'study', 'work', 'productivity', 'beta'],
    tags: ['wellness', 'focus', 'beta', 'binaural', 'pink'],
  }),

  preset({
    id: 'well-meditate',
    name: 'Meditate',
    collection: 'wellness',
    summary:
      'Thirty minutes of a 6 Hz binaural beat on a 200 Hz carrier — 200 Hz left, 206 Hz right, nothing else. A dark, slow signal that stays out of the way of a practice.',
    sourceFrequency: { value: 6, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'binaural', carrierHz: 200, calculationMode: 'offset' },
    durationSec: 1800,
    intent: ['meditation', 'relaxation', 'listening'],
    classification: 'experimental',
    libraryEntryIds: ['binaural-beats', 'theta-range'],
    archiveEntryIds: ['theta-beat-6'],
    associations: [
      {
        claim: 'That a theta-rate beat produces a meditative state, or deepens an existing practice.',
        medical: false,
        currentEvidence:
          'No dependable relationship between listening to a theta-rate beat and entering a theta-dominant state has been shown. Theta and delta beats did best for anxiety in the 2019 meta-analysis, which is a real result from small and varied studies — not a mechanism, and not a substitute for the practice itself.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['meditate', 'meditation', 'mindfulness', 'theta'],
    tags: ['wellness', 'meditation', 'theta', 'binaural'],
  }),

  preset({
    id: 'well-wind-down',
    name: 'Wind Down',
    collection: 'wellness',
    summary:
      'Thirty minutes of a 4 Hz binaural beat on a low 180 Hz carrier — 180 Hz left, 184 Hz right — with pink noise at 15% underneath. Slow enough to feel like a wobble rather than a pulse.',
    sourceFrequency: { value: 4, unit: 'Hz', role: 'modulation' },
    representation: {
      kind: 'binaural',
      carrierHz: 180,
      calculationMode: 'offset',
      noiseColor: 'pink',
      noiseLevel: 0.15,
    },
    durationSec: 1800,
    intent: ['winding down', 'relaxation', 'sleep preparation'],
    classification: 'experimental',
    libraryEntryIds: ['binaural-beats', 'theta-range', 'delta-range', 'pink-noise'],
    archiveEntryIds: ['ifcn-alpha-10'],
    associations: [
      {
        claim: 'That evening audio at a slow rate prepares the brain for sleep.',
        medical: true,
        currentEvidence:
          'Not established. The sleep work that shows an effect delivered sound in phase with slow oscillations a sleeper was already producing, during sleep — a different technique from playing a slow beat beforehand. Use this as a wind-down routine, which is a real and unglamorous thing that helps, rather than as a treatment for insomnia.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['wind down', 'evening', 'bedtime', 'before sleep', 'sleep'],
    tags: ['wellness', 'sleep', 'theta', 'binaural', 'pink'],
  }),

  preset({
    id: 'well-calm-awareness',
    name: 'Calm Awareness',
    collection: 'wellness',
    summary:
      'Twenty minutes at 8 Hz on a 220 Hz carrier — 220 Hz left, 228 Hz right. At the bottom edge of alpha: slower than Relax, still clearly awake.',
    sourceFrequency: { value: 8, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'binaural', carrierHz: 220, calculationMode: 'offset' },
    durationSec: 1200,
    intent: ['relaxation', 'meditation', 'listening'],
    classification: 'experimental',
    libraryEntryIds: ['binaural-beats', 'alpha-range', 'theta-range'],
    archiveEntryIds: ['alpha-beat-10', 'ifcn-alpha-10'],
    associations: [
      {
        claim: 'That 8 Hz is the doorway between theta and alpha, and so between states.',
        medical: false,
        currentEvidence:
          'The 8 Hz line is where one band is conventionally said to end and another to begin; the clinical glossary writes theta as ending below 8 Hz, so 8 belongs to alpha by convention rather than by anything measurable happening there. Nothing in the sound or in the listener changes at that number.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['calm awareness', 'calm', 'presence', 'alpha', 'relaxation'],
    tags: ['wellness', 'relaxation', 'alpha', 'binaural'],
  }),

  preset({
    id: 'well-deep-rest',
    name: 'Deep Rest',
    collection: 'wellness',
    summary:
      'Forty-five minutes of a 2 Hz binaural beat on a very low 160 Hz carrier — 160 Hz left, 162 Hz right — with brown noise at 20% under it. The darkest and slowest preset here.',
    sourceFrequency: { value: 2, unit: 'Hz', role: 'modulation' },
    representation: {
      kind: 'binaural',
      carrierHz: 160,
      calculationMode: 'offset',
      noiseColor: 'brown',
      noiseLevel: 0.2,
    },
    durationSec: 2700,
    intent: ['rest', 'sleep preparation', 'winding down'],
    classification: 'experimental',
    libraryEntryIds: ['binaural-beats', 'delta-range', 'white-brown-noise'],
    archiveEntryIds: ['ifcn-alpha-10'],
    associations: [
      {
        claim: 'That delta-rate audio induces deep sleep.',
        medical: true,
        currentEvidence:
          'That a 2 Hz beat played while awake induces delta activity or improves sleep is not established. Keep the level low — a forty-five minute session at a comfortable-seeming volume still accumulates exposure — and treat this as rest, not as sleep medicine.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['deep rest', 'rest', 'sleep', 'nap', 'delta'],
    tags: ['wellness', 'sleep', 'delta', 'binaural', 'brown'],
  }),

  preset({
    id: 'well-mental-reset',
    name: 'Mental Reset',
    collection: 'wellness',
    summary:
      'Ten minutes at 12 Hz on a 240 Hz carrier — 240 Hz left, 252 Hz right. Short on purpose: a break between two things rather than a session.',
    sourceFrequency: { value: 12, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'binaural', carrierHz: 240, calculationMode: 'offset' },
    durationSec: 600,
    intent: ['break', 'relaxation', 'focus'],
    classification: 'experimental',
    libraryEntryIds: ['binaural-beats', 'alpha-range', 'beta-range'],
    archiveEntryIds: ['ifcn-alpha-10', 'alpha-beat-10'],
    associations: [
      {
        claim: 'That a short session at the top of alpha clears or resets attention.',
        medical: false,
        currentEvidence:
          'No controlled evidence assigns a specific mental effect to this rate, and 12 Hz is alpha or nearly beta depending on whose band table you read. Ten minutes away from a screen is the part of this that is well supported.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['mental reset', 'reset', 'break', 'clear head', 'alpha'],
    tags: ['wellness', 'focus', 'alpha', 'binaural'],
  }),

  preset({
    id: 'well-sound-bath',
    name: 'Sound Bath',
    collection: 'wellness',
    summary:
      'Twenty minutes on a 236 Hz carrier split symmetrically — 234.5 Hz left, 237.5 Hz right — for a 3 Hz beat, over pink noise at 12%. 236 Hz is a singing bowl fundamental measured in a 2011 acoustics study, and the slow beat imitates the mode-splitting that makes a real bowl shimmer.',
    sourceFrequency: { value: 3, unit: 'Hz', role: 'modulation' },
    representation: {
      kind: 'binaural-centered',
      carrierHz: 236,
      calculationMode: 'centered',
      noiseColor: 'pink',
      noiseLevel: 0.12,
    },
    durationSec: 1200,
    intent: ['relaxation', 'meditation', 'listening'],
    classification: 'experimental',
    libraryEntryIds: ['binaural-beats', 'pink-noise', 'harmonic-series'],
    archiveEntryIds: ['bowl-236', 'bowl-187', 'bowl-347', 'bowl-428'],
    associations: [
      {
        claim: 'That this is what a singing bowl sounds like, or that bowl frequencies carry healing properties.',
        medical: true,
        currentEvidence:
          'It is a deliberate simplification. A real bowl is an inharmonic, multi-mode source whose beating comes from two split modes a few hertz apart — the study this frequency comes from measured four bowls at 187, 236, 347 and 428 Hz, every one different. No reliable evidence establishes a health effect for bowl playing or for any of those pitches.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['sound bath', 'singing bowl', 'bowls', 'tibetan bowl', 'relaxation'],
    tags: ['wellness', 'relaxation', 'bowl', 'binaural', 'pink'],
  }),
];

// ── Assembly ─────────────────────────────────────────────────────────────────

/**
 * Every factory preset, shelf by shelf in the order the collections are
 * declared. Order is data, not styling: the browser renders this sequence.
 *
 * The psychoacoustics rows come last because `TONE_PRESETS` ends with the
 * arithmetic half of Acoustic Fundamentals and these are the demonstration half
 * of the same shelf: appending them here keeps one collection contiguous, and
 * puts the octaves and intervals before the phenomena built on top of them.
 */
export const FACTORY_PRESETS: FrequencyPreset[] = [
  ...WELLNESS,
  ...LAB_PRESETS,
  ...TONE_PRESETS,
  ...PSYCHOACOUSTIC_PRESETS,
];

export function factoryPreset(id: string): FrequencyPreset | undefined {
  return FACTORY_PRESETS.find((row) => row.id === id);
}

/**
 * The rows on one shelf, in declaration order.
 *
 * Returns an empty array for `historical-rife` and `my-frequencies` — not
 * because they are empty shelves, but because they are filled from elsewhere.
 * Callers should check `collection(id)?.sourcedElsewhere` before concluding
 * that a collection has nothing in it.
 */
export function presetsInCollection(id: CollectionId): FrequencyPreset[] {
  return FACTORY_PRESETS.filter((row) => row.collection === id);
}

/** The collections that actually have factory rows, in shelf order. */
export function factoryCollections(): FrequencyCollection[] {
  return FACTORY_COLLECTIONS.filter((entry) => entry.sourcedElsewhere !== true);
}

/**
 * Pins a preset to the version that is about to be played (§43).
 *
 * A session records this rather than the preset itself, so that a later change
 * to the configuration ships as a new version and cannot retroactively rewrite
 * what someone listened to.
 */
export function presetReference(row: FrequencyPreset): PresetReference {
  return { presetId: row.id, version: row.version };
}

/** Every library and archive id the factory rows depend on, deduplicated. */
export function referencedEvidenceIds(): { library: string[]; archive: string[] } {
  const library = new Set<string>();
  const archive = new Set<string>();
  for (const row of FACTORY_PRESETS) {
    for (const id of row.libraryEntryIds) library.add(id);
    for (const id of row.archiveEntryIds) archive.add(id);
  }
  return { library: [...library].sort(), archive: [...archive].sort() };
}

export { BAND_BOUNDARY_NOTE, BAND_STATE_NOTE, BRAINWAVE_BANDS, bandForRate, brainwaveBand } from './bands.js';
export type { BandRange, BrainwaveBand, BrainwaveBandId } from './bands.js';
export { LAB_CARRIER_HZ, NO_SOURCE_FREQUENCY, SAFETY_LIBRARY_ENTRY_ID } from './make.js';
export {
  AB_BEAT_HZ,
  EQUAL_LOUDNESS_HIGH_HZ,
  EQUAL_LOUDNESS_LOW_HZ,
  LADDER_BASE_HZ,
  LADDER_SEPARATIONS_HZ,
  RESIDUE_CARRIER_HZ,
  RESIDUE_FUNDAMENTAL_HZ,
  RESIDUE_HARMONIC_NUMBERS,
  RESIDUE_PARTIALS_HZ,
} from './factoryPsychoacoustics.js';
export {
  COSMIC_OCTAVE_DERIVATIONS,
  COSMIC_OCTAVE_TOLERANCE_HZ,
  FIFTH_BEAT_HZ,
  FIFTH_CENTS_NARROW,
  HARMONIC_ROOT_HZ,
  HARMONIC_SCALE,
  JUST_FIFTH_HZ,
  TEMPERED_FIFTH_HZ,
} from './factoryTones.js';
export type { CosmicOctaveDerivation, HarmonicScaleStep } from './factoryTones.js';
