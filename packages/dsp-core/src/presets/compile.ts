import {
  transformsFor,
  type PlaybackTransform,
  type TransformKind,
  type TransformOptions,
} from '../archive/transforms.js';
import { defaultParams } from '../graph/descriptors.js';
import { buildStage, createProtocol, type StageOptions } from '../protocol/builders.js';
import { INTENSITY_AMPLITUDE } from '../protocol/recipes.js';
import type { Protocol, ProtocolIntent } from '../protocol/schema.js';
import { validateProtocol } from '../protocol/validate.js';
import { validatePreset, type PresetIssue } from './validate.js';
import type { FrequencyPreset } from './types.js';

/**
 * Compiling a preset into a protocol (§43, §80).
 *
 * A preset is a row of data. A protocol is the thing that makes sound. This
 * module is the whole of the distance between them, and it has one job beyond
 * arithmetic: **what comes out must be what the preset names.** A preset that
 * says "monaural" must not compile to a binaural pair; a preset naming a plain
 * 528 Hz tone must not compile to two tones a beat apart; a representation this
 * engine cannot produce must come back as a refusal that says so, never as the
 * nearest thing that happened to build.
 *
 * Two rules make that hold:
 *
 *  - every stage comes from `buildStage`, so node ids, wiring and automation
 *    targets are the ones every other surface uses. Hand-assembling a graph
 *    here would produce a second set of ids, and a stage cross-fade matches
 *    nodes across stages by id — a private id is a graph that steps at the
 *    boundary instead of fading;
 *  - the statement shown to the user comes from `archive/transforms.ts`, the
 *    same translator the archive audition screen uses, rather than from prose
 *    written beside the chain. One source, so the sentence on the screen and
 *    the sound in the headphones cannot come to disagree.
 *
 * Determinism: `canonicalProtocol` excludes id, name, description, tags and
 * timestamps, so none of those can move the fingerprint. The same preset with
 * the same options fingerprints identically on every platform and every run,
 * and a changed carrier or duration changes the fingerprint because it changes
 * the audio. `test/presetCompile.test.ts` proves both rather than asserting them.
 */

export interface PresetCompileOptions {
  /**
   * Overrides the preset's suggested duration, in seconds. The UI lets the user
   * change it, and a preset's own figure is a suggestion (§43).
   */
  durationSec?: number;
  /**
   * Overrides the representation's carrier.
   *
   * Ignored by the representations whose audible tone *is* the source value — a
   * direct tone, a subharmonic and a harmonic stack have no separate carrier to
   * move, and moving the value would change which frequency was played.
   */
  carrierHz?: number;
  /** Peak swing either side of the carrier for an FM representation. */
  deviationHz?: number;
  /** Tone amplitude, 0..1. Defaults to the same level as balanced intensity. */
  amplitude?: number;
  /** Protocol id. Excluded from the DNA, so it cannot affect the fingerprint. */
  id?: string;
  /** Fixed creation timestamp, for reproducible exports. Also excluded. */
  createdAt?: string;
}

export type PresetCompileFailureCode =
  /** The engine has no chain for this representation, and none is substituted. */
  | 'representation-not-compilable'
  /** The translator refuses this representation for this value. */
  | 'representation-unavailable'
  /** The preset contradicts itself; see `issues`. */
  | 'preset-invalid'
  /** The chain built, but would not pass protocol validation. */
  | 'protocol-invalid';

export interface PresetCompileFailure {
  code: PresetCompileFailureCode;
  /** Why, phrased as the UI will show it. Never a stack trace. */
  message: string;
  /** The preset issues behind a `preset-invalid` failure. */
  issues?: PresetIssue[];
}

/**
 * What the compiled protocol will actually produce, in the translator's words.
 *
 * The UI is required to show `summary` before playback. `transform` is absent
 * for the one representation with no frequency to translate — an unmodulated
 * noise bed, which is a spectrum rather than a number.
 */
export interface PresetStatement {
  summary: string;
  transform?: PlaybackTransform;
  /** The far end of a sweep, where the representation glides. */
  sweepTo?: PlaybackTransform;
}

export type PresetCompilation =
  | { ok: true; protocol: Protocol; statement: PresetStatement; issues: PresetIssue[] }
  | { ok: false; failure: PresetCompileFailure };

