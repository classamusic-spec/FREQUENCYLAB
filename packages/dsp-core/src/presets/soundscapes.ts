import { makeNode, emptyGraph, withConnection, withNode } from '../graph/factory.js';
import type { RoutingGraph } from '../graph/types.js';
import { INTENSITY_AMPLITUDE } from '../protocol/recipes.js';
import type { AutomationLane, AutomationPoint, ProtocolStage } from '../protocol/schema.js';

/**
 * Soundscapes: a scene synthesised from the engine's own noise sources, with a
 * modulation rate woven through it.
 *
 * ## What a soundscape is, and what it is not
 *
 * Nothing here is a recording. The app ships no storm audio — its organic
 * library is bowls, bells, chimes, kalimba, tuning forks and two ocean takes —
 * so a thunderstorm has to be *built*: rain from filtered pink and white noise,
 * wind from a resonant band of pink noise moving across the stereo field, and
 * thunder from heavily low-passed brown noise whose level and brightness are
 * automated into rolls. It is an impression of a storm in the way a synthesiser
 * patch is an impression of an instrument, and the preset says so.
 *
 * ## How the rate is woven in
 *
 * The rate is an amplitude-modulation *insert* on the rain and the thunder —
 * the storm itself flutters at the rate, rather than a tone being laid on top
 * of it. The wind is deliberately left outside the insert, so some of the
 * storm stays untouched and the modulation reads as a texture in the weather,
 * not a filter over all of it.
 *
 * ## Why the thunder is automated rather than modulated
 *
 * A periodic swell is the one thing thunder never does. The noise node's own
 * modulator is a sine, so a roll every 30 seconds would be a metronome. The
 * rolls are instead automation lanes laid at irregular, seeded intervals, each
 * with its own size, attack and decay, and the close ones carry a brief opening
 * of the low-pass filter — the crack before the roll. Seeded, not random, so a
 * session is the same storm every time it is played, which is what lets a
 * listener compare two sessions at all.
 */

export type SoundscapeScene = 'thunderstorm';

export interface SoundscapeOptions {
  scene: SoundscapeScene;
  /** The modulation rate woven into the scene, in Hz. */
  rateHz: number;
  /** 0..1 depth of that modulation. */
  depth: number;
  durationSec: number;
  /** Output amplitude, on the same scale as the standard chain's intensity. */
  amplitude: number;
  id: string;
  name: string;
  notes?: string;
  /** Seeds the storm's timing. Fixed by default so a preset is repeatable. */
  seed?: number;
}

/** Node ids, exported so tests and the readout can find each layer by name. */
export const STORM_NODES = {
  rain: 'rain',
  hiss: 'hiss',
  thunder: 'thunder',
  thunderGain: 'thunderGain',
  wind: 'wind',
  motion: 'motion',
  /** The bus the woven layers are summed on — the AM insert takes one input. */
  bed: 'bed',
  weave: 'am',
  mix: 'mix',
} as const;

/** The resting level of the thunder layer: a storm you can always hear far off. */
export const THUNDER_BASE_LEVEL = 0.04;
const THUNDER_BASE_CUTOFF = 220;

export function buildSoundscapeStage(options: SoundscapeOptions): ProtocolStage {
  switch (options.scene) {
    case 'thunderstorm':
      return thunderstormStage(options);
    default: {
      const exhaustive: never = options.scene;
      throw new Error(`No soundscape named ${String(exhaustive)}`);
    }
  }
}

