import { bandForRate, type BrainwaveBandId } from './bands.js';
import { FACTORY_PRESETS } from './factory.js';
import {
  CLASSIFICATION_DESCRIPTIONS,
  CLASSIFICATION_LABELS,
  FACTORY_COLLECTIONS,
} from './types.js';
import type { CollectionId, FrequencyPreset, PresetClassification } from './types.js';

/**
 * Finding a preset by what someone actually types.
 *
 * People arrive carrying words: `528`, `7.83`, `solfeggio`, `chakra`, `healing
 * frequencies`, `40 Hz`. Every one of those has to return something, because a
 * search that comes back empty does not stop anybody believing the claim — it
 * just sends them somewhere that will agree with them. Discovery is not the
 * enemy here.
 *
 * What makes that safe is the other half: **every result carries its
 * classification**, resolved and labelled on the result object rather than left
 * for the caller to look up and possibly forget. Searching "healing
 * frequencies" returns nine Solfeggio tones, each one labelled *Traditional*,
 * each one linked to the record that says where the number came from. Being
 * findable is not being endorsed, and the type makes it impossible to render a
 * result without the label that says so.
 */

export type PresetMatchField =
  | 'frequency'
  | 'carrier'
  | 'band'
  | 'name'
  | 'alias'
  | 'tag'
  | 'intent'
  | 'collection'
  | 'summary';

export interface PresetSearchResult {
  preset: FrequencyPreset;
  /** Higher is a better match. Comparable only within one result set. */
  score: number;
  /** Which fields matched, so the interface can say why something is here. */
  matchedOn: PresetMatchField[];
  /**
   * The preset's classification, resolved onto the result.
   *
   * Duplicated from `preset.classification` deliberately: a result row that can
   * be rendered without its label is a result row that eventually will be.
   */
  classification: PresetClassification;
  classificationLabel: string;
  classificationNote: string;
}

export interface PresetSearchOptions {
  /** Restrict to one shelf. */
  collection?: CollectionId;
  /** Restrict to one evidence classification. */
  classification?: PresetClassification;
  /** Maximum results. Omit for all matches. */
  limit?: number;
  /**
   * How close a typed number has to be to count as a frequency match, in Hz.
   *
   * Half a hertz by default, which lets `136` find 136.10 Hz and `172` find
   * 172.06 Hz while keeping 2 Hz and 4 Hz apart.
   */
  frequencyToleranceHz?: number;
}

const DEFAULT_TOLERANCE_HZ = 0.5;

/** Band names are searchable words as well as tags. */
const BAND_IDS: BrainwaveBandId[] = ['delta', 'theta', 'alpha', 'beta', 'gamma'];

interface ParsedQuery {
  /** The whole query, normalised, for phrase matching. */
  phrase: string;
  /** Numeric tokens, with any `hz` suffix removed. */
  numbers: number[];
  /** Word tokens, `hz` removed. */
  terms: string[];
}

/**
 * Normalises a query the way a person types one.
 *
 * Keeps `.` because `7.83` is a query and `+` because `pink+alpha` is how the
 * combination presets are named; throws away everything else punctuational so
 * `"528 Hz!"` and `528hz` reach the same place.
 */
