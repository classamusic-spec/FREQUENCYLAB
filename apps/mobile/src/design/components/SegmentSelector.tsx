import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, MIN_TOUCH_TARGET, radius, space } from '../tokens';
import { LIGHT, SURFACES } from '../materials';
import * as haptics from '../haptics';
import { Text } from './Text';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SegmentSelectorProps<T extends string> {
  options: readonly SegmentOption<T>[];
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
          style={styles.segmentLabel}
          variant={size === 'sm' ? 'label' : 'labelLg'}
          uppercase
          tone={option.disabled ? 'disabled' : selected ? 'primary' : 'tertiary'}
        >
          {option.label}
        </Text>
        {selected ? (
          <LinearGradient
            colors={SURFACES.buttonCap}
            start={LIGHT.face.start}
            end={LIGHT.face.end}
            style={styles.selectedCap}
            pointerEvents="none"
          />
        ) : null}
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
    // A channel milled into the panel: shaded at the top by its own rim,
    // catching bounced light along the bottom lip.
    borderTopWidth: 1,
    borderTopColor: 'rgba(72,83,99,0.32)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.9)',
  },
  segment: {
    overflow: 'hidden',
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
    shadowColor: '#1D2430',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  selectedCap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.engraved + 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(83,95,112,0.24)',
  },
  segmentLabel: { zIndex: 1 },
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
