import { preset } from './make.js';
import type { FrequencyPreset } from './types.js';

/**
 * The demonstration half of Acoustic Fundamentals (shelf 10).
 *
 * The rows in `factoryTones.ts` are arithmetic you can hear: an octave is a
 * doubling, a fifth is 3:2, a harmonic series is integer multiplication. These
 * are the other half of the same shelf — signals whose point is that **the
 * sound and the hearing of it are two different things**. Each one is set up so
 * the gap between them is checkable twice over: by ear in the moment, and by
 * measuring the rendered output, which `test/psychoacoustics.test.ts` does for
 * every row here.
 *
 * ## What a row on this shelf is allowed to say
 *
 * The same rule as everywhere else, with one extra edge to it. A preset states
 * what the engine emits and links the record carrying any claim attached to it.
 * The extra edge is that these rows also describe a *percept* — the pitch you
 * hear, the roughness you hear, the beat you hear — and a percept is exactly
 * the kind of statement that slides into a benefit if it is left unattended.
 * So: every row here names a phenomenon and nothing else. None of them says a
 * phenomenon is good for you, and none of them is classified as anything but
 * `mathematical` or `research`, because a demonstration of how hearing works
 * makes no wellness claim and must not be given one.
 *
 * ## What the engine will and will not do
 *
 * The standard chain has one tone module (`protocol/builders.ts`), and
 * `archive/transforms.ts` refuses any modulation or two-tone difference above
 * 100 Hz on the ground that beyond it the two tones are simply heard as
 * separate pitches. Those two limits decide what can honestly be built:
 *
 *  - two simultaneous tones, up to 100 Hz apart — the beat / roughness ladder
 *    and the binaural-versus-monaural pair below;
 *  - three simultaneous tones, as full-depth amplitude modulation, whose
 *    components are a carrier and its two sidebands — which is exactly the
 *    classical missing-fundamental configuration;
 *  - any single tone at any level the shelf's standard amplitude gives it.
 *
 * Nothing else. Two combination-tone primaries far enough apart for a Tartini
 * third tone to be audible, and a Shepard tone's stack of independently
 * enveloped octaves, both need chains this engine does not have; they are not
 * on this shelf and are not approximated by something that would be.
 */

// ── The missing fundamental ──────────────────────────────────────────────────

/**
 * The residue demonstration, computed rather than transcribed.
 *
 * Full-depth amplitude modulation of a carrier `C` at a rate `R` is, by the
 * product-to-sum identity, the sum of three steady tones at `C - R`, `C` and
 * `C + R` in the amplitude ratio 1 : 2 : 1. Choose `C = 3R` and those three are
 * the second, third and fourth harmonics of `R`, with nothing whatever at `R`
 * itself — which is the whole point, so the partials are derived from the two
 * numbers the preset actually sets rather than typed out beside them.
 */
export const RESIDUE_FUNDAMENTAL_HZ = 100;
/** Three times the fundamental, so the sidebands land on the neighbouring harmonics. */
export const RESIDUE_CARRIER_HZ = RESIDUE_FUNDAMENTAL_HZ * 3;
/** The three tones the modulation actually produces, low to high. */
export const RESIDUE_PARTIALS_HZ: readonly number[] = [
  RESIDUE_CARRIER_HZ - RESIDUE_FUNDAMENTAL_HZ,
  RESIDUE_CARRIER_HZ,
  RESIDUE_CARRIER_HZ + RESIDUE_FUNDAMENTAL_HZ,
];
/** Which harmonics of the absent fundamental those partials are. */
export const RESIDUE_HARMONIC_NUMBERS: readonly number[] = RESIDUE_PARTIALS_HZ.map(
  (hz) => hz / RESIDUE_FUNDAMENTAL_HZ,
);

// ── The two-tone ladder ──────────────────────────────────────────────────────

/**
 * One base tone, three separations, two mechanisms.
 *
 * Four rows are built on the same 440 Hz tone plus a second tone a stated
 * distance above it, and within the ladder the separation is the only thing
 * that changes. That is what makes it worth holding as data rather than as four
 * unrelated rows: the signal is one kind of thing throughout — two sine tones —
 * and everything that changes between the rungs happens in the listener.
 */
export const LADDER_BASE_HZ = 440;
/** Separations, in hertz: a countable beat, roughness, and two resolved pitches. */
export const LADDER_SEPARATIONS_HZ: readonly number[] = [8, 25, 100];
/** The rate the binaural and monaural rows share, so the A/B differs in one thing only. */
export const AB_BEAT_HZ = LADDER_SEPARATIONS_HZ[0];

