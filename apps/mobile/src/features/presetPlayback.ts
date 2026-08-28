import {
  presetToProtocol,
  transformsFor,
  validatePreset,
  type FrequencyPreset,
  type PlaybackTransform,
  type PresetCompilation,
  type PresetIssue,
  type RepresentationKind,
  type TransformKind,
} from '@frequencylab/dsp-core';

/**
 * Choosing how a preset is heard (§4).
 *
 * A preset ships with one representation, and that is a suggestion rather than
 * a law: 7.83 Hz can be a binaural difference, a monaural one, an isochronic
 * pulse or a modulated noise bed, and which of those a person wants is not
 * something the shelf can know. What the shelf *can* do is refuse to pretend.
 * A representation that cannot honestly be produced for a value stays on the
 * screen with the reason attached, exactly as the archive's transform picker
 * does, because a missing row reads as an oversight and a substituted one is a
 * lie.
 *
 * Every sentence a user reads here comes out of the core: the labels and
 * descriptions from `archive/transforms.ts`, the refusals from `validatePreset`
 * and `presetToProtocol`. Nothing in this module writes copy about what a
 * signal is or why it cannot be built — it only decides which of the core's
 * sentences answers the question the picker is actually asking.
 */

/** The transform each representation is a request for, where one exists. */
const TRANSFORM_FOR: Partial<Record<RepresentationKind, TransformKind>> = {
  direct: 'direct',
  binaural: 'binaural-beat',
  'binaural-centered': 'binaural-centered',
  monaural: 'monaural-beat',
  am: 'am-rate',
  isochronic: 'isochronic-rate',
  fm: 'fm-rate',
  'stereo-motion': 'stereo-motion-rate',
  harmonic: 'harmonic-stack',
  subharmonic: 'subharmonic',
  'noise-modulation': 'noise-modulation-rate',
};

/**
 * The representations offered on every preset, in a fixed order.
 *
 * Fixed so the list does not reorder itself as a user moves between presets,
 * and shared so the same eleven questions are asked of every row. `sweep` and
 * `multi-layer` are absent because neither is a way of hearing *one* value:
 * a sweep needs a second frequency and a layered preset needs a list of layers,
 * so switching a preset into one would mean inventing the missing half.
 */
const OFFERED: readonly RepresentationKind[] = [
  'direct',
  'binaural',
  'binaural-centered',
  'monaural',
  'isochronic',
  'am',
  'fm',
  'stereo-motion',
  'harmonic',
  'subharmonic',
  'noise-modulation',
];

/**
 * Which refusal answers "why not this one?".
 *
 * `presetToProtocol` reports the first fault it finds, which is all a compiler
 * needs: it is refusing, and one reason is enough. A picker is doing something
 * else — explaining a choice to a person — and the first fault is not always
 * the useful one. Switching a 40 Hz rate to a direct tone trips
 * `direct-tone-not-allowed` first, which reads as the preset contradicting
 * itself; what the user needs to be told is that 40 Hz is recorded as a rate
 * and a rate is not a pitch.
 *
 * So the codes are ranked by how well each answers the question, and the
 * message is still the core's own. Anything unranked falls through to the first
 * error, which is the compiler's answer.
 */
const EXPLANATION_ORDER: readonly string[] = [
  'source-frequency-missing',
  'direct-tone-not-audible',
  'modulation-rate-as-pitch',
  'modulation-rate-as-carrier',
  'carrier-not-audible',
  'sweep-without-target',
  'subharmonic-shift-not-negative',
  'octave-shift-not-whole',
  'calculation-mode-contradiction',
];

export interface RepresentationOption {
  kind: RepresentationKind;
  /** The translator's short name for this representation. */
  label: string;
  /** What it produces, or — when unavailable — nothing; see `unavailableReason`. */
  description: string;
  available: boolean;
  /** Why it cannot be produced for this value. Present whenever unavailable. */
  unavailableReason?: string;
  /** The honesty note, present whenever the played signal is not the value. */
  equivalenceNote?: string;
  /** The frequency actually synthesised, and the carrier it rides on. */
  transform?: PlaybackTransform;
  /** True for the representation the factory row ships with. */
  shipped: boolean;
}

