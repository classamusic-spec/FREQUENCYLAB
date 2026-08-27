import type { MetricKey, Session } from '../domain/models.js';
import { correlation, linearTrend, summarise, welchTTest } from './stats.js';

/**
 * Personal insights.
 *
 * These are observational findings in one person's own history, so the language
 * is fixed at the source rather than left to a UI writer: "associated with",
 * "your history suggests", "may perform better for you". Nothing here says
 * causes, treats, heals or fixes (§19), and every insight carries the sample
 * size that produced it.
 */

export type InsightConfidence = 'preliminary' | 'moderate' | 'consistent';

export interface Insight {
  id: string;
  /** Short headline, e.g. "5–7 Hz sessions". */
  title: string;
  /** Full sentence, already phrased as an association. */
  body: string;
  metric: MetricKey;
  /** Sessions the observation is based on. */
  sampleSize: number;
  confidence: InsightConfidence;
  /** Signed effect, in rating points, for sorting and for the sparkline. */
  effect: number;
  /** What would make this more trustworthy. */
  nextStep?: string;
}

/** The smallest history that produces any insight at all. */
export const MIN_SESSIONS_FOR_INSIGHTS = 8;
const MIN_GROUP = 3;

export interface InsightOptions {
  metrics?: MetricKey[];
  /** Beat-frequency bands to compare, in Hz. */
  bands?: Array<{ label: string; low: number; high: number }>;
}

const DEFAULT_BANDS = [
  { label: '0.5–4 Hz', low: 0.5, high: 4 },
  { label: '4–8 Hz', low: 4, high: 8 },
  { label: '8–13 Hz', low: 8, high: 13 },
  { label: '13–30 Hz', low: 13, high: 30 },
  { label: '30 Hz and above', low: 30, high: 200 },
];

/**
 * Derives insights from a session history.
 *
 * Returns an empty list — not a weak one — when the history is too small. An
 * empty state that says "keep going" is more honest than an insight built from
 * four sessions.
 */
export function deriveInsights(
  sessions: readonly Session[],
  options: InsightOptions = {},
): Insight[] {
  const rated = sessions.filter((session) => session.ratings.length > 0);
  if (rated.length < MIN_SESSIONS_FOR_INSIGHTS) return [];

  const metrics = options.metrics ?? collectMetrics(rated);
  const bands = options.bands ?? DEFAULT_BANDS;
  const insights: Insight[] = [];

  for (const metric of metrics) {
    const withMetric = rated.filter((session) =>
      session.ratings.some((rating) => rating.metric === metric),
    );
    if (withMetric.length < MIN_SESSIONS_FOR_INSIGHTS) continue;

    insights.push(...bandInsights(withMetric, metric, bands));
    const duration = durationInsight(withMetric, metric);
    if (duration) insights.push(duration);
    const noise = noiseInsight(withMetric, metric);
    if (noise) insights.push(noise);
    const timeOfDay = timeOfDayInsight(withMetric, metric);
    if (timeOfDay) insights.push(timeOfDay);
    const trend = trendInsight(withMetric, metric);
    if (trend) insights.push(trend);
  }

  return insights.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
}

