import type { Experiment, ExperimentArm, MetricKey } from '../domain/models.js';
import { binauralFrequencies } from '../graph/nodes/generators.js';
import type { GraphNode } from '../graph/types.js';
import { noteToFrequency } from '../music/theory.js';
import { buildStage, createProtocol } from '../protocol/builders.js';
import type { Protocol, ProtocolStage } from '../protocol/schema.js';
import { createExperiment } from './experiments.js';

/**
 * Factory A/B templates for the experiment engine.
 *
 * `experiments.ts` already does the hard part — block randomisation, the
 * commitment scheme, blinding, and an analysis that refuses to draw a
 * conclusion from four sessions. What it cannot supply is the thing that
 * decides whether a comparison means anything at all: **two conditions that
 * differ in one respect and are equal in every other**. That is what a template
 * is.
 *
 * ## The defect this exists to prevent
 *
 * An A/B whose arms differ in three ways fails silently. Both arms play, both
 * get rated, the schedule verifies, and the analysis prints a p-value exactly
 * as it would for a clean comparison — there is nothing on the screen to say
 * that the number is answering a different question from the one that was
 * asked. The commonest instance in this subject is the tuning argument: "432 vs
 * 440" is almost always run as a 432 Hz sine against a 440 Hz sine, which
 * compares two pitches a third of a semitone apart and says nothing whatever
 * about tuning a piece of music. A tuning reference is the frequency every
 * other note is derived from; changing it moves the whole figure by the same
 * interval and leaves the music otherwise untouched, and that is what the
 * template here does.
 *
 * ## Held constant, as data
 *
 * `heldConstant` and `varies` are not prose. Their `keys` name real dimensions
 * of the compiled protocols, `compareConditions` derives the same dimensions
 * from the built arms, and `templateIssues` refuses a template whose
 * declaration and protocols disagree — so a future edit that changes an arm's
 * noise level without updating the declaration fails the build instead of
 * shipping a comparison that quietly measures two things at once.
 *
 * ## Why the vocabulary is acoustic rather than structural
 *
 * The dimensions describe what reaches the ears — the tone in each ear, the
 * beat between them, the level, the bed — and deliberately not which node kind
 * produced it. A binaural pair at zero beat and a centred single tone are the
 * same signal sample for sample, and a comparison that called them different
 * conditions because their modules have different names would be reporting on
 * the source tree rather than on the sound.
 */

/**
 * Fixed creation date for the arm protocols, matching `protocol/presets.ts`.
 *
 * Timestamps are excluded from the canonical form, so this cannot move a
 * fingerprint; it is here so an exported template is byte-identical between
 * two devices that generated it on different days.
 */
const TEMPLATE_DATE = '2026-01-01T00:00:00.000Z';

/**
 * Levels for the arm protocols.
 *
 * Both sit at or below `INTENSITY_AMPLITUDE.balanced`, and they are constants
 * rather than per-template literals because the one thing an experiment cannot
 * afford is two arms built from two copies of a number that later drift apart.
 */
const TONE_AMPLITUDE = 0.3;
const BEAT_AMPLITUDE = 0.32;

/** One parameter of the listening condition that every arm shares. */
export interface MatchedParameter {
  /**
   * Dimensions of the compiled protocol this claim is about, in the vocabulary
   * `conditionParameters` produces. Checked against the built arms rather than
   * believed.
   */
  keys: readonly string[];
  label: string;
  /** The shared value, written the way the UI will print it. */
  value: string;
}

/** One parameter that is deliberately different, arm by arm. */
export interface ContrastedParameter {
  keys: readonly string[];
  label: string;
  /** What each arm gets. `control` is present only for a three-arm template. */
  values: { A: string; B: string; control?: string };
  /** The size of the difference, where it has a natural measure. */
  difference?: string;
}

export interface TemplateArm {
  arm: ExperimentArm;
  /**
   * What this arm is, for the template browser and the results screen.
   *
   * Never shown on the session screen while the experiment is blind — that is
   * also why the arm protocols are named "condition one" and "condition two"
   * rather than after the thing under test. A blinded session that loads a
   * protocol called "A432" has already told the listener which arm they are in.
   */
  condition: string;
  protocol: Protocol;
}

export interface ExperimentTemplate {
  id: string;
  name: string;
  /** The question this comparison can actually answer, in the user's words. */
  question: string;
  summary: string;
  metrics: MetricKey[];
  /** Sessions per arm the template suggests. The user may change it. */
  sessionsPerArm: number;
  arms: TemplateArm[];
  heldConstant: MatchedParameter[];
  varies: ContrastedParameter[];
  /**
   * Why the comparison may still mislead. Never empty: every one of these
   * designs has a limit, and a template that listed none would be claiming a
   * cleanliness no personal experiment has.
   */
  caveats: string[];
  /** Ids of `library/` and `archive/` records carrying the context. Links, not copies. */
  libraryEntryIds: string[];
  archiveEntryIds: string[];
  version: number;
  factory: true;
}

