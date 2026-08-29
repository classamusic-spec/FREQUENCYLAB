import { create } from 'zustand';
import {
  MIN_SESSIONS_FOR_INSIGHTS,
  deriveInsights,
  type Insight,
  type MetricKey,
  type Session,
  type SubjectiveRating,
} from '@frequencylab/dsp-core';
import { loadSessions, saveSessions } from '../storage/repositories';

interface HistoryState {
  sessions: Session[];
  hydrated: boolean;
  /**
   * Set when a write to disk failed, cleared when one succeeds.
   *
   * The in-memory list is updated before the write, so the screen a user is
   * looking at shows their session either way. This is what stops that being a
   * lie: without it a failed write leaves the app displaying a history that is
   * not on disk and will be gone at the next launch, with nothing said.
   */
  storageError?: string;
  hydrate: () => Promise<void>;
  record: (session: Session) => Promise<void>;
  rate: (sessionId: string, ratings: SubjectiveRating[], note?: string) => Promise<void>;
  remove: (sessionId: string) => Promise<void>;
  insights: () => Insight[];
  /** Sessions still short of the threshold that unlocks insights. */
  sessionsUntilInsights: () => number;
  metricsUsed: () => MetricKey[];
}

/**
 * Writes the list, and records the outcome either way.
 *
 * Swallowing a failure here would leave the store and the disk disagreeing with
 * nothing to say so; rethrowing it would take down whatever asked to save, and
 * a session that cannot be written must still be a session the user can see.
 * So the error is stored, and the screens show it.
 */
async function persist(
  sessions: Session[],
  set: (partial: Partial<HistoryState>) => void,
  what: string,
): Promise<void> {
  try {
    await saveSessions(sessions);
    set({ storageError: undefined });
  } catch (error) {
    set({
      storageError: `${what}. ${
        error instanceof Error ? error.message : String(error)
      } It is still here until you close the app.`,
    });
  }
}

export const useHistory = create<HistoryState>((set, get) => ({
  sessions: [],
  hydrated: false,

  hydrate: async () => {
    const sessions = await loadSessions();
    set({ sessions, hydrated: true });
  },

  record: async (session) => {
    const sessions = [session, ...get().sessions];
    set({ sessions });
    await persist(sessions, set, 'This session was not saved');
  },

  rate: async (sessionId, ratings, note) => {
    const sessions = get().sessions.map((session) =>
      session.id === sessionId ? { ...session, ratings, note: note ?? session.note } : session,
    );
    set({ sessions });
    await persist(sessions, set, 'That rating was not saved');
  },

  remove: async (sessionId) => {
    const sessions = get().sessions.filter((session) => session.id !== sessionId);
    set({ sessions });
    await persist(sessions, set, 'That session was removed here but not on disk');
  },

  insights: () => deriveInsights(get().sessions),

  sessionsUntilInsights: () => {
    const rated = get().sessions.filter((session) => session.ratings.length > 0).length;
    return Math.max(0, MIN_SESSIONS_FOR_INSIGHTS - rated);
  },

  metricsUsed: () => {
    const metrics = new Set<MetricKey>();
    for (const session of get().sessions) {
      for (const rating of session.ratings) metrics.add(rating.metric);
    }
    return [...metrics];
  },
}));
