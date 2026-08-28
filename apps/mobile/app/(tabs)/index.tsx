import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  GOAL_PROFILES,
  formatClock,
  planNextSession,
  protocolFromSimple,
  type SimpleGoal,
} from '@frequencylab/dsp-core';
import { EmptyState, Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { ExperimentCard, InsightCard, ProtocolCard } from '../../src/design/components/Cards';
import { Label, Text } from '../../src/design/components/Text';
import { colors, layout, space } from '../../src/design/tokens';
import { useProtocolLibrary, summariseLibrary } from '../../src/state/library';
import { useHistory } from '../../src/state/history';
import { useExperiments } from '../../src/state/experiments';
import { usePreferences } from '../../src/state/preferences';
import { useSessionStart } from '../../src/state/sessionStart';

/**
 * Home (§40).
 *
 * Five blocks, in a fixed order, and nothing else: context, a recommendation,
 * a running experiment if there is one, recent protocols, and one insight. The
 * hardest constraint on this screen is what it leaves out.
 */
export default function HomeScreen() {
  const router = useRouter();
  const protocols = useProtocolLibrary((state) => state.protocols);
  const sessions = useHistory((state) => state.sessions);
  const insights = useHistory((state) => state.insights);
  const sessionsUntilInsights = useHistory((state) => state.sessionsUntilInsights);
  const experiments = useExperiments((state) => state.experiments);
  const preferences = usePreferences((state) => state.preferences);
  const requestStart = useSessionStart((state) => state.request);

  const recent = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const session of sessions) {
      if (!seen.has(session.protocolId)) {
        seen.add(session.protocolId);
        ordered.push(session.protocolId);
      }
      if (ordered.length >= 3) break;
    }
    // Summarised against the whole library, not just these three, so a name
    // shared with a protocol further down the list still gets its date.
    const summaries = summariseLibrary(protocols);
    return ordered
      .map((id) => summaries.find((summary) => summary.id === id))
      .filter((summary): summary is NonNullable<typeof summary> => summary !== undefined);
  }, [protocols, sessions]);

  const runningExperiment = experiments.find((experiment) => experiment.status === 'running');
  const experimentPlan = runningExperiment ? planNextSession(runningExperiment) : undefined;
  const recommendation = useRecommendation();
  const topInsight = insights()[0];

  const startRecommendation = async () => {
    const protocol = protocolFromSimple({
      goal: recommendation.goal,
      durationSec: recommendation.durationSec,
      intensity: 'balanced',
    });
    await requestStart(protocol, {
      masterGain: preferences.comfortableOutputLevel,
      onStarted: () => router.push('/session'),
    });
  };

  return (
    <Screen bottomInset={layout.transportHeight}>
      <ScreenHeader eyebrow={greeting()} title="Frequency Lab" subtitle="Sound. Measured personally." />

      <InstrumentPanel tone="raised" label="Current recommendation">
        <Text variant="title" style={styles.recommendationTitle}>
          {GOAL_PROFILES[recommendation.goal].label}
        </Text>
        <Text variant="bodySm" tone="secondary" style={styles.recommendationBody}>
          {recommendation.reason}
        </Text>
        <View style={styles.recommendationMeta}>
          <View>
            <Label>Duration</Label>
            <Text variant="readout">{formatClock(recommendation.durationSec)}</Text>
          </View>
          <View>
            <Label>Beat</Label>
            <Text variant="readout">
              {GOAL_PROFILES[recommendation.goal].beat.plateau.toFixed(2)} Hz
            </Text>
          </View>
          <View>
            <Label>Carrier</Label>
            <Text variant="readout">
              {GOAL_PROFILES[recommendation.goal].carrierHz.toFixed(0)} Hz
            </Text>
          </View>
        </View>
        <HardwareButton
          label="Start session"
          variant="primary"
          size="lg"
          style={styles.startButton}
          onPress={startRecommendation}
        />
      </InstrumentPanel>

      {runningExperiment && experimentPlan ? (
        <>
          <SectionHeader label="Continue experiment" />
          <ExperimentCard
            experiment={runningExperiment}
            onPress={() => router.push(`/experiment/${runningExperiment.id}`)}
          />
        </>
      ) : null}

      <SectionHeader
        label="Quick start"
        right={
          <Text variant="caption" tone="tertiary">
            Tap to configure
          </Text>
        }
      />
      <View style={styles.quickGrid}>
        {(['relax', 'focus', 'meditate', 'sleep'] as SimpleGoal[]).map((goal) => (
          <QuickStartTile
            key={goal}
            goal={goal}
            onPress={() => router.push({ pathname: '/quick-start', params: { goal } })}
          />
        ))}
      </View>

      <SectionHeader
        label="Recent protocols"
        right={
          recent.length > 0 ? (
            <Text variant="caption" tone="tertiary" onPress={() => router.push('/lab')}>
              All protocols
            </Text>
          ) : null
        }
      />
      {recent.length > 0 ? (
        recent.map((protocol) => (
          <ProtocolCard
            key={protocol.id}
            protocol={protocol}
            compact
            onPress={() => router.push(`/protocol/${protocol.id}`)}
          />
        ))
      ) : (
        <EmptyState
          title="No sessions yet"
          message="Protocols you run will collect here, with the exact configuration each one used."
          action={<HardwareButton label="Open Explorer" onPress={() => router.push('/explore')} />}
        />
      )}

      <SectionHeader label="From your history" />
      {topInsight ? (
        <InsightCard insight={topInsight} />
      ) : (
        <InstrumentPanel tone="flat">
          <Text variant="bodySm" tone="secondary">
            {sessionsUntilInsights() > 0
              ? `Rate ${sessionsUntilInsights()} more session${sessionsUntilInsights() === 1 ? '' : 's'} and this panel will start showing patterns from your own history. Until then there is nothing here worth claiming.`
              : 'No pattern in your history is clear enough to report yet. Keep running sessions and rating them.'}
          </Text>
        </InstrumentPanel>
      )}
    </Screen>
  );
}

