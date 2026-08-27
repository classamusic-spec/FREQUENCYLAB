import type { CurveSpec } from '../math/curves.js';
import type { ParamAddress, RoutingGraph } from '../graph/types.js';

/** Bumped whenever the stored shape of a protocol changes. */
export const PROTOCOL_SCHEMA_VERSION = 1;

/**
 * Bumped whenever a DSP change would alter the audio rendered from an
 * unchanged protocol. Protocol DNA carries it, so a session recorded today can
 * always be reproduced by pinning the engine that made it.
 */
export const DSP_VERSION = '1.0.0';

export type ProtocolIntent = 'relax' | 'focus' | 'meditate' | 'sleep' | 'explore' | 'custom';

export interface MasterSettings {
  /** Linear output gain applied after the graph, before the limiter. */
  gain: number;
  /** The limiter cannot be disabled in shipping builds; the flag exists for tests. */
  limiter: boolean;
  limiterCeilingDb: number;
  fadeInSec: number;
  fadeOutSec: number;
}

export interface AutomationPoint {
  timeSec: number;
  value: number;
  /** Shape of the segment running from this point to the next one. */
  curve: CurveSpec;
}

export interface AutomationLane {
  id: string;
  /** `nodeId:paramKey`. */
  target: ParamAddress;
  points: AutomationPoint[];
  enabled: boolean;
  /** Optional label shown on the lane header in the timeline editor. */
  label?: string;
}

export interface ProtocolStage {
  id: string;
  name: string;
  durationSec: number;
  graph: RoutingGraph;
  automation: AutomationLane[];
  /**
   * Equal-power cross-fade into this stage, in seconds. Stages rebuild the
   * graph, so without a cross-fade a stage boundary would step.
   */
  crossfadeSec: number;
  notes?: string;
}

export interface ProtocolLineage {
  /** Id of the protocol this one was forked from. */
  parentId: string;
  /** `version` of the parent at the moment of the fork. */
  parentVersion: number;
  /** Id of the original ancestor, so a whole family can be queried at once. */
  rootId: string;
}

export interface ProtocolMeta {
  createdAt: string;
  updatedAt: string;
  /** Monotonic version counter, incremented on every saved edit. */
  version: number;
  author?: string;
  tags: string[];
  lineage?: ProtocolLineage;
  notes?: string;
  /** Set by the AI designer so generated protocols are always identifiable. */
  generatedBy?: 'user' | 'ai' | 'preset';
}

export interface Protocol {
  schemaVersion: number;
  dspVersion: string;
  id: string;
  name: string;
  description?: string;
  intent: ProtocolIntent;
  sampleRate: number;
  master: MasterSettings;
  stages: ProtocolStage[];
  meta: ProtocolMeta;
}

export const DEFAULT_MASTER: MasterSettings = {
  gain: 0.5,
  limiter: true,
  limiterCeilingDb: -1,
  fadeInSec: 4,
  fadeOutSec: 6,
};

export function totalDurationSec(protocol: Protocol): number {
  return protocol.stages.reduce((sum, stage) => sum + Math.max(0, stage.durationSec), 0);
}

/** Absolute start time of each stage, in seconds. */
export function stageOffsets(protocol: Protocol): number[] {
  const offsets: number[] = [];
  let elapsed = 0;
  for (const stage of protocol.stages) {
    offsets.push(elapsed);
    elapsed += Math.max(0, stage.durationSec);
  }
  return offsets;
}

/** Index of the stage containing `timeSec`, or -1 past the end. */
export function stageIndexAt(protocol: Protocol, timeSec: number): number {
  let elapsed = 0;
  for (let i = 0; i < protocol.stages.length; i++) {
    const end = elapsed + Math.max(0, protocol.stages[i].durationSec);
    if (timeSec < end) return i;
    elapsed = end;
  }
  return -1;
}
