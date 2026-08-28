import { create } from 'zustand';
import {
  createProtocol,
  emptyGraph,
  makeNode,
  protocolDna,
  renameProtocol,
  validateProtocol,
  withConnection,
  withNode,
  withOption,
  withParam,
  withoutConnection,
  withoutNode,
  type AutomationLane,
  type GraphNode,
  type NodeKind,
  type Protocol,
  type ProtocolIssue,
  type ProtocolStage,
  type RoutingGraph,
} from '@frequencylab/dsp-core';
import { sessionController } from '../audio/sessionController';

interface LabState {
  /** The protocol currently open in the workspace. */
  draft: Protocol | null;
  stageIndex: number;
  /** Node currently selected in the rack or the signal-flow view. */
  selectedNodeId: string | null;
  dirty: boolean;

  open: (protocol: Protocol) => void;
  createBlank: () => Protocol;
  close: () => void;
  selectStage: (index: number) => void;
  selectNode: (nodeId: string | null) => void;

  setParam: (nodeId: string, key: string, value: number) => void;
  setOption: (nodeId: string, key: string, value: string) => void;
  addNode: (kind: NodeKind) => string | undefined;
  removeNode: (nodeId: string) => void;
  connect: (from: string, to: string) => void;
  disconnect: (from: string, to: string) => void;
  toggleBypass: (nodeId: string) => void;

  addStage: (template?: ProtocolStage) => void;
  removeStage: (index: number) => void;
  moveStage: (from: number, to: number) => void;
  duplicateStage: (index: number) => void;
  updateStage: (index: number, patch: Partial<ProtocolStage>) => void;

  setLanes: (lanes: AutomationLane[]) => void;
  upsertLane: (lane: AutomationLane) => void;
  removeLane: (laneId: string) => void;

  setMaster: (patch: Partial<Protocol['master']>) => void;
  /**
   * Renames the open draft. Pass an empty description to clear one, or omit it
   * to leave it alone. The change lands in the library when the draft is saved.
   */
  rename: (name: string, description?: string) => void;

  currentStage: () => ProtocolStage | undefined;
  currentGraph: () => RoutingGraph | undefined;
  issues: () => ProtocolIssue[];
  dna: () => ReturnType<typeof protocolDna> | undefined;
}

/**
 * The Lab workspace.
 *
 * Edits are immutable transformations of the draft protocol, and every
 * parameter write is *also* pushed at the running graph when something is
 * auditioning — so the module rack behaves like hardware: turning a control
 * changes the sound now, and the protocol records what you did.
 */
