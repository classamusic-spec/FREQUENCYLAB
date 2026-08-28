import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  CLASSIFICATION_DESCRIPTIONS,
  FACTORY_COLLECTIONS,
  presetsInCollection,
  type FrequencyCollection,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel } from '../../src/design/components/InstrumentPanel';
import { ClassificationBadge } from '../../src/design/components/Badges';
import { Label, Text } from '../../src/design/components/Text';
import { colors, layout, MIN_TOUCH_TARGET, radius, space } from '../../src/design/tokens';
import { usePresetShelf } from '../../src/state/presets';
import { useProtocolLibrary } from '../../src/state/library';

/**
 * The collection browser (§3).
 *
 * A library surface, not an instrument one: no knobs, no glass, no brushed
 * metal beyond the chassis every screen sits on. Twelve shelves in the order
 * the data declares them, each with its number, what is on it, and the
 * classification of the shelf as a whole.
 *
 * That last badge is a heading and never a verdict on a row. A Solfeggio shelf
 * is `traditional` while 528 Hz on it also carries emerging research, so the
 * panel under the list says so in as many words — the badge that decides
 * anything is the one on the preset.
 *
 * Two shelves have no factory rows and are not stubs. Historical / Rife opens
 * the archive, which already holds those numbers with their provenance, their
 * claim rebuttals and their own version counters; duplicating them here would
 * fork data that is versioned elsewhere, which is the one failure this design
 * is arranged to prevent. My Frequencies is assembled from what the user has
 * starred, played and built.
 */
export default function CollectionsScreen() {
  const router = useRouter();
  const hydrate = usePresetShelf((state) => state.hydrate);
  const hydrated = usePresetShelf((state) => state.hydrated);
  const favorites = usePresetShelf((state) => state.favorites);
  const plays = usePresetShelf((state) => state.plays);
  const protocols = useProtocolLibrary((state) => state.protocols);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrate, hydrated]);

  const mine = favorites.length + new Set(plays.map((play) => play.presetId)).size + protocols.length;

  const shelves = useMemo(
    () =>
      FACTORY_COLLECTIONS.map((entry) => ({
        collection: entry,
        count: entry.sourcedElsewhere ? undefined : presetsInCollection(entry.id).length,
      })),
    [],
  );

  return (
    <Screen bottomInset={layout.transportHeight}>
      <ScreenHeader
        eyebrow="Collections"
        title="Frequency collections"
        subtitle="Twelve shelves. Every preset on them says what its number is, what the sound actually does, and where its standing comes from."
      />

      {shelves.map(({ collection, count }) => (
        <Pressable
          key={collection.id}
          onPress={() => router.push(routeFor(collection))}
          accessibilityRole="button"
          accessibilityLabel={`${collection.name}. ${collection.summary} ${
            count === undefined ? '' : `${count} presets.`
          }`}
          style={styles.card}
        >
          <View style={styles.head}>
            <View style={styles.title}>
              <Label>{collection.ordinal}</Label>
              <Text variant="heading" style={styles.name}>
                {collection.name}
              </Text>
            </View>
            <View style={styles.count}>
              <Text variant="readoutSm" tone="secondary">
                {count === undefined
                  ? collection.id === 'my-frequencies'
                    ? String(mine)
                    : '—'
                  : String(count)}
              </Text>
              <Label>{countCaption(collection, count)}</Label>
            </View>
          </View>

          <Text variant="bodySm" tone="secondary">
            {collection.summary}
          </Text>

          <ClassificationBadge
            classification={collection.classification}
            note={CLASSIFICATION_DESCRIPTIONS[collection.classification]}
          />
        </Pressable>
      ))}

      <SectionHeader label="What the shelf badge means" />
      <InstrumentPanel tone="recessed">
        <Text variant="bodySm" tone="secondary">
          The badge on a shelf describes the collection as a whole, and rows on it can differ. The
          Solfeggio shelf is traditional, and 528 Hz on that shelf also carries a study — so the
          classification that decides anything is the one on the preset itself, never this one.
        </Text>
      </InstrumentPanel>
    </Screen>
  );
}

/**
 * Where a shelf leads.
 *
 * The two shelves without factory rows lead somewhere real rather than to an
 * empty list: the archive holds the historical material already, and My
 * Frequencies is built from the user's own records.
 */
function routeFor(collection: FrequencyCollection): string {
  if (collection.id === 'historical-rife') return '/archive';
  return `/collections/${collection.id}`;
}

function countCaption(collection: FrequencyCollection, count: number | undefined): string {
  if (count !== undefined) return count === 1 ? 'Preset' : 'Presets';
  return collection.id === 'historical-rife' ? 'In the archive' : 'Yours';
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.md,
    minHeight: MIN_TOUCH_TARGET,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
  },
  head: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  title: { flex: 1, gap: space.xxs },
  name: { flexShrink: 1 },
  count: { alignItems: 'flex-end', gap: 2 },
});
