import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { clamp, type ParamDescriptor } from '@frequencylab/dsp-core';
import { colors, MIN_TOUCH_TARGET, space } from '../tokens';
import * as haptics from '../haptics';
import { KnobFace } from './KnobFace';
import { NumericEntrySheet } from './NumericEntrySheet';
import { Label, Text } from './Text';

export interface ParameterControlProps {
  descriptor: ParamDescriptor;
  value: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  /** Marks the row as driven by an automation lane. */
  automated?: boolean;
  onToggleAutomation?: () => void;
  disabled?: boolean;
}

/**
 * A single DSP parameter as a horizontal control.
 *
 * The rack needs a control that is dense enough for a dozen parameters on one
 * screen but still precise: dragging moves the value, dragging away from the
 * row divides the sensitivity, and tapping the number opens exact entry. That
 * is the same interaction model as the big encoder, at a smaller size.
 */
export function ParameterControl({
  descriptor,
  value,
  onChange,
  onCommit,
  automated,
  onToggleAutomation,
  disabled,
}: ParameterControlProps) {
  const [entryOpen, setEntryOpen] = useState(false);
  const [startValue, setStartValue] = useState(value);

  const normalised = toNormalised(value, descriptor);
  const step = stepFor(descriptor);

  const applyDelta = useCallback(
    (delta: number) => {
      const base = toNormalised(startValue, descriptor);
      const next = fromNormalised(clamp(base + delta, 0, 1), descriptor);
      const snapped = snap(next, step, descriptor);
      if (snapped !== value) {
        haptics.detent();
        onChange(snapped);
      }
    },
    [descriptor, onChange, startValue, step, value],
  );

  const commit = useCallback(() => {
    onCommit?.(value);
  }, [onCommit, value]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled && !automated)
        .minDistance(2)
        .onBegin(() => {
          runOnJS(haptics.beginGesture)();
          runOnJS(setStartValue)(value);
        })
        .onUpdate((event) => {
          // Vertical distance divides the sensitivity, so sliding away from the
          // row gives fine adjustment — the same model as the large encoder.
          const fineness = 1 + Math.abs(event.translationY) / 50;
          const delta = event.translationX / (240 * fineness);
          runOnJS(applyDelta)(delta);
        })
        .onFinalize(() => {
          runOnJS(commit)();
        }),
    [applyDelta, automated, commit, disabled, value],
  );

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <View style={styles.labelGroup}>
          <Label tone={automated ? 'signal' : 'tertiary'}>{descriptor.label}</Label>
          {automated ? <Label tone="signal">· Automated</Label> : null}
        </View>
        <Pressable
          onPress={() => setEntryOpen(true)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${descriptor.label}, ${format(value, descriptor)}. Double tap to type a value.`}
          // The readout is a line of text about 17 pt tall. Padded rather than
          // given `hitSlop`, which React Native Web ignores — the web build is
          // shipped, so a native-only fix is not a fix.
          style={styles.readoutTouch}
        >
          <Text variant="readoutSm" tone={disabled ? 'disabled' : 'primary'}>
            {format(value, descriptor)}
          </Text>
        </Pressable>
      </View>

      <GestureDetector gesture={gesture}>
        <View
          style={styles.track}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={descriptor.label}
          accessibilityHint={descriptor.help}
          accessibilityValue={{
            min: descriptor.min,
            max: descriptor.max,
            now: value,
            text: format(value, descriptor),
          }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            const delta = event.nativeEvent.actionName === 'increment' ? step : -step;
            onChange(snap(value + delta, step, descriptor));
          }}
        >
          <View style={styles.trackGroove} />
          <View
            style={[
              styles.trackFill,
              { width: `${Math.round(normalised * 100)}%` },
              automated ? styles.trackFillAutomated : null,
              disabled ? styles.trackFillDisabled : null,
            ]}
          />
          <View style={[styles.thumb, { left: `${Math.round(normalised * 100)}%` }]} />
        </View>
      </GestureDetector>

      {descriptor.help && !automated ? (
        <Text variant="caption" tone="tertiary" numberOfLines={2}>
          {descriptor.help}
        </Text>
      ) : null}

      {onToggleAutomation ? (
        <Pressable onPress={onToggleAutomation} hitSlop={8} accessibilityRole="button">
          <Label tone={automated ? 'signal' : 'tertiary'}>
            {automated ? 'Remove automation' : 'Automate'}
          </Label>
        </Pressable>
      ) : null}

      {entryOpen ? (
        <NumericEntrySheet
          title={descriptor.label}
          unit={unitLabel(descriptor)}
          value={value}
          min={descriptor.min}
          max={descriptor.max}
          precision={descriptor.precision}
          onCancel={() => setEntryOpen(false)}
          onSubmit={(next) => {
            onChange(next);
            onCommit?.(next);
            setEntryOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * A single parameter as a small rotary knob, for the rack's module faces.
 *
 * The same value, the same snapping and the same exact-entry sheet as the
 * horizontal control above, so a module's face and its expanded editor can
 * never disagree about what a drag does. The knob turns on a drag in either
 * direction — up or right is more — because a phone has no mouse wheel and a
 * circular gesture on a 56 pt part is a gesture nobody hits. Tapping the
 * readout types a value. Screen readers get it as an adjustable with
 * increment and decrement, exactly like the slider.
 */
export function RackKnob({
  descriptor,
  value,
  onChange,
  onCommit,
  automated,
  disabled,
  size = 56,
}: Omit<ParameterControlProps, 'onToggleAutomation'> & { size?: number }) {
  const [entryOpen, setEntryOpen] = useState(false);
  const [startValue, setStartValue] = useState(value);
  const normalised = toNormalised(value, descriptor);
  const step = stepFor(descriptor);
  const locked = disabled || automated;
  // The figure and its unit set apart, as engraved on the reference rack.
  const shown = format(value, descriptor);
  const split = shown.lastIndexOf(' ');
  const figure = split > 0 ? shown.slice(0, split) : shown;
  const unit = split > 0 ? shown.slice(split + 1) : '';

  const applyDelta = useCallback(
    (delta: number) => {
      const next = fromNormalised(clamp(toNormalised(startValue, descriptor) + delta, 0, 1), descriptor);
      const snapped = snap(next, step, descriptor);
      if (snapped !== value) {
        haptics.detent();
        onChange(snapped);
      }
    },
    [descriptor, onChange, startValue, step, value],
  );

  const commit = useCallback(() => onCommit?.(value), [onCommit, value]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!locked)
        .minDistance(2)
        .onBegin(() => {
          runOnJS(haptics.beginGesture)();
          runOnJS(setStartValue)(value);
        })
        .onUpdate((event) => {
          runOnJS(applyDelta)((event.translationX - event.translationY) / 220);
        })
        .onFinalize(() => {
          runOnJS(commit)();
        }),
    [applyDelta, commit, locked, value],
  );

  return (
    <View style={styles.knobCell}>
      <Label tone={automated ? 'signal' : 'tertiary'} numberOfLines={1} style={styles.knobLabel}>
        {automated ? `${descriptor.label} · Auto` : descriptor.label}
      </Label>
      <Pressable
        onPress={() => setEntryOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${descriptor.label}, ${format(value, descriptor)}. Double tap to type a value.`}
        style={styles.knobReadout}
      >
        <Text variant="readout" tone={disabled ? 'disabled' : 'primary'} numberOfLines={1} style={styles.knobFigure}>
          {figure}
          {unit ? <Text variant="readoutXs" tone="tertiary">{` ${unit}`}</Text> : null}
        </Text>
      </Pressable>
      <GestureDetector gesture={gesture}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={descriptor.label}
          accessibilityHint={descriptor.help}
          accessibilityValue={{ min: descriptor.min, max: descriptor.max, now: value, text: format(value, descriptor) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            if (locked) return;
            const delta = event.nativeEvent.actionName === 'increment' ? step : -step;
            onChange(snap(value + delta, step, descriptor));
          }}
          style={{ width: size + 16, height: size + 16, alignItems: 'center', justifyContent: 'center' }}
        >
          <KnobFace size={size + 16} normalised={normalised} locked={locked} disabled={disabled} />
        </View>
      </GestureDetector>

      {entryOpen ? (
        <NumericEntrySheet
          title={descriptor.label}
          unit={unitLabel(descriptor)}
          value={value}
          min={descriptor.min}
          max={descriptor.max}
          precision={descriptor.precision}
          onCancel={() => setEntryOpen(false)}
          onSubmit={(next) => {
            onChange(next);
            onCommit?.(next);
            setEntryOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}

export function format(value: number, descriptor: ParamDescriptor): string {
  switch (descriptor.unit) {
    case 'percent':
      return `${(value * 100).toFixed(descriptor.precision > 0 ? 0 : 0)}%`;
    case 'db':
      return `${value.toFixed(1)} dB`;
    case 'hz':
      return `${value.toFixed(descriptor.precision)} Hz`;
    case 'ms':
      return `${value.toFixed(0)} ms`;
    default:
      return value.toFixed(descriptor.precision);
  }
}

function unitLabel(descriptor: ParamDescriptor): string {
  switch (descriptor.unit) {
    case 'hz':
      return 'Hz';
    case 'db':
      return 'dB';
    case 'percent':
      return '';
    default:
      return '';
  }
}

function toNormalised(value: number, descriptor: ParamDescriptor): number {
  const v = clamp(value, descriptor.min, descriptor.max);
  if (descriptor.taper === 'log' && descriptor.min > 0) {
    return Math.log(v / descriptor.min) / Math.log(descriptor.max / descriptor.min);
  }
  return (v - descriptor.min) / (descriptor.max - descriptor.min);
}

function fromNormalised(t: number, descriptor: ParamDescriptor): number {
  if (descriptor.taper === 'log' && descriptor.min > 0) {
    return descriptor.min * Math.pow(descriptor.max / descriptor.min, t);
  }
  return descriptor.min + t * (descriptor.max - descriptor.min);
}

function stepFor(descriptor: ParamDescriptor): number {
  return Math.pow(10, -descriptor.precision) || 0.001;
}

function snap(value: number, step: number, descriptor: ParamDescriptor): number {
  const snapped = Math.round(value / step) * step;
  return clamp(Number(snapped.toFixed(descriptor.precision)), descriptor.min, descriptor.max);
}

const styles = StyleSheet.create({
  knobCell: { alignItems: 'center', flex: 1, minWidth: 0 },
  knobLabel: { textAlign: 'center' },
  knobFigure: { fontSize: 15, lineHeight: 20 },
  knobReadout: { minHeight: 30, justifyContent: 'center', paddingHorizontal: space.xxs },
  readoutTouch: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: space.xs },
  row: { gap: space.xs, paddingVertical: space.xs },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelGroup: { flexDirection: 'row', gap: space.xs, alignItems: 'center' },
  track: { height: 32, justifyContent: 'center' },
  trackGroove: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceRecessed,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeDark,
  },
  trackFill: {
    position: 'absolute',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.signal,
    opacity: 0.85,
  },
  trackFillAutomated: { backgroundColor: colors.signalDim },
  trackFillDisabled: { backgroundColor: colors.textDisabled },
  thumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
    backgroundColor: colors.panelHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.edgeLight,
  },
});
