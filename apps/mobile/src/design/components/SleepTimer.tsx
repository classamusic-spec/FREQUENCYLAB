import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { SLEEP_TIMER_FADE_SEC, formatClock } from '@frequencylab/dsp-core';
import { MIN_TOUCH_TARGET, colors, radius, space } from '../tokens';
import * as haptics from '../haptics';
import { InstrumentPanel } from './InstrumentPanel';
import { Label, Text } from './Text';
import type { SleepTimerState } from '../../audio/sessionController';

/**
 * The sleep timer control (§70).
 *
 * A row of stops rather than a duration you dial in: this is a control someone
 * reaches for lying down with the lights off, so every choice is one tap on a
 * full-height target, and the last of them — "end of session" — is the way back
 * out. There is no confirmation step, because both directions are reversible
 * and neither makes a sound.
 *
 * What it claims is deliberately narrow. It stops audio at a time you choose.
 * It does nothing to the protocol that is running and nothing to you.
 */

/** The stops offered, in minutes. Below ten a timer is a stopwatch, not a night. */
const PRESETS = [10, 20, 30, 45] as const;

export interface SleepTimerPanelProps {
  /** The armed timer, straight off the controller snapshot. */
  timer?: SleepTimerState;
  onArm: (minutes: number) => void;
  onCancel: () => void;
  style?: ViewStyle;
}

export function SleepTimerPanel({ timer, onArm, onCancel, style }: SleepTimerPanelProps) {
  const remainingSec = useRemaining(timer?.endsAt);
  const armed = timer !== undefined;

  return (
    <InstrumentPanel
      tone="raised"
      label="Sleep timer"
      headerRight={
        armed ? (
          <Label tone="signal">{`Armed · ${timer.minutes} min`}</Label>
        ) : (
          <Label tone="tertiary">Off</Label>
        )
      }
      style={style}
    >
      {armed ? (
        <View
          style={styles.readout}
          accessible
          accessibilityRole="timer"
          // Spoken as a duration. `19:42` is read out as a pair of numbers, and
          // this is the one number on the screen someone may be checking with
          // their eyes shut.
          accessibilityLabel={`Sleep timer armed. Audio fades out and stops in ${describeRemaining(remainingSec)}.`}
        >
          <Text variant="readoutLg" tone="signal">
            {formatClock(remainingSec)}
          </Text>
          <Text variant="bodySm" tone="secondary" style={styles.caption}>
            until the session fades out and stops
          </Text>
        </View>
      ) : (
        <Text variant="bodySm" tone="secondary" style={styles.caption}>
          {`Stops the session early. It fades out over ${SLEEP_TIMER_FADE_SEC} seconds — nothing else about the protocol changes.`}
        </Text>
      )}

      <View style={styles.presets}>
        {PRESETS.map((minutes) => (
          <Stop
            key={minutes}
            label={String(minutes)}
            unit="min"
            selected={armed && timer.minutes === minutes}
            accessibilityLabel={`Sleep timer, stop in ${minutes} minutes`}
            onPress={() => onArm(minutes)}
          />
        ))}
      </View>

      <Stop
        label="End of session"
        selected={!armed}
        wide
        accessibilityLabel="Sleep timer off. Let the session run to its end"
        onPress={onCancel}
      />
    </InstrumentPanel>
  );
}

/**
 * One stop on the scale.
 *
 * Selection is carried by the cap standing proud of its well and by the weight
 * of the numeral, not by colour alone (§50) — the illumination is the third
 * signal, never the only one.
 */
function Stop({
  label,
  unit,
  selected,
  wide,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  unit?: string;
  selected: boolean;
  wide?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={() => {
        haptics.engage();
        onPress();
      }}
      style={[styles.stop, wide ? styles.stopWide : styles.stopFlex, selected ? styles.stopSelected : null]}
    >
      <Text variant={wide ? 'labelLg' : 'readout'} uppercase={wide} tone={selected ? 'signal' : 'secondary'}>
        {label}
      </Text>
      {unit ? (
        <Text variant="readoutXs" tone={selected ? 'signal' : 'tertiary'}>
          {unit}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Seconds left on the deadline.
 *
 * The interval is a heartbeat, not the clock. It carries no value of its own —
 * it only asks for another render, and the number is re-derived from the
 * timestamp every time. So a firing the platform delayed, coalesced or dropped
 * while the app was in the background costs a late repaint and nothing else,
 * where a decrementing counter would have silently lost that time for good.
 * Twice a second, so the displayed second is never more than half of one stale.
 */
function useRemaining(endsAt: number | undefined): number {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (endsAt === undefined) return;
    const interval = setInterval(() => setTick((tick) => tick + 1), 500);
    return () => clearInterval(interval);
  }, [endsAt]);

  return secondsUntil(endsAt);
}

function secondsUntil(endsAt: number | undefined): number {
  if (endsAt === undefined) return 0;
  return Math.max(0, (endsAt - Date.now()) / 1000);
}

/** `1182` → "19 minutes 42 seconds", for anything that will be read aloud. */
function describeRemaining(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const parts: string[] = [];
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  if (seconds > 0 || minutes === 0) parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
  return parts.join(' ');
}

const styles = StyleSheet.create({
  readout: { alignItems: 'center', gap: space.xxs },
  caption: { textAlign: 'center' },

  presets: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  stop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: space.xxs,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceRecessed,
    // Carried unselected too, in the chassis colour: a stop must not change
    // height when it is chosen.
    borderTopWidth: 1,
    borderTopColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  stopFlex: { flex: 1 },
  stopWide: { marginTop: space.sm },
  // A cap raised out of its well, wearing the illumination the way a latched
  // hardware button does: lit along the top edge, the same colour dimmed
  // underneath where the cap is in its own shadow.
  stopSelected: {
    backgroundColor: colors.surfaceRaised,
    borderTopColor: colors.signal,
    borderBottomColor: 'rgba(59,139,245,0.4)',
    shadowColor: '#33486A',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
});
