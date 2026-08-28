import type { CurveKind } from '../math/curves.js';
import type { NoiseColor } from '../dsp/noise.js';
import type { Waveform } from '../dsp/oscillator.js';
import { buildStage, createProtocol, type StimulationEngine } from './builders.js';
import { protocolFingerprint } from './dna.js';
import { base32Encode, sha256Bytes, utf8Encode } from './sha256.js';
import { DEFAULT_MASTER, type Protocol, type ProtocolStage } from './schema.js';

/**
 * Share codes.
 *
 * A protocol's full DNA document is a complete, lossless serialisation — and
 * for a three-stage protocol it runs to about five thousand characters, which
 * is fine for a file and useless for a person. Nobody pastes that into a
 * message.
 *
 * A share code is the same protocol written the way somebody would say it out
 * loud:
 *
 *     FL1 C220 NP12 | 5m B10 | 15m B10-6 | 5m B6-10 #A7K3
 *
 * Fifty characters instead of five thousand, and readable on the way past: a
 * 220 Hz carrier with pink noise at 12%, then three stages — five minutes at a
 * 10 Hz beat, fifteen sweeping 10 Hz down to 6, five coming back up.
 *
 * **What makes this safe rather than merely short.** The code is not a
 * summary; it is the protocol's own construction arguments, so rebuilding from
 * it runs the same builder with the same numbers. And because the canonical
 * form deliberately excludes id, name and timestamps, a rebuilt protocol has
 * the *same fingerprint* as the original — so the four-character check at the
 * end is a real verification that you got the same sound, not just a typo
 * guard.
 *
 * **What it deliberately cannot do.** Lab Mode can build arbitrary routing
 * graphs, and those have no short form. `encodeShareCode` returns `null` for
 * them rather than emitting something lossy, and the app falls back to sharing
 * the full DNA document as a file. A share code that quietly dropped a module
 * would be worse than no share code at all.
 */

export const SHARE_CODE_PREFIX = 'FL';
export const SHARE_CODE_VERSION = 1;

/** The construction arguments for one stage, recovered from its graph. */
export interface ShareStage {
  durationSec: number;
  engine: StimulationEngine;
  carrierHz: number;
  beatHz: number;
  amplitude: number;
  crossfadeSec: number;
  waveform: Waveform;
  beatToHz?: number;
  carrierToHz?: number;
  noise?: { color: NoiseColor; level: number };
  noiseToLevel?: number;
  am?: { rateHz: number; depth: number };
  motion?: { rateHz: number; depth: number };
  /** Isochronic envelope shaping, when the stage tunes it away from default. */
  isochronic?: { duty: number; depth: number; attack: number; release: number };
  /** Shape of this stage's sweeps. Omitted when it is the default `smooth`. */
  sweepCurve?: CurveKind;
}

export interface ShareShape {
  masterGain: number;
  fadeInSec: number;
  fadeOutSec: number;
  stages: ShareStage[];
}

const NOISE_LETTER: Record<NoiseColor, string> = { white: 'W', pink: 'P', brown: 'B' };
const NOISE_FROM_LETTER: Record<string, NoiseColor> = { W: 'white', P: 'pink', B: 'brown' };
const ENGINE_LETTER: Record<StimulationEngine, string> = {
  binaural: 'B',
  monaural: 'M',
  isochronic: 'I',
};
const ENGINE_FROM_LETTER: Record<string, StimulationEngine> = {
  B: 'binaural',
  M: 'monaural',
  I: 'isochronic',
};
const WAVE_LETTER: Record<string, string> = { sine: 'S', triangle: 'T', square: 'Q', saw: 'W' };
const WAVE_FROM_LETTER: Record<string, Waveform> = {
  S: 'sine',
  T: 'triangle',
  Q: 'square',
  W: 'saw',
};

const CURVE_LETTER: Partial<Record<CurveKind, string>> = {
  smooth: 'S',
  linear: 'L',
  exponential: 'E',
  logarithmic: 'G',
  stepped: 'T',
};
const CURVE_FROM_LETTER: Record<string, CurveKind> = {
  S: 'smooth',
  L: 'linear',
  E: 'exponential',
  G: 'logarithmic',
  T: 'stepped',
};

const DEFAULT_AMPLITUDE = 0.5;
const DEFAULT_CROSSFADE_SEC = 3;
/** The isochronic envelope `buildStandardGraph` applies when none is given. */
const DEFAULT_ISO = { duty: 0.5, depth: 1, attack: 0.15, release: 0.25 } as const;

