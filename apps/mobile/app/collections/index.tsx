import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  CLASSIFICATION_DESCRIPTIONS,
  FACTORY_COLLECTIONS,
  presetsInCollection,
  type FrequencyCollection,
  type PresetClassification,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader } from '../../src/design/components/Screen';
import { ClassificationBadge } from '../../src/design/components/Badges';
import { ClassificationSheet } from '../../src/design/components/ClassificationSheet';
import { Label, Text } from '../../src/design/components/Text';
import { colors, layout, MIN_TOUCH_TARGET, radius, space } from '../../src/design/tokens';
import { usePresetShelf } from '../../src/state/presets';
import { useProtocolLibrary } from '../../src/state/library';
import { NotAtThisLevel } from '../../src/design/components/NotAtThisLevel';
import { useTier } from '../../src/features/tier';

/**
 * The collection browser (§3).
 *
 * A library surface, not an instrument one: no knobs, no glass, no brushed
 * metal beyond the chassis every screen sits on. Twelve shelves in the order
 * the data declares them, each with its number, what is on it, and the
 * classification of the shelf as a whole.
 *
 * That last badge is a heading and never a verdict on a row. A Solfeggio shelf
 * is `traditional` while 528 Hz on it also carries emerging research — which
 * used to be said in a panel under the list, where it applied to twelve shelves
 * and sat beside none of them. It is now the second paragraph of the sheet the
 * badge itself opens, so the caveat arrives attached to the shelf it qualifies
 * and one tap from it. The badge is a sibling of the card's pressable rather
 * than nested inside it, so a tap on the badge cannot also change screen.
 *
 * Two shelves have no factory rows and are not stubs. Historical / Rife opens
 * the archive, which already holds those numbers with their provenance, their
 * claim rebuttals and their own version counters; duplicating them here would
 * fork data that is versioned elsewhere, which is the one failure this design
 * is arranged to prevent. My Frequencies is assembled from what the user has
 * starred, played and built.
 */
export default function CollectionsScreen() {
  const { canSee } = useTier();
  const router = useRouter();
  const hydrate = usePresetShelf((state) => state.hydrate);
  const hydrated = usePresetShelf((state) => state.hydrated);
  const favorites = usePresetShelf((state) => state.favorites);
  const plays = usePresetShelf((state) => state.plays);
  const protocols = useProtocolLibrary((state) => state.protocols);
  const [explaining, setExplaining] = useState<PresetClassification | null>(null);

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

  /*
   * The library is off at Simple, and its tab does not exist there — so this
   * screen is only ever reached by a link or a typed address. The door says
   * what is behind it rather than rendering a version of the page with the
   * numbers taken out, which would leave nothing (§80, and the rule in
   * `features/tier`: a tier hides vocabulary and controls, never honesty).
   */
  if (!canSee('library')) {
    return (
      <NotAtThisLevel
        eyebrow="Library"
        title="Collections"
        subtitle="The shelves this library is arranged on."
        explanation="The collections are the frequency library's shelves — every one of them a list of numbers and the claims attached to them. They belong to Explorer and Lab. Simple plays sessions without naming the numbers inside them."
      />
    );
  }

  return (
    <Screen bottomInset={layout.transportHeight}>
      <ScreenHeader
        eyebrow="Collections"
        title="Frequency collections"
        subtitle="Twelve shelves. Tap a badge for what it means."
      />

      {shelves.map(({ collection, count }) => (
        <View key={collection.id} style={styles.card}>
          <Pressable
            onPress={() => router.push(routeFor(collection))}
            accessibilityRole="button"
            accessibilityLabel={`${collection.name}. ${collection.summary} ${
              count === undefined ? '' : `${count} presets.`
            }`}
            style={styles.pressable}
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
          </Pressable>

          <ClassificationBadge
            classification={collection.classification}
            note={CLASSIFICATION_DESCRIPTIONS[collection.classification]}
            onPress={() => setExplaining(collection.classification)}
          />
        </View>
      ))}

      {explaining ? (
        <ClassificationSheet
          current={explaining}
          scope="shelf"
          onClose={() => setExplaining(null)}
        />
      ) : null}
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
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
  },
  pressable: { gap: space.md, minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  head: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  title: { flex: 1, gap: space.xxs },
  name: { flexShrink: 1 },
  count: { alignItems: 'flex-end', gap: 2 },
});
