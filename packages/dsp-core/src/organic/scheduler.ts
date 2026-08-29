import { Rng } from '../math/rng.js';
import { clamp } from '../math/util.js';
import {
  mixerGroupForInstrument,
  sampleRange,
  type AssetPool,
  type SchedulableAsset,
  type SoundBathEvent,
  type SoundBathGlobals,
  type SoundBathLayer,
  type SoundBathPreset,
} from './soundbath.js';

/**
 * The generative sound bath scheduler.
 *
 * Given a preset, a library and a seed, this produces the complete list of
 * acoustic events for a session — as a pure function, entirely offline, with no
 * audio and no clock involved. That is the design decision everything else
 * rests on, and it buys three things at once:
 *
 *  - **Reproducibility.** Same preset, same library version, same seed, same
 *    events, forever. That is what lets a seed live in Protocol DNA and mean
 *    something (§18, §48).
 *  - **Testability.** Every rule here — no-repeat, polyphony, the outro, the
 *    fatigue limit — is checkable by planning a session and reading the list.
 *    None of it needs a speaker.
 *  - **A real-time-safe audio thread.** The expensive decisions are already
 *    made by the time anything plays. The player walks a sorted array (§55).
 *
 * The scheduler decides *when*; the pipeline decided *what*. It never inspects
 * audio, never parses a filename, and never sees a file path (§42, §44).
 */

/** How far ahead of the session end a layer stops being allowed to start. */
const DEFAULT_TAIL_ALLOWANCE_SEC = 8;

/**
 * How sharply brightness and energy narrow the field.
 *
 * Wide enough that an unusual choice still happens — a dark preset reaching a
 * brighter bowl now and then is what stops a forty-minute session settling into
 * one colour — and narrow enough that moving the control visibly moves the
 * selection. A quarter of the 0..1 range puts a sample half a range away at
 * about a fiftieth of the weight of a perfect match.
 */
const SELECTION_SIGMA = 0.25;

function gaussian(delta: number, sigma: number): number {
  const x = delta / sigma;
  return Math.exp(-0.5 * x * x);
}

export interface PlanOptions {
  preset: SoundBathPreset;
  library: SchedulableAsset[];
  durationSec: number;
  seed: number | string;
  /** Global cap across all layers. Lowered on weaker devices (§15, §52). */
  maxVoices?: number;
  /**
   * Seconds of quiet at the start before the first organic event.
   * The core frequency arrives alone; the room fills in afterwards (§77).
   */
  arrivalSec?: number;
  /**
   * How far past the session end a sound is allowed to ring. Events that would
   * run longer than this are not started (§78, §79).
   */
  tailAllowanceSec?: number;
  /** Approved-only is the shipping default; tests and preview may relax it. */
  requireApproved?: boolean;
}

export interface Plan {
  events: SoundBathEvent[];
  /** Where each layer found nothing to play, so a preset can be told it is broken. */
  emptyLayers: string[];
  /** The last moment any scheduled sound is still ringing. */
  lastTailEndsAtSec: number;
  seed: number | string;
}

interface LayerState {
  layer: SoundBathLayer;
  pool: SchedulableAsset[];
  nextAttemptAtSec: number;
  /** Ids played recently, newest first, for the no-repeat window (§16). */
  recent: string[];
  /** End times of this layer's still-ringing sounds. */
  active: number[];
}

/**
 * Plans a whole session.
 *
 * Deterministic in the strict sense: the RNG is consumed in a fixed order that
 * does not depend on wall-clock time, iteration order of any map, or floating
 * point accumulated differently on different machines. Layers are processed in
 * declared order at every step and every decision draws from the same stream.
 */
