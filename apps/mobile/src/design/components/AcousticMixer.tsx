import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import {
  MIXER_MAX_DB,
  MIXER_MIN_DB,
  MIXER_SPACE_MAX_DB,
  MIXER_UNITY_DB,
  type AcousticMix,
  type MixerGroup,
} from '@frequencylab/dsp-core';
import { colors, MIN_TOUCH_TARGET, radius, space } from '../tokens';
import * as haptics from '../haptics';
import { InstrumentPanel, PanelDivider } from './InstrumentPanel';
import { HardwareButton } from './HardwareButton';
import { Label, Text } from './Text';

/**
 * The acoustic mixer (§31).
 *
 * Per-instrument levels for the sound bath, the size of the room it is played
 * in, and the level of the core signal underneath it. The instrument the whole
 * screen is built around is one fader, and every fader here is wired to a gain
 * node that is already in the audio graph — which is the only reason any of it
 * is on screen at all (§92).
 *
 * Two things about a fader are not decoration and are worth stating.
 *
 * **The floor is a mute.** The bottom of the travel reads `OFF` and applies a
 * gain of exactly zero, because an instrument fader that leaves −40 dB of bowl
 * in the mix cannot do the one thing a per-instrument fader is for.
 *
 * **Unity is marked.** A scribed line at 0 dB, so the position a preset was
 * written at is findable by eye and by feel rather than by reading the number
 * back. Everything is a trim against the preset's own gain staging, never an
 * absolute level.
 */

/** One instrument strip, with the real material behind it. */
export interface MixerGroupRow {
  group: MixerGroup;
  label: string;
  /**
   * What is actually under this fader — planned events, or the size of the
   * pool it will draw from. Never a placeholder: a strip with nothing to say
   * is a strip that should not be drawn.
   */
  detail: string;
}

export interface AcousticMixerProps {
  mix: AcousticMix;
  /** In draw order. Only groups the running plan (or the library) has material for. */
  groups: readonly MixerGroupRow[];
  onChangeGroup: (group: MixerGroup, db: number) => void;
  onChangeSpace: (db: number) => void;
  /** The core signal's own output level, in dB. */
  coreDb: number;
  onChangeCore: (db: number) => void;
  /** How much room the presets themselves are asking for, stated once. */
  spaceDetail: string;
  coreDetail: string;
  onReset: () => void;
  resetDisabled?: boolean;
}

export function AcousticMixer({
  mix,
  groups,
  onChangeGroup,
  onChangeSpace,
  coreDb,
  onChangeCore,
  spaceDetail,
  coreDetail,
  onReset,
  resetDisabled,
}: AcousticMixerProps) {
  return (
    <>
      <InstrumentPanel
        tone="raised"
        label="Instruments"
        headerRight={
          <HardwareButton
            label="Unity"
            size="sm"
            variant="ghost"
            disabled={resetDisabled}
            onPress={onReset}
            accessibilityLabel="Return every acoustic fader to unity"
            accessibilityHint="Sets all instrument levels to 0 decibels and turns the room off."
          />
        }
      >
        <Text variant="bodySm" tone="secondary">
          A trim against the sound bath&apos;s own levels, not an absolute one. Moving a fader
          changes what is already ringing as well as what has not started yet.
        </Text>
        <View style={styles.strips}>
          {groups.map((row) => (
            <Fader
              key={row.group}
              testID={`mixer-fader-${row.group}`}
              label={row.label}
              detail={row.detail}
              db={mix.levels[row.group]}
              minDb={MIXER_MIN_DB}
              maxDb={MIXER_MAX_DB}
              onChange={(db) => onChangeGroup(row.group, db)}
            />
          ))}
        </View>
      </InstrumentPanel>

      <InstrumentPanel tone="raised" label="Room">
        <Fader
          testID="mixer-fader-space"
          label="Space"
          detail={spaceDetail}
          db={mix.spaceDb}
          minDb={MIXER_MIN_DB}
          maxDb={MIXER_SPACE_MAX_DB}
          onChange={onChangeSpace}
          neutralAtFloor
        />
      </InstrumentPanel>

      <InstrumentPanel tone="raised" label="Core signal">
        <Text variant="bodySm" tone="secondary">
          This sets the app&apos;s own output. It never changes your device volume, and it is the
          level every session starts at.
        </Text>
        <PanelDivider />
        <Fader
          testID="mixer-fader-core"
          label="Core"
          detail={coreDetail}
          db={coreDb}
          minDb={MIXER_MIN_DB}
          maxDb={0}
          onChange={onChangeCore}
        />
      </InstrumentPanel>
    </>
  );
}

