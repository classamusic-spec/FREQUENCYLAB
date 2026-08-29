import type { IssueSeverity } from '../graph/validate.js';
import { resolvePool, selectionWeight } from './scheduler.js';
import type { SchedulableAsset, SoundBathLayer, SoundBathPreset } from './soundbath.js';

/**
 * Checking a sound bath preset against the library it will actually be given.
 *
 * §88. A sound bath preset is a set of queries, and a query is the one kind of
 * configuration that can be completely wrong and still look completely right.
 * `{ instruments: ['GONG'] }` is well-typed, reads plausibly, resolves to
 * nothing, and produces a session with a silent layer that nobody notices until
 * somebody listens to the whole thing. `{ instruments: ['SINGING_BOWL'],
 * durationClasses: ['MEDIUM'] }` is worse: it resolves to two assets, ships,
 * plays, and alternates between them for forty minutes.
 *
 * So this module does not check that a preset is well-formed against its type —
 * the compiler already did that. It checks a preset against a library, and the
 * questions it asks are the ones a type cannot:
 *
 *  - does every layer find anything at all;
 *  - does every layer find *enough* that the no-repeat window has somewhere to
 *    go (§16);
 *  - once the globals are applied, is any of that still reachable;
 *  - can a layer ask the mixer for more gain than the material has headroom for;
 *  - and does anything the user will read make a claim it must not (§84, §25).
 *
 * Approval is deliberately **not** part of this. Curation of the organic
 * library has not started — one asset is approved and it is the worked example
 * in the overrides file — so validating against approved-only material would
 * report every preset in the factory set as broken and teach everyone to ignore
 * the output. `validateSoundBathApproval` is the separate, explicit check for
 * that, and it is the one that has to pass before any of this ships to a user.
 *
 * Severity follows the rule the preset validator next door uses: `error` where
 * the preset could not honestly play, `warning` where it will play and will
 * sound wrong. A caller deciding whether to run something looks at `ok`; the
 * factory test suite treats *any* issue on a shipped preset as a failure,
 * because a warning is a defect that happens to be audible rather than fatal.
 */

/**
 * Severities this validator reports.
 *
 * `IssueSeverity` from the graph validator is error-or-warning, because a
 * graph is either buildable or it is not. A preset has a third case: something
 * a curation screen should show and a build should not fail on — a pool that
 * is thin *and* has a written reason. Widened here rather than in the shared
 * type, which nothing else needs.
 */
export type SoundBathIssueSeverity = IssueSeverity | 'info';

export interface SoundBathIssue {
  severity: SoundBathIssueSeverity;
  code: string;
  message: string;
  /** Dotted path of the field at fault, e.g. `layers.deep-bowls.pool`. */
  field?: string;
}

/** What one layer's query actually found, so a caller can show its working. */
export interface LayerPoolReport {
  layerId: string;
  /** Assets the query resolves to, before any weighting. */
  size: number;
  /**
   * How many of those the preset's own globals leave genuinely in play.
   *
   * The participation ratio of the selection weights, `1 / Σpᵢ²` — the standard
   * "effective number of choices" measure. A pool of forty weighted evenly
   * measures forty; the same forty with all the weight on three of them
   * measures three.
   */
  effectiveSize: number;
}

export interface SoundBathValidation {
  ok: boolean;
  issues: SoundBathIssue[];
  layers: LayerPoolReport[];
}

/**
 * The smallest pool a layer may draw on before it starts to repeat audibly.
 *
 * Derived from the scheduler rather than chosen for roundness. Its no-repeat
 * window multiplies a candidate's weight by `0.02 + 0.16 · since`, where
 * `since` counts back through what this layer has just played: ×0.02 for the
 * one it played last, then 0.18, 0.34, 0.50, 0.66, 0.82. The multiplier first
 * reaches 1 at the seventh entry back. So the six most recently played assets
 * are all under penalty, always.
 *
 * A pool of six or fewer therefore has *every* candidate penalised the moment
 * the layer is warm, and the scheduler stops choosing and starts picking
 * whichever asset it played longest ago. That is a rotation with extra steps,
 * and §16 exists to prevent exactly that. Eight is six plus two: after a full
 * penalty window at least two candidates are still at full weight, so which one
 * arrives next is a real draw rather than an ordering.
 *
 * It is a warning and not an error because `assetIds` exists for a user
 * hand-picking sounds (§35), and someone who picked three bells picked three
 * bells. A *factory* preset in that state is a defect, which is why the test
 * suite fails on a warning that this file only reports.
 */
export const MINIMUM_POOL_SIZE = 8;

