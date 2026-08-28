import { Pressable, StyleSheet, View } from 'react-native';
import { colors, MIN_TOUCH_TARGET, radius, space } from '../tokens';
import * as haptics from '../haptics';
import { DisplayGlass } from './Surface';
import { Label, Text } from './Text';
import { formatPresetHz } from './PresetCard';
import type { RepresentationOption } from '../../features/presetPlayback';

export interface RepresentationPickerProps {
  options: readonly RepresentationOption[];
  selected: RepresentationOption['kind'];
  onSelect: (option: RepresentationOption) => void;
}

/**
 * Choosing how a preset is heard (§4).
 *
 * Built to the same rule as the archive's `TransformPicker`, and deliberately
 * looking like it: an option a value cannot honestly carry stays on the screen
 * with the reason attached rather than disappearing. Someone opening a 7.83 Hz
 * preset needs to read *why* there is no plain tone on offer — a row that had
 * quietly been filtered out would look like the app had simply not thought of
 * it, and a 7.83 Hz "tone" that played silence would be worse still.
 *
 * The row the factory ships is marked, because a shelf's suggestion is worth
 * knowing and is still only a suggestion.
 */
export function RepresentationPicker({ options, selected, onSelect }: RepresentationPickerProps) {
  return (
    <View style={styles.list}>
      {options.map((option) => {
        const isSelected = option.kind === selected;
        return (
          <Pressable
            key={option.kind}
            disabled={!option.available}
            onPress={() => {
              haptics.engage();
              onSelect(option);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected, disabled: !option.available }}
            accessibilityLabel={`${option.label}${option.shipped ? ', the shipped representation' : ''}. ${
              option.available ? option.description : option.unavailableReason
            }`}
            style={[
              styles.option,
              isSelected ? styles.optionSelected : null,
              option.available ? null : styles.optionDisabled,
            ]}
          >
            <View style={styles.head}>
              {/* Selection is a filled mark, not only a colour change (§50). */}
              <View style={[styles.mark, isSelected ? styles.markOn : null]}>
                {isSelected ? <View style={styles.markCore} /> : null}
              </View>
              <Text
                variant="heading"
                tone={option.available ? 'primary' : 'disabled'}
                style={styles.label}
              >
                {option.label}
              </Text>
              <Label tone={option.available ? (isSelected ? 'signal' : 'tertiary') : 'tertiary'}>
                {audibleSummary(option)}
              </Label>
            </View>

            <Text variant="bodySm" tone={option.available ? 'secondary' : 'tertiary'}>
              {option.available ? option.description : option.unavailableReason}
            </Text>

            {option.shipped ? (
              <Label tone="tertiary">Shipped with this preset</Label>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * What is audible under an option, in three or four words.
 *
 * Never the source value on its own. For every rate-based representation the
 * number people came for is not a sound at all, and printing "7.83 Hz out"
 * beside a binaural option would say precisely the thing this whole screen
 * exists to correct — so what is named is the tone or the pair of tones the
 * headphones actually emit.
 */
function audibleSummary(option: RepresentationOption): string {
  if (!option.available) return 'Unavailable';
  const transform = option.transform;
  if (!transform) return 'Noise bed';
  if (transform.channels) {
    return `${formatPresetHz(transform.channels.leftHz)} / ${formatPresetHz(
      transform.channels.rightHz,
    )} Hz`;
  }
  if (transform.carrierHz !== undefined) return `${formatPresetHz(transform.carrierHz)} Hz carrier`;
  return `${formatPresetHz(transform.playbackHz)} Hz out`;
}

export interface RepresentationSummaryProps {
  option: RepresentationOption;
  /** The value the preset holds, or null where it holds none. */
  sourceHz: number | null;
  /** What stands in for a source value that does not exist. */
  sourcePlaceholder: string;
  /** True while a session started from exactly this preset and option is running. */
  playing: boolean;
}

/**
 * What is being produced, stated whether or not anything is playing (§4).
 *
 * The panel is not conditional on playback and does not change shape when it
 * starts: the same two cells say what the preset holds and what the headphones
 * are being asked to emit, and only the heading moves between "Playing now" and
 * "Ready to play". A screen that stated the representation only while a session
 * ran would be silent at the exact moment the user was deciding.
 */
export function RepresentationSummary({
  option,
  sourceHz,
  sourcePlaceholder,
  playing,
}: RepresentationSummaryProps) {
  const transform = option.transform;
  const output = transform?.channels
    ? `${formatPresetHz(transform.channels.leftHz)} / ${formatPresetHz(transform.channels.rightHz)}`
    : transform?.carrierHz !== undefined
      ? formatPresetHz(transform.carrierHz)
      : transform
        ? formatPresetHz(transform.playbackHz)
        : '—';

  const outputCaption = transform?.channels
    ? 'Hz · one tone per ear'
    : transform?.carrierHz !== undefined
      ? `Hz carrier · ${option.label.toLowerCase()}`
      : transform
        ? 'Hz · a tone'
        : 'A broadband bed, no tone';

  return (
    <DisplayGlass cornerRadius={radius.panel}>
      <View style={styles.summary}>
        <View style={styles.summaryHead}>
          <Label tone="displayDim">{playing ? 'Playing now' : 'Ready to play'}</Label>
          <Text variant="readoutSm" tone="displaySignal" numberOfLines={1}>
            {option.label}
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCell}>
            <Label tone="displayDim">This preset holds</Label>
            <Text variant="readoutLg" tone="display">
              {sourceHz === null ? sourcePlaceholder : formatPresetHz(sourceHz)}
            </Text>
            <Label tone="displayDim">{sourceHz === null ? 'No single frequency' : 'Hz'}</Label>
          </View>

          <View style={styles.arrow}>
            <Text variant="readout" tone="displayDim">
              →
            </Text>
          </View>

          <View style={styles.summaryCell}>
            <Label tone="displayDim">Your headphones emit</Label>
            <Text variant="readoutLg" tone="displaySignal">
              {output}
            </Text>
            <Label tone="displayDim">{outputCaption}</Label>
          </View>
        </View>
      </View>
    </DisplayGlass>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  option: {
    padding: space.md,
    gap: space.xs,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  optionSelected: { backgroundColor: colors.surfaceRaised, borderColor: colors.signal },
  optionDisabled: { backgroundColor: 'transparent', opacity: 0.72 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  label: { flex: 1 },
  mark: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.surfaceRecessed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markOn: { borderColor: colors.signal },
  markCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.signal },
  summary: { padding: space.lg, gap: space.md },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  summaryCell: { flex: 1, gap: 2 },
  arrow: { paddingHorizontal: space.xs },
});
