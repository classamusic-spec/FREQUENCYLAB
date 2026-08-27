# Testing

```bash
npm test           # 134 tests
npm run typecheck  # dsp-core and the app
```

The suite runs in about 40 seconds. Most of that is DSP: several tests render
minutes of audio and measure it.

## What is actually proven

The tests exercise the **shipping engine**, not a parallel implementation. The
offline renderer *is* `SessionRenderer`, the same class live playback uses.

### Oscillators and engines

| Test | Assertion |
|---|---|
| Frequency accuracy | Measured dominant frequency within 0.05 Hz at 40, 110, 220.5, 440 and 1000 Hz |
| Amplitude | Peak matches the requested amplitude at centre pan to two decimals |
| Equal-power pan | `L² + R² = 1` across the control's travel |
| Anti-aliasing | Inharmonic content in square and saw below 2% of the fundamental |
| Phase continuity | No sample step exceeds the waveform's own maximum slope, including across a mid-render frequency change |
| Binaural offset mode | L reads 200 Hz, R reads 207.83 Hz |
| Binaural centred mode | L reads 196 Hz, R reads 204 Hz |
| Channel separation | Better than −60 dB leakage between ears at full separation |
| Separation collapse | Channels sample-identical at separation 0 |
| Monaural | Both tones present in a single channel |
| Harmonics | Partial amplitudes match the requested ratios; muted partials measure below 1% |
| AM | Sidebands at carrier ± modulation rate, at the ratio the modulation index predicts |
| AM envelope | Envelope rate matches the modulation rate |
| FM | Sidebands spaced by the modulation rate; reduces to a pure tone at zero deviation |
| Isochronic timing | Pulse rate matches; reaches silence between pulses at full depth |
| Isochronic edges | Softened edges stay within 1.5× the waveform slope; a hard square exceeds 5×, which is why the validator warns |
| Stereo motion | Channels move in opposition at the requested rate |

### Noise

Spectral slope measured as mean power per bin across octave-spaced bands: white
flat within 1.5 dB/octave, pink between −1.5 and −4.5, brown between −4.5 and
−7.5. Also: a minute of audio apart, fewer than 10 of 4096 samples repeat;
identical renders are byte-identical; channel correlation above 0.99 at width 0
and below 0.1 at width 1; level stays within ±30% across the width control.

### Limiter and safety

Ceiling held against a 4× overdrive; reported gain reduction in the expected
range; a quiet signal passes through unmodified after the lookahead delay; a
silence-to-full-scale transient never escapes; a 2:1 channel ratio survives; and
**every sample** of a five-minute session at 1.5× master gain stays at or below
the ceiling.

### Protocol and reproducibility

SHA-256 against published vectors. Canonical JSON stable across independent
builds of the same protocol, unchanged by renaming or by moving a module on the
canvas, and changed by a 0.001 Hz carrier edit. DNA round-trips through the
shareable string; a damaged string is rejected rather than partially imported;
an engine-version mismatch is reported as a note rather than a failure.

Rendering the same protocol twice produces byte-identical audio. Rendering at 64
and 512 sample blocks agrees to four decimal places.

### Timing

Sweep endpoints match the linear sweep's true value at the *centre* of the
analysis window — the tests compute the expected value rather than asserting the
endpoint, because a 32768-sample window is not a point in time. Midpoint of a
ten-minute sweep reads 8 Hz. A three-point lane with a stepped segment reads
correctly at 1 s, 25 s and 45 s. The protocol clock stays sample-aligned across
51,200 rendered frames. Stage cross-fades introduce no step and hold level
within ±25%.

### Analysis

Welch's t-test against known-separation and known-overlap samples; a stable
seeded bootstrap interval; block randomisation balanced within every consecutive
pair; commitments detect a tampered assignment; the session plan withholds the
arm while blind; results refuse a p-value below five sessions per arm; a
time-of-day confound is flagged.

### Language

Two tests guard the product's claims: no generated insight body contains
*causes*, *treats*, *heals*, *cures*, *fixes* or *prevents*; no shipped preset
is named after a condition.

### AI designer

Parses the brief's advanced example — 45 minutes, alpha to theta, 220 Hz
carrier, 40 Hz AM between minutes 20 and 30 — into three stages of exactly 20,
10 and 15 minutes with a real AM automation lane that ramps from and back to
zero. Declines a cure request by name and still returns a valid protocol. Every
proposal validates and renders audibly.

## Adding a test

Analysis helpers live in `test/helpers.ts`: `measureFrequency` (parabolic
interpolation on a Blackman-Harris FFT), `magnitudeAt` (Goertzel), `bandPower`
(mean power per bin — averaging, not summing, is what makes an octave comparison
report the true slope), `envelope`, `crossingRate` (with hysteresis, or envelope
ripple counts as extra crossings), `rmsProfile`, `peak`, `rms` and `maxStep`.

Prefer `renderGraphOffline` for a single module — it skips the protocol clock,
automation and master chain, so a measurement is not confounded by the fade or
the limiter. Use `renderProtocolOffline` when the thing under test *is* the
protocol behaviour.

## Not covered

- On-device audio output. The queued backend's interaction with
  `AudioBufferQueueSourceNode` cannot be exercised without a device, and is the
  largest untested surface in the project.
- UI interaction tests. The screens typecheck and both platform bundles build,
  but no component test or E2E flow exists yet.
- Long-session drift beyond ten minutes of rendered audio.
