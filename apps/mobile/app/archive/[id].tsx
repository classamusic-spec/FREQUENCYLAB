import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ARCHIVE_EVIDENCE_DESCRIPTIONS,
  ARCHIVE_EVIDENCE_LABELS,
  CATEGORY_LABELS,
  VERIFICATION_DESCRIPTIONS,
  VERIFICATION_LABELS,
  buildArchiveProtocol,
  entriesAtFrequency,
  nearDuplicates,
  recommendedTransform,
  relatedFrequencies,
  transformsFor,
  type PlaybackTransform,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel, PanelRow } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { ArchiveEvidenceBadge, VerificationBadge } from '../../src/design/components/Badges';
import { ClaimEvidenceCard } from '../../src/design/components/ClaimEvidenceCard';
import { DisplayGlass } from '../../src/design/components/Surface';
import {
  TransformPicker,
  TransformSummary,
} from '../../src/design/components/TransformPicker';
import { formatHz } from '../../src/design/components/ArchiveCard';
import { Label, Text } from '../../src/design/components/Text';
import { colors, radius, space } from '../../src/design/tokens';
import { useArchive } from '../../src/state/archive';
import { useSessionStart } from '../../src/state/sessionStart';

const AUDITION_SEC = 120;

/**
 * One archive entry (§8).
 *
 * The screen is laid out in a fixed order that separates four things people
 * routinely conflate: the number itself, where it came from, what somebody
 * claimed about it, and what evidence supports. They are never merged into a
 * single verdict, and the claim section always shows the claim and the current
 * assessment side by side — quoting a claim without answering it would be
 * repeating it.
 *
 * Nothing plays until a transform is chosen and the exact output frequency is
 * on screen.
 */
