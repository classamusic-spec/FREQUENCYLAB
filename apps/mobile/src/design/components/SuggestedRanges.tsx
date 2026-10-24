import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronIcon } from './Icons';
import { Text } from './Text';
import { BANDS, colors, MIN_TOUCH_TARGET, radius, shadows, space } from '../tokens';
import * as haptics from '../haptics';

/**
 * The conventional brain-rhythm bands as a way to jump the beat encoder.
 *
 * ## What each row is
 *
 * A button. Tapping it moves the beat into that band — to the current value if
 * it is already there, otherwise to the band's suggested value. The track on
 * the row is a gauge, not a slider: it shows where the value sits *inside* the
 * band, on the same log scale the encoder uses, so the fine adjustment stays on
 * the encoder where the drag model, numeric entry and accessibility actions
 * already live. Two independent controls for one number would disagree the
 * first time one was mid-gesture.
 *
 * ## What the bands are not
 *
 * Descriptions of measured activity, not switches: a beat inside a band does
 * not put anyone in that state. The boundaries are the app's documented
 * convention (delta from 0.5 Hz), and the caption under the panel says so.
 */

/** The value a band jumps to when the beat is outside it. */
const SUGGESTED: Record<(typeof BANDS)[number]['key'], number> = {
  delta: 2,
  theta: 6,
  alpha: 10,
  beta: 20,
  gamma: 40,
};

export function SuggestedRanges({
  value,
  onSelect,
}: {
  value: number;
  onSelect: (hz: number) => void;
}) {
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>SUGGESTED RANGES</Text>
      {BANDS.map((band) => {
        const active = value >= band.low && value < band.high;
        const shown = active ? value : SUGGESTED[band.key];
        // Position inside the band, log-scaled to match the encoder.
        const t = Math.max(0, Math.min(1, Math.log(shown / band.low) / Math.log(band.high / band.low)));
        return (
          <Pressable
            key={band.key}
            onPress={() => {
              haptics.engage();
              onSelect(shown);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            aria-selected={active}
            accessibilityLabel={`${band.label}, ${band.low} to ${band.high} hertz. ${
              active ? `Current beat ${shown.toFixed(2)} hertz` : `Set the beat to ${shown} hertz`
            }`}
            style={[styles.row, active ? styles.rowActive : null]}
          >
            <View style={styles.name}>
              <Text style={[styles.bandLabel, active ? styles.signal : null]}>{band.label.toUpperCase()}</Text>
              <Text style={styles.range}>
                {band.low} – {band.high} Hz
              </Text>
            </View>

            <View style={styles.track} pointerEvents="none">
              <View style={styles.rail} />
              {active ? <View style={[styles.fill, { width: `${t * 100}%` }]} /> : null}
              {Array.from({ length: 9 }, (_, i) => {
                const x = i / 8;
                return active && x < t ? null : <View key={i} style={[styles.dot, { left: `${x * 100}%` }]} />;
              })}
              <View style={[styles.thumb, active ? styles.thumbActive : null, { left: `${t * 100}%` }]} />
            </View>

            <Text style={[styles.value, active ? styles.signal : null]} numberOfLines={1}>
              {shown.toFixed(3)} <Text style={styles.unit}>Hz</Text>
            </Text>
            <View style={styles.chevron}>
              <ChevronIcon direction="right" size={16} color={colors.textSecondary} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surfaceRecessed,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    paddingHorizontal: space.sm,
    paddingBottom: space.sm,
    paddingTop: space.xs,
    gap: space.xs,
  },
  title: {
    textAlign: 'center',
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    letterSpacing: 2.4,
    color: colors.textSecondary,
    paddingVertical: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingLeft: space.md,
    paddingRight: space.sm,
    paddingVertical: 6,
    borderRadius: radius.control,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  rowActive: { backgroundColor: colors.surface, borderColor: colors.ring },
  name: { width: 66, gap: 1 },
  bandLabel: { fontFamily: 'Inter_500Medium', fontSize: 10.5, lineHeight: 14, letterSpacing: 1.5, color: colors.textSecondary },
  range: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 14, color: colors.textSecondary },
  signal: { color: colors.signal },
  track: { flex: 1, height: 18, justifyContent: 'center' },
  rail: { height: 1.5, borderRadius: 1, backgroundColor: 'rgba(120,120,120,0.30)' },
  fill: { position: 'absolute', left: 0, height: 2.5, borderRadius: 2, backgroundColor: colors.signal },
  dot: { position: 'absolute', width: 2.5, height: 2.5, borderRadius: 1.25, marginLeft: -1.25, backgroundColor: 'rgba(90,90,90,0.5)' },
  thumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(110,110,110,0.45)',
    ...shadows.control,
  },
  thumbActive: { width: 15, height: 15, borderRadius: 7.5, marginLeft: -7.5, borderColor: colors.signal, borderWidth: 2 },
  value: { width: 66, textAlign: 'right', fontFamily: 'Inter_400Regular', fontSize: 11.5, lineHeight: 15, color: colors.textSecondary },
  unit: { fontSize: 9, color: colors.textTertiary },
  chevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ring,
    ...shadows.float,
  },
});
