import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  CLASSIFICATION_DESCRIPTIONS,
  CLASSIFICATION_LABELS,
  archiveEntry,
  bandForRate,
  collection as findCollection,
  factoryPreset,
  formatClock,
  libraryEntry,
  protocolDna,
  relatedFrequencies,

  type Protocol,
  type ProtocolStage,
  type RepresentationKind,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel, PanelRow } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { ClaimEvidenceCard } from '../../src/design/components/ClaimEvidenceCard';
import { ClassificationBadge, DnaChip, Tag } from '../../src/design/components/Badges';
import { ArchiveCard } from '../../src/design/components/ArchiveCard';
import { PresetCard, presetReadout, formatPresetHz } from '../../src/design/components/PresetCard';
import {
  RepresentationPicker,
  RepresentationSummary,
} from '../../src/design/components/RepresentationPicker';
import { SignalFlowView } from '../../src/design/components/SignalFlowView';
import { DisplayGlass } from '../../src/design/components/Surface';
import { Label, Text } from '../../src/design/components/Text';
import { colors, layout, MIN_TOUCH_TARGET, radius, space } from '../../src/design/tokens';
import * as haptics from '../../src/design/haptics';
import {
  representationOptions,
  compileRepresentation,
  protocolIdFor,
} from '../../src/features/presetPlayback';
import { usePresetShelf, presetsMentioning } from '../../src/state/presets';
import { useProtocolLibrary, summariseLibrary } from '../../src/state/library';
import { useSessionStart } from '../../src/state/sessionStart';
import { useHistory } from '../../src/state/history';
import { usePlayer } from '../../src/state/player';
import { NotAtThisLevel } from '../../src/design/components/NotAtThisLevel';
import { useTier } from '../../src/features/tier';

/**
 * One preset (§25, §43).
 *
 * The sections are in a fixed order and none of them is optional, because the
 * order is the argument: what the number is, what it will sound like, how this
 * app builds it, what people say about it, what has actually been studied, what
 * has not been established, where it came from, what it is related to, and what
 * happened when *you* listened. Somebody who reads top to bottom cannot arrive
 * at the play button still thinking the claim and the evidence are the same
 * thing.
 *
 * Nothing on this screen restates the evidence. The studied and not-established
 * sections render the linked `library/` entries and the origin section renders
 * the linked `archive/` records — one claim, one place, one version counter. A
 * preset with nothing linked says so rather than growing a sentence to fill the
 * gap.
 */
