import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { clamp, formatClock, type ProtocolStage } from '@frequencylab/dsp-core';
import { colors, radius, space } from '../tokens';
import * as haptics from '../haptics';
import { Label, Text } from './Text';

export interface ProtocolTimelineProps {
  stages: ProtocolStage[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onResize: (index: number, durationSec: number) => void;
  /** Absolute playhead position in seconds, when a session is auditioning. */
  playheadSec?: number;
  onScrub?: (seconds: number) => void;
  /** Pixels per second. Driven by the zoom control. */
  pixelsPerSecond?: number;
  height?: number;
}

export const ZOOM_LEVELS = [0.15, 0.3, 0.6, 1.2] as const;
export const MIN_STAGE_SECONDS = 30;

/**
 * The protocol timeline (§11).
 *
 * Stages are laid out to scale, so a five-minute stage next to a fifteen-minute
 * one looks like what it is. Each block carries a right-edge handle for
 * resizing, and the whole strip scrolls and zooms — a thirty-minute protocol at
 * full zoom is wider than any phone, and pretending otherwise would make the
 * durations meaningless.
 */
export function ProtocolTimeline({
  stages,
  selectedIndex,
  onSelect,
  onResize,
  playheadSec,
  onScrub,
  pixelsPerSecond = 0.3,
  height = 92,
}: ProtocolTimelineProps) {
  const offsets = useMemo(() => {
    const result: number[] = [];
    let elapsed = 0;
    for (const stage of stages) {
      result.push(elapsed);
      elapsed += stage.durationSec;
    }
    return result;
  }, [stages]);

  const total = offsets.length > 0 ? offsets[offsets.length - 1] + stages[stages.length - 1].durationSec : 0;
  const totalWidth = Math.max(240, total * pixelsPerSecond);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
      <View style={{ width: totalWidth }}>
        <View style={styles.ruler}>
          {buildTicks(total).map((tick) => (
            <View key={tick} style={[styles.tick, { left: tick * pixelsPerSecond }]}>
              <View style={styles.tickLine} />
              <Text variant="readoutXs" tone="tertiary">
                {formatClock(tick)}
              </Text>
            </View>
          ))}
        </View>

        <Pressable
          style={[styles.track, { height }]}
          onPress={(event) => onScrub?.(event.nativeEvent.locationX / pixelsPerSecond)}
          accessibilityRole="adjustable"
          accessibilityLabel="Protocol timeline"
          accessibilityHint="Tap to scrub. Select a stage to edit it."
        >
          {stages.map((stage, index) => {
            const left = offsets[index] * pixelsPerSecond;
            const width = Math.max(28, stage.durationSec * pixelsPerSecond);
            const selected = index === selectedIndex;
            return (
              <Pressable
                key={stage.id}
                onPress={() => {
                  haptics.engage();
                  onSelect(index);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${stage.name}, ${formatClock(stage.durationSec)}`}
                style={[styles.stage, { left, width }, selected ? styles.stageSelected : null]}
              >
                <Label tone={selected ? 'signal' : 'tertiary'} numberOfLines={1}>
                  {stage.name}
                </Label>
                <Text variant="readoutXs" tone="secondary">
                  {formatClock(stage.durationSec)}
                </Text>
                {stage.automation.length > 0 ? (
                  <View style={styles.automationDots}>
                    {stage.automation.slice(0, 4).map((lane) => (
                      <View key={lane.id} style={styles.automationDot} />
                    ))}
                  </View>
                ) : null}
                {stage.crossfadeSec > 0 && index > 0 ? (
                  <View style={[styles.crossfade, { width: stage.crossfadeSec * pixelsPerSecond }]} />
                ) : null}
                <ResizeHandle
                  onResize={(deltaPx) =>
                    onResize(
                      index,
                      Math.max(MIN_STAGE_SECONDS, stage.durationSec + deltaPx / pixelsPerSecond),
                    )
                  }
                />
              </Pressable>
            );
          })}

          {playheadSec !== undefined ? (
            <View
              pointerEvents="none"
              style={[styles.playhead, { left: clamp(playheadSec, 0, total) * pixelsPerSecond }]}
            />
          ) : null}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function ResizeHandle({ onResize }: { onResize: (deltaPx: number) => void }) {
  const [dragging, setDragging] = useState(false);
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(2)
        .onBegin(() => {
          runOnJS(setDragging)(true);
          runOnJS(haptics.beginGesture)();
        })
        .onChange((event) => {
          runOnJS(onResize)(event.changeX);
        })
        .onFinalize(() => {
          runOnJS(setDragging)(false);
        }),
    [onResize],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[styles.resizeHandle, dragging ? styles.resizeHandleActive : null]}
        accessibilityLabel="Resize stage"
        accessibilityRole="adjustable"
      >
        <View style={styles.resizeGrip} />
      </View>
    </GestureDetector>
  );
}

function buildTicks(totalSec: number): number[] {
  if (totalSec <= 0) return [0];
  const interval = totalSec > 3600 ? 600 : totalSec > 1200 ? 300 : totalSec > 300 ? 60 : 30;
  const ticks: number[] = [];
  for (let t = 0; t <= totalSec; t += interval) ticks.push(t);
  return ticks;
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: space.sm },
  ruler: { height: 22, marginBottom: space.xs },
  tick: { position: 'absolute', alignItems: 'flex-start' },
  tickLine: { width: StyleSheet.hairlineWidth, height: 6, backgroundColor: colors.hairlineStrong },
  track: {
    backgroundColor: colors.surfaceRecessed,
    borderRadius: radius.engraved,
  },
  stage: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: radius.engraved,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.hairlineStrong,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
    overflow: 'hidden',
    gap: 2,
  },
  stageSelected: {
    backgroundColor: colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.signalDim,
  },
  automationDots: { flexDirection: 'row', gap: 3, marginTop: space.xxs },
  automationDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.signalDim },
  crossfade: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(77, 214, 193, 0.08)',
  },
  resizeHandle: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resizeHandleActive: { backgroundColor: 'rgba(77, 214, 193, 0.12)' },
  resizeGrip: {
    width: 2,
    height: 22,
    borderRadius: 1,
    backgroundColor: colors.hairlineStrong,
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1.5,
    backgroundColor: colors.warning,
  },
});
