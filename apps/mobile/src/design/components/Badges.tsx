import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  ARCHIVE_EVIDENCE_LABELS,
  CLASSIFICATION_LABELS,
  EVIDENCE_LABELS,
  VERIFICATION_LABELS,
  type ArchiveEvidenceLevel,
  type EvidenceLevel,
  type PresetClassification,
  type VerificationStatus,
} from '@frequencylab/dsp-core';
import {
  archiveEvidenceColors,
  classificationColors,
  colors,
  evidenceColors,
  MIN_TOUCH_TARGET,
  radius,
  space,
  verificationColors,
} from '../tokens';
import * as haptics from '../haptics';
import { useTier } from '../../features/tier';
import { Label, Text } from './Text';
import { DisplayGlass } from './Surface';

/**
 * The badge, and the door behind it.
 *
 * A rating used to be printed beside a paragraph explaining what ratings mean —
 * once per screen, above the rows it applied to, and read by nobody. The
 * paragraph now lives in a sheet and the badge is what opens it, which is why
 * `onPress` is handled here rather than by each screen wrapping badges in its
 * own pressable: the chevron, the 44 pt target and the screen-reader hint have
 * to be identical everywhere or the badge stops being a signal a user can rely
 * on.
 *
 * Two rules this keeps. The target is made of **real padding**, because React
 * Native Web ignores `hitSlop` and a 24 pt badge with a hit slop is a 24 pt
 * badge. And a badge pressable is never nested inside another pressable —
 * callers place it as a *sibling* of the row that navigates, so a tap means
 * exactly one thing and a click cannot both open a sheet and change screen.
 */
