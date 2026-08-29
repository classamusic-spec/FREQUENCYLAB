import { releaseSecondsFor, type Plan, type SoundBathEvent } from '@frequencylab/dsp-core';
import { OrganicAssetCache, type OrganicCacheStats, type OrganicRuntimeAsset } from './assets';
import { organicAssetDelivery } from './delivery';
import { gainFromDb, type OrganicAudioGraph } from './graph';
import { OrganicVoiceManager, type OrganicVoice, type OrganicVoiceStats } from './voices';

/**
 * Playing a plan.
 *
 * `planSoundBath` decided everything — which sound, at which second, how loud,
 * how far left. This walks the sorted array it produced and turns it into
 * scheduled audio. It re-decides nothing: no selection, no randomness, no
 * clock-dependent behaviour. That is what keeps the same seed producing the same
 * session, and what leaves this path cheap enough to touch from the render loop.
 *
 * Three rules shape the whole file.
 *
 * **Timing comes from the audio clock (§54).** Nothing here is driven by a UI
 * timer. The render path calls `noteRendered` with the protocol position, which
 * anchors protocol seconds to the audio context's own clock; every event is then
 * handed to the platform as a context timestamp and started on the audio thread.
 * This codebase already learned the lesson with the sleep timer, whose deadline
 * is wall-clock and re-read from `render()` for exactly this reason: a JS timer
 * is throttled in a backgrounded app and stops entirely while a device sleeps. A
 * timer appears once below, and it only carries work *off* the render path — it
 * never decides when anything sounds.
 *
 * **The audio path allocates nothing (§55).** `noteRendered` writes two numbers.
 * Everything else — fetching, decoding, node construction, map churn — happens
 * in `pump`, which the render path dispatches but never runs.
 *
 * **A failure is a missing sound, never a stopped session (§56).** An asset that
 * will not load skips its event, records one diagnostic and is not retried. The
 * frequency session never learns that it happened.
 */

/**
 * How far ahead assets are asked for, and how far ahead sounds are scheduled.
 *
 * The gap between them is the loading budget: an event is fetched and decoded
 * ten seconds before it is handed to the audio thread, which is generous for a
 * 2 MB decode and still inside the 5–15 s window §54 asks for. Scheduling only
 * five seconds out keeps a stop responsive — everything already committed to
 * the audio thread has to be released by the stop fade, and there is no reason
 * to commit more than a fade's worth of future.
 */
const PREPARE_HORIZON_SEC = 15;
const SCHEDULE_HORIZON_SEC = 5;

/** How often the look-ahead runs, measured in protocol seconds, not real ones. */
const PUMP_INTERVAL_SEC = 1;

/**
 * How soon to look again when an event is still waiting on its decode.
 *
 * Measured, not guessed. Driving the scheduler in a browser against a plan
 * whose first event was under a second in showed the event being skipped as
 * "late": the first pump could only *ask* for the asset, and the next pump a
 * whole second later found the event's moment already gone. Nothing was wrong
 * with the loading — it had finished in milliseconds — the scheduler simply was
 * not looking. In the shipped product the planner opens with twenty seconds of
 * quiet before the first organic sound (§77), so the window never binds there;
 * that is a reason it went unnoticed, not a reason to leave it. A pump is two
 * map lookups, so looking four times a second while something is pending costs
 * nothing and removes the whole class of failure.
 */
const DEFERRED_RETRY_SEC = 0.25;

/**
 * The longest the session will wait for organic tails after the protocol ends.
 *
 * §76: when the protocol reaches zero nothing new starts, and what is already
 * ringing is allowed to finish. The planner will not start a sound that runs
 * more than its tail allowance past the end — eight seconds by default — so the
 * real figure comes from the plan itself. This is the ceiling on that figure, in
 * case a plan arrives with a generous allowance: a listener whose forty-minute
 * session says it is finishing should not be watching that word for a minute.
 */
const MAX_FINISHING_SEC = 20;

/**
 * Onset ramp for a voice. Short: a strike should begin like a strike.
 *
 * There is no matching release constant. A single one cannot serve a library
 * where a bowl has decayed 64 dB by its end and a kalimba loop has decayed 18 —
 * the release comes from `releaseSecondsFor` and the asset's own measurement.
 * A layer may still override it.
 */
