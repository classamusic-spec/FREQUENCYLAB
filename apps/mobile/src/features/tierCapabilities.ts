import {
  type ExperienceLevel,
  type FrequencyPreset,
  type Protocol,
} from '@frequencylab/dsp-core';

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
 * ## Why this file has no React in it
 *
 * `useTier` lives next door in `tier.ts`. Everything here is a plain
 * function of a level, which is what lets the contract be tested: the hook
 * reaches the preferences store and so drags React Native in behind it, and
 * the app's test runner cannot parse that. A rule nobody can test is a rule
 * that quietly stops being true.
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

/**
 * The rate parameters a generator node can carry.
 *
 * `beat` on the binaural and monaural engines, `rate` on the isochronic one.
 * Named here rather than guessed at, because the first version of this function
 * looked for `beatHz` and `rateHz` — which are the names used by the *builder's*
 * options, not by the nodes it builds. Every protocol therefore came back
 * `Steady tone`, and nothing noticed because the function had no call site yet.
 */
const RATE_KEYS = ['beat', 'rate'] as const;

/**
 * A protocol's pace, in words, taken from the stage it spends longest in.
 *
 * The longest stage rather than the first, because these protocols are arcs:
 * `Wind Down` opens at 8 Hz and spends most of its length at 3. Reading the
 * opening would call it a gentle pulse when what a listener is mostly hearing
 * is a very slow one — and the number it replaces on screen is the plateau, so
 * the words have to describe the same thing the number did.
 *
 * Ties go to the earlier stage, which is the one a listener meets first.
 */
export function protocolInPlainWords(protocol: Protocol): string {
  let bestRate = 0;
  let bestSeconds = -1;

  for (const stage of protocol.stages) {
    for (const node of stage.graph.nodes) {
      const params = node.params as Record<string, unknown> | undefined;
      if (!params) continue;
      for (const key of RATE_KEYS) {
        const rate = params[key];
        if (typeof rate !== 'number' || rate <= 0) continue;
        if (stage.durationSec > bestSeconds) {
          bestSeconds = stage.durationSec;
          bestRate = rate;
        }
      }
    }
  }

  return bestRate > 0 ? paceInPlainWords(bestRate) : 'Steady tone';
}
