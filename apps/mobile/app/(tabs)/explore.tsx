import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  MAX_BEAT_HZ,
  MAX_CARRIER_HZ,
  MIN_BEAT_HZ,
  MIN_CARRIER_HZ,
  binauralFrequencies,
  formatClock,
  formatHz,
  protocolDna,
  type NoiseColor,
  type StimulationEngine,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel, PanelDivider } from '../../src/design/components/InstrumentPanel';
import { FrequencyEncoder } from '../../src/design/components/FrequencyEncoder';
import { SegmentSelector } from '../../src/design/components/SegmentSelector';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { PrecisionValueDisplay } from '../../src/design/components/PrecisionValueDisplay';
import { Oscilloscope, SpectrumAnalyzer } from '../../src/design/components/Visualizers';
import { NumericEntrySheet } from '../../src/design/components/NumericEntrySheet';
import { DnaChip } from '../../src/design/components/Badges';
import { Label, Text } from '../../src/design/components/Text';
import { BANDS, bandForFrequency, colors, layout, space } from '../../src/design/tokens';
import { useExplorer, requiresRebuild } from '../../src/state/explorer';
import { usePlayer, useScopeCapture } from '../../src/state/player';
import { usePreferences } from '../../src/state/preferences';
import { useProtocolLibrary } from '../../src/state/library';

type EncoderTarget = 'beat' | 'carrier';

/**
 * Explorer (§4, §13).
 *
 * The screen is built around one question: what is the difference between the
 * rate and the tone? So the encoder switches between them rather than showing
 * both as equals, and the panel underneath always states the two channel
 * frequencies that are actually being generated — the thing a "7.83 Hz" label
 * hides.
 */
