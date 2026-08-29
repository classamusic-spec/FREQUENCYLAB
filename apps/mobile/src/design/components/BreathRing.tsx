import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { MIN_TOUCH_TARGET, colors, radius, space } from '../tokens';
import { useReducedMotion } from '../useReducedMotion';
import * as haptics from '../haptics';
import { InstrumentPanel } from './InstrumentPanel';
import { Recessed } from './Surface';
import { Label, Text } from './Text';

/**
 * Breath pacing — a visual metronome for the breath.
 *
 * ## What this is, and the line it does not cross
 *
 * It is a shape that grows, holds and shrinks on a count. That is the entire
 * claim. Paced breathing is one of the few things in this product's
 * neighbourhood where the *rate* is uncontroversial and widely documented —
 * people have been counting breaths for a very long time, and 5.5 to 6 breaths
 * a minute is a rate that appears everywhere in that literature. What is not
 * uncontroversial is what it does, so nothing here says. The patterns are named
 * by their counts, the captions state their arithmetic, and the panel says in
 * as many words that the app is not claiming an outcome.
 *
 * The second thing it refuses to do is imply a relationship with the session.
 * A breath count and a binaural beat rate are unrelated quantities: nothing
 * about breathing at ten seconds a cycle interacts with a 7.83 Hz difference
 * between two tones, and an interface that derived one from the other — a
 * "match the session" button, a ring drawn concentric with the beat dial —
 * would be asserting an interaction by layout rather than by sentence, which is
 * the harder kind to notice and the harder kind to defend. So the count is
 * picked by the user, the guide lives in its own panel well away from the
 * session dial, and the panel says the two do not interact.
 *
 * It is off until someone turns it on, and one tap turns it off again. Nobody
 * who opened this app for a sound bath is made to breathe on command.
 *
 * ## The clock
 *
 * Driven by the session clock — `SessionRenderer.positionSec`, which is
 * `renderedSamples / sampleRate` and therefore exact. The phase is a modulo of
 * that value recomputed from scratch on every frame, never an accumulator, so
 * there is nothing for an error to accumulate *in*: after thirty minutes the
 * ring is at the same point in its cycle it would have been at after one
 * minute, to the sample. It also means the guide pauses when the session pauses
 * and stops when the audio stops, which is the behaviour a listener expects
 * from something drawn on the session screen.
 *
 * The clock advances one audio buffer at a time — 2048 frames, about 43 ms —
 * so the ring moves in steps rather than continuously. At the travel this ring
 * uses that is well under a point per step, which is why no interpolation
 * filter sits between the clock and the geometry: it would add a second clock
 * to disagree with the first, in exchange for smoothing something already
 * below the threshold of sight.
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

const PHASE_WORD: Record<BreathPhase, string> = {
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

/**
 * The live cycle position, sampled from the session clock.
 *
 * The anchor is the session time the cycle counts from, and it is deliberately
 * outlives the frame loop. Three things set it:
 *
 *  - choosing a pattern, so one picked twenty minutes into a session starts at
 *    the top of an in-breath rather than halfway through an out-breath;
 *  - the clock going backwards, which is a new session under an old anchor;
 *  - nothing else. In particular *not* a pause, because the session clock stops
 *    while a session is paused: keeping the anchor is what makes the ring pick
 *    the breath up exactly where it left it rather than jumping to full empty
 *    the moment somebody presses resume.
 *
 * Under reduced motion there is no frame loop at all. The ring does not move,
 * so the only thing left to update is the written count, and a quarter-second
 * heartbeat is more than enough resolution for a number that changes once a
 * second (§34 — reduced motion removes movement, it does not shorten it).
 */
