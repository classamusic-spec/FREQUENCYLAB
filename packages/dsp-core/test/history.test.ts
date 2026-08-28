import { describe, expect, it } from 'vitest';
import {
  dailyTotals,
  listeningSummary,
  sessionDayKey,
  weekdayTotals,
  type Session,
} from '../src/index.js';

/**
 * Every date in this file is written out in full, and `now` is always passed
 * in. Nothing here calls `Date.now()`, so the suite gives the same answer at
 * 23:59 as at noon, in Tokyo as on a UTC runner — which is the property the
 * module exists to guarantee, and it would be odd to test it with a clock.
 */

function makeSession(id: string, startedAt: string, overrides: Partial<Session> = {}): Session {
  return {
    id,
    protocolId: 'p',
    protocolName: 'Evening wind-down',
    protocolFingerprint: 'f',
    humanDna: 'B7-C220-PN12-T20',
    dspVersion: '1.0.0',
    startedAt,
    endedAt: startedAt,
    plannedDurationSec: 1200,
    endReason: 'completed',
    metrics: {
      playedSec: 1200,
      adherence: 1,
      pauseCount: 0,
      peakGainReductionDb: 0,
      underruns: 0,
    },
    ratings: [],
    ...overrides,
  };
}

/** A session at 09:00 UTC on the given `YYYY-MM-DD`. */
function morningOf(day: string, seconds = 1200): Session {
  return makeSession(`s-${day}`, `${day}T09:00:00.000Z`, {
    metrics: {
      playedSec: seconds,
      adherence: 1,
      pauseCount: 0,
      peakGainReductionDb: 0,
      underruns: 0,
    },
  });
}

const NOW = '2026-03-15T18:00:00.000Z';

describe('listeningSummary', () => {
  it('reports zeros and no last session for an empty history', () => {
    const summary = listeningSummary([], { now: NOW });
    expect(summary).toEqual({
      totalSessions: 0,
      totalPlayedSec: 0,
      ratedCount: 0,
      currentStreakDays: 0,
      longestStreakDays: 0,
      lastSessionAt: undefined,
      averageSessionSec: 0,
    });
  });

  it('totals played time, rated sessions and the average length', () => {
    const sessions = [
      morningOf('2026-03-15', 600),
      morningOf('2026-03-14', 1200),
      makeSession('rated', '2026-03-13T09:00:00.000Z', {
        ratings: [{ metric: 'relaxation', value: 7.5 }],
      }),
    ];
    const summary = listeningSummary(sessions, { now: NOW });
    expect(summary.totalSessions).toBe(3);
    expect(summary.totalPlayedSec).toBe(3000);
    expect(summary.ratedCount).toBe(1);
    expect(summary.averageSessionSec).toBe(1000);
    expect(summary.lastSessionAt).toBe('2026-03-15T09:00:00.000Z');
  });

  it('counts five consecutive days as a five-day streak', () => {
    const sessions = [
      morningOf('2026-03-11'),
      morningOf('2026-03-12'),
      morningOf('2026-03-13'),
      morningOf('2026-03-14'),
      morningOf('2026-03-15'),
    ];
    const summary = listeningSummary(sessions, { now: NOW });
    expect(summary.currentStreakDays).toBe(5);
    expect(summary.longestStreakDays).toBe(5);
  });

  it('stops the current streak at a gap but keeps the longest run', () => {
    const sessions = [
      // A four-day run, then a missed day, then two days up to today.
      morningOf('2026-03-08'),
      morningOf('2026-03-09'),
      morningOf('2026-03-10'),
      morningOf('2026-03-11'),
      morningOf('2026-03-14'),
      morningOf('2026-03-15'),
    ];
    const summary = listeningSummary(sessions, { now: NOW });
    expect(summary.currentStreakDays).toBe(2);
    expect(summary.longestStreakDays).toBe(4);
  });

  it('does not break a streak just because today has no session yet', () => {
    // Yesterday and the two days before it. Today is still in progress, so the
    // streak is intact — the user has not missed a day until the day is over.
    const sessions = [morningOf('2026-03-12'), morningOf('2026-03-13'), morningOf('2026-03-14')];
    const summary = listeningSummary(sessions, { now: NOW });
    expect(summary.currentStreakDays).toBe(3);

    // Two silent days is a real break, and reads as one.
    const older = listeningSummary(sessions, { now: '2026-03-16T18:00:00.000Z' });
    expect(older.currentStreakDays).toBe(0);
    expect(older.longestStreakDays).toBe(3);
  });

  it('counts two sessions on one day as a single streak day', () => {
    const sessions = [
      makeSession('a', '2026-03-14T07:00:00.000Z'),
      makeSession('b', '2026-03-14T21:30:00.000Z'),
      makeSession('c', '2026-03-15T09:00:00.000Z'),
    ];
    const summary = listeningSummary(sessions, { now: NOW });
    expect(summary.totalSessions).toBe(3);
    expect(summary.currentStreakDays).toBe(2);
    expect(summary.longestStreakDays).toBe(2);
  });

  it('ignores sessions dated after now, so a skewed clock cannot invent a streak', () => {
    const sessions = [morningOf('2026-03-15'), morningOf('2026-03-16'), morningOf('2026-03-17')];
    const summary = listeningSummary(sessions, { now: NOW });
    expect(summary.totalSessions).toBe(1);
    expect(summary.currentStreakDays).toBe(1);
  });

  it('survives an unparseable timestamp instead of dropping the panel', () => {
    const sessions = [makeSession('broken', 'not-a-date'), morningOf('2026-03-15')];
    const summary = listeningSummary(sessions, { now: NOW });
    expect(summary.totalSessions).toBe(1);
    expect(summary.currentStreakDays).toBe(1);
  });
});

