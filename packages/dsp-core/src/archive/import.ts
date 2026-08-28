import { playbackCompatibility } from './transforms.js';
import { nearDuplicates } from './search.js';
import type { ArchiveEntry, ArchiveSet } from './types.js';

/**
 * Importing a frequency collection (§17).
 *
 * This is the archive's main supply route: the app ships almost no Rife table
 * because it cannot vouch for one, so the honest chain is "this number came
 * from the file you gave me, on this date". Every imported row is labelled
 * `unverified` and `experimental`, keeps the filename as its provenance, and is
 * held for review before it enters the library.
 *
 * Nothing here upgrades an evidence classification. Import can only ever
 * produce unverified records; promoting one is a separate, deliberate act.
 */

export interface ParsedRow {
  /** Row number in the source file, for the review list. */
  line: number;
  name: string;
  frequency: number;
  /** Anything else on the row, kept verbatim rather than discarded. */
  extra?: string;
}

export interface ImportIssue {
  line: number;
  severity: 'error' | 'warning';
  code:
    | 'unparseable'
    | 'no-frequency'
    | 'out-of-range'
    | 'exact-duplicate'
    | 'near-duplicate'
    | 'medical-claim';
  message: string;
}

export interface ImportPreview {
  sourceName: string;
  rows: ParsedRow[];
  issues: ImportIssue[];
  /** Rows carrying language that reads as a medical claim (§17.4). */
  medicalRows: number[];
  /** Rows whose value matches something already held. */
  duplicateRows: number[];
  nearDuplicateRows: number[];
  /** Rows that will import cleanly. */
  acceptedCount: number;
}

/**
 * Language that reads as a treatment claim.
 *
 * Detection is intentionally broad. A false positive costs a reviewer one
 * glance; a false negative lets an unlabelled cure claim into the library.
 */
const MEDICAL_PATTERNS: RegExp[] = [
  /\b(cure[sd]?|curing)\b/i,
  /\b(treat|treats|treatment|therapy|heal|heals|healing|remedy)\b/i,
  /\b(cancer|tumou?r|carcinoma|leukemia|leukaemia)\b/i,
  /\b(virus|viruses|viral|bacteria|bacterial|parasite|parasites|pathogen|infection|fungus|candida)\b/i,
  /\b(kill|kills|destroy|destroys|eliminate|eradicate|devitalis[ez])\b/i,
  /\b(diabetes|arthritis|asthma|hepatitis|hiv|lyme|migraine|tinnitus)\b/i,
  /\b(depression|anxiety disorder|bipolar|schizophreni)/i,
  /\b(detox|immune boost|regenerat)/i,
];

export function detectMedicalLanguage(text: string): boolean {
  return MEDICAL_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Parses CSV, JSON or loose text into rows.
 *
 * Real frequency lists arrive in every shape imaginable, so the parser is
 * permissive about layout and strict about one thing only: a row must yield a
 * finite frequency, or it is reported rather than guessed at.
 */
export function parseCollection(raw: string, sourceName: string): ImportPreview {
  const text = raw.trim();
  const rows: ParsedRow[] = [];
  const issues: ImportIssue[] = [];

  if (text.startsWith('[') || text.startsWith('{')) {
    parseJson(text, rows, issues);
  } else {
    parseDelimited(text, rows, issues);
  }

  const medicalRows: number[] = [];
  for (const row of rows) {
    if (detectMedicalLanguage(`${row.name} ${row.extra ?? ''}`)) {
      medicalRows.push(row.line);
      issues.push({
        line: row.line,
        severity: 'warning',
        code: 'medical-claim',
        message:
          'This row contains treatment language. It will be imported as a quoted historical claim, paired with a statement of what evidence supports — never as an instruction.',
      });
    }
    if (!Number.isFinite(row.frequency) || row.frequency <= 0) {
      issues.push({
        line: row.line,
        severity: 'error',
        code: 'no-frequency',
        message: 'No usable frequency on this row.',
      });
    }
  }

  const accepted = rows.filter((row) => Number.isFinite(row.frequency) && row.frequency > 0);

  return {
    sourceName,
    rows,
    issues,
    medicalRows,
    duplicateRows: [],
    nearDuplicateRows: [],
    acceptedCount: accepted.length,
  };
}

function parseJson(text: string, rows: ParsedRow[], issues: ImportIssue[]): void {
  try {
    const parsed = JSON.parse(text) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : ((parsed as { entries?: unknown[]; frequencies?: unknown[] }).entries ??
        (parsed as { frequencies?: unknown[] }).frequencies ??
        []);
    list.forEach((item, index) => {
      const record = item as Record<string, unknown>;
      const frequency = Number(
        record.frequency ?? record.hz ?? record.freq ?? record.value ?? Number.NaN,
      );
      const name = String(record.name ?? record.label ?? record.title ?? `Entry ${index + 1}`);
      rows.push({
        line: index + 1,
        name,
        frequency,
        extra: typeof record.notes === 'string' ? record.notes : undefined,
      });
    });
  } catch {
    issues.push({
      line: 0,
      severity: 'error',
      code: 'unparseable',
      message: 'The file looked like JSON but could not be parsed.',
    });
  }
}

function parseDelimited(text: string, rows: ParsedRow[], issues: ImportIssue[]): void {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;
    // Skip a header row rather than importing it as a frequency.
    if (index === 0 && /name|label|frequency|hz/i.test(trimmed) && !/\d/.test(trimmed)) return;

    const cells = trimmed.split(/[,;\t|]/).map((cell) => cell.trim());
    // The frequency is the first cell that parses as a positive number; the
    // name is the longest non-numeric cell. Lists put them in either order.
    let frequency = Number.NaN;
    const textCells: string[] = [];
    for (const cell of cells) {
      const numeric = Number.parseFloat(cell.replace(/hz/i, '').trim());
      if (Number.isFinite(numeric) && numeric > 0 && Number.isNaN(frequency)) frequency = numeric;
      else if (cell.length > 0) textCells.push(cell);
    }

    if (Number.isNaN(frequency)) {
      // A bare list of numbers separated by spaces is also common.
      const bare = trimmed.match(/-?\d+(?:\.\d+)?/g);
      if (bare && bare.length === 1) frequency = Number.parseFloat(bare[0]);
    }

    if (Number.isNaN(frequency)) {
      issues.push({
        line: index + 1,
        severity: 'error',
        code: 'unparseable',
        message: `Could not find a frequency on this row: "${trimmed.slice(0, 60)}"`,
      });
      return;
    }

    rows.push({
      line: index + 1,
      name: textCells[0] ?? `${frequency} Hz`,
      frequency,
      extra: textCells.slice(1).join(' · ') || undefined,
    });
  });
}