function thunderstormStage(options: SoundscapeOptions): ProtocolStage {
  const N = STORM_NODES;
  let graph: RoutingGraph = emptyGraph();

  // Rain: the body of the storm. A very wide band of pink noise centred near
  // 2.2 kHz — where falling water actually puts its energy. It is band-passed
  // rather than low-passed on purpose: rain has little below a few hundred
  // hertz, and a rain layer that fills the low end buries the thunder, which
  // is exactly what the first version of this did (measured: a roll lifted the
  // low band by under 3 dB in the mix while rising 20 dB on its own).
  graph = withNode(
    graph,
    makeNode(N.rain, 'noise', { level: 0.24, width: 0.95, cutoff: 2200, resonance: 0.35, modDepth: 0.14, modRate: 0.23 }, { color: 'pink', filter: 'bandpass' }, { label: 'Rain' }),
  );
  // Hiss: the individual drops. White noise above 5 kHz with a faster, deeper
  // flicker, which is what turns a wash into rain you can hear landing.
  graph = withNode(
    graph,
    makeNode(N.hiss, 'noise', { level: 0.06, width: 1, cutoff: 5000, resonance: 0.7, modDepth: 0.3, modRate: 1.7 }, { color: 'white', filter: 'highpass' }, { label: 'Drops' }),
  );
  // Thunder: brown noise below 220 Hz. Its level and cutoff are automated
  // below; the values here are where it rests between rolls.
  graph = withNode(
    graph,
    makeNode(N.thunder, 'noise', { level: THUNDER_BASE_LEVEL, width: 0.6, cutoff: THUNDER_BASE_CUTOFF, resonance: 1.1, modDepth: 0, modRate: 0.1 }, { color: 'brown', filter: 'lowpass' }, { label: 'Thunder' }),
  );
  // Make-up gain for the rumble. A low-passed noise source loses most of its
  // energy to the filter, so at the same level setting it is far quieter than
  // the rain — the roll has to be able to rise above the weather it rolls in.
  graph = withNode(graph, makeNode(N.thunderGain, 'gain', { gain: 2 }, {}, { label: 'Thunder gain' }));
  // Wind: a resonant band of pink noise, slowly gusting, drifting across the
  // stereo field. Kept outside the modulation so part of the storm is plain.
  graph = withNode(
    graph,
    makeNode(N.wind, 'noise', { level: 0.07, width: 0.8, cutoff: 420, resonance: 1.4, modDepth: 0.55, modRate: 0.06 }, { color: 'pink', filter: 'bandpass' }, { label: 'Wind' }),
  );
  graph = withNode(graph, makeNode(N.motion, 'stereoMotion', { rate: 0.05, depth: 0.5, center: 0 }, {}, { label: 'Wind drift' }));

  // The weave: one AM insert that the rain, the drops and the thunder all pass
  // through, so the rate lives inside the weather rather than on top of it.
  graph = withNode(
    graph,
    makeNode(N.weave, 'am', { modFrequency: options.rateHz, depth: options.depth, amplitude: 1 }, {}, { label: `${options.rateHz} Hz weave` }),
  );
  // Make-up for the whole scene. Band-limited noise sources sum to a quieter
  // bed than a full-range noise preset at the same settings; measured, the
  // storm sat 4–6 dB under the other noise rows between rolls, so it is lifted
  // to sit with them. The limiter still stands behind every peak.
  const gain = Math.max(0, Math.min(2, (options.amplitude / INTENSITY_AMPLITUDE.balanced) * 1.6));
  graph = withNode(graph, makeNode(N.mix, 'mixer', { gain }, {}, { label: 'Mix' }));

  // The insert takes a single input, so the three woven layers are summed on a
  // bus first — which is also the honest shape of "woven through the storm":
  // one modulation applied to the weather as a whole, not three in parallel.
  graph = withNode(graph, makeNode(N.bed, 'mixer', { gain: 1 }, {}, { label: 'Storm bus' }));
  graph = withConnection(graph, N.thunder, N.thunderGain);
  for (const source of [N.rain, N.hiss, N.thunderGain]) graph = withConnection(graph, source, N.bed);
  graph = withConnection(graph, N.bed, N.weave);
  graph = withConnection(graph, N.weave, N.mix);
  graph = withConnection(graph, N.wind, N.motion);
  graph = withConnection(graph, N.motion, N.mix);
  graph = withConnection(graph, N.mix, 'output');

  return {
    id: options.id,
    name: options.name,
    durationSec: options.durationSec,
    graph,
    automation: thunderLanes(options.durationSec, options.seed ?? 4068),
    crossfadeSec: 0,
    notes: options.notes,
  };
}

