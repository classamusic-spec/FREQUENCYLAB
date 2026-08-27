import { StyleSheet, View, type ViewStyle } from 'react-native';
import type { SafetyCheck } from '@frequencylab/dsp-core';
import { colors, radius, space } from '../tokens';
import { HardwareButton } from './HardwareButton';
import { Label, Text } from './Text';

export interface SafetyBannerProps {
  check: SafetyCheck;
  onAction?: () => void;
  onDismiss?: () => void;
  style?: ViewStyle;
}

/**
 * A safety notice.
 *
 * Blockers and warnings are visually distinct from information, and neither is
 * a toast: they stay on screen until resolved or explicitly acknowledged,
 * because a message about output level that disappears on its own has not done
 * its job.
 */
export function SafetyBanner({ check, onAction, onDismiss, style }: SafetyBannerProps) {
  const tone =
    check.level === 'blocker' ? colors.limit : check.level === 'warning' ? colors.warning : colors.textTertiary;

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${check.title}. ${check.message}`}
      style={[styles.container, { borderLeftColor: tone }, style]}
    >
      <View style={styles.header}>
        <Label tone={check.level === 'info' ? 'tertiary' : check.level === 'warning' ? 'warning' : 'limit'}>
          {check.level === 'blocker' ? 'Cannot start' : check.level === 'warning' ? 'Check this' : 'Note'}
        </Label>
      </View>
      <Text variant="heading" style={styles.title}>
        {check.title}
      </Text>
      <Text variant="bodySm" tone="secondary">
        {check.message}
      </Text>
      {(onAction && check.actionLabel) || onDismiss ? (
        <View style={styles.actions}>
          {onAction && check.actionLabel ? (
            <HardwareButton label={check.actionLabel} size="sm" onPress={onAction} />
          ) : null}
          {onDismiss ? (
            <HardwareButton label="Understood" size="sm" variant="ghost" onPress={onDismiss} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.panel,
    borderLeftWidth: 2,
    padding: space.lg,
    gap: space.xs,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  title: { marginTop: space.xxs },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
});