interface FaderProps {
  label: string;
  detail: string;
  db: number;
  minDb: number;
  maxDb: number;
  onChange: (db: number) => void;
  /**
   * True where the bottom of the travel is this fader's ordinary resting
   * place rather than something being withheld.
   *
   * `Space` ships off, so `OFF` there is the neutral position and is drawn as
   * one. An instrument at `OFF` is an instrument the listener has silenced, and
   * that is flagged — the same amber the session screen uses for muted output.
   * Colouring both the same way would either make the default look like a fault
   * or make a muted bowl look like a default.
   */
  neutralAtFloor?: boolean;
  testID: string;
}

/** Fader resolution. A tenth of a decibel is finer than anyone can hear. */
const STEP_DB = 0.1;
/** One press of an accessibility increment. Audible, and not a nudge. */
const ACCESSIBLE_STEP_DB = 1;

/*
 * One fader, and the reason it has no `onCommit`.
 *
 * A gesture's callbacks are captured when the gesture object is built, so a
 * handler that fires at the *end* of an interaction closes over the value from
 * before it — a commit callback here reported the position the fader had left,
 * one move behind, every time. Rather than chase that with a ref, nothing here
 * fires at the end at all: `onChange` is the whole contract, and a caller that
 * needs to write something to disk debounces its own state, where the value is
 * never stale.
 */
