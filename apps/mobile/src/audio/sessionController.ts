import {
  DEFAULT_BLOCK_SIZE,
  Fft,
  SLEEP_TIMER_FADE_SEC,
  SessionRenderer,
  hannWindow,
  routeChangeAction,
  totalDurationSec,
  type OutputRoute,
  type Plan,
  type Protocol,
  type SessionTelemetry,
} from '@frequencylab/dsp-core';
import { Platform } from 'react-native';
import { loadNativeAudio } from './native';
import { QueuedAudioBackend } from './queuedBackend';
import { WebAudioBackend } from './webAudioBackend';
import { NullAudioBackend } from './nullBackend';
import {
  AudioBackendUnavailableError,
  DEFAULT_BACKEND_OPTIONS,
  type AudioBackend,
  type AudioBackendOptions,
  type BackendStats,
  type RenderSource,
} from './types';
import { detectOutputRoute } from './route';
import { NowPlayingTransport, type NowPlayingInfo, type TransportCommand } from './nowPlaying';
import type { OrganicRuntimeAsset } from './organic/assets';
import {
  OrganicSession,
  type OrganicDiagnostics,
  type OrganicLayerRuntime,
} from './organic/session';

/**
 * `finishing` is the organic layer's (§76).
 *
 * The protocol has reached zero and the frequency session is already silent —
 * the master chain's own fade-out saw to that — but a bowl started before the
 * end may still have thirty seconds of tail to give. Nothing new is scheduled,
 * nothing is cut, and the session ends when the last sound has decayed or the
 * plan's tail allowance runs out, whichever is first. A session with no organic
 * layer never enters this state: it goes from `playing` straight to `completed`
 * exactly as it always did.
 */
export type PlaybackState =
  | 'idle'
  | 'preparing'
  | 'playing'
  | 'paused'
  | 'stopping'
  | 'finishing'
  | 'completed'
  | 'error';

/**
 * Why playback stopped.
 *
 * `user` is a press inside the app and `remote` the same press on the lock
 * screen. They are told apart because the app's own stop writes the session
 * record on its way out and a stop from the lock screen has nobody to write it
 * — the player store watches for the ones it did not start.
 */
export type StopReason =
  | 'user'
  | 'remote'
  | 'completed'
  | 'routeLost'
  | 'error'
  | 'replaced'
  | 'sleepTimer';

/**
 * Why playback is paused.
 *
 * Kept because the answer decides whether anything is allowed to start it
 * again on its own. Only a pause the system caused may be undone by the
 * system; a pause the listener asked for, or one caused by their headphones
 * coming out, is theirs to undo (§28, §57).
 */
export type PauseReason = 'user' | 'interruption' | 'routeLost';

/**
 * An armed sleep timer.
 *
 * `endsAt` is wall-clock rather than a countdown because a countdown is only as
 * good as the thing decrementing it: JS timers are throttled in a backgrounded
 * app and stop entirely while the device sleeps, and a re-render must not be
 * able to move the deadline. A timestamp is re-read against `Date.now()` from
 * whatever clock happens to be running — see `checkSleepTimer`.
 */
export interface SleepTimerState {
  /** Epoch milliseconds at which the stop fade begins. */
  endsAt: number;
  /** The preset the user chose, in minutes, for the label. */
  minutes: number;
}

/**
 * An organic layer to play alongside a protocol.
 *
 * The plan is computed once, up front, by `planSoundBath` — this carries it and
 * the runtime facts about the assets it names. Nothing in the app constructs one
 * today, because no build of this app can obtain the audio: see
 * `audio/organic/delivery.ts`, which says so plainly rather than pretending. A
 * session loaded without one behaves exactly as it did before this existed.
 */
export interface OrganicProgram {
  readonly plan: Plan;
  readonly assets: ReadonlyMap<string, OrganicRuntimeAsset>;
  /** Priorities and fades, keyed by layer id. Optional; see `OrganicSession`. */
  readonly layers?: ReadonlyMap<string, OrganicLayerRuntime>;
  readonly maxVoices?: number;
}

export interface ControllerSnapshot {
  state: PlaybackState;
  protocolId?: string;
  protocolName?: string;
  telemetry?: SessionTelemetry;
  backend: { name: string; audible: boolean; stats: BackendStats };
  route: OutputRoute;
  /** Set when playback stopped for a reason worth showing the user. */
  notice?: string;
  /** The armed sleep timer, if any. Undefined means the session runs its course. */
  sleepTimer?: SleepTimerState;
  error?: string;
  /** Wall-clock seconds of audio actually played, excluding pauses. */
  playedSec: number;
  pauseCount: number;
  peakGainReductionDb: number;
  /** The organic layer's state, when this session has one. */
  organic?: OrganicDiagnostics;
  /** Why it has none, when one was asked for and could not be built. */
  organicUnavailable?: string;
  /** Seconds of organic tail still owed while the state is `finishing` (§76). */
  finishingSec: number;
}

