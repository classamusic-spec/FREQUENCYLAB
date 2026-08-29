import type {
  AssetPool,
  Range,
  SoundBathGlobals,
  SoundBathLayer,
  SoundBathPreset,
} from './soundbath.js';

/**
 * The factory sound baths.
 *
 * Nineteen presets, written against the 369 assets actually in this
 * repository. Every pool below was resolved against that library before it was
 * committed and every count in a comment here is a real one — a preset whose
 * query is plausible and returns four assets is worse than no preset at all,
 * because it ships, plays, and loops audibly (§16), and `validate.ts` beside
 * this file exists to make that a build failure rather than a review note.
 *
 * ## What a layer is allowed to set
 *
 * Only the fields that reach a consumer. `SoundBathLayer` offers five more —
 * `minimumRestSec`, `priority`, `fadeInSec`, `fadeOutSec` and `pitchStrategy` —
 * and none of them is set anywhere in this file, because the scheduler's entire
 * contract with the player is the `SoundBathEvent` list, and of the optional
 * layer fields only `reverbSend` survives into an event. Two of the five would
 * change the shape of a session if they were read, and are worth naming so the
 * absence is a decision rather than an oversight:
 *
 *  - **`priority`** is documented as deciding which layer wins when polyphony is
 *    contended. The scheduler does not consult it; it walks `preset.layers` in
 *    declared order and the first layer to reach a free voice takes it. So
 *    *declaration order is the priority* in these presets, and beds and primary
 *    bowls are declared first everywhere on purpose. Writing a `priority` number
 *    beside that would be a second, contradictable statement of the same thing.
 *  - **`minimumRestSec`** is documented as enforced quiet after a sound ends.
 *    The scheduler computes it and does not apply it, so a layer setting it
 *    would be asking for silence it will not get. Where these presets want a
 *    layer to breathe they lower `probability`, which the scheduler does read.
 *
 * ## Gain
 *
 * Every asset in the library peaks at exactly −1.0 dBFS, so peak level says
 * nothing about how loud anything is; `recommendedGainDb` is the only real
 * level information, and it is the offset that brings a file to the library's
 * −23 LUFS reference. The scheduler adds it to the layer's own `gainDb`, which
 * makes `gainDb` here a **trim relative to that reference** and not an absolute
 * level: 0 dB is a layer sitting at the reference, −12 dB is a layer twelve
 * decibels under it. Everything here is between −18 and −4, because an acoustic
 * layer that comes forward of the core tone is a different instrument.
 *
 * One consequence is worth stating because it explains why some bowl layers sit
 * lower than their role would suggest: twelve assets carry a *positive*
 * `recommendedGainDb`, and the largest is +8.44 dB — a small, soft bowl
 * recorded at −31.44 LUFS. Any layer whose pool contains it needs a trim of at
 * most −8.44 dB or the sum is a request to amplify a file the pipeline has
 * already brought up to the reference. `LONG_BOWLS` and `BRIGHT_BOWLS` both
 * contain it, so every layer drawing on them stops at −9. `validate.ts` checks
 * this against the real library rather than leaving it to be remembered.
 *
 * ## Density, and why the intervals are written the way they are
 *
 * `densityInterval` multiplies a layer's interval by `3 − 2.5·density`, so a
 * declared interval is the spacing you actually hear only at a density of 0.8.
 * These presets sit between 0.22 and 0.56 — low enough that the control has
 * somewhere to go in both directions — and across that span the multiplier runs
 * from 2.45 down to 1.60. Rather than write pre-divided numbers nobody can read
 * back, each layer states the spacing it means and `every()` divides it out. So
 * `every(36, 58)` is a layer *attempting* every thirty-six to fifty-eight
 * seconds at this preset's own density, and `probability` then decides how many
 * of those attempts become sounds. Moving the control moves both.
 *
 * ## What the library cannot do, stated once
 *
 * There is no drone in this library. Nothing loops except 62 kalimba phrases
 * and 3 bells, none of which is bed material, and there are only 11 EXTENDED
 * assets in total — 8 bowls and 3 Koshi chimes. So no preset here declares a
 * bed made of EXTENDED material: four presets doing that would be four presets
 * sharing the same eight bowls, which is the audible rotation this file is
 * trying to avoid. What stands in for a bed is a long-bowl layer with a low
 * voice count and a long tail, and that is what it is called.
 *
 * ## Names and copy
 *
 * Nothing here is named after a condition and nothing here claims an effect
 * (§84). Every description ends with `ACOUSTIC_LAYER_NOTICE`, appended by
 * `soundBath()` rather than by hand, because §25's distinction — the bowl is
 * not producing the modulation — is the one sentence a preset must never be
 * shipped without, and remembering to type it nineteen times is not a control.
 */

/**
 * The sentence every preset carries.
 *
 * §25: the acoustic layer and the core signal are two different things, and
 * conflating them is how "a bowl tuned to 7.83 Hz" gets written. A bowl is a
 * recording of a struck bowl; the rate comes from an oscillator; they share a
 * session and nothing else.
 */
export const ACOUSTIC_LAYER_NOTICE =
  'This is the acoustic layer. It places recorded strikes in time and produces no modulation of its own — no beat, no rate, nothing periodic. Any beat in a session comes from the core signal underneath, which runs whether this layer is playing or silent.';

/**
 * Bumped when a preset's parameters change, so a session record stays readable.
 *
 * One number for all nineteen, so a change to any of them moves all of them.
 * That is coarser than it could be and is the right trade: the version exists
 * so a stored session can say which parameters produced it, and nineteen
 * separately drifting counters would be nineteen things to forget.
 *
 * 2 — `Deep Calm`, `Earth Resonance`, `528 Organic` and `Theta Bath` were
 * brought onto §27–§30's stated parameters; `Kalimba Passages` and `Chime
 * Drift` were added to reach the fifteen assets no pool could play.
 */
const FACTORY_VERSION = 2;

// ---------------------------------------------------------------------------
// Pools
// ---------------------------------------------------------------------------

/*
 * Named queries, with the size each one resolves to on organic library 0.1.0.
 *
 * The counts are documentation, not assertions — `validate.ts` holds the floor
 * and the test suite enforces it, so a pack that halves one of these fails
 * loudly instead of quietly thinning a preset. They are written down because a
 * reader choosing between two queries needs to know that one of them returns
 * ten assets and the other forty-one.
 *
 * `preferredTags` is deliberately absent from every pool here and set on the
 * layer instead: it is a weight, not a filter, and putting it in the shared
 * query would apply one layer's bias to every layer that reuses the pool.
 *
 * And no `preferredTags` list in this file names a tag that nearly everything
 * in its pool already carries. `sustained`, `long_decay` and `metallic` are on
 * every long bowl there is, so preferring one multiplies all sixty-six weights
 * by 1.6 and steers precisely nothing — it reads like a decision and is an
 * identity. The tags that actually separate bowls are `warm` (22 of 66), `low`
 * (14), `dark` and `deep` (11 each) and `tonal` (26), and those are the ones
 * used.
 */

/** 66 bowls, the whole long end of the instrument. */
const LONG_BOWLS: AssetPool = {
  instruments: ['SINGING_BOWL'],
  durationClasses: ['LONG', 'EXTENDED'],
};

