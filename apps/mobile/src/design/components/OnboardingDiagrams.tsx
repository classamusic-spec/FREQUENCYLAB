import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { colors, space } from '../tokens';
import { useReducedMotion } from '../useReducedMotion';
import { Label, Text } from './Text';

/**
 * The teaching diagrams, animated from the same arithmetic the engine uses.
 *
 * These are the two ideas the product genuinely cannot work without a user
 * holding: that a carrier and a beat are different quantities, and that a
 * binaural beat only exists once two ears combine two tones. Both are far
 * easier to see moving than described, so each diagram runs the real
 * expression — a carrier sine under a slow envelope, two detuned tones summing
 * into a beat — rather than illustrating an approximation of it.
 *
 * Time is advanced by a frame loop rather than Reanimated because the output is
 * an SVG path string rebuilt each frame, which has no worklet-side equivalent.
 * Motion stops entirely under reduced motion, showing a representative still.
 */

/** Shared frame clock. Returns seconds since mount, frozen when disabled. */
function useClock(enabled: boolean, frozenAt = 0.42): number {
  const [t, setT] = useState(frozenAt);
  const raf = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const begun = Date.now();
    const step = () => {
      setT((Date.now() - begun) / 1000);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [enabled]);

  // Derived rather than stored, so disabling the clock cannot leave a stale
  // frame on screen and the still is always the same representative moment.
  return enabled ? t : frozenAt;
}

const W = 300;
const H = 118;

/**
 * A carrier tone under a moving amplitude envelope.
 *
 * The fast oscillation is the carrier — what is actually heard. The slow
 * boundary it fills is the beat, and it is drawn as a *shape the carrier lives
 * inside* rather than a second wave beside it, because that is the relationship
 * being taught: the beat is not another sound, it is the rate the sound moves.
 */
export function LiveCarrierBeat() {
  const reducedMotion = useReducedMotion();
  const t = useClock(!reducedMotion);

  const mid = H / 2;
  const amp = mid - 14;
  const carrier: string[] = [];
  const upper: string[] = [];
  const lower: string[] = [];

  for (let i = 0; i <= W; i++) {
    const x = i / W;
    // Two cycles of envelope across the frame, scrolling right to left.
    const env = 0.28 + 0.72 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (x * 2 - t * 0.55)));
    const y = mid - Math.sin(2 * Math.PI * (x * 26 - t * 3.2)) * env * amp;
    carrier.push(`${i === 0 ? 'M' : 'L'} ${i} ${y.toFixed(1)}`);
    upper.push(`${i === 0 ? 'M' : 'L'} ${i} ${(mid - env * amp).toFixed(1)}`);
    lower.push(`${i === 0 ? 'M' : 'L'} ${i} ${(mid + env * amp).toFixed(1)}`);
  }

  return (
    <View style={styles.frame}>
      <Svg width={W} height={H}>
        <Defs>
          <SvgLinearGradient id="envFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.signal} stopOpacity="0.13" />
            <Stop offset="0.5" stopColor={colors.signal} stopOpacity="0.05" />
            <Stop offset="1" stopColor={colors.signal} stopOpacity="0.13" />
          </SvgLinearGradient>
        </Defs>

        {/* The envelope as a filled region: the space the tone is allowed. */}
        <Path d={`${upper.join(' ')} L ${W} ${mid} ${[...lower].reverse().join(' ')} Z`} fill="url(#envFill)" />
        <Path d={upper.join(' ')} stroke={colors.signal} strokeWidth={1.4} fill="none" opacity={0.55} />
        <Path d={lower.join(' ')} stroke={colors.signal} strokeWidth={1.4} fill="none" opacity={0.55} />
        <Path d={carrier.join(' ')} stroke={colors.text} strokeWidth={1.3} fill="none" opacity={0.85} />
      </Svg>

      <View style={styles.legend}>
        <LegendKey color={colors.text} label="Carrier · the tone you hear" />
        <LegendKey color={colors.signal} label="Beat · the rate it moves at" />
      </View>
    </View>
  );
}

/**
 * Two detuned tones, one per ear, and the beat that appears only between them.
 *
 * The centre trace is the literal sum of the two side traces, so the swelling
 * a viewer sees is the same interference their hearing performs — which is the
 * point: the beat is drawn where it actually happens, in the middle, and never
 * in either ear.
 */
export function LiveStereo() {
  const reducedMotion = useReducedMotion();
  const t = useClock(!reducedMotion);

  const earR = 30;
  const mid = H / 2;
  const trackLeft = 78;
  const trackRight = W - 78;
  const span = trackRight - trackLeft;

  const left: string[] = [];
  const right: string[] = [];
  const sum: string[] = [];

  for (let i = 0; i <= span; i++) {
    const x = i / span;
    const l = Math.sin(2 * Math.PI * (x * 9 - t * 2.4));
    // A visible detune, so the two traces drift in and out of step on screen.
    const r = Math.sin(2 * Math.PI * (x * 10 - t * 2.4));
    left.push(`${i === 0 ? 'M' : 'L'} ${trackLeft + i} ${(mid - 26 - l * 7).toFixed(1)}`);
    right.push(`${i === 0 ? 'M' : 'L'} ${trackLeft + i} ${(mid + 26 - r * 7).toFixed(1)}`);
    sum.push(`${i === 0 ? 'M' : 'L'} ${trackLeft + i} ${(mid - ((l + r) / 2) * 13).toFixed(1)}`);
  }

  // The perceived beat, as a slow breath on the centre marker.
  const beat = 0.5 + 0.5 * Math.sin(2 * Math.PI * t * 0.55);

  return (
    <View style={styles.frame}>
      <Svg width={W} height={H}>
        <Circle cx={40} cy={mid} r={earR} stroke={colors.hairlineStrong} strokeWidth={1.2} fill="none" />
        <Circle cx={W - 40} cy={mid} r={earR} stroke={colors.hairlineStrong} strokeWidth={1.2} fill="none" />

        <Path d={left.join(' ')} stroke={colors.text} strokeWidth={1.2} fill="none" opacity={0.5} />
        <Path d={right.join(' ')} stroke={colors.text} strokeWidth={1.2} fill="none" opacity={0.5} />
        <Path d={sum.join(' ')} stroke={colors.signal} strokeWidth={1.7} fill="none" />

        {/* Where the beat is perceived: inside the listener, not in a speaker. */}
        <Circle cx={W / 2} cy={mid} r={13 + beat * 5} fill={colors.signal} opacity={0.10 + beat * 0.12} />
        <Circle cx={W / 2} cy={mid} r={7} fill={colors.signal} opacity={0.55 + beat * 0.45} />
      </Svg>

      <View style={styles.legend}>
        <Label tone="tertiary">220.000 Hz left</Label>
        <Label tone="signal">7.830 Hz perceived</Label>
        <Label tone="tertiary">227.830 Hz right</Label>
      </View>
    </View>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendKey}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', gap: space.md },
  legend: {
    flexDirection: 'row',
    gap: space.lg,
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  legendKey: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  legendSwatch: { width: 14, height: 2.5, borderRadius: 1.5 },
});
