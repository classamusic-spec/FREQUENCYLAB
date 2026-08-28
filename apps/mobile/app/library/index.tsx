import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  EVIDENCE_DESCRIPTIONS,
  LIBRARY_ENTRIES,
  searchLibrary,
  searchPresets,
  type LibraryCategory,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { SegmentSelector } from '../../src/design/components/SegmentSelector';
import { EvidenceBadge } from '../../src/design/components/Badges';
import { PresetCard } from '../../src/design/components/PresetCard';
import { Label, Text } from '../../src/design/components/Text';
import { colors, radius, space } from '../../src/design/tokens';
import { usePresetShelf } from '../../src/state/presets';

const CATEGORIES: { value: LibraryCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'research', label: 'Research' },
  { value: 'acoustics', label: 'Acoustics' },
  { value: 'historical', label: 'Historical' },
];

/** Results above this many are cut, with the count still stated. */
const PRESET_RESULT_LIMIT = 12;

/**
 * The frequency library (§14, §25).
 *
 * Entries are grouped by what kind of claim they are, not by how appealing they
 * sound, and the evidence rating is on the card rather than buried in the
 * detail view. An unsupported claim is listed and labelled rather than omitted:
 * a user who has read about Rife frequencies elsewhere is better served by
 * finding an honest entry here than by finding nothing.
 *
 * The search field searches the preset shelves as well as these entries,
 * because people arrive carrying words — `528`, `7.83`, `schumann`, `theta`,
 * `pink noise`, `healing frequencies` — and a search that comes back empty does
 * not stop anybody believing a claim; it sends them somewhere that will agree
 * with them. Discovery is not the enemy. What makes it safe is that every
 * preset row carries its classification, so nothing is validated merely by
 * being findable.
 */
export default function LibraryScreen() {
  const router = useRouter();
  const [category, setCategory] = useState<LibraryCategory | 'all'>('all');
  const [query, setQuery] = useState('');

  const hydrate = usePresetShelf((state) => state.hydrate);
  const hydrated = usePresetShelf((state) => state.hydrated);
  const favorites = usePresetShelf((state) => state.favorites);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrate, hydrated]);

  const searching = query.trim().length > 0;

  const entries = useMemo(() => {
    const found = searching ? searchLibrary(query) : LIBRARY_ENTRIES;
    return category === 'all' ? found : found.filter((entry) => entry.category === category);
  }, [category, query, searching]);

  // Unlimited so the count is the real one, then cut for display: "42 matching"
  // followed by twelve rows is honest, "12 matching" would not be.
  const presets = useMemo(() => (searching ? searchPresets(query) : []), [query, searching]);

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Library"
        title="Frequency library"
        subtitle="What is actually known, what is only claimed, and how to tell them apart."
      />

      <InstrumentPanel tone="recessed" bare>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search a frequency, a name, or a band"
          placeholderTextColor={colors.textDisabled}
          autoCorrect={false}
          accessibilityLabel="Search the library and the preset collections"
          testID="library-search"
          style={styles.search}
        />
      </InstrumentPanel>
      <Text variant="caption" tone="tertiary">
        A number ({'“'}528{'”'}, {'“'}7.83{'”'}), a name ({'“'}schumann{'”'}, {'“'}solfeggio{'”'}),
        a band ({'“'}theta{'”'}) or a colour ({'“'}pink noise{'”'}) all find something. Every preset
        found carries its classification: being findable here is not being endorsed.
      </Text>

      {searching ? (
        <>
          <SectionHeader label={`Presets · ${presets.length} matching`} />
          {presets.length === 0 ? (
            <Text variant="bodySm" tone="tertiary">
              No preset holds that. That is a statement about this app&apos;s shelves, not about the
              number — the frequency translator will still tell you what it would sound like.
            </Text>
          ) : (
            presets.slice(0, PRESET_RESULT_LIMIT).map((result) => (
              <PresetCard
                key={result.preset.id}
                preset={result.preset}
                favorite={favorites.includes(result.preset.id)}
                matchReason={`Matched on ${result.matchedOn.join(', ')} · ${
                  result.classificationNote
                }`}
                onPress={() => router.push(`/preset/${result.preset.id}`)}
              />
            ))
          )}
          {presets.length > PRESET_RESULT_LIMIT ? (
            <HardwareButton
              label="Browse the collections"
              variant="ghost"
              onPress={() => router.push('/collections')}
            />
          ) : null}
        </>
      ) : (
        <HardwareButton
          label="Browse the collections"
          onPress={() => router.push('/collections')}
          accessibilityHint="Twelve shelves of presets, each row with its own classification."
        />
      )}

      <SectionHeader label={searching ? `Explained · ${entries.length} matching` : 'Explained'} />
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
  search: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    color: colors.text,
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 15,
    minHeight: 48,
  },
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
