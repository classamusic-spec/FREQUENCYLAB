import type { NoiseColor } from '../dsp/noise.js';
import { clamp } from '../math/util.js';
import { buildStage, createProtocol, type StimulationEngine } from './builders.js';
import type { Protocol, ProtocolIntent, ProtocolStage } from './schema.js';

/**
 * Recipes are the thin layer between a friendly control set and a full
 * protocol. They exist so Simple Mode and Explorer never touch the DSP
 * directly — they describe intent, and the same builder every other surface
 * uses turns that into stages, graphs and automation lanes.
 */

export type Intensity = 'gentle' | 'balanced' | 'strong';

/** Tone amplitude per intensity. Deliberately conservative (§28). */
export const INTENSITY_AMPLITUDE: Record<Intensity, number> = {
  gentle: 0.26,
  balanced: 0.36,
  strong: 0.46,
};

export interface ExplorerRecipe {
  engine: StimulationEngine;
  beatHz: number;
  carrierHz: number;
  /** 0..1 — maps onto the tone module's amplitude. */
  intensity: number;
  noiseColor: NoiseColor;
  noiseLevel: number;
  motionRateHz: number;
  motionDepth: number;
  durationSec: number;
  binauralMode?: 'offset' | 'centered';
}

export const DEFAULT_EXPLORER_RECIPE: ExplorerRecipe = {
  engine: 'binaural',
  beatHz: 10,
  carrierHz: 220,
  intensity: 0.45,
  noiseColor: 'pink',
  noiseLevel: 0.1,
  motionRateHz: 0.5,
  motionDepth: 0,
  durationSec: 20 * 60,
  binauralMode: 'offset',
};

/** A single-stage protocol that mirrors exactly what Explorer's controls show. */
export function protocolFromExplorer(
  recipe: ExplorerRecipe,
  options: { id: string; name?: string; createdAt?: string } = { id: 'explorer-session' },
): Protocol {
  const amplitude = 0.2 + clamp(recipe.intensity, 0, 1) * 0.3;
  const stage = buildStage({
    id: 'stage-1',
    name: 'Explore',
    durationSec: recipe.durationSec,
    engine: recipe.engine,
    carrierHz: recipe.carrierHz,
    beatHz: recipe.beatHz,
    amplitude,
    binauralMode: recipe.binauralMode ?? 'offset',
    noise: recipe.noiseLevel > 0 ? { color: recipe.noiseColor, level: recipe.noiseLevel } : undefined,
    motion:
      recipe.motionDepth > 0 ? { rateHz: recipe.motionRateHz, depth: recipe.motionDepth } : undefined,
    crossfadeSec: 2,
  });

  return createProtocol({
    id: options.id,
    name: options.name ?? 'Explorer Session',
    intent: 'explore',
    description: 'Built from the Explorer controls.',
    stages: [stage],
    createdAt: options.createdAt,
    generatedBy: 'user',
  });
}

export type SimpleGoal = 'relax' | 'focus' | 'meditate' | 'sleep' | 'explore';

export interface SimpleRequest {
  goal: SimpleGoal;
  durationSec: number;
  intensity: Intensity;
  id?: string;
  createdAt?: string;
}

interface GoalProfile {
  label: string;
  intent: ProtocolIntent;
  description: string;
  engine: StimulationEngine;
  carrierHz: number;
  /** Beat at the very start, at the plateau, and at the end. */
  beat: { start: number; plateau: number; end: number };
  carrierEndHz?: number;
  noise: { color: NoiseColor; level: number };
  am?: { rateHz: number; depth: number };
  motion?: { rateHz: number; depth: number };
  /** Sleep protocols fade away rather than returning to an alert range. */
  returnStage: boolean;
  fadeOutSec: number;
}

/**
 * Goal profiles.
 *
 * These are conservative starting points chosen for comfort, not claims about
 * what a frequency does. The product's position is that the user finds out what
 * works for them by running experiments (§16) — a profile is a first guess.
 */