export interface ScopeCapture {
  left: Float32Array;
  right: Float32Array;
  spectrum: Float32Array;
  sampleRate: number;
}

type Listener = (snapshot: ControllerSnapshot) => void;

const SCOPE_FRAMES = 2048;
const FFT_SIZE = 2048;

/**
 * Fade applied to an ordinary stop, in seconds, and the floor for every other
 * stop: §28 allows a stop to be gentler than this, never sharper.
 */
const STOP_FADE_SEC = 0.45;

/**
 * Owns playback for the whole app.
 *
 * One controller, one renderer, one backend: Simple Mode, Explorer, Lab and the
 * session player are different interfaces onto this object rather than
 * different engines (§80). It implements `RenderSource`, so it is also the
 * place where the visualiser tap lives — the samples the scopes draw are the
 * samples that went to the output, not a re-synthesis of them.
 */
export class SessionController implements RenderSource {
  private renderer: SessionRenderer | null = null;
  private backend: AudioBackend | null = null;
  private protocol: Protocol | null = null;
  private listeners = new Set<Listener>();
  private subscriptions: { remove: () => void }[] = [];

  private state: PlaybackState = 'idle';
  private route: OutputRoute = { kind: 'unknown', reliable: false };
  private notice: string | undefined;
  private error: string | undefined;

  private playedFrames = 0;
  private pauseCount = 0;
  private peakGainReductionDb = 0;
  private stopReason: StopReason | null = null;
  private pendingStop: StopReason | null = null;
  private pauseReason: PauseReason | null = null;

  /**
   * The lock-screen / notification transport.
   *
   * Owned here rather than by a screen for the same reason the sleep timer is:
   * it belongs to the playback, and the playback outlives the component tree.
   * It is the only interface to a session once the phone is face down.
   */
  private readonly transport = new NowPlayingTransport();

  // Sleep timer. Held here rather than in the store because playback outlives
  // the component tree: navigating away from the session screen, or a re-render
  // storm, must not disturb an armed timer.
  private sleepTimerEndsAt: number | null = null;
  private sleepTimerMinutes = 0;
  /** Latched the moment the deadline passes, so expiry can only happen once. */
  private sleepTimerFiring = false;
  private sleepTimerBackstop: ReturnType<typeof setTimeout> | null = null;

  // Visualiser tap. Written from the render path; read from the UI thread.
  // A torn read shows one stale sample in a scope trace, which is invisible,
  // so this deliberately avoids the cost of double buffering.
  private readonly scopeL = new Float32Array(SCOPE_FRAMES);
  private readonly scopeR = new Float32Array(SCOPE_FRAMES);
  private scopeWrite = 0;
  private readonly fft = new Fft(FFT_SIZE);
  private readonly window = hannWindow(FFT_SIZE);
  private readonly spectrum = new Float32Array(FFT_SIZE / 2);
  private readonly analysisBuffer = new Float32Array(FFT_SIZE);
  private lastSpectrumAt = 0;

  private telemetryTimer: ReturnType<typeof setInterval> | null = null;
  private backendOptions: AudioBackendOptions = { ...DEFAULT_BACKEND_OPTIONS };

  /*
   * The organic layer.
   *
   * Held here, beside the renderer, because the two are one session: they start
   * together, fade together and are torn down together. The program is kept
   * separately from the running session so a backend restart — the fallback to
   * `NullAudioBackend`, a route change that forced a new context — rebuilds it
   * against whatever graph the new backend offers, or reports why it could not.
   */
  private organicProgram: OrganicProgram | null = null;
  private organic: OrganicSession | null = null;
  private organicUnavailable: string | undefined;
  /** Underrun count at the last telemetry tick, for the load governor (§52). */
  private lastUnderruns = 0;

