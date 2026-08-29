import { create } from 'zustand';
import {
  convertBinauralToMonaural,
  hasBlocker,
  preflight,
  usesBinaural,
  type OutputRoute,
  type Protocol,
  type SafetyCheck,
} from '@frequencylab/dsp-core';
import { detectOutputRoute } from '../audio/route';
import type { SoundBathFullness } from '../audio/organic/program';
import { usePlayer } from './player';
import { usePreferences } from './preferences';
import { useHistory } from './history';

export interface StartOptions {
  masterGain?: number;
  experiment?: { experimentId: string; assignmentIndex: number };
  /**
   * An acoustic layer to play under the protocol, by sound bath preset id.
   *
   * Carried through the safety check rather than around it: a sound bath is
   * still a session, and the output-route question — whether this person is
   * about to play a binaural beat through a speaker — is asked about the core
   * signal, which is present either way (§42).
   */
  soundBath?: { presetId: string; seed?: number | string; fullness?: SoundBathFullness };
  /** Called once playback has actually begun. */
  onStarted?: () => void;
}

interface SessionStartState {
  pending: { protocol: Protocol; options: StartOptions } | null;
  checks: SafetyCheck[];
  route: OutputRoute;
  /** Checks the user has already acknowledged for the current output route. */
  acknowledged: string[];
  /** Runs preflight, then either starts or opens the sheet. */
  request: (protocol: Protocol, options?: StartOptions) => Promise<void>;
  confirm: () => Promise<void>;
  useMonauralInstead: () => Promise<void>;
  cancel: () => void;
}

/**
 * The one path into playback (§42).
 *
 * Every "start" in the product goes through here, so the output-route check
 * cannot be forgotten on a new screen. A clean protocol on a known-good route
 * starts immediately — the sheet only appears when there is something the user
 * genuinely needs to decide.
 *
 * Acknowledgements are remembered per output route and cleared when the route
 * changes, so auditioning repeatedly in Explorer does not re-ask, but plugging
 * into a speaker does.
 */
export const useSessionStart = create<SessionStartState>((set, get) => ({
  pending: null,
  checks: [],
  route: { kind: 'unknown', reliable: false },
  acknowledged: [],

  request: async (protocol, options = {}) => {
    const route = await detectOutputRoute();
    const preferences = usePreferences.getState().preferences;
    const firstSession = useHistory.getState().sessions.length === 0;

    if (route.kind !== get().route.kind) set({ route, acknowledged: [] });
    else set({ route });

    const checks = preflight({
      protocol,
      route,
      usesBinaural: usesBinaural(protocol),
      comfortableOutputLevel: preferences.comfortableOutputLevel,
      firstSession,
    });

    const acknowledged = get().acknowledged;
    const outstanding = checks.filter(
      (check) => check.level !== 'info' || !acknowledged.includes(check.id),
    );
    const needsDecision =
      hasBlocker(checks) ||
      outstanding.some((check) => check.level === 'warning' && !acknowledged.includes(check.id)) ||
      (firstSession && outstanding.length > 0);

    if (!needsDecision) {
      await startNow(protocol, options, preferences.comfortableOutputLevel);
      return;
    }

    set({ pending: { protocol, options }, checks });
  },

  confirm: async () => {
    const pending = get().pending;
    if (!pending) return;
    const preferences = usePreferences.getState().preferences;
    set((state) => ({
      pending: null,
      acknowledged: [...new Set([...state.acknowledged, ...state.checks.map((check) => check.id)])],
    }));
    await startNow(pending.protocol, pending.options, preferences.comfortableOutputLevel);
  },

  useMonauralInstead: async () => {
    const pending = get().pending;
    if (!pending) return;
    const preferences = usePreferences.getState().preferences;
    const converted = convertBinauralToMonaural(pending.protocol);
    set((state) => ({
      pending: null,
      acknowledged: [...new Set([...state.acknowledged, ...state.checks.map((check) => check.id)])],
    }));
    await startNow(converted, pending.options, preferences.comfortableOutputLevel);
  },

  cancel: () => set({ pending: null, checks: [] }),
}));

async function startNow(
  protocol: Protocol,
  options: StartOptions,
  fallbackGain: number,
): Promise<void> {
  await usePlayer.getState().loadAndPlay(protocol, {
    masterGain: options.masterGain ?? fallbackGain,
    experiment: options.experiment,
    soundBath: options.soundBath,
  });
  options.onStarted?.();
}
