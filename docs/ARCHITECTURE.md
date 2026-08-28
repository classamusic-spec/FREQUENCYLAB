# Architecture

## The shape of the thing

```
                        ┌──────────────────────────────┐
                        │   @frequencylab/dsp-core     │
                        │   zero dependencies          │
                        │                              │
   ┌────────────┐       │  math ── dsp ── graph        │
   │   tests    │──────▶│         │       │            │
   │  (vitest)  │       │      protocol ──┤            │
   └────────────┘       │         │       │            │
                        │      engine ────┘            │
   ┌────────────┐       │         │                    │
   │  offline   │──────▶│      analysis   library      │
   │  renderer  │       │      safety     ai           │
   └────────────┘       └───────────────┬──────────────┘
                                        │
                        ┌───────────────▼──────────────┐
                        │      apps/mobile             │
                        │                              │
                        │  audio/  ── SessionController│
                        │     │         (RenderSource) │
                        │     └──▶ AudioBackend        │
                        │                              │
                        │  state/  ── zustand stores   │
                        │  storage/── AsyncStorage     │
                        │  design/ ── instrument UI    │
                        │  app/    ── expo-router      │
                        └──────────────────────────────┘
```

The single most important boundary is the one around `dsp-core`. It contains no
React, no platform APIs, no `Math.random`, and no I/O. Everything it produces is
a pure function of its inputs. That is what makes three otherwise incompatible
requirements possible at once:

- the **app** can render audio in real time from it;
- the **test suite** can render the same audio offline and measure it numerically;
- a **protocol** can be proven to reproduce, because the same inputs cannot
  produce different output.

## Layers, and what each one may know

| Layer | Knows about | Must not know about |
|---|---|---|
| `math` | numbers | everything else |
| `dsp` | `math` | graphs, protocols, time |
| `graph` | `dsp`, `math` | protocols, sessions, the UI |
| `protocol` | `graph` | rendering, playback, the UI |
| `engine` | `protocol`, `graph` | the UI, storage, platform audio |
| `analysis` | `domain` models | the UI, rendering |
| `apps/mobile/audio` | `engine` | React |
| `apps/mobile/state` | everything in core, `audio` | rendering internals |
| `apps/mobile/design` | tokens, core *types* | stores, audio, navigation |
| `apps/mobile/app` | everything | — |

Dependencies point in one direction. A DSP node cannot reach a store; a store
cannot reach a render buffer.

## Data flow of a session

```
  user taps START
        │
        ▼
  recipe / protocol  ──────────────▶  validateProtocol()
        │                                    │ blocks on error
        ▼                                    ▼
  SessionController.load()            preflight() safety checks
        │
        ▼
  new SessionRenderer(protocol)   ── compiles stage 0 and 1 graphs
        │
        ▼
  AudioBackend.start(controller)
        │
        │  ◀── buffer-completion event from the audio thread
        ▼
  controller.render(L, R, frames)
        │
        ├─▶ renderer.render()  ── automation → graph → master chain
        ├─▶ scope ring buffer  ── for the visualisers
        └─▶ played-frame count ── for the session record
        │
        ▼
  buffer enqueued, played gaplessly
```

Nothing in that path touches React. The controller publishes snapshots on a
250 ms timer, and the UI subscribes; if the UI stops rendering entirely, audio
continues.

## The audio backend seam

`AudioBackend` exists because the way a platform accepts self-rendered PCM is
the only genuinely platform-specific part of playback. Two implementations ship:

- **`QueuedAudioBackend`** — the real one. Renders into `AudioBuffer`s and hands
  them to an `AudioBufferQueueSourceNode`, refilling on completion events with a
  watchdog timer as a backstop. Latency is `queueDepth × bufferFrames`, tunable
  in the diagnostics screen, ~256 ms at the defaults.
- **`NullAudioBackend`** — advances the protocol clock without producing sound,
  for environments where the native module is not linked. It reports
  `audible: false` and the UI shows a banner. It exists so the app can be
  exercised, never so it can appear to work.

A third implementation — running the renderer inside an audio worklet runtime
via `createWorkletSourceNode` — would cut latency to a single block. The seam is
sized for it; it is not built, because it could not be validated here.

## Playing behind a locked screen

A preset runs for fifteen to forty-five minutes and the listener is lying down
with their eyes shut, so for most of a session the app is not on screen. Three
pieces carry it across the lock:

- **iOS** declares the `audio` background mode, and `QueuedAudioBackend` sets
  the `playback` audio-session category before it opens a context — the
  category that means "media", rather than a UI sound the ringer switch can
  silence.
- **Android** runs a `mediaPlayback` foreground service. It is started by the
  media notification itself: `PlaybackNotificationManager.show()` is what
  subscribes the service, so publishing the transport and staying alive in the
  background are the same act.
- **`NowPlayingTransport`** (`audio/nowPlaying.ts`) mirrors the controller out
  to the lock screen — protocol name, stage, elapsed and total time — and turns
  play, pause and stop back into controller calls. It publishes exactly the
  three controls the engine can honour and switches the rest off, because iOS
  enables skip, seek and next/previous by default and a protocol has no next
  track. On web it drives the Media Session API instead, which browsers surface
  only sometimes; nothing on the native path depends on it.

The sleep timer is the part of this that can be measured. Its deadline is
wall-clock and it is re-read from `render()` — whenever the backend pulls the
next block — rather than from a JS timer, so a throttled app cannot make a
session overrun. Suppressing every long timer in the browser build and running
the clock fast still stops the session on time, over its full six-second fade.

## Why the DSP is in TypeScript

The brief suggests a native C++ core. That would be the right call for a
shipping build targeting the lowest-end devices, and the architecture does not
prevent it: `SessionRenderer` is reachable through one interface with four
methods, and a native implementation could satisfy it behind the same
`AudioBackend` boundary.

What TypeScript buys today is that the *same* engine runs in the test suite. The
oscillator accuracy, channel separation, limiter ceiling and reproducibility
tests all measure the shipping code path. A C++ core would need its own harness
and a second set of tests to prove the two agree.

Measured throughput on Node is ~28× real time for a three-module protocol
(binaural + AM + noise), which is roughly 3.5% of one core for live playback.
Hermes is slower, and the queue depth exists to absorb that.

## Extension points for later phases

| Phase | Seam that already exists |
|---|---|
| Biometrics | `Session.biometrics` and `BiometricSample` in the domain model; the analysis functions take sessions, not health APIs |
| Cloud sync | Repositories in `storage/` are the only code that touches persistence; each returns plain JSON |
| Server-side AI | `ProtocolDesigner` is an interface; `LocalProtocolDesigner` is one implementation and produces the same `DesignResult` a remote one would |
| Community | `CommunityPost`, `ProtocolFork`, `Comment`, `Favorite` and `Follow` are modelled; lineage already tracks parent, root and version |
| Native DSP | `AudioBackend` and `RenderSource` are the whole contract |

None of these ship as stubs that look functional. The models and interfaces are
there; the features are not pretended.
