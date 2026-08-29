import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import {
  AMBIENT_AWARENESS_NOTICE,
  DSP_VERSION,
  NOT_MEDICAL_NOTICE,
  PROTOCOL_SCHEMA_VERSION,
  VOLUME_GUIDANCE,
  dailyTotals,
  formatClock,
  listeningSummary,
  type ExperienceLevel,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../src/design/components/Screen';
import { InstrumentPanel, PanelDivider, PanelRow } from '../src/design/components/InstrumentPanel';
import { HardwareButton } from '../src/design/components/HardwareButton';
import { ListeningTrend } from '../src/design/components/ListeningTrend';
import { SegmentSelector } from '../src/design/components/SegmentSelector';
import { Label, Text } from '../src/design/components/Text';
import { MIN_TOUCH_TARGET, colors, layout, radius, space } from '../src/design/tokens';
import * as haptics from '../src/design/haptics';
import { confirm, notify } from '../src/design/dialogs';
import { usePreferences } from '../src/state/preferences';
import { useTier } from '../src/features/tier';
import { SafetyBanner } from '../src/design/components/SafetyBanner';
import { useHistory } from '../src/state/history';
import { useProtocolLibrary } from '../src/state/library';
import { buildExport } from '../src/storage/repositories';
import { clearAll } from '../src/storage/store';

const APP_VERSION = (Constants.expoConfig?.version as string) ?? '0.1.0';

/** Days plotted in the trend. A month is long enough to show a habit forming. */
const TREND_DAYS = 30;

/**
 * What each level actually does, now that it does something.
 *
 * One line, and only the selected one is drawn — the note belongs to the
 * control rather than to the screen, so choosing a level reads it back to you
 * instead of making you find your row in a paragraph of three.
 *
 * Each line names what is *added or withheld*, never what is better. Simple is
 * not a beginner's version of the instrument; it is the instrument without its
 * vocabulary, and the constant below says the part that never varies.
 */
const LEVEL_NOTES: Record<ExperienceLevel, string> = {
  simple: 'Player and sounds. No frequencies, no builder, no trials.',
  explorer: 'Adds frequencies, the library, and how each session is played.',
  lab: 'Everything: the builder, trials, Protocol DNA and diagnostics.',
};

/** The half of the app no level touches, said where the level is chosen. */
const LEVEL_CONSTANT = 'Every rating and safety notice is shown at all three.';

/**
 * Profile (§48, §50, §74).
 *
 * Settings, history, and the two things a product handling personal data owes
 * its user without being asked: a complete export, and a real delete.
 *
 * The only screen where the experience level is the *subject* rather than the
 * reason, so it is the only one that reads the level directly. Two things here
 * are never tiered and should stay that way: the safety notices, which are the
 * claim-limiting statements the whole product rests on, and Your data, which is
 * a right rather than a power feature. Everything the tier does remove is
 * engineering vocabulary — the sample rate, the reference pitch, the engine
 * versions, Diagnostics — each gated on the capability that names why.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const preferences = usePreferences((state) => state.preferences);
  const update = usePreferences((state) => state.update);
  /*
   * The one screen that reads the level itself as well as its capabilities:
   * the control that sets it lives here, so the level is the subject rather
   * than the reason.
   */
  const { canSee } = useTier();
  const sessions = useHistory((state) => state.sessions);
  const storageError = useHistory((state) => state.storageError);
  const protocols = useProtocolLibrary((state) => state.protocols);
  const [exporting, setExporting] = useState(false);

  /**
   * The one impure step, kept here on purpose.
   *
   * `listeningSummary` and `dailyTotals` never read a clock or a zone, so both
   * have to be told what "now" is and how far east the device sits — otherwise
   * the same history would summarise differently on two phones. Reading them
   * once per history change keeps the screen stable while it is open, and keeps
   * the analysis itself testable.
   */
  const trend = useMemo(() => {
    const now = new Date().toISOString();
    const timeZoneOffsetMinutes = -new Date().getTimezoneOffset();
    return {
      summary: listeningSummary(sessions, { now, timeZoneOffsetMinutes }),
      days: dailyTotals(sessions, { now, timeZoneOffsetMinutes, days: TREND_DAYS }),
    };
  }, [sessions]);
  const { summary } = trend;
  const windowSec = trend.days.reduce((sum, day) => sum + day.playedSec, 0);

  const exportData = async () => {
    setExporting(true);
    try {
      const payload = await buildExport(APP_VERSION);
      await Clipboard.setStringAsync(JSON.stringify(payload, null, 2));
      haptics.confirm();
      notify(
        'Copied to clipboard',
        'Your complete data — protocols, sessions, ratings, experiments and settings — is now on the clipboard as JSON. Paste it anywhere you like.',
      );
    } finally {
      setExporting(false);
    }
  };

  const deleteEverything = async () => {
    const agreed = await confirm({
      title: 'Delete all data?',
      message:
        'This permanently removes every protocol, session, rating and experiment on this device. It cannot be undone. Export first if you want a copy.',
      confirmLabel: 'Delete everything',
      destructive: true,
    });
    if (!agreed) return;
    await clearAll();
    haptics.warn();
    router.replace('/onboarding');
  };

  return (
    <Screen bottomInset={layout.transportHeight}>
      {/* A modal reached from the disc in every screen's top right, and the
          stack draws no header of its own, so the way back has to be here. */}
      <ScreenHeader
        eyebrow="Profile"
        title="You"
        subtitle="Settings, history and your data."
        right={<HardwareButton label="Done" size="sm" onPress={() => router.back()} />}
      />

      {/*
          A write that failed, said out loud. The list below is the in-memory
          one and is what the user's session actually was; if it did not reach
          disk they need to know before they close the app, not after.
        */}
      {storageError ? (
        <SafetyBanner
          check={{
            id: 'history-write-failed',
            level: 'warning',
            title: 'Not saved to this device',
            message: storageError,
          }}
        />
      ) : null}

      <InstrumentPanel
        tone="raised"
        label="History"
        headerRight={
          summary.totalSessions > 0 ? (
            <Label>{`Last ${TREND_DAYS} days`}</Label>
          ) : null
        }
      >
        {summary.totalSessions === 0 ? (
          // Zeros in every field would look like a measurement. There has been
          // no measurement, so the panel says so and says what would fill it.
          <View style={styles.emptyTrend}>
            <Text variant="bodySm" tone="secondary">
              Nothing recorded on this device yet, so there is no trend to draw — not a flat one,
              and not a zero.
            </Text>
            <Text variant="caption" tone="tertiary">
              After your first session this plots your daily listening over {TREND_DAYS} days.
              Sessions under thirty seconds are never recorded.
            </Text>
          </View>
        ) : (
          <>
            <ListeningTrend days={trend.days} />

            {windowSec === 0 ? (
              <Text variant="caption" tone="tertiary" style={styles.trendNote}>
                The line is flat because nothing falls inside this window — your{' '}
                {summary.totalSessions === 1 ? 'session is' : 'sessions are'} older than{' '}
                {TREND_DAYS} days, not missing.
              </Text>
            ) : null}

            <PanelDivider />

            <View style={styles.statRow}>
              <Stat label="Streak" value={String(summary.currentStreakDays)} unit="days" />
              <Stat label="Longest" value={String(summary.longestStreakDays)} unit="days" />
              <Stat label="Avg session" value={formatClock(summary.averageSessionSec)} />
            </View>
            {/* The rule, in the same words as the JSDoc that implements it. */}
            <Text variant="caption" tone="tertiary" style={styles.trendNote}>
              A streak is consecutive days with at least one session, however short. Today not
              having one yet does not break it — a day only counts as missed once it is over.
            </Text>

            <PanelDivider />

            <PanelRow label="Total listening" value={formatClock(summary.totalPlayedSec)} />
            <PanelRow label={`Last ${TREND_DAYS} days`} value={formatClock(windowSec)} />
            <PanelRow label="Sessions" value={String(summary.totalSessions)} />
            <PanelRow label="Rated" value={`${summary.ratedCount} of ${summary.totalSessions}`} />
            <PanelRow label="Protocols" value={String(protocols.length)} />

            <PanelDivider />
            <Pressable
              onPress={() => router.push('/history')}
              accessibilityRole="button"
              accessibilityLabel="View all sessions"
              // A bare `Pressable` around a `Label` measured 358 × 13.
              style={styles.viewAll}
            >
              <Label tone="signal">View all sessions</Label>
            </Pressable>
          </>
        )}
      </InstrumentPanel>

      <SectionHeader label="Experience level" />
      <SegmentSelector
        accessibilityLabel="Experience level"
        options={[
          { value: 'simple', label: 'Simple' },
          { value: 'explorer', label: 'Explorer' },
          { value: 'lab', label: 'Lab' },
        ]}
        value={preferences.experienceLevel}
        onChange={(value) => void update({ experienceLevel: value as ExperienceLevel })}
      />
      <Text variant="caption" tone="tertiary">
        {LEVEL_NOTES[preferences.experienceLevel]} {LEVEL_CONSTANT}
      </Text>

      <SectionHeader label="Accessibility" />
      <InstrumentPanel tone="flat">
        <ToggleRow
          label="Reduce motion"
          description="Removes animation rather than shortening it. Your system setting also applies."
          value={preferences.reducedMotion}
          onChange={(value) => void update({ reducedMotion: value })}
        />
        <PanelDivider />
        <ToggleRow
          label="Haptics"
          // "Encoder detents" named the mechanism rather than the feeling, and
          // it was the only word here a Simple user could not place.
          description="Buttons, dials and stage changes."
          value={preferences.hapticsEnabled}
          onChange={(value) => void update({ hapticsEnabled: value })}
        />
      </InstrumentPanel>

      <SectionHeader label="Audio" />
      <InstrumentPanel tone="flat">
        {/* Volume is not engineering. It is the number the safety notices below
            are about, so it is on this panel at every level. */}
        <PanelRow label="Comfortable level" value={`${Math.round(preferences.comfortableOutputLevel * 100)}%`} />
        {canSee('engineering') ? (
          <PanelRow label="Sample rate" value={`${preferences.sampleRate} Hz`} />
        ) : null}
        {canSee('signalDetail') ? (
          <PanelRow
            label="Binaural default"
            value={preferences.defaultBinauralMode === 'centered' ? 'Centred' : 'Offset'}
          />
        ) : null}
        {/* Read-only mirror of what the note sheet sets. The control lives next
            to the note you are typing, where a reference pitch means something;
            here it is only worth being able to see — and only to somebody who
            is being shown pitches in the first place. */}
        {canSee('hertz') ? (
          <PanelRow label="Note reference" value={`A4 = ${preferences.noteReferenceHz} Hz`} />
        ) : null}
        <PanelDivider />
        <View style={styles.buttonRow}>
          {/* Calibration sets the comfortable level, which is a safety control
              and stays. Diagnostics is the engine talking about itself. */}
          <HardwareButton
            label="Recalibrate"
            size="sm"
            onPress={() => router.push('/calibration')}
          />
          {canSee('engineering') ? (
            <HardwareButton
              label="Diagnostics"
              size="sm"
              variant="ghost"
              onPress={() => router.push('/diagnostics')}
            />
          ) : null}
        </View>
      </InstrumentPanel>

      {/* Never tiered. Export and delete are what a person is owed for their
          own records, not a power feature, so both are here at every level. */}
      <SectionHeader label="Your data" />
      <InstrumentPanel tone="flat">
        <Text variant="bodySm" tone="secondary">
          Everything you create stays on this device. There is no account, nothing is uploaded, and
          the export is the complete record — not a summary of it.
        </Text>
        <View style={styles.buttonRow}>
          <HardwareButton
            label={exporting ? 'Exporting' : 'Export all data'}
            size="sm"
            loading={exporting}
            onPress={exportData}
          />
          <HardwareButton label="Delete all data" size="sm" variant="danger" onPress={deleteEverything} />
        </View>
      </InstrumentPanel>

      <SectionHeader label="Safety" />
      <InstrumentPanel tone="flat">
        <Text variant="bodySm" tone="secondary" style={styles.paragraph}>
          {VOLUME_GUIDANCE}
        </Text>
        <Text variant="bodySm" tone="secondary" style={styles.paragraph}>
          {AMBIENT_AWARENESS_NOTICE}
        </Text>
        <Text variant="bodySm" tone="secondary" style={styles.paragraph}>
          {NOT_MEDICAL_NOTICE}
        </Text>
      </InstrumentPanel>

      {/* Shortcuts into the archive and the shelves. At Simple the Sounds tab
          is already the way to the shelves, and the archive is library
          material, so the whole block goes rather than being reworded. */}
      {canSee('library') ? (
        <>
          <SectionHeader label="Library" />
          <HardwareButton label="Preset collections" onPress={() => router.push('/collections')} />
          <HardwareButton label="Frequency library" onPress={() => router.push('/library')} />
          <HardwareButton label="Historical archive" onPress={() => router.push('/archive')} />
        </>
      ) : null}
      {canSee('lab') ? (
        <HardwareButton label="AI protocol designer" onPress={() => router.push('/ai')} />
      ) : null}
      {canSee('dna') ? (
        <HardwareButton label="Import Protocol DNA" variant="ghost" onPress={() => router.push('/dna-import')} />
      ) : null}

      {/* The roadmap this used to print named Explorer, Lab, routing and WAV
          export to a reader who may have been shown none of them. What was
          load-bearing in it was the promise, which is what is left. */}
      <SectionHeader label="Plans" />
      <InstrumentPanel tone="flat">
        <Text variant="bodySm" tone="secondary">
          Every feature in this build is unlocked. There is no billing in it, nothing here will ask
          for money, and nothing is gated behind a countdown.
        </Text>
      </InstrumentPanel>

      <SectionHeader label="About" />
      <InstrumentPanel tone="recessed">
        <PanelRow label="App" value={APP_VERSION} />
        {canSee('engineering') ? (
          <>
            <PanelRow label="DSP engine" value={DSP_VERSION} />
            <PanelRow label="Protocol schema" value={`v${PROTOCOL_SCHEMA_VERSION}`} />
          </>
        ) : null}
      </InstrumentPanel>
    </Screen>
  );
}

