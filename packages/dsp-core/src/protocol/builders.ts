import type { NoiseColor } from '../dsp/noise.js';
import type { EnvelopeShape, Waveform } from '../dsp/oscillator.js';
import { makeNode } from '../graph/factory.js';
import { OUTPUT_NODE_ID, type RoutingGraph } from '../graph/types.js';
import { clamp } from '../math/util.js';
import type { CurveSpec } from '../math/curves.js';
import { makeSweepLane } from './automation.js';
import {
  DEFAULT_MASTER,
  DSP_VERSION,
  PROTOCOL_SCHEMA_VERSION,
  type AutomationLane,
  type Protocol,
  type ProtocolIntent,
  type ProtocolStage,
} from './schema.js';

/**
 * Simple Mode is not a separate product. Every preset, every guided session and
 * every one-tap start compiles down to the same protocol object Lab Mode edits
 * (§80) — these builders are that compiler.
 */

export const TONE_NODE = 'tone';
export const AM_NODE = 'am';
export const NOISE_NODE = 'noise';
export const MIX_NODE = 'mix';
export const MOTION_NODE = 'motion';

export type StimulationEngine = 'binaural' | 'monaural' | 'isochronic';

export interface ChainOptions {
  engine: StimulationEngine;
  carrierHz: number;
  beatHz: number;
  /** Linear amplitude of the tone module, 0..1. */
  amplitude: number;
  waveform?: Waveform;
  binauralMode?: 'offset' | 'centered';
  separation?: number;
  noise?: {
    color: NoiseColor;
    level: number;
    width?: number;
    cutoff?: number;
  };
  am?: {
    rateHz: number;
    depth: number;
    shape?: EnvelopeShape;
  };
  motion?: {
    rateHz: number;
    depth: number;
  };
  isochronic?: {
    duty?: number;
    depth?: number;
    attack?: number;
    release?: number;
    envelope?: EnvelopeShape;
  };
}

/**
 * The standard signal chain:
 *
 *   TONE ─┬─> [AM] ─┐
 *         │         ├─> MIX ─> [MOTION] ─> OUTPUT
 *   NOISE ┴─────────┘
 *
 * Optional modules are omitted entirely rather than left at zero, so the
 * signal-flow view and the DNA both describe exactly what is running.
 */
export function buildStandardGraph(options: ChainOptions): RoutingGraph {
  const nodes = [];
  const connections: Array<{ from: string; to: string }> = [];

  const amplitude = clamp(options.amplitude, 0, 1);

  if (options.engine === 'binaural') {
    nodes.push(
      makeNode(
        TONE_NODE,
        'binaural',
        {
          carrier: options.carrierHz,
          beat: options.beatHz,
          amplitude,
          separation: options.separation ?? 1,
        },
        { waveform: options.waveform ?? 'sine', mode: options.binauralMode ?? 'offset' },
        { position: { x: 80, y: 80 } },
      ),
    );
  } else if (options.engine === 'monaural') {
    nodes.push(
      makeNode(
        TONE_NODE,
        'monaural',
        { carrier: options.carrierHz, beat: options.beatHz, amplitude, mix: 0.5 },
        { waveform: options.waveform ?? 'sine' },
        { position: { x: 80, y: 80 } },
      ),
    );
  } else {
    const iso = options.isochronic ?? {};
    nodes.push(
      makeNode(
        TONE_NODE,
        'isochronic',
        {
          carrier: options.carrierHz,
          pulse: options.beatHz,
          amplitude,
          duty: iso.duty ?? 0.5,
          depth: iso.depth ?? 1,
          attack: iso.attack ?? 0.15,
          release: iso.release ?? 0.25,
        },
        { waveform: options.waveform ?? 'sine', envelope: iso.envelope ?? 'softSquare' },
        { position: { x: 80, y: 80 } },
      ),
    );
  }

  let toneOutlet = TONE_NODE;

  if (options.am && options.am.depth > 0) {
    nodes.push(
      makeNode(
        AM_NODE,
        'am',
        {
          carrier: options.carrierHz,
          modFrequency: options.am.rateHz,
          depth: clamp(options.am.depth, 0, 1),
          amplitude: 1,
        },
        { envelope: options.am.shape ?? 'sine' },
        { position: { x: 260, y: 80 } },
      ),
    );
    connections.push({ from: TONE_NODE, to: AM_NODE });
    toneOutlet = AM_NODE;
  }

  if (options.noise && options.noise.level > 0) {
    nodes.push(
      makeNode(
        NOISE_NODE,
        'noise',
        {
          level: clamp(options.noise.level, 0, 1),
          width: options.noise.width ?? 0.7,
          cutoff: options.noise.cutoff ?? 8000,
        },
        { color: options.noise.color },
        { position: { x: 80, y: 240 } },
      ),
    );
  }

  nodes.push(makeNode(MIX_NODE, 'mixer', { gain: 1 }, {}, { position: { x: 440, y: 160 } }));
  connections.push({ from: toneOutlet, to: MIX_NODE });
  if (options.noise && options.noise.level > 0) {
    connections.push({ from: NOISE_NODE, to: MIX_NODE });
  }

  if (options.motion && options.motion.depth > 0) {
    nodes.push(
      makeNode(
        MOTION_NODE,
        'stereoMotion',
        { rate: options.motion.rateHz, depth: clamp(options.motion.depth, 0, 1), center: 0 },
        {},
        { position: { x: 600, y: 160 } },
      ),
    );
    connections.push({ from: MIX_NODE, to: MOTION_NODE });
    connections.push({ from: MOTION_NODE, to: OUTPUT_NODE_ID });
  } else {
    connections.push({ from: MIX_NODE, to: OUTPUT_NODE_ID });
  }

  nodes.push(makeNode(OUTPUT_NODE_ID, 'output', {}, {}, { position: { x: 780, y: 160 } }));

  return { nodes, connections };
}

