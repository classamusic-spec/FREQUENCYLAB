import { Rng } from '../math/rng.js';
import { sha256Hex } from '../protocol/sha256.js';
import type {
  Experiment,
  ExperimentArm,
  ExperimentAssignment,
  MetricKey,
  Session,
} from '../domain/models.js';
import {
  bootstrapDifferenceCi,
  cohensD,
  summarise,
  welchTTest,
  type ConfidenceInterval,
  type Summary,
} from './stats.js';

/**
 * Blinded N-of-1 experiments.
 *
 * The assignment schedule is generated once, up front, from a seeded block
 * randomisation and then *committed to*: each entry stores a SHA-256 of
 * `experimentId:index:arm:salt`. The commitment is what makes the reveal
 * trustworthy — an assignment that was changed after the sessions ran would no
 * longer verify, so a result cannot be quietly rewritten to suit the outcome
 * (§17).
 */

export interface CreateExperimentOptions {
  id: string;
  name: string;
  hypothesis?: string;
  protocolA: string;
  protocolB: string;
  protocolControl?: string;
  metrics: MetricKey[];
  sessionsPerArm: number;
  blinded?: boolean;
  /** Supplied by the caller so tests and the app can both be deterministic. */
  salt: string;
  createdAt: string;
}

export function createExperiment(options: CreateExperimentOptions): Experiment {
  const arms: ExperimentArm[] = options.protocolControl ? ['A', 'B', 'control'] : ['A', 'B'];
  const assignments = buildSchedule(options.id, options.salt, arms, options.sessionsPerArm);
  return {
    id: options.id,
    name: options.name,
    hypothesis: options.hypothesis,
    status: 'running',
    createdAt: options.createdAt,
    updatedAt: options.createdAt,
    protocolA: options.protocolA,
    protocolB: options.protocolB,
    protocolControl: options.protocolControl,
    metrics: options.metrics,
    sessionsPerArm: options.sessionsPerArm,
    blinded: options.blinded !== false,
    salt: options.salt,
    assignments,
  };
}

/**
 * Block randomisation: each block contains one session of every arm in a
 * shuffled order. Simple coin-flipping would let one arm run five times before
 * the other runs once, which confounds the comparison with time of day, mood
 * and everything else that drifts over a week.
 */