/**
 * 41 bowls with the bright ones cut.
 *
 * An exclusion rather than a low `brightness` global, because the two do
 * different jobs: the global steers and still reaches the occasional bright
 * bowl, which is what stops a long session settling into one colour, while this
 * removes the material outright. The dark presets want both — a hard floor on
 * what can appear, and steering inside what remains.
 */
const DARK_BOWLS: AssetPool = {
  instruments: ['SINGING_BOWL'],
  durationClasses: ['LONG', 'EXTENDED'],
  excludedTags: ['bright'],
};

/** 24 bowls at the top of the bowl range, 0.58 to 0.81 brightness. */
const BRIGHT_BOWLS: AssetPool = {
  instruments: ['SINGING_BOWL'],
  durationClasses: ['LONG'],
  requiredTags: ['bright'],
};

/** 16 bowls tagged warm, 0.22 to 0.45 brightness — the smallest bowl pool used. */
const WARM_BOWLS: AssetPool = {
  instruments: ['SINGING_BOWL'],
  durationClasses: ['LONG'],
  requiredTags: ['warm'],
};

/** 44 bells with the high ones cut: 0.49 to 0.76 brightness, 5 to 11 seconds. */
const SOFT_BELLS: AssetPool = {
  instruments: ['BELL'],
  durationClasses: ['SHORT', 'MEDIUM'],
  excludedTags: ['high'],
};

/** 57 bells at the top of the library, 0.77 to 0.99 brightness. */
const HIGH_BELLS: AssetPool = {
  instruments: ['BELL'],
  durationClasses: ['SHORT', 'MEDIUM'],
  requiredTags: ['high'],
};

/** 101 bells — everything but the single MICRO strike, which is too short to place. */
const BELLS: AssetPool = {
  instruments: ['BELL'],
  durationClasses: ['SHORT', 'MEDIUM'],
};

/** 85 chimes, 2 to 19 seconds. */
const CHIMES: AssetPool = {
  instruments: ['CHIME'],
  durationClasses: ['SHORT', 'MEDIUM'],
};

/** 27 chimes tagged airy, the shimmering end of the Koshi material. */
const AIRY_CHIMES: AssetPool = {
  instruments: ['CHIME'],
  durationClasses: ['SHORT', 'MEDIUM'],
  requiredTags: ['airy'],
};

/** 26 chimes of 6 to 19 seconds — long enough to overlap each other. */
const LONG_CHIMES: AssetPool = {
  instruments: ['CHIME'],
  durationClasses: ['MEDIUM'],
};

/** 91 kalimba phrases and strikes, 2.7 to 18 seconds. */
const KALIMBA: AssetPool = {
  instruments: ['KALIMBA'],
  durationClasses: ['SHORT', 'MEDIUM'],
};

/** 78 kalimba with the bright ones cut, 0.42 to 0.58 brightness. */
const SOFT_KALIMBA: AssetPool = {
  instruments: ['KALIMBA'],
  durationClasses: ['SHORT', 'MEDIUM'],
  excludedTags: ['bright'],
};

/*
 * The three pools that hold a whole instrument.
 *
 * Every other pool above narrows by duration class, which is usually right —
 * a bell layer wants strikes and not the one-second MICRO — and had one
 * consequence nobody had counted: fifteen assets were in no preset's pool at
 * all. Nine long kalimba passages of twenty to forty-six seconds, the four
 * longest Koshi chimes at fifty-seven to seventy-two, and two medium bowls.
 * They were shipped, measured, approved, and unreachable.
 *
 * These three exist so `Kalimba Passages` and `Chime Drift` can reach them.
 * They are the material those two presets are *about*, not a widening of an
 * existing preset's net: a long chime is a different instrument from a chime
 * strike, and putting one in `Silver Chimes` would change what that preset is.
 */

/** All 100 kalimba, including the 9 LONG phrases nothing else reaches. */
const ALL_KALIMBA: AssetPool = {
  instruments: ['KALIMBA'],
  durationClasses: ['SHORT', 'MEDIUM', 'LONG'],
};

/** All 89 chimes, including the 3 EXTENDED and 1 LONG Koshi ring-outs. */
const ALL_CHIMES: AssetPool = {
  instruments: ['CHIME'],
  durationClasses: ['SHORT', 'MEDIUM', 'LONG', 'EXTENDED'],
};

/** All 68 bowls, including the 2 MEDIUM ones the LONG pools exclude. */
const ALL_BOWLS: AssetPool = {
  instruments: ['SINGING_BOWL'],
  durationClasses: ['MEDIUM', 'LONG', 'EXTENDED'],
};

/**
 * All 10 tuning forks, and there will not be more.
 *
 * No duration class filter, because splitting them gives 7 and 3 and neither
 * half is a pool. Even undivided this is the thinnest thing any preset here
 * draws on, and it is thinner than ten: four of the ten ring at 383.63 Hz and
 * three at 127.8 Hz, so the ear has about five pitches to distinguish. That is
 * why no layer using this fires often — see `Tuning Fork Space`, which is the
 * only preset that puts forks in front, and puts them a long way apart.
 */
const TUNING_FORKS: AssetPool = { instruments: ['TUNING_FORK'] };

// ---------------------------------------------------------------------------
// Building a preset
// ---------------------------------------------------------------------------

/** Real seconds between attempts on a layer, at this preset's density. */
type Spacing = (minSec: number, maxSec: number) => Range;

interface SoundBathSpec {
  id: string;
  name: string;
  /** The preset's own copy. `ACOUSTIC_LAYER_NOTICE` is appended, never typed. */
  copy: string;
  globals: SoundBathGlobals;
  /** Given `every`, which converts real spacing at this preset's own density. */
  layers: (every: Spacing) => SoundBathLayer[];
}

function soundBath(spec: SoundBathSpec): SoundBathPreset {
  const density = spec.globals.density;
  const factor = 3 - 2.5 * density;
  const every: Spacing = (minSec, maxSec) => ({
    min: Math.round((minSec / factor) * 10) / 10,
    max: Math.round((maxSec / factor) * 10) / 10,
  });
  return {
    id: spec.id,
    version: FACTORY_VERSION,
    name: spec.name,
    description: `${spec.copy} ${ACOUSTIC_LAYER_NOTICE}`,
    globals: spec.globals,
    layers: spec.layers(every),
  };
}

// ---------------------------------------------------------------------------
// The presets
// ---------------------------------------------------------------------------

