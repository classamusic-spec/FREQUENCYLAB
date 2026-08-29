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
  protocolFromExplorer,
  protocolDna,
  type NoiseColor,
  type ParamDescriptor,
  type StimulationEngine,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { ProfileButton } from '../../src/design/components/ProfileButton';
import { InstrumentPanel, PanelDivider } from '../../src/design/components/InstrumentPanel';
import { FrequencyEncoder } from '../../src/design/components/FrequencyEncoder';
import { SegmentSelector } from '../../src/design/components/SegmentSelector';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { PrecisionValueDisplay } from '../../src/design/components/PrecisionValueDisplay';
import { Oscilloscope, SpectrumAnalyzer } from '../../src/design/components/Visualizers';
import { NumericEntrySheet } from '../../src/design/components/NumericEntrySheet';
import { ParameterControl } from '../../src/design/components/ParameterControl';
import { DnaChip } from '../../src/design/components/Badges';
import { Label, Text } from '../../src/design/components/Text';
import { BANDS, bandForFrequency, colors, layout, space } from '../../src/design/tokens';
import { useExplorer, requiresRebuild } from '../../src/state/explorer';
import { usePlayer, useScopeCapture } from '../../src/state/player';
import { useSessionStart } from '../../src/state/sessionStart';
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
  const requestStart = useSessionStart((state) => state.request);
  const snapshot = usePlayer((state) => state.snapshot);
  const stop = usePlayer((state) => state.stop);
  const preferences = usePreferences((state) => state.preferences);
  const updatePreferences = usePreferences((state) => state.update);
  const saveProtocol = useProtocolLibrary((state) => state.save);

  const [target, setTarget] = useState<EncoderTarget>('beat');
  const [entry, setEntry] = useState<EncoderTarget | null>(null);
  /**
   * Whether the carrier encoder settles on note frequencies.
   *
   * Screen state rather than a stored preference: snapping is right while you
   * are playing a note and wrong the moment you are chasing a specific
   * frequency, and that changes several times inside one sitting.
   */
  const [snapCarrier, setSnapCarrier] = useState(false);

  const playing = snapshot.state === 'playing';
  const capture = useScopeCapture(20, playing);
  const band = bandForFrequency(recipe.beatHz);

  const channels = useMemo(
    () => binauralFrequencies(recipe.carrierHz, recipe.beatHz, recipe.binauralMode ?? 'offset'),
    [recipe.binauralMode, recipe.beatHz, recipe.carrierHz],
  );

  // Built from the recipe directly rather than through the store action. The
  // action has a stable identity, so a memo keyed on it never recomputed: the
  // displayed identity froze at whatever the recipe was on first render while
  // the duration caption beside it kept updating, and the two disagreed on the
  // same line. Compiling here makes the dependency real.
  const protocol = useMemo(
    () => protocolFromExplorer(recipe, { id: 'explorer-preview' }),
    [recipe],
  );
  const dna = protocolDna(protocol);

  const restart = useCallback(async () => {
    await requestStart(useExplorer.getState().toProtocol('explorer-preview'), {
      masterGain: preferences.comfortableOutputLevel,
    });
  }, [preferences.comfortableOutputLevel, requestStart]);

  const apply = useCallback(
    (patch: Parameters<typeof setRecipe>[0]) => {
      const needsRebuild = requiresRebuild(patch, recipe);
      setRecipe(patch);
      if (needsRebuild && playing) {
        // A structural change cannot be a live parameter write — the module
        // simply is not in the graph — so the protocol is rebuilt and restarted.
        void restart();
      }
    },
    [playing, recipe, restart, setRecipe],
  );

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
        right={<ProfileButton />}
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
            caption={band ? `${band.label} range` : 'Outside the named bands'}
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
            // The carrier is the only frequency on this screen a note name
            // describes: it is the pitch you actually hear. The beat below it
            // is a difference between two of them, and naming a 7.83 Hz
            // difference "B-1" would be a category error dressed as a fact.
            showNote
            referenceHz={preferences.noteReferenceHz}
            snapToNote={snapCarrier}
            onToggleSnapToNote={() => setSnapCarrier((on) => !on)}
            onChange={(value) => apply({ carrierHz: value })}
            onRequestNumericEntry={() => setEntry('carrier')}
          />
        )}
      </View>

      {/* What is actually being generated depends on the engine. The binaural
          reading — two detuned tones, one per ear — is false for monaural and
          isochronic, which put the same signal in both ears, so each engine
          states its own case rather than sharing one that is wrong for two of
          the three. */}
      <InstrumentPanel tone="recessed" label="What is being generated">
        {recipe.engine === 'binaural' ? (
          <>
            <View style={styles.channelRow}>
              <PrecisionValueDisplay
                plate
                size="sm"
                label="Left"
                value={channels.left}
                unit="Hz"
                precision={2}
                integerDigits={3}
              />
              <PrecisionValueDisplay
                plate
                size="sm"
                label="Right"
                value={channels.right}
                unit="Hz"
                precision={2}
                integerDigits={3}
              />
              <PrecisionValueDisplay
                plate
                size="sm"
                label="Difference"
                value={recipe.beatHz}
                unit="Hz"
                precision={2}
                tone="signal"
              />
            </View>
            <PanelDivider />
            <Text variant="caption" tone="tertiary">
              Your headphones are producing two tones near {Math.round(recipe.carrierHz)} Hz — not
              a {formatHz(recipe.beatHz, 1, 2)} Hz sound. The beat is what you perceive when the
              two combine; no speaker in the world reproduces {formatHz(recipe.beatHz, 1, 2)} Hz.
            </Text>
          </>
        ) : (
          <>
            <View style={styles.channelRow}>
              <PrecisionValueDisplay
                plate
                size="sm"
                label="Carrier"
                value={recipe.carrierHz}
                unit="Hz"
                precision={2}
                integerDigits={3}
              />
              <PrecisionValueDisplay
                plate
                size="sm"
                label={recipe.engine === 'isochronic' ? 'Pulse rate' : 'Beat rate'}
                value={recipe.beatHz}
                unit="Hz"
                precision={2}
                tone="signal"
              />
            </View>
            <PanelDivider />
            <Text variant="caption" tone="tertiary">
              {recipe.engine === 'isochronic'
                ? `Both ears get the same ${Math.round(recipe.carrierHz)} Hz tone, switched on and off ${formatHz(recipe.beatHz, 1, 2)} times a second. The pulse is physically in the sound, so this works on speakers as well as headphones.`
                : `Both ears get the same signal: two tones summed before they reach you, beating at ${formatHz(recipe.beatHz, 1, 2)} Hz. That beat is physically present in the air, so this works on speakers as well as headphones.`}
            </Text>
          </>
        )}
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
          <ParameterControl
            descriptor={INTENSITY_PARAM}
            value={recipe.intensity}
            onChange={(value) => apply({ intensity: value })}
          />
          <ParameterControl
            descriptor={NOISE_LEVEL_PARAM}
            value={recipe.noiseLevel}
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
          <ParameterControl
            descriptor={MOTION_DEPTH_PARAM}
            value={recipe.motionDepth}
            onChange={(value) => apply({ motionDepth: value })}
          />
          {recipe.motionDepth > 0 ? (
            <ParameterControl
              descriptor={MOTION_RATE_PARAM}
              value={recipe.motionRateHz}
              onChange={(value) => apply({ motionRateHz: value })}
            />
          ) : null}
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
          notes={entry === 'carrier'}
          referenceHz={preferences.noteReferenceHz}
          onChangeReferenceHz={
            entry === 'carrier'
              ? (hz) => void updatePreferences({ noteReferenceHz: hz })
              : undefined
          }
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

