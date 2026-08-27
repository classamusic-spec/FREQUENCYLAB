import { useEffect, useState } from 'react';
import { create } from 'zustand';
import {
  protocolDna,
  totalDurationSec,
  type Protocol,
  type Session,
  type SessionEndReason,
} from '@frequencylab/dsp-core';
import {
  sessionController,
  type ControllerSnapshot,
  type ScopeCapture,
} from '../audio/sessionController';
import { useHistory } from './history';
import { useExperiments } from './experiments';

interface PlayerState {
  snapshot: ControllerSnapshot;
  /** Experiment this session belongs to, when it was started from one. */
  experimentContext?: { experimentId: string; assignmentIndex: number };
  /** Session written when playback finished, awaiting a rating. */
  lastCompletedSessionId?: string;
  attach: () => () => void;
  loadAndPlay: (
    protocol: Protocol,
    options?: {
      masterGain?: number;
      experiment?: { experimentId: string; assignmentIndex: number };
    },
  ) => Promise<void>;
  load: (protocol: Protocol, masterGain?: number) => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  seek: (seconds: number) => void;
  setMasterGain: (value: number) => void;
}

/**
 * Bridges the audio controller into React.
 *
 * The controller is the source of truth and lives outside React entirely, which
 * is what keeps playback independent of the component tree: navigating away
 * from the session screen, or a re-render storm, cannot interrupt audio.
 */
export const usePlayer = create<PlayerState>((set, get) => ({
  snapshot: sessionController.snapshot(),

  attach: () => {
    let previousState = sessionController.playbackState;
    return sessionController.subscribe((snapshot) => {
      set({ snapshot });
      // Completion is detected here rather than in the render path, so writing
      // the session record never happens on the audio thread.
      if (previousState === 'playing' && snapshot.state === 'completed') {
        void writeSessionRecord(snapshot, 'completed', get().experimentContext).then((session) => {
          if (session) set({ lastCompletedSessionId: session.id });
        });
      }
      previousState = snapshot.state;
    });
  },

  loadAndPlay: async (protocol, options = {}) => {
    set({ experimentContext: options.experiment, lastCompletedSessionId: undefined });
    await sessionController.load(protocol, { masterGain: options.masterGain });
    await sessionController.play();
  },

  load: async (protocol, masterGain) => {
    set({ experimentContext: undefined, lastCompletedSessionId: undefined });
    await sessionController.load(protocol, { masterGain });
  },

  play: () => sessionController.play(),
  pause: () => sessionController.pause(),

  stop: async () => {
    const snapshot = sessionController.snapshot();
    const reason: SessionEndReason = snapshot.telemetry?.finished ? 'completed' : 'stoppedByUser';
    await sessionController.stop('user');
    const session = await writeSessionRecord(snapshot, reason, get().experimentContext);
    if (session) set({ lastCompletedSessionId: session.id });
  },

  seek: (seconds) => sessionController.seek(seconds),
  setMasterGain: (value) => sessionController.setMasterGain(value),
}));

/**
 * Writes the session record.
 *
 * A session shorter than thirty seconds is not recorded: history is the
 * evidence base for insights and experiments, and an accidental start would be
 * noise in it.
 */
const MIN_RECORDABLE_SEC = 30;

async function writeSessionRecord(
  snapshot: ControllerSnapshot,
  endReason: SessionEndReason,
  experiment?: { experimentId: string; assignmentIndex: number },
): Promise<Session | undefined> {
  const protocol = sessionController.currentProtocol;
  if (!protocol || snapshot.playedSec < MIN_RECORDABLE_SEC) return undefined;

  const dna = protocolDna(protocol);
  const planned = totalDurationSec(protocol);
  const session: Session = {
    id: `session-${Date.now().toString(36)}`,
    protocolId: protocol.id,
    protocolName: protocol.name,
    protocolFingerprint: dna.fingerprint,
    humanDna: dna.human,
    dspVersion: protocol.dspVersion,
    startedAt: new Date(Date.now() - snapshot.playedSec * 1000).toISOString(),
    endedAt: new Date().toISOString(),
    plannedDurationSec: planned,
    endReason,
    metrics: {
      playedSec: snapshot.playedSec,
      adherence: planned > 0 ? Math.min(1, snapshot.playedSec / planned) : 0,
      pauseCount: snapshot.pauseCount,
      peakGainReductionDb: snapshot.peakGainReductionDb,
      underruns: snapshot.backend.stats.underruns,
      outputRoute: snapshot.route.kind,
      headphonesDetected: snapshot.route.reliable
        ? snapshot.route.kind === 'headphones' || snapshot.route.kind === 'bluetooth'
        : undefined,
    },
    ratings: [],
    experimentId: experiment?.experimentId,
    // The whole protocol is stored with the session so history stays
    // reproducible even after the protocol is edited or deleted.
    protocolSnapshot: protocol,
  };

  await useHistory.getState().record(session);

  // Link the assignment only now: an experiment session counts once it has
  // produced a record, not when the user pressed start.
  if (experiment) {
    await useExperiments
      .getState()
      .completeSession(experiment.experimentId, experiment.assignmentIndex, session.id);
  }

  return session;
}

/**
 * Scope data for the visualisers.
 *
 * Deliberately not in the store: this polls at its own frame rate and would
 * otherwise re-render every subscriber of the player state 20 times a second.
 */
export function useScopeCapture(fps = 20, active = true): ScopeCapture | null {
  const [capture, setCapture] = useState<ScopeCapture | null>(null);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setCapture(sessionController.capture()), 1000 / fps);
    return () => clearInterval(interval);
  }, [active, fps]);

  return capture;
}

/** Subscribes a component to controller updates for its lifetime. */
export function usePlayerAttachment(): void {
  const attach = usePlayer((state) => state.attach);
  useEffect(() => attach(), [attach]);
}
