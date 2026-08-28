import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  NODE_DESCRIPTORS,
  encodeDnaString,
  formatClock,
  protocolDna,
  totalDurationSec,
  validateProtocol,
  verifyDna,
  type Protocol,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel, PanelDivider, PanelRow } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { SegmentSelector } from '../../src/design/components/SegmentSelector';
import { SignalFlowView } from '../../src/design/components/SignalFlowView';
import { Tag } from '../../src/design/components/Badges';
import { ShareCodeCard } from '../../src/design/components/ShareCodeCard';
import { ChevronIcon } from '../../src/design/components/Icons';
import { Label, Text } from '../../src/design/components/Text';
import { colors, space } from '../../src/design/tokens';
import * as haptics from '../../src/design/haptics';
import { confirm, notify } from '../../src/design/dialogs';
import { useProtocolLibrary } from '../../src/state/library';
import { useLab } from '../../src/state/lab';
import { useSessionStart } from '../../src/state/sessionStart';
import { usePreferences } from '../../src/state/preferences';
import { estimateBytes, exportDnaFile, exportProtocolToWav, formatBytes, share } from '../../src/features/export';

const EXPORT_LENGTHS = [
  { value: '60', label: '1 min' },
  { value: '180', label: '3 min' },
  { value: '300', label: '5 min' },
  { value: 'full', label: 'Full' },
];

/**
 * Protocol detail.
 *
 * The whole configuration, laid out so it can be read rather than merely
 * displayed: what runs in each stage, how the signal is routed, what the DNA
 * is, and where this protocol came from.
 */
