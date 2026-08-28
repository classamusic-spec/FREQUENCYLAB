import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AUDIBLE_MAX_HZ,
  AUDIBLE_MIN_HZ,
  buildArchiveProtocol,
  entriesAtFrequency,
  harmonicSeries,
  nearDuplicates,
  playbackCompatibility,
  recommendedTransform,
  relatedFrequencies,
  transformsFor,
  type ArchiveEntry,
  type PlaybackTransform,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { SegmentSelector } from '../../src/design/components/SegmentSelector';
import { ArchiveCard, formatHz } from '../../src/design/components/ArchiveCard';
import {
  TransformPicker,
  TransformSummary,
} from '../../src/design/components/TransformPicker';
import { Label, Text } from '../../src/design/components/Text';
import { colors, space } from '../../src/design/tokens';
import { useArchive } from '../../src/state/archive';
import { useSessionStart } from '../../src/state/sessionStart';

const CARRIERS = [
  { value: '110', label: '110 Hz' },
  { value: '220', label: '220 Hz' },
  { value: '440', label: '440 Hz' },
];

const AUDITION_SEC = 120;

/**
 * The frequency translator (§41).
 *
 * Type any number and the tool says what would actually happen to it. That is
 * the whole feature, and it is deliberately usable on numbers the archive has
 * never heard of, because the question people arrive with — "I read about
 * 2128 Hz, what would that even sound like?" — deserves a straight answer
 * rather than a search that comes back empty.
 *
 * Nothing is clamped. A value above the audio band is divided by a stated power
 * of two or refused outright, and the refusal says why.
 */
