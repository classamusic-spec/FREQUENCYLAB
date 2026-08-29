import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persistence.
 *
 * Everything is plain versioned JSON under a namespaced key. That is a
 * deliberate constraint rather than a shortcut: the user owns their protocols,
 * sessions and experiment results (§74), and the export feature is a
 * concatenation of exactly these records — there is no proprietary
 * representation for anything to be locked inside.
 */

const NAMESPACE = 'frequencylab.v1';

export const StorageKeys = {
  preferences: 'preferences',
  protocols: 'protocols',
  sessions: 'sessions',
  experiments: 'experiments',
  safetyEvents: 'safety-events',
  aiRequests: 'ai-requests',
  favorites: 'favorites',
  stagePresets: 'stage-presets',
  migrations: 'migrations',
  archiveEntries: 'archive-entries',
  archiveSets: 'archive-sets',
  archiveNotes: 'archive-notes',
  archiveFavorites: 'archive-favorites',
  archiveAcknowledgedAt: 'archive-acknowledged-at',
  presetFavorites: 'preset-favorites',
  presetPlays: 'preset-plays',
  protocolSnapshots: 'protocol-snapshots',
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];

function fullKey(key: StorageKey): string {
  return `${NAMESPACE}.${key}`;
}

interface Envelope<T> {
  version: number;
  savedAt: string;
  data: T;
}

export async function readValue<T>(key: StorageKey, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(fullKey(key));
    if (!raw) return fallback;
    const envelope = JSON.parse(raw) as Envelope<T>;
    if (envelope && typeof envelope === 'object' && 'data' in envelope) return envelope.data;
    // Tolerate an unwrapped value written by an older build.
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    // A corrupt record must not take the app down. The caller gets the
    // fallback and the damaged value stays on disk for the export to include.
    return fallback;
  }
}

/**
 * A write that did not land.
 *
 * Named rather than left as whatever the storage layer threw, because the one
 * thing a caller has to be able to do with it is tell the user that what they
 * are looking at is not what is on disk. The key is carried so the message can
 * say which record, and the cause so a diagnostics screen can say why.
 */
export class StorageWriteError extends Error {
  constructor(
    readonly key: StorageKey,
    override readonly cause: unknown,
  ) {
    super(
      `Could not save ${key}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = 'StorageWriteError';
  }
}

export async function writeValue<T>(key: StorageKey, data: T): Promise<void> {
  const envelope: Envelope<T> = { version: 1, savedAt: new Date().toISOString(), data };
  try {
    await AsyncStorage.setItem(fullKey(key), JSON.stringify(envelope));
  } catch (error) {
    // Rethrown as this module's own type rather than swallowed. A write that
    // fails and says nothing leaves the in-memory list disagreeing with disk,
    // which is the failure the user discovers on their next launch.
    throw new StorageWriteError(key, error);
  }
}

export async function removeValue(key: StorageKey): Promise<void> {
  await AsyncStorage.removeItem(fullKey(key));
}

/** Every stored record, for the data export and for account deletion (§48). */
export async function readAll(): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    Object.values(StorageKeys).map(async (key) => [key, await readValue(key, null)] as const),
  );
  return Object.fromEntries(entries);
}

export async function clearAll(): Promise<void> {
  await Promise.all(Object.values(StorageKeys).map((key) => removeValue(key)));
}
