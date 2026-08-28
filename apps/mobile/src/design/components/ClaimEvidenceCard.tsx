import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, space } from '../tokens';
import { Recessed } from './Surface';
import { Label, Text } from './Text';

/**
 * The two halves of a claim, and nothing between them.
 *
 * `PopularAssociation` and `HistoricalClaim` are the same shape for the same
 * reason: neither module will let a claim be stored without the sentence that
 * answers it. This is that rule made visible.
 */
export interface ClaimEvidencePair {
  /** The claim as it circulates or as a source framed it, in reported speech. */
  claim: string;
  /** True when the claim is medical, which changes how it must be presented. */
  medical: boolean;
  /** What reliable evidence establishes about it. */
  currentEvidence: string;
}

export interface ClaimEvidenceCardProps {
  association: ClaimEvidencePair;
  /**
   * Heading over the claim. Defaults to the present tense, for an association
   * that is still circulating; the archive passes the past tense, because its
   * records are of things a particular source said at a particular time.
   */
  claimLabel?: string;
  evidenceLabel?: string;
  style?: ViewStyle;
}

/**
 * A claim and what the evidence establishes (§6).
 *
 * The whole product turns on this card, so the two halves are separated by
 * physical form rather than by anything as soft as a colour or a blur. The
 * claim is **engraved into the panel**: a milled well, ink set back, a rule down
 * its edge — a record of something that was said. The evidence is **printed on
 * the face**: raised, primary ink, the app speaking in its own voice. A reader
 * skimming at arm's length can tell which is which without reading a word, and
 * a reader who reads every word finds the same distinction spelled out in the
 * two headings.
 *
 * Two things are never done here. The claim is never shown without the answer —
 * quoting a claim on its own is repeating it — and neither half is ever
 * softened, greyed, blurred or truncated, because a claim that cannot be read
 * accurately cannot be assessed accurately either.
 *
 * A medical claim is marked. Not tinted: marked, with a word, in the
 * accessibility label as well as on the screen, because "this is a medical
 * claim and it is not established" is the single most consequential sentence
 * this component ever has to carry (§50).
 */
export function ClaimEvidenceCard({
  association,
  claimLabel = 'What is claimed',
  evidenceLabel = 'What the evidence establishes',
  style,
}: ClaimEvidenceCardProps) {
  return (
    <View
      style={[styles.card, style]}
      accessible
      // One node rather than two, so a screen reader cannot land on the claim
      // and move away before reaching the answer to it.
      accessibilityLabel={`${association.medical ? 'Medical claim. ' : ''}${claimLabel}: ${
        association.claim
      } ${evidenceLabel}: ${association.currentEvidence}`}
    >
      <Recessed cornerRadius={radius.control} style={styles.claimWell}>
        <View style={styles.claimBody}>
          <View style={styles.claimHead}>
            <Label>{claimLabel}</Label>
            {association.medical ? <MedicalClaimTag /> : null}
          </View>
          <Text variant="bodySm" tone="secondary" style={styles.claimText}>
            {association.claim}
          </Text>
        </View>
      </Recessed>

      <View style={styles.evidence}>
        <Label>{evidenceLabel}</Label>
        <Text variant="bodySm" style={styles.evidenceText}>
          {association.currentEvidence}
        </Text>
      </View>
    </View>
  );
}

/**
 * The medical mark.
 *
 * Built like the evidence badges — a dot beside a word, never the dot alone —
 * so it survives being read aloud, printed in greyscale, or seen by somebody
 * who cannot distinguish the colour it is drawn in.
 */
export function MedicalClaimTag() {
  return (
    <View style={styles.medical} accessibilityLabel="This is a medical claim">
      <View style={styles.medicalDot} />
      <Text variant="label" uppercase tone="limit">
        Medical claim
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.card,
    padding: space.md,
    gap: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.edgeDark,
  },
  claimWell: { borderRadius: radius.control },
  claimBody: {
    padding: space.md,
    gap: space.xs,
    // The scribe line down the reported half. It is the fastest read on the
    // card: text with a rule beside it is being quoted, text without one is not.
    borderLeftWidth: 2,
    borderLeftColor: colors.engraving,
  },
  claimHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  claimText: { marginTop: space.xxs },
  evidence: { paddingHorizontal: space.md, paddingBottom: space.xs, gap: space.xs },
  evidenceText: { marginTop: space.xxs },
  medical: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(229, 72, 77, 0.4)',
  },
  medicalDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.limit },
});
