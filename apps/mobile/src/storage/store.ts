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

export async function writeValue<T>(key: StorageKey, data: T): Promise<void> {
  const envelope: Envelope<T> = { version: 1, savedAt: new Date().toISOString(), data };
  await AsyncStorage.setItem(fullKey(key), JSON.stringify(envelope));
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
