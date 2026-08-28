import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { EDGES, LIGHT, SHADOW, SURFACES, type Ramp } from '../materials';
import { colors, radius } from '../tokens';

/**
 * The physical surfaces every other component is built from.
 *
 * Three forms, matching the three things a machined panel can do: sit proud of
 * the case (`Raised`), be milled into it (`Recessed`), or be a cutout showing
 * dark glass (`DisplayGlass`). Keeping them here means the lighting rules in
 * `materials.ts` are applied in exactly one place.
 */

export interface SurfaceProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Corner radius. Defaults to the panel radius. */
  cornerRadius?: number;
  /** Overrides the material ramp for special cases. */
  ramp?: Ramp;
}

/**
 * A form standing above the chassis.
 *
 * Built from two nested views because React Native allows one shadow per view:
 * the outer carries the wide ambient shadow, the inner the tight contact
 * shadow. Together they read as an object resting on a surface rather than
 * floating over it.
 */
export function Raised({ children, style, cornerRadius = radius.panel, ramp }: SurfaceProps) {
  return (
    <View style={[{ borderRadius: cornerRadius }, SHADOW.ambient as ViewStyle, style]}>
      <View style={[styles.contact, { borderRadius: cornerRadius }]}>
        <LinearGradient
          colors={(ramp ?? SURFACES.panel)}
          start={LIGHT.face.start}
          end={LIGHT.face.end}
          style={[styles.fill, { borderRadius: cornerRadius }]}
        >
          <View style={[styles.bevelRaised, { borderRadius: cornerRadius }]} pointerEvents="none" />
          {children}
        </LinearGradient>
      </View>
    </View>
  );
}

/**
 * A well milled into the panel.
 *
 * The rim shades the top of the well and light bounces onto the bottom lip —
 * the inverse of `Raised` — and there is deliberately no drop shadow, because
 * a hole does not cast one.
 */
export function Recessed({ children, style, cornerRadius = radius.control, ramp }: SurfaceProps) {
  return (
    <View style={[styles.recessOuter, { borderRadius: cornerRadius }, style]}>
      <LinearGradient
        colors={(ramp ?? SURFACES.well)}
        start={LIGHT.well.start}
        end={LIGHT.well.end}
        style={[styles.fill, { borderRadius: cornerRadius }]}
      >
        {/* The shadow the rim casts down into the well. */}
        <LinearGradient
          colors={['rgba(58,68,84,0.16)', 'rgba(58,68,84,0.03)', 'rgba(58,68,84,0)'] as const}
          start={LIGHT.well.start}
          end={{ x: 0.5, y: 0.42 }}
          style={[StyleSheet.absoluteFill, { borderRadius: cornerRadius }]}
          pointerEvents="none"
        />
        <View style={[styles.bevelWell, { borderRadius: cornerRadius }]} pointerEvents="none" />
        {children}
      </LinearGradient>
    </View>
  );
}

/**
 * A dark display cut into the panel behind a bezel.
 *
 * This is the only genuinely dark surface in the instrument, which is what
 * makes readouts read as *emitting* light rather than merely being coloured.
 * A diagonal sheen over the top sells the glass.
 */
export function DisplayGlass({
  children,
  style,
  cornerRadius = radius.control,
  glare = true,
}: SurfaceProps & { glare?: boolean }) {
  return (
    <View style={[styles.bezelOuter, { borderRadius: cornerRadius + 3 }, style]}>
      <LinearGradient
        colors={SURFACES.bezel}
        start={LIGHT.face.start}
        end={LIGHT.face.end}
        style={[styles.bezelFill, { borderRadius: cornerRadius + 3 }]}
      >
        <View style={[styles.glassInner, { borderRadius: cornerRadius }]}>
          <LinearGradient
            colors={SURFACES.display}
            start={LIGHT.vertical.start}
            end={LIGHT.vertical.end}
            style={[styles.fill, { borderRadius: cornerRadius }]}
          >
            {children}
            {glare ? (
              <LinearGradient
                colors={SURFACES.glass}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.85, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: cornerRadius }]}
                pointerEvents="none"
              />
            ) : null}
          </LinearGradient>
        </View>
      </LinearGradient>
    </View>
  );
}

/**
 * Brushed-metal grain.
 *
 * Overlaid on the chassis at very low opacity. Real anodised aluminium is not
 * a flat colour, and a faint directional grain is most of what separates
 * "metal" from "grey rectangle" — but it has to stay near the threshold of
 * visibility or it becomes texture-for-its-own-sake.
 */
export function BrushedGrain({ opacity = 0.5 }: { opacity?: number }) {
  return (
    <View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="grain" cx="30%" cy="0%" r="90%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
            <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.06" />
            <Stop offset="1" stopColor="#5D6B80" stopOpacity="0.10" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#grain)" />
      </Svg>
    </View>
  );
}

/**
 * A machine screw.
 *
 * Used sparingly at panel corners. One per corner of a major module only —
 * screws everywhere is the fastest way to make skeuomorphism look like a
 * novelty rather than an instrument.
 */
export function Screw({ size = 10, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const r = size / 2;
  return (
    <View style={style} pointerEvents="none">
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="screwHead" cx="35%" cy="30%" r="75%">
            <Stop offset="0" stopColor="#F2F5F9" />
            <Stop offset="0.6" stopColor="#C4CBD6" />
            <Stop offset="1" stopColor="#98A2B1" />
          </RadialGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r - 0.5} fill="url(#screwHead)" stroke="rgba(70,80,96,0.45)" strokeWidth={0.6} />
        {/* Slot, lit on its lower edge like any cut into metal. */}
        <Rect x={r * 0.42} y={r - 0.55} width={size * 0.58} height={1.1} rx={0.5} fill="rgba(64,74,90,0.55)" />
        <Rect x={r * 0.42} y={r + 0.4} width={size * 0.58} height={0.6} rx={0.3} fill="rgba(255,255,255,0.6)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  contact: {
    overflow: 'hidden',
    shadowColor: '#1D2430',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  bevelRaised: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: EDGES.raisedTop,
    borderBottomWidth: 1,
    borderBottomColor: EDGES.raisedBottom,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(255,255,255,0.55)',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(83,95,112,0.16)',
  },
  recessOuter: { overflow: 'hidden', backgroundColor: colors.panelRecessed },
  bevelWell: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: EDGES.wellTop,
    borderBottomWidth: 1,
    borderBottomColor: EDGES.wellBottom,
  },
  bezelOuter: {
    overflow: 'hidden',
    shadowColor: '#232A36',
    shadowOpacity: 0.26,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  bezelFill: { padding: 3 },
  glassInner: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: EDGES.bezelInner,
  },
});