export interface StageOptions extends ChainOptions {
  id: string;
  name: string;
  durationSec: number;
  crossfadeSec?: number;
  notes?: string;
  /** Sweeps the beat from its start value to this one across the stage. */
  beatToHz?: number;
  /** Sweeps the carrier from its start value to this one across the stage. */
  carrierToHz?: number;
  /** Sweeps the noise level across the stage. */
  noiseToLevel?: number;
  sweepCurve?: CurveSpec;
}

/** Builds a stage, turning any `*To` value into a real automation lane. */
export function buildStage(options: StageOptions): ProtocolStage {
  const graph = buildStandardGraph(options);
  const automation: AutomationLane[] = [];
  const curve = options.sweepCurve ?? { kind: 'smooth' };
  const beatParam = options.engine === 'isochronic' ? 'pulse' : 'beat';

  if (options.beatToHz !== undefined && options.beatToHz !== options.beatHz) {
    automation.push(
      makeSweepLane(
        `${options.id}-beat`,
        `${TONE_NODE}:${beatParam}`,
        options.beatHz,
        options.beatToHz,
        options.durationSec,
        curve,
        'Beat',
      ),
    );
  }
  if (options.carrierToHz !== undefined && options.carrierToHz !== options.carrierHz) {
    automation.push(
      makeSweepLane(
        `${options.id}-carrier`,
        `${TONE_NODE}:carrier`,
        options.carrierHz,
        options.carrierToHz,
        options.durationSec,
        curve,
        'Carrier',
      ),
    );
  }
  if (
    options.noise &&
    options.noiseToLevel !== undefined &&
    options.noiseToLevel !== options.noise.level
  ) {
    automation.push(
      makeSweepLane(
        `${options.id}-noise`,
        `${NOISE_NODE}:level`,
        options.noise.level,
        options.noiseToLevel,
        options.durationSec,
        curve,
        'Noise',
      ),
    );
  }

  return {
    id: options.id,
    name: options.name,
    durationSec: options.durationSec,
    crossfadeSec: options.crossfadeSec ?? 3,
    notes: options.notes,
    graph,
    automation,
  };
}

export interface CreateProtocolOptions {
  id: string;
  name: string;
  description?: string;
  intent?: ProtocolIntent;
  sampleRate?: number;
  stages: ProtocolStage[];
  master?: Partial<Protocol['master']>;
  tags?: string[];
  author?: string;
  generatedBy?: 'user' | 'ai' | 'preset';
  createdAt?: string;
  notes?: string;
}

