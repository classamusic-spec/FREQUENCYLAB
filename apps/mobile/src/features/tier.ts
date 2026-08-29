import {
  type ExperienceLevel,
  type FrequencyPreset,
  type Protocol,
} from '@frequencylab/dsp-core';
import { usePreferences } from '../state/preferences';

/**
 * What each experience level is allowed to show.
 *
 * The level has existed since the first build: onboarding asked for it, Profile
 * offered it, `UserPreferences` stored it — and exactly one line in the app read
 * it, a ternary whose two branches returned the same string. It changed nothing.
 * This module is where it starts meaning something.
 *
 * ## The rule the tiers follow
 *
 * A tier hides *vocabulary and controls*, never *honesty*. Every classification
 * badge, every evidence rating and every safety statement is shown at all three
 * levels, because those are what stop a number being mistaken for a claim.
 * What Simple removes is the machine underneath: hertz, carriers, engine names,
 * Protocol DNA, the builder, trials. A person who wants to feel calmer does not
 * need to know that 8 Hz is a difference between two sine waves to be told,
 * truthfully, that the shelf it sits on is traditional rather than researched.
 *
 * That distinction is the whole design. If a future capability is a *claim*,
 * it does not get tiered — it gets shown everywhere or not at all.
 *
 * ## Why capabilities rather than screens
 *
 * `canSee('hertz')` reads at the call site as what it actually controls.
 * `level === 'simple'` scattered through thirty screens is the same logic with
 * the reason removed, and it is what makes tiering rot: the next person cannot
 * tell whether a check is about vocabulary, safety or layout.
 */

/**
 * Everything a tier can gate, and nothing that it cannot.
 *
 * Each name is a thing a person would recognise on screen, not a component or a
 * route — several screens consult the same capability and that is the point.
 */
export type Capability =
  /** Frequencies in hertz, anywhere: readouts, captions, preset names. */
  | 'hertz'
  /** Carrier, beat, engine names — binaural, monaural, isochronic, AM, FM. */
  | 'signalDetail'
  /** Protocol DNA strings and fingerprints. */
  | 'dna'
  /** The Lab tab: builder, automation lanes, routing, stage editing. */
  | 'lab'
  /** The Trials tab and everything blinded-experiment shaped. */
  | 'trials'
  /** The Explore tab and the free-running encoder. */
  | 'explore'
  /** The frequency library, its collections and the historical archive. */
  | 'library'
  /** Choosing how a frequency is heard, rather than taking the shipped one. */
  | 'representation'
  /** WAV export, share codes, DNA import, diagnostics. */
  | 'engineering'
  /** Per-instrument levels for the acoustic layer. */
  | 'mixer';

const CAPABILITIES: Record<ExperienceLevel, ReadonlySet<Capability>> = {
  /*
   * Simple is a complete product, not a crippled one. It plays sessions, it
   * chooses acoustic layers, it keeps history and it rates. What it does not do
   * is name the mechanism.
   */
  simple: new Set<Capability>([]),

  /*
   * Explorer is where the numbers arrive. Someone at this level has decided
   * they want to know what is happening, so hertz, carriers and engine names
   * are all shown, along with the library that explains where the numbers came
   * from and the picker that lets a value be heard a different way.
   */
  explorer: new Set<Capability>([
    'hertz',
    'signalDetail',
    'explore',
    'library',
    'representation',
    'mixer',
  ]),

  /** Lab is the instrument as built. Nothing is withheld. */
  lab: new Set<Capability>([
    'hertz',
    'signalDetail',
    'dna',
    'lab',
    'trials',
    'explore',
    'library',
    'representation',
    'engineering',
    'mixer',
  ]),
};

export function capabilitiesFor(level: ExperienceLevel): ReadonlySet<Capability> {
  return CAPABILITIES[level] ?? CAPABILITIES.simple;
}

export function levelCanSee(level: ExperienceLevel, capability: Capability): boolean {
  return capabilitiesFor(level).has(capability);
}

