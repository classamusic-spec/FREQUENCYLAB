import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import { clamp, formatHz } from '@frequencylab/dsp-core';
import { colors, radius, space } from '../tokens';
import * as haptics from '../haptics';
import { Label, Text } from './Text';

/**
 * The signature control (§69).
 *
 * Gestures, in the order they are resolved:
 *  - vertical drag changes the value;
 *  - horizontal distance from the start point scales sensitivity, so sliding
 *    away from the knob mid-gesture gives fine adjustment without a mode;
 *  - a drag that begins on the ring itself tracks the angle directly;
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

  const begin = useCallback(() => {
    if (disabled || locked) return;
    haptics.beginGesture();
    startNormalised.current = normalised;
    lastDetentIndex.current = Math.round(value / effectiveStep);
    setDragging(true);
  }, [disabled, effectiveStep, locked, normalised, value]);

  const finish = useCallback(() => {
    setDragging(false);
    onCommit?.(value);
  }, [onCommit, value]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled && !locked)
        .minDistance(2)
        .onBegin(() => {
          runOnJS(begin)();
        })
        .onUpdate((event) => {
          // Vertical travel drives the value; horizontal offset divides the
          // sensitivity, so the further the finger slides from the knob the
          // finer the adjustment becomes. 220 px of travel covers full range.
          const fineness = 1 + Math.abs(event.translationX) / 60;
          const delta = -event.translationY / (220 * fineness);
          runOnJS(emit)(startNormalised.current + delta);
        })
        .onFinalize(() => {
          runOnJS(finish)();
        }),
    [begin, disabled, emit, finish, locked],
  );

  const handleLongPress = useCallback(() => {
    if (disabled || locked || defaultValue === undefined) return;
    haptics.boundary();
    onChange(defaultValue);
    onCommit?.(defaultValue);
  }, [defaultValue, disabled, locked, onChange, onCommit]);

  const geometry = useMemo(() => buildGeometry(size), [size]);
  const angle = START_ANGLE + normalised * SWEEP;

  return (
    <View style={[styles.container, { width: size, height: size }, style]} testID={testID}>
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
          <Svg width={size} height={size}>
            {/* Bezel: the machined outer ring. */}
            <Circle
              cx={geometry.centre}
              cy={geometry.centre}
              r={geometry.bezelRadius}
              fill={colors.chassis}
              stroke={colors.bezel}
              strokeWidth={1}
            />

            {/* Engraved scale. Every fifth tick is longer and brighter. */}
            <G>
              {geometry.ticks.map((tick, index) => (
                <Line
                  key={index}
                  x1={tick.x1}
                  y1={tick.y1}
                  x2={tick.x2}
                  y2={tick.y2}
                  stroke={tick.major ? colors.textTertiary : colors.hairlineStrong}
                  strokeWidth={tick.major ? 1.4 : 1}
                  strokeLinecap="round"
                />
              ))}
            </G>

            {/* Track and illuminated arc. */}
            <Path
              d={arcPath(geometry.centre, geometry.trackRadius, START_ANGLE, START_ANGLE + SWEEP)}
              stroke={colors.surfaceRecessed}
              strokeWidth={geometry.trackWidth}
              strokeLinecap="round"
              fill="none"
            />
            {normalised > 0.001 ? (
              <Path
                d={arcPath(geometry.centre, geometry.trackRadius, START_ANGLE, angle)}
                stroke={locked ? colors.textTertiary : colors.signal}
                strokeWidth={geometry.trackWidth}
                strokeLinecap="round"
                fill="none"
                opacity={disabled ? 0.3 : dragging ? 1 : 0.85}
              />
            ) : null}

            {/* Knob face: concentric edges suggest a turned aluminium cap. */}
            <Circle
              cx={geometry.centre}
              cy={geometry.centre}
              r={geometry.knobRadius}
              fill={colors.surfaceRaised}
              stroke={colors.edgeLight}
              strokeWidth={StyleSheet.hairlineWidth * 2}
            />
            <Circle
              cx={geometry.centre}
              cy={geometry.centre}
              r={geometry.knobRadius - 8}
              fill={colors.surface}
              stroke={colors.engraving}
              strokeWidth={1}
            />

            {/* Indicator: the line milled into the cap. */}
            <Line
              x1={polar(geometry.centre, geometry.knobRadius - 26, angle).x}
              y1={polar(geometry.centre, geometry.knobRadius - 26, angle).y}
              x2={polar(geometry.centre, geometry.knobRadius - 6, angle).x}
              y2={polar(geometry.centre, geometry.knobRadius - 6, angle).y}
              stroke={locked ? colors.textTertiary : colors.signal}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          </Svg>
        </Pressable>
      </GestureDetector>

      <View pointerEvents="none" style={styles.readout}>
        <Text variant="readoutXl" tone={disabled ? 'disabled' : 'primary'}>
          {formatHz(value, integerDigits, precision)}
        </Text>
        <Text variant="readoutXs" tone="tertiary" style={styles.unit}>
          {unit}
        </Text>
        <Label style={styles.label}>{label}</Label>
        {caption ? (
          <Text variant="caption" tone="secondary" style={styles.caption}>
            {caption}
          </Text>
        ) : null}
      </View>

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

interface Geometry {
  centre: number;
  bezelRadius: number;
  trackRadius: number;
  trackWidth: number;
  knobRadius: number;
  ticks: Array<{ x1: number; y1: number; x2: number; y2: number; major: boolean }>;
}

function buildGeometry(size: number): Geometry {
  const centre = size / 2;
  const bezelRadius = centre - 1;
  const tickOuter = bezelRadius - 5;
  const trackWidth = 5;
  const trackRadius = bezelRadius - 20;
  const knobRadius = trackRadius - 16;

  const ticks: Geometry['ticks'] = [];
  const count = 41;
  for (let i = 0; i < count; i++) {
    const angle = START_ANGLE + (i / (count - 1)) * SWEEP;
    const major = i % 5 === 0;
    const inner = tickOuter - (major ? 9 : 5);
    const outer = polar(centre, tickOuter, angle);
    const innerPoint = polar(centre, inner, angle);
    ticks.push({ x1: innerPoint.x, y1: innerPoint.y, x2: outer.x, y2: outer.y, major });
  }

  return { centre, bezelRadius, trackRadius, trackWidth, knobRadius, ticks };
}

function polar(centre: number, r: number, degrees: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  return { x: centre + r * Math.cos(radians), y: centre + r * Math.sin(radians) };
}

function arcPath(centre: number, r: number, fromDeg: number, toDeg: number): string {
  const start = polar(centre, r, fromDeg);
  const end = polar(centre, r, toDeg);
  const largeArc = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
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

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  readout: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unit: {
    marginTop: -2,
  },
  label: {
    marginTop: space.sm,
  },
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
