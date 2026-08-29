import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ACOUSTIC_LAYER_NOTICE, type SoundBathPreset } from '@frequencylab/dsp-core';
import { colors, MIN_TOUCH_TARGET, radius, shadows, space } from '../tokens';
import * as haptics from '../haptics';
import { HardwareButton } from './HardwareButton';
import { SegmentSelector } from './SegmentSelector';
import { Label, Text } from './Text';
import type { SoundBathFullness } from '../../audio/organic/program';

/** The value the picker uses for "no acoustic layer at all". */
export const NO_SOUND_BATH = 'none';

/**
 * Choosing the acoustic layer.
 *
 * Twenty sound baths used to be a horizontally scrolling row of chips on the
 * first screen of the app: twenty-one tap targets, each one a two-word name
 * with no room to say what it was, and the four-option density control under
 * them. Twenty-six of the home screen's thirty-three controls were this one
 * decision, which is not a decision most people open the app to make.
 *
 * Home now shows the answer — `Acoustic layer · Tide` — and this is where the
 * question lives. The trade is only worth making if the sheet is *better* than
 * the chips rather than merely tidier, so each row carries the preset's own
 * description: what is actually in it, and, where the preset's name invites a
 * misreading (`528 Organic`, `Earth Resonance`, `Gamma Light`), the sentence
 * that corrects it. None of that would fit on a chip.
 *
 * `ACOUSTIC_LAYER_NOTICE` — the sentence saying this layer produces no beat of
 * its own — is printed once at the top rather than twenty times, because it is
 * identical on every preset and `dsp-core` exports it as one string for exactly
 * that reason. It is the first thing in the sheet, not the last.
 */
export interface SoundBathSheetProps {
  presets: readonly SoundBathPreset[];
  /** The chosen preset id, or `NO_SOUND_BATH`. Omit for a browse-only sheet. */
  value?: string;
  /** Omit to browse without choosing — the Library uses this at `simple`. */
  onChange?: (presetId: string) => void;
  fullness?: SoundBathFullness;
  onFullnessChange?: (fullness: SoundBathFullness) => void;
  /** Engraved title. Plain-word callers pass "Background sounds". */
  title: string;
  onClose: () => void;
}

const FULLNESS_OPTIONS: { value: SoundBathFullness; label: string }[] = [
  { value: 'sparse', label: 'Sparse' },
  { value: 'natural', label: 'As written' },
  { value: 'fuller', label: 'Fuller' },
  { value: 'full', label: 'Full' },
];

export function SoundBathSheet({
  presets,
  value,
  onChange,
  fullness,
  onFullnessChange,
  title,
  onClose,
}: SoundBathSheetProps) {
  const choosing = onChange !== undefined;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Dismiss" />
      <View style={styles.sheet}>
        <Label>{title}</Label>
        <Text variant="caption" tone="tertiary">
          {ACOUSTIC_LAYER_NOTICE}
        </Text>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {choosing ? (
            <Row
              name="None"
              description="The frequency session on its own, with nothing recorded under it."
              selected={value === NO_SOUND_BATH}
              onPress={() => onChange(NO_SOUND_BATH)}
            />
          ) : null}
          {presets.map((preset) => (
            <Row
              key={preset.id}
              name={preset.name}
              description={withoutSharedNotice(preset.description)}
              selected={value === preset.id}
              onPress={onChange ? () => onChange(preset.id) : undefined}
            />
          ))}
        </ScrollView>

        {choosing && value !== NO_SOUND_BATH && fullness && onFullnessChange ? (
          <View style={styles.fullness}>
            <Label>How much it plays</Label>
            <SegmentSelector
              accessibilityLabel="How much the acoustic layer plays"
              size="sm"
              options={FULLNESS_OPTIONS}
              value={fullness}
              onChange={(next) => onFullnessChange(next as SoundBathFullness)}
            />
          </View>
        ) : null}

        <HardwareButton label="Done" variant="primary" onPress={onClose} />
      </View>
    </Modal>
  );
}

/**
 * One preset.
 *
 * Selection is shown by a filled marker *and* by the name changing weight of
 * colour, never by colour alone, and `accessibilityState` carries it for a
 * screen reader (§50). The row is a real 44 pt target made of padding, not of
 * `hitSlop` — React Native Web ignores that.
 */
function Row({
  name,
  description,
  selected,
  onPress,
}: {
  name: string;
  description: string;
  selected: boolean;
  onPress?: () => void;
}) {
  const body = (
    <>
      <View style={styles.rowHead}>
        <Text variant="heading" tone={selected ? 'signal' : 'primary'} style={styles.rowName}>
          {name}
        </Text>
        {selected ? <View style={styles.marker} /> : null}
      </View>
      <Text variant="caption" tone="tertiary">
        {description}
      </Text>
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{body}</View>;
  }

  return (
    <Pressable
      onPress={() => {
        haptics.engage();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${name}. ${description}`}
      style={[styles.row, selected ? styles.rowSelected : null]}
    >
      {body}
    </Pressable>
  );
}

/**
 * The preset's own words, minus the sentence every preset shares.
 *
 * Matched against the exported constant rather than by pattern, so a preset
 * that ever stops carrying the notice keeps its full description here instead
 * of being silently trimmed by a regex that nearly matched.
 */
function withoutSharedNotice(description: string): string {
  return description.replace(ACOUSTIC_LAYER_NOTICE, '').trim();
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: space.xl,
    paddingBottom: space.huge,
    gap: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
    ...(shadows.sheet as object),
  },
  list: { flexGrow: 1, flexShrink: 1 },
  listContent: { gap: space.xs, paddingBottom: space.sm },
  row: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    gap: space.xxs,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  rowSelected: {
    backgroundColor: colors.surfaceRecessed,
    borderTopColor: colors.edgeLight,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rowName: { flex: 1 },
  marker: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.signal },
  fullness: { gap: space.xs },
});
