import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { hasBlocker } from '@frequencylab/dsp-core';
import { colors, radius, shadows, space } from '../tokens';
import { HardwareButton } from './HardwareButton';
import { SafetyBanner } from './SafetyBanner';
import { Label, Text } from './Text';
import { useSessionStart } from '../../state/sessionStart';
import { describeRoute } from '../../audio/route';

/**
 * The pre-session check (§42).
 *
 * Rendered once at the root, so it covers every path into playback. It appears
 * only when there is something to decide, and a blocker leaves no "start
 * anyway" button — a protocol that fails validation cannot play, and offering
 * the option would be a lie.
 */
export function PreflightSheet() {
  const pending = useSessionStart((state) => state.pending);
  const checks = useSessionStart((state) => state.checks);
  const route = useSessionStart((state) => state.route);
  const confirm = useSessionStart((state) => state.confirm);
  const startMonaural = useSessionStart((state) => state.useMonauralInstead);
  const cancel = useSessionStart((state) => state.cancel);

  if (!pending) return null;

  const blocked = hasBlocker(checks);
  const headphoneCheck = checks.find((check) => check.id === 'headphones-required');

  return (
    <Modal transparent animationType="fade" onRequestClose={cancel}>
      <Pressable style={styles.scrim} onPress={cancel} accessibilityLabel="Dismiss" />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Label>Before you start</Label>
          <Label tone="tertiary">{describeRoute(route)}</Label>
        </View>

        <Text variant="title" style={styles.title}>
          {pending.protocol.name}
        </Text>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {checks.map((check) => (
            <SafetyBanner key={check.id} check={check} />
          ))}
        </ScrollView>

        <View style={styles.actions}>
          {headphoneCheck ? (
            <HardwareButton
              label="Use monaural"
              style={styles.action}
              accessibilityHint="Rebuilds this protocol with the monaural engine, which works without headphones."
              onPress={() => void startMonaural()}
            />
          ) : null}
          <HardwareButton label="Cancel" variant="ghost" style={styles.action} onPress={cancel} />
          {!blocked ? (
            <HardwareButton
              label="Start session"
              variant="primary"
              style={styles.action}
              onPress={() => void confirm()}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '82%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: space.xl,
    paddingBottom: space.huge,
    gap: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
    ...(shadows.sheet as object),
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { marginBottom: space.xs },
  list: { flexGrow: 0 },
  listContent: { gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm, flexWrap: 'wrap' },
  action: { flex: 1, minWidth: 110 },
});