function collectMetrics(sessions: readonly Session[]): MetricKey[] {
  const counts = new Map<MetricKey, number>();
  for (const session of sessions) {
    for (const rating of session.ratings) {
      counts.set(rating.metric, (counts.get(rating.metric) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= MIN_SESSIONS_FOR_INSIGHTS)
    .sort((a, b) => b[1] - a[1])
    .map(([metric]) => metric);
}

function ratingOf(session: Session, metric: MetricKey): number | undefined {
  return session.ratings.find((rating) => rating.metric === metric)?.value;
}

/**
 * The beat frequency a session ran at, read from its human DNA.
 * Sessions store the DNA rather than the whole protocol graph, so this stays
 * correct even if the protocol was edited afterwards.
 */
export function beatFromDna(humanDna: string): number | undefined {
  const match = /(?:^|-)B(\d+(?:\.\d+)?)/.exec(humanDna);
  return match ? Number.parseFloat(match[1]) : undefined;
}

export function noiseFromDna(humanDna: string): { color: string; percent: number } | undefined {
  const match = /(?:^|-)(WN|PN|BN)(\d+)/.exec(humanDna);
  if (!match) return undefined;
  const color = { WN: 'white', PN: 'pink', BN: 'brown' }[match[1]] ?? 'pink';
  return { color, percent: Number.parseInt(match[2], 10) };
}

function confidenceFor(n: number, p: number): InsightConfidence {
  if (n >= 20 && p < 0.05) return 'consistent';
  if (n >= 12 && p < 0.2) return 'moderate';
  return 'preliminary';
}

function bandInsights(
  sessions: readonly Session[],
  metric: MetricKey,
  bands: Array<{ label: string; low: number; high: number }>,
): Insight[] {
  const groups = new Map<string, number[]>();
  for (const session of sessions) {
    const beat = beatFromDna(session.humanDna);
    const value = ratingOf(session, metric);
    if (beat === undefined || value === undefined) continue;
    const band = bands.find((candidate) => beat >= candidate.low && beat < candidate.high);
    if (!band) continue;
    const list = groups.get(band.label) ?? [];
    list.push(value);
    groups.set(band.label, list);
  }

  const usable = [...groups.entries()].filter(([, values]) => values.length >= MIN_GROUP);
  if (usable.length < 2) return [];

  const ranked = usable
    .map(([label, values]) => ({ label, values, summary: summarise(values) }))
    .sort((a, b) => b.summary.mean - a.summary.mean);

  const best = ranked[0];
  const rest = ranked.slice(1).flatMap((entry) => entry.values);
  const test = welchTTest(best.values, rest);
  const effect = best.summary.mean - summarise(rest).mean;
  if (effect < 0.3) return [];

  return [
    {
      id: `band-${metric}-${best.label}`,
      title: `${best.label} sessions`,
      body: `Sessions using ${best.label} modulation are associated with your highest self-reported ${metric} scores — an average of ${best.summary.mean.toFixed(1)} across ${best.summary.n} sessions, against ${summarise(rest).mean.toFixed(1)} for everything else.`,
      metric,
      sampleSize: best.summary.n,
      confidence: confidenceFor(best.summary.n, test.p),
      effect,
      nextStep:
        best.summary.n < 12
          ? 'Run a blinded A/B experiment against your next-best band to see whether this holds up.'
          : undefined,
    },
  ];
}

function durationInsight(sessions: readonly Session[], metric: MetricKey): Insight | undefined {
  const points = sessions
    .map((session) => ({
      minutes: session.metrics.playedSec / 60,
      value: ratingOf(session, metric),
    }))
    .filter((point): point is { minutes: number; value: number } => point.value !== undefined);
  if (points.length < MIN_SESSIONS_FOR_INSIGHTS) return undefined;

  const r = correlation(
    points.map((point) => point.minutes),
    points.map((point) => point.value),
  );
  if (Math.abs(r) < 0.3) return undefined;

  const threshold = 25;
  const longer = points.filter((point) => point.minutes >= threshold).map((point) => point.value);
  const shorter = points.filter((point) => point.minutes < threshold).map((point) => point.value);
  if (longer.length < MIN_GROUP || shorter.length < MIN_GROUP) return undefined;

  const difference = summarise(longer).mean - summarise(shorter).mean;
  const test = welchTTest(longer, shorter);
  const direction = difference > 0 ? 'higher' : 'lower';
  return {
    id: `duration-${metric}`,
    title: difference > 0 ? 'Longer sessions' : 'Shorter sessions',
    body: `Sessions longer than ${threshold} minutes have received ${direction} ${metric} ratings in your history — ${summarise(longer).mean.toFixed(1)} across ${longer.length} sessions, against ${summarise(shorter).mean.toFixed(1)} across ${shorter.length} shorter ones.`,
    metric,
    sampleSize: points.length,
    confidence: confidenceFor(points.length, test.p),
    effect: difference,
  };
}

function noiseInsight(sessions: readonly Session[], metric: MetricKey): Insight | undefined {
  const withNoise: number[] = [];
  const withoutNoise: number[] = [];
  for (const session of sessions) {
    const value = ratingOf(session, metric);
    if (value === undefined) continue;
    const noise = noiseFromDna(session.humanDna);
    if (noise && noise.percent > 0) withNoise.push(value);
    else withoutNoise.push(value);
  }
  if (withNoise.length < MIN_GROUP || withoutNoise.length < MIN_GROUP) return undefined;

  const difference = summarise(withNoise).mean - summarise(withoutNoise).mean;
  if (Math.abs(difference) < 0.3) return undefined;
  const test = welchTTest(withNoise, withoutNoise);
  const better = difference > 0 ? 'with a noise layer' : 'without a noise layer';
  return {
    id: `noise-${metric}`,
    title: difference > 0 ? 'Noise layer' : 'No noise layer',
    body: `Your sessions ${better} have scored higher on ${metric} — ${Math.abs(difference).toFixed(1)} points on average across ${withNoise.length + withoutNoise.length} sessions. Your history suggests this may perform better for you.`,
    metric,
    sampleSize: withNoise.length + withoutNoise.length,
    confidence: confidenceFor(withNoise.length + withoutNoise.length, test.p),
    effect: difference,
  };
}

function timeOfDayInsight(sessions: readonly Session[], metric: MetricKey): Insight | undefined {
  const morning: number[] = [];
  const evening: number[] = [];
  for (const session of sessions) {
    const value = ratingOf(session, metric);
    if (value === undefined) continue;
    const hour = new Date(session.startedAt).getHours();
    if (hour < 12) morning.push(value);
    else if (hour >= 17) evening.push(value);
  }
  if (morning.length < MIN_GROUP || evening.length < MIN_GROUP) return undefined;

  const difference = summarise(morning).mean - summarise(evening).mean;
  if (Math.abs(difference) < 0.5) return undefined;
  const test = welchTTest(morning, evening);
  const better = difference > 0 ? 'morning' : 'evening';
  return {
    id: `time-${metric}`,
    title: `${better === 'morning' ? 'Morning' : 'Evening'} sessions`,
    body: `Your ${better} sessions are associated with higher ${metric} ratings — ${Math.abs(difference).toFixed(1)} points on average. Time of day is easy to confound with everything else about a day, so treat this as a hint rather than a finding.`,
    metric,
    sampleSize: morning.length + evening.length,
    confidence: confidenceFor(morning.length + evening.length, test.p),
    effect: difference,
  };
}

function trendInsight(sessions: readonly Session[], metric: MetricKey): Insight | undefined {
  const ordered = [...sessions].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const values = ordered
    .map((session) => ratingOf(session, metric))
    .filter((value): value is number => value !== undefined);
  if (values.length < 10) return undefined;

  const trend = linearTrend(
    values.map((_, index) => index),
    values,
  );
  const total = trend.slope * (values.length - 1);
  if (Math.abs(total) < 0.8 || trend.r2 < 0.2) return undefined;

  return {
    id: `trend-${metric}`,
    title: total > 0 ? 'Ratings drifting up' : 'Ratings drifting down',
    body: `Across your last ${values.length} rated sessions, ${metric} has drifted ${total > 0 ? 'up' : 'down'} by about ${Math.abs(total).toFixed(1)} points. A drift like this can come from the protocols you chose, from getting used to the format, or from what else was happening those weeks.`,
    metric,
    sampleSize: values.length,
    confidence: values.length >= 20 && trend.r2 > 0.4 ? 'moderate' : 'preliminary',
    effect: total,
  };
}