export default function ProtocolScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const protocol = useProtocolLibrary((state) => state.get(id));
  const lineageOf = useProtocolLibrary((state) => state.lineageOf);
  const fork = useProtocolLibrary((state) => state.fork);
  const remove = useProtocolLibrary((state) => state.remove);
  const openInLab = useLab((state) => state.open);
  const requestStart = useSessionStart((state) => state.request);
  const preferences = usePreferences((state) => state.preferences);

  const [stageIndex, setStageIndex] = useState(0);
  const [exportLength, setExportLength] = useState('180');
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const dna = useMemo(() => (protocol ? protocolDna(protocol) : undefined), [protocol]);
  const [showTechnical, setShowTechnical] = useState(false);
  const validation = useMemo(() => (protocol ? validateProtocol(protocol) : undefined), [protocol]);
  const lineage = useMemo(() => (protocol ? lineageOf(protocol.id) : []), [lineageOf, protocol]);

  if (!protocol || !dna) {
    return (
      <Screen>
        <ScreenHeader title="Protocol" subtitle="This protocol no longer exists." />
        <HardwareButton label="Back" onPress={() => router.back()} />
      </Screen>
    );
  }

  const stage = protocol.stages[stageIndex];
  const verification = verifyDna(protocol, dna.fingerprint);
  const exportSeconds =
    exportLength === 'full' ? totalDurationSec(protocol) : Number.parseInt(exportLength, 10);
  const estimated = estimateBytes(exportSeconds, protocol.sampleRate, 16);

  const runExport = async () => {
    setExporting(true);
    setProgress(0);
    try {
      const result = await exportProtocolToWav(protocol, {
        bitDepth: 16,
        maxSeconds: exportSeconds,
        onProgress: setProgress,
      });
      haptics.confirm();
      await share(result.uri, 'audio/wav', result.filename);
    } catch (error) {
      notify('Export failed', error instanceof Error ? error.message : 'Unknown error.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        eyebrow={protocol.meta.generatedBy === 'ai' ? 'AI generated' : 'Protocol'}
        title={protocol.name}
        subtitle={protocol.description}
      />

      <View style={styles.metaRow}>
        <Tag label={`${protocol.stages.length} stages`} />
        <Tag label={formatClock(totalDurationSec(protocol))} />
        <Tag label={`v${protocol.meta.version}`} />
        <Tag label={`${protocol.sampleRate / 1000} kHz`} />
      </View>

      <View style={styles.actionRow}>
        <HardwareButton
          label="Play"
          variant="primary"
          style={styles.actionButton}
          disabled={!validation?.ok}
          onPress={async () => {
            await requestStart(protocol, {
              masterGain: preferences.comfortableOutputLevel,
              onStarted: () => router.push('/session'),
            });
          }}
        />
        <HardwareButton
          label="Open in Lab"
          style={styles.actionButton}
          onPress={() => {
            openInLab(protocol);
            router.push('/lab');
          }}
        />
      </View>

      <SectionHeader label="Share" />
      <ShareCodeCard
        protocol={protocol}
        onShareFile={async () => {
          const result = await exportDnaFile(protocol);
          await share(result.uri, 'application/json', result.filename);
        }}
      />

      {/* The fingerprint and engine versions are what actually prove two
          protocols are identical, but almost nobody needs them — they sit
          behind a disclosure so the share code is what the screen is about. */}
      <Pressable
        onPress={() => setShowTechnical((current) => !current)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showTechnical }}
        accessibilityLabel="Technical identity"
        style={styles.disclosure}
      >
        <Label tone={showTechnical ? 'signal' : 'tertiary'}>Technical identity</Label>
        <ChevronIcon
          direction={showTechnical ? 'up' : 'down'}
          size={16}
          color={showTechnical ? colors.signal : colors.textTertiary}
        />
      </Pressable>

      {showTechnical ? (
        <InstrumentPanel tone="recessed">
          <PanelRow label="Summary" value={dna.human} />
          <PanelRow label="Short id" value={dna.shortFingerprint} />
          <PanelRow label="Engine" value={dna.dspVersion} />
          <PanelRow label="Schema" value={`v${dna.schemaVersion}`} />
          <PanelDivider />
          <Label>Fingerprint</Label>
          <Text variant="readoutXs" tone="tertiary" style={styles.fingerprint}>
            {dna.fingerprint}
          </Text>
          <HardwareButton
            label="Copy full DNA"
            size="sm"
            variant="ghost"
            style={styles.fullDnaButton}
            onPress={() => {
              void Clipboard.setStringAsync(encodeDnaString(protocol));
              haptics.confirm();
              notify(
                'Full DNA copied',
                'This is the complete, lossless form — thousands of characters. For sending to someone, the share code above is the same protocol in one line.',
              );
            }}
          />
          <PanelDivider />
          <View style={styles.verifyRow}>
            <Label tone={verification.matches ? 'signal' : 'limit'}>
              {verification.matches ? 'Verified' : 'Fingerprint mismatch'}
            </Label>
            {verification.note ? (
              <Text variant="caption" tone="warning" style={styles.verifyNote}>
                {verification.note}
              </Text>
            ) : (
              <Text variant="caption" tone="tertiary" style={styles.verifyNote}>
                The configuration hashes to its recorded fingerprint, so this will render exactly as
                it did when it was made.
              </Text>
            )}
          </View>
        </InstrumentPanel>
      ) : null}

      <SectionHeader label="Stages" />
      {protocol.stages.length > 1 ? (
        <SegmentSelector
          scrollable
          accessibilityLabel="Stage"
          options={protocol.stages.map((entry, index) => ({ value: String(index), label: entry.name }))}
          value={String(stageIndex)}
          onChange={(value) => setStageIndex(Number.parseInt(value, 10))}
        />
      ) : null}

      {stage ? (
        <InstrumentPanel tone="flat" label={stage.name}>
          <PanelRow label="Duration" value={formatClock(stage.durationSec)} />
          <PanelRow label="Cross-fade in" value={`${stage.crossfadeSec.toFixed(1)} s`} />
          <PanelDivider />
          {stage.graph.nodes
            .filter((node) => node.kind !== 'output')
            .map((node) => (
              <View key={node.id} style={styles.moduleRow}>
                <Label>{NODE_DESCRIPTORS[node.kind].shortLabel}</Label>
                <Text variant="readoutSm" tone="secondary" numberOfLines={2} style={styles.moduleValue}>
                  {describeNode(node)}
                </Text>
              </View>
            ))}
          {stage.automation.length > 0 ? (
            <>
              <PanelDivider />
              <Label>Automation</Label>
              {stage.automation.map((lane) => (
                <Text key={lane.id} variant="caption" tone="tertiary">
                  {lane.target}: {lane.points.map((point) => point.value.toFixed(2)).join(' → ')}
                </Text>
              ))}
            </>
          ) : null}
        </InstrumentPanel>
      ) : null}

      {stage ? (
        <InstrumentPanel tone="recessed" label="Signal path" bare>
          <View style={styles.flow}>
            <SignalFlowView graph={stage.graph} />
          </View>
        </InstrumentPanel>
      ) : null}

      {lineage.length > 1 ? (
        <>
          <SectionHeader label="Lineage" />
          <InstrumentPanel tone="flat">
            {lineage.map((entry, index) => (
              <Pressable
                key={entry.id}
                onPress={() => router.push(`/protocol/${entry.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${entry.name}`}
                style={styles.lineageRow}
              >
                <View style={styles.lineageMarker}>
                  <View style={[styles.lineageDot, entry.id === protocol.id ? styles.lineageDotActive : null]} />
                  {index < lineage.length - 1 ? <View style={styles.lineageLine} /> : null}
                </View>
                <View style={styles.lineageText}>
                  <Text variant="bodySm" tone={entry.id === protocol.id ? 'primary' : 'secondary'}>
                    {entry.name}
                  </Text>
                  <Label>{protocolDna(entry).human}</Label>
                </View>
              </Pressable>
            ))}
            {lineage.length > 1 ? (
              <>
                <PanelDivider />
                <Label>Changes from the previous version</Label>
                {diffLineage(lineage, protocol).map((line, index) => (
                  <Text key={index} variant="caption" tone="tertiary">
                    {line}
                  </Text>
                ))}
              </>
            ) : null}
          </InstrumentPanel>
        </>
      ) : null}

      <SectionHeader label="Reference export" />
      <InstrumentPanel tone="flat">
        <Text variant="bodySm" tone="secondary">
          Renders this protocol to a 16-bit WAV with the full DNA document embedded in its metadata,
          so the file can be verified against the protocol that produced it.
        </Text>
        <SegmentSelector
          style={styles.exportSelector}
          accessibilityLabel="Export length"
          options={EXPORT_LENGTHS}
          value={exportLength}
          onChange={setExportLength}
        />
        <Text variant="caption" tone={estimated > 100 * 1024 * 1024 ? 'warning' : 'tertiary'}>
          About {formatBytes(estimated)}
          {estimated > 100 * 1024 * 1024 ? ' — large files can take a while and may fail on a low-memory device.' : ''}
        </Text>
        {exporting ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        ) : null}
        <HardwareButton
          label={exporting ? `Rendering ${Math.round(progress * 100)}%` : 'Export WAV'}
          size="sm"
          loading={exporting}
          style={styles.exportButton}
          onPress={runExport}
        />
      </InstrumentPanel>

      <View style={styles.footerActions}>
        <HardwareButton
          label="Fork"
          style={styles.actionButton}
          onPress={async () => {
            const forked = await fork(protocol.id);
            if (forked) router.replace(`/protocol/${forked.id}`);
          }}
        />
        <HardwareButton
          label="Delete"
          variant="danger"
          style={styles.actionButton}
          onPress={async () => {
            const agreed = await confirm({
              title: 'Delete protocol?',
              message: `"${protocol.name}" will be removed from this device.`,
              confirmLabel: 'Delete',
              destructive: true,
            });
            if (!agreed) return;
            await remove(protocol.id);
            router.back();
          }}
        />
      </View>
    </Screen>
  );
}

