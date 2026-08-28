import type { Session } from '../domain/models.js';

/**
 * Listening history, as a trend rather than a total.
 *
 * A count of sessions says how much you have done; it says nothing about
 * whether you are still doing it. These functions turn the same records into
 * shape over time — days, streaks, weekday habits — without claiming any of it
 * means something about the listener. A streak is a description of the calendar
 * and nothing else (§19): it is not progress, not adherence, and not a score.
 *
 * DETERMINISM. Everything here is pure and explicit about time, which is a
 * deliberate correction rather than a preference. `insights.ts` reads the time
 * of day with `new Date(x).getHours()`, so the same history analysed on a phone
 * in Tokyo and on a CI runner in UTC produces different answers, and a
 * regression test can only pin the one the machine happens to give. Nothing in
 * this file touches the ambient clock or the ambient zone:
 *
 *  - `now` arrives as an ISO string, so "today" is an argument the caller owns
 *    and a test can state a fact instead of racing midnight;
 *  - the zone arrives as `timeZoneOffsetMinutes` (minutes east of UTC, default
 *    0 = UTC), and every day boundary is derived from it arithmetically, so the
 *    answer travels with the data rather than with the device;
 *  - weekday labels are fixed English here rather than formatted through the
 *    runtime locale, for the same reason — the value must not change because
 *    the process did.
 *
 * A fixed offset is not a full time zone: it cannot know that a particular
 * calendar day was 23 or 25 hours long across a DST change. That costs at most
 * an hour at one boundary a couple of times a year, which is an honest price
 * for a function that answers the same way everywhere. The caller passes the
 * device's current offset (`-new Date().getTimezoneOffset()`); the impurity
 * stays at the call site where it is visible.
 */

const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;

/** Weekday names, index-aligned to `Date.getUTCDay()` (0 = Sunday). */
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export interface HistoryWindowOptions {
  /**
   * The instant to treat as "now", ISO-8601. Required, never defaulted to the
   * system clock: a history summary that quietly changes at midnight is not
   * reproducible, and the caller always knows what it means by now.
   */
  now: string;
  /**
   * Minutes east of UTC used to place a timestamp on a calendar day — 0 for
   * UTC, 60 for CET, -300 for EST. Defaults to 0 so a value computed without
   * an opinion about zones is at least a documented one.
   */
  timeZoneOffsetMinutes?: number;
}

export interface ListeningSummary {
  totalSessions: number;
  /** Seconds of audio actually played, summed across every session. */
  totalPlayedSec: number;
  /** Sessions carrying at least one subjective rating. */
  ratedCount: number;
  /** Consecutive days up to today with at least one session. See `currentStreak`. */
  currentStreakDays: number;
  /** The longest such run anywhere in the history. */
  longestStreakDays: number;
  /** `startedAt` of the most recent session, or undefined when there are none. */
  lastSessionAt?: string;
  /** totalPlayedSec / totalSessions, or 0 with no sessions. */
  averageSessionSec: number;
}

export interface DailyTotal {
  /** Calendar day in the requested offset, `YYYY-MM-DD`. */
  date: string;
  playedSec: number;
  sessions: number;
}

export interface WeekdayTotal {
  /** 0 = Sunday, matching `Date.getUTCDay()`. */
  weekday: number;
  /** Fixed English abbreviation, not locale-formatted. */
  label: string;
  playedSec: number;
  sessions: number;
}

/**
 * The day number since the Unix epoch that a timestamp falls on, in the given
 * offset. Shifting the instant and flooring is all a calendar day is once the
 * offset is fixed, and it stays correct for dates before 1970 because
 * `Math.floor` rounds towards negative infinity.
 *
 * Returns undefined for an unparseable timestamp — one damaged record must not
 * take the whole panel down.
 */
function dayIndexOf(iso: string, timeZoneOffsetMinutes: number): number | undefined {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return undefined;
  return Math.floor((ms + timeZoneOffsetMinutes * MS_PER_MINUTE) / MS_PER_DAY);
}

/**
 * `YYYY-MM-DD` for a day index. Built through `toISOString`, which is defined
 * as UTC, so the string never depends on the runtime's zone.
 */
