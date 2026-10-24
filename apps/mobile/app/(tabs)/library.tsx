import { useCallback, useEffect, useMemo, useState } from 'react';
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
  type FrequencyPreset,
  type LibraryCategory,
  type LibraryEntry,
  type PresetClassification,
} from '@frequencylab/dsp-core';
import { Screen, SectionHeader } from '../../src/design/components/Screen';
import { TitleBar } from '../../src/design/components/TitleBar';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { FilterChips } from '../../src/design/components/FilterChips';
import { MetalDisc } from '../../src/design/components/MetalDisc';
import { ChevronIcon, EllipsisIcon, SearchIcon, WaveformIcon } from '../../src/design/components/Icons';
import { ClassificationBadge, EvidenceBadge } from '../../src/design/components/Badges';
import { ClassificationSheet, EvidenceSheet } from '../../src/design/components/ClassificationSheet';
import { SoundBathSheet } from '../../src/design/components/SoundBathSheet';
import { PresetCard } from '../../src/design/components/PresetCard';
import { PlayRow } from '../../src/design/components/PlayRow';
import { Label, Text } from '../../src/design/components/Text';
import { colors, MIN_TOUCH_TARGET, radius, shadows, space } from '../../src/design/tokens';
import { plainWord, useTier } from '../../src/features/tier';
import { usePresetShelf } from '../../src/state/presets';
import { useSessionStart } from '../../src/state/sessionStart';
import { usePlayer } from '../../src/state/player';
import { compileRepresentation, protocolIdFor } from '../../src/features/presetPlayback';

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
 *
 * A catalogue, though, and not a set of links. `/collections/:id`,
 * `/collections` and `/preset/:id` are all behind a level door at `simple`, so
 * for a while every navigating control in this screen's Simple half — ten shelf
 * rows announcing their preset counts, the "All twelve shelves" button, and
 * every search result — landed on that door. Ten rows saying `8`, `12`, `9`
 * and opening nothing is the exact shape of the bug that was reported: *under
 * the sounds tab when I click a module there are no presets listed.*
 *
 * The fix is not to open the door, which would put a de-numbered preset screen
 * in front of someone at a level that shows no hertz, and it is not to hide the
 * shelves, which would take the catalogue away from the only level that has
 * nothing else to browse. It is that at `simple` those rows are listings: the
 * name, the count and the classification, announced as one node and pressing
 * nowhere. Every control shown works, and nothing true is removed.
 */
