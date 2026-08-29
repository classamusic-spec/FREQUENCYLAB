import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import {
  CURVE_KINDS,
  clamp,
  curveValue,
  laneRange,
  type AutomationLane,
  type AutomationPoint,
  type CurveKind,
  type RoutingGraph,
} from '@frequencylab/dsp-core';
import { colors, radius, space } from '../tokens';
import * as haptics from '../haptics';
import { SegmentSelector } from './SegmentSelector';
import { Label, Text } from './Text';

export interface AutomationLaneViewProps {
  lane: AutomationLane;
  graph: RoutingGraph;
  stageDurationSec: number;
  onChange: (lane: AutomationLane) => void;
  onRemove?: () => void;
  height?: number;
  /** Playhead position within the stage, in seconds. */
  playheadSec?: number;
}

/**
 * A DAW-style automation lane (§8).
 *
 * Control points are dragged in two dimensions at once — time on x, value on y —
 * and the curve between two points belongs to the earlier of them, which is
 * what makes a two-point lane a frequency sweep and an n-point lane a full
 * automation curve with no separate concept for either.
 *
 * The rendered path is sampled through the same `curveValue` the engine uses,
 * so the shape on screen is the shape that will be played rather than an
 * approximation of it.
 */
export function AutomationLaneView({
  lane,
  graph,
  stageDurationSec,
  onChange,
  onRemove,
  height = 120,
  playheadSec,
}: AutomationLaneViewProps) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState(0);
  const range = useMemo(() => laneRange(lane, graph), [graph, lane]);

  const toX = useCallback(
    (timeSec: number) => (stageDurationSec === 0 ? 0 : (timeSec / stageDurationSec) * width),
    [stageDurationSec, width],
  );
  const toY = useCallback(
    (value: number) =>
      height - 8 - ((value - range.min) / Math.max(1e-9, range.max - range.min)) * (height - 16),
    [height, range.max, range.min],
  );
  const fromX = useCallback(
    (x: number) => clamp((x / Math.max(1, width)) * stageDurationSec, 0, stageDurationSec),
    [stageDurationSec, width],
  );
  const fromY = useCallback(
    (y: number) =>
      clamp(
        range.min + ((height - 8 - y) / Math.max(1, height - 16)) * (range.max - range.min),
        range.min,
        range.max,
      ),
    [height, range.max, range.min],
  );

  const path = useMemo(() => {
    if (width === 0 || lane.points.length === 0) return null;
    if (lane.points.length === 1) {
      const y = toY(lane.points[0].value);
      return `M 0 ${y.toFixed(1)} L ${width.toFixed(1)} ${y.toFixed(1)}`;
    }
    const parts: string[] = [];
    const samples = 96;
    // Hold before the first point and after the last, matching the engine.
    const first = lane.points[0];
    const last = lane.points[lane.points.length - 1];
    parts.push(`M 0 ${toY(first.value).toFixed(1)}`);
    parts.push(`L ${toX(first.timeSec).toFixed(1)} ${toY(first.value).toFixed(1)}`);
    for (let i = 0; i < lane.points.length - 1; i++) {
      const a = lane.points[i];
      const b = lane.points[i + 1];
      for (let s = 1; s <= samples; s++) {
        const t = s / samples;
        const value = curveValue(a.value, b.value, t, a.curve);
        const timeSec = a.timeSec + (b.timeSec - a.timeSec) * t;
        parts.push(`L ${toX(timeSec).toFixed(1)} ${toY(value).toFixed(1)}`);
      }
    }
    parts.push(`L ${width.toFixed(1)} ${toY(last.value).toFixed(1)}`);
    return parts.join(' ');
  }, [lane.points, toX, toY, width]);

  const updatePoint = (index: number, patch: Partial<AutomationPoint>) => {
    const points = lane.points.map((point, i) => (i === index ? { ...point, ...patch } : point));
    points.sort((a, b) => a.timeSec - b.timeSec);
    onChange({ ...lane, points });
  };

  const addPoint = (x: number, y: number) => {
    haptics.boundary();
    const point: AutomationPoint = {
      timeSec: fromX(x),
      value: fromY(y),
      curve: { kind: 'smooth' },
    };
    const points = [...lane.points, point].sort((a, b) => a.timeSec - b.timeSec);
    onChange({ ...lane, points });
    setSelected(points.indexOf(point));
  };

  const removePoint = (index: number) => {
    if (lane.points.length <= 2) return;
    haptics.warn();
    onChange({ ...lane, points: lane.points.filter((_, i) => i !== index) });
    setSelected(0);
  };

  const selectedPoint = lane.points[selected];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Label tone={lane.enabled ? 'signal' : 'tertiary'}>{lane.label ?? lane.target}</Label>
          <Text variant="readoutXs" tone="tertiary">
            {range.min} – {range.max}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
          accessibilityRole="button"
          accessibilityState={{ checked: lane.enabled }}
          accessibilityLabel={lane.enabled ? "Disable this lane" : "Enable this lane"}
          onPress={() => onChange({ ...lane, enabled: !lane.enabled })} hitSlop={8}>
            <Label tone={lane.enabled ? 'tertiary' : 'warning'}>
              {lane.enabled ? 'Disable' : 'Enable'}
            </Label>
          </Pressable>
          {onRemove ? (
            <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove this lane"
          onPress={onRemove}
          hitSlop={8}
        >
              <Label tone="warning">Delete lane</Label>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Pressable
        style={[styles.canvas, { height }]}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onPress={(event) => addPoint(event.nativeEvent.locationX, event.nativeEvent.locationY)}
        accessibilityRole="adjustable"
        accessibilityLabel={`${lane.label ?? lane.target} automation, ${lane.points.length} points`}
        accessibilityHint="Tap to add a control point. Drag a point to move it."
      >
        <Svg width={width} height={height}>
          {[0.25, 0.5, 0.75].map((fraction) => (
            <Line
              key={fraction}
              x1={0}
              y1={height * fraction}
              x2={width}
              y2={height * fraction}
              stroke={colors.hairline}
              strokeWidth={StyleSheet.hairlineWidth}
            />
          ))}
          {path ? (
            <Path
              d={path}
              stroke={lane.enabled ? colors.signal : colors.textTertiary}
              strokeWidth={1.6}
              fill="none"
            />
          ) : null}
          {playheadSec !== undefined ? (
            <Line
              x1={toX(playheadSec)}
              y1={0}
              x2={toX(playheadSec)}
              y2={height}
              stroke={colors.warning}
              strokeWidth={1}
            />
          ) : null}
          {lane.points.map((point, index) => (
            <Circle
              key={index}
              cx={toX(point.timeSec)}
              cy={toY(point.value)}
              r={index === selected ? 6 : 4.5}
              fill={index === selected ? colors.signal : colors.surfaceHigh}
              stroke={colors.signal}
              strokeWidth={1.2}
            />
          ))}
        </Svg>

        {lane.points.map((point, index) => (
          <PointHandle
            key={index}
            x={toX(point.timeSec)}
            y={toY(point.value)}
            selected={index === selected}
            onSelect={() => setSelected(index)}
            onMove={(dx, dy) =>
              updatePoint(index, {
                timeSec: fromX(toX(point.timeSec) + dx),
                value: fromY(toY(point.value) + dy),
              })
            }
            onRemove={() => removePoint(index)}
          />
        ))}
      </Pressable>

      {selectedPoint ? (
        <View style={styles.inspector}>
          <View style={styles.inspectorRow}>
            <Label>Point {selected + 1}</Label>
            <Text variant="readoutSm" tone="secondary">
              {selectedPoint.timeSec.toFixed(1)} s · {selectedPoint.value.toFixed(3)}
            </Text>
          </View>
          <SegmentSelector
            scrollable
            size="sm"
            accessibilityLabel="Curve shape from this point"
            options={CURVE_KINDS.map((kind) => ({ value: kind, label: kind }))}
            value={selectedPoint.curve.kind}
            onChange={(kind) =>
              updatePoint(selected, { curve: { ...selectedPoint.curve, kind: kind as CurveKind } })
            }
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * The draggable handle over a control point.
 *
 * Kept separate from the SVG circle so the touch target can be 44 points while
 * the drawn point stays small enough not to obscure the curve (§50).
 */
function PointHandle({
  x,
  y,
  selected,
  onSelect,
  onMove,
  onRemove,
}: {
  x: number;
  y: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (dx: number, dy: number) => void;
  onRemove: () => void;
}) {
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(1)
        .onBegin(() => {
          runOnJS(onSelect)();
          runOnJS(haptics.beginGesture)();
        })
        .onChange((event) => {
          runOnJS(onMove)(event.changeX, event.changeY);
        }),
    [onMove, onSelect],
  );

  return (
    <GestureDetector gesture={gesture}>
      <Pressable
        onLongPress={onRemove}
        onPress={onSelect}
        accessibilityRole="button"
        accessibilityLabel="Automation point"
        accessibilityHint="Drag to move. Long press to delete."
        style={[styles.handle, { left: x - 22, top: y - 22 }, selected ? styles.handleSelected : null]}
      />
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { gap: 2 },
  headerActions: { flexDirection: 'row', gap: space.md },
  canvas: {
    backgroundColor: colors.surfaceRecessed,
    borderRadius: radius.engraved,
    overflow: 'hidden',
  },
  handle: { position: 'absolute', width: 44, height: 44, borderRadius: 22 },
  handleSelected: { backgroundColor: 'rgba(77, 214, 193, 0.08)' },
  inspector: { gap: space.sm },
  inspectorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
