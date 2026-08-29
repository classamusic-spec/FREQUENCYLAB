import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { MIN_SESSIONS_FOR_INSIGHTS } from '@frequencylab/dsp-core';
import { EmptyState, Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { ProfileButton } from '../../src/design/components/ProfileButton';
import { InstrumentPanel } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { ExperimentCard, InsightCard } from '../../src/design/components/Cards';
import { Text } from '../../src/design/components/Text';
import { layout, space } from '../../src/design/tokens';
import { useExperiments } from '../../src/state/experiments';
import { useHistory } from '../../src/state/history';

/**
 * Experiments (§16–§19).
 *
 * The screen leads with running trials and personal insights, in that order,
 * because an insight is a hypothesis and a trial is how you test it. When there
 * is not enough data for either, it says so plainly instead of showing a chart
 * of nothing.
 */
export default function ExperimentsScreen() {
  const router = useRouter();
  const experiments = useExperiments((state) => state.experiments);
  const insights = useHistory((state) => state.insights)();
  const sessionsUntilInsights = useHistory((state) => state.sessionsUntilInsights)();
  const sessions = useHistory((state) => state.sessions);

  const running = experiments.filter((experiment) => experiment.status === 'running');
  const finished = experiments.filter((experiment) => experiment.status !== 'running');

  return (
    <Screen bottomInset={layout.transportHeight}>
      <ScreenHeader
        eyebrow="Trials"
        title="Personal experiments"
        subtitle="Compare two protocols against each other, blinded, in your own life."
        right={<ProfileButton />}
      />

      <HardwareButton
        label="New experiment"
        variant="primary"
        size="lg"
        onPress={() => router.push('/experiment/new')}
      />

      {running.length > 0 ? (
        <>
          <SectionHeader label="Running" />
          {running.map((experiment) => (
            <ExperimentCard
              key={experiment.id}
              experiment={experiment}
              onPress={() => router.push(`/experiment/${experiment.id}`)}
            />
          ))}
        </>
      ) : (
        <EmptyState
          title="No experiment running"
          message="A blinded A/B trial is the difference between noticing something and knowing it. Pick two protocols and the app will randomise which one you get each session."
        />
      )}

      {finished.length > 0 ? (
        <>
          <SectionHeader label="Finished" />
          {finished.map((experiment) => (
            <ExperimentCard
              key={experiment.id}
              experiment={experiment}
              onPress={() => router.push(`/experiment/${experiment.id}`)}
            />
          ))}
        </>
      ) : null}

      <SectionHeader label="Insights from your history" />
      {insights.length > 0 ? (
        insights.slice(0, 5).map((insight) => <InsightCard key={insight.id} insight={insight} />)
      ) : (
        <InstrumentPanel tone="flat">
          <Text variant="bodySm" tone="secondary">
            {sessions.length === 0
              ? 'Nothing here yet. Run and rate a few sessions and this becomes the most useful screen in the app.'
              : sessionsUntilInsights > 0
                ? `${sessionsUntilInsights} more rated session${sessionsUntilInsights === 1 ? '' : 's'} and patterns from your own history start appearing here. Below ${MIN_SESSIONS_FOR_INSIGHTS} ratings, anything shown would be noise.`
                : 'No pattern in your history is separated enough from chance to be worth reporting yet.'}
          </Text>
        </InstrumentPanel>
      )}

      <View style={styles.footnote}>
        <Text variant="caption" tone="tertiary">
          Everything here is an observation about you, from sessions you rated yourself. It is a
          correlation in a small sample, not a controlled clinical result, and it says nothing about
          anyone else.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footnote: { marginTop: space.md },
});
