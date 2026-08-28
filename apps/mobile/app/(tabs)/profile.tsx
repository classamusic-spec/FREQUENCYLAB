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
import { Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel, PanelDivider, PanelRow } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
import { ListeningTrend } from '../../src/design/components/ListeningTrend';
import { SegmentSelector } from '../../src/design/components/SegmentSelector';
import { Label, Text } from '../../src/design/components/Text';
import { colors, layout, radius, space } from '../../src/design/tokens';
import * as haptics from '../../src/design/haptics';
import { confirm, notify } from '../../src/design/dialogs';
import { usePreferences } from '../../src/state/preferences';
import { useHistory } from '../../src/state/history';
import { useProtocolLibrary } from '../../src/state/library';
import { buildExport } from '../../src/storage/repositories';
import { clearAll } from '../../src/storage/store';

const APP_VERSION = (Constants.expoConfig?.version as string) ?? '0.1.0';

/** Days plotted in the trend. A month is long enough to show a habit forming. */
const TREND_DAYS = 30;

/**
 * Profile (§48, §50, §74).
 *
 * Settings, history, and the two things a product handling personal data owes
 * its user without being asked: a complete export, and a real delete.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const preferences = usePreferences((state) => state.preferences);
  const update = usePreferences((state) => state.update);
  const sessions = useHistory((state) => state.sessions);
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
      <ScreenHeader eyebrow="Profile" title="You" subtitle="Settings, history and your data." />

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
              Nothing to show yet. No sessions have been recorded on this device, so there is no
              trend to draw — not a flat one, and not a zero.
            </Text>
            <Text variant="caption" tone="tertiary">
              After your first session this panel plots daily listening time over the last{' '}
              {TREND_DAYS} days, alongside your longest run of consecutive days. Sessions under
              thirty seconds are never recorded, so an accidental start will not appear here.
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
            <Pressable onPress={() => router.push('/history')} accessibilityRole="button">
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
        This changes which controls are shown first. Every level drives the same engine, and Lab is
        always reachable from the tab bar.
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
          description="Encoder detents, button presses and stage changes."
          value={preferences.hapticsEnabled}
          onChange={(value) => void update({ hapticsEnabled: value })}
        />
      </InstrumentPanel>

      <SectionHeader label="Audio" />
      <InstrumentPanel tone="flat">
        <PanelRow label="Comfortable level" value={`${Math.round(preferences.comfortableOutputLevel * 100)}%`} />
        <PanelRow label="Sample rate" value={`${preferences.sampleRate} Hz`} />
        <PanelRow
          label="Binaural default"
          value={preferences.defaultBinauralMode === 'centered' ? 'Centred' : 'Offset'}
        />
        {/* Read-only mirror of what the note sheet sets. The control lives next
            to the note you are typing, where a reference pitch means something;
            here it is only worth being able to see. */}
        <PanelRow label="Note reference" value={`A4 = ${preferences.noteReferenceHz} Hz`} />
        <PanelDivider />
        <View style={styles.buttonRow}>
          <HardwareButton
            label="Recalibrate"
            size="sm"
            onPress={() => router.push('/calibration')}
          />
          <HardwareButton
            label="Diagnostics"
            size="sm"
            variant="ghost"
            onPress={() => router.push('/diagnostics')}
          />
        </View>
      </InstrumentPanel>

      <SectionHeader label="Your data" />
      <InstrumentPanel tone="flat">
        <Text variant="bodySm" tone="secondary">
          Everything you create lives on this device in plain JSON. There is no account, nothing is
          uploaded, and the export below is the complete record — not a summary of it.
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

      <SectionHeader label="Library" />
      <HardwareButton label="Preset collections" onPress={() => router.push('/collections')} />
      <HardwareButton label="Frequency library" onPress={() => router.push('/library')} />
      <HardwareButton label="Historical archive" onPress={() => router.push('/archive')} />
      <HardwareButton label="AI protocol designer" onPress={() => router.push('/ai')} />
      <HardwareButton label="Import Protocol DNA" variant="ghost" onPress={() => router.push('/dna-import')} />

      <SectionHeader label="Plans" />
      <InstrumentPanel tone="flat">
        <Text variant="bodySm" tone="secondary">
          Every feature in this build is unlocked, and there is no billing integration in it. The
          intended shape is a free tier covering generation, presets, Explorer and history; a Pro
          tier for Lab, automation, routing, the builder, experiments and WAV export; and a research
          tier for AI generation and deeper analysis. Nothing here will ask for money, and nothing is
          gated behind a countdown.
        </Text>
      </InstrumentPanel>

      <SectionHeader label="About" />
      <InstrumentPanel tone="recessed">
        <PanelRow label="App" value={APP_VERSION} />
        <PanelRow label="DSP engine" value={DSP_VERSION} />
        <PanelRow label="Protocol schema" value={`v${PROTOCOL_SCHEMA_VERSION}`} />
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
