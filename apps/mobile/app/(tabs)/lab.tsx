import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  NODE_DESCRIPTORS,
  NODE_KINDS,
  formatClock,
  getDescriptor,
  parseParamAddress,
  type NodeKind,
} from '@frequencylab/dsp-core';
import { EmptyState, Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel, PanelDivider } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { SegmentSelector } from '../../src/design/components/SegmentSelector';
import { ParameterControl } from '../../src/design/components/ParameterControl';
import { SignalFlowView } from '../../src/design/components/SignalFlowView';
import { ProtocolCard } from '../../src/design/components/Cards';
import { DnaChip, Tag } from '../../src/design/components/Badges';
import { Oscilloscope, SpectrumAnalyzer } from '../../src/design/components/Visualizers';
import { Label, Text } from '../../src/design/components/Text';
import { colors, layout, radius, space } from '../../src/design/tokens';
import * as haptics from '../../src/design/haptics';
import { useLab } from '../../src/state/lab';
import { useProtocolLibrary, summarise } from '../../src/state/library';
import { usePlayer, useScopeCapture } from '../../src/state/player';
import { useSessionStart } from '../../src/state/sessionStart';
import { usePreferences } from '../../src/state/preferences';

/**
 * Lab Mode (§5).
 *
 * The rack is the whole DSP system with nothing hidden: every module the engine
 * can instantiate, every parameter the descriptors declare, and the routing that
 * connects them. It edits the same protocol object Simple Mode compiles, which
 * is why a session started from Home can be opened here and taken apart.
 */
export default function LabScreen() {
  const router = useRouter();
  const draft = useLab((state) => state.draft);
  const open = useLab((state) => state.open);
  const createBlank = useLab((state) => state.createBlank);
  const protocols = useProtocolLibrary((state) => state.protocols);

  if (!draft) {
    return (
      <Screen bottomInset={layout.transportHeight}>
        <ScreenHeader
          eyebrow="Lab"
          title="Workspace"
          subtitle="Open a protocol to take it apart, or start from a blank rack."
        />
        <View style={styles.actionRow}>
          <HardwareButton
            label="New protocol"
            variant="primary"
            style={styles.actionButton}
            onPress={() => {
              createBlank();
              haptics.confirm();
            }}
          />
          <HardwareButton
            label="Import DNA"
            style={styles.actionButton}
            onPress={() => router.push('/dna-import')}
          />
        </View>

        <SectionHeader label="Your protocols" />
        {protocols.length === 0 ? (
          <EmptyState
            title="No protocols yet"
            message="Presets are installed on first launch. If you cleared your data, create a new protocol to start again."
          />
        ) : (
          protocols.map((protocol) => (
            <ProtocolCard
              key={protocol.id}
              protocol={summarise(protocol)}
              onPress={() => {
                open(protocol);
                haptics.engage();
              }}
            />
          ))
        )}
      </Screen>
    );
  }

  return <LabWorkspace />;
}

