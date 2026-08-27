import {
  AmNode,
  BinauralNode,
  FmNode,
  HarmonicNode,
  IsochronicNode,
  MonauralNode,
  NoiseNode,
  OscillatorNode,
} from './nodes/generators.js';
import {
  FilterNode,
  GainNode,
  MixerNode,
  OutputNode,
  PanNode,
  StereoMotionNode,
} from './nodes/processors.js';
import type { RuntimeNode } from './nodes/base.js';
import { defaultOptions, defaultParams } from './descriptors.js';
import type { GraphNode, NodeKind, RoutingGraph } from './types.js';
import { OUTPUT_NODE_ID } from './types.js';

export function createRuntimeNode(node: GraphNode): RuntimeNode {
  switch (node.kind) {
    case 'oscillator':
      return new OscillatorNode(node);
    case 'binaural':
      return new BinauralNode(node);
    case 'monaural':
      return new MonauralNode(node);
    case 'isochronic':
      return new IsochronicNode(node);
    case 'am':
      return new AmNode(node);
    case 'fm':
      return new FmNode(node);
    case 'harmonic':
      return new HarmonicNode(node);
    case 'noise':
      return new NoiseNode(node);
    case 'gain':
      return new GainNode(node);
    case 'filter':
      return new FilterNode(node);
    case 'pan':
      return new PanNode(node);
    case 'stereoMotion':
      return new StereoMotionNode(node);
    case 'mixer':
      return new MixerNode(node);
    case 'output':
      return new OutputNode(node);
    default: {
      const exhaustive: never = node.kind;
      throw new Error(`Unhandled node kind: ${String(exhaustive)}`);
    }
  }
}

/** Creates a stored graph node with every parameter and option populated. */
export function makeNode(
  id: string,
  kind: NodeKind,
  params: Record<string, number> = {},
  options: Record<string, string> = {},
  extra: Partial<Pick<GraphNode, 'label' | 'bypass' | 'position'>> = {},
): GraphNode {
  return {
    id,
    kind,
    params: defaultParams(kind, params),
    options: defaultOptions(kind, options),
    ...extra,
  };
}

/** An empty graph containing only the terminal output node. */
export function emptyGraph(): RoutingGraph {
  return {
    nodes: [makeNode(OUTPUT_NODE_ID, 'output', {}, {}, { position: { x: 640, y: 200 } })],
    connections: [],
  };
}

export function findNode(graph: RoutingGraph, id: string): GraphNode | undefined {
  return graph.nodes.find((node) => node.id === id);
}

/** Returns a new graph with one node's parameter replaced. Never mutates. */
export function withParam(
  graph: RoutingGraph,
  nodeId: string,
  key: string,
  value: number,
): RoutingGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === nodeId ? { ...node, params: { ...node.params, [key]: value } } : node,
    ),
  };
}

export function withOption(
  graph: RoutingGraph,
  nodeId: string,
  key: string,
  value: string,
): RoutingGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === nodeId ? { ...node, options: { ...node.options, [key]: value } } : node,
    ),
  };
}

export function withNode(graph: RoutingGraph, node: GraphNode): RoutingGraph {
  const exists = graph.nodes.some((existing) => existing.id === node.id);
  return {
    ...graph,
    nodes: exists ? graph.nodes.map((n) => (n.id === node.id ? node : n)) : [...graph.nodes, node],
  };
}

export function withoutNode(graph: RoutingGraph, nodeId: string): RoutingGraph {
  if (nodeId === OUTPUT_NODE_ID) return graph;
  return {
    nodes: graph.nodes.filter((node) => node.id !== nodeId),
    connections: graph.connections.filter(
      (connection) => connection.from !== nodeId && connection.to !== nodeId,
    ),
  };
}

export function withConnection(graph: RoutingGraph, from: string, to: string): RoutingGraph {
  const exists = graph.connections.some(
    (connection) => connection.from === from && connection.to === to,
  );
  if (exists) return graph;
  return { ...graph, connections: [...graph.connections, { from, to }] };
}

export function withoutConnection(graph: RoutingGraph, from: string, to: string): RoutingGraph {
  return {
    ...graph,
    connections: graph.connections.filter(
      (connection) => !(connection.from === from && connection.to === to),
    ),
  };
}
