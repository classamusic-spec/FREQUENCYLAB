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
  /**
   * Hides the scale pointer. For a dial whose quantity has no single value —
   * broadband noise — where a pointer would be a claim with nothing under it.
   */
  hidePointer?: boolean;
}

/**
 * A brushed-steel rotary encoder with an illuminated ring.
 *
 * Built as concentric physical parts, outside in — the order a real one is
 * assembled, which is what keeps the shading consistent with itself:
 *
 *   1. a hairline scale track scribed into the panel, with fine ticks and a
 *      lit pointer at the value
 *   2. a bright turned bezel, then a wide knurled collar between two bevels
 *   3. the illuminated ring: a lit groove between collar and cap, drawn as a
 *      wide soft bloom under a bright core
 *   4. the cap: anisotropically brushed steel
 *
 * ## Why the cap is drawn as wedges
 *
 * Radially brushed metal does not shade like a dome. Its scratches all run
 * outward from the centre, so the light catches them along one axis and loses
 * them along the other — a bright bow-tie through the upper-left and
 * lower-right, darker quarters between. Neither SVG nor React Native has a
 * conic gradient, so the cap is a fan of thin wedges whose grey follows
 * `cos 2θ`, with a little per-wedge variation for grain. That variation is
 * seeded, not random, so a re-render never flickers.
 *
 * Everything is drawn in a fixed proportion of `size`, so one definition
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
  hidePointer,
}: KnobFaceProps) {
  const c = size / 2;
  const small = size < 120;
  const R = small
    ? {
        track: c * 0.99,
        tickOuter: c * 0.97,
        tickMajor: c * 0.9,
        tickMinor: c * 0.935,
        bezelOuter: c * 0.86,
        collarOuter: c * 0.83,
        collarInner: c * 0.77,
        ring: c * 0.755,
        cap: c * 0.735,
      }
    : {
        track: c * 0.992,
        tickOuter: c * 0.965,
        tickMajor: c * 0.905,
        tickMinor: c * 0.938,
        bezelOuter: c * 0.868,
        collarOuter: c * 0.846,
        collarInner: c * 0.772,
        ring: c * 0.757,
        cap: c * 0.738,
      };

  const angle = startAngle + Math.max(0, Math.min(1, normalised)) * sweep;
  const ringColor = locked ? '#9C9C9C' : accent;

  /** Fine ticks along the travel; every fifth is a longer, darker major. */
  const ticks = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    const count = small ? 25 : 61;
    for (let i = 0; i < count; i++) {
      const a = startAngle + (i / (count - 1)) * sweep;
      const major = i % 5 === 0;
      const o = polar(c, R.tickOuter, a);
      const n = polar(c, major ? R.tickMajor : R.tickMinor, a);
      out.push({ x1: n.x, y1: n.y, x2: o.x, y2: o.y, major });
    }
    return out;
  }, [c, R.tickOuter, R.tickMajor, R.tickMinor, small, startAngle, sweep]);

  /**
   * Knurling: alternating ridge and valley, the way a cut knurl actually reads
   * — light on the crest, dark in the cut — rather than lines on a flat band.
   */
  const knurls = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number; crest: boolean }[] = [];
    const count = small ? 84 : 200;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * 360;
      const inner = polar(c, R.collarInner + 0.6, a);
      const outer = polar(c, R.collarOuter - 0.6, a);
      out.push({ x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y, crest: i % 2 === 0 });
    }
    return out;
  }, [c, R.collarInner, R.collarOuter, small]);

  /** The brushed cap, as a fan of wedges shaded by `cos 2θ`. */
  const wedges = useMemo(() => {
    const out: { d: string; fill: string }[] = [];
    const count = small ? 96 : 180;
    const step = 360 / count;
    for (let i = 0; i < count; i++) {
      const a0 = i * step;
      // A hair of overlap so antialiasing never opens a seam between wedges.
      const a1 = a0 + step + 0.6;
      const rad = ((a0 + step / 2) * Math.PI) / 180;
      const lobe = Math.cos(2 * (rad - (60 * Math.PI) / 180));
      const ripple = Math.cos(6 * rad + 0.7);
      const grain = seeded(i) * 2 - 1;
      const g = Math.max(160, Math.min(246, Math.round(207 + 30 * lobe + 3 * ripple + 2.5 * grain)));
      const p0 = polar(c, R.cap + 0.5, a0);
      const p1 = polar(c, R.cap + 0.5, a1);
      out.push({
        d: `M ${c} ${c} L ${p0.x} ${p0.y} A ${R.cap} ${R.cap} 0 0 1 ${p1.x} ${p1.y} Z`,
        fill: `rgb(${g},${g},${g})`,
      });
    }
    return out;
  }, [c, R.cap, small]);

  /** Hairline scratches over the wedges: the grain the eye reads as brushing. */
  const scratches = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number; light: boolean; o: number }[] = [];
    const count = small ? 70 : 160;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * 360 + seeded(i + 1000) * 2;
      const inner = polar(c, R.cap * (0.05 + seeded(i + 2000) * 0.25), a);
      const outer = polar(c, R.cap * 0.99, a);
      out.push({
        x1: inner.x,
        y1: inner.y,
        x2: outer.x,
        y2: outer.y,
        light: i % 2 === 0,
        o: 0.035 + seeded(i + 3000) * 0.07,
      });
    }
    return out;
  }, [c, R.cap, small]);

  const pointer = polar(c, R.tickOuter + (small ? 0.5 : 1), angle);
  const pointerInner = polar(c, R.tickMajor - (small ? 1 : 2), angle);
  const bloomInner = (R.ring / R.bezelOuter) * 0.93;
  const bloomPeak = R.ring / R.bezelOuter;
  const bloomOuter = Math.min(0.99, (R.collarInner / R.bezelOuter) * 1.035);

  return (
    <Svg width={size} height={size} opacity={disabled ? 0.45 : 1}>
      <Defs>
        {/* Soft contact shadow the whole knob throws onto the panel. */}
        <RadialGradient id="kfDrop" cx="50%" cy="50%" r="50%">
          <Stop offset="0.78" stopColor="#000000" stopOpacity="0.16" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0" />
        </RadialGradient>
        {/* Turned bezel: lit top-left, falling away bottom-right. */}
        <SvgLinearGradient id="kfBezel" x1="0.15" y1="0" x2="0.85" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.5" stopColor="#E2E2E2" />
          <Stop offset="1" stopColor="#B4B4B4" />
        </SvgLinearGradient>
        {/* The collar band under the knurls, darker than the bezel. */}
        <SvgLinearGradient id="kfCollar" x1="0.1" y1="0" x2="0.9" y2="1">
          <Stop offset="0" stopColor="#EDEDED" />
          <Stop offset="0.5" stopColor="#C4C4C4" />
          <Stop offset="1" stopColor="#9E9E9E" />
        </SvgLinearGradient>
        {/* Gentle falloff toward the cap's rim — brushed steel is not flat. */}
        <RadialGradient id="kfCapShade" cx="50%" cy="46%" r="54%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.16" />
          <Stop offset="0.7" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0.14" />
        </RadialGradient>
        {/* The light the ring throws onto the steel either side of it. */}
        <RadialGradient id="kfBloom" cx="50%" cy="50%" r="50%">
          <Stop offset={String(bloomInner)} stopColor={ringColor} stopOpacity="0" />
          <Stop offset={String(bloomPeak)} stopColor={ringColor} stopOpacity={active ? '0.42' : '0.3'} />
          <Stop offset={String(bloomOuter)} stopColor={ringColor} stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* 1 — the scale scribed into the panel */}
      <Path
        d={arc(c, R.track, startAngle, startAngle + sweep)}
        stroke="rgba(120,120,120,0.28)"
        strokeWidth={small ? 0.8 : 1}
        fill="none"
      />
      {[startAngle, startAngle + sweep].map((a) => {
        const o = polar(c, R.track, a);
        const n = polar(c, R.tickMajor, a);
        return (
          <Line
            key={a}
            x1={n.x}
            y1={n.y}
            x2={o.x}
            y2={o.y}
            stroke="rgba(120,120,120,0.35)"
            strokeWidth={small ? 0.8 : 1}
          />
        );
      })}
      <G>
        {ticks.map((t, i) => (
          <Line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.major ? 'rgba(40,40,40,0.78)' : 'rgba(70,70,70,0.42)'}
            strokeWidth={t.major ? (small ? 1.2 : 1.8) : small ? 0.8 : 1}
            strokeLinecap="round"
          />
        ))}
      </G>
      {hidePointer ? null : (
        <>
          <Line
            x1={pointerInner.x}
            y1={pointerInner.y}
            x2={pointer.x}
            y2={pointer.y}
            stroke={ringColor}
            strokeWidth={small ? 4.5 : 7}
            strokeLinecap="round"
            opacity={0.25}
          />
          <Line
            x1={pointerInner.x}
            y1={pointerInner.y}
            x2={pointer.x}
            y2={pointer.y}
            stroke={ringColor}
            strokeWidth={small ? 2.2 : 3.2}
            strokeLinecap="round"
          />
        </>
      )}

      {/* 2 — bezel, knurled collar and its two bevels */}
      <Circle cx={c} cy={c + size * 0.022} r={R.bezelOuter * 1.06} fill="url(#kfDrop)" />
      <Circle cx={c} cy={c} r={R.bezelOuter} fill="url(#kfBezel)" />
      <Circle cx={c} cy={c} r={R.bezelOuter - 0.5} fill="none" stroke="rgba(110,110,110,0.35)" strokeWidth={0.8} />
      <Circle cx={c} cy={c} r={R.collarOuter} fill="url(#kfCollar)" />
      <G>
        {knurls.map((k, i) => (
          <Line
            key={i}
            x1={k.x1}
            y1={k.y1}
            x2={k.x2}
            y2={k.y2}
            stroke={k.crest ? 'rgba(255,255,255,0.75)' : 'rgba(70,70,70,0.2)'}
            strokeWidth={small ? 0.7 : 0.9}
          />
        ))}
      </G>
      <Circle cx={c} cy={c} r={R.collarOuter} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={small ? 0.8 : 1.1} />
      <Circle cx={c} cy={c} r={R.collarInner} fill="none" stroke="rgba(80,80,80,0.32)" strokeWidth={small ? 0.8 : 1} />

      {/* 3 — the illuminated ring */}
      <Circle cx={c} cy={c} r={R.bezelOuter} fill="url(#kfBloom)" />
      <Circle cx={c} cy={c} r={R.ring} fill="none" stroke={ringColor} strokeWidth={small ? 5 : 9} opacity={active ? 0.3 : 0.18} />
      <Circle cx={c} cy={c} r={R.ring} fill="none" stroke={ringColor} strokeWidth={small ? 2 : 3} opacity={active ? 1 : 0.95} />
      <Circle cx={c} cy={c} r={R.ring} fill="none" stroke="#FFFFFF" strokeWidth={small ? 0.6 : 0.9} opacity={0.55} />

      {/* 4 — the brushed cap */}
      <G>
        {wedges.map((w, i) => (
          <Path key={i} d={w.d} fill={w.fill} />
        ))}
      </G>
      <G>
        {scratches.map((s, i) => (
          <Line
            key={i}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke={s.light ? '#FFFFFF' : '#5A5A5A'}
            strokeWidth={0.5}
            opacity={s.o}
          />
        ))}
      </G>
      <Circle cx={c} cy={c} r={R.cap} fill="url(#kfCapShade)" />
      {/*
       * No lit edge on the cap. A white rim arc reads as a scratch where it
       * crosses the darker quarters of the brushing, and the ring already
       * draws this edge — two outlines on one boundary is one too many.
       */}

      {/* Optional milled indicator, for caps that do not carry a readout. */}
      {showIndicator ? (
        <>
          <Line
            x1={polar(c, R.cap * 0.55, angle).x}
            y1={polar(c, R.cap * 0.55, angle).y}
            x2={polar(c, R.cap * 0.9, angle).x}
            y2={polar(c, R.cap * 0.9, angle).y}
            stroke="rgba(40,40,40,0.35)"
            strokeWidth={small ? 3.2 : 5}
            strokeLinecap="round"
          />
          <Line
            x1={polar(c, R.cap * 0.55, angle).x}
            y1={polar(c, R.cap * 0.55, angle).y}
            x2={polar(c, R.cap * 0.9, angle).x}
            y2={polar(c, R.cap * 0.9, angle).y}
            stroke={ringColor}
            strokeWidth={small ? 1.8 : 2.6}
            strokeLinecap="round"
          />
        </>
      ) : null}
    </Svg>
  );
}

/** A deterministic 0..1 value per index, so the grain never shifts between renders. */
function seeded(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
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
