import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { radius, space } from '../tokens';
import { SURFACES } from '../materials';
import { DisplayGlass, Raised, Recessed } from './Surface';
import { Label, Text } from './Text';

export type PanelTone = 'recessed' | 'flat' | 'raised' | 'high' | 'display';

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
  const body = (
    <View style={bare ? undefined : styles.padded}>
      {(label || headerRight) && (
        <View style={[styles.header, bare ? styles.headerInset : null]}>
          {label ? <Label>{label}</Label> : <View />}
          {headerRight}
        </View>
      )}
      {children}
    </View>
  );

  // Each tone is a different physical form, not a different colour: a module
  // face bolted to the case, a well milled into it, or a glass cutout.
  if (tone === 'recessed') {
    return (
      <Recessed cornerRadius={radius.panel} style={style} {...rest}>
        {body}
      </Recessed>
    );
  }
  if (tone === 'display') {
    return (
      <DisplayGlass cornerRadius={radius.panel} style={style} {...rest}>
        {body}
      </DisplayGlass>
    );
  }
  return (
    <Raised
      cornerRadius={radius.panel}
      ramp={tone === 'high' || tone === 'raised' ? SURFACES.panelActive : SURFACES.panel}
      style={style}
      {...rest}
    >
      {body}
    </Raised>
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



const styles = StyleSheet.create({
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
    height: 1,
    backgroundColor: 'rgba(84,96,114,0.20)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.75)',
    marginVertical: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
  },
});
