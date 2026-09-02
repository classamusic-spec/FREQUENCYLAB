import type { ReactElement } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Tabs, usePathname, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatClock } from '@frequencylab/dsp-core';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, motion, radius, shadows, space } from '../../src/design/tokens';
import { LIGHT, SURFACES } from '../../src/design/materials';
import { Label, Text } from '../../src/design/components/Text';
import {
  DialIcon,
  FlaskIcon,
  LibraryIcon,
  PersonIcon,
  PulseIcon,
  WaveformIcon,
  type IconProps,
} from '../../src/design/components/Icons';
import * as haptics from '../../src/design/haptics';
import { useReducedMotion } from '../../src/design/useReducedMotion';
import { usePlayer } from '../../src/state/player';
import { paceInPlainWords, useTier, type Capability } from '../../src/features/tier';

/**
 * One item in the bar.
 *
 * `screen` is the route's name inside this group, and it is what decides
 * whether the item is the one currently lit — not its position, which now
 * changes with the tier. `null` marks a destination that is not a tab at all,
 * which is only ever the Profile modal.
 */
interface BarItem {
  screen: string | null;
  href: Href;
  label: string;
  Icon: (props: IconProps) => ReactElement;
}

/**
 * Below this the bar stops reading as a set of places and starts reading as a
 * control that failed to load. Two items is the number that looks broken; it is
 * a layout floor rather than anything the tier has an opinion about.
 */
const MIN_BAR_ITEMS = 3;

/**
 * What the bar lists at this level.
 *
 * Everything here is a question about *destinations*. The screens themselves
 * decide what vocabulary they use once you are on them — this only decides
 * which of them are worth a permanent slot along the bottom edge.
 */
function barItems(canSee: (capability: Capability) => boolean, isSimple: boolean): BarItem[] {
  const items: BarItem[] = [
    { screen: 'index', href: '/', label: 'Player', Icon: WaveformIcon },
  ];

  if (canSee('explore')) {
    items.push({ screen: 'explore', href: '/explore', label: 'Explore', Icon: DialIcon });
  }

  /*
   * The one slot that is renamed rather than removed.
   *
   * `canSee('library')` gates the *frequency library* — the entries, the
   * evidence ratings, the historical archive — and that material lives inside
   * this screen alongside the preset shelves. The shelves are not library
   * material: they are the only place in the app where a person browses
   * something to play, and taking that away from Simple would not be hiding
   * vocabulary, it would be removing the second half of the product. So the
   * route is listed at every level, under the word that is true at that level.
   */
  items.push({
    screen: 'library',
    href: '/library',
    label: isSimple ? 'Sounds' : 'Library',
    Icon: LibraryIcon,
  });

  if (canSee('lab')) {
    items.push({ screen: 'lab', href: '/lab', label: 'Lab', Icon: FlaskIcon });
  }
  if (canSee('trials')) {
    items.push({ screen: 'experiments', href: '/experiments', label: 'Trials', Icon: PulseIcon });
  }

  /*
   * Profile, but only when the bar would otherwise be two items wide.
   *
   * The disc in every screen's top right is still the way to Profile at every
   * level, and it is why Profile gave up its tab slot in the first place: a
   * slot cost the five surfaces that *are* the product a sixth of the bottom
   * edge each. At Simple there are two such surfaces, so the argument does not
   * apply — the edge has room, and the screen that holds the safety notices,
   * the listening history and the control that gets you out of Simple is the
   * honest thing to spend the space on.
   */
  if (items.length < MIN_BAR_ITEMS) {
    items.push({ screen: null, href: '/profile', label: 'You', Icon: PersonIcon });
  }

  return items;
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => (
        <InstrumentTabBar activeScreen={props.state.routes[props.state.index]?.name} />
      )}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
    >
      {/*
       * All five screens stay registered at every level, on purpose.
       *
       * The tier decides what the bar *lists*; the navigator still owns the
       * routes. So `/lab` and `/experiments` at Simple — reached by a typed
       * URL, a deep link, or a `router.push` from a screen that has not been
       * tiered yet — still resolve and still render inside this shell, with
       * the bar and the mini transport intact underneath them. Dropping the
       * `Tabs.Screen` would have turned every one of those into a 404, which
       * is a much worse answer than a screen the bar does not advertise.
       *
       * When the focused route is one the bar does not list, nothing in the
       * bar is lit. That is the truthful state: you are somewhere the bar
       * cannot point at, and every item in it is still a way out.
       */}
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="library" />
      <Tabs.Screen name="lab" />
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
 * chrome in the product, so it earns its height by carrying state — at every
 * level, including the ones where the row of destinations underneath is short.
 */