/** A readout with its engraved caption above and its unit set small beside it. */
function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={styles.stat}>
      <Label>{label}</Label>
      <View style={styles.statValue}>
        <Text variant="readoutLg">{value}</Text>
        {unit ? (
          <Text variant="caption" tone="tertiary" style={styles.statUnit}>
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => {
        haptics.engage();
        onChange(!value);
      }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={description}
      style={styles.toggleRow}
    >
      <View style={styles.toggleText}>
        <Text variant="heading">{label}</Text>
        <Text variant="caption" tone="tertiary">
          {description}
        </Text>
      </View>
      <View style={[styles.switch, value ? styles.switchOn : null]}>
        <View style={[styles.switchKnob, value ? styles.switchKnobOn : null]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  viewAll: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  stat: { gap: 2, flex: 1 },
  statValue: { flexDirection: 'row', alignItems: 'baseline', gap: space.xxs },
  statUnit: { flexShrink: 1 },
  emptyTrend: { gap: space.sm },
  trendNote: { marginTop: space.sm },
  buttonRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  paragraph: { marginBottom: space.sm },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.lg,
    paddingVertical: space.xs,
    minHeight: 48,
  },
  toggleText: { flex: 1, gap: 2 },
  switch: {
    width: 46,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRecessed,
    padding: 3,
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  switchOn: { backgroundColor: colors.signalDim, borderColor: colors.signal },
  switchKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.panelHigh,
  },
  switchKnobOn: { alignSelf: 'flex-end', backgroundColor: colors.text },
});
