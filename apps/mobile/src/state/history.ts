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
  hydrate: () => Promise<void>;
  record: (session: Session) => Promise<void>;
  rate: (sessionId: string, ratings: SubjectiveRating[], note?: string) => Promise<void>;
  remove: (sessionId: string) => Promise<void>;
  insights: () => Insight[];
  /** Sessions still short of the threshold that unlocks insights. */
  sessionsUntilInsights: () => number;
  metricsUsed: () => MetricKey[];
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
    await saveSessions(sessions);
  },

  rate: async (sessionId, ratings, note) => {
    const sessions = get().sessions.map((session) =>
      session.id === sessionId ? { ...session, ratings, note: note ?? session.note } : session,
    );
    set({ sessions });
    await saveSessions(sessions);
  },

  remove: async (sessionId) => {
    const sessions = get().sessions.filter((session) => session.id !== sessionId);
    set({ sessions });
    await saveSessions(sessions);
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
