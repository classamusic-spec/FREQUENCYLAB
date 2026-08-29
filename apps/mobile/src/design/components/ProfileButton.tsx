import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { LIGHT, SURFACES } from '../materials';
import { colors, MIN_TOUCH_TARGET, radius } from '../tokens';
import { PersonIcon } from './Icons';
import * as haptics from '../haptics';

/**
 * The way to your own settings, from anywhere.
 *
 * Profile used to hold a slot in the tab bar, which is expensive real estate
 * for a screen nobody opens twice a week — and it pushed the five surfaces that
 * *are* the product into a narrower bar. It sits in the top right of every main
 * screen instead: the place a person already looks for their own account, and a
 * corner rather than a whole sixth of the bottom edge.
 *
 * Machined like every other control here — a raised disc, lit from the same
 * 135° the rest of the instrument is lit from — so it reads as part of the
 * chassis rather than as a web page's avatar.
 */
export function ProfileButton() {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => {
        haptics.engage();
        router.push('/profile');
      }}
      accessibilityRole="button"
      accessibilityLabel="Profile and settings"
      accessibilityHint="Your listening history, safety settings and the library shortcuts."
      hitSlop={10}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={SURFACES.panel}
        start={LIGHT.vertical.start}
        end={LIGHT.vertical.end}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.rim} pointerEvents="none" />
      <PersonIcon size={19} color={colors.textSecondary} />
    </Pressable>
  );
}

const SIZE = MIN_TOUCH_TARGET;

const styles = StyleSheet.create({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    // The disc reads as raised: a lit top edge against the chassis behind it.
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
  },
  rim: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.edgeDark,
  },
  pressed: { opacity: 0.72 },
});