export const useLab = create<LabState>((set, get) => ({
  draft: null,
  stageIndex: 0,
  selectedNodeId: null,
  dirty: false,

  open: (protocol) => set({ draft: protocol, stageIndex: 0, selectedNodeId: null, dirty: false }),

  createBlank: () => {
    let graph = emptyGraph();
    graph = withNode(
      graph,
      makeNode('tone', 'binaural', { carrier: 220, beat: 10, amplitude: 0.35 }, {}, {
        position: { x: 80, y: 80 },
      }),
    );
    graph = withNode(graph, makeNode('mix', 'mixer', {}, {}, { position: { x: 400, y: 140 } }));
    graph = withConnection(graph, 'tone', 'mix');
    graph = withConnection(graph, 'mix', 'output');

    const stage: ProtocolStage = {
      id: 'stage-1',
      name: 'Stage 1',
      durationSec: 20 * 60,
      crossfadeSec: 0,
      graph,
      automation: [],
    };
    const protocol = createProtocol({
      id: `protocol-${Date.now().toString(36)}`,
      name: 'New Protocol',
      stages: [stage],
    });
    set({ draft: protocol, stageIndex: 0, selectedNodeId: 'tone', dirty: true });
    return protocol;
  },

  close: () => set({ draft: null, stageIndex: 0, selectedNodeId: null, dirty: false }),

  selectStage: (index) => set({ stageIndex: index, selectedNodeId: null }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  setParam: (nodeId, key, value) => {
    mutateGraph(set, get, (graph) => withParam(graph, nodeId, key, value));
    // Live edit: if this stage is the one auditioning, the change is audible
    // immediately and smoothed by the engine rather than stepped.
    sessionController.setParam(nodeId, key, value);
  },

  setOption: (nodeId, key, value) => {
    mutateGraph(set, get, (graph) => withOption(graph, nodeId, key, value));
    sessionController.setOption(nodeId, key, value);
  },

  addNode: (kind) => {
    const stage = get().currentStage();
    if (!stage) return undefined;
    const id = `${kind}-${Math.random().toString(36).slice(2, 6)}`;
    const count = stage.graph.nodes.length;
    mutateGraph(set, get, (graph) =>
      withNode(
        graph,
        makeNode(id, kind, {}, {}, { position: { x: 80 + (count % 3) * 180, y: 80 + count * 40 } }),
      ),
    );
    set({ selectedNodeId: id });
    return id;
  },

  removeNode: (nodeId) => {
    mutateGraph(set, get, (graph) => withoutNode(graph, nodeId));
    if (get().selectedNodeId === nodeId) set({ selectedNodeId: null });
  },

  connect: (from, to) => mutateGraph(set, get, (graph) => withConnection(graph, from, to)),
  disconnect: (from, to) => mutateGraph(set, get, (graph) => withoutConnection(graph, from, to)),

  toggleBypass: (nodeId) =>
    mutateGraph(set, get, (graph) => ({
      ...graph,
      nodes: graph.nodes.map((node: GraphNode) =>
        node.id === nodeId ? { ...node, bypass: !node.bypass } : node,
      ),
    })),

  addStage: (template) => {
    const draft = get().draft;
    if (!draft) return;
    const source = template ?? draft.stages[get().stageIndex];
    const stage: ProtocolStage = {
      ...source,
      id: `stage-${Date.now().toString(36)}`,
      name: `${source.name} copy`,
      crossfadeSec: source.crossfadeSec || 3,
      // Automation lane ids must stay unique across the protocol.
      automation: source.automation.map((lane, index) => ({
        ...lane,
        id: `${lane.id}-${index}-${Date.now().toString(36)}`,
      })),
    };
    set({
      draft: { ...draft, stages: [...draft.stages, stage] },
      stageIndex: draft.stages.length,
      dirty: true,
    });
  },

  removeStage: (index) => {
    const draft = get().draft;
    if (!draft || draft.stages.length <= 1) return;
    const stages = draft.stages.filter((_, i) => i !== index);
    set({
      draft: { ...draft, stages },
      stageIndex: Math.max(0, Math.min(stages.length - 1, index)),
      dirty: true,
    });
  },

  moveStage: (from, to) => {
    const draft = get().draft;
    if (!draft) return;
    const stages = [...draft.stages];
    const [moved] = stages.splice(from, 1);
    stages.splice(Math.max(0, Math.min(stages.length, to)), 0, moved);
    set({ draft: { ...draft, stages }, stageIndex: to, dirty: true });
  },

  duplicateStage: (index) => {
    const draft = get().draft;
    if (!draft) return;
    get().addStage(draft.stages[index]);
  },

  updateStage: (index, patch) => {
    const draft = get().draft;
    if (!draft) return;
    const stages = draft.stages.map((stage, i) => (i === index ? { ...stage, ...patch } : stage));
    set({ draft: { ...draft, stages }, dirty: true });
  },

  setLanes: (lanes) => get().updateStage(get().stageIndex, { automation: lanes }),

  upsertLane: (lane) => {
    const stage = get().currentStage();
    if (!stage) return;
    const exists = stage.automation.some((candidate) => candidate.id === lane.id);
    const automation = exists
      ? stage.automation.map((candidate) => (candidate.id === lane.id ? lane : candidate))
      : [...stage.automation, lane];
    get().updateStage(get().stageIndex, { automation });
  },

  removeLane: (laneId) => {
    const stage = get().currentStage();
    if (!stage) return;
    get().updateStage(get().stageIndex, {
      automation: stage.automation.filter((lane) => lane.id !== laneId),
    });
  },

  setMaster: (patch) => {
    const draft = get().draft;
    if (!draft) return;
    set({ draft: { ...draft, master: { ...draft.master, ...patch } }, dirty: true });
  },

  rename: (name, description) => {
    const draft = get().draft;
    if (!draft) return;
    // `renameProtocol` does the trimming and refuses an empty name, so the
    // workspace cannot end up holding a draft with a blank title.
    set({ draft: renameProtocol(draft, name, description), dirty: true });
  },

  currentStage: () => get().draft?.stages[get().stageIndex],
  currentGraph: () => get().currentStage()?.graph,
  issues: () => {
    const draft = get().draft;
    return draft ? validateProtocol(draft).issues : [];
  },
  dna: () => {
    const draft = get().draft;
    return draft ? protocolDna(draft) : undefined;
  },
}));

function mutateGraph(
  set: (partial: Partial<LabState>) => void,
  get: () => LabState,
  transform: (graph: RoutingGraph) => RoutingGraph,
): void {
  const draft = get().draft;
  const index = get().stageIndex;
  if (!draft) return;
  const stages = draft.stages.map((stage, i) =>
    i === index ? { ...stage, graph: transform(stage.graph) } : stage,
  );
  set({ draft: { ...draft, stages }, dirty: true });
}
