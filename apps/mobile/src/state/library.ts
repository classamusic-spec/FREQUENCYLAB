import { create } from 'zustand';
import {
  bumpVersion,
  forkProtocol,
  protocolDna,
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
