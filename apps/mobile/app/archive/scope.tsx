import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { Text } from '../../src/design/components/Text';
import { colors, space } from '../../src/design/tokens';
import { useArchive } from '../../src/state/archive';

/**
 * What this archive is (§36).
 *
 * Shown once, before the first entry, and reachable afterwards from the archive
 * header. It exists because the material in here is genuinely easy to
 * misread: a carefully sourced record of a 1930s claim looks, on a phone screen,
 * very much like a recommendation.
 *
 * The most important paragraph is the second one. Rife's apparatus emitted
 * electromagnetic energy from a gas-filled tube; this app makes sound in
 * headphones. Whatever one believes about the original work, a 2128 Hz tone in
 * your ears is not that machine, and the archive says so before it shows a
 * single frequency.
 */
export default function ArchiveScopeScreen() {
  const router = useRouter();
  const acknowledge = useArchive((state) => state.acknowledge);
  const acknowledgedAt = useArchive((state) => state.acknowledgedAt);

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Before you browse"
        title="What this archive is"
        subtitle="A historical record, kept accurately. Not a set of instructions."
      />

      <InstrumentPanel tone="raised">
        <Text variant="body" tone="secondary">
          This is an archive of frequencies that appear in historical documents, traditional
          systems and published research. Every record says where its number came from and how
          well that source holds up. Including a frequency here means it was documented — it does
          not mean it does anything.
        </Text>
      </InstrumentPanel>

      <SectionHeader label="Sound is not the original apparatus" />
      <View style={styles.emphasis}>
        <Text variant="body">
          Historical Rife equipment was electrical and electromagnetic. It applied energy through
          plasma tubes and electrodes at radio frequencies. This app generates{' '}
          <Text variant="body" tone="signal">
            acoustic sound through your headphones
          </Text>
          , which is a different physical phenomenon entirely.
        </Text>
        <Text variant="body" tone="secondary" style={styles.emphasisTail}>
          Playing an archived number as a tone is not equivalent to that equipment, and this app
          makes no claim that it reproduces any effect attributed to it. Where a value has to be
          divided or turned into a beat to be audible at all, the app shows you both numbers before
          anything plays.
        </Text>
      </View>

      <SectionHeader label="Claims are quoted, not adopted" />
      <Text variant="body" tone="secondary">
        Where a source attached a medical claim to a frequency, the claim is reproduced as a
        quotation, attributed to whoever made it, and paired with a statement of what current
        evidence supports. Nothing in this archive is a treatment, and no entry tells you to use a
        frequency for a condition.
      </Text>

      <SectionHeader label="Medical care" />
      <Text variant="body" tone="secondary">
        Nothing here diagnoses, treats, cures or prevents any disease. If you have a medical
        condition, this archive is not a reason to change anything about your care. Talk to a
        clinician.
      </Text>

      <SectionHeader label="What is held here" />
      <InstrumentPanel tone="recessed">
        <Text variant="bodySm" tone="secondary">
          The published Rife frequency tables that circulate online cannot be traced to a
          verifiable primary document. Printing them here with citations attached would fabricate a
          provenance chain that does not exist, so this archive does not ship them. What it ships
          instead is the record of the historical episode itself, entries that can be sourced, and
          an import path that keeps your own lists with an honest account of where you got them.
        </Text>
      </InstrumentPanel>

      <HardwareButton
        label={acknowledgedAt ? 'Back to the archive' : 'I understand — open the archive'}
        variant="primary"
        size="lg"
        onPress={() => {
          void acknowledge();
          router.back();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  emphasis: {
    padding: space.lg,
    gap: space.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.signal,
    backgroundColor: colors.surface,
  },
  emphasisTail: { marginTop: space.xxs },
});