/** Flags rows that collide with what is already held (§16). */
export function annotateDuplicates(
  preview: ImportPreview,
  existing: readonly ArchiveEntry[],
): ImportPreview {
  const duplicateRows: number[] = [];
  const nearDuplicateRows: number[] = [];
  const issues = [...preview.issues];

  for (const row of preview.rows) {
    if (!Number.isFinite(row.frequency)) continue;
    const exact = existing.filter((entry) => Math.abs(entry.frequency - row.frequency) < 0.0005);
    if (exact.length > 0) {
      duplicateRows.push(row.line);
      issues.push({
        line: row.line,
        severity: 'warning',
        code: 'exact-duplicate',
        message: `${row.frequency} Hz already appears in the archive as "${exact[0].name}". It will be kept as a separate record with its own source rather than merged.`,
      });
      continue;
    }
    const near = nearDuplicates(existing, row.frequency);
    if (near.length > 0) {
      nearDuplicateRows.push(row.line);
      issues.push({
        line: row.line,
        severity: 'warning',
        code: 'near-duplicate',
        message: `${row.frequency} Hz is very close to "${near[0].name}" at ${near[0].frequency} Hz. These may be the same value transcribed differently — both are kept.`,
      });
    }
  }

  return { ...preview, duplicateRows, nearDuplicateRows, issues };
}

export interface ImportOptions {
  sourceTitle: string;
  sourceAuthor?: string;
  sourceYear?: number | null;
  /** Set when the user identifies where the file itself came from. */
  originalContext?: string;
  now: string;
  idPrefix?: string;
}

/**
 * Materialises reviewed rows as archive records.
 *
 * Fixed at `unverified` and `experimental` regardless of what the file claimed:
 * a document asserting its own validity is not evidence of it.
 */
export function materialiseImport(
  preview: ImportPreview,
  options: ImportOptions,
): { entries: ArchiveEntry[]; set: ArchiveSet } {
  const prefix = options.idPrefix ?? `import-${Date.now().toString(36)}`;
  const entries: ArchiveEntry[] = preview.rows
    .filter((row) => Number.isFinite(row.frequency) && row.frequency > 0)
    .map((row, index) => {
      const medical = detectMedicalLanguage(`${row.name} ${row.extra ?? ''}`);
      return {
        id: `${prefix}-${index + 1}`,
        name: row.name,
        frequency: row.frequency,
        unit: 'Hz' as const,
        category: 'user-collection' as const,
        signalRole: 'unspecified' as const,
        evidenceLevel: medical
          ? ('unsupported-medical-claim' as const)
          : ('experimental' as const),
        verification: 'unverified' as const,
        source: {
          title: options.sourceTitle,
          author: options.sourceAuthor,
          year: options.sourceYear ?? null,
          originalContext:
            options.originalContext ?? `Imported from ${preview.sourceName}, row ${row.line}.`,
        },
        summary: row.extra ? `${row.name}. ${row.extra}` : row.name,
        archiveNote:
          'Imported by you and not independently checked. The value is preserved exactly as the file gave it.',
        claims: medical
          ? [
              {
                claim: `The imported list associates this frequency with: "${`${row.name} ${row.extra ?? ''}`.trim()}".`,
                medical: true,
                currentEvidence:
                  'No reliable clinical evidence establishes that acoustic playback at any frequency treats, cures or prevents a medical condition. This text is preserved as a record of what the source said, not as a claim this app makes.',
              },
            ]
          : [],
        playback: playbackCompatibility(row.frequency),
        recommendedTransform: 'Choose a transform explicitly before auditioning.',
        tags: ['imported', 'unverified'],
        aliases: [],
        related: [],
        sourceVersion: 1,
        evidenceVersion: 1,
        createdAt: options.now,
        updatedAt: options.now,
        changeLog: [
          {
            version: 1,
            at: options.now,
            change: `Imported from ${preview.sourceName}, row ${row.line}.`,
            scope: 'historical-record' as const,
          },
        ],
        importedBy: 'user',
      };
    });

  const set: ArchiveSet = {
    id: `${prefix}-set`,
    name: options.sourceTitle,
    category: 'user-collection',
    source: {
      title: options.sourceTitle,
      author: options.sourceAuthor,
      year: options.sourceYear ?? null,
      originalContext: options.originalContext ?? `Imported from ${preview.sourceName}.`,
    },
    verification: 'unverified',
    evidenceLevel: 'experimental',
    summary: `${entries.length} frequencies imported from ${preview.sourceName}. Not independently checked.`,
    entryIds: entries.map((entry) => entry.id),
    version: 1,
  };

  return { entries, set };
}