/**
 * The smallest *effective* pool, once brightness, energy and tag weights apply.
 *
 * A count is not a pool. The library's ten tuning forks resolve to ten whatever
 * else a preset says, and ten clears the floor above. But forks are struck
 * softly: five of them measure a transient strength below 0.13 and the other
 * five sit between 0.28 and 0.44. Put that layer in a preset with an energy of
 * 0.7 and the weight collapses onto the harder five — the effective pool
 * measures 5.5 while the count still says ten, and even at 0.55 it is down to
 * 6.8. Nothing about the count says so, and the layer that results plays five
 * sounds for half an hour.
 *
 * Six rather than eight, because this measure is strictly smaller than the
 * count and some unevenness is the point: a healthy pool of eight with a
 * two-to-one spread of weights measures about 6.5. What it is catching is not
 * unevenness but collapse — a pool of forty that measures six is a pool where
 * thirty-four assets are decoration.
 */
export const MINIMUM_EFFECTIVE_POOL_SIZE = 6;

/**
 * Words that must never appear in anything a user reads (§84).
 *
 * Deliberately narrow. It is a list of claims and conditions, not of anything
 * that sounds vaguely clinical: a sound bath preset is allowed to be called
 * `Sleep Descent`, because that names when somebody might reach for it, and is
 * not allowed to be called anything with `insomnia` in it, because that names a
 * disorder and implies the preset addresses it. Matching is on word boundaries
 * so `obscure` and `treatise` are not casualties of `cure` and `treat`.
 */
const FORBIDDEN_LANGUAGE: RegExp[] = [
  /\b(cure|cures|cured|curing)\b/i,
  /\b(treat|treats|treated|treating|treatment)\b/i,
  /\b(heal|heals|healed|healing)\b/i,
  /\b(therapy|therapies|therapeutic)\b/i,
  /\b(remedy|remedies)\b/i,
  /\b(diagnose|diagnosis|symptom|symptoms)\b/i,
  /\b(disease|illness|disorder|condition)\b/i,
  /\b(anxiety|depression|insomnia|migraine|tinnitus)\b/i,
  /\b(cancer|tumou?r|immune|inflammation)\b/i,
  /\bpain\b/i,
];

/**
 * The sentence §25 requires: the acoustic layer is not producing the beat.
 *
 * Checked as a substring rather than by inference, because there is only one
 * approved wording and `presets.ts` appends it structurally. A preset arriving
 * from anywhere else has to carry it too.
 */
export const ACOUSTIC_LAYER_NOTICE_MARKER = 'produces no modulation of its own';

export interface ValidateSoundBathOptions {
  preset: SoundBathPreset;
  library: SchedulableAsset[];
  /**
   * Whether to resolve pools against approved assets only.
   *
   * Defaults to `false`, which is the opposite of the scheduler's shipping
   * default and is intentional: this is a design-time check against the library
   * as it exists, and curation has not started. `validateSoundBathApproval` is
   * where approval is asked about.
   */
  requireApproved?: boolean;
}

