import { loadNativeAudio } from './native';
import type { OutputRoute, OutputRouteKind } from '@frequencylab/dsp-core';

/**
 * Output route detection.
 *
 * Platforms describe their audio routes inconsistently, so this normalises the
 * device category strings into the three kinds the safety rules care about, and
 * — crucially — reports `reliable: false` when it cannot tell. The product never
 * claims to know whether headphones are connected when it does not (§42).
 */

const HEADPHONE_HINTS = ['headphone', 'headset', 'wired', 'lineout', 'usb', 'aux'];
const BLUETOOTH_HINTS = ['bluetooth', 'a2dp', 'hfp', 'airpod', 'le audio'];
const SPEAKER_HINTS = ['speaker', 'receiver', 'builtin', 'built-in', 'earpiece'];

export async function detectOutputRoute(): Promise<OutputRoute> {
  const native = loadNativeAudio();
  if (!native) return { kind: 'unknown', reliable: false };

  try {
    const info = await native.AudioManager.getDevicesInfo();
    const current = info.currentOutputs?.[0];
    if (!current) {
      return { kind: 'unknown', reliable: false };
    }
    const haystack = `${current.category ?? ''} ${current.name ?? ''}`.toLowerCase();
    return { kind: classify(haystack), name: current.name, reliable: classify(haystack) !== 'unknown' };
  } catch {
    // A platform that will not tell us is reported as unknown rather than
    // guessed at, so the UI can say "check your output" instead of being wrong.
    return { kind: 'unknown', reliable: false };
  }
}

export function classify(description: string): OutputRouteKind {
  const value = description.toLowerCase();
  if (BLUETOOTH_HINTS.some((hint) => value.includes(hint))) return 'bluetooth';
  if (HEADPHONE_HINTS.some((hint) => value.includes(hint))) return 'headphones';
  if (SPEAKER_HINTS.some((hint) => value.includes(hint))) return 'speaker';
  return 'unknown';
}

export function describeRoute(route: OutputRoute): string {
  switch (route.kind) {
    case 'headphones':
      return route.name ?? 'Headphones';
    case 'bluetooth':
      return route.name ?? 'Bluetooth';
    case 'speaker':
      return route.name ?? 'Speaker';
    default:
      return 'Unknown output';
  }
}
