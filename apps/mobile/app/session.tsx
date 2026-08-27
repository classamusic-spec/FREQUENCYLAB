import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { formatClock, formatHz } from '@frequencylab/dsp-core';
import { InstrumentPanel, PanelDivider, PanelRow } from '../src/design/components/InstrumentPanel';
import { SessionRing } from '../src/design/components/SessionRing';
import { HardwareButton } from '../src/design/components/HardwareButton';
import { SignalMeter } from '../src/design/components/SignalMeter';
import {
  ModulationView,
  Oscilloscope,
  SpectrumAnalyzer,
  StereoVectorScope,
} from '../src/design/components/Visualizers';
import { SafetyBanner } from '../src/design/components/SafetyBanner';
import { Label, Text } from '../src/design/components/Text';
import { bandForFrequency, colors, radius, space } from '../src/design/tokens';
import * as haptics from '../src/design/haptics';
import { usePlayer, useScopeCapture } from '../src/state/player';
import { usePreferences } from '../src/state/preferences';
import { describeRoute } from '../src/audio/route';

/**
 * The session player (§70).
 *
 * One number dominates the screen, because one number is what the session is:
 * the rate the sound is moving at. Everything else — carrier, stage, remaining
 * time, telemetry — is arranged around it in descending order of how often it
 * needs to be read. Detail is available on demand rather than always present.
 */
