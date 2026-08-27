import { MAX_CARRIER_HZ, MIN_CARRIER_HZ } from '../math/constants.js';
import { getDescriptor } from './descriptors.js';
import { OUTPUT_NODE_ID, type RoutingGraph } from './types.js';

export type IssueSeverity = 'error' | 'warning';

export interface GraphIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  nodeId?: string;
  paramKey?: string;
}

export interface GraphValidation {
  ok: boolean;
  issues: GraphIssue[];
  /** Node ids in render order. Empty when the graph has a cycle. */
  order: string[];
}

/**
 * Structural and safety validation of a routing graph (§9).
 *
 * `error` blocks playback. `warning` is surfaced in the UI but still plays —
 * the product's stance is that an informed user may deliberately choose a harsh
 * configuration, but must never arrive at one by accident.
 */
export function validateGraph(graph: RoutingGraph): GraphValidation {
  const issues: GraphIssue[] = [];
  const ids = new Set<string>();

  for (const node of graph.nodes) {
    if (ids.has(node.id)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-node-id',
        message: `Two nodes share the id "${node.id}".`,
        nodeId: node.id,
      });
    }
    ids.add(node.id);
  }

  const outputs = graph.nodes.filter((node) => node.kind === 'output');
  if (outputs.length === 0) {
    issues.push({
      severity: 'error',
      code: 'missing-output',
      message: 'The graph has no output node.',
    });
  } else if (outputs.length > 1) {
    issues.push({
      severity: 'error',
      code: 'multiple-outputs',
      message: 'Only one output node is allowed.',
    });
  }

  const incoming = new Map<string, number>();
  for (const connection of graph.connections) {
    if (!ids.has(connection.from)) {
      issues.push({
        severity: 'error',
        code: 'dangling-source',
        message: `Connection from unknown node "${connection.from}".`,
      });
      continue;
    }
    if (!ids.has(connection.to)) {
      issues.push({
        severity: 'error',
        code: 'dangling-target',
        message: `Connection to unknown node "${connection.to}".`,
      });
      continue;
    }
    if (connection.from === connection.to) {
      issues.push({
        severity: 'error',
        code: 'self-connection',
        message: `Node "${connection.from}" cannot feed itself.`,
        nodeId: connection.from,
      });
    }
    incoming.set(connection.to, (incoming.get(connection.to) ?? 0) + 1);
  }

  for (const node of graph.nodes) {
    const descriptor = getDescriptor(node.kind);
    const count = incoming.get(node.id) ?? 0;
    if (count > descriptor.maxInputs) {
      issues.push({
        severity: 'error',
        code: 'too-many-inputs',
        message:
          descriptor.maxInputs === 0
            ? `${descriptor.label} is a generator and accepts no input.`
            : `${descriptor.label} accepts at most ${descriptor.maxInputs} inputs.`,
        nodeId: node.id,
      });
    }

    for (const param of descriptor.params) {
      const value = node.params[param.key];
      if (value === undefined) {
        issues.push({
          severity: 'error',
          code: 'missing-param',
          message: `${descriptor.label} is missing "${param.label}".`,
          nodeId: node.id,
          paramKey: param.key,
        });
      } else if (!Number.isFinite(value)) {
        issues.push({
          severity: 'error',
          code: 'non-finite-param',
          message: `${descriptor.label} · ${param.label} is not a finite number.`,
          nodeId: node.id,
          paramKey: param.key,
        });
      } else if (value < param.min || value > param.max) {
        issues.push({
          severity: 'error',
          code: 'param-out-of-range',
          message: `${descriptor.label} · ${param.label} must be between ${param.min} and ${param.max}.`,
          nodeId: node.id,
          paramKey: param.key,
        });
      }
    }

    for (const option of descriptor.options) {
      const value = node.options[option.key];
      if (value === undefined) {
        issues.push({
          severity: 'error',
          code: 'missing-option',
          message: `${descriptor.label} is missing "${option.label}".`,
          nodeId: node.id,
        });
      } else if (!option.values.includes(value)) {
        issues.push({
          severity: 'error',
          code: 'invalid-option',
          message: `${descriptor.label} · ${option.label} does not accept "${value}".`,
          nodeId: node.id,
        });
      }
    }
  }

  const order = topologicalOrder(graph);
  if (order === null) {
    issues.push({
      severity: 'error',
      code: 'cycle',
      message: 'The signal path contains a feedback loop. Remove a connection to continue.',
    });
  }

  issues.push(...safetyIssues(graph));

  const reachable = order ? reachableFromOutput(graph) : new Set<string>();
  if (order) {
    const generators = graph.nodes.filter((node) => getDescriptor(node.kind).category === 'generator');
    const audible = generators.filter((node) => reachable.has(node.id));
    if (audible.length === 0) {
      issues.push({
        severity: 'warning',
        code: 'silent-graph',
        message: 'Nothing reaches the output — this configuration will be silent.',
      });
    }
    for (const node of graph.nodes) {
      if (node.kind !== 'output' && !reachable.has(node.id)) {
        issues.push({
          severity: 'warning',
          code: 'unreachable-node',
          message: `${getDescriptor(node.kind).label} is not connected to the output.`,
          nodeId: node.id,
        });
      }
    }
  }

  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    issues,
    order: order ?? [],
  };
}