/**
 * Reads a stage's graph back into the arguments that would build it.
 *
 * Deliberately permissive: it recovers the values it recognises and does not
 * try to prove the stage is standard by enumerating every default. That check
 * belongs to `encodeShareCode`, which rebuilds from the extracted arguments and
 * compares fingerprints — a test the builder itself defines, so it stays
 * correct when the builder gains a parameter.
 */
export function readStandardStage(stage: ProtocolStage): ShareStage | null {
  const { nodes } = stage.graph;
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const tone = byId.get('tone');
  if (!tone) return null;

  const engine = (
    { binaural: 'binaural', monaural: 'monaural', isochronic: 'isochronic' } as const
  )[tone.kind as StimulationEngine];
  if (!engine) return null;

  const am = byId.get('am');
  const noise = byId.get('noise');
  const motion = byId.get('motion');

  const waveformOption = tone.options.waveform ?? 'sine';
  if (!WAVE_LETTER[waveformOption]) return null;

  const beatKey = engine === 'isochronic' ? 'pulse' : 'beat';
  const shape: ShareStage = {
    durationSec: stage.durationSec,
    crossfadeSec: stage.crossfadeSec,
    engine,
    carrierHz: tone.params.carrier ?? 0,
    beatHz: tone.params[beatKey] ?? 0,
    amplitude: tone.params.amplitude ?? DEFAULT_AMPLITUDE,
    waveform: waveformOption as Waveform,
  };

  if (noise) {
    const color = noise.options.color as NoiseColor | undefined;
    if (!color || !NOISE_LETTER[color]) return null;
    shape.noise = { color, level: noise.params.level ?? 0 };
  }
  if (am) shape.am = { rateHz: am.params.modFrequency ?? 0, depth: am.params.depth ?? 0 };
  if (motion) shape.motion = { rateHz: motion.params.rate ?? 0, depth: motion.params.depth ?? 0 };
  if (engine === 'isochronic') {
    const iso = {
      duty: tone.params.duty ?? DEFAULT_ISO.duty,
      depth: tone.params.depth ?? DEFAULT_ISO.depth,
      attack: tone.params.attack ?? DEFAULT_ISO.attack,
      release: tone.params.release ?? DEFAULT_ISO.release,
    };
    const isDefault =
      near(iso.duty, DEFAULT_ISO.duty) &&
      near(iso.depth, DEFAULT_ISO.depth) &&
      near(iso.attack, DEFAULT_ISO.attack) &&
      near(iso.release, DEFAULT_ISO.release);
    if (!isDefault) shape.isochronic = iso;
  }

  // Automation: only the three two-point sweeps `buildStage` itself creates.
  for (const lane of stage.automation) {
    if (lane.points.length !== 2) return null;
    const [from, to] = lane.points;
    if (lane.target === `tone:${beatKey}`) shape.beatToHz = to.value;
    else if (lane.target === 'tone:carrier') shape.carrierToHz = to.value;
    else if (lane.target === 'noise:level') shape.noiseToLevel = to.value;
    else return null;

    // `buildStage` gives every sweep in a stage the same curve, so reading it
    // off the first point of any of them is enough.
    const kind = from.curve.kind;
    if (kind !== 'smooth') {
      if (!CURVE_LETTER[kind]) return null;
      shape.sweepCurve = kind;
    }
  }

  return shape;
}

/** Reads a whole protocol back into share-code form, or `null` if it cannot. */
export function readShareShape(protocol: Protocol): ShareShape | null {
  if (protocol.stages.length === 0) return null;
  const master = protocol.master;
  // The limiter is not optional in a shareable code: a protocol that ships
  // with it off must not arrive somewhere else looking ordinary.
  if (master.limiter !== true || master.limiterCeilingDb !== DEFAULT_MASTER.limiterCeilingDb) {
    return null;
  }

  const stages: ShareStage[] = [];
  for (const stage of protocol.stages) {
    const shape = readStandardStage(stage);
    if (!shape) return null;
    stages.push(shape);
  }
  return {
    masterGain: master.gain,
    fadeInSec: master.fadeInSec,
    fadeOutSec: master.fadeOutSec,
    stages,
  };
}

/**
 * The four-character verification suffix.
 *
 * Derived from the protocol's own fingerprint, so it confirms the rebuilt
 * protocol renders the same audio — not merely that the text survived
 * transcription.
 */
