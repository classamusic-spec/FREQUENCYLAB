import { Pressable, StyleSheet, View } from 'react-native';
import type { PlaybackTransform } from '@frequencylab/dsp-core';
import { colors, radius, space } from '../tokens';
import * as haptics from '../haptics';
import { DisplayGlass } from './Surface';
import { Label, Text } from './Text';
import { formatHz } from './ArchiveCard';

export interface TransformPickerProps {
  transforms: readonly PlaybackTransform[];
  selected?: PlaybackTransform;
  onSelect: (transform: PlaybackTransform) => void;
}

/**
 * Choosing how an archived number becomes sound (§9, §11).
 *
 * The app is not allowed to guess. A table of frequencies carries no
 * instruction about carriers, headphones or modulation, so the user picks the
 * transform explicitly and sees, before anything plays, exactly which frequency
 * will leave the headphones.
 *
 * Unavailable options stay on screen with their reason attached rather than
 * being filtered out. A user looking at a 50 kHz entry needs to see *why* it
 * cannot be played directly; a missing row would just look like an oversight,
 * and an app that quietly played 18 kHz instead would be lying.
 */
export function TransformPicker({ transforms, selected, onSelect }: TransformPickerProps) {
  return (
    <View style={styles.list}>
      {transforms.map((transform) => {
        const isSelected = selected?.kind === transform.kind;
        return (
          <Pressable
            key={transform.kind}
            disabled={!transform.available}
            onPress={() => {
              haptics.engage();
              onSelect(transform);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected, disabled: !transform.available }}
            accessibilityLabel={`${transform.label}. ${
              transform.available ? transform.description : transform.unavailableReason
            }`}
            style={[
              styles.option,
              isSelected ? styles.optionSelected : null,
              transform.available ? null : styles.optionDisabled,
            ]}
          >
            <View style={styles.optionHead}>
              {/* Selection is a filled mark, not only a colour change (§50). */}
              <View style={[styles.mark, isSelected ? styles.markOn : null]}>
                {isSelected ? <View style={styles.markCore} /> : null}
              </View>
              <Text
                variant="heading"
                tone={transform.available ? 'primary' : 'disabled'}
                style={styles.optionLabel}
              >
                {transform.label}
              </Text>
              {transform.available ? (
                <Label tone={isSelected ? 'signal' : 'tertiary'}>
                  {formatHz(transform.playbackHz)} Hz out
                </Label>
              ) : (
                <Label tone="tertiary">Unavailable</Label>
              )}
            </View>

            <Text variant="bodySm" tone={transform.available ? 'secondary' : 'tertiary'}>
              {transform.available ? transform.description : transform.unavailableReason}
            </Text>

            {isSelected && transform.equivalenceNote ? (
              <View style={styles.caveat}>
                <Text variant="caption" tone="warning">
                  {transform.equivalenceNote}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * What will actually be generated, stated before playback.
 *
 * Two numbers, side by side, always both present: the value the archive holds
 * and the frequency the headphones will emit. When a transform has been applied
 * they differ, and the difference is the single most important thing on the
 * screen.
 */
export function TransformSummary({ transform }: { transform: PlaybackTransform }) {
  const changed = transform.playbackHz !== transform.originalHz;
  return (
    <DisplayGlass cornerRadius={radius.panel}>
      <View style={styles.summary}>
        <View style={styles.summaryCell}>
          <Label tone="displayDim">Archived value</Label>
          <Text variant="readoutLg" tone="display">
            {formatHz(transform.originalHz)}
          </Text>
          <Label tone="displayDim">Hz</Label>
        </View>

        <View style={styles.arrow}>
          <Text variant="readout" tone="displayDim">
            {changed ? '→' : '='}
          </Text>
        </View>

        <View style={styles.summaryCell}>
          <Label tone="displayDim">Sent to headphones</Label>
          <Text variant="readoutLg" tone="displaySignal">
            {formatHz(transform.playbackHz)}
          </Text>
          <Label tone="displayDim">
            {transform.carrierHz !== undefined
              ? `Hz · on a ${formatHz(transform.carrierHz)} Hz carrier`
              : 'Hz'}
          </Label>
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
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  optionSelected: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.signal,
  },
  optionDisabled: { backgroundColor: 'transparent', opacity: 0.72 },
  optionHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  optionLabel: { flex: 1 },
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
  caveat: {
    marginTop: space.xs,
    paddingLeft: space.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.warning,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.lg,
    gap: space.md,
  },
  summaryCell: { flex: 1, gap: 2 },
  arrow: { paddingHorizontal: space.xs },
});
