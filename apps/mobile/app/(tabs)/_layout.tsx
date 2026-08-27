import { Pressable, StyleSheet, View } from 'react-native';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatClock } from '@frequencylab/dsp-core';
import { colors, radius, space } from '../../src/design/tokens';
import { Label, Text } from '../../src/design/components/Text';
import * as haptics from '../../src/design/haptics';
import { usePlayer } from '../../src/state/player';
import { usePreferences } from '../../src/state/preferences';

const TABS = [
  { name: 'index', label: 'Home', route: '/' },
  { name: 'explore', label: 'Explore', route: '/explore' },
  { name: 'lab', label: 'Lab', route: '/lab' },
  { name: 'experiments', label: 'Trials', route: '/experiments' },
  { name: 'profile', label: 'Profile', route: '/profile' },
] as const;

export default function TabsLayout() {
  const level = usePreferences((state) => state.preferences.experienceLevel);

  return (
    <Tabs
      tabBar={(props) => <InstrumentTabBar activeIndex={props.state.index} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" />
      {/* Lab stays in the bar at every level: hiding it would make the app feel
          smaller than it is, and the screen itself explains what it is for. */}
      <Tabs.Screen name="lab" options={{ title: level === 'simple' ? 'Lab' : 'Lab' }} />
      <Tabs.Screen name="experiments" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

/**
 * The tab bar.
 *
 * It doubles as the mini transport: whenever a session is running, the bar
 * grows a strip showing the protocol, the live beat and the remaining time, and
 * tapping it returns to the instrument. That is the one persistent piece of
 * chrome in the product, so it earns its height by carrying state.
 */
function InstrumentTabBar({ activeIndex }: { activeIndex: number }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const snapshot = usePlayer((state) => state.snapshot);

  const playing = snapshot.state === 'playing' || snapshot.state === 'paused';
  const telemetry = snapshot.telemetry;
  const showTransport = playing && pathname !== '/session';

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + space.xs }]}>
      {showTransport ? (
        <Pressable
          onPress={() => {
            haptics.engage();
            router.push('/session');
          }}
          accessibilityRole="button"
          accessibilityLabel={`Return to the running session, ${snapshot.protocolName}`}
          style={styles.transport}
        >
          <View style={[styles.pulse, snapshot.state === 'paused' ? styles.pulsePaused : null]} />
          <View style={styles.transportText}>
            <Text variant="readoutSm" numberOfLines={1}>
              {snapshot.protocolName ?? 'Session'}
            </Text>
            <Label>
              {telemetry ? `${telemetry.stageName} · ${formatBeat(telemetry)}` : 'Preparing'}
            </Label>
          </View>
          <Text variant="readoutSm" tone="secondary">
            {telemetry ? formatClock(telemetry.durationSec - telemetry.positionSec) : '--:--'}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.tabs}>
        {TABS.map((tab, index) => {
          const active = index === activeIndex;
          return (
            <Pressable
              key={tab.name}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
              onPress={() => {
                if (active) return;
                haptics.engage();
                router.replace(tab.route);
              }}
              style={styles.tab}
            >
              <View style={[styles.tabIndicator, active ? styles.tabIndicatorActive : null]} />
              <Text variant="label" uppercase tone={active ? 'primary' : 'tertiary'}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function formatBeat(telemetry: NonNullable<ReturnType<typeof usePlayer.getState>['snapshot']['telemetry']>): string {
  const beat = telemetry.readouts['tone:beat'] ?? telemetry.readouts['tone:pulse'];
  return beat ? `${beat.toFixed(2)} Hz` : 'Running';
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.chassis,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairlineStrong,
    paddingTop: space.xs,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm,
    gap: space.xs,
    minHeight: 48,
  },
  tabIndicator: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'transparent',
  },
  tabIndicatorActive: {
    backgroundColor: colors.signal,
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
  },
  transportText: { flex: 1, gap: 2 },
  pulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.signal,
  },
  pulsePaused: { backgroundColor: colors.warning },
});
