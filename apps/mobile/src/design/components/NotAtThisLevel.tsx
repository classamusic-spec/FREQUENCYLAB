import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, ScreenHeader } from './Screen';
import { InstrumentPanel } from './InstrumentPanel';
import { HardwareButton } from './HardwareButton';
import { Text } from './Text';
import { space } from '../tokens';

/**
 * What a screen shows when the current experience level does not include it.
 *
 * ## Why a wall rather than a simplified screen
 *
 * The tiers hide vocabulary and controls, never honesty (see `features/tier`),
 * and for most screens that means showing fewer words rather than a locked
 * door. This component is for the other case: a whole section that Simple does
 * not have. The frequency library is the example — at Simple its tab does not
 * exist, so every route inside it is unreachable except by a link somebody was
 * sent or a URL they typed.
 *
 * Rewriting those screens in plain words would be the wrong answer twice over.
 * A preset page is a page *about a number* — where it came from, who claims
 * what about it, how strong the evidence is. Remove the number and there is no
 * page; keep it and the level meant nothing. So the door says what is behind
 * it and where the switch is, which is the one thing a person in that position
 * actually needs.
 *
 * ## What it must not do
 *
 * It must not sell the higher level, and it must not imply that anything is
 * being withheld for the user's protection. Nothing behind these doors is a
 * safety statement or a classification — those are shown at every level by
 * design. What is behind them is detail, and the copy says so plainly.
 */
export function NotAtThisLevel({
  eyebrow,
  title,
  subtitle,
  explanation,
}: {
  eyebrow: string;
  title: string;
  /** The one-line description of the screen, unchanged from the real one. */
  subtitle: string;
  /**
   * What is behind the door and why this level does not open it. States the
   * levels by name, because "upgrade" is a word for a shop.
   */
  explanation: string;
}) {
  const router = useRouter();
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <Screen>
      <ScreenHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
      <InstrumentPanel tone="raised" label="Not at this level">
        <Text variant="bodySm" tone="secondary">
          {explanation}
        </Text>
      </InstrumentPanel>
      <Text variant="caption" tone="tertiary">
        The level is a setting, not a purchase. Change it under You, and everything here opens.
      </Text>
      <View style={styles.actions}>
        <HardwareButton label="Done" variant="secondary" style={styles.action} onPress={leave} />
        <HardwareButton
          label="Open settings"
          variant="ghost"
          style={styles.action}
          onPress={() => router.push('/profile')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: space.sm },
  action: { flex: 1 },
});