export function dayKeyFromIndex(dayIndex: number): string {
  return new Date(dayIndex * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * The calendar day a timestamp belongs to, `YYYY-MM-DD`, in the given offset.
 * Exported because the same rule has to hold anywhere history is grouped: a
 * session belongs to the day it *started*, even if it ran past midnight.
 */
export function sessionDayKey(iso: string, timeZoneOffsetMinutes = 0): string | undefined {
  const index = dayIndexOf(iso, timeZoneOffsetMinutes);
  return index === undefined ? undefined : dayKeyFromIndex(index);
}

interface PlacedSession {
  dayIndex: number;
  startedMs: number;
  startedAt: string;
  playedSec: number;
  rated: boolean;
}

/**
 * Sessions reduced to the few fields the history views need, with two records
 * dropped: those whose `startedAt` will not parse, and those dated after `now`.
 * The second matters — a device with a skewed clock can write a session dated
 * tomorrow, and counting it would invent a streak day the user never listened
 * on. History is the past; anything else is not evidence of it.
 */
function place(
  sessions: readonly Session[],
  nowMs: number,
  timeZoneOffsetMinutes: number,
): PlacedSession[] {
  const placed: PlacedSession[] = [];
  for (const session of sessions) {
    const startedMs = Date.parse(session.startedAt);
    if (Number.isNaN(startedMs) || startedMs > nowMs) continue;
    const dayIndex = Math.floor((startedMs + timeZoneOffsetMinutes * MS_PER_MINUTE) / MS_PER_DAY);
    const playedSec = Number.isFinite(session.metrics?.playedSec) ? session.metrics.playedSec : 0;
    placed.push({
      dayIndex,
      startedMs,
      startedAt: session.startedAt,
      playedSec: Math.max(0, playedSec),
      rated: (session.ratings?.length ?? 0) > 0,
    });
  }
  return placed;
}

/**
 * Consecutive calendar days, in the given offset, each holding at least one
 * session — counted backwards from today.
 *
 * THE RULE, stated once so the UI can repeat it verbatim: a day counts if any
 * session started on it, however short; two sessions on one day are still one
 * day. **Today not having a session yet does not break a streak that included
 * yesterday.** Without that grace every streak would read as broken from
 * midnight until the moment you next listen, which is both discouraging and
 * false — you have not missed a day until the day is over. So the count is
 * anchored to today when today has a session, and to yesterday otherwise; two
 * consecutive empty days end it.
 */
function currentStreak(days: ReadonlySet<number>, today: number): number {
  const anchor = days.has(today) ? today : days.has(today - 1) ? today - 1 : undefined;
  if (anchor === undefined) return 0;
  let count = 0;
  for (let day = anchor; days.has(day); day--) count++;
  return count;
}

/** The longest run of consecutive days anywhere in the history. */
function longestStreak(days: ReadonlySet<number>): number {
  const sorted = [...days].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let previous: number | undefined;
  for (const day of sorted) {
    run = previous !== undefined && day === previous + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    previous = day;
  }
  return longest;
}

/**
 * Headline figures for a listening history: how much, how recently, and how
 * consistently.
 *
 * Everything is a plain count of what is on the device. Nothing is extrapolated,
 * nothing is scored, and an empty history returns zeros with no `lastSessionAt`
 * rather than a fabricated baseline — the caller is expected to say "nothing
 * yet" rather than print a row of noughts.
 *
 * Streak semantics are exactly those of `currentStreak` above: consecutive days
 * with at least one session, in the given offset, with today's silence not
 * counting as a break until the day is out.
 */
export function listeningSummary(
  sessions: readonly Session[],
  options: HistoryWindowOptions,
): ListeningSummary {
  const offset = options.timeZoneOffsetMinutes ?? 0;
  const nowMs = Date.parse(options.now);
  // An unusable `now` would silently discard every session as "future", so fall
  // back to admitting all of them rather than reporting an empty history.
  const placed = place(sessions, Number.isNaN(nowMs) ? Infinity : nowMs, offset);

  const days = new Set<number>();
  let totalPlayedSec = 0;
  let ratedCount = 0;
  let latest: PlacedSession | undefined;
  for (const entry of placed) {
    days.add(entry.dayIndex);
    totalPlayedSec += entry.playedSec;
    if (entry.rated) ratedCount++;
    if (!latest || entry.startedMs > latest.startedMs) latest = entry;
  }

  const today = Number.isNaN(nowMs)
    ? undefined
    : Math.floor((nowMs + offset * MS_PER_MINUTE) / MS_PER_DAY);

  return {
    totalSessions: placed.length,
    totalPlayedSec,
    ratedCount,
    currentStreakDays: today === undefined ? 0 : currentStreak(days, today),
    longestStreakDays: longestStreak(days),
    lastSessionAt: latest?.startedAt,
    averageSessionSec: placed.length === 0 ? 0 : totalPlayedSec / placed.length,
  };
}

export interface DailyTotalsOptions extends HistoryWindowOptions {
  /** How many days to return, ending with today. */
  days: number;
}

/**
 * One entry per calendar day for the last N days, oldest first, ending with
 * today in the given offset.
 *
 * Days with no listening are present with zeros. That is the point: a sparkline
 * drawn only from the days that exist compresses a fortnight's gap into a
 * single step and flatters the history. The x axis has to be time, not
 * sessions, so the empty days are data.
 */
export function dailyTotals(
  sessions: readonly Session[],
  options: DailyTotalsOptions,
): DailyTotal[] {
  const offset = options.timeZoneOffsetMinutes ?? 0;
  const nowMs = Date.parse(options.now);
  if (Number.isNaN(nowMs)) return [];
  const span = Math.max(1, Math.floor(options.days));
  const today = Math.floor((nowMs + offset * MS_PER_MINUTE) / MS_PER_DAY);
  const first = today - span + 1;

  const byDay = new Map<number, { playedSec: number; sessions: number }>();
  for (const entry of place(sessions, nowMs, offset)) {
    if (entry.dayIndex < first || entry.dayIndex > today) continue;
    const bucket = byDay.get(entry.dayIndex) ?? { playedSec: 0, sessions: 0 };
    bucket.playedSec += entry.playedSec;
    bucket.sessions += 1;
    byDay.set(entry.dayIndex, bucket);
  }

  const out: DailyTotal[] = [];
  for (let day = first; day <= today; day++) {
    const bucket = byDay.get(day);
    out.push({
      date: dayKeyFromIndex(day),
      playedSec: bucket?.playedSec ?? 0,
      sessions: bucket?.sessions ?? 0,
    });
  }
  return out;
}

/**
 * Listening time per weekday across the whole history — seven entries, Sunday
 * first, index-aligned to `Date.getUTCDay()` so the array index is the weekday.
 *
 * Weekdays are derived from the day index arithmetically (epoch day 0 was a
 * Thursday) rather than from a `Date` accessor, so the answer does not move
 * with the runtime's zone, and the labels are fixed English rather than
 * locale-formatted for the same reason. A UI that wants a translated or
 * Monday-first axis should reorder and relabel at the edge.
 *
 * `now` is required here too, so that the future-dated records excluded from
 * the summary are excluded from this breakdown as well: two views of one
 * history that disagree about which sessions are real are worse than either.
 */
export function weekdayTotals(
  sessions: readonly Session[],
  options: HistoryWindowOptions,
): WeekdayTotal[] {
  const offset = options.timeZoneOffsetMinutes ?? 0;
  const nowMs = Date.parse(options.now);
  const totals: WeekdayTotal[] = WEEKDAY_LABELS.map((label, weekday) => ({
    weekday,
    label,
    playedSec: 0,
    sessions: 0,
  }));

  for (const entry of place(sessions, Number.isNaN(nowMs) ? Infinity : nowMs, offset)) {
    // Epoch day 0 (1970-01-01) was a Thursday, i.e. weekday 4.
    const weekday = (((entry.dayIndex + 4) % 7) + 7) % 7;
    totals[weekday].playedSec += entry.playedSec;
    totals[weekday].sessions += 1;
  }
  return totals;
}
