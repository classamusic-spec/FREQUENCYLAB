import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CLASSIFICATION_LABELS,
  collection as findCollection,
  factoryPreset,
  formatClock,
  searchPresets,
  type FrequencyPreset,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { ClassificationBadge } from '../../src/design/components/Badges';
import { PresetCard, presetReadout, formatPresetHz } from '../../src/design/components/PresetCard';
import { Label, Text } from '../../src/design/components/Text';
import { colors, layout, space } from '../../src/design/tokens';
import { representationOptions } from '../../src/features/presetPlayback';

/**
 * Comparing two presets (§28).
 *
 * The comparison is of facts and never of merit: what each holds, what each
 * emits, how long each runs, and where each one's standing comes from. There is
 * no score and no winner, because the two things a person is usually trying to
 * separate here — a number and a claim about it — do not resolve into one.
 *
 * The row that does most of the work is "your headphones emit". Two presets can
 * both be called 40 Hz and put entirely different sounds in your ears, and the
 * only place that difference is visible is the line that states the actual
 * output rather than the label.
 */
export default function PresetCompareScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ a?: string; b?: string }>();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(params.b ?? null);

  const left = params.a ? factoryPreset(params.a) : undefined;
  const right = picked ? factoryPreset(picked) : undefined;

  const results = useMemo(
    () =>
      searchPresets(query, { limit: query.trim() ? 12 : 8 }).filter(
        (result) => result.preset.id !== left?.id,
      ),
    [left?.id, query],
  );

  if (!left) {
    return (
      <Screen>
        <ScreenHeader title="Nothing to compare" subtitle="Open a preset and choose Compare." />
        <HardwareButton label="All collections" onPress={() => router.replace('/collections')} />
      </Screen>
    );
  }

  return (
    <Screen bottomInset={layout.transportHeight}>
      <ScreenHeader
        eyebrow="Compare"
        title={right ? `${left.name} · ${right.name}` : left.name}
        subtitle="What each one holds and what each one actually emits, side by side."
      />

      {right ? (
        <>
          <View style={styles.columns}>
            <View style={styles.column}>
              <Text variant="heading" numberOfLines={2}>
                {left.name}
              </Text>
              <ClassificationBadge classification={left.classification} />
            </View>
            <View style={styles.column}>
              <Text variant="heading" numberOfLines={2}>
                {right.name}
              </Text>
              <ClassificationBadge classification={right.classification} />
            </View>
          </View>

          <InstrumentPanel tone="flat" bare>
            <CompareRow label="Holds" left={held(left)} right={held(right)} />
            <CompareRow
              label="Recorded as"
              left={roleWord(left)}
              right={roleWord(right)}
            />
            <CompareRow
              label="Your headphones emit"
              left={emits(left)}
              right={emits(right)}
            />
            <CompareRow
              label="Classification"
              left={CLASSIFICATION_LABELS[left.classification]}
              right={CLASSIFICATION_LABELS[right.classification]}
            />
            <CompareRow
              label="Collection"
              left={findCollection(left.collection)?.name ?? left.collection}
              right={findCollection(right.collection)?.name ?? right.collection}
            />
            <CompareRow
              label="Suggested length"
              left={formatClock(left.durationSec)}
              right={formatClock(right.durationSec)}
            />
            <CompareRow
              label="Output"
              left={left.safety.output === 'headphones' ? 'Headphones' : 'Either'}
              right={right.safety.output === 'headphones' ? 'Headphones' : 'Either'}
            />
            <CompareRow
              label="Medical claims answered"
              left={String(left.associations.filter((entry) => entry.medical).length)}
              right={String(right.associations.filter((entry) => entry.medical).length)}
            />
            <CompareRow
              label="Library entries"
              left={String(left.libraryEntryIds.length)}
              right={String(right.libraryEntryIds.length)}
            />
            <CompareRow
              label="Archive records"
              left={String(left.archiveEntryIds.length)}
              right={String(right.archiveEntryIds.length)}
            />
          </InstrumentPanel>

          <Text variant="caption" tone="tertiary">
            Nothing here is a verdict. Two presets sharing a number are not doing the same thing,
            and a shelf with more linked entries is better documented rather than better.
          </Text>

          <View style={styles.actions}>
            <HardwareButton
              label="Open the first"
              style={styles.action}
              onPress={() => router.push(`/preset/${left.id}`)}
            />
            <HardwareButton
              label="Open the second"
              style={styles.action}
              onPress={() => router.push(`/preset/${right.id}`)}
            />
          </View>
          <HardwareButton
            label="Choose a different second preset"
            variant="ghost"
            onPress={() => setPicked(null)}
          />
        </>
      ) : (
        <>
          <InstrumentPanel tone="recessed" bare>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search for the preset to compare against"
              placeholderTextColor={colors.textDisabled}
              autoCorrect={false}
              accessibilityLabel="Search presets to compare against"
              style={styles.search}
            />
          </InstrumentPanel>

          <SectionHeader label={query.trim() ? `${results.length} matching` : 'Suggestions'} />
          {results.map((result) => (
            <PresetCard
              key={result.preset.id}
              preset={result.preset}
              matchReason={result.classificationNote}
              onPress={() => setPicked(result.preset.id)}
            />
          ))}
        </>
      )}
    </Screen>
  );
}

function CompareRow({ label, left, right }: { label: string; left: string; right: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}. ${left}, against ${right}`}>
      <Label>{label}</Label>
      <View style={styles.rowValues}>
        <Text variant="bodySm" style={styles.rowValue}>
          {left}
        </Text>
        <Text variant="bodySm" style={styles.rowValue}>
          {right}
        </Text>
      </View>
    </View>
  );
}

/** What the preset holds, with the noise rows saying what they are instead. */
function held(preset: FrequencyPreset): string {
  const readout = presetReadout(preset);
  return readout.value === null
    ? `${readout.placeholder} noise, no single frequency`
    : `${readout.value} Hz`;
}

function roleWord(preset: FrequencyPreset): string {
  switch (preset.sourceFrequency.role) {
    case 'carrier':
      return 'An audible tone';
    case 'modulation':
      return 'A modulation rate';
    case 'electromagnetic':
      return 'An electromagnetic figure';
    default:
      return 'Not stated';
  }
}

/**
 * What actually leaves the headphones under the shipped representation.
 *
 * Taken from the compiler rather than from the preset's own words, because the
 * whole point of the row is to show a difference the names hide.
 */
function emits(preset: FrequencyPreset): string {
  const option = representationOptions(preset).find((entry) => entry.shipped);
  if (!option || !option.available) return 'Nothing, as shipped';
  const transform = option.transform;
  if (!transform) return 'A broadband noise bed';
  if (transform.channels) {
    return `${formatPresetHz(transform.channels.leftHz)} Hz and ${formatPresetHz(
      transform.channels.rightHz,
    )} Hz, one per ear`;
  }
  if (transform.carrierHz !== undefined) {
    return `A ${formatPresetHz(transform.carrierHz)} Hz tone, ${option.label.toLowerCase()}`;
  }
  return `A ${formatPresetHz(transform.playbackHz)} Hz tone`;
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', gap: space.md },
  column: { flex: 1, gap: space.xs },
  row: {
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  rowValues: { flexDirection: 'row', gap: space.md },
  rowValue: { flex: 1 },
  actions: { flexDirection: 'row', gap: space.sm },
  action: { flex: 1 },
  search: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    color: colors.text,
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 15,
    minHeight: 48,
  },
});