  // Finishing, on the same pattern as the sleep timer: a wall-clock deadline
  // re-read from whichever clock is running, and latched so it can only fire
  // once. The render path is the clock that matters — during finishing the
  // backend is still pulling blocks, so it is the most reliable thing available.
  private finishingEndsAt = 0;
  private finishingFiring = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot(): ControllerSnapshot {
    return {
      state: this.state,
      protocolId: this.protocol?.id,
      protocolName: this.protocol?.name,
      telemetry: this.renderer?.telemetry(),
      backend: {
        name: this.backend?.name ?? 'None',
        audible: this.backend?.audible ?? false,
        stats: this.backend?.stats() ?? {
          buffersRendered: 0,
          underruns: 0,
          bufferedSec: 0,
          renderMsAverage: 0,
          load: 0,
          outputLatencySec: 0,
        },
      },
      route: this.route,
      notice: this.notice,
      sleepTimer:
        this.sleepTimerEndsAt === null
          ? undefined
          : { endsAt: this.sleepTimerEndsAt, minutes: this.sleepTimerMinutes },
      error: this.error,
      playedSec: this.playedFrames / (this.renderer?.sampleRate ?? 48000),
      pauseCount: this.pauseCount,
      peakGainReductionDb: this.peakGainReductionDb,
      organic: this.organic?.diagnostics(),
      organicUnavailable: this.organicUnavailable,
      finishingSec: this.organic?.finishingRemainingSec(this.positionSec) ?? 0,
    };
  }

  private emit(): void {
    const snapshot = this.snapshot();
    // Before the listeners, so the lock screen and the app never disagree about
    // what is playing. `update` is a no-op unless something actually changed.
    this.syncNowPlaying(snapshot);
    for (const listener of this.listeners) listener(snapshot);
  }

  get currentProtocol(): Protocol | null {
    return this.protocol;
  }

  get playbackState(): PlaybackState {
    return this.state;
  }

  get positionSec(): number {
    return this.renderer?.positionSec ?? 0;
  }

  get durationSec(): number {
    return this.protocol ? totalDurationSec(this.protocol) : 0;
  }

  configureBackend(options: Partial<AudioBackendOptions>): void {
    this.backendOptions = { ...this.backendOptions, ...options };
  }

  /**
   * Prepares a protocol without starting playback, so the session screen can
   * show the exact configuration and run preflight before any sound is made.
   */
  async load(
    protocol: Protocol,
    options: { masterGain?: number; organic?: OrganicProgram } = {},
  ): Promise<void> {
    await this.teardown('replaced');
    this.protocol = protocol;
    this.organicProgram = options.organic ?? null;
    this.organicUnavailable = undefined;
    this.renderer = new SessionRenderer(protocol, {
      sampleRate: protocol.sampleRate,
      blockSize: DEFAULT_BLOCK_SIZE,
    });
    if (options.masterGain !== undefined) this.renderer.setMasterGain(options.masterGain);
    this.playedFrames = 0;
    this.pauseCount = 0;
    this.peakGainReductionDb = 0;
    this.notice = undefined;
    this.error = undefined;
    this.stopReason = null;
    this.state = 'preparing';
    this.route = await detectOutputRoute();
    this.emit();
  }

  /**
   * Guards against a second `play()` while the first is still starting.
   *
   * Starting a backend is asynchronous, so two taps a few hundred milliseconds
   * apart both used to get past a `state === 'playing'` check, and the second
   * overwrote `this.backend` while the first was still running. The orphan kept
   * its audio context open with nothing holding a reference to it, so `stop()`
   * — which disposes only the current backend — could not silence it and the
   * user was left with audio they had no control over.
   */
  private starting: Promise<void> | null = null;

