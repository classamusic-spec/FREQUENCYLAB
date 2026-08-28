import type { NoiseColor } from '../dsp/noise.js';
import type { SignalRole } from '../archive/types.js';

/**
 * The stock frequency preset library.
 *
 * People arrive at this app already carrying words: 528 Hz, Solfeggio, 7.83,
 * theta, 40 Hz, chakra frequencies. Those words are the door. The job of this
 * module is to let someone walk through it and find, on the other side, an
 * exact statement of what the number is, where the association came from, what
 * has and has not been shown, and precisely what the DSP will do with it —
 * rather than either a shrug or a health claim.
 *
 * ## What this module is not
 *
 * It is not a second evidence system. `library/` already holds the educational
 * entries with their sources, and `archive/` already holds historical
 * provenance with its own independently versioned claim/rebuttal records. A
 * preset **links** to those by id; it does not restate them. Restating would
 * mean two copies of a claim that could drift apart, and the one thing this
 * codebase cannot afford is two disagreeing answers to "what does the evidence
 * say".
 *
 * It is also not a second representation layer. `archive/transforms.ts` already
 * turns a number into an explicit statement of what will be generated, with the
 * no-silent-conversion rule that makes the whole product credible. A preset
 * names a representation; the translator decides what that means for a value.
 *
 * ## The one idea
 *
 * A preset separates **the number people talk about** from **what the
 * headphones actually do**. 7.83 Hz is not a tone anybody's headphones can
 * produce; it is a source frequency that becomes a 220/227.83 Hz binaural pair.
 * Those are different facts and the type keeps them in different fields, so no
 * screen can accidentally print one while meaning the other.
 */

/**
 * Where a preset's standing comes from.
 *
 * These describe **provenance of evidence**, not quality. `traditional` is not
 * a demotion and `research` is not an endorsement of a health outcome — a
 * measurable auditory response is a much narrower claim than a clinical
 * benefit, and the labels are worded to keep that distinction visible.
 */
export type PresetClassification =
  | 'research'
  | 'emerging-research'
  | 'traditional'
  | 'historical'
  | 'mathematical'
  | 'experimental'
  | 'unsupported-medical-claim';

export const CLASSIFICATION_LABELS: Record<PresetClassification, string> = {
  research: 'Research',
  'emerging-research': 'Emerging research',
  traditional: 'Traditional',
  historical: 'Historical',
  mathematical: 'Mathematical',
  experimental: 'Experimental',
  'unsupported-medical-claim': 'Unsupported medical claim',
};

export const CLASSIFICATION_DESCRIPTIONS: Record<PresetClassification, string> = {
  research:
    'Human auditory or psychoacoustic research exists. That is a measurable response to sound, which is a narrower thing than a clinical benefit.',
  'emerging-research':
    'Published work exists but is early, small, inconsistent, or measured something narrower than the popular claim.',
  traditional:
    'Part of a spiritual, musical, meditative or wellness framework. Included so it can be explored and tested, not because evidence supports a specific effect.',
  historical:
    'Preserved because it appears in historical sources or historical frequency systems. Inclusion records that it was said, not that it is so.',
  mathematical:
    'Derived from frequency ratios, octave relationships or tuning systems. The arithmetic is exact; it implies nothing about an effect.',
  experimental:
    'Offered for personal acoustic exploration. No specific therapeutic effect is established.',
  'unsupported-medical-claim':
    'A therapeutic claim circulates in popular or historical material and reliable evidence does not establish it. Shown so the claim can be seen for what it is.',
};

/** The twelve factory shelves (§3). */
export type CollectionId =
  | 'wellness'
  | 'brainwave-lab'
  | 'solfeggio'
  | 'tuning-lab'
  | 'schumann-inspired'
  | 'gamma-40'
  | 'harmonic-traditional'
  | 'cosmic-octave'
  | 'noise-lab'
  | 'acoustic-fundamentals'
  | 'historical-rife'
  | 'my-frequencies';