/**
 * Deep Calm.
 *
 * §27, and the only preset in this file whose parameters were given rather than
 * derived from the library: four layers, their intervals, their relative
 * weights and four globals. Everything below either is one of those numbers or
 * says here why it is not.
 *
 * **Weight became `probability`.** The spec weights the layers 1.5 / 1.0 / 0.7
 * / 0.2 and `SoundBathLayer` has no `weight` field, because `probability`
 * already decides how many of a layer's attempts become sounds and a second
 * control doing the same job is a control that can contradict the first. The
 * ratios survive exactly: each weight over the largest, scaled so the heaviest
 * layer sits at 0.9, giving 0.90 / 0.60 / 0.42 / 0.12.
 *
 * **Reverb 40% became four sends of 0.40.** `SoundBathGlobals` has no reverb
 * scalar — only a named space and a per-layer send — so the number is set on
 * every layer rather than gestured at with a preset name.
 *
 * **The air chime prefers `airy` rather than requiring it.** 27 of the 85
 * chimes carry the tag, and preferring it across all 85 leaves 63.5 effectively
 * in play where requiring it leaves 19.6. That is the difference between a
 * layer that sounds airy and a layer that plays the same twenty-seven files.
 *
 * Shares a name with the multi-stage protocol in `protocol/factoryProtocols.ts`
 * and that is deliberate: this is the acoustic layer written to sit under that
 * descent, and the two are meant to be selected together. §27's core half — a
 * 6 Hz binaural beat on a 200 Hz carrier under a pink bed at 8% — is the point
 * that protocol's `Descend` stage arrives at. They are separate objects in
 * separate namespaces and neither depends on the other.
 */
function deepCalm(): SoundBathPreset {
  return soundBath({
    id: 'soundbath.deep_calm',
    name: 'Deep Calm',
    copy:
      'Dark bowls from the bottom of the library — the twenty-five long bowls tagged bright are excluded outright rather than turned down — with a softer bowl answering from further back, airy chimes a long way above them, and a kalimba that arrives only a handful of times in a session.',
    globals: {
      density: 0.3,
      energy: 0.3,
      brightness: 0.25,
      reverbPreset: 'hall',
      width: 0.6,
    },
    layers: (every) => [
      {
        id: 'deep-bowls',
        role: 'PRIMARY_BOWL',
        pool: { ...DARK_BOWLS, preferredTags: ['warm'] },
        intervalSec: every(50, 110),
        probability: 0.9,
        gainDb: { min: -8, max: -4 },
        panRange: { min: -0.25, max: 0.25 },
        maxVoices: 2,
        reverbSend: 0.4,
      },
      {
        id: 'soft-bowls',
        role: 'SECONDARY_BOWL',
        pool: LONG_BOWLS,
        intervalSec: every(40, 100),
        probability: 0.6,
        // Stops at −9 because `LONG_BOWLS` holds the +8.44 dB bowl.
        gainDb: { min: -13, max: -9 },
        panRange: { min: -0.6, max: 0.6 },
        maxVoices: 1,
        reverbSend: 0.4,
      },
      {
        id: 'air-chimes',
        role: 'AIR',
        pool: { ...CHIMES, preferredTags: ['airy'] },
        intervalSec: every(70, 160),
        probability: 0.42,
        gainDb: { min: -18, max: -13 },
        panRange: { min: -0.75, max: 0.75 },
        maxVoices: 2,
        reverbSend: 0.4,
      },
      {
        id: 'kalimba',
        role: 'KALIMBA',
        pool: SOFT_KALIMBA,
        intervalSec: every(90, 220),
        probability: 0.12,
        gainDb: { min: -19, max: -14 },
        panRange: { min: -0.5, max: 0.5 },
        maxVoices: 1,
        reverbSend: 0.4,
      },
    ],
  });
}

/**
 * Earth Resonance.
 *
 * §28. The Schumann resonance is a real electromagnetic phenomenon in the
 * Earth–ionosphere cavity, and this preset does not reproduce it, approximate
 * it or stand in for it. It is named after the core signal it was written to
 * accompany — a 7.83 Hz binaural difference on a 220 Hz carrier, which is
 * `7.83 Hz — First mode` in `presets/factoryLab.ts` and is itself an acoustic
 * analogy documented as one in `library/entries.ts`.
 *
 * Three of the spec's five organic elements are here as asked: the deep bowl,
 * the low tuning fork and the very sparse upper chime. The other two are not,
 * and the reasons are in the library rather than in this file.
 *
 *  - **There is no earth-style chime in this library.** All 89 chimes measure a
 *    brightness of 0.56 or above and not one carries `warm`, `low`, `dark` or
 *    `deep` — the low chime the spec is reaching for does not exist here. The
 *    layer takes the 26 chimes of MEDIUM duration, which are the longest, and
 *    prefers the `gentle` tag inside them. That is the darkest, slowest chime
 *    material available, and it is still a bright instrument.
 *  - **Brown noise is not an organic layer.** Noise comes from the core signal
 *    — `noise: { color: 'brown' }` on a protocol stage — and `LayerRole` has no
 *    noise role, because a library of struck recordings contains no noise bed.
 *    A layer asking for one would resolve to nothing.
 *
 * The low fork prefers rather than filters, for the reason the air chime does
 * in `Deep Calm` and more sharply: 3 of the 10 forks carry `low`, and three is
 * not a pool. Preferring keeps all ten reachable and 9.0 of them effectively in
 * play, with the low three coming up most often.
 *
 * The spec also asks for slow stereo motion. A `SoundBathEvent` carries a
 * single `pan` fixed when it is scheduled and nothing that moves it, so this
 * preset spreads its layers across the field and none of them travels. The
 * moving spatialisation of §38 is not built, here or anywhere.
 */
function earthResonance(): SoundBathPreset {
  return soundBath({
    id: 'soundbath.earth_resonance',
    name: 'Earth Resonance',
    copy:
      'The low, warm end of the bowl library, with tuning forks underneath, the darkest and longest chimes this library has kept well back, and a rare bright chime above. It is named after the core signal it was written to accompany. The Schumann resonance is an electromagnetic phenomenon in the atmosphere; headphones make sound, so nothing acoustic reproduces it and nothing here is trying to.',
    globals: {
      density: 0.3,
      energy: 0.25,
      brightness: 0.22,
      reverbPreset: 'cavern',
      width: 0.6,
    },
    layers: (every) => [
      {
        id: 'ground',
        role: 'GROUNDING',
        // Steered low with weights rather than filtered to the 11 bowls tagged
        // `low`. That query resolves to eleven, which passes a count check, and
        // then the globals here leave about 7.8 of them genuinely in play —
        // still over the effective floor, but with the margin gone, and the
        // count on its own would not have said so. Preferring the tags instead
        // keeps the same colour and draws it out of forty-one.
        pool: { ...DARK_BOWLS, preferredTags: ['low', 'deep', 'warm'] },
        intervalSec: every(40, 62),
        probability: 0.9,
        gainDb: { min: -7, max: -4 },
        panRange: { min: -0.2, max: 0.2 },
        maxVoices: 2,
        reverbSend: 0.5,
      },
      {
        id: 'forks',
        role: 'TUNING_FORK',
        pool: { ...TUNING_FORKS, preferredTags: ['low'] },
        intervalSec: every(56, 88),
        probability: 0.55,
        gainDb: { min: -10, max: -6 },
        panRange: { min: -0.3, max: 0.3 },
        maxVoices: 1,
        reverbSend: 0.45,
      },
      {
        id: 'low-chimes',
        role: 'CHIME',
        pool: { ...LONG_CHIMES, preferredTags: ['gentle'] },
        intervalSec: every(54, 92),
        probability: 0.5,
        gainDb: { min: -17, max: -12 },
        panRange: { min: -0.6, max: 0.6 },
        maxVoices: 2,
        reverbSend: 0.45,
      },
      {
        id: 'upper-chimes',
        role: 'SPARKLE',
        // "Very sparse" is a long interval and a low probability together: one
        // without the other gives either a metronome or a clump.
        pool: { ...CHIMES, preferredTags: ['airy', 'high'] },
        intervalSec: every(120, 240),
        probability: 0.3,
        gainDb: { min: -22, max: -17 },
        panRange: { min: -0.85, max: 0.85 },
        maxVoices: 1,
        reverbSend: 0.4,
      },
    ],
  });
}

