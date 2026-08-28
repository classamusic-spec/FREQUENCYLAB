# Safety

Safety here is not a screen. It is a set of rules the engine and the UI both
consult, each with a matching behaviour in the session controller, and most of
them are covered by the test suite.

## Output level

- **Conservative defaults.** Tone amplitude is 0.26 / 0.36 / 0.46 for gentle,
  balanced and strong. Master gain defaults to 0.5.
- **The app never raises system volume.** There is no code path that could. The
  intensity control lowers the app's own output and says so on screen.
- **Calibration** asks the user for a comfortable level and every session starts
  there. `recommendedMasterGain` returns the *minimum* of the protocol's gain
  and the calibrated level — it lowers, it does not raise.
- **No claimed SPL.** The app does not infer absolute sound pressure from a
  consumer volume slider, because that number carries no information about what
  reaches the ear. The calibration screen states this rather than implying a
  measurement it cannot make.

## The limiter

Always on. `validateProtocol` returns an **error** — not a warning — if
`master.limiter` is false, so a protocol with it disabled cannot play. The flag
exists so the test suite can measure the unlimited signal.

Design: 5 ms lookahead, soft knee, linked stereo detection, release 120 ms,
ceiling −1 dBFS, plus a hard-clip safety net after the gain stage. The envelope
follower cannot be faster than its attack, so the safety net guarantees the
invariant the tests assert even for a pathological input.

Verified by test:

- a signal four times too loud never exceeds the ceiling on any sample;
- a silence-to-full-scale transient never gets through before reduction is in
  place;
- a 2:1 level ratio between channels survives limiting intact;
- a quiet signal passes through unmodified, sample for sample, after the
  lookahead delay;
- a full five-minute session at 1.5× master gain stays at or below the ceiling
  on **every** sample.

## Fades and stops

Session fades are raised cosines with zero slope at both ends. Every stop path
fades:

| Event | Behaviour |
|---|---|
| User presses Stop | 450 ms fade, then teardown |
| User presses Stop on the lock screen | The same 450 ms fade — the transport calls the same `stop()` |
| User presses Pause | 250 ms fade, then suspend |
| Sleep timer expires | 6 s fade, then teardown |
| Headphones disconnect | Pause, with a notice |
| Interruption begins | Pause |
| Interruption ends | Resume only if the system asks *and* this interruption is what paused it |
| Session completes | The protocol's own fade-out, then teardown |

`stop()` floors its fade at the manual-stop length, so no caller can make a stop
sharper than the one the user hears from the button. The sleep timer is the one
caller that lengthens it, because it is the one stop nobody is awake to expect.

A stop is never a discontinuity. The test suite asserts that a stop fade
reaches exact silence and that no sample step during it exceeds the waveform's
own maximum slope.

## Route policy

`routeChangeAction` lives in the shared core, so it is covered by tests rather
than being UI logic:

- **Losing a private route** (headphones or Bluetooth → speaker) **pauses**, and
  the pause remembers why. An unexpected disconnect must never dump an
  immersive tone into a room at the volume the user chose for headphones — and
  nothing may undo that pause on its own afterwards, including an interruption
  that ends while the phone is still on the speaker.
- **Gaining a route** continues.
- **Moving to a speaker while binaural is active** ducks and notifies, because
  the effect is no longer present.

Route detection reports `reliable: false` when the platform will not say. The UI
then shows "check your output" rather than a confident wrong answer.

## Preflight

**Every path into playback goes through one gate.** Home, Simple Mode, Explorer
auditions, Lab auditions, a protocol's Play button, an experiment's next
session and the AI designer's "run it" all call `useSessionStart.request()`, so
the output-route check cannot be forgotten on a new screen.

A clean protocol on a known-good route starts immediately — the sheet appears
only when there is something to decide. Acknowledgements are remembered per
output route and cleared when the route changes, so repeated auditioning does
not re-ask but plugging into a speaker does.

When binaural playback is heading for a speaker, the sheet offers **Use
monaural**, which rebuilds the protocol with the monaural engine — carrier, beat
and amplitude preserved, `separation` and the calculation mode dropped because
they have no monaural equivalent. A blocker leaves no "start anyway" button.

`preflight()` returns checks in priority order:

- **blocker** — a validation error; the session cannot start;
- **warning** — needs an explicit acknowledgement (headphones missing for
  binaural, gain above the calibrated level, a hard-gated configuration);
- **info** — shown but not interrupting (Bluetooth codec note, long session,
  first-run notices).

## Claims

Three notices are constants in the core, so their wording cannot drift between
screens:

- `VOLUME_GUIDANCE` — set it so a normal speaking voice is still audible.
- `AMBIENT_AWARENESS_NOTICE` — not while driving, cycling in traffic, operating
  machinery, or anywhere environmental awareness is required.
- `NOT_MEDICAL_NOTICE` — does not diagnose, treat, cure or prevent anything, and
  is not a substitute for medical care.

### What the product will not say

- No preset is named after a condition. A test asserts this over every shipped
  preset.
- Insights use *associated with*, *your history suggests*, *may perform better
  for you*. A test asserts that no generated insight body contains *causes*,
  *treats*, *heals*, *cures*, *fixes* or *prevents*.
- The AI designer detects medical framings — cure, treat, cancer, infection,
  psychiatric and neurological conditions, replacing medication — declines the
  medical framing by name, and still builds an ordinary comfort-focused session
  with no claim attached. Refusing entirely would just send the user somewhere
  less careful.
- The library lists unsupported claims and labels them. The Rife entry states
  plainly that the app produces an acoustic tone through headphones and nothing
  else, and that no acoustic frequency kills, removes, treats or prevents any
  pathogen or disease.
- Experiment results below five sessions per arm report no p-value and no
  interval, and say the comparison is a first impression. Above that, every
  result carries its sample size, its spread, and a list of the specific things
  that could explain it other than the protocols — time of day, adherence,
  variability, whether the trial was blinded.
