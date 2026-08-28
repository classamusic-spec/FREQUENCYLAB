# FREQUENCY LAB

A personal psychoacoustic laboratory: a real-time DSP engine, a protocol format
that makes any session reproducible, and an instrument built around both.

> Sound. Measured personally.

Every tone the app produces is synthesised sample by sample. There are no
prerecorded binaural tracks, no looped noise files, and no preset that is
secretly an audio asset. Simple Mode compiles to the same protocol object Lab
Mode edits, which is why a one-tap session can be opened, taken apart, forked
and experimented on without leaving the product.

---

## What it does

| | |
|---|---|
| **Generate** | Binaural, monaural and isochronic engines; AM, FM and harmonic synthesis; procedural white, pink and brown noise; click-free frequency sweeps |
| **Route** | A modular graph with cycle detection, range checking and audio-safety validation before anything plays |
| **Automate** | DAW-style automation lanes on nearly every parameter, with linear, smooth, exponential, logarithmic, stepped and bezier segments |
| **Reproduce** | Protocol DNA: a canonical serialisation and SHA-256 fingerprint that renders bit-identical audio from the same protocol |
| **Experiment** | Blinded A/B/control trials with seeded block randomisation and cryptographically committed assignments |
| **Understand** | An evidence-rated frequency library, and personal insights phrased as associations with the sample size attached |

## What it does not do

It does not diagnose, treat, cure or prevent anything, and it does not present
unsupported claims as established. The library lists historical frequency
claims — Rife, Solfeggio, Schumann — and labels them for what the evidence
actually supports. The AI designer declines medical framings by name and still
offers a usable session. Nothing in the product says *causes*, *treats*,
*heals* or *fixes*.

---

## Repository layout

```
frequencylab/
├── packages/
│   └── dsp-core/          @frequencylab/dsp-core — the whole engine, zero dependencies
│       ├── src/math/      curves, smoothers, deterministic PRNG, biquads, FFT
│       ├── src/dsp/       oscillators, noise, envelopes, limiter, metering
│       ├── src/graph/     node descriptors, runtime nodes, validation, compiler
│       ├── src/protocol/  schema, automation, canonical form, DNA, migration
│       ├── src/engine/    session renderer, master chain, offline render, WAV
│       ├── src/analysis/  statistics, experiments, personal insights
│       ├── src/library/   evidence-rated frequency library
│       ├── src/safety/    preflight checks and route policy
│       └── test/          137 tests, including numerical DSP validation
└── apps/
    └── mobile/            Expo + React Native instrument
        ├── app/           expo-router screens
        └── src/
            ├── audio/     backend interface, queued-buffer backend, controller,
            │              lock-screen transport
            ├── design/    tokens and the instrument component library
            ├── state/     zustand stores
            ├── storage/   AsyncStorage repositories
            └── features/  WAV and DNA export
```

The DSP core has **no runtime dependencies and no platform assumptions**. The
same code runs in the app, in the offline renderer and in the test suite, so
the tests validate the shipping engine rather than a parallel implementation.

---

## Getting started

Requires Node 20 or newer.

```bash
npm install
npm test          # 137 tests, including the DSP validation suite
npm run typecheck # dsp-core and the app
npm run lint      # eslint, zero warnings tolerated
```

### Running the app

The app needs a **development build**, not Expo Go: real-time audio comes from
`react-native-audio-api`, which is a native module. Without it the app runs on a
null backend that advances the protocol clock and says on screen that nothing is
being played.

```bash
cd apps/mobile

npx expo prebuild            # generates ios/ and android/
npx expo run:ios             # requires Xcode, macOS
npx expo run:android         # requires Android Studio and a device or emulator
```

After the first native build, `npx expo start --dev-client` is enough for
JavaScript changes.

To check that everything bundles without a device:

```bash
cd apps/mobile
npx expo export --platform ios
npx expo export --platform android
```

### Web preview

The app also builds to the browser via react-native-web, which is how it can be
hosted on a static platform like Vercel. This is a **visual/UX preview only**:
the real-time audio backend needs a native module, so on web the app runs on the
silent fallback backend and says so in an on-screen banner. The DSP, protocol
clock and visualisers still run — you can watch a beat sweep and see the
oscilloscope — there is simply no sound. Use a native dev build to hear it.

```bash
cd apps/mobile
npm run build:web     # static export into apps/mobile/dist
npm run deploy:web    # export, then `vercel deploy --prod` the static output
```

### Working on the DSP

Metro resolves `@frequencylab/dsp-core` straight from TypeScript source, so
there is no build step between editing the engine and hearing it. Node
consumers use the compiled output:

```bash
npm run build --workspace @frequencylab/dsp-core
```

---

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module boundaries, data flow, and the extension points later phases plug into |
| [docs/DSP.md](docs/DSP.md) | Signal chains, the maths behind each engine, determinism and the real-time contract |
| [docs/PROTOCOL_SCHEMA.md](docs/PROTOCOL_SCHEMA.md) | The protocol format, canonicalisation rules, Protocol DNA and migration |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Material language, type, colour, motion, haptics and the component inventory |
| [docs/SAFETY.md](docs/SAFETY.md) | Gain staging, the limiter, route policy, interruption handling and claim boundaries |
| [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) | Dynamic Type, screen readers, reduced motion, non-colour status, numeric entry |
| [docs/TESTING.md](docs/TESTING.md) | What the DSP validation suite proves and how to add to it |
| [docs/BACKEND.md](docs/BACKEND.md) | The cloud architecture the local-first product is designed to grow into |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What is built, what is stubbed, and what each later phase requires |

---

## Status

Built and validated: the DSP core, the protocol engine, the design system, the
instrument UI, the session player, the protocol builder, history and ratings,
experiments, insights, the evidence library, the AI designer, WAV and DNA
export, safety and accessibility.

Not built: any server. Cloud sync, accounts, the community and the biometrics
integrations are designed for in [docs/BACKEND.md](docs/BACKEND.md) and
[docs/ROADMAP.md](docs/ROADMAP.md) with the seams left in place, but no
half-working version of them ships. Everything visible in the app today does
what it appears to do.
