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
import {
  AMBIENT_AWARENESS_NOTICE,
  NOT_MEDICAL_NOTICE,
  VOLUME_GUIDANCE,
  type ExperienceLevel,
} from '@frequencylab/dsp-core';
import { InstrumentPanel } from '../src/design/components/InstrumentPanel';
import { HardwareButton } from '../src/design/components/HardwareButton';
import { KnobFace } from '../src/design/components/KnobFace';
import { BrushedGrain } from '../src/design/components/Surface';
import { LiveCarrierBeat, LiveStereo } from '../src/design/components/OnboardingDiagrams';
import { ChevronIcon } from '../src/design/components/Icons';
import { Label, Text } from '../src/design/components/Text';
import { LIGHT, SURFACES } from '../src/design/materials';
import { colors, motion, radius, space } from '../src/design/tokens';
import * as haptics from '../src/design/haptics';
import { useReducedMotion } from '../src/design/useReducedMotion';
import { usePreferences } from '../src/state/preferences';

const STEPS = 5;
const LAST = STEPS - 1;

/**
 * Onboarding (§52).
 *
 * Five screens, no account, no questionnaire. The middle three exist because
 * the product cannot work without the user understanding them: what a carrier
 * and a beat actually are, what headphones are for, and what this is not.
 *
 * The presentation is deliberately kinetic — steps are swipeable, content
 * staggers in, and the two teaching diagrams run live rather than sitting
 * still. An instrument that will spend its life animating measured values
 * should introduce itself the same way. Every motion here is suppressed under
 * reduced motion, where the content becomes immediate rather than merely faster.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const update = usePreferences((state) => state.update);

  const [step, setStep] = useState(0);
  const [level, setLevel] = useState<ExperienceLevel>('simple');

  const finish = async () => {
    haptics.confirm();
    await update({
      experienceLevel: level,
      onboardingCompletedAt: new Date().toISOString(),
    });
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
          <StepPage key={step} centred={step === 0} reducedMotion={reducedMotion}>
            {step === 0 ? <WelcomeStep reducedMotion={reducedMotion} /> : null}
            {step === 1 ? <CarrierStep /> : null}
            {step === 2 ? <HeadphonesStep /> : null}
            {step === 3 ? <SafetyStep /> : null}
            {step === 4 ? <LevelStep level={level} onSelect={setLevel} /> : null}
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

        <HardwareButton
          label={step === LAST ? 'Start' : 'Continue'}
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
  centred,
  reducedMotion,
}: {
  children: ReactNode;
  /** Centres the page vertically. Off for steps whose heading should anchor. */
  centred?: boolean;
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
    <Animated.View style={[styles.page, centred ? styles.pageCentred : styles.pageAnchored, style]}>
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
 * Tappable, so a user who wants to re-read the safety step is not forced to
 * swipe back through the others.
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

