import { curveValue, type CurveSpec } from '../math/curves.js';
import { clamp } from '../math/util.js';
import { getParamDescriptor } from '../graph/descriptors.js';
import { parseParamAddress, type RoutingGraph } from '../graph/types.js';
import type { AutomationLane, AutomationPoint } from './schema.js';

/**
 * Evaluates an automation lane at a point in stage time.
 *
 * Points are held before the first and after the last, so a lane never
 * introduces a jump at its edges. Each point owns the curve of the segment
 * that *starts* at it, which is what makes a two-point lane a frequency sweep
 * (§7) and an n-point lane a DAW-style automation curve (§8) with no separate
 * machinery for either.
 */
export function evaluateLane(lane: AutomationLane, timeSec: number): number | undefined {
  const points = lane.points;
  if (!lane.enabled || points.length === 0) return undefined;
  if (points.length === 1) return points[0].value;
  if (timeSec <= points[0].timeSec) return points[0].value;
  const last = points[points.length - 1];
  if (timeSec >= last.timeSec) return last.value;

  // Linear scan: lanes hold a handful of points and this runs once per block.
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (timeSec >= a.timeSec && timeSec <= b.timeSec) {
      const span = b.timeSec - a.timeSec;
      const t = span <= 0 ? 1 : (timeSec - a.timeSec) / span;
      return curveValue(a.value, b.value, t, a.curve);
    }
  }
  return last.value;
}

/** Every lane's value at `timeSec`, keyed by param address. */
export function evaluateAutomation(
  lanes: readonly AutomationLane[],
  timeSec: number,
  out: Map<string, number>,
): Map<string, number> {
  out.clear();
  for (const lane of lanes) {
    const value = evaluateLane(lane, timeSec);
    if (value !== undefined) out.set(lane.target, value);
  }
  return out;
}

export function makePoint(
  timeSec: number,
  value: number,
  curve: CurveSpec = { kind: 'smooth' },
): AutomationPoint {
  return { timeSec, value, curve };
}

/** Builds a two-point sweep lane — the common case behind "10 Hz → 6 Hz". */
export function makeSweepLane(
  id: string,
  target: string,
  from: number,
  to: number,
  durationSec: number,
  curve: CurveSpec = { kind: 'smooth' },
  label?: string,
): AutomationLane {
  return {
    id,
    target,
    enabled: true,
    label,
    points: [makePoint(0, from, curve), makePoint(durationSec, to, { kind: 'linear' })],
  };
}

/** Builds a flat lane, which pins a parameter for the whole stage. */
export function makeHoldLane(id: string, target: string, value: number, label?: string): AutomationLane {
  return { id, target, enabled: true, label, points: [makePoint(0, value)], };
}

/** Sorts points by time and clamps values to the target parameter's range. */
export function normaliseLane(lane: AutomationLane, graph: RoutingGraph): AutomationLane {
  const parsed = parseParamAddress(lane.target);
  const node = parsed ? graph.nodes.find((candidate) => candidate.id === parsed.nodeId) : undefined;
  const descriptor = node && parsed ? getParamDescriptor(node.kind, parsed.paramKey) : undefined;

  const points = [...lane.points]
    .filter((point) => Number.isFinite(point.timeSec) && Number.isFinite(point.value))
    .sort((a, b) => a.timeSec - b.timeSec)
    .map((point) => ({
      ...point,
      timeSec: Math.max(0, point.timeSec),
      value: descriptor ? clamp(point.value, descriptor.min, descriptor.max) : point.value,
    }));

  return { ...lane, points };
}

/** Value range spanned by a lane, used to scale the timeline's lane view. */
export function laneRange(lane: AutomationLane, graph: RoutingGraph): { min: number; max: number } {
  const parsed = parseParamAddress(lane.target);
  const node = parsed ? graph.nodes.find((candidate) => candidate.id === parsed.nodeId) : undefined;
  const descriptor = node && parsed ? getParamDescriptor(node.kind, parsed.paramKey) : undefined;
  if (descriptor) return { min: descriptor.min, max: descriptor.max };
  if (lane.points.length === 0) return { min: 0, max: 1 };
  let min = Infinity;
  let max = -Infinity;
  for (const point of lane.points) {
    if (point.value < min) min = point.value;
    if (point.value > max) max = point.value;
  }
  if (min === max) {
    min -= 1;
    max += 1;
  }
  return { min, max };
}
