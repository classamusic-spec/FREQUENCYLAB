import type { OrganicPlatformVoice } from './graph';

/**
 * Every organic sound that is currently in the air.
 *
 * §15 and §52. The plan already applied its own polyphony rules offline, so
 * this is not a second opinion about musical density — it is the runtime's
 * answer to two things the planner could not know:
 *
 *  - **What this device can afford.** The cap here is lowered while the core is
 *    struggling and raised again when it recovers. That is the concrete meaning
 *    of "core DSP gets priority": under load the thing that is given up is a
 *    decorative voice, never a block of the frequency session. The core's own
 *    render path is never consulted about this and never yields to it.
 *  - **What is actually sounding.** A plan lists intent; a voice may have been
 *    skipped because its asset failed to load, or held over because a bowl rang
 *    longer than the plan's estimate. The cap has to be applied to reality.
 *
 * When the cap binds, the loser is chosen by the layer's declared `priority` —
 * a bed outranks a sparkle — and losing means a fade, never a cut (§28).
 */

/** One sound the scheduler wants to start. */
export interface OrganicVoiceCandidate {
  readonly assetId: string;
  readonly layerId: string;
  readonly role: string;
  /** From the layer. Higher wins when polyphony is contended. */
  readonly priority: number;
  /** Session seconds at which it starts and stops being audible. */
  readonly startSec: number;
  readonly endSec: number;
  readonly gainDb: number;
  readonly pan: number;
  /** The pipeline's limit on how many copies of this asset may stack (§12). */
  readonly maxSameAsset: number;
}

export interface OrganicVoice extends OrganicVoiceCandidate {
  readonly id: number;
}

/**
 * Fade applied when a voice is dropped to make room.
 *
 * Deliberately the same figure as `STOP_FADE_SEC` in the session controller.
 * §28 says nothing may be sharper than the fade the user hears when they press
 * stop, and a bowl yanked out from under a listener to free a slot is exactly
 * the case that would be tempting to make quicker.
 */
export const VOICE_RELEASE_FADE_SEC = 0.45;

export interface OrganicVoiceStats {
  readonly active: number;
  readonly cap: number;
  readonly started: number;
  readonly droppedForPolyphony: number;
  readonly droppedForLoad: number;
}

interface Slot {
  voice: OrganicVoice;
  handle: OrganicPlatformVoice;
}

export class OrganicVoiceManager {
  private readonly slots = new Map<number, Slot>();
  private nextId = 1;
  private cap: number;
  private started = 0;
  private droppedForPolyphony = 0;
  private droppedForLoad = 0;
  /** True while the governor is holding the cap below what the plan expects. */
  private shedding = false;

  constructor(private readonly configuredCap: number) {
    this.cap = configuredCap;
  }

  /**
   * Lowers or restores the cap.
   *
   * Called by the session from the backend's load figures. `shedding` is kept
   * separate from the count so a voice refused while the core is struggling is
   * reported as a load drop rather than as ordinary polyphony contention —
   * they mean different things to whoever is reading the diagnostics.
   */
  setCap(cap: number): void {
    this.cap = Math.max(0, Math.min(this.configuredCap, Math.round(cap)));
    this.shedding = this.cap < this.configuredCap;
  }

  get currentCap(): number {
    return this.cap;
  }

  get activeCount(): number {
    return this.slots.size;
  }

  /**
   * Decides whether one candidate may start, and clears a slot if it must.
   *
   * Returns null to admit, or a sentence saying why not. It has one side
   * effect, which is the point of it: when the cap binds and the candidate
   * outranks something already sounding, that voice is faded out here and its
   * slot freed. Nothing else in the layer is allowed to stop a voice for
   * capacity reasons.
   */
  admit(candidate: OrganicVoiceCandidate, at: number): string | null {
    let sameAsset = 0;
    for (const slot of this.slots.values()) {
      if (slot.voice.assetId === candidate.assetId) sameAsset++;
    }
    if (sameAsset >= Math.max(1, candidate.maxSameAsset)) {
      this.droppedForPolyphony++;
      return 'already sounding as many times as the analysis recommends';
    }

    if (this.slots.size < this.cap) return null;

    let weakest: Slot | undefined;
    for (const slot of this.slots.values()) {
      if (!weakest || slot.voice.priority < weakest.voice.priority) weakest = slot;
    }
    if (!weakest || weakest.voice.priority >= candidate.priority) {
      if (this.shedding) this.droppedForLoad++;
      else this.droppedForPolyphony++;
      return this.shedding
        ? 'the voice cap was lowered to protect the frequency session'
        : 'the polyphony cap was already full of equal or higher priority sound';
    }

    weakest.handle.release(at, VOICE_RELEASE_FADE_SEC);
    this.slots.delete(weakest.voice.id);
    if (this.shedding) this.droppedForLoad++;
    else this.droppedForPolyphony++;
    return null;
  }

  add(candidate: OrganicVoiceCandidate, handle: OrganicPlatformVoice): OrganicVoice {
    const voice: OrganicVoice = { ...candidate, id: this.nextId++ };
    this.slots.set(voice.id, { voice, handle });
    this.started++;
    handle.onEnded(() => this.slots.delete(voice.id));
    return voice;
  }

  /**
   * Drops voices whose expected end has passed.
   *
   * A backstop for `onEnded`, not a replacement for it. The callback is the
   * accurate signal — it fires when the source actually finished — but a
   * dropped event would strand a slot forever, and a stranded slot is a voice
   * cap that shrinks silently over a forty-minute session until nothing new can
   * start. The grace is generous because being wrong in this direction only
   * costs a slot for a few seconds.
   */
  sweep(nowSec: number): void {
    for (const [id, slot] of this.slots) {
      if (nowSec > slot.voice.endSec + 2) this.slots.delete(id);
    }
  }

  /** What is sounding, for the diagnostics list. Ordered by start time. */
  active(): OrganicVoice[] {
    return [...this.slots.values()].map((slot) => slot.voice).sort((a, b) => a.startSec - b.startSec);
  }

  /**
   * Fades every voice out.
   *
   * `fadeSec` is passed through from the caller's stop fade so the organic
   * layer and the core recede together. Nothing here shortens it (§28).
   */
  releaseAll(at: number, fadeSec: number): void {
    for (const slot of this.slots.values()) {
      slot.handle.release(at, Math.max(VOICE_RELEASE_FADE_SEC, fadeSec));
    }
    this.slots.clear();
  }

  stats(): OrganicVoiceStats {
    return {
      active: this.slots.size,
      cap: this.cap,
      started: this.started,
      droppedForPolyphony: this.droppedForPolyphony,
      droppedForLoad: this.droppedForLoad,
    };
  }
}
