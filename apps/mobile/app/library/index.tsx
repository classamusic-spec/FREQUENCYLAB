import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  EVIDENCE_DESCRIPTIONS,
  LIBRARY_ENTRIES,
  searchLibrary,
  type LibraryCategory,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel } from '../../src/design/components/InstrumentPanel';
import { SegmentSelector } from '../../src/design/components/SegmentSelector';
import { EvidenceBadge } from '../../src/design/components/Badges';
import { Label, Text } from '../../src/design/components/Text';
import { colors, radius, space } from '../../src/design/tokens';

const CATEGORIES: { value: LibraryCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'research', label: 'Research' },
  { value: 'acoustics', label: 'Acoustics' },
  { value: 'historical', label: 'Historical' },
];

/**
 * The frequency library (§14).
 *
 * Entries are grouped by what kind of claim they are, not by how appealing they
 * sound, and the evidence rating is on the card rather than buried in the
 * detail view. An unsupported claim is listed and labelled rather than omitted:
 * a user who has read about Rife frequencies elsewhere is better served by
 * finding an honest entry here than by finding nothing.
 */
export default function LibraryScreen() {
  const router = useRouter();
  const [category, setCategory] = useState<LibraryCategory | 'all'>('all');
  const [query] = useState('');

  const entries = useMemo(() => {
    const found = query ? searchLibrary(query) : LIBRARY_ENTRIES;
    return category === 'all' ? found : found.filter((entry) => entry.category === category);
  }, [category, query]);

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Library"
        title="Frequency library"
        subtitle="What is actually known, what is only claimed, and how to tell them apart."
      />

      <SegmentSelector
        scrollable
        accessibilityLabel="Category"
        options={CATEGORIES.map((entry) => ({ value: entry.value, label: entry.label }))}
        value={category}
        onChange={(value) => setCategory(value as LibraryCategory | 'all')}
      />

      {entries.map((entry) => (
        <Pressable
          key={entry.id}
          onPress={() => router.push(`/library/${entry.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`${entry.title}. ${entry.subtitle}`}
          style={styles.card}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardTitle}>
              <Text variant="heading">{entry.title}</Text>
              <Text variant="bodySm" tone="secondary">
                {entry.subtitle}
              </Text>
            </View>
            {entry.frequencyHz !== undefined ? (
              <View style={styles.frequency}>
                <Text variant="readout" tone="secondary">
                  {entry.frequencyHz}
                </Text>
                <Label>{entry.frequencyKind === 'carrier' ? 'Hz carrier' : 'Hz rate'}</Label>
              </View>
            ) : null}
          </View>
          <EvidenceBadge level={entry.evidence} compact />
        </Pressable>
      ))}

      <SectionHeader label="What the ratings mean" />
      <InstrumentPanel tone="recessed">
        {(Object.keys(EVIDENCE_DESCRIPTIONS) as (keyof typeof EVIDENCE_DESCRIPTIONS)[]).map(
          (level) => (
            <View key={level} style={styles.ratingRow}>
              <EvidenceBadge level={level} />
              <Text variant="caption" tone="tertiary" style={styles.ratingText}>
                {EVIDENCE_DESCRIPTIONS[level]}
              </Text>
            </View>
          ),
        )}
      </InstrumentPanel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  cardHeader: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  cardTitle: { flex: 1, gap: space.xxs },
  frequency: { alignItems: 'flex-end' },
  ratingRow: { gap: space.xs, paddingVertical: space.sm },
  ratingText: { marginTop: space.xxs },
});
