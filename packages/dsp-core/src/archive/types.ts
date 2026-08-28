/**
 * The historical frequency archive.
 *
 * This module exists to hold two things apart that are almost always conflated
 * elsewhere: **what a historical source said**, and **what current evidence
 * supports**. They are separate fields, versioned separately, and rendered
 * separately. Updating an evidence assessment never edits the historical
 * record, and preserving a historical claim never implies endorsing it.
 *
 * Three rules the type system enforces:
 *  - a frequency always carries its provenance; there is no field for a number
 *    without a source;
 *  - conflicting sources are separate records, never averaged or merged;
 *  - anything played is played through an explicit, recorded transform, so a
 *    divided or re-tuned value can never be mistaken for the original.
 */

/** How much confidence the provenance chain deserves (§4). */
export type VerificationStatus =
  | 'primary-historical'
  | 'secondary-historical'
  | 'modern-compilation'
  | 'community-submitted'
  | 'source-unclear'
  | 'unverified';

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  'primary-historical': 'Primary historical source',
  'secondary-historical': 'Secondary historical source',
  'modern-compilation': 'Modern compilation',
  'community-submitted': 'Community submitted',
  'source-unclear': 'Source unclear',
  unverified: 'Unverified',
};

export const VERIFICATION_DESCRIPTIONS: Record<VerificationStatus, string> = {
  'primary-historical':
    'Traceable to a contemporaneous document, publication or record from the period itself.',
  'secondary-historical':
    'Reported by a later author citing the period, rather than by the period itself.',
  'modern-compilation':
    'Appears in a modern list or database. The chain back to any original document is not established here.',
  'community-submitted': 'Contributed by a user. Not independently checked.',
  'source-unclear': 'Circulates widely, but this record cannot establish where it originated.',
  unverified: 'Imported or entered without provenance. Treat the number as unattributed.',
};

/** How well supported the *effect* is, independent of provenance (§5). */
export type ArchiveEvidenceLevel =
  | 'research-supported'
  | 'preliminary'
  | 'historical'
  | 'traditional'
  | 'experimental'
  | 'unsupported-medical-claim';

export const ARCHIVE_EVIDENCE_LABELS: Record<ArchiveEvidenceLevel, string> = {
  'research-supported': 'Research-supported auditory effect',
  preliminary: 'Preliminary',
  historical: 'Historical',
  traditional: 'Traditional',
  experimental: 'Experimental',
  'unsupported-medical-claim': 'Unsupported medical claim',
};

export const ARCHIVE_EVIDENCE_DESCRIPTIONS: Record<ArchiveEvidenceLevel, string> = {
  'research-supported':
    'A measurable auditory or physiological response is established in peer-reviewed work. That is narrower than a clinical benefit.',
  preliminary: 'Published findings exist but are early, small, mixed, or narrower than the popular claim.',
  historical: 'Documented as part of a historical system. Inclusion records that it was said, not that it is so.',
  traditional: 'Part of a cultural or traditional framework. Included so it can be explored and tested.',
  experimental: 'Used experimentally without established evidence for a specific effect.',
  'unsupported-medical-claim':
    'A medical claim attached to this value is not supported by reliable evidence. Shown so the claim can be seen for what it is.',
};

export type ArchiveCategory =
  | 'historical-rife'
  | 'experimental-collection'
  | 'traditional'
  | 'earth-resonance'
  | 'research'
  | 'user-collection';

export const CATEGORY_LABELS: Record<ArchiveCategory, string> = {
  'historical-rife': 'Historical Rife',
  'experimental-collection': 'Experimental collections',
  traditional: 'Traditional frequencies',
  'earth-resonance': 'Earth / resonance-inspired',
  research: 'Research frequencies',
  'user-collection': 'User collections',
};

/** What the number is, physically. A rate and a pitch are not interchangeable. */
export type SignalRole = 'carrier' | 'modulation' | 'electromagnetic' | 'unspecified';

