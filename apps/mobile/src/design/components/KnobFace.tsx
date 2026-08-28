import { useMemo } from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
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
  /** Illuminated arc colour. */
  accent?: string;
  /** Dims the whole control. */
  disabled?: boolean;
  /** Locks the indicator to a neutral colour. */
  locked?: boolean;
  /** Brightens the arc while a gesture is in progress. */
  active?: boolean;
}

/**
 * A machined aluminium rotary encoder, drawn as vector art.
 *
 * Built as concentric physical parts, outside in — the same order a real one is
 * assembled, which is what makes the shading agree with itself:
 *
 *   1. a scribed scale ring cut into the panel, with the ticks
 *   2. the illuminated arc, sunk into a dark channel
 *   3. a knurled collar with radial serrations catching light on one side
 *   4. the turned cap: concentric machining rings plus a specular highlight
 *      offset to the top-left, matching the single light source
 *   5. the indicator, milled into the cap so it has a shadow *and* a lit lip
 *
 * Everything is drawn in a fixed 0..1 space scaled by `size`, so one knob
 * definition serves the 236 pt hero encoder and a 64 pt panel trim alike.
 */
export function KnobFace({
  size,
  normalised,
  startAngle = -225,
  sweep = 270,
  accent = '#12B3A0',
  disabled,
  locked,
  active,
}: KnobFaceProps) {
  const c = size / 2;
  const R = {
    scale: c - 1,
    tickOuter: c - 5,
    channel: c - 20,
    collarOuter: c - 30,
    collarInner: c - 40,
    cap: c - 41,
  };

  const angle = startAngle + Math.max(0, Math.min(1, normalised)) * sweep;

  const ticks = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    const count = 41;
    for (let i = 0; i < count; i++) {
      const a = startAngle + (i / (count - 1)) * sweep;
      const major = i % 5 === 0;
      const inner = R.tickOuter - (major ? 9 : 5);
      const o = polar(c, R.tickOuter, a);
      const n = polar(c, inner, a);
      out.push({ x1: n.x, y1: n.y, x2: o.x, y2: o.y, major });
    }
    return out;
  }, [c, R.tickOuter, startAngle, sweep]);

  /** Radial serrations around the collar, lit on the upper-left flank. */
  const knurls = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number; lit: number }[] = [];
    const count = 72;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * 360;
      const inner = polar(c, R.collarInner + 1, a);
      const outer = polar(c, R.collarOuter - 1, a);
      // Facets facing the light (up-left, ≈225° in screen space) are brightest.
      const lit = Math.max(0, Math.cos(((a - 215) * Math.PI) / 180));
      out.push({ x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y, lit });
    }
    return out;
  }, [c, R.collarInner, R.collarOuter]);

  const indicatorColor = locked ? '#8A929E' : accent;

  return (
    <Svg width={size} height={size} opacity={disabled ? 0.45 : 1}>
      <Defs>
        {/* Turned cap: bright top-left falling to a shaded lower-right. */}
        <RadialGradient id="cap" cx="32%" cy="24%" r="86%">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.26" stopColor="#F4F7FA" />
          <Stop offset="0.58" stopColor="#DFE5ED" />
          <Stop offset="0.84" stopColor="#C4CCD8" />
          <Stop offset="1" stopColor="#A9B3C1" />
        </RadialGradient>
        {/* Directional shading across the dome, opposing the light source. */}
        <SvgLinearGradient id="capShade" x1="0.2" y1="0.05" x2="0.8" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.30" />
          <Stop offset="0.5" stopColor="#8E99A8" stopOpacity="0" />
          <Stop offset="1" stopColor="#5E6A7B" stopOpacity="0.26" />
        </SvgLinearGradient>
        {/* Collar metal, darker so the cap reads as standing above it. */}
        <SvgLinearGradient id="collar" x1="0.15" y1="0" x2="0.85" y2="1">
          <Stop offset="0" stopColor="#DFE4EC" />
          <Stop offset="0.45" stopColor="#B9C1CE" />
          <Stop offset="1" stopColor="#98A2B1" />
        </SvgLinearGradient>
        {/* The dark channel the illuminated arc sits inside. */}
        <SvgLinearGradient id="channel" x1="0.5" y1="0" x2="0.5" y2="1">
          <Stop offset="0" stopColor="#AAB3C0" />
          <Stop offset="1" stopColor="#CDD4DE" />
        </SvgLinearGradient>
        <RadialGradient id="specular" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.85" />
          <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0.38" />
          <Stop offset="0.75" stopColor="#FFFFFF" stopOpacity="0.10" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="capShadow" cx="50%" cy="50%" r="50%">
          <Stop offset="0.7" stopColor="#2A3140" stopOpacity="0" />
          <Stop offset="0.93" stopColor="#2A3140" stopOpacity="0.16" />
          <Stop offset="1" stopColor="#232A36" stopOpacity="0.42" />
        </RadialGradient>
      </Defs>

      {/* 1 — scale ring scribed into the panel */}
      <Circle cx={c} cy={c} r={R.scale} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={1} />
      <Circle cx={c} cy={c} r={R.scale - 1} fill="none" stroke="rgba(84,96,114,0.22)" strokeWidth={1} />
      <G>
        {ticks.map((t, i) => (
          <Line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.major ? 'rgba(52,62,76,0.62)' : 'rgba(84,96,114,0.34)'}
            strokeWidth={t.major ? 1.6 : 1}
            strokeLinecap="round"
          />
        ))}
      </G>

      {/* 2 — arc channel, then the illumination inside it */}
      <Path
        d={arc(c, R.channel, startAngle, startAngle + sweep)}
        stroke="url(#channel)"
        strokeWidth={7}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d={arc(c, R.channel, startAngle, startAngle + sweep)}
        stroke="rgba(70,80,96,0.30)"
        strokeWidth={7}
        strokeLinecap="round"
        fill="none"
        opacity={0.5}
      />
      {normalised > 0.002 ? (
        <>
          {/* Bloom under the arc, so the light looks like it spills onto metal. */}
          <Path
            d={arc(c, R.channel, startAngle, angle)}
            stroke={indicatorColor}
            strokeWidth={13}
            strokeLinecap="round"
            fill="none"
            opacity={active ? 0.28 : 0.16}
          />
          <Path
            d={arc(c, R.channel, startAngle, angle)}
            stroke={indicatorColor}
            strokeWidth={6}
            strokeLinecap="round"
            fill="none"
          />
        </>
      ) : null}

      {/* 3 — knurled collar */}
      <Circle cx={c} cy={c} r={R.collarOuter} fill="url(#collar)" />
      <G>
        {knurls.map((k, i) => (
          <Line
            key={i}
            x1={k.x1}
            y1={k.y1}
            x2={k.x2}
            y2={k.y2}
            stroke={k.lit > 0.35 ? 'rgba(255,255,255,0.55)' : 'rgba(58,68,84,0.30)'}
            strokeWidth={1}
          />
        ))}
      </G>
      <Circle cx={c} cy={c} r={R.collarOuter} fill="none" stroke="rgba(58,68,84,0.35)" strokeWidth={1} />

      {/* 4 — turned cap, with machining rings and a specular highlight */}
      <Circle cx={c} cy={c} r={R.cap} fill="url(#cap)" />
      <Circle cx={c} cy={c} r={R.cap} fill="url(#capShade)" />
      <Circle cx={c} cy={c} r={R.cap} fill="url(#capShadow)" />
      <G opacity={0.22}>
        {[0.86, 0.7, 0.54, 0.38, 0.22].map((f) => (
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
      {/* Soft specular bloom, offset up-left to match the light source. */}
      {/* Tight specular, offset up-left. Small and bright reads as polished
          metal; broad and soft just washes the dome out. */}
      <Ellipse
        cx={c - R.cap * 0.28}
        cy={c - R.cap * 0.36}
        rx={R.cap * 0.46}
        ry={R.cap * 0.30}
        fill="url(#specular)"
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
        stroke="rgba(70,80,96,0.30)"
        strokeWidth={1.4}
        strokeLinecap="round"
      />

      {/* 5 — indicator milled into the cap: shadow wall plus a lit lower lip */}
      <Line
        x1={polar(c, R.cap - 22, angle).x}
        y1={polar(c, R.cap - 22, angle).y}
        x2={polar(c, R.cap - 5, angle).x}
        y2={polar(c, R.cap - 5, angle).y}
        stroke="rgba(46,55,68,0.40)"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <Line
        x1={polar(c, R.cap - 22, angle).x}
        y1={polar(c, R.cap - 22, angle).y}
        x2={polar(c, R.cap - 5, angle).x}
        y2={polar(c, R.cap - 5, angle).y}
        stroke={indicatorColor}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
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
