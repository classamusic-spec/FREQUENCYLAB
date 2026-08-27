import {
  DEFAULT_PREFERENCES,
  buildPresets,
  migrateProtocol,
  type AiRequest,
  type Experiment,
  type Favorite,
  type Protocol,
  type ProtocolStage,
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
