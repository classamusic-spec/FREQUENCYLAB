import { validateProtocol } from '../protocol/validate.js';
import { totalDurationSec, type Protocol } from '../protocol/schema.js';
import type { StimulationEngine } from '../protocol/builders.js';

/**
 * Audio safety.
 *
 * Safety is not a screen — it is a set of rules the engine and the UI both
 * consult before and during playback (§28). Nothing in here is advisory-only:
 * every check has a matching behaviour in the session controller.
 */

export type OutputRouteKind = 'headphones' | 'bluetooth' | 'speaker' | 'unknown';

export interface OutputRoute {
  kind: OutputRouteKind;
  name?: string;
  /** True when the platform reports the route with confidence. */
  reliable: boolean;
}

export type SafetyCheckLevel = 'blocker' | 'warning' | 'info';

export interface SafetyCheck {
  id: string;
  level: SafetyCheckLevel;
  title: string;
  message: string;
  /** Copy for the button that resolves the check, when one exists. */
  actionLabel?: string;
}

export const AMBIENT_AWARENESS_NOTICE =
  'Do not run an immersive session while driving, cycling in traffic, operating machinery, or anywhere you need to hear what is around you.';

export const NOT_MEDICAL_NOTICE =
  'FREQUENCY LAB is an instrument for personal experimentation. It does not diagnose, treat, cure or prevent any condition, and it is not a substitute for medical care.';

export const VOLUME_GUIDANCE =
  'Set the volume so that a normal speaking voice next to you would still be audible. The app will never raise your device volume for you.';

/** The engines that genuinely need two independent channels to work. */
export function requiresStereoSeparation(engine: StimulationEngine): boolean {
  return engine === 'binaural';
}

export interface PreflightInput {
  protocol: Protocol;
  route: OutputRoute;
  /** Whether the protocol contains a binaural engine anywhere. */
  usesBinaural: boolean;
  /** The user's chosen comfortable level from calibration, 0..1. */
  comfortableOutputLevel: number;
  /** True the first time this user has ever started a session. */
  firstSession: boolean;
}

/**
 * Runs before playback starts. Returns everything the start screen should say,
 * in priority order. A `blocker` stops the session; a `warning` requires an
 * explicit acknowledgement; `info` is shown but does not interrupt.
 */
export function preflight(input: PreflightInput): SafetyCheck[] {
  const checks: SafetyCheck[] = [];
  const validation = validateProtocol(input.protocol);

  for (const issue of validation.issues) {
    if (issue.severity !== 'error') continue;
    checks.push({
      id: `protocol-${issue.code}`,
      level: 'blocker',
      title: 'This protocol cannot run',
      message: issue.message,
    });
  }

  if (input.usesBinaural && input.route.reliable && input.route.kind === 'speaker') {
    checks.push({
      id: 'headphones-required',
      level: 'warning',
      title: 'Headphones recommended',
      message:
        'Binaural separation requires independent left and right channels. Through a speaker the two tones mix in the air before they reach you, and what you hear is an ordinary acoustic beat instead. Switch to the monaural or isochronic engine if you would rather use a speaker.',
      actionLabel: 'Use monaural instead',
    });
  }

  if (input.usesBinaural && !input.route.reliable) {
    checks.push({
      id: 'headphones-unverified',
      level: 'info',
      title: 'Check your output',
      message:
        'This device does not report its audio route reliably. If you are on a speaker, the binaural effect will not be present.',
    });
  }

  if (input.route.kind === 'bluetooth') {
    checks.push({
      id: 'bluetooth-route',
      level: 'info',
      title: 'Bluetooth output',
      message:
        'Some Bluetooth codecs apply processing that can soften a beat slightly. A wired connection is the most faithful to the configuration shown here.',
    });
  }

  const master = input.protocol.master;
  if (master.gain > input.comfortableOutputLevel + 0.2) {
    checks.push({
      id: 'louder-than-calibration',
      level: 'warning',
      title: 'Louder than your usual level',
      message: `This protocol's master gain is higher than the level you chose during calibration. ${VOLUME_GUIDANCE}`,
      actionLabel: 'Use my level',
    });
  }

  for (const issue of validation.issues) {
    if (issue.severity !== 'warning') continue;
    if (issue.code === 'isochronic-hard-edges' || issue.code === 'am-hard-gate') {
      checks.push({
        id: `intensity-${issue.code}`,
        level: 'warning',
        title: 'Unusually harsh configuration',
        message: `${issue.message} You can continue, but it will sound abrasive over a long session.`,
      });
    }
  }

  const duration = totalDurationSec(input.protocol);
  if (duration > 90 * 60) {
    checks.push({
      id: 'long-session',
      level: 'info',
      title: 'Long session',
      message:
        'Hearing exposure accumulates with time as well as level. For a session over ninety minutes, keep the volume lower than you would for a short one.',
    });
  }

  if (input.firstSession) {
    checks.push({
      id: 'first-session',
      level: 'info',
      title: 'Before you start',
      message: `${AMBIENT_AWARENESS_NOTICE} ${NOT_MEDICAL_NOTICE}`,
    });
  }

  return checks.sort((a, b) => severityRank(a.level) - severityRank(b.level));
}

function severityRank(level: SafetyCheckLevel): number {
  return level === 'blocker' ? 0 : level === 'warning' ? 1 : 2;
}

export function hasBlocker(checks: readonly SafetyCheck[]): boolean {
  return checks.some((check) => check.level === 'blocker');
}

export type RouteChangeAction = 'continue' | 'pauseAndNotify' | 'duckAndNotify';

/**
 * What to do when the output route changes mid-session.
 *
 * The rule that matters: an unexpected disconnect must never dump an immersive
 * tone into a room at the volume the user chose for headphones (§57). Losing a
 * device pauses; gaining one is fine.
 */
export function routeChangeAction(
  previous: OutputRoute,
  next: OutputRoute,
  usesBinaural: boolean,
): { action: RouteChangeAction; message?: string } {
  const lostPrivateRoute =
    (previous.kind === 'headphones' || previous.kind === 'bluetooth') && next.kind === 'speaker';

  if (lostPrivateRoute) {
    return {
      action: 'pauseAndNotify',
      message:
        'Your headphones disconnected, so the session paused rather than switching to the speaker. Reconnect and press play to continue from where you were.',
    };
  }

  if (usesBinaural && next.kind === 'speaker' && next.reliable) {
    return {
      action: 'duckAndNotify',
      message:
        'Output moved to a speaker. The binaural effect needs separate channels for each ear, so it is no longer present.',
    };
  }

  return { action: 'continue' };
}

export interface InterruptionPolicy {
  /** Whether to resume automatically once the interruption ends. */
  autoResume: boolean;
  /** Seconds to fade back in on resume. */
  resumeFadeSec: number;
}

export const DEFAULT_INTERRUPTION_POLICY: InterruptionPolicy = {
  autoResume: true,
  resumeFadeSec: 2.5,
};

/**
 * Recommended master gain for a protocol given the user's calibrated comfort
 * level. Never returns more than the calibrated level: the app lowers, it does
 * not raise.
 */
export function recommendedMasterGain(protocol: Protocol, comfortableOutputLevel: number): number {
  return Math.min(protocol.master.gain, Math.max(0.05, comfortableOutputLevel));
}