function LabWorkspace() {
  const router = useRouter();
  const draft = useLab((state) => state.draft)!;
  const stageIndex = useLab((state) => state.stageIndex);
  const selectedNodeId = useLab((state) => state.selectedNodeId);
  const selectStage = useLab((state) => state.selectStage);
  const selectNode = useLab((state) => state.selectNode);
  const setParam = useLab((state) => state.setParam);
  const setOption = useLab((state) => state.setOption);
  const addNode = useLab((state) => state.addNode);
  const removeNode = useLab((state) => state.removeNode);
  const toggleBypass = useLab((state) => state.toggleBypass);
  const connect = useLab((state) => state.connect);
  const disconnect = useLab((state) => state.disconnect);
  const close = useLab((state) => state.close);
  const issues = useLab((state) => state.issues);
  const dna = useLab((state) => state.dna);

  const saveProtocol = useProtocolLibrary((state) => state.save);
  const requestStart = useSessionStart((state) => state.request);
  const stopPlayback = usePlayer((state) => state.stop);
  const snapshot = usePlayer((state) => state.snapshot);
  const preferences = usePreferences((state) => state.preferences);

  const [showAddModule, setShowAddModule] = useState(false);
  const [showRouting, setShowRouting] = useState(false);

  const stage = draft.stages[stageIndex];
  const graph = stage?.graph;
  const auditioning = snapshot.state === 'playing' && snapshot.protocolId === draft.id;
  const capture = useScopeCapture(20, auditioning);
  const validation = issues();
  const errors = validation.filter((issue) => issue.severity === 'error');
  const warnings = validation.filter((issue) => issue.severity === 'warning');
  const fingerprint = dna();

  const automatedParams = useMemo(() => {
    const set = new Set<string>();
    for (const lane of stage?.automation ?? []) set.add(lane.target);
    return set;
  }, [stage?.automation]);

  const audition = useCallback(async () => {
    if (auditioning) {
      await stopPlayback();
      return;
    }
    // Auditions start at the selected stage, not at the top of the protocol:
    // waiting five minutes to hear the stage you are editing is not workable.
    let offset = 0;
    for (let i = 0; i < stageIndex; i++) offset += draft.stages[i].durationSec;
    await requestStart(draft, {
      masterGain: preferences.comfortableOutputLevel,
      onStarted: () => usePlayer.getState().seek(offset),
    });
  }, [auditioning, draft, preferences.comfortableOutputLevel, requestStart, stageIndex, stopPlayback]);

  if (!stage || !graph) return null;

  return (
    <Screen bottomInset={layout.transportHeight}>
      <ScreenHeader
        eyebrow="Lab"
        title={draft.name}
        subtitle={`${draft.stages.length} stage${draft.stages.length === 1 ? '' : 's'} · ${formatClock(
          draft.stages.reduce((sum, entry) => sum + entry.durationSec, 0),
        )}`}
        right={
          <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close workspace">
            <Label>Close</Label>
          </Pressable>
        }
      />

      {errors.length > 0 ? (
        <InstrumentPanel tone="flat" label="Cannot play">
          {errors.slice(0, 3).map((issue, index) => (
            <Text key={index} variant="bodySm" tone="limit">
              {issue.message}
            </Text>
          ))}
        </InstrumentPanel>
      ) : null}

      {draft.stages.length > 1 ? (
        <SegmentSelector
          scrollable
          accessibilityLabel="Stage"
          options={draft.stages.map((entry, index) => ({ value: String(index), label: entry.name }))}
          value={String(stageIndex)}
          onChange={(value) => selectStage(Number.parseInt(value, 10))}
        />
      ) : null}

      <InstrumentPanel tone="recessed" label="Signal path" bare>
        <View style={styles.flow}>
          <SignalFlowView graph={graph} selectedNodeId={selectedNodeId} onSelect={selectNode} />
        </View>
      </InstrumentPanel>

      {auditioning ? (
        <InstrumentPanel tone="recessed" label="Live output" bare>
          <View style={styles.scopes}>
            <Oscilloscope samples={capture?.left ?? null} samplesRight={capture?.right ?? null} height={72} />
            <SpectrumAnalyzer bins={capture?.spectrum ?? null} sampleRate={capture?.sampleRate} height={90} />
          </View>
        </InstrumentPanel>
      ) : null}

      <View style={styles.actionRow}>
        <HardwareButton
          label={auditioning ? 'Stop' : 'Audition'}
          variant={auditioning ? 'danger' : 'primary'}
          style={styles.actionButton}
          disabled={errors.length > 0}
          onPress={audition}
        />
        <HardwareButton
          label="Timeline"
          style={styles.actionButton}
          onPress={() => router.push(`/builder/${draft.id}`)}
        />
      </View>

      <SectionHeader
        label="Modules"
        right={
          <Pressable onPress={() => setShowAddModule((value) => !value)} hitSlop={10}>
            <Label tone="signal">{showAddModule ? 'Done' : 'Add module'}</Label>
          </Pressable>
        }
      />

      {showAddModule ? (
        <InstrumentPanel tone="flat">
          <View style={styles.moduleGrid}>
            {NODE_KINDS.filter((kind) => kind !== 'output').map((kind) => (
              <Pressable
                key={kind}
                onPress={() => {
                  haptics.engage();
                  const id = addNode(kind as NodeKind);
                  if (id) connect(id, 'output');
                  setShowAddModule(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Add ${NODE_DESCRIPTORS[kind].label}`}
                style={styles.moduleChip}
              >
                <Label tone="tertiary">{NODE_DESCRIPTORS[kind].shortLabel}</Label>
                <Text variant="caption" tone="secondary">
                  {NODE_DESCRIPTORS[kind].label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text variant="caption" tone="tertiary" style={styles.moduleHint}>
            New modules are wired straight to the output. Use Routing to change where they go.
          </Text>
        </InstrumentPanel>
      ) : null}

      {graph.nodes
        .filter((node) => node.kind !== 'output')
        .map((node) => {
          const descriptor = getDescriptor(node.kind);
          const expanded = selectedNodeId === node.id;
          return (
            <InstrumentPanel
              key={node.id}
              tone={expanded ? 'raised' : 'flat'}
              label={descriptor.shortLabel}
              headerRight={
                <View style={styles.moduleHeaderActions}>
                  {node.bypass ? <Tag label="Bypassed" /> : null}
                  <Pressable onPress={() => selectNode(expanded ? null : node.id)} hitSlop={8}>
                    <Label tone={expanded ? 'signal' : 'tertiary'}>{expanded ? 'Collapse' : 'Edit'}</Label>
                  </Pressable>
                </View>
              }
            >
              <Text variant="heading">{node.label ?? descriptor.label}</Text>
              <Text variant="caption" tone="tertiary" style={styles.moduleDescription}>
                {descriptor.description}
              </Text>

              {expanded ? (
                <>
                  <PanelDivider />
                  {descriptor.options.map((option) => (
                    <View key={option.key} style={styles.optionRow}>
                      <Label>{option.label}</Label>
                      <SegmentSelector
                        scrollable
                        size="sm"
                        style={styles.optionSegment}
                        accessibilityLabel={option.label}
                        options={option.values.map((value) => ({ value, label: value }))}
                        value={node.options[option.key] ?? option.default}
                        onChange={(value) => setOption(node.id, option.key, value)}
                      />
                    </View>
                  ))}

                  {descriptor.params.map((param) => (
                    <ParameterControl
                      key={param.key}
                      descriptor={param}
                      value={node.params[param.key] ?? param.default}
                      automated={automatedParams.has(`${node.id}:${param.key}`)}
                      onChange={(value) => setParam(node.id, param.key, value)}
                    />
                  ))}

                  <PanelDivider />
                  <View style={styles.moduleFooter}>
                    <HardwareButton
                      label={node.bypass ? 'Enable' : 'Bypass'}
                      size="sm"
                      variant="ghost"
                      onPress={() => toggleBypass(node.id)}
                    />
                    <HardwareButton
                      label="Remove"
                      size="sm"
                      variant="danger"
                      onPress={() => removeNode(node.id)}
                    />
                  </View>
                </>
              ) : null}
            </InstrumentPanel>
          );
        })}

      <SectionHeader
        label="Routing"
        right={
          <Pressable onPress={() => setShowRouting((value) => !value)} hitSlop={10}>
            <Label tone="signal">{showRouting ? 'Done' : 'Edit'}</Label>
          </Pressable>
        }
      />
      {showRouting ? (
        <InstrumentPanel tone="flat">
          {graph.connections.map((connection) => (
            <View key={`${connection.from}->${connection.to}`} style={styles.connectionRow}>
              <Text variant="readoutSm" tone="secondary">
                {connection.from} → {connection.to}
              </Text>
              <Pressable
                onPress={() => disconnect(connection.from, connection.to)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Disconnect ${connection.from} from ${connection.to}`}
              >
                <Label tone="warning">Disconnect</Label>
              </Pressable>
            </View>
          ))}
          <PanelDivider />
          <Text variant="caption" tone="tertiary">
            Connect a module by selecting it above, then choosing a destination. Invalid
            combinations — feedback loops, feeding a generator — are refused before they can play.
          </Text>
          {selectedNodeId ? (
            <View style={styles.connectTargets}>
              {graph.nodes
                .filter(
                  (node) =>
                    node.id !== selectedNodeId &&
                    getDescriptor(node.kind).maxInputs > 0 &&
                    !graph.connections.some(
                      (connection) => connection.from === selectedNodeId && connection.to === node.id,
                    ),
                )
                .map((node) => (
                  <HardwareButton
                    key={node.id}
                    size="sm"
                    variant="ghost"
                    label={`→ ${getDescriptor(node.kind).shortLabel}`}
                    onPress={() => connect(selectedNodeId, node.id)}
                  />
                ))}
            </View>
          ) : null}
        </InstrumentPanel>
      ) : null}

      {stage.automation.length > 0 ? (
        <>
          <SectionHeader label="Automation in this stage" />
          <InstrumentPanel tone="flat">
            {stage.automation.map((lane) => {
              const parsed = parseParamAddress(lane.target);
              return (
                <View key={lane.id} style={styles.connectionRow}>
                  <Text variant="readoutSm" tone="secondary">
                    {parsed ? `${parsed.nodeId} · ${parsed.paramKey}` : lane.target}
                  </Text>
                  <Text variant="readoutSm" tone="tertiary">
                    {lane.points.length} points
                  </Text>
                </View>
              );
            })}
            <PanelDivider />
            <Text variant="caption" tone="tertiary">
              Automation curves are edited on the timeline.
            </Text>
          </InstrumentPanel>
        </>
      ) : null}

      {warnings.length > 0 ? (
        <InstrumentPanel tone="flat" label="Worth knowing">
          {warnings.slice(0, 5).map((issue, index) => (
            <Text key={index} variant="bodySm" tone="warning" style={styles.warning}>
              {issue.message}
            </Text>
          ))}
        </InstrumentPanel>
      ) : null}

      {fingerprint ? (
        <View style={styles.dnaRow}>
          <DnaChip
            human={fingerprint.human}
            fingerprint={fingerprint.fingerprint}
            onPress={() => router.push(`/protocol/${draft.id}`)}
          />
          <Label>{fingerprint.shortFingerprint}</Label>
        </View>
      ) : null}

      <HardwareButton
        label="Save protocol"
        variant="primary"
        size="lg"
        disabled={errors.length > 0}
        onPress={async () => {
          const saved = await saveProtocol(draft);
          haptics.confirm();
          router.push(`/protocol/${saved.id}`);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionRow: { flexDirection: 'row', gap: space.sm },
  actionButton: { flex: 1 },
  flow: { paddingHorizontal: space.lg, paddingBottom: space.md },
  scopes: { padding: space.lg, gap: space.md },
  moduleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  moduleChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceRecessed,
    gap: 2,
    minWidth: 96,
  },
  moduleHint: { marginTop: space.md },
  moduleHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  moduleDescription: { marginTop: space.xxs },
  optionRow: { gap: space.xs, paddingVertical: space.xs },
  optionSegment: { marginTop: space.xxs },
  moduleFooter: { flexDirection: 'row', gap: space.sm },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
  },
  connectTargets: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm },
  warning: { marginBottom: space.xs },
  dnaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
