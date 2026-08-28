import { useState } from 'react';
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
  formatClock,
  type ExperienceLevel,
} from '@frequencylab/dsp-core';
import { Screen, ScreenHeader, SectionHeader } from '../../src/design/components/Screen';
import { InstrumentPanel, PanelDivider, PanelRow } from '../../src/design/components/InstrumentPanel';
import { HardwareButton } from '../../src/design/components/HardwareButton';
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

  const totalPlayed = sessions.reduce((sum, session) => sum + session.metrics.playedSec, 0);
  const rated = sessions.filter((session) => session.ratings.length > 0).length;

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

      <InstrumentPanel tone="raised" label="History">
        <View style={styles.statRow}>
          <Stat label="Sessions" value={String(sessions.length)} />
          <Stat label="Rated" value={String(rated)} />
          <Stat label="Listening" value={formatClock(totalPlayed)} />
          <Stat label="Protocols" value={String(protocols.length)} />
        </View>
        <PanelDivider />
        <Pressable onPress={() => router.push('/history')} accessibilityRole="button">
          <Label tone="signal">View all sessions</Label>
        </Pressable>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Label>{label}</Label>
      <Text variant="readoutLg">{value}</Text>
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
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { gap: 2, flex: 1 },
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
