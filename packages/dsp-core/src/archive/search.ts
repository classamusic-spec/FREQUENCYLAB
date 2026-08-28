import type { ArchiveCategory, ArchiveEntry, ArchiveEvidenceLevel, SourceDisagreement } from './types.js';

/**
 * Archive search (§7) and conflict detection (§15, §16).
 *
 * The unusual requirement here is that search must *surface* disagreement
 * rather than resolve it. Two sources giving different values for the same
 * label are two records, and a query that matches both returns both.
 */

export interface ArchiveQuery {
  text?: string;
  categories?: ArchiveCategory[];
  evidenceLevels?: ArchiveEvidenceLevel[];
  /** Inclusive frequency window. */
  minHz?: number;
  maxHz?: number;
  tags?: string[];
  /** Only entries that can be played with no transform. */
  directAudibleOnly?: boolean;
}

export interface ArchiveSearchResult {
  entry: ArchiveEntry;
  /** Higher is a better match. Exact frequency hits rank above text hits. */
  score: number;
  /** Why it matched, for the result row. */
  reason: string;
}

/** Tolerance for treating two archived values as the same number. */
const EXACT_HZ_EPSILON = 0.0005;
/** Window within which two values are flagged as suspiciously close (§16). */
const NEAR_DUPLICATE_RATIO = 0.001;

/**
 * Parses a query that may be a frequency, a range, or free text.
 *
 * `2128`, `2128 Hz` and `2128.0` all mean the same exact-frequency search;
 * `700-900` is a range. Anything else is treated as text.
 */
export function parseQuery(input: string): ArchiveQuery {
  const text = input.trim();
  if (text.length === 0) return {};

  const range = /^(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:hz)?$/i.exec(text);
  if (range) {
    return { minHz: Number.parseFloat(range[1]), maxHz: Number.parseFloat(range[2]) };
  }

  const exact = /^(\d+(?:\.\d+)?)\s*(?:hz)?$/i.exec(text);
  if (exact) {
    const hz = Number.parseFloat(exact[1]);
    // Kept as text too: a bare number may also appear in a name or alias.
    return { text, minHz: hz - EXACT_HZ_EPSILON, maxHz: hz + EXACT_HZ_EPSILON };
  }

  return { text };
}

export function searchArchive(
  entries: readonly ArchiveEntry[],
  query: ArchiveQuery,
): ArchiveSearchResult[] {
  const needle = query.text?.trim().toLowerCase();
  const numeric = needle ? Number.parseFloat(needle) : Number.NaN;
  const results: ArchiveSearchResult[] = [];

  for (const entry of entries) {
    if (query.categories?.length && !query.categories.includes(entry.category)) continue;
    if (query.evidenceLevels?.length && !query.evidenceLevels.includes(entry.evidenceLevel)) continue;
    if (query.directAudibleOnly && !entry.playback.directAudible) continue;
    if (query.tags?.length && !query.tags.some((tag) => entry.tags.includes(tag))) continue;

    const inRange =
      (query.minHz === undefined || entry.frequency >= query.minHz) &&
      (query.maxHz === undefined || entry.frequency <= query.maxHz);

    // A frequency filter without text is a pure range query.
    if (!needle) {
      if (!inRange) continue;
      results.push({ entry, score: 60, reason: 'Within the requested range' });
      continue;
    }

    let score = 0;
    let reason = '';

    if (Number.isFinite(numeric) && Math.abs(entry.frequency - numeric) < EXACT_HZ_EPSILON) {
      score = 100;
      reason = 'Exact frequency match';
    } else if (inRange && query.minHz !== undefined) {
      score = 80;
      reason = 'Frequency match';
    } else if (entry.name.toLowerCase().includes(needle)) {
      score = 70;
      reason = 'Name match';
    } else if (entry.aliases.some((alias) => alias.toLowerCase().includes(needle))) {
      score = 60;
      reason = 'Alias match';
    } else if (entry.tags.some((tag) => tag.toLowerCase().includes(needle))) {
      score = 50;
      reason = 'Tag match';
    } else if (entry.source.title.toLowerCase().includes(needle)) {
      score = 45;
      reason = 'Source match';
    } else if ((entry.source.author ?? '').toLowerCase().includes(needle)) {
      score = 40;
      reason = 'Author match';
    } else if (entry.summary.toLowerCase().includes(needle)) {
      score = 20;
      reason = 'Description match';
    }

    if (score > 0) results.push({ entry, score, reason });
  }

  return results.sort((a, b) => b.score - a.score || a.entry.frequency - b.entry.frequency);
}

