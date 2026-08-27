import { DEFAULT_MASTER, PROTOCOL_SCHEMA_VERSION, type Protocol } from './schema.js';
import { defaultOptions, defaultParams } from '../graph/descriptors.js';
import type { NodeKind } from '../graph/types.js';

/**
 * Forward migration of stored protocols.
 *
 * Every schema bump adds a step here and never rewrites an older one, so a
 * protocol saved by any past build still opens. Unknown future versions are
 * rejected by `validateProtocol` rather than silently coerced.
 */
export function migrateProtocol(raw: unknown): Protocol {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Not a protocol document.');
  }
  const candidate = raw as Partial<Protocol> & { schemaVersion?: number };
  const version = candidate.schemaVersion ?? 1;

  if (version > PROTOCOL_SCHEMA_VERSION) {
    throw new Error(
      `Protocol schema version ${version} is newer than this build supports (${PROTOCOL_SCHEMA_VERSION}).`,
    );
  }

  // Version 1 is the first published schema. Later versions chain from here:
  //   if (version < 2) protocol = upgradeV1toV2(protocol);
  return fillDefaults(candidate);
}

/**
 * Repairs a protocol that is structurally valid but missing fields a newer
 * descriptor set has since added. Keeps stored protocols openable when a node
 * gains a parameter.
 */
export function fillDefaults(candidate: Partial<Protocol>): Protocol {
  const now = new Date().toISOString();
  return {
    schemaVersion: candidate.schemaVersion ?? PROTOCOL_SCHEMA_VERSION,
    dspVersion: candidate.dspVersion ?? '1.0.0',
    id: candidate.id ?? `protocol-${Math.abs(hash(JSON.stringify(candidate) ?? ''))}`,
    name: candidate.name ?? 'Untitled Protocol',
    description: candidate.description,
    intent: candidate.intent ?? 'custom',
    sampleRate: candidate.sampleRate ?? 48000,
    master: { ...DEFAULT_MASTER, ...(candidate.master ?? {}) },
    stages: (candidate.stages ?? []).map((stage, index) => ({
      id: stage.id ?? `stage-${index + 1}`,
      name: stage.name ?? `Stage ${index + 1}`,
      durationSec: stage.durationSec ?? 300,
      crossfadeSec: stage.crossfadeSec ?? 2,
      notes: stage.notes,
      graph: {
        nodes: (stage.graph?.nodes ?? []).map((node) => ({
          ...node,
          params: { ...defaultParams(node.kind as NodeKind), ...node.params },
          options: { ...defaultOptions(node.kind as NodeKind), ...node.options },
        })),
        connections: stage.graph?.connections ?? [],
      },
      automation: (stage.automation ?? []).map((lane, laneIndex) => ({
        ...lane,
        id: lane.id ?? `lane-${index + 1}-${laneIndex + 1}`,
        enabled: lane.enabled !== false,
        points: lane.points ?? [],
      })),
    })),
    meta: {
      createdAt: candidate.meta?.createdAt ?? now,
      updatedAt: candidate.meta?.updatedAt ?? now,
      version: candidate.meta?.version ?? 1,
      author: candidate.meta?.author,
      tags: candidate.meta?.tags ?? [],
      lineage: candidate.meta?.lineage,
      notes: candidate.meta?.notes,
      generatedBy: candidate.meta?.generatedBy ?? 'user',
    },
  };
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  return h;
}