/** One roll of thunder, as the lanes will draw it. */
export interface ThunderRoll {
  atSec: number;
  /** 0..1: how big this roll is. */
  size: number;
  attackSec: number;
  decaySec: number;
  /** Close enough to crack: the filter opens briefly at the onset. */
  close: boolean;
}

/**
 * Where the rolls fall in a session.
 *
 * Gaps of 22 to 70 seconds — long enough that each roll decays fully before the
 * next, irregular enough that nobody can count them. The first comes after a
 * short wait, so the session opens on rain rather than on a bang.
 */
export function thunderRolls(durationSec: number, seed: number): ThunderRoll[] {
  const rolls: ThunderRoll[] = [];
  const random = mulberry32(seed);
  let t = 14 + random() * 12;
  while (t < durationSec - 20) {
    const size = 0.45 + random() * 0.55;
    const close = size > 0.82;
    const attackSec = close ? 0.25 + random() * 0.25 : 0.6 + random() * 0.8;
    const decaySec = 7 + random() * 9;
    rolls.push({ atSec: t, size, attackSec, decaySec, close });
    t += Math.max(attackSec + decaySec + 4, 22 + random() * 48);
  }
  return rolls;
}

function thunderLanes(durationSec: number, seed: number): AutomationLane[] {
  const rolls = thunderRolls(durationSec, seed);
  const level: AutomationPoint[] = [{ timeSec: 0, value: THUNDER_BASE_LEVEL, curve: { kind: 'linear' } }];
  const cutoff: AutomationPoint[] = [{ timeSec: 0, value: THUNDER_BASE_CUTOFF, curve: { kind: 'linear' } }];

  for (const roll of rolls) {
    const peak = THUNDER_BASE_LEVEL + roll.size * 0.9;
    const peakAt = roll.atSec + roll.attackSec;
    const end = peakAt + roll.decaySec;
    level.push(
      { timeSec: roll.atSec, value: THUNDER_BASE_LEVEL, curve: { kind: 'smooth' } },
      { timeSec: peakAt, value: peak, curve: { kind: 'exponential' } },
      { timeSec: end, value: THUNDER_BASE_LEVEL, curve: { kind: 'linear' } },
    );
    if (roll.close) {
      // The crack: the filter flung open for a fraction of a second, then
      // closing back down into the roll.
      cutoff.push(
        { timeSec: roll.atSec, value: THUNDER_BASE_CUTOFF, curve: { kind: 'linear' } },
        { timeSec: roll.atSec + 0.08, value: 2200, curve: { kind: 'exponential' } },
        { timeSec: roll.atSec + 1.2, value: 420, curve: { kind: 'smooth' } },
        { timeSec: Math.min(end, roll.atSec + 5), value: THUNDER_BASE_CUTOFF, curve: { kind: 'linear' } },
      );
    } else {
      cutoff.push(
        { timeSec: roll.atSec, value: THUNDER_BASE_CUTOFF, curve: { kind: 'smooth' } },
        { timeSec: peakAt, value: 380, curve: { kind: 'smooth' } },
        { timeSec: end, value: THUNDER_BASE_CUTOFF, curve: { kind: 'linear' } },
      );
    }
  }
  level.push({ timeSec: durationSec, value: THUNDER_BASE_LEVEL, curve: { kind: 'linear' } });
  cutoff.push({ timeSec: durationSec, value: THUNDER_BASE_CUTOFF, curve: { kind: 'linear' } });

  return [
    { id: 'thunder-level', target: `${STORM_NODES.thunder}:level`, points: level, enabled: true, label: 'Thunder' },
    { id: 'thunder-crack', target: `${STORM_NODES.thunder}:cutoff`, points: cutoff, enabled: true, label: 'Thunder brightness' },
  ];
}

/** A small seeded generator: the same seed is the same storm. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
