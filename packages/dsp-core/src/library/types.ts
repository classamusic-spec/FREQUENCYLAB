import type { ExplorerRecipe } from '../protocol/recipes.js';

/**
 * Evidence rating.
 *
 * The scale is deliberately blunt, and `unsupported` is a first-class value
 * rather than something omitted: the library exists partly so that widely
 * circulated claims can be shown *and* labelled, instead of being left to the
 * rest of the internet (§15).
 */
export type EvidenceLevel =
  | 'stronger'
  | 'promising'
  | 'limited'
  | 'traditional'
  | 'unsupported';

export const EVIDENCE_LABELS: Record<EvidenceLevel, string> = {
  stronger: 'Stronger evidence',
  promising: 'Promising / preliminary',
  limited: 'Limited',
  traditional: 'Traditional / experimental',
  unsupported: 'Unsupported medical claim',
};

export const EVIDENCE_DESCRIPTIONS: Record<EvidenceLevel, string> = {
  stronger:
    'Repeatedly demonstrated in peer-reviewed work, though usually about a measurable physical or physiological response rather than a clinical outcome.',
  promising:
    'Real published findings exist, but they are early, small, mixed, or measured something narrower than the popular claim.',
  limited:
    'Studied, with results that are weak, inconsistent, or that have not replicated well.',
  traditional:
    'A historical or cultural practice. Included so it can be explored and tested, not because evidence supports a specific effect.',
  unsupported:
    'A medical claim that published evidence does not support. Listed here so the claim can be seen clearly for what it is.',
};

export type SourceKind =
  | 'peer-reviewed'
  | 'review'
  | 'meta-analysis'
  | 'standard'
  | 'book'
  | 'historical'
  | 'regulatory';

export interface EvidenceSource {
  authors: string;
  year: number;
  title: string;
  publication: string;
  kind: SourceKind;
  /** What this source actually shows — not what it is often said to show. */
  note?: string;
}

export type LibraryCategory = 'research' | 'acoustics' | 'historical';

export interface LibraryEntry {
  id: string;
  category: LibraryCategory;
  title: string;
  subtitle: string;
  /** A representative frequency, where the entry has one. */
  frequencyHz?: number;
  /** Whether `frequencyHz` is a modulation rate or an audible tone. */
  frequencyKind?: 'modulation' | 'carrier';
  whatItIs: string;
  howGenerated: string;
  whatHasBeenStudied: string;
  whatHasNotBeenEstablished: string;
  evidence: EvidenceLevel;
  sources: EvidenceSource[];
  /** Loads Explorer with this configuration, so an entry can be heard. */
  recipe?: Partial<ExplorerRecipe>;
  tags: string[];
}
