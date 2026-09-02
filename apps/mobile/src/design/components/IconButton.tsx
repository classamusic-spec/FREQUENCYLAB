import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { MIN_TOUCH_TARGET, colors, motion, shadows } from '../tokens';
import { LIGHT, SURFACES } from '../materials';
import * as haptics from '../haptics';
import { useReducedMotion } from '../useReducedMotion';

/**
 * A round control resting on the chassis.
 *
 * The app had no primitive for this — every circular control was assembled at
 * its call site out of a `Pressable`, a border radius and whatever shadow that
 * screen happened to use, so no two were quite the same object. This is that
 * form, made once.
 *
 * ## What makes it read as a machined part
 *
 * Three things, and it needs all three:
 *
 *  - a **diffuse shadow** offset downward, so it lies on the surface rather
 *    than being printed on it;
 *  - a **hairline ring** at its edge, because a real part has a turned rim that
 *    catches light against both the ground and its own shadow;
 *  - a **face gradient** running from the same 135° light every other surface
 *    in this app is lit from, so it belongs to the same object.
 *
 * Drop the ring and it is a smudge; drop the shadow and it is a sticker.
 *
 * ## Pressing
 *
 * The cap travels a point and a half into its housing and the shadow collapses
 * with it. Small on purpose: a control that travels far reads as a toy, and
 * this one sits next to a shutter.
 */
export interface IconButtonProps {
  icon: ReactNode;
  onPress?: () => void;
  /** Always required — the button has no text to announce. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** Diameter. Never below the 44pt target (§50), which is also the default. */
  size?: number;
  /** A latched control: an engaged flash, an open panel. */
  selected?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  size = MIN_TOUCH_TARGET,
  selected,
  disabled,
  style,
  testID,
}: IconButtonProps) {
  const pressed = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const diameter = Math.max(MIN_TOUCH_TARGET, size);

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateY: reducedMotion ? 0 : pressed.value * 1.5 }],
    shadowOpacity: interpolate(pressed.value, [0, 1], [0.13, 0.04]),
    shadowRadius: interpolate(pressed.value, [0, 1], [14, 4]),
  }));
  const face = useAnimatedStyle(() => ({ opacity: 1 - pressed.value }));

  /* eslint-disable react-hooks/immutability */
  const pressIn = () => {
    pressed.value = withTiming(1, { duration: motion.instant, easing: Easing.out(Easing.quad) });
  };
  const pressOut = () => {
    pressed.value = withTiming(0, { duration: motion.quick, easing: Easing.out(Easing.quad) });
  };
  /* eslint-enable react-hooks/immutability */

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled}
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={() => {
        if (disabled) return;
        haptics.engage();
        onPress?.();
      }}
      style={style}
    >
      <Animated.View
        style={[
          styles.body,
          { width: diameter, height: diameter, borderRadius: diameter / 2 },
          selected ? styles.selected : null,
          disabled ? styles.disabled : null,
          animated,
        ]}
      >
        {/* The depressed face sits underneath and is revealed as the cap fades. */}
        <LinearGradient
          colors={SURFACES.buttonCapPressed}
          start={LIGHT.face.start}
          end={LIGHT.face.end}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <Animated.View style={[StyleSheet.absoluteFill, face]} pointerEvents="none">
          <LinearGradient
            colors={SURFACES.buttonCap}
            start={LIGHT.face.start}
            end={LIGHT.face.end}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <View style={styles.glyph}>{icon}</View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ring,
    backgroundColor: colors.surfaceRaised,
    ...shadows.float,
  },
  // A latched control lights its rim rather than filling: the glyph stays
  // readable, and the state is visible at a glance across the panel.
  selected: { borderColor: colors.signal, borderWidth: 1.5 },
  disabled: { opacity: 0.45 },
  /*
   * The glyph needs its own stacking context.
   *
   * CSS paints positioned descendants above non-positioned ones regardless of
   * source order, so the two absolutely-positioned gradient layers can cover a
   * glyph that is correct in the DOM — which is exactly how `ProfileButton`
   * once rendered as a blank disc, visible only in a screenshot. It happens to
   * paint correctly here without this, and that is not a reason to leave a
   * known hazard to chance.
   */
  glyph: { alignItems: 'center', justifyContent: 'center', zIndex: 1 },
});