// ── Equal loudness ───────────────────────────────────────────────────────────

/**
 * The two tones of the level-matched pair.
 *
 * Both compile to a plain oscillator, and the compiler gives every preset the
 * same amplitude unless a caller overrides it, so the pair is level-matched by
 * construction rather than by a number written down twice.
 */
export const EQUAL_LOUDNESS_LOW_HZ = 60;
export const EQUAL_LOUDNESS_HIGH_HZ = 3000;

// ── 10 · Acoustic Fundamentals — demonstrations ──────────────────────────────

/**
 * The demonstration rows, in the order the shelf reads them.
 *
 * Declaration order is the browsing order — `presetsInCollection` filters
 * `FACTORY_PRESETS` in place — so the sequence is part of the argument: the
 * two-tone ladder first, widening by one number at a time; then the missing
 * fundamental with its reference tone immediately after it, because a pitch
 * demonstration with nothing to check it against is an assertion; then the
 * level-matched pair, high tone before low, so that anyone setting a volume
 * meets the loud one first.
 */
export const PSYCHOACOUSTIC_PRESETS: FrequencyPreset[] = [
  preset({
    id: 'af-beat-binaural',
    name: '8 Hz apart — one tone in each ear',
    collection: 'acoustic-fundamentals',
    summary:
      '440 Hz in one ear, 448 Hz in the other, and nothing else in either. Measure the left channel on its own and it is a steady tone; measure the right and so is that. The eight-per-second pulsation is not in the recording — it appears once your hearing has both. Take one earbud out and it stops.',
    sourceFrequency: { value: AB_BEAT_HZ, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'binaural', carrierHz: LADDER_BASE_HZ, calculationMode: 'offset' },
    durationSec: 180,
    intent: ['comparison', 'listening', 'experimentation'],
    classification: 'research',
    libraryEntryIds: ['binaural-beats', 'carrier-choice'],
    archiveEntryIds: ['carrier-440', 'beat-limit-35'],
    associations: [
      {
        claim: 'That a binaural beat is a sound, and so can be played on a speaker or saved as a beating file.',
        medical: false,
        currentEvidence:
          'It is not in the file. Both channels here are steady sine tones and neither one fluctuates. Over a speaker the two mix in the air before they reach you, and what you then hear is an ordinary acoustic beat — measurably the same fluctuation the monaural row beside this one produces, because by then it is the monaural row. The rate is the same and the mechanism is not, and that is the distinction this pair exists to make audible.',
      },
    ],
    safety: {
      headphonesRecommended: true,
      directToneAllowed: false,
      output: 'headphones',
    },
    aliases: ['binaural', 'binaural beat', 'binaural vs monaural', 'headphones', '8 Hz'],
    tags: ['fundamentals', 'psychoacoustics', 'binaural', 'beat', 'comparison'],
  }),

  preset({
    id: 'af-beat-monaural',
    name: '8 Hz apart — both tones in both ears',
    collection: 'acoustic-fundamentals',
    summary:
      'The same two tones as the row above — 440 Hz and 448 Hz — summed into one signal that goes to both ears. Now the fluctuation is in the waveform: the pair swells and collapses eight times a second before it reaches you, so it survives a speaker, a single earbud, and a mono downmix. Play the two rows back to back with one ear covered.',
    sourceFrequency: { value: AB_BEAT_HZ, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'monaural', carrierHz: LADDER_BASE_HZ },
    durationSec: 180,
    intent: ['comparison', 'listening', 'experimentation'],
    classification: 'research',
    libraryEntryIds: ['monaural-beats', 'binaural-beats'],
    archiveEntryIds: ['carrier-440'],
    associations: [
      {
        claim: 'That monaural and binaural beats are the same effect at two settings.',
        medical: false,
        currentEvidence:
          'They arrive at the same rate by different means. This one is interference between two tones in a single signal: it exists in the air, shows up on a measurement, and needs no stereo at all. A binaural beat is in neither channel and appears only after two ears are combined. The linked entries carry what has and has not been shown for each; the point of the pair is the mechanism, not a comparison of their merits.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['monaural', 'monaural beat', 'acoustic beat', 'speakers', '8 Hz'],
    tags: ['fundamentals', 'psychoacoustics', 'monaural', 'beat', 'comparison'],
  }),

  preset({
    id: 'af-roughness-25',
    name: '25 Hz apart — roughness',
    collection: 'acoustic-fundamentals',
    summary:
      '440 Hz and 465 Hz summed into one signal. The waveform is doing what the 8 Hz pair does, only faster — and at this speed you stop counting a beat and start hearing a buzz. Too fast to follow, too close together to separate into two notes: what is left is roughness.',
    sourceFrequency: { value: LADDER_SEPARATIONS_HZ[1], unit: 'Hz', role: 'modulation' },
    representation: { kind: 'monaural', carrierHz: LADDER_BASE_HZ },
    durationSec: 120,
    intent: ['comparison', 'listening', 'experimentation'],
    classification: 'research',
    libraryEntryIds: ['monaural-beats'],
    archiveEntryIds: ['concert-a440'],
    associations: [
      {
        claim: 'That roughness is distortion, clipping, or something wrong with the playback.',
        medical: false,
        currentEvidence:
          'It is none of those. The signal is two pure sine tones: a spectrum of the rendered output finds energy at 440 Hz and 465 Hz, at equal magnitude, and nothing anywhere else — including nothing at 25 Hz. Roughness appears when two tones land close enough together to excite overlapping regions of the inner ear, and measurements of that critical bandwidth put the roughness maximum near a quarter of it, which around 450 Hz is a separation of a few tens of hertz. It is a property of the listener rather than of the file.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['roughness', 'rough', 'critical band', 'dissonance', 'beating'],
    tags: ['fundamentals', 'psychoacoustics', 'roughness', 'critical-band', 'comparison'],
  }),

  preset({
    id: 'af-two-tones-100',
    name: '100 Hz apart — two pitches',
    collection: 'acoustic-fundamentals',
    summary:
      '440 Hz and 540 Hz summed into one signal — the widest separation this engine will build, because past about 100 Hz two tones are simply two tones. The waveform still swells and collapses a hundred times a second, exactly as the 8 Hz and 25 Hz pairs do. You no longer hear that at all; you hear two notes.',
    sourceFrequency: { value: LADDER_SEPARATIONS_HZ[2], unit: 'Hz', role: 'modulation' },
    representation: { kind: 'monaural', carrierHz: LADDER_BASE_HZ },
    durationSec: 120,
    intent: ['comparison', 'listening', 'experimentation'],
    classification: 'research',
    libraryEntryIds: ['monaural-beats'],
    archiveEntryIds: ['concert-a440'],
    associations: [
      {
        claim: 'That the fluctuation has stopped, because you have stopped hearing it.',
        medical: false,
        currentEvidence:
          'It has not. Two equal sine tones always sum to an envelope at their difference, and this one is at full depth — the two components measure the same magnitude to five decimal places, so the sum passes through silence a hundred times a second. Across the three rungs of this ladder the signal changes only in that one number; what changes completely is which reading the auditory system offers, first a beat, then roughness, then two separate pitches.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['two tones', 'critical band', 'resolved', 'separation', 'roughness'],
    tags: ['fundamentals', 'psychoacoustics', 'critical-band', 'comparison', 'interval'],
  }),

  preset({
    id: 'af-missing-fundamental',
    name: 'Missing fundamental — 200, 300 and 400 Hz',
    collection: 'acoustic-fundamentals',
    summary:
      'A 300 Hz tone whose level is modulated 100 times a second at full depth. Multiplying those two is the same as adding three steady tones — 200, 300 and 400 Hz, the second, third and fourth harmonics of 100 Hz — and a spectrum of the output finds energy at exactly those three and none at all at 100 Hz. The pitch most listeners report is 100 Hz. Compare it with the 100 Hz reference tone on this shelf.',
    sourceFrequency: { value: RESIDUE_FUNDAMENTAL_HZ, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'am', carrierHz: RESIDUE_CARRIER_HZ, modulationDepth: 1 },
    durationSec: 180,
    intent: ['comparison', 'listening', 'experimentation'],
    classification: 'research',
    libraryEntryIds: ['harmonic-series'],
    archiveEntryIds: [],
    associations: [
      {
        claim: 'That the pitch you hear has to be a frequency present in the sound.',
        medical: false,
        currentEvidence:
          'It does not. This signal holds 200, 300 and 400 Hz and nothing else; the pitch is recovered from the pattern those three make together — they repeat as a group a hundred times a second — rather than read off a component at 100 Hz, which is not there. The effect is ordinary rather than exotic: a small speaker that produces nothing below about 150 Hz still conveys the pitch of a bass note, and telephone speech band-limited to roughly 300–3400 Hz still conveys a voice whose fundamental sits well below 300 Hz.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: [
      'missing fundamental',
      'residue pitch',
      'periodicity pitch',
      'virtual pitch',
      'harmonics',
    ],
    tags: ['fundamentals', 'psychoacoustics', 'missing-fundamental', 'harmonics', 'comparison'],
  }),

  preset({
    id: 'af-100',
    name: '100 Hz — the reference for the missing fundamental',
    collection: 'acoustic-fundamentals',
    summary:
      'A plain 100 Hz tone, and nothing else — the pitch the missing-fundamental preset produces without containing. Play the two one after the other. The demonstration is only worth anything if you can check the pitch you heard against the real thing.',
    sourceFrequency: { value: RESIDUE_FUNDAMENTAL_HZ, unit: 'Hz', role: 'carrier' },
    representation: { kind: 'direct' },
    durationSec: 180,
    intent: ['comparison', 'listening', 'experimentation'],
    classification: 'mathematical',
    libraryEntryIds: ['harmonic-series'],
    archiveEntryIds: [],
    associations: [],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: true,
      output: 'headphones-or-speakers',
    },
    aliases: ['100', '100 Hz', 'reference tone', 'missing fundamental'],
    tags: ['fundamentals', 'psychoacoustics', 'tone', 'comparison', '100'],
  }),

  preset({
    id: 'af-loudness-3000',
    name: 'Equal level, 3 kHz',
    collection: 'acoustic-fundamentals',
    summary:
      'A 3 kHz tone at the shelf\'s standard amplitude. This is close to where hearing is at its most sensitive — the outer ear resonates in the 2–3 kHz region and adds roughly 15–20 dB of its own before sound reaches the eardrum. Set your volume on this preset first and then switch to its 60 Hz partner, not the other way round: a level that feels mild at 60 Hz is painfully loud here.',
    sourceFrequency: { value: EQUAL_LOUDNESS_HIGH_HZ, unit: 'Hz', role: 'carrier' },
    representation: { kind: 'direct' },
    durationSec: 120,
    intent: ['comparison', 'listening', 'experimentation'],
    classification: 'research',
    libraryEntryIds: [],
    archiveEntryIds: ['loudness-1000', 'earcanal-2700'],
    associations: [
      {
        claim: 'That this preset is louder than its 60 Hz partner, or has been given more gain.',
        medical: false,
        currentEvidence:
          'It has not. Both rows compile to the same oscillator at the same amplitude, and the two rendered signals match in RMS to within a few hundredths of a decibel. Everything you hear between them is your own frequency response. The equal-loudness contours in the linked record put the gap at low frequencies in the tens of decibels at ordinary listening levels, narrowing as the level rises.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: true,
      output: 'headphones-or-speakers',
    },
    aliases: ['3000', '3000 Hz', '3 kHz', 'equal loudness', 'loudness'],
    tags: ['fundamentals', 'psychoacoustics', 'loudness', 'equal-loudness', 'comparison'],
  }),

  preset({
    id: 'af-loudness-60',
    name: 'Equal level, 60 Hz',
    collection: 'acoustic-fundamentals',
    summary:
      'A 60 Hz tone generated at exactly the same amplitude as the 3 kHz preset above it. The two signals measure the same; they will not sound remotely alike. Hearing is at its least sensitive down here, and a small speaker makes it worse — most phone and laptop drivers produce very little below about 150 Hz, so on one of those this tone may be nearly absent rather than merely quiet.',
    sourceFrequency: { value: EQUAL_LOUDNESS_LOW_HZ, unit: 'Hz', role: 'carrier' },
    representation: { kind: 'direct' },
    durationSec: 120,
    intent: ['comparison', 'listening', 'experimentation'],
    classification: 'research',
    libraryEntryIds: [],
    archiveEntryIds: ['loudness-1000', 'hearing-limit-20'],
    associations: [
      {
        claim: 'That a tone this quiet is safe to turn up until it matches the 3 kHz one.',
        medical: false,
        currentEvidence:
          'Matching them by ear means raising the level a long way, and whatever is set stays set for whatever plays next. Set the volume on the 3 kHz preset and leave it. How far apart the two would have to be to sound equal is exactly what the equal-loudness contours in the linked record describe; hearing that gap is the demonstration, and closing it is not.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: true,
      output: 'headphones-or-speakers',
    },
    aliases: ['60', '60 Hz', 'equal loudness', 'loudness', 'low frequency'],
    tags: ['fundamentals', 'psychoacoustics', 'loudness', 'equal-loudness', 'comparison'],
  }),
];
