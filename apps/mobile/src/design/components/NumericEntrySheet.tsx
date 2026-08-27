import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { clamp } from '@frequencylab/dsp-core';
import { colors, MIN_TOUCH_TARGET, radius, shadows, space } from '../tokens';
import * as haptics from '../haptics';
import { HardwareButton } from './HardwareButton';
import { Label, Text } from './Text';

export interface NumericEntrySheetProps {
  title: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  precision?: number;
  onSubmit: (value: number) => void;
  onCancel: () => void;
}

/**
 * Numeric entry.
 *
 * This is the alternative to every rotary control (§50) and the fast path for
 * anyone who already knows the number they want. The keypad is deliberately its
 * own surface rather than the system keyboard: the values are always numeric,
 * the targets can be large, and the range is stated where it is being violated.
 */
export function NumericEntrySheet({
  title,
  value,
  min,
  max,
  unit = 'Hz',
  precision = 3,
  onSubmit,
  onCancel,
}: NumericEntrySheetProps) {
  const [draft, setDraft] = useState(() => trimTrailingZeros(value.toFixed(precision)));

  const parsed = Number.parseFloat(draft);
  const valid = Number.isFinite(parsed) && parsed >= min && parsed <= max;

  const press = (key: string) => {
    haptics.detent();
    setDraft((current) => {
      if (key === 'del') return current.length <= 1 ? '' : current.slice(0, -1);
      if (key === '.') return current.includes('.') ? current : `${current || '0'}.`;
      const next = `${current}${key}`;
      // Cap the string length rather than the value: a partially typed number
      // is often temporarily out of range and should not be blocked mid-entry.
      return next.length > 9 ? current : next;
    });
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.scrim} onPress={onCancel} accessibilityLabel="Dismiss" />
      <View style={styles.sheet}>
        <Label>{title}</Label>
        <View style={styles.display}>
          <Text variant="readoutXl" tone={valid || draft === '' ? 'primary' : 'limit'}>
            {draft || '0'}
          </Text>
          <Text variant="readout" tone="tertiary">
            {unit}
          </Text>
        </View>
        <Text variant="caption" tone={valid || draft === '' ? 'tertiary' : 'limit'}>
          Range {min} – {max} {unit}
        </Text>

        <View style={styles.keypad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((key) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={key === 'del' ? 'Delete' : key}
              onPress={() => press(key)}
              style={styles.key}
            >
              <Text variant="readoutLg" tone="secondary">
                {key === 'del' ? '⌫' : key}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.actions}>
          <HardwareButton label="Cancel" variant="ghost" style={styles.action} onPress={onCancel} />
          <HardwareButton
            label="Set"
            variant="primary"
            style={styles.action}
            disabled={!valid}
            onPress={() => onSubmit(clamp(parsed, min, max))}
          />
        </View>
      </View>
    </Modal>
  );
}

function trimTrailingZeros(text: string): string {
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0, backgroundColor: colors.scrim },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: space.xl,
    paddingBottom: space.huge,
    gap: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
    ...(shadows.sheet as object),
  },
  display: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.sm,
  },
  key: {
    flexBasis: '31%',
    flexGrow: 1,
    minHeight: MIN_TOUCH_TARGET + 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
  },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  action: { flex: 1 },
});
