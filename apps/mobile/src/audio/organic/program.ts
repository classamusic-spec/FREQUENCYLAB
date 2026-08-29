import {
  OrganicAssetRegistry,
  planSoundBath,
  soundBathPreset,
  type OrganicAsset,
  type OrganicAudioManifest,
  type Plan,
  type SchedulableAsset,
  type SoundBathPreset,
} from '@frequencylab/dsp-core';
import manifestJson from '../../../../../generated/audio/organic_audio_manifest.json';
import type { OrganicRuntimeAsset } from './assets';

/**
 * Turning a chosen sound bath into something the controller can play.
 *
 * The one place the three halves of the organic layer meet: the *library* (the
 * manifest, measured offline), the *preset* (a set of pool queries and ranges)
 * and the *scheduler* (`planSoundBath`, a pure function of the two plus a seed).
 * Everything below the controller — cache, voices, look-ahead, mixer — takes
 * what comes out of here and re-decides none of it.
 *
 * **The plan is made once, before a note sounds.** That is what makes a session
 * reproducible from its seed, and it is why this is a plain function rather than
 * anything that runs while audio is playing (§18, §42, §48).
 *
 * **`requireApproved` is left at its default.** The scheduler ships gated on
 * curation and this does not opt out: an unapproved library produces an empty
 * plan and the layers say which pools were empty. The whole pack is approved
 * today, so the gate passes — but it passes because of the policy on disk, not
 * because this file waved it through.
 */

/** Built once. The manifest is ~0.9 MB of JSON and parsing it repeatedly is waste. */
let registryInstance: OrganicAssetRegistry | null = null;

export function organicRegistry(): OrganicAssetRegistry {
  registryInstance ??= new OrganicAssetRegistry(manifestJson as unknown as OrganicAudioManifest);
  return registryInstance;
}

/** Everything the scheduler needs, from every asset the library holds. */
let scheduleLibrary: SchedulableAsset[] | null = null;

function library(): SchedulableAsset[] {
  if (scheduleLibrary) return scheduleLibrary;
  const registry = organicRegistry();
  scheduleLibrary = registry.ids.map((id) => toSchedulable(registry.asset(id)!));
  return scheduleLibrary;
}

function toSchedulable(asset: OrganicAsset): SchedulableAsset {
  return {
    assetId: asset.id,
    durationSeconds: asset.durationSeconds,
    instrument: asset.instrument,
    durationClass: asset.durationClass,
    // Copied rather than aliased: `SchedulableAsset` declares these mutable and
    // the registry's are readonly views onto the manifest. A cast would hand the
    // scheduler a live reference to the library's own arrays.
    roles: [...asset.roles],
    tags: [...asset.characterTags],
    brightness: asset.brightness,
    transientStrength: asset.transientStrength,
    recommendedGainDb: asset.gainCompensationDb,
    pitchClass: asset.pitchClass,
    noteSource: asset.noteSource,
    maxRecommendedVoices: asset.maxVoices,
    loopable: asset.loopable,
    approved: asset.approved,
  };
}

function toRuntime(asset: OrganicAsset): OrganicRuntimeAsset {
  return {
    id: asset.id,
    durationSeconds: asset.durationSeconds,
    startSeconds: asset.startSeconds,
    endSeconds: asset.endSeconds,
    preload: asset.preload,
    streaming: asset.streaming,
    maxVoices: asset.maxVoices,
  };
}

export interface SoundBathProgram {
  readonly plan: Plan;
  readonly assets: ReadonlyMap<string, OrganicRuntimeAsset>;
  readonly preset: SoundBathPreset;
}

export interface SoundBathRequest {
  presetId: string;
  /** Seconds. Normally the protocol's own length, so the two end together. */
  durationSec: number;
  /** Anything stable. The same seed and preset reproduce the same session. */
  seed: number | string;
  /** Lowered on weaker hardware; the scheduler honours it (§15, §52). */
  maxVoices?: number;
}

/**
 * Plans a sound bath, or explains why it could not.
 *
 * Returns `null` for an unknown preset id — a stored session naming a preset a
 * later build removed is a real case, and it must degrade to a frequency
 * session rather than throwing on the way into playback.
 */
export function buildSoundBathProgram(request: SoundBathRequest): SoundBathProgram | null {
  const preset = soundBathPreset(request.presetId);
  if (!preset) return null;

  const plan = planSoundBath({
    preset,
    library: library(),
    durationSec: request.durationSec,
    seed: request.seed,
    maxVoices: request.maxVoices,
  });

  // Only the assets the plan actually named. A map of all 369 would be handed
  // to the cache as a hot set, and the cache's budget is the reason it is not.
  const registry = organicRegistry();
  const assets = new Map<string, OrganicRuntimeAsset>();
  for (const event of plan.events) {
    if (assets.has(event.assetId)) continue;
    const asset = registry.asset(event.assetId);
    if (asset) assets.set(event.assetId, toRuntime(asset));
  }

  return { plan, assets, preset };
}
