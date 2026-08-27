import { clamp } from '../math/util.js';
import { makeSweepLane } from '../protocol/automation.js';
import {
  AM_NODE,
  buildStage,
  createProtocol,
  type StimulationEngine,
} from '../protocol/builders.js';
import { INTENSITY_AMPLITUDE, type Intensity } from '../protocol/recipes.js';
import { validateProtocol } from '../protocol/validate.js';
import type { NoiseColor } from '../dsp/noise.js';
import type { AutomationLane, Protocol, ProtocolIntent, ProtocolStage } from '../protocol/schema.js';
import { NOT_MEDICAL_NOTICE } from '../safety/safety.js';

/**
 * The AI protocol designer.
 *
 * It produces a real, structured `Protocol` — not text describing one (§21) —
 * which the user reviews before saving or running it. The implementation here
 * is deterministic and runs entirely on device, so protocol generation works
 * offline; `ProtocolDesigner` is the seam a server-side model plugs into later
 * without changing anything downstream.
 *
 * Its safety behaviour is not a disclaimer bolted on at the end. A request
 * framed as treatment is declined *as a medical request* and answered with an
 * ordinary comfort-focused session instead, with the reason stated plainly.
 */

export interface DesignRequest {
  prompt: string;
  /** ISO timestamp, injected so results are reproducible in tests. */
  now: string;
  /** Id for the generated protocol. */
  id: string;
  defaultIntensity?: Intensity;
}

export interface ParsedIntent {
  durationSec?: number;
  goal?: ProtocolIntent;
  engine?: StimulationEngine;
  carrierHz?: number;
  beatStartHz?: number;
  beatEndHz?: number;
  bandFrom?: string;
  bandTo?: string;
  noiseColor?: NoiseColor;
  noisePercent?: number;
  amRateHz?: number;
  amFromMinute?: number;
  amToMinute?: number;
  stayAwake?: boolean;
  intensity?: Intensity;
}

export type DesignStatus = 'proposed' | 'declined';

export interface DesignResult {
  status: DesignStatus;
  protocol?: Protocol;
  /** One line per decision, in the order the designer made them. */
  rationale: string[];
  cautions: string[];
  /** What the designer understood, so the user can correct it. */
  understood: ParsedIntent;
  /** Present when a medical framing was declined. */
  declinedReason?: string;
}

export interface ProtocolDesigner {
  design(request: DesignRequest): Promise<DesignResult>;
}

const BANDS: Record<string, { low: number; high: number; centre: number }> = {
  delta: { low: 0.5, high: 4, centre: 2.5 },
  theta: { low: 4, high: 8, centre: 6 },
  alpha: { low: 8, high: 13, centre: 10 },
  beta: { low: 13, high: 30, centre: 15 },
  gamma: { low: 30, high: 60, centre: 40 },
};

/**
 * Phrases that indicate the user is asking for a treatment rather than a
 * session. Matching one does not end the conversation — it changes what the
 * designer offers and why.
 */
const MEDICAL_PATTERNS: Array<{ pattern: RegExp; topic: string }> = [
  { pattern: /\b(cure|cures|curing)\b/i, topic: 'a cure' },
  { pattern: /\b(treat|treatment|therapy for|heal|healing|remedy)\b/i, topic: 'a treatment' },
  { pattern: /\b(cancer|tumou?r|carcinoma|leukemia|leukaemia)\b/i, topic: 'cancer' },
  { pattern: /\b(parasites?|pathogens?|virus(es)?|bacteria|infection)\b/i, topic: 'an infection' },
  { pattern: /\b(depression|bipolar|schizophreni)/i, topic: 'a psychiatric condition' },
  { pattern: /\b(adhd|autism|epilep|seizure)/i, topic: 'a neurological condition' },
  { pattern: /\b(diabetes|arthritis|migraine|tinnitus|chronic pain)\b/i, topic: 'a medical condition' },
  { pattern: /\breplace (my )?(medication|medicine|treatment|doctor)\b/i, topic: 'replacing medical care' },
  { pattern: /\b(kill|destroy|eliminate) (the )?(cells?|virus|bacteria|parasites?)\b/i, topic: 'destroying pathogens' },
];

