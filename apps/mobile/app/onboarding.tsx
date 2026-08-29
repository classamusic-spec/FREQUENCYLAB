import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NOT_MEDICAL_NOTICE, VOLUME_GUIDANCE } from '@frequencylab/dsp-core';
import { InstrumentPanel } from '../src/design/components/InstrumentPanel';
import { HardwareButton } from '../src/design/components/HardwareButton';
import { KnobFace } from '../src/design/components/KnobFace';
import { BrushedGrain } from '../src/design/components/Surface';
import { ChevronIcon } from '../src/design/components/Icons';
import { Label, Text } from '../src/design/components/Text';
import { LIGHT, SURFACES } from '../src/design/materials';
import { colors, motion, space } from '../src/design/tokens';
import * as haptics from '../src/design/haptics';
import { useReducedMotion } from '../src/design/useReducedMotion';
import { usePreferences } from '../src/state/preferences';

const STEPS = 2;
const LAST = STEPS - 1;

/**
 * Onboarding (§52).
 *
 * Two screens, and only two, because only two things have to be true before a
 * person is allowed to hear a tone: they have set a level they are comfortable
 * with, and they know this is not medicine. Everything else this screen used to
 * say — what a carrier is, what a beat is, why binaural needs two ears, the
 * environmental-awareness notice, and a request to classify themselves as
 * Simple, Explorer or Lab — was documentation delivered before it could mean
 * anything, and it is all still in the product where it is actually relevant:
 *
 *  - carrier vs beat, and headphones vs speaker, are explained on the Explore
 *    tab against the numbers the user is actually holding, and by the
 *    `headphones-required` preflight check at the moment it applies;
 *  - the environmental-awareness notice is in the pre-session sheet, in the
 *    `first-session` check, alongside this same medical notice — it is shown
 *    before the first tone either way, so saying it twice bought nothing;
 *  - both notices, and all three, are in Profile › Safety as a reference;
 *  - the experience level is a Profile control with a sane default. Nobody can
 *    answer "are you Simple, Explorer or Lab" before their first session, so we
 *    stop asking and leave `DEFAULT_PREFERENCES.experienceLevel` in place.
 *
 * The presentation is unchanged and deliberately kinetic: steps are swipeable,
 * content staggers in, the progress rail fills like a milled channel and the
 * dial on the first step breathes rather than sitting still. An instrument that
 * will spend its life animating measured values should introduce itself the
 * same way. Every motion here is suppressed under reduced motion, where the
 * content becomes immediate rather than merely faster.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const update = usePreferences((state) => state.update);

  const [step, setStep] = useState(0);

  /*
   * Marks onboarding done and hands off to calibration, which is where the
   * level the first step just talked about actually gets set.
   *
   * Note what is *not* written here: `experienceLevel`. Leaving it alone is the
   * point — the stored default stands until someone chooses otherwise in
   * Profile, rather than being confirmed by a user who has no basis to choose.
   */
  const finish = async () => {
    haptics.confirm();
    await update({ onboardingCompletedAt: new Date().toISOString() });
    router.replace('/calibration');
  };

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(LAST, next));
      if (clamped === step) return;
      haptics.engage();
      setStep(clamped);
    },
    [step],
  );

  /*
   * Horizontal swipe between steps. A worklet reads the finished translation
   * and dispatches the step change back to the JS thread; the pages themselves
   * are not dragged, because a half-dragged safety notice would be worse than
   * a clean transition.
   */
  const swipe = Gesture.Pan()
    .activeOffsetX([-18, 18])
    .failOffsetY([-24, 24])
    .onEnd((event) => {
      if (event.translationX < -48) runOnJS(go)(step + 1);
      else if (event.translationX > 48) runOnJS(go)(step - 1);
    });

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={SURFACES.chassis}
        start={LIGHT.vertical.start}
        end={LIGHT.vertical.end}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <BrushedGrain opacity={0.45} />

      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <ProgressRail step={step} onSelect={go} reducedMotion={reducedMotion} />
      </View>

      <GestureDetector gesture={swipe}>
        <View style={styles.body}>
          {/* Keyed on the step so every transition remounts and replays the
              stagger, which is what makes paging feel like a new panel sliding
              into the instrument rather than text being swapped. */}
          <StepPage key={step} reducedMotion={reducedMotion}>
            {step === 0 ? <VolumeStep reducedMotion={reducedMotion} /> : null}
            {step === 1 ? <ScopeStep /> : null}
          </StepPage>
        </View>
      </GestureDetector>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.xl }]}>
        {step > 0 ? (
          <Pressable
            onPress={() => go(step - 1)}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.backButton}
          >
            <ChevronIcon direction="left" color={colors.textSecondary} size={20} />
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}

        {/* The last label names where it goes. "Start" would promise a session
            and deliver a calibration screen. */}
        <HardwareButton
          label={step === LAST ? 'Set my level' : 'Continue'}
          variant="primary"
          size="lg"
          style={styles.continueButton}
          onPress={() => (step === LAST ? void finish() : go(step + 1))}
        />
      </View>
    </View>
  );
}

