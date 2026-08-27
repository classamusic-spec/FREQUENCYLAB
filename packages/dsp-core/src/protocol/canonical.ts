import { roundTo } from '../math/util.js';
import type { Protocol } from './schema.js';

/**
 * Canonical serialisation.
 *
 * Two protocols that render identical audio must produce byte-identical
 * canonical JSON, and two protocols that render differently must not. That is
 * the whole contract behind Protocol DNA (§12, §45).
 *
 * Rules:
 *  - object keys sorted lexicographically;
 *  - numbers rounded to 6 decimals and printed without exponent, so a value
 *    that survives a JSON round trip on one platform survives it on all;
 *  - `undefined` and editor-only fields dropped;
 *  - no whitespace.
 */

const NUMERIC_PRECISION = 6;

export function canonicalJson(value: unknown): string {
  return stringify(value);
}

function stringify(value: unknown): string {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'number') return formatNumber(value as number);
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stringify(entry === undefined ? null : entry)).join(',')}]`;
  }
  if (type === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stringify(record[key])}`).join(',')}}`;
  }
  return 'null';
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = roundTo(value, NUMERIC_PRECISION);
  if (Number.isInteger(rounded)) return String(rounded);
  // toFixed then trim keeps exponent notation out of the canonical form.
  return rounded.toFixed(NUMERIC_PRECISION).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * The subset of a protocol that determines the rendered audio.
 *
 * Deliberately excludes id, name, description, tags, timestamps and lineage:
 * renaming a protocol must not change its DNA, and two people who independently
 * build the same signal chain should discover they made the same thing.
 */
export interface CanonicalProtocol {
  schemaVersion: number;
  dspVersion: string;
  sampleRate: number;
  master: Protocol['master'];
  stages: Array<{
    durationSec: number;
    crossfadeSec: number;
    graph: {
      nodes: Array<{
        id: string;
        kind: string;
        params: Record<string, number>;
        options: Record<string, string>;
        bypass: boolean;
      }>;
      connections: Array<{ from: string; to: string }>;
    };
    automation: Array<{
      target: string;
      enabled: boolean;
      points: Array<{ timeSec: number; value: number; curve: { kind: string; cx?: number; cy?: number } }>;
    }>;
  }>;
}

export function canonicalProtocol(protocol: Protocol): CanonicalProtocol {
  return {
    schemaVersion: protocol.schemaVersion,
    dspVersion: protocol.dspVersion,
    sampleRate: protocol.sampleRate,
    master: {
      gain: protocol.master.gain,
      limiter: protocol.master.limiter,
      limiterCeilingDb: protocol.master.limiterCeilingDb,
      fadeInSec: protocol.master.fadeInSec,
      fadeOutSec: protocol.master.fadeOutSec,
    },
    stages: protocol.stages.map((stage) => ({
      durationSec: stage.durationSec,
      crossfadeSec: stage.crossfadeSec,
      graph: {
        // Sorting removes editor ordering from the fingerprint: moving a module
        // on the canvas must not invalidate a shared protocol.
        nodes: [...stage.graph.nodes]
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
          .map((node) => ({
            id: node.id,
            kind: node.kind,
            params: sortRecord(node.params),
            options: sortRecord(node.options),
            bypass: node.bypass === true,
          })),
        connections: [...stage.graph.connections]
          .map((connection) => ({ from: connection.from, to: connection.to }))
          .sort((a, b) =>
            a.from === b.from ? (a.to < b.to ? -1 : 1) : a.from < b.from ? -1 : 1,
          ),
      },
      automation: [...stage.automation]
        .map((lane) => ({
          target: lane.target,
          enabled: lane.enabled,
          points: [...lane.points]
            .sort((a, b) => a.timeSec - b.timeSec)
            .map((point) => ({
              timeSec: point.timeSec,
              value: point.value,
              curve:
                point.curve.kind === 'bezier'
                  ? { kind: point.curve.kind, cx: point.curve.cx ?? 0.5, cy: point.curve.cy ?? 0.5 }
                  : { kind: point.curve.kind },
            })),
        }))
        .sort((a, b) => (a.target < b.target ? -1 : a.target > b.target ? 1 : 0)),
    })),
  };
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  const result: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) result[key] = record[key];
  return result;
}