/* ── The condition vocabulary ─────────────────────────────────────────────── */

export type ConditionValue = string | number;

/**
 * Every audible dimension of a protocol, keyed `stage<n>.<dimension>` for
 * stage-local values and by the dimension alone for whole-protocol ones.
 *
 * Only what is audible appears. A pan at centre and a binaural separation at
 * full are omitted because the per-ear frequencies already say everything they
 * would add; they appear the moment they leave those neutral settings, because
 * then the per-ear description is no longer complete.
 */
export function conditionParameters(protocol: Protocol): Map<string, ConditionValue> {
  const map = new Map<string, ConditionValue>();
  map.set('master.gain', protocol.master.gain);
  map.set('master.fadeInSec', protocol.master.fadeInSec);
  map.set('master.fadeOutSec', protocol.master.fadeOutSec);
  map.set('master.limiterCeilingDb', protocol.master.limiterCeilingDb);
  map.set('structure.stages', protocol.stages.length);
  map.set('structure.sampleRate', protocol.sampleRate);

  protocol.stages.forEach((stage, index) => {
    for (const [dimension, value] of stageDimensions(stage)) {
      map.set(`stage${index}.${dimension}`, value);
    }
  });
  return map;
}

function stageDimensions(stage: ProtocolStage): Map<string, ConditionValue> {
  const map = new Map<string, ConditionValue>();
  map.set('stage.durationSec', stage.durationSec);
  map.set('stage.crossfadeSec', stage.crossfadeSec);

  const byKind = (kind: GraphNode['kind']): GraphNode | undefined =>
    stage.graph.nodes.find((node) => node.kind === kind);

  const tone =
    byKind('binaural') ??
    byKind('monaural') ??
    byKind('isochronic') ??
    byKind('fm') ??
    byKind('harmonic') ??
    byKind('oscillator');
  if (tone) for (const [key, value] of toneDimensions(tone)) map.set(key, value);

  const noise = byKind('noise');
  if (noise) {
    map.set('noise.color', noise.options.color);
    map.set('noise.level', noise.params.level);
    map.set('noise.width', noise.params.width);
    map.set('noise.cutoff', noise.params.cutoff);
    if (noise.params.modDepth > 0) {
      map.set('noise.modDepth', noise.params.modDepth);
      map.set('noise.modRate', noise.params.modRate);
    }
  }

  // The AM module in the standard chain is always an insert on whatever the
  // chain's source is, so its own carrier parameter is unused and is not part
  // of what anybody hears.
  const am = byKind('am');
  if (am && am.params.depth > 0) {
    map.set('am.rateHz', am.params.modFrequency);
    map.set('am.depth', am.params.depth);
    map.set('am.shape', am.options.envelope);
  }

  const motion = byKind('stereoMotion');
  if (motion && motion.params.depth > 0) {
    map.set('motion.rateHz', motion.params.rate);
    map.set('motion.depth', motion.params.depth);
  }

  for (const lane of stage.automation) {
    if (!lane.enabled) continue;
    map.set(
      `automation.${lane.target}`,
      lane.points.map((point) => `${point.timeSec}@${point.value}:${point.curve.kind}`).join(' '),
    );
  }
  return map;
}

/**
 * What the tone module puts in each ear.
 *
 * `leftHz` and `rightHz` are the two tones the ears actually receive, which is
 * why a plain oscillator and a binaural engine describe themselves in the same
 * words. The engines whose two tones are summed before the output rather than
 * separated — monaural — say so with different keys, because "left" and
 * "right" would be a description of a signal that does not exist.
 */