function useBreathState(
  pattern: BreathPattern,
  clockSec: () => number,
  running: boolean,
  reducedMotion: boolean,
): BreathState {
  const [state, setState] = useState<BreathState>(() => breathAt(pattern, 0));
  const anchor = useRef<{ patternId: string; atSec: number } | null>(null);

  useEffect(() => {
    if (!running) return;

    const sample = () => {
      const now = clockSec();
      const held = anchor.current;
      let from = held?.atSec ?? now;
      if (!held || held.patternId !== pattern.id || now < held.atSec) {
        from = now;
        anchor.current = { patternId: pattern.id, atSec: now };
      }
      const next = breathAt(pattern, now - from);
      // The clock moves one audio buffer at a time and the screen redraws far
      // more often than that, so most frames have nothing to say. Returning the
      // previous object on those frames is what keeps a 60 Hz loop from costing
      // 60 renders a second.
      setState((current) =>
        current.phase === next.phase &&
        current.countdown === next.countdown &&
        Math.abs(current.fullness - next.fullness) < 0.0005
          ? current
          : next,
      );
    };

    sample();

    if (reducedMotion) {
      const interval = setInterval(sample, 250);
      return () => clearInterval(interval);
    }

    let frame = requestAnimationFrame(function step() {
      sample();
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [clockSec, pattern, reducedMotion, running]);

  return state;
}

// ---------------------------------------------------------------------------
// The ring
// ---------------------------------------------------------------------------

/**
 * What the session is doing, which is what the guide can do.
 *
 * `paused` and `idle` both stop the clock, and they are still two different
 * things to say: one is a session waiting to be resumed, the other is no
 * session at all. The ring is only drawn for the first.
 */
export type BreathSessionState = 'running' | 'paused' | 'idle';

export interface BreathRingProps {
  pattern: BreathPattern;
  /**
   * Reads the session clock, in seconds. Sampled every frame rather than passed
   * as a value, so the ring follows the renderer's own clock instead of a
   * number that was true whenever the last render happened.
   */
  clockSec: () => number;
  /** Anything but `running` stops the clock, and the ring holds where it is. */
  sessionState: BreathSessionState;
  size?: number;
}

/**
 * The pacing ring, in its milled well.
 *
 * Two scribed circles mark the ends of the travel, so the ring's position means
 * something even in a still frame, and the lit ring rides between them. The
 * illumination is the same three strokes the encoder's ring uses — bloom, core,
 * lit lip — because this is the same instrument, not a second visual language.
 */
export function BreathRing({ pattern, clockSec, sessionState, size = 168 }: BreathRingProps) {
  const reducedMotion = useReducedMotion();
  const running = sessionState === 'running';
  const state = useBreathState(pattern, clockSec, running, reducedMotion);

  const c = size / 2;
  const rMin = c * 0.34;
  const rMax = c * 0.86;
  /*
   * Reduced motion parks the ring at the middle of its travel and leaves it
   * there. A ring that jumped between three radii would still be movement, only
   * worse — so the count below carries the pacing on its own, which is how a
   * person counting out loud would have done it anyway.
   */
  const r = reducedMotion ? (rMin + rMax) / 2 : rMin + (rMax - rMin) * state.fullness;
  const ringColor = running ? colors.signal : '#9AA4B2';

  return (
    <View style={styles.ring} testID="breath-ring">
      <Recessed cornerRadius={c} style={[styles.well, { width: size, height: size }]}>
        <Svg
          width={size}
          height={size}
          accessibilityRole="image"
          accessibilityLabel={`Breath pacing guide: ${pattern.spoken}, repeating.`}
        >
          {/* The ends of the travel, scribed into the floor of the well. */}
          <Circle cx={c} cy={c} r={rMin} fill="none" stroke={colors.engraving} strokeWidth={0.75} />
          <Circle cx={c} cy={c} r={rMax} fill="none" stroke={colors.engraving} strokeWidth={0.75} />
          {/* The turned centre the ring expands from. */}
          <Circle cx={c} cy={c} r={1.6} fill={colors.engraving} />

          {/* The ring: bloom, core, lit lip. */}
          <Circle cx={c} cy={c} r={r} fill="none" stroke={ringColor} strokeWidth={7} opacity={0.2} />
          <Circle cx={c} cy={c} r={r} fill="none" stroke={ringColor} strokeWidth={2.8} opacity={0.92} />
          <Circle cx={c} cy={c} r={r} fill="none" stroke="#FFFFFF" strokeWidth={1} opacity={0.45} />
        </Svg>
      </Recessed>

      <View style={styles.count}>
        <Label tone={running ? 'signal' : 'tertiary'} style={styles.phase}>
          {running ? PHASE_WORD[state.phase] : 'Paused'}
        </Label>
        <Text variant="readoutLg" tone={running ? 'primary' : 'tertiary'}>
          {running ? state.countdown : '—'}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

export interface BreathPacingPanelProps {
  /** The chosen pattern, or undefined for off — which is the default. */
  pattern?: BreathPattern;
  /** `undefined` turns pacing off. */
  onChange: (pattern: BreathPattern | undefined) => void;
  clockSec: () => number;
  sessionState: BreathSessionState;
  style?: ViewStyle;
}

/**
 * The control, on the same shape as the sleep timer next to it: a row of stops
 * and a way back out, every one of them a full-height target reachable with the
 * lights off. Off is a stop like any other, and it is where this starts.
 */
export function BreathPacingPanel({
  pattern,
  onChange,
  clockSec,
  sessionState,
  style,
}: BreathPacingPanelProps) {
  const reducedMotion = useReducedMotion();

  return (
    <InstrumentPanel
      tone="raised"
      label="Breath pacing"
      headerRight={
        pattern ? <Label tone="signal">{pattern.label}</Label> : <Label tone="tertiary">Off</Label>
      }
      style={style}
    >
      <Text variant="bodySm" tone="secondary">
        A ring that grows, holds and shrinks on a count you choose, to breathe along with if you
        want to. It is a metronome for the eyes and nothing more: it changes no sound, and this app
        makes no claim about what breathing at any particular count does.
      </Text>

      {pattern && sessionState === 'idle' ? (
        <Text variant="caption" tone="tertiary" style={styles.idle}>
          The guide runs while a session is playing.
        </Text>
      ) : null}

      {pattern && sessionState !== 'idle' ? (
        <View style={styles.stage}>
          <BreathRing pattern={pattern} clockSec={clockSec} sessionState={sessionState} />
          {/* First, because it is the answer to "why is nothing moving?". */}
          {reducedMotion ? (
            <Text variant="caption" tone="tertiary" style={styles.caption}>
              Reduced motion is on, so the ring holds still and the count is written out instead.
            </Text>
          ) : null}
          <Text variant="caption" tone="secondary" style={styles.caption}>
            {describePattern(pattern)}
          </Text>
          <Text variant="caption" tone="tertiary" style={styles.caption}>
            If you feel light-headed, stop pacing and breathe normally.
          </Text>
        </View>
      ) : null}

      <View style={styles.stops}>
        {BREATH_PATTERNS.map((candidate) => (
          <Stop
            key={candidate.id}
            label={candidate.label}
            selected={pattern?.id === candidate.id}
            accessibilityLabel={`Breath pacing, ${candidate.spoken}`}
            onPress={() => onChange(candidate)}
          />
        ))}
      </View>

      <Stop
        label="Off"
        selected={pattern === undefined}
        wide
        accessibilityLabel="Breath pacing off"
        onPress={() => onChange(undefined)}
      />

      <Text variant="caption" tone="tertiary" style={styles.footnote}>
        The count is yours to pick. It is not taken from the session&apos;s beat rate and the two do
        not interact — they are two separate things running at the same time.
      </Text>
    </InstrumentPanel>
  );
}

/**
 * One stop on the scale.
 *
 * Selection is carried by the cap standing proud of its well and by the weight
 * of the type, not by colour alone (§50). Sized by real padding rather than
 * `hitSlop`, which React Native Web ignores.
 */
function Stop({
  label,
  selected,
  wide,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  selected: boolean;
  wide?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={() => {
        haptics.engage();
        onPress();
      }}
      style={[
        styles.stop,
        wide ? styles.stopWide : styles.stopFlex,
        selected ? styles.stopSelected : null,
      ]}
    >
      <Text
        variant={wide ? 'labelLg' : 'readoutSm'}
        uppercase={wide}
        tone={selected ? 'signal' : 'secondary'}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', marginTop: space.lg, gap: space.sm },
  ring: { alignItems: 'center', gap: space.sm },
  well: { alignItems: 'center', justifyContent: 'center' },
  count: { alignItems: 'center', gap: space.xxs },
  phase: { letterSpacing: 2 },
  caption: { textAlign: 'center' },

  idle: { marginTop: space.sm },

  /*
   * Two across rather than four.
   *
   * `5.5·5.5` is a wide label for a quarter of a phone, and at the 1.6× Dynamic
   * Type ceiling this component is built to honour it stops fitting somewhere
   * around 1.4×. Two columns give it more than three times the room it needs at
   * the largest type the app allows, which is the difference between a layout
   * that reflows and one that truncates a number (§50).
   */
  stops: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg },
  stop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceRecessed,
    // Carried unselected too, in the chassis colour: a stop must not change
    // height when it is chosen.
    borderTopWidth: 1,
    borderTopColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  stopFlex: { flexBasis: '47%', flexGrow: 1 },
  stopWide: { marginTop: space.sm },
  stopSelected: {
    backgroundColor: colors.surfaceRaised,
    borderTopColor: colors.signal,
    borderBottomColor: 'rgba(59,139,245,0.4)',
    shadowColor: '#33486A',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },

  footnote: { marginTop: space.md },
});
