/**
 * How an organic asset's bytes reach the app — and the fact that, today, they
 * do not.
 *
 * This is the honest centre of the organic layer, so it is stated here rather
 * than left to be discovered by whoever wonders why nothing is playing.
 *
 * **What exists.** 369 licensed source files, 1.5 GB of 24-bit WAV, at
 * `Healing Sounds - Bells & Chimes/`. The pipeline measures them offline and
 * the app ships the *manifest*, not the audio. `index_audio.py derive` now also
 * writes compressed runtime copies to `generated/audio/runtime/<codec>/`, one
 * file per asset and named by asset id — the whole library at 66 MB, which
 * answers the size objection that used to make this question unanswerable.
 *
 * **What does not.** Those derivatives are not committed, and `derive` writes
 * only approved assets by default because shipping a derivative of an asset no
 * curator has passed would put unreviewed audio in front of a listener. One of
 * the 369 is approved. So there is currently nothing to ship, and nothing that
 * ships it:
 *
 *  - **Bundling.** 66 MB is a plausible bundle, but nothing declares it. There
 *    is no map from an asset id to a `require`d module and no
 *    `assetBundlePatterns` entry, and Metro bundles what is referenced.
 *  - **Serving.** There is no server in this product at all
 *    (`docs/BACKEND.md`), and the licence on the library is a redistribution
 *    question before it is an engineering one.
 *  - **Downloading.** Fetching a curated subset on first run into
 *    `expo-file-system`, keyed by the content hash the manifest already carries
 *    for every asset, is the shape that would work on device. It is a product
 *    decision with a cost attached and it has not been taken.
 *
 * So the seam exists and the implementation behind it does not, deliberately.
 * §92 says a stub that pretends to play is worse than a documented gap, and the
 * fake here would be the worst kind — a session reporting that it is playing a
 * sound bath while producing silence. `UNCONFIGURED_DELIVERY` refuses every
 * asset with a reason a person can read, every refusal is counted and shown in
 * diagnostics, and the core frequency session is untouched by all of it (§56).
 * Install a real delivery with `setOrganicAssetDelivery` and the rest of the
 * layer — cache, voices, look-ahead, mixer — works against it unchanged.
 */

/**
 * One asset's bytes, in whichever form the platform can decode.
 *
 * Both forms exist because the two decoders take different things: a browser
 * decodes an `ArrayBuffer`, and `react-native-audio-api` will decode a local
 * file path or a remote URL without the bytes ever passing through JavaScript —
 * which is the form to prefer on device, since a 58 MB decode should not be
 * marshalled across the bridge.
 */
export type OrganicAssetPayload =
  | { readonly kind: 'bytes'; readonly data: ArrayBuffer }
  | { readonly kind: 'uri'; readonly uri: string };

/**
 * An asset could not be obtained.
 *
 * Carries the id and a sentence, because both end up in the diagnostics list
 * the session keeps. It is thrown, caught by the cache, and never reaches the
 * audio path.
 */
export class OrganicAssetUnavailableError extends Error {
  constructor(
    readonly assetId: string,
    readonly reason: string,
  ) {
    super(reason);
    this.name = 'OrganicAssetUnavailableError';
  }
}

export interface OrganicAssetDelivery {
  /** Short identifier for diagnostics — how the bytes are being obtained. */
  readonly id: string;
  /** One sentence a person reads in the diagnostics screen. */
  readonly description: string;
  /**
   * Whether this delivery can actually produce bytes in this build.
   *
   * Separate from "does `fetch` throw" so the UI can say the layer is dormant
   * *before* a session starts, rather than reporting 40 failed events after it.
   */
  readonly configured: boolean;
  /**
   * Obtains one asset. Never called from the audio path — the look-ahead
   * scheduler calls it seconds before the event is due (§54, §55).
   */
  fetch(assetId: string): Promise<OrganicAssetPayload>;
}

/**
 * The delivery that ships: none.
 *
 * It refuses rather than resolving to silence, so the failure is visible in the
 * diagnostics count instead of being mistaken for a quiet passage.
 */
export const UNCONFIGURED_DELIVERY: OrganicAssetDelivery = {
  id: 'none',
  description:
    'No asset delivery is configured. The organic sample library is a development-time input and is not bundled, hosted or downloaded by this build.',
  configured: false,
  fetch(assetId: string): Promise<OrganicAssetPayload> {
    return Promise.reject(
      new OrganicAssetUnavailableError(
        assetId,
        'No asset delivery is configured in this build.',
      ),
    );
  },
};

let installed: OrganicAssetDelivery = UNCONFIGURED_DELIVERY;

export function organicAssetDelivery(): OrganicAssetDelivery {
  return installed;
}

/**
 * Installs a delivery.
 *
 * A module-level binding rather than a constructor argument, because the
 * decision is a property of the *build* — how this app obtains audio — and not
 * of any one session. Passing `null` restores the refusing default, which is
 * what a test does when it is finished with a fixture.
 */
export function setOrganicAssetDelivery(delivery: OrganicAssetDelivery | null): void {
  installed = delivery ?? UNCONFIGURED_DELIVERY;
}
