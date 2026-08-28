import { create } from 'zustand';
import {
  ARCHIVE_ENTRIES,
  ARCHIVE_SETS,
  archiveEntry as shippedEntry,
  materialiseImport,
  type ArchiveEntry,
  type ArchiveRevision,
  type ArchiveSet,
  type ImportOptions,
  type ImportPreview,
} from '@frequencylab/dsp-core';
import {
  loadArchiveAcknowledgedAt,
  loadArchiveEntries,
  loadArchiveFavorites,
  loadArchiveNotes,
  loadArchiveSets,
  saveArchiveAcknowledgedAt,
  saveArchiveEntries,
  saveArchiveFavorites,
  saveArchiveNotes,
  saveArchiveSets,
} from '../storage/repositories';

interface ArchiveState {
  /** Records the user imported or corrected. */
  userEntries: ArchiveEntry[];
  userSets: ArchiveSet[];
  favorites: string[];
  notes: Record<string, string>;
  /** When the user read the archive's scope-and-safety notice (§36). */
  acknowledgedAt: string | null;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  /** Everything holdable, shipped and user, in one list. */
  all: () => ArchiveEntry[];
  get: (id: string) => ArchiveEntry | undefined;
  sets: () => ArchiveSet[];
  isUserEntry: (id: string) => boolean;

  acknowledge: () => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  setNote: (id: string, note: string) => Promise<void>;
  commitImport: (preview: ImportPreview, options: ImportOptions) => Promise<ArchiveSet>;
  removeSet: (setId: string) => Promise<void>;
  /** Corrects a user record, keeping the previous value in the change log. */
  correctEntry: (
    id: string,
    patch: { name?: string; frequency?: number; summary?: string },
    reason: string,
  ) => Promise<void>;
}

/**
 * The historical archive.
 *
 * Two populations live here and they are deliberately not merged on disk. The
 * entries that ship with the app are code: they can be improved by an update
 * without a migration, and nothing the user does rewrites them. Everything the
 * user imported or corrected is stored, versioned and exportable.
 *
 * The store never edits a historical value in place. A correction appends a
 * revision recording what the value was, what it became and why, and bumps the
 * source version — because a frequency that changed silently is indistinguishable
 * from a frequency that was always wrong.
 */
export const useArchive = create<ArchiveState>((set, get) => ({
  userEntries: [],
  userSets: [],
  favorites: [],
  notes: {},
  acknowledgedAt: null,
  hydrated: false,

  hydrate: async () => {
    const [userEntries, userSets, favorites, notes, acknowledgedAt] = await Promise.all([
      loadArchiveEntries(),
      loadArchiveSets(),
      loadArchiveFavorites(),
      loadArchiveNotes(),
      loadArchiveAcknowledgedAt(),
    ]);
    set({ userEntries, userSets, favorites, notes, acknowledgedAt, hydrated: true });
  },

  all: () => [...ARCHIVE_ENTRIES, ...get().userEntries],

  get: (id) => shippedEntry(id) ?? get().userEntries.find((entry) => entry.id === id),

  sets: () => [...ARCHIVE_SETS, ...get().userSets],

  isUserEntry: (id) => get().userEntries.some((entry) => entry.id === id),

  acknowledge: async () => {
    const at = new Date().toISOString();
    set({ acknowledgedAt: at });
    await saveArchiveAcknowledgedAt(at);
  },

  toggleFavorite: async (id) => {
    const favorites = get().favorites.includes(id)
      ? get().favorites.filter((candidate) => candidate !== id)
      : [id, ...get().favorites];
    set({ favorites });
    await saveArchiveFavorites(favorites);
  },

  setNote: async (id, note) => {
    const notes = { ...get().notes };
    if (note.trim()) notes[id] = note;
    else delete notes[id];
    set({ notes });
    await saveArchiveNotes(notes);
  },

  commitImport: async (preview, options) => {
    const { entries, set: collection } = materialiseImport(preview, options);
    const userEntries = [...get().userEntries, ...entries];
    const userSets = [collection, ...get().userSets];
    set({ userEntries, userSets });
    await Promise.all([saveArchiveEntries(userEntries), saveArchiveSets(userSets)]);
    return collection;
  },

  removeSet: async (setId) => {
    const collection = get().userSets.find((candidate) => candidate.id === setId);
    if (!collection) return;
    const memberIds = new Set(collection.entryIds);
    const userEntries = get().userEntries.filter((entry) => !memberIds.has(entry.id));
    const userSets = get().userSets.filter((candidate) => candidate.id !== setId);
    set({ userEntries, userSets });
    await Promise.all([saveArchiveEntries(userEntries), saveArchiveSets(userSets)]);
  },

  correctEntry: async (id, patch, reason) => {
    const existing = get().userEntries.find((entry) => entry.id === id);
    if (!existing) return;

    const changes: string[] = [];
    if (patch.frequency !== undefined && patch.frequency !== existing.frequency) {
      changes.push(`Frequency ${existing.frequency} Hz → ${patch.frequency} Hz`);
    }
    if (patch.name !== undefined && patch.name !== existing.name) {
      changes.push(`Name "${existing.name}" → "${patch.name}"`);
    }
    if (patch.summary !== undefined && patch.summary !== existing.summary) {
      changes.push('Description edited');
    }
    if (changes.length === 0) return;

    const now = new Date().toISOString();
    const revision: ArchiveRevision = {
      version: existing.sourceVersion + 1,
      at: now,
      change: `${changes.join('. ')}. Reason: ${reason || 'not given'}.`,
      scope: 'historical-record',
      by: 'user',
    };

    const next: ArchiveEntry = {
      ...existing,
      ...patch,
      sourceVersion: existing.sourceVersion + 1,
      updatedAt: now,
      changeLog: [...existing.changeLog, revision],
    };

    const userEntries = get().userEntries.map((entry) => (entry.id === id ? next : entry));
    set({ userEntries });
    await saveArchiveEntries(userEntries);
  },
}));