export interface ArchiveSource {
  title: string;
  author?: string;
  /** Publication or record year, when known. Null means genuinely unknown. */
  year?: number | null;
  /** Where the value sat in its original document. */
  originalContext?: string;
  /** A locator a reader could follow. Never invented. */
  reference?: string;
}

/**
 * A claim made *by a source*, quoted rather than asserted.
 *
 * `claim` is what the source said. `currentEvidence` is what can be said today.
 * The UI is required to render both together — a historical claim is never
 * displayed alone (§6).
 */
export interface HistoricalClaim {
  /** The claim as the source framed it, in reported speech. */
  claim: string;
  /** Whether the claim is medical in nature, which changes how it is presented. */
  medical: boolean;
  /** What reliable evidence establishes about that claim today. */
  currentEvidence: string;
}

export interface PlaybackCompatibility {
  /** The value can be produced as an audible tone as-is. */
  directAudible: boolean;
  /** Sensible as a binaural difference (i.e. it is a low enough rate). */
  binauralBeatCompatible: boolean;
  /** Sensible as a binaural carrier. */
  binauralCarrierCompatible: boolean;
  amCompatible: boolean;
  isochronicCompatible: boolean;
  /** Above what consumer headphones reproduce; needs a stated transform. */
  outsidePracticalRange: boolean;
}

/** One revision of a record. History is appended to, never rewritten (§20). */
export interface ArchiveRevision {
  version: number;
  at: string;
  /** What changed, in a sentence. */
  change: string;
  /** Which half of the record changed — the two version independently (§21). */
  scope: 'historical-record' | 'evidence-assessment' | 'metadata';
  by?: string;
}

export interface ArchiveEntry {
  id: string;
  name: string;
  /** The value exactly as the source gives it. Never rounded, never adjusted. */
  frequency: number;
  unit: 'Hz';
  category: ArchiveCategory;
  signalRole: SignalRole;
  evidenceLevel: ArchiveEvidenceLevel;
  verification: VerificationStatus;
  source: ArchiveSource;
  /** Neutral description of what the entry is. */
  summary: string;
  /** Context the app adds, clearly separated from the source's own words. */
  archiveNote?: string;
  /** Claims attached to this value by its source, each with a rebuttal. */
  claims: HistoricalClaim[];
  playback: PlaybackCompatibility;
  /** How the archive suggests hearing it, given its role. */
  recommendedTransform: string;
  tags: string[];
  aliases: string[];
  /** Ids of entries this one relates to mathematically or historically. */
  related: string[];
  /** Independent version counters, so evidence can update without touching history. */
  sourceVersion: number;
  evidenceVersion: number;
  createdAt: string;
  updatedAt: string;
  changeLog: ArchiveRevision[];
  /** Set on user-imported records. */
  importedBy?: string;
}

/** A named group of entries from one source (§12). */
export interface ArchiveSet {
  id: string;
  name: string;
  category: ArchiveCategory;
  source: ArchiveSource;
  verification: VerificationStatus;
  evidenceLevel: ArchiveEvidenceLevel;
  summary: string;
  /** Entry ids in the order the source gives them. Order is data, not styling. */
  entryIds: string[];
  /** Per-step seconds if the source documents timing. Absent means it does not. */
  documentedTimingSec?: number[];
  notes?: string;
  version: number;
}

/** A conflict between sources, preserved rather than resolved (§15). */
export interface SourceDisagreement {
  label: string;
  records: Array<{
    entryId: string;
    frequency: number;
    source: ArchiveSource;
    verification: VerificationStatus;
  }>;
}

export function isMedicalEntry(entry: ArchiveEntry): boolean {
  return entry.claims.some((claim) => claim.medical);
}

/** Practical reproduction limits for consumer headphones. */
export const AUDIBLE_MIN_HZ = 20;
export const AUDIBLE_MAX_HZ = 18000;