const DEFAULT_VOICE_FADE_IN_SEC = 0.02;

/**
 * The layer facts an event does not carry.
 *
 * A `SoundBathEvent` says which layer produced it but not what that layer's
 * priority or fades are, because those belong to the preset rather than to the
 * event. Supplying them is optional: without them every layer ranks equally and
 * gets the default ramps, which is a duller mix but never a wrong one.
 */
export interface OrganicLayerRuntime {
  readonly priority: number;
  readonly fadeInSec: number;
  readonly fadeOutSec: number;
}

export type OrganicPhase = 'idle' | 'running' | 'finishing' | 'finished';

export interface OrganicSkip {
  readonly assetId: string;
  readonly reason: string;
  readonly count: number;
}

export interface OrganicDiagnostics {
  readonly phase: OrganicPhase;
  readonly output: string;
  /** How assets reach this build, and whether they reach it at all. */
  readonly delivery: {
    readonly id: string;
    readonly description: string;
    readonly configured: boolean;
  };
  readonly plannedEvents: number;
  readonly scheduledEvents: number;
  readonly skippedEvents: number;
  readonly voices: OrganicVoiceStats;
  readonly cache: OrganicCacheStats;
  readonly activeVoices: readonly OrganicVoice[];
  /** One line per distinct reason a sound did not happen (§56). */
  readonly skips: readonly OrganicSkip[];
}

export interface OrganicSessionOptions {
  readonly plan: Plan;
  readonly assets: ReadonlyMap<string, OrganicRuntimeAsset>;
  readonly graph: OrganicAudioGraph;
  /** Seconds the backend plays behind the render loop. Anchors the clock. */
  readonly outputLatencySec: number;
  /** Length of the protocol this plan accompanies, for the finishing bound. */
  readonly protocolDurationSec: number;
  readonly layers?: ReadonlyMap<string, OrganicLayerRuntime>;
  /** Runtime polyphony cap. Lower than the plan's on a weaker device (§15). */
  readonly maxVoices?: number;
  readonly cacheBudgetBytes?: number;
}

export class OrganicSession {
  private readonly plan: Plan;
  private readonly assets: ReadonlyMap<string, OrganicRuntimeAsset>;
  private readonly graph: OrganicAudioGraph;
  private readonly layers: ReadonlyMap<string, OrganicLayerRuntime>;
  private readonly cache: OrganicAssetCache;
  private readonly voices: OrganicVoiceManager;
  private readonly outputLatencySec: number;
  private readonly protocolDurationSec: number;
  private readonly configuredCap: number;

  private phase: OrganicPhase = 'idle';

  /*
   * The anchor: one point where a protocol second and an audio-context second
   * are known to be the same moment.
   *
   * `noteRendered` is called at the end of a render call, when `positionSec` is
   * the far edge of everything the backend has queued — which is the audio the
   * listener will hear one output latency from now. So protocol second P is
   * heard at `anchorContext + outputLatency + (P - anchorPosition)`, and that
   * expression is the only place protocol time becomes audio time. It is
   * re-anchored every block, so nothing accumulates drift, and it survives a
   * pause for free: suspending the context stops both clocks together.
   */
  private anchorPosition = 0;
  private anchorContext = 0;
  private anchored = false;

  /**
   * One byte per event: 1 once it has been settled, 0 while it is still
   * waiting. Allocated once, in the constructor, because the look-ahead is
   * reached from the render path's dispatch and may not allocate per pass.
   */
  private readonly settled: Uint8Array;

  /** Index of the first unsettled event. The array is sorted by `atSec`. */
  private cursor = 0;
  /** Index of the first event not yet prepared. Runs ahead of `cursor`. */
  private prepareCursor = 0;
  private nextPumpAtSec = 0;
  private pumpQueued = false;

  private scheduledEvents = 0;
  private skippedEvents = 0;
  private readonly skips = new Map<string, OrganicSkip>();

  /** Protocol second at which finishing gives up on the remaining tails. */
  private finishesAtSec = 0;

