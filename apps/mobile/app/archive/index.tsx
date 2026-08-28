import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  CATEGORY_LABELS,
  findDisagreements,
  parseQuery,
  searchArchive,
  spectrumBuckets,
  type ArchiveCategory,
  type ArchiveEntry,
} from '@frequencylab/dsp-core';
import { EmptyState, Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { SegmentSelector } from '../../src/design/components/SegmentSelector';
import { ArchiveCard } from '../../src/design/components/ArchiveCard';
import { Label, Text } from '../../src/design/components/Text';
import { colors, radius, space } from '../../src/design/tokens';
import { useArchive } from '../../src/state/archive';

const FILTERS: { value: ArchiveCategory | 'all' | 'saved'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'saved', label: 'Saved' },
  { value: 'historical-rife', label: 'Historical Rife' },
  { value: 'traditional', label: 'Traditional' },
  { value: 'earth-resonance', label: 'Earth' },
  { value: 'research', label: 'Research' },
  { value: 'user-collection', label: 'Yours' },
];

/**
 * The historical archive (§34).
 *
 * An archive, not a menu of treatments. The organising principle is provenance:
 * records are grouped by where they came from, every card carries both a source
 * rating and an evidence rating, and the first thing on the screen after the
 * search field is a plain statement of what the archive does and does not hold.
 *
 * The scope notice is shown once and then reachable from the header, which is
 * the honest middle ground between burying it and re-interrupting a user who
 * has already read it (§36).
 */
export default function ArchiveScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ArchiveCategory | 'all' | 'saved'>('all');

  const hydrate = useArchive((state) => state.hydrate);
  const hydrated = useArchive((state) => state.hydrated);
  const acknowledgedAt = useArchive((state) => state.acknowledgedAt);
  const favorites = useArchive((state) => state.favorites);
  const userEntries = useArchive((state) => state.userEntries);
  const userSets = useArchive((state) => state.userSets);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrate, hydrated]);

  useEffect(() => {
    if (hydrated && !acknowledgedAt) router.push('/archive/scope');
  }, [acknowledgedAt, hydrated, router]);

  const entries = useArchive((state) => state.all)();
  const sets = useArchive((state) => state.sets)();

  const results = useMemo(() => {
    const parsed = parseQuery(query);
    const found = query.trim()
      ? searchArchive(entries, parsed)
      : entries.map((entry) => ({ entry, score: 0, reason: '' }));

    if (filter === 'all') return found;
    if (filter === 'saved') return found.filter((r) => favorites.includes(r.entry.id));
    return found.filter((r) => r.entry.category === filter);
  }, [entries, favorites, filter, query]);

  const disagreements = useMemo(() => findDisagreements(entries), [entries]);
  const buckets = useMemo(() => spectrumBuckets(entries, 28), [entries]);

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Archive"
        title="Historical frequencies"
        subtitle="What was claimed, who claimed it, and what the evidence actually supports."
        right={
          <Pressable
            onPress={() => router.push('/archive/scope')}
            accessibilityRole="button"
            accessibilityLabel="What this archive is"
            style={styles.infoButton}
          >
            <Text variant="label" tone="secondary">
              ?
            </Text>
          </Pressable>
        }
      />

      <InstrumentPanel tone="recessed" bare>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search a frequency, name, or source"
          placeholderTextColor={colors.textDisabled}
          keyboardType="default"
          autoCorrect={false}
          accessibilityLabel="Search the archive"
          style={styles.search}
        />
      </InstrumentPanel>
      <Text variant="caption" tone="tertiary">
        Type a number for an exact value ({'“'}2128{'”'}), a range ({'“'}700-900
        {'”'}), or any text. An exact search returns every record holding that value, even
        when the sources disagree about it.
      </Text>

      <SegmentSelector
        scrollable
        accessibilityLabel="Filter"
        options={FILTERS}
        value={filter}
        onChange={(value) => setFilter(value as ArchiveCategory | 'all' | 'saved')}
      />

      {query.trim().length === 0 ? (
        <>
          <SectionHeader label="Where the numbers sit" />
          <SpectrumMap
            buckets={buckets}
            onPick={(bucket) => setQuery(`${round(bucket.lowHz)}-${round(bucket.highHz)}`)}
          />

          <View style={styles.toolRow}>
            <HardwareButton
              label="Frequency translator"
              onPress={() => router.push('/archive/translator')}
              style={styles.tool}
            />
            <HardwareButton
              label="Import a list"
              onPress={() => router.push('/archive/import')}
              style={styles.tool}
            />
          </View>

          {disagreements.length > 0 ? (
            <HardwareButton
              label={`Compare conflicting sources (${disagreements.length})`}
              variant="ghost"
              onPress={() => router.push('/archive/compare')}
            />
          ) : null}

          {sets.length > 0 ? (
            <>
              <SectionHeader label="Collections" />
              {sets.map((collection) => (
                <Pressable
                  key={collection.id}
                  onPress={() => router.push(`/archive/set/${collection.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${collection.name}, ${collection.entryIds.length} entries`}
                  style={styles.setCard}
                >
                  <View style={styles.setHead}>
                    <Text variant="heading" style={styles.setName}>
                      {collection.name}
                    </Text>
                    <Label>{collection.entryIds.length} entries</Label>
                  </View>
                  <Text variant="bodySm" tone="secondary">
                    {collection.summary}
                  </Text>
                  <Label tone="tertiary">
                    {CATEGORY_LABELS[collection.category]} · {collection.source.title}
                  </Label>
                </Pressable>
              ))}
            </>
          ) : null}
        </>
      ) : null}

      <SectionHeader
        label={query.trim() ? `${results.length} matching` : `${results.length} records`}
      />

      {results.length === 0 ? (
        <EmptyState
          title="Nothing held under that"
          message={
            filter === 'saved'
              ? 'Frequencies you save from an entry screen appear here.'
              : 'This archive holds only entries that can be traced to a real document, plus anything you import. If you have a list, import it and it keeps its own provenance.'
          }
          action={
            filter === 'saved' ? undefined : (
              <HardwareButton label="Import a list" onPress={() => router.push('/archive/import')} />
            )
          }
        />
      ) : (
        results.map(({ entry, reason }) => (
          <ArchiveCard
            key={entry.id}
            entry={entry}
            matchReason={query.trim() ? reason : undefined}
            favorite={favorites.includes(entry.id)}
            onPress={() => router.push(`/archive/${entry.id}`)}
          />
        ))
      )}

      {userEntries.length === 0 && userSets.length === 0 ? (
        <InstrumentPanel tone="recessed" label="How the Rife material is held">
          <Text variant="bodySm" tone="secondary">
            Every number here is attributed to the era it is actually traceable to. The famous
            audio values (727/728, 784, 880, 2008, 2128) are documented to the 1950s Crane-era
            AZ-58 device — not to Rife&apos;s 1930s laboratory, whose papers record only radio
            frequencies. The modern condition-to-frequency compilations (CAFL, ETDFL) cannot be
            traced past their compilers, so they do not ship; import your own copy and it keeps
            its own honest provenance.
          </Text>
        </InstrumentPanel>
      ) : null}
    </Screen>
  );
}

