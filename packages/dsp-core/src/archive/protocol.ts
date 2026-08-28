import { buildStandardGraph, createProtocol } from '../protocol/builders.js';
import { defaultParams } from '../graph/descriptors.js';
import { makeNode } from '../graph/factory.js';
import { OUTPUT_NODE_ID, type RoutingGraph } from '../graph/types.js';
import { MAX_TONE_HZ } from '../math/constants.js';
import { clamp } from '../math/util.js';
import type { Protocol, ProtocolStage } from '../protocol/schema.js';
import { referenceFor, type HistoricalReference, type PlaybackTransform } from './transforms.js';
import type { ArchiveEntry } from './types.js';

/**
 * Turning archive entries into runnable protocols (§13, §14, §29).
 *
 * The hard requirement is that the app must not *guess* how a historical list
 * was meant to be heard. A table of numbers carries no instruction about
 * carriers, headphones or modulation, so the caller supplies an explicit
 * `PlaybackTransform` per entry and the resulting protocol records it.
 *
 * Everything the transform decided is written into the protocol's metadata, so
 * a session run from a divided or re-carriered value can be reproduced exactly
 * and audited later.
 */

export interface ArchiveStageSpec {
  entry: ArchiveEntry;
  transform: PlaybackTransform;
  durationSec: number;
  /** Cross-fade into this stage. Zero gives the abrupt step a table implies. */
  crossfadeSec?: number;
  amplitude?: number;
  noise?: { color: 'white' | 'pink' | 'brown'; level: number };
}

/** Metadata attached to a protocol built from the archive. */
export interface ArchiveProvenance {
  kind: 'archive';
  references: HistoricalReference[];
  /** Restated on the protocol so it travels with a shared DNA. */
  notice: string;
}

const PROVENANCE_NOTICE =
  'Built from historical archive entries. Frequencies are reproduced as sound through headphones, which is not equivalent to any historical electrical or electromagnetic apparatus. Transforms applied to each value are recorded below.';

/**
 * Builds the graph for one entry under one transform.
 *
 * Each transform maps to a genuinely different signal chain — a direct tone is
 * an oscillator, a binaural difference is two tones, an AM rate is a modulated
 * carrier. Nothing is approximated by reusing the wrong engine.
 *
 * The switch is exhaustive on purpose. It used to end in a `default` that fell
 * back to a plain tone, which meant any transform added to the translator would
 * quietly be auditioned as something else — the silent substitution the
 * translator exists to prevent, reappearing one module downstream. A new kind
 * now fails to compile here until it has a chain of its own.
 */
export function graphForTransform(spec: ArchiveStageSpec): RoutingGraph {
  const { transform } = spec;
  const amplitude = spec.amplitude ?? 0.34;
  const carrier = transform.carrierHz ?? 220;

  switch (transform.kind) {
    case 'binaural-beat':
      return buildStandardGraph({
        engine: 'binaural',
        carrierHz: carrier,
        beatHz: transform.playbackHz,
        amplitude,
        noise: spec.noise,
      });
    case 'binaural-carrier':
      return buildStandardGraph({
        engine: 'binaural',
        carrierHz: clamp(transform.playbackHz, 20, 1500),
        beatHz: 10,
        amplitude,
        noise: spec.noise,
      });
    case 'am-rate':
      return buildStandardGraph({
        engine: 'binaural',
        carrierHz: carrier,
        beatHz: 10,
        amplitude,
        am: { rateHz: transform.playbackHz, depth: 0.5 },
        noise: spec.noise,
      });
    case 'isochronic-rate':
      return buildStandardGraph({
        engine: 'isochronic',
        carrierHz: carrier,
        beatHz: transform.playbackHz,
        amplitude,
        noise: spec.noise,
      });
    case 'binaural-centered':
      return buildStandardGraph({
        engine: 'binaural',
        binauralMode: 'centered',
        carrierHz: carrier,
        beatHz: transform.playbackHz,
        amplitude,
        noise: spec.noise,
      });
    case 'monaural-beat':
      return buildStandardGraph({
        engine: 'monaural',
        carrierHz: carrier,
        beatHz: transform.playbackHz,
        amplitude,
        noise: spec.noise,
      });
    case 'fm-rate':
      return buildStandardGraph({
        engine: 'fm',
        carrierHz: carrier,
        beatHz: transform.playbackHz,
        // The swing the transform stated, not a fresh one: the chain has to
        // produce the signal the user was shown before they pressed play.
        fm: { deviationHz: transform.deviationHz },
        amplitude,
        noise: spec.noise,
      });
    case 'stereo-motion-rate':
      return buildStandardGraph({
        engine: 'tone',
        carrierHz: carrier,
        beatHz: 0,
        amplitude,
        motion: { rateHz: transform.playbackHz, depth: defaultParams('stereoMotion').depth },
        noise: spec.noise,
      });
    case 'noise-modulation-rate': {
      // Here the bed *is* the signal, so one is always present. Absent an
      // explicit choice the noise module's own defaults stand rather than a
      // second set of numbers kept in this file.
      const bed = spec.noise ?? { color: 'pink' as const, level: defaultParams('noise').level };
      return buildStandardGraph({
        engine: 'none',
        carrierHz: carrier,
        beatHz: 0,
        amplitude,
        noise: bed,
        // Full depth: the transform's whole statement is that the bed's level
        // rises and falls at this rate, and a shallower one would understate it.
        am: { rateHz: transform.playbackHz, depth: 1 },
      });
    }
    case 'harmonic-stack':
      return buildStandardGraph({
        engine: 'harmonic',
        carrierHz: transform.playbackHz,
        beatHz: 0,
        amplitude,
        noise: spec.noise,
      });
    case 'direct':
    case 'octave-down':
    case 'octave-up':
    case 'subharmonic':
      return directToneGraph(transform.playbackHz, amplitude, spec.noise);
    default: {
      const exhaustive: never = transform.kind;
      throw new Error(`No signal chain for transform "${String(exhaustive)}".`);
    }
  }
}

