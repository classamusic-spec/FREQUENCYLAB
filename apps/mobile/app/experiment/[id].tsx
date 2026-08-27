import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Line, Rect } from 'react-native-svg';
import {
  planNextSession,
  verifySchedule,
  type ArmResult,
  type ExperimentComparison,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel, PanelDivider, PanelRow } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { Label, Text } from '../../src/design/components/Text';
import { colors, radius, space } from '../../src/design/tokens';
import * as haptics from '../../src/design/haptics';
import { useExperiments } from '../../src/state/experiments';
import { useHistory } from '../../src/state/history';
import { useProtocolLibrary } from '../../src/state/library';
import { useSessionStart } from '../../src/state/sessionStart';
import { usePreferences } from '../../src/state/preferences';

/**
 * Experiment results (§18).
 *
 * Every number is shown with what qualifies it: the sample size next to the
 * mean, the spread next to the difference, the interval next to the effect, and
 * a list of the specific things that could explain the result other than the
 * protocols. A result that fails to separate is reported as failing to
 * separate — that is the finding, not a disappointment to be hidden.
 */
export default function ExperimentScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const experiment = useExperiments((state) => state.get(id));
  const results = useExperiments((state) => state.results);
  const unblind = useExperiments((state) => state.unblind);
  const abandon = useExperiments((state) => state.abandon);
  const sessions = useHistory((state) => state.sessions);
  const protocols = useProtocolLibrary((state) => state.protocols);
  const requestStart = useSessionStart((state) => state.request);
  const preferences = usePreferences((state) => state.preferences);

  const analysis = useMemo(
    () => (experiment ? results(experiment.id, sessions) : undefined),
    [experiment, results, sessions],
  );

  if (!experiment || !analysis) {
    return (
      <Screen>
        <ScreenHeader title="Experiment" subtitle="This experiment no longer exists." />
        <HardwareButton label="Back" onPress={() => router.back()} />
      </Screen>
    );
  }

  const plan = planNextSession(experiment);
  const scheduleValid = verifySchedule(experiment);
  const complete = analysis.completedSessions === analysis.totalSessions;

  const runNext = async () => {
    if (!plan) return;
    const protocol = protocols.find((candidate) => candidate.id === plan.protocolId);
    if (!protocol) return;
    haptics.confirm();
    // The assignment is marked complete by the player once a session record
    // actually exists — starting one is not the same as running one.
    await requestStart(protocol, {
      masterGain: preferences.comfortableOutputLevel,
      experiment: { experimentId: experiment.id, assignmentIndex: plan.index },
      onStarted: () => router.push('/session'),
    });
  };

  return (
    <Screen>
      <ScreenHeader
        eyebrow={experiment.blinded && !experiment.revealedAt ? 'Blinded trial' : 'Trial'}
        title={experiment.name}
        subtitle={`${analysis.completedSessions} of ${analysis.totalSessions} sessions complete`}
      />

      {!scheduleValid ? (
        <InstrumentPanel tone="flat" label="Integrity check failed">
          <Text variant="bodySm" tone="limit">
            The assignment schedule no longer matches its commitments. This experiment&apos;s results
            cannot be trusted and should be discarded.
          </Text>
        </InstrumentPanel>
      ) : null}

      {plan ? (
        <InstrumentPanel tone="raised" label="Next session">
          <Text variant="title">{plan.label}</Text>
          <Text variant="bodySm" tone="secondary" style={styles.paragraph}>
            {experiment.blinded && !plan.arm
              ? 'Which protocol runs is decided and sealed. You will not be told until the experiment is complete and you choose to reveal it.'
              : `Running ${protocols.find((candidate) => candidate.id === plan.protocolId)?.name ?? plan.protocolId}.`}
          </Text>
          <HardwareButton
            label="Start next session"
            variant="primary"
            size="lg"
            style={styles.action}
            onPress={runNext}
          />
        </InstrumentPanel>
      ) : (
        <InstrumentPanel tone="raised" label="Schedule complete">
          <Text variant="bodySm" tone="secondary">
            Every session in the schedule has been run.
            {experiment.revealedAt ? '' : ' Reveal the assignments to see which arm was which.'}
          </Text>
          {!experiment.revealedAt ? (
            <HardwareButton
              label="Reveal assignments"
              variant="primary"
              style={styles.action}
              onPress={() => {
                haptics.confirm();
                void unblind(experiment.id);
              }}
            />
          ) : null}
        </InstrumentPanel>
      )}

      {analysis.comparisons.map((comparison) => (
        <ComparisonPanel
          key={comparison.metric}
          comparison={comparison}
          revealed={experiment.revealedAt !== undefined || !experiment.blinded}
        />
      ))}

      <SectionHeader label="Schedule" />
      <InstrumentPanel tone="recessed">
        <View style={styles.scheduleGrid}>
          {experiment.assignments.map((assignment) => (
            <View
              key={assignment.index}
              style={[styles.scheduleCell, assignment.sessionId ? styles.scheduleCellDone : null]}
              accessible
              accessibilityLabel={`Session ${assignment.index + 1}, ${assignment.sessionId ? 'complete' : 'not run'}`}
            >
              <Text variant="readoutXs" tone={assignment.sessionId ? 'signal' : 'tertiary'}>
                {experiment.revealedAt || !experiment.blinded ? assignment.sealedArm : '?'}
              </Text>
            </View>
          ))}
        </View>
        <PanelDivider />
        <PanelRow label="Randomisation" value="Block, seeded" />
        <PanelRow label="Commitments" value={scheduleValid ? 'Verified' : 'Failed'} />
        <PanelRow label="Blinding" value={experiment.blinded ? 'On' : 'Off'} />
      </InstrumentPanel>

      {!complete ? (
        <HardwareButton
          label="Abandon experiment"
          variant="danger"
          onPress={() => {
            void abandon(experiment.id);
            router.back();
          }}
        />
      ) : null}
    </Screen>
  );
}

