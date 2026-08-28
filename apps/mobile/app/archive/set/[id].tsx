import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CATEGORY_LABELS,
  VERIFICATION_DESCRIPTIONS,
  VERIFICATION_LABELS,
  buildArchiveProtocol,
  formatClock,
  recommendedTransform,
  type ArchiveEntry,
  type ArchiveStageSpec,
} from '@frequencylab/dsp-core';
import { EmptyState, Screen, ScreenHeader, SectionHeader } from '../../../src/design/components/Screen';
import { InstrumentPanel, PanelRow } from '../../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../../src/design/components/HardwareButton';
import { SegmentSelector } from '../../../src/design/components/SegmentSelector';
import { ArchiveEvidenceBadge, VerificationBadge } from '../../../src/design/components/Badges';
import { ArchiveCard } from '../../../src/design/components/ArchiveCard';
import { Label, Text } from '../../../src/design/components/Text';
import { colors, radius, space } from '../../../src/design/tokens';
import { useArchive } from '../../../src/state/archive';
import { useProtocolLibrary } from '../../../src/state/library';

const DURATIONS = [
  { value: '60', label: '1 min' },
  { value: '180', label: '3 min' },
  { value: '300', label: '5 min' },
];

/**
 * A collection, and the protocol it can become (§13).
 *
 * A frequency list carries an implicit sequence, so the conversion preserves
 * source order exactly and never reorders, deduplicates or drops a value. What
 * the list does *not* carry is any instruction about how long to hold each
 * value or how to make it audible, so those are chosen here, explicitly, and
 * recorded in the protocol's provenance rather than assumed.
 */
