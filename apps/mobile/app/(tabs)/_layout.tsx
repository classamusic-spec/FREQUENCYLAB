import { Pressable, StyleSheet, View } from 'react-native';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatClock } from '@frequencylab/dsp-core';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, space } from '../../src/design/tokens';
import { LIGHT, SURFACES } from '../../src/design/materials';
import { Label, Text } from '../../src/design/components/Text';
import {
  DialIcon,
  FlaskIcon,
  LibraryIcon,
  PulseIcon,
  WaveformIcon,
} from '../../src/design/components/Icons';
import * as haptics from '../../src/design/haptics';
import { usePlayer } from '../../src/state/player';
import { usePreferences } from '../../src/state/preferences';

/*
 * The bar. Order here must match the `Tabs.Screen` order below, because the
 * active index comes from the navigator's own state.
 *
 * Library earns a tab rather than a row in Settings. Seventy-two factory
 * presets, seventy-three archive entries and the frequency library were all
 * reachable only by opening Profile — the last tab, which reads as Settings —
 * and scrolling past the safety notices to a button. Content nobody can find is
 * content that is not there, and this is most of what the app knows.
 *
 * Profile went the other way, to a disc in the top right of every main screen.
 * A tab slot is expensive: it costs the five surfaces that *are* the product a
 * sixth of the bottom edge each, permanently, for a screen most people open
 * about as often as they change their address. A corner is the right size for
 * it, and the top right is where people already look for their own account.
 */
const TABS = [
  { name: 'index', label: 'Player', route: '/', Icon: WaveformIcon },
  { name: 'explore', label: 'Explore', route: '/explore', Icon: DialIcon },
  { name: 'library', label: 'Library', route: '/library', Icon: LibraryIcon },
  { name: 'lab', label: 'Lab', route: '/lab', Icon: FlaskIcon },
  { name: 'experiments', label: 'Trials', route: '/experiments', Icon: PulseIcon },
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
      <Tabs.Screen name="library" />
      {/* Lab stays in the bar at every level: hiding it would make the app feel
          smaller than it is, and the screen itself explains what it is for. */}
      <Tabs.Screen name="lab" options={{ title: level === 'simple' ? 'Lab' : 'Lab' }} />
      <Tabs.Screen name="experiments" />
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
      <LinearGradient
        colors={SURFACES.panel}
        start={LIGHT.vertical.start}
        end={LIGHT.vertical.end}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.railEdge} pointerEvents="none" />
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
              <View style={active ? styles.tabIconActive : styles.tabIcon}>
                <tab.Icon color={active ? colors.signal : colors.textTertiary} />
              </View>
              <Text variant="label" tone={active ? 'signal' : 'tertiary'}>
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
    backgroundColor: colors.panel,
    paddingTop: space.xs,
    shadowColor: '#1D2430',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  // The seam where the rail meets the case: a dark scribe with a lit lip.
  railEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(84,96,114,0.22)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.9)',
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xs,
    gap: 3,
    minHeight: 52,
  },
  tabIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 26,
    borderRadius: radius.pill,
  },
  // The active glyph sits in a lit ring, the way the reference bar marks its
  // engaged control — a glow, not a filled pill, so the bar stays porcelain.
  tabIconActive: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(59,139,245,0.10)',
    shadowColor: colors.signal,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
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
