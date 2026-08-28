import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  ARCHIVE_EVIDENCE_LABELS,
  EVIDENCE_LABELS,
  VERIFICATION_LABELS,
  type ArchiveEvidenceLevel,
  type EvidenceLevel,
  type VerificationStatus,
} from '@frequencylab/dsp-core';
import {
  archiveEvidenceColors,
  colors,
  evidenceColors,
  radius,
  space,
  verificationColors,
} from '../tokens';
import * as haptics from '../haptics';
import { Label, Text } from './Text';
import { DisplayGlass } from './Surface';

export interface EvidenceBadgeProps {
  level: EvidenceLevel;
  compact?: boolean;
  style?: ViewStyle;
}

/**
 * Evidence rating.
 *
 * Colour is the fast signal, but the label is always present: a rating that
 * could only be read as a colour would be unreadable to a colour-blind user and
 * meaningless to a screen reader (§50).
 */
export function EvidenceBadge({ level, compact, style }: EvidenceBadgeProps) {
  const color = evidenceColors[level];
  return (
    <View
      style={[styles.badge, { borderColor: withAlpha(color, 0.4) }, style]}
      accessible
      accessibilityLabel={`Evidence rating: ${EVIDENCE_LABELS[level]}`}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant="label" uppercase tone="secondary">
        {compact ? SHORT_LABELS[level] : EVIDENCE_LABELS[level]}
      </Text>
    </View>
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
  const color = verificationColors[status];
  return (
    <View
      style={[styles.badge, { borderColor: withAlpha(color, 0.4) }, style]}
      accessible
      accessibilityLabel={`Source: ${VERIFICATION_LABELS[status]}`}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant="label" uppercase tone="secondary">
        {VERIFICATION_SHORT[status]}
      </Text>
    </View>
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
  const color = archiveEvidenceColors[level];
  return (
    <View
      style={[styles.badge, { borderColor: withAlpha(color, 0.4) }, style]}
      accessible
      accessibilityLabel={`Evidence: ${ARCHIVE_EVIDENCE_LABELS[level]}`}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant="label" uppercase tone="secondary">
        {ARCHIVE_EVIDENCE_SHORT[level]}
      </Text>
    </View>
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
 */
export function DnaChip({ human, fingerprint, onPress, style }: DnaChipProps) {
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
      style={style}
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