/** Carrier used when neither the preset nor the caller names one. */
const DEFAULT_CARRIER_HZ = 220;

/**
 * The chain arguments for one representation, minus everything about the stage
 * itself. Kept together with the statement they belong to: the two are built in
 * one place so a chain can never be changed without the sentence beside it.
 */
type ChainSpec = Omit<StageOptions, 'id' | 'name' | 'durationSec' | 'crossfadeSec' | 'notes'>;

interface ChainPlan {
  spec: ChainSpec;
  statement: PresetStatement;
}

type PlanResult = { ok: true; plan: ChainPlan } | { ok: false; failure: PresetCompileFailure };

/**
 * Compiles a preset into a runnable protocol, or says why it cannot.
 *
 * A failure is a value rather than an exception because every one of them is
 * something a screen has to explain: a shelf that silently dropped a preset
 * would be worse than one that says "this representation needs a carrier the
 * engine can synthesise, and 4 Hz is not one".
 */
export function presetToProtocol(
  preset: FrequencyPreset,
  options: PresetCompileOptions = {},
): PresetCompilation {
  const validation = validatePreset(preset);
  if (!validation.ok) {
    const first = validation.issues.find((issue) => issue.severity === 'error')!;
    return {
      ok: false,
      failure: { code: 'preset-invalid', message: first.message, issues: validation.issues },
    };
  }

  const planned = planFor(preset, options);
  if (!planned.ok) return planned;

  const durationSec = options.durationSec ?? preset.durationSec;
  const stage = buildStage({
    ...planned.plan.spec,
    id: 'stage-1',
    name: preset.name,
    durationSec,
    // Nothing precedes the first stage, so there is nothing to cross-fade from;
    // the master fade-in is what covers the start of a session.
    crossfadeSec: 0,
    notes: planned.plan.statement.summary,
  });

  const protocol = createProtocol({
    id: options.id ?? `preset-${preset.id}-v${preset.version}`,
    name: preset.name,
    description: preset.summary,
    intent: intentFor(preset),
    stages: [stage],
    tags: ['preset', preset.collection],
    generatedBy: 'preset',
    createdAt: options.createdAt,
  });

  // The last gate. Everything above builds through the shared builders, so this
  // should never fire — and if it ever does, a protocol that fails validation
  // must not reach a session controller that would refuse it half a second
  // later with a message nobody can act on.
  const protocolValidation = validateProtocol(protocol);
  if (!protocolValidation.ok) {
    const first = protocolValidation.issues.find((issue) => issue.severity === 'error')!;
    return { ok: false, failure: { code: 'protocol-invalid', message: first.message } };
  }

  return { ok: true, protocol, statement: planned.plan.statement, issues: validation.issues };
}

/**
 * Which chain a representation compiles to, and what the translator says it
 * will produce.
 *
 * The switch is exhaustive: a representation kind added to `types.ts` fails to
 * compile here until somebody decides what it sounds like. That is the point —
 * the alternative is a `default` branch quietly playing a binaural beat for a
 * representation nobody implemented.
 */