function InstrumentTabBar({ activeScreen }: { activeScreen?: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const snapshot = usePlayer((state) => state.snapshot);
  const { canSee, isSimple } = useTier();
  const items = barItems(canSee, isSimple);

  const playing = snapshot.state === 'playing' || snapshot.state === 'paused';
  const telemetry = snapshot.telemetry;
  const showTransport = playing && pathname !== '/session';

  return (
    <View
      testID="tab-bar"
      style={[styles.container, { paddingBottom: insets.bottom + space.xs }]}
    >
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
          // The dot beside this is the only thing that says playing or paused,
          // and it says it in colour alone. The label has to carry the state
          // too, or a screen reader announces a paused session as a running one.
          accessibilityLabel={`Return to the ${
            snapshot.state === 'paused' ? 'paused' : 'running'
          } session, ${snapshot.protocolName}`}
          style={styles.transport}
        >
          <View
            style={[styles.pulse, snapshot.state === 'paused' ? styles.pulsePaused : null]}
            // Announced by the label above; a second node here would make a
            // screen reader read the state twice.
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <View style={styles.transportText}>
            <Text variant="readoutSm" numberOfLines={1}>
              {snapshot.protocolName ?? 'Session'}
            </Text>
            <Label>
              {telemetry
                ? `${telemetry.stageName} · ${formatBeat(telemetry, canSee('hertz'))}`
                : 'Preparing'}
            </Label>
          </View>
          <Text variant="readoutSm" tone="secondary">
            {telemetry ? formatClock(telemetry.durationSec - telemetry.positionSec) : '--:--'}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.tabs}>
        {items.map((item) => {
          const active = item.screen !== null && item.screen === activeScreen;
          const isTab = item.screen !== null;
          return (
            <TabDisc
              key={item.label}
              item={item}
              active={active}
              isTab={isTab}
              onPress={() => {
                if (active) return;
                haptics.engage();
                if (isTab) router.replace(item.href);
                else router.push(item.href);
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

/**
 * One control in the bar: a machined disc with a glyph on it.
 *
 * ## Why the words went
 *
 * The bar used to caption each icon. Five words along the bottom edge is a
 * sentence a person reads once and then never again — after the first session
 * they navigate by shape and position — and it cost the icons the room to be
 * drawn at a size worth recognising. The labels are gone from the screen and
 * not from the app: `accessibilityLabel` still carries every one of them, so a
 * screen reader announces exactly what it announced before. Dropping a visible
 * word is a design decision; dropping an accessible name would be a defect.
 *
 * ## Why the current tab is *raised* and not merely blue
 *
 * With the caption gone, colour was the only thing left saying which tab you
 * are on, and colour alone does not carry state here (§50). So the two states
 * differ in form as well: the current disc sits proud of the bar with a rim and
 * a shadow, the others lie flush and cast nothing. That difference survives
 * greyscale, and it is the same raised/flush distinction every other control on
 * the chassis uses.
 *
 * ## The light
 *
 * Pressing floods the disc with signal blue — a lamp coming up behind the
 * porcelain rather than a fill being painted over it, which is why the glow
 * sits *under* the glyph and the glyph itself brightens rather than inverting.
 * It rises fast and falls slowly, the way a real indicator does, so the bar
 * still reads as lit for a moment after the finger has gone.
 */
function TabDisc({
  item,
  active,
  isTab,
  onPress,
}: {
  item: BarItem;
  active: boolean;
  isTab: boolean;
  onPress: () => void;
}) {
  const lit = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  const glow = useAnimatedStyle(() => ({ opacity: lit.value }));
  const body = useAnimatedStyle(() => ({
    transform: [{ translateY: reducedMotion ? 0 : lit.value * 1 }],
  }));

  /* eslint-disable react-hooks/immutability */
  const pressIn = () => {
    lit.value = withTiming(1, { duration: motion.instant, easing: Easing.out(Easing.quad) });
  };
  const pressOut = () => {
    lit.value = withTiming(0, { duration: motion.settle, easing: Easing.out(Easing.cubic) });
  };
  /* eslint-enable react-hooks/immutability */

  return (
    <Pressable
      testID={`tab-${item.label}`}
      // Profile is a modal you come back from, not a place in the app you can
      // be, so it is announced as a button. Calling it a tab would promise a
      // selected state it can never have.
      accessibilityRole={isTab ? 'tab' : 'button'}
      accessibilityState={isTab ? { selected: active } : undefined}
      /*
       * `accessibilityState` alone reaches native and is dropped by React
       * Native Web — measured: the rendered tabs carried `aria-label`, `role`
       * and nothing else, so on the web build the current tab was announced
       * exactly like the other four and the only thing distinguishing it was
       * its colour. With the captions gone this matters more, not less.
       */
      aria-selected={isTab ? active : undefined}
      accessibilityLabel={item.label}
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={onPress}
      style={styles.tab}
    >
      <Animated.View style={[styles.disc, active ? styles.discActive : null, body]}>
        <LinearGradient
          colors={SURFACES.buttonCap}
          start={LIGHT.face.start}
          end={LIGHT.face.end}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* The lamp, under the glyph. */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.discLight, glow]} pointerEvents="none" />
        <View style={styles.discGlyph}>
          <item.Icon color={active ? colors.signal : colors.textTertiary} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

/**
 * The live rate, in whichever vocabulary the level uses.
 *
 * The strip is the one readout that follows you onto every screen, so it was
 * also the one place a Simple session still announced itself in hertz — the bar
 * read `SETTLE · 10.00 HZ` while every screen behind it had stopped saying so.
 * The band is the honest resolution of the claim anyway; what is lost is two
 * decimal places nobody at this level asked for.
 */
function formatBeat(
  telemetry: NonNullable<ReturnType<typeof usePlayer.getState>['snapshot']['telemetry']>,
  hertz: boolean,
): string {
  const beat = telemetry.readouts['tone:beat'] ?? telemetry.readouts['tone:pulse'];
  if (!beat) return 'Running';
  return hertz ? `${beat.toFixed(2)} Hz` : paceInPlainWords(beat);
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
    // The whole cell stays a full target even though the disc inside it is 44:
    // a bar is tapped in a hurry, at the very bottom edge of the screen.
    minHeight: 52,
    paddingVertical: space.xxs,
  },
  /**
   * The flush state. A hairline rim and no shadow — it is part of the bar's
   * face rather than a part lying on it, which is what leaves room for the
   * current tab to sit proud without the whole row looking embossed.
   */
  disc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  /** The current tab: proud of the bar, with a lit rim. */
  discActive: {
    borderColor: colors.signal,
    borderWidth: 1.5,
    ...shadows.float,
  },
  // The lamp behind the porcelain, revealed on press rather than painted over
  // the face — so the glyph stays legible at full brightness.
  discLight: {
    backgroundColor: 'rgba(59,139,245,0.22)',
    shadowColor: colors.signal,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  discGlyph: { zIndex: 1 },
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
