import { useMemo } from 'react';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

export interface KnobFaceProps {
  size: number;
  /** Position along the control's travel, 0..1, driving the indicator angle. */
  normalised: number;
  /** Sweep start angle in degrees. -225 puts zero at lower-left. */
  startAngle?: number;
  /** Total sweep in degrees. */
  sweep?: number;
  /** Illuminated ring colour. */
  accent?: string;
  /** Dims the whole control. */
  disabled?: boolean;
  /** Locks the indicator to a neutral colour. */
  locked?: boolean;
  /** Brightens the illumination while a gesture is in progress. */
  active?: boolean;
  /**
   * Draws the milled indicator notch on the cap. Off for the hero encoder,
   * whose cap carries the readout instead — there the outer pointer alone
   * shows position, which is how the reference hardware reads.
   */
  showIndicator?: boolean;
}

/**
 * A polished steel rotary encoder with an illuminated ring.
 *
 * Built as concentric physical parts, outside in — the same order a real one
 * is assembled, which is what makes the shading agree with itself:
 *
 *   1. a scribed scale ring with ticks, and a glowing pointer at the value
 *   2. a knurled steel collar, its serrations lit on the upper-left flank
 *   3. the illuminated ring: a lit groove between collar and cap, drawn as
 *      three strokes — wide soft bloom, mid glow, bright core
 *   4. the cap: radially brushed steel (a sunburst of hairlines under a
 *      radial gradient) with a tight specular arc top-left
 *
 * Everything is drawn in a fixed space scaled by `size`, so one definition
 * serves the 300 pt hero encoder and a 64 pt module trim alike.
 */