function WelcomeStep({ reducedMotion }: { reducedMotion: boolean }) {
  const [ring, setRing] = useState(reducedMotion ? 0.62 : 0);
  const raf = useRef(0);

  /*
   * The dial breathes: it sweeps up to a value and then drifts gently around
   * it. A still knob on the welcome screen would say "picture of an
   * instrument"; a moving one says "the instrument is already running".
   */
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
    <View style={styles.welcome}>
      <Stagger index={0}>
        <View style={styles.welcomeDial}>
          <KnobFace size={192} normalised={ring} accent={colors.signal} showIndicator={false} />
        </View>
      </Stagger>

      <Stagger index={1}>
        <Label style={styles.welcomeEyebrow}>Welcome to</Label>
      </Stagger>

      <Stagger index={2}>
        <Text variant="title" uppercase style={styles.wordmark}>
          Frequency Lab
        </Text>
      </Stagger>

      <Stagger index={3}>
        <Text variant="body" tone="secondary" style={styles.lede}>
          A programmable psychoacoustic instrument. Precision sound, and an honest account of what
          it does and does not do.
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

function CarrierStep() {
  return (
    <>
      <Stagger index={0}>
        <Label>How it works</Label>
        <Text variant="title" style={styles.heading}>
          Two numbers, doing different jobs
        </Text>
      </Stagger>

      <Stagger index={1}>
        <View style={styles.diagramWell}>
          <LiveCarrierBeat />
        </View>
      </Stagger>

      <Stagger index={2}>
        <Text variant="body" tone="secondary" style={styles.paragraph}>
          The <Text variant="body">carrier</Text> is the tone you actually hear — usually a couple
          of hundred hertz, like a low hum.
        </Text>
      </Stagger>

      <Stagger index={3}>
        <Text variant="body" tone="secondary" style={styles.paragraph}>
          The <Text variant="body">beat</Text> is how fast that tone pulses or shifts. It is a rate,
          not a pitch. A 7.83 Hz beat does not mean your headphones are producing a 7.83 Hz sound —
          nothing can.
        </Text>
      </Stagger>
    </>
  );
}

function HeadphonesStep() {
  return (
    <>
      <Stagger index={0}>
        <Label>Headphones</Label>
        <Text variant="title" style={styles.heading}>
          Binaural mode needs two ears
        </Text>
      </Stagger>

      <Stagger index={1}>
        <View style={styles.diagramWell}>
          <LiveStereo />
        </View>
      </Stagger>

      <Stagger index={2}>
        <Text variant="body" tone="secondary" style={styles.paragraph}>
          Each ear gets its own tone, and the beat appears only once your hearing combines them.
          Through a speaker the two mix in the air first, and the effect is gone.
        </Text>
      </Stagger>

      <Stagger index={3}>
        <Text variant="body" tone="secondary" style={styles.paragraph}>
          No headphones? The monaural and isochronic engines work on any output, and the app will
          offer them.
        </Text>
      </Stagger>
    </>
  );
}

const SAFETY = [
  { title: 'Comfortable volume', body: VOLUME_GUIDANCE },
  { title: 'Environmental awareness', body: AMBIENT_AWARENESS_NOTICE },
  { title: 'Not medical treatment', body: NOT_MEDICAL_NOTICE },
];

function SafetyStep() {
  return (
    <>
      <Stagger index={0}>
        <Label>Safety</Label>
        <Text variant="title" style={styles.heading}>
          Three things before you start
        </Text>
      </Stagger>

      {SAFETY.map((item, index) => (
        <Stagger key={item.title} index={index + 1}>
          <InstrumentPanel tone="raised" style={styles.safetyPanel}>
            <View style={styles.safetyHeader}>
              <View style={styles.safetyMark} />
              <Text variant="heading">{item.title}</Text>
            </View>
            <Text variant="bodySm" tone="secondary" style={styles.safetyBody}>
              {item.body}
            </Text>
          </InstrumentPanel>
        </Stagger>
      ))}
    </>
  );
}

const LEVELS: { value: ExperienceLevel; title: string; body: string }[] = [
  {
    value: 'simple',
    title: 'Simple',
    body: 'Pick a goal and a length, press start. The full engine is underneath; the controls are hidden.',
  },
  {
    value: 'explorer',
    title: 'Explorer',
    body: 'A large encoder for the beat and the carrier, plus noise and stereo movement.',
  },
  {
    value: 'lab',
    title: 'Lab',
    body: 'Every module, every parameter, routing, automation and the timeline builder.',
  },
];

function LevelStep({
  level,
  onSelect,
}: {
  level: ExperienceLevel;
  onSelect: (value: ExperienceLevel) => void;
}) {
  return (
    <>
      <Stagger index={0}>
        <Label>Choose a starting point</Label>
        <Text variant="title" style={styles.heading}>
          You can change this any time
        </Text>
      </Stagger>

      {LEVELS.map((option, index) => {
        const selected = level === option.value;
        return (
          <Stagger key={option.value} index={index + 1}>
            <Pressable
              onPress={() => {
                haptics.engage();
                onSelect(option.value);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${option.title}. ${option.body}`}
            >
              <InstrumentPanel
                tone={selected ? 'raised' : 'flat'}
                style={[styles.levelOption, selected ? styles.levelOptionSelected : null]}
              >
                <View style={styles.levelHeader}>
                  <Text variant="heading" tone={selected ? 'primary' : 'secondary'}>
                    {option.title}
                  </Text>
                  {/* Selection is a filled mark as well as a colour, so it is
                      readable without colour vision (§50). */}
                  <View style={[styles.radio, selected ? styles.radioOn : null]}>
                    {selected ? <View style={styles.radioCore} /> : null}
                  </View>
                </View>
                <Text variant="bodySm" tone="tertiary" style={styles.levelBody}>
                  {option.body}
                </Text>
              </InstrumentPanel>
            </Pressable>
          </Stagger>
        );
      })}
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
  page: { flex: 1 },
  pageCentred: { justifyContent: 'center' },
  pageAnchored: { justifyContent: 'flex-start', paddingTop: space.huge },
  pageInner: { paddingHorizontal: space.xl, gap: space.md },

  welcome: { alignItems: 'center', gap: space.sm },
  welcomeDial: { marginBottom: space.lg },
  welcomeEyebrow: { textAlign: 'center' },
  wordmark: { letterSpacing: 6, textAlign: 'center', marginTop: space.xxs },
  lede: { textAlign: 'center', marginTop: space.md, maxWidth: 320 },
  swipeHint: { textAlign: 'center', marginTop: space.xxl },

  heading: { marginTop: space.xxs },
  paragraph: { marginTop: space.xs },

  // The diagrams sit in a well, so they read as an instrument readout rather
  // than a picture dropped onto the page.
  diagramWell: {
    marginVertical: space.lg,
    paddingVertical: space.lg,
    borderRadius: radius.panel,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.edgeLight,
    shadowColor: '#33486A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },

  safetyPanel: { marginTop: space.sm },
  safetyHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  safetyMark: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.signal },
  safetyBody: { marginTop: space.xs },

  levelOption: { marginTop: space.sm },
  levelOptionSelected: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.signalDim },
  levelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  levelBody: { marginTop: space.xs },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.surfaceRecessed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.signal },
  radioCore: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.signal },

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