function toneDimensions(node: GraphNode): Map<string, ConditionValue> {
  const map = new Map<string, ConditionValue>();
  map.set('tone.amplitude', node.params.amplitude);
  if (node.options.waveform !== undefined) map.set('tone.waveform', node.options.waveform);
  if (node.params.pan !== undefined && node.params.pan !== 0) map.set('tone.pan', node.params.pan);

  switch (node.kind) {
    case 'binaural': {
      // The same helper the engine renders from, rather than a second copy of
      // the offset/centred arithmetic that could come to disagree with it.
      const { left, right } = binauralFrequencies(
        node.params.carrier,
        node.params.beat,
        node.options.mode,
      );
      map.set('tone.leftHz', left);
      map.set('tone.rightHz', right);
      map.set('tone.beatHz', node.params.beat);
      if (node.params.separation !== 1) map.set('tone.separation', node.params.separation);
      break;
    }
    case 'monaural':
      map.set('tone.lowerHz', node.params.carrier);
      map.set('tone.upperHz', node.params.carrier + node.params.beat);
      map.set('tone.beatHz', node.params.beat);
      map.set('tone.mix', node.params.mix);
      break;
    case 'isochronic':
      map.set('tone.leftHz', node.params.carrier);
      map.set('tone.rightHz', node.params.carrier);
      map.set('tone.pulseHz', node.params.pulse);
      map.set('tone.duty', node.params.duty);
      map.set('tone.depth', node.params.depth);
      map.set('tone.attack', node.params.attack);
      map.set('tone.release', node.params.release);
      map.set('tone.envelope', node.options.envelope);
      break;
    case 'fm':
      map.set('tone.leftHz', node.params.carrier);
      map.set('tone.rightHz', node.params.carrier);
      map.set('tone.fmRateHz', node.params.modFrequency);
      map.set('tone.deviationHz', node.params.deviation);
      map.set('tone.depth', node.params.depth);
      break;
    case 'harmonic':
      map.set('tone.leftHz', node.params.fundamental);
      map.set('tone.rightHz', node.params.fundamental);
      map.set('tone.beatHz', 0);
      map.set(
        'tone.partials',
        Array.from({ length: 8 }, (_, index) => node.params[`h${index + 1}`]).join(','),
      );
      break;
    default:
      map.set('tone.leftHz', node.params.frequency);
      map.set('tone.rightHz', node.params.frequency);
      map.set('tone.beatHz', 0);
      break;
  }
  return map;
}

export interface ConditionComparison {
  /** Dimensions present in both protocols with the same values throughout. */
  same: string[];
  /** Dimensions that differ, including one present in only one of the two. */
  different: string[];
}

/**
 * What actually differs between two conditions, dimension by dimension.
 *
 * Stage indices are stripped, so a five-stage figure whose pitches all move is
 * one differing dimension rather than five — the arms differ in their tuning,
 * not in five unrelated ways.
 */
export function compareConditions(a: Protocol, b: Protocol): ConditionComparison {
  const left = byDimension(a);
  const right = byDimension(b);
  const same: string[] = [];
  const different: string[] = [];
  for (const dimension of new Set([...left.keys(), ...right.keys()])) {
    (equalSeries(left.get(dimension), right.get(dimension)) ? same : different).push(dimension);
  }
  return { same: same.sort(), different: different.sort() };
}

function byDimension(protocol: Protocol): Map<string, ConditionValue[]> {
  const map = new Map<string, ConditionValue[]>();
  for (const [key, value] of conditionParameters(protocol)) {
    const dimension = key.replace(/^stage\d+\./, '');
    const series = map.get(dimension);
    if (series) series.push(value);
    else map.set(dimension, [value]);
  }
  return map;
}

