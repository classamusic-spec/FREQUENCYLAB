import { Pressable, StyleSheet, View } from 'react-native';
import type { ArchiveEntry } from '@frequencylab/dsp-core';
import { colors, radius, space } from '../tokens';
import { ArchiveEvidenceBadge, VerificationBadge } from './Badges';
import { DisplayGlass } from './Surface';
import { Label, Text } from './Text';

export interface ArchiveCardProps {
  entry: ArchiveEntry;
  onPress: () => void;
  /** Why the search matched, shown when the card is a result rather than a listing. */
  matchReason?: string;
  favorite?: boolean;
}

/**
 * A frequency card (§35).
 *
 * Four things are on the card and none of them is optional: the value, exactly
 * as archived; how the value can actually be heard; how well sourced it is; and
 * what the evidence supports. That last pair is the whole point — a card that
 * showed only the number and a name would let a 1930s claim and a 1981 finding
 * look identical at a glance.
 *
 * The value is set in the display face rather than the interface face because
 * it is a measurement, and it is never rounded for presentation.
 */
export function ArchiveCard({ entry, onPress, matchReason, favorite }: ArchiveCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        entry.contextOnly
          ? `${entry.name}, a context record with no frequency. ${entry.summary}`
          : `${entry.name}, ${entry.frequency} hertz. ${entry.summary}`
      }
      style={styles.card}
    >
      <View style={styles.head}>
        <View style={styles.title}>
          <View style={styles.titleRow}>
            <Text variant="heading" numberOfLines={2} style={styles.name}>
              {entry.name}
            </Text>
            {favorite ? (
              <View style={styles.star} accessibilityLabel="Saved">
                <Text variant="label" tone="signal">
                  ★
                </Text>
              </View>
            ) : null}
          </View>
          <Text variant="bodySm" tone="secondary" numberOfLines={2}>
            {entry.summary}
          </Text>
        </View>

        {/* A context record holds no frequency, so it gets no readout. Printing
            its placeholder zero would put a value on screen the archive does not
            hold. */}
        <DisplayGlass cornerRadius={radius.control}>
          <View style={styles.readout}>
            {entry.contextOnly ? (
              <>
                <Text variant="readoutSm" tone="displayDim">
                  —
                </Text>
                <Label tone="displayDim">No value</Label>
              </>
            ) : (
              <>
                <Text variant="readout" tone="displaySignal">
                  {formatHz(entry.frequency)}
                </Text>
                <Label tone="displayDim">Hz · {roleLabel(entry)}</Label>
              </>
            )}
          </View>
        </DisplayGlass>
      </View>

      <View style={styles.badges}>
        <VerificationBadge status={entry.verification} />
        <ArchiveEvidenceBadge level={entry.evidenceLevel} />
      </View>

      {matchReason ? (
        <Text variant="caption" tone="tertiary">
          {matchReason}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * How this number can be heard, in three words.
 *
 * A rate and a pitch are not interchangeable, and a value outside the audio
 * band is neither. Saying so on the card stops a user from assuming a 2 Hz
 * entry and a 2000 Hz entry are the same kind of thing.
 */
function roleLabel(entry: ArchiveEntry): string {
  if (entry.playback.outsidePracticalRange) {
    return entry.frequency > 20 ? 'above band' : 'rate only';
  }
  if (entry.signalRole === 'modulation') return 'rate';
  return 'audible';
}

/** Never rounded — the archived precision is part of the record. */
export function formatHz(hz: number): string {
  if (Number.isInteger(hz)) return String(hz);
  return String(Number(hz.toFixed(4)));
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
  },
  head: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  title: { flex: 1, gap: space.xxs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  name: { flexShrink: 1 },
  star: { paddingTop: 1 },
  readout: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    alignItems: 'flex-end',
    gap: 2,
    minWidth: 96,
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
