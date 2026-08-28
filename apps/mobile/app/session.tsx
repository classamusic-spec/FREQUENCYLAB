import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { formatClock } from '@frequencylab/dsp-core';
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
import { DisplayGlass } from '../src/design/components/Surface';
import {
  ChevronIcon,
  InfoIcon,
  PauseIcon,
  PlayIcon,
  StereoRingsIcon,
  StopIcon,
  WaveformIcon,
} from '../src/design/components/Icons';
import { bandForFrequency, colors, radius, space } from '../src/design/tokens';
import * as haptics from '../src/design/haptics';
import { usePlayer, useScopeCapture } from '../src/state/player';
import { usePreferences } from '../src/state/preferences';
import { sessionController } from '../src/audio/sessionController';
import { describeRoute } from '../src/audio/route';

/**
 * The session player (§70).
 *
 * One number dominates the screen, because one number is what the session is:
 * the rate the sound is moving at. It sits on the face of the dial, the dial's
 * full-circle scale is the protocol timeline, and everything else — what the
 * headphones are literally producing, the carrier, the remaining time, the
 * transport — descends from it in the order the reference hardware arranges.
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
  const [showScopes, setShowScopes] = useState(false);
  const [gain, setGain] = useState(preferences.comfortableOutputLevel);

  const playing = snapshot.state === 'playing';
  const paused = snapshot.state === 'paused';
  const capture = useScopeCapture(showDetails || showScopes ? 24 : 8, playing && (showDetails || showScopes));
  const telemetry = snapshot.telemetry;

  useEffect(() => {
    // The screen may lock, but the device must not sleep the process out from
    // under a running session.
    void activateKeepAwakeAsync('frequency-lab-session');
    return () => {
      void deactivateKeepAwake('frequency-lab-session');
    };
  }, []);

  // The completion haptic fires as soon as playback ends, independent of the
  // record being written.
  useEffect(() => {
    if (snapshot.state === 'completed') haptics.complete();
  }, [snapshot.state]);

  useEffect(() => {
    if (snapshot.state !== 'completed') return;
    // `undefined` means the session record is still being written. Leaving on
    // that value is what used to skip the rating screen entirely.
    if (lastCompletedSessionId === undefined) return;
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

  /**
   * The mode read off the running stage's actual graph, not off a label:
   * whatever node kind is generating the tone is what the row reports.
   */
  const mode = useMemo(() => {
    const protocol = sessionController.currentProtocol;
    const stage = protocol?.stages[telemetry?.stageIndex ?? 0];
    const kinds = new Set(stage?.graph.nodes.map((node) => node.kind) ?? []);
    if (kinds.has('binaural')) return 'Binaural';
    if (kinds.has('monaural')) return 'Monaural';
    if (kinds.has('isochronic')) return 'Isochronic';
    if (kinds.has('oscillator')) return 'Tone';
    return '—';
  }, [telemetry?.stageIndex]);

  const isPulse = telemetry ? telemetry.readouts['tone:pulse'] !== undefined : false;
  // What each ear receives. Only a binaural pair actually differs between the
  // ears; every other engine sends the same signal to both.
  const leftHz = carrier;
  const rightHz = mode === 'Binaural' ? carrier + beat : carrier;
  const peakL = telemetry?.level.peakL ?? 0;
  const peakR = telemetry?.level.peakR ?? 0;

  const remaining = telemetry ? telemetry.durationSec - telemetry.positionSec : 0;

  const toggleMute = () => {
    haptics.engage();
    if (gain > 0.001) {
      setGain(0);
      setMasterGain(0);
    } else {
      const restored = preferences.comfortableOutputLevel;
      setGain(restored);
      setMasterGain(restored);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.headerButton}
          >
            <ChevronIcon direction="down" color={colors.textSecondary} />
          </Pressable>
          <View style={styles.headerCentre}>
            <Text variant="labelLg" uppercase style={styles.headerTitle}>
              Frequency Lab
            </Text>
            <Label tone="tertiary">Player</Label>
          </View>
          <Pressable
            onPress={() => setShowDetails((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel="Session details"
            accessibilityState={{ expanded: showDetails }}
            style={styles.headerButton}
          >
            <InfoIcon color={showDetails ? colors.signal : colors.textSecondary} />
          </Pressable>
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

        {/* What the number above actually is — a beat or a pulse rate. */}
        <View style={styles.beatChipRow}>
          <DisplayGlass cornerRadius={radius.control}>
            <View style={styles.beatChip}>
              <WaveformIcon size={18} color={colors.textSecondary} />
              <View style={styles.beatChipText}>
                <Label tone="tertiary">{isPulse ? 'Pulse rate' : `${mode} beat`}</Label>
                <Text variant="readout" tone="displaySignal">
                  {beat.toFixed(3)} Hz
                </Text>
              </View>
              <Pressable
                onPress={() => setShowDetails((current) => !current)}
                accessibilityRole="button"
                accessibilityLabel="What am I hearing?"
                hitSlop={8}
              >
                <InfoIcon size={18} color={colors.textTertiary} />
              </Pressable>
            </View>
          </DisplayGlass>
        </View>

        <InstrumentPanel tone="raised">
          <View style={styles.carrierRow}>
            <View>
              <Label>Carrier</Label>
              <Text variant="readoutLg" style={styles.carrierValue}>
                {carrier.toFixed(3)} <Text variant="readoutSm" tone="tertiary">Hz</Text>
              </Text>
            </View>
            <View style={styles.modeCell}>
              <Label>Mode</Label>
              <Text variant="readout" tone="secondary" style={styles.carrierValue}>
                {mode}
              </Text>
            </View>
          </View>
        </InstrumentPanel>

        <InstrumentPanel tone="recessed">
          <View style={styles.earsRow}>
            <View style={styles.earCell}>
              <Label>Left</Label>
              <Text variant="readout" style={styles.earValue}>
                {leftHz.toFixed(3)} <Text variant="readoutXs" tone="tertiary">Hz</Text>
              </Text>
              <View style={styles.levelTrack}>
                <View style={[styles.levelFill, { width: `${Math.round(Math.min(1, peakL) * 100)}%` }]} />
              </View>
            </View>
            <View style={styles.earBadge}>
              <StereoRingsIcon size={26} color={colors.signal} />
            </View>
            <View style={[styles.earCell, styles.earCellRight]}>
              <Label>Right</Label>
              <Text variant="readout" style={styles.earValue}>
                {rightHz.toFixed(3)} <Text variant="readoutXs" tone="tertiary">Hz</Text>
              </Text>
              <View style={styles.levelTrack}>
                <View style={[styles.levelFill, { width: `${Math.round(Math.min(1, peakR) * 100)}%` }]} />
              </View>
            </View>
          </View>
        </InstrumentPanel>

        <InstrumentPanel tone="raised">
          <View style={styles.timeHeader}>
            <Label>Time remaining</Label>
            <Label tone="tertiary">{telemetry?.stageName ?? ''}</Label>
          </View>
          <View style={styles.timeRow}>
            <Text variant="readoutLg" tone="signal">
              {telemetry ? formatClock(remaining) : '--:--'}
            </Text>
            <Text variant="readout" tone="tertiary">
              {'  /  '}
              {telemetry ? formatClock(telemetry.durationSec) : '--:--'}
            </Text>
          </View>
          <View
            style={styles.progressTrack}
            accessible
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          >
            <View style={[styles.progressFill, { width: `${Math.max(1, progress * 100)}%` }]} />
            <View style={[styles.progressThumb, { left: `${Math.max(1, progress * 100)}%` }]} />
          </View>

          <View style={styles.transportRow}>
            <Pressable
              onPress={async () => {
                await stop();
                router.back();
              }}
              accessibilityRole="button"
              accessibilityLabel="Stop the session"
              style={styles.transportSmall}
            >
              <StopIcon size={20} color={colors.limit} />
            </Pressable>

            <Pressable
              onPress={() => (paused ? void play() : void pause())}
              accessibilityRole="button"
              accessibilityLabel={paused ? 'Resume' : 'Pause'}
              style={styles.transportMain}
            >
              <View style={styles.transportMainRing} pointerEvents="none" />
              {paused ? (
                <PlayIcon size={26} color={colors.signal} />
              ) : (
                <PauseIcon size={26} color={colors.signal} />
              )}
            </Pressable>

            <Pressable
              onPress={toggleMute}
              accessibilityRole="button"
              accessibilityLabel={gain > 0.001 ? 'Mute output' : 'Restore output level'}
              accessibilityState={{ selected: gain <= 0.001 }}
              style={styles.transportSmall}
            >
              <WaveformIcon size={20} color={gain > 0.001 ? colors.textSecondary : colors.warning} />
            </Pressable>
          </View>
        </InstrumentPanel>

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

        {showScopes ? (
          <>
            <View style={styles.waveform}>
              <Label style={styles.scopeLabel}>Output</Label>
              <DisplayGlass cornerRadius={radius.control}>
                <Oscilloscope
                  samples={capture?.left ?? null}
                  samplesRight={capture?.right ?? null}
                  height={72}
                  label="Live output"
                />
              </DisplayGlass>
            </View>

            <View style={styles.waveform}>
              <Label style={styles.scopeLabel}>Spectrum</Label>
              <DisplayGlass cornerRadius={radius.control}>
                <SpectrumAnalyzer
                  bins={capture?.spectrum ?? null}
                  sampleRate={capture?.sampleRate}
                  height={96}
                />
              </DisplayGlass>
            </View>
          </>
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
              <PanelRow label="Output route" value={describeRoute(snapshot.route)} />
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

      <View style={styles.footer}>
        <HardwareButton
          label="Intensity"
          size="sm"
          style={styles.footerButton}
          selected={showIntensity}
          onPress={() => setShowIntensity((current) => !current)}
        />
        <HardwareButton
          label="Details"
          size="sm"
          style={styles.footerButton}
          selected={showDetails}
          onPress={() => setShowDetails((current) => !current)}
        />
        <HardwareButton
          label="Visualizer"
          size="sm"
          style={styles.footerButton}
          selected={showScopes}
          onPress={() => setShowScopes((current) => !current)}
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
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    shadowColor: '#33486A',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  headerCentre: { flex: 1, alignItems: 'center', gap: 2 },
  headerTitle: { letterSpacing: 3 },
  banner: { marginTop: space.sm },
  stage: { alignItems: 'center', marginTop: space.xs },

  beatChipRow: { alignItems: 'center', marginTop: -space.xs },
  beatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    minWidth: 230,
  },
  beatChipText: { flex: 1, alignItems: 'center', gap: 1 },

  carrierRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  carrierValue: { marginTop: space.xxs },
  modeCell: { alignItems: 'flex-end' },

  earsRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  earCell: { flex: 1, gap: space.xxs },
  earCellRight: { alignItems: 'flex-end' },
  earValue: { marginTop: 1 },
  earBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
    shadowColor: '#33486A',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  levelTrack: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(96,110,132,0.18)',
    overflow: 'hidden',
    alignSelf: 'stretch',
    marginTop: space.xs,
  },
  levelFill: { height: 3, borderRadius: 1.5, backgroundColor: colors.signal },

  timeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginTop: space.sm,
  },
  progressTrack: {
    marginTop: space.md,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(96,110,132,0.18)',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: colors.signal,
  },
  progressThumb: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    marginLeft: -7,
    borderRadius: 7,
    backgroundColor: colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
    shadowColor: '#33486A',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  transportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxl,
    marginTop: space.lg,
  },
  transportSmall: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: 1,
    borderTopColor: colors.edgeLight,
    shadowColor: '#33486A',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  transportMain: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
    borderTopWidth: 1,
    borderTopColor: colors.edgeLight,
    shadowColor: '#33486A',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 6,
  },
  // The engaged transport wears the illumination as a ring, like the dial.
  transportMainRing: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    bottom: 3,
    borderRadius: 35,
    borderWidth: 2,
    borderColor: colors.signal,
    shadowColor: colors.signal,
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },

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
  waveform: { marginTop: space.xs, gap: space.xxs },
  scopeLabel: { marginLeft: space.xxs },
  telemetry: { padding: space.lg, gap: space.md },
  telemetryTop: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  meter: { flex: 1 },

  footer: {
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
  footerButton: { flex: 1 },
});