export function KnobFace({
  size,
  normalised,
  startAngle = -225,
  sweep = 270,
  accent = '#3B8BF5',
  disabled,
  locked,
  active,
  showIndicator = true,
}: KnobFaceProps) {
  const c = size / 2;
  const small = size < 120;
  const R = {
    scale: c - 1,
    tickOuter: c - 4,
    collarOuter: small ? c - 12 : c - 22,
    collarInner: small ? c - 17 : c - 31,
    ring: small ? c - 19 : c - 34,
    cap: small ? c - 22 : c - 38,
  };

  const angle = startAngle + Math.max(0, Math.min(1, normalised)) * sweep;
  const ringColor = locked ? '#9AA4B2' : accent;

  const ticks = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    const count = small ? 21 : 61;
    for (let i = 0; i < count; i++) {
      const a = startAngle + (i / (count - 1)) * sweep;
      const major = i % 5 === 0;
      const inner = R.tickOuter - (major ? (small ? 5 : 8) : small ? 3 : 4.5);
      const o = polar(c, R.tickOuter, a);
      const n = polar(c, inner, a);
      out.push({ x1: n.x, y1: n.y, x2: o.x, y2: o.y, major });
    }
    return out;
  }, [c, R.tickOuter, small, startAngle, sweep]);

  /** Radial serrations around the collar, lit on the upper-left flank. */
  const knurls = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number; lit: number }[] = [];
    const count = small ? 48 : 96;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * 360;
      const inner = polar(c, R.collarInner + 0.5, a);
      const outer = polar(c, R.collarOuter - 0.5, a);
      const lit = Math.max(0, Math.cos(((a - 215) * Math.PI) / 180));
      out.push({ x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y, lit });
    }
    return out;
  }, [c, R.collarInner, R.collarOuter, small]);

  /**
   * The sunburst brushing on the cap. Real radially-brushed steel is thousands
   * of hairline scratches from the centre; a hundred faint spokes under the
   * radial gradient is enough to read as that finish without moiré.
   */
  const brushing = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number; o: number }[] = [];
    const count = small ? 60 : 120;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * 360 + (i % 3) * 1.3;
      // Converges at the centre: a sunburst that stops short leaves a bright
      // unbrushed disc, which reads as a blemish rather than a turned boss.
      const inner = polar(c, R.cap * 0.03, a);
      const outer = polar(c, R.cap * 0.97, a);
      // Spokes crossing the light direction catch it; the rest fall dark.
      const litness = Math.cos(((a - 135) * Math.PI) / 90);
      out.push({
        x1: inner.x,
        y1: inner.y,
        x2: outer.x,
        y2: outer.y,
        o: 0.05 + Math.abs(litness) * 0.07,
      });
    }
    return out;
  }, [c, R.cap, small]);

  const pointer = polar(c, R.scale - 2, angle);
  const pointerInner = polar(c, R.scale - (small ? 7 : 11), angle);

  return (
    <Svg width={size} height={size} opacity={disabled ? 0.45 : 1}>
      <Defs>
        {/* Polished cap: bright top-left falling to a shaded lower-right. */}
        <RadialGradient id="cap" cx="34%" cy="26%" r="88%">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.3" stopColor="#F5F7FA" />
          <Stop offset="0.6" stopColor="#E3E8EE" />
          <Stop offset="0.84" stopColor="#CDD5DF" />
          <Stop offset="1" stopColor="#B7C1CE" />
        </RadialGradient>
        {/* Directional shading across the dome, opposing the light source. */}
        <SvgLinearGradient id="capShade" x1="0.2" y1="0.05" x2="0.8" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.35" />
          <Stop offset="0.5" stopColor="#9AA6B5" stopOpacity="0" />
          <Stop offset="1" stopColor="#6C7D93" stopOpacity="0.22" />
        </SvgLinearGradient>
        {/* Collar metal, darker so the cap reads as standing above it. */}
        <SvgLinearGradient id="collar" x1="0.15" y1="0" x2="0.85" y2="1">
          <Stop offset="0" stopColor="#F0F3F7" />
          <Stop offset="0.45" stopColor="#CDD5DE" />
          <Stop offset="1" stopColor="#AEB9C7" />
        </SvgLinearGradient>
        <RadialGradient id="capShadow" cx="50%" cy="50%" r="50%">
          <Stop offset="0.72" stopColor="#33486A" stopOpacity="0" />
          <Stop offset="0.94" stopColor="#33486A" stopOpacity="0.10" />
          <Stop offset="1" stopColor="#2C3E5C" stopOpacity="0.30" />
        </RadialGradient>
        {/* The glow the illuminated ring throws onto surrounding metal. */}
        <RadialGradient id="ringBloom" cx="50%" cy="50%" r="50%">
          <Stop offset="0.62" stopColor={ringColor} stopOpacity="0" />
          <Stop offset="0.8" stopColor={ringColor} stopOpacity={active ? '0.35' : '0.22'} />
          <Stop offset="0.98" stopColor={ringColor} stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* 1 — scale ring scribed into the panel, with the glowing pointer */}
      <G>
        {ticks.map((t, i) => (
          <Line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.major ? 'rgba(74,86,104,0.55)' : 'rgba(104,116,136,0.30)'}
            strokeWidth={t.major ? 1.6 : 1}
            strokeLinecap="round"
          />
        ))}
      </G>
      {/* Travelled portion of the scale, faintly lit. */}
      {normalised > 0.002 ? (
        <Path
          d={arc(c, R.tickOuter - (small ? 2.5 : 4), startAngle, angle)}
          stroke={ringColor}
          strokeWidth={small ? 2 : 2.5}
          strokeLinecap="round"
          fill="none"
          opacity={0.35}
        />
      ) : null}
      {/* The pointer: a lit tick riding the scale at the current value. */}
      <Line
        x1={pointerInner.x}
        y1={pointerInner.y}
        x2={pointer.x}
        y2={pointer.y}
        stroke={ringColor}
        strokeWidth={small ? 5 : 7}
        strokeLinecap="round"
        opacity={0.28}
      />
      <Line
        x1={pointerInner.x}
        y1={pointerInner.y}
        x2={pointer.x}
        y2={pointer.y}
        stroke={ringColor}
        strokeWidth={small ? 2.5 : 3.5}
        strokeLinecap="round"
      />

      {/* 2 — knurled collar */}
      <Circle cx={c} cy={c} r={R.collarOuter} fill="url(#collar)" />
      <G>
        {knurls.map((k, i) => (
          <Line
            key={i}
            x1={k.x1}
            y1={k.y1}
            x2={k.x2}
            y2={k.y2}
            stroke={k.lit > 0.35 ? 'rgba(255,255,255,0.7)' : 'rgba(88,102,122,0.28)'}
            strokeWidth={small ? 0.8 : 1}
          />
        ))}
      </G>
      <Circle
        cx={c}
        cy={c}
        r={R.collarOuter}
        fill="none"
        stroke="rgba(88,102,122,0.30)"
        strokeWidth={1}
      />

      {/* 3 — the illuminated ring: bloom, glow, core */}
      <Circle cx={c} cy={c} r={R.collarOuter + 2} fill="url(#ringBloom)" />
      <Circle
        cx={c}
        cy={c}
        r={R.ring}
        fill="none"
        stroke={ringColor}
        strokeWidth={small ? 4 : 6}
        opacity={active ? 0.4 : 0.26}
      />
      <Circle
        cx={c}
        cy={c}
        r={R.ring}
        fill="none"
        stroke={ringColor}
        strokeWidth={small ? 2 : 2.8}
        opacity={active ? 1 : 0.9}
      />
      <Circle
        cx={c}
        cy={c}
        r={R.ring}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={small ? 0.7 : 1}
        opacity={0.5}
      />

      {/* 4 — the cap: radial-brushed steel */}
      <Circle cx={c} cy={c} r={R.cap} fill="url(#cap)" />
      <G>
        {brushing.map((b, i) => (
          <Line
            key={i}
            x1={b.x1}
            y1={b.y1}
            x2={b.x2}
            y2={b.y2}
            stroke="#6E7E92"
            strokeWidth={0.5}
            opacity={b.o}
          />
        ))}
      </G>
      <Circle cx={c} cy={c} r={R.cap} fill="url(#capShade)" />
      <Circle cx={c} cy={c} r={R.cap} fill="url(#capShadow)" />
      {/* Turned rings — a polished cap still shows faint concentric passes. */}
      <G opacity={0.16}>
        {[0.82, 0.62, 0.42].map((f) => (
          <Circle
            key={f}
            cx={c}
            cy={c}
            r={R.cap * f}
            fill="none"
            stroke="rgba(120,132,150,0.5)"
            strokeWidth={0.5}
          />
        ))}
      </G>
      {/* Specular arcs: polished metal reflects the light as a band, not a blob. */}
      <Path
        d={arc(c, R.cap * 0.88, 195, 305)}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={R.cap * 0.1}
        strokeLinecap="round"
        opacity={0.5}
      />
      <Path
        d={arc(c, R.cap * 0.88, 20, 120)}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={R.cap * 0.07}
        strokeLinecap="round"
        opacity={0.22}
      />
      {/* Lit on the upper rim, occluded on the lower — the cap's own edge. */}
      <Path
        d={arc(c, R.cap, 190, 350)}
        fill="none"
        stroke="rgba(255,255,255,0.95)"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      <Path
        d={arc(c, R.cap, 10, 170)}
        fill="none"
        stroke="rgba(96,110,132,0.30)"
        strokeWidth={1.4}
        strokeLinecap="round"
      />

      {/* The turned centre pivot the brushing radiates from. */}
      <Circle cx={c} cy={c} r={Math.max(2, R.cap * 0.045)} fill="url(#cap)" />
      <Circle
        cx={c}
        cy={c}
        r={Math.max(2, R.cap * 0.045)}
        fill="none"
        stroke="rgba(96,110,132,0.28)"
        strokeWidth={0.7}
      />

      {/* Optional milled indicator, for caps that do not carry a readout. */}
      {showIndicator ? (
        <>
          <Line
            x1={polar(c, R.cap - (small ? 9 : 16), angle).x}
            y1={polar(c, R.cap - (small ? 9 : 16), angle).y}
            x2={polar(c, R.cap - 3, angle).x}
            y2={polar(c, R.cap - 3, angle).y}
            stroke="rgba(62,74,92,0.35)"
            strokeWidth={small ? 3.5 : 5}
            strokeLinecap="round"
          />
          <Line
            x1={polar(c, R.cap - (small ? 9 : 16), angle).x}
            y1={polar(c, R.cap - (small ? 9 : 16), angle).y}
            x2={polar(c, R.cap - 3, angle).x}
            y2={polar(c, R.cap - 3, angle).y}
            stroke={ringColor}
            strokeWidth={small ? 2 : 2.6}
            strokeLinecap="round"
          />
        </>
      ) : null}
    </Svg>
  );
}

function polar(centre: number, r: number, degrees: number): { x: number; y: number } {
  const rad = (degrees * Math.PI) / 180;
  return { x: centre + r * Math.cos(rad), y: centre + r * Math.sin(rad) };
}

function arc(centre: number, r: number, fromDeg: number, toDeg: number): string {
  const span = Math.max(0.001, toDeg - fromDeg);
  const s = polar(centre, r, fromDeg);
  const e = polar(centre, r, fromDeg + span);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
}