export function buildSchedule(
  experimentId: string,
  salt: string,
  arms: readonly ExperimentArm[],
  sessionsPerArm: number,
): ExperimentAssignment[] {
  const rng = new Rng(`${experimentId}:${salt}`);
  const assignments: ExperimentAssignment[] = [];
  let index = 0;
  for (let block = 0; block < sessionsPerArm; block++) {
    const shuffled = [...arms];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = rng.nextInt(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (const arm of shuffled) {
      assignments.push({
        index,
        commitment: armCommitment(experimentId, index, arm, salt),
        sealedArm: arm,
      });
      index++;
    }
  }
  return assignments;
}

export function armCommitment(
  experimentId: string,
  index: number,
  arm: ExperimentArm,
  salt: string,
): string {
  return sha256Hex(`${experimentId}:${index}:${arm}:${salt}`);
}

/** Confirms every assignment still matches its commitment. */
export function verifySchedule(experiment: Experiment): boolean {
  return experiment.assignments.every(
    (assignment) =>
      assignment.commitment ===
      armCommitment(experiment.id, assignment.index, assignment.sealedArm, experiment.salt),
  );
}

/** The next assignment to run, or undefined when the schedule is complete. */
export function nextAssignment(experiment: Experiment): ExperimentAssignment | undefined {
  return experiment.assignments.find((assignment) => !assignment.sessionId);
}

/** Protocol id for an arm. */
export function protocolForArm(experiment: Experiment, arm: ExperimentArm): string | undefined {
  if (arm === 'A') return experiment.protocolA;
  if (arm === 'B') return experiment.protocolB;
  return experiment.protocolControl;
}

/**
 * What the UI is allowed to know about the next session while the experiment
 * is blind: the protocol to load, and nothing that names the arm.
 */
export interface BlindSessionPlan {
  index: number;
  protocolId: string;
  /** Present only when the experiment is not blinded, or has been revealed. */
  arm?: ExperimentArm;
  /** Label to display: `Session 4 of 12`. */
  label: string;
}

export function planNextSession(experiment: Experiment): BlindSessionPlan | undefined {
  const assignment = nextAssignment(experiment);
  if (!assignment) return undefined;
  const protocolId = protocolForArm(experiment, assignment.sealedArm);
  if (!protocolId) return undefined;
  const unblinded = !experiment.blinded || experiment.revealedAt !== undefined;
  return {
    index: assignment.index,
    protocolId,
    arm: unblinded ? assignment.sealedArm : undefined,
    label: `Session ${assignment.index + 1} of ${experiment.assignments.length}`,
  };
}

export function recordSession(
  experiment: Experiment,
  assignmentIndex: number,
  sessionId: string,
  completedAt: string,
): Experiment {
  const assignments = experiment.assignments.map((assignment) =>
    assignment.index === assignmentIndex ? { ...assignment, sessionId, completedAt } : assignment,
  );
  const complete = assignments.every((assignment) => assignment.sessionId);
  return {
    ...experiment,
    assignments,
    status: complete ? 'complete' : experiment.status,
    updatedAt: completedAt,
  };
}

export function reveal(experiment: Experiment, at: string): Experiment {
  return { ...experiment, revealedAt: at, updatedAt: at };
}

export interface ArmResult {
  arm: ExperimentArm;
  protocolId: string;
  summary: Summary;
  /** Ratings in the order they were collected, for the trend view. */
  values: number[];
  /** Session start hours (0..23), for the time-of-day distribution. */
  hours: number[];
  meanAdherence: number;
}

export interface ExperimentComparison {
  metric: MetricKey;
  arms: ArmResult[];
  /** A minus B. Positive means A scored higher. */
  difference: number;
  effectSize: number;
  confidenceInterval: ConfidenceInterval;
  p: number;
  /** Honest, non-medical interpretation of the result. */
  interpretation: string;
  /** Reasons the comparison may be misleading (§73). */
  caveats: string[];
}

export interface ExperimentResults {
  experimentId: string;
  totalSessions: number;
  completedSessions: number;
  comparisons: ExperimentComparison[];
  scheduleVerified: boolean;
  revealed: boolean;
}

const MIN_SESSIONS_FOR_STATISTICS = 5;

/**
 * Analyses a finished (or in-progress) experiment.
 *
 * Deliberately conservative: with fewer than five sessions per arm no p-value
 * or interval is offered at all, because at that size any of them would be
 * noise dressed as evidence.
 */
export function analyseExperiment(
  experiment: Experiment,
  sessions: readonly Session[],
): ExperimentResults {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const armSessions = new Map<ExperimentArm, Session[]>();
  let completed = 0;

  for (const assignment of experiment.assignments) {
    if (!assignment.sessionId) continue;
    const session = byId.get(assignment.sessionId);
    if (!session) continue;
    completed++;
    const list = armSessions.get(assignment.sealedArm) ?? [];
    list.push(session);
    armSessions.set(assignment.sealedArm, list);
  }

  const comparisons = experiment.metrics.map((metric) =>
    compareMetric(experiment, metric, armSessions),
  );

  return {
    experimentId: experiment.id,
    totalSessions: experiment.assignments.length,
    completedSessions: completed,
    comparisons,
    scheduleVerified: verifySchedule(experiment),
    revealed: experiment.revealedAt !== undefined,
  };
}

function compareMetric(
  experiment: Experiment,
  metric: MetricKey,
  armSessions: Map<ExperimentArm, Session[]>,
): ExperimentComparison {
  const arms: ArmResult[] = [];
  for (const arm of ['A', 'B', 'control'] as ExperimentArm[]) {
    const list = armSessions.get(arm);
    if (!list && arm === 'control') continue;
    const sessions = list ?? [];
    const values = sessions
      .map((session) => session.ratings.find((rating) => rating.metric === metric)?.value)
      .filter((value): value is number => typeof value === 'number');
    arms.push({
      arm,
      protocolId: protocolForArm(experiment, arm) ?? '',
      summary: summarise(values),
      values,
      hours: sessions.map((session) => new Date(session.startedAt).getHours()),
      meanAdherence:
        sessions.length === 0
          ? 0
          : sessions.reduce((sum, session) => sum + session.metrics.adherence, 0) / sessions.length,
    });
  }

  const a = arms.find((entry) => entry.arm === 'A')?.values ?? [];
  const b = arms.find((entry) => entry.arm === 'B')?.values ?? [];
  const enough = a.length >= MIN_SESSIONS_FOR_STATISTICS && b.length >= MIN_SESSIONS_FOR_STATISTICS;
  const difference = summarise(a).mean - summarise(b).mean;

  const caveats = buildCaveats(experiment, arms, a.length, b.length);
  const test = enough ? welchTTest(a, b) : { t: 0, df: 0, p: 1 };
  const interval = enough
    ? bootstrapDifferenceCi(a, b, 0.95, 4000, `${experiment.id}:${metric}`)
    : { low: 0, high: 0, level: 0.95 };

  return {
    metric,
    arms,
    difference,
    effectSize: enough ? cohensD(a, b) : 0,
    confidenceInterval: interval,
    p: test.p,
    interpretation: interpret(difference, enough, interval, a.length, b.length),
    caveats,
  };
}

function interpret(
  difference: number,
  enough: boolean,
  interval: ConfidenceInterval,
  nA: number,
  nB: number,
): string {
  if (nA === 0 || nB === 0) {
    return 'Not enough sessions yet to compare these protocols.';
  }
  if (!enough) {
    return `With ${nA} and ${nB} sessions this is a first impression, not a result. Keep going to ${MIN_SESSIONS_FOR_STATISTICS} per arm before reading anything into the difference.`;
  }
  const crossesZero = interval.low <= 0 && interval.high >= 0;
  const direction = difference > 0 ? 'A' : 'B';
  const magnitude = Math.abs(difference).toFixed(1);
  if (crossesZero) {
    return `In your sessions so far, ${direction} scored ${magnitude} points higher on average, but the 95% interval still includes no difference at all. This is not yet a reliable separation.`;
  }
  return `In your sessions so far, ${direction} scored ${magnitude} points higher on average, and the 95% interval stays on one side of zero. That is an association in your own data — it is not evidence about anyone else, and it is not a medical finding.`;
}

function buildCaveats(
  experiment: Experiment,
  arms: ArmResult[],
  nA: number,
  nB: number,
): string[] {
  const caveats: string[] = [];
  if (nA < MIN_SESSIONS_FOR_STATISTICS || nB < MIN_SESSIONS_FOR_STATISTICS) {
    caveats.push(`Fewer than ${MIN_SESSIONS_FOR_STATISTICS} sessions in at least one arm.`);
  }
  if (!experiment.blinded) {
    caveats.push('This experiment was not blinded, so expectation could have influenced ratings.');
  }
  if (experiment.revealedAt) {
    const revealedTime = new Date(experiment.revealedAt).getTime();
    const afterReveal = arms.some((arm) => arm.values.length > 0 && revealedTime < Date.now());
    if (afterReveal) {
      caveats.push('Ratings collected after the reveal are no longer blind.');
    }
  }

  const hoursA = arms.find((arm) => arm.arm === 'A')?.hours ?? [];
  const hoursB = arms.find((arm) => arm.arm === 'B')?.hours ?? [];
  if (hoursA.length > 2 && hoursB.length > 2) {
    const meanA = hoursA.reduce((sum, hour) => sum + hour, 0) / hoursA.length;
    const meanB = hoursB.reduce((sum, hour) => sum + hour, 0) / hoursB.length;
    if (Math.abs(meanA - meanB) > 2) {
      caveats.push(
        `The arms ran at different times of day on average (${meanA.toFixed(1)}:00 vs ${meanB.toFixed(1)}:00). Time of day could explain part of the difference.`,
      );
    }
  }

  const adherenceA = arms.find((arm) => arm.arm === 'A')?.meanAdherence ?? 1;
  const adherenceB = arms.find((arm) => arm.arm === 'B')?.meanAdherence ?? 1;
  if (Math.abs(adherenceA - adherenceB) > 0.15) {
    caveats.push('One arm was completed noticeably more often than the other.');
  }

  const spreadA = arms.find((arm) => arm.arm === 'A')?.summary.sd ?? 0;
  const spreadB = arms.find((arm) => arm.arm === 'B')?.summary.sd ?? 0;
  if (Math.max(spreadA, spreadB) > 2.5) {
    caveats.push('Your ratings varied widely within at least one arm.');
  }

  return caveats;
}
