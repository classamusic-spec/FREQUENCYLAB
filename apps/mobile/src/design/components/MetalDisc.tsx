import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors } from '../tokens';
import { Text } from './Text';

/**
 * A small brushed-steel disc carrying a number, for list rows.
 *
 * The encoder's cap at thumbnail size, without the parts that only mean
 * something on a control — no scale, no pointer, no collar. A row is not a
 * dial, and a pointer on one would read as a setting it does not have. What is
 * kept is the material: the same `cos 2θ` fan of wedges the large knob uses, a
 * machined rim, and a hairline of the signal colour where the knob's
 * illuminated ring would be.
 *
 * The number is the entry's own representative frequency, printed as written;
 * an entry without one gets `children` instead (an icon), never a placeholder
 * number.
 */
export function MetalDisc({
  size = 56,
  value,
  unit = 'Hz',
  children,
}: {
  size?: number;
  value?: number;
  unit?: string;
  children?: ReactNode;
}) {
  const c = size / 2;
  const rim = c - 1;
  const face = c * 0.86;

  const wedges = useMemo(() => {
    const count = 48;
    const step = 360 / count;
    const out: { d: string; fill: string }[] = [];
    for (let i = 0; i < count; i++) {
      const a0 = i * step;
      const a1 = a0 + step + 0.8;
      const mid = ((a0 + step / 2) * Math.PI) / 180;
      const lobe = Math.cos(2 * (mid - Math.PI / 3));
      const g = Math.max(170, Math.min(246, Math.round(214 + 26 * lobe + 2 * Math.cos(6 * mid))));
      const p0 = polar(c, face + 0.4, a0);
      const p1 = polar(c, face + 0.4, a1);
      out.push({
        d: `M ${c} ${c} L ${p0.x} ${p0.y} A ${face} ${face} 0 0 1 ${p1.x} ${p1.y} Z`,
        fill: `rgb(${g},${g},${g})`,
      });
    }
    return out;
  }, [c, face]);

  const label = value === undefined ? null : formatDiscValue(value);
  const valueSize = label === null ? 0 : Math.min(size * 0.3, (size * 0.78) / Math.max(3, label.length * 0.62));

  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: c }]}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="metalDiscRim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" />
            <Stop offset="0.55" stopColor="#D9D9D9" />
            <Stop offset="1" stopColor="#A9A9A9" />
          </LinearGradient>
        </Defs>
        <Circle cx={c} cy={c} r={rim} fill="url(#metalDiscRim)" />
        {wedges.map((w, i) => (
          <Path key={i} d={w.d} fill={w.fill} />
        ))}
        <Circle cx={c} cy={c} r={face + 0.6} fill="none" stroke={colors.signal} strokeOpacity={0.55} strokeWidth={1} />
        <Circle cx={c} cy={c} r={rim} fill="none" stroke="rgba(99,99,99,0.28)" strokeWidth={0.75} />
      </Svg>
      <View style={styles.centre} pointerEvents="none">
        {label === null ? (
          children
        ) : (
          <>
            <Text style={[styles.value, { fontSize: valueSize, lineHeight: valueSize * 1.15 }]} numberOfLines={1}>
              {label}
            </Text>
            <Text style={styles.unit}>{unit}</Text>
          </>
        )}
      </View>
    </View>
  );
}

/** As written for a whole number, otherwise to two places: 7.83, 40, 528. */
export function formatDiscValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function polar(centre: number, r: number, degrees: number): { x: number; y: number } {
  const rad = (degrees * Math.PI) / 180;
  return { x: centre + r * Math.cos(rad), y: centre + r * Math.sin(rad) };
}

const styles = StyleSheet.create({
  wrap: {
    shadowColor: '#232323',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  centre: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontFamily: 'Inter_400Regular', color: colors.text, letterSpacing: -0.3 },
  unit: { fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 11, color: colors.textSecondary },
});