export const GOAL_PROFILES: Record<SimpleGoal, GoalProfile> = {
  relax: {
    label: 'Relax',
    intent: 'relax',
    description: 'Alpha-range stimulation easing towards the alpha–theta border.',
    engine: 'binaural',
    carrierHz: 220,
    beat: { start: 10, plateau: 8, end: 10 },
    noise: { color: 'pink', level: 0.12 },
    returnStage: true,
    fadeOutSec: 6,
  },
  focus: {
    label: 'Focus',
    intent: 'focus',
    description: 'Low-beta stimulation with a 40 Hz amplitude modulation layer.',
    engine: 'binaural',
    carrierHz: 240,
    beat: { start: 12, plateau: 14, end: 12 },
    noise: { color: 'pink', level: 0.08 },
    am: { rateHz: 40, depth: 0.22 },
    returnStage: true,
    fadeOutSec: 5,
  },
  meditate: {
    label: 'Meditate',
    intent: 'meditate',
    description: 'A slow alpha-to-theta descent held at 6 Hz.',
    engine: 'binaural',
    carrierHz: 200,
    beat: { start: 10, plateau: 6, end: 8 },
    carrierEndHz: 180,
    noise: { color: 'brown', level: 0.1 },
    returnStage: true,
    fadeOutSec: 8,
  },
  sleep: {
    label: 'Wind Down',
    intent: 'sleep',
    description: 'A long descent from alpha into the delta range, fading to silence.',
    engine: 'binaural',
    carrierHz: 180,
    beat: { start: 8, plateau: 3, end: 2 },
    carrierEndHz: 150,
    noise: { color: 'brown', level: 0.14 },
    returnStage: false,
    fadeOutSec: 25,
  },
  explore: {
    label: 'Explore',
    intent: 'explore',
    description: 'A steady 10 Hz reference session — a neutral baseline to compare against.',
    engine: 'binaural',
    carrierHz: 220,
    beat: { start: 10, plateau: 10, end: 10 },
    noise: { color: 'pink', level: 0.1 },
    returnStage: false,
    fadeOutSec: 5,
  },
};

/**
 * Builds a three-stage (or two-stage) protocol for a goal and duration.
 *
 * Proportions: 20% settle, 60% plateau, 20% return, with floors so a short
 * session still has a real settling period rather than a token one.
 */
export function protocolFromSimple(request: SimpleRequest): Protocol {
  const profile = GOAL_PROFILES[request.goal];
  const total = Math.max(5 * 60, Math.round(request.durationSec));
  const amplitude = INTENSITY_AMPLITUDE[request.intensity];
  const noiseLevel = clamp(
    profile.noise.level * (request.intensity === 'gentle' ? 1.15 : request.intensity === 'strong' ? 0.85 : 1),
    0,
    0.4,
  );

  const settleSec = Math.max(120, Math.round(total * 0.2));
  const returnSec = profile.returnStage ? Math.max(90, Math.round(total * 0.2)) : 0;
  const plateauSec = Math.max(120, total - settleSec - returnSec);

  const common = {
    engine: profile.engine,
    amplitude,
    noise: { color: profile.noise.color, level: noiseLevel },
    am: profile.am,
    motion: profile.motion,
  } as const;

  const stages: ProtocolStage[] = [
    buildStage({
      ...common,
      id: 'stage-settle',
      name: 'Settle',
      durationSec: settleSec,
      carrierHz: profile.carrierHz,
      beatHz: profile.beat.start,
      beatToHz: profile.beat.plateau,
      crossfadeSec: 0,
      notes: 'Eases from the starting beat down to the plateau.',
    }),
    buildStage({
      ...common,
      id: 'stage-plateau',
      name: profile.returnStage ? 'Hold' : 'Descent',
      durationSec: plateauSec,
      carrierHz: profile.carrierHz,
      carrierToHz: profile.carrierEndHz,
      beatHz: profile.beat.plateau,
      beatToHz: profile.returnStage ? undefined : profile.beat.end,
      crossfadeSec: 4,
    }),
  ];

  if (profile.returnStage) {
    stages.push(
      buildStage({
        ...common,
        id: 'stage-return',
        name: 'Return',
        durationSec: returnSec,
        carrierHz: profile.carrierEndHz ?? profile.carrierHz,
        carrierToHz: profile.carrierHz,
        beatHz: profile.beat.plateau,
        beatToHz: profile.beat.end,
        noiseToLevel: noiseLevel * 0.5,
        crossfadeSec: 4,
        notes: 'Brings the beat back up before the session ends.',
      }),
    );
  }

  return createProtocol({
    id: request.id ?? `simple-${request.goal}-${total}`,
    name: profile.label,
    description: profile.description,
    intent: profile.intent,
    stages,
    master: { fadeInSec: 5, fadeOutSec: profile.fadeOutSec },
    tags: [request.goal, request.intensity],
    generatedBy: 'preset',
    createdAt: request.createdAt,
  });
}
