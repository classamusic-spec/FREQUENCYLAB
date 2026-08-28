import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { describeShareCode, encodeShareCode, type Protocol } from '@frequencylab/dsp-core';
import { colors, radius, space } from '../tokens';
import * as haptics from '../haptics';
import { HardwareButton } from './HardwareButton';
import { Label, Text } from './Text';
import { Recessed } from './Surface';

export interface ShareCodeCardProps {
  protocol: Protocol;
  /** Offers the full DNA document as a file. Required for custom protocols. */
  onShareFile?: () => void;
}

/**
 * Sharing a protocol.
 *
 * The full DNA document is several thousand characters — a real artefact, and
 * the wrong thing to put in front of someone who just wants to send a friend a
 * session. This card leads with the share code instead: short enough to paste
 * into a message, readable enough to check by eye, and a complete rebuild of
 * the protocol rather than a summary.
 *
 * A protocol built with custom routing in Lab Mode has no short form. Rather
 * than emit something lossy, the card says so plainly and offers the file —
 * which is the honest version of "this one is too complex to text".
 */
export function ShareCodeCard({ protocol, onShareFile }: ShareCodeCardProps) {
  const [copied, setCopied] = useState(false);
  // Encoding runs a full parse-and-hash round trip to verify itself, so it is
  // keyed on the protocol rather than repeated on every unrelated re-render of
  // the screen (export progress, stage selection, this card's own state).
  const code = useMemo(() => encodeShareCode(protocol), [protocol]);

  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = () => {
    if (!code) return;
    haptics.confirm();
    void Clipboard.setStringAsync(code);
    setCopied(true);
    // Cleared on unmount: copying and navigating straight away would otherwise
    // set state on a component that is gone.
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  if (!code) {
    return (
      <View style={styles.card}>
        <Label>Share this protocol</Label>
        <Text variant="bodySm" tone="secondary" style={styles.body}>
          This protocol uses custom routing, which has no short code. Sharing it as a file keeps
          every module exactly as you built it.
        </Text>
        {onShareFile ? (
          <HardwareButton label="Share as a file" variant="primary" onPress={onShareFile} />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Label>Share this protocol</Label>

      <Pressable
        onPress={copy}
        accessibilityRole="button"
        accessibilityLabel={`Share code. Double tap to copy. The code is ${code}`}
      >
        <Recessed cornerRadius={radius.control}>
          <View style={styles.codeWell}>
            <Text variant="readoutSm" tone="secondary" style={styles.code}>
              {code}
            </Text>
          </View>
        </Recessed>
      </Pressable>

      <Text variant="caption" tone="tertiary">
        {describeShareCode(protocol)}
      </Text>

      <View style={styles.actions}>
        <HardwareButton
          label={copied ? 'Copied' : 'Copy code'}
          variant="primary"
          selected={copied}
          style={styles.action}
          onPress={copy}
        />
        {onShareFile ? (
          <HardwareButton
            label="Send as file"
            variant="ghost"
            style={styles.action}
            onPress={onShareFile}
          />
        ) : null}
      </View>

      <Text variant="caption" tone="tertiary">
        Paste this anywhere. Whoever opens it in Frequency Lab gets exactly this protocol — the
        four characters at the end are how the app confirms it arrived intact.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
  },
  body: { marginTop: -space.xs },
  codeWell: { paddingHorizontal: space.md, paddingVertical: space.md },
  // Monospaced so the code's groups line up and a mistyped character is easy
  // to spot against the original.
  code: { fontFamily: 'IBMPlexMono_400Regular', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: space.sm },
  action: { flex: 1 },
});
