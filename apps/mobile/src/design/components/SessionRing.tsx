import { StyleSheet, View } from 'react-native';
import { formatHz } from '@frequencylab/dsp-core';
import { KnobFace } from './KnobFace';
import { LABEL_PAD, START_ANGLE, SWEEP, labelStops, toNormalised } from './FrequencyEncoder';
import { colors, space } from '../tokens';
import { Label, Text } from './Text';

export interface SessionRingProps {
  /**
   * The number this session is, in Hz — or null where it has none.
   *
   * Not always a rate. A binaural preset is its beat, but a Solfeggio tone is
   * its frequency and broadband noise is neither. This used to be `beatHz` and
   * the caller passed a rate that 48 of the 80 presets do not have, so the
   * largest readout on the screen printed `0.000 Hz` over an audible 528 Hz
   * tone. What the number *is* now comes with it.
   */
  valueHz: number | null;
  /** What the number is: `Beat`, `Pulse`, `Tone`. Read out to a screen reader. */
  valueLabel: string;
  /** Printed in place of the number when there is none. */
  absence?: string;
  /** Session progress, 0..1. */
  progress: number;
  /** Progress through the current stage, 0..1. */
  stageProgress: number;
  bandLabel?: string;
  /**
   * The rate scale to engrave round the dial, as on the Explorer encoder.
   *
   * Given, and with the value inside it, the dial reads the number on the same
   * log scale the listener set it on, and the session's progress is left to
   * the time panel. Without it — or for a value off the scale, like a 528 Hz
   * tone on a 0.1–100 Hz rate dial — the scale is the session timeline, since
   * a pointer pinned to the end stop would be a reading the dial cannot make.
   */
  scale?: { min: number; max: number };
  size?: number;
  /** Dims the ring while paused. */
  paused?: boolean;
}

/**
 * The instrument display at the centre of a running session (§32, §70).
 *
 * The same machined dial as the encoder, read-only. Where the session's number
 * is a rate inside `scale`, the dial reads it on the encoder's own engraved log
 * scale, so the player and the Explorer show one value one way. Otherwise the
 * full-circle scale is the protocol timeline and the lit travel is how far the
 * session has run. Either way the cap carries the one number the session is. Which number
 * that is depends on the engine — the beat of a binaural pair, the pulse of an
 * isochronic one, the pitch of a steady tone — so the caller says what it is
 * passing rather than this assuming a rate. Broadband noise has no such number
 * and prints why instead. The stage arc sits just inside the scale so a stage
 * boundary is visible without a number.
 */
export function SessionRing({
  valueHz,
  valueLabel,
  absence,
  progress,
  stageProgress,
  bandLabel,
  scale,
  size = 320,
  paused,
}: SessionRingProps) {
  const valueSize = Math.min(56, (size - 100) / 4.2);
  const scaled = scale !== undefined && valueHz !== null && valueHz >= scale.min && valueHz <= scale.max;
  const pad = scaled ? LABEL_PAD : 0;
  const stops = scaled
    ? labelStops(scale.min, scale.max, 'log').map((stop) => {
        const rad = ((START_ANGLE + toNormalised(stop.value, scale.min, scale.max, 'log') * SWEEP) * Math.PI) / 180;
        const r = size / 2 + LABEL_PAD * 0.62;
        return { label: stop.label, x: pad + size / 2 + r * Math.cos(rad), y: pad + size / 2 + r * Math.sin(rad) };
      })
    : [];

  return (
    <View
      style={[styles.container, { width: size + pad * 2, height: size + pad * 2 }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Session progress ${Math.round(progress * 100)} percent. ${
        valueHz === null ? (absence ?? 'No single frequency') : `${valueLabel} ${valueHz.toFixed(2)} hertz`
      }.`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
    >
      {stops.map((stop) => (
        <Text
          key={stop.label}
          variant="readoutXs"
          tone="tertiary"
          style={[styles.scaleLabel, { left: stop.x - 24, top: stop.y - 8 }]}
        >
          {stop.label}
        </Text>
      ))}

      <View style={[styles.face, { top: pad, left: pad, width: size, height: size }]}>
        <KnobFace
          size={size}
          normalised={scaled ? toNormalised(valueHz, scale.min, scale.max, 'log') : progress}
          startAngle={scaled ? START_ANGLE : -90}
          sweep={scaled ? SWEEP : 360}
          accent={colors.signal}
          locked={paused}
          showIndicator={false}
        />

        <View style={styles.readout} pointerEvents="none">
          {valueHz === null ? (
            /* No number rather than a zero standing in for one. */
            <Text variant="heading" tone={paused ? 'tertiary' : 'secondary'} style={styles.absence}>
              {absence ?? 'No single frequency'}
            </Text>
          ) : (
            <View style={styles.valueRow}>
              <Text
                variant="readoutXl"
                tone={paused ? 'tertiary' : 'primary'}
                style={{ fontSize: valueSize, lineHeight: valueSize + 6, letterSpacing: -valueSize * 0.03 }}
              >
                {formatHz(valueHz, 1, 3)}
              </Text>
              <Text variant="readoutSm" tone="tertiary" style={styles.unit}>
                Hz
              </Text>
            </View>
          )}
          {/* What the number above is, then the band it falls in where there is
              one. `Tone` on a steady preset, so the reading is never ambiguous. */}
          <Label tone="secondary" numberOfLines={1} style={styles.band}>
            {bandLabel ?? valueLabel}
          </Label>
          {paused ? (
            <Label tone="tertiary" style={styles.band}>
              Paused
            </Label>
          ) : (
            <View style={styles.stageTrack}>
              <View style={[styles.stageFill, { width: `${Math.round(stageProgress * 100)}%` }]} />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  absence: { textAlign: 'center', paddingHorizontal: 28 },
  container: { alignItems: 'center', justifyContent: 'center' },
  face: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  scaleLabel: { position: 'absolute', width: 48, textAlign: 'center' },
  readout: { position: 'absolute', alignItems: 'center' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  unit: { marginBottom: 5 },
  band: { marginTop: space.xs, letterSpacing: 2 },
  // Stage progress as a hairline bar under the value — a second full ring
  // would fight the timeline for meaning.
  stageTrack: {
    marginTop: space.sm,
    width: 72,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(109,109,109,0.18)',
    overflow: 'hidden',
  },
  stageFill: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.signal,
  },
});