function describeNode(node: Protocol['stages'][number]['graph']['nodes'][number]): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(node.params)) {
    if (value === 0 && key !== 'level') continue;
    parts.push(`${key} ${formatParam(key, value)}`);
  }
  for (const [key, value] of Object.entries(node.options)) parts.push(`${key} ${value}`);
  return parts.join(' · ');
}

function formatParam(key: string, value: number): string {
  if (key.includes('carrier') || key.includes('freq') || key === 'beat' || key === 'pulse' || key === 'cutoff') {
    return `${value.toFixed(2)} Hz`;
  }
  return value.toFixed(3);
}

/** A readable diff between the two most recent versions in a lineage. */
function diffLineage(lineage: Protocol[], current: Protocol): string[] {
  const index = lineage.findIndex((entry) => entry.id === current.id);
  const previous = index > 0 ? lineage[index - 1] : undefined;
  if (!previous) return ['This is the original.'];

  const lines: string[] = [];
  const before = previous.stages[0]?.graph.nodes.find((node) => node.id === 'tone');
  const after = current.stages[0]?.graph.nodes.find((node) => node.id === 'tone');
  if (before && after) {
    for (const key of ['carrier', 'beat', 'pulse', 'amplitude']) {
      const a = before.params[key];
      const b = after.params[key];
      if (a !== undefined && b !== undefined && Math.abs(a - b) > 1e-6) {
        lines.push(`${key}: ${a.toFixed(2)} → ${b.toFixed(2)}`);
      }
    }
  }
  const beforeDuration = totalDurationSec(previous);
  const afterDuration = totalDurationSec(current);
  if (beforeDuration !== afterDuration) {
    lines.push(`duration: ${formatClock(beforeDuration)} → ${formatClock(afterDuration)}`);
  }
  if (previous.stages.length !== current.stages.length) {
    lines.push(`stages: ${previous.stages.length} → ${current.stages.length}`);
  }
  return lines.length > 0 ? lines : ['No audible parameters changed between these versions.'];
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  actionRow: { flexDirection: 'row', gap: space.sm },
  actionButton: { flex: 1 },
  dnaActions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  disclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  fullDnaButton: { marginTop: space.md },
  fingerprint: { marginTop: space.sm },
  verifyRow: { gap: space.xxs },
  verifyNote: { marginTop: space.xxs },
  moduleRow: { paddingVertical: space.xs, gap: 2 },
  moduleValue: { marginTop: 2 },
  flow: { paddingHorizontal: space.lg, paddingBottom: space.md },
  lineageRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.xs },
  lineageMarker: { alignItems: 'center', width: 12 },
  lineageDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh, marginTop: 5 },
  lineageDotActive: { backgroundColor: colors.signal },
  lineageLine: { flex: 1, width: StyleSheet.hairlineWidth, backgroundColor: colors.hairlineStrong },
  lineageText: { flex: 1, gap: 2 },
  exportSelector: { marginTop: space.md },
  exportButton: { marginTop: space.md, alignSelf: 'flex-start' },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.surfaceRecessed,
    overflow: 'hidden',
    marginTop: space.md,
  },
  progressFill: { height: 3, backgroundColor: colors.signal },
  footerActions: { flexDirection: 'row', gap: space.sm },
});
