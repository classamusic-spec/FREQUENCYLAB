import { transformsFor } from '../archive/transforms.js';
import type { IssueSeverity } from '../graph/validate.js';
import { MAX_CARRIER_HZ, MIN_CARRIER_HZ } from '../math/constants.js';
import { MIN_STAGE_SECONDS } from '../protocol/validate.js';
import type { FrequencyPreset, RepresentationKind } from './types.js';

/**
 * Checking a preset against what it says about itself.
 *
 * A preset carries two descriptions of the same thing: the representation it
 * asks for, and the plain-language safety block beside it. They are written by
 * hand, in different places on the row, and nothing but this module stops them
 * drifting apart. A preset whose safety block says a direct tone is impossible
 * and whose representation asks for one is not a formatting problem — it is a
 * row that would play a sound its own copy says cannot be produced.
 *
 * The three checks the shelf could not ship without:
 *
 *  - `directToneAllowed: false` and a `direct` representation cannot both be
 *    true (§4);
 *  - a value recorded as a **modulation rate** must never be presented as an
 *    audible carrier — the single commonest error in this subject, and the one
 *    `SignalRole` exists to prevent;
 *  - a representation that rides on a carrier must actually have one, in a
 *    range the engine will synthesise.
 *
 * Severity follows one rule: `error` where the audio would be wrong or could
 * not be built at all, `warning` where the sound is exactly what the preset
 * names but something written beside it is not right. Compilation refuses
 * errors and passes warnings through, so a copy mistake never silently becomes
 * a different sound and never blocks a correct one.
 */

export interface PresetIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  /** Dotted path of the field at fault, e.g. `representation.carrierHz`. */
  field?: string;
}

export interface PresetValidation {
  ok: boolean;
  issues: PresetIssue[];
}

/**
 * Representations whose audible tone is a carrier the source value rides on.
 *
 * A direct tone, a subharmonic and a harmonic stack are absent because for them
 * the source value *is* the tone; a noise bed is absent because it has no tone
 * at all.
 */
const NEEDS_CARRIER: readonly RepresentationKind[] = [
  'binaural',
  'binaural-centered',
  'monaural',
  'am',
  'isochronic',
  'fm',
  'stereo-motion',
];

/**
 * Representations that present the source value as an audible pitch.
 *
 * These are the ones a modulation rate must never be given: 7.83 Hz played as a
 * pitch is silence, and 7.83 Hz played as a pitch *after* being nudged into the
 * band is a different number wearing its name.
 */
const PRESENTS_VALUE_AS_PITCH: readonly RepresentationKind[] = ['direct', 'harmonic', 'subharmonic'];

/**
 * Representations that only exist across two separated channels.
 *
 * Monaural is deliberately not here: its interference is acoustic, which is the
 * whole reason it is offered as a separate representation (§39).
 */
const NEEDS_SEPARATION: readonly RepresentationKind[] = ['binaural', 'binaural-centered'];