export function planSoundBath(options: PlanOptions): Plan {
  const {
    preset,
    library,
    durationSec,
    seed,
    maxVoices = 8,
    arrivalSec = 20,
    tailAllowanceSec = DEFAULT_TAIL_ALLOWANCE_SEC,
    requireApproved = true,
  } = options;

  const rng = new Rng(seed);
  const density = clamp(preset.globals.density, 0, 1);

  const states: LayerState[] = [];
  const emptyLayers: string[] = [];
  for (const layer of preset.layers) {
    const pool = resolvePool(layer.pool, library, requireApproved);
    if (pool.length === 0) {
      emptyLayers.push(layer.id);
      continue;
    }
    states.push({
      layer,
      pool,
      // Layers do not all wake at once. Staggering the first attempt is what
      // stops a session opening with every layer firing together (§77).
      nextAttemptAtSec: arrivalSec + sampleRange(layer.intervalSec, rng) * rng.nextFloat(),
      recent: [],
      active: [],
    });
  }

  const events: SoundBathEvent[] = [];
  /** End times of every active voice, for the global polyphony cap. */
  let globalActive: number[] = [];
  /** Start times of recent bright events, for the fatigue limit (§81). */
  const brightHistory: number[] = [];

  // A fixed step keeps the RNG draw order independent of the events themselves,
  // which is what makes the plan reproducible rather than merely repeatable.
  const STEP_SEC = 0.5;
  for (let now = 0; now <= durationSec; now += STEP_SEC) {
    globalActive = globalActive.filter((end) => end > now);

    for (const state of states) {
      state.active = state.active.filter((end) => end > now);
      if (now < state.nextAttemptAtSec) continue;

      // Schedule the next attempt first, so a refusal below still advances the
      // layer's clock and cannot produce a tight retry loop.
      const interval = sampleRange(state.layer.intervalSec, rng);
      state.nextAttemptAtSec = now + densityInterval(interval, density);

      const probability = densityProbability(state.layer.probability, density);
      if (rng.nextFloat() > probability) continue;
      if (state.active.length >= state.layer.maxVoices) continue;
      if (globalActive.length >= densityVoices(maxVoices, density)) continue;

      const asset = chooseAsset(state, preset, rng, brightHistory, now);
      if (!asset) continue;

      // A sound must be able to finish. Starting a 47-second bowl twenty
      // seconds from the end would either be cut off — which §45 and §76 both
      // forbid — or drag the session minutes past its stated length (§79).
      const tail = asset.durationSeconds;
      if (now + tail > durationSec + tailAllowanceSec) continue;

      const gainDb = sampleRange(state.layer.gainDb, rng) + (asset.recommendedGainDb ?? 0);
      const pan = sampleRange(state.layer.panRange, rng);
      const detuneCents = retuneFor(asset, preset);
      const offsetSec = entryOffset(state.layer, asset, rng);

      events.push({
        atSec: round(now),
        assetId: asset.assetId,
        layerId: state.layer.id,
        role: state.layer.role,
        // From the asset's own instrument, so the mixer's faders follow what
        // actually sounds rather than what a pool query happened to ask for.
        group: mixerGroupForInstrument(asset.instrument),
        gainDb: round(gainDb),
        pan: round(pan),
        reverbSend: state.layer.reverbSend ?? 0,
        // The sound is shorter by whatever was skipped, or the voice would be
        // reserved for time the asset no longer has left to play.
        durationSec: round(tail - offsetSec),
        detuneCents: round(detuneCents),
        offsetSec: round(offsetSec),
      });

      // The layer's own voice is held for the sound plus any rest it asks for;
      // the global count is released as soon as the sound stops. Rest is a
      // statement about how often *this* layer may speak, not a reservation
      // against the whole mix.
      //
      // `minimumRestSec` was computed here and then discarded, so a layer
      // asking for rest got none.
      state.active.push(now + tail + (state.layer.minimumRestSec ?? 0));
      globalActive.push(now + tail);
      state.recent.unshift(asset.assetId);
      if (state.recent.length > 12) state.recent.pop();
      if ((asset.brightness ?? 0) > 0.6) brightHistory.push(now);
    }
  }

  const lastTailEndsAtSec = events.reduce((latest, event) => Math.max(latest, event.atSec + event.durationSec), 0);
  return { events, emptyLayers, lastTailEndsAtSec: round(lastTailEndsAtSec), seed };
}

