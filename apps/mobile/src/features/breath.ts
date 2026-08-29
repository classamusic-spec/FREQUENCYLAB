/**
 * The breath cycle, as arithmetic.
 *
 * Extracted from `BreathRing.tsx` for one reason: the component imports React
 * Native and `react-native-svg`, so anything living beside it is unreachable
 * from the app's Node test runner. The timing claim this module makes — that a
 * cycle cannot drift, because the phase is a modulo of the session clock rather
 * than an accumulator — is worth asserting in a test rather than in prose, and
 * that requires the claim to live somewhere a test can import.
 *
 * Nothing here knows about drawing. The component owns the geometry, the frame
 * loop and the copy; this file owns the counts.
 *
 * The line the whole feature holds is documented on `BreathRing` itself: the
 * patterns are named by their counts, the captions state their arithmetic, and
 * nothing anywhere states an outcome.
 */

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

export interface BreathPattern {
  id: string;
  /** Seconds breathing in. */
  inhaleSec: number;
  /** Seconds held full. Zero for the patterns without a hold. */
  holdFullSec: number;
  /** Seconds breathing out. */
  exhaleSec: number;
  /** Seconds held empty. */
  holdEmptySec: number;
  /** The name, which is the counts. Nothing else is a name here. */
  label: string;
  /** The counts said aloud, for a screen reader that would read `·` as "dot". */
  spoken: string;
  /** The counts written out. Arithmetic only. */
  note: string;
  /**
   * One further fact, where there is one worth stating.
   *
   * A fact about the pattern or about what people call it — never about what it
   * is supposed to do to the person breathing it.
   */
  aside?: string;
}

/**
 * The patterns offered.
 *
 * Four, because a longer list is a menu rather than a choice, and each is one
 * a person could have been taught by somebody counting out loud. They differ in
 * exactly two ways a user can feel: how long a cycle takes, and whether the
 * exhale is longer than the inhale. Neither difference is given a meaning.
 */
export const BREATH_PATTERNS: readonly BreathPattern[] = [
  {
    id: '4-4',
    inhaleSec: 4,
    holdFullSec: 0,
    exhaleSec: 4,
    holdEmptySec: 0,
    label: '4·4',
    spoken: 'four in, four out',
    note: 'Four seconds in, four seconds out.',
  },
  {
    id: '4-6',
    inhaleSec: 4,
    holdFullSec: 0,
    exhaleSec: 6,
    holdEmptySec: 0,
    label: '4·6',
    spoken: 'four in, six out',
    note: 'Four seconds in, six seconds out — the out-breath longer than the in-breath.',
  },
  {
    id: '5.5-5.5',
    inhaleSec: 5.5,
    holdFullSec: 0,
    exhaleSec: 5.5,
    holdEmptySec: 0,
    label: '5.5·5.5',
    spoken: 'five and a half in, five and a half out',
    note: 'Five and a half seconds each way.',
    aside: 'A commonly used slow-breathing rate.',
  },
  {
    id: '4-4-4-4',
    inhaleSec: 4,
    holdFullSec: 4,
    exhaleSec: 4,
    holdEmptySec: 4,
    label: '4·4·4·4',
    spoken: 'four in, hold four, four out, hold four',
    note: 'Four in, hold four, four out, hold four.',
    aside: 'Often called box breathing.',
  },
];

export function breathPatternById(id: string | undefined): BreathPattern | undefined {
  if (!id) return undefined;
  return BREATH_PATTERNS.find((pattern) => pattern.id === id);
}

/** One full cycle, in seconds. */
export function cycleSec(pattern: BreathPattern): number {
  return pattern.inhaleSec + pattern.holdFullSec + pattern.exhaleSec + pattern.holdEmptySec;
}

/** Cycles per minute, which for a breath pattern is breaths per minute. */
export function breathsPerMinute(pattern: BreathPattern): number {
  return 60 / cycleSec(pattern);
}

/** `5.4545…` → `5.45`, `6` → `6`. Two decimals, trailing zeros trimmed. */
function formatRate(value: number): string {
  return String(Number(value.toFixed(2)));
}

/**
 * The line under the ring: the counts, the rate they work out at, and the one
 * further fact if there is one. Every clause is arithmetic or usage; no clause
 * is an outcome.
 */
export function describePattern(pattern: BreathPattern): string {
  const rate = `${formatRate(breathsPerMinute(pattern))} breaths a minute.`;
  return [pattern.note, rate, pattern.aside].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// The cycle
// ---------------------------------------------------------------------------

export type BreathPhase = 'in' | 'holdFull' | 'out' | 'holdEmpty';

export interface BreathState {
  phase: BreathPhase;
  /** How full the breath is: 0 empty, 1 full. Drives the radius. */
  fullness: number;
  /** Whole seconds left in this phase, counting down to 1. */
  countdown: number;
}

export const PHASE_WORD: Record<BreathPhase, string> = {
  in: 'In',
  holdFull: 'Hold',
  out: 'Out',
  holdEmpty: 'Hold',
};

/**
 * A raised cosine, the same shape the engine's fades use.
 *
 * Zero slope at both ends, so the ring arrives at the turn rather than hitting
 * it. A linear ramp is a metronome that ticks; this is one that swings.
 */
function raisedCosine(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  return 0.5 - 0.5 * Math.cos(Math.PI * p);
}

/**
 * Where in the cycle `seconds` lands.
 *
 * Pure, and computed by modulo rather than by advancing a counter, which is the
 * whole of the anti-drift argument: no state carries between calls, so no error
 * can survive one.
 */
export function breathAt(pattern: BreathPattern, seconds: number): BreathState {
  const cycle = cycleSec(pattern);
  // A modulo that behaves for negative input, which is what a session restart
  // under a live anchor looks like for one frame.
  const u = ((seconds % cycle) + cycle) % cycle;

  const inEnd = pattern.inhaleSec;
  const holdFullEnd = inEnd + pattern.holdFullSec;
  const outEnd = holdFullEnd + pattern.exhaleSec;

  if (u < inEnd) {
    return {
      phase: 'in',
      fullness: raisedCosine(u / pattern.inhaleSec),
      countdown: remaining(pattern.inhaleSec - u),
    };
  }
  if (u < holdFullEnd) {
    return { phase: 'holdFull', fullness: 1, countdown: remaining(holdFullEnd - u) };
  }
  if (u < outEnd) {
    return {
      phase: 'out',
      fullness: 1 - raisedCosine((u - holdFullEnd) / pattern.exhaleSec),
      countdown: remaining(outEnd - u),
    };
  }
  return { phase: 'holdEmpty', fullness: 0, countdown: remaining(cycle - u) };
}

function remaining(seconds: number): number {
  return Math.max(1, Math.ceil(seconds - 1e-6));
}