export function validatePreset(preset: FrequencyPreset): PresetValidation {
  const issues: PresetIssue[] = [];
  const rep = preset.representation;
  const source = preset.sourceFrequency;
  const push = (severity: IssueSeverity, code: string, message: string, field?: string) => {
    issues.push({ severity, code, message, field });
  };

  // ---------------------------------------------------------------- §4
  if (!preset.safety.directToneAllowed && rep.kind === 'direct') {
    push(
      'error',
      'direct-tone-not-allowed',
      `This preset asks for a direct tone while its own safety block says one cannot honestly be produced for ${source.value} Hz. One of the two is wrong, and playing it would settle the question the wrong way.`,
      'representation.kind',
    );
  }

  if (rep.kind === 'direct') {
    // Asked of the translator rather than re-derived, so the preset shelf and
    // the audition screen refuse the same values for the same stated reason.
    const direct = transformsFor(source.value).find((transform) => transform.kind === 'direct')!;
    if (!direct.available) {
      push('error', 'direct-tone-not-audible', direct.unavailableReason!, 'sourceFrequency.value');
    }
  }

  // ------------------------------------------------- a rate is not a pitch
  if (source.role === 'modulation' && PRESENTS_VALUE_AS_PITCH.includes(rep.kind)) {
    push(
      'error',
      'modulation-rate-as-pitch',
      `${source.value} Hz is recorded as a modulation rate, and this representation would present it as an audible pitch. A rate and a pitch are not interchangeable.`,
      'representation.kind',
    );
  }

  if (source.role === 'modulation' && source.value > 0 && rep.carrierHz === source.value) {
    push(
      'error',
      'modulation-rate-as-carrier',
      `${source.value} Hz is recorded as a modulation rate and is also given as the carrier. The carrier is the tone the rate rides on; it cannot be the rate itself.`,
      'representation.carrierHz',
    );
  }

  // ------------------------------------------------------------- carriers
  const needsCarrier =
    NEEDS_CARRIER.includes(rep.kind) || (rep.kind === 'sweep' && source.role === 'modulation');

  if (needsCarrier && rep.carrierHz === undefined) {
    push(
      'warning',
      'carrier-missing',
      'This representation rides on an audible carrier and names none, so the compiler will use its default. Stating the carrier on the row records what was actually intended.',
      'representation.carrierHz',
    );
  }

  if (rep.carrierHz !== undefined && (rep.carrierHz < MIN_CARRIER_HZ || rep.carrierHz > MAX_CARRIER_HZ)) {
    push(
      'error',
      'carrier-not-audible',
      `A carrier of ${rep.carrierHz} Hz is outside the range the engine synthesises carriers in (${MIN_CARRIER_HZ} to ${MAX_CARRIER_HZ} Hz).`,
      'representation.carrierHz',
    );
  }

  // ------------------------------------------- internal contradictions
  if (rep.kind === 'binaural-centered' && rep.calculationMode === 'offset') {
    push(
      'error',
      'calculation-mode-contradiction',
      'A centred binaural representation is set to the offset calculation. The two put different frequencies in each ear, so one of them is not what this preset means.',
      'representation.calculationMode',
    );
  }

  if (rep.kind === 'sweep' && rep.sweepToHz === undefined) {
    push(
      'error',
      'sweep-without-target',
      'A sweep needs the value it sweeps to. With one end missing there is nothing to glide towards.',
      'representation.sweepToHz',
    );
  }

  if (rep.kind === 'subharmonic' && rep.octaveShift !== undefined && rep.octaveShift >= 0) {
    push(
      'error',
      'subharmonic-shift-not-negative',
      `A subharmonic divides, so its octave shift is negative. ${rep.octaveShift} would multiply.`,
      'representation.octaveShift',
    );
  }

  if (rep.octaveShift !== undefined && !Number.isInteger(rep.octaveShift)) {
    push(
      'error',
      'octave-shift-not-whole',
      `An octave shift is a whole number of octaves; ${rep.octaveShift} is not a power of two.`,
      'representation.octaveShift',
    );
  }

  if (rep.modulationDepth !== undefined && (rep.modulationDepth < 0 || rep.modulationDepth > 1)) {
    push(
      'error',
      'modulation-depth-out-of-range',
      `Modulation depth runs from 0 to 1; ${rep.modulationDepth} is outside it.`,
      'representation.modulationDepth',
    );
  }

  if (rep.noiseLevel !== undefined && (rep.noiseLevel < 0 || rep.noiseLevel > 1)) {
    push(
      'error',
      'noise-level-out-of-range',
      `Noise level runs from 0 to 1; ${rep.noiseLevel} is outside it.`,
      'representation.noiseLevel',
    );
  }

  // A bed with no modulation is the one representation that genuinely has no
  // frequency to state — noise is a spectrum slope, not a number — so a zero
  // there is a stated absence rather than a missing value. Everywhere else a
  // representation of nothing has nothing to build.
  const unmodulatedBed = rep.kind === 'noise-modulation' && (rep.modulationDepth ?? 0) === 0;
  if (source.value <= 0 && !unmodulatedBed) {
    push(
      'error',
      'source-frequency-missing',
      'This representation needs a source frequency and the preset carries none.',
      'sourceFrequency.value',
    );
  }

  if (preset.durationSec < MIN_STAGE_SECONDS) {
    push(
      'error',
      'duration-too-short',
      `A session shorter than ${MIN_STAGE_SECONDS} seconds cannot be built.`,
      'durationSec',
    );
  }

  // ------------------------------------------------------------- routing
  if (NEEDS_SEPARATION.includes(rep.kind) && preset.safety.output !== 'headphones') {
    push(
      'warning',
      'binaural-needs-headphones',
      'A binaural difference only exists once two ears combine two channels, so this preset is offered as speaker-compatible while its effect is not. The sound is what the preset names; the routing note beside it is not.',
      'safety.output',
    );
  }

  return { ok: !issues.some((issue) => issue.severity === 'error'), issues };
}
