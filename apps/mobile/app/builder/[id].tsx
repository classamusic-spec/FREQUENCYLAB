import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  formatClock,
  getDescriptor,
  makeHoldLane,
  makeSweepLane,
  parseParamAddress,
  totalDurationSec,
  type AutomationLane,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel, PanelDivider } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { SegmentSelector } from '../../src/design/components/SegmentSelector';
import { ProtocolTimeline, ZOOM_LEVELS } from '../../src/design/components/ProtocolTimeline';
import { AutomationLaneView } from '../../src/design/components/AutomationLaneView';
import { NumericEntrySheet } from '../../src/design/components/NumericEntrySheet';
import { DnaChip } from '../../src/design/components/Badges';
import { Label, Text } from '../../src/design/components/Text';
import { colors, radius, space } from '../../src/design/tokens';
import * as haptics from '../../src/design/haptics';
import { useLab } from '../../src/state/lab';
import { useProtocolLibrary } from '../../src/state/library';
import { usePlayer } from '../../src/state/player';

/**
 * The protocol builder (§10, §11).
 *
 * Stages on a scaled timeline, automation curves underneath, and the whole
 * thing editable while a session auditions — the playhead on the timeline is
 * the same clock the engine is running.
 */
export default function BuilderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const draft = useLab((state) => state.draft);
  const open = useLab((state) => state.open);
  const stageIndex = useLab((state) => state.stageIndex);
  const selectStage = useLab((state) => state.selectStage);
  const updateStage = useLab((state) => state.updateStage);
  const addStage = useLab((state) => state.addStage);
  const removeStage = useLab((state) => state.removeStage);
  const duplicateStage = useLab((state) => state.duplicateStage);
  const moveStage = useLab((state) => state.moveStage);
  const upsertLane = useLab((state) => state.upsertLane);
  const removeLane = useLab((state) => state.removeLane);
  const setMaster = useLab((state) => state.setMaster);
  const dna = useLab((state) => state.dna);

  const protocols = useProtocolLibrary((state) => state.protocols);
  const saveProtocol = useProtocolLibrary((state) => state.save);
  const stagePresets = useProtocolLibrary((state) => state.stagePresets);
  const saveStagePreset = useProtocolLibrary((state) => state.saveStagePreset);

  const snapshot = usePlayer((state) => state.snapshot);
  const seek = usePlayer((state) => state.seek);

  const [zoom, setZoom] = useState(1);
  const [addingLane, setAddingLane] = useState(false);
  const [durationEntry, setDurationEntry] = useState(false);

  // Opening the builder directly by URL loads the protocol into the workspace.
  // Deliberately in an effect rather than during render: mutating a store while
  // rendering is how re-entrant update loops start.
  const fallback = params.id ? protocols.find((protocol) => protocol.id === params.id) : undefined;
  useEffect(() => {
    if (!draft && fallback) open(fallback);
  }, [draft, fallback, open]);

  const stage = draft?.stages[stageIndex];

  const automatableTargets = useMemo(() => {
    if (!stage) return [];
    const targets: { address: string; label: string; min: number; max: number; current: number }[] = [];
    for (const node of stage.graph.nodes) {
      const descriptor = getDescriptor(node.kind);
      for (const param of descriptor.params) {
        if (!param.automatable) continue;
        const address = `${node.id}:${param.key}`;
        if (stage.automation.some((lane) => lane.target === address)) continue;
        targets.push({
          address,
          label: `${descriptor.shortLabel} · ${param.label}`,
          min: param.min,
          max: param.max,
          current: node.params[param.key] ?? param.default,
        });
      }
    }
    return targets;
  }, [stage]);

  if (!draft || !stage) {
    return (
      <Screen>
        <ScreenHeader title="Builder" subtitle="No protocol is open." />
        <HardwareButton label="Back to Lab" onPress={() => router.replace('/lab')} />
      </Screen>
    );
  }

  const playhead =
    snapshot.protocolId === draft.id && snapshot.telemetry ? snapshot.telemetry.positionSec : undefined;
  const fingerprint = dna();

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Builder"
        title={draft.name}
        subtitle={`${draft.stages.length} stages · ${formatClock(totalDurationSec(draft))}`}
        right={
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
            <Label>Done</Label>
          </Pressable>
        }
      />

      <View style={styles.zoomRow}>
        <Label>Zoom</Label>
        <SegmentSelector
          size="sm"
          style={styles.zoomSelector}
          accessibilityLabel="Timeline zoom"
          options={ZOOM_LEVELS.map((level, index) => ({ value: String(index), label: `${index + 1}×` }))}
          value={String(zoom)}
          onChange={(value) => setZoom(Number.parseInt(value, 10))}
        />
      </View>

      <InstrumentPanel tone="recessed" bare>
        <View style={styles.timeline}>
          <ProtocolTimeline
            stages={draft.stages}
            selectedIndex={stageIndex}
            onSelect={selectStage}
            onResize={(index, durationSec) => updateStage(index, { durationSec: Math.round(durationSec) })}
            playheadSec={playhead}
            onScrub={(seconds) => seek(seconds)}
            pixelsPerSecond={ZOOM_LEVELS[zoom]}
          />
        </View>
      </InstrumentPanel>

      <View style={styles.stageActions}>
        <HardwareButton label="Add" size="sm" onPress={() => addStage()} />
        <HardwareButton label="Duplicate" size="sm" onPress={() => duplicateStage(stageIndex)} />
        <HardwareButton
          label="◀"
          size="sm"
          variant="ghost"
          disabled={stageIndex === 0}
          onPress={() => moveStage(stageIndex, stageIndex - 1)}
        />
        <HardwareButton
          label="▶"
          size="sm"
          variant="ghost"
          disabled={stageIndex >= draft.stages.length - 1}
          onPress={() => moveStage(stageIndex, stageIndex + 1)}
        />
        <HardwareButton
          label="Delete"
          size="sm"
          variant="danger"
          disabled={draft.stages.length <= 1}
          onPress={() => removeStage(stageIndex)}
        />
      </View>

      <InstrumentPanel tone="flat" label="Stage">
        <Text variant="heading">{stage.name}</Text>
        <View style={styles.stageMetaRow}>
          <Pressable
            onPress={() => setDurationEntry(true)}
            accessibilityRole="button"
            accessibilityLabel={`Stage duration ${formatClock(stage.durationSec)}. Double tap to change.`}
          >
            <Label>Duration</Label>
            <Text variant="readoutLg">{formatClock(stage.durationSec)}</Text>
          </Pressable>
          <View>
            <Label>Cross-fade in</Label>
            <Text variant="readoutLg">{stage.crossfadeSec.toFixed(1)} s</Text>
          </View>
        </View>
        <SegmentSelector
          scrollable
          size="sm"
          accessibilityLabel="Cross-fade duration"
          options={[0, 2, 4, 8, 15].map((value) => ({ value: String(value), label: `${value}s` }))}
          value={String(Math.round(stage.crossfadeSec))}
          onChange={(value) => updateStage(stageIndex, { crossfadeSec: Number.parseInt(value, 10) })}
        />
        <PanelDivider />
        <View style={styles.stageNameRow}>
          <SegmentSelector
            scrollable
            size="sm"
            accessibilityLabel="Stage name"
            options={['Settle', 'Descent', 'Deep', 'Hold', 'Return', 'Explore'].map((name) => ({
              value: name,
              label: name,
            }))}
            value={stage.name}
            onChange={(name) => updateStage(stageIndex, { name })}
          />
        </View>
        <HardwareButton
          label="Save as stage preset"
          size="sm"
          variant="ghost"
          onPress={() => {
            void saveStagePreset({ ...stage, id: `preset-${Date.now().toString(36)}` });
            haptics.confirm();
          }}
        />
      </InstrumentPanel>

      {stagePresets.length > 0 ? (
        <>
          <SectionHeader label="Stage presets" />
          <View style={styles.presetRow}>
            {stagePresets.map((preset) => (
              <HardwareButton
                key={preset.id}
                size="sm"
                variant="ghost"
                label={preset.name}
                onPress={() => addStage(preset)}
              />
            ))}
          </View>
        </>
      ) : null}

      <SectionHeader
        label="Automation"
        right={
          <Pressable onPress={() => setAddingLane((value) => !value)} hitSlop={10}>
            <Label tone="signal">{addingLane ? 'Done' : 'Add lane'}</Label>
          </Pressable>
        }
      />

      {addingLane ? (
        <InstrumentPanel tone="flat">
          {automatableTargets.length === 0 ? (
            <Text variant="bodySm" tone="secondary">
              Every automatable parameter in this stage already has a lane.
            </Text>
          ) : (
            <View style={styles.targetGrid}>
              {automatableTargets.map((target) => (
                <Pressable
                  key={target.address}
                  onPress={() => {
                    haptics.engage();
                    // A new lane starts as a hold at the parameter's current
                    // value, so adding one never changes the sound by itself.
                    upsertLane(
                      makeHoldLane(
                        `lane-${Date.now().toString(36)}`,
                        target.address,
                        target.current,
                        target.label,
                      ),
                    );
                    setAddingLane(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Automate ${target.label}`}
                  style={styles.targetChip}
                >
                  <Text variant="caption" tone="secondary">
                    {target.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </InstrumentPanel>
      ) : null}

      {stage.automation.length === 0 ? (
        <InstrumentPanel tone="flat">
          <Text variant="bodySm" tone="secondary">
            No automation in this stage. Add a lane to sweep a parameter across it — a two-point
            lane is a frequency sweep, and more points make a curve.
          </Text>
          {automatableTargets.some((target) => target.address === 'tone:beat') ? (
            <HardwareButton
              label="Add a beat sweep"
              size="sm"
              style={styles.quickLane}
              onPress={() => {
                const current =
                  stage.graph.nodes.find((node) => node.id === 'tone')?.params.beat ?? 10;
                upsertLane(
                  makeSweepLane(
                    `lane-${Date.now().toString(36)}`,
                    'tone:beat',
                    current,
                    Math.max(1, current - 4),
                    stage.durationSec,
                    { kind: 'smooth' },
                    'Beat',
                  ),
                );
              }}
            />
          ) : null}
        </InstrumentPanel>
      ) : (
        stage.automation.map((lane: AutomationLane) => (
          <InstrumentPanel key={lane.id} tone="flat">
            <AutomationLaneView
              lane={lane}
              graph={stage.graph}
              stageDurationSec={stage.durationSec}
              playheadSec={
                playhead !== undefined && snapshot.telemetry?.stageIndex === stageIndex
                  ? snapshot.telemetry.stagePositionSec
                  : undefined
              }
              onChange={upsertLane}
              onRemove={() => removeLane(lane.id)}
            />
            <Text variant="caption" tone="tertiary">
              {describeLane(lane)}
            </Text>
          </InstrumentPanel>
        ))
      )}

      <SectionHeader label="Master" />
      <InstrumentPanel tone="flat">
        <View style={styles.masterRow}>
          <Label>Fade in</Label>
          <SegmentSelector
            size="sm"
            style={styles.masterSelector}
            accessibilityLabel="Fade in seconds"
            options={[2, 4, 6, 10].map((value) => ({ value: String(value), label: `${value}s` }))}
            value={String(Math.round(draft.master.fadeInSec))}
            onChange={(value) => setMaster({ fadeInSec: Number.parseInt(value, 10) })}
          />
        </View>
        <View style={styles.masterRow}>
          <Label>Fade out</Label>
          <SegmentSelector
            size="sm"
            style={styles.masterSelector}
            accessibilityLabel="Fade out seconds"
            options={[4, 8, 15, 30].map((value) => ({ value: String(value), label: `${value}s` }))}
            value={String(Math.round(draft.master.fadeOutSec))}
            onChange={(value) => setMaster({ fadeOutSec: Number.parseInt(value, 10) })}
          />
        </View>
        <PanelDivider />
        <Text variant="caption" tone="tertiary">
          The master limiter is always on. It is the last thing between a protocol and your ears,
          and it is not a creative control.
        </Text>
      </InstrumentPanel>

      {fingerprint ? (
        <View style={styles.dnaRow}>
          <DnaChip human={fingerprint.human} fingerprint={fingerprint.fingerprint} />
        </View>
      ) : null}

      <HardwareButton
        label="Save protocol"
        variant="primary"
        size="lg"
        onPress={async () => {
          const saved = await saveProtocol(draft);
          haptics.confirm();
          router.replace(`/protocol/${saved.id}`);
        }}
      />

      {durationEntry ? (
        <NumericEntrySheet
          title="Stage duration"
          unit="min"
          value={stage.durationSec / 60}
          min={0.5}
          max={180}
          precision={1}
          onCancel={() => setDurationEntry(false)}
          onSubmit={(minutes) => {
            updateStage(stageIndex, { durationSec: Math.round(minutes * 60) });
            setDurationEntry(false);
          }}
        />
      ) : null}
    </Screen>
  );
}

function describeLane(lane: AutomationLane): string {
  const parsed = parseParamAddress(lane.target);
  const target = parsed ? `${parsed.nodeId} · ${parsed.paramKey}` : lane.target;
  if (lane.points.length < 2) return `${target}, held at ${lane.points[0]?.value.toFixed(3) ?? '—'}.`;
  const first = lane.points[0];
  const last = lane.points[lane.points.length - 1];
  return `${target}, ${first.value.toFixed(2)} → ${last.value.toFixed(2)} over ${formatClock(
    last.timeSec - first.timeSec,
  )}, ${lane.points.length} points.`;
}

const styles = StyleSheet.create({
  zoomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  zoomSelector: { width: 200 },
  timeline: { paddingHorizontal: space.md, paddingBottom: space.sm },
  stageActions: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  stageMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md },
  stageNameRow: { marginTop: space.xs },
  presetRow: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  targetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  targetChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceRecessed,
  },
  quickLane: { marginTop: space.md, alignSelf: 'flex-start' },
  masterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
    gap: space.md,
  },
  masterSelector: { flex: 1, maxWidth: 240 },
  dnaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