export default function PresetScreen() {
  const { opensRoute } = useTier();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const preset = factoryPreset(id);

  const hydrate = usePresetShelf((state) => state.hydrate);
  const hydrated = usePresetShelf((state) => state.hydrated);
  const favorites = usePresetShelf((state) => state.favorites);
  const toggleFavorite = usePresetShelf((state) => state.toggleFavorite);
  const recordPlay = usePresetShelf((state) => state.recordPlay);
  const protocols = useProtocolLibrary((state) => state.protocols);
  const saveProtocol = useProtocolLibrary((state) => state.save);
  const request = useSessionStart((state) => state.request);
  const sessions = useHistory((state) => state.sessions);
  const snapshot = usePlayer((state) => state.snapshot);

  /** The representation the user has chosen, or none while the shipped one stands. */
  const [chosen, setChosen] = useState<RepresentationKind | null>(null);
  const [adding, setAdding] = useState(false);
  const [addedTo, setAddedTo] = useState<string | null>(null);
  const [showDna, setShowDna] = useState(false);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrate, hydrated]);

  const options = useMemo(() => (preset ? representationOptions(preset) : []), [preset]);

  const selectedKind = chosen ?? preset?.representation.kind ?? 'direct';
  const option = options.find((entry) => entry.kind === selectedKind) ?? options[0];

  const compiled = useMemo(
    () =>
      preset && option
        ? compileRepresentation(preset, option.kind, { id: protocolIdFor(preset, option.kind) })
        : undefined,
    [option, preset],
  );

  const related = useMemo(
    () =>
      preset && preset.sourceFrequency.value > 0
        ? relatedFrequencies(preset.sourceFrequency.value)
        : [],
    [preset],
  );
  const alsoHere = useMemo(
    () => (preset ? presetsMentioning(preset.sourceFrequency.value, preset.id) : []),
    [preset],
  );

  const mine = useMemo(
    () =>
      preset
        ? sessions.filter((session) => session.protocolId.startsWith(`preset-${preset.id}-v`))
        : [],
    [preset, sessions],
  );

  /*
   * The library is off at Simple, and its tab does not exist there — so this
   * screen is only ever reached by a link or a typed address. The door says
   * what is behind it rather than rendering a version of the page with the
   * numbers taken out, which would leave nothing (§80, and the rule in
   * `features/tier`: a tier hides vocabulary and controls, never honesty).
   */
  if (!opensRoute('/preset')) {
    return (
      <NotAtThisLevel
        eyebrow="Frequency"
        title="Preset"
        subtitle="Where a number came from and what is claimed about it."
        explanation="A preset page is a page about a number: the value itself, the shelf it sits on, who claims what about it, and how strong the evidence is. Remove the number and there is no page left, so this one belongs to Explorer and Lab. Simple does not show the library at all — this screen was reached from a link or a typed address."
      />
    );
  }

  if (!preset || !option) {
    return (
      <Screen>
        <ScreenHeader title="Not found" subtitle="There is no preset with that name." />
        <HardwareButton label="All collections" onPress={() => router.replace('/collections')} />
      </Screen>
    );
  }

  const shelf = findCollection(preset.collection);
  const readout = presetReadout(preset);
  const saved = favorites.includes(preset.id);
  const protocol = compiled?.ok ? compiled.protocol : undefined;
  const dna = protocol ? protocolDna(protocol) : undefined;
  const band =
    preset.sourceFrequency.role === 'modulation' ? bandForRate(preset.sourceFrequency.value) : undefined;
  const playingThis =
    (snapshot.state === 'playing' || snapshot.state === 'paused') &&
    snapshot.protocolId === protocolIdFor(preset, option.kind);

  const libraryEntries = preset.libraryEntryIds
    .map((entryId) => libraryEntry(entryId))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
  const archiveEntries = preset.archiveEntryIds
    .map((entryId) => archiveEntry(entryId))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);

  const play = () => {
    if (!protocol) return;
    void recordPlay(preset, option.kind);
    void request(protocol, { onStarted: () => router.push('/session') });
  };

  const addToProtocol = async (target: Protocol) => {
    if (!protocol) return;
    // Stage and lane ids have to stay unique inside a protocol: a stage
    // cross-fade matches nodes across stages by id, and two stages sharing one
    // would fade into themselves.
    const suffix = freshSuffix();
    const stage: ProtocolStage = {
      ...protocol.stages[0],
      id: `stage-${suffix}`,
      name: preset.name,
      crossfadeSec: 3,
      automation: protocol.stages[0].automation.map((lane, index) => ({
        ...lane,
        id: `${lane.id}-${index}-${suffix}`,
      })),
    };
    const next = await saveProtocol({ ...target, stages: [...target.stages, stage] });
    haptics.confirm();
    setAddedTo(`Added to ${next.name}, now ${next.stages.length} stages.`);
  };

  const saveAsProtocol = async () => {
    if (!protocol) return;
    const next = await saveProtocol(protocol);
    haptics.confirm();
    setAddedTo(`Saved as a protocol of its own: ${next.name}.`);
    return next;
  };

  const startExperiment = async () => {
    // An experiment compares two protocols the library holds, so the preset has
    // to exist there before the builder can offer it. The id is deterministic,
    // so pressing this twice updates one protocol rather than growing a pile.
    await saveAsProtocol();
    router.push('/experiment/new');
  };

  return (
    <Screen bottomInset={layout.transportHeight}>
      <ScreenHeader
        eyebrow={shelf ? `${shelf.ordinal} · ${shelf.name}` : 'Preset'}
        title={preset.name}
        right={
          <Pressable
            onPress={() => void toggleFavorite(preset.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: saved }}
            accessibilityLabel={saved ? 'Remove from saved' : 'Save this preset'}
            style={[styles.star, saved ? styles.starOn : null]}
          >
            <Text variant="readoutSm" tone={saved ? 'signal' : 'tertiary'}>
              {saved ? '★' : '☆'}
            </Text>
          </Pressable>
        }
      />

      {/* The number the preset holds, at full precision — and, for the three
          rows that hold none, what they are instead. Broadband noise has a
          spectrum slope rather than a frequency, so printing its placeholder
          zero would put a value on the screen this app does not hold. */}
      <DisplayGlass cornerRadius={radius.panel}>
        <View style={styles.hero}>
          <Label tone="displayDim">
            {readout.value === null ? 'This preset holds no frequency' : 'Source frequency'}
          </Label>
          {readout.value === null ? (
            <Text variant="readoutLg" tone="displayDim" style={styles.heroPlaceholder}>
              {readout.placeholder} noise
            </Text>
          ) : (
            <View style={styles.heroValue}>
              <Text variant="readoutXl" tone="displaySignal">
                {readout.value}
              </Text>
              <Text variant="readout" tone="displayDim" style={styles.heroUnit}>
                Hz
              </Text>
            </View>
          )}
          <Label tone="displayDim">
            {readout.value === null
              ? 'Noise is broadband — it has no single frequency'
              : readout.caption}
          </Label>
        </View>
      </DisplayGlass>

      <View style={styles.badgeRow}>
        <ClassificationBadge
          classification={preset.classification}
          note={CLASSIFICATION_DESCRIPTIONS[preset.classification]}
        />
      </View>
      <InstrumentPanel tone="recessed" label="Classification">
        <Text variant="bodySm">{CLASSIFICATION_LABELS[preset.classification]}</Text>
        <Text variant="caption" tone="tertiary" style={styles.spaced}>
          {CLASSIFICATION_DESCRIPTIONS[preset.classification]}
        </Text>
      </InstrumentPanel>

      <SectionHeader label="What it is" />
      <Text variant="body" tone="secondary">
        {preset.summary}
      </Text>
      <InstrumentPanel tone="flat">
        <PanelRow label="Collection" value={shelf?.name ?? preset.collection} />
        <PanelRow label="Suggested length" value={formatClock(preset.durationSec)} />
        <PanelRow
          label="Output"
          value={preset.safety.output === 'headphones' ? 'Headphones' : 'Headphones or speakers'}
        />
        {band ? <PanelRow label="Conventional band" value={band.name} /> : null}
      </InstrumentPanel>
      {preset.intent.length > 0 ? (
        <View style={styles.tags}>
          {preset.intent.map((entry) => (
            <Tag key={entry} label={entry} />
          ))}
        </View>
      ) : null}
      <Text variant="caption" tone="tertiary">
        Those are contexts people reach for this in, not effects it produces.
      </Text>

      <SectionHeader label="How it sounds" />
      <RepresentationSummary
        option={option}
        sourceHz={readout.value === null ? null : preset.sourceFrequency.value}
        sourcePlaceholder={readout.placeholder}
        playing={playingThis}
      />
      <Text variant="body" tone="secondary">
        {option.available ? option.description : option.unavailableReason}
      </Text>
      {preset.safety.headphonesRecommended ? (
        <Text variant="caption" tone="tertiary">
          This representation depends on each ear receiving a different signal, so it needs
          headphones. On a speaker the channels mix in the air before they reach you.
        </Text>
      ) : null}

      <HardwareButton
        label={
          option.available
            ? playingThis
              ? `Playing as ${option.label.toLowerCase()}`
              : `Play as ${option.label.toLowerCase()}`
            : 'This representation cannot be produced'
        }
        variant="primary"
        size="lg"
        disabled={!option.available || !protocol}
        accessibilityHint="Runs the usual output-route and level checks before anything sounds."
        onPress={play}
      />
      {compiled && !compiled.ok ? (
        <Text variant="caption" tone="warning">
          {compiled.failure.message}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <HardwareButton
          label="Add to protocol"
          style={styles.action}
          selected={adding}
          onPress={() => {
            setAdding((open) => !open);
            setAddedTo(null);
          }}
        />
        <HardwareButton
          label="Compare"
          style={styles.action}
          onPress={() => router.push({ pathname: '/preset/compare', params: { a: preset.id } })}
        />
      </View>
      <View style={styles.actions}>
        <HardwareButton
          label="Experiment"
          style={styles.action}
          accessibilityHint="Saves this preset as a protocol so the experiment builder can offer it, then opens the builder."
          onPress={() => void startExperiment()}
        />
        <HardwareButton
          label="View DNA"
          style={styles.action}
          selected={showDna}
          onPress={() => setShowDna((open) => !open)}
        />
      </View>

      {adding ? (
        <InstrumentPanel tone="recessed" label="Add to a protocol">
          <Text variant="bodySm" tone="secondary" style={styles.spaced}>
            The preset compiles to one stage. Adding it appends that stage to a protocol you
            already have, or saves it as a protocol of its own.
          </Text>
          {addedTo ? (
            <Text variant="bodySm" tone="signal" style={styles.spaced}>
              {addedTo}
            </Text>
          ) : null}
          <HardwareButton
            label="Save as a new protocol"
            style={styles.spaced}
            disabled={!protocol}
            onPress={() => void saveAsProtocol()}
          />
          {summariseLibrary(protocols).map((summary, index) => (
            <Pressable
              key={summary.id}
              onPress={() => void addToProtocol(protocols[index])}
              accessibilityRole="button"
              accessibilityLabel={`Append ${preset.name} to ${summary.name}`}
              style={styles.targetRow}
            >
              <View style={styles.targetText}>
                <Text variant="bodySm" numberOfLines={1}>
                  {summary.name}
                </Text>
                <Label tone="tertiary">
                  {summary.stageCount} {summary.stageCount === 1 ? 'stage' : 'stages'} ·{' '}
                  {formatClock(summary.durationSec)}
                </Label>
              </View>
              <Label tone="signal">Append</Label>
            </Pressable>
          ))}
        </InstrumentPanel>
      ) : null}

      {showDna && dna && protocol ? (
        <InstrumentPanel tone="flat" label="Protocol DNA">
          <DnaChip human={dna.human} fingerprint={dna.fingerprint} />
          <View style={styles.spaced}>
            <PanelRow label="Summary" value={dna.human} />
            <PanelRow label="Short id" value={dna.shortFingerprint} />
            <PanelRow label="Engine" value={dna.dspVersion} />
            <PanelRow label="Schema" value={`v${dna.schemaVersion}`} />
            <PanelRow label="Preset version" value={`v${preset.version}`} />
          </View>
          <Text variant="readoutXs" tone="secondary" style={styles.fingerprint}>
            {dna.fingerprint}
          </Text>
          <HardwareButton
            label="Copy full DNA"
            size="sm"
            style={styles.spaced}
            onPress={() => {
              haptics.confirm();
              void Clipboard.setStringAsync(dna.fingerprint);
            }}
          />
          <Text variant="caption" tone="tertiary" style={styles.spaced}>
            The fingerprint covers the sound and nothing else — not the name, not the description,
            not the time it was made. Compiling this preset at this representation again, on any
            device, produces the same one.
          </Text>
        </InstrumentPanel>
      ) : null}

      <SectionHeader label="How Frequency Lab generates it" />
      <Text variant="bodySm" tone="secondary">
        The sentence above and the chain below come from the same compiler, so what is described
        and what is built cannot come apart. Choosing a different representation rebuilds both.
      </Text>
      {protocol ? (
        <InstrumentPanel tone="flat" bare>
          <View style={styles.flow}>
            <SignalFlowView graph={protocol.stages[0].graph} />
          </View>
        </InstrumentPanel>
      ) : null}
      <InstrumentPanel tone="flat">
        <PanelRow label="Representation" value={option.label} />
        {option.transform?.carrierHz !== undefined ? (
          <PanelRow
            label="Carrier"
            value={`${formatPresetHz(option.transform.carrierHz)} Hz`}
          />
        ) : null}
        {option.transform?.channels ? (
          <PanelRow
            label="Channels"
            value={`${formatPresetHz(option.transform.channels.leftHz)} / ${formatPresetHz(
              option.transform.channels.rightHz,
            )} Hz`}
          />
        ) : null}
        {preset.representation.noiseColor && (preset.representation.noiseLevel ?? 0) > 0 ? (
          <PanelRow
            label="Noise bed"
            value={`${preset.representation.noiseColor} at ${Math.round(
              (preset.representation.noiseLevel ?? 0) * 100,
            )}%`}
          />
        ) : null}
      </InstrumentPanel>
      {option.equivalenceNote ? (
        <View style={styles.caveat}>
          <Text variant="caption" tone="warning">
            {option.equivalenceNote}
          </Text>
        </View>
      ) : null}

      <SectionHeader label="Acoustic representation" />
      <Text variant="caption" tone="tertiary">
        A preset ships with one representation and it is a suggestion. Options that cannot honestly
        be produced for this value stay listed with the reason, because a missing row would look
        like an oversight and a substituted one would be a lie.
      </Text>
      <RepresentationPicker
        options={options}
        selected={option.kind}
        onSelect={(next) => setChosen(next.kind)}
      />

      <SectionHeader label="Popular associations" />
      {preset.associations.length > 0 ? (
        preset.associations.map((association, index) => (
          <ClaimEvidenceCard key={index} association={association} />
        ))
      ) : (
        <Text variant="bodySm" tone="tertiary">
          {libraryEntries.length + archiveEntries.length > 0
            ? 'No claim is attached to this preset itself. What is said about the number is in the linked material below, with the answer to it.'
            : 'No claim is attached to this preset and nothing is linked to it. It is an acoustic configuration and this app says nothing more about it.'}
        </Text>
      )}

      <SectionHeader label="What has been studied" />
      {libraryEntries.length > 0 ? (
        libraryEntries.map((entry) => (
          <Pressable
            key={entry.id}
            onPress={() => router.push(`/library/${entry.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${entry.title}. ${entry.whatHasBeenStudied}`}
            style={styles.entry}
          >
            <Text variant="heading">{entry.title}</Text>
            <Text variant="bodySm" tone="secondary" style={styles.spaced}>
              {entry.whatHasBeenStudied}
            </Text>
            <Label tone="signal">Open the library entry</Label>
          </Pressable>
        ))
      ) : (
        <Text variant="bodySm" tone="tertiary">
          No library entry is linked to this preset, so this app makes no statement about what has
          been studied at this value.
        </Text>
      )}

      <SectionHeader label="What has not been established" />
      {libraryEntries.length > 0 ? (
        libraryEntries.map((entry) => (
          <View key={entry.id} style={styles.entry}>
            <Label>{entry.title}</Label>
            <Text variant="bodySm" style={styles.spaced}>
              {entry.whatHasNotBeenEstablished}
            </Text>
          </View>
        ))
      ) : (
        <Text variant="bodySm" tone="tertiary">
          With no entry linked there is nothing to report here either. An absence of a linked study
          is not evidence of an effect.
        </Text>
      )}

      <SectionHeader label="Source and origin" />
      {archiveEntries.length > 0 ? (
        archiveEntries.map((entry) => (
          <ArchiveCard
            key={entry.id}
            entry={entry}
            matchReason={`${entry.source.title}${entry.source.year ? ` · ${entry.source.year}` : ''}`}
            onPress={() => router.push(`/archive/${entry.id}`)}
          />
        ))
      ) : (
        <Text variant="bodySm" tone="tertiary">
          No archive record is linked to this preset. Its origin is the configuration itself rather
          than a historical document.
        </Text>
      )}
      {libraryEntries.some((entry) => entry.sources.length > 0) ? (
        <InstrumentPanel tone="recessed" label="References behind the linked entries">
          {libraryEntries.flatMap((entry) =>
            entry.sources.map((source, index) => (
              <Text
                key={`${entry.id}-${index}`}
                variant="caption"
                tone="secondary"
                style={styles.source}
              >
                {source.authors} ({source.year}). {source.title}. {source.publication}.
              </Text>
            )),
          )}
        </InstrumentPanel>
      ) : null}

      <SectionHeader label="Related frequencies" />
      {alsoHere.length > 0 ? (
        alsoHere.map(({ preset: other, as }) => (
          <PresetCard
            key={`${other.id}-${as}`}
            preset={other}
            matchReason={
              as === 'source'
                ? `Holds the same value as its source frequency`
                : `Uses ${formatPresetHz(preset.sourceFrequency.value)} Hz as its carrier, which is a different job for the same number`
            }
            favorite={favorites.includes(other.id)}
            onPress={() => router.push(`/preset/${other.id}`)}
          />
        ))
      ) : (
        <Text variant="bodySm" tone="tertiary">
          {preset.sourceFrequency.value === 0
            ? 'This preset holds no frequency, so there is no value for anything to be related to.'
            : 'No other preset in this app holds this value.'}
        </Text>
      )}
      {related.length > 0 ? (
        <>
          <InstrumentPanel tone="flat" bare>
            {related.map((relation) => (
              <View key={relation.ratio} style={styles.relationRow}>
                <Label>{relation.ratio}</Label>
                <Text variant="bodySm" tone="secondary" style={styles.relationLabel}>
                  {relation.label}
                </Text>
                <Text variant="readoutSm">{formatPresetHz(relation.frequency)} Hz</Text>
              </View>
            ))}
          </InstrumentPanel>
          <Text variant="caption" tone="tertiary">
            These are arithmetic relationships and nothing more. Two frequencies an octave apart are
            related by a ratio of two; that is a fact about numbers and carries no claim that they
            do the same thing.
          </Text>
        </>
      ) : null}

      <SectionHeader label="Personal results" />
      {mine.length > 0 ? (
        <>
          <InstrumentPanel tone="flat">
            <PanelRow label="Sessions" value={String(mine.length)} />
            <PanelRow
              label="Listened"
              value={formatClock(
                mine.reduce((total, session) => total + session.metrics.playedSec, 0),
              )}
            />
            <PanelRow
              label="Rated"
              value={String(mine.filter((session) => session.ratings.length > 0).length)}
            />
          </InstrumentPanel>
          {mine.slice(0, 5).map((session) => (
            <Pressable
              key={session.id}
              onPress={() => router.push(`/rate/${session.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Session on ${new Date(session.startedAt).toLocaleDateString()}`}
              style={styles.targetRow}
            >
              <View style={styles.targetText}>
                <Text variant="bodySm">{new Date(session.startedAt).toLocaleDateString()}</Text>
                <Label tone="tertiary">
                  {formatClock(session.metrics.playedSec)} ·{' '}
                  {session.ratings.length > 0
                    ? session.ratings
                        .map((rating) => `${rating.metric} ${rating.value.toFixed(1)}`)
                        .join(' · ')
                    : 'not rated'}
                </Label>
              </View>
              <Label tone="signal">{session.ratings.length > 0 ? 'Open' : 'Rate'}</Label>
            </Pressable>
          ))}
          <Text variant="caption" tone="tertiary">
            Your own sessions, and nothing inferred from them. A handful of ratings is a personal
            record, not a result.
          </Text>
        </>
      ) : (
        <Text variant="bodySm" tone="tertiary">
          You have not run this preset yet. When you do, the sessions and any ratings you give them
          collect here — sessions shorter than thirty seconds are not recorded.
        </Text>
      )}

      {preset.aliases.length > 0 || preset.tags.length > 0 ? (
        <InstrumentPanel tone="recessed" label="Also known as">
          <Text variant="bodySm" tone="secondary">
            {[...preset.aliases, ...preset.tags].join(' · ')}
          </Text>
        </InstrumentPanel>
      ) : null}
    </Screen>
  );
}

/**
 * A short, unique-enough suffix for the ids appended to a protocol.
 *
 * Module scope rather than inline, because the clock is impure and reading it
 * during render is how a value ends up changing on a re-render nobody asked
 * for. The same reason `experiment/new.tsx` generates its ids out here.
 */
function freshSuffix(): string {
  return Date.now().toString(36);
}


const styles = StyleSheet.create({
  star: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRecessed,
  },
  starOn: { backgroundColor: colors.surfaceRaised },
  hero: { padding: space.xl, gap: space.xxs },
  heroValue: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  heroPlaceholder: { marginVertical: space.xs },
  heroUnit: { marginBottom: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  spaced: { marginTop: space.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  actions: { flexDirection: 'row', gap: space.sm },
  action: { flex: 1 },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    minHeight: MIN_TOUCH_TARGET,
  },
  targetText: { flex: 1, gap: 2 },
  fingerprint: { marginTop: space.sm, lineHeight: 16 },
  flow: { paddingVertical: space.md },
  caveat: {
    paddingLeft: space.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.warning,
  },
  entry: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.xxs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
  },
  source: { marginBottom: space.sm },
  relationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  relationLabel: { flex: 1 },
});
