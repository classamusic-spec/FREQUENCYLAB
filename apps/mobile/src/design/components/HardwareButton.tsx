import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, MIN_TOUCH_TARGET, motion, radius, shadows, space } from '../tokens';
import { LIGHT, SURFACES } from '../materials';
import * as haptics from '../haptics';
import { useReducedMotion } from '../useReducedMotion';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface HardwareButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Renders in a persistent "engaged" state, e.g. a latched transport button. */
  selected?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
  /**
   * What a screen reader says instead of `label`.
   *
   * For the buttons whose label is a glyph. `label="◀"` announces as "black
   * left-pointing triangle", which is not what the button does.
   */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * A physical button.
 *
 * Pressing it depresses the cap: the surface darkens, the top highlight moves
 * to the bottom, and the whole control travels a point and a half into its
 * housing. The movement is small on purpose — a button that travels far reads
 * as a toy.
 *
 * ## The same part as everything else on the chassis
 *
 * It used to carry a top and bottom border and a tight, dark shadow, which made
 * it a lit *edge* rather than a whole object — fine beside a panel, wrong beside
 * a round control that had a rim all the way round. It now uses the shared
 * treatment: `shadows.float` for the lift, `colors.ring` for the rim, and the
 * lit top edge kept on top of the ring, since a real cap catches light along
 * its upper lip and is outlined everywhere.
 */
export function HardwareButton({
  label,
  onPress,
  variant = 'secondary',
  size = 'md',
  disabled,
  loading,
  selected,
  icon,
  style,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: HardwareButtonProps) {
  const pressed = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const inactive = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({
    // A real cap travels into its housing rather than shrinking. The shadow
    // collapses with it, which is what sells the depression.
    transform: [{ translateY: reducedMotion ? 0 : pressed.value * 1.5 }],
    shadowOpacity: interpolate(pressed.value, [0, 1], [0.13, 0.04]),
    shadowRadius: interpolate(pressed.value, [0, 1], [14, 4]),
  }));

  const capStyle = useAnimatedStyle(() => ({ opacity: 1 - pressed.value }));

  /*
   * Writing a Reanimated shared value from a press handler is the idiomatic way
   * to drive an animation off the render path; `react-hooks/immutability`
   * cannot tell it apart from a render-phase mutation, which is what it guards
   * against. Scoped to these two handlers only.
   */
  /* eslint-disable react-hooks/immutability */
  const handlePressIn = () => {
    pressed.value = withTiming(1, { duration: motion.instant, easing: Easing.out(Easing.quad) });
  };

  const handlePressOut = () => {
    pressed.value = withTiming(0, { duration: motion.quick, easing: Easing.out(Easing.quad) });
  };

  /* eslint-enable react-hooks/immutability */

  const handlePress = () => {
    if (inactive) return;
    haptics.engage();
    onPress?.();
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, selected: !!selected, busy: !!loading }}
      disabled={inactive}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      style={style}
    >
      <Animated.View
        style={[
          styles.base,
          SIZE_STYLE[size],
          VARIANT_STYLE[variant],
          selected ? styles.selected : null,
          inactive ? styles.disabled : null,
          animatedStyle,
        ]}
      >
        <LinearGradient
          colors={variant === 'primary' ? SURFACES.buttonPrimary : SURFACES.buttonCapPressed}
          start={LIGHT.face.start}
          end={LIGHT.face.end}
          style={styles.capLayer}
          pointerEvents="none"
        />
        <Animated.View style={[styles.capLayer, capStyle]} pointerEvents="none">
          <LinearGradient
            colors={variant === 'primary' ? SURFACES.buttonPrimary : SURFACES.buttonCap}
            start={LIGHT.face.start}
            end={LIGHT.face.end}
            style={styles.capLayer}
          />
        </Animated.View>
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <Text
          variant={size === 'sm' ? 'label' : 'labelLg'}
          uppercase
          tone={
            inactive
              ? 'disabled'
              : variant === 'danger'
                ? 'limit'
                : selected
                  ? 'signal'
                  : 'secondary'
          }
          style={variant === 'primary' && !inactive ? styles.primaryLabel : undefined}
        >
          {loading ? 'Working' : label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const SIZE_STYLE: Record<ButtonSize, ViewStyle> = {
  sm: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: space.md },
  md: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: space.lg },
  lg: { minHeight: 54, paddingHorizontal: space.xl },
};

const VARIANT_STYLE: Record<ButtonVariant, ViewStyle> = {
  primary: {
    borderTopColor: 'rgba(255,255,255,0.55)',
    borderBottomColor: 'rgba(24,86,168,0.55)',
  },
  secondary: {
    borderTopColor: 'rgba(255,255,255,0.95)',
    borderBottomColor: 'rgba(122,136,158,0.26)',
  },
  ghost: {
    borderTopColor: 'rgba(255,255,255,0.7)',
    borderBottomColor: 'rgba(122,136,158,0.16)',
  },
  danger: {
    borderTopColor: 'rgba(255,255,255,0.85)',
    borderBottomColor: 'rgba(178,52,56,0.35)',
  },
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.pill,
    overflow: 'hidden',
    // The rim, all the way round, under the lit top edge the variants add.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ring,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    ...shadows.float,
  },
  capLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  primaryLabel: { color: '#FFFFFF' },
  selected: {
    borderTopColor: colors.signal,
    borderBottomColor: 'rgba(59,139,245,0.4)',
  },
  disabled: {
    opacity: 0.45,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
