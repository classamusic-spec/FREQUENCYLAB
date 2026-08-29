import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  FACTORY_COLLECTIONS,
  LIBRARY_ENTRIES,
  buildSoundBathPresets,
  presetsInCollection,
  searchLibrary,
  searchPresets,
  type EvidenceLevel,
  type LibraryCategory,
  type PresetClassification,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { ProfileButton } from '../../src/design/components/ProfileButton';
import { InstrumentPanel } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { SegmentSelector } from '../../src/design/components/SegmentSelector';
import { ClassificationBadge, EvidenceBadge } from '../../src/design/components/Badges';
import { ClassificationSheet, EvidenceSheet } from '../../src/design/components/ClassificationSheet';
import { SoundBathSheet } from '../../src/design/components/SoundBathSheet';
import { PresetCard } from '../../src/design/components/PresetCard';
import { Label, Text } from '../../src/design/components/Text';
import { colors, MIN_TOUCH_TARGET, radius, space } from '../../src/design/tokens';
import { plainWord, useTier } from '../../src/features/tier';
import { usePresetShelf } from '../../src/state/presets';

const CATEGORIES: { value: LibraryCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'research', label: 'Research' },
  { value: 'acoustics', label: 'Acoustics' },
  { value: 'historical', label: 'Historical' },
];

/** Results above this many are cut, with the count still stated. */
const PRESET_RESULT_LIMIT = 12;

/** Which explanation sheet is open, and which value opened it. */
type OpenSheet =
  | { kind: 'evidence'; level: EvidenceLevel }
  | { kind: 'classification'; value: PresetClassification }
  | { kind: 'sounds' };

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
 * being findable. Search is therefore kept at **every** level, including the
 * one that hides the explained entries.
 *
 * ## Where five hundred words went
 *
 * This screen used to open with a paragraph of search advice and close with a
 * five-row key explaining the evidence ratings, and every entry row printed a
 * subtitle. That is the apparatus of the classification system laid out above
 * and below the rows it describes, which is the arrangement in which nobody
 * reads it. Every sentence of it still exists:
 *
 *  - the ratings key and the "findable is not endorsed" sentence are in
 *    `EvidenceSheet` / `ClassificationSheet`, opened by tapping any badge on
 *    this screen — one tap, from the row the question was asked about;
 *  - each entry's subtitle is the subtitle of its own screen, one tap away on
 *    the row itself, printed there beside the full four-section article.
 *
 * Nothing was deleted, and nothing that is a *claim* was moved: every row still
 * carries its rating in words beside a colour, at every level.
 *
 * ## What `simple` sees
 *
 * `canSee('library')` is false at `simple`, and the honest reading of that is
 * not an empty tab. What is aimed at Explorer is the frequency-by-frequency
 * evidence material — seventeen articles about carriers, bands and named
 * numbers, which are answers to questions a level that shows no hertz has not
 * raised. What is worth browsing at any level is the *catalogue*: the twelve
 * shelves, each with its classification, and the twenty sound baths, each with
 * a description of what is actually in it. So `simple` gets the catalogue and a
 * line saying plainly where the rest is.
 */