function normalise(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9.+\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits a query into numbers and words.
 *
 * `528hz`, `528 hz` and `528` all parse to the number 528 with no leftover
 * term, so the unit never becomes a word that has to match something.
 */
export function parsePresetQuery(input: string): ParsedQuery {
  const phrase = normalise(input);
  const numbers: number[] = [];
  const terms: string[] = [];

  for (const raw of phrase.split(/[\s+]+/)) {
    if (raw.length === 0) continue;
    const token = raw.replace(/hz$/, '');
    if (token.length === 0) continue;
    const value = Number(token);
    if (Number.isFinite(value) && /^[0-9]/.test(token)) {
      numbers.push(value);
      continue;
    }
    if (token !== 'hz') terms.push(token);
  }

  return { phrase, numbers, terms };
}

function collectionWords(id: CollectionId): string {
  const entry = FACTORY_COLLECTIONS.find((row) => row.id === id);
  return `${id} ${entry ? entry.name : ''}`.toLowerCase();
}

/**
 * Whether a typed number names this preset's frequency.
 *
 * Checks the source frequency first — the number people talk about — and the
 * carrier second, scored lower, because someone typing `220` may well be
 * looking for the tone the Brainwave Lab rides on but is more likely to want
 * the 220 Hz preset itself.
 */
function frequencyScore(row: FrequencyPreset, value: number, tolerance: number): number {
  const source = row.sourceFrequency.value;
  if (source !== 0 && Math.abs(source - value) <= tolerance) {
    return Math.abs(source - value) < 1e-9 ? 120 : 100;
  }
  const carrier = row.representation.carrierHz;
  if (typeof carrier === 'number' && Math.abs(carrier - value) <= tolerance) return 55;
  return 0;
}

/**
 * Whether a typed band name reaches this preset through its rate.
 *
 * Tags carry the band name on the rows where it is part of the identity, but a
 * rate is in a band whether or not anyone remembered to tag it — so the band is
 * computed from the number as well. A pitch is never in a band: 528 Hz is not
 * gamma, and treating an audible tone as though it were a rate is the one
 * confusion this whole package is arranged to prevent.
 */
function bandMatches(row: FrequencyPreset, term: string): boolean {
  if (!BAND_IDS.includes(term as BrainwaveBandId)) return false;
  const { role, value } = row.sourceFrequency;
  if (role !== 'modulation' && role !== 'electromagnetic') return false;
  return bandForRate(value)?.id === term;
}

function scoreOne(
  row: FrequencyPreset,
  query: ParsedQuery,
  tolerance: number,
): { score: number; matchedOn: PresetMatchField[] } {
  let score = 0;
  const matchedOn = new Set<PresetMatchField>();

  const name = row.name.toLowerCase();
  const summary = row.summary.toLowerCase();
  const aliases = row.aliases.map((alias) => alias.toLowerCase());
  const tags = row.tags.map((tag) => tag.toLowerCase());
  const intents = row.intent.map((intent) => intent.toLowerCase());
  const collection = collectionWords(row.collection);

  for (const value of query.numbers) {
    const hit = frequencyScore(row, value, tolerance);
    if (hit > 0) {
      score += hit;
      matchedOn.add(hit === 55 ? 'carrier' : 'frequency');
    }
    // A bare number is also a word: `40` reaches the rows tagged `40hz`.
    const text = String(value);
    if (aliases.some((alias) => alias === text || alias === `${text} hz`)) {
      score += 30;
      matchedOn.add('alias');
    }
  }

  // Phrase matching, for the two-word searches people actually type:
  // "pink noise", "healing frequencies", "sound bath".
  if (query.phrase.length >= 3) {
    if (aliases.includes(query.phrase)) {
      score += 90;
      matchedOn.add('alias');
    } else if (aliases.some((alias) => alias.includes(query.phrase))) {
      score += 55;
      matchedOn.add('alias');
    }
    if (name.includes(query.phrase)) {
      score += 50;
      matchedOn.add('name');
    }
    if (intents.some((intent) => intent.includes(query.phrase))) {
      score += 35;
      matchedOn.add('intent');
    }
    if (collection.includes(query.phrase)) {
      score += 30;
      matchedOn.add('collection');
    }
  }

  for (const term of query.terms) {
    if (term.length < 2) continue;

    if (aliases.includes(term)) {
      score += 45;
      matchedOn.add('alias');
    } else if (aliases.some((alias) => alias.includes(term))) {
      score += 25;
      matchedOn.add('alias');
    }

    if (tags.includes(term)) {
      score += 40;
      matchedOn.add('tag');
    } else if (tags.some((tag) => tag.includes(term))) {
      score += 18;
      matchedOn.add('tag');
    }

    if (name.includes(term)) {
      score += 30;
      matchedOn.add('name');
    }

    if (intents.some((intent) => intent.includes(term))) {
      score += 22;
      matchedOn.add('intent');
    }

    if (collection.includes(term)) {
      score += 20;
      matchedOn.add('collection');
    }

    if (bandMatches(row, term)) {
      score += 35;
      matchedOn.add('band');
    }

    if (summary.includes(term)) {
      score += 8;
      matchedOn.add('summary');
    }
  }

  return { score, matchedOn: [...matchedOn] };
}

function toResult(row: FrequencyPreset, score: number, matchedOn: PresetMatchField[]): PresetSearchResult {
  return {
    preset: row,
    score,
    matchedOn,
    classification: row.classification,
    classificationLabel: CLASSIFICATION_LABELS[row.classification],
    classificationNote: CLASSIFICATION_DESCRIPTIONS[row.classification],
  };
}

/** Shelf order, so equally-scored results come back in a stable, meaningful order. */
const COLLECTION_ORDER = new Map<CollectionId, string>(
  FACTORY_COLLECTIONS.map((entry) => [entry.id, entry.ordinal]),
);

/**
 * Searches the factory presets.
 *
 * An empty query returns the whole library in shelf order rather than nothing,
 * because an empty search box is a browse rather than a failed lookup.
 */
export function searchPresets(
  query: string,
  options: PresetSearchOptions = {},
): PresetSearchResult[] {
  const tolerance = options.frequencyToleranceHz ?? DEFAULT_TOLERANCE_HZ;
  const parsed = parsePresetQuery(query);

  const pool = FACTORY_PRESETS.filter((row) => {
    if (options.collection && row.collection !== options.collection) return false;
    if (options.classification && row.classification !== options.classification) return false;
    return true;
  });

  const browsing = parsed.numbers.length === 0 && parsed.terms.length === 0;
  const results = browsing
    ? pool.map((row) => toResult(row, 0, []))
    : pool
        .map((row) => ({ row, ...scoreOne(row, parsed, tolerance) }))
        .filter((hit) => hit.score > 0)
        .map((hit) => toResult(hit.row, hit.score, hit.matchedOn));

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const order = (COLLECTION_ORDER.get(a.preset.collection) ?? '99').localeCompare(
      COLLECTION_ORDER.get(b.preset.collection) ?? '99',
    );
    if (order !== 0) return order;
    return a.preset.id.localeCompare(b.preset.id);
  });

  return typeof options.limit === 'number' ? results.slice(0, Math.max(0, options.limit)) : results;
}

