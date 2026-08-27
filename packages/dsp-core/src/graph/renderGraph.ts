import { createRuntimeNode } from './factory.js';
import type { RuntimeNode, RenderContext } from './nodes/base.js';
import { reachableFromOutput, topologicalOrder, validateGraph } from './validate.js';
import { OUTPUT_NODE_ID, parseParamAddress, type RoutingGraph } from './types.js';

/**
 * A routing graph compiled into an executable render order.
 *
 * Compilation happens off the audio thread; `render` is allocation-free and
 * touches only preallocated buffers. Only nodes that can reach the output are
 * compiled, so an orphaned module in the editor costs nothing at playback.
 */
export class RenderGraph {
  private readonly nodes = new Map<string, RuntimeNode>();
  private readonly order: RuntimeNode[] = [];
  private readonly sources = new Map<string, RuntimeNode[]>();
  private readonly output: RuntimeNode;

  readonly sampleRate: number;
  readonly blockSize: number;

  constructor(graph: RoutingGraph, sampleRate: number, blockSize: number) {
    const validation = validateGraph(graph);
    if (!validation.ok) {
      const first = validation.issues.find((issue) => issue.severity === 'error');
      throw new Error(`Cannot compile routing graph: ${first?.message ?? 'unknown error'}`);
    }

    this.sampleRate = sampleRate;
    this.blockSize = blockSize;

    const reachable = reachableFromOutput(graph);
    const sortedIds = topologicalOrder(graph) ?? [];

    for (const node of graph.nodes) {
      if (!reachable.has(node.id)) continue;
      const runtime = createRuntimeNode(node);
      runtime.prepare(sampleRate, blockSize);
      this.nodes.set(node.id, runtime);
    }

    for (const id of sortedIds) {
      const runtime = this.nodes.get(id);
      if (runtime) this.order.push(runtime);
    }

    for (const connection of graph.connections) {
      const from = this.nodes.get(connection.from);
      const to = this.nodes.get(connection.to);
      if (!from || !to) continue;
      const list = this.sources.get(connection.to) ?? [];
      list.push(from);
      this.sources.set(connection.to, list);
    }

    const output = this.nodes.get(OUTPUT_NODE_ID);
    if (!output) throw new Error('Routing graph has no reachable output node.');
    this.output = output;
  }

  get outL(): Float32Array {
    return this.output.outL;
  }

  get outR(): Float32Array {
    return this.output.outR;
  }

  get nodeIds(): string[] {
    return [...this.nodes.keys()];
  }

  getNode(id: string): RuntimeNode | undefined {
    return this.nodes.get(id);
  }

  /** Moves a parameter target. Safe from the UI thread mid-render. */
  setParam(nodeId: string, key: string, value: number): void {
    this.nodes.get(nodeId)?.setParamTarget(key, value);
  }

  /** Applies an automation value addressed as `nodeId:paramKey`. */
  setParamByAddress(address: string, value: number): void {
    const parsed = parseParamAddress(address);
    if (!parsed) return;
    this.setParam(parsed.nodeId, parsed.paramKey, value);
  }

  setOption(nodeId: string, key: string, value: string): void {
    this.nodes.get(nodeId)?.setOption(key, value);
  }

  /** Reads a node's currently smoothed parameter value for telemetry. */
  readParam(nodeId: string, key: string): number | undefined {
    return this.nodes.get(nodeId)?.currentValue(key);
  }

  /** Re-aligns every oscillator phase. Only valid before the first block. */
  resetPhases(): void {
    for (const node of this.order) node.reset();
  }

  /** Renders one block. Result is left in `outL` / `outR`. */
  render(frames: number, ctx: RenderContext): void {
    for (let n = 0; n < this.order.length; n++) {
      const node = this.order[n];
      const inputs = this.sources.get(node.id);

      node.clearInput(frames);
      if (inputs && inputs.length > 0) {
        for (let s = 0; s < inputs.length; s++) {
          const source = inputs[s];
          const sl = source.outL;
          const sr = source.outR;
          const dl = node.inL;
          const dr = node.inR;
          for (let i = 0; i < frames; i++) {
            dl[i] += sl[i];
            dr[i] += sr[i];
          }
        }
        node.hasInput = true;
      }

      node.render(frames, ctx);
    }
  }
}
