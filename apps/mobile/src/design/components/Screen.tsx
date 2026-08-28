import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LIGHT, SURFACES } from '../materials';
import { BrushedGrain } from './Surface';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, space } from '../tokens';
import { Label, Text } from './Text';

export interface ScreenProps {
  children: ReactNode;
  /** Adds a scroll container. Off for screens that manage their own scrolling. */
  scroll?: boolean;
  /** Extra bottom padding, e.g. for the transport bar. */
  bottomInset?: number;
  contentStyle?: ViewStyle;
  style?: ViewStyle;
  testID?: string;
}

export function Screen({ children, scroll = true, bottomInset = 0, contentStyle, style, testID }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: insets.top + space.sm,
    paddingBottom: insets.bottom + bottomInset + space.xxxl,
  };

  const chassis = (
    <>
      <LinearGradient
        colors={SURFACES.chassis}
        start={LIGHT.vertical.start}
        end={LIGHT.vertical.end}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <BrushedGrain opacity={0.45} />
    </>
  );

  if (!scroll) {
    return (
      <View testID={testID} style={[styles.root, style]}>
        {chassis}
        <View style={[styles.plain, padding]}>{children}</View>
      </View>
    );
  }

  return (
    <View style={[styles.root, style]}>
      {chassis}
      <ScrollView
        testID={testID}
        style={styles.scroll}
        contentContainerStyle={[styles.content, padding, contentStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        {eyebrow ? <Label>{eyebrow}</Label> : null}
        <Text variant="title" accessibilityRole="header" style={styles.headerTitle}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySm" tone="secondary" style={styles.headerSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function SectionHeader({ label, right }: { label: string; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <Label>{label}</Label>
      {right}
    </View>
  );
}

/** A realistic empty state — used until genuine data exists (§65). */
export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Text variant="heading" tone="secondary">
        {title}
      </Text>
      <Text variant="bodySm" tone="tertiary" style={styles.emptyMessage}>
        {message}
      </Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  plain: { flex: 1, paddingHorizontal: layout.screenPadding },
  content: {
    paddingHorizontal: layout.screenPadding,
    gap: space.lg,
    maxWidth: layout.maxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
    marginBottom: space.xs,
  },
  headerText: { flex: 1, gap: space.xxs },
  headerTitle: { marginTop: space.xxs },
  headerSubtitle: { marginTop: space.xxs },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  empty: {
    paddingVertical: space.xxxl,
    alignItems: 'center',
    gap: space.xs,
  },
  emptyMessage: { textAlign: 'center', maxWidth: 320 },
  emptyAction: { marginTop: space.md },
});
