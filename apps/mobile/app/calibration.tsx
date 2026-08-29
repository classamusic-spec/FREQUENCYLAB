import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  createProtocol,
  makeNode,
  type Protocol,
  type RoutingGraph,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../src/design/components/Screen';
import { InstrumentPanel } from '../src/design/components/InstrumentPanel';
import { HardwareButton } from '../src/design/components/HardwareButton';
import { SegmentSelector } from '../src/design/components/SegmentSelector';
import { SignalMeter } from '../src/design/components/SignalMeter';
import { Label, Text } from '../src/design/components/Text';
import { space } from '../src/design/tokens';
import * as haptics from '../src/design/haptics';
import { usePreferences } from '../src/state/preferences';
import { usePlayer } from '../src/state/player';
import { describeRoute } from '../src/audio/route';

type TestChannel = 'left' | 'right' | 'centre';

/**
 * First-run calibration (§53).
 *
 * Two things only: confirm the channels are the way round the user expects, and
 * pick a comfortable output level. It deliberately does not claim to know the
 * absolute sound pressure level — a consumer volume slider carries no
 * information about what actually reaches the ear, and pretending otherwise
 * would be a fabricated measurement.
 */
export default function CalibrationScreen() {
  const router = useRouter();
  const preferences = usePreferences((state) => state.preferences);
  const update = usePreferences((state) => state.update);
  const loadAndPlay = usePlayer((state) => state.loadAndPlay);
  const stop = usePlayer((state) => state.stop);
  const setMasterGain = usePlayer((state) => state.setMasterGain);
  const snapshot = usePlayer((state) => state.snapshot);

  const [level, setLevel] = useState(preferences.comfortableOutputLevel);
  const [confirmed, setConfirmed] = useState<Record<TestChannel, boolean>>({
    left: false,
    right: false,
    centre: false,
  });
  const [playingChannel, setPlayingChannel] = useState<TestChannel | null>(null);

  /*
   * True once this screen has started a test tone of its own.
   *
   * Calibration used to call `stop()` unconditionally — on unmount and on both
   * buttons — which silently killed whatever the user had playing. Opening
   * Recalibrate from Profile mid-session ended that session and wrote a
   * `stoppedByUser` record for it. The screen may only stop playback it owns.
   */
  const ownsPlayback = useRef(false);

  /**
   * Where this screen exits to.
   *
   * It is reached two ways and they want different destinations: onboarding
   * `replace`s into it, so there is nothing behind it and the player is the
   * only sensible next screen, while Profile `push`es it, and dropping that
   * user on the player tab loses their place for no reason. `canGoBack`
   * distinguishes the two without either caller having to say which it is.
   */
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const stopOwnPlayback = useCallback(async () => {
    if (!ownsPlayback.current) return;
    ownsPlayback.current = false;
    await stop();
  }, [stop]);

  useEffect(() => {
    return () => {
      if (ownsPlayback.current) void stop();
    };
  }, [stop]);

  const playTest = useCallback(
    async (channel: TestChannel) => {
      haptics.engage();
      setPlayingChannel(channel);
      ownsPlayback.current = true;
      await loadAndPlay(testProtocol(channel), { masterGain: level });
    },
    [level, loadAndPlay],
  );

  const allConfirmed = confirmed.left && confirmed.right && confirmed.centre;

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Calibration"
        title="Check your output"
        subtitle={`Currently routed to ${describeRoute(snapshot.route).toLowerCase()}. This takes about a minute and you can skip it.`}
      />

      <SectionHeader label="Channel check" />
      {(['left', 'right', 'centre'] as TestChannel[]).map((channel) => (
        <InstrumentPanel key={channel} tone="flat">
          <View style={styles.channelHeader}>
            <Text variant="heading">{CHANNEL_LABEL[channel]}</Text>
            <Label tone={confirmed[channel] ? 'signal' : 'tertiary'}>
              {confirmed[channel] ? 'Confirmed' : 'Not checked'}
            </Label>
          </View>
          <Text variant="bodySm" tone="secondary">
            {CHANNEL_HINT[channel]}
          </Text>
          <View style={styles.channelActions}>
            <HardwareButton
              label={playingChannel === channel ? 'Playing' : 'Play tone'}
              size="sm"
              selected={playingChannel === channel}
              onPress={() => void playTest(channel)}
            />
            <HardwareButton
              label="That's right"
              size="sm"
              variant="ghost"
              onPress={() => {
                haptics.confirm();
                setConfirmed((current) => ({ ...current, [channel]: true }));
                // `stopOwnPlayback`, not `stop`: confirming a channel without
                // having played its test tone would otherwise end whatever the
                // user already had running — the same defect the ownership flag
                // was added for, at the one call site that had been missed.
                void stopOwnPlayback();
                setPlayingChannel(null);
              }}
            />
          </View>
        </InstrumentPanel>
      ))}

      <SectionHeader label="Comfortable level" />
      <InstrumentPanel tone="raised">
        <Text variant="bodySm" tone="secondary">
          Play a tone and set this so a normal speaking voice next to you would still be audible
          over it. Sessions will start at this level, and the app will never raise it on its own.
        </Text>
        <SegmentSelector
          style={styles.levelSelector}
          accessibilityLabel="Comfortable output level"
          options={[
            { value: '0.25', label: 'Quiet' },
            { value: '0.4', label: 'Low' },
            { value: '0.5', label: 'Medium' },
            { value: '0.65', label: 'Present' },
          ]}
          value={String(level)}
          onChange={(value) => {
            const next = Number.parseFloat(value);
            setLevel(next);
            setMasterGain(next);
          }}
        />
        <View style={styles.meterRow}>
          <SignalMeter
            peakL={snapshot.telemetry?.level.peakL ?? 0}
            peakR={snapshot.telemetry?.level.peakR ?? 0}
            peakDbL={snapshot.telemetry?.level.peakDbL}
            peakDbR={snapshot.telemetry?.level.peakDbR}
            gainReductionDb={snapshot.telemetry?.gainReductionDb ?? 0}
          />
        </View>
      </InstrumentPanel>

      <Text variant="caption" tone="tertiary">
        This measures the app&apos;s own output, not the sound pressure reaching your ear. Absolute
        loudness depends on your device, your headphones and your system volume, none of which the
        app can read.
      </Text>

      <HardwareButton
        label={allConfirmed ? 'Save and continue' : 'Save'}
        variant="primary"
        size="lg"
        onPress={async () => {
          await stopOwnPlayback();
          await update({
            comfortableOutputLevel: level,
            calibrationCompletedAt: new Date().toISOString(),
          });
          leave();
        }}
      />
      <HardwareButton
        label="Skip for now"
        variant="ghost"
        onPress={async () => {
          await stopOwnPlayback();
          leave();
        }}
      />
    </Screen>
  );
}

