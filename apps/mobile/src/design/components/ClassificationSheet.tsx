import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  CLASSIFICATION_DESCRIPTIONS,
  EVIDENCE_DESCRIPTIONS,
  type EvidenceLevel,
  type PresetClassification,
} from '@frequencylab/dsp-core';
import { colors, radius, shadows, space } from '../tokens';
import { ClassificationBadge, EvidenceBadge } from './Badges';
import { HardwareButton } from './HardwareButton';
import { Label, Text } from './Text';

/**
 * What the badge means, where the badge is.
 *
 * The Library used to explain its whole classification system in prose *above*
 * the rows it applied to — a five-row key at the foot of the screen, a
 * paragraph under the search field, and another panel on Collections saying the
 * same thing about shelves. Four hundred words of apparatus in front of the
 * content, none of it read at the moment it was needed.
 *
 * Every sentence of it is here instead, behind the badge that summarises it.
 * That is the whole trade and it has one hard limit: **nothing was cut, only
 * moved.** All five evidence ratings and all seven classifications are listed
 * in full whichever badge opened the sheet, because a rating only means
 * anything against the ones it is not — "Traditional" is informative because
 * "Research" was available and was not chosen. Showing the tapped rating alone
 * would be shorter and would say less.
 *
 * The tapped value is pulled to the top and named, so the sheet answers the
 * question that opened it first and provides the scale second.
 */

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Dismiss" />
      <View style={styles.sheet}>
        <Label>{title}</Label>
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {children}
        </ScrollView>
        <HardwareButton label="Close" variant="ghost" onPress={onClose} />
      </View>
    </Modal>
  );
}

/**
 * The five evidence ratings a library entry can carry.
 *
 * `current` is the rating whose badge was tapped. It is stated in words at the
 * top rather than merely highlighted, because a highlight is a colour and this
 * sheet exists to make the meaning readable without one (§50).
 */
export function EvidenceSheet({
  current,
  onClose,
}: {
  current?: EvidenceLevel;
  onClose: () => void;
}) {
  const levels = Object.keys(EVIDENCE_DESCRIPTIONS) as EvidenceLevel[];
  return (
    <Sheet title="What the ratings mean" onClose={onClose}>
      <Text variant="bodySm" tone="secondary">
        A rating describes how well studied a claim is, never how well it will
        work for you. Every entry carries one, including the entries whose claims
        the evidence does not support.
      </Text>
      {levels.map((level) => (
        <View key={level} style={styles.row}>
          <EvidenceBadge level={level} />
          <Text variant="caption" tone={level === current ? 'secondary' : 'tertiary'}>
            {level === current ? 'This entry. ' : ''}
            {EVIDENCE_DESCRIPTIONS[level]}
          </Text>
        </View>
      ))}
    </Sheet>
  );
}

/**
 * The seven classifications a preset or a shelf can carry.
 *
 * The shelf caveat is stated here once and not on any screen, because it is the
 * same sentence wherever a shelf badge appears: a shelf badge is a heading, and
 * the badge that decides anything is the one on the row.
 */
export function ClassificationSheet({
  current,
  scope = 'preset',
  onClose,
}: {
  current?: PresetClassification;
  /** `shelf` adds the sentence about a collection badge not ruling its rows. */
  scope?: 'preset' | 'shelf';
  onClose: () => void;
}) {
  const classifications = Object.keys(CLASSIFICATION_DESCRIPTIONS) as PresetClassification[];
  return (
    <Sheet title="What the classifications mean" onClose={onClose}>
      <Text variant="bodySm" tone="secondary">
        A classification says where something&apos;s standing comes from, not how
        good it is. Being findable in this app is not being endorsed, and the
        badge is what says so.
      </Text>
      {scope === 'shelf' ? (
        <Text variant="bodySm" tone="secondary">
          A badge on a shelf describes the collection as a whole, and rows on it
          can differ. The Solfeggio shelf is traditional, and 528 Hz on that
          shelf also carries a study — so the classification that decides
          anything is the one on the preset itself, never the shelf&apos;s.
        </Text>
      ) : null}
      {classifications.map((classification) => (
        <View key={classification} style={styles.row}>
          <ClassificationBadge classification={classification} />
          <Text
            variant="caption"
            tone={classification === current ? 'secondary' : 'tertiary'}
          >
            {classification === current ? 'This one. ' : ''}
            {CLASSIFICATION_DESCRIPTIONS[classification]}
          </Text>
        </View>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '86%',
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
  list: { flexGrow: 0 },
  listContent: { gap: space.md, paddingBottom: space.sm },
  row: { gap: space.xs },
});
