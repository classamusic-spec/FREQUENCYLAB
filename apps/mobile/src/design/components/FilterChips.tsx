import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { colors, MIN_TOUCH_TARGET, radius, shadows, space } from '../tokens';
import * as haptics from '../haptics';
import { Text } from './Text';

export interface FilterChip<T extends string> {
  value: T;
  label: string;
}

/**
 * A row of separate pill filters, one of which is on.
 *
 * Separate parts rather than one segmented channel, because these are a list
 * of shelves to look at rather than two settings of one quantity. The chosen
 * chip is said three ways, so colour is never the only one (§50): it gets the
 * lit signal ring, a heavier weight, and it stands proud while the others sit
 * flat on the panel.
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: FilterChip<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (selected) return;
              haptics.engage();
              onChange(option.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            aria-selected={selected}
            accessibilityLabel={`${option.label}${selected ? ', showing' : ''}`}
            style={[styles.chip, selected ? styles.chipOn : null]}
          >
            <Text style={[styles.label, selected ? styles.labelOn : null]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingVertical: space.xs, paddingHorizontal: 2 },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRecessed,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ring,
  },
  chipOn: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: colors.signal,
    ...shadows.float,
  },
  label: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 18, color: colors.text },
  labelOn: { fontFamily: 'Inter_600SemiBold', color: colors.signal },
});
