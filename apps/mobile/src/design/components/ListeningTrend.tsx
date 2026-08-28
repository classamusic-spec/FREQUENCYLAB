import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { formatClock, type DailyTotal } from '@frequencylab/dsp-core';
import { colors, radius, space } from '../tokens';
import { Label, Text } from './Text';

export interface ListeningTrendProps {
  /** One entry per day, oldest first — straight from `dailyTotals`. */
  days: DailyTotal[];
  height?: number;
}

/**
 * A sparkline of daily listening time.
 *
 * Deliberately a plot rather than a chart: no axes, no gridlines, no numbers
 * printed on it. It answers one question — has this been steady, sporadic, or
 * stopped — and the exact figures are read from the rows underneath.
 *
 * Two honesty constraints shape the drawing:
 *
 *  - the x axis is *time*, not sessions, so days with nothing sit on the
 *    baseline and a fortnight's gap looks like a fortnight's gap. `dailyTotals`
 *    supplies the empty days; this component must never compact them out.
 *  - the y axis is scaled to the largest day in the window and nothing else, so
 *    the line never implies a target. A quiet month is drawn quiet.
 *
 * The look is the instrument's: a hairline baseline milled across the well, one
 * thin trace in the single illumination colour, and a small mark on each day
 * that actually holds a session — without those marks a history of one session
 * in thirty days reads as a stray spike rather than a data point.
 */
export function ListeningTrend({ days, height = 64 }: ListeningTrendProps) {
  const [width, setWidth] = useState(0);

  const peakSec = days.reduce((max, day) => Math.max(max, day.playedSec), 0);
  const total = days.reduce((sum, day) => sum + day.playedSec, 0);
  const activeDays = days.filter((day) => day.sessions > 0).length;

  // Room for the endpoint marker on every edge, so the peak day and today's dot
  // are never sliced in half by the wall of the well.
  const padTop = 7;
  const padX = 4;
  const baselineY = height - 4;
  const usable = Math.max(1, baselineY - padTop);
  const span = Math.max(1, width - padX * 2);

  const xOf = (index: number) =>
    days.length <= 1 ? width / 2 : padX + (index / (days.length - 1)) * span;
  // A flat zero window still draws on the baseline rather than dividing by it.
  const yOf = (playedSec: number) =>
    peakSec <= 0 ? baselineY : baselineY - (playedSec / peakSec) * usable;

  const path =
    width > 0 && days.length > 0
      ? days
          .map(
            (day, index) =>
              `${index === 0 ? 'M' : 'L'} ${xOf(index).toFixed(1)} ${yOf(day.playedSec).toFixed(1)}`,
          )
          .join(' ')
      : null;

  const first = days[0];
  const last = days[days.length - 1];

  return (
    <View style={styles.container}>
      <View
        style={[styles.well, { height }]}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        accessibilityRole="image"
        accessibilityLabel={
          activeDays === 0
            ? `Listening over the last ${days.length} days: nothing recorded in this window.`
            : `Listening over the last ${days.length} days: ${formatClock(total)} across ${activeDays} day${activeDays === 1 ? '' : 's'}, with a longest day of ${formatClock(peakSec)}.`
        }
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Line
              x1={padX}
              y1={baselineY}
              x2={width - padX}
              y2={baselineY}
              stroke={colors.engraving}
              strokeWidth={1}
            />
            {path ? (
              <Path
                d={path}
                stroke={colors.signal}
                strokeWidth={1.4}
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="none"
              />
            ) : null}
            {days.map((day, index) =>
              day.sessions > 0 ? (
                <Circle
                  key={day.date}
                  cx={xOf(index)}
                  cy={yOf(day.playedSec)}
                  r={index === days.length - 1 ? 2.6 : 1.7}
                  fill={colors.signal}
                />
              ) : null,
            )}
          </Svg>
        ) : null}
      </View>

      <View style={styles.axis}>
        <Label>{first ? formatDay(first.date) : ''}</Label>
        <Text variant="readoutXs" tone="tertiary">
          {peakSec > 0 ? `peak ${formatClock(peakSec)}` : 'no listening in this window'}
        </Text>
        <Label>{last ? 'Today' : ''}</Label>
      </View>
    </View>
  );
}

/**
 * `2026-03-15` → `15 Mar`. Formatted from the string's own parts rather than
 * through a `Date`, because the key already names a calendar day in the user's
 * offset and parsing it back would drag the runtime's zone into the label.
 */
function formatDay(key: string): string {
  const [, month, day] = key.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const index = Number.parseInt(month, 10) - 1;
  return `${Number.parseInt(day, 10)} ${months[index] ?? ''}`.trim();
}

const styles = StyleSheet.create({
  container: { gap: space.xs },
  well: {
    backgroundColor: colors.surfaceRecessed,
    borderRadius: radius.engraved,
    overflow: 'hidden',
  },
  axis: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