export function validateSoundBath(options: ValidateSoundBathOptions): SoundBathValidation {
  const { preset, library, requireApproved = false } = options;
  const issues: SoundBathIssue[] = [];
  const layers: LayerPoolReport[] = [];
  const push = (severity: SoundBathIssueSeverity, code: string, message: string, field?: string) => {
    issues.push({ severity, code, message, field });
  };

  // ------------------------------------------------------------- the preset
  if (preset.layers.length === 0) {
    push('error', 'preset-has-no-layers', 'A sound bath with no layers is silence with a name on it.', 'layers');
  }

  const seen = new Set<string>();
  for (const layer of preset.layers) {
    if (seen.has(layer.id)) {
      push(
        'error',
        'layer-id-duplicated',
        `Two layers are both called "${layer.id}". Every event carries its layer id, so a duplicate makes a plan impossible to read back and a per-layer voice cap impossible to attribute.`,
        `layers.${layer.id}.id`,
      );
    }
    seen.add(layer.id);
  }

  checkGlobals(preset, push);
  checkLanguage(preset, push);

  // -------------------------------------------------------------- the pools
  for (const layer of preset.layers) {
    const pool = resolvePool(layer.pool, library, requireApproved);
    const effectiveSize = effectivePoolSize(pool, layer, preset);
    layers.push({ layerId: layer.id, size: pool.length, effectiveSize });

    checkLayerShape(layer, push);

    if (pool.length === 0) {
      push(
        'error',
        'pool-empty',
        `Layer "${layer.id}" resolves to nothing, so it can never play. The scheduler will report it in \`emptyLayers\` and carry on, which means a session that is quietly missing a layer nobody asked it to drop.`,
        `layers.${layer.id}.pool`,
      );
      continue;
    }

    if (pool.length < MINIMUM_POOL_SIZE && layer.acknowledgedThinPool) {
      /*
       * A thin pool somebody wrote down a reason for.
       *
       * Reported at `info` rather than suppressed: the pool *is* thin, and a
       * curation screen should still say so. What the acknowledgement changes
       * is whether it is a defect — the factory set refuses warnings, and this
       * is how a deliberate case is admitted without lowering the floor for
       * everything else. The reason is carried into the message so it is read
       * wherever the issue is read, rather than living only in a source
       * comment nobody opens.
       */
      push(
        'info',
        'pool-thin-acknowledged',
        `Layer "${layer.id}" resolves to ${pool.length} assets, below the ${MINIMUM_POOL_SIZE} the no-repeat window needs. Acknowledged: ${layer.acknowledgedThinPool}`,
        `layers.${layer.id}.pool`,
      );
    } else if (pool.length < MINIMUM_POOL_SIZE) {
      push(
        'warning',
        'pool-thin',
        pool.length === 1
          ? `Layer "${layer.id}" resolves to a single asset, so every event on it is that asset. The no-repeat window cannot help: there is nothing to move to.`
          : `Layer "${layer.id}" resolves to ${pool.length} assets, below the ${MINIMUM_POOL_SIZE} the no-repeat window needs. The scheduler penalises the six most recently played, so with ${pool.length} in the pool every candidate is always under penalty and the layer rotates instead of choosing.`,
        `layers.${layer.id}.pool`,
      );
    } else if (effectiveSize < MINIMUM_EFFECTIVE_POOL_SIZE) {
      // Only worth saying when the count looked fine. A thin pool is already
      // reported above and saying it twice in different arithmetic is noise.
      push(
        'warning',
        'pool-collapsed-by-globals',
        `Layer "${layer.id}" resolves to ${pool.length} assets but this preset's brightness (${preset.globals.brightness}) and energy (${preset.globals.energy}) leave about ${effectiveSize.toFixed(1)} of them in play. The count is not the problem; the globals are pointing somewhere this material is not.`,
        `layers.${layer.id}.pool`,
      );
    }

    checkHeadroom(layer, pool, push);
  }

  return { ok: !issues.some((issue) => issue.severity === 'error'), issues, layers };
}

/**
 * How many assets a layer is really drawing on.
 *
 * Weighted with the scheduler's own `selectionWeight`, not a copy of it, so the
 * two cannot disagree about what a preset will sound like. The no-repeat
 * penalty is excluded because it depends on what the layer has already played
 * and has no meaning for a pool at rest; the fatigue penalty is excluded for
 * the same reason.
 */
export function effectivePoolSize(
  pool: readonly SchedulableAsset[],
  layer: SoundBathLayer,
  preset: SoundBathPreset,
): number {
  if (pool.length === 0) return 0;
  const weights = pool.map((asset) => selectionWeight(asset, layer, preset.globals));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  // A pool whose every weight has underflowed is unreachable, not uniform.
  if (total <= 0) return 0;
  const sumOfSquares = weights.reduce((sum, weight) => sum + (weight / total) ** 2, 0);
  return 1 / sumOfSquares;
}

// ---------------------------------------------------------------------------
// The individual checks
// ---------------------------------------------------------------------------

type Push = (severity: SoundBathIssueSeverity, code: string, message: string, field?: string) => void;

function checkGlobals(preset: SoundBathPreset, push: Push): void {
  const globals = preset.globals;
  const unit: Array<[string, number | undefined]> = [
    ['density', globals.density],
    ['energy', globals.energy],
    ['brightness', globals.brightness],
    ['width', globals.width],
  ];
  for (const [name, value] of unit) {
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      push(
        'error',
        'global-out-of-range',
        `\`${name}\` runs from 0 to 1; ${value} is outside it. The scheduler clamps density and would silently accept the rest, so the value would be neither honoured nor reported.`,
        `globals.${name}`,
      );
    }
  }

  const reference = globals.tuningReferenceHz;
  if (reference !== undefined) {
    if (!Number.isFinite(reference) || reference <= 0) {
      push(
        'error',
        'tuning-reference-not-a-frequency',
        `A tuning reference of ${reference} Hz is not a frequency.`,
        'globals.tuningReferenceHz',
      );
    } else {
      const cents = 1200 * Math.log2(reference / 440);
      if (Math.abs(cents) > 100) {
        push(
          'warning',
          'tuning-reference-is-a-transposition',
          `A4 = ${reference} Hz shifts measured material by ${cents.toFixed(0)} cents, more than a semitone. Past that this is not a change of reference but a transposition of the recordings, and a struck bowl moved a semitone reads as a different bowl rather than as the same one retuned.`,
          'globals.tuningReferenceHz',
        );
      }
    }
  }
}

