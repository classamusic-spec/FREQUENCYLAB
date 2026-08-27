# Roadmap

Honest status. Anything listed as built is built and, where it can be, tested.

## Built

**The engine.** Oscillators with PolyBLEP, binaural (two calculation modes),
monaural, isochronic, AM, FM, harmonic, procedural noise, filters, panning,
stereo motion, mixing, a lookahead limiter and level metering. A modular routing
graph with descriptor-driven parameters, cycle detection, range validation and
audio-safety checks. Deterministic playback with sample-exact stage boundaries
and equal-power cross-fades.

**The protocol engine.** Versioned schema, automation lanes with six curve
shapes, canonical serialisation, SHA-256 Protocol DNA with human, short and full
forms, shareable strings with checksums, import verification, forward migration
and lineage.

**The instrument.** Design system, the signature encoder, precision readouts,
signal flow view, oscilloscope, spectrum analyser, vector scope, modulation
view, session ring, timeline and automation editors.

**The product.** Onboarding, calibration with real test tones, Simple Mode,
Explorer, Lab with the full rack and routing, the protocol builder, the session
player with live telemetry, history, ratings, blinded experiments with committed
assignments, personal insights, the evidence library, the offline AI designer,
WAV and DNA export, data export and delete, and DSP diagnostics.

**Validation.** 137 tests including numerical DSP validation. Both iOS and
Android bundles build clean.

## Not built, and why

| Thing | Status |
|---|---|
| Any server | Deliberate. The product is local-first and complete without one. [docs/BACKEND.md](BACKEND.md) is the design. |
| Accounts, cloud sync | Requires the backend. |
| Community, publishing, follows | Requires the backend and server-side moderation. The domain models and lineage exist. |
| Biometrics (HealthKit / Health Connect) | `Session.biometrics` and `BiometricSample` are modelled and the analysis takes sessions rather than health APIs. The native integration is not written, and fabricating biometric values would be worse than not having them. |
| Worklet audio backend | The `AudioBackend` seam is sized for it. It would cut latency from ~256 ms to one block. Not built because it could not be validated in this environment. |
| Light mode | Needs its own material study — printed markings rather than illuminated ones — not an inversion of the dark palette. |
| Subscriptions | No billing integration. Everything is unlocked and the Profile screen says so rather than showing a paywall that does nothing. |
| Localisation | Strings are inline English. Extraction is the prerequisite. |
| Analytics | The consent flag exists in preferences; no events are collected and no endpoint exists. Safety events are stored locally and bounded to 200 records. |
| UI and E2E tests | Screens typecheck and bundle; no component tests yet. |

## Phase 2 — depth on what exists

- Worklet audio backend, with a device-measured latency comparison.
- Custom harmonic mixtures as a first-class waveform in the selector.
- Automation lane copy/paste between stages, and lane presets.
- Protocol comparison view — two DNAs side by side with an audible A/B.
- Long-session drift validation beyond ten minutes.
- Component tests for the encoder, the timeline and the automation editor.

## Phase 3 — accounts and integrations

- Backend per [docs/BACKEND.md](BACKEND.md): auth, sync, versioned protocol
  storage, audit trails.
- HealthKit and Health Connect behind the existing consent model, with the
  measured-versus-inferred distinction visible in every biometric readout.
- Server-side AI behind the existing `ProtocolDesigner` interface.
- Evidence library updates delivered as data rather than app releases.

## Phase 4 — community

- Publishing with server-side schema and safety moderation.
- Discovery, ratings, reviews, forks, remixes, creator follows.
- Lineage across users, with the version diff the local view already renders.
- Aggregate statistics recomputed server-side from real rows — never fabricated.

## Principles that constrain every phase

1. Core DSP works offline. Permanently.
2. No fake functionality. If a control looks functional, it is.
3. No fabricated data — not citations, not biometrics, not community metrics.
4. Simple Mode is a simplified interface to the same engine, never a separate one.
5. Uncertainty is communicated, not hidden.