function planFor(preset: FrequencyPreset, options: PresetCompileOptions): PlanResult {
  const rep = preset.representation;
  const value = preset.sourceFrequency.value;
  const carrierHz = options.carrierHz ?? rep.carrierHz ?? DEFAULT_CARRIER_HZ;
  const amplitude = options.amplitude ?? INTENSITY_AMPLITUDE.balanced;
  const noise = bedFor(preset);

  const transformOptions: TransformOptions = {
    carrierHz,
    deviationHz: options.deviationHz,
    harmonicOctaveShift: rep.octaveShift ?? 0,
    // The row states the shift signed, negative for a division; the translator
    // asks how many octaves down. `validatePreset` has already refused a
    // positive or fractional shift on a subharmonic, so this cannot silently
    // turn a multiplication into a division.
    subharmonicOctaves: rep.octaveShift === undefined ? 1 : Math.abs(rep.octaveShift),
  };
  const translate = (kind: TransformKind, hz: number = value): PlaybackTransform =>
    transformsFor(hz, transformOptions).find((transform) => transform.kind === kind)!;

  const common = { amplitude, noise } as const;

  switch (rep.kind) {
    case 'direct':
      return plan(translate('direct'), { ...common, engine: 'tone', carrierHz: value, beatHz: 0 });

    case 'subharmonic': {
      const transform = translate('subharmonic');
      return plan(transform, {
        ...common,
        engine: 'tone',
        carrierHz: transform.playbackHz,
        beatHz: 0,
      });
    }

    case 'harmonic': {
      const transform = translate('harmonic-stack');
      return plan(transform, {
        ...common,
        engine: 'harmonic',
        carrierHz: transform.playbackHz,
        beatHz: 0,
      });
    }

    case 'binaural':
    case 'binaural-centered': {
      // The kind and the mode field can both say this, and either saying
      // "centred" means centred. `validatePreset` refuses the one combination
      // where they contradict each other outright.
      const centered = rep.kind === 'binaural-centered' || rep.calculationMode === 'centered';
      return plan(translate(centered ? 'binaural-centered' : 'binaural-beat'), {
        ...common,
        engine: 'binaural',
        binauralMode: centered ? 'centered' : 'offset',
        carrierHz,
        beatHz: value,
      });
    }

    case 'monaural':
      return plan(translate('monaural-beat'), {
        ...common,
        engine: 'monaural',
        carrierHz,
        beatHz: value,
      });

    case 'am':
      return plan(translate('am-rate'), {
        ...common,
        // A plain tone under the modulator, not a beat engine: an AM preset
        // names one audible tone whose level moves, and a binaural pair
        // underneath would add a second tone the preset never mentions.
        engine: 'tone',
        carrierHz,
        beatHz: 0,
        am: { rateHz: value, depth: rep.modulationDepth ?? defaultParams('am').depth },
      });

    case 'isochronic':
      return plan(translate('isochronic-rate'), {
        ...common,
        engine: 'isochronic',
        carrierHz,
        beatHz: value,
        isochronic: { depth: rep.modulationDepth },
      });

    case 'fm': {
      const transform = translate('fm-rate');
      return plan(transform, {
        ...common,
        engine: 'fm',
        carrierHz,
        beatHz: value,
        // The swing the statement quoted, so the sound matches the sentence.
        fm: { deviationHz: transform.deviationHz, depth: rep.modulationDepth },
      });
    }

    case 'stereo-motion':
      return plan(translate('stereo-motion-rate'), {
        ...common,
        engine: 'tone',
        carrierHz,
        beatHz: 0,
        motion: {
          rateHz: value,
          depth: rep.modulationDepth ?? defaultParams('stereoMotion').depth,
        },
      });

    case 'noise-modulation': {
      if (noise === undefined) {
        return refuse(
          'representation-not-compilable',
          'A noise modulation with no noise bed is silence. Give the representation a noise level above zero.',
        );
      }
      const depth = rep.modulationDepth ?? 0;
      if (depth === 0 || value <= 0) {
        // A bed with nothing modulating it. There is no frequency to translate,
        // because broadband noise is a spectrum slope rather than a number, so
        // the statement says what the bed is instead of naming a value the
        // preset does not hold.
        return {
          ok: true,
          plan: {
            spec: { ...common, engine: 'none', carrierHz, beatHz: 0 },
            statement: {
              summary: `A ${noise.color} noise bed at a level of ${noise.level}, unmodulated. Noise is broadband: it has no single frequency.`,
            },
          },
        };
      }
      return plan(translate('noise-modulation-rate'), {
        ...common,
        engine: 'none',
        carrierHz,
        beatHz: 0,
        am: { rateHz: value, depth },
      });
    }

    case 'sweep': {
      const target = rep.sweepToHz!;
      const role = preset.sourceFrequency.role;
      const fromTone = translate('direct');
      const toTone = translate('direct', target);
      // The role decides what glides, because that is the field that exists to
      // say whether a number is a pitch or a rate. Where the row does not
      // commit — an `unspecified` or `electromagnetic` value — audibility
      // decides instead, and the summary states which reading was taken rather
      // than leaving the user to guess.
      const glidesPitch =
        role === 'carrier' || (role !== 'modulation' && fromTone.available && toTone.available);

      if (glidesPitch) {
        const refusal = firstRefusal(fromTone, toTone);
        if (refusal) return refuse('representation-unavailable', refusal);
        return {
          ok: true,
          plan: {
            spec: {
              ...common,
              engine: 'tone',
              carrierHz: value,
              carrierToHz: target,
              beatHz: 0,
            },
            statement: {
              transform: fromTone,
              sweepTo: toTone,
              summary: summarise([
                `A tone gliding from ${value} Hz to ${target} Hz across the session.`,
                'Both ends are played as pitches, which is what this preset records the value as.',
              ]),
            },
          },
        };
      }

      const centered = rep.calculationMode === 'centered';
      const fromBeat = translate(centered ? 'binaural-centered' : 'binaural-beat');
      const toBeat = translate(centered ? 'binaural-centered' : 'binaural-beat', target);
      const refusal = firstRefusal(fromBeat, toBeat);
      if (refusal) return refuse('representation-unavailable', refusal);
      return {
        ok: true,
        plan: {
          spec: {
            ...common,
            engine: 'binaural',
            binauralMode: centered ? 'centered' : 'offset',
            carrierHz,
            beatHz: value,
            beatToHz: target,
          },
          statement: {
            transform: fromBeat,
            sweepTo: toBeat,
            summary: summarise([
              `A binaural difference gliding from ${value} Hz to ${target} Hz across the session.`,
              fromBeat.description,
              fromBeat.equivalenceNote,
            ]),
          },
        },
      };
    }

    case 'multi-layer':
      // Deliberately not guessed at. `PresetRepresentation` names one kind and
      // carries no list of layers, and the standard chain has a single tone
      // slot, so anything built here would be one layer of an unknown several —
      // a preset playing something other than what it says. When the type grows
      // a way to name its layers this becomes a real case.
      return refuse(
        'representation-not-compilable',
        'A multi-layer representation does not say which layers it is made of, so there is nothing to build that would be what this preset names.',
      );

    default: {
      const exhaustive: never = rep.kind;
      return refuse(
        'representation-not-compilable',
        `No signal chain exists for the "${String(exhaustive)}" representation.`,
      );
    }
  }
}

