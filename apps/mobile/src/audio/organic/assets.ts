import { OrganicAssetUnavailableError, organicAssetDelivery } from './delivery';
import type { OrganicAudioGraph, OrganicDecodedBuffer } from './graph';

/**
 * Asset residency: what is decoded, what is being decoded, and what failed.
 *
 * §53 in one sentence: 369 files, 1.5 GB on disk and **2.06 GB decoded** — the
 * expansion is 24-bit PCM becoming float32 — so nothing may hold them all, and
 * the cache is not an optimisation but the thing that makes playback possible
 * at all. The pipeline already did the hard part and wrote the answer into every
 * record:
 *
 *  - `preloadRecommended` — 309 assets, 954 MB decoded, median 2.3 MB and none
 *    above 10 MB. These are the hot set. They are decoded on the look-ahead,
 *    kept, and evicted least-recently-used when the budget is reached.
 *  - `streamingRecommended` — 60 assets, 1.11 GB decoded, 10.7 MB to 58.4 MB
 *    each. The longest one is 90% of the entire budget on its own. These are
 *    admitted one at a time, never counted as hot, and dropped the moment their
 *    voice ends. They are not *streamed* — see the note on `admitStreaming`,
 *    which says plainly what this does instead of pretending.
 *
 * Everything here happens off the audio path. The one method the scheduler calls
 * while deciding what to start is `resident`, which is a `Map.get` (§55).
 */

/**
 * What the player needs to know about an asset, and nothing else.
 *
 * Declared structurally rather than imported, for the same reason
 * `SchedulableAsset` is in `soundbath.ts`: this depends on the *shape* of an
 * asset, not on the manifest's storage format, so the thing that reads the
 * manifest can satisfy it without this file ever learning what a manifest is.
 * Nothing here is a file path or a filename (§44).
 *
 * The field names are the DSP core's `OrganicAsset` names, deliberately. That
 * type is the registry's own flattened view of a manifest record and it
 * satisfies this interface exactly as it stands — no adapter, no renaming pass,
 * and no second place where `preload` might come to mean something slightly
 * different from `preloadRecommended`.
 */
export interface OrganicRuntimeAsset {
  readonly id: string;
  /** The whole file, silence at either end included. */
  readonly durationSeconds: number;
  /** Where playback should begin, so a strike never starts mid-attack. */
  readonly startSeconds: number;
  /** Where the sound is finished. The end of the file unless it has dead air. */
  readonly endSeconds: number;
  /** Short enough to hold decoded in memory (§23, §53). */
  readonly preload: boolean;
  /** Too long to hold decoded in memory (§23, §53). */
  readonly streaming: boolean;
  /** How many copies may sound at once before the attacks pile up (§12). */
  readonly maxVoices: number;
  /**
   * How loud this asset still is where playback ends, relative to its peak.
   * `releaseSecondsFor` turns it into this voice's fade-out.
   */
  readonly releaseTailDb: number | null;
}

/**
 * Decoded bytes the cache will hold before it starts evicting.
 *
 * 64 MB is about 28 assets at this library's median, which comfortably covers a
 * long session's hot set — a forty-minute plan touches a few dozen distinct
 * sounds, most of them more than once. It is also, deliberately, less than one
 * of the longest assets plus anything else: the 58 MB bowl cannot be resident at
 * the same time as a working set, which is exactly what its `streamingRecommended`
 * flag is warning about.
 */
export const DEFAULT_CACHE_BUDGET_BYTES = 64 * 1024 * 1024;

/**
 * Decodes in flight at once.
 *
 * Two, because decoding competes with the core for the same CPU and §52 gives
 * the core priority. The look-ahead is ten seconds wide, so two at a time is
 * ample; a burst of eight would be a stall in the render loop.
 */
const MAX_CONCURRENT_LOADS = 2;

export interface OrganicCacheStats {
  readonly residentCount: number;
  readonly residentBytes: number;
  readonly budgetBytes: number;
  readonly loading: number;
  readonly loaded: number;
  readonly evicted: number;
  readonly failed: number;
}