  constructor(options: OrganicSessionOptions) {
    this.plan = options.plan;
    this.assets = options.assets;
    this.graph = options.graph;
    this.layers = options.layers ?? new Map();
    this.outputLatencySec = options.outputLatencySec;
    this.protocolDurationSec = options.protocolDurationSec;
    this.configuredCap = options.maxVoices ?? 8;
    this.settled = new Uint8Array(options.plan.events.length);
    this.cache = new OrganicAssetCache(options.graph, options.assets, options.cacheBudgetBytes);
    this.voices = new OrganicVoiceManager(this.configuredCap);
  }

  get currentPhase(): OrganicPhase {
    return this.phase;
  }

  get plannedEventCount(): number {
    return this.plan.events.length;
  }

  start(): void {
    if (this.phase !== 'idle') return;
    this.phase = 'running';
    this.graph.rampBus(1, this.graph.now(), 0);
  }

  /**
   * Called from the render path, once per block. Writes two numbers.
   *
   * The comparison against `nextPumpAtSec` is the whole scheduling decision, and
   * it is made against the protocol clock — which *is* the audio clock, since it
   * advances by the frames the backend actually pulled. When work is due it is
   * handed to a zero-delay timer: not because the timer knows anything, but
   * because `render` must not allocate and must not await (§55). The same shape
   * as `checkSleepTimer` in the controller, and for the same reason.
   */
  noteRendered(positionSec: number): void {
    this.anchorPosition = positionSec;
    this.anchorContext = this.graph.now();
    this.anchored = true;
    if (this.phase === 'idle' || this.phase === 'finished') return;
    if (positionSec < this.nextPumpAtSec) return;
    // Provisional: it stops this block and the next few from dispatching again
    // while the pump is still queued. `pump` replaces it with the real cadence.
    this.nextPumpAtSec = positionSec + PUMP_INTERVAL_SEC;
    this.dispatchPump();
  }

  private dispatchPump(): void {
    if (this.pumpQueued) return;
    this.pumpQueued = true;
    setTimeout(() => {
      this.pumpQueued = false;
      this.pump();
    }, 0);
  }

  /**
   * Lowers the voice cap while the core is under strain, and restores it after.
   *
   * This is where §52 stops being a principle and becomes a number. The core's
   * render load is the only input; the only output is how many decorative sounds
   * may be in the air. Nothing here can slow, thin or interrupt the frequency
   * session, because the frequency session is not reachable from here — it is
   * measured, never touched.
   */
  governFor(load: number): void {
    const cap =
      load > 0.8
        ? Math.max(1, Math.round(this.configuredCap * 0.25))
        : load > 0.6
          ? Math.max(2, Math.round(this.configuredCap * 0.5))
          : this.configuredCap;
    this.voices.setCap(cap);
  }

  /**
   * Look-ahead. Runs off the audio path, roughly once a protocol second.
   *
   * Two passes over the same sorted array at different distances: everything
   * inside the prepare horizon is asked for, and everything inside the schedule
   * horizon that is actually in memory is committed to the audio thread.
   */
  private pump(): void {
    if (!this.anchored) return;
    if (this.phase === 'idle' || this.phase === 'finished') return;

    const now = this.anchorPosition;
    this.voices.sweep(now);

    if (this.phase === 'finishing') {
      if (this.voices.activeCount === 0 || now >= this.finishesAtSec) this.phase = 'finished';
      return;
    }

    const events = this.plan.events;

    // Prepare: ask the cache for anything due inside the wider horizon. Cheap
    // and idempotent — a resident, loading or already-failed asset costs one
    // map lookup and no work.
    while (this.prepareCursor < events.length) {
      const event = events[this.prepareCursor];
      if (event.atSec > now + PREPARE_HORIZON_SEC) break;
      this.cache.request(event.assetId);
      this.prepareCursor++;
    }

    /*
     * Schedule: commit anything due inside the narrow horizon.
     *
     * An event that is still waiting on its decode is left alone rather than
     * consumed. A plain cursor discarded it instead — the first look at an
     * event is also the moment its asset is first asked for, so anything not
     * already resident was skipped as "not loaded in time" while five seconds
     * of loading time were still in front of it. That would have thrown away
     * every event whose asset was not already hot, which on a cold cache is all
     * of them. `settled` is what lets the cursor stay put for one event without
     * blocking the ones behind it.
     */
    let deferred = 0;
    for (let i = this.cursor; i < events.length; i++) {
      const event = events[i];
      if (event.atSec > now + SCHEDULE_HORIZON_SEC) break;
      if (this.settled[i] === 1) continue;
      if (this.consider(event, now)) this.settled[i] = 1;
      else deferred++;
    }
    while (this.cursor < events.length && this.settled[this.cursor] === 1) this.cursor++;

    // Set here rather than in `noteRendered`, so the cadence can respond to
    // what the look-ahead actually found.
    this.nextPumpAtSec = now + (deferred > 0 ? DEFERRED_RETRY_SEC : PUMP_INTERVAL_SEC);
  }