export default function ExploreScreen() {
  const router = useRouter();
  const recipe = useExplorer((state) => state.recipe);
  const setRecipe = useExplorer((state) => state.set);
  const toProtocol = useExplorer((state) => state.toProtocol);
  const loadAndPlay = usePlayer((state) => state.loadAndPlay);
  const snapshot = usePlayer((state) => state.snapshot);
  const stop = usePlayer((state) => state.stop);
  const preferences = usePreferences((state) => state.preferences);
  const saveProtocol = useProtocolLibrary((state) => state.save);

  const [target, setTarget] = useState<EncoderTarget>('beat');
  const [entry, setEntry] = useState<EncoderTarget | null>(null);

  const playing = snapshot.state === 'playing';
  const capture = useScopeCapture(20, playing);
  const band = bandForFrequency(recipe.beatHz);

  const channels = useMemo(
    () => binauralFrequencies(recipe.carrierHz, recipe.beatHz, recipe.binauralMode ?? 'offset'),
    [recipe.binauralMode, recipe.beatHz, recipe.carrierHz],
  );

  const protocol = useMemo(() => toProtocol('explorer-preview'), [toProtocol]);
  const dna = protocolDna(protocol);

  const apply = useCallback(
    (patch: Parameters<typeof setRecipe>[0]) => {
      const needsRebuild = requiresRebuild(patch, recipe);
      setRecipe(patch);
      if (needsRebuild && playing) {
        // A structural change cannot be a live parameter write, so the
        // protocol is rebuilt and restarted from the same position.
        void restart();
      }
    },
    [playing, recipe, setRecipe],
  );

  const restart = useCallback(async () => {
    await loadAndPlay(useExplorer.getState().toProtocol('explorer-preview'), {
      masterGain: preferences.comfortableOutputLevel,
    });
  }, [loadAndPlay, preferences.comfortableOutputLevel]);

  const togglePlayback = async () => {
    if (playing) {
      await stop();
    } else {
      await restart();
    }
  };

  return (
    <Screen bottomInset={layout.transportHeight}>
      <ScreenHeader
        eyebrow="Explorer"
        title="Frequency Explorer"
        subtitle="Turn the encoder. The sound follows without a click."
      />

      <SegmentSelector
        accessibilityLabel="Encoder target"
        options={[
          { value: 'beat', label: 'Beat / Modulation' },
          { value: 'carrier', label: 'Carrier' },
        ]}
        value={target}
        onChange={setTarget}
      />

      <View style={styles.encoderStage}>
        {target === 'beat' ? (
          <FrequencyEncoder
            key="beat"
            label="Beat frequency"
            value={recipe.beatHz}
            min={MIN_BEAT_HZ}
            max={MAX_BEAT_HZ}
            step={0.01}
            precision={3}
            integerDigits={3}
            defaultValue={10}
            caption={band ? `${band.label} range · ${band.low}–${band.high} Hz` : 'Outside the named bands'}
            onChange={(value) => apply({ beatHz: value })}
            onRequestNumericEntry={() => setEntry('beat')}
          />
        ) : (
          <FrequencyEncoder
            key="carrier"
            label="Carrier"
            value={recipe.carrierHz}
            min={MIN_CARRIER_HZ}
            max={MAX_CARRIER_HZ}
            step={0.5}
            precision={2}
            integerDigits={4}
            defaultValue={220}
            caption="The audible tone"
            onChange={(value) => apply({ carrierHz: value })}
            onRequestNumericEntry={() => setEntry('carrier')}
          />
        )}
      </View>

      <InstrumentPanel tone="recessed" label="What is being generated">
        <View style={styles.channelRow}>
          <PrecisionValueDisplay label="Left" value={channels.left} unit="Hz" precision={3} integerDigits={4} />
          <PrecisionValueDisplay label="Right" value={channels.right} unit="Hz" precision={3} integerDigits={4} />
          <PrecisionValueDisplay
            label="Difference"
            value={recipe.beatHz}
            unit="Hz"
            precision={3}
            tone="signal"
          />
        </View>
        <PanelDivider />
        <Text variant="caption" tone="tertiary">
          Your headphones are producing two tones near {Math.round(recipe.carrierHz)} Hz — not a{' '}
          {formatHz(recipe.beatHz, 1, 2)} Hz sound. The beat is what you perceive when the two
          combine; no speaker in the world reproduces {formatHz(recipe.beatHz, 1, 2)} Hz.
        </Text>
      </InstrumentPanel>

      <SectionHeader label="Engine" />
      <SegmentSelector
        accessibilityLabel="Stimulation engine"
        options={[
          { value: 'binaural', label: 'Binaural' },
          { value: 'monaural', label: 'Monaural' },
          { value: 'isochronic', label: 'Isochronic' },
        ]}
        value={recipe.engine}
        onChange={(value) => apply({ engine: value as StimulationEngine })}
      />
      <Text variant="caption" tone="tertiary">
        {ENGINE_NOTE[recipe.engine]}
      </Text>

      <SectionHeader label="Layers" />
      <InstrumentPanel tone="flat" bare>
        <View style={styles.sliderPanel}>
          <MiniEncoderRow
            label="Intensity"
            value={recipe.intensity}
            min={0}
            max={1}
            format={(value) => `${Math.round(value * 100)}%`}
            onChange={(value) => apply({ intensity: value })}
          />
          <MiniEncoderRow
            label="Noise level"
            value={recipe.noiseLevel}
            min={0}
            max={0.4}
            format={(value) => `${Math.round(value * 100)}%`}
            onChange={(value) => apply({ noiseLevel: value })}
          />
          <View style={styles.inlineRow}>
            <Label>Noise colour</Label>
            <SegmentSelector
              size="sm"
              style={styles.inlineSegment}
              accessibilityLabel="Noise colour"
              options={[
                { value: 'white', label: 'White' },
                { value: 'pink', label: 'Pink' },
                { value: 'brown', label: 'Brown' },
              ]}
              value={recipe.noiseColor}
              onChange={(value) => apply({ noiseColor: value as NoiseColor })}
            />
          </View>
          <MiniEncoderRow
            label="Stereo movement"
            value={recipe.motionDepth}
            min={0}
            max={1}
            format={(value) =>
              value === 0 ? 'Off' : `${Math.round(value * 100)}% @ ${recipe.motionRateHz.toFixed(2)} Hz`
            }
            onChange={(value) => apply({ motionDepth: value })}
          />
          {recipe.engine === 'binaural' ? (
            <View style={styles.inlineRow}>
              <Label>Calculation</Label>
              <SegmentSelector
                size="sm"
                style={styles.inlineSegment}
                accessibilityLabel="Binaural calculation mode"
                options={[
                  { value: 'offset', label: 'Offset' },
                  { value: 'centered', label: 'Centred' },
                ]}
                value={recipe.binauralMode ?? 'offset'}
                onChange={(value) => apply({ binauralMode: value as 'offset' | 'centered' })}
              />
            </View>
          ) : null}
        </View>
      </InstrumentPanel>

      <SectionHeader label="Duration" />
      <SegmentSelector
        scrollable
        accessibilityLabel="Session duration"
        options={[10, 20, 30, 45, 60].map((value) => ({
          value: String(value * 60),
          label: `${value}m`,
        }))}
        value={String(recipe.durationSec)}
        onChange={(value) => apply({ durationSec: Number.parseInt(value, 10) })}
      />

      {playing ? (
        <InstrumentPanel tone="recessed" label="Live output" bare>
          <View style={styles.scopes}>
            <Oscilloscope samples={capture?.left ?? null} samplesRight={capture?.right ?? null} />
            <SpectrumAnalyzer bins={capture?.spectrum ?? null} sampleRate={capture?.sampleRate} />
          </View>
        </InstrumentPanel>
      ) : null}

      <View style={styles.actions}>
        <HardwareButton
          label={playing ? 'Stop' : 'Audition'}
          variant={playing ? 'danger' : 'primary'}
          size="lg"
          style={styles.actionButton}
          onPress={togglePlayback}
        />
        <HardwareButton
          label="Save"
          style={styles.actionButton}
          onPress={async () => {
            const saved = await saveProtocol({
              ...useExplorer.getState().toProtocol(`protocol-${Date.now().toString(36)}`),
              name: `Explore ${recipe.beatHz.toFixed(2)} Hz`,
            });
            router.push(`/protocol/${saved.id}`);
          }}
        />
      </View>

      <View style={styles.dnaRow}>
        <DnaChip human={dna.human} fingerprint={dna.fingerprint} />
        <Text variant="caption" tone="tertiary">
          {formatClock(recipe.durationSec)} · {dna.shortFingerprint}
        </Text>
      </View>

      <SectionHeader label="Bands" />
      <View style={styles.bandStrip}>
        {BANDS.map((entryBand) => {
          const active = band?.key === entryBand.key;
          return (
            <View key={entryBand.key} style={[styles.bandChip, active ? styles.bandChipActive : null]}>
              <Text variant="label" uppercase tone={active ? 'signal' : 'tertiary'}>
                {entryBand.label}
              </Text>
              <Text variant="readoutXs" tone={active ? 'secondary' : 'tertiary'}>
                {entryBand.low}–{entryBand.high}
              </Text>
            </View>
          );
        })}
      </View>
      <Text variant="caption" tone="tertiary">
        These are conventional descriptions of measured brain activity, not switches. A beat inside a
        band does not put you in that state.
      </Text>

      {entry ? (
        <NumericEntrySheet
          title={entry === 'beat' ? 'Beat frequency' : 'Carrier frequency'}
          unit="Hz"
          value={entry === 'beat' ? recipe.beatHz : recipe.carrierHz}
          min={entry === 'beat' ? MIN_BEAT_HZ : MIN_CARRIER_HZ}
          max={entry === 'beat' ? MAX_BEAT_HZ : MAX_CARRIER_HZ}
          precision={3}
          onCancel={() => setEntry(null)}
          onSubmit={(value) => {
            apply(entry === 'beat' ? { beatHz: value } : { carrierHz: value });
            setEntry(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

const ENGINE_NOTE: Record<StimulationEngine, string> = {
  binaural: 'Two tones, one per ear. Needs headphones — a speaker mixes them before they reach you.',
  monaural: 'Both tones summed before the output, so the beat is physically present and works on a speaker.',
  isochronic: 'One tone switched on and off at the beat rate. Works on any output.',
};

/** A compact horizontal control for the secondary layer parameters. */
function MiniEncoderRow({
  label,
  value,
  min,
  max,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const steps = 20;
  const index = Math.round(((value - min) / (max - min)) * steps);
  return (
    <View style={styles.miniRow}>
      <View style={styles.miniHeader}>
        <Label>{label}</Label>
        <Text variant="readoutSm" tone="secondary">
          {format(value)}
        </Text>
      </View>
      <View
        style={styles.miniTrack}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: steps, now: index, text: format(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          const delta = event.nativeEvent.actionName === 'increment' ? 1 : -1;
          const next = Math.min(steps, Math.max(0, index + delta));
          onChange(min + (next / steps) * (max - min));
        }}
      >
        {Array.from({ length: steps + 1 }, (_, tick) => (
          <View
            key={tick}
            onTouchStart={() => onChange(min + (tick / steps) * (max - min))}
            style={[styles.miniTick, tick <= index ? styles.miniTickOn : null]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  encoderStage: { alignItems: 'center', paddingVertical: space.md },
  channelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderPanel: { padding: space.lg, gap: space.lg },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  inlineSegment: { flex: 1, maxWidth: 240 },
  miniRow: { gap: space.sm },
  miniHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  miniTrack: { flexDirection: 'row', gap: 3, height: 28, alignItems: 'center' },
  miniTick: {
    flex: 1,
    height: 18,
    borderRadius: 1,
    backgroundColor: colors.surfaceRecessed,
  },
  miniTickOn: { backgroundColor: colors.signal, opacity: 0.8 },
  scopes: { padding: space.lg, gap: space.md },
  actions: { flexDirection: 'row', gap: space.sm },
  actionButton: { flex: 1 },
  dnaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bandStrip: { flexDirection: 'row', gap: space.xs },
  bandChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    borderRadius: 6,
    backgroundColor: colors.surfaceRecessed,
    gap: 2,
  },
  bandChipActive: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.signalDim,
  },
});
