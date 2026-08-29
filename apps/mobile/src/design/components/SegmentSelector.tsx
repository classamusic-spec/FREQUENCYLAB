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
          tone={option.disabled ? 'disabled' : selected ? 'signal' : 'tertiary'}
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
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
    // A channel milled into the panel: shaded at the top by its own rim,
    // catching bounced light along the bottom lip.
    borderTopWidth: 1,
    borderTopColor: 'rgba(96,110,132,0.20)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.9)',
  },
  segment: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    // Was `MIN_TOUCH_TARGET - 6`, which undercut the app's own constant by six
    // pixels for the sake of a slightly trimmer control. 38 pt is below every
    // platform minimum there is, and a segmented control is one of the most
    // tapped things in this app.
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
  },
  segmentFlex: { flex: 1 },
  segmentScroll: { minWidth: 76 },
  /*
   * `sm` is a lighter *look*, not a smaller target.
   *
   * It used to draw at 30 pt, under every platform minimum and under this
   * app's own `MIN_TOUCH_TARGET`. `hitSlop` is not the fix: React Native Web
   * ignores it entirely, so it would have quietly left the web build exactly
   * as it was. What still distinguishes the variant is the type size and the
   * horizontal padding, which is most of what it was ever for.
   */
  segmentSm: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: space.md },
  selected: {
    shadowColor: '#33486A',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  selectedCap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.pill,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(122,136,158,0.22)',
  },
  segmentLabel: { zIndex: 1 },
  disabled: { opacity: 0.4 },
  indicator: {
    position: 'absolute',
    bottom: 4,
    width: 18,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: colors.signal,
  },
});
