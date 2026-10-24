import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, space } from '../tokens';
import { IconButton } from './IconButton';
import { Text } from './Text';

/**
 * The instrument's name plate.
 *
 * `FREQUENCY LAB` across the top of every main screen with the section beneath
 * it, between two round controls — the way a piece of hardware carries its name
 * on the faceplate and the mode it is in below. It replaces a left-aligned
 * eyebrow-and-title header that read like a web page.
 *
 * ## Corners only hold controls that do something
 *
 * The reference draws a chevron on the left of every screen. On a screen you
 * arrive at by tapping a tab there is nothing to go down *to*, and a chevron
 * that does nothing is a control that does not work (§92). So a corner is only
 * filled when the screen gives it a job — dismissing the player, leaving a
 * workspace — and is otherwise held by an empty space the same size, which
 * keeps the name plate centred.
 */
export interface TitleBarAction {
  icon: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  selected?: boolean;
}

export function TitleBar({
  section,
  left,
  right,
}: {
  /** The mode the instrument is in: `Player`, `Frequency Explorer`, `Lab`. */
  section: string;
  left?: TitleBarAction;
  right?: TitleBarAction;
}) {
  return (
    <View style={styles.bar} accessibilityRole="header">
      <Corner action={left} />
      <View style={styles.plate}>
        <Text style={styles.name} numberOfLines={1}>
          FREQUENCY LAB
        </Text>
        <Text style={styles.section} numberOfLines={1}>
          {section.toUpperCase()}
        </Text>
      </View>
      <Corner action={right} />
    </View>
  );
}

/**
 * The reference's corner discs are about 31 pt. These stay at 44, the minimum
 * touch target (§50) — a header control is reached for one-handed, and
 * react-native-web ignores hitSlop, so the visible disc is the target.
 */
const DISC = 44;

function Corner({ action }: { action?: TitleBarAction }) {
  if (!action) return <View style={styles.spacer} />;
  return (
    <IconButton
      size={DISC}
      icon={action.icon}
      onPress={action.onPress}
      accessibilityLabel={action.accessibilityLabel}
      accessibilityHint={action.accessibilityHint}
      selected={action.selected}
    />
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingTop: space.xs,
    paddingBottom: space.md,
  },
  spacer: { width: DISC, height: DISC },
  plate: { flex: 1, alignItems: 'center', gap: 5 },
  // Wide tracking is the whole character of the plate; the weight stays
  // medium so the spacing, not boldness, carries it.
  name: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    letterSpacing: 4.4,
    color: colors.text,
  },
  section: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    letterSpacing: 2.6,
    color: colors.textTertiary,
  },
});