export interface FrequencyCollection {
  id: CollectionId;
  /** Two-digit shelf number, so the browser's order is data rather than styling. */
  ordinal: string;
  name: string;
  /** One line describing what is on this shelf. */
  summary: string;
  /**
   * What the collection as a whole is, evidentially. Individual presets may
   * differ — a Solfeggio shelf is `traditional` while 528 Hz on it also carries
   * emerging research — so this is a heading, never a substitute for the
   * per-preset classification.
   */
  classification: PresetClassification;
  /**
   * True when the shelf is assembled at runtime from another module rather than
   * from `FACTORY_PRESETS`. Historical/Rife reads the archive and My
   * Frequencies reads the user's own records; neither has factory rows, and
   * duplicating them here would fork data that is already versioned elsewhere.
   */
  sourcedElsewhere?: boolean;
}

/**
 * How a preset asks to be heard.
 *
 * `kind` names the acoustic representation; the remaining fields are the
 * parameters that representation needs. What a representation *means* for a
 * given value — whether it is even possible, and what note to print beside it —
 * is decided by `archive/transforms.ts`, not here.
 */
export type RepresentationKind =
  | 'direct'
  | 'binaural'
  | 'binaural-centered'
  | 'monaural'
  | 'am'
  | 'isochronic'
  | 'fm'
  | 'stereo-motion'
  | 'harmonic'
  | 'subharmonic'
  | 'sweep'
  | 'noise-modulation'
  | 'multi-layer';

export interface PresetRepresentation {
  kind: RepresentationKind;
  /** The audible tone a modulation rate rides on. Absent for a direct tone. */
  carrierHz?: number;
  /** Offset puts the beat on one ear; centered splits it either side. */
  calculationMode?: 'offset' | 'centered';
  /** 0..1. Applies to the modulated representations. */
  modulationDepth?: number;
  noiseColor?: NoiseColor;
  /** 0..1. */
  noiseLevel?: number;
  /** Signed power-of-two shift for `harmonic` / `subharmonic`. */
  octaveShift?: number;
  /** End value for `sweep`, in the same unit as the source frequency. */
  sweepToHz?: number;
}

export interface PresetSourceFrequency {
  value: number;
  unit: 'Hz';
  /**
   * What the number *is*. A rate and a pitch are not interchangeable, and the
   * commonest error in this whole subject is treating a 7.83 Hz rate as though
   * it were a 7.83 Hz tone.
   */
  role: SignalRole;
}

/**
 * A claim people attach to a frequency, and what can actually be said about it.
 *
 * Both halves are required. A popular association shown on its own reads as
 * endorsement, and an evidence note with no claim attached is answering a
 * question nobody asked. `library/` and `archive/` enforce the same pairing;
 * this is the same rule at the preset layer, for associations that belong to
 * the *preset* rather than to an educational entry.
 */
export interface PopularAssociation {
  /** The association as it circulates, in reported speech. */
  claim: string;
  /** True when the claim is medical, which changes how it must be presented. */
  medical: boolean;
  /** What reliable evidence establishes about it. Never omitted. */
  currentEvidence: string;
}

export interface PresetSafety {
  /** True when channel separation is part of how this preset works. */
  headphonesRecommended: boolean;
  /**
   * False when the source value cannot honestly be produced as a tone — a rate
   * below hearing, or a value above what headphones reproduce. The UI must
   * offer a representation instead of a useless tone (§4).
   */
  directToneAllowed: boolean;
  /** Output routes this preset makes sense on (§39). */
  output: 'headphones' | 'headphones-or-speakers';
}

export interface FrequencyPreset {
  id: string;
  schemaVersion: 1;
  name: string;
  collection: CollectionId;
  /** One line: what this is, with no claim in it. */
  summary: string;

  sourceFrequency: PresetSourceFrequency;
  representation: PresetRepresentation;

  /** Minutes the factory suggests. The user may change it. */
  durationSec: number;

  /**
   * Neutral intents — what someone might reach for this while doing. Never a
   * therapeutic claim: "relaxation" is a context, "treats anxiety" is not
   * something this field may ever hold.
   */
  intent: string[];