/** Loudness and comfort checks. These never block playback on their own. */
function safetyIssues(graph: RoutingGraph): GraphIssue[] {
  const issues: GraphIssue[] = [];
  let generatorAmplitudeSum = 0;

  for (const node of graph.nodes) {
    const descriptor = getDescriptor(node.kind);
    if (descriptor.category === 'generator') {
      generatorAmplitudeSum += node.params.amplitude ?? node.params.level ?? 0;
    }

    const carrier = node.params.carrier ?? node.params.frequency ?? node.params.fundamental;
    if (carrier !== undefined && Number.isFinite(carrier)) {
      if (carrier < MIN_CARRIER_HZ) {
        issues.push({
          severity: 'warning',
          code: 'carrier-below-audible',
          message: `${descriptor.label} carrier is below ${MIN_CARRIER_HZ} Hz. Most headphones reproduce very little here.`,
          nodeId: node.id,
        });
      } else if (carrier > MAX_CARRIER_HZ) {
        issues.push({
          severity: 'warning',
          code: 'carrier-high',
          message: `${descriptor.label} carrier above ${MAX_CARRIER_HZ} Hz is fatiguing over a long session.`,
          nodeId: node.id,
        });
      }
    }

    if (node.kind === 'binaural') {
      const beat = node.params.beat ?? 0;
      if (carrier !== undefined && beat > carrier * 0.25) {
        issues.push({
          severity: 'warning',
          code: 'beat-too-wide',
          message:
            'The beat is a large fraction of the carrier, so the two tones read as separate pitches rather than one beating tone.',
          nodeId: node.id,
        });
      }
      if ((node.params.separation ?? 1) < 0.2) {
        issues.push({
          severity: 'warning',
          code: 'binaural-separation-low',
          message: 'At this separation the binaural effect has collapsed into an acoustic beat.',
          nodeId: node.id,
        });
      }
    }

    if (node.kind === 'isochronic') {
      const shape = node.options.envelope;
      const attack = node.params.attack ?? 0;
      const release = node.params.release ?? 0;
      if (shape === 'square' || (attack < 0.02 && release < 0.02)) {
        issues.push({
          severity: 'warning',
          code: 'isochronic-hard-edges',
          message:
            'Hard pulse edges produce broadband clicks. Increase attack and release, or choose the softened square envelope.',
          nodeId: node.id,
        });
      }
    }

    if (node.kind === 'am' && (node.params.depth ?? 0) > 0.95 && node.options.envelope === 'square') {
      issues.push({
        severity: 'warning',
        code: 'am-hard-gate',
        message: 'Full-depth square modulation gates the signal abruptly and will click.',
        nodeId: node.id,
      });
    }

    if (node.kind === 'stereoMotion' && (node.params.rate ?? 0) > 4) {
      issues.push({
        severity: 'warning',
        code: 'stereo-motion-fast',
        message: 'Stereo movement above 4 Hz is disorienting rather than calming.',
        nodeId: node.id,
      });
    }
  }

  if (generatorAmplitudeSum > 1.4) {
    issues.push({
      severity: 'warning',
      code: 'high-summed-amplitude',
      message:
        'The generators sum well above unity. The master limiter will hold the ceiling, but the mix will lose dynamics — lower the module amplitudes instead.',
    });
  }

  return issues;
}

/** Kahn topological sort. Returns null when the graph contains a cycle. */
export function topologicalOrder(graph: RoutingGraph): string[] | null {
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    indegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }
  for (const connection of graph.connections) {
    if (!indegree.has(connection.from) || !indegree.has(connection.to)) continue;
    if (connection.from === connection.to) return null;
    adjacency.get(connection.from)!.push(connection.to);
    indegree.set(connection.to, (indegree.get(connection.to) ?? 0) + 1);
  }

  // Sorted seed keeps the render order deterministic for identical graphs,
  // which the reproducibility tests depend on.
  const queue = graph.nodes
    .map((node) => node.id)
    .filter((id) => (indegree.get(id) ?? 0) === 0)
    .sort();
  const order: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) {
        queue.push(next);
        queue.sort();
      }
    }
  }

  return order.length === graph.nodes.length ? order : null;
}

/** Every node that has a path to the output node. */
export function reachableFromOutput(graph: RoutingGraph): Set<string> {
  const reverse = new Map<string, string[]>();
  for (const connection of graph.connections) {
    const list = reverse.get(connection.to) ?? [];
    list.push(connection.from);
    reverse.set(connection.to, list);
  }
  const reachable = new Set<string>();
  const stack = [OUTPUT_NODE_ID];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const source of reverse.get(id) ?? []) stack.push(source);
  }
  return reachable;
}

/** True when adding `from → to` would create a cycle. */
export function wouldCreateCycle(graph: RoutingGraph, from: string, to: string): boolean {
  if (from === to) return true;
  const candidate: RoutingGraph = {
    nodes: graph.nodes,
    connections: [...graph.connections, { from, to }],
  };
  return topologicalOrder(candidate) === null;
}