/**
 * Presets whose source frequency is at or near a value.
 *
 * Carriers are excluded here on purpose: this answers "what does this app hold
 * at 528 Hz", and a 528 Hz carrier under a beat is a different answer from a
 * 528 Hz preset.
 */
export function presetsAtFrequency(
  hz: number,
  toleranceHz = DEFAULT_TOLERANCE_HZ,
): FrequencyPreset[] {
  if (!Number.isFinite(hz)) return [];
  return FACTORY_PRESETS.filter(
    (row) => row.sourceFrequency.value !== 0 && Math.abs(row.sourceFrequency.value - hz) <= toleranceHz,
  );
}

/** Presets carrying a tag, exactly. */
export function presetsWithTag(tag: string): FrequencyPreset[] {
  const needle = tag.trim().toLowerCase();
  return FACTORY_PRESETS.filter((row) => row.tags.some((entry) => entry.toLowerCase() === needle));
}

/** Presets offered for a context, matched loosely because intents are phrases. */
export function presetsForIntent(intent: string): FrequencyPreset[] {
  const needle = intent.trim().toLowerCase();
  if (needle.length === 0) return [];
  return FACTORY_PRESETS.filter((row) =>
    row.intent.some((entry) => entry.toLowerCase().includes(needle)),
  );
}

/**
 * Every preset carrying a medical association, with the associations.
 *
 * The list a compliance review asks for, and the list the app needs in order to
 * guarantee that no medical claim is ever displayed without the sentence that
 * answers it.
 */
export function presetsWithMedicalAssociations(): Array<{
  preset: FrequencyPreset;
  claims: FrequencyPreset['associations'];
}> {
  return FACTORY_PRESETS.filter((row) => row.associations.some((entry) => entry.medical)).map(
    (row) => ({ preset: row, claims: row.associations.filter((entry) => entry.medical) }),
  );
}