/** Deterministic, offline protocol designer. */
export class LocalProtocolDesigner implements ProtocolDesigner {
  async design(request: DesignRequest): Promise<DesignResult> {
    return designProtocol(request);
  }
}

export function designProtocol(request: DesignRequest): DesignResult {
  const understood = parseIntent(request.prompt);
  const medical = detectMedicalRequest(request.prompt);

  const rationale: string[] = [];
  const cautions: string[] = [];
  let declinedReason: string | undefined;

  if (medical) {
    declinedReason =
      `You asked for ${medical.topic}. Acoustic frequency protocols are not an established treatment for that, and I will not build one as though they were. ` +
      NOT_MEDICAL_NOTICE +
      ' If a clinician has advised you on this, follow that advice.';
    // Fall through: the user still gets a usable, honestly-labelled session.
    understood.goal = understood.goal ?? 'relax';
    understood.durationSec = understood.durationSec ?? 20 * 60;
    rationale.push(
      'Built an ordinary comfort-focused session instead, with no claim attached to it.',
    );
  }

  const durationSec = understood.durationSec ?? 25 * 60;
  const intensity = understood.intensity ?? request.defaultIntensity ?? 'balanced';
  const engine: StimulationEngine = understood.engine ?? 'binaural';
  const carrierHz = understood.carrierHz ?? defaultCarrier(understood.goal);
  const amplitude = INTENSITY_AMPLITUDE[intensity];

  const { startHz, endHz } = resolveBeats(understood);
  rationale.push(
    `Chose a ${Math.round(durationSec / 60)}-minute session at ${amplitude.toFixed(2)} module amplitude (${intensity}).`,
  );
  rationale.push(
    understood.carrierHz
      ? `Used the ${carrierHz} Hz carrier you asked for.`
      : `Used a ${carrierHz} Hz carrier — low enough to stay comfortable over a long session, high enough for the beat to be clearly perceived.`,
  );
  rationale.push(
    startHz === endHz
      ? `Held the beat at ${formatHzShort(startHz)} Hz throughout.`
      : `Moved the beat from ${formatHzShort(startHz)} Hz to ${formatHzShort(endHz)} Hz across the session.`,
  );

  const noiseColor = understood.noiseColor ?? (understood.goal === 'sleep' ? 'brown' : 'pink');
  const noiseLevel =
    understood.noisePercent !== undefined
      ? clamp(understood.noisePercent / 100, 0, 0.4)
      : understood.goal === 'focus'
        ? 0.08
        : 0.12;
  rationale.push(
    `Added a ${Math.round(noiseLevel * 100)}% ${noiseColor}-noise bed to soften the tone and mask room sounds.`,
  );

  const stages = buildStages({
    durationSec,
    engine,
    carrierHz,
    amplitude,
    startHz,
    endHz,
    noiseColor,
    noiseLevel,
    stayAwake: understood.stayAwake === true,
    amRateHz: understood.amRateHz,
    amFromMinute: understood.amFromMinute,
    amToMinute: understood.amToMinute,
    rationale,
  });

  const protocol = createProtocol({
    id: request.id,
    name: proposeName(understood, medical !== undefined),
    description: describe(understood, startHz, endHz, carrierHz),
    intent: understood.goal ?? 'relax',
    stages,
    master: {
      fadeInSec: 5,
      fadeOutSec: understood.goal === 'sleep' ? 20 : 6,
      gain: 0.5,
    },
    tags: ['ai'],
    generatedBy: 'ai',
    createdAt: request.now,
  });

  if (understood.stayAwake) {
    cautions.push(
      'You asked to stay awake, so the session ends higher than it started rather than descending.',
    );
  }
  if (startHz < 4 || endHz < 4) {
    cautions.push(
      'Part of this session sits in the delta range. Do not run it while you need to stay alert.',
    );
  }
  cautions.push(
    'These choices are conventions and starting points, not established effects. Run it as an experiment and rate it — your own history is the only evidence that applies to you.',
  );

  const validation = validateProtocol(protocol);
  for (const issue of validation.issues) {
    if (issue.severity === 'warning') cautions.push(issue.message);
  }

  if (!validation.ok) {
    return {
      status: 'declined',
      rationale,
      cautions,
      understood,
      declinedReason:
        declinedReason ??
        `I could not build a valid protocol from that: ${validation.issues.find((issue) => issue.severity === 'error')?.message}`,
    };
  }

  return {
    status: 'proposed',
    protocol,
    rationale,
    cautions,
    understood,
    declinedReason,
  };
}

