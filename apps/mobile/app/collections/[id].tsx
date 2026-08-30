import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BAND_BOUNDARY_NOTE,
  BAND_STATE_NOTE,
  CLASSIFICATION_DESCRIPTIONS,
  collection as findCollection,
  presetsInCollection,
  type CollectionId,
  type FrequencyPreset,
} from '@frequencylab/dsp-core';
import { EmptyState, Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { ClassificationBadge } from '../../src/design/components/Badges';
import { ClassificationSheet } from '../../src/design/components/ClassificationSheet';
import { PresetCard } from '../../src/design/components/PresetCard';
import { PlayRow } from '../../src/design/components/PlayRow';
import { compileRepresentation, protocolIdFor } from '../../src/features/presetPlayback';
import { ProtocolCard } from '../../src/design/components/Cards';
import { Text } from '../../src/design/components/Text';
import { layout, space } from '../../src/design/tokens';
import { usePresetShelf } from '../../src/state/presets';
import { useSessionStart } from '../../src/state/sessionStart';
import { usePlayer } from '../../src/state/player';
import { useProtocolLibrary, summariseLibrary } from '../../src/state/library';
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
  const { canSee, opensRoute } = useTier();
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
  const request = useSessionStart((state) => state.request);
  const recordPlay = usePresetShelf((state) => state.recordPlay);
  const snapshot = usePlayer((state) => state.snapshot);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrate, hydrated]);

  const presets = useMemo(
    () => (collection && !collection.sourcedElsewhere ? presetsInCollection(collection.id) : []),
    [collection],
  );

  /**
   * Starts a preset, by the same route the preset screen uses.
   *
   * The shipped representation rather than a chosen one, because choosing how a
   * frequency is heard is the `representation` capability and Simple does not
   * have it — so this plays exactly what the preset was written to be. The
   * session request is `useSessionStart`, not the player directly, which is
   * what keeps the pre-session safety sheet in front of a first session.
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

  /** Starred and recently played, de-duplicated, newest first. */
  const simpleMine = useMemo(() => {
    if (collection?.id !== 'my-frequencies') return [];
    // `recentPresets` carries the play record alongside the preset; only the
    // preset is wanted here, since a Simple row shows no version or date.
    const seen = new Set<string>();
    return [...recentPresets().map((entry) => entry.preset), ...favoritePresets()].filter(
      (preset) => (seen.has(preset.id) ? false : (seen.add(preset.id), true)),
    );
  }, [collection?.id, favoritePresets, recentPresets]);

  const playingId = useMemo(() => {
    if (snapshot.state !== 'playing' && snapshot.state !== 'paused') return null;
    return presets.find(
      (preset) => protocolIdFor(preset, preset.representation.kind) === snapshot.protocolId,
    )?.id ?? null;
  }, [presets, snapshot.protocolId, snapshot.state]);


  if (!collection) {
    return (
      <Screen>
        <ScreenHeader title="Not found" subtitle="There is no collection with that name." />
        <HardwareButton label="All collections" onPress={() => router.replace('/collections')} />
      </Screen>
    );
  }

  /*
   * Simple gets the shelf as somewhere to pick from, not as documentation.
   *
   * This screen was behind a level door, on the reasoning that a shelf is a
   * column of `PresetCard` readouts and a de-numbered readout is a lie. The
   * reasoning held; the conclusion did not, because it folded two different
   * questions into one decision. "What is 528 Hz and who claims what about it"
   * is the preset page, and it stays behind its door at this level. "What is on
   * this shelf and what does it sound like" is this, and it needs no hertz at
   * all: a name, how it sounds, how long it runs and what kind of claim sits
   * behind it are all sayable truthfully without one.
   *
   * So the door here is gone and the rows play. The classification badge is on
   * every row exactly as it is at Lab, because that is the half a tier may
   * never touch.
   */
  if (!canSee('hertz')) {
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

        {/*
         * `my-frequencies` holds nothing of its own — it is whatever the person
         * has starred or played. Starring lives on the preset page, which this
         * level does not have, so at Simple the shelf is a history: these rows
         * now record a play, which they did not before, and a shelf that
         * collected them and then said "nothing here" would be wrong about its
         * own contents.
         */}
        {collection.id === 'my-frequencies' ? (
          simpleMine.length === 0 ? (
            <Text variant="bodySm" tone="tertiary">
              Nothing yet. Sessions you play from the other shelves collect here.
            </Text>
          ) : (
            <>
              <SectionHeader label={`${simpleMine.length} you have played`} />
              {simpleMine.map((preset) => (
                <PlayRow
                  key={preset.id}
                  preset={preset}
                  playing={playingId === preset.id}
                  onPress={() => play(preset)}
                />
              ))}
            </>
          )
        ) : presets.length === 0 ? (
          <Text variant="bodySm" tone="tertiary">
            {collection.sourcedElsewhere
              ? 'This shelf has no sessions of its own. What it holds is a historical record rather than something to play.'
              : 'Nothing on this shelf yet.'}
          </Text>
        ) : (
          <>
            <SectionHeader label={`${presets.length} to choose from`} />
            {presets.map((preset) => (
              <PlayRow
                key={preset.id}
                preset={preset}
                playing={playingId === preset.id}
                onPress={() => play(preset)}
              />
            ))}
          </>
        )}

        <Text variant="caption" tone="tertiary">
          Every row carries its classification, at every level. What Simple leaves out is the
          page behind a row — where a number came from, what has been claimed about it and how
          strong the evidence is. Profile changes that.
        </Text>

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
                onPress={
                  opensRoute(`/preset/${preset.id}`)
                    ? () => router.push(`/preset/${preset.id}`)
                    : undefined
                }
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
                onPress={
                  opensRoute(`/preset/${preset.id}`)
                    ? () => router.push(`/preset/${preset.id}`)
                    : undefined
                }
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
              onPress={
                  opensRoute(`/preset/${preset.id}`)
                    ? () => router.push(`/preset/${preset.id}`)
                    : undefined
                }
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
