import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { KnobFace } from './KnobFace';
import { clamp } from '@frequencylab/dsp-core';
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

  const emit = useCallback(
    (nextNormalised: number) => {
      const raw = fromNormalised(clamp(nextNormalised, 0, 1), min, max, taper);
      const quantised = quantise(raw, effectiveStep, min, max);
      const detentIndex = Math.round(quantised / effectiveStep);
      if (detentIndex !== lastDetentIndex.current) {
        lastDetentIndex.current = detentIndex;
        haptics.detent();
      }
      onChange(quantised);
    },
    [effectiveStep, max, min, onChange, taper],
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
      lastDetentIndex.current = Math.round(value / effectiveStep);

      const centre = size / 2;
      lastAngle.current = (Math.atan2(y - centre, x - centre) * 180) / Math.PI;
      setDragging(true);
    },
    [disabled, effectiveStep, locked, normalised, size, value],
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
          accessibilityValue={{
            min,
            max,
            now: Number(value.toFixed(precision)),
            text: `${value.toFixed(precision)} ${unit}`,
          }}
          accessibilityHint="Double tap to type an exact value. Swipe up or down to adjust."
          accessibilityActions={[
            { name: 'increment' },
            { name: 'decrement' },
            { name: 'activate' },
          ]}
          onAccessibilityAction={(event) => {
            if (disabled || locked) return;
            if (event.nativeEvent.actionName === 'increment') {
              onChange(quantise(value + effectiveStep, effectiveStep, min, max));
            } else if (event.nativeEvent.actionName === 'decrement') {
              onChange(quantise(value - effectiveStep, effectiveStep, min, max));
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
  centreCaption: { marginTop: space.xs, letterSpacing: 2 },
  label: { marginTop: -space.xs },
  caption: {
    marginTop: space.hair,
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
