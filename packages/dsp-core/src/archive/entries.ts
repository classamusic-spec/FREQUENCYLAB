import { playbackCompatibility } from './transforms.js';
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

const SEED_DATE = '2026-01-01T00:00:00.000Z';

function entry(
  partial: Omit<ArchiveEntry, 'unit' | 'playback' | 'createdAt' | 'updatedAt' | 'changeLog' | 'sourceVersion' | 'evidenceVersion'> &
    Partial<Pick<ArchiveEntry, 'sourceVersion' | 'evidenceVersion' | 'changeLog'>>,
): ArchiveEntry {
  return {
    unit: 'Hz',
    playback: playbackCompatibility(partial.frequency),
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
    sourceVersion: partial.sourceVersion ?? 1,
    evidenceVersion: partial.evidenceVersion ?? 1,
    changeLog: partial.changeLog ?? [
      { version: 1, at: SEED_DATE, change: 'Record created.', scope: 'historical-record' },
    ],
    ...partial,
  } as ArchiveEntry;
}

export const ARCHIVE_ENTRIES: ArchiveEntry[] = [
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
      'FREQUENCY LAB ships no Rife frequency table. The circulating condition-to-frequency lists cannot be traced to a verifiable primary document from within this app, and publishing numbers with invented citations would be exactly the failure this archive is built to avoid. Import your own list instead: every row keeps the file it came from as its provenance, which is an honest chain. Whatever the numbers, note the physics below — it is the part that does not change.',
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
    related: ['rife-beam-ray', 'solfeggio-528', 'schumann-783'],
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
      'The resonance is real and well documented. Using 7.83 Hz as an audio modulation rate is an analogy, not a reproduction: headphones emit sound, not an atmospheric electromagnetic field. Treat it as a historically interesting number to experiment with, not as a mechanism.',
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
    related: ['rife-context', 'assr-40'],
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
      'Frequently described as ancient. The medieval Guidonian solmisation syllables the set is named after describe relative pitch, not absolute frequencies — so the historical attribution does not hold, whatever one makes of the tones themselves.',
    claims: [
      {
        claim: 'This frequency is widely claimed to repair DNA.',
        medical: true,
        currentEvidence:
          'There is no evidence for this. It is not a mechanism recognised by molecular biology, and no clinical work supports it.',
      },
    ],
    recommendedTransform: 'Direct tone — the value is already an audible pitch.',
    tags: ['solfeggio', '528', 'traditional'],
    aliases: ['MI 528', 'Love frequency'],
    related: ['solfeggio-396', 'concert-a440'],
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
      originalContext: 'The international standard fixing the tuning reference.',
    },
    summary:
      'The international tuning reference. A committee decision so instruments made in different places play together.',
    archiveNote:
      'Included as the reference point for the tuning debates elsewhere in this archive. Orchestras have historically tuned to a range of pitches; some still tune slightly higher.',
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
    related: ['concert-a432', 'solfeggio-528'],
  }),

  entry({
    id: 'concert-a432',
    name: 'Alternative tuning A4 = 432',
    frequency: 432,
    category: 'traditional',
    signalRole: 'carrier',
    evidenceLevel: 'traditional',
    verification: 'source-unclear',
    source: {
      title: 'Alternative-tuning advocacy (circulating material)',
      author: 'Various',
      year: null,
      originalContext:
        'Advocacy for tuning A4 to 432 Hz, often presented with historical or mathematical justifications.',
    },
    summary:
      'A widely advocated alternative tuning reference. Held here as a separate record from A440 rather than as a correction to it.',
    archiveNote:
      'The historical claims made for 432 Hz vary between sources and this record does not adjudicate them. It is kept distinct from the ISO reference precisely because the two are different propositions.',
    claims: [
      {
        claim: 'Described as being in harmony with nature, or as mathematically superior.',
        medical: false,
        currentEvidence:
          'No controlled evidence establishes a perceptual or physiological difference attributable to the tuning reference itself.',
      },
    ],
    recommendedTransform: 'Direct tone. Compare against A440 to hear the difference for yourself.',
    tags: ['tuning', '432', 'traditional'],
    aliases: ['A432'],
    related: ['concert-a440'],
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
export const ARCHIVE_SETS: ArchiveSet[] = [
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

export function archiveEntry(id: string): ArchiveEntry | undefined {
  return ARCHIVE_ENTRIES.find((candidate) => candidate.id === id);
}

export function archiveSet(id: string): ArchiveSet | undefined {
  return ARCHIVE_SETS.find((candidate) => candidate.id === id);
}
