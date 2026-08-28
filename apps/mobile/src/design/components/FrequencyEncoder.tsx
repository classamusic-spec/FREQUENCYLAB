import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { KnobFace } from './KnobFace';
import {
  DEFAULT_REFERENCE_HZ,
  clamp,
  formatCents,
  formatNote,
  frequencyToNote,
  nearestNoteFrequency,
  spellNote,
} from '@frequencylab/dsp-core';
import { colors, radius, space } from '../tokens';
import * as haptics from '../haptics';
import { Label, Text } from './Text';

/**
 * The signature control (§69).
 *
 * Gestures, in the order they are resolved:
 *  - a drag that begins on the ring tracks the angle directly, so the knob
 *    turns under the finger the way a physical encoder does;
 *  - a drag that begins on the cap moves vertically, with horizontal distance
 *    from the start scaling sensitivity — sliding away from the knob gives
 *    fine adjustment without a mode;
 *  - tap opens numeric entry, which is also the accessible path (§50);
 *  - long press resets to the default.
 *
 * Haptic detents fire on step boundaries and are rate limited in `haptics.ts`,
 * so a fast sweep produces a texture rather than a buzz.
 *
 * When the value is a pitch — a carrier, a fundamental — `showNote` adds the
 * nearest note underneath the figure, and `snapToNote` turns the step detent
 * into a note detent. Both are opt-in because most frequencies in this app are
 * not pitches at all: a 7.83 Hz beat or a 0.5 Hz movement rate has no note, and
 * printing one beside it would be an invented fact rather than a translation.
 */

export type EncoderTaper = 'linear' | 'log';

export interface FrequencyEncoderProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Called once when the gesture ends, for committing to storage. */
  onCommit?: (value: number) => void;
  label: string;
  unit?: string;
  /** Decimal places in the readout. */
  precision?: number;
  /** Integer digits, zero padded — `007.830`. */
  integerDigits?: number;
  taper?: EncoderTaper;
  /** Value granularity for detents and quantisation. */
  step?: number;
  size?: number;
  disabled?: boolean;
  locked?: boolean;
  onToggleLock?: () => void;
  defaultValue?: number;
  /** Secondary caption under the value — usually the band name. */
  caption?: string;
  /**
   * Names the nearest 12-TET note under the figure. Set this only where the
   * value really is an audible pitch.
   */
  showNote?: boolean;
  /** Frequency of A4 the note names are read against. */
  referenceHz?: number;
  /** Makes the detent land on note frequencies instead of `step`. */
  snapToNote?: boolean;
  /** Shows the snap toggle. Omit and snapping cannot be turned off from here. */
  onToggleSnapToNote?: () => void;
  onRequestNumericEntry?: () => void;
  style?: ViewStyle;
  testID?: string;
}

const START_ANGLE = -225;
const SWEEP = 270;