interface Entry {
  readonly assetId: string;
  readonly buffer: OrganicDecodedBuffer;
  readonly streaming: boolean;
  /** Voices currently sounding this asset. A pinned entry is never evicted. */
  pins: number;
  usedAt: number;
}

export class OrganicAssetCache {
  private readonly resident_ = new Map<string, Entry>();
  private readonly inFlight = new Set<string>();
  private readonly queue: string[] = [];
  /**
   * Assets that could not be obtained, with the reason.
   *
   * Remembered rather than retried. With no delivery configured every one of a
   * session's events would otherwise take the same failing path, and a plan with
   * four hundred events would produce four hundred identical rejections. One
   * attempt per asset, one diagnostic per asset, and the event count says how
   * many sounds it cost (§56).
   */
  private readonly failures = new Map<string, string>();

  private residentBytes = 0;
  private clock = 0;
  private loaded = 0;
  private evicted = 0;

  constructor(
    private readonly graph: OrganicAudioGraph,
    private readonly assets: ReadonlyMap<string, OrganicRuntimeAsset>,
    private readonly budgetBytes: number = DEFAULT_CACHE_BUDGET_BYTES,
  ) {}

  /**
   * The decoded buffer, if it is in memory right now.
   *
   * A `Map.get` and nothing else. This is the only method the scheduling path
   * calls, and it never blocks, allocates or starts work (§55).
   */
  resident(assetId: string): OrganicDecodedBuffer | undefined {
    const entry = this.resident_.get(assetId);
    if (!entry) return undefined;
    entry.usedAt = ++this.clock;
    return entry.buffer;
  }

  /** Why this asset will never play in this session, if it has already failed. */
  failure(assetId: string): string | undefined {
    return this.failures.get(assetId);
  }

  /**
   * Asks for an asset to be in memory. Returns immediately.
   *
   * Called from the look-ahead, seconds before the event is due, so a decode has
   * time to finish before anything needs it. An asset that is resident, already
   * loading or already known to have failed costs one map lookup.
   */
  request(assetId: string): void {
    if (this.resident_.has(assetId)) return;
    if (this.inFlight.has(assetId)) return;
    if (this.failures.has(assetId)) return;
    if (this.queue.includes(assetId)) return;
    // Checked before the decode rather than after it: one long asset at a time
    // is the rule, and finding that out only once 58 MB has already been decoded
    // would spend exactly the memory the rule exists to protect.
    if (this.assets.get(assetId)?.streaming === true && this.streamingIsBusy()) return;
    this.queue.push(assetId);
    this.pump();
  }

  /** True while a long asset is sounding, which excludes admitting another. */
  private streamingIsBusy(): boolean {
    for (const entry of this.resident_.values()) {
      if (entry.streaming && entry.pins > 0) return true;
    }
    return false;
  }

  private pump(): void {
    while (this.inFlight.size < MAX_CONCURRENT_LOADS && this.queue.length > 0) {
      const assetId = this.queue.shift();
      if (assetId === undefined) return;
      if (this.resident_.has(assetId) || this.failures.has(assetId)) continue;
      this.inFlight.add(assetId);
      void this.load(assetId).finally(() => {
        this.inFlight.delete(assetId);
        this.pump();
      });
    }
  }

  private async load(assetId: string): Promise<void> {
    const asset = this.assets.get(assetId);
    if (!asset) {
      // The plan named an asset the runtime has no record of. That is a library
      // mismatch — a plan made against one library version being played against
      // another — and it is reported rather than guessed at (§86).
      this.failures.set(assetId, 'Not in this build’s asset registry.');
      return;
    }

    try {
      const payload = await organicAssetDelivery().fetch(assetId);
      const buffer = await this.graph.decode(payload);
      this.admit(asset, buffer);
    } catch (error) {
      const reason =
        error instanceof OrganicAssetUnavailableError
          ? error.reason
          : error instanceof Error
            ? error.message
            : 'The asset could not be decoded.';
      this.failures.set(assetId, reason);
    }
  }

