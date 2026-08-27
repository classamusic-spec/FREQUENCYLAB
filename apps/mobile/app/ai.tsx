import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  designProtocol,
  formatClock,
  protocolDna,
  totalDurationSec,
  type DesignResult,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../src/design/components/Screen';
import { InstrumentPanel, PanelDivider, PanelRow } from '../src/design/components/InstrumentPanel';
import { HardwareButton } from '../src/design/components/HardwareButton';
import { DnaChip } from '../src/design/components/Badges';
import { Label, Text } from '../src/design/components/Text';
import { colors, radius, space } from '../src/design/tokens';
import * as haptics from '../src/design/haptics';
import { useProtocolLibrary } from '../src/state/library';
import { usePlayer } from '../src/state/player';
import { usePreferences } from '../src/state/preferences';

const EXAMPLES = [
  'I have 25 minutes. I want to relax but remain awake.',
  'Create a 45-minute alpha-to-theta protocol with a 220-Hz carrier and introduce 40-Hz amplitude modulation between minutes 20 and 30.',
  'A gentle 30 minute wind down with brown noise',
  '20 minute focus session without headphones',
];

/**
 * The AI protocol designer (§21, §51).
 *
 * It produces a real protocol object that the user reviews before anything is
 * saved or played, and it shows its reasoning line by line so the choices can be
 * argued with. A request framed as treatment is answered honestly and then
 * still given a usable session — refusing to help at all would just push the
 * user somewhere less careful.
 */
export default function AiDesignerScreen() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<DesignResult | null>(null);
  const saveProtocol = useProtocolLibrary((state) => state.save);
  const loadAndPlay = usePlayer((state) => state.loadAndPlay);
  const preferences = usePreferences((state) => state.preferences);

  const generate = (text: string) => {
    haptics.engage();
    setPrompt(text);
    setResult(
      designProtocol({
        prompt: text,
        now: new Date().toISOString(),
        id: `ai-${Date.now().toString(36)}`,
      }),
    );
  };

  const protocol = result?.protocol;
  const dna = protocol ? protocolDna(protocol) : undefined;

  return (
    <Screen>
      <ScreenHeader
        eyebrow="AI designer"
        title="Describe a session"
        subtitle="It builds a real protocol you can inspect, edit and run — not a description of one."
      />

      <InstrumentPanel tone="recessed" bare>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          placeholder="What do you want this session to do?"
          placeholderTextColor={colors.textTertiary}
          multiline
          style={styles.input}
          accessibilityLabel="Describe the session you want"
        />
      </InstrumentPanel>

      <HardwareButton
        label="Design protocol"
        variant="primary"
        size="lg"
        disabled={prompt.trim().length < 4}
        onPress={() => generate(prompt)}
      />

      <SectionHeader label="Try one of these" />
      <View style={styles.examples}>
        {EXAMPLES.map((example) => (
          <Pressable
            key={example}
            onPress={() => generate(example)}
            accessibilityRole="button"
            accessibilityLabel={example}
            style={styles.example}
          >
            <Text variant="bodySm" tone="secondary">
              {example}
            </Text>
          </Pressable>
        ))}
      </View>

      {result?.declinedReason ? (
        <InstrumentPanel tone="flat" label="What I will not build">
          <Text variant="bodySm" tone="warning">
            {result.declinedReason}
          </Text>
        </InstrumentPanel>
      ) : null}

      {protocol && dna ? (
        <>
          <SectionHeader label="Proposed protocol" />
          <InstrumentPanel tone="raised">
            <Text variant="title">{protocol.name}</Text>
            <Text variant="bodySm" tone="secondary" style={styles.paragraph}>
              {protocol.description}
            </Text>
            <PanelDivider />
            {protocol.stages.map((stage) => {
              const tone = stage.graph.nodes.find((node) => node.id === 'tone');
              const beatLane = stage.automation.find((lane) => lane.target.endsWith(':beat'));
              return (
                <View key={stage.id} style={styles.stageRow}>
                  <View style={styles.stageHeader}>
                    <Label>{stage.name}</Label>
                    <Text variant="readoutSm" tone="secondary">
                      {formatClock(stage.durationSec)}
                    </Text>
                  </View>
                  <Text variant="caption" tone="tertiary">
                    {beatLane
                      ? `${beatLane.points[0].value.toFixed(2)} → ${beatLane.points[beatLane.points.length - 1].value.toFixed(2)} Hz`
                      : `${(tone?.params.beat ?? tone?.params.pulse ?? 0).toFixed(2)} Hz`}
                    {' · '}
                    {(tone?.params.carrier ?? 0).toFixed(0)} Hz carrier
                  </Text>
                </View>
              );
            })}
            <PanelDivider />
            <PanelRow label="Total" value={formatClock(totalDurationSec(protocol))} />
            <View style={styles.dnaRow}>
              <DnaChip human={dna.human} fingerprint={dna.fingerprint} />
            </View>
          </InstrumentPanel>

          <SectionHeader label="Why these choices" />
          <InstrumentPanel tone="flat">
            {result.rationale.map((line, index) => (
              <Text key={index} variant="bodySm" tone="secondary" style={styles.rationale}>
                · {line}
              </Text>
            ))}
          </InstrumentPanel>

          {result.cautions.length > 0 ? (
            <InstrumentPanel tone="flat" label="Worth knowing">
              {result.cautions.map((line, index) => (
                <Text key={index} variant="caption" tone="tertiary" style={styles.rationale}>
                  · {line}
                </Text>
              ))}
            </InstrumentPanel>
          ) : null}

          <View style={styles.actions}>
            <HardwareButton
              label="Save"
              style={styles.action}
              onPress={async () => {
                const saved = await saveProtocol(protocol);
                haptics.confirm();
                router.replace(`/protocol/${saved.id}`);
              }}
            />
            <HardwareButton
              label="Run it"
              variant="primary"
              style={styles.action}
              onPress={async () => {
                await saveProtocol(protocol);
                await loadAndPlay(protocol, { masterGain: preferences.comfortableOutputLevel });
                router.replace('/session');
              }}
            />
          </View>

          <Text variant="caption" tone="tertiary">
            Generated on this device — no request left your phone. The designer works offline and
            cannot diagnose anything, prescribe anything, or replace medical care.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 96,
    padding: space.lg,
    color: colors.text,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  examples: { gap: space.xs },
  example: {
    padding: space.md,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceRecessed,
  },
  paragraph: { marginTop: space.xs },
  stageRow: { paddingVertical: space.xs, gap: 2 },
  stageHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  dnaRow: { marginTop: space.md },
  rationale: { marginBottom: space.xs },
  actions: { flexDirection: 'row', gap: space.sm },
  action: { flex: 1 },
});
