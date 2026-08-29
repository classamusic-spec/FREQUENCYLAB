import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import {
  BUNDLED_ASSETS,
  BUNDLED_ASSET_COUNT,
  type BundledAssetModule,
} from './bundledAssets.generated';
import {
  OrganicAssetUnavailableError,
  type OrganicAssetDelivery,
  type OrganicAssetPayload,
} from './delivery';

/**
 * The delivery that ships: the library, in the app.
 *
 * `bundledAssets.generated.ts` holds one `require()` per approved asset, which
 * is what makes the audio real to the bundler. This turns those module handles
 * into something a decoder will take, and the two platforms want different
 * things:
 *
 *  - **Native** gets a `uri`. `expo-asset` resolves a module to a file on
 *    disk, and `react-native-audio-api` decodes a path natively — so a 1.6 MB
 *    Vorbis file never crosses the bridge as JavaScript bytes.
 *  - **Web** gets `bytes`. Metro emits each asset as a separate file and the
 *    module resolves to a URL; the browser decoder wants an `ArrayBuffer`, so
 *    this fetches it. Nothing is fetched until the look-ahead scheduler asks
 *    for it, seconds before the sound is due, and the cache above keeps it.
 *
 * **What this costs, stated plainly.** 369 files, 66 MB, inside the app. That
 * is the whole library at Vorbis quality, and it is the price of an organic
 * layer that works with no network and no server. Nothing here streams from
 * anywhere; if that ever changes, this is the one file that has to change.
 */

/** Cached per asset: resolving a module to a URI is async and worth doing once. */
const resolved = new Map<string, string>();

async function uriFor(assetId: string, module: BundledAssetModule): Promise<string> {
  const cached = resolved.get(assetId);
  if (cached !== undefined) return cached;

  const asset = Asset.fromModule(module as Parameters<typeof Asset.fromModule>[0]);
  // `localUri` is null until the asset has been unpacked from the binary. On
  // web `downloadAsync` resolves immediately and `uri` is the emitted URL.
  if (!asset.localUri && Platform.OS !== 'web') await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) {
    throw new OrganicAssetUnavailableError(
      assetId,
      'The asset is bundled but the bundler resolved it to no location.',
    );
  }
  resolved.set(assetId, uri);
  return uri;
}

export const BUNDLED_DELIVERY: OrganicAssetDelivery = {
  id: 'bundled',
  description: `The sample library is bundled with the app — ${BUNDLED_ASSET_COUNT} approved assets, about 66 MB of Ogg Vorbis. Nothing is downloaded and no network is used.`,
  configured: BUNDLED_ASSET_COUNT > 0,

  async fetch(assetId: string): Promise<OrganicAssetPayload> {
    const module = BUNDLED_ASSETS[assetId];
    if (module === undefined) {
      throw new OrganicAssetUnavailableError(
        assetId,
        'This asset is in the manifest but is not bundled with the app. Re-run the pipeline’s bundle stage.',
      );
    }

    const uri = await uriFor(assetId, module);
    if (Platform.OS !== 'web') return { kind: 'uri', uri };

    // The browser decoder takes bytes, so the URL is read here rather than
    // handed on. A non-2xx is turned into the layer's own error type so it
    // lands in the diagnostics count with the others.
    let response: Response;
    try {
      response = await fetch(uri);
    } catch (error) {
      throw new OrganicAssetUnavailableError(
        assetId,
        `Could not read the bundled asset: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!response.ok) {
      throw new OrganicAssetUnavailableError(
        assetId,
        `The bundled asset returned HTTP ${response.status}.`,
      );
    }
    return { kind: 'bytes', data: await response.arrayBuffer() };
  },
};