export function shareCheck(protocol: Protocol): string {
  return base32Encode(sha256Bytes(utf8Encode(protocolFingerprint(protocol))), 4).slice(0, 4);
}

/**
 * Writes a protocol as a share code, or returns `null` when it has no short
 * form — an arbitrary Lab routing graph, or a master chain the code cannot
 * express. Callers fall back to the full DNA document.
 */
export function encodeShareCode(protocol: Protocol): string | null {
  const shape = readShareShape(protocol);
  if (!shape) return null;

  const first = shape.stages[0];
  const globals: string[] = [];
  if (first.engine !== 'binaural') globals.push(`E${ENGINE_LETTER[first.engine]}`);
  globals.push(`C${num(first.carrierHz)}`);
  if (first.waveform !== 'sine') globals.push(`W${WAVE_LETTER[first.waveform]}`);
  if (first.noise) globals.push(`N${NOISE_LETTER[first.noise.color]}${pct(first.noise.level)}`);
  if (first.am) globals.push(`A${num(first.am.rateHz)}@${pct(first.am.depth)}`);
  if (first.motion) globals.push(`S${num(first.motion.rateHz)}@${pct(first.motion.depth)}`);
  if (first.isochronic) globals.push(isoToken(first.isochronic));
  if (!near(first.amplitude, DEFAULT_AMPLITUDE)) globals.push(`V${pct(first.amplitude)}`);
  if (!near(shape.masterGain, DEFAULT_MASTER.gain)) globals.push(`G${pct(shape.masterGain)}`);
  if (!near(shape.fadeInSec, DEFAULT_MASTER.fadeInSec)) globals.push(`FI${num(shape.fadeInSec)}`);
  if (!near(shape.fadeOutSec, DEFAULT_MASTER.fadeOutSec)) globals.push(`FO${num(shape.fadeOutSec)}`);

  const segments = shape.stages.map((stage, index) => {
    const tokens: string[] = [duration(stage.durationSec)];
    tokens.push(`B${range(stage.beatHz, stage.beatToHz)}`);

    // Only what differs from the first stage is repeated.
    if (index > 0) {
      if (stage.engine !== first.engine) tokens.push(`E${ENGINE_LETTER[stage.engine]}`);
      if (stage.waveform !== first.waveform) tokens.push(`W${WAVE_LETTER[stage.waveform]}`);
      if (!near(stage.amplitude, first.amplitude)) tokens.push(`V${pct(stage.amplitude)}`);
      if (!sameNoise(stage.noise, first.noise)) {
        tokens.push(stage.noise ? `N${NOISE_LETTER[stage.noise.color]}${pct(stage.noise.level)}` : 'N0');
      }
      if (!sameMod(stage.am, first.am)) {
        tokens.push(stage.am ? `A${num(stage.am.rateHz)}@${pct(stage.am.depth)}` : 'A0');
      }
      if (!sameMod(stage.motion, first.motion)) {
        tokens.push(stage.motion ? `S${num(stage.motion.rateHz)}@${pct(stage.motion.depth)}` : 'S0');
      }
      if (!sameIso(stage.isochronic, first.isochronic)) {
        tokens.push(stage.isochronic ? isoToken(stage.isochronic) : 'I0');
      }
    }

    if (stage.carrierToHz !== undefined || !near(stage.carrierHz, first.carrierHz)) {
      tokens.push(`C${range(stage.carrierHz, stage.carrierToHz)}`);
    }
    if (stage.sweepCurve) tokens.push(`K${CURVE_LETTER[stage.sweepCurve]}`);
    if (stage.noiseToLevel !== undefined && stage.noise) {
      tokens.push(`NL${pct(stage.noise.level)}-${pct(stage.noiseToLevel)}`);
    }
    // The first stage cross-fades from silence, so its default is zero; the
    // rest default to the builder's three seconds.
    const defaultCrossfade = index === 0 ? 0 : DEFAULT_CROSSFADE_SEC;
    if (!near(stage.crossfadeSec, defaultCrossfade)) tokens.push(`X${num(stage.crossfadeSec)}`);
    return tokens.join(' ');
  });

  const body = [globals.join(' '), ...segments].join(' | ');
  const code = `${SHARE_CODE_PREFIX}${SHARE_CODE_VERSION} ${body} #${shareCheck(protocol)}`;

  /*
   * The encoder proves itself before handing anything out: it parses the code
   * it just wrote and checks the rebuilt protocol against the original's
   * fingerprint. If they differ, this protocol has something the notation
   * cannot carry, and returning `null` sends the caller to the full DNA
   * document instead.
   *
   * This is the whole safety argument for share codes. Enumerating every
   * default the builder applies would work until the builder gained one more;
   * a round trip is defined by the builder itself and cannot drift from it.
   */
  const rebuilt = parseShareCode(code);
  if (!rebuilt.ok || protocolFingerprint(rebuilt.protocol) !== protocolFingerprint(protocol)) {
    return null;
  }
  return code;
}

