import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  RadialGradient,
  Stop,
  LinearGradient as SvgLinearGradient,
} from 'react-native-svg';
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
  size = 332,
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
        <Defs>
          {/* Brushed bezel around the display disc. */}
          <SvgLinearGradient id="ringBezel" x1="0.15" y1="0" x2="0.85" y2="1">
            <Stop offset="0" stopColor="#F4F7FA" />
            <Stop offset="0.45" stopColor="#CFD6E0" />
            <Stop offset="1" stopColor="#A6B0BE" />
          </SvgLinearGradient>
          {/* The glass itself, slightly lifted at the top by reflected sky. */}
          <RadialGradient id="ringGlass" cx="38%" cy="26%" r="86%">
            <Stop offset="0" stopColor="#1B242E" />
            <Stop offset="0.55" stopColor="#0D131A" />
            <Stop offset="1" stopColor="#070A0E" />
          </RadialGradient>
        </Defs>

        {/* Bezel, then the recessed glass face it frames. */}
        <Circle cx={centre} cy={centre} r={centre - 1} fill="url(#ringBezel)" />
        <Circle cx={centre} cy={centre} r={centre - 1} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={1} />
        <Circle cx={centre} cy={centre} r={centre - 9} fill="url(#ringGlass)" />
        <Circle cx={centre} cy={centre} r={centre - 9} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={1.5} />

        <Circle
          cx={centre}
          cy={centre}
          r={outerRadius}
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={3}
          fill="none"
        />
        <Path
          d={arc(centre, outerRadius, -90, -90 + progress * 360)}
          stroke={paused ? '#8A929E' : colors.displaySignal}
          strokeWidth={9}
          strokeLinecap="round"
          fill="none"
          opacity={0.20}
        />
        <Path
          d={arc(centre, outerRadius, -90, -90 + progress * 360)}
          stroke={paused ? '#A8B0BC' : colors.displaySignal}
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
        />

        <Circle
          cx={centre}
          cy={centre}
          r={innerRadius}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={1.5}
          fill="none"
        />
        <Path
          d={arc(centre, innerRadius, -90, -90 + stageProgress * 360)}
          stroke="rgba(53,214,196,0.55)"
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
                stroke={reached ? 'rgba(233,246,243,0.42)' : 'rgba(233,246,243,0.12)'}
                strokeWidth={major ? 1.2 : 0.8}
              />
            );
          })}
        </G>
      </Svg>

      <View style={styles.readout} pointerEvents="none">
        <Text variant="hero" tone={paused ? 'displayDim' : 'display'}>
          {formatHz(beatHz, 3, 3)}
        </Text>
        <Text variant="readout" tone="displaySignal">
          Hz
        </Text>
        {bandLabel ? (
          <Label tone="displayDim" style={styles.band}>
            {bandLabel}
          </Label>
        ) : null}
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
