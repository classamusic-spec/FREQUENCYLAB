/**
 * Material physics for the FREQUENCY LAB instrument.
 *
 * Skeuomorphism only reads as real when it is *consistent*. Everything in this
 * file exists to enforce one set of physical rules across every surface:
 *
 *  - **One light source**, above and slightly left (≈135°). Every highlight
 *    sits on the top-left edge of a form and every shadow falls bottom-right.
 *    A single control lit from the wrong side destroys the illusion for the
 *    whole screen, which is why no component is allowed its own lighting.
 *  - **Raised** surfaces catch light on their top edge, occlude beneath, and
 *    cast a drop shadow onto what is behind them.
 *  - **Recessed** surfaces do the opposite: the rim casts a shadow across the
 *    top of the well, light bounces onto the bottom lip, and there is no drop
 *    shadow — a hole does not float.
 *  - **Curved** surfaces (knob caps, button domes) get a specular gradient
 *    rather than a flat fill, so they read as turned metal instead of a circle.
 *  - **Ambient occlusion** darkens the seam wherever two surfaces meet.
 *
 * Gradients are expressed as colour ramps consumed by `expo-linear-gradient`
 * and `react-native-svg`, so the same material definition drives both the box
 * layout and the vector controls.
 */

export type Ramp = readonly [string, string, ...string[]];

/** Direction presets matching the fixed light source. */
export const LIGHT = {
  /** Top-left to bottom-right, the default for a lit face. */
  face: { start: { x: 0.15, y: 0 }, end: { x: 0.85, y: 1 } },
  /** Straight down, for panel faces where the grain runs horizontally. */
  vertical: { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
  /** Straight across, for brushed-metal grain. */
  horizontal: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
  /** Reversed, for the inside of a recess where light bounces upward. */
  well: { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
} as const;

/**
 * Surface ramps.
 *
 * Each is a real material: the number of stops matters as much as the colours,
 * because a two-stop gradient reads as a flat wash while a four-stop one with a
 * bright band near the top reads as light travelling across brushed metal.
 */
export const SURFACES = {
  /** The instrument's outer case — porcelain white, faint cool grain. */
  chassis: ['#F8FAFC', '#F4F6F9', '#EFF2F6', '#F5F7FA'] as Ramp,
  /** A raised module face sitting proud of the chassis. */
  panel: ['#FFFFFF', '#FDFDFE', '#F7F9FB'] as Ramp,
  /** A panel that is currently engaged or selected. */
  panelActive: ['#FFFFFF', '#FEFEFF', '#F9FBFD'] as Ramp,
  /** The floor of a milled recess — darker at the top where the rim shades it. */
  well: ['#E4E8EE', '#ECEFF4', '#F2F4F8'] as Ramp,
  /** A deeper well, for display cutouts. */
  wellDeep: ['#DDE2EA', '#E7EBF1', '#EFF2F6'] as Ramp,
  /** Polished steel knob cap, lit from the top-left. */
  knobCap: ['#FFFFFF', '#F6F8FA', '#E9EDF2', '#D9DFE7'] as Ramp,
  /** The knurled outer ring of a knob. */
  knobRing: ['#E4E8EE', '#CFD6DE', '#BCC4CF', '#D8DDE5'] as Ramp,
  /** A tactile button cap at rest. */
  buttonCap: ['#FFFFFF', '#FBFCFD', '#F2F5F8'] as Ramp,
  /** The same cap depressed — the highlight collapses and the face darkens. */
  buttonCapPressed: ['#E7EBF1', '#EEF1F5', '#F5F7FA'] as Ramp,
  /** A primary/engaged button, tinted with the accent. */
  buttonPrimary: ['#63A7FF', '#3B8BF5', '#2C79E0'] as Ramp,
  /** A display well — recessed porcelain, no longer dark glass. */
  display: ['#EDF0F5', '#F2F5F8', '#F7F9FB'] as Ramp,
  /** The reflection sheen laid over a display well. */
  glass: ['rgba(255,255,255,0.65)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0)'] as Ramp,
  /** Bright bezel ring framing a display well. */
  bezel: ['#FFFFFF', '#F0F3F7', '#E2E7ED', '#EDF0F5'] as Ramp,
} as const;

/**
 * Edge treatments.
 *
 * A bevel is two hairlines, not one: the lit edge and the occluded edge. These
 * pairs are applied as border colours so a form reads as having thickness.
 */
export const EDGES = {
  /** Top edge of a raised form, catching the light. */
  raisedTop: 'rgba(255,255,255,0.95)',
  /** Bottom edge of a raised form, in its own shadow. */
  raisedBottom: 'rgba(122,136,158,0.20)',
  /** Top of a recess — shaded by the rim above it. */
  wellTop: 'rgba(96,110,132,0.22)',
  /** Bottom lip of a recess, catching bounced light. */
  wellBottom: 'rgba(255,255,255,0.9)',
  /** The seam where two surfaces meet. */
  seam: 'rgba(116,128,148,0.16)',
  /** A hairline scribed into the metal. */
  scribe: 'rgba(104,116,136,0.14)',
  /** Inside a display bezel. */
  bezelInner: 'rgba(112,126,148,0.22)',
} as const;

/**
 * Shadow stacks.
 *
 * React Native gives one shadow per view, so depth is built by nesting: a
 * wrapper carries the wide ambient shadow and the child carries the tight
 * contact shadow. `ambient` + `contact` used together is what separates a form
 * that is *lying on* the chassis from one that is floating above it.
 */
export const SHADOW = {
  /** Wide, soft, low-opacity — the shadow a form casts across the case. */
  ambient: {
    shadowColor: '#39506E',
    shadowOpacity: 0.10,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 7,
  },
  /** Tight and dark, immediately under the form. Sells the contact point. */
  contact: {
    shadowColor: '#2B3C55',
    shadowOpacity: 0.10,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  /** A knob standing off the panel. */
  knob: {
    shadowColor: '#33486A',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  /** A pressed control — shadow collapses as the cap sinks. */
  pressed: {
    shadowColor: '#2B3C55',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  /** A sheet lifted over the whole instrument. */
  sheet: {
    shadowColor: '#243248',
    shadowOpacity: 0.24,
    shadowRadius: 44,
    shadowOffset: { width: 0, height: -12 },
    elevation: 24,
  },
} as const;

/**
 * Engraving.
 *
 * Text cut into metal is darker than the surface with a bright lip on the
 * *lower* edge, where the far wall of the cut catches the light. Text raised
 * from the surface is the inverse. One pixel either way is the whole effect.
 */
export const ENGRAVE = {
  /** Debossed: cut into the panel. */
  cut: {
    textShadowColor: 'rgba(255,255,255,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  /** Embossed: standing off the panel. */
  raised: {
    textShadowColor: 'rgba(38,46,58,0.35)',
    textShadowOffset: { width: 0, height: -1 },
    textShadowRadius: 0,
  },
  /** Illuminated text in a display well. */
  glow: {
    textShadowColor: 'rgba(59,139,245,0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
} as const;

/** Radial shading stops for a turned metal cap, used by SVG knobs. */
export const KNOB_SHADING = {
  /** Specular highlight offset, as a fraction of the cap radius. */
  specular: { cx: 0.36, cy: 0.28, r: 0.72 },
  /** Ambient occlusion ring just inside the cap edge. */
  occlusion: { inner: 0.82, opacity: 0.18 },
} as const;