export type ShareCodeResult =
  | {
      ok: true;
      protocol: Protocol;
      /** True when the rebuilt protocol matches the check the code carries. */
      verified: boolean;
      /** Present when the code carried no check to compare against. */
      unchecked?: boolean;
    }
  | { ok: false; error: string };

/**
 * Rebuilds a protocol from a share code.
 *
 * Tolerant about presentation — case, extra spaces, a missing `FL1` header, a
 * `·` used instead of `|` — and strict about meaning: an unrecognised token is
 * an error rather than something silently skipped, because ignoring a token
 * would hand back a protocol that is not the one that was shared.
 */
export function parseShareCode(
  text: string,
  options: { id?: string; name?: string } = {},
): ShareCodeResult {
  let body = text.trim().replace(/[·•]/g, '|').replace(/\s+/g, ' ');
  if (body.length === 0) return { ok: false, error: 'Enter a share code.' };

  let expectedCheck: string | undefined;
  const checkMatch = /#([A-Za-z0-9]{4})\s*$/.exec(body);
  if (checkMatch) {
    expectedCheck = checkMatch[1].toUpperCase();
    body = body.slice(0, checkMatch.index).trim();
  }

  const header = /^FL(\d+)\b/i.exec(body);
  if (header) {
    if (Number(header[1]) > SHARE_CODE_VERSION) {
      return {
        ok: false,
        error: `This code is version ${header[1]}; this app reads up to ${SHARE_CODE_VERSION}. Update the app to open it.`,
      };
    }
    body = body.slice(header[0].length).trim();
  }

  const segments = body.split('|').map((segment) => segment.trim());
  if (segments.length < 2) {
    return { ok: false, error: 'A share code needs at least one stage, written after a “|”.' };
  }

  const globals: TokenBag = { carrierHz: 220, engine: 'binaural', waveform: 'sine', amplitude: DEFAULT_AMPLITUDE };
  let masterGain = DEFAULT_MASTER.gain;
  let fadeInSec = DEFAULT_MASTER.fadeInSec;
  let fadeOutSec = DEFAULT_MASTER.fadeOutSec;

  for (const token of segments[0].split(' ').filter(Boolean)) {
    const fade = /^F([IO])(\d+(?:\.\d+)?)$/i.exec(token);
    if (fade) {
      if (fade[1].toUpperCase() === 'I') fadeInSec = Number(fade[2]);
      else fadeOutSec = Number(fade[2]);
      continue;
    }
    if (/^G\d/i.test(token)) {
      const value = pctValue(token.slice(1));
      if (value === null) return { ok: false, error: `“${token}” is not a volume percentage.` };
      masterGain = value;
      continue;
    }
    const applied = applyToken(token, globals);
    if (applied) return { ok: false, error: applied };
  }

  const stages: ProtocolStage[] = [];
  for (let index = 0; index < segments.length - 1; index++) {
    const segment = segments[index + 1];
    const bag: TokenBag = {
      ...globals,
      noise: globals.noise,
      am: globals.am,
      motion: globals.motion,
      isochronic: globals.isochronic,
      sweepCurve: globals.sweepCurve,
    };
    let durationSec: number | undefined;

    for (const token of segment.split(' ').filter(Boolean)) {
      const time = /^(\d+(?:\.\d+)?)(m|s)$/i.exec(token);
      if (time) {
        durationSec = Number(time[1]) * (time[2].toLowerCase() === 'm' ? 60 : 1);
        continue;
      }
      const applied = applyToken(token, bag);
      if (applied) return { ok: false, error: applied };
    }

    if (durationSec === undefined) {
      return { ok: false, error: `Stage ${index + 1} has no length — add for example “10m”.` };
    }
    if (!(durationSec > 0)) {
      return { ok: false, error: `Stage ${index + 1} has a length of zero.` };
    }
    if (bag.beatHz === undefined) {
      return { ok: false, error: `Stage ${index + 1} has no beat — add for example “B10”.` };
    }

    stages.push(
      buildStage({
        id: `stage-${index + 1}`,
        name: `Stage ${index + 1}`,
        durationSec,
        crossfadeSec: bag.crossfadeSec ?? (index === 0 ? 0 : DEFAULT_CROSSFADE_SEC),
        engine: bag.engine,
        carrierHz: bag.carrierHz,
        beatHz: bag.beatHz,
        amplitude: bag.amplitude,
        waveform: bag.waveform,
        beatToHz: bag.beatToHz,
        carrierToHz: bag.carrierToHz,
        noise: bag.noise,
        noiseToLevel: bag.noiseToLevel,
        am: bag.am,
        motion: bag.motion,
        isochronic: bag.isochronic,
        sweepCurve: bag.sweepCurve ? { kind: bag.sweepCurve } : undefined,
      }),
    );
  }

  const protocol = createProtocol({
    id: options.id ?? `shared-${Date.now().toString(36)}`,
    name: options.name ?? 'Shared protocol',
    intent: 'explore',
    stages,
    master: { ...DEFAULT_MASTER, gain: masterGain, fadeInSec, fadeOutSec },
    generatedBy: 'user',
  });

  if (!expectedCheck) return { ok: true, protocol, verified: false, unchecked: true };
  return { ok: true, protocol, verified: shareCheck(protocol) === expectedCheck };
}