interface StageBuildInput {
  durationSec: number;
  engine: StimulationEngine;
  carrierHz: number;
  amplitude: number;
  startHz: number;
  endHz: number;
  noiseColor: NoiseColor;
  noiseLevel: number;
  stayAwake: boolean;
  amRateHz?: number;
  amFromMinute?: number;
  amToMinute?: number;
  rationale: string[];
}

/**
 * Builds the stage list.
 *
 * When the request names a window for amplitude modulation, the stage
 * boundaries are placed at that window so the AM layer can be faded in and out
 * with real automation lanes rather than approximated.
 */
function buildStages(input: StageBuildInput): ProtocolStage[] {
  const total = input.durationSec;
  const hasAmWindow =
    input.amRateHz !== undefined &&
    input.amFromMinute !== undefined &&
    input.amToMinute !== undefined &&
    input.amToMinute > input.amFromMinute;

  const common = {
    engine: input.engine,
    carrierHz: input.carrierHz,
    amplitude: input.amplitude,
    noise: { color: input.noiseColor, level: input.noiseLevel },
  } as const;

  if (hasAmWindow) {
    const startSec = clamp(input.amFromMinute! * 60, 0, total);
    const endSec = clamp(input.amToMinute! * 60, startSec, total);
    const beatAt = (seconds: number): number =>
      input.startHz + (input.endHz - input.startHz) * (total === 0 ? 0 : seconds / total);

    input.rationale.push(
      `Split the session at ${Math.round(startSec / 60)} and ${Math.round(endSec / 60)} minutes so the ${input.amRateHz} Hz amplitude modulation can fade in and out on its own automation lane.`,
    );

    const stages: ProtocolStage[] = [];
    if (startSec > 30) {
      stages.push(
        buildStage({
          ...common,
          id: 'stage-1',
          name: 'Settle',
          durationSec: startSec,
          beatHz: input.startHz,
          beatToHz: beatAt(startSec),
          crossfadeSec: 0,
        }),
      );
    }

    const modulated = buildStage({
      ...common,
      id: 'stage-modulated',
      name: `${input.amRateHz} Hz Layer`,
      durationSec: endSec - startSec,
      beatHz: beatAt(startSec),
      beatToHz: beatAt(endSec),
      am: { rateHz: input.amRateHz!, depth: 0.25 },
      crossfadeSec: stages.length > 0 ? 4 : 0,
    });
    // Ramp the modulation depth in and out inside the stage rather than
    // switching it on at the boundary, which would be audible as a step.
    const rampSec = Math.min(20, (endSec - startSec) / 4);
    modulated.automation.push(amDepthLane(endSec - startSec, rampSec));
    stages.push(modulated);

    if (total - endSec > 30) {
      stages.push(
        buildStage({
          ...common,
          id: 'stage-3',
          name: 'Return',
          durationSec: total - endSec,
          beatHz: beatAt(endSec),
          beatToHz: input.endHz,
          crossfadeSec: 4,
        }),
      );
    }
    return stages;
  }

  const settleSec = Math.max(120, Math.round(total * 0.25));
  const bodySec = Math.max(120, total - settleSec);
  input.rationale.push(
    `Used two stages — a ${Math.round(settleSec / 60)}-minute settling stage and a ${Math.round(bodySec / 60)}-minute body — with a cross-fade between them.`,
  );

  const midHz = input.startHz + (input.endHz - input.startHz) * 0.6;
  return [
    buildStage({
      ...common,
      id: 'stage-1',
      name: 'Settle',
      durationSec: settleSec,
      beatHz: input.startHz,
      beatToHz: midHz,
      crossfadeSec: 0,
    }),
    buildStage({
      ...common,
      id: 'stage-2',
      name: input.stayAwake ? 'Hold' : 'Body',
      durationSec: bodySec,
      beatHz: midHz,
      beatToHz: input.endHz,
      noiseToLevel: input.noiseLevel * (input.stayAwake ? 0.7 : 1),
      crossfadeSec: 4,
    }),
  ];
}

