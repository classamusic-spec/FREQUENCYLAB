import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, MIN_TOUCH_TARGET, motion, radius, space } from '../tokens';
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
  accessibilityHint?: string;
  testID?: string;
}

/**
 * A physical button.
 *
 * Pressing it depresses the cap: the surface darkens, the top highlight moves
 * to the bottom, and the whole control scales down by a hair. The movement is
 * small on purpose — a button that travels far reads as a toy.
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
  accessibilityHint,
  testID,
}: HardwareButtonProps) {
  const pressed = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const inactive = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reducedMotion ? 1 : 1 - pressed.value * 0.015 }],
    opacity: 1 - pressed.value * 0.12,
  }));

  // Plain functions rather than callbacks: they write to a Reanimated shared
  // value, which must not be captured as a hook dependency.
  const handlePressIn = () => {
    pressed.value = withTiming(1, { duration: motion.instant, easing: Easing.out(Easing.quad) });
  };

  const handlePressOut = () => {
    pressed.value = withTiming(0, { duration: motion.quick, easing: Easing.out(Easing.quad) });
  };

  const handlePress = () => {
    if (inactive) return;
    haptics.engage();
    onPress?.();
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
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
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <Text
          variant={size === 'sm' ? 'label' : 'labelLg'}
          uppercase
          tone={
            inactive
              ? 'disabled'
              : variant === 'primary'
                ? 'primary'
                : variant === 'danger'
                  ? 'limit'
                  : selected
                    ? 'signal'
                    : 'secondary'
          }
        >
          {loading ? 'Working' : label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const SIZE_STYLE: Record<ButtonSize, ViewStyle> = {
  sm: { minHeight: 34, paddingHorizontal: space.md },
  md: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: space.lg },
  lg: { minHeight: 54, paddingHorizontal: space.xl },
};

const VARIANT_STYLE: Record<ButtonVariant, ViewStyle> = {
  primary: {
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.signalDim,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.signal,
  },
  secondary: {
    backgroundColor: colors.surfaceRaised,
    borderTopColor: colors.edgeLight,
    borderBottomColor: colors.edgeDark,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: colors.hairline,
    borderWidth: StyleSheet.hairlineWidth,
  },
  danger: {
    backgroundColor: colors.surfaceRaised,
    borderColor: 'rgba(224, 112, 92, 0.35)',
    borderWidth: StyleSheet.hairlineWidth,
  },
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.control,
  },
  selected: {
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.signalDim,
    borderWidth: StyleSheet.hairlineWidth,
  },
  disabled: {
    opacity: 0.45,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
