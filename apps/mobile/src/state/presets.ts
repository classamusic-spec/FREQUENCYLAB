import { create } from 'zustand';
import {
  FACTORY_PRESETS,
  factoryPreset,
  type FrequencyPreset,
  type RepresentationKind,
} from '@frequencylab/dsp-core';
import {
  loadPresetFavorites,
  loadPresetPlays,
  savePresetFavorites,
  savePresetPlays,
  type PresetPlay,
} from '../storage/repositories';

interface PresetShelfState {
  /** Ids of starred presets, most recently starred first. */
  favorites: string[];
  /** Plays, newest first, each pinned to the version and representation used. */
  plays: PresetPlay[];
  hydrated: boolean;

  hydrate: () => Promise<void>;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => Promise<void>;
  recordPlay: (preset: FrequencyPreset, representation: RepresentationKind) => Promise<void>;
  /** Starred presets that still exist in this build, in the order they were starred. */
  favoritePresets: () => FrequencyPreset[];
  /** Distinct presets played recently, newest first, with the play that named them. */
  recentPresets: (limit?: number) => { preset: FrequencyPreset; play: PresetPlay }[];
}

/**
 * The user's own shelf.
 *
 * My Frequencies is the one collection with no factory rows of its own: it is
 * assembled here, from what the user starred and what they actually played.
 * Nothing about a preset is copied into storage — a play holds an id, a version
 * and the representation that ran — so a row whose wording improves in an
 * update improves everywhere at once, and a row that has been withdrawn simply
 * stops appearing rather than becoming a broken card.
 */
export const usePresetShelf = create<PresetShelfState>((set, get) => ({
  favorites: [],
  plays: [],
  hydrated: false,

  hydrate: async () => {
    const [favorites, plays] = await Promise.all([loadPresetFavorites(), loadPresetPlays()]);
    set({ favorites, plays, hydrated: true });
  },

  isFavorite: (id) => get().favorites.includes(id),

  toggleFavorite: async (id) => {
    const favorites = get().favorites.includes(id)
      ? get().favorites.filter((candidate) => candidate !== id)
      : [id, ...get().favorites];
    set({ favorites });
    await savePresetFavorites(favorites);
  },

  recordPlay: async (preset, representation) => {
    const play: PresetPlay = {
      presetId: preset.id,
      version: preset.version,
      at: new Date().toISOString(),
      representation,
    };
    const plays = [play, ...get().plays];
    set({ plays });
    await savePresetPlays(plays);
  },

  favoritePresets: () =>
    get()
      .favorites.map((id) => factoryPreset(id))
      .filter((row): row is FrequencyPreset => row !== undefined),

  recentPresets: (limit = 8) => {
    const seen = new Set<string>();
    const rows: { preset: FrequencyPreset; play: PresetPlay }[] = [];
    for (const play of get().plays) {
      if (seen.has(play.presetId)) continue;
      seen.add(play.presetId);
      const preset = factoryPreset(play.presetId);
      if (preset) rows.push({ preset, play });
      if (rows.length >= limit) break;
    }
    return rows;
  },
}));

/**
 * The presets a value appears in, as a source frequency or as a carrier.
 *
 * Broader than `presetsAtFrequency`, which answers "what does this app hold at
 * 528 Hz" and deliberately excludes carriers. The related-frequencies section
 * of a preset screen is asking a different question — where else does this
 * number turn up — so a 528 Hz carrier under a beat belongs in the answer, with
 * the row itself saying which of the two it is.
 */
export function presetsMentioning(
  hz: number,
  exceptId?: string,
  toleranceHz = 0.5,
): { preset: FrequencyPreset; as: 'source' | 'carrier' }[] {
  if (!Number.isFinite(hz) || hz <= 0) return [];
  const rows: { preset: FrequencyPreset; as: 'source' | 'carrier' }[] = [];
  for (const preset of FACTORY_PRESETS) {
    if (preset.id === exceptId) continue;
    if (
      preset.sourceFrequency.value !== 0 &&
      Math.abs(preset.sourceFrequency.value - hz) <= toleranceHz
    ) {
      rows.push({ preset, as: 'source' });
      continue;
    }
    const carrier = preset.representation.carrierHz;
    if (carrier !== undefined && Math.abs(carrier - hz) <= toleranceHz) {
      rows.push({ preset, as: 'carrier' });
    }
  }
  return rows;
}