function BadgeShell({
  color,
  label,
  accessibilityLabel,
  onPress,
  style,
}: {
  color: string;
  label: string;
  accessibilityLabel: string;
  /** Opens the sheet that explains this rating. Omit for a static badge. */
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const pill = (
    <View
      style={[styles.badge, { borderColor: withAlpha(color, 0.4) }, onPress ? undefined : style]}
      accessible={!onPress}
      accessibilityLabel={onPress ? undefined : accessibilityLabel}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant="label" uppercase tone="secondary">
        {label}
      </Text>
      {onPress ? (
        <Text variant="label" tone="tertiary" style={styles.chevron}>
          {'›'}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) return pill;

  return (
    <Pressable
      onPress={() => {
        haptics.engage();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens what this rating means."
      style={[styles.badgeTouch, style]}
    >
      {pill}
    </Pressable>
  );
}

export interface EvidenceBadgeProps {
  level: EvidenceLevel;
  compact?: boolean;
  /** Opens the ratings sheet. The rating itself is shown either way. */
  onPress?: () => void;
  style?: ViewStyle;
}

/**
 * Evidence rating.
 *
 * Colour is the fast signal, but the label is always present: a rating that
 * could only be read as a colour would be unreadable to a colour-blind user and
 * meaningless to a screen reader (§50).
 */
export function EvidenceBadge({ level, compact, onPress, style }: EvidenceBadgeProps) {
  return (
    <BadgeShell
      color={evidenceColors[level]}
      label={compact ? SHORT_LABELS[level] : EVIDENCE_LABELS[level]}
      accessibilityLabel={`Evidence rating: ${EVIDENCE_LABELS[level]}`}
      onPress={onPress}
      style={style}
    />
  );
}

const SHORT_LABELS: Record<EvidenceLevel, string> = {
  stronger: 'Stronger',
  promising: 'Promising',
  limited: 'Limited',
  traditional: 'Traditional',
  unsupported: 'Unsupported',
};

/**
 * The archive's two ratings (§4, §5).
 *
 * They are rendered as two separate badges, never merged, because they answer
 * different questions. `VerificationBadge` says how well the *provenance* holds
 * up — whether the number can be traced to a document. `ArchiveEvidenceBadge`
 * says what the *evidence* supports. A record can be impeccably sourced to a
 * 1930s pamphlet and still carry no evidence at all, and a user has to be able
 * to see both facts at once to read the archive honestly.
 */
export function VerificationBadge({
  status,
  style,
}: {
  status: VerificationStatus;
  style?: ViewStyle;
}) {
  return (
    <BadgeShell
      color={verificationColors[status]}
      label={VERIFICATION_SHORT[status]}
      accessibilityLabel={`Source: ${VERIFICATION_LABELS[status]}`}
      style={style}
    />
  );
}

const VERIFICATION_SHORT: Record<VerificationStatus, string> = {
  'primary-historical': 'Primary source',
  'secondary-historical': 'Secondary source',
  'modern-compilation': 'Compilation',
  'community-submitted': 'Submitted',
  'source-unclear': 'Source unclear',
  unverified: 'Unverified',
};

export function ArchiveEvidenceBadge({
  level,
  style,
}: {
  level: ArchiveEvidenceLevel;
  style?: ViewStyle;
}) {
  return (
    <BadgeShell
      color={archiveEvidenceColors[level]}
      label={ARCHIVE_EVIDENCE_SHORT[level]}
      accessibilityLabel={`Evidence: ${ARCHIVE_EVIDENCE_LABELS[level]}`}
      style={style}
    />
  );
}

const ARCHIVE_EVIDENCE_SHORT: Record<ArchiveEvidenceLevel, string> = {
  'research-supported': 'Research-supported',
  preliminary: 'Preliminary',
  historical: 'Historical',
  traditional: 'Traditional',
  experimental: 'Experimental',
  'unsupported-medical-claim': 'Claim unsupported',
};

/**
 * A preset's evidence classification (§25).
 *
 * Every row that can be found — in a shelf, in a search result, in the user's
 * own favourites — carries one of these, because being findable is not being
 * endorsed and the badge is the sentence that says so. It is deliberately never
 * optional on a result row: a list that could render without it is a list that
 * eventually will.
 *
 * The word is always present beside the dot, and the full note is on the
 * accessibility label, so the classification is reachable by a screen reader
 * rather than only visible as a colour (§50). Where a screen passes `onPress`
 * the same note is also reachable by tapping, which is what let the paragraph
 * that used to sit above these lists be deleted from the page.
 */
export function ClassificationBadge({
  classification,
  note,
  onPress,
  style,
}: {
  classification: PresetClassification;
  /** The classification's description, read out but not printed on the badge. */
  note?: string;
  /** Opens the classification sheet. The classification is shown either way. */
  onPress?: () => void;
  style?: ViewStyle;
}) {
  return (
    <BadgeShell
      color={classificationColors[classification]}
      label={CLASSIFICATION_LABELS[classification]}
      accessibilityLabel={`Evidence classification: ${CLASSIFICATION_LABELS[classification]}.${
        note ? ` ${note}` : ''
      }`}
      onPress={onPress}
      style={style}
    />
  );
}

export interface DnaChipProps {
  /** Human DNA — the short readable form. */
  human: string;
  /** Full fingerprint, copied when the chip is long-pressed. */
  fingerprint?: string;
  onPress?: () => void;
  style?: ViewStyle;
}

/**
 * Protocol DNA chip.
 *
 * Tapping opens the full DNA; long-pressing copies the fingerprint. The chip
 * shows the human form, which is lossy on purpose — the UI never presents it
 * as proof that two protocols are identical.
 *
 * It renders nothing at `simple`. DNA is the clearest case of vocabulary a tier
 * may hide: it is a machine-readable restatement of parameters the level does
 * not show either, and it makes no claim of its own, so removing it removes no
 * honesty. Gated here rather than at each call site because the chip appears on
 * cards that several screens share, and one forgotten card is a `4bin/8.0/220`
 * string in front of somebody who was told there would be no numbers.
 */
export function DnaChip({ human, fingerprint, onPress, style }: DnaChipProps) {
  const { canSee } = useTier();
  if (!canSee('dna')) return null;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={
        fingerprint
          ? () => {
              haptics.confirm();
              void Clipboard.setStringAsync(fingerprint);
            }
          : undefined
      }
      accessibilityRole="button"
      accessibilityLabel={`Protocol DNA ${human}`}
      accessibilityHint={fingerprint ? 'Long press to copy the full fingerprint.' : undefined}
      // The glass inside stays 32 pt; the pressable around it is padded to 44.
      // Padding rather than `hitSlop`, which React Native Web ignores.
      style={[styles.dnaTouch, style]}
    >
      <DisplayGlass cornerRadius={radius.engraved + 1}>
        <View style={styles.dna}>
          <Label tone="displayDim">DNA</Label>
          <Text variant="readoutXs" tone="displaySignal" numberOfLines={1}>
            {human}
          </Text>
        </View>
      </DisplayGlass>
    </Pressable>
  );
}

export function Tag({ label, tone = 'tertiary' }: { label: string; tone?: 'tertiary' | 'signal' }) {
  return (
    <View style={styles.tag}>
      <Text variant="label" uppercase tone={tone}>
        {label}
      </Text>
    </View>
  );
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  dnaTouch: { paddingVertical: 6, justifyContent: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  /*
   * The pill is ~23 pt tall. This is the padding that makes the *target* 44,
   * measured rather than assumed — `undersized` in the browser harness counts
   * anything that comes out under it.
   */
  badgeTouch: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: space.md,
    paddingRight: space.sm,
  },
  chevron: { marginLeft: space.hair },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dna: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  tag: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.engraved,
    backgroundColor: colors.surfaceRecessed,
  },
});