function checkLayerShape(layer: SoundBathLayer, push: Push): void {
  const field = (name: string) => `layers.${layer.id}.${name}`;

  if (layer.probability < 0 || layer.probability > 1) {
    push('error', 'probability-out-of-range', `Probability runs from 0 to 1; ${layer.probability} is outside it.`, field('probability'));
  }
  if (layer.intervalSec.min > layer.intervalSec.max) {
    push('error', 'interval-inverted', `\`intervalSec\` runs min to max, and ${layer.intervalSec.min} is above ${layer.intervalSec.max}.`, field('intervalSec'));
  }
  if (layer.intervalSec.min <= 0) {
    push('error', 'interval-not-positive', 'An interval of zero or less asks the layer to fire on every step of the scheduler clock.', field('intervalSec'));
  } else if (layer.intervalSec.min < 1) {
    // The scheduler walks the session in half-second steps, so anything below
    // that is a spacing it cannot represent — the layer fires every step and
    // the declared number stops meaning anything.
    push('warning', 'interval-below-scheduler-resolution', `An interval of ${layer.intervalSec.min} s is at or below the scheduler's half-second step, so the layer will attempt on every step regardless of what is written here.`, field('intervalSec'));
  }
  if (layer.gainDb.min > layer.gainDb.max) {
    push('error', 'gain-inverted', `\`gainDb\` runs min to max, and ${layer.gainDb.min} is above ${layer.gainDb.max}.`, field('gainDb'));
  }
  if (layer.panRange.min < -1 || layer.panRange.max > 1 || layer.panRange.min > layer.panRange.max) {
    push('error', 'pan-out-of-range', `Pan runs from -1 to 1 and min to max; ${layer.panRange.min} to ${layer.panRange.max} is not that.`, field('panRange'));
  }
  if (!Number.isInteger(layer.maxVoices) || layer.maxVoices < 1) {
    push('error', 'max-voices-not-a-count', `A layer needs at least one voice to play anything; ${layer.maxVoices} is not a count of voices.`, field('maxVoices'));
  }
  if (layer.reverbSend !== undefined && (layer.reverbSend < 0 || layer.reverbSend > 1)) {
    push('error', 'reverb-send-out-of-range', `Reverb send runs from 0 to 1; ${layer.reverbSend} is outside it.`, field('reverbSend'));
  }
}

/**
 * Whether a layer can ask the mixer to amplify something.
 *
 * The scheduler's event gain is `layer trim + recommendedGainDb`, and
 * `recommendedGainDb` is the offset that brings a file up to the library's
 * −23 LUFS reference — so a positive sum is a request to play a file *louder*
 * than the level the pipeline already normalised it to. On this library that is
 * not hypothetical: twelve assets carry a positive recommendation and the
 * largest is +8.44 dB, a bowl recorded at −31.44 LUFS. A layer whose pool
 * contains it and whose trim tops out at −5 dB will occasionally emit an event
 * at +3.4 dB.
 *
 * Reported against the loudest recommendation in the pool the layer actually
 * resolved, rather than against a constant, because the answer depends entirely
 * on which assets the query let in.
 */
function checkHeadroom(layer: SoundBathLayer, pool: readonly SchedulableAsset[], push: Push): void {
  let loudest = -Infinity;
  let loudestId = '';
  for (const asset of pool) {
    const recommended = asset.recommendedGainDb ?? 0;
    if (recommended > loudest) {
      loudest = recommended;
      loudestId = asset.assetId;
    }
  }
  const peak = layer.gainDb.max + loudest;
  if (peak > 0) {
    push(
      'warning',
      'layer-gain-exceeds-reference',
      `Layer "${layer.id}" can emit an event at ${peak.toFixed(2)} dB: its trim tops out at ${layer.gainDb.max} dB and ${loudestId} carries a ${loudest.toFixed(2)} dB recommendation. Above 0 the layer is amplifying material the pipeline had already brought up to the reference. Lower the trim to at most ${(-loudest).toFixed(2)} dB, or narrow the pool.`,
      `layers.${layer.id}.gainDb`,
    );
  }
}