function equalSeries(a: ConditionValue[] | undefined, b: ConditionValue[] | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Why a template cannot be trusted, or an empty array when it can.
 *
 * The declaration is checked against the built protocols in both directions: a
 * dimension that differs without being declared is an uncontrolled variable, and
 * a dimension declared as varying that turns out identical is an experiment
 * that is not testing what it says it tests. Both are fatal to the comparison
 * and neither is visible from the results screen, which is why they are caught
 * here rather than left to be noticed.
 */
export function templateIssues(template: ExperimentTemplate): string[] {
  const issues: string[] = [];
  const armA = template.arms.find((entry) => entry.arm === 'A');
  const armB = template.arms.find((entry) => entry.arm === 'B');
  if (!armA || !armB) {
    issues.push('A template needs an A arm and a B arm to compare.');
    return issues;
  }

  const comparison = compareConditions(armA.protocol, armB.protocol);
  const differs = new Set(comparison.different);
  const matches = new Set(comparison.same);
  const declaredVaried = new Set(template.varies.flatMap((entry) => entry.keys));
  const declaredConstant = new Set(template.heldConstant.flatMap((entry) => entry.keys));

  for (const dimension of comparison.different) {
    if (!declaredVaried.has(dimension)) {
      issues.push(`${dimension} differs between the arms and is not declared as varying.`);
    }
  }
  for (const dimension of declaredVaried) {
    if (!differs.has(dimension)) {
      issues.push(`${dimension} is declared as varying but is identical in both arms.`);
    }
  }
  for (const dimension of declaredConstant) {
    if (differs.has(dimension)) {
      issues.push(`${dimension} is declared as held constant but differs between the arms.`);
    } else if (!matches.has(dimension)) {
      issues.push(`${dimension} is declared as held constant but neither arm has it.`);
    }
  }
  if (template.caveats.length === 0) {
    issues.push('Every comparison has limits; this template states none.');
  }
  return issues;
}

/* ── Instantiation ────────────────────────────────────────────────────────── */

export interface InstantiateTemplateOptions {
  /** Id for the new experiment. */
  id: string;
  /** Commitment salt. Supplied by the caller so tests are deterministic. */
  salt: string;
  createdAt: string;
  /** Overrides the template's suggested sessions per arm. */
  sessionsPerArm?: number;
  /** Blinded unless explicitly disabled, matching `createExperiment`. */
  blinded?: boolean;
}

export interface TemplateInstance {
  experiment: Experiment;
  /** The arm protocols, to be saved alongside the experiment. */
  protocols: Protocol[];
  template: ExperimentTemplate;
}

/**
 * Turns a template into a running experiment plus the protocols its arms name.
 *
 * The control slot is filled only by a template that defines a third arm. None
 * of the factory four do, and the reason is worth recording: `analyseExperiment`
 * compares A against B and only summarises `control`, so a control condition
 * placed in that slot would never be tested against anything. Where a control
 * is the comparison — as in `control-condition` below — it has to *be* arm B.
 */
export function instantiateTemplate(
  template: ExperimentTemplate,
  options: InstantiateTemplateOptions,
): TemplateInstance {
  const protocolFor = (arm: ExperimentArm): string | undefined =>
    template.arms.find((entry) => entry.arm === arm)?.protocol.id;
  const protocolA = protocolFor('A');
  const protocolB = protocolFor('B');
  if (!protocolA || !protocolB) {
    throw new Error(`Template ${template.id} does not define both an A arm and a B arm.`);
  }

  const experiment = createExperiment({
    id: options.id,
    name: template.name,
    hypothesis: template.question,
    protocolA,
    protocolB,
    protocolControl: protocolFor('control'),
    metrics: template.metrics,
    sessionsPerArm: options.sessionsPerArm ?? template.sessionsPerArm,
    blinded: options.blinded,
    salt: options.salt,
    createdAt: options.createdAt,
  });

  return { experiment, protocols: template.arms.map((arm) => arm.protocol), template };
}

/* ── The arm protocols ────────────────────────────────────────────────────── */

/**
 * The figure both tuning arms play, and the honest limit of this comparison.
 *
 * Five sustained notes over twenty minutes. This is as close to "the same
 * composition at two tuning references" as the engine can currently get: the
 * standard chain has one tone module, so there is no polyphony, no rhythm and
 * no arrangement — one note sounds at a time and the notes cross-fade into one
 * another. What it does capture is the part the comparison depends on: a fixed
 * sequence of pitches derived from a reference, with a fixed spectrum over each
 * of them, so moving the reference moves every note by the same interval and
 * changes nothing else. `caveats` says this in the user's words rather than
 * leaving it to be discovered.
 */
const TUNING_FIGURE = ['A2', 'E3', 'C3', 'D3', 'A2'] as const;
const TUNING_NOTE_SEC = 240;
const TUNING_CROSSFADE_SEC = 12;
const TUNING_NOISE_LEVEL = 0.06;

function tuningArmProtocol(referenceHz: number, id: string, name: string): Protocol {
  const stages = TUNING_FIGURE.map((note, index) => {
    const fundamental = noteToFrequency(note, { referenceHz });
    // `noteToFrequency` returns null only for an unparseable note or a
    // non-positive reference, and both are literals here. The throw is for the
    // future edit that mistypes a note: a silent null would compile to a 0 Hz
    // stage that validates as a warning and plays as nothing.
    if (fundamental === null) throw new Error(`"${note}" is not a note this module can build.`);
    return buildStage({
      id: `stage-${index + 1}`,
      name: note,
      durationSec: TUNING_NOTE_SEC,
      engine: 'harmonic',
      carrierHz: fundamental,
      beatHz: 0,
      amplitude: TONE_AMPLITUDE,
      noise: { color: 'pink', level: TUNING_NOISE_LEVEL },
      // Nothing precedes the first note, so there is nothing to cross-fade
      // from; the master fade-in covers the start.
      crossfadeSec: index === 0 ? 0 : TUNING_CROSSFADE_SEC,
    });
  });

  return createProtocol({
    id,
    name,
    description:
      'One of two tuning conditions in a blinded comparison. Both play the same five-note figure at the same level for the same time; which reference this one is tuned to stays sealed until you reveal.',
    intent: 'explore',
    stages,
    master: { fadeInSec: 6, fadeOutSec: 8 },
    tags: ['experiment', 'tuning'],
    generatedBy: 'preset',
    createdAt: TEMPLATE_DATE,
  });
}

/** A single sustained tone under a fixed bed. Used by the 528/432 arms. */
function toneArmProtocol(toneHz: number, id: string, name: string, description: string): Protocol {
  return createProtocol({
    id,
    name,
    description,
    intent: 'explore',
    stages: [
      buildStage({
        id: 'stage-1',
        name: 'Listen',
        durationSec: 15 * 60,
        engine: 'tone',
        carrierHz: toneHz,
        beatHz: 0,
        amplitude: TONE_AMPLITUDE,
        noise: { color: 'pink', level: TUNING_NOISE_LEVEL },
        crossfadeSec: 0,
      }),
    ],
    master: { fadeInSec: 6, fadeOutSec: 8 },
    tags: ['experiment', 'tuning'],
    generatedBy: 'preset',
    createdAt: TEMPLATE_DATE,
  });
}

const BEAT_CARRIER_HZ = 220;
const BEAT_NOISE_LEVEL = 0.08;
const BEAT_SESSION_SEC = 20 * 60;

/** A binaural arm: `carrier` in the left ear, `carrier + beatHz` in the right. */
function beatArmProtocol(beatHz: number, id: string, name: string, description: string): Protocol {
  return createProtocol({
    id,
    name,
    description,
    intent: 'explore',
    stages: [
      buildStage({
        id: 'stage-1',
        name: 'Listen',
        durationSec: BEAT_SESSION_SEC,
        engine: 'binaural',
        binauralMode: 'offset',
        carrierHz: BEAT_CARRIER_HZ,
        beatHz,
        amplitude: BEAT_AMPLITUDE,
        noise: { color: 'pink', level: BEAT_NOISE_LEVEL },
        crossfadeSec: 0,
      }),
    ],
    master: { fadeInSec: 4, fadeOutSec: 6 },
    tags: ['experiment', 'binaural'],
    generatedBy: 'preset',
    createdAt: TEMPLATE_DATE,
  });
}

/**
 * The matched control: the same carrier in both ears, and no beat.
 *
 * Built on the plain oscillator rather than the binaural engine because the
 * beat parameter's floor is `MIN_BEAT_HZ` = 0.1, so the engine cannot be asked
 * for 220/220 at all. At full separation a binaural pair at zero beat and a
 * centred single tone are the same signal sample for sample — both ears get
 * `sin(2πft)·a` — so nothing about the sound is lost. The alternative was a
 * 0.1 Hz "beat", a ten-second cycle presented to the listener as no beat, and a
 * control that is quietly not a control is worse than no control at all.
 */
function controlArmProtocol(id: string, name: string, description: string): Protocol {
  return createProtocol({
    id,
    name,
    description,
    intent: 'explore',
    stages: [
      buildStage({
        id: 'stage-1',
        name: 'Listen',
        durationSec: BEAT_SESSION_SEC,
        engine: 'tone',
        carrierHz: BEAT_CARRIER_HZ,
        beatHz: 0,
        amplitude: BEAT_AMPLITUDE,
        noise: { color: 'pink', level: BEAT_NOISE_LEVEL },
        crossfadeSec: 0,
      }),
    ],
    master: { fadeInSec: 4, fadeOutSec: 6 },
    tags: ['experiment', 'control'],
    generatedBy: 'preset',
    createdAt: TEMPLATE_DATE,
  });
}

/* ── The templates ────────────────────────────────────────────────────────── */

/** The caveat every one of these carries, because it is true of all of them. */
const N_OF_ONE_CAVEAT =
  'A result here is about you, on these days, at these times of day. It is an association in your own listening, not evidence about anyone else and not a medical finding.';

const HEADPHONE_CAVEAT =
  'Both arms need headphones. A binaural difference does not survive a speaker, so a session played on speakers is not the condition being rated.';

const MASTER_CHAIN_LABEL = 'Master chain';

const TUNING_REFERENCE_COMPARISON: ExperimentTemplate = {
  id: 'tuning-reference',
  name: 'Tuning reference — A440 against A432',
  question: 'Playing the same figure at two tuning references, which do you prefer?',
  summary:
    'The same five-note figure, the same spectrum over every note, the same level, the same bed and the same twenty minutes — built once from A4 = 440 Hz and once from A4 = 432 Hz. Every note in one arm sits a third of a semitone below the same note in the other, and nothing else about the two arms differs.',
  metrics: ['mood', 'relaxation'],
  sessionsPerArm: 6,
  arms: [
    {
      arm: 'A',
      condition: 'The figure built from A4 = 440 Hz, the ISO 16 reference.',
      protocol: tuningArmProtocol(440, 'template-tuning-reference-one', 'Tuning Comparison — Condition One'),
    },
    {
      arm: 'B',
      condition: 'The same figure built from A4 = 432 Hz.',
      protocol: tuningArmProtocol(432, 'template-tuning-reference-two', 'Tuning Comparison — Condition Two'),
    },
  ],
  heldConstant: [
    {
      keys: ['structure.stages'],
      label: 'The figure',
      value: 'Five sustained notes — A2, E3, C3, D3, A2 — in the same order in both arms',
    },
    { keys: ['stage.durationSec'], label: 'Length of each note', value: 'Four minutes, twenty in total' },
    { keys: ['stage.crossfadeSec'], label: 'Cross-fade between notes', value: 'Twelve seconds, equal power' },
    {
      keys: ['tone.partials'],
      label: 'Spectrum over each note',
      value: 'A fundamental with partials at 2×, 3× and 4×, at identical levels in both arms',
    },
    { keys: ['tone.amplitude'], label: 'Tone level', value: '0.30 linear, before the master chain' },
    { keys: ['tone.beatHz'], label: 'Beat', value: 'None in either arm — this comparison is about pitch, not rate' },
    {
      keys: ['noise.color', 'noise.level', 'noise.width', 'noise.cutoff'],
      label: 'Bed',
      value: 'Pink noise at 6%, identical width and cutoff',
    },
    {
      keys: ['master.gain', 'master.fadeInSec', 'master.fadeOutSec', 'master.limiterCeilingDb'],
      label: MASTER_CHAIN_LABEL,
      value: 'Gain 0.5, six-second fade in, eight-second fade out, limiter at −1 dBFS',
    },
  ],
  varies: [
    {
      keys: ['tone.leftHz', 'tone.rightHz'],
      label: 'Tuning reference the figure is derived from',
      values: { A: 'A4 = 440 Hz', B: 'A4 = 432 Hz' },
      difference:
        'Every note in the 432 arm is 31.77 cents flat of the same note in the 440 arm — the same interval at every pitch, which is exactly what changing a tuning reference does to a piece.',
    },
  ],
  caveats: [
    'This is a monophonic figure of sustained tones, not a piece of music: the engine plays one tone module at a time, so there is no harmony, no rhythm and no arrangement. What a tuning reference does to a real performance is a larger question than this can reach.',
    'A third of a semitone is a small interval. Without a tuner most listeners cannot say which arm is which, which is what makes the blinding worth having — and what would make a large difference in your ratings surprising rather than expected.',
    'Both arms move every note by the same interval, so this compares two tunings. It says nothing about 432 Hz as a tone, which is a different claim and a different experiment.',
    N_OF_ONE_CAVEAT,
  ],
  libraryEntryIds: ['concert-pitch', 'harmonic-series'],
  archiveEntryIds: ['concert-a440', 'concert-a432'],
  version: 1,
  factory: true,
};

const PERSONAL_RESPONSE_528_432: ExperimentTemplate = {
  id: 'personal-response-528-432',
  name: '528 Hz and 432 Hz, side by side',
  question: 'Over a run of sessions, which of these two listening conditions do you prefer?',
  summary:
    'Two plain tones under acoustically matched conditions: the same level, the same pink bed, the same fifteen minutes, the same fades. Only the pitch differs. What this measures is which condition you prefer — a personal response, and nothing beyond one.',
  metrics: ['mood', 'relaxation'],
  sessionsPerArm: 6,
  arms: [
    {
      arm: 'A',
      condition: 'A 528 Hz tone.',
      protocol: toneArmProtocol(
        528,
        'template-response-condition-one',
        'Listening Comparison — Condition One',
        'One of two matched listening conditions. Same level, same bed, same length; only the pitch differs, and which one this is stays sealed until you reveal.',
      ),
    },
    {
      arm: 'B',
      condition: 'A 432 Hz tone.',
      protocol: toneArmProtocol(
        432,
        'template-response-condition-two',
        'Listening Comparison — Condition Two',
        'One of two matched listening conditions. Same level, same bed, same length; only the pitch differs, and which one this is stays sealed until you reveal.',
      ),
    },
  ],
  heldConstant: [
    { keys: ['structure.stages'], label: 'Structure', value: 'One stage, no sweeps, in both arms' },
    { keys: ['stage.durationSec'], label: 'Length', value: 'Fifteen minutes' },
    { keys: ['tone.amplitude'], label: 'Tone level', value: '0.30 linear, before the master chain' },
    { keys: ['tone.waveform'], label: 'Waveform', value: 'Sine' },
    { keys: ['tone.beatHz'], label: 'Beat', value: 'None — a plain tone in both ears in both arms' },
    {
      keys: ['noise.color', 'noise.level', 'noise.width', 'noise.cutoff'],
      label: 'Bed',
      value: 'Pink noise at 6%, identical width and cutoff',
    },
    {
      keys: ['master.gain', 'master.fadeInSec', 'master.fadeOutSec', 'master.limiterCeilingDb'],
      label: MASTER_CHAIN_LABEL,
      value: 'Gain 0.5, six-second fade in, eight-second fade out, limiter at −1 dBFS',
    },
  ],
  varies: [
    {
      keys: ['tone.leftHz', 'tone.rightHz'],
      label: 'The tone',
      values: { A: '528 Hz', B: '432 Hz' },
      difference: '347.41 cents apart — a little over a minor third.',
    },
  ],
  caveats: [
    'A preference is a preference. This design can tell you which condition you rated higher; nothing about it reaches a claim that a frequency does something to a body, and no arrangement of it could.',
    'You will hear immediately that the two arms are not the same. What the blinding protects is the label: without a tuner you will not know which of the two numbers today’s session is, and the expectations people carry attach to the numbers rather than to the pitches.',
    'Equal amplitude is not equal loudness. The equal-loudness contours are close at these two pitches but not identical, so a small part of any preference may be level rather than pitch.',
    N_OF_ONE_CAVEAT,
  ],
  libraryEntryIds: ['solfeggio', 'concert-pitch'],
  archiveEntryIds: ['tone-528-study', 'solfeggio-528', 'concert-a432'],
  version: 1,
  factory: true,
};

const CONTROL_CONDITION: ExperimentTemplate = {
  id: 'control-condition',
  name: 'A binaural beat against a matched control',
  question: 'Does the beat itself change anything for you, or is it the tone and the twenty minutes?',
  summary:
    '220 Hz in the left ear and 226 Hz in the right — a 6 Hz binaural difference — against 220 Hz in both ears. Same carrier, same level, same pink bed, same twenty minutes. The control arm is the point of the whole design: without it a rating measures sitting still with headphones on, which is a real effect and not the one under test.',
  metrics: ['relaxation', 'mood'],
  sessionsPerArm: 6,
  arms: [
    {
      arm: 'A',
      condition: '220 Hz left, 226 Hz right — a 6 Hz binaural difference.',
      protocol: beatArmProtocol(
        6,
        'template-control-condition-one',
        'Beat Comparison — Condition One',
        'One of two matched conditions. Same carrier, same level, same bed, same length; whether this one carries a beat stays sealed until you reveal.',
      ),
    },
    {
      arm: 'B',
      condition: '220 Hz in both ears — the same tone, the beat removed and nothing put in its place.',
      protocol: controlArmProtocol(
        'template-control-condition-two',
        'Beat Comparison — Condition Two',
        'One of two matched conditions. Same carrier, same level, same bed, same length; whether this one carries a beat stays sealed until you reveal.',
      ),
    },
  ],
  heldConstant: [
    { keys: ['tone.leftHz'], label: 'Left ear', value: '220 Hz in both arms' },
    { keys: ['tone.amplitude'], label: 'Tone level', value: '0.32 linear, before the master chain' },
    { keys: ['tone.waveform'], label: 'Waveform', value: 'Sine' },
    { keys: ['structure.stages'], label: 'Structure', value: 'One stage, no sweeps, in both arms' },
    { keys: ['stage.durationSec'], label: 'Length', value: 'Twenty minutes' },
    {
      keys: ['noise.color', 'noise.level', 'noise.width', 'noise.cutoff'],
      label: 'Bed',
      value: 'Pink noise at 8%, identical width and cutoff',
    },
    {
      keys: ['master.gain', 'master.fadeInSec', 'master.fadeOutSec', 'master.limiterCeilingDb'],
      label: MASTER_CHAIN_LABEL,
      value: 'Gain 0.5, four-second fade in, six-second fade out, limiter at −1 dBFS',
    },
  ],
  varies: [
    {
      keys: ['tone.rightHz', 'tone.beatHz'],
      label: 'What the right ear receives',
      values: {
        A: '226 Hz — six hertz above the left ear, which is heard as a 6 Hz beat',
        B: '220 Hz — the same tone as the left ear, so there is no beat to hear',
      },
      difference:
        'One number, stated twice: the right-ear tone and the difference between the ears are the same fact. The tone, the level, the bed and the length are untouched.',
    },
  ],
  caveats: [
    'The control is built as a single 220 Hz tone rather than as a binaural pair at zero beat, because the beat parameter cannot be set below 0.1 Hz. At full separation the two are the same signal sample for sample; a 0.1 Hz beat would have been a ten-second cycle presented as no beat, which is not a control.',
    HEADPHONE_CAVEAT,
    'A null result here is a real result, and the likeliest one. Decide before you start that you will report it either way.',
    N_OF_ONE_CAVEAT,
  ],
  libraryEntryIds: ['binaural-beats', 'carrier-choice'],
  archiveEntryIds: ['carrier-440', 'theta-beat-6'],
  version: 1,
  factory: true,
};

const BEAT_RATE_COMPARISON: ExperimentTemplate = {
  id: 'beat-rate-theta-alpha',
  name: 'Theta 6 Hz against alpha 10 Hz',
  question: 'Holding everything else still, does the beat rate make a difference to you?',
  summary:
    'Two binaural beats on the same 220 Hz carrier: 6 Hz against 10 Hz. Identical level, identical bed, identical length, and a right-ear tone four hertz apart — the only difference the two arms have. Whatever the ratings say cannot be explained by loudness, by masking or by session length, which is what makes this the cleanest instrument in the set.',
  metrics: ['relaxation', 'focus'],
  sessionsPerArm: 6,
  arms: [
    {
      arm: 'A',
      condition: '220 Hz left, 226 Hz right — a 6 Hz beat, in the theta range.',
      protocol: beatArmProtocol(
        6,
        'template-beat-rate-condition-one',
        'Rate Comparison — Condition One',
        'One of two matched conditions. Same carrier, same level, same bed, same length; the beat rate is what differs, and which rate this is stays sealed until you reveal.',
      ),
    },
    {
      arm: 'B',
      condition: '220 Hz left, 230 Hz right — a 10 Hz beat, in the alpha range.',
      protocol: beatArmProtocol(
        10,
        'template-beat-rate-condition-two',
        'Rate Comparison — Condition Two',
        'One of two matched conditions. Same carrier, same level, same bed, same length; the beat rate is what differs, and which rate this is stays sealed until you reveal.',
      ),
    },
  ],
  heldConstant: [
    { keys: ['tone.leftHz'], label: 'Left ear', value: '220 Hz in both arms' },
    { keys: ['tone.amplitude'], label: 'Tone level', value: '0.32 linear, before the master chain' },
    { keys: ['tone.waveform'], label: 'Waveform', value: 'Sine' },
    { keys: ['structure.stages'], label: 'Structure', value: 'One stage, no sweeps, in both arms' },
    { keys: ['stage.durationSec'], label: 'Length', value: 'Twenty minutes' },
    {
      keys: ['noise.color', 'noise.level', 'noise.width', 'noise.cutoff'],
      label: 'Bed',
      value: 'Pink noise at 8%, identical width and cutoff',
    },
    {
      keys: ['master.gain', 'master.fadeInSec', 'master.fadeOutSec', 'master.limiterCeilingDb'],
      label: MASTER_CHAIN_LABEL,
      value: 'Gain 0.5, four-second fade in, six-second fade out, limiter at −1 dBFS',
    },
  ],
  varies: [
    {
      keys: ['tone.rightHz', 'tone.beatHz'],
      label: 'Beat rate',
      values: { A: '6 Hz — 226 Hz in the right ear', B: '10 Hz — 230 Hz in the right ear' },
      difference: 'Four hertz of beat, and the four hertz on the right-ear tone that produces it. Nothing else moves.',
    },
  ],
  caveats: [
    'Band names are conventions describing measured EEG activity, not switches. A 6 Hz beat does not put you in a theta state, and this comparison cannot test whether it does — it tests which of the two you rate higher.',
    'The two rates are audibly different as a pulse, so you may well be able to tell the arms apart. The blinding hides which band label is attached to today’s session, not the sound.',
    HEADPHONE_CAVEAT,
    N_OF_ONE_CAVEAT,
  ],
  libraryEntryIds: ['binaural-beats', 'alpha-range', 'theta-range'],
  archiveEntryIds: ['alpha-beat-10', 'theta-beat-6', 'alpha-10'],
  version: 1,
  factory: true,
};

/**
 * The shipped templates, in the order the browser renders them.
 *
 * Four designs, three of them arranged so that a single dimension moves and the
 * fourth — the control template — so that a single dimension is *removed*. That
 * ordering is deliberate: the tuning comparison is the one people arrive
 * wanting, and the control template is the one that teaches what the others are
 * worth.
 */
export const FACTORY_EXPERIMENT_TEMPLATES: ExperimentTemplate[] = [
  TUNING_REFERENCE_COMPARISON,
  PERSONAL_RESPONSE_528_432,
  CONTROL_CONDITION,
  BEAT_RATE_COMPARISON,
];

export function experimentTemplate(id: string): ExperimentTemplate | undefined {
  return FACTORY_EXPERIMENT_TEMPLATES.find((template) => template.id === id);
}

/** Every library and archive id the templates depend on, deduplicated. */
export function templateEvidenceIds(): { library: string[]; archive: string[] } {
  const library = new Set<string>();
  const archive = new Set<string>();
  for (const template of FACTORY_EXPERIMENT_TEMPLATES) {
    for (const id of template.libraryEntryIds) library.add(id);
    for (const id of template.archiveEntryIds) archive.add(id);
  }
  return { library: [...library].sort(), archive: [...archive].sort() };
}
