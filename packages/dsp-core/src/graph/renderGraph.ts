import { createRuntimeNode } from './factory.js';
import { MAX_NODE_PHASES, type RuntimeNode, type RenderContext } from './nodes/base.js';
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
  /** Reused by `adoptPhasesFrom`, so a stage boundary allocates nothing. */
  private readonly phaseScratch = new Float64Array(MAX_NODE_PHASES);

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

  /**
   * Continues this graph's oscillators from where `previous` left off, a quarter
   * cycle behind.
   *
   * Called once, at the first block of a cross-fading stage, before either graph
   * renders. Only nodes that match by id *and* kind adopt anything, so a Lab
   * Mode graph that rewires its modules between stages simply has nothing to
   * match and starts from its own phase as before.
   *
   * The quarter turn is the point of the exercise. An equal-power cross-fade is
   * the correct law for two *uncorrelated* signals, and two copies of the same
   * tone a quarter cycle apart are exactly that: their correlation is zero, so
   * sin/cos becomes right by construction rather than by luck. Aligning them
   * flush instead would make them correlated, which sums their amplitudes and
   * costs +3 dB in the middle of every fade; leaving them where they fell — the
   * behaviour this replaces — put them at an offset nobody chose, which on the
   * shipped Meditation preset happened to be near anti-phase and dropped the
   * session to -19.4 dB mid-fade.
   *
   * Quadrature is also the safest place to start when the two stages are
   * *detuned* and the offset will not stay put: it is the furthest a phase
   * relationship can be from both the +3 dB sum and the null it drifts towards.
   */
  adoptPhasesFrom(previous: RenderGraph): void {
    for (const [id, node] of this.nodes) {
      const source = previous.getNode(id);
      if (!source || source.kind !== node.kind) continue;
      const count = source.capturePhases(this.phaseScratch);
      if (count === 0) continue;
      for (let i = 0; i < count; i++) {
        // wrapUnit is in the phasor; a value of 1.25 is re-wrapped on adoption.
        this.phaseScratch[i] += 0.25;
      }
      node.adoptPhases(this.phaseScratch, count);
    }
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