function QuickStartTile({ goal, onPress }: { goal: SimpleGoal; onPress: () => void }) {
  const profile = GOAL_PROFILES[goal];
  return (
    <View style={styles.quickTile}>
      <HardwareButton
        label={profile.label}
        size="lg"
        onPress={onPress}
        style={styles.quickButton}
        accessibilityHint={profile.description}
      />
      <Text variant="caption" tone="tertiary" numberOfLines={2} style={styles.quickCaption}>
        {profile.beat.plateau.toFixed(1)} Hz · {profile.carrierHz} Hz carrier
      </Text>
    </View>
  );
}

/**
 * The recommendation.
 *
 * Time of day and what the user has actually rated well, in that order. It is
 * explicitly framed as a suggestion with a stated reason — never as a
 * prescription, and never with an effect claim attached.
 */
function useRecommendation(): { goal: SimpleGoal; durationSec: number; reason: string } {
  const sessions = useHistory((state) => state.sessions);
  const hour = new Date().getHours();

  return useMemo(() => {
    const typical = sessions.length > 0 ? median(sessions.map((s) => s.metrics.playedSec)) : 1500;
    const durationSec = Math.max(10 * 60, Math.min(45 * 60, Math.round(typical / 300) * 300));

    if (hour >= 21 || hour < 5) {
      return {
        goal: 'sleep',
        durationSec: Math.max(durationSec, 30 * 60),
        reason: 'It is late, so this suggests the long descent rather than anything alerting. You can change it before it starts.',
      };
    }
    if (hour >= 9 && hour < 17) {
      return {
        goal: 'focus',
        durationSec,
        reason: `Mid-day, and your sessions typically run about ${Math.round(durationSec / 60)} minutes. Suggested because of the time and your history, not because of any established effect.`,
      };
    }
    return {
      goal: 'relax',
      durationSec,
      reason: `A ${Math.round(durationSec / 60)}-minute alpha-range session, sized to match the length you usually run.`,
    };
  }, [hour, sessions]);
}

function median(values: number[]): number {
  if (values.length === 0) return 1500;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  if (hour < 21) return 'Evening';
  return 'Night';
}

const styles = StyleSheet.create({
  recommendationTitle: { marginTop: space.xxs },
  recommendationBody: { marginTop: space.xs },
  recommendationMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  startButton: { marginTop: space.lg },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  quickTile: {
    flexBasis: '48%',
    flexGrow: 1,
    gap: space.xxs,
  },
  quickButton: { width: '100%' },
  quickCaption: { paddingHorizontal: space.xxs },
});
