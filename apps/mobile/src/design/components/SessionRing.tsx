import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import { formatHz } from '@frequencylab/dsp-core';
import { colors, space } from '../tokens';
import { Label, Text } from './Text';

export interface SessionRingProps {
  /** Live beat or modulation rate, in Hz. */
  beatHz: number;
  /** Session progress, 0..1. */
  progress: number;
  /** Progress through the current stage, 0..1. */
  stageProgress: number;
  bandLabel?: string;
  size?: number;
  /** Dims the ring while paused. */
  paused?: boolean;
}

/**
 * The instrument display at the centre of a running session (§32, §70).
 *
 * Two concentric arcs: the outer one is the whole protocol, the inner one the
 * current stage. Tick marks sit between them so progress can be read at a
 * glance without a number, and the number is there anyway.
 */
export function SessionRing({
  beatHz,
  progress,
  stageProgress,
  bandLabel,
  size = 300,
  paused,
}: SessionRingProps) {
  const centre = size / 2;
  const outerRadius = centre - 10;
  const innerRadius = outerRadius - 16;

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Session progress ${Math.round(progress * 100)} percent. Beat ${beatHz.toFixed(2)} hertz.`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={centre}
          cy={centre}
          r={outerRadius}
          stroke={colors.surfaceRecessed}
          strokeWidth={3}
          fill="none"
        />
        <Path
          d={arc(centre, outerRadius, -90, -90 + progress * 360)}
          stroke={paused ? colors.textTertiary : colors.signal}
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
        />

        <Circle
          cx={centre}
          cy={centre}
          r={innerRadius}
          stroke={colors.surfaceRecessed}
          strokeWidth={1.5}
          fill="none"
        />
        <Path
          d={arc(centre, innerRadius, -90, -90 + stageProgress * 360)}
          stroke={colors.signalDim}
          strokeWidth={1.5}
          strokeLinecap="round"
          fill="none"
        />

        <G>
          {Array.from({ length: 60 }, (_, index) => {
            const angle = -90 + (index / 60) * 360;
            const major = index % 5 === 0;
            const from = polar(centre, outerRadius - 8, angle);
            const to = polar(centre, outerRadius - (major ? 16 : 12), angle);
            const reached = index / 60 <= progress;
            return (
              <Line
                key={index}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={reached ? colors.hairlineStrong : colors.hairline}
                strokeWidth={major ? 1.2 : 0.8}
              />
            );
          })}
        </G>
      </Svg>

      <View style={styles.readout} pointerEvents="none">
        <Text variant="hero" tone={paused ? 'secondary' : 'primary'}>
          {formatHz(beatHz, 3, 3)}
        </Text>
        <Text variant="readout" tone="tertiary">
          Hz
        </Text>
        {bandLabel ? <Label style={styles.band}>{bandLabel}</Label> : null}
      </View>
    </View>
  );
}

function polar(centre: number, r: number, degrees: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  return { x: centre + r * Math.cos(radians), y: centre + r * Math.sin(radians) };
}

function arc(centre: number, r: number, fromDeg: number, toDeg: number): string {
  const sweep = Math.max(0.001, Math.min(359.999, toDeg - fromDeg));
  const start = polar(centre, r, fromDeg);
  const end = polar(centre, r, fromDeg + sweep);
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${end.x} ${end.y}`;
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  readout: { position: 'absolute', alignItems: 'center' },
  band: { marginTop: space.sm },
});
