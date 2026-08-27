import { describe, expect, it } from 'vitest';
import {
  NODE_DESCRIPTORS,
  NODE_KINDS,
  RenderGraph,
  defaultOptions,
  defaultParams,
  emptyGraph,
  makeNode,
  topologicalOrder,
  validateGraph,
  withConnection,
  withNode,
  withoutNode,
  wouldCreateCycle,
  type RoutingGraph,
} from '../src/index.js';

function chain(): RoutingGraph {
  let graph = emptyGraph();
  graph = withNode(graph, makeNode('osc', 'oscillator', { frequency: 220, amplitude: 0.4 }));
  graph = withNode(graph, makeNode('gain', 'gain', { gain: 0.8 }));
  graph = withConnection(graph, 'osc', 'gain');
  graph = withConnection(graph, 'gain', 'output');
  return graph;
}

describe('node descriptors', () => {
  it('defines a complete, in-range default for every parameter', () => {
    for (const kind of NODE_KINDS) {
      const descriptor = NODE_DESCRIPTORS[kind];
      const params = defaultParams(kind);
      for (const param of descriptor.params) {
        expect(params[param.key], `${kind}.${param.key}`).toBeDefined();
        expect(param.default).toBeGreaterThanOrEqual(param.min);
        expect(param.default).toBeLessThanOrEqual(param.max);
        expect(param.min).toBeLessThan(param.max);
      }
      const options = defaultOptions(kind);
      for (const option of descriptor.options) {
        expect(option.values).toContain(options[option.key]);
      }
    }
  });

  it('gives every node a distinct short label for the signal-flow view', () => {
    const labels = NODE_KINDS.map((kind) => NODE_DESCRIPTORS[kind].shortLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('compiles and renders every generator without error', () => {
    for (const kind of NODE_KINDS) {
      if (NODE_DESCRIPTORS[kind].category !== 'generator') continue;
      const graph: RoutingGraph = {
        nodes: [makeNode('src', kind), makeNode('output', 'output')],
        connections: [{ from: 'src', to: 'output' }],
      };
      const compiled = new RenderGraph(graph, 48000, 128);
      compiled.render(128, { sampleRate: 48000, blockSize: 128, timeSec: 0 });
      let finite = true;
      for (let i = 0; i < 128; i++) {
        if (!Number.isFinite(compiled.outL[i]) || !Number.isFinite(compiled.outR[i])) finite = false;
      }
      expect(finite, `${kind} produced a non-finite sample`).toBe(true);
    }
  });
});

describe('graph validation', () => {
  it('accepts a well-formed chain', () => {
    const result = validateGraph(chain());
    expect(result.ok).toBe(true);
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('rejects a feedback loop', () => {
    let graph = chain();
    graph = withConnection(graph, 'gain', 'osc');
    const result = validateGraph(graph);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'cycle')).toBe(true);
  });

  it('rejects feeding a generator', () => {
    let graph = chain();
    graph = withNode(graph, makeNode('osc2', 'oscillator'));
    graph = withConnection(graph, 'osc2', 'osc');
    const result = validateGraph(graph);
    expect(result.issues.some((issue) => issue.code === 'too-many-inputs')).toBe(true);
  });

  it('rejects a parameter outside its declared range', () => {
    const graph = chain();
    const broken: RoutingGraph = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === 'osc' ? { ...node, params: { ...node.params, frequency: 40000 } } : node,
      ),
    };
    const result = validateGraph(broken);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'param-out-of-range')).toBe(true);
  });

  it('rejects an unknown option value', () => {
    const graph = chain();
    const broken: RoutingGraph = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === 'osc' ? { ...node, options: { waveform: 'chainsaw' } } : node,
      ),
    };
    expect(validateGraph(broken).ok).toBe(false);
  });

  it('warns rather than blocks on a hard isochronic gate', () => {
    const graph: RoutingGraph = {
      nodes: [
        makeNode('iso', 'isochronic', { attack: 0, release: 0 }, { envelope: 'square' }),
        makeNode('output', 'output'),
      ],
      connections: [{ from: 'iso', to: 'output' }],
    };
    const result = validateGraph(graph);
    expect(result.ok).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'isochronic-hard-edges')).toBe(true);
  });

  it('warns when nothing reaches the output', () => {
    let graph = emptyGraph();
    graph = withNode(graph, makeNode('osc', 'oscillator'));
    const result = validateGraph(graph);
    expect(result.issues.some((issue) => issue.code === 'silent-graph')).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'unreachable-node')).toBe(true);
  });

  it('predicts a cycle before the connection is made', () => {
    const graph = chain();
    expect(wouldCreateCycle(graph, 'gain', 'osc')).toBe(true);
    expect(wouldCreateCycle(graph, 'osc', 'osc')).toBe(true);
    expect(wouldCreateCycle(graph, 'osc', 'output')).toBe(false);
  });

  it('never removes the output node', () => {
    const graph = withoutNode(chain(), 'output');
    expect(graph.nodes.some((node) => node.id === 'output')).toBe(true);
  });
});

describe('render order', () => {
  it('orders sources before their destinations', () => {
    const order = topologicalOrder(chain());
    expect(order).not.toBeNull();
    expect(order!.indexOf('osc')).toBeLessThan(order!.indexOf('gain'));
    expect(order!.indexOf('gain')).toBeLessThan(order!.indexOf('output'));
  });

  it('is deterministic for the same graph', () => {
    const graph = chain();
    expect(topologicalOrder(graph)).toEqual(topologicalOrder({ ...graph, nodes: [...graph.nodes].reverse() }));
  });

  it('sums several sources into one destination', () => {
    let graph = emptyGraph();
    graph = withNode(graph, makeNode('a', 'oscillator', { frequency: 200, amplitude: 0.3, pan: 0 }));
    graph = withNode(graph, makeNode('b', 'oscillator', { frequency: 300, amplitude: 0.3, pan: 0 }));
    graph = withNode(graph, makeNode('mix', 'mixer', { gain: 1 }));
    graph = withConnection(graph, 'a', 'mix');
    graph = withConnection(graph, 'b', 'mix');
    graph = withConnection(graph, 'mix', 'output');

    const compiled = new RenderGraph(graph, 48000, 256);
    const context = { sampleRate: 48000, blockSize: 256, timeSec: 0 };
    for (let i = 0; i < 40; i++) compiled.render(256, context);
    let energy = 0;
    for (let i = 0; i < 256; i++) energy += compiled.outL[i] * compiled.outL[i];
    expect(Math.sqrt(energy / 256)).toBeGreaterThan(0.2);
  });

  it('does not compile nodes that cannot reach the output', () => {
    let graph = chain();
    graph = withNode(graph, makeNode('orphan', 'noise'));
    const compiled = new RenderGraph(graph, 48000, 128);
    expect(compiled.nodeIds).not.toContain('orphan');
  });
});