function amDepthLane(stageDurationSec: number, rampSec: number): AutomationLane {
  return {
    id: 'am-depth',
    target: `${AM_NODE}:depth`,
    enabled: true,
    label: 'AM Depth',
    points: [
      { timeSec: 0, value: 0, curve: { kind: 'smooth' } },
      { timeSec: rampSec, value: 0.25, curve: { kind: 'linear' } },
      { timeSec: Math.max(rampSec, stageDurationSec - rampSec), value: 0.25, curve: { kind: 'smooth' } },
      { timeSec: stageDurationSec, value: 0, curve: { kind: 'linear' } },
    ],
  };
}

export function detectMedicalRequest(prompt: string): { topic: string } | undefined {
  for (const entry of MEDICAL_PATTERNS) {
    if (entry.pattern.test(prompt)) return { topic: entry.topic };
  }
  return undefined;
}

/** Extracts a structured intent from free text. Everything is optional. */
export function parseIntent(prompt: string): ParsedIntent {
  const text = prompt.toLowerCase();
  const intent: ParsedIntent = {};

  const duration = /(\d+)\s*(?:-|\s)?\s*(minute|min|minutes|hour|hours|hr)\b/.exec(text);
  if (duration) {
    const value = Number.parseInt(duration[1], 10);
    intent.durationSec = duration[2].startsWith('h') ? value * 3600 : value * 60;
  }

  if (/\b(sleep|asleep|wind down|bedtime|insomnia|drift off)\b/.test(text)) intent.goal = 'sleep';
  else if (/\b(focus|concentrat|study|work|attention|alert)\b/.test(text)) intent.goal = 'focus';
  else if (/\b(meditat|mindful|breathwork)\b/.test(text)) intent.goal = 'meditate';
  else if (/\b(relax|calm|unwind|stress|anxious|anxiety|rest)\b/.test(text)) intent.goal = 'relax';
  else if (/\b(explor|experiment|test|compare)\b/.test(text)) intent.goal = 'explore';

  if (/\b(stay|remain|keep)\s+(awake|alert|aware)\b/.test(text) || /\bnot fall asleep\b/.test(text)) {
    intent.stayAwake = true;
  }

  if (/\bisochronic\b/.test(text)) intent.engine = 'isochronic';
  else if (/\bmonaural\b/.test(text)) intent.engine = 'monaural';
  else if (/\bbinaural\b/.test(text)) intent.engine = 'binaural';
  else if (/\b(speaker|out loud|no headphones|without headphones)\b/.test(text)) {
    intent.engine = 'isochronic';
  }

  const carrier = /(\d+(?:\.\d+)?)\s*(?:-|\s)?hz\s*carrier|carrier\s*(?:of|at|:)?\s*(\d+(?:\.\d+)?)\s*hz/.exec(text);
  if (carrier) {
    intent.carrierHz = Number.parseFloat(carrier[1] ?? carrier[2]);
  }

  const bandRange = /\b(delta|theta|alpha|beta|gamma)\s*(?:-|\s)?(?:to|→|->)\s*(?:-|\s)?(delta|theta|alpha|beta|gamma)\b/.exec(text);
  if (bandRange) {
    intent.bandFrom = bandRange[1];
    intent.bandTo = bandRange[2];
  } else {
    const band = /\b(delta|theta|alpha|beta|gamma)\b/.exec(text);
    if (band) intent.bandFrom = band[1];
  }

  const beatRange = /(\d+(?:\.\d+)?)\s*(?:hz)?\s*(?:to|→|->)\s*(\d+(?:\.\d+)?)\s*hz\b/.exec(text);
  if (beatRange) {
    intent.beatStartHz = Number.parseFloat(beatRange[1]);
    intent.beatEndHz = Number.parseFloat(beatRange[2]);
  }

  const amWindow =
    /(\d+(?:\.\d+)?)\s*(?:-|\s)?hz\s*(?:amplitude modulation|am)\b[^.]*?between\s*minutes?\s*(\d+)\s*(?:and|-|to)\s*(\d+)/.exec(
      text,
    );
  if (amWindow) {
    intent.amRateHz = Number.parseFloat(amWindow[1]);
    intent.amFromMinute = Number.parseInt(amWindow[2], 10);
    intent.amToMinute = Number.parseInt(amWindow[3], 10);
  } else {
    const am = /(\d+(?:\.\d+)?)\s*(?:-|\s)?hz\s*(?:amplitude modulation|am)\b/.exec(text);
    if (am) intent.amRateHz = Number.parseFloat(am[1]);
  }

  const noise = /\b(pink|white|brown)\s*noise\b/.exec(text);
  if (noise) intent.noiseColor = noise[1] as NoiseColor;
  const noisePercent = /(\d+(?:\.\d+)?)\s*%\s*(?:pink|white|brown)?\s*noise|noise\s*(?:at|of|:)?\s*(\d+(?:\.\d+)?)\s*%/.exec(text);
  if (noisePercent) {
    intent.noisePercent = Number.parseFloat(noisePercent[1] ?? noisePercent[2]);
  }
  if (/\bno noise\b|\bwithout noise\b/.test(text)) intent.noisePercent = 0;

  if (/\b(gentle|soft|quiet|subtle)\b/.test(text)) intent.intensity = 'gentle';
  else if (/\b(strong|intense|deep|pronounced)\b/.test(text)) intent.intensity = 'strong';

  return intent;
}