function checkLanguage(preset: SoundBathPreset, push: Push): void {
  for (const [field, text] of [
    ['name', preset.name],
    ['description', preset.description],
  ] as const) {
    if (text.trim().length === 0) {
      push('error', 'copy-missing', `A preset with no ${field} cannot be shown to anybody.`, field);
      continue;
    }
    for (const pattern of FORBIDDEN_LANGUAGE) {
      const found = pattern.exec(text);
      if (found) {
        push(
          'error',
          'medical-language',
          `The ${field} contains "${found[0]}". §84: a sound bath is sound design and names neither a condition nor an effect.`,
          field,
        );
      }
    }
  }

  if (!preset.description.includes(ACOUSTIC_LAYER_NOTICE_MARKER)) {
    push(
      'error',
      'acoustic-layer-notice-missing',
      'The description does not distinguish the acoustic layer from the core signal. §25: a bowl is a recording of a struck bowl and the modulation comes from an oscillator, and a description that lets those blur is how "a bowl tuned to 7.83 Hz" gets written.',
      'description',
    );
  }
}

// ---------------------------------------------------------------------------
// Approval, asked separately
// ---------------------------------------------------------------------------

export interface ApprovalReport {
  /** True when every layer would still find a viable pool with approval enforced. */
  ready: boolean;
  layers: Array<{
    layerId: string;
    /** Assets the query finds ignoring approval. */
    size: number;
    /** Assets the query finds that a curator has approved. */
    approvedSize: number;
    /** True when this layer declared its pool thin on purpose, with a reason. */
    acknowledged: boolean;
  }>;
}

/**
 * Whether a preset could ship *today*.
 *
 * Kept out of `validateSoundBath` on purpose. Approval is a curator's decision
 * about individual files, made over time, and it moves independently of whether
 * a preset is well-designed: on this library it would currently mark all
 * seventeen factory presets broken, for a reason that has nothing to do with
 * any of them. Two questions, two functions, so neither answer can hide the
 * other.
 *
 * `ready` uses the same floor as the design-time check, because an approved
 * pool of three has exactly the audible problem an unapproved pool of three
 * does. A preset that is designed correctly and not yet approved is a preset
 * waiting for a person, and that is what this reports.
 */
export function validateSoundBathApproval(
  preset: SoundBathPreset,
  library: SchedulableAsset[],
): ApprovalReport {
  const layers = preset.layers.map((layer) => ({
    layerId: layer.id,
    size: resolvePool(layer.pool, library, false).length,
    approvedSize: resolvePool(layer.pool, library, true).length,
    acknowledged: layer.acknowledgedThinPool !== undefined,
  }));
  /*
   * Readiness asks whether enough of this preset's material has been cleared to
   * ship, and it uses the pool floor as its bar. A layer that acknowledged a
   * thin pool has to clear a different bar — it can never reach eight — so it
   * is asked the question that actually applies: is everything it draws on
   * approved, and is there more than one of them. A layer down to a single
   * approved asset is not ready however it was declared.
   */
  const ready = (layer: (typeof layers)[number]): boolean =>
    layer.acknowledged
      ? layer.approvedSize > 1 && layer.approvedSize === layer.size
      : layer.approvedSize >= MINIMUM_POOL_SIZE;
  return { ready: layers.length > 0 && layers.every(ready), layers };
}

// ---------------------------------------------------------------------------
// The set
// ---------------------------------------------------------------------------

export interface SoundBathSetValidation {
  ok: boolean;
  issues: SoundBathIssue[];
  /** Per-preset results, keyed by preset id, in the order given. */
  presets: Array<{ presetId: string; validation: SoundBathValidation }>;
}

/**
 * Validates a whole shelf, and the one thing only a shelf can be wrong about.
 *
 * A duplicated preset id is invisible from inside either preset and fatal from
 * outside both: a session record points at an id, and two presets answering to
 * it means the record no longer says what was played.
 */
export function validateSoundBathSet(
  presets: readonly SoundBathPreset[],
  library: SchedulableAsset[],
): SoundBathSetValidation {
  const issues: SoundBathIssue[] = [];
  const seen = new Set<string>();
  for (const preset of presets) {
    if (seen.has(preset.id)) {
      issues.push({
        severity: 'error',
        code: 'preset-id-duplicated',
        message: `Two presets share the id "${preset.id}". A session record stores an id, so a duplicate makes a listening history ambiguous about what it heard.`,
        field: 'id',
      });
    }
    seen.add(preset.id);
  }

  const results = presets.map((preset) => ({
    presetId: preset.id,
    validation: validateSoundBath({ preset, library }),
  }));
  for (const result of results) issues.push(...result.validation.issues);

  return { ok: !issues.some((issue) => issue.severity === 'error'), issues, presets: results };
}
