import { useRouter, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  DEFAULT_EXPLORER_RECIPE,
  EVIDENCE_DESCRIPTIONS,
  libraryEntry,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { EvidenceBadge } from '../../src/design/components/Badges';
import { Label, Text } from '../../src/design/components/Text';
import { colors, space } from '../../src/design/tokens';
import { useExplorer } from '../../src/state/explorer';

const SECTION_LABELS = [
  ['whatItIs', 'What it is'],
  ['howGenerated', 'How the signal is generated'],
  ['whatHasBeenStudied', 'What has been studied'],
  ['whatHasNotBeenEstablished', 'What has not been established'],
] as const;

/**
 * A library entry (§15).
 *
 * Four sections, always in the same order, and the fourth is not optional. The
 * sources list says what each paper actually showed, because the gap between
 * that and what a frequency is popularly claimed to do is the whole reason this
 * screen exists.
 */
export default function LibraryEntryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = libraryEntry(id);
  const setRecipe = useExplorer((state) => state.set);

  if (!entry) {
    return (
      <Screen>
        <ScreenHeader title="Not found" subtitle="This library entry does not exist." />
        <HardwareButton label="Back" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader eyebrow={entry.category} title={entry.title} subtitle={entry.subtitle} />

      <View style={styles.badgeRow}>
        <EvidenceBadge level={entry.evidence} />
        {entry.frequencyHz !== undefined ? (
          <View style={styles.frequency}>
            <Text variant="readoutLg">{entry.frequencyHz}</Text>
            <Label>{entry.frequencyKind === 'carrier' ? 'Hz · audible tone' : 'Hz · rate'}</Label>
          </View>
        ) : null}
      </View>

      <InstrumentPanel tone="recessed">
        <Text variant="caption" tone="tertiary">
          {EVIDENCE_DESCRIPTIONS[entry.evidence]}
        </Text>
      </InstrumentPanel>

      {SECTION_LABELS.map(([key, label]) => (
        <View key={key} style={styles.section}>
          <SectionHeader label={label} />
          <Text variant="body" tone="secondary">
            {entry[key]}
          </Text>
        </View>
      ))}

      <SectionHeader label="Sources" />
      {entry.sources.map((source, index) => (
        <InstrumentPanel key={index} tone="flat">
          <Text variant="bodySm">
            {source.authors} ({source.year}). {source.title}.
          </Text>
          <Text variant="caption" tone="tertiary" style={styles.publication}>
            {source.publication} · {source.kind.replace('-', ' ')}
          </Text>
          {source.note ? (
            <Text variant="caption" tone="secondary" style={styles.note}>
              {source.note}
            </Text>
          ) : null}
        </InstrumentPanel>
      ))}
      <Text variant="caption" tone="tertiary">
        References are given with enough detail to look up. Identifiers such as DOIs are
        deliberately omitted rather than reconstructed, because a wrong identifier is a fabricated
        citation even when the paper behind it is real.
      </Text>

      {entry.recipe ? (
        <>
          <SectionHeader label="Hear it" />
          <HardwareButton
            label="Load into Explorer"
            variant="primary"
            size="lg"
            onPress={() => {
              setRecipe({ ...DEFAULT_EXPLORER_RECIPE, ...entry.recipe });
              router.push('/explore');
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  frequency: { alignItems: 'flex-end' },
  section: { gap: space.xs },
  publication: { marginTop: space.xxs },
  note: {
    marginTop: space.sm,
    paddingLeft: space.md,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.hairlineStrong,
  },
});