describe('time zone offset', () => {
  // 23:30 UTC on the 10th is 00:30 on the 11th once the clock is an hour east.
  const lateNight = makeSession('late', '2026-03-10T23:30:00.000Z');

  it('places a late-night session on the next day at +01:00', () => {
    expect(sessionDayKey(lateNight.startedAt, 0)).toBe('2026-03-10');
    expect(sessionDayKey(lateNight.startedAt, 60)).toBe('2026-03-11');
    // And back the other way: it is still the 10th in New York.
    expect(sessionDayKey(lateNight.startedAt, -300)).toBe('2026-03-10');
  });

  it('moves the session across a day boundary in the daily totals', () => {
    const options = { now: '2026-03-11T12:00:00.000Z', days: 3 } as const;

    const utc = dailyTotals([lateNight], options);
    expect(utc.map((day) => [day.date, day.sessions])).toEqual([
      ['2026-03-09', 0],
      ['2026-03-10', 1],
      ['2026-03-11', 0],
    ]);

    const east = dailyTotals([lateNight], { ...options, timeZoneOffsetMinutes: 60 });
    expect(east.map((day) => [day.date, day.sessions])).toEqual([
      ['2026-03-09', 0],
      ['2026-03-10', 0],
      ['2026-03-11', 1],
    ]);
  });

  it('changes whether the streak reaches today', () => {
    const now = '2026-03-11T12:00:00.000Z';
    // In UTC the last session was yesterday — still a live one-day streak.
    expect(listeningSummary([lateNight], { now }).currentStreakDays).toBe(1);
    // An hour east it happened today, which is the same count for a different
    // reason; add the previous day and the two offsets genuinely diverge.
    const withPrevious = [lateNight, morningOf('2026-03-10')];
    expect(listeningSummary(withPrevious, { now }).currentStreakDays).toBe(1);
    expect(
      listeningSummary(withPrevious, { now, timeZoneOffsetMinutes: 60 }).currentStreakDays,
    ).toBe(2);
  });
});

describe('dailyTotals', () => {
  it('returns exactly N days, oldest first, with the empty ones filled in', () => {
    const sessions = [morningOf('2026-03-15', 900), morningOf('2026-03-12', 600)];
    const days = dailyTotals(sessions, { now: NOW, days: 7 });

    expect(days).toHaveLength(7);
    expect(days.map((day) => day.date)).toEqual([
      '2026-03-09',
      '2026-03-10',
      '2026-03-11',
      '2026-03-12',
      '2026-03-13',
      '2026-03-14',
      '2026-03-15',
    ]);
    expect(days.map((day) => day.playedSec)).toEqual([0, 0, 0, 600, 0, 0, 900]);
    expect(days.map((day) => day.sessions)).toEqual([0, 0, 0, 1, 0, 0, 1]);
  });

  it('sums several sessions on the same day', () => {
    const sessions = [
      makeSession('a', '2026-03-15T07:00:00.000Z'),
      makeSession('b', '2026-03-15T16:00:00.000Z'),
    ];
    const [today] = dailyTotals(sessions, { now: NOW, days: 1 });
    expect(today).toEqual({ date: '2026-03-15', playedSec: 2400, sessions: 2 });
  });

  it('drops sessions older than the window without shifting the axis', () => {
    const days = dailyTotals([morningOf('2026-01-01')], { now: NOW, days: 30 });
    expect(days).toHaveLength(30);
    expect(days[0].date).toBe('2026-02-14');
    expect(days.every((day) => day.sessions === 0)).toBe(true);
  });

  it('returns an empty array for an unusable now rather than guessing one', () => {
    expect(dailyTotals([morningOf('2026-03-15')], { now: 'whenever', days: 7 })).toEqual([]);
  });
});

describe('weekdayTotals', () => {
  it('buckets by weekday, Sunday first, independent of the runtime zone', () => {
    // 2026-03-15 is a Sunday; 2026-03-14 a Saturday.
    const totals = weekdayTotals([morningOf('2026-03-15', 600), morningOf('2026-03-14', 300)], {
      now: NOW,
    });
    expect(totals).toHaveLength(7);
    expect(totals.map((day) => day.label)).toEqual([
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ]);
    expect(totals[0]).toEqual({ weekday: 0, label: 'Sun', playedSec: 600, sessions: 1 });
    expect(totals[6]).toEqual({ weekday: 6, label: 'Sat', playedSec: 300, sessions: 1 });
    expect(totals[3].sessions).toBe(0);
  });

  it('follows the offset when a session crosses midnight', () => {
    // 23:30 UTC on Tuesday the 10th is Wednesday the 11th at +01:00.
    const session = makeSession('late', '2026-03-10T23:30:00.000Z');
    const utc = weekdayTotals([session], { now: NOW });
    expect(utc[2].sessions).toBe(1);
    const east = weekdayTotals([session], { now: NOW, timeZoneOffsetMinutes: 60 });
    expect(east[3].sessions).toBe(1);
  });
});
