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
  DEFAULT_MASTER,
  buildStandardGraph,
  createProtocol,
  makeSweepLane,
  renderProtocolOffline,
  type RoutingGraph,
} from '../src/index.js';
import { peak } from './helpers.js';

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

describe('parameter ranges', () => {
  it('clamps an automation lane to the parameter it drives', () => {
    // The descriptor is the contract, and it has to hold on every write rather
    // than only on the first. `prepare` clamped the initial value and nothing
    // clamped afterwards, so a lane — which writes every block — could hold an
    // oscillator's amplitude at 50 and render a peak above 20 with the limiter
    // off, leaving the one unbypassable safety stage to do a gain stage's job.
    const graph = buildStandardGraph({
      engine: 'binaural',
      carrierHz: 220,
      beatHz: 10,
      amplitude: 0.5,
    });
    const protocol = createProtocol({
      id: 'runaway',
      name: 'runaway',
      intent: 'explore',
      stages: [
        {
          id: 's',
          name: 's',
          durationSec: 2,
          crossfadeSec: 0,
          graph,
          automation: [makeSweepLane('lane', 'tone:amplitude', 50, 50, 2)],
        },
      ],
      master: { ...DEFAULT_MASTER, gain: 1, limiter: false, fadeInSec: 0, fadeOutSec: 0 },
    });

    const { left, right } = renderProtocolOffline(protocol, { sampleRate: 48000 });
    // Deliberately rendered with the limiter disabled: the clamp must hold on
    // its own, not because something downstream caught it.
    expect(peak(left), 'left').toBeLessThan(1.2);
    expect(peak(right), 'right').toBeLessThan(1.2);
  });

  it('ignores a non-finite parameter write rather than poisoning the signal', () => {
    const graph = buildStandardGraph({
      engine: 'binaural',
      carrierHz: 220,
      beatHz: 10,
      amplitude: 0.5,
    });
    const protocol = createProtocol({
      id: 'nan',
      name: 'nan',
      intent: 'explore',
      stages: [
        {
          id: 's',
          name: 's',
          durationSec: 1,
          crossfadeSec: 0,
          graph,
          automation: [makeSweepLane('lane', 'tone:amplitude', Number.NaN, Number.NaN, 1)],
        },
      ],
      master: { ...DEFAULT_MASTER, fadeInSec: 0, fadeOutSec: 0 },
    });

    const { left } = renderProtocolOffline(protocol, { sampleRate: 48000 });
    for (let i = 0; i < left.length; i++) {
      expect(Number.isFinite(left[i]), `sample ${i} is not finite`).toBe(true);
    }
  });
});

describe('phase continuity across a stage boundary', () => {
  const OUTPUT = 'output';
  const build = (kind: 'binaural' | 'oscillator'): RoutingGraph => {
    let graph = emptyGraph();
    graph = withNode(graph, makeNode('tone', kind));
    graph = withNode(graph, makeNode(OUTPUT, 'output'));
    return withConnection(graph, 'tone', OUTPUT);
  };

  const render = (graph: RenderGraph, frames: number): void => {
    graph.render(frames, { sampleRate: 48000, blockSize: frames, timeSec: 0 });
  };

  it('continues the incoming graph a quarter cycle behind the outgoing one', () => {
    const outgoing = new RenderGraph(build("binaural"), 48000, 4096);
    const incoming = new RenderGraph(build("binaural"), 48000, 4096);
    // Leave the outgoing graph somewhere arbitrary in its cycle.
    render(outgoing, 137);

    incoming.adoptPhasesFrom(outgoing);

    // Both graphs now render the same tone. A quarter cycle apart means the two
    // are in quadrature: uncorrelated, which is the assumption the equal-power
    // cross-fade is built on and the whole reason for the offset.
    render(outgoing, 4096);
    render(incoming, 4096);
    let product = 0;
    let outgoingPower = 0;
    let incomingPower = 0;
    for (let i = 0; i < 4096; i++) {
      product += outgoing.outL[i] * incoming.outL[i];
      outgoingPower += outgoing.outL[i] * outgoing.outL[i];
      incomingPower += incoming.outL[i] * incoming.outL[i];
    }
    const correlation = product / Math.sqrt(outgoingPower * incomingPower);
    expect(Math.abs(correlation)).toBeLessThan(0.02);
  });

  it('leaves a graph alone when the stage rewired its modules', () => {
    // Lab Mode can change a node's kind between stages. There is no phase to
    // carry over then, and the incoming graph must simply start from its own.
    const outgoing = new RenderGraph(build("binaural"), 48000, 4096);
    const incoming = new RenderGraph(build("oscillator"), 48000, 4096);
    render(outgoing, 137);

    const before = Float32Array.from(incoming.outL);
    incoming.adoptPhasesFrom(outgoing);
    render(incoming, 256);

    const fresh = new RenderGraph(build("oscillator"), 48000, 4096);
    render(fresh, 256);
    expect(before.every((value) => value === 0)).toBe(true);
    for (let i = 0; i < 256; i++) expect(incoming.outL[i]).toBeCloseTo(fresh.outL[i], 6);
  });
});