/** Silver Chimes. */
function silverChimes(): SoundBathPreset {
  return soundBath({
    id: 'soundbath.silver_chimes',
    name: 'Silver Chimes',
    copy:
      'Chimes and the brightest bells, placed quickly and spread wide, over a bowl floor that is present without ever coming forward. The scheduler pulls its own brightness back when four bright events land inside a minute, so the top of this settles itself.',
    globals: {
      density: 0.46,
      energy: 0.55,
      brightness: 0.72,
      reverbPreset: 'plate',
      width: 0.9,
    },
    layers: (every) => [
      {
        id: 'bowl-floor',
        role: 'SECONDARY_BOWL',
        pool: BRIGHT_BOWLS,
        intervalSec: every(30, 46),
        probability: 0.55,
        gainDb: { min: -14, max: -10 },
        panRange: { min: -0.3, max: 0.3 },
        maxVoices: 1,
        reverbSend: 0.45,
      },
      {
        id: 'chimes',
        role: 'CHIME',
        pool: { ...CHIMES, preferredTags: ['airy'] },
        intervalSec: every(14, 22),
        probability: 0.85,
        gainDb: { min: -13, max: -8 },
        panRange: { min: -0.7, max: 0.7 },
        maxVoices: 3,
        reverbSend: 0.35,
      },
      {
        id: 'silver-bells',
        role: 'SPARKLE',
        pool: HIGH_BELLS,
        intervalSec: every(16, 26),
        probability: 0.8,
        gainDb: { min: -17, max: -12 },
        panRange: { min: -0.85, max: 0.85 },
        maxVoices: 2,
        reverbSend: 0.4,
      },
    ],
  });
}

/** Deep Bowls. */
function deepBowls(): SoundBathPreset {
  return soundBath({
    id: 'soundbath.deep_bowls',
    name: 'Deep Bowls',
    copy:
      'Singing bowls and nothing else: a dark primary layer, a slower bowl answering it, and a third layer of warm bowls kept quiet at the edges of the image.',
    globals: {
      density: 0.28,
      energy: 0.35,
      brightness: 0.28,
      reverbPreset: 'hall',
      width: 0.65,
    },
    layers: (every) => [
      {
        id: 'primary-bowls',
        role: 'PRIMARY_BOWL',
        pool: DARK_BOWLS,
        intervalSec: every(34, 54),
        probability: 0.9,
        gainDb: { min: -7, max: -4 },
        panRange: { min: -0.25, max: 0.25 },
        maxVoices: 2,
        reverbSend: 0.45,
      },
      {
        id: 'second-bowls',
        role: 'SECONDARY_BOWL',
        pool: LONG_BOWLS,
        intervalSec: every(44, 70),
        probability: 0.65,
        gainDb: { min: -13, max: -9 },
        panRange: { min: -0.55, max: 0.55 },
        maxVoices: 1,
        reverbSend: 0.5,
      },
      {
        id: 'edge-bowls',
        role: 'TEXTURAL',
        pool: WARM_BOWLS,
        intervalSec: every(52, 84),
        probability: 0.45,
        gainDb: { min: -17, max: -13 },
        panRange: { min: -0.85, max: 0.85 },
        maxVoices: 1,
        reverbSend: 0.55,
      },
    ],
  });
}

/** Float. */
function float(): SoundBathPreset {
  return soundBath({
    id: 'soundbath.float',
    name: 'Float',
    copy:
      'Long sustained bowls with airy chimes above them and soft bells between. The bowls are chosen for how they decay rather than for what note they are — thirty of the sixty-six have no note the analysis could confirm, and not one of them is asked to have one.',
    globals: {
      density: 0.36,
      energy: 0.35,
      brightness: 0.5,
      reverbPreset: 'hall',
      width: 0.8,
    },
    layers: (every) => [
      {
        id: 'sustain',
        role: 'DRONE',
        pool: LONG_BOWLS,
        intervalSec: every(40, 64),
        probability: 0.85,
        gainDb: { min: -12, max: -9 },
        panRange: { min: -0.3, max: 0.3 },
        maxVoices: 2,
        reverbSend: 0.5,
      },
      {
        id: 'air',
        role: 'AIR',
        pool: AIRY_CHIMES,
        intervalSec: every(22, 34),
        probability: 0.7,
        gainDb: { min: -15, max: -10 },
        panRange: { min: -0.8, max: 0.8 },
        maxVoices: 2,
        reverbSend: 0.4,
      },
      {
        id: 'bells',
        role: 'BELL',
        pool: SOFT_BELLS,
        intervalSec: every(24, 38),
        probability: 0.65,
        gainDb: { min: -16, max: -11 },
        panRange: { min: -0.7, max: 0.7 },
        maxVoices: 2,
        reverbSend: 0.4,
      },
    ],
  });
}

/** Inner Space. */
function innerSpace(): SoundBathPreset {
  return soundBath({
    id: 'soundbath.inner_space',
    name: 'Inner Space',
    copy:
      'The sparsest preset in this set. A long bowl every couple of minutes, a single soft bell somewhere between, and a great deal of a session that is silence with something still ringing in it.',
    globals: {
      density: 0.22,
      energy: 0.28,
      brightness: 0.38,
      reverbPreset: 'cavern',
      width: 0.85,
    },
    layers: (every) => [
      {
        id: 'far-bowls',
        role: 'DRONE',
        pool: LONG_BOWLS,
        intervalSec: every(42, 68),
        probability: 0.85,
        gainDb: { min: -12, max: -9 },
        panRange: { min: -0.35, max: 0.35 },
        maxVoices: 1,
        reverbSend: 0.55,
      },
      {
        id: 'single-bells',
        role: 'BELL',
        pool: SOFT_BELLS,
        intervalSec: every(26, 42),
        probability: 0.55,
        gainDb: { min: -17, max: -12 },
        panRange: { min: -0.9, max: 0.9 },
        maxVoices: 1,
        reverbSend: 0.5,
      },
    ],
  });
}

