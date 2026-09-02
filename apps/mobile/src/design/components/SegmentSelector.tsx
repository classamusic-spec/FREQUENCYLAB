import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, MIN_TOUCH_TARGET, radius, shadows, space } from '../tokens';
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
  /**
   * How the switch is built.
   *
   * `rail` is a single raised control divided by hairlines — the whole thing is
   * one part, and choosing a segment lights its label rather than moving a cap
   * around inside a channel. `channel` is the older milled-housing form, kept
   * for the places where the switch sits inside an already-recessed panel and a
   * second recess would read as a hole in a hole.
   */
  variant?: 'rail' | 'channel';
  size?: 'sm' | 'md';
  style?: ViewStyle;
  accessibilityLabel?: string;
}

/**
 * A segmented switch.
 *
 * ## `rail`, the default
 *
 * One raised part lying on the chassis, divided into segments by hairlines that
 * run its full height — the same physical language as `IconButton`: a diffuse
 * shadow for the lift and a ring at the edge for the rim. Nothing moves inside
 * it. Choosing a segment lights that label and leaves the housing alone, which
 * is quieter than sliding a cap and reads faster: the eye finds a colour before
 * it finds a position.
 *
 * ## Colour is never the only channel (§50)
 *
 * A lit label alone would fail that rule, so the selected segment is *also* set
 * in the semibold face and keeps its underscore. Three channels — colour,
 * weight, and a mark under the word — none of which depends on seeing hue.
 *
 * ## `channel`
 *
 * The older form: a milled housing with a raised cap that travels. Kept for
 * switches sitting inside an already-recessed panel, where a second recess
 * would read as a hole cut in a hole.
 */
export function SegmentSelector<T extends string>({
  options,
  value,
  onChange,
  scrollable,
  size = 'md',
  variant = 'rail',
  style,
  accessibilityLabel,
}: SegmentSelectorProps<T>) {
  const rail = variant === 'rail';
  const content = options.map((option, index) => {
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
          !rail && selected ? styles.selected : null,
          // The divider belongs to the segment on its left, so the rail's own
          // ends stay clean and no divider doubles up.
          rail && index > 0 ? styles.divided : null,
          option.disabled ? styles.disabled : null,
          scrollable ? styles.segmentScroll : styles.segmentFlex,
        ]}
      >
        <Text
          style={[styles.segmentLabel, selected ? styles.segmentLabelSelected : null]}
          variant={size === 'sm' ? 'label' : 'labelLg'}
          uppercase
          tone={option.disabled ? 'disabled' : selected ? 'signal' : 'tertiary'}
        >
          {option.label}
        </Text>
        {!rail && selected ? (
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
        contentContainerStyle={[styles.housing, rail ? styles.rail : null, style]}
      >
        {content}
      </ScrollView>
    );
  }

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.housing, rail ? styles.rail : null, style]}
    >
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
  // The second non-colour channel. `labelLg` is medium; the selected segment
  // steps up a weight so the choice is legible in greyscale.
  segmentLabelSelected: { fontFamily: fonts.sansSemibold },
  /**
   * One raised part rather than a milled channel: the ring draws its rim and
   * the float lifts it off the chassis, exactly as on `IconButton`. Zero
   * padding and no gap, because the hairlines have to reach the full height of
   * the rail — a divider that stops short reads as a tick mark.
   */
  rail: {
    backgroundColor: colors.surfaceRaised,
    padding: 0,
    gap: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ring,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.ring,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.ring,
    overflow: 'hidden',
    ...shadows.float,
  },
  divided: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.ring,
    borderRadius: 0,
  },
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
