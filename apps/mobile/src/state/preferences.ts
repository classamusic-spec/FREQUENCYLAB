import { create } from 'zustand';
import { DEFAULT_PREFERENCES, type UserPreferences } from '@frequencylab/dsp-core';
import { loadPreferences, savePreferences } from '../storage/repositories';
import { setHapticsEnabled } from '../design/haptics';

interface PreferencesState {
  preferences: UserPreferences;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  update: (patch: Partial<UserPreferences>) => Promise<void>;
}

/**
 * User preferences.
 *
 * Hydrated once at launch. Writes go straight to disk rather than being
 * debounced: preferences change rarely, and losing an accessibility setting to
 * a crash would be worse than the write cost.
 */
export const usePreferences = create<PreferencesState>((set, get) => ({
  preferences: DEFAULT_PREFERENCES,
  hydrated: false,

  hydrate: async () => {
    const preferences = await loadPreferences();
    setHapticsEnabled(preferences.hapticsEnabled);
    set({ preferences, hydrated: true });
  },

  update: async (patch) => {
    const preferences = { ...get().preferences, ...patch };
    if (patch.hapticsEnabled !== undefined) setHapticsEnabled(patch.hapticsEnabled);
    set({ preferences });
    await savePreferences(preferences);
  },
}));
