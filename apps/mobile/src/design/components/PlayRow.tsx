import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { formatClock, type FrequencyPreset } from '@frequencylab/dsp-core';
import { colors, radius, space } from '../tokens';
import { ClassificationBadge } from './Badges';
import { Label, Text } from './Text';
import { presetInPlainWords } from '../../features/tierCapabilities';

/**
 * A preset row that plays rather than documents.
 *
 * `PresetCard` is the library's row: it leads to the page about a number, and
 * its readout *is* that number. This is the other thing a person can want from
 * a shelf — to hear one — and it is a different row because it answers a
 * different question. Not "what is 528 Hz and who claims what about it" but
 * "what does this sound like and how long does it run".
 *
 * ## Why this exists
 *
 * A level door went up in front of the shelves at `simple`, on the reasoning
 * that a shelf is a column of frequency readouts and a de-numbered readout is a
 * lie. That reasoning was sound and the conclusion was wrong, because it
 * treated "open the shelf" and "open the preset's documentation" as one
 * decision. They are not: somebody browsing shelves wants to pick something and
 * hear it, which the preset page's evidence tables and representation pickers
 * have nothing to do with.
 *
 * ## What it does not do is pretend the numbers are gone
 *
 * This row adds no numeric readout — where `PresetCard` prints `528 · Hz` in
 * display glass, this prints `15:00` and `Clear tone`. What it does not do is
 * censor the preset's own name and summary, and on several shelves those carry
 * hertz: the Solfeggio rows are *called* `Transform — 528 Hz`, and the summary
 * under that name is where it says the origin is a 1999 publication rather than
 * a surviving historical tuning.
 *
 * Removing the number there would strip a correction of its subject and leave
 * `Transform` looking like a promise. It is the same reason the sound-bath
 * descriptions keep theirs at every level: the number is in the name, and the
 * sentence beside it is what stops the name being a claim. A tier hides
 * vocabulary; it never hides the thing that keeps vocabulary honest.
 *
 * ## What it always shows
 *
 * The classification badge, exactly as `PresetCard` does, so a `traditional`
 * shelf says so at Simple as loudly as at Lab. And `presetInPlainWords`, which
 * describes the *sound* and never an effect: "Deep tone", "Clear tone". A row
 * saying "Relaxing" would be this component telling the lie the rest of the app
 * is built to avoid.
 */
export function PlayRow({
  preset,
  onPress,
  playing,
  style,
}: {
  preset: FrequencyPreset;
  /** Starts it. A row without one would be a control that does nothing. */
  onPress: () => void;
  /** Whether this is the preset currently sounding. */
  playing?: boolean;
  style?: ViewStyle;
}) {
  const sound = presetInPlainWords(preset);
  const clock = formatClock(preset.durationSec);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${preset.name}. ${sound}, ${clock}. ${preset.summary}`}
      accessibilityHint={playing ? 'Already playing' : 'Starts this session'}
      style={[styles.row, playing ? styles.rowPlaying : null, style]}
    >
      <View style={styles.head}>
        <View style={styles.title}>
          <Text variant="heading" numberOfLines={2}>
            {preset.name}
          </Text>
          <Text variant="bodySm" tone="secondary" numberOfLines={2}>
            {preset.summary}
          </Text>
        </View>
        {/* The two facts a listener acts on, where a readout would otherwise be. */}
        <View style={styles.readout}>
          <Text variant="readoutSm" tone={playing ? 'signal' : 'secondary'}>
            {clock}
          </Text>
          <Label tone="tertiary">{playing ? 'Playing' : sound}</Label>
        </View>
      </View>

      <View style={styles.meta}>
        <ClassificationBadge classification={preset.classification} />
        <Label tone="tertiary">{playing ? '' : 'Tap to play'}</Label>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
    // A real target rather than hitSlop, which react-native-web ignores.
    minHeight: 88,
  },
  rowPlaying: { borderTopColor: colors.signal },
  head: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  title: { flex: 1, gap: space.xxs },
  readout: { alignItems: 'flex-end', gap: 2, minWidth: 84 },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    flexWrap: 'wrap',
  },
});