  /**
   * Decides one event. Returns true once it is settled — started, refused or
   * skipped — and false while it is still legitimately waiting.
   */
  private consider(event: SoundBathEvent, nowSec: number): boolean {
    const asset = this.assets.get(event.assetId);
    if (!asset) {
      // The plan named an asset this build has no record of, which means a plan
      // made against one library version is being played against another (§86).
      this.skip(event.assetId, 'the asset is not in this build’s registry');
      return true;
    }

    // Late. The look-ahead should never produce this, so when it does the cause
    // is a stalled render loop rather than a scheduling bug — and a bowl started
    // late would ring past the end the planner guaranteed it would not (§79).
    if (event.atSec < nowSec) {
      this.skip(event.assetId, 'the render loop fell behind its own look-ahead');
      return true;
    }

    const buffer = this.cache.resident(event.assetId);
    if (!buffer) {
      const failure = this.cache.failure(event.assetId);
      // Only a *known* failure settles it. Still loading means come back next
      // pump — there is a whole schedule horizon left to finish in.
      if (!failure) return false;
      this.skip(event.assetId, failure);
      return true;
    }

    const layer = this.layers.get(event.layerId);
    const when = this.contextTimeFor(event.atSec);
    const candidate = {
      assetId: event.assetId,
      layerId: event.layerId,
      role: event.role,
      priority: layer?.priority ?? 1,
      startSec: event.atSec,
      endSec: event.atSec + event.durationSec,
      gainDb: event.gainDb,
      pan: event.pan,
      maxSameAsset: asset.maxVoices,
    };

    const refusal = this.voices.admit(candidate, when);
    if (refusal) {
      this.skip(event.assetId, refusal);
      return true;
    }

    // Where in the file the sound actually is. The pipeline measured both ends,
    // with a hold, because a bowl's partials beat against each other and dip
    // below any fixed threshold on the way down — the first dip is not the end
    // of the sound (§13). Starting at frame zero would open on the lead-in
    // silence and cut the same length off the tail.
    // The plan's own entry offset is added on top, and is zero for everything
    // struck. A bed layer entering a wave recording at a different point each
    // time is what lets two recordings carry twenty-five minutes; clamped so a
    // plan can never ask to begin past the end of the sound.
    const soundingSec = Math.max(0, asset.endSeconds - Math.max(0, asset.startSeconds));
    const entrySec = Math.min(Math.max(0, event.offsetSec), Math.max(0, soundingSec - 0.5));
    const offsetSec = Math.max(0, asset.startSeconds) + entrySec;
    const playSec = Math.max(0.05, Math.min(event.durationSec, asset.endSeconds - offsetSec));

    const voice = this.graph.start(buffer, {
      when,
      gain: gainFromDb(event.gainDb),
      pan: event.pan,
      detuneCents: event.detuneCents,
      offsetSec,
      playSec,
      fadeInSec: layer?.fadeInSec ?? DEFAULT_VOICE_FADE_IN_SEC,
      fadeOutSec: layer?.fadeOutSec ?? releaseSecondsFor(asset.releaseTailDb),
    });

    this.cache.pin(event.assetId);
    voice.onEnded(() => this.cache.unpin(event.assetId));
    this.voices.add(candidate, voice);
    this.scheduledEvents++;
    return true;
  }