export function createProtocol(options: CreateProtocolOptions): Protocol {
  const timestamp = options.createdAt ?? new Date().toISOString();
  return {
    schemaVersion: PROTOCOL_SCHEMA_VERSION,
    dspVersion: DSP_VERSION,
    id: options.id,
    name: options.name,
    description: options.description,
    intent: options.intent ?? 'custom',
    sampleRate: options.sampleRate ?? 48000,
    master: { ...DEFAULT_MASTER, ...(options.master ?? {}) },
    stages: options.stages,
    meta: {
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      author: options.author,
      tags: options.tags ?? [],
      notes: options.notes,
      generatedBy: options.generatedBy ?? 'user',
    },
  };
}

/**
 * Forks a protocol, recording lineage so the community view can render the
 * V1 → V2 → V3 chain and diff any two points on it (§23).
 */
export function forkProtocol(source: Protocol, newId: string, name?: string, author?: string): Protocol {
  const timestamp = new Date().toISOString();
  return {
    ...source,
    id: newId,
    name: name ?? `${source.name} (fork)`,
    meta: {
      ...source.meta,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      author: author ?? source.meta.author,
      generatedBy: 'user',
      lineage: {
        parentId: source.id,
        parentVersion: source.meta.version,
        rootId: source.meta.lineage?.rootId ?? source.id,
      },
    },
  };
}

/** Increments the version counter and refreshes `updatedAt` on a saved edit. */
export function bumpVersion(protocol: Protocol): Protocol {
  return {
    ...protocol,
    meta: {
      ...protocol.meta,
      version: protocol.meta.version + 1,
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Naming.
 *
 * A protocol's name is whatever the person who made it wants to call it, and
 * `canonicalProtocol` deliberately excludes name, description and id from the
 * canonical form. Renaming therefore changes what a protocol is *called* and
 * nothing at all about what it *sounds like*: same fingerprint, same share
 * code, same audio. `test/rename.test.ts` proves that rather than asserting it.
 *
 * The limits below exist so a name stays readable in a list, not to police what
 * anyone calls their own work. Two protocols are allowed to share a name — what
 * actually distinguishes them is their fingerprint, and refusing a duplicate
 * would be the app having an opinion about someone else's filing.
 */

export const PROTOCOL_NAME_MAX_LENGTH = 60;
export const PROTOCOL_DESCRIPTION_MAX_LENGTH = 160;

/**
 * Tidies typed or pasted text into a single clean line.
 *
 * Control characters and line breaks become spaces, runs of whitespace
 * collapse, the ends are trimmed and the result is capped. Collapsing rather
 * than refusing means a name pasted out of a document arrives usable, instead
 * of being rejected for a character the user cannot see.
 */
function tidyLine(input: string, maxLength: number): string {
  return input
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    // A cut can land mid-space, so the trim is repeated after the slice.
    .trim();
}

export function normaliseProtocolName(input: string): string {
  return tidyLine(input, PROTOCOL_NAME_MAX_LENGTH);
}

export function normaliseProtocolDescription(input: string): string {
  return tidyLine(input, PROTOCOL_DESCRIPTION_MAX_LENGTH);
}

/**
 * Why a name cannot be used, phrased the way the UI will show it, or `null`
 * when it is fine.
 *
 * Only emptiness is refused. An over-long name is shortened by
 * `normaliseProtocolName` rather than rejected, and a duplicate is not an issue
 * at all.
 */
export function protocolNameIssue(input: string): string | null {
  return normaliseProtocolName(input).length === 0 ? 'A protocol needs a name.' : null;
}

/**
 * Renames a protocol, optionally replacing its description.
 *
 * Only `name` and `description` move; stages, master settings, sample rate and
 * every other audio-determining field are carried through untouched, which is
 * exactly what keeps the fingerprint stable.
 *
 * Pass an empty description to remove one; omit the argument to leave whatever
 * description the protocol already has.
 */
export function renameProtocol(protocol: Protocol, name: string, description?: string): Protocol {
  const issue = protocolNameIssue(name);
  if (issue) throw new Error(issue);

  const renamed: Protocol = { ...protocol, name: normaliseProtocolName(name) };
  if (description !== undefined) {
    const tidied = normaliseProtocolDescription(description);
    renamed.description = tidied.length > 0 ? tidied : undefined;
  }
  return renamed;
}