export function FrequencyEncoder({
  value,
  min,
  max,
  onChange,
  onCommit,
  label,
  unit = 'Hz',
  precision = 3,
  integerDigits = 3,
  taper = 'log',
  step,
  size = 236,
  disabled,
  locked,
  onToggleLock,
  defaultValue,
  caption,
  showNote,
  referenceHz = DEFAULT_REFERENCE_HZ,
  snapToNote,
  onToggleSnapToNote,
  onRequestNumericEntry,
  style,
  testID,
}: FrequencyEncoderProps) {
  const [dragging, setDragging] = useState(false);
  const startNormalised = useRef(0);
  const lastDetentIndex = useRef(0);
  const lastAngle = useRef(0);
  /**
   * True when the gesture began on the ring rather than on the knob cap.
   * A shared value, not a ref: the gesture callbacks are worklets running on
   * the UI thread, where a JavaScript ref is not reachable.
   */
  const circularMode = useSharedValue(false);

  const normalised = toNormalised(value, min, max, taper);
  const effectiveStep = step ?? defaultStep(min, max, precision);

  /**
   * Turns a position along the dial into the value it commits.
   *
   * Snapping replaces the `step` grid with the 12-TET grid — the same
   * substitution a hardware encoder makes when its detent ring is swapped, and
   * for the same reason: the detents should sit where the useful values are.
   * The detent index becomes the note rather than the step, so the haptic fires
   * once per semitone instead of once per hundredth of a hertz.
   */
  const emit = useCallback(
    (nextNormalised: number) => {
      const raw = fromNormalised(clamp(nextNormalised, 0, 1), min, max, taper);
      const note = snapToNote ? noteWithin(raw, min, max, referenceHz) : null;
      // Rounded to the control's own precision, so a snapped value is no more
      // exact than the control can express. The residue that costs is under a
      // twentieth of a cent — two orders of magnitude below anything audible.
      const quantised =
        note === null ? quantise(raw, effectiveStep, min, max) : round(note, precision);
      const detentIndex =
        note === null
          ? Math.round(quantised / effectiveStep)
          : semitoneIndex(quantised, referenceHz);
      if (detentIndex !== lastDetentIndex.current) {
        lastDetentIndex.current = detentIndex;
        haptics.detent();
      }
      onChange(quantised);
    },
    [effectiveStep, max, min, onChange, precision, referenceHz, snapToNote, taper],
  );

  /**
   * Applies a drag delta relative to where the gesture began. The ref is read
   * here, on the JS thread at gesture time, rather than inside the gesture's
   * memo body — where it would be a render-phase ref access and would capture a
   * stale start position.
   */
  const applyDelta = useCallback(
    (delta: number) => {
      emit(startNormalised.current + delta);
    },
    [emit],
  );

  /**
   * Circular tracking. The finger's angle is converted into a position along
   * the encoder's 270° sweep, and movement is applied as a *delta* rather than
   * an absolute position — so grabbing the ring anywhere continues from the
   * current value instead of snapping the knob to wherever the finger landed.
   */
  const applyAngle = useCallback(
    (x: number, y: number) => {
      const centre = size / 2;
      let degrees = (Math.atan2(y - centre, x - centre) * 180) / Math.PI;
      // Unwrap across the gap at the bottom of the dial so a drag through it
      // does not read as a full sweep in the opposite direction.
      let delta = degrees - lastAngle.current;
      if (delta > 180) delta -= 360;
      else if (delta < -180) delta += 360;
      lastAngle.current = degrees;
      startNormalised.current = clamp(startNormalised.current + delta / SWEEP, 0, 1);
      emit(startNormalised.current);
    },
    [emit, size],
  );

  const begin = useCallback(
    (x: number, y: number) => {
      if (disabled || locked) return;
      haptics.beginGesture();
      startNormalised.current = normalised;
      lastDetentIndex.current = snapToNote
        ? Math.round(semitoneIndex(value, referenceHz))
        : Math.round(value / effectiveStep);

      const centre = size / 2;
      lastAngle.current = (Math.atan2(y - centre, x - centre) * 180) / Math.PI;
      setDragging(true);
    },
    [disabled, effectiveStep, locked, normalised, referenceHz, size, snapToNote, value],
  );

  const finish = useCallback(() => {
    setDragging(false);
    onCommit?.(value);
  }, [onCommit, value]);

  /*
   * The gesture callbacks below are worklets: they run on the UI thread when
   * the finger moves, not while rendering. Two React rules cannot see through
   * the gesture builder to know that.
   *
   *  - `react-hooks/refs`: the JS-thread functions these dispatch through
   *    `runOnJS` read refs that only live for the duration of a drag.
   *  - `react-hooks/immutability`: writing a Reanimated shared value from a
   *    worklet is the idiomatic way to carry state onto the UI thread, and is
   *    not the render-phase mutation the rule is guarding against.
   *
   * Disabled for this block only, rather than restructuring working gesture
   * code around a false positive.
   */
  /* eslint-disable react-hooks/refs, react-hooks/immutability */
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled && !locked)
        .minDistance(2)
        .onBegin((event) => {
          // The ring is everything outside the knob cap. Starting there means
          // the user reached for the dial's edge, which is a turning gesture.
          const centre = size / 2;
          circularMode.value =
            Math.sqrt((event.x - centre) ** 2 + (event.y - centre) ** 2) > centre - 34;
          runOnJS(begin)(event.x, event.y);
        })
        .onUpdate((event) => {
          if (circularMode.value) {
            runOnJS(applyAngle)(event.x, event.y);
            return;
          }
          // Vertical travel drives the value; horizontal offset divides the
          // sensitivity, so the further the finger slides from the knob the
          // finer the adjustment becomes. 220 px of travel covers full range.
          const fineness = 1 + Math.abs(event.translationX) / 60;
          const delta = -event.translationY / (220 * fineness);
          runOnJS(applyDelta)(delta);
        })
        .onFinalize(() => {
          runOnJS(finish)();
        }),
    [applyAngle, applyDelta, begin, circularMode, disabled, finish, locked, size],
  );
  /* eslint-enable react-hooks/refs, react-hooks/immutability */

  const handleLongPress = useCallback(() => {
    if (disabled || locked || defaultValue === undefined) return;
    haptics.boundary();
    onChange(defaultValue);
    onCommit?.(defaultValue);
  }, [defaultValue, disabled, locked, onChange, onCommit]);


  /**
   * The value located on the tempered grid. Null whenever there is nothing
   * honest to say — the readout is off, or the frequency has no place on a
   * logarithmic pitch axis.
   */
  const note = useMemo(
    () => (showNote ? frequencyToNote(value, { referenceHz }) : null),
    [referenceHz, showNote, value],
  );
  const noteCents = note ? formatCents(note.centsOff) : null;
  /**
   * What the control says when it is read aloud. The note is spelled out
   * rather than printed, because a screen reader makes nothing of "C#3 +12¢"
   * and a musician would say it in words anyway (§50).
   */
  const spoken = note
    ? `${value.toFixed(precision)} ${unit}, ${spellNote(note)}`
    : `${value.toFixed(precision)} ${unit}`;

  const scaleLabels = useMemo(
    () => labelStops(min, max, taper).map((stop) => ({
      ...stop,
      angle: START_ANGLE + toNormalised(stop.value, min, max, taper) * SWEEP,
    })),
    [max, min, taper],
  );

  // The value must live inside the cap: the cap radius is size/2 - 38, and a
  // light-weight figure of N digits runs ≈ 0.52em per digit. Size against the
  // widest realistic readout rather than the current one, so the type does not
  // jump as the value crosses a digit boundary.
  const capWidth = size - 100;
  const valueSize = Math.min(46, capWidth / 4.4);

  return (
    <View style={[styles.container, style]} testID={testID}>
      <View style={[styles.knobStage, { width: size + LABEL_PAD * 2, height: size + LABEL_PAD * 2 }]}>
        {/* Engraved figures around the dial, placed on the scale's own polar
            geometry so they stay honest to where the ticks actually are. */}
        {scaleLabels.map((stop) => {
          const rad = (stop.angle * Math.PI) / 180;
          const r = size / 2 + LABEL_PAD * 0.62;
          const x = LABEL_PAD + size / 2 + r * Math.cos(rad);
          const y = LABEL_PAD + size / 2 + r * Math.sin(rad);
          return (
            <Text
              key={stop.label}
              variant="readoutXs"
              tone="tertiary"
              style={[styles.scaleLabel, { left: x - 24, top: y - 8 }]}
            >
              {stop.label}
            </Text>
          );
        })}

        <View style={[styles.knobInset, { top: LABEL_PAD, left: LABEL_PAD, width: size, height: size }]}>
      <GestureDetector gesture={gesture}>
        <Pressable
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min, max, now: Number(value.toFixed(precision)), text: spoken }}
          /*
           * The same value again in ARIA form. `react-native-web` forwards the
           * flat `aria-*` props but drops the nested `accessibilityValue`
           * object, so without these four the browser build announces a slider
           * with no value at all — and the note would be visible but unspoken.
           * On native the two agree, so nothing changes there.
           */
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={Number(value.toFixed(precision))}
          aria-valuetext={spoken}
          accessibilityHint={
            snapToNote
              ? 'Double tap to type an exact value or a note name. Swipe up or down to move by semitones.'
              : 'Double tap to type an exact value. Swipe up or down to adjust.'
          }
          accessibilityActions={[
            { name: 'increment' },
            { name: 'decrement' },
            { name: 'activate' },
          ]}
          onAccessibilityAction={(event) => {
            if (disabled || locked) return;
            const direction = event.nativeEvent.actionName === 'increment' ? 1 : -1;
            if (event.nativeEvent.actionName !== 'activate') {
              // With snapping on, one accessibility step is one note — the same
              // grid the finger feels, so the two paths cannot disagree.
              const stepped = snapToNote
                ? noteWithin(value, min, max, referenceHz, direction)
                : null;
              onChange(
                stepped === null
                  ? quantise(value + direction * effectiveStep, effectiveStep, min, max)
                  : round(stepped, precision),
              );
            } else {
              onRequestNumericEntry?.();
            }
          }}
          onPress={onRequestNumericEntry}
          onLongPress={handleLongPress}
          delayLongPress={600}
          style={StyleSheet.absoluteFill}
        >
          <KnobFace
            size={size}
            normalised={normalised}
            startAngle={START_ANGLE}
            sweep={SWEEP}
            accent={colors.signal}
            disabled={disabled}
            locked={locked}
            active={dragging}
            showIndicator={false}
          />
          {/* The readout lives on the cap itself, like the reference hardware:
              the value is the face of the instrument, not a side panel. */}
          <View style={styles.centre} pointerEvents="none">
            <View style={styles.centreValueRow}>
              <Text
                variant="readoutXl"
                tone={disabled ? 'disabled' : 'primary'}
                numberOfLines={1}
                style={{ fontSize: valueSize, lineHeight: valueSize + 6, letterSpacing: -valueSize * 0.03 }}
              >
                {centreFormat(value, precision)}
              </Text>
              <Text variant="readoutSm" tone="tertiary" style={styles.centreUnit}>
                {unit}
              </Text>
            </View>
            {/* The note sits directly under the figure, in the illumination
                colour, because it is the same value said a second way — not a
                second value. Cents are set beside it in engraved grey so the
                eye reads "D3" first and "how far off" only if it cares. */}
            {note ? (
              <View style={styles.centreNoteRow}>
                <Text variant="readoutSm" tone={disabled ? 'disabled' : 'signal'}>
                  {formatNote(note)}
                </Text>
                {noteCents ? (
                  <Text variant="readoutXs" tone="tertiary">
                    {noteCents}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {caption ? (
              <Label
                tone="secondary"
                numberOfLines={1}
                style={[styles.centreCaption, { maxWidth: capWidth }]}
              >
                {caption}
              </Label>
            ) : null}
          </View>
        </Pressable>
      </GestureDetector>

        </View>
      </View>

      <Label style={styles.label}>{label}</Label>

      {/* The way out of the detent, sitting on the panel next to the lock:
          snapping is right for playing a note and wrong for hunting a beat, so
          it has to be one tap either way rather than a setting elsewhere. */}
      {onToggleSnapToNote ? (
        <Pressable
          onPress={() => {
            haptics.engage();
            onToggleSnapToNote();
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: !!snapToNote }}
          // Same reason as the encoder's aria values: the browser build drops
          // the nested `accessibilityState`, so without this the switch is
          // announced with no on/off state at all.
          aria-checked={!!snapToNote}
          accessibilityLabel={`Snap ${label} to notes`}
          accessibilityHint="Settles the encoder on exact note frequencies."
          style={styles.snap}
          hitSlop={12}
        >
          <Label tone={snapToNote ? 'signal' : 'tertiary'}>
            {snapToNote ? 'Notes ON' : 'Notes'}
          </Label>
        </Pressable>
      ) : null}

      {onToggleLock ? (
        <Pressable
          onPress={() => {
            haptics.engage();
            onToggleLock();
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: !!locked }}
          accessibilityLabel={`Lock ${label}`}
          style={styles.lock}
          hitSlop={12}
        >
          <Label tone={locked ? 'signal' : 'tertiary'}>{locked ? 'Locked' : 'Lock'}</Label>
        </Pressable>
      ) : null}
    </View>
  );
}





/** Maps a value onto 0..1 travel, logarithmically for frequency controls. */
export function toNormalised(value: number, min: number, max: number, taper: EncoderTaper): number {
  const v = clamp(value, min, max);
  if (taper === 'log' && min > 0 && max > 0) {
    return Math.log(v / min) / Math.log(max / min);
  }
  return (v - min) / (max - min);
}

export function fromNormalised(t: number, min: number, max: number, taper: EncoderTaper): number {
  if (taper === 'log' && min > 0 && max > 0) {
    return min * Math.pow(max / min, t);
  }
  return min + t * (max - min);
}

/**
 * The note `semitones` away from the one nearest `hz`, kept inside the range.
 *
 * Rounding onto the grid can push a value at either end of the dial a fraction
 * of a semitone outside it, so the result is walked one note back inside rather
 * than clamped — a clamped value would sit between notes, which is the one
 * thing a note detent must never produce. `clamp` remains as a floor for a
 * range narrower than a semitone, where no note fits at all.
 */
function noteWithin(
  hz: number,
  min: number,
  max: number,
  referenceHz: number,
  semitones = 0,
): number | null {
  const snapped = nearestNoteFrequency(hz, semitones, { referenceHz });
  if (snapped === null) return null;
  if (snapped < min) return clamp(nearestNoteFrequency(snapped, 1, { referenceHz }) ?? min, min, max);
  if (snapped > max) return clamp(nearestNoteFrequency(snapped, -1, { referenceHz }) ?? max, min, max);
  return snapped;
}

/** Position on the semitone grid, used as the detent index while snapping. */
function semitoneIndex(hz: number, referenceHz: number): number {
  const match = frequencyToNote(hz, { referenceHz });
  return match ? Math.round(12 * Math.log2(match.exactHz / referenceHz)) : 0;
}

/** Trims floating point residue so the stored value is the printed value. */
function round(value: number, decimals: number): number {
  return Number(value.toFixed(Math.max(0, decimals)));
}

function quantise(value: number, step: number, min: number, max: number): number {
  if (step <= 0) return clamp(value, min, max);
  const snapped = Math.round(value / step) * step;
  // Re-round after snapping: floating point makes 0.1 * 783 land at 78.30000001.
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
  return clamp(Number(snapped.toFixed(decimals)), min, max);
}

function defaultStep(min: number, max: number, precision: number): number {
  const span = max - min;
  if (span <= 2) return 0.001;
  if (span <= 40) return 0.01;
  if (span <= 400) return precision > 0 ? 0.1 : 1;
  return 1;
}

/** Margin around the dial reserved for the engraved scale figures. */
const LABEL_PAD = 26;

/**
 * The figures engraved around a dial.
 *
 * A log dial gets its decades (0.01, 0.1, 1, 10, 100) plus the half-decade
 * below the top of the range when there is room — which is how the reference
 * dial carries a 50 between its 10 and its 100. A linear dial gets ends and
 * middle.
 */
function labelStops(
  min: number,
  max: number,
  taper: EncoderTaper,
): { value: number; label: string }[] {
  const format = (v: number) => (v >= 1 ? String(Math.round(v)) : String(v));
  if (taper !== 'log' || min <= 0) {
    const mid = (min + max) / 2;
    return [min, mid, max].map((v) => ({ value: v, label: format(v) }));
  }
  const stops: number[] = [];
  for (let d = Math.ceil(Math.log10(min) - 1e-9); Math.pow(10, d) <= max * 1.0001; d++) {
    const v = Math.pow(10, d);
    if (v >= min * 0.9999) stops.push(v);
  }
  if (stops[0] > min * 1.01) stops.unshift(min);
  const top = stops[stops.length - 1];
  if (top < max * 0.999) stops.push(max);
  else if (stops.length >= 2 && top / stops[stops.length - 2] === 10) {
    stops.splice(stops.length - 1, 0, top / 2);
  }
  return stops.map((v) => ({ value: v, label: format(v) }));
}

/** The cap readout — never zero padded; a dial face shows the number itself. */
function centreFormat(value: number, precision: number): string {
  const decimals = value >= 1000 ? 0 : value >= 100 ? 1 : precision;
  return value.toFixed(decimals);
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: space.xs },
  knobStage: { alignItems: 'center', justifyContent: 'center' },
  knobInset: { position: 'absolute' },
  scaleLabel: { position: 'absolute', width: 48, textAlign: 'center' },
  centre: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centreValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  centreUnit: { marginBottom: 4 },
  centreNoteRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.xxs,
    marginTop: space.hair,
  },
  centreCaption: { marginTop: space.xs, letterSpacing: 2 },
  label: { marginTop: -space.xs },
  caption: {
    marginTop: space.hair,
  },
  snap: {
    position: 'absolute',
    bottom: -4,
    left: 6,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceRecessed,
  },
  lock: {
    position: 'absolute',
    bottom: -4,
    right: 6,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceRecessed,
  },
});
