import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BUILT_IN_METRICS,
  formatClock,
  type MetricKey,
  type SubjectiveRating,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel, PanelRow } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { DnaChip } from '../../src/design/components/Badges';
import { Label, Text } from '../../src/design/components/Text';
import { colors, radius, space } from '../../src/design/tokens';
import * as haptics from '../../src/design/haptics';
import { useHistory } from '../../src/state/history';
import { useExperiments } from '../../src/state/experiments';

/**
 * Session completion and rating (§43).
 *
 * Rating is optional and fast: a row of taps, no keyboard, no required field.
 * The technical summary above it is the point — the user sees exactly what ran
 * before they say how it felt, which is what makes the rating worth analysing.
 */
export default function RateSessionScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const sessions = useHistory((state) => state.sessions);
  const rate = useHistory((state) => state.rate);
  const experiments = useExperiments((state) => state.experiments);

  const session = sessions.find((candidate) => candidate.id === sessionId);
  const [ratings, setRatings] = useState<Record<MetricKey, number>>({});

  const experiment = useMemo(
    () => experiments.find((candidate) => candidate.id === session?.experimentId),
    [experiments, session?.experimentId],
  );

  const metrics = useMemo(() => {
    if (experiment) {
      return BUILT_IN_METRICS.filter((metric) => experiment.metrics.includes(metric.key));
    }
    return BUILT_IN_METRICS.slice(0, 4);
  }, [experiment]);

  if (!session) {
    return (
      <Screen>
        <ScreenHeader title="Session complete" subtitle="This session is no longer in your history." />
        <HardwareButton label="Done" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const submit = async () => {
    const collected: SubjectiveRating[] = Object.entries(ratings).map(([metric, value]) => ({
      metric,
      value,
    }));
    await rate(session.id, collected);
    haptics.confirm();
    router.replace('/');
  };

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Session complete"
        title={session.protocolName}
        subtitle={`${formatClock(session.metrics.playedSec)} of ${formatClock(session.plannedDurationSec)} · ${Math.round(session.metrics.adherence * 100)}% completed`}
      />

      <InstrumentPanel tone="recessed" label="What ran">
        <PanelRow label="Protocol" value={session.protocolName} />
        <PanelRow label="Played" value={formatClock(session.metrics.playedSec)} />
        <PanelRow label="Pauses" value={String(session.metrics.pauseCount)} />
        <PanelRow label="Output" value={session.metrics.outputRoute ?? 'Unknown'} />
        <PanelRow
          label="Peak limiting"
          value={`${session.metrics.peakGainReductionDb.toFixed(1)} dB`}
        />
        <PanelRow label="DSP version" value={session.dspVersion} />
        <View style={styles.dnaRow}>
          <DnaChip human={session.humanDna} fingerprint={session.protocolFingerprint} />
        </View>
      </InstrumentPanel>

      {experiment && !experiment.revealedAt ? (
        <InstrumentPanel tone="flat" label="Blinded experiment">
          <Text variant="bodySm" tone="secondary">
            This session was part of {experiment.name}. Which protocol ran stays hidden until the
            experiment is complete, so your rating is not influenced by knowing.
          </Text>
        </InstrumentPanel>
      ) : null}

      <SectionHeader label="How did this session feel?" />
      <Text variant="bodySm" tone="tertiary">
        Optional, and there are no wrong answers. Skip anything that does not apply.
      </Text>

      {metrics.map((metric) => (
        <InstrumentPanel key={metric.key} tone="flat">
          <View style={styles.metricHeader}>
            <View style={styles.metricLabel}>
              <Text variant="heading">{metric.label}</Text>
              <Text variant="caption" tone="tertiary">
                {metric.description}
              </Text>
            </View>
            <Text variant="readoutLg" tone={ratings[metric.key] === undefined ? 'tertiary' : 'signal'}>
              {ratings[metric.key] === undefined ? '—' : ratings[metric.key].toFixed(1)}
            </Text>
          </View>
          <View
            style={styles.scale}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={metric.label}
            accessibilityValue={{ min: 0, max: 10, now: ratings[metric.key] ?? 0 }}
          >
            {Array.from({ length: 11 }, (_, value) => {
              const selected = ratings[metric.key] === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => {
                    haptics.detent();
                    setRatings((current) => ({ ...current, [metric.key]: value }));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${metric.label} ${value} out of 10`}
                  accessibilityState={{ selected }}
                  style={[styles.scaleStep, selected ? styles.scaleStepSelected : null]}
                >
                  <Text variant="readoutXs" tone={selected ? 'signal' : 'tertiary'}>
                    {value}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </InstrumentPanel>
      ))}

      <HardwareButton
        label={Object.keys(ratings).length > 0 ? 'Save ratings' : 'Done'}
        variant="primary"
        size="lg"
        onPress={submit}
      />
      <HardwareButton label="Skip" variant="ghost" onPress={() => router.replace('/')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  dnaRow: { marginTop: space.md },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
  },
  metricLabel: { flex: 1, gap: 2 },
  scale: { flexDirection: 'row', gap: 3, marginTop: space.md },
  scaleStep: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.engraved,
    backgroundColor: colors.surfaceRecessed,
  },
  scaleStepSelected: {
    backgroundColor: colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.signalDim,
  },
});