function ComparisonPanel({
  comparison,
  revealed,
}: {
  comparison: ExperimentComparison;
  revealed: boolean;
}) {
  const armA = comparison.arms.find((arm) => arm.arm === 'A');
  const armB = comparison.arms.find((arm) => arm.arm === 'B');
  const control = comparison.arms.find((arm) => arm.arm === 'control');

  return (
    <InstrumentPanel tone="flat" label={`Results · ${comparison.metric}`}>
      {!revealed ? (
        <Text variant="bodySm" tone="secondary" style={styles.paragraph}>
          Results stay sealed while the experiment is blind, so seeing them cannot influence the
          ratings you have left to give.
        </Text>
      ) : (
        <>
          <View style={styles.armRow}>
            {[armA, armB, control].filter(Boolean).map((arm) => (
              <ArmSummary key={arm!.arm} arm={arm!} />
            ))}
          </View>

          <PanelDivider />
          <PanelRow
            label="Difference (A − B)"
            value={`${comparison.difference >= 0 ? '+' : ''}${comparison.difference.toFixed(2)}`}
          />
          <PanelRow
            label="95% interval"
            value={
              comparison.confidenceInterval.low === 0 && comparison.confidenceInterval.high === 0
                ? 'Not enough data'
                : `${comparison.confidenceInterval.low.toFixed(2)} to ${comparison.confidenceInterval.high.toFixed(2)}`
            }
          />
          <PanelRow label="Effect size" value={comparison.effectSize.toFixed(2)} />
          <PanelRow label="p" value={comparison.p >= 1 ? '—' : comparison.p.toFixed(3)} />

          <PanelDivider />
          <Text variant="bodySm" tone="secondary">
            {comparison.interpretation}
          </Text>

          {comparison.caveats.length > 0 ? (
            <>
              <PanelDivider />
              <Label tone="warning">What could explain this instead</Label>
              {comparison.caveats.map((caveat, index) => (
                <Text key={index} variant="caption" tone="tertiary" style={styles.caveat}>
                  · {caveat}
                </Text>
              ))}
            </>
          ) : null}

          {armA && armB ? <TimeOfDayChart armA={armA} armB={armB} /> : null}
        </>
      )}
    </InstrumentPanel>
  );
}

function ArmSummary({ arm }: { arm: ArmResult }) {
  return (
    <View style={styles.armColumn}>
      <Label tone={arm.arm === 'control' ? 'tertiary' : 'signal'}>
        {arm.arm === 'control' ? 'Control' : `Protocol ${arm.arm}`}
      </Label>
      <Text variant="readoutLg">{arm.summary.n > 0 ? arm.summary.mean.toFixed(1) : '—'}</Text>
      <Text variant="caption" tone="tertiary">
        n = {arm.summary.n}
      </Text>
      <Text variant="caption" tone="tertiary">
        sd {arm.summary.sd.toFixed(2)}
      </Text>
      <Text variant="caption" tone="tertiary">
        {Math.round(arm.meanAdherence * 100)}% completed
      </Text>
    </View>
  );
}

/** Session start hours per arm — the confound most likely to be doing the work. */
function TimeOfDayChart({ armA, armB }: { armA: ArmResult; armB: ArmResult }) {
  const width = 280;
  const height = 60;
  const buckets = 24;
  const countsA = new Array(buckets).fill(0);
  const countsB = new Array(buckets).fill(0);
  for (const hour of armA.hours) countsA[hour % buckets]++;
  for (const hour of armB.hours) countsB[hour % buckets]++;
  const max = Math.max(1, ...countsA, ...countsB);
  const barWidth = width / buckets;

  return (
    <View style={styles.chart}>
      <Label>Time of day</Label>
      <Svg width={width} height={height}>
        <Line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={colors.hairline} strokeWidth={1} />
        {countsA.map((count, hour) => (
          <Rect
            key={`a-${hour}`}
            x={hour * barWidth + 1}
            y={height / 2 - (count / max) * (height / 2 - 2)}
            width={barWidth - 2}
            height={(count / max) * (height / 2 - 2)}
            fill={colors.signal}
            opacity={0.85}
          />
        ))}
        {countsB.map((count, hour) => (
          <Rect
            key={`b-${hour}`}
            x={hour * barWidth + 1}
            y={height / 2}
            width={barWidth - 2}
            height={(count / max) * (height / 2 - 2)}
            fill={colors.warning}
            opacity={0.85}
          />
        ))}
      </Svg>
      <View style={styles.chartLegend}>
        <Label tone="signal">A above</Label>
        <Label tone="warning">B below</Label>
        <Label>00:00 — 23:00</Label>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  paragraph: { marginTop: space.xs },
  action: { marginTop: space.lg },
  armRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  armColumn: { flex: 1, gap: 2 },
  caveat: { marginTop: space.xxs },
  scheduleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  scheduleCell: {
    width: 34,
    height: 34,
    borderRadius: radius.engraved,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRecessed,
  },
  scheduleCellDone: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.signalDim,
  },
  chart: { marginTop: space.lg, gap: space.xs, alignItems: 'flex-start' },
  chartLegend: { flexDirection: 'row', gap: space.md },
});
