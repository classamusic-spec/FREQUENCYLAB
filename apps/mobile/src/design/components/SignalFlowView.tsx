import { Fragment } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  NODE_DESCRIPTORS,
  OUTPUT_NODE_ID,
  topologicalOrder,
  type RoutingGraph,
} from '@frequencylab/dsp-core';
import { colors, radius, space } from '../tokens';
import { Label, Text } from './Text';

export interface SignalFlowViewProps {
  graph: RoutingGraph;
  selectedNodeId?: string | null;
  onSelect?: (nodeId: string) => void;
  /** Adds a limiter block at the end, which the master chain always applies. */
  showMaster?: boolean;
}

/**
 * The signal-flow view (§9).
 *
 * Rendered as ordered columns rather than a free canvas: on a phone, a legible
 * left-to-right chain communicates the routing better than a draggable node
 * graph, and it stays readable at any type size. Nodes that fan into the same
 * destination are stacked in one column, which is exactly how the mixer sums
 * them.
 */
export function SignalFlowView({
  graph,
  selectedNodeId,
  onSelect,
  showMaster = true,
}: SignalFlowViewProps) {
  const columns = buildColumns(graph);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
      {columns.map((column, columnIndex) => (
        <Fragment key={columnIndex}>
          <View style={styles.column}>
            {column.map((nodeId) => {
              const node = graph.nodes.find((candidate) => candidate.id === nodeId);
              if (!node) return null;
              const descriptor = NODE_DESCRIPTORS[node.kind];
              const selected = selectedNodeId === nodeId;
              return (
                <Pressable
                  key={nodeId}
                  onPress={() => onSelect?.(nodeId)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${descriptor.label}${node.bypass ? ', bypassed' : ''}`}
                  style={[
                    styles.block,
                    selected ? styles.blockSelected : null,
                    node.bypass ? styles.blockBypassed : null,
                  ]}
                >
                  <Label tone={selected ? 'signal' : 'tertiary'}>{descriptor.shortLabel}</Label>
                  <Text variant="caption" tone={selected ? 'primary' : 'secondary'} numberOfLines={1}>
                    {node.label ?? descriptor.label}
                  </Text>
                  {node.bypass ? <Label tone="warning">Bypass</Label> : null}
                </Pressable>
              );
            })}
          </View>
          {columnIndex < columns.length - 1 ? <Arrow /> : null}
        </Fragment>
      ))}

      {showMaster ? (
        <>
          <Arrow />
          <View style={styles.column}>
            <View style={[styles.block, styles.blockMaster]}>
              <Label tone="tertiary">LIM</Label>
              <Text variant="caption" tone="secondary">
                Master limiter
              </Text>
            </View>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function Arrow() {
  return (
    <View style={styles.arrow} accessibilityElementsHidden importantForAccessibility="no">
      <View style={styles.arrowLine} />
      <Text variant="caption" tone="tertiary">
        ▸
      </Text>
    </View>
  );
}

/**
 * Groups nodes into columns by their longest path to the output, so a signal
 * always flows left to right and nodes that merge line up vertically.
 */
function buildColumns(graph: RoutingGraph): string[][] {
  const order = topologicalOrder(graph) ?? graph.nodes.map((node) => node.id);
  const depth = new Map<string, number>();
  for (const id of order) depth.set(id, 0);
  for (const id of order) {
    const outgoing = graph.connections.filter((connection) => connection.from === id);
    for (const connection of outgoing) {
      depth.set(connection.to, Math.max(depth.get(connection.to) ?? 0, (depth.get(id) ?? 0) + 1));
    }
  }
  // The output always sits alone in the final column, even if nothing feeds it.
  const maxDepth = Math.max(0, ...[...depth.values()]);
  depth.set(OUTPUT_NODE_ID, maxDepth);

  const columns: string[][] = [];
  for (const id of order) {
    const level = depth.get(id) ?? 0;
    columns[level] = columns[level] ?? [];
    columns[level].push(id);
  }
  return columns.filter((column) => column && column.length > 0);
}

const styles = StyleSheet.create({
  scroll: { alignItems: 'center', paddingVertical: space.sm, gap: 0 },
  column: { gap: space.sm, justifyContent: 'center' },
  block: {
    minWidth: 104,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.edgeDark,
    gap: 2,
  },
  blockSelected: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.signalDim,
    backgroundColor: colors.surfaceHigh,
  },
  blockBypassed: { opacity: 0.55 },
  blockMaster: { backgroundColor: colors.surfaceRecessed },
  arrow: { paddingHorizontal: space.sm, alignItems: 'center', justifyContent: 'center' },
  arrowLine: { width: 18, height: StyleSheet.hairlineWidth, backgroundColor: colors.hairlineStrong },
});