/** Every record holding this exact value, across sources (§7). */
export function entriesAtFrequency(
  entries: readonly ArchiveEntry[],
  hz: number,
): ArchiveEntry[] {
  return entries.filter((entry) => Math.abs(entry.frequency - hz) < EXACT_HZ_EPSILON);
}

/**
 * Values close enough to be transcription drift rather than distinct records.
 *
 * Reported, never merged: 2128 and 2127.9 may be the same value copied badly,
 * or two genuinely different sources. The archive cannot tell, so it flags and
 * leaves the decision to a human (§16).
 */
export function nearDuplicates(
  entries: readonly ArchiveEntry[],
  hz: number,
  ratio = NEAR_DUPLICATE_RATIO,
): ArchiveEntry[] {
  const window = Math.max(0.01, hz * ratio);
  return entries.filter(
    (entry) =>
      Math.abs(entry.frequency - hz) > EXACT_HZ_EPSILON &&
      Math.abs(entry.frequency - hz) <= window,
  );
}

/**
 * Groups records that share a label but disagree on the value (§15).
 *
 * Conflicting values are never averaged. The comparison view exists so a user
 * can see that four sources say four different things, which is itself the most
 * useful fact about a circulating frequency list.
 */
export function findDisagreements(entries: readonly ArchiveEntry[]): SourceDisagreement[] {
  const byLabel = new Map<string, ArchiveEntry[]>();
  for (const entry of entries) {
    for (const label of [entry.name, ...entry.aliases]) {
      const key = label.trim().toLowerCase();
      const list = byLabel.get(key) ?? [];
      list.push(entry);
      byLabel.set(key, list);
    }
  }

  const disagreements: SourceDisagreement[] = [];
  for (const [label, group] of byLabel) {
    const distinct = new Set(group.map((entry) => entry.frequency));
    if (group.length < 2 || distinct.size < 2) continue;
    disagreements.push({
      label,
      records: group.map((entry) => ({
        entryId: entry.id,
        frequency: entry.frequency,
        source: entry.source,
        verification: entry.verification,
      })),
    });
  }
  return disagreements;
}

/** Bucketed counts for the spectrum map (§25). */
export interface SpectrumBucket {
  lowHz: number;
  highHz: number;
  entries: ArchiveEntry[];
}

export function spectrumBuckets(
  entries: readonly ArchiveEntry[],
  bucketCount = 40,
  minHz = 0.1,
  maxHz = 20000,
): SpectrumBucket[] {
  const minLog = Math.log10(minHz);
  const maxLog = Math.log10(maxHz);
  const buckets: SpectrumBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    lowHz: Math.pow(10, minLog + (i / bucketCount) * (maxLog - minLog)),
    highHz: Math.pow(10, minLog + ((i + 1) / bucketCount) * (maxLog - minLog)),
    entries: [],
  }));

  for (const entry of entries) {
    if (entry.frequency <= 0) continue;
    const position = (Math.log10(entry.frequency) - minLog) / (maxLog - minLog);
    const index = Math.max(0, Math.min(bucketCount - 1, Math.floor(position * bucketCount)));
    buckets[index].entries.push(entry);
  }
  return buckets;
}
