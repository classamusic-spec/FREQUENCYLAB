import {
  DEFAULT_PREFERENCES,
  buildPresets,
  migrateProtocol,
  type AiRequest,
  type ArchiveEntry,
  type ArchiveSet,
  type Experiment,
  type Favorite,
  type Protocol,
  type ProtocolStage,
  type RepresentationKind,
  type SafetyEvent,
  type Session,
  type UserPreferences,
} from '@frequencylab/dsp-core';
import { StorageKeys, readAll, readValue, writeValue } from './store';

/**
 * Repositories.
 *
 * Thin, typed accessors over the JSON store. Protocols are run through
 * `migrateProtocol` on the way in, so a record written by an older build always
 * opens rather than failing to parse.
 */

export async function loadPreferences(): Promise<UserPreferences> {
  const stored = await readValue<Partial<UserPreferences>>(StorageKeys.preferences, {});
  return { ...DEFAULT_PREFERENCES, ...stored };
}

export async function savePreferences(preferences: UserPreferences): Promise<void> {
  await writeValue(StorageKeys.preferences, preferences);
}

export async function loadProtocols(): Promise<Protocol[]> {
  const stored = await readValue<unknown[]>(StorageKeys.protocols, []);
  const migrated: Protocol[] = [];
  for (const record of stored) {
    try {
      migrated.push(migrateProtocol(record));
    } catch {
      // One unreadable protocol must not hide the rest of the library.
    }
  }
  return migrated;
}

export async function saveProtocols(protocols: Protocol[]): Promise<void> {
  await writeValue(StorageKeys.protocols, protocols);
}

/**
 * The presets a fresh install starts with. They are written to storage on first
 * run so they behave exactly like user protocols — editable, forkable, and
 * present in the export — rather than being a separate read-only category.
 */
export async function seedPresetsIfEmpty(): Promise<Protocol[]> {
  const existing = await loadProtocols();
  if (existing.length > 0) return existing;
  const presets = buildPresets();
  await saveProtocols(presets);
  return presets;
}

export async function loadSessions(): Promise<Session[]> {
  return readValue<Session[]>(StorageKeys.sessions, []);
}

export async function saveSessions(sessions: Session[]): Promise<void> {
  await writeValue(StorageKeys.sessions, sessions);
}

export async function loadExperiments(): Promise<Experiment[]> {
  return readValue<Experiment[]>(StorageKeys.experiments, []);
}

export async function saveExperiments(experiments: Experiment[]): Promise<void> {
  await writeValue(StorageKeys.experiments, experiments);
}

export async function loadSafetyEvents(): Promise<SafetyEvent[]> {
  return readValue<SafetyEvent[]>(StorageKeys.safetyEvents, []);
}

export async function appendSafetyEvent(event: SafetyEvent): Promise<void> {
  const existing = await loadSafetyEvents();
  // Bounded: safety events are diagnostic, not a permanent record.
  await writeValue(StorageKeys.safetyEvents, [event, ...existing].slice(0, 200));
}

export async function loadAiRequests(): Promise<AiRequest[]> {
  return readValue<AiRequest[]>(StorageKeys.aiRequests, []);
}

export async function saveAiRequests(requests: AiRequest[]): Promise<void> {
  await writeValue(StorageKeys.aiRequests, requests.slice(0, 100));
}

export async function loadFavorites(): Promise<Favorite[]> {
  return readValue<Favorite[]>(StorageKeys.favorites, []);
}

export async function saveFavorites(favorites: Favorite[]): Promise<void> {
  await writeValue(StorageKeys.favorites, favorites);
}

export async function loadStagePresets(): Promise<ProtocolStage[]> {
  return readValue<ProtocolStage[]>(StorageKeys.stagePresets, []);
}

export async function saveStagePresets(stages: ProtocolStage[]): Promise<void> {
  await writeValue(StorageKeys.stagePresets, stages);
}

export interface DataExport {
  format: 'frequencylab.export';
  version: 1;
  exportedAt: string;
  app: { name: string; version: string };
  records: Record<string, unknown>;
}

/** The complete, portable copy of everything the user owns (§74). */
export async function buildExport(appVersion: string): Promise<DataExport> {
  return {
    format: 'frequencylab.export',
    version: 1,
    exportedAt: new Date().toISOString(),
    app: { name: 'FREQUENCY LAB', version: appVersion },
    records: await readAll(),
  };
}

/**
 * Archive records the user owns.
 *
 * Only user-held material is persisted: imported collections, personal notes,
 * favourites and any corrections. The entries that ship with the app are code,
 * not data, so an app update can improve a source note without a migration and
 * without ever overwriting something the user imported.
 */

export async function loadArchiveEntries(): Promise<ArchiveEntry[]> {
  return readValue<ArchiveEntry[]>(StorageKeys.archiveEntries, []);
}

export async function saveArchiveEntries(entries: ArchiveEntry[]): Promise<void> {
  await writeValue(StorageKeys.archiveEntries, entries);
}

export async function loadArchiveSets(): Promise<ArchiveSet[]> {
  return readValue<ArchiveSet[]>(StorageKeys.archiveSets, []);
}

export async function saveArchiveSets(sets: ArchiveSet[]): Promise<void> {
  await writeValue(StorageKeys.archiveSets, sets);
}

/** Free-text notes, keyed by entry id. Kept apart from the record itself. */
export async function loadArchiveNotes(): Promise<Record<string, string>> {
  return readValue<Record<string, string>>(StorageKeys.archiveNotes, {});
}

export async function saveArchiveNotes(notes: Record<string, string>): Promise<void> {
  await writeValue(StorageKeys.archiveNotes, notes);
}

export async function loadArchiveFavorites(): Promise<string[]> {
  return readValue<string[]>(StorageKeys.archiveFavorites, []);
}

export async function saveArchiveFavorites(ids: string[]): Promise<void> {
  await writeValue(StorageKeys.archiveFavorites, ids);
}

export async function loadArchiveAcknowledgedAt(): Promise<string | null> {
  return readValue<string | null>(StorageKeys.archiveAcknowledgedAt, null);
}

export async function saveArchiveAcknowledgedAt(at: string): Promise<void> {
  await writeValue(StorageKeys.archiveAcknowledgedAt, at);
}

/**
 * The user's relationship with the factory preset shelves.
 *
 * Only the relationship is stored — which rows were starred and which were
 * played, by id and by the version that actually ran. The presets themselves
 * are code, exactly like the shipped archive entries, so improving a row's
 * wording in an update never has to migrate anything the user owns.
 */

export async function loadPresetFavorites(): Promise<string[]> {
  return readValue<string[]>(StorageKeys.presetFavorites, []);
}

export async function savePresetFavorites(ids: string[]): Promise<void> {
  await writeValue(StorageKeys.presetFavorites, ids);
}

/**
 * A play, pinned to the preset version that produced the sound (§43).
 *
 * The version is recorded rather than looked up later, because the point of
 * pinning is that a row can change: a list that resolved the current version at
 * read time would quietly rewrite what somebody listened to.
 */
export interface PresetPlay {
  presetId: string;
  version: number;
  at: string;
  /** The representation that was actually played, which the user may have changed. */
  representation: RepresentationKind;
}

export async function loadPresetPlays(): Promise<PresetPlay[]> {
  return readValue<PresetPlay[]>(StorageKeys.presetPlays, []);
}

export async function savePresetPlays(plays: PresetPlay[]): Promise<void> {
  // Bounded: this is a recent-plays shelf, not a session history. The real
  // record of what was listened to lives in `sessions`.
  await writeValue(StorageKeys.presetPlays, plays.slice(0, 100));
}
