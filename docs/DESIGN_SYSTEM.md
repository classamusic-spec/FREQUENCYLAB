# Design system

## The target

A precision instrument rendered in software. Anodised graphite, engraved
markings, recessed panels, one illumination colour. The interface should feel
expensive because of proportion, spacing, hairlines and restraint — not because
things glow.

The explicit non-goals: generic SaaS, bootstrap dashboards, ordinary meditation
apps, neon cyberpunk, cheap sci-fi HUDs, template glassmorphism, cluttered audio
plugins.

## Material language

A surface is defined by three things at once: its fill, a light hairline on the
edge that would catch light, and a dark hairline on the edge that would fall
into shadow. That is what makes `recessed` read as milled *into* the chassis and
`raised` as sitting proud of it — without a single gradient or blur.

```
raised     fill #1A1F28   top rgba(255,255,255,.07)   bottom rgba(0,0,0,.55)   + shadow
flat       fill #141820   top rgba(255,255,255,.055)  bottom rgba(0,0,0,.55)
recessed   fill #101318   top rgba(0,0,0,.55)         bottom rgba(255,255,255,.07)
```

The graphite stack — `#08090B` void, `#0C0E12` chassis, `#101318`, `#141820`,
`#1A1F28`, `#222835`, `#2C3340` bezel — separates surfaces by luminance only.
Never by hue.

## Colour

One dominant accent: **`#4DD6C1`**, used only where something is genuinely live —
an encoder ring, an active segment, a signal meter, a running session. It is
never a fill.

Secondary colour communicates state and nothing else: `#E5A45C` warning,
`#E0705C` limit, `#C86F8C` experiment, and the five evidence ratings. The
product is not RGB hardware.

## Typography

- **Readouts** — IBM Plex Mono, with tabular figures and fixed integer padding,
  always. `007.830`, not `7.83`. The padding is what makes a live value change
  without the layout shifting under it, and it is the difference between a
  readout and a label.
- **Interface** — Inter, at four sizes.
- **Hardware labels** — 10 pt, uppercase, 1.4 letter-spacing, tertiary tone.
  Used for engraved captions. Never for sentences.

Everything routes through one `Text` primitive so type, tone and tabular figures
cannot drift screen to screen. `allowFontScaling` is on by default with a 1.6×
cap, and layouts accommodate Dynamic Type rather than resisting it.

## Spacing and radius

A single 4-point scale (2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 56). Panels align to
it; nothing uses an arbitrary margin. Radii: 3 engraved, 8 control, 12 panel, 16
card, 24 sheet.

Minimum touch target is 44 points, enforced in the components rather than left
to each screen.

## Motion

Durations describe weight: 90 ms instant, 160 quick, 260 standard, 420 settle,
720 slow. The standard easing is a decelerating cubic (0.16, 1, 0.3, 1) —
weighted and precise, never bouncy.

A button press depresses the cap: the surface darkens, and the control scales
down by 1.5%. The movement is deliberately small; a button that travels far
reads as a toy.

**Reduced motion removes movement**, rather than shortening it. Either the OS
setting or the in-app preference triggers it, and state changes become instant.

## Haptics

The rule that matters is the rate limit. An encoder that fires a tick on every
value change becomes a buzzing nuisance within one gesture, so detents are
throttled to 45 ms and `beginGesture()` resets the throttle so the *first*
detent of every gesture always fires.

Six events, and no others: `detent`, `boundary` (a band edge or snap point),
`engage` (button or segment), `confirm` (save, start), `complete` (session end),
`warn`.

## The signature control

`FrequencyEncoder` resolves gestures in this order:

1. a drag that begins **on the ring** tracks the finger's angle, so the knob
   turns under the finger the way a physical encoder does. Movement is applied
   as a delta, not an absolute position, so grabbing the ring anywhere
   continues from the current value rather than snapping to the finger;
2. a drag that begins **on the cap** moves vertically, and horizontal distance
   from the start scales sensitivity — sliding away from the knob gives fine
   adjustment **without a mode**;
3. tap opens numeric entry — which is also the accessible path;
4. long press resets to the default;
5. an optional lock disables the whole control.

The gesture callbacks are worklets on the UI thread; which mode is active is
carried in a Reanimated shared value, and the value changes themselves are
dispatched back to JavaScript so the store stays the single source of truth.

The knob is drawn as a bezel, a 41-tick engraved scale with every fifth tick
longer, a recessed track, an illuminated arc, a turned cap of two concentric
circles, and a milled indicator line. Frequency controls use a logarithmic
taper, so the low end where the useful values live gets most of the travel.

## Component inventory

| Component | Notes |
|---|---|
| `InstrumentPanel` | Four tones, engraved header label, optional header-right slot |
| `Text` / `Label` | The only text primitives |
| `FrequencyEncoder` | The signature control |
| `PrecisionValueDisplay` | Padded numeric readout, optionally on an OLED-style plate |
| `HardwareButton` | Four variants, three sizes, press depression, selected/disabled/loading states |
| `SegmentSelector` | Recessed channel, raised cap, indicator bar plus weight — never colour alone |
| `ParameterControl` | Dense horizontal parameter row with the same drag model as the encoder |
| `NumericEntrySheet` | Custom keypad; the alternative to every rotary control |
| `SignalMeter` | 18-segment dBFS ladder for L, R and gain reduction |
| `Oscilloscope` / `SpectrumAnalyzer` / `StereoVectorScope` / `ModulationView` | Pure functions of an engine snapshot |
| `SessionRing` | Two concentric arcs — protocol and stage — plus 60 ticks |
| `SignalFlowView` | Ordered columns by depth, so signal reads left to right |
| `ProtocolTimeline` | Scaled stage strip with drag-resize, zoom, scrub and playhead |
| `AutomationLaneView` | Curve sampled through the engine's own `curveValue` |
| `EvidenceBadge` / `DnaChip` / `Tag` | |
| `ProtocolCard` / `InsightCard` / `ExperimentCard` | |
| `SafetyBanner` | Never a toast |
| Tab bar transport | Doubles as the mini transport while a session runs |

## Visualisers

They are pure functions of a snapshot the audio engine already produced. They
never ask the DSP for extra work and never run on the audio thread. If the UI
drops frames the picture stutters and the sound does not, which is the required
priority order.

The spectrum FFT is recomputed at most every 60 ms regardless of how often the
UI asks, and the session screen drops its scope frame rate from 24 to 12 fps
when the details panel is closed.

## Light mode

Not built. The flagship experience is the dark precision-instrument aesthetic,
and a light mode that simply inverted these values would look like a broken dark
mode rather than premium laboratory equipment. It needs its own material study —
bead-blasted aluminium and printed markings rather than illuminated ones — and
is listed in the roadmap rather than half-done.