export default function ArchiveSetScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [durationSec, setDurationSec] = useState('180');
  const [busy, setBusy] = useState(false);

  const sets = useArchive((state) => state.sets)();
  const getEntry = useArchive((state) => state.get);
  const removeSet = useArchive((state) => state.removeSet);
  const userSets = useArchive((state) => state.userSets);
  const saveProtocol = useProtocolLibrary((state) => state.save);

  const collection = sets.find((candidate) => candidate.id === id);
  const isUserSet = userSets.some((candidate) => candidate.id === id);

  const entries = useMemo(
    () =>
      (collection?.entryIds ?? [])
        .map((entryId) => getEntry(entryId))
        .filter((entry): entry is ArchiveEntry => entry !== undefined),
    [collection, getEntry],
  );

  if (!collection) {
    return (
      <Screen>
        <ScreenHeader title="Not found" subtitle="This collection no longer exists." />
        <HardwareButton label="Back" onPress={() => router.back()} />
      </Screen>
    );
  }

  const perStage = Number.parseInt(durationSec, 10);
  const totalSec = entries.length * perStage;

  const convert = async () => {
    if (entries.length === 0) return;
    setBusy(true);
    try {
      const stages: ArchiveStageSpec[] = entries.map((entry) => ({
        entry,
        transform: recommendedTransform(entry.frequency),
        durationSec: perStage,
        // Zero cross-fade on the first stage only; a list implies discrete
        // steps, so the rest get a short fade purely to avoid a click.
        crossfadeSec: 1.5,
      }));

      const unplayable = stages.filter((stage) => !stage.transform.available);
      if (unplayable.length === stages.length) {
        Alert.alert(
          'Nothing in this collection can be played',
          'Every value here falls outside what headphones can produce, even after octave division.',
        );
        return;
      }

      const protocol = buildArchiveProtocol({
        id: `archive-set-${collection.id}-${Date.now().toString(36)}`,
        name: collection.name,
        description: `Built from ${entries.length} archive entries, in the order the source gave them. ${perStage} seconds each.`,
        stages: stages.filter((stage) => stage.transform.available),
      });

      const saved = await saveProtocol(protocol);
      if (unplayable.length > 0) {
        Alert.alert(
          'Some values were left out',
          `${unplayable.length} of ${stages.length} could not be rendered as sound at all and were omitted rather than substituted. They stay in the archive.`,
        );
      }
      router.push(`/protocol/${saved.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        eyebrow={CATEGORY_LABELS[collection.category]}
        title={collection.name}
        subtitle={collection.summary}
      />

      <View style={styles.badges}>
        <VerificationBadge status={collection.verification} />
        <ArchiveEvidenceBadge level={collection.evidenceLevel} />
      </View>

      <InstrumentPanel tone="flat" label="Source">
        <Text variant="bodySm">{collection.source.title}</Text>
        {collection.source.author || collection.source.year ? (
          <Text variant="caption" tone="tertiary" style={styles.sourceLine}>
            {collection.source.author ?? 'Author not recorded'}
            {collection.source.year ? ` · ${collection.source.year}` : ''}
          </Text>
        ) : null}
        {collection.source.originalContext ? (
          <Text variant="bodySm" tone="secondary" style={styles.context}>
            {collection.source.originalContext}
          </Text>
        ) : null}
      </InstrumentPanel>

      <InstrumentPanel tone="recessed" label="Source rating">
        <Text variant="bodySm">{VERIFICATION_LABELS[collection.verification]}</Text>
        <Text variant="caption" tone="tertiary" style={styles.sourceLine}>
          {VERIFICATION_DESCRIPTIONS[collection.verification]}
        </Text>
      </InstrumentPanel>

      {collection.documentedTimingSec?.length ? (
        <InstrumentPanel tone="recessed" label="Timing given by the source">
          <Text variant="bodySm" tone="secondary">
            {collection.documentedTimingSec.map((sec) => formatClock(sec)).join(' · ')}
          </Text>
        </InstrumentPanel>
      ) : (
        <InstrumentPanel tone="recessed" label="Timing">
          <Text variant="bodySm" tone="secondary">
            This source records frequencies but no durations. The time per value below is your
            choice, not the source&apos;s, and the protocol records it that way.
          </Text>
        </InstrumentPanel>
      )}

      <SectionHeader label="Time per value" />
      <SegmentSelector
        accessibilityLabel="Time per value"
        options={DURATIONS}
        value={durationSec}
        onChange={setDurationSec}
      />
      <Text variant="caption" tone="tertiary">
        {entries.length} values · {formatClock(totalSec)} total. Each value is played using the
        transform the translator recommends for it, and the protocol stores which one was used for
        each.
      </Text>

      <HardwareButton
        label="Build a protocol from this collection"
        variant="primary"
        size="lg"
        loading={busy}
        disabled={entries.length === 0}
        onPress={() => void convert()}
      />

      <SectionHeader label={`Entries (${entries.length})`} />
      <Text variant="caption" tone="tertiary">
        In the order the source gave them. Order is preserved because sequence is part of what a
        list asserts, even when nothing supports the sequence.
      </Text>

      {entries.length === 0 ? (
        <EmptyState
          title="Empty collection"
          message="No entries are currently held under this collection."
        />
      ) : (
        entries.map((entry, index) => (
          <View key={entry.id} style={styles.numbered}>
            <View style={styles.index}>
              <Label tone="tertiary">{String(index + 1).padStart(2, '0')}</Label>
            </View>
            <View style={styles.card}>
              <ArchiveCard entry={entry} onPress={() => router.push(`/archive/${entry.id}`)} />
            </View>
          </View>
        ))
      )}

      {isUserSet ? (
        <>
          <SectionHeader label="This collection is yours" />
          <InstrumentPanel tone="flat">
            <PanelRow label="Entries" value={String(collection.entryIds.length)} />
            <PanelRow label="Version" value={String(collection.version)} />
          </InstrumentPanel>
          <HardwareButton
            label="Delete this collection"
            variant="danger"
            onPress={() =>
              Alert.alert(
                'Delete this collection?',
                `${collection.entryIds.length} imported entries and their provenance will be removed from this device. Protocols already built from them are unaffected.`,
                [
                  { text: 'Keep', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                      void removeSet(collection.id);
                      router.back();
                    },
                  },
                ],
              )
            }
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  sourceLine: { marginTop: space.xxs },
  context: {
    marginTop: space.sm,
    paddingLeft: space.md,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.hairlineStrong,
  },
  numbered: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  index: {
    width: 28,
    paddingTop: space.lg,
    alignItems: 'center',
  },
  card: { flex: 1, borderRadius: radius.card, overflow: 'hidden' },
});