/** Fades and lifts a step's content in, staggering its children. */
function StepPage({
  children,
  reducedMotion,
}: {
  children: ReactNode;
  reducedMotion: boolean;
}) {
  const enter = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) return;
    enter.value = withTiming(1, {
      duration: motion.settle,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
  }, [enter, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 18 }],
  }));

  return (
    <Animated.View style={[styles.page, style]}>
      <View style={styles.pageInner}>{children}</View>
    </Animated.View>
  );
}

/** One staggered element inside a step. */
function Stagger({ index = 0, children }: { index?: number; children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const enter = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) return;
    enter.value = withDelay(
      70 * index,
      withTiming(1, { duration: motion.settle, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
    );
  }, [enter, index, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 14 }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * The step indicator, as a row of milled channels that fill.
 *
 * Tappable, so a user who wants to re-read the first step is not forced to
 * swipe back to it.
 */
function ProgressRail({
  step,
  onSelect,
  reducedMotion,
}: {
  step: number;
  onSelect: (index: number) => void;
  reducedMotion: boolean;
}) {
  return (
    <View style={styles.rail} accessibilityRole="tablist">
      {Array.from({ length: STEPS }, (_, index) => (
        <Pressable
          key={index}
          onPress={() => onSelect(index)}
          accessibilityRole="tab"
          accessibilityState={{ selected: index === step }}
          accessibilityLabel={`Step ${index + 1} of ${STEPS}`}
          hitSlop={10}
          style={styles.railSegment}
        >
          <View style={styles.railChannel}>
            <RailFill filled={index <= step} active={index === step} reducedMotion={reducedMotion} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function RailFill({
  filled,
  active,
  reducedMotion,
}: {
  filled: boolean;
  active: boolean;
  reducedMotion: boolean;
}) {
  const progress = useSharedValue(filled ? 1 : 0);

  useEffect(() => {
    const target = filled ? 1 : 0;
    progress.value = reducedMotion
      ? target
      : withTiming(target, { duration: motion.standard, easing: Easing.out(Easing.cubic) });
  }, [filled, progress, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    // Grows from the left, so a step change reads as travel rather than a
    // light switching on.
    transform: [{ scaleX: progress.value }],
    opacity: 0.45 + progress.value * 0.55,
  }));

  return (
    <Animated.View
      style={[styles.railFill, active ? styles.railFillActive : null, style]}
      pointerEvents="none"
    />
  );
}

/**
 * Step one: the level.
 *
 * The dial is the animation that used to open the old welcome screen, kept and
 * given something to mean. It sweeps up to a value and then drifts gently
 * around it: a still knob would say "picture of an instrument", a moving one
 * says "the instrument is already running" — and here it is a *level* it is
 * resting at, sitting a little over half travel, which is the shape of the
 * advice underneath it rather than decoration beside it.
 */
function VolumeStep({ reducedMotion }: { reducedMotion: boolean }) {
  const [ring, setRing] = useState(reducedMotion ? 0.62 : 0);
  const raf = useRef(0);

  useEffect(() => {
    if (reducedMotion) return;
    const begun = Date.now();
    const step = () => {
      const t = (Date.now() - begun) / 1000;
      const settle = Math.min(1, t / 1.1);
      const eased = 1 - Math.pow(1 - settle, 3);
      const drift = settle >= 1 ? Math.sin((t - 1.1) * 0.9) * 0.05 : 0;
      setRing(0.62 * eased + drift);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [reducedMotion]);

  return (
    <View style={styles.hero}>
      <Stagger index={0}>
        <View style={styles.heroDial}>
          <KnobFace size={192} normalised={ring} accent={colors.signal} showIndicator={false} />
        </View>
      </Stagger>

      <Stagger index={1}>
        <Label style={styles.heroEyebrow}>Before you start</Label>
      </Stagger>

      <Stagger index={2}>
        <Text variant="title" style={styles.heroTitle}>
          Set a comfortable level
        </Text>
      </Stagger>

      <Stagger index={3}>
        <Text variant="body" tone="secondary" style={styles.lede}>
          {VOLUME_GUIDANCE}
        </Text>
      </Stagger>

      <Stagger index={4}>
        <Label tone="tertiary" style={styles.swipeHint}>
          Swipe between steps
        </Label>
      </Stagger>
    </View>
  );
}

/**
 * Step two: what this is not.
 *
 * The one claim the product has to make about itself before it makes a sound,
 * on the same raised panel the safety step used, so the transition from the
 * dial lands on a surface the user will meet again in the pre-session sheet.
 */
function ScopeStep() {
  return (
    <>
      <Stagger index={0}>
        <Label>Before you start</Label>
        <Text variant="title" style={styles.heading}>
          This is not medical treatment
        </Text>
      </Stagger>

      <Stagger index={1}>
        <InstrumentPanel tone="raised" style={styles.noticePanel}>
          {/* The lit mark the safety panels carry, kept — but the notice is
              stated once, on the panel, rather than titled above and repeated
              inside it. */}
          <View style={styles.noticeRow}>
            <View style={styles.noticeMark} />
            <Text variant="body" tone="secondary" style={styles.noticeBody}>
              {NOT_MEDICAL_NOTICE}
            </Text>
          </View>
        </InstrumentPanel>
      </Stagger>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: space.xl, paddingBottom: space.md },

  rail: { flexDirection: 'row', gap: space.xs },
  railSegment: { flex: 1, paddingVertical: space.sm },
  // A milled channel: shaded by its own rim, lit along the bottom lip.
  railChannel: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceRecessed,
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(96,110,132,0.22)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.9)',
  },
  railFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.signal,
    transformOrigin: 'left',
  },
  railFillActive: {
    shadowColor: colors.signal,
    shadowOpacity: 0.5,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },

  body: { flex: 1 },
  // Both steps are short, so both sit centred: paging between them is then a
  // panel changing in place rather than content jumping up the screen.
  page: { flex: 1, justifyContent: 'center' },
  pageInner: { paddingHorizontal: space.xl, gap: space.md },

  hero: { alignItems: 'center', gap: space.sm },
  heroDial: { marginBottom: space.lg },
  heroEyebrow: { textAlign: 'center' },
  heroTitle: { textAlign: 'center', marginTop: space.xxs },
  lede: { textAlign: 'center', marginTop: space.md, maxWidth: 320 },
  swipeHint: { textAlign: 'center', marginTop: space.xxl },

  heading: { marginTop: space.xxs },

  noticePanel: { marginTop: space.sm },
  noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  // Nudged onto the first line's optical centre rather than its box top.
  noticeMark: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 9,
    backgroundColor: colors.signal,
  },
  noticeBody: { flex: 1 },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
  },
  backButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: 1,
    borderTopColor: colors.edgeLight,
    shadowColor: '#33486A',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  backSpacer: { width: 0 },
  continueButton: { flex: 1 },
});
