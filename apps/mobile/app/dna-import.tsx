import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  decodeDnaString,
  formatClock,
  humanDna,
  totalDurationSec,
  validateProtocol,
  type DnaImportResult,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../src/design/components/Screen';
import { InstrumentPanel, PanelRow } from '../src/design/components/InstrumentPanel';
import { HardwareButton } from '../src/design/components/HardwareButton';
import { Text } from '../src/design/components/Text';
import { colors, radius, space } from '../src/design/tokens';
import * as haptics from '../src/design/haptics';
import { useProtocolLibrary } from '../src/state/library';

/**
 * Importing Protocol DNA (§12).
 *
 * The checksum, the fingerprint and the engine version are checked separately
 * and reported separately, because they fail for different reasons and mean
 * different things: a bad checksum is a damaged string, a fingerprint mismatch
 * is a tampered payload, and an engine mismatch is neither — it just means the
 * audio may render differently than it did for its author.
 */
export default function DnaImportScreen() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [result, setResult] = useState<DnaImportResult | null>(null);
  const saveProtocol = useProtocolLibrary((state) => state.save);

  const check = (value: string) => {
    setText(value);
    setResult(value.trim().length > 8 ? decodeDnaString(value) : null);
  };

  const protocol = result?.ok ? result.document.protocol : undefined;
  const validation = protocol ? validateProtocol(protocol) : undefined;

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Import"
        title="Protocol DNA"
        subtitle="Paste a DNA string to rebuild the exact protocol it describes."
      />

      <InstrumentPanel tone="recessed" bare>
        <TextInput
          value={text}
          onChangeText={check}
          placeholder="FLX1.…"
          placeholderTextColor={colors.textTertiary}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          accessibilityLabel="Protocol DNA string"
        />
      </InstrumentPanel>

      <HardwareButton
        label="Paste from clipboard"
        onPress={async () => {
          const value = await Clipboard.getStringAsync();
          check(value);
        }}
      />

      {result && !result.ok ? (
        <InstrumentPanel tone="flat" label="Cannot import">
          <Text variant="bodySm" tone="limit">
            {result.error}
          </Text>
        </InstrumentPanel>
      ) : null}

      {result?.ok && protocol ? (
        <>
          <SectionHeader label="Verification" />
          <InstrumentPanel tone="recessed">
            <PanelRow label="Checksum" value="Valid" />
            <PanelRow
              label="Fingerprint"
              value={result.fingerprintMatches ? 'Matches' : 'Does not match'}
            />
            <PanelRow
              label="Engine"
              value={result.dspVersionMatches ? 'Same version' : `Made with DSP ${protocol.dspVersion}`}
            />
            {!result.fingerprintMatches ? (
              <Text variant="caption" tone="limit" style={styles.note}>
                The payload does not hash to the fingerprint it carries. It has been altered since
                it was created — import it only if you know where it came from.
              </Text>
            ) : null}
            {!result.dspVersionMatches ? (
              <Text variant="caption" tone="warning" style={styles.note}>
                This was made with a different DSP version. The configuration is intact, but the
                rendered audio may not be identical to what its author heard.
              </Text>
            ) : null}
          </InstrumentPanel>

          <SectionHeader label="Protocol" />
          <InstrumentPanel tone="flat">
            <Text variant="title">{protocol.name}</Text>
            {protocol.description ? (
              <Text variant="bodySm" tone="secondary" style={styles.note}>
                {protocol.description}
              </Text>
            ) : null}
            <View style={styles.metaRow}>
              <PanelRow label="Stages" value={String(protocol.stages.length)} />
              <PanelRow label="Duration" value={formatClock(totalDurationSec(protocol))} />
              <PanelRow label="DNA" value={humanDna(protocol)} />
            </View>
          </InstrumentPanel>

          {validation && !validation.ok ? (
            <InstrumentPanel tone="flat" label="This protocol will not play">
              {validation.issues
                .filter((issue) => issue.severity === 'error')
                .slice(0, 4)
                .map((issue, index) => (
                  <Text key={index} variant="bodySm" tone="limit">
                    {issue.message}
                  </Text>
                ))}
            </InstrumentPanel>
          ) : null}

          <HardwareButton
            label="Import protocol"
            variant="primary"
            size="lg"
            disabled={!validation?.ok}
            onPress={async () => {
              const saved = await saveProtocol({
                ...protocol,
                id: `protocol-${Date.now().toString(36)}`,
              });
              haptics.confirm();
              router.replace(`/protocol/${saved.id}`);
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 120,
    padding: space.lg,
    color: colors.text,
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlignVertical: 'top',
  },
  note: { marginTop: space.sm },
  metaRow: { marginTop: space.sm },
});
