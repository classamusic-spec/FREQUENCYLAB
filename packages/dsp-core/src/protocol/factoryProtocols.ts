import { buildStage, createProtocol } from './builders.js';
import { buildPresets } from './presets.js';
import type { Protocol } from './schema.js';

/**
 * Three multi-stage protocols, shipped alongside the eight in `presets.ts`.
 *
 * These are longer and more deliberately shaped than the demonstrations there:
 * each one is a descent, a hold and a return, written stage by stage rather
 * than generated from a goal profile. They are named after the shape of the
 * signal, never after a condition (§68), and they claim nothing — a protocol is
 * a configuration somebody may find worth listening to, and the way to find out
 * whether it does anything for you is an experiment with a control arm, not a
 * name.
 *
 * ## Why every stage goes through `buildStage`
 *
 * Stage cross-fades adopt the incoming graph's oscillator phases from the
 * outgoing one, matched by node id and kind. `buildStage` is what guarantees
 * the ids are the same ones every other surface uses, so a hand-assembled
 * routing graph here would be a graph that steps at the stage boundary instead
 * of fading — the defect `sessionRenderer` measured at between +3.00 dB and
 * -19.37 dB across a fade before phase adoption existed.
 *
 * ## Carriers that move between stages
 *
 * Deep Calm steps its carrier down at two stage boundaries rather than gliding
 * it inside a stage. The cross-fade is what makes that safe: for its duration
 * both graphs render, so the old carrier recedes while the new one arrives, and
 * the renderer's correlation correction holds the level flat through the
 * overlap. What is heard is a soft change of pitch, not a step.
 */

/** Fixed creation date, matching `presets.ts`, so exports are reproducible. */
const FACTORY_DATE = '2026-01-01T00:00:00.000Z';

/**
 * Tone levels.
 *
 * All three sit at or below `INTENSITY_AMPLITUDE.balanced` (0.36), and the two
 * long descents sit under it: a thirty-minute session is not the place to run
 * the loudest configuration the instrument allows (§28).
 */
const CALM_AMPLITUDE = 0.32;
const FOCUS_AMPLITUDE = 0.36;

/**
 * Cross-fade between stages, in seconds.
 *
 * Long enough that a carrier or beat change lands as a transition rather than
 * an event, short enough that the two graphs are not both audible for a
 * conspicuous stretch of a five-minute stage.
 */
const STAGE_CROSSFADE_SEC = 8;

function deepCalm(): Protocol {
  return createProtocol({
    id: 'preset-deep-calm',
    name: 'Deep Calm',
    description:
      'Thirty minutes descending from 10 Hz to 6 Hz over a carrier that drops with it, held at 6 Hz under a pink bed, then easing back up as the session fades.',
    intent: 'relax',
    createdAt: FACTORY_DATE,
    generatedBy: 'preset',
    tags: ['multi-stage', 'alpha', 'theta', 'descent'],
    master: { fadeInSec: 6, fadeOutSec: 20 },
    stages: [
      buildStage({
        id: 'stage-settle',
        name: 'Settle',
        durationSec: 5 * 60,
        engine: 'binaural',
        carrierHz: 220,
        beatHz: 10,
        beatToHz: 8,
        amplitude: CALM_AMPLITUDE,
        // No bed here on purpose: the first five minutes are the plainest
        // signal in the session, so the beat is what you meet first.
        crossfadeSec: 0,
        notes: 'A 10 Hz beat on a 220 Hz carrier, easing to 8 Hz. No noise bed.',
      }),
      buildStage({
        id: 'stage-descend',
        name: 'Descend',
        durationSec: 10 * 60,
        engine: 'binaural',
        carrierHz: 200,
        beatHz: 8,
        beatToHz: 6,
        amplitude: CALM_AMPLITUDE,
        noise: { color: 'pink', level: 0.08 },
        crossfadeSec: STAGE_CROSSFADE_SEC,
        notes: 'The carrier drops to 200 Hz and the beat crosses from alpha into theta.',
      }),
      buildStage({
        id: 'stage-hold',
        name: 'Hold',
        durationSec: 10 * 60,
        engine: 'binaural',
        carrierHz: 180,
        beatHz: 6,
        amplitude: CALM_AMPLITUDE,
        noise: { color: 'pink', level: 0.12 },
        crossfadeSec: STAGE_CROSSFADE_SEC,
        notes: 'Ten minutes steady at 6 Hz on a 180 Hz carrier, with the bed a little further forward.',
      }),
      buildStage({
        id: 'stage-return',
        name: 'Return',
        durationSec: 5 * 60,
        engine: 'binaural',
        carrierHz: 180,
        beatHz: 6,
        beatToHz: 10,
        amplitude: CALM_AMPLITUDE,
        noise: { color: 'pink', level: 0.12 },
        // The bed recedes with the beat, so the session thins out rather than
        // ending on a bed that is suddenly the loudest thing in it.
        noiseToLevel: 0.05,
        crossfadeSec: STAGE_CROSSFADE_SEC,
        notes: 'Back up to 10 Hz as the bed thins and the master fade takes the last twenty seconds.',
      }),
    ],
  });
}