/**
 * Explorer's secondary controls are described as real parameter descriptors, so
 * they get the same drag model, numeric entry and accessibility actions as
 * every control in Lab Mode rather than a bespoke simplified version.
 */
const INTENSITY_PARAM: ParamDescriptor = {
  key: 'intensity',
  label: 'Intensity',
  unit: 'percent',
  min: 0,
  max: 1,
  default: 0.45,
  precision: 2,
  taper: 'linear',
  automatable: false,
  help: 'Level of the tone before the master chain.',
};

const NOISE_LEVEL_PARAM: ParamDescriptor = {
  key: 'noiseLevel',
  label: 'Noise level',
  unit: 'percent',
  min: 0,
  max: 0.4,
  default: 0.1,
  precision: 2,
  taper: 'linear',
  automatable: false,
};

const MOTION_DEPTH_PARAM: ParamDescriptor = {
  key: 'motionDepth',
  label: 'Stereo movement',
  unit: 'percent',
  min: 0,
  max: 1,
  default: 0,
  precision: 2,
  taper: 'linear',
  automatable: false,
  help: 'How far the sound travels across the stereo field.',
};

const MOTION_RATE_PARAM: ParamDescriptor = {
  key: 'motionRate',
  label: 'Movement rate',
  unit: 'hz',
  min: 0.05,
  max: 4,
  default: 0.5,
  precision: 2,
  taper: 'log',
  automatable: false,
};

const styles = StyleSheet.create({
  encoderStage: { alignItems: 'center', paddingVertical: space.md },
  channelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.xs },
  sliderPanel: { padding: space.lg, gap: space.lg },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  inlineSegment: { flex: 1, maxWidth: 240 },
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