function resolveBeats(intent: ParsedIntent): { startHz: number; endHz: number } {
  if (intent.beatStartHz !== undefined && intent.beatEndHz !== undefined) {
    return {
      startHz: clamp(intent.beatStartHz, 0.5, 60),
      endHz: clamp(intent.beatEndHz, 0.5, 60),
    };
  }
  if (intent.bandFrom && intent.bandTo) {
    return {
      startHz: BANDS[intent.bandFrom]?.centre ?? 10,
      endHz: BANDS[intent.bandTo]?.centre ?? 6,
    };
  }
  if (intent.bandFrom) {
    const band = BANDS[intent.bandFrom];
    if (band) {
      // Enter a band from its upper edge and settle to its centre: arriving at
      // a target rather than starting there tends to feel less abrupt.
      return { startHz: band.high, endHz: band.centre };
    }
  }
  switch (intent.goal) {
    case 'sleep':
      return { startHz: 8, endHz: 2.5 };
    case 'focus':
      return { startHz: 12, endHz: intent.stayAwake ? 14 : 13 };
    case 'meditate':
      return { startHz: 10, endHz: 6 };
    case 'explore':
      return { startHz: 10, endHz: 10 };
    default:
      return { startHz: 10, endHz: intent.stayAwake ? 9 : 8 };
  }
}

function defaultCarrier(goal?: ProtocolIntent): number {
  switch (goal) {
    case 'sleep':
      return 180;
    case 'focus':
      return 240;
    case 'meditate':
      return 200;
    default:
      return 220;
  }
}

function proposeName(intent: ParsedIntent, medical: boolean): string {
  if (medical) return 'General Relaxation';
  if (intent.stayAwake) return 'Calm / Alert';
  switch (intent.goal) {
    case 'sleep':
      return 'Wind Down';
    case 'focus':
      return 'Focus';
    case 'meditate':
      return 'Meditation';
    case 'explore':
      return 'Exploration';
    default:
      return 'Relaxation';
  }
}

function describe(intent: ParsedIntent, startHz: number, endHz: number, carrierHz: number): string {
  const movement =
    startHz === endHz
      ? `a steady ${formatHzShort(startHz)} Hz beat`
      : `a beat moving from ${formatHzShort(startHz)} Hz to ${formatHzShort(endHz)} Hz`;
  const am = intent.amRateHz ? `, with a ${intent.amRateHz} Hz amplitude-modulation layer` : '';
  return `Generated from your request: ${movement} on a ${carrierHz} Hz carrier${am}.`;
}

function formatHzShort(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
