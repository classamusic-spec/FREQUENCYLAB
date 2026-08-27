import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BUILT_IN_METRICS, formatClock, type MetricKey } from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { SegmentSelector } from '../../src/design/components/SegmentSelector';
import { Label, Text } from '../../src/design/components/Text';
import { colors, radius, space } from '../../src/design/tokens';
import * as haptics from '../../src/design/haptics';
import { useExperiments } from '../../src/state/experiments';
import { useProtocolLibrary, summarise } from '../../src/state/library';

/**
 * Creating an experiment (§17).
 *
 * The control arm is offered but not forced, and the copy explains what it is
 * for: the same ambient environment without the parameter under test, so a
 * difference cannot be attributed to "having listened to something".
 */
/** Ids are generated outside the component so nothing impure runs in render. */
function newExperimentId(): string {
  return `experiment-${Date.now().toString(36)}`;
}

export default function NewExperimentScreen() {
  const router = useRouter();
  const protocols = useProtocolLibrary((state) => state.protocols);
  const create = useExperiments((state) => state.create);

  const [protocolA, setProtocolA] = useState<string | null>(null);
  const [protocolB, setProtocolB] = useState<string | null>(null);
  const [useControl, setUseControl] = useState(false);
  const [protocolControl, setProtocolControl] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricKey[]>(['relaxation']);
  const [sessionsPerArm, setSessionsPerArm] = useState(6);

  const summaries = useMemo(() => protocols.map(summarise), [protocols]);
  const ready = protocolA !== null && protocolB !== null && protocolA !== protocolB && metrics.length > 0;

  const start = async () => {
    if (!ready) return;
    const experiment = await create({
      id: newExperimentId(),
      name: `${nameOf(protocolA)} vs ${nameOf(protocolB)}`,
      protocolA: protocolA!,
      protocolB: protocolB!,
      protocolControl: useControl ? (protocolControl ?? undefined) : undefined,
      metrics,
      sessionsPerArm,
      blinded: true,
    });
    haptics.confirm();
    router.replace(`/experiment/${experiment.id}`);
  };

  function nameOf(id: string | null): string {
    return summaries.find((entry) => entry.id === id)?.name ?? '—';
  }

  return (
    <Screen>
      <ScreenHeader
        eyebrow="New experiment"
        title="Compare two protocols"
        subtitle="The app randomises which one runs each session and hides it until the end."
      />

      <SectionHeader label="Protocol A" />
      <ProtocolPicker
        protocols={summaries}
        selected={protocolA}
        onSelect={setProtocolA}
        excluded={[protocolB, protocolControl]}
      />

      <SectionHeader label="Protocol B" />
      <ProtocolPicker
        protocols={summaries}
        selected={protocolB}
        onSelect={setProtocolB}
        excluded={[protocolA, protocolControl]}
      />

      <SectionHeader label="Control arm" />
      <InstrumentPanel tone="flat">
        <Text variant="bodySm" tone="secondary">
          A control runs the same ambient environment — usually just the noise bed — without the
          stimulation you are testing. It is what separates &quot;this protocol works for me&quot;
          from &quot;sitting quietly for twenty-five minutes works for me&quot;.
        </Text>
        <SegmentSelector
          style={styles.controlToggle}
          accessibilityLabel="Include a control arm"
          options={[
            { value: 'no', label: 'No control' },
            { value: 'yes', label: 'Add control' },
          ]}
          value={useControl ? 'yes' : 'no'}
          onChange={(value) => setUseControl(value === 'yes')}
        />
      </InstrumentPanel>
      {useControl ? (
        <ProtocolPicker
          protocols={summaries}
          selected={protocolControl}
          onSelect={setProtocolControl}
          excluded={[protocolA, protocolB]}
        />
      ) : null}

      <SectionHeader label="What are you measuring?" />
      <View style={styles.metricGrid}>
        {BUILT_IN_METRICS.map((metric) => {
          const selected = metrics.includes(metric.key);
          return (
            <Pressable
              key={metric.key}
              onPress={() => {
                haptics.engage();
                setMetrics((current) =>
                  selected ? current.filter((entry) => entry !== metric.key) : [...current, metric.key],
                );
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={metric.label}
              style={[styles.metricChip, selected ? styles.metricChipOn : null]}
            >
              <Text variant="bodySm" tone={selected ? 'signal' : 'secondary'}>
                {metric.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <SectionHeader label="Sessions per arm" />
      <SegmentSelector
        accessibilityLabel="Sessions per arm"
        options={[4, 6, 8, 10].map((value) => ({ value: String(value), label: String(value) }))}
        value={String(sessionsPerArm)}
        onChange={(value) => setSessionsPerArm(Number.parseInt(value, 10))}
      />
      <Text variant="caption" tone="tertiary">
        {sessionsPerArm * (useControl ? 3 : 2)} sessions in total. Below five per arm the app will
        show the numbers but refuse to draw a conclusion from them.
      </Text>

      <HardwareButton
        label="Start experiment"
        variant="primary"
        size="lg"
        disabled={!ready}
        onPress={start}
      />
    </Screen>
  );
}

function ProtocolPicker({
  protocols,
  selected,
  onSelect,
  excluded = [],
}: {
  protocols: ReturnType<typeof summarise>[];
  selected: string | null;
  onSelect: (id: string) => void;
  excluded?: (string | null)[];
}) {
  return (
    <View style={styles.pickerList}>
      {protocols.map((protocol) => {
        const disabled = excluded.includes(protocol.id);
        const isSelected = selected === protocol.id;
        return (
          <Pressable
            key={protocol.id}
            disabled={disabled}
            onPress={() => {
              haptics.engage();
              onSelect(protocol.id);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected, disabled }}
            accessibilityLabel={protocol.name}
            style={[
              styles.pickerRow,
              isSelected ? styles.pickerRowSelected : null,
              disabled ? styles.pickerRowDisabled : null,
            ]}
          >
            <View style={styles.pickerText}>
              <Text variant="bodySm" tone={isSelected ? 'primary' : 'secondary'} numberOfLines={1}>
                {protocol.name}
              </Text>
              <Label>{protocol.humanDna}</Label>
            </View>
            <Text variant="readoutXs" tone="tertiary">
              {formatClock(protocol.durationSec)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  controlToggle: { marginTop: space.md },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  metricChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRecessed,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  metricChipOn: { borderColor: colors.signalDim, backgroundColor: colors.surfaceRaised },
  pickerList: { gap: space.xs },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    gap: space.md,
    minHeight: 56,
  },
  pickerRowSelected: { borderColor: colors.signalDim, backgroundColor: colors.surfaceRaised },
  pickerRowDisabled: { opacity: 0.35 },
  pickerText: { flex: 1, gap: 2 },
});
