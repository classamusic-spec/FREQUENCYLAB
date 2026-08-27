import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { colors, radius, shadows, space } from '../tokens';
import { Label, Text } from './Text';

export type PanelTone = 'recessed' | 'flat' | 'raised' | 'high';

export interface InstrumentPanelProps extends ViewProps {
  tone?: PanelTone;
  /** Engraved label across the top edge of the panel. */
  label?: string;
  /** Right-aligned value or status on the header row. */
  headerRight?: ReactNode;
  /** Removes the internal padding, for panels that host edge-to-edge content. */
  bare?: boolean;
  children?: ReactNode;
}

/**
 * The base surface of the instrument.
 *
 * A panel is defined by three things at once: its fill, a light hairline on the
 * edge that would catch light, and a dark hairline on the edge that would fall
 * into shadow. That is what makes `recessed` read as milled *into* the chassis
 * and `raised` as sitting proud of it, without any gradient or blur.
 */
export function InstrumentPanel({
  tone = 'flat',
  label,
  headerRight,
  bare,
  style,
  children,
  ...rest
}: InstrumentPanelProps) {
  return (
    <View style={[styles.base, TONE_STYLE[tone], bare ? null : styles.padded, style]} {...rest}>
      {(label || headerRight) && (
        <View style={[styles.header, bare ? styles.headerInset : null]}>
          {label ? <Label>{label}</Label> : <View />}
          {headerRight}
        </View>
      )}
      {children}
    </View>
  );
}

/** A thin engraved divider between rows inside a panel. */
export function PanelDivider({ style }: { style?: ViewStyle }) {
  return <View style={[styles.divider, style]} />;
}

/** A labelled row: engraved caption on the left, value on the right. */
export function PanelRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Label>{label}</Label>
      {children ?? (
        <Text variant="readoutSm" tone="secondary">
          {value}
        </Text>
      )}
    </View>
  );
}

const TONE_STYLE: Record<PanelTone, ViewStyle> = {
  recessed: {
    backgroundColor: colors.surfaceRecessed,
    borderTopColor: colors.edgeDark,
    borderBottomColor: colors.edgeLight,
  },
  flat: {
    backgroundColor: colors.surface,
    borderTopColor: colors.hairline,
    borderBottomColor: colors.edgeDark,
  },
  raised: {
    backgroundColor: colors.surfaceRaised,
    borderTopColor: colors.edgeLight,
    borderBottomColor: colors.edgeDark,
    ...(shadows.raised as ViewStyle),
  },
  high: {
    backgroundColor: colors.surfaceHigh,
    borderTopColor: colors.edgeLight,
    borderBottomColor: colors.edgeDark,
    ...(shadows.control as ViewStyle),
  },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.panel,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  padded: {
    padding: space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
    minHeight: 14,
  },
  headerInset: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
    marginVertical: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
  },
});