export default function LibraryScreen() {
  const router = useRouter();
  const { level, canSee, opensRoute } = useTier();
  const request = useSessionStart((state) => state.request);
  const recordPlay = usePresetShelf((state) => state.recordPlay);
  const snapshot = usePlayer((state) => state.snapshot);
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

  /**
   * Starts a search result, for the levels where a result plays rather than
   * opens. The same call the shelf and the preset screen make, so the preflight
   * safety sheet still stands in front of a first session.
   */
  const play = useCallback(
    (preset: FrequencyPreset) => {
      const kind = preset.representation.kind;
      const compiled = compileRepresentation(preset, kind, { id: protocolIdFor(preset, kind) });
      if (!compiled.ok) return;
      void recordPlay(preset, kind);
      void request(compiled.protocol, { onStarted: () => router.push('/session') });
    },
    [recordPlay, request, router],
  );

  const playingId = useMemo(() => {
    if (snapshot.state !== 'playing' && snapshot.state !== 'paused') return null;
    return (
      presets.find(
        ({ preset }) =>
          protocolIdFor(preset, preset.representation.kind) === snapshot.protocolId,
      )?.preset.id ?? null
    );
  }, [presets, snapshot.protocolId, snapshot.state]);

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
      <TitleBar
        section={explained ? 'Frequency Library' : 'Sounds and shelves'}
        right={{
          icon: <EllipsisIcon color={colors.textSecondary} />,
          onPress: () => router.push('/profile'),
          accessibilityLabel: 'More: profile and settings',
        }}
      />

      <View style={styles.searchField}>
        <SearchIcon size={20} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search frequencies, names, or bands…"
          placeholderTextColor={colors.textTertiary}
          autoCorrect={false}
          accessibilityLabel="Search the library and the preset collections"
          testID="library-search"
          style={styles.search}
        />
      </View>

      {explained ? (
        <FilterChips
          accessibilityLabel="Category"
          options={CATEGORIES}
          value={category}
          onChange={setCategory}
        />
      ) : null}

      <Text variant="caption" tone="tertiary">
        Every result carries its classification — findable is not endorsed. Tap any badge for what
        it means.
      </Text>

      {/* The explained entries lead: they are what this tab is named for, and
          the shelves follow them. */}
      {explained ? (
        <>
          {searching ? <SectionHeader label={`Explained · ${entries.length} matching`} /> : null}
          {entries.length > 0 ? (
            <View style={styles.list}>
              {entries.map((entry, index) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  first={index === 0}
                  onOpen={() => router.push(`/library/${entry.id}`)}
                  onBadge={() => setSheet({ kind: 'evidence', level: entry.evidence })}
                />
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      {searching ? (
        <>
          <SectionHeader label={`Presets · ${presets.length} matching`} />
          {!opensRoute('/preset') && presets.length > 0 ? (
            <Text variant="caption" tone="tertiary">
              Tap a result to play it. The page explaining where a number came from is part of
              Explorer and Lab; what is here plays at any level.
            </Text>
          ) : null}
          {presets.length === 0 ? (
            <Text variant="bodySm" tone="tertiary">
              No preset holds that. That is a statement about this app&apos;s shelves, not about the
              number
              {canSee('explore')
                ? ' — the frequency translator will still tell you what it would sound like.'
                : '.'}
            </Text>
          ) : (
            presets.slice(0, PRESET_RESULT_LIMIT).map((result) =>
              /*
               * A result leads to the page about its number where that page
               * exists, and plays where it does not. Both are a working tap,
               * which is the rule; what changes is which question the level is
               * in a position to ask.
               */
              opensRoute(`/preset/${result.preset.id}`) ? (
                <PresetCard
                  key={result.preset.id}
                  preset={result.preset}
                  favorite={favorites.includes(result.preset.id)}
                  matchReason={`Matched on ${result.matchedOn.join(', ')} · ${
                    result.classificationNote
                  }`}
                  onPress={() => router.push(`/preset/${result.preset.id}`)}
                />
              ) : (
                <PlayRow
                  key={result.preset.id}
                  preset={result.preset}
                  playing={playingId === result.preset.id}
                  onPress={() => play(result.preset)}
                />
              ),
            )
          )}
          {opensRoute('/collections') && presets.length > PRESET_RESULT_LIMIT ? (
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
          {/* At Simple the shelf is a catalogue entry rather than a door.
              `/collections/:id` is a list of frequencies by value and is gated
              at that level, so a row that navigated there was a control that
              could not work — ten of them in a column, each announcing a count
              it would not show. The rows stay, with their counts and their
              classifications, because what the app holds is a fact about the
              app. What goes is the promise of a tap. */}
          {shelves.map(({ collection, count }) => {
            const spoken = `${collection.name}. ${count} presets. ${collection.summary}`;
            const row = (
              <>
                <Label>{collection.ordinal}</Label>
                <Text variant="heading" style={styles.shelfName}>
                  {collection.name}
                </Text>
                <Text variant="readoutSm" tone="secondary">
                  {String(count)}
                </Text>
              </>
            );
            return (
              <View key={collection.id} style={styles.shelf}>
                {opensRoute(`/collections/${collection.id}`) ? (
                  <Pressable
                    onPress={() => router.push(`/collections/${collection.id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={spoken}
                    style={styles.shelfMain}
                  >
                    {row}
                  </Pressable>
                ) : (
                  <View accessible accessibilityLabel={spoken} style={styles.shelfMain}>
                    {row}
                  </View>
                )}
                {/* Sibling, never nested: one tap, one meaning. */}
                <ClassificationBadge
                  classification={collection.classification}
                  onPress={() =>
                    setSheet({ kind: 'classification', value: collection.classification })
                  }
                />
              </View>
            );
          })}
          {opensRoute('/collections') ? (
            <HardwareButton
              label="All twelve shelves"
              variant="ghost"
              onPress={() => router.push('/collections')}
              accessibilityHint="Includes the historical archive and your own frequencies."
            />
          ) : null}

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

      {explained ? null : (
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

/**
 * One explained entry: the number on a steel disc, what the entry is, where it
 * comes from, and its evidence rating.
 *
 * The rating is a sibling of the row rather than inside it — one tap, one
 * meaning — and the chevron is a second, smaller way into the same page,
 * hidden from screen readers so the row is announced once.
 */
function EntryRow({
  entry,
  first,
  onOpen,
  onBadge,
}: {
  entry: LibraryEntry;
  first: boolean;
  onOpen: () => void;
  onBadge: () => void;
}) {
  const source = entry.sources[0];
  const kind =
    entry.frequencyKind === 'carrier' ? 'Tone' : entry.frequencyKind === 'modulation' ? 'Rate' : null;
  const more = entry.sources.length > 1 ? ` + ${entry.sources.length - 1}` : '';
  return (
    <View style={[styles.entry, first ? null : styles.entryDivided]}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${entry.title}. ${entry.subtitle}`}
        style={styles.entryMain}
      >
        <MetalDisc value={entry.frequencyHz} size={56}>
          {/* No single number: an entry about noise or a practice gets a mark,
              never a figure made up to fill the disc. */}
          <WaveformIcon size={20} color={colors.textSecondary} />
        </MetalDisc>
        <View style={styles.entryText}>
          <Text style={styles.entryTitle} numberOfLines={2}>
            {entry.title}
          </Text>
          <Text style={styles.entrySubtitle} numberOfLines={2}>
            {entry.subtitle}
          </Text>
          {source ? (
            <Text style={styles.entrySource} numberOfLines={1}>
              {kind ? `${kind} · ` : ''}Source: {citeShort(source.authors, source.year)}
              {more}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <EvidenceBadge level={entry.evidence} chip onPress={onBadge} style={styles.entryBadge} />
      <Pressable
        onPress={onOpen}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
        tabIndex={-1}
        style={styles.entryChevron}
      >
        <ChevronIcon direction="right" size={16} color={colors.textTertiary} />
      </Pressable>
    </View>
  );
}

/** `Oster 1973`, `Liu et al. 2026`: the first author's surname and the year. */
function citeShort(authors: string, year: number): string {
  const first = authors.split(/,|&/)[0].trim();
  const several = /et al/.test(authors) || /&/.test(authors) || (authors.match(/,/g) ?? []).length > 1;
  return `${first}${several ? ' et al.' : ''} ${year}`;
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
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ring,
    ...shadows.float,
  },
  search: {
    flex: 1,
    paddingRight: space.lg,
    paddingVertical: space.md,
    color: colors.text,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    minHeight: 48,
  },
  list: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ring,
    paddingHorizontal: space.sm + 2,
    ...shadows.float,
  },
  entry: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
  entryDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairlineStrong },
  entryMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md - 2, minHeight: MIN_TOUCH_TARGET },
  entryText: { flex: 1, gap: 2 },
  entryTitle: { fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 19, color: colors.text },
  entrySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12.5, lineHeight: 16, color: colors.textSecondary },
  entrySource: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 15, color: colors.textTertiary, marginTop: 2 },
  entryBadge: { marginLeft: space.xs, paddingRight: 0 },
  entryChevron: { width: 20, minHeight: MIN_TOUCH_TARGET, alignItems: 'flex-end', justifyContent: 'center' },
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
});
