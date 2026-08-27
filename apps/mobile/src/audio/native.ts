import type {
  AudioContext as AudioContextType,
  AudioManager as AudioManagerType,
} from 'react-native-audio-api';

/**
 * Lazy access to the native audio module.
 *
 * `react-native-audio-api` is a native module. In an environment where it is not
 * linked — a managed Expo Go client, a screenshot harness, a unit test — merely
 * importing it at the top of a module can throw and take the whole bundle down
 * on startup. Requiring it behind a guarded accessor turns that from a crash
 * into a capability the app can report honestly and route around (§65).
 */

interface NativeAudioModule {
  AudioContext: typeof AudioContextType;
  AudioManager: typeof AudioManagerType;
}

let cached: NativeAudioModule | null = null;
let attempted = false;
let failure: string | null = null;

export function loadNativeAudio(): NativeAudioModule | null {
  if (attempted) return cached;
  attempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('react-native-audio-api') as NativeAudioModule;
    if (!module?.AudioContext || !module?.AudioManager) {
      failure = 'The native audio module loaded without an audio context.';
      return null;
    }
    cached = module;
    return cached;
  } catch (error) {
    failure =
      error instanceof Error
        ? error.message
        : 'The native audio module is not available in this build.';
    return null;
  }
}

export function nativeAudioAvailable(): boolean {
  return loadNativeAudio() !== null;
}

export function nativeAudioFailure(): string {
  return failure ?? 'The native audio module is not available in this build.';
}