  /** Protocol seconds to audio-context seconds. See the anchor, above. */
  private contextTimeFor(atSec: number): number {
    return this.anchorContext + this.outputLatencySec + (atSec - this.anchorPosition);
  }

  private skip(assetId: string, reason: string): void {
    this.skippedEvents++;
    const key = `${assetId} ${reason}`;
    const existing = this.skips.get(key);
    this.skips.set(key, { assetId, reason, count: (existing?.count ?? 0) + 1 });
  }

  /**
   * The protocol has reached zero (§76).
   *
   * Nothing new is scheduled from here. What is already ringing keeps ringing,
   * for as long as the plan says its last tail needs and no longer than
   * `MAX_FINISHING_SEC`. A forty-second bowl started before the end is not cut —
   * that is the case this whole phase exists for — but a session cannot be held
   * open indefinitely by one either.
   */
  beginFinish(): void {
    if (this.phase !== 'running') return;
    this.phase = 'finishing';
    const planned = Math.max(0, this.plan.lastTailEndsAtSec - this.protocolDurationSec);
    let latestVoiceEnd = 0;
    for (const voice of this.voices.active()) {
      latestVoiceEnd = Math.max(latestVoiceEnd, voice.endSec - this.protocolDurationSec);
    }
    const tail = Math.min(MAX_FINISHING_SEC, Math.max(planned, latestVoiceEnd));
    this.finishesAtSec = this.protocolDurationSec + tail;
    // Settled now rather than at the next pump, so a caller can ask how long the
    // finishing state will last the moment it enters it.
    if (this.voices.activeCount === 0) this.phase = 'finished';
  }

  /** Seconds of tail still owed, for the UI's FINISHING state. */
  finishingRemainingSec(positionSec: number): number {
    if (this.phase !== 'finishing') return 0;
    return Math.max(0, this.finishesAtSec - positionSec);
  }

  /** True once every tail has decayed or the bound has passed. */
  isFinished(positionSec: number): boolean {
    if (this.phase === 'finished') return true;
    if (this.phase !== 'finishing') return false;
    if (this.voices.activeCount === 0) return true;
    return positionSec >= this.finishesAtSec;
  }

  /**
   * Ducks the bus and brings it back, without ending the layer.
   *
   * For pause and resume. The core is faded over a quarter of a second before
   * the context is suspended, because cutting a tone mid-cycle clicks; the same
   * is true of a bowl, and rather more so. Suspending the context freezes every
   * scheduled voice where it stands and resuming it starts the clock again from
   * there, so the voices themselves need nothing — only the level does.
   */
  duck(target: number, seconds: number): void {
    if (this.phase === 'idle' || this.phase === 'finished') return;
    this.graph.rampBus(target, this.graph.now(), seconds);
  }

  /**
   * Fades the whole layer out over the caller's stop fade.
   *
   * Two things happen and both matter. The bus is ramped, which is one
   * `AudioParam` on the audio thread and therefore immune to whatever the JS
   * thread is doing — that is the guarantee. Every voice is then released, which
   * also cancels the sounds already committed to the future but not yet started,
   * so nothing surfaces after the fade has finished. Nothing here is allowed to
   * be quicker than the fade it was given (§28).
   */
  beginStopFade(fadeSec: number): void {
    if (this.phase === 'idle' || this.phase === 'finished') return;
    const at = this.graph.now();
    this.graph.rampBus(0, at, fadeSec);
    this.voices.releaseAll(at, fadeSec);
    this.phase = 'finished';
  }

  diagnostics(): OrganicDiagnostics {
    const delivery = organicAssetDelivery();
    return {
      phase: this.phase,
      output: this.graph.name,
      delivery: {
        id: delivery.id,
        description: delivery.description,
        configured: delivery.configured,
      },
      plannedEvents: this.plan.events.length,
      scheduledEvents: this.scheduledEvents,
      skippedEvents: this.skippedEvents,
      voices: this.voices.stats(),
      cache: this.cache.stats(),
      activeVoices: this.voices.active(),
      skips: [...this.skips.values()].sort((a, b) => b.count - a.count),
    };
  }

  dispose(): void {
    this.phase = 'finished';
    this.cache.dispose();
    this.graph.dispose();
  }
}
