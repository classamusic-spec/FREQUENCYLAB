import { playbackCompatibility } from './transforms.js';
import type { ArchiveEntry } from './types.js';

/** The date the shipped archive was last assembled. */
export const SEED_DATE = '2026-01-01T00:00:00.000Z';

/**
 * Builds a shipped archive entry with the boilerplate fields filled in.
 *
 * Shared by the core entries and the researched expansion so both populations
 * carry identical defaults: versioning starts at 1, playback compatibility is
 * computed from the value itself, and every record opens its change log with
 * an explicit creation event.
 */
export function makeEntry(
  partial: Omit<
    ArchiveEntry,
    'unit' | 'playback' | 'createdAt' | 'updatedAt' | 'changeLog' | 'sourceVersion' | 'evidenceVersion'
  > &
    Partial<Pick<ArchiveEntry, 'sourceVersion' | 'evidenceVersion' | 'changeLog'>>,
): ArchiveEntry {
  return {
    unit: 'Hz',
    playback: playbackCompatibility(partial.frequency),
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
    sourceVersion: partial.sourceVersion ?? 1,
    evidenceVersion: partial.evidenceVersion ?? 1,
    changeLog: partial.changeLog ?? [
      { version: 1, at: SEED_DATE, change: 'Record created.', scope: 'historical-record' },
    ],
    ...partial,
  } as ArchiveEntry;
}
