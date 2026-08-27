# DSP

## The real-time contract

Three rules, and every node in the graph obeys them:

1. **No allocation in `render`.** Buffers are created once in `prepare`.
2. **No locks.** Parameter writes move a smoother's target; the render path
   reads the smoothed value. A write from the UI thread can never produce a
   discontinuity, only a ramp.
3. **No exceptions.** A node that could produce a non-finite sample clamps
   instead. `FmNode` clamps instantaneous frequency to avoid folding over
   Nyquist; `HarmonicOscillator` mutes partials above it rather than aliasing.

## Determinism

Given the same protocol, sample rate and block size, the engine produces
bit-identical audio every time. This is not incidental — it is what makes a
Protocol DNA a reproducible experiment rather than a label.

- **Noise** uses xoshiro128\*\* seeded from the node id. `Math.random` appears
  nowhere in the DSP core.
- **Render order** comes from a topological sort with sorted seeds and a sorted
  queue, so an identical graph always renders in an identical order.
- **Block size independence** — automation is evaluated at block boundaries and
  smoothed per sample, so changing the block size changes the audio by less than
  the smoothers' time constants. The test suite asserts agreement to four
  decimal places between 64- and 512-sample blocks.

## Oscillators

Phase is stored **normalised** (0..1), not in radians:

```
phase += frequency / sampleRate
if (phase >= 1) phase -= floor(phase)
```

Two reasons. A radian accumulator loses mantissa bits as it grows, which matters
across a 90-minute session; and the wrap is one subtraction rather than a modulo
by 2π.

**Phase is never reset during automation.** That single rule is what makes
sweeps click-free. Frequency changes alter the increment, not the accumulator,
so the waveform stays continuous through any parameter movement.

Square and saw are generated naively and corrected with PolyBLEP around the
discontinuity. At the carrier frequencies this instrument uses (20–1500 Hz) the
residual inharmonic content measures below 2% of the fundamental.

## The engines

### Binaural

```
mode = offset:    L = carrier          R = carrier + beat
mode = centered:  L = carrier − beat/2 R = carrier + beat/2
```

`separation` cross-bleeds the two channels:

```
bleed  = (1 − separation) / 2
direct = 1 − bleed
L = (sinL · direct + sinR · bleed) · amplitude
R = (sinR · direct + sinL · bleed) · amplitude
```

At `separation = 1` the measured leakage of one ear's tone into the other is
below −60 dB. At `separation = 0` the two channels are sample-identical, which
is an acoustic beat, and the validator warns that the binaural effect has
collapsed.

### Monaural

Two tones summed *before* the output, at amplitudes `(1 − mix)` and `mix`, so
the peak stays bounded regardless of the control. The beat exists acoustically
and survives a single speaker.

### Isochronic

An audible carrier multiplied by a pulse envelope:

```
gate   = 1 − depth + depth · envelope(pulsePhase)
sample = waveform(carrierPhase) · gate · amplitude
```

Envelope shapes are `sine` (raised cosine over the on-period), `softSquare`
(cosine attack and release, the default), `square`, `triangle` and `trapezoid`.
`square` is the only shape with true discontinuities. It measures at more than
five times the waveform's own maximum slope — a genuine broadband click — and
the graph validator warns before it can be selected by accident.

### AM

A unipolar modulator, 0..1:

```
gain = 1 − depth + depth · modulator(modPhase)
```

At full depth with a sine modulator this is `(1 + cos)/2`, i.e. modulation index
1, which places each sideband at half the carrier amplitude. With an upstream
connection the node becomes an insert and modulates that signal instead; the
carrier phasor keeps advancing either way, so switching modes stays continuous.

### FM

```
instantaneous = clamp(carrier + deviation · depth · sin(modPhase), 0.1, 0.45 · sampleRate)
```

The clamp is not cosmetic: a deep sweep would otherwise fold over Nyquist or go
negative, both of which alias audibly.

### Harmonic

Eight partials over one shared fundamental phase accumulator, so every partial
stays locked through frequency automation. Partials above Nyquist are muted
rather than allowed to fold back. The stack is peak-normalised when the
amplitudes sum above unity.

## Noise

Generated sample by sample. Nothing loops.

| Colour | Method | Measured slope |
|---|---|---|
| White | uniform source | flat within 1.5 dB/octave |
| Pink | Paul Kellet's economy filter, gain matched | −1.5 to −4.5 dB/octave |
| Brown | leaky integrator with a **reflecting** bound | −4.5 to −7.5 dB/octave |

The bound on brown noise reflects rather than clips. Clipping a random walk
creates audible flat spots and a DC offset over a long session; reflection keeps
the increment statistics intact.

`StereoNoise` cross-fades between one shared source (width 0, dead centre) and
two independent sources (width 1, fully decorrelated) with a constant-power law,
so perceived level does not dip mid-travel. Measured channel correlation is
above 0.99 at width 0 and below 0.1 at width 1.

## Automation and sweeps

There is one mechanism, not two. A lane is a list of points; each point owns the
curve of the segment that *starts* at it. A two-point lane is a frequency sweep.
An n-point lane is a DAW automation curve. Values are held before the first
point and after the last, so a lane never introduces a jump at its edges.

`exponential` on two positive endpoints interpolates in the log domain —
constant ratio per unit time, which is what the ear expects from a sweep rather
than constant Hz per unit time.

## The master chain

```
graph output → DC block → gain → session fade → limiter → meter → device
```

Order matters. The fade sits *before* the limiter so a fade-out cannot be undone
by limiter release, and the DC blocker sits first so a deeply modulated signal's
offset never eats headroom.

Session fades are raised cosines: zero slope at both ends, so a session emerges
from silence with no perceptible onset.

The limiter is a 5 ms lookahead design with a soft knee, linked detection across
both channels, and a hard-clip safety net after the gain stage. Linked detection
matters here specifically: a wandering stereo image under gain reduction would be
indistinguishable from the binaural effect being measured. Against a signal four
times too loud, the measured output peak stays at or below the ceiling on every
sample, and a 2:1 level ratio between channels survives limiting intact.

## Stage transitions

Stage boundaries are sample-exact: `SessionRenderer.render` splits a block at the
boundary rather than rounding to it. Each stage compiles its own graph, and the
next stage's graph is compiled a stage ahead so a compile never happens inside a
render call.

Cross-fades are equal power (`sin`/`cos`), because the two stages' signals are
uncorrelated and a linear fade would dip in the middle. During a cross-fade the
outgoing stage keeps rendering with its automation held at its final value, so
both graphs stay phase-continuous across the boundary.

## Performance

Measured on Node 22, a three-module protocol (binaural + 40 Hz AM + pink noise),
48 kHz, 128-sample blocks: **~28× real time**, about 3.5% of one core for live
playback. Hermes is slower; the queue depth in the audio backend exists to
absorb the difference and the diagnostics screen reports the actual load.
