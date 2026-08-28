import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { KnobFace } from './KnobFace';
import { BrushedGrain } from './Surface';
import { Text } from './Text';
import { LIGHT, SURFACES } from '../materials';
import { colors, motion, space } from '../tokens';
import { useReducedMotion } from '../useReducedMotion';

export interface SplashSequenceProps {
  /** Fires once the sequence has fully played out and been faded away. */
  onDone: () => void;
  /**
   * Holds on the mark instead of playing out. Used while fonts and stored data
   * are still loading, so the sequence never finishes before the app is ready.
   */
  waiting?: boolean;
}

const RING_TRAVEL = 0.72;
const DIAL_SIZE = 188;

/** Milliseconds, from sequence start. */
const T = {
  ringSweep: 900,
  wordmark: 420,
  tagline: 1000,
  hold: 1420,
  fade: 460,
} as const;

/**
 * The brand sequence, played once at launch.
 *
 * The native splash is a static mark on porcelain; this takes over from it
 * seamlessly and brings the instrument to life — the dial's ring sweeps up to
 * a value, the wordmark tracks out from tight to spaced, and the whole plate
 * lifts away to reveal the app. The mark is the *same* `KnobFace` the rest of
 * the product is built from, at the same size the app icon uses, so the first
 * thing a user sees is literally the instrument they are about to hold.
 *
 * The sequence never plays out before the app is ready: `waiting` holds it on
 * the mark, so a slow cold start reads as a considered pause rather than a
 * flash of unstyled content.
 */
export function SplashSequence({ onDone, waiting }: SplashSequenceProps) {
  const reducedMotion = useReducedMotion();
  const [ring, setRing] = useState(reducedMotion ? RING_TRAVEL : 0);

  const wordmark = useSharedValue(reducedMotion ? 1 : 0);
  const tagline = useSharedValue(reducedMotion ? 1 : 0);
  const plate = useSharedValue(1);

  const started = useRef(false);
  const playedOut = useRef(false);

  /*
   * The ring position is a plain React value driven by a frame loop rather than
   * a Reanimated shared value: `KnobFace` takes a number prop and redraws its
   * vector geometry from it, so there is no worklet-side property to animate.
   * A ~900 ms sweep at 60 fps is cheap, and it keeps the mark identical to the
   * one used everywhere else instead of forking an animated variant of it.
   */
  useEffect(() => {
    if (started.current || reducedMotion) return;
    started.current = true;

    let frame = 0;
    const begun = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - begun) / T.ringSweep);
      // Decelerating, so the ring arrives rather than stopping dead.
      setRing(RING_TRAVEL * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    wordmark.value = withDelay(
      T.wordmark,
      withTiming(1, { duration: motion.slow, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
    );
    tagline.value = withDelay(
      T.tagline,
      withTiming(1, { duration: motion.settle, easing: Easing.out(Easing.quad) }),
    );

    return () => cancelAnimationFrame(frame);
  }, [reducedMotion, tagline, wordmark]);

  /*
   * The play-out is gated on readiness, so the sequence and the app hand over
   * to each other rather than racing.
   *
   * The timers are owned by a ref and cleared only on unmount, never in the
   * effect's cleanup. A re-render between scheduling and firing — hydration
   * finishing, a preference landing — would otherwise cancel the play-out and
   * then decline to reschedule it, stranding the user on the splash. The
   * callback is read through a ref for the same reason, so an unmemoised
   * `onDone` cannot retrigger this.
   */
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const finish = useRef(onDone);
  useEffect(() => {
    finish.current = onDone;
  }, [onDone]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (waiting || playedOut.current) return;
    playedOut.current = true;

    if (reducedMotion) {
      timers.current.push(setTimeout(() => finish.current(), 120));
      return;
    }

    timers.current.push(
      setTimeout(() => {
        plate.value = withTiming(0, {
          duration: T.fade,
          easing: Easing.bezier(0.5, 0, 0.75, 0),
        });
        timers.current.push(setTimeout(() => finish.current(), T.fade));
      }, T.hold),
    );
  }, [plate, reducedMotion, waiting]);

  const plateStyle = useAnimatedStyle(() => ({
    opacity: plate.value,
    // A hair of scale on the way out, so the plate reads as lifting off the
    // screen rather than dissolving in place.
    transform: [{ scale: 1 + (1 - plate.value) * 0.04 }],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmark.value,
    letterSpacing: 2 + wordmark.value * 6,
    transform: [{ translateY: (1 - wordmark.value) * 10 }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: tagline.value * 0.9,
    transform: [{ translateY: (1 - tagline.value) * 6 }],
  }));

  return (
    <Animated.View
      style={[styles.root, plateStyle]}
      pointerEvents="none"
      accessible
      accessibilityRole="image"
      accessibilityLabel="Frequency Lab"
    >
      <LinearGradient
        colors={SURFACES.chassis}
        start={LIGHT.vertical.start}
        end={LIGHT.vertical.end}
        style={StyleSheet.absoluteFill}
      />
      <BrushedGrain opacity={0.5} />

      <View style={styles.stage}>
        <KnobFace
          size={DIAL_SIZE}
          normalised={ring}
          accent={colors.signal}
          active={!waiting}
          showIndicator={false}
        />
      </View>

      <Animated.View style={wordmarkStyle}>
        <Text variant="labelLg" uppercase style={styles.wordmark}>
          Frequency Lab
        </Text>
      </Animated.View>

      <Animated.View style={taglineStyle}>
        <Text variant="caption" tone="tertiary" style={styles.tagline}>
          Precision sound. Personal experimentation.
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.chassis,
    zIndex: 100,
  },
  stage: { marginBottom: space.xxl },
  wordmark: { fontSize: 15, textAlign: 'center' },
  tagline: { marginTop: space.sm, textAlign: 'center' },
});
