import { StyleSheet, View, type ViewStyle } from 'react-native';
import { formatHz } from '@frequencylab/dsp-core';
import { colors, radius, space } from '../tokens';
import { Label, Text } from './Text';

export interface PrecisionValueDisplayProps {
  label: string;
  value: number | string;
  unit?: string;
  /** Numeric formatting. Ignored when `value` is already a string. */
  precision?: number;
  integerDigits?: number;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'primary' | 'signal' | 'warning' | 'limit' | 'secondary';
  /** Renders on a recessed OLED-style plate rather than inline. */
  plate?: boolean;
  align?: 'left' | 'center' | 'right';
  style?: ViewStyle;
}

/**
 * A numeric readout.
 *
 * Values are always rendered with tabular figures and fixed integer padding, so
 * a live value changes without the layout shifting under it — `007.830` rather
 * than `7.83`. That padding is the difference between a readout and a label.
 */
export function PrecisionValueDisplay({
  label,
  value,
  unit,
  precision = 3,
  integerDigits = 3,
  size = 'md',
  tone = 'primary',
  plate,
  align = 'left',
  style,
}: PrecisionValueDisplayProps) {
  const text = typeof value === 'string' ? value : formatHz(value, integerDigits, precision);
  const variant = size === 'lg' ? 'readoutLg' : size === 'sm' ? 'readoutSm' : 'readout';

  return (
    <View style={[plate ? styles.plate : null, { alignItems: ALIGN[align] }, style]}>
      <Label>{label}</Label>
      <View style={styles.valueRow}>
        <Text variant={variant} tone={tone}>
          {text}
        </Text>
        {unit ? (
          <Text variant="readoutXs" tone="tertiary" style={styles.unit}>
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const ALIGN = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

const styles = StyleSheet.create({
  plate: {
    backgroundColor: colors.surfaceRecessed,
    borderRadius: radius.engraved,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeDark,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.edgeLight,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.xxs,
    marginTop: space.xxs,
  },
  unit: {
    marginBottom: 1,
  },
});