function alphaFocus(): Protocol {
  return createProtocol({
    id: 'preset-alpha-focus',
    name: 'Alpha Focus',
    description:
      'Thirty minutes on a 220 Hz carrier: five to arrive at 10 Hz, twenty steady there, five drifting up towards low beta.',
    intent: 'focus',
    createdAt: FACTORY_DATE,
    generatedBy: 'preset',
    tags: ['multi-stage', 'alpha', 'work'],
    master: { fadeInSec: 4, fadeOutSec: 6 },
    stages: [
      buildStage({
        id: 'stage-arrive',
        name: 'Arrive',
        durationSec: 5 * 60,
        engine: 'binaural',
        carrierHz: 220,
        beatHz: 8,
        beatToHz: 10,
        amplitude: FOCUS_AMPLITUDE,
        noise: { color: 'pink', level: 0.08 },
        crossfadeSec: 0,
        notes: 'From the alpha–theta border up to 10 Hz.',
      }),
      buildStage({
        id: 'stage-hold',
        name: 'Hold',
        durationSec: 20 * 60,
        engine: 'binaural',
        carrierHz: 220,
        beatHz: 10,
        amplitude: FOCUS_AMPLITUDE,
        noise: { color: 'pink', level: 0.08 },
        crossfadeSec: STAGE_CROSSFADE_SEC,
        notes: 'Twenty minutes steady at 10 Hz — long enough for a work block.',
      }),
      buildStage({
        id: 'stage-lift',
        name: 'Lift',
        durationSec: 5 * 60,
        engine: 'binaural',
        carrierHz: 220,
        beatHz: 10,
        beatToHz: 12,
        amplitude: FOCUS_AMPLITUDE,
        noise: { color: 'pink', level: 0.08 },
        crossfadeSec: STAGE_CROSSFADE_SEC,
        notes: 'Up to 12 Hz at the alpha–beta boundary, so the session does not end mid-hold.',
      }),
    ],
  });
}

function thetaDescent(): Protocol {
  return createProtocol({
    id: 'preset-theta-descent',
    name: 'Theta Descent',
    description:
      'Thirty minutes on a steady 200 Hz carrier under brown noise, stepping 10 Hz down to 5 Hz in three stages and returning to 8 Hz at the end.',
    intent: 'meditate',
    createdAt: FACTORY_DATE,
    generatedBy: 'preset',
    tags: ['multi-stage', 'theta', 'descent'],
    master: { fadeInSec: 5, fadeOutSec: 8 },
    stages: [
      buildStage({
        id: 'stage-settle',
        name: 'Settle',
        durationSec: 5 * 60,
        engine: 'binaural',
        carrierHz: 200,
        beatHz: 10,
        beatToHz: 8,
        amplitude: CALM_AMPLITUDE,
        noise: { color: 'brown', level: 0.1 },
        crossfadeSec: 0,
        notes: '10 Hz down to 8 Hz.',
      }),
      buildStage({
        id: 'stage-cross',
        name: 'Cross',
        durationSec: 10 * 60,
        engine: 'binaural',
        carrierHz: 200,
        beatHz: 8,
        beatToHz: 6,
        amplitude: CALM_AMPLITUDE,
        noise: { color: 'brown', level: 0.1 },
        crossfadeSec: STAGE_CROSSFADE_SEC,
        notes: 'Across the alpha–theta boundary, 8 Hz to 6 Hz.',
      }),
      buildStage({
        id: 'stage-deepen',
        name: 'Deepen',
        durationSec: 10 * 60,
        engine: 'binaural',
        carrierHz: 200,
        beatHz: 6,
        beatToHz: 5,
        amplitude: CALM_AMPLITUDE,
        noise: { color: 'brown', level: 0.1 },
        crossfadeSec: STAGE_CROSSFADE_SEC,
        notes: '6 Hz to 5 Hz, the slowest part of the session.',
      }),
      buildStage({
        id: 'stage-return',
        name: 'Return',
        durationSec: 5 * 60,
        engine: 'binaural',
        carrierHz: 200,
        beatHz: 5,
        beatToHz: 8,
        amplitude: CALM_AMPLITUDE,
        noise: { color: 'brown', level: 0.1 },
        crossfadeSec: STAGE_CROSSFADE_SEC,
        notes: 'Back to 8 Hz, so the session ends somewhere nearer waking than it spent its middle.',
      }),
    ],
  });
}

/** The three protocols, in the order the browser renders them. */
export function buildFactoryProtocols(): Protocol[] {
  return [deepCalm(), alphaFocus(), thetaDescent()];
}

export const FACTORY_PROTOCOL_IDS = [
  'preset-deep-calm',
  'preset-alpha-focus',
  'preset-theta-descent',
] as const;

/**
 * Every shipped protocol: the eight demonstrations and these three.
 *
 * A single accessor so a screen listing "the protocols that come with the app"
 * has one list to read rather than two that can fall out of step.
 */
export function buildAllFactoryProtocols(): Protocol[] {
  return [...buildPresets(), ...buildFactoryProtocols()];
}
