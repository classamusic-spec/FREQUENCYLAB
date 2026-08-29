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
  /** Guards against writing two records for the same playback. */
  recorded: boolean;
  /** Experiment this session belongs to, when it was started from one. */
  experimentContext?: { experimentId: string; assignmentIndex: number };
  /** Session written when playback finished, awaiting a rating. */
  /**
   * The session record written when playback ended.
   *
   * Three states, and the difference matters: `undefined` means the record is
   * still being written, `null` means playback was too short to record, and a
   * string is the id to rate. The session screen waits for one of the last two
   * before navigating — it used to read this the instant the state flipped to
   * `completed`, which is strictly earlier than the async write resolves, so it
   * always saw `undefined`, always fell back to `router.back()`, and unmounted
   * before the id arrived. The rating screen was unreachable from a finished
   * session, and with it every insight and experiment result that ratings feed.
   */
  lastCompletedSessionId?: string | null;
  /**
   * Set when playback was ended by something other than this store — the sleep
   * timer, or the lock-screen transport — so the session screen can leave the
   * way it does after a stop by hand rather than sitting on a frozen player.
   * Cleared when the next protocol is loaded.
   */
  externallyStopped: boolean;
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
  armSleepTimer: (minutes: number) => void;
  cancelSleepTimer: () => void;
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
  recorded: false,
  externallyStopped: false,

  attach: () => {
    let previousState = sessionController.playbackState;
    return sessionController.subscribe((snapshot) => {
      set({ snapshot });
      // Completion is detected here rather than in the render path, so writing
      // the session record never happens on the audio thread.
      //
      // `finishing` counts as a previous state as much as `playing` does. A
      // session with an organic layer passes through it on the way out — the
      // protocol has reached zero and the last tails are decaying (§76) — and
      // matching only on `playing` would mean that every such session finished
      // without a record, taking its rating, its insight and its experiment
      // result with it.
      const wasSounding = previousState === 'playing' || previousState === 'finishing';
      if (wasSounding && snapshot.state === 'completed' && !get().recorded) {
        set({ recorded: true });
        void writeSessionRecord(snapshot, 'completed', get().experimentContext)
          .then((session) => set({ lastCompletedSessionId: session ? session.id : null }))
          // A failed write must still resolve the wait, or the session screen
          // would sit on a finished session with nowhere to go.
          .catch(() => set({ lastCompletedSessionId: null }));
      }

      /*
       * A stop that did not come through this store: the sleep timer, or the
       * stop button on the lock screen. Both end playback from outside React,
       * so the record they leave behind has to be written here.
       *
       * It is written on the transition *into* the fade rather than after the
       * teardown: at this point the backend is still running, so the snapshot
       * still carries this session's underrun count and buffer stats, which a
       * disposed backend no longer reports. The state is emitted repeatedly
       * while the fade runs, hence the latch.
       */
      const stopReason = sessionController.pendingStopReason;
      if (
        snapshot.state === 'stopping' &&
        (stopReason === 'sleepTimer' || stopReason === 'remote') &&
        !get().externallyStopped
      ) {
        set({ externallyStopped: true });
        if (!get().recorded) {
          set({ recorded: true });
          // `stoppedByUser`, because that is what happened: the user asked for
          // this stop, when they armed the timer or when they reached for the
          // lock screen. The protocol did not finish.
          void writeSessionRecord(snapshot, 'stoppedByUser', get().experimentContext)
            .then((session) => set({ lastCompletedSessionId: session ? session.id : null }))
            .catch(() => set({ lastCompletedSessionId: null }));
        }
      }

      previousState = snapshot.state;
    });
  },

  loadAndPlay: async (protocol, options = {}) => {
    set({
      experimentContext: options.experiment,
      lastCompletedSessionId: undefined,
      recorded: false,
      externallyStopped: false,
    });
    await sessionController.load(protocol, { masterGain: options.masterGain });
    await sessionController.play();
  },

  load: async (protocol, masterGain) => {
    set({
      experimentContext: undefined,
      lastCompletedSessionId: undefined,
      recorded: false,
      externallyStopped: false,
    });
    await sessionController.load(protocol, { masterGain });
  },

  play: () => sessionController.play(),
  pause: () => sessionController.pause(),

  stop: async () => {
    if (get().recorded) {
      await sessionController.stop('user');
      return;
    }
    const snapshot = sessionController.snapshot();
    const reason: SessionEndReason = snapshot.telemetry?.finished ? 'completed' : 'stoppedByUser';
    set({ recorded: true });
    await sessionController.stop('user');
    const session = await writeSessionRecord(snapshot, reason, get().experimentContext);
    set({ lastCompletedSessionId: session ? session.id : null });
  },

  seek: (seconds) => sessionController.seek(seconds),
  setMasterGain: (value) => sessionController.setMasterGain(value),

  // The timer itself lives in the controller, next to the playback it ends.
  // These are the two ways the interface is allowed to touch it.
  armSleepTimer: (minutes) => sessionController.armSleepTimer(minutes),
  cancelSleepTimer: () => sessionController.cancelSleepTimer(),
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