/** Morning Clarity. */
function morningClarity(): SoundBathPreset {
  return soundBath({
    id: 'soundbath.morning_clarity',
    name: 'Morning Clarity',
    copy:
      'Kalimba, chimes and bells at the top of the density this set uses, bright without being brittle, over a bright bowl arriving every couple of minutes.',
    globals: {
      density: 0.52,
      energy: 0.62,
      brightness: 0.66,
      reverbPreset: 'room',
      width: 0.75,
    },
    layers: (every) => [
      {
        id: 'bowl-floor',
        role: 'SECONDARY_BOWL',
        pool: BRIGHT_BOWLS,
        intervalSec: every(44, 68),
        probability: 0.5,
        gainDb: { min: -14, max: -10 },
        panRange: { min: -0.3, max: 0.3 },
        maxVoices: 1,
        reverbSend: 0.4,
      },
      {
        id: 'kalimba',
        role: 'KALIMBA',
        pool: KALIMBA,
        intervalSec: every(16, 24),
        probability: 0.85,
        gainDb: { min: -12, max: -8 },
        panRange: { min: -0.45, max: 0.45 },
        maxVoices: 2,
        reverbSend: 0.25,
      },
      {
        id: 'chimes',
        role: 'CHIME',
        pool: CHIMES,
        intervalSec: every(18, 28),
        probability: 0.8,
        gainDb: { min: -14, max: -9 },
        panRange: { min: -0.7, max: 0.7 },
        maxVoices: 2,
        reverbSend: 0.3,
      },
      {
        id: 'bells',
        role: 'BELL',
        pool: BELLS,
        intervalSec: every(20, 32),
        probability: 0.75,
        gainDb: { min: -16, max: -11 },
        panRange: { min: -0.8, max: 0.8 },
        maxVoices: 2,
        reverbSend: 0.35,
      },
    ],
  });
}

/**
 * Theta Bath.
 *
 * §30: soft bowls, rare chimes, a pink bed from the core, a density of 25%, no
 * kalimba, and minimal rhythmic distraction as the stated goal.
 *
 * The tuning fork and soft bell layers this preset used to carry are gone.
 * Neither is in the spec, and four layers is not the shape of the sentence
 * "minimal rhythmic distraction" — two bowl layers and a chime that seldom
 * fires is. The pink bed is the core signal's, as in `Earth Resonance`: there
 * is no noise in a library of struck recordings.
 *
 * At a density of 0.25 the interval multiplier is 2.375, so the declared
 * spacings below are what is actually heard and the control still has room to
 * move in both directions.
 *
 * Named after the band of the core signal it was written to accompany, in the
 * same way `Alpha Focus` is in `protocol/factoryProtocols.ts`. Nothing in the
 * acoustic layer is at a theta rate, and `ACOUSTIC_LAYER_NOTICE` says so.
 */
function thetaBath(): SoundBathPreset {
  return soundBath({
    id: 'soundbath.theta_bath',
    name: 'Theta Bath',
    copy:
      'Bowls chosen for length rather than for colour, a second bowl answering them from further back, and a chime that arrives rarely enough not to become something to listen for. Named after the band of the core signal it was written to accompany.',
    globals: {
      density: 0.25,
      energy: 0.32,
      brightness: 0.34,
      reverbPreset: 'hall',
      width: 0.75,
    },
    layers: (every) => [
      {
        id: 'bowls',
        role: 'PRIMARY_BOWL',
        pool: DARK_BOWLS,
        intervalSec: every(40, 62),
        probability: 0.9,
        gainDb: { min: -8, max: -5 },
        panRange: { min: -0.3, max: 0.3 },
        maxVoices: 2,
        reverbSend: 0.5,
      },
      {
        id: 'paired-bowls',
        role: 'SECONDARY_BOWL',
        pool: LONG_BOWLS,
        intervalSec: every(56, 88),
        probability: 0.6,
        gainDb: { min: -13, max: -9 },
        panRange: { min: -0.6, max: 0.6 },
        maxVoices: 1,
        reverbSend: 0.5,
      },
      {
        id: 'rare-chimes',
        role: 'CHIME',
        pool: { ...CHIMES, preferredTags: ['gentle'] },
        intervalSec: every(100, 200),
        probability: 0.3,
        gainDb: { min: -20, max: -15 },
        panRange: { min: -0.7, max: 0.7 },
        maxVoices: 1,
        reverbSend: 0.4,
      },
    ],
  });
}

/** Alpha Air. */
function alphaAir(): SoundBathPreset {
  return soundBath({
    id: 'soundbath.alpha_air',
    name: 'Alpha Air',
    copy:
      'Airy chimes and bells kept light and spread wide, with long bowls well behind them. Brighter and quicker than the bowl presets, and quieter than its brightness suggests. Named after the band of the core signal it was written to accompany.',
    globals: {
      density: 0.44,
      energy: 0.48,
      brightness: 0.6,
      reverbPreset: 'plate',
      width: 0.85,
    },
    layers: (every) => [
      {
        id: 'bowls',
        role: 'SECONDARY_BOWL',
        pool: LONG_BOWLS,
        intervalSec: every(32, 50),
        probability: 0.6,
        gainDb: { min: -13, max: -9 },
        panRange: { min: -0.3, max: 0.3 },
        maxVoices: 1,
        reverbSend: 0.5,
      },
      {
        id: 'air',
        role: 'AIR',
        pool: AIRY_CHIMES,
        intervalSec: every(22, 34),
        probability: 0.8,
        gainDb: { min: -14, max: -10 },
        panRange: { min: -0.8, max: 0.8 },
        maxVoices: 2,
        reverbSend: 0.4,
      },
      {
        id: 'bells',
        role: 'BELL',
        pool: BELLS,
        intervalSec: every(20, 30),
        probability: 0.8,
        gainDb: { min: -16, max: -11 },
        panRange: { min: -0.85, max: 0.85 },
        maxVoices: 2,
        reverbSend: 0.4,
      },
    ],
  });
}

/**
 * 528 Organic.
 *
 * §29. The retuning here is arithmetic and is the entire content of the preset:
 * A4 = 444 Hz puts an equal-tempered C5 at 528.008 Hz — three semitones up,
 * 444 × 2^(3/12) — which is +15.667 cents from concert pitch and 0.026 cents
 * sharp of 528 itself. The A4 that would land on 528 exactly is 443.993 Hz, and
 * writing that down instead would be four significant figures of false
 * precision on a tuning reference. `retuneFor` applies the shift only where
 * `noteSource` is `measured`,
 * so 87 of the 369 assets move and the other 282 do not — shifting audio on the
 * strength of a note read off a vendor's filename would be inventing precision
 * the pipeline deliberately refused to claim.
 *
 * No claim is attached to the number, here or anywhere the user can read.
 *
 * §29's organic half is a compatible bowl, a soft bell, an occasional chime and
 * reverb, with noisy and atonal accents kept minimal. The kalimba that used to
 * hold the third layer is gone: it is not in the spec, and 83 of the 100
 * kalimba phrases are tagged `inharmonic`, which is precisely the accent §29
 * asks to keep to a minimum. A soft bell layer takes its place, and the chime
 * layer is slowed from every 20–32 seconds to every 45–90 at a probability of
 * 0.35, which is what "occasional" means beside a bowl layer firing at 0.85.
 */
