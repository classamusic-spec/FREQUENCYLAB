import { LAB_CARRIER_HZ, NO_SOURCE_FREQUENCY, preset } from './make.js';
import type { FrequencyPreset } from './types.js';

/**
 * The rate shelves: Brainwave Lab, Gamma 40, Schumann-inspired and Noise Lab.
 *
 * Everything in this file is built on a number that is **not a pitch**. 10 Hz,
 * 40 Hz and 7.83 Hz are rates at which something audible changes; none of them
 * is a tone any headphone can produce, and `directToneAllowed` is false on
 * every row here for that reason. What you hear is the carrier or the noise;
 * the number is how fast it moves.
 *
 * The Schumann rows go one step further and carry `role: 'electromagnetic'`,
 * because 7.83 Hz is not even a sound in its original setting — it is a
 * resonance of the cavity between the ground and the ionosphere. Calling it a
 * modulation rate here would quietly convert a fact about the atmosphere into a
 * fact about audio, which is precisely the conversion this collection exists to
 * refuse.
 */

// ── 02 · Brainwave Lab ───────────────────────────────────────────────────────

/**
 * Twelve rates on one carrier.
 *
 * The carrier is held at 220 Hz across the whole shelf so that the rate is the
 * only thing that changes between presets. That is a deliberate experimental
 * design and not a claim that 220 Hz is special: carrier choice measurably
 * affects how clearly a beat is perceived (best around 400–500 Hz in the
 * classic psychoacoustics), which is a separate variable the Explorer lets you
 * change.
 */