  private admit(asset: OrganicRuntimeAsset, buffer: OrganicDecodedBuffer): void {
    if (asset.streaming) this.dropIdleStreaming();
    this.makeRoomFor(buffer.bytes);
    if (this.residentBytes + buffer.bytes > this.budgetBytes) {
      // Everything evictable has been evicted and it still does not fit. The
      // asset is refused rather than blowing the budget: a decorative layer is
      // not allowed to push a phone into a memory warning while a session is
      // running (§52).
      this.failures.set(
        asset.id,
        `Decodes to ${formatMb(buffer.bytes)}, which does not fit the ${formatMb(this.budgetBytes)} cache.`,
      );
      return;
    }
    this.resident_.set(asset.id, {
      assetId: asset.id,
      buffer,
      streaming: asset.streaming,
      pins: 0,
      usedAt: ++this.clock,
    });
    this.residentBytes += buffer.bytes;
    this.loaded++;
  }

  /**
   * Makes way for a long asset by dropping the last one.
   *
   * This is not streaming and does not claim to be. The pipeline's hint means
   * "too long to hold decoded"; what happens here is that the asset is decoded
   * anyway, one at a time, and thrown away the instant its voice ends, so it is
   * never part of the working set. Real streaming needs a source that reads as
   * it plays — `react-native-audio-api` has `createStreamer`, the browser has
   * `MediaElementAudioSourceNode` — and neither can be started on a given sample,
   * which is the whole point of a scheduled sound bath (§54). Until one of them
   * can, this is the honest approximation, and the limit is enforced rather than
   * hoped for: `request` refuses a second long asset before it is fetched, and
   * `unpin` drops this one the moment its voice ends.
   */
  private dropIdleStreaming(): void {
    for (const entry of [...this.resident_.values()]) {
      if (entry.streaming && entry.pins === 0) this.drop(entry.assetId);
    }
  }

  private makeRoomFor(bytes: number): void {
    if (this.residentBytes + bytes <= this.budgetBytes) return;
    const candidates = [...this.resident_.values()]
      .filter((entry) => entry.pins === 0)
      .sort((a, b) => a.usedAt - b.usedAt);
    for (const entry of candidates) {
      if (this.residentBytes + bytes <= this.budgetBytes) return;
      this.drop(entry.assetId);
      this.evicted++;
    }
  }

  private drop(assetId: string): void {
    const entry = this.resident_.get(assetId);
    if (!entry) return;
    this.resident_.delete(assetId);
    this.residentBytes -= entry.buffer.bytes;
  }

  /** A voice has started on this asset: it may not be evicted underneath it. */
  pin(assetId: string): void {
    const entry = this.resident_.get(assetId);
    if (entry) entry.pins++;
  }

  /**
   * A voice has finished.
   *
   * A streaming-hinted asset goes immediately once nothing is sounding it —
   * holding 58 MB against the chance it recurs is precisely the trade its hint
   * says not to make.
   */
  unpin(assetId: string): void {
    const entry = this.resident_.get(assetId);
    if (!entry) return;
    entry.pins = Math.max(0, entry.pins - 1);
    if (entry.streaming && entry.pins === 0) {
      this.drop(assetId);
      this.evicted++;
    }
  }

  stats(): OrganicCacheStats {
    return {
      residentCount: this.resident_.size,
      residentBytes: this.residentBytes,
      budgetBytes: this.budgetBytes,
      loading: this.inFlight.size + this.queue.length,
      loaded: this.loaded,
      evicted: this.evicted,
      failed: this.failures.size,
    };
  }

  /** Every distinct failure, for the diagnostics list. */
  failureReasons(): { assetId: string; reason: string }[] {
    return [...this.failures].map(([assetId, reason]) => ({ assetId, reason }));
  }

  dispose(): void {
    this.resident_.clear();
    this.queue.length = 0;
    this.inFlight.clear();
    this.residentBytes = 0;
  }
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