function organic528(): SoundBathPreset {
  return soundBath({
    id: 'soundbath.528_organic',
    name: '528 Organic',
    copy:
      'Bowls, soft bells and an occasional chime with the tuning reference moved to A4 = 444 Hz, which puts an equal-tempered C5 within a hundredth of a hertz of 528 — about sixteen cents above concert pitch. The shift reaches only the assets whose pitch was actually measured; a note read off a filename is a label, not an observation, and nothing is moved on the strength of one. This is a tuning choice and nothing more. The popular claims attached to this number are unsupported, and none of them is made here.',
    globals: {
      density: 0.38,
      energy: 0.45,
      brightness: 0.55,
      reverbPreset: 'hall',
      width: 0.8,
      tonalCenter: 'C',
      tuningReferenceHz: 444,
    },
    layers: (every) => [
      {
        id: 'bowls',
        role: 'PRIMARY_BOWL',
        pool: { ...LONG_BOWLS, preferredTags: ['tonal'] },
        intervalSec: every(40, 62),
        probability: 0.85,
        gainDb: { min: -12, max: -9 },
        panRange: { min: -0.3, max: 0.3 },
        maxVoices: 2,
        reverbSend: 0.45,
      },
      {
        id: 'soft-bells',
        role: 'BELL',
        pool: { ...SOFT_BELLS, preferredTags: ['gentle'] },
        intervalSec: every(30, 55),
        probability: 0.6,
        gainDb: { min: -16, max: -11 },
        panRange: { min: -0.6, max: 0.6 },
        maxVoices: 2,
        reverbSend: 0.35,
      },
      {
        id: 'chimes',
        role: 'CHIME',
        pool: CHIMES,
        intervalSec: every(45, 90),
        probability: 0.35,
        gainDb: { min: -18, max: -13 },
        panRange: { min: -0.7, max: 0.7 },
        maxVoices: 2,
        reverbSend: 0.35,
      },
    ],
  });
}

/**
 * 432 Meditation.
 *
 * A4 = 432 Hz is −31.77 cents from concert pitch, applied on the same terms as
 * 528: measured pitches only. The archive holds the argument about 432 and is
 * clear that it is a cultural one; the preset does not restate it.
 */
function meditation432(): SoundBathPreset {
  return soundBath({
    id: 'soundbath.432_meditation',
    name: '432 Meditation',
    copy:
      'Bowls, soft bells and tuning forks with the tuning reference at A4 = 432 Hz, about thirty-two cents below concert pitch, applied only to material whose pitch was measured. A tuning reference is a choice about where a scale sits: there is nothing wrong with 440 Hz and nothing special about 432.',
    globals: {
      density: 0.32,
      energy: 0.35,
      brightness: 0.4,
      reverbPreset: 'hall',
      width: 0.75,
      tonalCenter: 'A',
      tuningReferenceHz: 432,
    },
    layers: (every) => [
      {
        id: 'bowls',
        role: 'PRIMARY_BOWL',
        pool: { ...LONG_BOWLS, preferredTags: ['tonal'] },
        intervalSec: every(38, 60),
        probability: 0.9,
        gainDb: { min: -12, max: -9 },
        panRange: { min: -0.25, max: 0.25 },
        maxVoices: 2,
        reverbSend: 0.45,
      },
      {
        id: 'bells',
        role: 'BELL',
        pool: SOFT_BELLS,
        intervalSec: every(22, 34),
        probability: 0.6,
        gainDb: { min: -18, max: -13 },
        panRange: { min: -0.75, max: 0.75 },
        maxVoices: 2,
        reverbSend: 0.4,
      },
      {
        id: 'forks',
        role: 'TUNING_FORK',
        pool: TUNING_FORKS,
        intervalSec: every(52, 82),
        probability: 0.5,
        gainDb: { min: -14, max: -10 },
        panRange: { min: -0.3, max: 0.3 },
        maxVoices: 1,
        reverbSend: 0.45,
      },
    ],
  });
}

/** Sleep Descent. */
function sleepDescent(): SoundBathPreset {
  return soundBath({
    id: 'soundbath.sleep_descent',
    name: 'Sleep Descent',
    copy:
      'The quietest and slowest layers in this set: dark bowls, a low answering layer under them, and bells so far back that they read as the room rather than as events.',
    globals: {
      density: 0.24,
      energy: 0.28,
      brightness: 0.26,
      reverbPreset: 'cavern',
      width: 0.7,
    },
    layers: (every) => [
      {
        id: 'bowls',
        role: 'PRIMARY_BOWL',
        pool: { ...DARK_BOWLS, preferredTags: ['warm'] },
        intervalSec: every(40, 62),
        probability: 0.85,
        gainDb: { min: -9, max: -6 },
        panRange: { min: -0.25, max: 0.25 },
        maxVoices: 2,
        reverbSend: 0.5,
      },
      {
        id: 'low-answer',
        role: 'LOW_RESONANCE',
        pool: { ...DARK_BOWLS, preferredTags: ['low', 'deep'] },
        intervalSec: every(56, 86),
        probability: 0.62,
        gainDb: { min: -13, max: -9 },
        panRange: { min: -0.5, max: 0.5 },
        maxVoices: 1,
        reverbSend: 0.55,
      },
      {
        id: 'room-bells',
        role: 'BELL',
        pool: { ...SOFT_BELLS, preferredTags: ['gentle'] },
        intervalSec: every(34, 52),
        probability: 0.45,
        gainDb: { min: -18, max: -13 },
        panRange: { min: -0.85, max: 0.85 },
        maxVoices: 1,
        reverbSend: 0.5,
      },
    ],
  });
}

/**
 * Focus Minimal.
 *
 * The only preset in this set with no bowls in it at all, and the omission is
 * the design: a bowl rings for twenty to fifty seconds and fills the room for
 * every one of them, which is the opposite of what a working session wants.
 */
function focusMinimal(): SoundBathPreset {
  return soundBath({
    id: 'soundbath.focus_minimal',
    name: 'Focus Minimal',
    copy:
      'Two layers and nothing else: kalimba points and an occasional bell, no bowls anywhere. A bowl fills a room for the forty seconds it rings, which is the wrong thing to do to somebody working.',
    globals: {
      density: 0.3,
      energy: 0.5,
      brightness: 0.5,
      reverbPreset: 'room',
      width: 0.5,
    },
    layers: (every) => [
      {
        id: 'points',
        role: 'MELODIC_ACCENT',
        pool: SOFT_KALIMBA,
        intervalSec: every(30, 46),
        probability: 0.7,
        gainDb: { min: -14, max: -10 },
        panRange: { min: -0.4, max: 0.4 },
        maxVoices: 1,
        reverbSend: 0.2,
      },
      {
        id: 'marks',
        role: 'BELL',
        pool: SOFT_BELLS,
        intervalSec: every(36, 56),
        probability: 0.55,
        gainDb: { min: -17, max: -12 },
        panRange: { min: -0.6, max: 0.6 },
        maxVoices: 1,
        reverbSend: 0.25,
      },
    ],
  });
}

/**
 * Gamma Light.
 *
 * The preset in this set whose name most needs its description read.
 *
 * A gamma protocol's core signal is a 40 Hz modulation — a period of 25
 * milliseconds. This layer cannot produce one, cannot reinforce one and cannot
 * be made to: the scheduler places recorded strikes on a half-second grid, and
 * the fastest layer here attempts one about every fourteen seconds, roughly
 * five hundred times slower than that period. Nor is it a tuning problem that a
 * denser preset would fix — an acoustic layer of struck bells has no periodic
 * component at any rate, because nothing about it repeats. So the
 * name states which core signal this was written to sit under, the copy says
 * outright that nothing acoustic is at 40 Hz, and `ACOUSTIC_LAYER_NOTICE` says
 * it a second time in general terms.
 *
 * The material is bright, which puts §81's fatigue limit under continuous load:
 * four events above 0.6 brightness inside a minute and the scheduler starts
 * penalising bright assets at a quarter weight until the ear gets a rest. That
 * is the intended behaviour here rather than a side effect — it is what stops
 * the busiest preset in the set from being the most tiring.
 */