const BRAINWAVE_LAB: FrequencyPreset[] = [
  preset({
    id: 'bw-2',
    name: '2 Hz — Delta rate',
    collection: 'brainwave-lab',
    summary:
      'A 2 Hz binaural difference on a 220 Hz carrier: your left ear gets 220 Hz, your right 222 Hz, and the slow pulsation appears only after the two are combined neurally.',
    sourceFrequency: { value: 2, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'binaural', carrierHz: LAB_CARRIER_HZ, calculationMode: 'offset' },
    durationSec: 1800,
    intent: ['winding down', 'rest', 'listening'],
    classification: 'research',
    libraryEntryIds: ['binaural-beats', 'delta-range', 'carrier-choice'],
    archiveEntryIds: ['ifcn-alpha-10', 'carrier-440'],
    associations: [
      {
        claim: 'Delta-rate audio is widely sold as something that induces deep sleep.',
        medical: true,
        currentEvidence:
          'Slow-wave sleep itself is very well studied, but the sleep research that shows an effect delivered sound in phase with slow oscillations the sleeper was already producing — a different technique from playing a 2 Hz beat while awake. That a 2 Hz beat induces delta activity or improves sleep is not established.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['2 Hz', 'delta', 'delta waves', 'delta binaural'],
    tags: ['brainwave', 'delta', 'binaural', 'rate', 'sleep'],
  }),

  preset({
    id: 'bw-4',
    name: '4 Hz — Theta floor',
    collection: 'brainwave-lab',
    summary:
      'A 4 Hz binaural difference on a 220 Hz carrier. 4 Hz is where delta is conventionally said to end and theta to begin, which makes it a boundary rather than a category.',
    sourceFrequency: { value: 4, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'binaural', carrierHz: LAB_CARRIER_HZ, calculationMode: 'offset' },
    durationSec: 1800,
    intent: ['winding down', 'rest', 'listening'],
    classification: 'research',
    libraryEntryIds: ['binaural-beats', 'theta-range', 'delta-range'],
    archiveEntryIds: ['ifcn-alpha-10', 'carrier-440'],
    associations: [
      {
        claim: 'Rates at the delta/theta edge are described as a threshold into a different state.',
        medical: false,
        currentEvidence:
          'The edge is a naming convention. Brain activity is continuous across 4 Hz and nothing about the sound changes character there either — 3.9 Hz and 4.1 Hz are the same signal a fraction apart.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['4 Hz', 'theta', 'delta theta'],
    tags: ['brainwave', 'theta', 'binaural', 'rate'],
  }),

  preset({
    id: 'bw-5',
    name: '5 Hz — Theta rate',
    collection: 'brainwave-lab',
    summary: 'A 5 Hz binaural difference on a 220 Hz carrier — 220 Hz left, 225 Hz right.',
    sourceFrequency: { value: 5, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'binaural', carrierHz: LAB_CARRIER_HZ, calculationMode: 'offset' },
    durationSec: 1500,
    intent: ['meditation', 'winding down', 'listening'],
    classification: 'research',
    libraryEntryIds: ['binaural-beats', 'theta-range'],
    archiveEntryIds: ['ifcn-alpha-10', 'theta-beat-6', 'carrier-440'],
    associations: [
      {
        claim: 'Theta-rate beats are marketed as producing deep meditative or hypnotic states.',
        medical: false,
        currentEvidence:
          'A meta-analysis of binaural beats found a medium overall effect on cognition, anxiety and pain across a heterogeneous set of studies, with theta and delta rates doing best for anxiety. The underlying studies are small and varied, and no dependable relationship between listening to a theta-rate beat and entering a theta-dominant state has been shown.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['5 Hz', 'theta'],
    tags: ['brainwave', 'theta', 'binaural', 'rate', 'meditation'],
  }),

  preset({
    id: 'bw-6',
    name: '6 Hz — Theta rate',
    collection: 'brainwave-lab',
    summary:
      'A 6 Hz binaural difference on a 220 Hz carrier. The rate used in most theta-range beat studies, including those pooled in the 2019 meta-analysis.',
    sourceFrequency: { value: 6, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'binaural', carrierHz: LAB_CARRIER_HZ, calculationMode: 'offset' },
    durationSec: 1500,
    intent: ['meditation', 'winding down', 'listening'],
    classification: 'research',
    libraryEntryIds: ['binaural-beats', 'theta-range'],
    archiveEntryIds: ['theta-beat-6', 'ifcn-alpha-10', 'carrier-440'],
    associations: [
      {
        claim:
          'That because 6 Hz is the rate most of the anxiety studies used, this preset is the thing those studies tested.',
        medical: true,
        currentEvidence:
          'The pooled finding is real — a medium-to-large effect on anxiety for theta and delta beats across 22 studies — and it is also thin: small samples, heterogeneous designs, and a mechanism that is not consistently supported. Those studies were not this preset either; carriers, durations and instructions all differed. Treatment of clinical anxiety is not established.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['6 Hz', 'theta', '6 hz binaural'],
    tags: ['brainwave', 'theta', 'binaural', 'rate', 'meditation'],
  }),

  preset({
    id: 'bw-7-5',
    name: '7.5 Hz — Theta rate',
    collection: 'brainwave-lab',
    summary:
      'A 7.5 Hz binaural difference on a 220 Hz carrier, near the top of theta and a fraction below the Schumann figure it is often confused with.',
    sourceFrequency: { value: 7.5, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'binaural', carrierHz: LAB_CARRIER_HZ, calculationMode: 'offset' },
    durationSec: 1500,
    intent: ['meditation', 'winding down', 'listening'],
    classification: 'research',
    libraryEntryIds: ['binaural-beats', 'theta-range'],
    archiveEntryIds: ['ifcn-alpha-10', 'carrier-440'],
    associations: [
      {
        claim: 'Rates around 7.5 Hz are often presented interchangeably with the 7.83 Hz Schumann figure.',
        medical: false,
        currentEvidence:
          'They are different numbers with unrelated origins: 7.5 Hz is a round rate inside the theta band, and 7.83 Hz is a measured resonance of the Earth–ionosphere cavity. The Schumann-inspired collection keeps that number and its caveats separate.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['7.5 Hz', 'theta'],
    tags: ['brainwave', 'theta', 'binaural', 'rate'],
  }),

  preset({
    id: 'bw-8',
    name: '8 Hz — Alpha floor',
    collection: 'brainwave-lab',
    summary:
      'An 8 Hz binaural difference on a 220 Hz carrier, at the bottom edge of the alpha band as both the clinical glossary and the consumer convention draw it.',
    sourceFrequency: { value: 8, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'binaural', carrierHz: LAB_CARRIER_HZ, calculationMode: 'offset' },
    durationSec: 1500,
    intent: ['relaxation', 'meditation', 'listening'],
    classification: 'research',
    libraryEntryIds: ['binaural-beats', 'alpha-range', 'theta-range'],
    archiveEntryIds: ['ifcn-alpha-10', 'alpha-beat-10', 'carrier-440'],
    associations: [
      {
        claim: 'Alpha-rate audio is described as switching the brain into a relaxed state.',
        medical: false,
        currentEvidence:
          'Alpha describes activity that is measured, not a state that can be selected. Rhythmic stimulation can bias the timing of ongoing oscillations under some conditions; a 2023 systematic review found the evidence that binaural beats entrain cortical alpha to be mixed and inconsistent.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['8 Hz', 'alpha'],
    tags: ['brainwave', 'alpha', 'binaural', 'rate', 'relaxation'],
  }),

  preset({
    id: 'bw-10',
    name: '10 Hz — Alpha rate',
    collection: 'brainwave-lab',
    summary:
      'A 10 Hz binaural difference on a 220 Hz carrier: 220 Hz left, 230 Hz right. The centre of the alpha band and the most studied beat rate in the consumer literature.',
    sourceFrequency: { value: 10, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'binaural', carrierHz: LAB_CARRIER_HZ, calculationMode: 'offset' },
    durationSec: 1500,
    intent: ['relaxation', 'listening', 'background listening'],
    classification: 'research',
    libraryEntryIds: ['binaural-beats', 'alpha-range', 'carrier-choice'],
    archiveEntryIds: ['alpha-10', 'alpha-beat-10', 'ifcn-alpha-10', 'carrier-440'],
    associations: [
      {
        claim: 'A 10 Hz beat is commonly described as inducing an alpha state.',
        medical: false,
        currentEvidence:
          'That a 10 Hz beat moves your alpha rhythm to 10 Hz is not established, and relaxation or focus benefits specific to this rate are not established either. Alpha-rate beats do sit in the range where binaural beats are most easily perceived, which is a fact about hearing rather than about brain state.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['10 Hz', 'alpha', '10 hz binaural', 'alpha waves'],
    tags: ['brainwave', 'alpha', 'binaural', 'rate', 'relaxation'],
  }),

  preset({
    id: 'bw-12',
    name: '12 Hz — Alpha ceiling',
    collection: 'brainwave-lab',
    summary:
      'A 12 Hz binaural difference on a 220 Hz carrier, at the top of alpha and one hertz below the line where consumer material starts calling it beta.',
    sourceFrequency: { value: 12, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'binaural', carrierHz: LAB_CARRIER_HZ, calculationMode: 'offset' },
    durationSec: 1200,
    intent: ['relaxation', 'focus', 'listening'],
    classification: 'research',
    libraryEntryIds: ['binaural-beats', 'alpha-range', 'beta-range'],
    archiveEntryIds: ['ifcn-alpha-10', 'alpha-beat-10', 'carrier-440'],
    associations: [
      {
        claim: 'Rates near 12 Hz are sold as either calming or alerting, depending on the seller.',
        medical: false,
        currentEvidence:
          'Both descriptions come from the band label rather than from a finding, and the label itself is contested here: 12 Hz is alpha on every list, 13 Hz is alpha or beta depending on which list you read. No controlled evidence assigns a specific mental effect to this rate.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['12 Hz', 'alpha', 'low beta'],
    tags: ['brainwave', 'alpha', 'binaural', 'rate'],
  }),

  preset({
    id: 'bw-15',
    name: '15 Hz — Beta rate',
    collection: 'brainwave-lab',
    summary: 'A 15 Hz binaural difference on a 220 Hz carrier — 220 Hz left, 235 Hz right.',
    sourceFrequency: { value: 15, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'binaural', carrierHz: LAB_CARRIER_HZ, calculationMode: 'offset' },
    durationSec: 1200,
    intent: ['focus', 'study', 'listening'],
    classification: 'research',
    libraryEntryIds: ['binaural-beats', 'beta-range'],
    archiveEntryIds: ['ifcn-alpha-10', 'carrier-440'],
    associations: [
      {
        claim: 'Beta-rate beats are marketed as concentration or productivity audio.',
        medical: false,
        currentEvidence:
          'Beat studies of attention and vigilance report small and inconsistent effects. That a beta-rate beat improves concentration for a given person is not established — and detection of the beat itself is best around 10–15 Hz, so what changes most reliably at this rate is how clearly you hear it.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['15 Hz', 'beta'],
    tags: ['brainwave', 'beta', 'binaural', 'rate', 'focus'],
  }),

  preset({
    id: 'bw-20',
    name: '20 Hz — Beta rate',
    collection: 'brainwave-lab',
    summary:
      'A 20 Hz binaural difference on a 220 Hz carrier. Fast enough that most listeners hear a rough flutter rather than a countable pulse.',
    sourceFrequency: { value: 20, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'binaural', carrierHz: LAB_CARRIER_HZ, calculationMode: 'offset' },
    durationSec: 1200,
    intent: ['focus', 'listening', 'experimentation'],
    classification: 'research',
    libraryEntryIds: ['binaural-beats', 'beta-range'],
    archiveEntryIds: ['ifcn-alpha-10', 'beat-limit-35', 'carrier-440'],
    associations: [
      {
        claim: 'Higher beta rates are described as increasing alertness.',
        medical: false,
        currentEvidence:
          'Not established. As the rate climbs the beat also becomes progressively harder to hear — detection falls away above about 30 Hz — so at these rates the honest description is that the sound is rougher, not that the listener is more alert.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['20 Hz', 'beta'],
    tags: ['brainwave', 'beta', 'binaural', 'rate', 'focus'],
  }),

  preset({
    id: 'bw-30',
    name: '30 Hz — Beta / gamma boundary',
    collection: 'brainwave-lab',
    summary:
      'A 30 Hz binaural difference on a 220 Hz carrier, right at the line between beta and gamma — and near the point where a binaural beat stops being heard as a beat.',
    sourceFrequency: { value: 30, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'binaural', carrierHz: LAB_CARRIER_HZ, calculationMode: 'offset' },
    durationSec: 900,
    intent: ['experimentation', 'comparison', 'listening'],
    classification: 'research',
    libraryEntryIds: ['binaural-beats', 'beta-range', 'assr'],
    archiveEntryIds: ['beat-limit-35', 'ifcn-alpha-10', 'carrier-440'],
    associations: [
      {
        claim: 'Rates around 30 Hz are sold as low gamma, with the effects attributed to 40 Hz work.',
        medical: false,
        currentEvidence:
          'The band edge is a convention — this app calls 30 Hz gamma, much consumer material calls it the top of beta. Separately, detection of a binaural beat falls to roughly half near a 30 Hz difference, so at this rate many listeners simply hear two tones. The isochronic and AM forms in Gamma 40 do not have that limitation.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['30 Hz', 'gamma', 'low gamma', 'beta'],
    tags: ['brainwave', 'gamma', 'beta', 'binaural', 'rate'],
  }),

  preset({
    id: 'bw-40',
    name: '40 Hz — Gamma rate (binaural)',
    collection: 'brainwave-lab',
    summary:
      'A 40 Hz binaural difference on a 220 Hz carrier — above the reported ceiling for hearing a binaural beat at all, so expect two tones rather than a pulse. Included because the comparison is the lesson.',
    sourceFrequency: { value: 40, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'binaural', carrierHz: LAB_CARRIER_HZ, calculationMode: 'offset' },
    durationSec: 900,
    intent: ['comparison', 'experimentation', 'listening'],
    classification: 'research',
    libraryEntryIds: ['binaural-beats', 'assr', 'gamma-40hz'],
    archiveEntryIds: ['beat-limit-35', 'assr-40', 'carrier-440'],
    associations: [
      {
        claim: 'A 40 Hz binaural beat is sold as gamma stimulation of the kind used in dementia research.',
        medical: true,
        currentEvidence:
          'The maximum interaural difference still heard as a binaural beat peaks around 35 Hz, so a 40 Hz binaural pair is at or past that limit for most listeners. The published gamma work used amplitude-modulated sound — usually synchronised with light — not a binaural beat, and no clinical benefit in humans is established. Compare this preset against the isochronic and AM forms on the Gamma 40 shelf and hear the difference for yourself.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['40 Hz', 'gamma', '40hz binaural'],
    tags: ['brainwave', 'gamma', 'binaural', 'rate', '40hz'],
  }),
];

// ── 06 · Gamma 40 ────────────────────────────────────────────────────────────

/**
 * The claim that has to be answered on every row of this shelf.
 *
 * 40 Hz stimulation is a genuinely active research area and it reliably evokes
 * a rate-locked cortical response — that much is among the best-characterised
 * effects in auditory electrophysiology. What it is not is an established
 * treatment for anything, and the gap between those two sentences is where
 * every piece of misleading marketing about this number lives.
 */
const GAMMA_CLAIM = {
  claim:
    "Popular coverage presents 40 Hz light and sound as a treatment that slows or reverses Alzheimer's disease.",
  medical: true,
  currentEvidence:
    "Clinical efficacy is not established. The influential pathology findings are in mice; the 15-patient human pilot was tiny and had missing data; the larger OVERTURE trial missed its primary endpoint, with ADAS-Cog14, CDR-SB and amyloid PET all null, and its authors state it was not powered for efficacy. Those protocols also used synchronised light *and* sound at controlled intensity through dedicated apparatus, for an hour a day over months — not headphone audio. This preset produces a measurable auditory response and treats nothing.",
} as const;

const GAMMA_40: FrequencyPreset[] = [
  preset({
    id: 'gamma40-am',
    name: '40 Hz — Amplitude modulation',
    collection: 'gamma-40',
    summary:
      'A 440 Hz tone whose loudness rises and falls 40 times a second at 80% depth. The modulation is physically present in the signal, so it shows up on a measurement and works on any output.',
    sourceFrequency: { value: 40, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'am', carrierHz: 440, modulationDepth: 0.8 },
    durationSec: 1800,
    intent: ['listening', 'experimentation'],
    classification: 'research',
    libraryEntryIds: ['assr', 'gamma-40hz', 'isochronic-tones'],
    archiveEntryIds: ['assr-40', 'genus-40', 'overture-40'],
    associations: [GAMMA_CLAIM],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['40 Hz', '40hz', 'gamma', 'gamma 40', 'am'],
    tags: ['gamma', '40hz', 'am', 'modulation', 'research'],
  }),

  preset({
    id: 'gamma40-pink-noise',
    name: '40 Hz — Pink noise modulation',
    collection: 'gamma-40',
    summary:
      'Pink noise amplitude-modulated at 40 Hz rather than a tone. Broadband, so the rate arrives across the whole spectrum at once, and considerably easier to sit with over a long stretch than a modulated sine.',
    sourceFrequency: { value: 40, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'noise-modulation', modulationDepth: 0.8, noiseColor: 'pink', noiseLevel: 0.3 },
    durationSec: 1800,
    intent: ['listening', 'background listening', 'experimentation'],
    classification: 'research',
    libraryEntryIds: ['assr', 'gamma-40hz', 'pink-noise'],
    archiveEntryIds: ['assr-40', 'genus-40', 'overture-40'],
    associations: [GAMMA_CLAIM],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['40 Hz', 'gamma', 'pink noise', '40hz noise'],
    tags: ['gamma', '40hz', 'noise', 'pink', 'modulation', 'research'],
  }),

  preset({
    id: 'gamma40-soft',
    name: '40 Hz — Reduced depth',
    collection: 'gamma-40',
    summary:
      'The same 440 Hz carrier modulated at 40 Hz, but at 35% depth instead of 80%. Much gentler to listen to; the modulation is correspondingly shallower, which is a trade rather than a free improvement.',
    sourceFrequency: { value: 40, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'am', carrierHz: 440, modulationDepth: 0.35 },
    durationSec: 2400,
    intent: ['background listening', 'listening', 'comparison'],
    classification: 'research',
    libraryEntryIds: ['assr', 'gamma-40hz'],
    archiveEntryIds: ['assr-40', 'genus-40'],
    associations: [
      GAMMA_CLAIM,
      {
        claim: 'Gentler versions are often described as equivalent to the full-depth signal.',
        medical: false,
        currentEvidence:
          'They are not equivalent. The strength of an auditory steady-state response scales with modulation depth, so a shallower signal evokes a smaller response. Comfort and response strength pull in opposite directions here and this preset chooses comfort.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['40 Hz', 'gamma', 'soft gamma', '40hz gentle'],
    tags: ['gamma', '40hz', 'am', 'modulation', 'research'],
  }),

  preset({
    id: 'gamma40-isochronic',
    name: '40 Hz — Isochronic',
    collection: 'gamma-40',
    summary:
      'A 440 Hz tone gated fully on and off 40 times a second, with cosine edges so the switching does not produce broadband clicks. The most unambiguous form of the rate on this shelf.',
    sourceFrequency: { value: 40, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'isochronic', carrierHz: 440, modulationDepth: 1 },
    durationSec: 1800,
    intent: ['listening', 'experimentation', 'comparison'],
    classification: 'research',
    libraryEntryIds: ['isochronic-tones', 'assr', 'gamma-40hz'],
    archiveEntryIds: ['assr-40', 'iso-tone-10', 'overture-40'],
    associations: [
      GAMMA_CLAIM,
      {
        claim: 'Isochronic tones are described as stronger or more effective than binaural beats.',
        medical: false,
        currentEvidence:
          'The modulation is physically present rather than perceptual, so it does not need headphones and it evokes a clear steady-state response. Whether that translates into a stronger subjective effect is untested: a 2021 review found isochronic tones scarcely explored, with two qualifying studies out of seventeen.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['40 Hz', 'gamma', 'isochronic', '40hz pulse'],
    tags: ['gamma', '40hz', 'isochronic', 'modulation', 'research'],
  }),

  preset({
    id: 'gamma40-binaural',
    name: '40 Hz — Binaural (at the limit)',
    collection: 'gamma-40',
    summary:
      'A 440 Hz carrier split into a 420/460 Hz pair. At a 40 Hz difference most listeners no longer hear a beat at all — they hear two separate tones — which is exactly why this preset is here next to the other four.',
    sourceFrequency: { value: 40, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'binaural-centered', carrierHz: 440, calculationMode: 'centered' },
    durationSec: 900,
    intent: ['comparison', 'experimentation', 'listening'],
    classification: 'research',
    libraryEntryIds: ['binaural-beats', 'assr', 'gamma-40hz'],
    archiveEntryIds: ['beat-limit-35', 'assr-40', 'carrier-440'],
    associations: [
      GAMMA_CLAIM,
      {
        claim: 'Products sell "40 Hz binaural gamma" as the audio used in the gamma research.',
        medical: false,
        currentEvidence:
          'The maximum interaural difference still heard as a binaural beat peaks at about 35 Hz for carriers near 400 Hz. A 40 Hz binaural pair is therefore past the limit for most people, and it is not what the published gamma protocols delivered — those used amplitude-modulated sound, usually with synchronised light.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['40 Hz', 'gamma', '40hz binaural'],
    tags: ['gamma', '40hz', 'binaural', 'modulation', 'research'],
  }),
];

// ── 05 · Schumann-inspired ───────────────────────────────────────────────────

/**
 * The sentence that makes this collection honest.
 *
 * Repeated verbatim on every row rather than paraphrased, because a paraphrase
 * is where the caveat gets softened.
 */
const SCHUMANN_NOT_REPRODUCED =
  'Headphones produce sound. The Schumann resonances are electromagnetic oscillations of the cavity between the Earth\'s surface and the ionosphere, and no loudspeaker reproduces one. What this preset plays is an acoustic signal whose rate has been set to the same number — an analogy borrowed from the figure, not the phenomenon itself.';

const SCHUMANN_INSPIRED: FrequencyPreset[] = [
  preset({
    id: 'earth-783',
    name: '7.83 Hz — First mode',
    collection: 'schumann-inspired',
    summary:
      'The lowest Earth–ionosphere cavity resonance, used here as a 7.83 Hz binaural difference on a 220 Hz carrier: 220 Hz left, 227.83 Hz right. An acoustic representation inspired by the number.',
    sourceFrequency: { value: 7.83, unit: 'Hz', role: 'electromagnetic' },
    representation: { kind: 'binaural', carrierHz: LAB_CARRIER_HZ, calculationMode: 'offset' },
    durationSec: 1800,
    intent: ['meditation', 'relaxation', 'listening'],
    classification: 'experimental',
    libraryEntryIds: ['schumann-resonance', 'binaural-beats'],
    archiveEntryIds: ['schumann-783'],
    associations: [
      {
        claim:
          'That playing this preset puts the listener in resonance with the planet, and that doing so is good for you.',
        medical: true,
        currentEvidence:
          'Neither half holds. Nothing is being matched: ' +
          SCHUMANN_NOT_REPRODUCED +
          ' And no reliable clinical evidence supports a wellbeing effect — the geophysics and the health claim are unrelated propositions that share a number.',
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['7.83', '7.83 Hz', 'schumann', 'schumann resonance', 'earth frequency', 'earth resonance'],
    tags: ['schumann', 'earth', '7.83', 'binaural', 'rate'],
  }),

  preset({
    id: 'earth-1430',
    name: '14.3 Hz — Second mode',
    collection: 'schumann-inspired',
    summary:
      'The second cavity mode as a 14.3 Hz binaural difference on a 220 Hz carrier. Published values for this mode range about 14.1–14.3 Hz because the measured peak is broad and drifts with ionospheric conditions.',
    sourceFrequency: { value: 14.3, unit: 'Hz', role: 'electromagnetic' },
    representation: { kind: 'binaural', carrierHz: LAB_CARRIER_HZ, calculationMode: 'offset' },
    durationSec: 1200,
    intent: ['listening', 'experimentation'],
    classification: 'experimental',
    libraryEntryIds: ['schumann-resonance', 'binaural-beats'],
    archiveEntryIds: ['schumann-mode2', 'schumann-783'],
    associations: [
      {
        claim: 'The higher modes are presented as a precise harmonic ladder above 7.83 Hz.',
        medical: false,
        currentEvidence:
          'They are not exact harmonics and they are not precise: the measured modes fall near 7.83, 14.3, 20.8, 27.3 and 33.8 Hz, each a broad peak that moves with conditions. ' +
          SCHUMANN_NOT_REPRODUCED,
      },
    ],
    safety: { headphonesRecommended: true, directToneAllowed: false, output: 'headphones' },
    aliases: ['14.3', '14.3 Hz', 'schumann', 'second mode', 'earth resonance'],
    tags: ['schumann', 'earth', '14.3', 'binaural', 'rate'],
  }),

  preset({
    id: 'earth-2080',
    name: '20.8 Hz — Third mode',
    collection: 'schumann-inspired',
    summary:
      'The third cavity mode as a 20.8 Hz isochronic pulse on a 220 Hz carrier. Pulsed rather than binaural because at this rate a binaural difference is already becoming hard to hear as a beat.',
    sourceFrequency: { value: 20.8, unit: 'Hz', role: 'electromagnetic' },
    representation: { kind: 'isochronic', carrierHz: LAB_CARRIER_HZ, modulationDepth: 0.7 },
    durationSec: 1200,
    intent: ['listening', 'experimentation'],
    classification: 'experimental',
    libraryEntryIds: ['schumann-resonance', 'isochronic-tones'],
    archiveEntryIds: ['schumann-mode3', 'schumann-783'],
    associations: [
      {
        claim: 'Higher Schumann modes are described as increasingly energising.',
        medical: false,
        currentEvidence:
          'Nothing establishes that. Published values for this mode span roughly 20.3–20.8 Hz depending on conditions and on who measured it. ' +
          SCHUMANN_NOT_REPRODUCED,
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['20.8', '20.8 Hz', 'schumann', 'third mode'],
    tags: ['schumann', 'earth', '20.8', 'isochronic', 'rate'],
  }),

  preset({
    id: 'earth-2730',
    name: '27.3 Hz — Fourth mode',
    collection: 'schumann-inspired',
    summary:
      'The fourth cavity mode as a 27.3 Hz isochronic pulse on a 220 Hz carrier. Fast enough that the pulsing is heard as roughness in the tone rather than as separate beats.',
    sourceFrequency: { value: 27.3, unit: 'Hz', role: 'electromagnetic' },
    representation: { kind: 'isochronic', carrierHz: LAB_CARRIER_HZ, modulationDepth: 0.7 },
    durationSec: 900,
    intent: ['listening', 'experimentation'],
    classification: 'experimental',
    libraryEntryIds: ['schumann-resonance', 'isochronic-tones'],
    archiveEntryIds: ['schumann-mode4', 'schumann-783'],
    associations: [
      {
        claim: 'The modes are quoted to three significant figures as though they were constants.',
        medical: false,
        currentEvidence:
          'Published values for this mode range about 26.3–27.3 Hz. The precision in the printed number is a convention of the reference tables, not a property of the atmosphere. ' +
          SCHUMANN_NOT_REPRODUCED,
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['27.3', '27.3 Hz', 'schumann', 'fourth mode'],
    tags: ['schumann', 'earth', '27.3', 'isochronic', 'rate'],
  }),

  preset({
    id: 'earth-3380',
    name: '33.8 Hz — Fifth mode',
    collection: 'schumann-inspired',
    summary:
      'The fifth cavity mode — the highest clearly visible in the first 1960 measurements — as a 33.8 Hz isochronic pulse on a 220 Hz carrier.',
    sourceFrequency: { value: 33.8, unit: 'Hz', role: 'electromagnetic' },
    representation: { kind: 'isochronic', carrierHz: LAB_CARRIER_HZ, modulationDepth: 0.7 },
    durationSec: 900,
    intent: ['listening', 'experimentation', 'comparison'],
    classification: 'experimental',
    libraryEntryIds: ['schumann-resonance', 'isochronic-tones'],
    archiveEntryIds: ['schumann-mode5', 'schumann-783', 'beat-limit-35'],
    associations: [
      {
        claim: 'This mode is sometimes offered as a binaural beat like the lower ones.',
        medical: false,
        currentEvidence:
          'At 33.8 Hz a binaural difference is at the edge of what can be heard as a beat at all — the limit peaks near 35 Hz — so it is delivered here as a pulse instead. ' +
          SCHUMANN_NOT_REPRODUCED,
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['33.8', '33.8 Hz', 'schumann', 'fifth mode'],
    tags: ['schumann', 'earth', '33.8', 'isochronic', 'rate'],
  }),
];

// ── 09 · Noise Lab ───────────────────────────────────────────────────────────

/**
 * Noise, alone and carrying a rate.
 *
 * Every colour here is synthesised sample by sample from a seeded generator
 * rather than looped from a recording, so a 45-minute session never repeats,
 * and the three colours are level-matched so switching between them is not also
 * a volume change.
 *
 * The combination presets amplitude-modulate the noise itself rather than
 * layering a beat under it. That makes them a single coherent signal with the
 * rate physically present — audible on a speaker, measurable on a meter — and
 * it keeps them clearly distinct from the binaural rows in the Brainwave Lab.
 */
const NOISE_LAB: FrequencyPreset[] = [
  preset({
    id: 'noise-white',
    name: 'White noise',
    collection: 'noise-lab',
    summary:
      'Equal energy per hertz, straight from a uniform random source. Bright and hissy, because equal energy per hertz puts most of the power in the top octaves where there are more hertz to fill.',
    sourceFrequency: { value: NO_SOURCE_FREQUENCY, unit: 'Hz', role: 'unspecified' },
    representation: { kind: 'noise-modulation', modulationDepth: 0, noiseColor: 'white', noiseLevel: 0.25 },
    durationSec: 1800,
    intent: ['masking', 'background listening', 'sleep preparation'],
    classification: 'research',
    libraryEntryIds: ['white-brown-noise'],
    archiveEntryIds: [],
    associations: [
      {
        claim: 'Noise colours are marketed with specific cognitive and therapeutic effects.',
        medical: true,
        currentEvidence:
          'Masking is the well-understood part: broadband noise reduces the audibility of intermittent sounds, which is straightforward acoustics. Specific cognitive or therapeutic effects attributed to particular colours are not established.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['white noise', 'white', 'noise', 'static'],
    tags: ['noise', 'white', 'masking', 'sleep'],
  }),

  preset({
    id: 'noise-pink',
    name: 'Pink noise',
    collection: 'noise-lab',
    summary:
      'Power falling about 3 dB per octave, so every octave carries the same energy. The colour most listeners find balanced, and the one most shipped content uses.',
    sourceFrequency: { value: NO_SOURCE_FREQUENCY, unit: 'Hz', role: 'unspecified' },
    representation: { kind: 'noise-modulation', modulationDepth: 0, noiseColor: 'pink', noiseLevel: 0.25 },
    durationSec: 1800,
    intent: ['masking', 'background listening', 'sleep preparation', 'focus'],
    classification: 'research',
    libraryEntryIds: ['pink-noise'],
    archiveEntryIds: [],
    associations: [
      {
        claim: 'Pink noise is widely described as improving sleep quality and memory.',
        medical: true,
        currentEvidence:
          'A small study reported improved sleep stability with pink noise, and separate work has enhanced slow oscillations by delivering sound in phase with them during sleep. Neither establishes a reliable, general effect on sleep quality from playing pink noise — the studies are small and the results vary.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['pink noise', 'pink', 'noise'],
    tags: ['noise', 'pink', 'masking', 'sleep', 'focus'],
  }),

  preset({
    id: 'noise-brown',
    name: 'Brown noise',
    collection: 'noise-lab',
    summary:
      'Power falling about 6 dB per octave — distant surf, or heavy rain. Generated by integrating a random source, with a soft reflecting bound so a long session cannot drift into a DC offset.',
    sourceFrequency: { value: NO_SOURCE_FREQUENCY, unit: 'Hz', role: 'unspecified' },
    representation: { kind: 'noise-modulation', modulationDepth: 0, noiseColor: 'brown', noiseLevel: 0.25 },
    durationSec: 1800,
    intent: ['masking', 'background listening', 'sleep preparation'],
    classification: 'research',
    libraryEntryIds: ['white-brown-noise'],
    archiveEntryIds: [],
    associations: [
      {
        claim: 'Brown noise is described as uniquely calming, or as helpful for attention difficulties.',
        medical: true,
        currentEvidence:
          'Not established. What is established is masking, and that the steep roll-off makes brown noise sound darker and less fatiguing than white — a description of the spectrum, not of an effect on the listener.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['brown noise', 'brown', 'red noise', 'noise'],
    tags: ['noise', 'brown', 'masking', 'sleep'],
  }),

  preset({
    id: 'noise-pink-alpha-10',
    name: 'Pink + 10 Hz',
    collection: 'noise-lab',
    summary:
      'Pink noise amplitude-modulated at 10 Hz, 50% depth. The rate is physically in the signal rather than perceptual, so it survives a speaker and a phone microphone alike.',
    sourceFrequency: { value: 10, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'noise-modulation', modulationDepth: 0.5, noiseColor: 'pink', noiseLevel: 0.25 },
    durationSec: 1800,
    intent: ['relaxation', 'background listening', 'experimentation'],
    classification: 'experimental',
    libraryEntryIds: ['pink-noise', 'alpha-range', 'isochronic-tones'],
    archiveEntryIds: ['alpha-10', 'ifcn-alpha-10'],
    associations: [
      {
        claim: 'Noise pulsed at an alpha rate is sold as alpha entrainment with a comfortable bed.',
        medical: false,
        currentEvidence:
          'Amplitude-modulated sound does evoke a measurable response at the modulation rate. That this moves your alpha rhythm, or produces relaxation in a given person, is not established — and modulated noise specifically has barely been studied at all.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['pink noise', 'alpha', '10 Hz', 'pink alpha'],
    tags: ['noise', 'pink', 'alpha', 'modulation', 'relaxation'],
  }),

  preset({
    id: 'noise-pink-theta-6',
    name: 'Pink + 6 Hz',
    collection: 'noise-lab',
    summary: 'Pink noise amplitude-modulated at 6 Hz, 50% depth — a slow swell rather than a flutter.',
    sourceFrequency: { value: 6, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'noise-modulation', modulationDepth: 0.5, noiseColor: 'pink', noiseLevel: 0.25 },
    durationSec: 1800,
    intent: ['meditation', 'winding down', 'background listening'],
    classification: 'experimental',
    libraryEntryIds: ['pink-noise', 'theta-range', 'isochronic-tones'],
    archiveEntryIds: ['theta-beat-6'],
    associations: [
      {
        claim: 'Theta-modulated noise is marketed for deep meditation and anxiety.',
        medical: true,
        currentEvidence:
          'The meta-analytic finding for anxiety comes from binaural beats, not from modulated noise, and its underlying studies are small and heterogeneous. No study establishes an effect for this configuration.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['pink noise', 'theta', '6 Hz', 'pink theta'],
    tags: ['noise', 'pink', 'theta', 'modulation', 'meditation'],
  }),

  preset({
    id: 'noise-brown-theta-6',
    name: 'Brown + 6 Hz',
    collection: 'noise-lab',
    summary:
      'Brown noise amplitude-modulated at 6 Hz, 50% depth. The same rate as the pink version over a much darker spectrum — a useful pair for hearing what the colour alone changes.',
    sourceFrequency: { value: 6, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'noise-modulation', modulationDepth: 0.5, noiseColor: 'brown', noiseLevel: 0.25 },
    durationSec: 1800,
    intent: ['meditation', 'winding down', 'comparison'],
    classification: 'experimental',
    libraryEntryIds: ['white-brown-noise', 'theta-range', 'isochronic-tones'],
    archiveEntryIds: ['theta-beat-6'],
    associations: [
      {
        claim: 'Darker noise at a slow rate is described as reaching deeper states.',
        medical: false,
        currentEvidence:
          'There is no evidence for a depth ordering between noise colours. The three colours here are level-matched, so what changes between this preset and the pink one is spectral balance and nothing else.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['brown noise', 'theta', '6 Hz', 'brown theta'],
    tags: ['noise', 'brown', 'theta', 'modulation', 'meditation'],
  }),

  preset({
    id: 'noise-brown-783',
    name: 'Brown + 7.83 Hz',
    collection: 'noise-lab',
    summary:
      'Brown noise amplitude-modulated at 7.83 Hz, 45% depth. The number is borrowed from the first Schumann cavity resonance and used here purely as a rate.',
    sourceFrequency: { value: 7.83, unit: 'Hz', role: 'electromagnetic' },
    representation: { kind: 'noise-modulation', modulationDepth: 0.45, noiseColor: 'brown', noiseLevel: 0.25 },
    durationSec: 1800,
    intent: ['meditation', 'background listening', 'winding down'],
    classification: 'experimental',
    libraryEntryIds: ['white-brown-noise', 'schumann-resonance'],
    archiveEntryIds: ['schumann-783'],
    associations: [
      {
        claim: 'Earth-resonance noise is described as grounding, or as re-syncing the body with the planet.',
        medical: true,
        currentEvidence:
          'No reliable clinical evidence supports this. ' + SCHUMANN_NOT_REPRODUCED,
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['brown noise', 'schumann', '7.83', '7.83 Hz', 'earth'],
    tags: ['noise', 'brown', 'schumann', '7.83', 'modulation'],
  }),

  preset({
    id: 'noise-pink-gamma-40',
    name: 'Pink + 40 Hz',
    collection: 'noise-lab',
    summary:
      'Pink noise amplitude-modulated at 40 Hz, 30% depth — an ambient version of the Gamma 40 noise form, shallow enough to leave on in the background.',
    sourceFrequency: { value: 40, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'noise-modulation', modulationDepth: 0.3, noiseColor: 'pink', noiseLevel: 0.25 },
    durationSec: 1800,
    intent: ['background listening', 'listening', 'experimentation'],
    classification: 'experimental',
    libraryEntryIds: ['pink-noise', 'assr', 'gamma-40hz'],
    archiveEntryIds: ['assr-40'],
    associations: [
      {
        claim: 'Any 40 Hz audio is presented as equivalent to the signal used in gamma research.',
        medical: true,
        currentEvidence:
          'It is not. This preset is deliberately shallow (30% depth) for comfort, which makes the evoked response smaller than the full-depth form on the Gamma 40 shelf — and neither is a treatment for anything. Clinical benefit in humans is not established.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['pink noise', 'gamma', '40 Hz', '40hz noise'],
    tags: ['noise', 'pink', 'gamma', '40hz', 'modulation'],
  }),

  preset({
    id: 'noise-sleep',
    name: 'Sleep — brown, 2 Hz swell',
    collection: 'noise-lab',
    summary:
      'Brown noise at a slightly higher level with a very shallow 2 Hz swell (20% depth), for 45 minutes. Dark, slow and quiet enough to stay under a room; the modulation is barely perceptible by design.',
    sourceFrequency: { value: 2, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'noise-modulation', modulationDepth: 0.2, noiseColor: 'brown', noiseLevel: 0.3 },
    durationSec: 2700,
    intent: ['sleep preparation', 'masking', 'background listening'],
    classification: 'experimental',
    libraryEntryIds: ['white-brown-noise', 'delta-range'],
    archiveEntryIds: [],
    associations: [
      {
        claim: 'Sleep audio is sold as inducing or improving sleep.',
        medical: true,
        currentEvidence:
          'Masking intermittent noise is a real and understood effect, and it is the honest reason a preset like this can help. That a 2 Hz modulation induces delta activity or improves sleep architecture is not established. Set the level low: a long session at a comfortable-seeming volume still accumulates exposure.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['sleep', 'sleep noise', 'brown noise', 'deep sleep'],
    tags: ['noise', 'brown', 'sleep', 'delta', 'masking'],
  }),

  preset({
    id: 'noise-focus',
    name: 'Focus — pink, 15 Hz',
    collection: 'noise-lab',
    summary:
      'Pink noise with a 15 Hz modulation at 35% depth, for 50 minutes. Broadband enough to cover an open-plan room, with the rate present but not intrusive.',
    sourceFrequency: { value: 15, unit: 'Hz', role: 'modulation' },
    representation: { kind: 'noise-modulation', modulationDepth: 0.35, noiseColor: 'pink', noiseLevel: 0.25 },
    durationSec: 3000,
    intent: ['focus', 'study', 'masking', 'background listening'],
    classification: 'experimental',
    libraryEntryIds: ['pink-noise', 'beta-range'],
    archiveEntryIds: ['ifcn-alpha-10'],
    associations: [
      {
        claim: 'Focus audio at a beta rate is sold as measurably improving concentration.',
        medical: false,
        currentEvidence:
          'Beat studies of attention report small and inconsistent effects, and none of them tested modulated noise. The dependable part is masking: covering intermittent sound removes interruptions, which is a different mechanism from anything happening at 15 Hz.',
      },
    ],
    safety: {
      headphonesRecommended: false,
      directToneAllowed: false,
      output: 'headphones-or-speakers',
    },
    aliases: ['focus', 'pink noise', 'concentration', 'study', '15 Hz'],
    tags: ['noise', 'pink', 'beta', 'focus', 'masking'],
  }),
];

export const LAB_PRESETS: FrequencyPreset[] = [
  ...BRAINWAVE_LAB,
  ...GAMMA_40,
  ...SCHUMANN_INSPIRED,
  ...NOISE_LAB,
];