/**
 * A logarithmic map of where the archive's values fall (§25).
 *
 * Log-spaced because the material spans four decades: a linear axis would put
 * every historical value in the first pixel. Bar height is a count and nothing
 * more — it says how much has been recorded near a frequency, not how good any
 * of it is.
 */
function SpectrumMap({
  buckets,
  onPick,
}: {
  buckets: { lowHz: number; highHz: number; entries: ArchiveEntry[] }[];
  onPick: (bucket: { lowHz: number; highHz: number }) => void;
}) {
  const peak = Math.max(1, ...buckets.map((bucket) => bucket.entries.length));
  return (
    <InstrumentPanel tone="display" bare>
      <View style={styles.spectrum}>
        {buckets.map((bucket, index) => {
          const height = bucket.entries.length === 0 ? 2 : 6 + (bucket.entries.length / peak) * 42;
          return (
            <Pressable
              key={index}
              disabled={bucket.entries.length === 0}
              onPress={() => onPick(bucket)}
              accessibilityRole="button"
              accessibilityLabel={`${bucket.entries.length} entries between ${round(
                bucket.lowHz,
              )} and ${round(bucket.highHz)} hertz`}
              style={styles.bucket}
            >
              <View
                style={[
                  styles.bar,
                  { height },
                  bucket.entries.length === 0 ? styles.barEmpty : null,
                ]}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.spectrumAxis}>
        <Label tone="displayDim">0.1 Hz</Label>
        <Label tone="displayDim">20 Hz</Label>
        <Label tone="displayDim">1 kHz</Label>
        <Label tone="displayDim">20 kHz</Label>
      </View>
    </InstrumentPanel>
  );
}

function round(hz: number): number {
  if (hz >= 100) return Math.round(hz);
  if (hz >= 1) return Math.round(hz * 10) / 10;
  return Math.round(hz * 1000) / 1000;
}

const styles = StyleSheet.create({
  infoButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRecessed,
  },
  search: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    color: colors.text,
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 15,
    minHeight: 48,
  },
  toolRow: { flexDirection: 'row', gap: space.sm },
  tool: { flex: 1 },
  setCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
  },
  setHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  setName: { flex: 1 },
  spectrum: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 56,
    gap: 2,
    paddingHorizontal: space.md,
    paddingTop: space.md,
  },
  bucket: { flex: 1, justifyContent: 'flex-end', minHeight: 44 },
  bar: {
    borderRadius: 1,
    backgroundColor: colors.displaySignal,
  },
  barEmpty: { backgroundColor: colors.displayDim },
  spectrumAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
});
