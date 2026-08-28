import { StyleSheet, Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { colors, tabularNums, type } from '../tokens';

type Variant = keyof typeof type;
type Tone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'signal'
  | 'warning'
  | 'limit'
  | 'disabled'
  /** Illuminated text on dark display glass. */
  | 'display'
  | 'displayDim'
  | 'displaySignal';

export interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
  /** Applies tabular figures. Defaults to true for every mono variant. */
  tabular?: boolean;
  uppercase?: boolean;
}

const TONE_COLOR: Record<Tone, string> = {
  primary: colors.text,
  secondary: colors.textSecondary,
  tertiary: colors.textTertiary,
  signal: colors.signal,
  warning: colors.warning,
  limit: colors.limit,
  disabled: colors.textDisabled,
  display: colors.displayInk,
  displayDim: colors.displayDim,
  displaySignal: colors.displaySignal,
};

const MONO_VARIANTS = new Set<Variant>([
  'hero',
  'readoutXl',
  'readoutLg',
  'readout',
  'readoutSm',
  'readoutXs',
]);

/**
 * The single text primitive.
 *
 * Everything routes through here so that type, tone and tabular figures cannot
 * drift screen to screen. `allowFontScaling` stays on by default — the layouts
 * are built to accommodate Dynamic Type rather than to resist it (§50).
 */
export function Text({
  variant = 'body',
  tone = 'primary',
  tabular,
  uppercase,
  style,
  maxFontSizeMultiplier = 1.6,
  ...rest
}: TextProps) {
  const useTabular = tabular ?? MONO_VARIANTS.has(variant);
  const composed: TextStyle[] = [
    type[variant] as TextStyle,
    { color: TONE_COLOR[tone] },
    useTabular ? tabularNums : null,
    uppercase ? styles.uppercase : null,
    StyleSheet.flatten(style) as TextStyle,
  ].filter(Boolean) as TextStyle[];

  return <RNText {...rest} maxFontSizeMultiplier={maxFontSizeMultiplier} style={composed} />;
}

/** An engraved hardware label. Always uppercase, always tertiary. */
export function Label({ style, tone = 'tertiary', ...rest }: TextProps) {
  return <Text variant="label" tone={tone} uppercase style={style} {...rest} />;
}

const styles = StyleSheet.create({
  uppercase: { textTransform: 'uppercase' },
});