export default function SessionScreen() {
  const router = useRouter();
  const snapshot = usePlayer((state) => state.snapshot);
  const pause = usePlayer((state) => state.pause);
  const play = usePlayer((state) => state.play);
  const stop = usePlayer((state) => state.stop);
  const setMasterGain = usePlayer((state) => state.setMasterGain);
  const lastCompletedSessionId = usePlayer((state) => state.lastCompletedSessionId);
  const preferences = usePreferences((state) => state.preferences);

  const [showDetails, setShowDetails] = useState(false);
  const [showIntensity, setShowIntensity] = useState(false);
  const [gain, setGain] = useState(preferences.comfortableOutputLevel);

  const playing = snapshot.state === 'playing';
  const paused = snapshot.state === 'paused';
  const capture = useScopeCapture(showDetails ? 24 : 12, playing);
  const telemetry = snapshot.telemetry;

  useEffect(() => {
    // The screen may lock, but the device must not sleep the process out from
    // under a running session.
    void activateKeepAwakeAsync('frequency-lab-session');
    return () => {
      void deactivateKeepAwake('frequency-lab-session');
    };
  }, []);

  useEffect(() => {
    if (snapshot.state !== 'completed') return;
    haptics.complete();
    if (lastCompletedSessionId) router.replace(`/rate/${lastCompletedSessionId}`);
    else router.back();
  }, [lastCompletedSessionId, router, snapshot.state]);

  const beat = useMemo(() => {
    if (!telemetry) return 0;
    return telemetry.readouts['tone:beat'] ?? telemetry.readouts['tone:pulse'] ?? 0;
  }, [telemetry]);

  const carrier = telemetry?.readouts['tone:carrier'] ?? 0;
  const band = bandForFrequency(beat);
  const progress =
    telemetry && telemetry.durationSec > 0 ? telemetry.positionSec / telemetry.durationSec : 0;
  const stageProgress =
    telemetry && telemetry.stageDurationSec > 0
      ? telemetry.stagePositionSec / telemetry.stageDurationSec
      : 0;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={12}
          >
            <Label>Back</Label>
          </Pressable>
          <View style={styles.headerCentre}>
            <Label>{snapshot.protocolName ?? 'Session'}</Label>
          </View>
          <Label tone={snapshot.backend.audible ? 'tertiary' : 'warning'}>
            {describeRoute(snapshot.route)}
          </Label>
        </View>

        {!snapshot.backend.audible ? (
          <SafetyBanner
            check={{
              id: 'no-audio',
              level: 'warning',
              title: 'No audio output',
              message:
                'The native audio engine is not available in this build, so the protocol clock is running but nothing is being played. Run a development build to hear it.',
            }}
            style={styles.banner}
          />
        ) : null}

        {snapshot.notice ? (
          <SafetyBanner
            check={{
              id: 'notice',
              level: 'warning',
              title: 'Output changed',
              message: snapshot.notice,
            }}
            style={styles.banner}
          />
        ) : null}

        <View style={styles.stage}>
          <SessionRing
            beatHz={beat}
            progress={progress}
            stageProgress={stageProgress}
            bandLabel={band ? `${band.label} range` : undefined}
            paused={paused}
          />
        </View>

        <View style={styles.primaryReadouts}>
          <View style={styles.readoutColumn}>
            <Label>Carrier</Label>
            <Text variant="readoutLg">{formatHz(carrier, 3, 3)}</Text>
          </View>
          <View style={styles.readoutColumn}>
            <Label>Stage</Label>
            <Text variant="readoutLg">{telemetry?.stageName ?? '—'}</Text>
          </View>
          <View style={styles.readoutColumn}>
            <Label>Remaining</Label>
            <Text variant="readoutLg">
              {telemetry ? formatClock(telemetry.durationSec - telemetry.positionSec) : '--:--'}
            </Text>
          </View>
        </View>

        <View style={styles.waveform}>
          <Oscilloscope
            samples={capture?.left ?? null}
            samplesRight={capture?.right ?? null}
            height={72}
            label="Live output"
          />
        </View>

        {showIntensity ? (
          <InstrumentPanel tone="raised" label="Intensity">
            <Text variant="bodySm" tone="secondary">
              This lowers the app&apos;s own output. It never changes your device volume.
            </Text>
            <View style={styles.intensityRow}>
              {[0.2, 0.35, 0.5, 0.65, 0.8].map((level) => (
                <Pressable
                  key={level}
                  accessibilityRole="button"
                  accessibilityLabel={`Set intensity to ${Math.round(level * 100)} percent`}
                  accessibilityState={{ selected: Math.abs(gain - level) < 0.01 }}
                  onPress={() => {
                    haptics.engage();
                    setGain(level);
                    setMasterGain(level);
                  }}
                  style={[
                    styles.intensityStep,
                    Math.abs(gain - level) < 0.01 ? styles.intensityStepActive : null,
                  ]}
                >
                  <Text
                    variant="readoutSm"
                    tone={Math.abs(gain - level) < 0.01 ? 'signal' : 'tertiary'}
                  >
                    {Math.round(level * 100)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </InstrumentPanel>
        ) : null}

        {showDetails ? (
          <InstrumentPanel tone="recessed" label="Instrument telemetry" bare>
            <View style={styles.telemetry}>
              <View style={styles.telemetryTop}>
                <SignalMeter
                  peakL={telemetry?.level.peakL ?? 0}
                  peakR={telemetry?.level.peakR ?? 0}
                  peakDbL={telemetry?.level.peakDbL}
                  peakDbR={telemetry?.level.peakDbR}
                  gainReductionDb={telemetry?.gainReductionDb ?? 0}
                  style={styles.meter}
                />
                <StereoVectorScope
                  left={capture?.left ?? null}
                  right={capture?.right ?? null}
                  correlation={telemetry?.level.correlation ?? 0}
                  size={116}
                />
              </View>

              <SpectrumAnalyzer bins={capture?.spectrum ?? null} sampleRate={capture?.sampleRate} />
              <ModulationView envelope={modulationEnvelope(beat)} phase={stageProgress % 1} />

              <PanelDivider />
              <PanelRow label="Sample rate" value={`${telemetry?.sampleRate ?? 0} Hz`} />
              <PanelRow label="Block size" value={String(telemetry?.blockSize ?? 0)} />
              <PanelRow
                label="Output latency"
                value={`${Math.round(snapshot.backend.stats.outputLatencySec * 1000)} ms`}
              />
              <PanelRow label="DSP load" value={`${Math.round(snapshot.backend.stats.load * 100)}%`} />
              <PanelRow label="Underruns" value={String(snapshot.backend.stats.underruns)} />
              <PanelRow label="Active nodes" value={String(telemetry?.activeNodes ?? 0)} />
              <PanelRow
                label="Protocol clock"
                value={`${formatClock(telemetry?.positionSec ?? 0)} / ${formatClock(telemetry?.durationSec ?? 0)}`}
              />
            </View>
          </InstrumentPanel>
        ) : null}
      </ScrollView>

      <View style={styles.transport}>
        <HardwareButton
          label={paused ? 'Resume' : 'Pause'}
          style={styles.transportButton}
          selected={paused}
          onPress={() => (paused ? void play() : void pause())}
        />
        <HardwareButton
          label="Stop"
          variant="danger"
          style={styles.transportButton}
          onPress={async () => {
            await stop();
            router.back();
          }}
        />
        <HardwareButton
          label="Intensity"
          style={styles.transportButton}
          selected={showIntensity}
          onPress={() => setShowIntensity((current) => !current)}
        />
        <HardwareButton
          label="Details"
          style={styles.transportButton}
          selected={showDetails}
          onPress={() => setShowDetails((current) => !current)}
        />
      </View>
    </View>
  );
}

/**
 * One period of the modulation envelope, for the modulation view.
 *
 * Derived from the displayed rate rather than tapped from the engine: the shape
 * is what the user is being shown, and computing it here costs the audio path
 * nothing.
 */
function modulationEnvelope(beatHz: number): Float32Array | null {
  if (beatHz <= 0) return null;
  const points = 128;
  const envelope = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    envelope[i] = 0.5 * (1 + Math.sin((2 * Math.PI * i) / points));
  }
  return envelope;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.xl, paddingTop: space.vast, paddingBottom: 140, gap: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCentre: { flex: 1, alignItems: 'center' },
  banner: { marginTop: space.sm },
  stage: { alignItems: 'center', marginTop: space.md },
  primaryReadouts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  readoutColumn: { gap: space.xxs, flex: 1 },
  waveform: { marginTop: space.xs },
  intensityRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  intensityStep: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.md,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceRecessed,
  },
  intensityStepActive: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.signalDim,
  },
  telemetry: { padding: space.lg, gap: space.md },
  telemetryTop: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  meter: { flex: 1 },
  transport: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: space.sm,
    padding: space.lg,
    paddingBottom: space.xxxl,
    backgroundColor: colors.chassis,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairlineStrong,
  },
  transportButton: { flex: 1 },
});