const CHANNEL_LABEL: Record<TestChannel, string> = {
  left: 'Left',
  right: 'Right',
  centre: 'Centre',
};

const CHANNEL_HINT: Record<TestChannel, string> = {
  left: 'You should hear this only in your left ear.',
  right: 'You should hear this only in your right ear.',
  centre: 'You should hear this evenly in both ears, as if it were in front of you.',
};

/** A ten-second test tone, built as a real protocol so it uses the real engine. */
function testProtocol(channel: TestChannel): Protocol {
  const pan = channel === 'left' ? -1 : channel === 'right' ? 1 : 0;
  const graph: RoutingGraph = {
    nodes: [
      makeNode('tone', 'oscillator', { frequency: 440, amplitude: 0.4, pan }),
      makeNode('output', 'output'),
    ],
    connections: [{ from: 'tone', to: 'output' }],
  };
  return createProtocol({
    id: `calibration-${channel}`,
    name: `Calibration · ${CHANNEL_LABEL[channel]}`,
    intent: 'explore',
    stages: [
      {
        id: 'stage-1',
        name: CHANNEL_LABEL[channel],
        durationSec: 10,
        crossfadeSec: 0,
        graph,
        automation: [],
      },
    ],
    master: { fadeInSec: 0.6, fadeOutSec: 0.8, gain: 0.5 },
  });
}

const styles = StyleSheet.create({
  channelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  channelActions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  levelSelector: { marginTop: space.md },
  meterRow: { marginTop: space.lg },
});
