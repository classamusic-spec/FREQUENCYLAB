import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  GOAL_PROFILES,
  formatClock,
  protocolFromSimple,
  totalDurationSec,
  type Intensity,
  type SimpleGoal,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../src/design/components/Screen';
import { InstrumentPanel, PanelDivider, PanelRow } from '../src/design/components/InstrumentPanel';
import { SegmentSelector } from '../src/design/components/SegmentSelector';
import { HardwareButton } from '../src/design/components/HardwareButton';
import { DnaChip } from '../src/design/components/Badges';
import { Label, Text } from '../src/design/components/Text';
import { space } from '../src/design/tokens';
import { usePreferences } from '../src/state/preferences';
import { useSessionStart } from '../src/state/sessionStart';
import { useProtocolLibrary } from '../src/state/library';
import { protocolDna } from '@frequencylab/dsp-core';

const GOALS: SimpleGoal[] = ['relax', 'focus', 'meditate', 'sleep', 'explore'];
const DURATIONS = [10, 15, 20, 25, 30, 45, 60];

/**
 * Simple Mode (§3).
 *
 * Three choices and a start button. Everything the panel shows underneath is
 * the real configuration this will run — Simple Mode hides the controls, not
 * the truth about what is being generated (§80).
 */
export default function QuickStartScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ goal?: string }>();
  const preferences = usePreferences((state) => state.preferences);
  const requestStart = useSessionStart((state) => state.request);
  const saveProtocol = useProtocolLibrary((state) => state.save);

  const [goal, setGoal] = useState<SimpleGoal>(
    GOALS.includes(params.goal as SimpleGoal) ? (params.goal as SimpleGoal) : 'relax',
  );
  const [minutes, setMinutes] = useState(25);
  const [intensity, setIntensity] = useState<Intensity>('balanced');

  const protocol = useMemo(
    () =>
      protocolFromSimple({
        goal,
        durationSec: minutes * 60,
        intensity,
        id: `quick-${goal}-${minutes}-${intensity}`,
      }),
    [goal, intensity, minutes],
  );

  const profile = GOAL_PROFILES[goal];
  const dna = protocolDna(protocol);
  const tone = protocol.stages[0]?.graph.nodes.find((node) => node.id === 'tone');
  const noise = protocol.stages[0]?.graph.nodes.find((node) => node.id === 'noise');

  const start = async () => {
    await requestStart(protocol, {
      masterGain: preferences.comfortableOutputLevel,
      onStarted: () => router.replace('/session'),
    });
  };

  return (
    <Screen>
      <ScreenHeader eyebrow="Simple" title="Start a session" subtitle={profile.description} />

      <SectionHeader label="Goal" />
      <SegmentSelector
        scrollable
        accessibilityLabel="Session goal"
        options={GOALS.map((value) => ({ value, label: GOAL_PROFILES[value].label }))}
        value={goal}
        onChange={setGoal}
      />

      <SectionHeader label="Duration" />
      <SegmentSelector
        scrollable
        accessibilityLabel="Session duration in minutes"
        options={DURATIONS.map((value) => ({ value: String(value), label: `${value}m` }))}
        value={String(minutes)}
        onChange={(value) => setMinutes(Number.parseInt(value, 10))}
      />

      <SectionHeader label="Intensity" />
      <SegmentSelector
        accessibilityLabel="Session intensity"
        options={[
          { value: 'gentle', label: 'Gentle' },
          { value: 'balanced', label: 'Balanced' },
          { value: 'strong', label: 'Strong' },
        ]}
        value={intensity}
        onChange={setIntensity}
      />

      <InstrumentPanel tone="recessed" label="What this will generate">
        <PanelRow label="Engine" value={engineLabel(tone?.kind)} />
        <PanelRow
          label="Carrier"
          value={`${(tone?.params.carrier ?? 0).toFixed(1)} Hz`}
        />
        <PanelRow
          label="Beat"
          value={`${profile.beat.start} → ${profile.beat.plateau} → ${profile.beat.end} Hz`}
        />
        <PanelRow
          label="Noise"
          value={
            noise
              ? `${Math.round((noise.params.level ?? 0) * 100)}% ${noise.options.color}`
              : 'None'
          }
        />
        <PanelRow label="Stages" value={String(protocol.stages.length)} />
        <PanelRow label="Total" value={formatClock(totalDurationSec(protocol))} />
        <PanelDivider />
        <View style={styles.dnaRow}>
          <DnaChip human={dna.human} fingerprint={dna.fingerprint} />
          <Label>{dna.shortFingerprint}</Label>
        </View>
      </InstrumentPanel>

      <View style={styles.stages}>
        {protocol.stages.map((stage) => (
          <View key={stage.id} style={styles.stageRow}>
            <Label>{stage.name}</Label>
            <Text variant="readoutSm" tone="secondary">
              {formatClock(stage.durationSec)}
            </Text>
          </View>
        ))}
      </View>

      <HardwareButton label="Start session" variant="primary" size="lg" onPress={start} />
      <HardwareButton
        label="Save as protocol"
        variant="ghost"
        onPress={async () => {
          const saved = await saveProtocol({
            ...protocol,
            id: `protocol-${Date.now().toString(36)}`,
            name: `${profile.label} ${minutes}m`,
          });
          router.replace(`/protocol/${saved.id}`);
        }}
      />
      <Text variant="caption" tone="tertiary" style={styles.footnote}>
        These settings are a conservative starting point, not a claim about what a frequency does.
        Rate the session afterwards and the app will start telling you what actually works for you.
      </Text>
    </Screen>
  );
}

function engineLabel(kind?: string): string {
  switch (kind) {
    case 'binaural':
      return 'Binaural · headphones';
    case 'monaural':
      return 'Monaural';
    case 'isochronic':
      return 'Isochronic';
    default:
      return '—';
  }
}

const styles = StyleSheet.create({
  dnaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stages: { gap: space.xs },
  stageRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.xxs },
  footnote: { marginTop: space.sm },
});
