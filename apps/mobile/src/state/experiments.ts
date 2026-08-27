import { create } from 'zustand';
import {
  analyseExperiment,
  createExperiment,
  planNextSession,
  recordSession,
  reveal,
  type BlindSessionPlan,
  type CreateExperimentOptions,
  type Experiment,
  type ExperimentResults,
  type Session,
} from '@frequencylab/dsp-core';
import { loadExperiments, saveExperiments } from '../storage/repositories';

interface ExperimentState {
  experiments: Experiment[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  get: (id: string) => Experiment | undefined;
  create: (options: Omit<CreateExperimentOptions, 'salt' | 'createdAt'>) => Promise<Experiment>;
  nextSession: (id: string) => BlindSessionPlan | undefined;
  completeSession: (id: string, assignmentIndex: number, sessionId: string) => Promise<void>;
  unblind: (id: string) => Promise<void>;
  abandon: (id: string) => Promise<void>;
  results: (id: string, sessions: readonly Session[]) => ExperimentResults | undefined;
}

/**
 * Experiments.
 *
 * The salt is generated here, once, when the experiment is created, and never
 * changed. Everything downstream — the schedule, the commitments, the reveal —
 * derives from it deterministically inside the core.
 */
export const useExperiments = create<ExperimentState>((set, get) => ({
  experiments: [],
  hydrated: false,

  hydrate: async () => {
    const experiments = await loadExperiments();
    set({ experiments, hydrated: true });
  },

  get: (id) => get().experiments.find((experiment) => experiment.id === id),

  create: async (options) => {
    const experiment = createExperiment({
      ...options,
      salt: generateSalt(),
      createdAt: new Date().toISOString(),
    });
    const experiments = [experiment, ...get().experiments];
    set({ experiments });
    await saveExperiments(experiments);
    return experiment;
  },

  nextSession: (id) => {
    const experiment = get().get(id);
    return experiment ? planNextSession(experiment) : undefined;
  },

  completeSession: async (id, assignmentIndex, sessionId) => {
    const experiment = get().get(id);
    if (!experiment) return;
    const updated = recordSession(experiment, assignmentIndex, sessionId, new Date().toISOString());
    const experiments = get().experiments.map((candidate) =>
      candidate.id === id ? updated : candidate,
    );
    set({ experiments });
    await saveExperiments(experiments);
  },

  unblind: async (id) => {
    const experiment = get().get(id);
    if (!experiment) return;
    const updated = reveal(experiment, new Date().toISOString());
    const experiments = get().experiments.map((candidate) =>
      candidate.id === id ? updated : candidate,
    );
    set({ experiments });
    await saveExperiments(experiments);
  },

  abandon: async (id) => {
    const experiments = get().experiments.map((experiment) =>
      experiment.id === id ? { ...experiment, status: 'abandoned' as const } : experiment,
    );
    set({ experiments });
    await saveExperiments(experiments);
  },

  results: (id, sessions) => {
    const experiment = get().get(id);
    return experiment ? analyseExperiment(experiment, sessions) : undefined;
  },
}));

/**
 * Salt for the assignment commitments.
 *
 * `Math.random` is acceptable here and nowhere else in the product: this value
 * only needs to be unpredictable to a user idly inspecting their own storage,
 * not to an adversary. Everything the DSP touches uses the seeded PRNG so that
 * renders stay reproducible.
 */
function generateSalt(): string {
  const part = () => Math.floor(Math.random() * 0xffffffff).toString(36);
  return `${part()}${part()}${Date.now().toString(36)}`;
}