function gammaLight(): SoundBathPreset {
  return soundBath({
    id: 'soundbath.gamma_light',
    name: 'Gamma Light',
    copy:
      'Small bright events — high bells, chimes and kalimba — placed faster than anywhere else in this set. Nothing here happens at 40 Hz and nothing here could: this layer places recorded strikes seconds apart, and a struck bell has no periodic component at any rate. The name says which core signal it was written to sit under, not what the bells are doing.',
    globals: {
      density: 0.56,
      energy: 0.7,
      brightness: 0.78,
      reverbPreset: 'room',
      width: 0.85,
    },
    layers: (every) => [
      {
        id: 'high-bells',
        role: 'SPARKLE',
        pool: HIGH_BELLS,
        intervalSec: every(11, 17),
        probability: 0.85,
        gainDb: { min: -16, max: -11 },
        panRange: { min: -0.85, max: 0.85 },
        maxVoices: 2,
        reverbSend: 0.3,
      },
      {
        id: 'chimes',
        role: 'CHIME',
        pool: { ...CHIMES, preferredTags: ['shimmering'] },
        intervalSec: every(12, 19),
        probability: 0.85,
        gainDb: { min: -14, max: -9 },
        panRange: { min: -0.7, max: 0.7 },
        maxVoices: 2,
        reverbSend: 0.3,
      },
      {
        id: 'kalimba',
        role: 'MELODIC_ACCENT',
        pool: KALIMBA,
        intervalSec: every(14, 23),
        probability: 0.75,
        gainDb: { min: -13, max: -9 },
        panRange: { min: -0.5, max: 0.5 },
        maxVoices: 2,
        reverbSend: 0.2,
      },
    ],
  });
}

/** Pure Bowls. */
function pureBowls(): SoundBathPreset {
  return soundBath({
    id: 'soundbath.pure_bowls',
    name: 'Pure Bowls',
    copy:
      'Two bowl layers and no other instrument. A dark body in the centre, and a brighter bowl answering it from the other side of the image, both drawn from the whole long end of the library.',
    globals: {
      density: 0.3,
      energy: 0.4,
      brightness: 0.45,
      reverbPreset: 'hall',
      width: 0.7,
    },
    layers: (every) => [
      {
        id: 'body',
        role: 'PRIMARY_BOWL',
        pool: DARK_BOWLS,
        intervalSec: every(36, 56),
        probability: 0.9,
        gainDb: { min: -7, max: -4 },
        panRange: { min: -0.3, max: 0.3 },
        maxVoices: 2,
        reverbSend: 0.45,
      },
      {
        id: 'answer',
        role: 'SECONDARY_BOWL',
        pool: BRIGHT_BOWLS,
        intervalSec: every(48, 76),
        probability: 0.65,
        gainDb: { min: -13, max: -9 },
        panRange: { min: -0.7, max: 0.7 },
        maxVoices: 1,
        reverbSend: 0.5,
      },
    ],
  });
}

/** Chime Garden. */
function chimeGarden(): SoundBathPreset {
  return soundBath({
    id: 'soundbath.chime_garden',
    name: 'Chime Garden',
    copy:
      'Chimes short and long, with bells filling in between them. Busy by the standards of this set and still nowhere near continuous — the long chimes run to almost nineteen seconds, so the overlaps do most of the work.',
    globals: {
      density: 0.48,
      energy: 0.55,
      brightness: 0.68,
      reverbPreset: 'plate',
      width: 0.85,
    },
    layers: (every) => [
      {
        id: 'long-chimes',
        role: 'HIGH_RESONANCE',
        pool: { ...LONG_CHIMES, preferredTags: ['long_decay'] },
        intervalSec: every(26, 40),
        probability: 0.65,
        gainDb: { min: -12, max: -8 },
        panRange: { min: -0.4, max: 0.4 },
        maxVoices: 2,
        reverbSend: 0.4,
      },
      {
        id: 'chimes',
        role: 'CHIME',
        pool: CHIMES,
        intervalSec: every(15, 24),
        probability: 0.85,
        gainDb: { min: -14, max: -9 },
        panRange: { min: -0.75, max: 0.75 },
        maxVoices: 3,
        reverbSend: 0.35,
      },
      {
        id: 'bells',
        role: 'BELL',
        pool: BELLS,
        intervalSec: every(19, 30),
        probability: 0.75,
        gainDb: { min: -16, max: -11 },
        panRange: { min: -0.85, max: 0.85 },
        maxVoices: 2,
        reverbSend: 0.35,
      },
    ],
  });
}

/**
 * Tuning Fork Space.
 *
 * The honest version of a preset the library can only just support.
 *
 * There are ten tuning forks and there is no eleventh. Worse than the count:
 * four of them ring at 383.63 Hz and three at 127.8 Hz, so ten assets carry
 * about five distinguishable pitches. A forks-only preset would therefore be a
 * rotation of five sounds however the weights are arranged, and no amount of
 * no-repeat penalty fixes a pool that small — which is exactly the outcome §16
 * exists to prevent.
 *
 * So the forks are the foreground and not the body: loudest, most central,
 * longest ringing, and arriving about a dozen times in half an hour so that
 * most of them are heard once. The variety comes from forty-one dark bowls and
 * forty-four bells behind them. That is a preset the library can actually
 * furnish; a fork bath is not.
 */
function tuningForkSpace(): SoundBathPreset {
  return soundBath({
    id: 'soundbath.tuning_fork_space',
    name: 'Tuning Fork Space',
    copy:
      'Tuning forks in front — the library holds ten of them and this is the only preset that puts them there — with dark bowls behind and occasional bells. The fork layer is deliberately slow: between them those ten cover about five distinct pitches, and heard often they would read as a rotation rather than as a room.',
    globals: {
      density: 0.26,
      energy: 0.25,
      brightness: 0.35,
      reverbPreset: 'cavern',
      width: 0.7,
    },
    layers: (every) => [
      {
        id: 'forks',
        role: 'TUNING_FORK',
        pool: TUNING_FORKS,
        intervalSec: every(46, 72),
        probability: 0.8,
        gainDb: { min: -8, max: -5 },
        panRange: { min: -0.25, max: 0.25 },
        maxVoices: 1,
        reverbSend: 0.5,
      },
      {
        id: 'field',
        role: 'SECONDARY_BOWL',
        pool: DARK_BOWLS,
        intervalSec: every(48, 76),
        probability: 0.7,
        gainDb: { min: -13, max: -9 },
        panRange: { min: -0.55, max: 0.55 },
        maxVoices: 1,
        reverbSend: 0.55,
      },
      {
        id: 'bells',
        role: 'BELL',
        pool: SOFT_BELLS,
        intervalSec: every(30, 46),
        probability: 0.5,
        gainDb: { min: -17, max: -12 },
        panRange: { min: -0.8, max: 0.8 },
        maxVoices: 1,
        reverbSend: 0.45,
      },
    ],
  });
}

