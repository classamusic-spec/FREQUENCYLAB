import { useRouter } from 'expo-router';
import { colors } from '../tokens';
import { PersonIcon } from './Icons';
import { IconButton } from './IconButton';

/**
 * The way to your own settings, from anywhere.
 *
 * Profile used to hold a slot in the tab bar, which is expensive real estate
 * for a screen nobody opens twice a week — and it pushed the five surfaces that
 * *are* the product into a narrower bar. It sits in the top right of every main
 * screen instead: the place a person already looks for their own account, and a
 * corner rather than a whole sixth of the bottom edge.
 *
 * It used to build its own disc — a gradient, a rim, a `zIndex` workaround for
 * a web stacking bug, and an opacity fade standing in for a press. All of that
 * is `IconButton` now, which is the same part every other round control on the
 * chassis is made from: it presses like a cap rather than dimming like a link,
 * and its rim and shadow match the switches beside it instead of approximating
 * them.
 */
export function ProfileButton() {
  const router = useRouter();

  return (
    <IconButton
      accessibilityLabel="Profile and settings"
      accessibilityHint="Your listening history, safety settings and the library shortcuts."
      onPress={() => router.push('/profile')}
      icon={<PersonIcon size={20} color={colors.textSecondary} strokeWidth={1.7} />}
    />
  );
}
