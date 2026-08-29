/**
 * An in-memory stand-in for AsyncStorage.
 *
 * Enough of the surface for the repositories to use, plus the one behaviour
 * worth simulating deliberately: `failNextWrite` makes `setItem` throw, which
 * is how the tests reach the path a real device only takes when the row has
 * outgrown its window.
 */
const store = new Map<string, string>();
let failWrites: string | null = null;

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    return store.get(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    if (failWrites !== null) throw new Error(failWrites);
    store.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    store.delete(key);
  },
  async getAllKeys(): Promise<string[]> {
    return [...store.keys()];
  },
  async multiRemove(keys: string[]): Promise<void> {
    for (const key of keys) store.delete(key);
  },
};

/** Test helpers, not part of the AsyncStorage surface. */
export function __reset(): void {
  store.clear();
  failWrites = null;
}
export function __failWrites(message: string | null): void {
  failWrites = message;
}
export function __raw(key: string): string | undefined {
  return store.get(key);
}

export default AsyncStorage;
