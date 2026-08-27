import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, MIN_TOUCH_TARGET, radius, space } from '../tokens';
import * as haptics from '../haptics';
import { Text } from './Text';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SegmentSelectorProps<T extends string> {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Lets long option sets scroll instead of shrinking below the touch target. */
  scrollable?: boolean;
  size?: 'sm' | 'md';
  style?: ViewStyle;
  accessibilityLabel?: string;
}

/**
 * A recessed segmented switch.
 *
 * The selected segment is a raised cap inside a milled channel: the housing is
 * darker than the chassis, the cap is lighter, and only the cap carries the
 * illumination colour. Selection is also indicated by weight and position, not
 * by colour alone (§50).
 */
export function SegmentSelector<T extends string>({
  options,
  value,
  onChange,
  scrollable,
  size = 'md',
  style,
  accessibilityLabel,
}: SegmentSelectorProps<T>) {
  const content = options.map((option) => {
    const selected = option.value === value;
    return (
      <Pressable
        key={option.value}
        accessibilityRole="tab"
        accessibilityState={{ selected, disabled: !!option.disabled }}
        accessibilityLabel={option.label}
        disabled={option.disabled}
        onPress={() => {
          if (option.value === value) return;
          haptics.engage();
          onChange(option.value);
        }}
        style={[
          styles.segment,
          size === 'sm' ? styles.segmentSm : null,
          selected ? styles.selected : null,
          option.disabled ? styles.disabled : null,
          scrollable ? styles.segmentScroll : styles.segmentFlex,
        ]}
      >
        <Text
          variant={size === 'sm' ? 'label' : 'labelLg'}
          uppercase
          tone={option.disabled ? 'disabled' : selected ? 'primary' : 'tertiary'}
        >
          {option.label}
        </Text>
        {selected ? <View style={styles.indicator} /> : null}
      </Pressable>
    );
  });

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        accessibilityLabel={accessibilityLabel}
        contentContainerStyle={[styles.housing, style]}
      >
        {content}
      </ScrollView>
    );
  }

  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={[styles.housing, style]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  housing: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceRecessed,
    borderRadius: radius.control,
    padding: 3,
    gap: 3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeDark,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.edgeLight,
  },
  segment: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET - 8,
    paddingHorizontal: space.md,
    borderRadius: radius.engraved + 2,
  },
  segmentFlex: { flex: 1 },
  segmentScroll: { minWidth: 76 },
  segmentSm: { minHeight: 30 },
  selected: {
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
  },
  disabled: { opacity: 0.4 },
  indicator: {
    position: 'absolute',
    bottom: 3,
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.signal,
  },
});