export default function TranslatorScreen() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [carrier, setCarrier] = useState('220');
  const [chosen, setChosen] = useState<PlaybackTransform | null>(null);

  const entries = useArchive((state) => state.all)();
  const request = useSessionStart((state) => state.request);

  const hz = Number.parseFloat(input);
  const valid = Number.isFinite(hz) && hz > 0;
  const carrierHz = Number.parseFloat(carrier);

  const transforms = useMemo(
    () => (valid ? transformsFor(hz, { carrierHz }) : []),
    [carrierHz, hz, valid],
  );

  /**
   * The same fourteen options, viable ones first.
   *
   * Nothing is hidden and nothing is reordered within a group — the sort is
   * stable, so the translator's own order survives inside each half. What it
   * fixes is a list that had grown from seven options to fourteen: for a value
   * already in the audible band, the second and third rows are the divide and
   * multiply options refusing themselves, and reading two refusals before the
   * first thing you can actually press makes the list look broken rather than
   * careful. The refusals still have to be there — a missing row reads as an
   * oversight — so they move below instead of away.
   */
  const ordered = useMemo(
    () => [...transforms].sort((a, b) => Number(b.available) - Number(a.available)),
    [transforms],
  );
  const availableCount = transforms.filter((entry) => entry.available).length;
  const transform =
    chosen && transforms.some((t) => t.kind === chosen.kind && t.available)
      ? transforms.find((t) => t.kind === chosen.kind)!
      : valid
        ? recommendedTransform(hz, { carrierHz })
        : null;

  const compatibility = valid ? playbackCompatibility(hz) : null;
  const relatives = useMemo(() => (valid ? relatedFrequencies(hz) : []), [hz, valid]);
  const harmonics = useMemo(() => (valid ? harmonicSeries(hz, 6) : []), [hz, valid]);

  const held = useMemo(
    () => (valid ? entriesAtFrequency(entries, hz) : []),
    [entries, hz, valid],
  );
  const close = useMemo(
    () => (valid ? nearDuplicates(entries, hz) : []),
    [entries, hz, valid],
  );

  const audition = () => {
    if (!transform?.available) return;
    // A number typed into the translator has no provenance, and the record it
    // travels under has to say so rather than inventing one.
    const anonymous: ArchiveEntry = {
      id: `translator-${hz}`,
      name: `${formatHz(hz)} Hz`,
      frequency: hz,
      unit: 'Hz',
      category: 'user-collection',
      signalRole: 'unspecified',
      evidenceLevel: 'experimental',
      verification: 'unverified',
      source: {
        title: 'Entered in the frequency translator',
        year: null,
        originalContext: 'Typed by the user. No source is attached to this value.',
      },
      summary: `${formatHz(hz)} Hz, entered directly.`,
      claims: [],
      playback: playbackCompatibility(hz),
      recommendedTransform: transform.label,
      tags: ['translator'],
      aliases: [],
      related: [],
      sourceVersion: 1,
      evidenceVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      changeLog: [],
    };

    const protocol = buildArchiveProtocol({
      id: `translator-${Date.now().toString(36)}`,
      name: `${formatHz(hz)} Hz — ${transform.label}`,
      description: transform.description,
      stages: [{ entry: anonymous, transform, durationSec: AUDITION_SEC }],
    });
    void request(protocol, { onStarted: () => router.push('/session') });
  };

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Tool"
        title="Frequency translator"
        subtitle="Any number, and exactly what your headphones would do with it."
      />

      <InstrumentPanel tone="recessed" bare>
        <TextInput
          value={input}
          onChangeText={(text) => {
            setInput(text);
            setChosen(null);
          }}
          placeholder="e.g. 2128"
          placeholderTextColor={colors.textDisabled}
          keyboardType="decimal-pad"
          accessibilityLabel="Frequency in hertz"
          style={styles.input}
        />
      </InstrumentPanel>

      {!valid ? (
        <Text variant="bodySm" tone="tertiary">
          Enter a frequency in hertz. The translator works on any value, including ones this
          archive holds no record of — it describes the arithmetic and the acoustics, not the
          provenance.
        </Text>
      ) : (
        <>
          <SectionHeader label="Carrier for rate-based options" />
          <SegmentSelector
            accessibilityLabel="Carrier frequency"
            options={CARRIERS}
            value={carrier}
            onChange={(value) => {
              setCarrier(value);
              setChosen(null);
            }}
          />

          {transform ? <TransformSummary transform={transform} /> : null}

          <InstrumentPanel tone="flat" label="What this value is, acoustically">
            <Text variant="bodySm" tone="secondary">
              {describe(hz, compatibility!)}
            </Text>
          </InstrumentPanel>

          <SectionHeader
            label="How this value can be heard"
            right={
              <Text variant="caption" tone="tertiary">
                {availableCount} of {transforms.length} available
              </Text>
            }
          />
          <Text variant="caption" tone="tertiary">
            Options this value cannot honestly carry stay on the list with the reason attached. A
            row that had been filtered out would look like an oversight, and a substituted one
            would be the silent conversion this whole tool exists to prevent.
          </Text>
          <TransformPicker
            transforms={ordered}
            selected={transform ?? undefined}
            onSelect={setChosen}
          />

          <HardwareButton
            label={
              transform?.available
                ? `Audition at ${formatHz(transform.playbackHz)} Hz`
                : 'No transform available for this value'
            }
            variant="primary"
            size="lg"
            disabled={!transform?.available}
            onPress={audition}
          />

          {held.length > 0 ? (
            <>
              <SectionHeader label="Held at this exact value" />
              {held.map((entry) => (
                <ArchiveCard
                  key={entry.id}
                  entry={entry}
                  onPress={() => router.push(`/archive/${entry.id}`)}
                />
              ))}
            </>
          ) : (
            <>
              <SectionHeader label="Held at this exact value" />
              <Text variant="bodySm" tone="tertiary">
                No record in this archive holds {formatHz(hz)} Hz. That is a statement about this
                archive, not about the number.
              </Text>
            </>
          )}

          {close.length > 0 ? (
            <>
              <SectionHeader label="Close, but not the same" />
              {close.map((entry) => (
                <ArchiveCard
                  key={entry.id}
                  entry={entry}
                  matchReason={`Within a tenth of a percent — ${formatHz(entry.frequency)} Hz`}
                  onPress={() => router.push(`/archive/${entry.id}`)}
                />
              ))}
            </>
          ) : null}

          <SectionHeader label="Octaves and ratios" />
          <InstrumentPanel tone="flat" bare>
            {relatives.map((relation) => (
              <View key={relation.ratio} style={styles.row}>
                <Label>{relation.ratio}</Label>
                <Text variant="bodySm" tone="secondary" style={styles.rowLabel}>
                  {relation.label}
                </Text>
                <Text variant="readoutSm">{formatHz(relation.frequency)} Hz</Text>
              </View>
            ))}
          </InstrumentPanel>

          <SectionHeader label="Harmonic series" />
          <InstrumentPanel tone="flat" bare>
            {harmonics.map((relation) => (
              <View key={relation.ratio} style={styles.row}>
                <Label>{relation.ratio}</Label>
                <Text variant="bodySm" tone="secondary" style={styles.rowLabel}>
                  {relation.label}
                </Text>
                <Text variant="readoutSm">{formatHz(relation.frequency)} Hz</Text>
              </View>
            ))}
          </InstrumentPanel>

          <Text variant="caption" tone="tertiary">
            Octaves, ratios and harmonics are arithmetic. A frequency an octave above another is
            related to it by a factor of two and by nothing else — sharing a ratio is not sharing
            an effect.
          </Text>
        </>
      )}
    </Screen>
  );
}

/** A plain-language reading of where a number falls, with no claim attached. */
function describe(hz: number, compatibility: ReturnType<typeof playbackCompatibility>): string {
  if (hz < AUDIBLE_MIN_HZ) {
    return `${formatHz(hz)} Hz is below the range headphones reproduce, so no speaker can emit it as a tone. It can be represented as a rate — the speed at which an audible sound pulses or beats — which is a different thing from the frequency itself.`;
  }
  if (hz > AUDIBLE_MAX_HZ) {
    return `${formatHz(hz)} Hz is above the practical range of consumer audio hardware, and above the hearing of most adults. It can only be played after dividing it by a power of two, which produces a different, lower tone.`;
  }
  const rate = compatibility.amCompatible
    ? ' It is also slow enough to work as a modulation rate on an audible carrier.'
    : '';
  return `${formatHz(hz)} Hz is within the audible band and can be played directly as a tone.${rate}`;
}

const styles = StyleSheet.create({
  input: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    color: colors.text,
    fontFamily: 'IBMPlexMono_400Regular',
    fontSize: 28,
    minHeight: 64,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  rowLabel: { flex: 1 },
});
