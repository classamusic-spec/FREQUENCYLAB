import {
  DEFAULT_BLOCK_SIZE,
  Fft,
  SLEEP_TIMER_FADE_SEC,
  SessionRenderer,
  hannWindow,
  routeChangeAction,
  totalDurationSec,
  type OutputRoute,
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

export type PlaybackState =
  | 'idle'
  | 'preparing'
  | 'playing'
  | 'paused'
  | 'stopping'
  | 'completed'
  | 'error';

export type StopReason = 'user' | 'completed' | 'routeLost' | 'error' | 'replaced' | 'sleepTimer';

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
    };
  }

  private emit(): void {
    const snapshot = this.snapshot();
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
  async load(protocol: Protocol, options: { masterGain?: number } = {}): Promise<void> {
    await this.teardown('replaced');
    this.protocol = protocol;
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
        this.startTelemetry();
      } catch {
        this.state = 'error';
        this.error = reason;
      }
    }
    this.emit();
  }

  private backendOptionsForProtocol(): AudioBackendOptions {
    return {
      ...this.backendOptions,
      sampleRate: this.protocol?.sampleRate ?? this.backendOptions.sampleRate,
    };
  }

  async pause(): Promise<void> {
    if (this.state !== 'playing' || !this.backend) return;
    this.pauseCount++;
    // A short fade before suspending: cutting a tone mid-cycle clicks.
    this.renderer?.beginStopFade(0.25);
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
      if (!this.checkSleepTimer() && !this.sleepTimerFiring) this.scheduleSleepTimerBackstop();
    }, ms);
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
    await this.disposeBackend();
    this.stopReason = reason;
    this.pendingStop = null;
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
        void this.teardown('completed');
      }, 0);
    }
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
          void this.pause();
        } else if (event.shouldResume && this.state === 'paused') {
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
      await this.pause();
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