export default function ArchiveEntryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const entry = useArchive((state) => state.get)(id);
  const all = useArchive((state) => state.all)();
  const favorites = useArchive((state) => state.favorites);
  const notes = useArchive((state) => state.notes);
  const toggleFavorite = useArchive((state) => state.toggleFavorite);
  const setNote = useArchive((state) => state.setNote);
  const request = useSessionStart((state) => state.request);

  const [chosen, setChosen] = useState<PlaybackTransform | null>(null);
  const [draftNote, setDraftNote] = useState<string | null>(null);

  const transforms = useMemo(
    () => (entry ? transformsFor(entry.frequency) : []),
    [entry],
  );
  const transform = chosen ?? (entry ? recommendedTransform(entry.frequency) : null);

  // Both lookups already exclude context records, which hold a placeholder zero
  // rather than a value; this only skips the work when the entry is one itself.
  const alsoHere = useMemo(
    () =>
      entry && !entry.contextOnly
        ? entriesAtFrequency(all, entry.frequency).filter((other) => other.id !== entry.id)
        : [],
    [all, entry],
  );
  const nearby = useMemo(
    () => (entry && !entry.contextOnly ? nearDuplicates(all, entry.frequency) : []),
    [all, entry],
  );
  const relatives = useMemo(
    () => (entry ? relatedFrequencies(entry.frequency) : []),
    [entry],
  );

  if (!entry) {
    return (
      <Screen>
        <ScreenHeader title="Not found" subtitle="This archive entry no longer exists." />
        <HardwareButton label="Back" onPress={() => router.back()} />
      </Screen>
    );
  }

  const saved = favorites.includes(entry.id);
  const note = draftNote ?? notes[entry.id] ?? '';

  const audition = () => {
    if (!transform?.available) return;
    const protocol = buildArchiveProtocol({
      id: `archive-${entry.id}-${Date.now().toString(36)}`,
      name: `${entry.name} — ${transform.label}`,
      description: `Audition of an archived value. ${transform.description}`,
      stages: [{ entry, transform, durationSec: AUDITION_SEC }],
    });
    void request(protocol, { onStarted: () => router.push('/session') });
  };

  return (
    <Screen>
      <ScreenHeader
        eyebrow={CATEGORY_LABELS[entry.category]}
        title={entry.name}
        subtitle={entry.summary}
        right={
          <Pressable
            onPress={() => void toggleFavorite(entry.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: saved }}
            accessibilityLabel={saved ? 'Remove from saved' : 'Save this frequency'}
            style={[styles.star, saved ? styles.starOn : null]}
          >
            <Text variant="readoutSm" tone={saved ? 'signal' : 'tertiary'}>
              {saved ? '★' : '☆'}
            </Text>
          </Pressable>
        }
      />

      {/* The archived value, unaltered, at full precision. Whatever transform is
          later applied, this number is what the source recorded. A context
          record has no value, and says so rather than showing a placeholder
          zero that would read as a frequency the archive holds. */}
      <DisplayGlass cornerRadius={radius.panel}>
        <View style={styles.hero}>
          <Label tone="displayDim">
            {entry.contextOnly ? 'This record holds no frequency' : 'Archived value'}
          </Label>
          {entry.contextOnly ? (
            <Text variant="readoutLg" tone="displayDim" style={styles.heroContext}>
              Context record
            </Text>
          ) : (
            <View style={styles.heroValue}>
              <Text variant="readoutXl" tone="displaySignal">
                {formatHz(entry.frequency)}
              </Text>
              <Text variant="readout" tone="displayDim" style={styles.heroUnit}>
                Hz
              </Text>
            </View>
          )}
          <Label tone="displayDim">
            {entry.contextOnly
              ? 'It documents the history, not a value'
              : entry.signalRole === 'modulation'
                ? 'Recorded as a rate'
                : entry.signalRole === 'electromagnetic'
                  ? 'Recorded as an electromagnetic frequency'
                  : entry.signalRole === 'carrier'
                    ? 'Recorded as an audible tone'
                    : 'Signal role not stated by the source'}
          </Label>
        </View>
      </DisplayGlass>

      <View style={styles.badges}>
        <VerificationBadge status={entry.verification} />
        <ArchiveEvidenceBadge level={entry.evidenceLevel} />
      </View>

      {/* Two independent ratings, explained separately. Merging them into one
          score would hide the case this archive exists to make visible: a
          well-documented claim is still a claim. */}
      <InstrumentPanel tone="recessed" label="Source rating">
        <Text variant="bodySm">{VERIFICATION_LABELS[entry.verification]}</Text>
        <Text variant="caption" tone="tertiary" style={styles.ratingBody}>
          {VERIFICATION_DESCRIPTIONS[entry.verification]}
        </Text>
      </InstrumentPanel>

      <InstrumentPanel tone="recessed" label="Evidence rating">
        <Text variant="bodySm">{ARCHIVE_EVIDENCE_LABELS[entry.evidenceLevel]}</Text>
        <Text variant="caption" tone="tertiary" style={styles.ratingBody}>
          {ARCHIVE_EVIDENCE_DESCRIPTIONS[entry.evidenceLevel]}
        </Text>
      </InstrumentPanel>

      <SectionHeader label="Provenance" />
      <InstrumentPanel tone="flat">
        <Text variant="heading">{entry.source.title}</Text>
        {entry.source.author ? (
          <Text variant="bodySm" tone="secondary" style={styles.sourceLine}>
            {entry.source.author}
            {entry.source.year ? ` · ${entry.source.year}` : ''}
          </Text>
        ) : entry.source.year ? (
          <Text variant="bodySm" tone="secondary" style={styles.sourceLine}>
            {entry.source.year}
          </Text>
        ) : null}
        {entry.source.reference ? (
          <Text variant="caption" tone="tertiary" style={styles.sourceLine}>
            {entry.source.reference}
          </Text>
        ) : null}
        {entry.source.originalContext ? (
          <Text variant="bodySm" tone="secondary" style={styles.context}>
            {entry.source.originalContext}
          </Text>
        ) : null}
      </InstrumentPanel>

      {entry.archiveNote ? (
        <InstrumentPanel tone="recessed" label="Archivist's note">
          <Text variant="bodySm" tone="secondary">
            {entry.archiveNote}
          </Text>
        </InstrumentPanel>
      ) : null}

      {entry.claims.length > 0 ? (
        <>
          <SectionHeader label="Claims and current evidence" />
          <Text variant="caption" tone="tertiary">
            The engraved half is what a source said, reproduced so it can be seen accurately. The
            printed half below it is what can be said today. They are kept apart deliberately.
          </Text>
          {/* The same component the preset screens use. A claim and the answer
              to it are one thing wherever they appear, and rendering them two
              different ways is how one of the two eventually gets rendered
              badly. */}
          {entry.claims.map((claim, index) => (
            <ClaimEvidenceCard
              key={index}
              association={claim}
              claimLabel="What was claimed"
              evidenceLabel="What the evidence supports"
            />
          ))}
        </>
      ) : null}

      <SectionHeader label="How this can be heard" />
      <Text variant="caption" tone="tertiary">
        {entry.recommendedTransform}
      </Text>

      {entry.contextOnly ? (
        <InstrumentPanel tone="recessed">
          <Text variant="bodySm" tone="secondary">
            There is nothing to play. This record exists so the archive can document an episode and
            state its own scope honestly, and inventing a frequency for it to play would be exactly
            the kind of fabrication the record is here to describe.
          </Text>
        </InstrumentPanel>
      ) : (
        <>
          {transform ? <TransformSummary transform={transform} /> : null}

          <TransformPicker
            transforms={transforms}
            selected={transform ?? undefined}
            onSelect={setChosen}
          />

          <HardwareButton
            label={
              transform?.available
                ? `Audition at ${formatHz(transform.playbackHz)} Hz`
                : 'No transform selected'
            }
            variant="primary"
            size="lg"
            disabled={!transform?.available}
            accessibilityHint="Runs a two minute audition through the normal safety checks."
            onPress={audition}
          />
          <Text variant="caption" tone="tertiary">
            Two minutes at your calibrated level. Sound through headphones is not equivalent to any
            historical electrical or electromagnetic apparatus.
          </Text>
        </>
      )}

      {alsoHere.length > 0 ? (
        <>
          <SectionHeader label={`Also recorded at ${formatHz(entry.frequency)} Hz`} />
          {alsoHere.map((other) => (
            <Pressable
              key={other.id}
              onPress={() => router.push(`/archive/${other.id}`)}
              accessibilityRole="button"
              style={styles.relatedRow}
            >
              <View style={styles.relatedText}>
                <Text variant="bodySm">{other.name}</Text>
                <Label tone="tertiary">{other.source.title}</Label>
              </View>
              <VerificationBadge status={other.verification} />
            </Pressable>
          ))}
        </>
      ) : null}

      {nearby.length > 0 ? (
        <>
          <SectionHeader label="Suspiciously close values" />
          <Text variant="caption" tone="tertiary">
            These sit within a tenth of a percent of this value. They may be the same number copied
            badly, or genuinely different records. The archive flags them and does not merge them.
          </Text>
          {nearby.map((other) => (
            <Pressable
              key={other.id}
              onPress={() => router.push(`/archive/${other.id}`)}
              accessibilityRole="button"
              style={styles.relatedRow}
            >
              <View style={styles.relatedText}>
                <Text variant="bodySm">{other.name}</Text>
                <Label tone="tertiary">{other.source.title}</Label>
              </View>
              <Text variant="readoutSm" tone="secondary">
                {formatHz(other.frequency)} Hz
              </Text>
            </Pressable>
          ))}
        </>
      ) : null}

      {entry.contextOnly ? null : (
        <>
          <SectionHeader label="Mathematical relatives" />
          <InstrumentPanel tone="flat" bare>
            {relatives.map((relation) => (
              <View key={relation.ratio} style={styles.relationRow}>
                <Label>{relation.ratio}</Label>
                <Text variant="bodySm" tone="secondary" style={styles.relationLabel}>
                  {relation.label}
                </Text>
                <Text variant="readoutSm">{formatHz(relation.frequency)} Hz</Text>
              </View>
            ))}
          </InstrumentPanel>
          <Text variant="caption" tone="tertiary">
            These are arithmetic relationships and nothing more. Two frequencies an octave apart
            are related by a ratio of two; that is a fact about numbers and carries no claim that
            they do the same thing.
          </Text>
        </>
      )}

      <SectionHeader label="Your note" />
      <InstrumentPanel tone="recessed" bare>
        <TextInput
          value={note}
          onChangeText={setDraftNote}
          onBlur={() => {
            if (draftNote !== null) void setNote(entry.id, draftNote);
          }}
          multiline
          placeholder="Anything you want to remember about this entry."
          placeholderTextColor={colors.textDisabled}
          accessibilityLabel="Your note on this entry"
          style={styles.note}
        />
      </InstrumentPanel>
      <Text variant="caption" tone="tertiary">
        Notes are yours and stay on this device. They are kept separate from the record, so nothing
        you write changes what the archive says a source said.
      </Text>

      <SectionHeader label="Record history" />
      <InstrumentPanel tone="flat">
        <PanelRow label="Source version" value={String(entry.sourceVersion)} />
        <PanelRow label="Evidence version" value={String(entry.evidenceVersion)} />
        <PanelRow label="Updated" value={new Date(entry.updatedAt).toLocaleDateString()} />
      </InstrumentPanel>
      {entry.changeLog.map((revision, index) => (
        <View key={index} style={styles.revision}>
          <Label tone="tertiary">
            v{revision.version} · {revision.scope.replace('-', ' ')} ·{' '}
            {new Date(revision.at).toLocaleDateString()}
          </Label>
          <Text variant="bodySm" tone="secondary">
            {revision.change}
          </Text>
        </View>
      ))}
      <Text variant="caption" tone="tertiary">
        Provenance and evidence are versioned separately. Updating what current research says about
        a frequency does not touch the historical record of what was originally claimed, and a
        change to either is written here rather than applied silently.
      </Text>

      {entry.tags.length > 0 || entry.aliases.length > 0 ? (
        <InstrumentPanel tone="recessed" label="Also known as">
          <Text variant="bodySm" tone="secondary">
            {[...entry.aliases, ...entry.tags].join(' · ')}
          </Text>
        </InstrumentPanel>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  star: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRecessed,
  },
  starOn: { backgroundColor: colors.surfaceRaised },
  hero: { padding: space.xl, gap: space.xxs },
  heroValue: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  heroContext: { marginVertical: space.xs },
  heroUnit: { marginBottom: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  ratingBody: { marginTop: space.xxs },
  sourceLine: { marginTop: space.xxs },
  context: {
    marginTop: space.sm,
    paddingLeft: space.md,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.hairlineStrong,
  },
  relatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    minHeight: 56,
  },
  relatedText: { flex: 1, gap: 2 },
  relationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  relationLabel: { flex: 1 },
  note: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    color: colors.text,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  revision: {
    gap: 2,
    paddingLeft: space.md,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.hairlineStrong,
  },
});
