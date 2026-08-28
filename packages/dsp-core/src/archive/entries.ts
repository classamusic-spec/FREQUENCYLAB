import { makeEntry, SEED_DATE } from './make.js';
import { EXPANSION_ENTRIES, EXPANSION_SETS } from './expansion.js';
import type { ArchiveEntry, ArchiveSet } from './types.js';

/**
 * The shipped archive.
 *
 * **What is deliberately absent.** No Rife frequency *table* ships with the
 * app. The widely circulated condition-to-frequency lists cannot be traced to a
 * verifiable primary document from this codebase, and inventing plausible
 * numbers with plausible citations would be fabricating provenance — the one
 * thing the archive exists to prevent (§45).
 *
 * What ships instead is the *history*: entries that document the episode
 * itself, each traceable to a real record, plus the frequency systems whose
 * origins genuinely are documented. Users bring their own lists in through the
 * import path (§17), where every row is labelled `unverified` and attributed to
 * the file it came from — which is an honest provenance chain, unlike a number
 * the app asserts on its own authority.
 *
 * Every `source` below is a real, findable record. Identifiers are omitted
 * rather than reconstructed from memory.
 */

const entry = makeEntry;

const CORE_ENTRIES: ArchiveEntry[] = [
  // ── Historical Rife ────────────────────────────────────────────────────────
  entry({
    id: 'rife-context',
    name: 'Rife-associated frequencies',
    frequency: 0,
    contextOnly: true,
    category: 'historical-rife',
    signalRole: 'electromagnetic',
    evidenceLevel: 'unsupported-medical-claim',
    verification: 'source-unclear',
    source: {
      title: 'Rife-associated frequency lists (circulating compilations)',
      author: 'Various, after Royal Raymond Rife',
      year: null,
      originalContext:
        'Lists pairing named conditions with frequency values, circulated in print and online from the late twentieth century onward.',
    },
    summary:
      'An index record for the Rife material, not a frequency itself. It exists so the archive can state plainly what it does and does not hold.',
    archiveNote:
      'FREQUENCY LAB ships no modern Rife treatment table: the circulating condition-to-frequency compilations (CAFL, ETDFL) cannot be traced past their modern compilers. What the archive does hold is every number that IS traceable — attributed to its real era. The famous audio values (727/728, 784, 880, 2008, 2128) are documented to the 1950s Crane-era AZ-58 device, not to Rife\'s 1930s laboratory; the 1930s lab papers record only radio frequencies, reaching us through unpublished manuscripts and modern transcription. Each record says which. For anything else, import your own list: every row keeps the file it came from as its provenance. Whatever the numbers, note the physics below — it is the part that does not change.',
    claims: [
      {
        claim:
          'Historical and later community sources associate specific frequencies with specific diseases, and describe destroying or devitalising pathogens by resonance.',
        medical: true,
        currentEvidence:
          'No reliable clinical evidence establishes that acoustic playback at any frequency treats, cures, kills or prevents any pathogen, cancer, parasite or disease. Regulators in several countries have taken enforcement action against sellers of devices marketed on these grounds.',
      },
      {
        claim:
          "Rife's original apparatus is described in period accounts as an electrical and optical instrument.",
        medical: false,
        currentEvidence:
          'Whatever that apparatus did, this app produces sound through headphones. Acoustic playback is not equivalent to electrical or electromagnetic exposure, and no frequency entered here reproduces the historical equipment.',
      },
    ],
    recommendedTransform: 'Not applicable — this record documents context rather than a value.',
    tags: ['rife', 'historical', 'context', 'unsupported'],
    aliases: ['Rife frequencies', 'Rife list'],
    related: ['rife-beam-ray', 'az58-728', 'rife-mor-bx', 'rife-cafl', 'rife-prosecutions'],
    sourceVersion: 2,
    changeLog: [
      { version: 1, at: SEED_DATE, change: 'Record created; no Rife numbers were held.', scope: 'historical-record' },
      {
        version: 2,
        at: SEED_DATE,
        change:
          'Documented-era records added to the archive: 1930s lab-paper RF claims (via modern transcription), the 1953 AZ-58 audio dial values, and the episode records around them. This index updated to say what is now held and how each chain runs.',
        scope: 'historical-record',
      },
    ],
  }),

  entry({
    id: 'rife-beam-ray',
    name: 'Beam Ray litigation (1939)',
    frequency: 0,
    contextOnly: true,
    category: 'historical-rife',
    signalRole: 'electromagnetic',
    evidenceLevel: 'historical',
    verification: 'primary-historical',
    source: {
      title: 'Beam Ray Corporation litigation, San Diego',
      author: 'Superior Court of California, San Diego County',
      year: 1939,
      originalContext:
        'A commercial dispute between principals of the Beam Ray Corporation, which manufactured devices based on Rife’s work.',
      reference: 'Court records, San Diego County, 1939',
    },
    summary:
      'A documented episode in the history of Rife-associated devices, included because the provenance of the story matters as much as the numbers attached to it.',
    archiveNote:
      'Included as historical context. The existence of a lawsuit is a documented fact; it establishes nothing about whether any device worked.',
    claims: [
      {
        claim: 'Contemporary promotional material described the devices as clinically effective.',
        medical: true,
        currentEvidence:
          'The claims were not substantiated then and are not supported by evidence now. Commercial promotion is not clinical evidence.',
      },
    ],
    recommendedTransform: 'Not applicable — this record documents context rather than a value.',
    tags: ['rife', 'historical', 'context'],
    aliases: ['Beam Ray'],
    related: ['rife-context'],
  }),

  // ── Earth / resonance ──────────────────────────────────────────────────────
  entry({
    id: 'schumann-783',
    name: 'Schumann resonance, first mode',
    frequency: 7.83,
    category: 'earth-resonance',
    signalRole: 'electromagnetic',
    evidenceLevel: 'traditional',
    verification: 'primary-historical',
    source: {
      title:
        'Über die strahlungslosen Eigenschwingungen einer leitenden Kugel, die von einer Luftschicht und einer Ionosphärenhülle umgeben ist',
      author: 'W. O. Schumann',
      year: 1952,
      originalContext:
        'A prediction of resonant modes in the cavity between the Earth’s surface and the ionosphere.',
      reference: 'Zeitschrift für Naturforschung A, 7(2), 149–154',
    },
    summary:
      'The lowest resonant mode of the Earth–ionosphere cavity, later measured. Established geophysics, and an electromagnetic phenomenon rather than a sound.',
    archiveNote:
      'The resonance is real and well documented: Schumann predicted the mode in 1952 (his lossless estimate was ~10 Hz), and Balser & Wagner first measured the spectrum in 1960 (Nature 188, 638–641), resolving five modes below 34 Hz — held here as related records. Using 7.83 Hz as an audio modulation rate is an analogy, not a reproduction: headphones emit sound, not an atmospheric electromagnetic field. Treat it as a historically interesting number to experiment with, not as a mechanism.',
    claims: [
      {
        claim:
          'Popular material claims that exposure to a 7.83 Hz audio signal confers health or wellbeing benefits by matching the planet’s resonance.',
        medical: true,
        currentEvidence:
          'No reliable clinical evidence supports this. The geophysical measurement and the wellbeing claim are unrelated propositions.',
      },
    ],
    recommendedTransform: 'Binaural difference on a 220 Hz carrier — the value is far below audibility.',
    tags: ['schumann', '7.83', 'earth', 'historical'],
    aliases: ['Earth resonance', 'Schumann frequency'],
    related: ['schumann-mode2', 'schumann-mode3', 'schumann-mode4', 'schumann-mode5'],
    sourceVersion: 2,
    changeLog: [
      { version: 1, at: SEED_DATE, change: 'Record created.', scope: 'historical-record' },
      {
        version: 2,
        at: SEED_DATE,
        change:
          'First-measurement citation added (Balser & Wagner 1960) and the four higher modes linked as related records.',
        scope: 'historical-record',
      },
    ],
  }),

  // ── Traditional ────────────────────────────────────────────────────────────
  entry({
    id: 'solfeggio-528',
    name: 'Solfeggio 528',
    frequency: 528,
    category: 'traditional',
    signalRole: 'carrier',
    evidenceLevel: 'traditional',
    verification: 'secondary-historical',
    source: {
      title: 'Healing Codes for the Biological Apocalypse',
      author: 'L. G. Horowitz and J. Puleo',
      year: 1999,
      originalContext:
        'A numerological reading of a biblical passage, presented as recovering an ancient tone scale.',
      reference: 'Tetrahedron Publishing Group',
    },
    summary:
      'The best known of the modern Solfeggio set. Its origin is a 1990s publication, not a surviving historical tuning.',
    archiveNote:
      'Frequently described as ancient. The documented derivation is numerological: verse numbers from Numbers chapter 7 (14, 20, 26, 32, 38, 44) digit-reduce to 5-2-8, and the nine-tone set is the cyclic digit-permutations of 174, 285 and 396. The medieval Guidonian solmisation syllables the set is named after describe relative pitch, not absolute frequencies — so the historical attribution does not hold, whatever one makes of the tones themselves.',
    claims: [
      {
        claim: 'This frequency is widely claimed to repair DNA.',
        medical: true,
        currentEvidence:
          'There is no evidence for this. It is not a mechanism recognised by molecular biology, and no clinical work supports it. The closest peer-reviewed study is a nine-person 2018 endocrine experiment in a low-tier venue — held here as its own research record — which establishes nothing about DNA.',
      },
    ],
    recommendedTransform: 'Direct tone — the value is already an audible pitch.',
    tags: ['solfeggio', '528', 'traditional'],
    aliases: ['MI 528', 'Love frequency'],
    related: ['solfeggio-396', 'concert-a440', 'tone-528-study'],
    evidenceVersion: 2,
    changeLog: [
      { version: 1, at: SEED_DATE, change: 'Record created.', scope: 'historical-record' },
      {
        version: 2,
        at: SEED_DATE,
        change:
          'Evidence assessment expanded: the one small peer-reviewed study at this value is now cited and linked, without changing the assessment. Derivation of the set documented in the archive note.',
        scope: 'evidence-assessment',
      },
    ],
  }),

  entry({
    id: 'solfeggio-396',
    name: 'Solfeggio 396',
    frequency: 396,
    category: 'traditional',
    signalRole: 'carrier',
    evidenceLevel: 'traditional',
    verification: 'secondary-historical',
    source: {
      title: 'Healing Codes for the Biological Apocalypse',
      author: 'L. G. Horowitz and J. Puleo',
      year: 1999,
      originalContext: 'The lowest tone of the modern Solfeggio set.',
      reference: 'Tetrahedron Publishing Group',
    },
    summary: 'The first tone of the modern Solfeggio set, from the same 1999 source.',
    claims: [
      {
        claim: 'Described as releasing fear and guilt.',
        medical: false,
        currentEvidence:
          'A traditional attribution rather than a finding. No controlled evidence establishes a specific effect for this pitch.',
      },
    ],
    recommendedTransform: 'Direct tone.',
    tags: ['solfeggio', '396', 'traditional'],
    aliases: ['UT 396'],
    related: ['solfeggio-528'],
  }),

  entry({
    id: 'concert-a440',
    name: 'Concert pitch A4',
    frequency: 440,
    category: 'traditional',
    signalRole: 'carrier',
    evidenceLevel: 'research-supported',
    verification: 'primary-historical',
    source: {
      title: 'ISO 16:1975 — Acoustics: Standard tuning frequency (Standard musical pitch)',
      author: 'International Organization for Standardization',
      year: 1975,
      originalContext:
        'The chain runs: Scheibler\'s Stuttgart recommendation of 1834, the international conference at Broadcasting House, London, in May 1939, ISO Recommendation R 16 in 1955, and ISO 16:1975, still current.',
    },
    summary:
      'The international tuning reference. A committee decision so instruments made in different places play together.',
    archiveNote:
      'Included as the reference point for the tuning debates elsewhere in this archive. A440 was a compromise between national standards, with no acoustic or biological significance over neighbouring values; orchestras have historically tuned across a wide band, and some still tune slightly higher.',
    claims: [
      {
        claim: 'Circulating material claims 440 Hz is harmful and that 432 Hz is more natural.',
        medical: true,
        currentEvidence:
          'These are cultural arguments, not findings. No evidence establishes harm from a tuning standard or benefit from another.',
      },
    ],
    recommendedTransform: 'Direct tone.',
    tags: ['tuning', '440', 'music', 'reference'],
    aliases: ['A440', 'Concert A'],
    related: ['concert-a432', 'pitch-a435', 'pitch-middle-c'],
    sourceVersion: 2,
    changeLog: [
      { version: 1, at: SEED_DATE, change: 'Record created.', scope: 'historical-record' },
      {
        version: 2,
        at: SEED_DATE,
        change: 'Provenance chain completed back through the 1939 London conference to Scheibler (1834).',
        scope: 'historical-record',
      },
    ],
  }),

  entry({
    id: 'concert-a432',
    name: 'A432 tuning',
    frequency: 432,
    category: 'traditional',
    signalRole: 'carrier',
    evidenceLevel: 'traditional',
    verification: 'secondary-historical',
    source: {
      title: 'Tuning Sounds in Italy, 1750–1885',
      author: 'E. Lockhart',
      year: 2025,
      originalContext:
        'The documented record: the Congresso dei Musicisti Italiani (Milan, June 1881) voted A=432 as the Italian diapason, and the Italian War Ministry prescribed it for military bands by decree of 25 August 1884 (Giornale Militare Ufficiale, Acts 153–154). Verdi\'s 1884 letter accepts 432 as a rounding of the French 435 for "mathematical exigencies", a difference he called almost imperceptible.',
      reference: 'Nineteenth-Century Music Review 22/3, 344–360',
    },
    summary:
      'A real, documented nineteenth-century Italian pitch standard — and a modern mythology that has nothing to do with that record.',
    archiveNote:
      'The ancient/cosmic framing attached to 432 today traces to a campaign begun in 1988, which actually argued for C=256 — a tuning that gives A≈430.54, not 432. The documented story is Verdi-era practical standardisation; Boito argued for 432 at the Vienna conference of 1885 and lost. Kept as a distinct record from A440 so the two can be compared by ear.',
    claims: [
      {
        claim: 'Widely described online as an ancient, natural, or healing tuning suppressed in favour of A440.',
        medical: false,
        currentEvidence:
          'The documented origin is the 1881 Milan congress and an 1884 Italian military decree, not antiquity. No controlled evidence establishes a health difference between tunings a third of a semitone apart.',
      },
    ],
    recommendedTransform: 'Direct tone — compare it against A440 by ear.',
    tags: ['tuning', '432', 'traditional'],
    aliases: ['Verdi tuning', "Verdi's A"],
    related: ['concert-a440', 'pitch-a435', 'pitch-c256'],
    sourceVersion: 2,
    changeLog: [
      { version: 1, at: SEED_DATE, change: 'Record created with the source marked unclear.', scope: 'historical-record' },
      {
        version: 2,
        at: SEED_DATE,
        change:
          'Provenance established: Milan congress of June 1881 and Italian War Ministry decree of 25 August 1884, per Lockhart (2025). Verification upgraded from source-unclear to secondary-historical; the modern mythology is now documented separately from the historical record.',
        scope: 'historical-record',
      },
    ],
  }),

  // ── Research ───────────────────────────────────────────────────────────────
  entry({
    id: 'assr-40',
    name: '40 Hz auditory steady-state rate',
    frequency: 40,
    category: 'research',
    signalRole: 'modulation',
    evidenceLevel: 'research-supported',
    verification: 'primary-historical',
    source: {
      title: 'A 40-Hz auditory potential recorded from the human scalp',
      author: 'R. Galambos, S. Makeig and P. J. Talmachoff',
      year: 1981,
      originalContext: 'The original description of the 40 Hz auditory steady-state response.',
      reference: 'Proceedings of the National Academy of Sciences, 78(4), 2643–2647',
    },
    summary:
      'The modulation rate at which the auditory steady-state response is largest in awake adults. Used clinically to estimate hearing thresholds.',
    archiveNote:
      'The evoked response is among the best-characterised effects in auditory electrophysiology. That it can be evoked is established; that evoking it produces a therapeutic benefit is not.',
    claims: [
      {
        claim: 'Popular material extends mouse studies of 40 Hz stimulation to claims about human dementia.',
        medical: true,
        currentEvidence:
          'The influential findings are in mice, human trials are early, and this app is not the apparatus those studies used. A clinical benefit in humans is not established.',
      },
    ],
    recommendedTransform: 'Isochronic pulse or AM rate on an audible carrier — 40 Hz is a rate, not a pitch.',
    tags: ['assr', '40hz', 'research', 'gamma'],
    aliases: ['40 Hz stimulation', 'Gamma rate'],
    related: ['schumann-783', 'alpha-10'],
  }),

  entry({
    id: 'alpha-10',
    name: 'Alpha-range modulation, 10 Hz',
    frequency: 10,
    category: 'research',
    signalRole: 'modulation',
    evidenceLevel: 'preliminary',
    verification: 'modern-compilation',
    source: {
      title:
        'Entrainment of perceptually relevant brain oscillations by non-invasive rhythmic stimulation of the human brain',
      author: 'G. Thut, P. G. Schyns and J. Gross',
      year: 2011,
      originalContext:
        'A review of the conditions under which rhythmic sensory stimulation can influence ongoing oscillations.',
      reference: 'Frontiers in Psychology, 2, 170',
    },
    summary:
      'A representative rate from the alpha band, the 8–13 Hz activity prominent in relaxed wakefulness.',
    archiveNote:
      'Band boundaries are conventions describing measured activity, not switches. A beat inside a band does not place you in that state.',
    claims: [
      {
        claim: 'Commonly described as inducing an alpha state.',
        medical: false,
        currentEvidence:
          'Rhythmic stimulation can bias the timing of ongoing oscillations under some conditions. That a 10 Hz beat moves your alpha rhythm to 10 Hz is not established.',
      },
    ],
    recommendedTransform: 'Binaural difference on a 220 Hz carrier.',
    tags: ['alpha', '10hz', 'research'],
    aliases: ['Alpha rate'],
    related: ['assr-40', 'schumann-783'],
  }),
];

