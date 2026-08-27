import { buildStage, createProtocol } from './builders.js';
import { protocolFromSimple } from './recipes.js';
import type { Protocol } from './schema.js';

/**
 * Demonstration protocols shipped with the app.
 *
 * Conservative by design, named after what they sound like rather than what
 * they might do, and never after a condition (§68). Each one is a real protocol
 * object — the same kind the builder produces — so any of them can be opened,
 * inspected, forked and edited.
 */

const PRESET_DATE = '2026-01-01T00:00:00.000Z';

function preset(protocol: Protocol, id: string, name: string, description: string): Protocol {
  return {
    ...protocol,
    id,
    name,
    description,
    meta: { ...protocol.meta, generatedBy: 'preset', createdAt: PRESET_DATE, updatedAt: PRESET_DATE },
  };
}

export function buildPresets(): Protocol[] {
  const calm = preset(
    protocolFromSimple({ goal: 'relax', durationSec: 25 * 60, intensity: 'balanced', createdAt: PRESET_DATE }),
    'preset-calm',
    'Calm',
    'Twenty-five minutes in the alpha range, easing towards the alpha–theta border and back.',
  );

  const focus = preset(
    protocolFromSimple({ goal: 'focus', durationSec: 30 * 60, intensity: 'balanced', createdAt: PRESET_DATE }),
    'preset-focus',
    'Focus',
    'Low-beta stimulation with a 40 Hz amplitude-modulation layer over a 240 Hz carrier.',
  );

  const meditation = preset(
    protocolFromSimple({ goal: 'meditate', durationSec: 30 * 60, intensity: 'gentle', createdAt: PRESET_DATE }),
    'preset-meditation',
    'Meditation',
    'A slow descent from alpha into theta, held at 6 Hz, with a brown-noise bed.',
  );

  const windDown = preset(
    protocolFromSimple({ goal: 'sleep', durationSec: 45 * 60, intensity: 'gentle', createdAt: PRESET_DATE }),
    'preset-wind-down',
    'Wind Down',
    'Forty-five minutes descending towards the delta range, fading to silence over the last half minute.',
  );

  const alphaExplore = createProtocol({
    id: 'preset-alpha-explore',
    name: 'Alpha Explore',
    description: 'A steady 10 Hz binaural beat on a 220 Hz carrier. A clean reference point.',
    intent: 'explore',
    createdAt: PRESET_DATE,
    generatedBy: 'preset',
    tags: ['reference', 'alpha'],
    master: { fadeInSec: 4, fadeOutSec: 5 },
    stages: [
      buildStage({
        id: 'stage-1',
        name: 'Alpha',
        durationSec: 20 * 60,
        engine: 'binaural',
        carrierHz: 220,
        beatHz: 10,
        amplitude: 0.36,
        noise: { color: 'pink', level: 0.1 },
        crossfadeSec: 0,
      }),
    ],
  });

  const thetaExplore = createProtocol({
    id: 'preset-theta-explore',
    name: 'Theta Explore',
    description: 'A steady 6 Hz binaural beat on a 200 Hz carrier.',
    intent: 'explore',
    createdAt: PRESET_DATE,
    generatedBy: 'preset',
    tags: ['reference', 'theta'],
    master: { fadeInSec: 4, fadeOutSec: 6 },
    stages: [
      buildStage({
        id: 'stage-1',
        name: 'Theta',
        durationSec: 20 * 60,
        engine: 'binaural',
        carrierHz: 200,
        beatHz: 6,
        amplitude: 0.34,
        noise: { color: 'brown', level: 0.1 },
        crossfadeSec: 0,
      }),
    ],
  });

  const gammaExplore = createProtocol({
    id: 'preset-40hz-explore',
    name: '40 Hz Explore',
    description:
      'A 40 Hz isochronic modulation of a 440 Hz carrier — the configuration used to evoke a 40 Hz steady-state response. Educational, not therapeutic.',
    intent: 'explore',
    createdAt: PRESET_DATE,
    generatedBy: 'preset',
    tags: ['reference', 'gamma', '40hz'],
    master: { fadeInSec: 4, fadeOutSec: 5 },
    stages: [
      buildStage({
        id: 'stage-1',
        name: '40 Hz',
        durationSec: 15 * 60,
        engine: 'isochronic',
        carrierHz: 440,
        beatHz: 40,
        amplitude: 0.3,
        isochronic: { duty: 0.5, depth: 0.9, attack: 0.2, release: 0.3, envelope: 'softSquare' },
        noise: { color: 'pink', level: 0.06 },
        crossfadeSec: 0,
      }),
    ],
  });

  const sweepDemo = createProtocol({
    id: 'preset-sweep-demo',
    name: 'Frequency Sweep Demo',
    description:
      'Three continuous sweeps in a row, so you can hear what smooth, click-free parameter movement sounds like.',
    intent: 'explore',
    createdAt: PRESET_DATE,
    generatedBy: 'preset',
    tags: ['demo', 'sweep'],
    master: { fadeInSec: 3, fadeOutSec: 4 },
    stages: [
      buildStage({
        id: 'stage-1',
        name: 'Descend',
        durationSec: 5 * 60,
        engine: 'binaural',
        carrierHz: 220,
        beatHz: 12,
        beatToHz: 6,
        amplitude: 0.34,
        noise: { color: 'pink', level: 0.1 },
        sweepCurve: { kind: 'smooth' },
        crossfadeSec: 0,
      }),
      buildStage({
        id: 'stage-2',
        name: 'Carrier Drift',
        durationSec: 4 * 60,
        engine: 'binaural',
        carrierHz: 220,
        carrierToHz: 160,
        beatHz: 6,
        amplitude: 0.34,
        noise: { color: 'pink', level: 0.1 },
        noiseToLevel: 0.18,
        sweepCurve: { kind: 'exponential' },
        crossfadeSec: 4,
      }),
      buildStage({
        id: 'stage-3',
        name: 'Return',
        durationSec: 4 * 60,
        engine: 'binaural',
        carrierHz: 160,
        carrierToHz: 220,
        beatHz: 6,
        beatToHz: 11,
        amplitude: 0.34,
        noise: { color: 'pink', level: 0.18 },
        noiseToLevel: 0.06,
        sweepCurve: { kind: 'smooth' },
        crossfadeSec: 4,
      }),
    ],
  });

  return [calm, focus, meditation, windDown, alphaExplore, thetaExplore, gammaExplore, sweepDemo];
}

export const PRESET_IDS = [
  'preset-calm',
  'preset-focus',
  'preset-meditation',
  'preset-wind-down',
  'preset-alpha-explore',
  'preset-theta-explore',
  'preset-40hz-explore',
  'preset-sweep-demo',
] as const;