/**
 * The same preset, asked to be heard a different way.
 *
 * The carrier, depth, noise bed and octave shift stay exactly as the row set
 * them: those are the preset's own configuration, and silently changing one
 * would make the switch produce a sound the row never described.
 *
 * The one field that does move with the kind is the binaural calculation, and
 * it moves because it is not independent of it. `binaural` and
 * `binaural-centered` are offered as two separate options precisely because
 * they put different frequencies in each ear; leaving a shipped `offset` in
 * place under the centred kind would make the two rows contradict each other,
 * and `validatePreset` would rightly refuse the pair as a preset that does not
 * mean what it says.
 */
export function withRepresentation(
  preset: FrequencyPreset,
  kind: RepresentationKind,
): FrequencyPreset {
  if (kind === preset.representation.kind) return preset;
  const representation = { ...preset.representation, kind };
  if (kind === 'binaural') representation.calculationMode = 'offset';
  if (kind === 'binaural-centered') representation.calculationMode = 'centered';
  return { ...preset, representation };
}

/** Compiles a preset as it would be heard under one representation. */
export function compileRepresentation(
  preset: FrequencyPreset,
  kind: RepresentationKind,
  options: { id?: string; createdAt?: string } = {},
): PresetCompilation {
  return presetToProtocol(withRepresentation(preset, kind), options);
}

/**
 * Every representation this preset could be heard as, viable or not.
 *
 * Unavailable options are returned rather than filtered, with the reason
 * attached. That is the same rule `transformsFor` follows and for the same
 * reason: somebody looking at a 7.83 Hz preset has to be able to see *why* a
 * plain tone is not on offer, not merely find it absent.
 */
export function representationOptions(preset: FrequencyPreset): RepresentationOption[] {
  const kinds = OFFERED.includes(preset.representation.kind)
    ? OFFERED
    : [preset.representation.kind, ...OFFERED];

  // One translation pass, shared by every row: the labels and the played
  // frequencies come from the same call the compiler makes, so the picker
  // cannot describe an option differently from the way it would be built.
  const translations = transformsFor(preset.sourceFrequency.value, {
    carrierHz: preset.representation.carrierHz,
    harmonicOctaveShift: preset.representation.octaveShift ?? 0,
    subharmonicOctaves:
      preset.representation.octaveShift === undefined
        ? 1
        : Math.abs(preset.representation.octaveShift),
  });

  return kinds.map((kind) => {
    const transformKind = TRANSFORM_FOR[kind];
    const transform = transformKind
      ? translations.find((candidate) => candidate.kind === transformKind)
      : undefined;
    const shipped = kind === preset.representation.kind;

    const variant = withRepresentation(preset, kind);
    const blocking = explanationFor(validatePreset(variant).issues);
    if (blocking) {
      return {
        kind,
        label: transform?.label ?? STRUCTURAL_LABELS[kind],
        description: '',
        available: false,
        unavailableReason: blocking.message,
        shipped,
      };
    }

    const compiled = presetToProtocol(variant);
    if (!compiled.ok) {
      return {
        kind,
        label: transform?.label ?? STRUCTURAL_LABELS[kind],
        description: '',
        available: false,
        unavailableReason: compiled.failure.message,
        shipped,
      };
    }

    return {
      kind,
      label: compiled.statement.transform?.label ?? transform?.label ?? STRUCTURAL_LABELS[kind],
      description: compiled.statement.summary,
      available: true,
      equivalenceNote: compiled.statement.transform?.equivalenceNote,
      transform: compiled.statement.transform,
      shipped,
    };
  });
}

/**
 * Names for the two representations the translator has no transform for.
 *
 * Structural descriptions rather than claims: a sweep is a glide between two
 * values and a layered preset is several signals at once. Both are facts about
 * the shape of the configuration, which is the only thing a name here is
 * allowed to assert.
 */
const STRUCTURAL_LABELS: Record<RepresentationKind, string> = {
  direct: 'Direct tone',
  binaural: 'Binaural difference',
  'binaural-centered': 'Binaural difference (centred)',
  monaural: 'Monaural difference',
  am: 'AM rate',
  isochronic: 'Isochronic pulse',
  fm: 'FM rate',
  'stereo-motion': 'Stereo movement rate',
  harmonic: 'Harmonic stack',
  subharmonic: 'Subharmonic',
  'noise-modulation': 'Noise modulation',
  sweep: 'Sweep between two values',
  'multi-layer': 'Several layers at once',
};

function explanationFor(issues: PresetIssue[]): PresetIssue | undefined {
  const errors = issues.filter((issue) => issue.severity === 'error');
  if (errors.length === 0) return undefined;
  for (const code of EXPLANATION_ORDER) {
    const match = errors.find((issue) => issue.code === code);
    if (match) return match;
  }
  return errors[0];
}
