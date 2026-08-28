import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  DSP_VERSION,
  decodeDnaString,
  describeShareCode,
  formatClock,
  parseShareCode,
  renameProtocol,
  totalDurationSec,
  validateProtocol,
  type Protocol,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../src/design/components/Screen';
import { InstrumentPanel, PanelRow } from '../src/design/components/InstrumentPanel';
import { HardwareButton } from '../src/design/components/HardwareButton';
import { NameEntrySheet, RENAME_FOOTNOTE } from '../src/design/components/NameEntrySheet';
import { Label, Text } from '../src/design/components/Text';
import { colors, MIN_TOUCH_TARGET, space } from '../src/design/tokens';
import * as haptics from '../src/design/haptics';
import { useProtocolLibrary } from '../src/state/library';

/**
 * Importing a shared protocol.
 *
 * One field takes both forms a protocol travels in — a short share code, or
 * the full DNA string — because the person pasting has no reason to know which
 * one they were sent. The screen works out which it is and reports what it
 * could verify, in those terms.
 *
 * What is checked differs between the two, and the screen says so rather than
 * showing one generic "valid" badge:
 *  - a share code carries a four-character check derived from the protocol's
 *    fingerprint, so a match means the rebuilt protocol renders the same audio;
 *  - a full DNA string carries its own fingerprint and the engine version it
 *    was made with, which fail for different reasons and mean different things.
 */

type Parsed =
  | { kind: 'none' }
  | { kind: 'error'; message: string }
  | {
      kind: 'code';
      protocol: Protocol;
      verified: boolean;
      unchecked: boolean;
    }
  | {
      kind: 'dna';
      protocol: Protocol;
      fingerprintMatches: boolean;
      dspVersionMatches: boolean;
    };

/**
 * Decides which form the text is and decodes it.
 *
 * The full DNA string is recognised by its `FLX1.` prefix and dot structure;
 * anything else is tried as a share code, whose parser already tolerates a
 * missing header. Trying DNA first means a share code can never be
 * misidentified as a corrupt DNA string.
 */
function interpret(text: string): Parsed {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { kind: 'none' };
  // Nothing shorter than the smallest meaningful code can be judged yet.
  // Reporting "cannot open this" on the first character typed is noise, not
  // feedback — the shortest valid code is about a dozen characters.
  if (trimmed.length < 12) return { kind: 'none' };

  if (/^FLX\d*\./i.test(trimmed)) {
    const result = decodeDnaString(trimmed);
    if (!result.ok) return { kind: 'error', message: result.error };
    return {
      kind: 'dna',
      protocol: result.document.protocol,
      fingerprintMatches: result.fingerprintMatches,
      dspVersionMatches: result.dspVersionMatches,
    };
  }

  const result = parseShareCode(trimmed);
  if (!result.ok) return { kind: 'error', message: result.error };
  return {
    kind: 'code',
    protocol: result.protocol,
    verified: result.verified,
    unchecked: result.unchecked === true,
  };
}

