import { create } from 'zustand';
import {
  DEFAULT_EXPLORER_RECIPE,
  protocolFromExplorer,
  type ExplorerRecipe,
  type Protocol,
} from '@frequencylab/dsp-core';
import { sessionController } from '../audio/sessionController';

interface ExplorerState {
  recipe: ExplorerRecipe;
  set: (patch: Partial<ExplorerRecipe>) => void;
  reset: () => void;
  /** Compiles the current controls into a real protocol. */
  toProtocol: (id?: string, name?: string) => Protocol;
}

/**
 * Explorer.
 *
 * The controls are a recipe, not a parallel audio path: `toProtocol` compiles
 * them into the same protocol object Lab Mode edits, and live parameter changes
 * are pushed straight at the running graph so the sound follows the knob
 * without rebuilding anything.
 */
export const useExplorer = create<ExplorerState>((set, get) => ({
  recipe: DEFAULT_EXPLORER_RECIPE,

  set: (patch) => {
    const recipe = { ...get().recipe, ...patch };
    set({ recipe });
    pushLiveChanges(patch, recipe);
  },

  reset: () => set({ recipe: DEFAULT_EXPLORER_RECIPE }),

  toProtocol: (id = 'explorer-session', name) =>
    protocolFromExplorer(get().recipe, { id, name }),
}));

/**
 * Applies a control change to the running graph.
 *
 * Only parameters that exist on the live nodes are pushed. Anything structural
 * — swapping the engine, adding a noise bed that was not there — needs a
 * rebuild, which the Explorer screen handles by reloading the protocol.
 */
function pushLiveChanges(patch: Partial<ExplorerRecipe>, recipe: ExplorerRecipe): void {
  if (sessionController.playbackState !== 'playing') return;
  const beatParam = recipe.engine === 'isochronic' ? 'pulse' : 'beat';

  if (patch.beatHz !== undefined) sessionController.setParam('tone', beatParam, patch.beatHz);
  if (patch.carrierHz !== undefined) sessionController.setParam('tone', 'carrier', patch.carrierHz);
  if (patch.intensity !== undefined) {
    sessionController.setParam('tone', 'amplitude', 0.2 + patch.intensity * 0.3);
  }
  if (patch.noiseLevel !== undefined) sessionController.setParam('noise', 'level', patch.noiseLevel);
  if (patch.noiseColor !== undefined) sessionController.setOption('noise', 'color', patch.noiseColor);
  if (patch.motionRateHz !== undefined) sessionController.setParam('motion', 'rate', patch.motionRateHz);
  if (patch.motionDepth !== undefined) sessionController.setParam('motion', 'depth', patch.motionDepth);
  if (patch.binauralMode !== undefined) {
    sessionController.setOption('tone', 'mode', patch.binauralMode);
  }
}

/** True when a change needs the protocol rebuilt rather than a live parameter write. */
export function requiresRebuild(patch: Partial<ExplorerRecipe>, current: ExplorerRecipe): boolean {
  if (patch.engine !== undefined && patch.engine !== current.engine) return true;
  if (patch.durationSec !== undefined) return true;
  // A module that is absent from the graph cannot be turned up in place.
  if (patch.noiseLevel !== undefined && current.noiseLevel === 0 && patch.noiseLevel > 0) return true;
  if (patch.motionDepth !== undefined && current.motionDepth === 0 && patch.motionDepth > 0) return true;
  return false;
}