/**
 * Wraps a chain with the translator's statement of what it produces, refusing
 * when the translator says the value cannot be represented that way.
 *
 * Every representation goes through here, so "unavailable" can only ever become
 * a refusal — there is no path from an unavailable transform to a built stage.
 */
function plan(transform: PlaybackTransform, spec: ChainSpec): PlanResult {
  if (!transform.available) {
    return refuse('representation-unavailable', transform.unavailableReason!);
  }
  return {
    ok: true,
    plan: {
      spec,
      statement: {
        transform,
        summary: summarise([transform.description, transform.equivalenceNote]),
      },
    },
  };
}

function refuse(code: PresetCompileFailureCode, message: string): PlanResult {
  return { ok: false, failure: { code, message } };
}

/** The first stated reason either end of a sweep cannot be played. */
function firstRefusal(from: PlaybackTransform, to: PlaybackTransform): string | undefined {
  if (!from.available) return from.unavailableReason;
  if (!to.available) return to.unavailableReason;
  return undefined;
}

function summarise(parts: Array<string | undefined>): string {
  return parts.filter((part): part is string => part !== undefined && part.length > 0).join(' ');
}

/**
 * The noise bed a representation asks for, if any.
 *
 * A colour with no level is not a bed: the level is what decides whether any
 * noise is audible, and defaulting one in would add a sound the preset did not
 * ask for.
 */
function bedFor(preset: FrequencyPreset): ChainSpec['noise'] {
  const rep = preset.representation;
  const level = rep.noiseLevel ?? 0;
  if (level <= 0) return undefined;
  return { color: rep.noiseColor ?? 'pink', level };
}

const PROTOCOL_INTENTS: readonly ProtocolIntent[] = [
  'relax',
  'focus',
  'meditate',
  'sleep',
  'explore',
  'custom',
];

/**
 * The protocol's coarse intent label.
 *
 * A preset's `intent` list is neutral context — words like "reading" or "wind
 * down" — and most of it has no equivalent among the six the protocol schema
 * knows. Where one matches it is used; where none does the protocol says
 * `explore`, which is the app's word for "you are trying this out", rather than
 * a purpose nobody wrote down.
 */
function intentFor(preset: FrequencyPreset): ProtocolIntent {
  const match = preset.intent.find((entry) =>
    PROTOCOL_INTENTS.includes(entry as ProtocolIntent),
  );
  return (match as ProtocolIntent | undefined) ?? 'explore';
}