/**
 * A pure tone at an exact frequency.
 *
 * Uses the oscillator rather than a binaural pair, because a direct archive
 * value is a *pitch*, and rendering it as two detuned tones would silently
 * alter the number the user asked to hear.
 */
function directToneGraph(
  hz: number,
  amplitude: number,
  noise?: ArchiveStageSpec['noise'],
): RoutingGraph {
  const nodes = [
    makeNode('tone', 'oscillator', {
      frequency: clamp(hz, 20, MAX_TONE_HZ),
      amplitude,
      pan: 0,
    }),
    makeNode('mix', 'mixer', { gain: 1 }),
    makeNode(OUTPUT_NODE_ID, 'output'),
  ];
  const connections = [
    { from: 'tone', to: 'mix' },
    { from: 'mix', to: OUTPUT_NODE_ID },
  ];
  if (noise && noise.level > 0) {
    nodes.splice(1, 0, makeNode('noise', 'noise', { level: noise.level }, { color: noise.color }));
    connections.push({ from: 'noise', to: 'mix' });
  }
  return { nodes, connections };
}

export interface BuildArchiveProtocolOptions {
  id: string;
  name: string;
  description?: string;
  stages: ArchiveStageSpec[];
  createdAt?: string;
  masterGain?: number;
}

/**
 * Converts a frequency set into a staged protocol (§13).
 *
 * The order the source gave is preserved exactly; stages are never reordered
 * or deduplicated, because sequence is part of what a historical list asserts.
 */
export function buildArchiveProtocol(options: BuildArchiveProtocolOptions): Protocol {
  const stages: ProtocolStage[] = options.stages.map((spec, index) => ({
    id: `stage-${index + 1}`,
    name: spec.entry.name.slice(0, 40),
    durationSec: Math.max(5, Math.round(spec.durationSec)),
    crossfadeSec: spec.crossfadeSec ?? (index === 0 ? 0 : 2),
    graph: graphForTransform(spec),
    automation: [],
    notes: describeStage(spec),
  }));

  const provenance: ArchiveProvenance = {
    kind: 'archive',
    references: options.stages.map((spec) => referenceFor(spec.entry, spec.transform)),
    notice: PROVENANCE_NOTICE,
  };

  const protocol = createProtocol({
    id: options.id,
    name: options.name,
    description: options.description,
    intent: 'explore',
    stages,
    master: { gain: options.masterGain ?? 0.5, fadeInSec: 4, fadeOutSec: 5 },
    tags: ['archive', 'historical'],
    generatedBy: 'user',
    createdAt: options.createdAt,
  });

  // Provenance rides in `notes`, which is part of the stored protocol and is
  // carried by an exported DNA document, so a shared protocol arrives with its
  // sources rather than as anonymous numbers.
  return {
    ...protocol,
    meta: { ...protocol.meta, notes: JSON.stringify(provenance) },
  };
}

/** Reads provenance back off a protocol, if it has any. */
export function archiveProvenance(protocol: Protocol): ArchiveProvenance | undefined {
  const raw = protocol.meta.notes;
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as ArchiveProvenance;
    return parsed?.kind === 'archive' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function describeStage(spec: ArchiveStageSpec): string {
  const { entry, transform } = spec;
  const base = `${entry.name} — archived value ${entry.frequency} Hz. ${transform.description}`;
  return transform.equivalenceNote ? `${base} ${transform.equivalenceNote}` : base;
}