function Fader({
  label,
  detail,
  db,
  minDb,
  maxDb,
  onChange,
  neutralAtFloor,
  testID,
}: FaderProps) {
  const [width, setWidth] = useState(0);
  /*
   * Where the fader was when this drag began.
   *
   * A drag is a displacement from the value the finger landed on, not an
   * accumulation of deltas: accumulating drifts, because every step is snapped
   * and rounded before the next one is added to it. The same model as every
   * other parameter control in the instrument.
   */
  const [startDb, setStartDb] = useState(db);

  const travel = maxDb - minDb;
  const position = clampUnit((db - minDb) / travel);
  const unityPosition = clampUnit((MIXER_UNITY_DB - minDb) / travel);
  const off = db <= minDb;
  /** Off, and worth saying so. */
  const silenced = off && !neutralAtFloor;

  const apply = useCallback(
    (next: number) => {
      const snapped = Math.round(next / STEP_DB) * STEP_DB;
      const clamped = Math.min(maxDb, Math.max(minDb, Number(snapped.toFixed(1))));
      if (clamped === db) return;
      // A detent per step would fire dozens of times a second on a drag; the
      // ends of the travel are where a fader has something to say.
      if (clamped === minDb || clamped === maxDb) haptics.boundary();
      else haptics.detent();
      onChange(clamped);
    },
    [db, maxDb, minDb, onChange],
  );

  const dragBy = useCallback(
    (fraction: number) => apply(startDb + fraction * travel),
    [apply, startDb, travel],
  );

  /**
   * A tap on the track puts the fader where it was tapped.
   *
   * Measured against the cap's own travel rather than the full width, so the
   * point the finger lands on is the point the cap ends up at. A fader whose
   * cap cannot overhang the ends of its groove has a shorter travel than the
   * groove is wide, and ignoring that puts the cap a cap's-width off at both
   * extremes.
   */
  const tapAt = useCallback(
    (x: number) => {
      if (width <= THUMB) return;
      apply(minDb + clampUnit((x - THUMB / 2) / (width - THUMB)) * travel);
    },
    [apply, minDb, travel, width],
  );

  const begin = useCallback(() => {
    setStartDb(db);
    haptics.beginGesture();
  }, [db]);

  const gesture = useMemo(
    () =>
      Gesture.Race(
        Gesture.Pan()
          .minDistance(2)
          .onBegin(() => {
            runOnJS(begin)();
          })
          .onUpdate((event) => {
            // Sliding away from the strip divides the sensitivity, so fine
            // adjustment costs no extra control.
            const fineness = 1 + Math.abs(event.translationY) / 50;
            runOnJS(dragBy)(event.translationX / (260 * fineness));
          }),
        // Generous, because a press that is held and then released without
        // moving is still a person putting the fader somewhere. Below about
        // half a second that reads as a dead control.
        Gesture.Tap()
          .maxDuration(700)
          .onEnd((event) => {
            runOnJS(tapAt)(event.x);
          }),
      ),
    [begin, dragBy, tapAt],
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const readout = off ? 'OFF' : `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;

  return (
    <View style={styles.strip}>
      <View style={styles.header}>
        <Label tone={silenced ? 'warning' : 'tertiary'}>{label}</Label>
        <Text
          variant="readoutSm"
          tone={silenced ? 'warning' : off ? 'secondary' : 'primary'}
          testID={`${testID}-readout`}
        >
          {readout}
        </Text>
      </View>

      <GestureDetector gesture={gesture}>
        <View
          testID={testID}
          onLayout={onLayout}
          style={styles.track}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${label} level`}
          accessibilityHint={detail}
          accessibilityValue={{ min: minDb, max: maxDb, now: db, text: readout }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            apply(
              db +
                (event.nativeEvent.actionName === 'increment'
                  ? ACCESSIBLE_STEP_DB
                  : -ACCESSIBLE_STEP_DB),
            );
          }}
        >
          <View style={styles.groove} />
          {/*
            Everything that moves is drawn in pixels off the measured width, so
            the cap stays inside its groove at both ends — a cap that overhangs
            the end of the channel it runs in is the one detail that gives a
            skeuomorphic fader away. Held back until the layout has been
            measured, which is one frame.
          */}
          {width > THUMB ? (
            <>
              {/* Unity, scribed into the groove. Omitted on a fader whose
                  travel does not include it, rather than drawn out of place. */}
              {unityPosition > 0 && unityPosition < 1 ? (
                <View
                  style={[styles.unity, { left: capCentre(unityPosition, width) }]}
                  pointerEvents="none"
                />
              ) : null}
              <View
                style={[
                  styles.fill,
                  { width: capCentre(position, width) },
                  off ? styles.fillOff : null,
                ]}
                pointerEvents="none"
              />
              <View
                style={[styles.thumb, { left: capCentre(position, width) - THUMB / 2 }]}
                pointerEvents="none"
              />
            </>
          ) : null}
        </View>
      </GestureDetector>

      <Text variant="caption" tone="tertiary" numberOfLines={2}>
        {detail}
      </Text>
    </View>
  );
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Where the cap's centre sits, given that it cannot overhang either end. */
function capCentre(position: number, width: number): number {
  return THUMB / 2 + position * (width - THUMB);
}

const THUMB = 18;

const styles = StyleSheet.create({
  strips: { marginTop: space.sm },
  strip: { gap: space.xxs, paddingVertical: space.xs },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 18,
  },
  /*
   * The whole track is the target.
   *
   * `MIN_TOUCH_TARGET` as real height rather than `hitSlop`, which React Native
   * Web ignores outright — and the web build is shipped, so a native-only fix
   * would leave the browser exactly as it was.
   */
  track: { height: MIN_TOUCH_TARGET, justifyContent: 'center' },
  /** A channel milled into the panel: shaded at the top, lit along the lip. */
  groove: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surfaceRecessed,
    borderTopWidth: 1,
    borderTopColor: 'rgba(96,110,132,0.22)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.9)',
  },
  fill: {
    position: 'absolute',
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.signal,
    opacity: 0.85,
  },
  fillOff: { backgroundColor: colors.textDisabled, opacity: 0.6 },
  /** A hairline scribed across the groove where the preset's own level sits. */
  unity: {
    position: 'absolute',
    width: 1,
    height: 16,
    marginLeft: -0.5,
    backgroundColor: colors.engraving,
  },
  /** A machined cap standing off the groove, lit from above and left. */
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: radius.engraved,
    marginLeft: -THUMB / 2,
    backgroundColor: colors.panelHigh,
    borderTopWidth: 1,
    borderTopColor: colors.edgeLight,
    borderBottomWidth: 1,
    borderBottomColor: colors.edgeDark,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(255,255,255,0.7)',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(83,95,112,0.20)',
    shadowColor: '#33486A',
    shadowOpacity: 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
