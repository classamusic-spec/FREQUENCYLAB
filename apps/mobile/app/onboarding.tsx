import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import {
  AMBIENT_AWARENESS_NOTICE,
  NOT_MEDICAL_NOTICE,
  VOLUME_GUIDANCE,
  type ExperienceLevel,
} from '@frequencylab/dsp-core';
import { Screen } from '../src/design/components/Screen';
import { InstrumentPanel } from '../src/design/components/InstrumentPanel';
import { HardwareButton } from '../src/design/components/HardwareButton';
import { Label, Text } from '../src/design/components/Text';
import { colors, radius, space } from '../src/design/tokens';
import * as haptics from '../src/design/haptics';
import { usePreferences } from '../src/state/preferences';

/**
 * Onboarding (§52).
 *
 * Five screens, no account, no questionnaire. The third and fourth exist
 * because the product cannot work without the user understanding them: what
 * headphones are for, and what this is not.
 */
export default function OnboardingScreen() {
  const router = useRouter();
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

  return (
    <Screen scroll={false} style={styles.root}>
      <View style={styles.progress}>
        {[0, 1, 2, 3, 4].map((index) => (
          <View key={index} style={[styles.progressDot, index <= step ? styles.progressDotOn : null]} />
        ))}
      </View>

      <View style={styles.body}>
        {step === 0 ? (
          <View style={styles.stepContent}>
            <Label>Welcome to</Label>
            <Text variant="hero" style={styles.wordmark}>
              FREQUENCY
            </Text>
            <Text variant="hero" style={styles.wordmarkSecond}>
              LAB
            </Text>
            <Text variant="body" tone="secondary" style={styles.lede}>
              Precision sound. Personal experimentation.
            </Text>
          </View>
        ) : null}

        {step === 1 ? (
          <View style={styles.stepContent}>
            <Label>How it works</Label>
            <Text variant="title" style={styles.heading}>
              Two numbers, doing different jobs
            </Text>
            <CarrierBeatDiagram />
            <Text variant="body" tone="secondary" style={styles.paragraph}>
              The <Text variant="body">carrier</Text> is the tone you actually hear — usually a
              couple of hundred hertz, like a low hum.
            </Text>
            <Text variant="body" tone="secondary" style={styles.paragraph}>
              The <Text variant="body">beat</Text> is how fast that tone pulses or shifts. It is a
              rate, not a pitch. A 7.83 Hz beat does not mean your headphones are producing a
              7.83 Hz sound — nothing can.
            </Text>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.stepContent}>
            <Label>Headphones</Label>
            <Text variant="title" style={styles.heading}>
              Binaural mode needs two ears
            </Text>
            <StereoDiagram />
            <Text variant="body" tone="secondary" style={styles.paragraph}>
              In binaural mode each ear gets its own tone, and the beat only appears once your
              hearing combines them. Through a speaker the two tones mix in the air first, and the
              effect is gone.
            </Text>
            <Text variant="body" tone="secondary" style={styles.paragraph}>
              No headphones? The monaural and isochronic engines work on any output, and the app
              will offer them.
            </Text>
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.stepContent}>
            <Label>Safety</Label>
            <Text variant="title" style={styles.heading}>
              Three things before you start
            </Text>
            <InstrumentPanel tone="flat" style={styles.safetyPanel}>
              <Text variant="heading">Comfortable volume</Text>
              <Text variant="bodySm" tone="secondary">
                {VOLUME_GUIDANCE}
              </Text>
            </InstrumentPanel>
            <InstrumentPanel tone="flat" style={styles.safetyPanel}>
              <Text variant="heading">Environmental awareness</Text>
              <Text variant="bodySm" tone="secondary">
                {AMBIENT_AWARENESS_NOTICE}
              </Text>
            </InstrumentPanel>
            <InstrumentPanel tone="flat" style={styles.safetyPanel}>
              <Text variant="heading">Not medical treatment</Text>
              <Text variant="bodySm" tone="secondary">
                {NOT_MEDICAL_NOTICE}
              </Text>
            </InstrumentPanel>
          </View>
        ) : null}

        {step === 4 ? (
          <View style={styles.stepContent}>
            <Label>Choose a starting point</Label>
            <Text variant="title" style={styles.heading}>
              You can change this any time
            </Text>
            {LEVELS.map((option) => (
              <LevelOption
                key={option.value}
                option={option}
                selected={level === option.value}
                onSelect={() => {
                  haptics.engage();
                  setLevel(option.value);
                }}
              />
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        {step > 0 ? (
          <HardwareButton
            label="Back"
            variant="ghost"
            style={styles.footerButton}
            onPress={() => setStep((current) => current - 1)}
          />
        ) : null}
        <HardwareButton
          label={step === 4 ? 'Start' : 'Continue'}
          variant="primary"
          size="lg"
          style={styles.footerButton}
          onPress={() => (step === 4 ? void finish() : setStep((current) => current + 1))}
        />
      </View>
    </Screen>
  );
}

const LEVELS: Array<{ value: ExperienceLevel; title: string; body: string }> = [
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

function LevelOption({
  option,
  selected,
  onSelect,
}: {
  option: (typeof LEVELS)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <InstrumentPanel
      tone={selected ? 'raised' : 'flat'}
      style={[styles.levelOption, selected ? styles.levelOptionSelected : null]}
      onTouchEnd={onSelect}
      accessible
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${option.title}. ${option.body}`}
    >
      <View style={styles.levelHeader}>
        <Text variant="heading" tone={selected ? 'primary' : 'secondary'}>
          {option.title}
        </Text>
        <View style={[styles.radio, selected ? styles.radioOn : null]} />
      </View>
      <Text variant="bodySm" tone="tertiary">
        {option.body}
      </Text>
    </InstrumentPanel>
  );
}

/** A carrier waveform with a slow amplitude envelope drawn over it. */
function CarrierBeatDiagram() {
  const width = 280;
  const height = 96;
  const carrier: string[] = [];
  const envelope: string[] = [];
  for (let i = 0; i <= 280; i++) {
    const t = i / 280;
    const env = 0.5 + 0.45 * Math.sin(2 * Math.PI * t * 2 - Math.PI / 2);
    const y = height / 2 - Math.sin(2 * Math.PI * t * 22) * env * (height / 2 - 8);
    carrier.push(`${i === 0 ? 'M' : 'L'} ${i} ${y.toFixed(1)}`);
    envelope.push(`${i === 0 ? 'M' : 'L'} ${i} ${(height / 2 - env * (height / 2 - 8)).toFixed(1)}`);
  }
  return (
    <View style={styles.diagram}>
      <Svg width={width} height={height}>
        <Path d={carrier.join(' ')} stroke={colors.signal} strokeWidth={1.2} fill="none" />
        <Path d={envelope.join(' ')} stroke={colors.warning} strokeWidth={1} fill="none" opacity={0.7} />
      </Svg>
      <View style={styles.diagramLegend}>
        <Label tone="signal">Carrier · the tone</Label>
        <Label tone="warning">Beat · the rate</Label>
      </View>
    </View>
  );
}

function StereoDiagram() {
  return (
    <View style={styles.diagram}>
      <Svg width={280} height={96}>
        <Circle cx={60} cy={48} r={26} stroke={colors.hairlineStrong} strokeWidth={1} fill="none" />
        <Circle cx={220} cy={48} r={26} stroke={colors.hairlineStrong} strokeWidth={1} fill="none" />
        <Line x1={86} y1={48} x2={130} y2={48} stroke={colors.signal} strokeWidth={1.4} />
        <Line x1={150} y1={48} x2={194} y2={48} stroke={colors.signal} strokeWidth={1.4} />
        <Circle cx={140} cy={48} r={12} stroke={colors.signal} strokeWidth={1.4} fill="none" />
      </Svg>
      <View style={styles.diagramLegend}>
        <Label>200.000 Hz left</Label>
        <Label tone="signal">7.830 Hz perceived</Label>
        <Label>207.830 Hz right</Label>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: space.xl },
  progress: { flexDirection: 'row', gap: space.xs, justifyContent: 'center', paddingTop: space.lg },
  progressDot: { width: 22, height: 2, borderRadius: 1, backgroundColor: colors.surfaceHigh },
  progressDotOn: { backgroundColor: colors.signal },
  body: { flex: 1, justifyContent: 'center' },
  stepContent: { gap: space.md },
  wordmark: { letterSpacing: -2 },
  wordmarkSecond: { letterSpacing: 10, marginTop: -12 },
  lede: { marginTop: space.lg },
  heading: { marginTop: space.xxs },
  paragraph: { marginTop: space.xs },
  diagram: { alignItems: 'center', gap: space.sm, marginVertical: space.lg },
  diagramLegend: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap', justifyContent: 'center' },
  safetyPanel: { marginTop: space.xs },
  levelOption: { marginTop: space.sm },
  levelOptionSelected: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.signalDim },
  levelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
  },
  radioOn: { backgroundColor: colors.signal, borderColor: colors.signal },
  footer: { flexDirection: 'row', gap: space.sm, paddingBottom: space.xxl },
  footerButton: { flex: 1 },
});