/**
 * Kalimba Passages.
 *
 * The library's nine long kalimba recordings are not strikes, they are played
 * passages of twenty to forty-six seconds — the only material here with a
 * melodic line in it. Every other preset treats kalimba as an accent and draws
 * on `SHORT`/`MEDIUM`, so those nine were in no pool at all. This is the preset
 * they are for.
 *
 * The pool is all hundred with the long ones preferred rather than the nine
 * alone: nine clears the count floor and would leave a half-hour session
 * playing the same nine files, which is the audible rotation this file exists
 * to avoid. Preferring `sustained` and `long_decay` puts them in front while
 * eighty of the hundred stay genuinely in play.
 */
function kalimbaPassages(): SoundBathPreset {
  return soundBath({
    id: 'soundbath.kalimba_passages',
    name: 'Kalimba Passages',
    copy:
      'The long kalimba recordings, which are played passages rather than single notes, with bowls kept well behind them and soft bells between. The most melodic thing this library can be arranged into, and the only preset where the kalimba leads.',
    globals: {
      density: 0.34,
      energy: 0.4,
      brightness: 0.55,
      reverbPreset: 'hall',
      width: 0.7,
    },
    layers: (every) => [
      {
        id: 'passages',
        role: 'MELODIC_ACCENT',
        pool: { ...ALL_KALIMBA, preferredTags: ['sustained', 'long_decay'] },
        intervalSec: every(34, 66),
        probability: 0.8,
        // −4 rather than lower: this layer is the subject, and the pool's
        // loudest recommendation is +2.21 dB.
        gainDb: { min: -9, max: -4 },
        panRange: { min: -0.35, max: 0.35 },
        maxVoices: 2,
        reverbSend: 0.35,
      },
      {
        id: 'bowls',
        role: 'PRIMARY_BOWL',
        pool: { ...ALL_BOWLS, preferredTags: ['warm'] },
        intervalSec: every(50, 90),
        probability: 0.65,
        // Stops at −9: `ALL_BOWLS` holds the +8.44 dB bowl.
        gainDb: { min: -14, max: -9 },
        panRange: { min: -0.3, max: 0.3 },
        maxVoices: 1,
        reverbSend: 0.5,
      },
      {
        id: 'bells',
        role: 'BELL',
        pool: { ...SOFT_BELLS, preferredTags: ['gentle'] },
        intervalSec: every(46, 84),
        probability: 0.45,
        gainDb: { min: -18, max: -13 },
        panRange: { min: -0.7, max: 0.7 },
        maxVoices: 2,
        reverbSend: 0.4,
      },
    ],
  });
}

/**
 * Chime Drift.
 *
 * The four longest chimes in the library ring for fifty-seven to seventy-two
 * seconds. Every chime preset before this drew on `SHORT` and `MEDIUM`, because
 * a chime is usually a strike, so those four were unreachable — the closest
 * thing this library has to sustained material and nothing could play them.
 *
 * Written around what they are: few events, long overlaps, and a bowl
 * underneath rather than beside. It is the sparsest preset on the shelf, and
 * the one where two sounds are most often ringing at once.
 */
function chimeDrift(): SoundBathPreset {
  return soundBath({
    id: 'soundbath.chime_drift',
    name: 'Chime Drift',
    copy:
      'The longest chimes this library holds — Koshi ring-outs of a minute and more — left to overlap each other over a single warm bowl. Fewer events than anything else here, and more of the time with two sounds decaying at once.',
    globals: {
      density: 0.3,
      energy: 0.3,
      brightness: 0.62,
      reverbPreset: 'cathedral',
      width: 0.85,
    },
    layers: (every) => [
      {
        id: 'drift',
        role: 'AIR',
        pool: { ...ALL_CHIMES, preferredTags: ['airy', 'long_decay'] },
        /*
         * 32–62 rather than the 40–80 this was drafted at. At the wider
         * spacing the sparsest of two hundred seeds produced exactly ten
         * events, which is the floor below which a layer stops reading as a
         * room rather than as isolated sounds — a preset one unlucky draw
         * from its own limit is sparse by accident, not by design.
         *
         * The interval is the lever and density is not: `every()` divides by
         * the same factor the scheduler multiplies back, so the declared
         * spacing is what is heard at any density. Raising density here moved
         * the mean by one event and the floor by none.
         */
        intervalSec: every(32, 62),
        probability: 0.8,
        // The pool's loudest recommendation is +1.65 dB.
        gainDb: { min: -12, max: -7 },
        panRange: { min: -0.8, max: 0.8 },
        // Three, because the point of this preset is the overlap.
        maxVoices: 3,
        reverbSend: 0.6,
      },
      {
        id: 'under',
        role: 'SECONDARY_BOWL',
        pool: { ...ALL_BOWLS, preferredTags: ['warm'] },
        intervalSec: every(58, 104),
        probability: 0.6,
        gainDb: { min: -15, max: -9 },
        panRange: { min: -0.2, max: 0.2 },
        maxVoices: 1,
        reverbSend: 0.55,
      },
      {
        id: 'bells',
        role: 'BELL',
        pool: { ...SOFT_BELLS, preferredTags: ['gentle'] },
        intervalSec: every(78, 140),
        probability: 0.3,
        gainDb: { min: -20, max: -15 },
        panRange: { min: -0.85, max: 0.85 },
        maxVoices: 1,
        reverbSend: 0.5,
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// The set
// ---------------------------------------------------------------------------

/**
 * Every factory sound bath, in the order a shelf should show them.
 *
 * Built by a function rather than held as a frozen constant so that a caller
 * cannot mutate the shipped set and change what a session record points at —
 * the same reason `factoryProtocols.ts` builds rather than exports.
 */
export function buildSoundBathPresets(): SoundBathPreset[] {
  return [
    deepCalm(),
    earthResonance(),
    deepBowls(),
    pureBowls(),
    float(),
    innerSpace(),
    sleepDescent(),
    thetaBath(),
    meditation432(),
    organic528(),
    alphaAir(),
    silverChimes(),
    chimeGarden(),
    tuningForkSpace(),
    morningClarity(),
    focusMinimal(),
    gammaLight(),
    kalimbaPassages(),
    chimeDrift(),
  ];
}

/** The ids, in the same order, for anything that needs the set without building it. */
export const SOUND_BATH_PRESET_IDS = [
  'soundbath.deep_calm',
  'soundbath.earth_resonance',
  'soundbath.deep_bowls',
  'soundbath.pure_bowls',
  'soundbath.float',
  'soundbath.inner_space',
  'soundbath.sleep_descent',
  'soundbath.theta_bath',
  'soundbath.432_meditation',
  'soundbath.528_organic',
  'soundbath.alpha_air',
  'soundbath.silver_chimes',
  'soundbath.chime_garden',
  'soundbath.tuning_fork_space',
  'soundbath.morning_clarity',
  'soundbath.focus_minimal',
  'soundbath.gamma_light',
  'soundbath.kalimba_passages',
  'soundbath.chime_drift',
] as const;

export function soundBathPreset(id: string): SoundBathPreset | undefined {
  return buildSoundBathPresets().find((preset) => preset.id === id);
}
