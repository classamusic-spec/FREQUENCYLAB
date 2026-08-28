import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { formatClock, type FrequencyPreset } from '@frequencylab/dsp-core';
import { colors, radius, space } from '../tokens';
import { ClassificationBadge } from './Badges';
import { DisplayGlass } from './Surface';
import { Label, Text } from './Text';

export interface PresetCardProps {
  preset: FrequencyPreset;
  onPress: () => void;
  /** Why the search matched, shown when the card is a result rather than a listing. */
  matchReason?: string;
  favorite?: boolean;
  style?: ViewStyle;
}

/**
 * A preset row (§25).
 *
 * Built to the same rule as `ArchiveCard`, because it is the same promise: the
 * number, what kind of number it is, and where its standing comes from, all on
 * the card and none of them optional. Search is deliberately generous — typing
 * "healing frequencies" finds nine Solfeggio tones — and the classification
 * badge is what keeps that generosity honest. Being findable is not being
 * endorsed.
 */
export function PresetCard({ preset, onPress, matchReason, favorite, style }: PresetCardProps) {
  const readout = presetReadout(preset);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${preset.name}, ${readout.spoken}. ${preset.summary}`}
      style={[styles.card, style]}
    >
      <View style={styles.head}>
        <View style={styles.title}>
          <View style={styles.titleRow}>
            <Text variant="heading" numberOfLines={2} style={styles.name}>
              {preset.name}
            </Text>
            {favorite ? (
              <View style={styles.star} accessibilityLabel="Saved">
                <Text variant="label" tone="signal">
                  ★
                </Text>
              </View>
            ) : null}
          </View>
          <Text variant="bodySm" tone="secondary" numberOfLines={3}>
            {preset.summary}
          </Text>
        </View>

        {/* Three presets hold no frequency at all: broadband noise is a
            spectrum slope, not a number. They print what they are instead of a
            zero, which would put a value on the screen that the preset does not
            hold. */}
        <DisplayGlass cornerRadius={radius.control}>
          <View style={styles.readout}>
            {readout.value === null ? (
              <>
                <Text variant="readoutSm" tone="displayDim">
                  {readout.placeholder}
                </Text>
                <Label tone="displayDim">{readout.caption}</Label>
              </>
            ) : (
              <>
                <Text variant="readout" tone="displaySignal">
                  {readout.value}
                </Text>
                <Label tone="displayDim">{readout.caption}</Label>
              </>
            )}
          </View>
        </DisplayGlass>
      </View>

      <View style={styles.meta}>
        <ClassificationBadge classification={preset.classification} />
        <Text variant="caption" tone="tertiary">
          {formatClock(preset.durationSec)}
        </Text>
      </View>

      {matchReason ? (
        <Text variant="caption" tone="tertiary">
          {matchReason}
        </Text>
      ) : null}
    </Pressable>
  );
}

export interface PresetReadout {
  /** The value to print, or null when the preset holds no frequency. */
  value: string | null;
  /** What stands in for a value that does not exist. Never a zero. */
  placeholder: string;
  /** The unit and what kind of number it is. */
  caption: string;
  /** The whole readout as one phrase, for an accessibility label. */
  spoken: string;
}

/**
 * What a preset's readout says, including when it has nothing to report.
 *
 * `sourceFrequency.value === 0` is a stated absence rather than a measurement:
 * `NO_SOURCE_FREQUENCY` is the placeholder the noise rows carry because the
 * type needs a number and noise has a slope instead of a frequency. The one
 * obligation that comes with it is discharged here, in the single place every
 * preset surface reads its readout from — **never print a 0 Hz readout**.
 */
export function presetReadout(preset: FrequencyPreset): PresetReadout {
  if (preset.sourceFrequency.value === 0) {
    const colour = preset.representation.noiseColor;
    return {
      value: null,
      placeholder: colour ? capitalise(colour) : '—',
      caption: 'Broadband',
      spoken: colour
        ? `${colour} noise, which has no single frequency`
        : 'no single frequency',
    };
  }

  const value = formatPresetHz(preset.sourceFrequency.value);
  const caption = ROLE_CAPTION[preset.sourceFrequency.role];
  return {
    value,
    placeholder: '—',
    caption,
    spoken: `${value} hertz, ${ROLE_SPOKEN[preset.sourceFrequency.role]}`,
  };
}

/**
 * What kind of number this is, in two words under the readout.
 *
 * A rate and a pitch are not interchangeable and an electromagnetic figure is
 * neither, so the caption is never just "Hz". Getting this wrong is the single
 * commonest error in the subject, and it is exactly the error `SignalRole`
 * exists to prevent.
 */
const ROLE_CAPTION: Record<FrequencyPreset['sourceFrequency']['role'], string> = {
  carrier: 'Hz · audible tone',
  modulation: 'Hz · rate',
  electromagnetic: 'Hz · EM figure',
  unspecified: 'Hz',
};

const ROLE_SPOKEN: Record<FrequencyPreset['sourceFrequency']['role'], string> = {
  carrier: 'an audible tone',
  modulation: 'a modulation rate',
  electromagnetic: 'an electromagnetic figure represented acoustically',
  unspecified: 'role not stated',
};

/** Never rounded — the preset's precision is part of what it holds. */
export function formatPresetHz(hz: number): string {
  if (Number.isInteger(hz)) return String(hz);
  return String(Number(hz.toFixed(4)));
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    flexWrap: 'wrap',
  },
});
