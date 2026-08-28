import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { formatClock, type Experiment, type Insight } from '@frequencylab/dsp-core';
import { colors, radius, space } from '../tokens';
import * as haptics from '../haptics';
import { DnaChip, Tag } from './Badges';
import { Label, Text } from './Text';
import type { ProtocolSummary } from '../../state/library';

export interface ProtocolCardProps {
  protocol: ProtocolSummary;
  onPress?: () => void;
  onPlay?: () => void;
  /** Renders a compact row instead of a full card. */
  compact?: boolean;
  style?: ViewStyle;
}

export function ProtocolCard({ protocol, onPress, onPlay, compact, style }: ProtocolCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${protocol.name}, ${Math.round(protocol.durationSec / 60)} minutes, ${protocol.stageCount} stages`}
      style={[styles.card, compact ? styles.cardCompact : null, style]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitle}>
          <Text variant="heading" numberOfLines={1}>
            {protocol.name}
          </Text>
          {!compact && protocol.description ? (
            <Text variant="bodySm" tone="secondary" numberOfLines={2} style={styles.cardDescription}>
              {protocol.description}
            </Text>
          ) : null}
        </View>
        <Text variant="readoutSm" tone="secondary">
          {formatClock(protocol.durationSec)}
        </Text>
      </View>

      <View style={styles.cardMeta}>
        <DnaChip human={protocol.humanDna} fingerprint={protocol.fingerprint} onPress={onPress} />
        <View style={styles.cardTags}>
          {protocol.stageCount > 1 ? <Tag label={`${protocol.stageCount} stages`} /> : null}
          {protocol.generatedBy === 'ai' ? <Tag label="AI" /> : null}
          {protocol.isFork ? <Tag label="Fork" /> : null}
          {protocol.version > 1 ? <Tag label={`v${protocol.version}`} /> : null}
        </View>
      </View>

      {onPlay ? (
        <Pressable
          onPress={() => {
            haptics.engage();
            onPlay();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Start ${protocol.name}`}
          style={styles.playButton}
          hitSlop={10}
        >
          <Label tone="signal">Start</Label>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export function InsightCard({ insight, style }: { insight: Insight; style?: ViewStyle }) {
  return (
    <View style={[styles.card, style]} accessible accessibilityLabel={insight.body}>
      <View style={styles.cardHeader}>
        <Text variant="heading">{insight.title}</Text>
        <Label tone={insight.confidence === 'consistent' ? 'signal' : 'tertiary'}>
          {CONFIDENCE_LABEL[insight.confidence]}
        </Label>
      </View>
      <Text variant="bodySm" tone="secondary" style={styles.cardDescription}>
        {insight.body}
      </Text>
      <View style={styles.insightFooter}>
        <Label>{insight.sampleSize} sessions</Label>
        {insight.nextStep ? (
          <Text variant="caption" tone="tertiary" style={styles.nextStep}>
            {insight.nextStep}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const CONFIDENCE_LABEL = {
  preliminary: 'Preliminary',
  moderate: 'Moderate',
  consistent: 'Consistent',
} as const;

export function ExperimentCard({
  experiment,
  onPress,
  style,
}: {
  experiment: Experiment;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const completed = experiment.assignments.filter((assignment) => assignment.sessionId).length;
  const total = experiment.assignments.length;
  const progress = total === 0 ? 0 : completed / total;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${experiment.name}, ${completed} of ${total} sessions complete`}
      style={[styles.card, style]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitle}>
          <Text variant="heading" numberOfLines={1}>
            {experiment.name}
          </Text>
          <Label tone={experiment.blinded && !experiment.revealedAt ? 'signal' : 'tertiary'}>
            {experiment.revealedAt
              ? 'Revealed'
              : experiment.blinded
                ? 'Blinded'
                : 'Open label'}
          </Label>
        </View>
        <Text variant="readoutSm" tone="secondary">
          {completed}/{total}
        </Text>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>

      <View style={styles.cardTags}>
        {experiment.metrics.map((metric) => (
          <Tag key={metric} label={metric} />
        ))}
        {experiment.protocolControl ? <Tag label="Control" /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panelRaised,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(83,95,112,0.22)',
    shadowColor: '#2A3140',
    shadowOpacity: 0.13,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cardCompact: { padding: space.md, gap: space.sm },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
  },
  cardTitle: { flex: 1, gap: space.xxs },
  cardDescription: { marginTop: space.xxs },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  cardTags: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  playButton: {
    position: 'absolute',
    right: space.lg,
    bottom: space.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.signalDim,
    backgroundColor: colors.surfaceRaised,
  },
  insightFooter: { gap: space.xs },
  nextStep: { fontStyle: 'italic' },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceRecessed,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: 'rgba(72,83,99,0.24)',
  },
  progressFill: { height: 3, backgroundColor: colors.signal },
});