interface TokenBag {
  engine: StimulationEngine;
  carrierHz: number;
  waveform: Waveform;
  amplitude: number;
  beatHz?: number;
  beatToHz?: number;
  carrierToHz?: number;
  crossfadeSec?: number;
  noise?: { color: NoiseColor; level: number };
  noiseToLevel?: number;
  am?: { rateHz: number; depth: number };
  motion?: { rateHz: number; depth: number };
  isochronic?: { duty: number; depth: number; attack: number; release: number };
  sweepCurve?: CurveKind;
}

/** Applies one token to a bag. Returns an error message, or undefined. */
function applyToken(token: string, bag: TokenBag): string | undefined {
  const upper = token.toUpperCase();

  if (/^E[BMI]$/.test(upper)) {
    bag.engine = ENGINE_FROM_LETTER[upper[1]];
    return undefined;
  }
  if (/^W[STQW]$/.test(upper)) {
    bag.waveform = WAVE_FROM_LETTER[upper[1]];
    return undefined;
  }
  if (/^K[SLEGT]$/.test(upper)) {
    bag.sweepCurve = CURVE_FROM_LETTER[upper[1]];
    return undefined;
  }
  if (upper === 'N0') {
    bag.noise = undefined;
    bag.noiseToLevel = undefined;
    return undefined;
  }
  if (upper === 'A0') {
    bag.am = undefined;
    return undefined;
  }
  if (upper === 'S0') {
    bag.motion = undefined;
    return undefined;
  }
  if (upper === 'I0') {
    bag.isochronic = undefined;
    return undefined;
  }

  const iso = /^I(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(upper);
  if (iso) {
    bag.isochronic = {
      duty: Number(iso[1]) / 100,
      depth: Number(iso[2]) / 100,
      attack: Number(iso[3]) / 100,
      release: Number(iso[4]) / 100,
    };
    return undefined;
  }

  const noiseSweep = /^NL(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(upper);
  if (noiseSweep) {
    if (!bag.noise) return `“${token}” sweeps noise, but no noise is set for this stage.`;
    bag.noise = { ...bag.noise, level: Number(noiseSweep[1]) / 100 };
    bag.noiseToLevel = Number(noiseSweep[2]) / 100;
    return undefined;
  }

  const noise = /^N([WPB])(\d+(?:\.\d+)?)$/.exec(upper);
  if (noise) {
    bag.noise = { color: NOISE_FROM_LETTER[noise[1]], level: Number(noise[2]) / 100 };
    return undefined;
  }

  const mod = /^([AS])(\d+(?:\.\d+)?)@(\d+(?:\.\d+)?)$/.exec(upper);
  if (mod) {
    const value = { rateHz: Number(mod[2]), depth: Number(mod[3]) / 100 };
    if (mod[1] === 'A') bag.am = value;
    else bag.motion = value;
    return undefined;
  }

  const sweep = /^([BC])(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(upper);
  if (sweep) {
    const from = Number(sweep[2]);
    const to = Number(sweep[3]);
    if (sweep[1] === 'B') {
      bag.beatHz = from;
      bag.beatToHz = to;
    } else {
      bag.carrierHz = from;
      bag.carrierToHz = to;
    }
    return undefined;
  }

  const scalar = /^([BCVX])(\d+(?:\.\d+)?)$/.exec(upper);
  if (scalar) {
    const value = Number(scalar[2]);
    if (scalar[1] === 'B') {
      bag.beatHz = value;
      bag.beatToHz = undefined;
    } else if (scalar[1] === 'C') {
      bag.carrierHz = value;
      bag.carrierToHz = undefined;
    } else if (scalar[1] === 'V') {
      bag.amplitude = value / 100;
    } else {
      bag.crossfadeSec = value;
    }
    return undefined;
  }

  return `“${token}” is not something a share code can contain.`;
}

/** A one-line, plain-English reading of a share code, for the import preview. */
export function describeShareCode(protocol: Protocol): string {
  const shape = readShareShape(protocol);
  if (!shape) return 'A custom protocol.';
  const minutes = Math.round(shape.stages.reduce((sum, stage) => sum + stage.durationSec, 0) / 60);
  const beats = shape.stages.map((stage) =>
    stage.beatToHz !== undefined
      ? `${num(stage.beatHz)}→${num(stage.beatToHz)} Hz`
      : `${num(stage.beatHz)} Hz`,
  );
  const noise = shape.stages[0].noise;
  const parts = [
    `${minutes} min`,
    `${shape.stages.length} stage${shape.stages.length === 1 ? '' : 's'}`,
    `${num(shape.stages[0].carrierHz)} Hz carrier`,
    beats.join(', then '),
  ];
  if (noise) parts.push(`${noise.color} noise at ${pct(noise.level)}%`);
  return parts.join(' · ');
}

function sameConnections(
  actual: ReadonlyArray<{ from: string; to: string }>,
  expected: ReadonlyArray<{ from: string; to: string }>,
): boolean {
  if (actual.length !== expected.length) return false;
  const key = (c: { from: string; to: string }) => `${c.from}>${c.to}`;
  const left = [...actual].map(key).sort();
  const right = [...expected].map(key).sort();
  return left.every((value, index) => value === right[index]);
}

function sameNoise(a: ShareStage['noise'], b: ShareStage['noise']): boolean {
  if (!a || !b) return !a && !b;
  return a.color === b.color && near(a.level, b.level);
}

function isoToken(iso: { duty: number; depth: number; attack: number; release: number }): string {
  return `I${pct(iso.duty)}/${pct(iso.depth)}/${pct(iso.attack)}/${pct(iso.release)}`;
}

function sameIso(a: ShareStage['isochronic'], b: ShareStage['isochronic']): boolean {
  if (!a || !b) return !a && !b;
  return (
    near(a.duty, b.duty) &&
    near(a.depth, b.depth) &&
    near(a.attack, b.attack) &&
    near(a.release, b.release)
  );
}

function sameMod(a: { rateHz: number; depth: number } | undefined, b: typeof a): boolean {
  if (!a || !b) return !a && !b;
  return near(a.rateHz, b.rateHz) && near(a.depth, b.depth);
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

/** Minutes where the value divides evenly, seconds otherwise. */
function duration(sec: number): string {
  return sec % 60 === 0 ? `${sec / 60}m` : `${num(sec)}s`;
}

function range(from: number, to: number | undefined): string {
  return to === undefined ? num(from) : `${num(from)}-${num(to)}`;
}

/*
 * Both writers keep six decimal places of the underlying value, matching the
 * precision the canonical form rounds to. Anything coarser silently moves a
 * parameter — a noise level of 0.0575 written as "5.7%" comes back as 0.057 —
 * and the encoder's own round-trip check would then refuse to issue a code at
 * all. Trailing zeros are trimmed, so ordinary values still read as "220" and
 * "12" rather than "220.000000".
 */
function num(value: number): string {
  return trimZeros((Math.round(value * 1e6) / 1e6).toFixed(6));
}

function pct(value: number): string {
  return trimZeros((Math.round(value * 1e8) / 1e6).toFixed(6));
}

function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

function pctValue(text: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  return Number(text) / 100;
}