/**
 * The tier the user is at, and what it lets them see.
 *
 * `canSee` rather than the raw level, so a screen states the reason it is
 * hiding something. Read the level directly only where the *level itself* is
 * the subject — the Profile control that changes it, and the prompt that offers
 * an upgrade.
 */
export function useTier(): {
  level: ExperienceLevel;
  canSee: (capability: Capability) => boolean;
  isSimple: boolean;
} {
  const level = usePreferences((state) => state.preferences.experienceLevel);
  return {
    level,
    canSee: (capability) => levelCanSee(level, capability),
    isSimple: level === 'simple',
  };
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/**
 * The plain-language name for something, or the instrument's own name for it.
 *
 * Substitution only where the plain word is *true*. `Session` for `Protocol` is
 * a rename; `Headphones only` for `Binaural` is a rename that also happens to
 * be the thing a listener actually needs to know. Nothing here softens a
 * limitation into a feature, and nothing here replaces a classification.
 */
const PLAIN_WORDS: Record<string, string> = {
  Protocol: 'Session',
  protocol: 'session',
  Protocols: 'Sessions',
  protocols: 'sessions',
  'Protocol DNA': 'Recipe',
  'Acoustic layer': 'Background sounds',
  'acoustic layer': 'background sounds',
  Representation: 'How it plays',
  representation: 'how it plays',
  Carrier: 'Tone',
  carrier: 'tone',
};

export function plainWord(term: string, level: ExperienceLevel): string {
  if (level !== 'simple') return term;
  return PLAIN_WORDS[term] ?? term;
}

/**
 * The engines, described by what a listener has to do about them.
 *
 * A binaural beat does not exist in the air — it is assembled from two tones,
 * one per ear, so a speaker cannot produce it. That is not jargon a tier may
 * hide; it is the single most practical fact about the signal. Simple mode
 * therefore keeps the fact and drops the word.
 */
export function engineInPlainWords(engine: string): string {
  switch (engine) {
    case 'binaural':
    case 'binaural-centered':
      return 'Headphones only';
    case 'monaural':
    case 'isochronic':
      return 'Speakers or headphones';
    case 'am':
    case 'fm':
    case 'noise-modulation':
      return 'Speakers or headphones';
    default:
      return 'Speakers or headphones';
  }
}

/**
 * How a session sounds, said without a number.
 *
 * Bands rather than values, because a band is the honest resolution of the
 * claim anyway: nothing about 8.0 Hz is meaningfully different from 8.2 Hz, and
 * showing two decimal places to somebody who does not want them implies a
 * precision that matters. The words describe rate, not effect — `Slow pulse`
 * is a description of the sound; `Relaxing` would be a claim.
 */
export function paceInPlainWords(beatHz: number): string {
  if (beatHz <= 0) return 'Steady tone';
  if (beatHz < 4) return 'Very slow pulse';
  if (beatHz < 8) return 'Slow pulse';
  if (beatHz < 13) return 'Gentle pulse';
  if (beatHz < 30) return 'Quick pulse';
  return 'Fast flutter';
}

/** The same, for a preset whose value may be a rate or a pitch. */
export function presetInPlainWords(preset: FrequencyPreset): string {
  const value = preset.sourceFrequency.value;
  const kind = preset.representation.kind;
  if (kind === 'direct' || kind === 'harmonic' || kind === 'subharmonic') {
    if (value >= 2000) return 'Very bright tone';
    if (value >= 800) return 'Bright tone';
    if (value >= 300) return 'Clear tone';
    if (value >= 120) return 'Warm tone';
    return 'Deep tone';
  }
  return paceInPlainWords(value);
}

/** A protocol's pace, taken from its first stage that states a beat. */
export function protocolInPlainWords(protocol: Protocol): string {
  for (const stage of protocol.stages) {
    for (const node of stage.graph.nodes) {
      const params = node.params as Record<string, unknown> | undefined;
      const beat = params?.beatHz ?? params?.rateHz;
      if (typeof beat === 'number' && beat > 0) return paceInPlainWords(beat);
    }
  }
  return 'Steady tone';
}
