import { useMemo, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { colors, radius, space } from '../tokens';
import { Label, Text } from './Text';

/**
 * Visualisers.
 *
 * They are pure functions of a snapshot the audio engine already produced —
 * they never ask the DSP to do extra work, and they never run on the audio
 * thread. If the UI drops frames the picture stutters and the sound does not,
 * which is the required priority order (§33, §56).
 */

export interface ScopeProps {
  /** Interleaved-free mono or left-channel samples, -1..1. */
  samples: Float32Array | null;
  /** Optional right channel, drawn dimmer behind the left. */
  samplesRight?: Float32Array | null;
  height?: number;
  style?: ViewStyle;
  label?: string;
  /** Points to draw. Fewer points cost less and read the same at this size. */
  resolution?: number;
}

export function Oscilloscope({
  samples,
  samplesRight,
  height = 96,
  style,
  label = 'Oscilloscope',
  resolution = 128,
}: ScopeProps) {
  const [width, setWidth] = useMeasuredWidth();

  const paths = useMemo(() => {
    if (!samples || samples.length === 0 || width === 0) return null;
    return {
      left: buildScopePath(samples, width, height, resolution),
      right: samplesRight ? buildScopePath(samplesRight, width, height, resolution) : null,
    };
  }, [height, resolution, samples, samplesRight, width]);

  return (
    <View
      style={[styles.frame, { height }, style]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${label}. A live waveform of the audio output.`}
    >
      <Svg width={width} height={height}>
        <Line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="rgba(233,246,243,0.14)"
          strokeWidth={StyleSheet.hairlineWidth * 2}
        />
        {paths?.right ? (
          <Path d={paths.right} stroke="rgba(53,214,196,0.45)" strokeWidth={1} fill="none" />
        ) : null}
        {paths?.left ? (
          <Path d={paths.left} stroke={colors.displaySignal} strokeWidth={1.4} fill="none" />
        ) : null}
      </Svg>
      {!paths ? <EmptyTrace label="No signal" /> : null}
    </View>
  );
}

export interface SpectrumProps {
  /** Magnitude spectrum, 0..1 per bin, already smoothed by the engine. */
  bins: Float32Array | null;
  sampleRate?: number;
  height?: number;
  /** Bars to draw. Bins are pooled logarithmically into this many bars. */
  bars?: number;
  style?: ViewStyle;
}

export function SpectrumAnalyzer({
  bins,
  sampleRate = 48000,
  height = 110,
  bars = 44,
  style,
}: SpectrumProps) {
  const [width, setWidth] = useMeasuredWidth();

  const rects = useMemo(() => {
    if (!bins || bins.length === 0 || width === 0) return null;
    return buildLogBars(bins, bars, sampleRate, width, height);
  }, [bars, bins, height, sampleRate, width]);

  return (
    <View
      style={[styles.frame, { height }, style]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Spectrum analyser. A live frequency spectrum of the audio output."
    >
      <Svg width={width} height={height}>
        {GRID_HZ.map((hz) => {
          const x = logPosition(hz, sampleRate) * width;
          return (
            <Line
              key={hz}
              x1={x}
              y1={0}
              x2={x}
              y2={height}
              stroke="rgba(233,246,243,0.10)"
              strokeWidth={StyleSheet.hairlineWidth}
            />
          );
        })}
        {rects?.map((bar, index) => (
          <Rect
            key={index}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            rx={1}
            fill={bar.height > height * 0.82 ? colors.warning : colors.displaySignal}
            opacity={0.9}
          />
        ))}
      </Svg>
      {!rects ? <EmptyTrace label="No signal" /> : null}
    </View>
  );
}

export interface VectorScopeProps {
  left: Float32Array | null;
  right: Float32Array | null;
  /** Channel correlation, -1..1, shown as a numeric readout. */
  correlation?: number;
  size?: number;
  style?: ViewStyle;
}

/**
 * Stereo phase / vector view.
 *
 * Rotated 45° so a mono (correlated) signal draws a vertical line and an
 * out-of-phase signal draws a horizontal one — the convention every mastering
 * meter uses, and the reason this view is readable at a glance.
 */
export function StereoVectorScope({
  left,
  right,
  correlation = 0,
  size = 132,
  style,
}: VectorScopeProps) {
  const points = useMemo(() => {
    if (!left || !right || left.length === 0) return null;
    const stride = Math.max(1, Math.floor(left.length / 220));
    const centre = size / 2;
    const scale = centre * 0.86;
    const parts: string[] = [];
    for (let i = 0; i < left.length; i += stride) {
      const l = left[i];
      const r = right[i];
      const x = centre + ((l - r) / Math.SQRT2) * scale;
      const y = centre - ((l + r) / Math.SQRT2) * scale;
      parts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return parts.join(' ');
  }, [left, right, size]);

  return (
    <View style={[styles.vectorFrame, { width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 1}
          stroke="rgba(233,246,243,0.14)"
          strokeWidth={StyleSheet.hairlineWidth * 2}
          fill={colors.surfaceRecessed}
        />
        <Line
          x1={size / 2}
          y1={4}
          x2={size / 2}
          y2={size - 4}
          stroke={colors.hairline}
          strokeWidth={StyleSheet.hairlineWidth}
        />
        <Line
          x1={4}
          y1={size / 2}
          x2={size - 4}
          y2={size / 2}
          stroke={colors.hairline}
          strokeWidth={StyleSheet.hairlineWidth}
        />
        {points ? <Path d={points} stroke={colors.signal} strokeWidth={0.9} fill="none" opacity={0.85} /> : null}
      </Svg>
      <View style={styles.vectorReadout} pointerEvents="none">
        <Label>Corr</Label>
        <Text variant="readoutXs" tone={correlation < 0 ? 'warning' : 'secondary'}>
          {correlation >= 0 ? '+' : '−'}
          {Math.abs(correlation).toFixed(2)}
        </Text>
      </View>
    </View>
  );
}

export interface ModulationViewProps {
  /** One period of the modulation envelope, 0..1. */
  envelope: Float32Array | null;
  /** Current phase within the period, 0..1. */
  phase?: number;
  height?: number;
  style?: ViewStyle;
}

export function ModulationView({ envelope, phase = 0, height = 64, style }: ModulationViewProps) {
  const [width, setWidth] = useMeasuredWidth();

  const path = useMemo(() => {
    if (!envelope || envelope.length === 0 || width === 0) return null;
    const parts: string[] = [];
    // Two periods, so the shape of the repeat is visible rather than implied.
    const total = envelope.length * 2;
    for (let i = 0; i < total; i++) {
      const value = envelope[i % envelope.length];
      const x = (i / (total - 1)) * width;
      const y = height - 4 - value * (height - 10);
      parts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return parts.join(' ');
  }, [envelope, height, width]);

  return (
    <View
      style={[styles.frame, { height }, style]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Modulation envelope, showing two cycles of the current shape."
    >
      <Svg width={width} height={height}>
        {path ? <Path d={path} stroke={colors.signal} strokeWidth={1.4} fill="none" /> : null}
        {path ? (
          <Line
            x1={(phase / 2) * width}
            y1={0}
            x2={(phase / 2) * width}
            y2={height}
            stroke={colors.textTertiary}
            strokeWidth={1}
          />
        ) : null}
      </Svg>
      {!path ? <EmptyTrace label="No modulation" /> : null}
    </View>
  );
}

function EmptyTrace({ label }: { label: string }) {
  return (
    <View style={styles.empty} pointerEvents="none">
      <Label>{label}</Label>
    </View>
  );
}

const GRID_HZ = [100, 1000, 10000];

function logPosition(hz: number, sampleRate: number): number {
  const min = Math.log10(20);
  const max = Math.log10(sampleRate / 2);
  return (Math.log10(Math.max(20, hz)) - min) / (max - min);
}

function buildScopePath(
  samples: Float32Array,
  width: number,
  height: number,
  resolution: number,
): string {
  const stride = Math.max(1, Math.floor(samples.length / resolution));
  const centre = height / 2;
  const amplitude = centre - 3;
  const parts: string[] = [];
  let index = 0;
  for (let i = 0; i < samples.length; i += stride, index++) {
    const x = (index / (resolution - 1)) * width;
    const y = centre - samples[i] * amplitude;
    parts.push(`${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    if (index >= resolution - 1) break;
  }
  return parts.join(' ');
}

function buildLogBars(
  bins: Float32Array,
  bars: number,
  sampleRate: number,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number }[] {
  const result: { x: number; y: number; width: number; height: number }[] = [];
  const barWidth = width / bars;
  const nyquist = sampleRate / 2;
  const minLog = Math.log10(20);
  const maxLog = Math.log10(nyquist);

  for (let bar = 0; bar < bars; bar++) {
    const lowHz = Math.pow(10, minLog + (bar / bars) * (maxLog - minLog));
    const highHz = Math.pow(10, minLog + ((bar + 1) / bars) * (maxLog - minLog));
    const lowBin = Math.max(1, Math.floor((lowHz / nyquist) * bins.length));
    const highBin = Math.min(bins.length - 1, Math.ceil((highHz / nyquist) * bins.length));
    let peak = 0;
    for (let bin = lowBin; bin <= highBin; bin++) peak = Math.max(peak, bins[bin]);
    const barHeight = Math.max(1, Math.min(1, peak) * (height - 4));
    result.push({
      x: bar * barWidth + 0.8,
      y: height - barHeight,
      width: Math.max(1, barWidth - 1.6),
      height: barHeight,
    });
  }
  return result;
}

/** Measured width, so SVG children can be sized before the first paint. */
function useMeasuredWidth(): [number, (value: number) => void] {
  return useState(0);
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: 'transparent',
    borderRadius: radius.engraved,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  vectorFrame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  vectorReadout: {
    position: 'absolute',
    bottom: space.xs,
    alignItems: 'center',
  },
  empty: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