// ---------------------------------------------------------------------------
// Pool resolution
// ---------------------------------------------------------------------------

/**
 * The shortest recording worth entering part-way into.
 *
 * Below this there is not enough sound to enter *into*: skipping into a
 * four-second recording leaves a fragment, and the point of entering anywhere
 * is to get a different-sounding whole.
 */
export const MIN_ENTER_ANYWHERE_SEC = 15;

/**
 * How far into a recording this event begins.
 *
 * Zero for everything struck, always — a bell entered after its attack is not
 * a bell. For a layer that has opted into `enterAnywhere`, a point in the
 * first half, so there is still most of the recording left to play. That is
 * what lets two ocean recordings carry a twenty-five minute bed: the pool is
 * two files and the *entries* are all different.
 */
function entryOffset(layer: SoundBathLayer, asset: SchedulableAsset, rng: Rng): number {
  if (!layer.enterAnywhere) return 0;
  if (asset.durationSeconds < MIN_ENTER_ANYWHERE_SEC) return 0;
  return rng.nextFloat() * asset.durationSeconds * 0.5;
}

export function resolvePool(
  pool: AssetPool,
  library: SchedulableAsset[],
  requireApproved: boolean,
): SchedulableAsset[] {
  const approved = requireApproved ? library.filter((asset) => asset.approved) : library;

  if (pool.assetIds && pool.assetIds.length > 0) {
    const wanted = new Set(pool.assetIds);
    return approved.filter((asset) => wanted.has(asset.assetId));
  }

  return approved.filter((asset) => {
    if (pool.instruments && !pool.instruments.includes(asset.instrument)) return false;
    if (pool.durationClasses && !pool.durationClasses.includes(asset.durationClass)) return false;
    if (pool.requiredTags && !pool.requiredTags.every((tag) => asset.tags.includes(tag))) return false;
    if (pool.excludedTags && pool.excludedTags.some((tag) => asset.tags.includes(tag))) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * Picks one asset, by weight rather than uniformly (§17).
 *
 * Weight combines four things: what the preset prefers, how well the asset
 * matches the requested brightness and energy, how recently it played, and
 * whether the mix has had too many bright events lately. The result is meant to
 * feel chosen rather than random — the same handful of good bowls recurring
 * with variation, not a shuffle.
 */
function chooseAsset(
  state: LayerState,
  preset: SoundBathPreset,
  rng: Rng,
  brightHistory: number[],
  now: number,
): SchedulableAsset | null {
  const { pool, layer, recent } = state;
  const globals = preset.globals;

  // Fatigue: too many bright events in the last minute and brightness is
  // actively penalised until the ear gets a rest (§81).
  const recentBright = brightHistory.filter((at) => at > now - 60).length;
  const fatigued = recentBright >= 4;

  let total = 0;
  const weights = new Array<number>(pool.length);
  for (let i = 0; i < pool.length; i++) {
    const asset = pool[i];
    let weight = selectionWeight(asset, layer, globals, fatigued);

    // The no-repeat window. Not a hard ban — a hard ban on a five-asset pool
    // produces a rotation, which is its own kind of obvious. A steep penalty
    // that decays back to neutral makes recurrence feel incidental (§16).
    //
    // Clamped at 1, which it was not. `0.02 + 0.16 * since` passes 1 at the
    // seventh position and reaches 1.78 at the twelfth, so an asset played
    // seven to eleven events ago was up to 1.8 times *more* likely than one
    // that had never played at all — the opposite of what this is for, and of
    // what the comment above it said. A penalty may fade; it may not invert.
    const since = recent.indexOf(asset.assetId);
    if (since >= 0) weight *= Math.min(1, 0.02 + 0.16 * since);

    weights[i] = weight;
    total += weight;
  }

  if (total <= 0) return null;
  let ticket = rng.nextFloat() * total;
  for (let i = 0; i < pool.length; i++) {
    ticket -= weights[i];
    if (ticket <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * How likely one asset is to be picked, before its own history is considered.
 *
 * Split out of `chooseAsset` rather than copied because a second copy is what
 * lets a preset pass validation and then sound like something else: the
 * validator measures how much of a pool the globals actually leave reachable,
 * and it can only measure that if it is weighing assets the way the scheduler
 * will. The steps are in the order the scheduler applies them, including the
 * fatigue penalty landing between brightness and energy, so extracting this
 * changed no arithmetic.
 *
 * The one thing deliberately left outside is the no-repeat penalty, which
 * depends on what this layer has already played and therefore has no meaning
 * for a pool at rest.
 */
export function selectionWeight(
  asset: SchedulableAsset,
  layer: SoundBathLayer,
  globals: SoundBathGlobals,
  fatigued = false,
): number {
  let weight = 1;

  for (const tag of asset.tags) {
    const preferred = layer.pool.preferredTags?.includes(tag) ? 1.6 : 1;
    const configured = layer.tagWeights?.[tag] ?? 1;
    weight *= preferred * configured;
  }

  // Brightness and energy steer selection rather than filtering it: a dark
  // preset still reaches a bright sample occasionally, which is what keeps a
  // long session from flattening out.
  //
  // A Gaussian rather than the reciprocal this started as. The reciprocal put
  // only a factor of two between the best and worst match across brightness's
  // entire range, which the tag and transient weights swamped: sweeping the
  // control from 0 to 1 moved the mean brightness of what got chosen from
  // 0.548 to 0.581, on a library whose bowls span 0.224 to 0.811. A control
  // that does not move anything is exactly what §92 forbids.
  if (asset.brightness !== null) {
    weight *= gaussian(asset.brightness - globals.brightness, SELECTION_SIGMA);
    if (fatigued && asset.brightness > 0.6) weight *= 0.25;
  }
  if (asset.transientStrength !== null) {
    weight *= gaussian(asset.transientStrength - globals.energy, SELECTION_SIGMA);
  }

  return weight;
}

// ---------------------------------------------------------------------------
// Density, and what it is allowed to touch
// ---------------------------------------------------------------------------

/**
 * Density scales intervals, probability and polyphony — and nothing else.
 *
 * §19 is explicit that it must not simply raise the volume, and the separation
 * is kept structural rather than remembered: gain is computed from the layer
 * and the asset, and density never appears in that expression.
 */
function densityInterval(interval: number, density: number): number {
  // At density 0 events are three times as far apart; at 1, half as far.
  return interval * (3 - 2.5 * density);
}

function densityProbability(probability: number, density: number): number {
  return clamp(probability * (0.35 + 0.85 * density), 0, 1);
}

function densityVoices(maxVoices: number, density: number): number {
  return Math.max(1, Math.round(maxVoices * (0.35 + 0.65 * density)));
}

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/**
 * Cents of retuning for one asset, which is usually none.
 *
 * Retuning is applied only where the asset has a pitch that was actually
 * *measured*. A note carried over from a vendor's filename is a label, not an
 * observation, and shifting audio on the strength of one would be inventing
 * precision the pipeline was careful not to claim. An inharmonic bowl is never
 * retuned at all: it has no pitch to move (§8, §22, §24).
 */
function retuneFor(asset: SchedulableAsset, preset: SoundBathPreset): number {
  const reference = preset.globals.tuningReferenceHz;
  if (!reference || reference === 440) return 0;
  if (asset.noteSource !== 'measured') return 0;
  return 1200 * Math.log2(reference / 440);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
