import type { LibraryEntry } from './types.js';

/**
 * The frequency library.
 *
 * Every source below is a real, findable publication, given with enough detail
 * (authors, year, title, journal) to look up. Identifiers such as DOIs are
 * deliberately omitted rather than reconstructed from memory — a wrong DOI is a
 * fabricated citation even when the paper behind it is real.
 *
 * `note` on each source says what the work actually established, which is
 * frequently narrower than the claim the frequency has picked up since.
 */
export const LIBRARY_ENTRIES: LibraryEntry[] = [
  {
    id: 'binaural-beats',
    category: 'research',
    title: 'Binaural beats',
    subtitle: 'Two tones, one per ear, and a beat that exists only in perception',
    frequencyHz: 7.83,
    frequencyKind: 'modulation',
    whatItIs:
      'When each ear receives a slightly different tone, the auditory system produces the sensation of a slow pulsation at the difference between them. Nothing in the air is pulsing — the beat appears after the two channels are combined neurally.',
    howGenerated:
      'Two independent oscillators. In offset mode the left ear gets the carrier and the right gets the carrier plus the beat; in centred mode the carrier is split symmetrically. Headphones are required, because a speaker mixes the channels before they reach either ear.',
    whatHasBeenStudied:
      'The perceptual phenomenon itself is long established and easy to reproduce. Effects on mood, anxiety and cognition have been studied repeatedly, with a meta-analysis reporting small effects across a heterogeneous set of studies.',
    whatHasNotBeenEstablished:
      'That a particular beat frequency reliably drives brain rhythms to match it, or produces a specific mental state in a given person. Study designs, carriers, durations and outcome measures vary so widely that per-frequency claims are not supportable.',
    evidence: 'promising',
    sources: [
      {
        authors: 'Oster, G.',
        year: 1973,
        title: 'Auditory beats in the brain',
        publication: 'Scientific American, 229(4), 94–102',
        kind: 'peer-reviewed',
        note: 'The classic description of the perceptual phenomenon and how it differs from an acoustic beat.',
      },
      {
        authors: 'Garcia-Argibay, M., Santed, M. A., & Reales, J. M.',
        year: 2019,
        title:
          'Efficacy of binaural auditory beats in cognition, anxiety, and pain perception: a meta-analysis',
        publication: 'Psychological Research, 83(2), 357–372',
        kind: 'meta-analysis',
        note: 'Reports small overall effects with substantial heterogeneity between studies.',
      },
      {
        authors: 'Chaieb, L., Wilpert, E. C., Reber, T. P., & Fell, J.',
        year: 2015,
        title: 'Auditory beat stimulation and its effects on cognition and mood states',
        publication: 'Frontiers in Psychiatry, 6, 70',
        kind: 'review',
        note: 'Reviews the literature and is explicit about its methodological inconsistency.',
      },
    ],
    recipe: { engine: 'binaural', beatHz: 7.83, carrierHz: 220 },
    tags: ['binaural', 'stereo', 'headphones'],
  },

  {
    id: 'monaural-beats',
    category: 'research',
    title: 'Monaural beats',
    subtitle: 'Two tones summed before your ears, so the beat is physically real',
    frequencyHz: 10,
    frequencyKind: 'modulation',
    whatItIs:
      'Two tones mixed into the same signal interfere with each other, producing a genuine amplitude fluctuation at their difference frequency. Unlike a binaural beat, this one exists in the air and shows up on a measurement.',
    howGenerated:
      'Two oscillators summed before the output stage. The modulation depth is greatest when both tones are at equal amplitude.',
    whatHasBeenStudied:
      'Monaural beats produce a stronger and more consistent auditory steady-state response than binaural beats in several comparisons, which is expected given that the modulation is physically present.',
    whatHasNotBeenEstablished:
      'That a stronger evoked response translates into a stronger subjective effect.',
    evidence: 'promising',
    sources: [
      {
        authors: 'Schwarz, D. W. F., & Taylor, P.',
        year: 2005,
        title: 'Human auditory steady state responses to binaural and monaural beats',
        publication: 'Clinical Neurophysiology, 116(3), 658–668',
        kind: 'peer-reviewed',
        note: 'Compares the evoked responses produced by the two kinds of beat.',
      },
    ],
    recipe: { engine: 'monaural', beatHz: 10, carrierHz: 220 },
    tags: ['monaural', 'speakers'],
  },

  {
    id: 'isochronic-tones',
    category: 'research',
    title: 'Isochronic tones',
    subtitle: 'A single tone switched on and off at a steady rate',
    frequencyHz: 10,
    frequencyKind: 'modulation',
    whatItIs:
      'One audible tone gated by a repeating envelope. The pulsing is unambiguous and does not depend on stereo separation, so it works on a speaker.',
    howGenerated:
      'A carrier oscillator multiplied by a pulse envelope. The envelope shape matters acoustically: instantaneous edges produce broadband clicks, which is why the default envelope has cosine attack and release.',
    whatHasBeenStudied:
      'Amplitude-modulated tones reliably evoke an auditory steady-state response at the modulation rate. This is one of the best-characterised effects in auditory electrophysiology.',
    whatHasNotBeenEstablished:
      'That evoking a steady-state response at a given rate produces a corresponding change in mood, attention or sleep.',
    evidence: 'promising',
    sources: [
      {
        authors: 'Picton, T. W., John, M. S., Dimitrijevic, A., & Purcell, D.',
        year: 2003,
        title: 'Human auditory steady-state responses',
        publication: 'International Journal of Audiology, 42(4), 177–219',
        kind: 'review',
        note: 'The standard review of how modulated sound evokes a measurable, rate-locked response.',
      },
    ],
    recipe: { engine: 'isochronic', beatHz: 10, carrierHz: 220 },
    tags: ['isochronic', 'speakers', 'modulation'],
  },

  {
    id: 'assr',
    category: 'research',
    title: 'Auditory steady-state response',
    subtitle: 'The measurable response to rhythmically modulated sound',
    frequencyHz: 40,
    frequencyKind: 'modulation',
    whatItIs:
      'A periodic electrical response, recordable at the scalp, that follows the modulation rate of a sound. It is used clinically to estimate hearing thresholds without asking the listener anything.',
    howGenerated:
      'Any amplitude-modulated carrier will evoke it. The response is largest around 40 Hz modulation in awake adults.',
    whatHasBeenStudied:
      'Extensively, since the early 1980s. The 40 Hz response in particular is well characterised and forms the basis of a clinical audiometry technique.',
    whatHasNotBeenEstablished:
      'That deliberately evoking this response confers a therapeutic benefit. It is a measurement tool first.',
    evidence: 'stronger',
    sources: [
      {
        authors: 'Galambos, R., Makeig, S., & Talmachoff, P. J.',
        year: 1981,
        title: 'A 40-Hz auditory potential recorded from the human scalp',
        publication: 'Proceedings of the National Academy of Sciences, 78(4), 2643–2647',
        kind: 'peer-reviewed',
        note: 'The original description of the 40 Hz auditory steady-state response.',
      },
      {
        authors: 'Picton, T. W., John, M. S., Dimitrijevic, A., & Purcell, D.',
        year: 2003,
        title: 'Human auditory steady-state responses',
        publication: 'International Journal of Audiology, 42(4), 177–219',
        kind: 'review',
      },
    ],
    recipe: { engine: 'isochronic', beatHz: 40, carrierHz: 500 },
    tags: ['assr', 'measurement', '40hz'],
  },

  {
    id: 'gamma-40hz',
    category: 'research',
    title: '40 Hz stimulation',
    subtitle: 'A well-studied modulation rate, and a claim that has outrun its evidence',
    frequencyHz: 40,
    frequencyKind: 'modulation',
    whatItIs:
      'Sensory stimulation modulated at 40 Hz. It reliably produces a rate-locked cortical response, and has been investigated in animal models of neurodegeneration.',
    howGenerated:
      'Amplitude modulation of an audible carrier at 40 Hz, alone or combined with light in the published protocols.',
    whatHasBeenStudied:
      'Mouse studies reported reductions in amyloid pathology and changes in microglial activity after combined 40 Hz light and sound exposure. Human trials have followed, and are ongoing.',
    whatHasNotBeenEstablished:
      'Any established clinical benefit in humans. The influential findings are in mice, the human work is early, and this app is not the apparatus those studies used. Nothing here treats or prevents any disease.',
    evidence: 'limited',
    sources: [
      {
        authors: 'Iaccarino, H. F., et al.',
        year: 2016,
        title: 'Gamma frequency entrainment attenuates amyloid load and modifies microglia',
        publication: 'Nature, 540(7632), 230–235',
        kind: 'peer-reviewed',
        note: 'Mouse study using 40 Hz visual stimulation. Not a human clinical result.',
      },
      {
        authors: 'Martorell, A. J., et al.',
        year: 2019,
        title:
          'Multi-sensory gamma stimulation ameliorates Alzheimer’s-associated pathology and improves cognition',
        publication: 'Cell, 177(2), 256–271',
        kind: 'peer-reviewed',
        note: 'Mouse study combining 40 Hz light and sound.',
      },
    ],
    recipe: { engine: 'isochronic', beatHz: 40, carrierHz: 440, noiseLevel: 0 },
    tags: ['gamma', '40hz', 'research'],
  },

  {
    id: 'alpha-range',
    category: 'research',
    title: 'Alpha range (8–13 Hz)',
    subtitle: 'A band of brain rhythm, not a switch',
    frequencyHz: 10,
    frequencyKind: 'modulation',
    whatItIs:
      'Alpha describes 8–13 Hz oscillations that are prominent in relaxed wakefulness, especially with eyes closed. The band is a description of measured activity — it is not a control input.',
    howGenerated: 'Any of the beat engines set to a modulation rate in this range.',
    whatHasBeenStudied:
      'Alpha rhythms themselves are among the most studied phenomena in electrophysiology. Rhythmic sensory stimulation can, under some conditions, bias the timing of ongoing oscillations.',
    whatHasNotBeenEstablished:
      'That listening to a 10 Hz beat moves your alpha rhythm to 10 Hz, or that it produces relaxation in any particular person. The band boundaries are conventions, not biological thresholds.',
    evidence: 'limited',
    sources: [
      {
        authors: 'Thut, G., Schyns, P. G., & Gross, J.',
        year: 2011,
        title:
          'Entrainment of perceptually relevant brain oscillations by non-invasive rhythmic stimulation of the human brain',
        publication: 'Frontiers in Psychology, 2, 170',
        kind: 'review',
        note: 'Discusses the conditions under which rhythmic stimulation can influence ongoing oscillations.',
      },
    ],
    recipe: { engine: 'binaural', beatHz: 10, carrierHz: 220 },
    tags: ['alpha', 'bands'],
  },

  {
    id: 'theta-range',
    category: 'research',
    title: 'Theta range (4–8 Hz)',
    subtitle: 'Associated with drowsiness, memory encoding and deep rest',
    frequencyHz: 6,
    frequencyKind: 'modulation',
    whatItIs:
      'Theta describes 4–8 Hz oscillations, prominent during drowsiness and in hippocampal activity related to memory and navigation.',
    howGenerated: 'Any beat engine set between 4 and 8 Hz.',
    whatHasBeenStudied:
      'Theta activity is well characterised. Auditory beat studies in the theta range have looked at relaxation, anxiety and memory, with mixed results.',
    whatHasNotBeenEstablished:
      'A dependable relationship between listening to a theta-rate beat and entering a theta-dominant state.',
    evidence: 'limited',
    sources: [
      {
        authors: 'Chaieb, L., Wilpert, E. C., Reber, T. P., & Fell, J.',
        year: 2015,
        title: 'Auditory beat stimulation and its effects on cognition and mood states',
        publication: 'Frontiers in Psychiatry, 6, 70',
        kind: 'review',
      },
    ],
    recipe: { engine: 'binaural', beatHz: 6, carrierHz: 200 },
    tags: ['theta', 'bands'],
  },

  {
    id: 'delta-range',
    category: 'research',
    title: 'Delta range (0.5–4 Hz)',
    subtitle: 'The slow rhythms of deep sleep',
    frequencyHz: 2,
    frequencyKind: 'modulation',
    whatItIs:
      'Delta describes the large, slow oscillations that dominate deep non-REM sleep.',
    howGenerated:
      'A beat engine below 4 Hz. At these rates a binaural beat is slow enough that many listeners hear it as a gentle wobble rather than a pulse.',
    whatHasBeenStudied:
      'Slow-wave sleep is very well studied. Separately, sound delivered in phase with existing slow oscillations during sleep has been shown to enhance them, which is a different technique from playing a slow beat before sleep.',
    whatHasNotBeenEstablished:
      'That a 2 Hz beat played while awake induces delta activity or improves sleep.',
    evidence: 'limited',
    sources: [
      {
        authors: 'Papalambros, N. A., et al.',
        year: 2017,
        title:
          'Acoustic enhancement of sleep slow oscillations and concomitant memory improvement in older adults',
        publication: 'Frontiers in Human Neuroscience, 11, 109',
        kind: 'peer-reviewed',
        note: 'Used phase-locked acoustic stimulation during sleep, not a beat played beforehand.',
      },
    ],
    recipe: { engine: 'binaural', beatHz: 2, carrierHz: 160 },
    tags: ['delta', 'sleep', 'bands'],
  },

  {
    id: 'beta-range',
    category: 'research',
    title: 'Beta range (13–30 Hz)',
    subtitle: 'Associated with alert, engaged wakefulness',
    frequencyHz: 15,
    frequencyKind: 'modulation',
    whatItIs:
      'Beta describes 13–30 Hz activity, typically present during active thinking and motor control.',
    howGenerated: 'Any beat engine set between 13 and 30 Hz.',
    whatHasBeenStudied:
      'Beta oscillations are well characterised, particularly in motor cortex. Beat studies in this range have examined attention and vigilance, with small and inconsistent effects.',
    whatHasNotBeenEstablished: 'That a beta-rate beat improves concentration for a given person.',
    evidence: 'limited',
    sources: [
      {
        authors: 'Garcia-Argibay, M., Santed, M. A., & Reales, J. M.',
        year: 2019,
        title:
          'Efficacy of binaural auditory beats in cognition, anxiety, and pain perception: a meta-analysis',
        publication: 'Psychological Research, 83(2), 357–372',
        kind: 'meta-analysis',
      },
    ],
    recipe: { engine: 'binaural', beatHz: 15, carrierHz: 240 },
    tags: ['beta', 'focus', 'bands'],
  },

  {
    id: 'pink-noise',
    category: 'acoustics',
    title: 'Pink noise',
    subtitle: 'Equal energy per octave — the noise the ear finds balanced',
    whatItIs:
      'Noise whose power falls at about 3 dB per octave, so each octave carries the same energy. It sounds fuller and less harsh than white noise.',
    howGenerated:
      'Filtered white noise, generated sample by sample rather than looped from a recording, so a long session never repeats.',
    whatHasBeenStudied:
      'Continuous acoustic stimulation during sleep has been studied for its effect on sleep continuity and depth, with some positive findings in small studies.',
    whatHasNotBeenEstablished:
      'A reliable, general effect on sleep quality. Study sizes are small and results vary.',
    evidence: 'limited',
    sources: [
      {
        authors: 'Zhou, J., Liu, D., Li, X., Ma, J., Zhang, J., & Fang, J.',
        year: 2012,
        title:
          'Pink noise: effect on complexity synchronization of brain activity and sleep consolidation',
        publication: 'Journal of Theoretical Biology, 306, 68–72',
        kind: 'peer-reviewed',
        note: 'A small study reporting improved sleep stability with pink noise.',
      },
    ],
    recipe: { noiseColor: 'pink', noiseLevel: 0.2 },
    tags: ['noise', 'pink'],
  },

  {
    id: 'white-brown-noise',
    category: 'acoustics',
    title: 'White and brown noise',
    subtitle: 'Flat, and steeply rolled off',
    whatItIs:
      'White noise has equal energy per hertz, so it sounds bright and hissy. Brown noise falls at about 6 dB per octave, so it sounds like distant surf or heavy rain.',
    howGenerated:
      'White noise comes straight from a uniform random source. Brown noise integrates that source, with a reflecting bound so a long session cannot drift into a DC offset.',
    whatHasBeenStudied:
      'Masking is the well-understood part: broadband noise reduces the audibility of intermittent sounds, which is a straightforward acoustic effect.',
    whatHasNotBeenEstablished:
      'Specific cognitive or therapeutic effects attributed to particular noise colours.',
    evidence: 'limited',
    sources: [
      {
        authors: 'Moore, B. C. J.',
        year: 2012,
        title: 'An Introduction to the Psychology of Hearing (6th edition)',
        publication: 'Emerald Group Publishing',
        kind: 'book',
        note: 'Standard textbook treatment of masking and noise perception.',
      },
    ],
    recipe: { noiseColor: 'brown', noiseLevel: 0.2 },
    tags: ['noise', 'white', 'brown', 'masking'],
  },

  {
    id: 'carrier-choice',
    category: 'acoustics',
    title: 'Choosing a carrier',
    subtitle: 'The tone you actually hear, and why it is not the beat',
    frequencyHz: 220,
    frequencyKind: 'carrier',
    whatItIs:
      'The carrier is the audible pitch. The beat is the slow rate at which that pitch fluctuates or alternates. A 7.83 Hz beat on a 220 Hz carrier means you hear a tone near 220 Hz — headphones cannot reproduce a 7.83 Hz acoustic tone, and are not trying to.',
    howGenerated:
      'Every engine takes a carrier parameter. Binaural mode derives two carriers from it; the other engines modulate a single one.',
    whatHasBeenStudied:
      'Carrier frequency measurably affects how strong a binaural beat is perceived to be, with the effect generally reported as strongest for carriers in the low hundreds of hertz and weakening as the carrier rises.',
    whatHasNotBeenEstablished:
      'That any particular carrier is optimal for a given outcome.',
    evidence: 'promising',
    sources: [
      {
        authors: 'Oster, G.',
        year: 1973,
        title: 'Auditory beats in the brain',
        publication: 'Scientific American, 229(4), 94–102',
        kind: 'peer-reviewed',
        note: 'Describes how the perception of binaural beats depends on carrier frequency.',
      },
    ],
    recipe: { carrierHz: 220 },
    tags: ['carrier', 'fundamentals'],
  },

  {
    id: 'concert-pitch',
    category: 'acoustics',
    title: 'A440 and concert pitch',
    subtitle: 'A tuning standard, agreed by committee',
    frequencyHz: 440,
    frequencyKind: 'carrier',
    whatItIs:
      'A4 = 440 Hz is the international tuning reference, standardised in the twentieth century. Orchestras have tuned to a range of pitches historically, and some still tune slightly higher.',
    howGenerated: 'Any oscillator set to 440 Hz.',
    whatHasBeenStudied:
      'Tuning history and practice are well documented. The standard exists so instruments made in different places play together.',
    whatHasNotBeenEstablished:
      'Any claim that 440 Hz is harmful, or that another reference pitch has health benefits. These are cultural arguments, not findings.',
    evidence: 'traditional',
    sources: [
      {
        authors: 'International Organization for Standardization',
        year: 1975,
        title: 'ISO 16:1975 — Acoustics: Standard tuning frequency (Standard musical pitch)',
        publication: 'ISO',
        kind: 'standard',
        note: 'The standard that fixes A4 at 440 Hz.',
      },
    ],
    recipe: { carrierHz: 440 },
    tags: ['tuning', 'music'],
  },

  {
    id: 'harmonic-series',
    category: 'acoustics',
    title: 'The harmonic series',
    subtitle: 'Why a tone has a colour as well as a pitch',
    frequencyHz: 110,
    frequencyKind: 'carrier',
    whatItIs:
      'Most pitched sounds contain a fundamental plus integer multiples of it. The relative levels of those partials are most of what we hear as timbre.',
    howGenerated:
      'The harmonic engine sums up to eight sine partials over one shared phase accumulator, so every partial stays locked to the fundamental through automation.',
    whatHasBeenStudied:
      'Thoroughly. The harmonic series underpins acoustics, instrument design and pitch perception.',
    whatHasNotBeenEstablished:
      'Nothing contested here — this entry is included as background rather than as a claim.',
    evidence: 'stronger',
    sources: [
      {
        authors: 'Helmholtz, H. von',
        year: 1863,
        title: 'Die Lehre von den Tonempfindungen als physiologische Grundlage für die Theorie der Musik',
        publication: 'Vieweg, Braunschweig',
        kind: 'historical',
        note: 'The foundational treatment of harmonics and timbre perception.',
      },
    ],
    recipe: { carrierHz: 110 },
    tags: ['harmonics', 'timbre'],
  },

  {
    id: 'schumann-resonance',
    category: 'historical',
    title: 'Schumann resonance (7.83 Hz)',
    subtitle: 'A real atmospheric phenomenon, widely reused as an audio setting',
    frequencyHz: 7.83,
    frequencyKind: 'modulation',
    whatItIs:
      'The Earth–ionosphere cavity resonates at a set of extremely low frequencies, the lowest around 7.83 Hz. This is an electromagnetic phenomenon in the atmosphere, predicted by Winfried Otto Schumann in 1952 and later measured.',
    howGenerated:
      'In this app, 7.83 Hz is used as a modulation or beat rate. That is an acoustic analogy, not a reproduction: headphones produce sound, not the atmospheric electromagnetic field.',
    whatHasBeenStudied:
      'The resonance itself is established geophysics. Claims that exposure to a 7.83 Hz audio beat confers health benefits are not supported by clinical evidence.',
    whatHasNotBeenEstablished:
      'Any biological effect of playing 7.83 Hz through headphones. Treat this as a historically interesting number to experiment with, not as a mechanism.',
    evidence: 'traditional',
    sources: [
      {
        authors: 'Schumann, W. O.',
        year: 1952,
        title:
          'Über die strahlungslosen Eigenschwingungen einer leitenden Kugel, die von einer Luftschicht und einer Ionosphärenhülle umgeben ist',
        publication: 'Zeitschrift für Naturforschung A, 7(2), 149–154',
        kind: 'peer-reviewed',
        note: 'The original prediction of the resonance. It is about atmospheric electromagnetism, not audio.',
      },
    ],
    recipe: { engine: 'binaural', beatHz: 7.83, carrierHz: 220 },
    tags: ['schumann', 'historical', '7.83'],
  },

  {
    id: 'solfeggio',
    category: 'historical',
    title: 'Solfeggio frequencies',
    subtitle: 'A modern numerology, often presented as ancient',
    frequencyHz: 528,
    frequencyKind: 'carrier',
    whatItIs:
      'A set of frequencies — 396, 417, 528, 639, 741, 852 Hz — popularised in the late twentieth century and commonly described as an ancient tone scale. The numbers come from a numerological reading of a biblical passage, published in the 1990s, rather than from any surviving historical tuning.',
    howGenerated: 'Simply an oscillator set to one of those frequencies.',
    whatHasBeenStudied:
      'The historical claim has been examined and does not hold up: the medieval Guidonian solmisation syllables these are named after describe a system of relative pitch, not a set of absolute frequencies.',
    whatHasNotBeenEstablished:
      'Every therapeutic claim attached to these numbers, including the widely repeated one about 528 Hz and DNA. There is no clinical evidence for any of them.',
    evidence: 'traditional',
    sources: [
      {
        authors: 'Horowitz, L. G., & Puleo, J.',
        year: 1999,
        title: 'Healing Codes for the Biological Apocalypse',
        publication: 'Tetrahedron Publishing Group',
        kind: 'book',
        note: 'The origin of the modern Solfeggio frequency set. It is the source of the claim, not evidence for it.',
      },
    ],
    recipe: { carrierHz: 528, engine: 'binaural', beatHz: 8 },
    tags: ['solfeggio', 'historical', '528'],
  },

  {
    id: 'rife-frequencies',
    category: 'historical',
    title: 'Rife-associated frequencies',
    subtitle: 'Historical claims with no supporting evidence, and an important physical distinction',
    whatItIs:
      'Lists of frequencies attributed to Royal Raymond Rife, who in the 1930s claimed that specific frequencies could destroy pathogens. The lists circulate widely and are often sold alongside devices.',
    howGenerated:
      'If you enter one of these numbers here, the app produces an ordinary acoustic tone or modulation rate through your headphones. Nothing else.',
    whatHasBeenStudied:
      'The claims have not been substantiated in peer-reviewed research. Regulators in several countries have taken enforcement action against sellers of devices marketed on these grounds.',
    whatHasNotBeenEstablished:
      'That any acoustic frequency kills, removes, treats or prevents pathogens, cancers, parasites or any disease. FREQUENCY LAB makes no such claim and will not present one.',
    evidence: 'unsupported',
    sources: [
      {
        authors: 'U.S. Federal Trade Commission',
        year: 2019,
        title:
          'Health claims enforcement: actions against marketers of devices claimed to treat disease with frequencies',
        publication: 'FTC consumer protection enforcement record',
        kind: 'regulatory',
        note:
          'Regulatory action, not a study. Included to document that these claims have been challenged, not to endorse any particular case.',
      },
    ],
    tags: ['rife', 'historical', 'unsupported'],
  },

  {
    id: 'safe-listening',
    category: 'acoustics',
    title: 'Safe listening levels',
    subtitle: 'The one thing in this library that is genuinely settled',
    whatItIs:
      'Hearing damage is a function of level and exposure time together. Long sessions at a comfortable-seeming volume still accumulate exposure.',
    howGenerated:
      'FREQUENCY LAB defaults to a conservative output level, fades in and out, limits the master output, and never raises your device volume for you.',
    whatHasBeenStudied:
      'Extensively. Dose-based exposure limits are the basis of international safe-listening guidance for personal audio devices.',
    whatHasNotBeenEstablished:
      'Nothing contested. Set your volume so a normal speaking voice would still be audible over it, and take breaks.',
    evidence: 'stronger',
    sources: [
      {
        authors: 'World Health Organization & International Telecommunication Union',
        year: 2019,
        title: 'Safe listening devices and systems: a WHO-ITU standard',
        publication: 'World Health Organization',
        kind: 'standard',
        note: 'Defines sound-allowance dose tracking for personal audio devices.',
      },
    ],
    tags: ['safety', 'hearing'],
  },
];

export function libraryEntry(id: string): LibraryEntry | undefined {
  return LIBRARY_ENTRIES.find((entry) => entry.id === id);
}

export function libraryByCategory(category: LibraryEntry['category']): LibraryEntry[] {
  return LIBRARY_ENTRIES.filter((entry) => entry.category === category);
}

/** Simple keyword search across the fields a user is likely to type. */
export function searchLibrary(query: string): LibraryEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return LIBRARY_ENTRIES;
  return LIBRARY_ENTRIES.filter((entry) =>
    [entry.title, entry.subtitle, entry.whatItIs, ...entry.tags, String(entry.frequencyHz ?? '')]
      .join(' ')
      .toLowerCase()
      .includes(needle),
  );
}
