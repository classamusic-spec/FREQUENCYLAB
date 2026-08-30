import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BAND_BOUNDARY_NOTE,
  BAND_STATE_NOTE,
  CLASSIFICATION_DESCRIPTIONS,
  collection as findCollection,
  presetsInCollection,
  type CollectionId,
} from '@frequencylab/dsp-core';
import { EmptyState, Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { ClassificationBadge } from '../../src/design/components/Badges';
import { ClassificationSheet } from '../../src/design/components/ClassificationSheet';
import { PresetCard } from '../../src/design/components/PresetCard';
import { ProtocolCard } from '../../src/design/components/Cards';
import { Text } from '../../src/design/components/Text';
import { layout, space } from '../../src/design/tokens';
import { usePresetShelf } from '../../src/state/presets';
import { useProtocolLibrary, summariseLibrary } from '../../src/state/library';
import { NotAtThisLevel } from '../../src/design/components/NotAtThisLevel';
import {
  LiveCarrierBeat,
  LiveStereo,
} from '../../src/design/components/OnboardingDiagrams';
import { useTier } from '../../src/features/tier';

/**
 * One shelf (§3).
 *
 * The rows come from `presetsInCollection`, in declaration order, because the
 * order presets ship in is data rather than styling. Every row is a
 * `PresetCard`, so every row carries its own classification — a shelf heading
 * never stands in for one.
 *
 * The two collections with no factory rows are handled here rather than being
 * left to render as empty lists, because they are not empty: one is the
 * archive and the other is the user's own material.
 *
 * The shelf's classification used to be printed twice — once as a badge, once
 * as the same sentence spelled out underneath with the "rows carry their own"
 * caveat after it. The badge now opens `ClassificationSheet`, which holds both
 * of those sentences plus the six classifications this shelf is *not*, which is
 * what makes the one it is mean anything.
 */
export default function CollectionScreen() {
  const { opensRoute } = useTier();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const collection = findCollection(id as CollectionId);
  const [explaining, setExplaining] = useState(false);

  const hydrate = usePresetShelf((state) => state.hydrate);
  const hydrated = usePresetShelf((state) => state.hydrated);
  const favorites = usePresetShelf((state) => state.favorites);
  const favoritePresets = usePresetShelf((state) => state.favoritePresets);
  const recentPresets = usePresetShelf((state) => state.recentPresets);
  const protocols = useProtocolLibrary((state) => state.protocols);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrate, hydrated]);

  const presets = useMemo(
    () => (collection && !collection.sourcedElsewhere ? presetsInCollection(collection.id) : []),
    [collection],
  );

  /*
   * The library is off at Simple. The door says what is behind it rather than
   * rendering a version of the page with the numbers taken out, which would
   * leave nothing (§80, and the rule in `features/tier`: a tier hides
   * vocabulary and controls, never honesty) — every row on this shelf is a
   * `PresetCard` whose readout is a frequency, and a shelf of de-numbered
   * readouts is the same lie the preset screen was doored to avoid.
   *
   * This comment used to add "and its tab does not exist there, so this screen
   * is only ever reached by a link or a typed address". That was wrong when it
   * was written: the tab is listed at every level, named *Sounds* at Simple,
   * and it drew ten shelf rows straight into this door. The rows no longer
   * navigate at that level; the door stands for links and typed addresses,
   * which is what it was actually for.
   */
  if (!opensRoute('/collections')) {
    return (
      <NotAtThisLevel
        eyebrow="Library"
        title="Collection"
        subtitle="What is on this shelf, and where it came from."
        explanation="A collection lists frequencies by value and by the claims attached to them, which belongs to Explorer and Lab. Simple plays sessions without naming the numbers inside them."
      />
    );
  }

  if (!collection) {
    return (
      <Screen>
        <ScreenHeader title="Not found" subtitle="There is no collection with that name." />
        <HardwareButton label="All collections" onPress={() => router.replace('/collections')} />
      </Screen>
    );
  }

  const mine = collection.id === 'my-frequencies';
  const summaries = mine ? summariseLibrary(protocols) : [];
  const starred = mine ? favoritePresets() : [];
  const recent = mine ? recentPresets() : [];

  return (
    <Screen bottomInset={layout.transportHeight}>
      <ScreenHeader
        eyebrow={`Collection ${collection.ordinal}`}
        title={collection.name}
        subtitle={collection.summary}
      />

      <View style={styles.badgeRow}>
        <ClassificationBadge
          classification={collection.classification}
          note={CLASSIFICATION_DESCRIPTIONS[collection.classification]}
          onPress={() => setExplaining(true)}
        />
      </View>

      {/* The brainwave shelf prints band ranges, and a range printed without
          these two sentences is the commonest way this subject gets misread.
          Both come from the core, said once there so no screen has to invent
          its own wording for them. */}
      {collection.id === 'brainwave-lab' ? (
        <>
          <InstrumentPanel tone="recessed" label="What a band is">
            <Text variant="bodySm" tone="secondary">
              {BAND_STATE_NOTE}
            </Text>
          </InstrumentPanel>
          <InstrumentPanel tone="recessed" label="Where the edges are">
            <Text variant="bodySm" tone="secondary">
              {BAND_BOUNDARY_NOTE}
            </Text>
          </InstrumentPanel>
        </>
      ) : null}

      {/*
       * The two teaching diagrams, on the shelf they teach.
       *
       * They were built for onboarding and were left without an importer when
       * that flow went from five steps to two — which was the right cut, since
       * a person who has not started yet has no reason to care what a carrier
       * is. Here they have one: every preset below is an experiment about
       * exactly these two facts, and both are far easier to see moving than to
       * read. They run the real expression rather than an illustration of it,
       * and they hold still under reduced motion.
       */}
      {collection.id === 'acoustic-fundamentals' ? (
        <>
          <InstrumentPanel tone="recessed" label="Carrier and beat">
            <LiveCarrierBeat />
            <Text variant="bodySm" tone="secondary">
              Two different quantities, and the source of most of the confusion on this shelf. The
              carrier is the tone that reaches your ear. The beat is the rate that tone changes at,
              and it is not a sound of its own — nothing is playing at the beat rate.
            </Text>
          </InstrumentPanel>
          <InstrumentPanel tone="recessed" label="Where a binaural beat happens">
            <LiveStereo />
            <Text variant="bodySm" tone="secondary">
              The centre trace is the sum of the two beside it, which is what your hearing does with
              two slightly different tones. Neither ear receives the beat; it appears only once both
              are combined, which is why a speaker cannot produce one and headphones can.
            </Text>
          </InstrumentPanel>
        </>
      ) : null}

      {collection.id === 'historical-rife' ? (
        <>
          <InstrumentPanel tone="flat">
            <Text variant="bodySm" tone="secondary">
              This shelf has no presets of its own. The historical numbers live in the archive,
              where each one keeps the source it can actually be traced to, its claim rebuttals and
              its own version counters — copying them here would fork records that are already
              versioned somewhere else.
            </Text>
          </InstrumentPanel>
          <HardwareButton
            label="Open the archive"
            variant="primary"
            size="lg"
            onPress={() => router.push('/archive')}
          />
        </>
      ) : null}

      {mine ? (
        <>
          <SectionHeader label={`Favourites (${starred.length})`} />
          {starred.length === 0 ? (
            <EmptyState
              title="Nothing starred yet"
              message="The star on a preset screen puts it here. Nothing is copied — this shelf holds the ids, so a preset that improves in an update improves here too."
              action={
                <HardwareButton
                  label="Browse collections"
                  onPress={() => router.push('/collections')}
                />
              }
            />
          ) : (
            starred.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                favorite
                onPress={() => router.push(`/preset/${preset.id}`)}
              />
            ))
          )}

          <SectionHeader label={`Recently played (${recent.length})`} />
          {recent.length === 0 ? (
            <Text variant="bodySm" tone="tertiary">
              Presets you play collect here, each pinned to the version and the representation that
              actually ran.
            </Text>
          ) : (
            recent.map(({ preset, play }) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                favorite={favorites.includes(preset.id)}
                matchReason={`Played as ${play.representation.replace('-', ' ')} on ${new Date(
                  play.at,
                ).toLocaleDateString()}, preset version ${play.version}`}
                onPress={() => router.push(`/preset/${preset.id}`)}
              />
            ))
          )}

          <SectionHeader label={`Your protocols (${summaries.length})`} />
          {summaries.length === 0 ? (
            <Text variant="bodySm" tone="tertiary">
              Protocols you build or add a preset to appear here.
            </Text>
          ) : (
            summaries.map((summary) => (
              <ProtocolCard
                key={summary.id}
                protocol={summary}
                compact
                onPress={() => router.push(`/protocol/${summary.id}`)}
              />
            ))
          )}
        </>
      ) : null}

      {presets.length > 0 ? (
        <>
          <SectionHeader label={`${presets.length} presets`} />
          {presets.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              favorite={favorites.includes(preset.id)}
              onPress={() => router.push(`/preset/${preset.id}`)}
            />
          ))}
        </>
      ) : null}

      {explaining ? (
        <ClassificationSheet
          current={collection.classification}
          scope="shelf"
          onClose={() => setExplaining(false)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
