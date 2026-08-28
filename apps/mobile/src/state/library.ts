import { create } from 'zustand';
import {
  bumpVersion,
  forkProtocol,
  normaliseProtocolName,
  protocolDna,
  renameProtocol,
  totalDurationSec,
  type Protocol,
  type ProtocolStage,
} from '@frequencylab/dsp-core';
import {
  loadProtocols,
  loadStagePresets,
  saveProtocols,
  saveStagePresets,
  seedPresetsIfEmpty,
} from '../storage/repositories';

interface ProtocolLibraryState {
  protocols: Protocol[];
  stagePresets: ProtocolStage[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  get: (id: string) => Protocol | undefined;
  save: (protocol: Protocol) => Promise<Protocol>;
  remove: (id: string) => Promise<void>;
  /**
   * Gives a protocol a new name, and optionally a new description. Pass an
   * empty description to clear one, or omit it to leave it alone.
   */
  rename: (id: string, name: string, description?: string) => Promise<Protocol | undefined>;
  fork: (id: string, name?: string) => Promise<Protocol | undefined>;
  /** Every protocol that shares a lineage root with `id`, oldest first. */
  lineageOf: (id: string) => Protocol[];
  saveStagePreset: (stage: ProtocolStage) => Promise<void>;
  removeStagePreset: (id: string) => Promise<void>;
}

export const useProtocolLibrary = create<ProtocolLibraryState>((set, get) => ({
  protocols: [],
  stagePresets: [],
  hydrated: false,

  hydrate: async () => {
    const [protocols, stagePresets] = await Promise.all([
      seedPresetsIfEmpty().then(() => loadProtocols()),
      loadStagePresets(),
    ]);
    set({ protocols, stagePresets, hydrated: true });
  },

  get: (id) => get().protocols.find((protocol) => protocol.id === id),

  save: async (protocol) => {
    const existing = get().protocols.find((candidate) => candidate.id === protocol.id);
    // Version bumps happen here rather than at every call site, so history is
    // consistent no matter which screen made the edit.
    const next = existing ? bumpVersion(protocol) : protocol;
    const protocols = existing
      ? get().protocols.map((candidate) => (candidate.id === next.id ? next : candidate))
      : [next, ...get().protocols];
    set({ protocols });
    await saveProtocols(protocols);
    return next;
  },

  remove: async (id) => {
    const protocols = get().protocols.filter((protocol) => protocol.id !== id);
    set({ protocols });
    await saveProtocols(protocols);
  },

  /*
   * Renaming goes through `save` like any other edit, so it persists, bumps the
   * version and refreshes `updatedAt` by exactly the same path a parameter
   * change does. Presets are renamed in place rather than forked: they are
   * seeded into this store on first run (see `seedPresetsIfEmpty`) and are the
   * user's own copies, so there is no shipped record to protect.
   */
  rename: async (id, name, description) => {
    const source = get().get(id);
    if (!source) return undefined;
    return get().save(renameProtocol(source, name, description));
  },

  fork: async (id, name) => {
    const source = get().get(id);
    if (!source) return undefined;
    const forked = forkProtocol(source, `protocol-${Date.now().toString(36)}`, name);
    const protocols = [forked, ...get().protocols];
    set({ protocols });
    await saveProtocols(protocols);
    return forked;
  },

  lineageOf: (id) => {
    const all = get().protocols;
    const target = all.find((protocol) => protocol.id === id);
    if (!target) return [];
    const rootId = target.meta.lineage?.rootId ?? target.id;
    return all
      .filter((protocol) => (protocol.meta.lineage?.rootId ?? protocol.id) === rootId)
      .sort(
        (a, b) => new Date(a.meta.createdAt).getTime() - new Date(b.meta.createdAt).getTime(),
      );
  },

  saveStagePreset: async (stage) => {
    const stagePresets = [stage, ...get().stagePresets.filter((preset) => preset.id !== stage.id)];
    set({ stagePresets });
    await saveStagePresets(stagePresets);
  },

  removeStagePreset: async (id) => {
    const stagePresets = get().stagePresets.filter((preset) => preset.id !== id);
    set({ stagePresets });
    await saveStagePresets(stagePresets);
  },
}));

export interface ProtocolSummary {
  id: string;
  name: string;
  description?: string;
  durationSec: number;
  stageCount: number;
  humanDna: string;
  fingerprint: string;
  intent: Protocol['intent'];
  updatedAt: string;
  version: number;
  generatedBy: Protocol['meta']['generatedBy'];
  isFork: boolean;
  /**
   * Another protocol in the same list is called this too. Set only by
   * `summariseLibrary`, which is the only caller that can see the whole list.
   */
  nameIsShared?: boolean;
}

export function summarise(protocol: Protocol): ProtocolSummary {
  const dna = protocolDna(protocol);
  return {
    id: protocol.id,
    name: protocol.name,
    description: protocol.description,
    durationSec: totalDurationSec(protocol),
    stageCount: protocol.stages.length,
    humanDna: dna.human,
    fingerprint: dna.fingerprint,
    intent: protocol.intent,
    updatedAt: protocol.meta.updatedAt,
    version: protocol.meta.version,
    generatedBy: protocol.meta.generatedBy,
    isFork: protocol.meta.lineage !== undefined,
  };
}

/**
 * Summarises a whole list, marking the names that appear more than once.
 *
 * Duplicate names are permitted — people reuse a word, and forbidding it would
 * be the app policing their filing. What is not acceptable is a list of rows
 * nobody can tell apart, so `ProtocolCard` uses this flag to keep the
 * description visible even where it would normally be dropped for space, and to
 * put it in the accessibility label. The description is the difference a person
 * can actually read; the fingerprint, which is the difference that matters to
 * the engine, stays one tap away on the detail screen.
 */
export function summariseLibrary(protocols: Protocol[]): ProtocolSummary[] {
  const counts = new Map<string, number>();
  for (const protocol of protocols) {
    const key = normaliseProtocolName(protocol.name).toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return protocols.map((protocol) => ({
    ...summarise(protocol),
    nameIsShared: (counts.get(normaliseProtocolName(protocol.name).toLowerCase()) ?? 0) > 1,
  }));
}
