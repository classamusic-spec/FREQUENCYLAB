/**
 * How an organic asset's bytes reach the app — and the fact that, today, they
 * do not.
 *
 * This is the honest centre of the organic layer, so it is stated here rather
 * than left to be discovered. The library is 369 licensed WAV files, 1.5 GB,
 * committed to this repository at `Healing Sounds - Bells & Chimes/`. It is a
 * development-time input: the pipeline measures it offline and the app ships
 * the *manifest*, not the audio (see `docs/audio-asset-pipeline.md`). Nothing
 * bundles those files, nothing serves them, and nothing downloads them:
 *
 *  - **Bundling** them is not an option in either build. `assetBundlePatterns`
 *    would put 1.5 GB inside an app binary, and the web export would put the
 *    same 1.5 GB behind a static host and ask a browser to fetch it.
 *  - **Serving** them needs a host that does not exist. There is no server in
 *    this product at all (`docs/BACKEND.md`), and the licence on the library is
 *    a redistribution question before it is an engineering one.
 *  - **Downloading** them on first run is the shape that would work — a curated
 *    subset, fetched to `expo-file-system` and cached by content hash, which
 *    the manifest already gives every asset. That is a product decision with a
 *    cost attached, and it has not been taken.
 *
 * So the seam exists and the implementation behind it does not. That is
 * deliberate: §92 says a stub that pretends to play is worse than a documented
 * gap, and the failure mode a fake would create here is the worst kind — a
 * session that reports it is playing a sound bath while producing silence.
 * `UNCONFIGURED_DELIVERY` refuses every asset with a reason a person can read,
 * every refusal is counted, and the core frequency session is untouched by it
 * (§56). Install a real delivery with `setOrganicAssetDelivery` and the rest of
 * the layer — cache, voices, look-ahead, mixer — works against it unchanged.
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