export default function ImportScreen() {
  const router = useRouter();
  const [text, setText] = useState('');
  const saveProtocol = useProtocolLibrary((state) => state.save);
  const existingNames = useProtocolLibrary((state) => state.protocols).map((entry) => entry.name);

  /*
   * A protocol arriving from a share code is called "Shared protocol", and one
   * from a DNA string is called whatever its author called it. Neither is a
   * name the receiver chose, so the screen offers one before the protocol is
   * added — naming it here is far more likely to happen than naming it later.
   *
   * `null` means "keep the name it came with". It is cleared whenever the
   * pasted text changes, because at that point this is a different protocol
   * and a name chosen for the previous one would be wrong.
   */
  const [chosenName, setChosenName] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);

  const replaceText = (value: string) => {
    setText(value);
    setChosenName(null);
  };

  const parsed = useMemo(() => interpret(text), [text]);
  const protocol = parsed.kind === 'code' || parsed.kind === 'dna' ? parsed.protocol : undefined;
  const validation = useMemo(
    () => (protocol ? validateProtocol(protocol) : undefined),
    [protocol],
  );

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Import"
        title="Open a shared protocol"
        subtitle="Paste a share code or a full DNA string — either works."
      />

      <InstrumentPanel tone="recessed" bare>
        <TextInput
          value={text}
          onChangeText={replaceText}
          placeholder="FL1 C220 NP12 | 20m B10 #P4X3"
          placeholderTextColor={colors.textDisabled}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          accessibilityLabel="Share code or DNA string"
        />
      </InstrumentPanel>

      <HardwareButton
        label="Paste from clipboard"
        onPress={async () => replaceText(await Clipboard.getStringAsync())}
      />

      {parsed.kind === 'error' ? (
        <InstrumentPanel tone="flat" label="Cannot open this">
          <Text variant="bodySm" tone="limit">
            {parsed.message}
          </Text>
        </InstrumentPanel>
      ) : null}

      {protocol ? (
        <>
          <SectionHeader
            label="What this is"
            right={
              <Pressable
                onPress={() => setNaming(true)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Give this protocol your own name"
                style={styles.headerAction}
              >
                <Label tone="signal">{chosenName ? 'Change name' : 'Name it'}</Label>
              </Pressable>
            }
          />
          <InstrumentPanel tone="flat">
            <Text variant="heading">{chosenName ?? protocol.name}</Text>
            {chosenName ? (
              <Text variant="caption" tone="tertiary">
                Arrived as {'“'}
                {protocol.name}
                {'”'}.
              </Text>
            ) : null}
            <Text variant="bodySm" tone="secondary" style={styles.note}>
              {describeShareCode(protocol)}
            </Text>
            <View style={styles.metaRow}>
              <View style={styles.metaCell}>
                <Label>Stages</Label>
                <Text variant="readoutSm" tone="secondary">
                  {protocol.stages.length}
                </Text>
              </View>
              <View style={styles.metaCell}>
                <Label>Length</Label>
                <Text variant="readoutSm" tone="secondary">
                  {formatClock(totalDurationSec(protocol))}
                </Text>
              </View>
            </View>
          </InstrumentPanel>

          <SectionHeader label="Checks" />
          {parsed.kind === 'code' ? (
            <InstrumentPanel tone="recessed">
              {parsed.unchecked ? (
                <>
                  <Label tone="warning">No check code</Label>
                  <Text variant="bodySm" tone="secondary" style={styles.note}>
                    This code has no verification suffix, so the app cannot confirm it arrived
                    exactly as it was written. It will still build the protocol described above.
                  </Text>
                </>
              ) : parsed.verified ? (
                <>
                  <Label tone="signal">Verified</Label>
                  <Text variant="bodySm" tone="secondary" style={styles.note}>
                    This rebuilds to the same protocol its author shared, so it will render
                    identical audio.
                  </Text>
                </>
              ) : (
                <>
                  <Label tone="limit">Check does not match</Label>
                  <Text variant="bodySm" tone="limit" style={styles.note}>
                    The code builds a valid protocol, but not the one its check describes — a
                    character was probably lost or changed in transit. Ask for the code again
                    rather than trusting this one to be what was sent.
                  </Text>
                </>
              )}
            </InstrumentPanel>
          ) : parsed.kind === 'dna' ? (
            <InstrumentPanel tone="recessed">
              <PanelRow
                label="Fingerprint"
                value={parsed.fingerprintMatches ? 'Matches' : 'Does not match'}
              />
              <PanelRow
                label="Engine"
                value={
                  parsed.dspVersionMatches
                    ? `Same version (${DSP_VERSION})`
                    : `Made with ${protocol.dspVersion}`
                }
              />
              {!parsed.fingerprintMatches ? (
                <Text variant="caption" tone="limit" style={styles.note}>
                  The payload does not hash to the fingerprint it carries. It has been altered
                  since it was created — import it only if you know where it came from.
                </Text>
              ) : null}
              {!parsed.dspVersionMatches ? (
                <Text variant="caption" tone="warning" style={styles.note}>
                  This was made with a different engine version. The configuration is intact, but
                  the rendered audio may not be identical to what its author heard.
                </Text>
              ) : null}
            </InstrumentPanel>
          ) : null}

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

          {naming ? (
            <NameEntrySheet
              title="Name this protocol"
              name={chosenName ?? protocol.name}
              existingNames={existingNames}
              footnote={RENAME_FOOTNOTE}
              submitLabel="Set name"
              onCancel={() => setNaming(false)}
              onSubmit={(name) => {
                setChosenName(name);
                setNaming(false);
                haptics.confirm();
              }}
            />
          ) : null}

          <HardwareButton
            label="Add to my protocols"
            variant="primary"
            size="lg"
            disabled={!validation?.ok}
            onPress={async () => {
              // The rename is applied to the incoming protocol rather than
              // saved and then edited, so the library never briefly holds a
              // protocol under a name nobody chose.
              const named = chosenName ? renameProtocol(protocol, chosenName) : protocol;
              const saved = await saveProtocol({
                ...named,
                id: `protocol-${Date.now().toString(36)}`,
              });
              haptics.confirm();
              router.replace(`/protocol/${saved.id}`);
            }}
          />
        </>
      ) : null}

      {parsed.kind === 'none' ? (
        <InstrumentPanel tone="recessed" label="What a share code looks like">
          <Text variant="readoutSm" tone="secondary" style={styles.example}>
            FL1 C220 NP12 | 5m B10 | 15m B10-6 | 5m B6-10 #A7K3
          </Text>
          <Text variant="caption" tone="tertiary" style={styles.note}>
            A 220 Hz carrier with pink noise at 12%, then three stages: five minutes at a 10 Hz
            beat, fifteen sweeping down to 6, five coming back up. The whole protocol, in one line.
          </Text>
        </InstrumentPanel>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 110,
    padding: space.lg,
    color: colors.text,
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 14,
    textAlignVertical: 'top',
  },
  headerAction: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingLeft: space.md },
  note: { marginTop: space.xs },
  metaRow: { flexDirection: 'row', gap: space.xl, marginTop: space.md },
  metaCell: { gap: space.xxs },
  example: { fontFamily: 'IBMPlexMono_400Regular', lineHeight: 20 },
});