export default function LibraryScreen() {
  const router = useRouter();
  const { level, canSee } = useTier();
  const [category, setCategory] = useState<LibraryCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<OpenSheet | null>(null);

  const hydrate = usePresetShelf((state) => state.hydrate);
  const hydrated = usePresetShelf((state) => state.hydrated);
  const favorites = usePresetShelf((state) => state.favorites);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrate, hydrated]);

  const explained = canSee('library');
  const searching = query.trim().length > 0;

  const entries = useMemo(() => {
    if (!explained) return [];
    const found = searching ? searchLibrary(query) : LIBRARY_ENTRIES;
    return category === 'all' ? found : found.filter((entry) => entry.category === category);
  }, [category, explained, query, searching]);

  // Unlimited so the count is the real one, then cut for display: "42 matching"
  // followed by twelve rows is honest, "12 matching" would not be.
  const presets = useMemo(() => (searching ? searchPresets(query) : []), [query, searching]);

  const soundBaths = useMemo(() => buildSoundBathPresets(), []);

  /*
   * The shelves that actually hold factory rows. Historical/Rife and My
   * Frequencies are assembled elsewhere, so they live on the full collections
   * screen rather than in a list whose whole point is the preset counts.
   */
  const shelves = useMemo(
    () =>
      FACTORY_COLLECTIONS.filter((entry) => !entry.sourcedElsewhere).map((entry) => ({
        collection: entry,
        count: presetsInCollection(entry.id).length,
      })),
    [],
  );
  const totalPresets = useMemo(
    () => shelves.reduce((sum, entry) => sum + entry.count, 0),
    [shelves],
  );

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Library"
        title={explained ? 'Frequency library' : 'Sounds and shelves'}
        subtitle="Tap any badge for what it means."
        right={<ProfileButton />}
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
        Every result carries its classification — findable is not endorsed.
      </Text>

      {searching ? (
        <>
          <SectionHeader label={`Presets · ${presets.length} matching`} />
          {presets.length === 0 ? (
            <Text variant="bodySm" tone="tertiary">
              No preset holds that. That is a statement about this app&apos;s shelves, not about the
              number
              {canSee('explore')
                ? ' — the frequency translator will still tell you what it would sound like.'
                : '.'}
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
        <>
          {/* The shelves themselves, not a button leading to them. Seventy-two
              presets behind one more tap is seventy-two presets nobody opens. */}
          <SectionHeader label={`Collections · ${totalPresets} presets`} />
          {shelves.map(({ collection, count }) => (
            <View key={collection.id} style={styles.shelf}>
              <Pressable
                onPress={() => router.push(`/collections/${collection.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${collection.name}. ${count} presets. ${collection.summary}`}
                style={styles.shelfMain}
              >
                <Label>{collection.ordinal}</Label>
                <Text variant="heading" style={styles.shelfName}>
                  {collection.name}
                </Text>
                <Text variant="readoutSm" tone="secondary">
                  {String(count)}
                </Text>
              </Pressable>
              {/* Sibling, never nested: one tap, one meaning. */}
              <ClassificationBadge
                classification={collection.classification}
                onPress={() =>
                  setSheet({ kind: 'classification', value: collection.classification })
                }
              />
            </View>
          ))}
          <HardwareButton
            label="All twelve shelves"
            variant="ghost"
            onPress={() => router.push('/collections')}
            accessibilityHint="Includes the historical archive and your own frequencies."
          />

          {/* The catalogue half of the library, and the half that needs no
              hertz to be worth reading. Offered at every level; it is the only
              browsable list `simple` would otherwise not have. */}
          <SectionHeader label={plainWord('Acoustic layer', level)} />
          <Pressable
            onPress={() => setSheet({ kind: 'sounds' })}
            accessibilityRole="button"
            accessibilityLabel={`${soundBaths.length} sound baths. Read what is in each one.`}
            style={styles.disclosure}
          >
            <Text variant="heading">Sound baths</Text>
            <View style={styles.disclosureValue}>
              <Text variant="readoutSm" tone="secondary">
                {String(soundBaths.length)}
              </Text>
              <Label>{'›'}</Label>
            </View>
          </Pressable>
        </>
      )}

      {explained ? (
        <>
          <SectionHeader
            label={searching ? `Explained · ${entries.length} matching` : 'Explained'}
          />
          <SegmentSelector
            scrollable
            accessibilityLabel="Category"
            options={CATEGORIES.map((entry) => ({ value: entry.value, label: entry.label }))}
            value={category}
            onChange={(value) => setCategory(value as LibraryCategory | 'all')}
          />

          {entries.map((entry) => (
            <View key={entry.id} style={styles.card}>
              <Pressable
                onPress={() => router.push(`/library/${entry.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${entry.title}. ${entry.subtitle}`}
                style={styles.cardHeader}
              >
                <Text variant="heading" style={styles.cardTitle}>
                  {entry.title}
                </Text>
                {entry.frequencyHz !== undefined ? (
                  <View style={styles.frequency}>
                    <Text variant="readout" tone="secondary">
                      {entry.frequencyHz}
                    </Text>
                    <Label>{entry.frequencyKind === 'carrier' ? 'Hz carrier' : 'Hz rate'}</Label>
                  </View>
                ) : null}
              </Pressable>
              <EvidenceBadge
                level={entry.evidence}
                compact
                onPress={() => setSheet({ kind: 'evidence', level: entry.evidence })}
              />
            </View>
          ))}
        </>
      ) : (
        <Text variant="caption" tone="tertiary">
          The entries explaining each frequency one by one are written for
          Explorer, where the app shows its numbers. Profile changes the level.
        </Text>
      )}

      {sheet?.kind === 'evidence' ? (
        <EvidenceSheet current={sheet.level} onClose={() => setSheet(null)} />
      ) : null}
      {sheet?.kind === 'classification' ? (
        <ClassificationSheet
          current={sheet.value}
          scope="shelf"
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet?.kind === 'sounds' ? (
        <SoundBathSheet
          presets={soundBaths}
          title={plainWord('Acoustic layer', level)}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  /*
   * No vertical padding and no gap: the navigating row supplies 44 pt of its
   * own and the badge below it supplies another 44, so anything added here is
   * height on top of two targets that are already the right size. Ten shelves
   * is a list, and a list pays for every pixel ten times.
   */
  shelf: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
  },
  shelfMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: MIN_TOUCH_TARGET,
  },
  shelfName: { flex: 1 },
  search: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    color: colors.text,
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 15,
    minHeight: 48,
  },
  disclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    minHeight: MIN_TOUCH_TARGET,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
  },
  disclosureValue: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
  },
  cardTitle: { flex: 1 },
  frequency: { alignItems: 'flex-end' },
});
