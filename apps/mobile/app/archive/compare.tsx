import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { VERIFICATION_LABELS, findDisagreements } from '@frequencylab/dsp-core';
import { EmptyState, Screen, ScreenHeader } from '../../src/design/components/Screen';
import { InstrumentPanel } from '../../src/design/components/InstrumentPanel';
import { VerificationBadge } from '../../src/design/components/Badges';
import { formatHz } from '../../src/design/components/ArchiveCard';
import { Label, Text } from '../../src/design/components/Text';
import { colors, radius, space } from '../../src/design/tokens';
import { useArchive } from '../../src/state/archive';

/**
 * Where sources disagree (§15).
 *
 * The single most useful fact about a circulating frequency list is often that
 * four sources give four different numbers for the same thing. This screen
 * shows exactly that, and it does not resolve it: the archive never averages
 * conflicting values into a "correct" frequency, never quietly prefers the most
 * common one, and never hides the outlier.
 *
 * The rows are ordered by value, not by how well sourced they are, so the
 * spread is legible before the ratings are read.
 */
export default function ArchiveCompareScreen() {
  const router = useRouter();
  const entries = useArchive((state) => state.all)();
  const disagreements = useMemo(() => findDisagreements(entries), [entries]);

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Archive"
        title="Conflicting sources"
        subtitle="Same label, different numbers. Shown as they are, not reconciled."
      />

      {disagreements.length === 0 ? (
        <EmptyState
          title="No conflicts recorded"
          message="Nothing currently held carries the same name or alias at two different values. Importing a list often surfaces these — the same entry under a slightly different number is the most common form of transcription drift."
        />
      ) : null}

      {disagreements.map((disagreement) => {
        const values = disagreement.records.map((record) => record.frequency);
        const low = Math.min(...values);
        const high = Math.max(...values);
        const spread = low > 0 ? ((high - low) / low) * 100 : 0;
        const ordered = [...disagreement.records].sort((a, b) => a.frequency - b.frequency);

        return (
          <View key={disagreement.label} style={styles.group}>
            <InstrumentPanel tone="raised" label="Disagreement">
              <Text variant="heading">{disagreement.label}</Text>
              <Text variant="bodySm" tone="secondary" style={styles.spread}>
                {ordered.length} records span {formatHz(low)} Hz to {formatHz(high)} Hz — a spread
                of {spread.toFixed(spread < 1 ? 2 : 1)}%.
              </Text>
            </InstrumentPanel>

            {ordered.map((record) => (
              <Pressable
                key={record.entryId}
                onPress={() => router.push(`/archive/${record.entryId}`)}
                accessibilityRole="button"
                accessibilityLabel={`${formatHz(record.frequency)} hertz from ${
                  record.source.title
                }, ${VERIFICATION_LABELS[record.verification]}`}
                style={styles.row}
              >
                <Text variant="readout" style={styles.value}>
                  {formatHz(record.frequency)}
                </Text>
                <View style={styles.rowText}>
                  <Text variant="bodySm" numberOfLines={2}>
                    {record.source.title}
                  </Text>
                  <Label tone="tertiary">
                    {record.source.author ?? 'Author not recorded'}
                    {record.source.year ? ` · ${record.source.year}` : ''}
                  </Label>
                </View>
                <VerificationBadge status={record.verification} />
              </Pressable>
            ))}
          </View>
        );
      })}

      <InstrumentPanel tone="recessed" label="Why nothing is reconciled">
        <Text variant="bodySm" tone="secondary">
          Averaging these values would produce a number no source ever recorded, and picking the
          most frequently repeated one would confuse popularity with provenance. Where sources
          disagree, the disagreement is the finding — so every value is kept, attributed, and left
          for you to judge.
        </Text>
      </InstrumentPanel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  spread: { marginTop: space.xxs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    minHeight: 60,
  },
  value: { minWidth: 72 },
  rowText: { flex: 1, gap: 2 },
});
