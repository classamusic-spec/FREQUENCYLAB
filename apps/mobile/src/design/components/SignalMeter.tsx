import { useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, space } from '../tokens';
import { Label, Text } from './Text';

export interface SignalMeterProps {
  /** Peak levels, linear 0..1. */
  peakL: number;
  peakR: number;
  /** dBFS values for the numeric readout. */
  peakDbL?: number;
  peakDbR?: number;
  /** Gain reduction in dB, drawn as a downward bar. */
  gainReductionDb?: number;
  compact?: boolean;
  style?: ViewStyle;
}

const SEGMENTS = 18;
/** Segment index at which the meter changes from signal colour to warning. */
const WARN_AT = 13;
const LIMIT_AT = 16;

/**
 * An LED ladder meter.
 *
 * Levels are mapped through a dBFS scale rather than linear amplitude, because
 * a linear meter spends most of its travel on levels nobody can hear. -60 dBFS
 * sits at the bottom, 0 dBFS at the top.
 */
export function SignalMeter({
  peakL,
  peakR,
  peakDbL,
  peakDbR,
  gainReductionDb = 0,
  compact,
  style,
}: SignalMeterProps) {
  const litL = segmentsFor(peakL);
  const litR = segmentsFor(peakR);
  const reductionSegments = useMemo(
    () => Math.min(SEGMENTS, Math.round((gainReductionDb / 12) * SEGMENTS)),
    [gainReductionDb],
  );

  return (
    <View style={[styles.container, style]}>
      <View style={styles.channelRow}>
        <Label style={styles.channelLabel}>L</Label>
        <Ladder lit={litL} />
      </View>
      <View style={styles.channelRow}>
        <Label style={styles.channelLabel}>R</Label>
        <Ladder lit={litR} />
      </View>
      {!compact ? (
        <>
          <View style={styles.channelRow}>
            <Label style={styles.channelLabel}>GR</Label>
            <Ladder lit={reductionSegments} tone="reduction" />
          </View>
          <View style={styles.readouts}>
            <Text variant="readoutXs" tone="tertiary">
              {formatDb(peakDbL)} / {formatDb(peakDbR)} dBFS
            </Text>
            <Text variant="readoutXs" tone={gainReductionDb > 0.1 ? 'warning' : 'tertiary'}>
              GR {gainReductionDb.toFixed(1)} dB
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

function Ladder({ lit, tone = 'signal' }: { lit: number; tone?: 'signal' | 'reduction' }) {
  return (
    <View style={styles.ladder}>
      {Array.from({ length: SEGMENTS }, (_, index) => {
        const on = index < lit;
        const color = !on
          ? colors.surfaceRecessed
          : tone === 'reduction'
            ? colors.warning
            : index >= LIMIT_AT
              ? colors.limit
              : index >= WARN_AT
                ? colors.warning
                : colors.signal;
        return <View key={index} style={[styles.segment, { backgroundColor: color }]} />;
      })}
    </View>
  );
}

function segmentsFor(linear: number): number {
  if (linear <= 0.0001) return 0;
  const db = 20 * Math.log10(linear);
  const normalised = (db + 60) / 60;
  return Math.max(0, Math.min(SEGMENTS, Math.round(normalised * SEGMENTS)));
}

function formatDb(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return '−∞';
  return value.toFixed(1);
}

const styles = StyleSheet.create({
  container: { gap: space.xxs },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  channelLabel: { width: 16 },
  ladder: { flex: 1, flexDirection: 'row', gap: 2, height: 8 },
  segment: { flex: 1, borderRadius: 1 },
  readouts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.xxs,
  },
});