/** Grouped sets. Ships only where the grouping itself is documented (§12). */
export const ARCHIVE_ENTRIES: ArchiveEntry[] = [...CORE_ENTRIES, ...EXPANSION_ENTRIES];

const CORE_SETS: ArchiveSet[] = [
  {
    id: 'set-solfeggio',
    name: 'Solfeggio set',
    category: 'traditional',
    source: {
      title: 'Healing Codes for the Biological Apocalypse',
      author: 'L. G. Horowitz and J. Puleo',
      year: 1999,
      originalContext: 'The six-tone set as published.',
    },
    verification: 'secondary-historical',
    evidenceLevel: 'traditional',
    summary:
      'The modern Solfeggio tones. Only the two documented here ship as entries; the remainder are omitted rather than reconstructed.',
    entryIds: ['solfeggio-396', 'solfeggio-528'],
    notes:
      'The full set is usually given as 396, 417, 528, 639, 741 and 852 Hz. Entries ship only where this archive can attribute the value, which is why the set is partial.',
    version: 1,
  },
  {
    id: 'set-tuning-comparison',
    name: 'Tuning reference comparison',
    category: 'traditional',
    source: {
      title: 'Assembled by FREQUENCY LAB',
      author: 'FREQUENCY LAB',
      year: 2026,
      originalContext: 'A comparison set, not a historical grouping.',
    },
    verification: 'modern-compilation',
    evidenceLevel: 'traditional',
    summary: 'A440 against A432, so the tuning argument can be heard rather than read about.',
    entryIds: ['concert-a440', 'concert-a432'],
    version: 1,
  },
];

export const ARCHIVE_SETS: ArchiveSet[] = [...CORE_SETS, ...EXPANSION_SETS];

export function archiveEntry(id: string): ArchiveEntry | undefined {
  return ARCHIVE_ENTRIES.find((candidate) => candidate.id === id);
}

export function archiveSet(id: string): ArchiveSet | undefined {
  return ARCHIVE_SETS.find((candidate) => candidate.id === id);
}