  async play(): Promise<void> {
    if (!this.renderer || !this.protocol) return;
    if (this.state === 'playing') return;
    // A start already in flight: join it rather than racing it.
    if (this.starting) return this.starting;

    if (this.state === 'paused' && this.backend) {
      this.renderer.cancelStopFade();
      await this.backend.resume();
      // After the resume, so the ramp is scheduled against a running clock.
      this.organic?.duck(1, 0.25);
      this.pauseReason = null;
      this.state = 'playing';
      this.startTelemetry();
      this.emit();
      return;
    }

    this.starting = this.startBackend();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async startBackend(): Promise<void> {
    this.state = 'preparing';
    this.pauseReason = null;
    this.emit();

    // Nothing may replace a live backend without disposing it first.
    await this.disposeBackend();

    const options = this.backendOptionsForProtocol();
    // Web has no native audio module, but it does have the Web Audio API, so the
    // browser preview plays through that rather than the silent fallback.
    this.backend =
      Platform.OS === 'web' ? new WebAudioBackend(options) : new QueuedAudioBackend(options);
    this.attachSystemListeners();

    try {
      await this.backend.start(this);
      this.state = 'playing';
      this.attachOrganic();
      this.showTransport();
      this.startTelemetry();
    } catch (error) {
      // The native audio module is missing or refused to start. Fall back to a
      // backend that advances the clock and reports itself inaudible, rather
      // than leaving the app in a state that looks broken for no stated reason.
      const reason =
        error instanceof AudioBackendUnavailableError
          ? error.reason
          : error instanceof Error
            ? error.message
            : 'Playback could not start.';
      // The backend that failed to start may still hold an audio context.
      await this.disposeBackend();
      this.backend = new NullAudioBackend(reason, options);
      try {
        await this.backend.start(this);
        this.state = 'playing';
        this.error = reason;
        // Called on this path too, so an organic layer that was asked for gets
        // a stated reason rather than silently not appearing (§65).
        this.attachOrganic();
        this.startTelemetry();
      } catch {
        this.state = 'error';
        this.error = reason;
      }
    }
    this.emit();
  }

  /**
   * Builds the organic layer against the backend that just started.
   *
   * Every refusal is recorded rather than swallowed, because "the sound bath is
   * not playing" needs a reason attached wherever it is true (§65). The layer is
   * refused outright on a backend that makes no sound: a silent fallback backend
   * scheduling voices nobody can hear would be work spent to produce a lie.
   *
   * Nothing here can fail the frequency session. A throw is caught, reported and
   * left behind (§56).
   */
  private attachOrganic(): void {
    this.organic = null;
    this.organicUnavailable = undefined;
    const program = this.organicProgram;
    if (!program) return;

    const backend = this.backend;
    if (!backend?.audible) {
      this.organicUnavailable = 'This backend produces no sound, so nothing was scheduled.';
      return;
    }
    const graph = backend.organicGraph?.() ?? null;
    if (!graph) {
      this.organicUnavailable = `${backend.name} has no organic bus.`;
      return;
    }

    try {
      const session = new OrganicSession({
        plan: program.plan,
        assets: program.assets,
        graph,
        // The steady-state distance between what the renderer has produced and
        // what the listener is hearing. It is what turns a protocol second into
        // an audio-context timestamp, so it comes from the backend rather than
        // from the configuration — the two agree, but only one of them is the
        // thing actually queueing audio.
        outputLatencySec: backend.stats().outputLatencySec,
        protocolDurationSec: this.durationSec,
        layers: program.layers,
        maxVoices: program.maxVoices,
      });
      session.start();
      this.organic = session;
      this.lastUnderruns = backend.stats().underruns;
    } catch (error) {
      this.organicUnavailable =
        error instanceof Error ? error.message : 'The organic layer could not be started.';
    }
  }

  private backendOptionsForProtocol(): AudioBackendOptions {
    return {
      ...this.backendOptions,
      sampleRate: this.protocol?.sampleRate ?? this.backendOptions.sampleRate,
    };
  }

  /**
   * Pauses over a short fade.
   *
   * `reason` is recorded rather than acted on: it is what `attachSystemListeners`
   * consults before letting the system resume a session on its own.
   */
  async pause(reason: PauseReason = 'user'): Promise<void> {
    if (this.state !== 'playing' || !this.backend) return;
    this.pauseReason = reason;
    this.pauseCount++;
    // A short fade before suspending: cutting a tone mid-cycle clicks. The
    // organic bus is ducked over the same quarter second — a bowl frozen
    // mid-ring by a context suspend clicks harder than a tone does.
    this.renderer?.beginStopFade(0.25);
    this.organic?.duck(0, 0.25);
    await delay(280);
    await this.backend.suspend();
    this.state = 'paused';
    this.stopTelemetry();
    this.emit();
  }

  /**
   * Stops playback over a fade.
   *
   * `fadeSec` only ever lengthens the fade: it is floored at the manual-stop
   * fade so no caller can make a stop sharper than the one the user hears when
   * they press the button (§28). The sleep timer is the caller that lengthens
   * it, because nobody is awake to expect that stop.
   */
  async stop(
    reason: StopReason = 'user',
    notice?: string,
    fadeSec: number = STOP_FADE_SEC,
  ): Promise<void> {
    // 'completed' is already torn down; stopping again would produce a second
    // session record for the same playback.
    if (this.state === 'idle' || this.state === 'stopping' || this.state === 'completed') return;
    this.state = 'stopping';
    this.notice = notice;
    this.pendingStop = reason;
    this.emit();

    const fade = Math.max(STOP_FADE_SEC, fadeSec);
    this.renderer?.beginStopFade(fade);
    // Both buses recede over the same fade, so a stop is one sound getting
    // quieter rather than two things ending at different moments. The organic
    // half is an `AudioParam` ramp on the audio thread, which means it completes
    // on time regardless of what the JS thread is doing — and it also cancels
    // the voices already scheduled into the future, so nothing surfaces after
    // the fade has finished (§28).
    this.organic?.beginStopFade(fade);
    // Rendered is not the same as heard: a backend plays out of a look-ahead
    // window, so tearing down when the *renderer* reaches silence would cut off
    // the quietest part of the fade before it left the speaker.
    const lookaheadMs = (this.backend?.stats().outputLatencySec ?? 0) * 1000;
    await delay(fade * 1000 + lookaheadMs + 60);
    await this.teardown(reason);
  }

  /**
   * Arms the sleep timer: the session fades out and stops `minutes` from now.
   *
   * Arming again replaces the deadline rather than stacking on it, and passing
   * anything that is not a positive number disarms — "end of session" is a
   * choice the picker can make like any other.
   */
  armSleepTimer(minutes: number): void {
    if (!(minutes > 0)) {
      this.cancelSleepTimer();
      return;
    }
    this.sleepTimerEndsAt = Date.now() + minutes * 60_000;
    this.sleepTimerMinutes = minutes;
    this.sleepTimerFiring = false;
    this.scheduleSleepTimerBackstop();
    this.emit();
  }

  /** Disarms the timer. The session goes back to running its full course. */
  cancelSleepTimer(): void {
    if (this.sleepTimerEndsAt === null) return;
    this.clearSleepTimer();
    this.emit();
  }

  private clearSleepTimer(): void {
    this.sleepTimerEndsAt = null;
    this.sleepTimerMinutes = 0;
    this.sleepTimerFiring = false;
    if (this.sleepTimerBackstop) clearTimeout(this.sleepTimerBackstop);
    this.sleepTimerBackstop = null;
  }

  /**
   * Fires the sleep timer if its deadline has passed. Returns true once, on the
   * call that fires it.
   *
   * Called from the render path and from the telemetry tick — whichever clock
   * is running. The render path is the one that matters on a backgrounded
   * phone: the audio callback keeps pulling blocks long after JS timers have
   * been throttled to a crawl, and reading a timestamp costs nothing per block.
   */
  private checkSleepTimer(): boolean {
    if (this.sleepTimerEndsAt === null || this.sleepTimerFiring) return false;
    // A session that is already ending has nothing left for a timer to do. This
    // is the narrow case where the protocol reaches its own end in the same
    // handful of milliseconds the deadline passes: completion is latched in the
    // render path and torn down a tick later, and without this the timer would
    // start a second, longer stop underneath it.
    if (this.pendingStop !== null) return false;
    if (Date.now() < this.sleepTimerEndsAt) return false;
    // Latched before anything asynchronous happens, so a deadline that has
    // passed can only ever start one stop.
    this.sleepTimerFiring = true;
    // Off the render path: `render` must not await, and stopping is a fade
    // followed by a teardown.
    setTimeout(() => {
      this.clearSleepTimer();
      void this.stop('sleepTimer', undefined, SLEEP_TIMER_FADE_SEC);
    }, 0);
    return true;
  }

  /**
   * A timer that decides only *when to look*, never what the answer is.
   *
   * It covers the one case the render path cannot: a paused session renders
   * nothing, so the deadline would otherwise go unnoticed until playback
   * resumed. Because it re-reads the deadline against the wall clock, a firing
   * that the platform delayed, coalesced or moved early costs nothing — it
   * either stops the session or schedules another look.
   */
  private scheduleSleepTimerBackstop(): void {
    if (this.sleepTimerBackstop) clearTimeout(this.sleepTimerBackstop);
    this.sleepTimerBackstop = null;
    if (this.sleepTimerEndsAt === null) return;
    const ms = Math.max(0, this.sleepTimerEndsAt - Date.now());
    this.sleepTimerBackstop = setTimeout(() => {
      this.sleepTimerBackstop = null;
      // Another look only if there is still something to look for. Once the
      // timer has fired, or a stop is already in flight, the deadline is in the
      // past and rescheduling would spin at zero delay until the teardown.
      if (this.checkSleepTimer() || this.sleepTimerFiring || this.pendingStop !== null) return;
      this.scheduleSleepTimerBackstop();
    }, ms);
  }

  /**
   * Publishes the lock-screen transport for the session that just started.
   *
   * Only for a backend that actually makes sound: a silent fallback backend
   * advancing the protocol clock must not appear on the lock screen as though
   * something were playing (§65).
   */
  private showTransport(): void {
    if (!this.protocol || !this.backend?.audible) return;
    this.transport.attach(this.nowPlayingDescription(this.snapshot()), (command) =>
      this.handleTransportCommand(command),
    );
  }

  private syncNowPlaying(snapshot: ControllerSnapshot): void {
    if (!this.protocol) return;
    this.transport.update(this.nowPlayingDescription(snapshot));
  }

  /** What the lock screen says: the protocol, where it is, and what is armed. */
  private nowPlayingDescription(snapshot: ControllerSnapshot): NowPlayingInfo {
    const stage = snapshot.telemetry?.stageName ?? '';
    const timer =
      this.sleepTimerEndsAt === null ? '' : `Sleep timer · ${this.sleepTimerMinutes} min`;
    return {
      title: this.protocol?.name ?? 'Session',
      detail: [stage, timer].filter(Boolean).join('  ·  ') || 'Frequency Lab',
      durationSec: snapshot.telemetry?.durationSec ?? this.durationSec,
      elapsedSec: snapshot.telemetry?.positionSec ?? 0,
      // Still 'playing' through a stop and through the finishing tails: sound
      // is still coming out in both, and a transport that flipped to paused
      // while it was would be lying.
      playing:
        this.state === 'playing' || this.state === 'stopping' || this.state === 'finishing',
    };
  }

  /**
   * A press on the lock screen.
   *
   * Every command is checked against the state it claims to act on, so a
   * remote-control event that arrives late — after the session has been torn
   * down, which is exactly when iOS is most likely to deliver one — cannot
   * start audio in someone's ears. Stopping goes through the ordinary `stop()`,
   * fade and all: there is no sharper path out of a session from here (§28).
   */
  private handleTransportCommand(command: TransportCommand): void {
    if (command === 'play') {
      if (this.state === 'paused') void this.play();
      return;
    }
    if (command === 'pause') {
      if (this.state === 'playing') void this.pause('user');
      return;
    }
    if (this.state === 'playing' || this.state === 'paused' || this.state === 'finishing') {
      void this.stop('remote');
    }
  }

  /** Disposes the current backend, tolerating a backend that never started. */
  private async disposeBackend(): Promise<void> {
    const backend = this.backend;
    if (!backend) return;
    this.backend = null;
    try {
      await backend.dispose();
    } catch {
      // A backend that failed to start may also fail to dispose. Dropping the
      // reference is what matters; re-throwing here would abort the teardown
      // and leave the session wedged.
    }
  }

  private async teardown(reason: StopReason): Promise<void> {
    this.stopTelemetry();
    // A timer belongs to the playback that armed it. A protocol that reached
    // its own end, or a stop by hand, disarms it here — so there is no armed
    // deadline left to fire into whatever plays next.
    this.clearSleepTimer();
    this.detachSystemListeners();
    // Taken down before the backend, so the lock screen never offers a
    // transport for a session that no longer exists.
    this.transport.release();
    // Before the backend, and before its context is closed: the organic graph
    // holds source nodes scheduled against that context, and disposing them
    // afterwards would be disposing them against nothing.
    this.organic?.dispose();
    this.organic = null;
    this.finishingFiring = false;
    this.finishingEndsAt = 0;
    await this.disposeBackend();
    this.stopReason = reason;
    this.pendingStop = null;
    this.pauseReason = null;
    this.state = reason === 'completed' ? 'completed' : reason === 'replaced' ? 'idle' : 'idle';
    this.emit();
  }

  seek(seconds: number): void {
    this.renderer?.seek(seconds);
    this.emit();
  }

  setMasterGain(value: number): void {
    this.renderer?.setMasterGain(value);
  }

  /** Live parameter edit against the running stage's graph. */
  setParam(nodeId: string, key: string, value: number): void {
    this.renderer?.activeGraph?.setParam(nodeId, key, value);
  }

  setOption(nodeId: string, key: string, value: string): void {
    this.renderer?.activeGraph?.setOption(nodeId, key, value);
  }

  get lastStopReason(): StopReason | null {
    return this.stopReason;
  }

  /** Why the stop currently in progress was requested, while it is fading. */
  get pendingStopReason(): StopReason | null {
    return this.pendingStop;
  }

  /** RenderSource: called from the backend, never from React. */
  render(left: Float32Array, right: Float32Array, frames: number): void {
    const renderer = this.renderer;
    if (!renderer) {
      left.fill(0, 0, frames);
      right.fill(0, 0, frames);
      return;
    }

    renderer.render(left, right, frames);
    if (this.state === 'playing') this.playedFrames += frames;
    if (this.sleepTimerEndsAt !== null) this.checkSleepTimer();
    // Two number writes and a comparison. The organic look-ahead's *deadline*
    // comes from here — the protocol clock, which advances by the frames the
    // backend actually pulled — and the work it triggers is done elsewhere,
    // because `render` may not allocate and may not await (§54, §55).
    this.organic?.noteRendered(renderer.positionSec);
    if (this.state === 'finishing') this.checkFinishing();

    // Visualiser tap.
    for (let i = 0; i < frames; i++) {
      this.scopeL[this.scopeWrite] = left[i];
      this.scopeR[this.scopeWrite] = right[i];
      this.scopeWrite = (this.scopeWrite + 1) % SCOPE_FRAMES;
    }

    if (renderer.finished && this.state === 'playing' && this.pendingStop === null) {
      this.pendingStop = 'completed';
      // Completion is handled off the render path: this method must not await.
      setTimeout(() => {
        void this.completeOrFinish();
      }, 0);
    }
  }

  /**
   * The protocol has reached zero (§76).
   *
   * Without an organic layer this is what it always was: tear down, emit
   * `completed`, and let the player store write the record. With one, the
   * session enters `finishing` instead and gives the tails the time the plan
   * says they need — a forty-second bowl started before the end is the case this
   * exists for, and cutting it is exactly what §45 and §76 both forbid.
   *
   * The core is faded out on the way in. In practice it is already silent: the
   * master chain's raised-cosine fade-out reaches zero at the protocol's end and
   * stays there. The fade is applied anyway because `fadeOutSec` is a protocol
   * setting and can be zero, and a protocol that set it to zero would otherwise
   * hold its last tone at full level for the whole finishing period.
   */
  private async completeOrFinish(): Promise<void> {
    const organic = this.organic;
    if (!organic) {
      await this.teardown('completed');
      return;
    }

    organic.beginFinish();
    const remaining = organic.finishingRemainingSec(this.positionSec);
    if (organic.isFinished(this.positionSec) || remaining <= 0) {
      await this.teardown('completed');
      return;
    }

    this.state = 'finishing';
    this.finishingFiring = false;
    this.renderer?.beginStopFade(STOP_FADE_SEC);
    // Wall clock, for the same reason the sleep timer's deadline is: it is
    // re-read from whichever clock happens to be running rather than counted
    // down by one that may be throttled. The backend's look-ahead is added
    // because the last of the tail still has to leave the speaker.
    const lookaheadSec = this.backend?.stats().outputLatencySec ?? 0;
    this.finishingEndsAt = Date.now() + (remaining + lookaheadSec) * 1000 + 60;
    this.emit();
  }

  /**
   * Ends the finishing period once the tails are done or the bound has passed.
   *
   * Called from the render path and from the telemetry tick — two independent
   * clocks, neither of which is a UI timer. Latched, so a deadline that has
   * passed can only ever produce one teardown, and re-checked inside the
   * dispatch because a stop by hand may have overtaken it in the meantime.
   */
  private checkFinishing(): boolean {
    if (this.state !== 'finishing' || this.finishingFiring) return false;
    const done = this.organic?.isFinished(this.positionSec) ?? true;
    if (!done && Date.now() < this.finishingEndsAt) return false;
    this.finishingFiring = true;
    setTimeout(() => {
      if (this.state !== 'finishing') return;
      void this.teardown('completed');
    }, 0);
    return true;
  }

  /**
   * A snapshot for the scopes.
   *
   * The FFT is recomputed at most every 60 ms regardless of how often the UI
   * asks, so a fast-refreshing visualiser cannot start competing with audio
   * rendering for the JS thread (§33).
   */
  capture(): ScopeCapture {
    const left = new Float32Array(SCOPE_FRAMES);
    const right = new Float32Array(SCOPE_FRAMES);
    for (let i = 0; i < SCOPE_FRAMES; i++) {
      const index = (this.scopeWrite + i) % SCOPE_FRAMES;
      left[i] = this.scopeL[index];
      right[i] = this.scopeR[index];
    }

    const now = Date.now();
    if (now - this.lastSpectrumAt > 60) {
      this.lastSpectrumAt = now;
      for (let i = 0; i < FFT_SIZE; i++) {
        this.analysisBuffer[i] = (left[i] + right[i]) * 0.5;
      }
      const magnitudes = this.fft.magnitudeSpectrum(this.analysisBuffer, this.window);
      for (let i = 0; i < this.spectrum.length; i++) {
        // Perceptual scaling, then a slow decay so the display has ballistics
        // instead of flickering bin to bin.
        const value = Math.min(1, Math.sqrt(magnitudes[i]) * 2.2);
        this.spectrum[i] = Math.max(value, this.spectrum[i] * 0.82);
      }
    }

    return {
      left,
      right,
      spectrum: this.spectrum,
      sampleRate: this.renderer?.sampleRate ?? 48000,
    };
  }

  private startTelemetry(): void {
    if (this.telemetryTimer) return;
    this.telemetryTimer = setInterval(() => {
      this.checkSleepTimer();
      this.checkFinishing();
      this.governOrganicLoad();
      const telemetry = this.renderer?.telemetry();
      if (telemetry) {
        this.peakGainReductionDb = Math.max(this.peakGainReductionDb, telemetry.gainReductionDb);
      }
      this.emit();
    }, 250);
  }

  private stopTelemetry(): void {
    if (this.telemetryTimer) clearInterval(this.telemetryTimer);
    this.telemetryTimer = null;
  }

  /**
   * Gives the core priority over the decoration, in a number (§52).
   *
   * Two signals, and the second is the stronger one. `load` is the fraction of a
   * buffer's duration the renderer spends producing it, which is the early
   * warning; an underrun is a gap that has already been heard, which is the
   * proof. Either one narrows the organic voice cap, and it widens again once
   * the device recovers.
   *
   * What this never does is touch the core. The renderer does not know the
   * organic layer exists, is never asked to do less, and is never given a
   * smaller block. Under load the thing that is given up is a bowl.
   */
  private governOrganicLoad(): void {
    const organic = this.organic;
    const stats = this.backend?.stats();
    if (!organic || !stats) return;
    const newUnderruns = stats.underruns - this.lastUnderruns;
    this.lastUnderruns = stats.underruns;
    // The web backend does not measure render time and reports a load of zero,
    // so on that path the underrun count is the only signal there is — which is
    // exactly why it is treated as decisive rather than as a tiebreak.
    organic.governFor(newUnderruns > 0 ? 1 : stats.load);
  }

  /**
   * Interruptions and route changes.
   *
   * The disconnect rule is the important one: losing headphones pauses rather
   * than continuing into a room speaker (§57), and the decision itself lives in
   * the shared core so it is covered by the test suite.
   */
  private attachSystemListeners(): void {
    this.detachSystemListeners();
    const AudioManager = loadNativeAudio()?.AudioManager;
    if (!AudioManager) return;
    try {
      const interruption = AudioManager.addSystemEventListener('interruption', (event) => {
        if (event.type === 'began') {
          void this.pause('interruption');
          return;
        }
        // Resuming is the system's suggestion, not its decision. It is honoured
        // only for the pause this interruption itself caused: a session the
        // listener paused, or one paused because their headphones came out,
        // stays silent until they ask for it back. Nothing may put sound into
        // someone's ears on its own (§28) — and resuming a route-loss pause
        // would put it into a room speaker.
        if (event.shouldResume && this.state === 'paused' && this.pauseReason === 'interruption') {
          void this.play();
        }
      });
      if (interruption) this.subscriptions.push(interruption);

      const routeChange = AudioManager.addSystemEventListener('routeChange', () => {
        void this.handleRouteChange();
      });
      if (routeChange) this.subscriptions.push(routeChange);
    } catch {
      // Route and interruption observation is a platform capability, not a
      // requirement; without it playback still works, it is just less careful.
    }
  }

  private detachSystemListeners(): void {
    for (const subscription of this.subscriptions) subscription.remove();
    this.subscriptions = [];
  }

  private async handleRouteChange(): Promise<void> {
    const previous = this.route;
    const next = await detectOutputRoute();
    this.route = next;

    const usesBinaural = protocolUsesBinaural(this.protocol);
    const decision = routeChangeAction(previous, next, usesBinaural);

    if (decision.action === 'pauseAndNotify') {
      this.notice = decision.message;
      // Latched even when the session is already paused for another reason, so
      // an interruption ending later cannot resume into the speaker the
      // headphones were just swapped for.
      this.pauseReason = 'routeLost';
      await this.pause('routeLost');
    } else if (decision.action === 'duckAndNotify') {
      this.notice = decision.message;
      this.renderer?.setMasterGain(0.25);
    }
    this.emit();
  }

  async dispose(): Promise<void> {
    await this.teardown('replaced');
    this.renderer = null;
    this.protocol = null;
    this.organicProgram = null;
    this.organicUnavailable = undefined;
    this.listeners.clear();
  }
}

export function protocolUsesBinaural(protocol: Protocol | null): boolean {
  if (!protocol) return false;
  return protocol.stages.some((stage) => stage.graph.nodes.some((node) => node.kind === 'binaural'));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The app's single controller instance. */
export const sessionController = new SessionController();