  classification: PresetClassification;

  /**
   * Ids of `library/` entries carrying this preset's evidence, and of
   * `archive/` entries carrying its historical provenance. Links rather than
   * copies: one claim, one place, one version counter.
   */
  libraryEntryIds: string[];
  archiveEntryIds: string[];

  /** Associations belonging to this preset rather than to a linked entry. */
  associations: PopularAssociation[];

  safety: PresetSafety;

  /** Search terms people actually type, including popular ones (§25). */
  aliases: string[];
  tags: string[];

  /**
   * Bumped whenever the *sound* changes. Factory presets are immutable by
   * version (§43): a session recorded against v1 must still render as v1, so a
   * changed configuration ships as a new version rather than editing the old.
   */
  version: number;

  factory: true;
}

/** A preset id pinned to the version a session actually played (§43). */
export interface PresetReference {
  presetId: string;
  version: number;
}

export const FACTORY_COLLECTIONS: FrequencyCollection[] = [
  {
    id: 'wellness',
    ordinal: '01',
    name: 'Wellness',
    summary: 'Ready-made sessions by what you are doing, for when you do not want to think about frequencies.',
    classification: 'experimental',
  },
  {
    id: 'brainwave-lab',
    ordinal: '02',
    name: 'Brainwave Lab',
    summary: 'Modulation rates across the conventional bands, each as an explicit acoustic representation.',
    classification: 'research',
  },
  {
    id: 'solfeggio',
    ordinal: '03',
    name: 'Solfeggio',
    summary: 'The modern nine-tone set, with where the numbers came from.',
    classification: 'traditional',
  },
  {
    id: 'tuning-lab',
    ordinal: '04',
    name: '432 / 528 Lab',
    summary: 'Alternative tuning references and the two tones most argued about, set up so you can compare them yourself.',
    classification: 'traditional',
  },
  {
    id: 'schumann-inspired',
    ordinal: '05',
    name: 'Schumann-inspired',
    summary: 'Acoustic representations of the Earth-ionosphere cavity resonances. The originals are electromagnetic; these are not.',
    classification: 'mathematical',
  },
  {
    id: 'gamma-40',
    ordinal: '06',
    name: 'Gamma 40',
    summary: '40 Hz auditory stimulation in five forms — the most actively researched rate here.',
    classification: 'research',
  },
  {
    id: 'harmonic-traditional',
    ordinal: '07',
    name: 'Harmonic / Chakra',
    summary: 'A just-intoned scale on C = 256 Hz, and the modern mapping laid over it.',
    classification: 'traditional',
  },
  {
    id: 'cosmic-octave',
    ordinal: '08',
    name: 'Cosmic Octave',
    summary: 'Astronomical periods octave-doubled into hearing. Exact arithmetic; nothing more is claimed.',
    classification: 'mathematical',
  },
  {
    id: 'noise-lab',
    ordinal: '09',
    name: 'Noise Lab',
    summary: 'White, pink and brown, alone and carrying a modulation.',
    classification: 'research',
  },
  {
    id: 'acoustic-fundamentals',
    ordinal: '10',
    name: 'Acoustic Fundamentals',
    summary: 'Octaves, harmonics and intervals — the arithmetic the rest of the library is built from.',
    classification: 'mathematical',
  },
  {
    id: 'historical-rife',
    ordinal: '11',
    name: 'Historical / Rife',
    summary: 'The historical archive, with its own provenance records and claim rebuttals.',
    classification: 'historical',
    sourcedElsewhere: true,
  },
  {
    id: 'my-frequencies',
    ordinal: '12',
    name: 'My Frequencies',
    summary: 'Your favourites, your recent plays and anything you have built.',
    classification: 'experimental',
    sourcedElsewhere: true,
  },
];

export function collection(id: CollectionId): FrequencyCollection | undefined {
  return FACTORY_COLLECTIONS.find((entry) => entry.id === id);
}
