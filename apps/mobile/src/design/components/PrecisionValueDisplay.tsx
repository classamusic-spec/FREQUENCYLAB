import { StyleSheet, View, type ViewStyle } from 'react-native';
import { formatHz } from '@frequencylab/dsp-core';
import { radius, space } from '../tokens';
import { DisplayGlass } from './Surface';
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
 * Values render with tabular figures and fixed decimals, so a live value
 * ticks without the layout shifting under it. Integer zero-padding was a
 * habit of the old dark LCD; the porcelain instrument prints `7.830`, the
 * way the reference hardware does.
 */
export function PrecisionValueDisplay({
  label,
  value,
  unit,
  precision = 3,
  integerDigits = 1,
  size = 'md',
  tone = 'primary',
  plate,
  align = 'left',
  style,
}: PrecisionValueDisplayProps) {
  const text = typeof value === 'string' ? value : formatHz(value, integerDigits, precision);
  const variant = size === 'lg' ? 'readoutLg' : size === 'sm' ? 'readoutSm' : 'readout';

  // A plated value is a real display cut into the panel: the label stays
  // engraved on the metal, and only the number is illuminated behind glass.
  if (plate) {
    return (
      <View style={[{ alignItems: ALIGN[align] }, style]}>
        <Label style={styles.plateLabel}>{label}</Label>
        <DisplayGlass cornerRadius={radius.engraved + 2}>
          <View style={styles.plateInner}>
            <Text variant={variant} tone={tone === 'signal' ? 'displaySignal' : 'display'}>
              {text}
            </Text>
            {unit ? (
              <Text variant="readoutXs" tone="displayDim" style={styles.unit}>
                {unit}
              </Text>
            ) : null}
          </View>
        </DisplayGlass>
      </View>
    );
  }

  return (
    <View style={[{ alignItems: ALIGN[align] }, style]}>
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
  plateLabel: { marginBottom: space.xxs },
  plateInner: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.xxs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
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
