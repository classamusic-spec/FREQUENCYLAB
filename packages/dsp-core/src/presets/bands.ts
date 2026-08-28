/**
 * The conventional EEG bands, as data.
 *
 * Every frequency app in existence prints "alpha 8–13 Hz" as though it were a
 * physical constant. It is not: the bands are names people agreed on for
 * regions of a continuous spectrum, and different sources draw the lines in
 * different places. The clinical glossary this module cites puts beta at
 * 14–30 Hz; a great deal of consumer material puts it at 13–30. Both are in
 * circulation, neither is wrong, and a listener deserves to see that rather
 * than a number presented as settled.
 *
 * Two further things this module refuses to imply:
 *
 *  - **A band is a description, not a switch.** Alpha names activity that is
 *    measured; it is not a mode the brain is put into, and no rate here places
 *    anyone in a state.
 *  - **A rate is not a rhythm.** Sound pulsed at 10 Hz is sound pulsed at
 *    10 Hz. Whether ongoing brain activity follows it is exactly the question
 *    the linked entries say is unsettled.
 */

/** The five band names in common use. */
export type BrainwaveBandId = 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma';

export interface BandRange {
  /** Lower bound in Hz. */
  fromHz: number;
  /** Upper bound in Hz, or null where the source states no upper bound. */
  toHz: number | null;
}

export interface BrainwaveBand {
  id: BrainwaveBandId;
  name: string;
  /**
   * The boundaries this app prints, which are the ones most consumer material
   * uses. Chosen for familiarity, not authority — see `clinical`.
   */
  conventional: BandRange;
  /**
   * The same band as defined in the IFCN-endorsed clinical EEG glossary
   * (`ifcn-alpha-10`). Where this differs from `conventional`, the difference
   * is the point: it is evidence that the boundary is a convention.
   */
  clinical: BandRange;
  /** What the band is associated with, stated as association rather than effect. */
  associatedWith: string;
  /** Said plainly, per band, so no screen can show a range without it. */
  boundaryNote: string;
  libraryEntryIds: string[];
  archiveEntryIds: string[];
}

/**
 * Said once, so every screen that prints a band range can print the same
 * sentence rather than inventing its own.
 */
export const BAND_BOUNDARY_NOTE =
  'Band boundaries are naming conventions and vary between sources: the clinical EEG glossary starts beta at 14 Hz where most consumer material starts it at 13, and the delta floor is given as 0.1, 0.5 or 1 Hz depending on who is writing. Brain activity is continuous — nothing changes at the edge of a band, and a rate one hertz either side of a boundary is not a different kind of sound.';

/**
 * Said once, for the same reason, about what listening at a band rate does.
 */
export const BAND_STATE_NOTE =
  'A band describes activity that has been measured, not a state that can be selected. Listening to sound pulsed at a rate inside a band does not put the brain into that band, and no preset in this collection claims it does.';

export const BRAINWAVE_BANDS: BrainwaveBand[] = [
  {
    id: 'delta',
    name: 'Delta',
    conventional: { fromHz: 0.5, toHz: 4 },
    clinical: { fromHz: 0.1, toHz: 4 },
    associatedWith:
      'The large slow oscillations that dominate deep non-REM sleep. Prominent in recordings of sleeping adults.',
    boundaryNote:
      'The floor is written as 0.1, 0.5 or 1 Hz depending on the source; the ceiling of 4 Hz is where theta is said to begin. At these rates a binaural beat is slow enough that most listeners hear a wobble rather than a pulse.',
    libraryEntryIds: ['delta-range'],
    archiveEntryIds: ['ifcn-alpha-10'],
  },
  {
    id: 'theta',
    name: 'Theta',
    conventional: { fromHz: 4, toHz: 8 },
    clinical: { fromHz: 4, toHz: 8 },
    associatedWith:
      'Drowsiness and the transition towards sleep, and hippocampal activity studied in memory and navigation.',
    boundaryNote:
      'The one band whose conventional and clinical boundaries agree. The clinical glossary writes the upper edge as "<8 Hz", so 8 Hz itself belongs to alpha.',
    libraryEntryIds: ['theta-range'],
    archiveEntryIds: ['ifcn-alpha-10', 'theta-beat-6'],
  },
  {
    id: 'alpha',
    name: 'Alpha',
    conventional: { fromHz: 8, toHz: 13 },
    clinical: { fromHz: 8, toHz: 13 },
    associatedWith:
      'Relaxed wakefulness, most prominent over the back of the head and strongest with the eyes closed.',
    boundaryNote:
      'Both conventions give 8–13 Hz. The clinical definition adds conditions the number alone does not carry — a posterior rhythm, present in relaxed wakefulness, attenuating when the eyes open — which is what makes it a rhythm rather than a range.',
    libraryEntryIds: ['alpha-range'],
    archiveEntryIds: ['ifcn-alpha-10', 'alpha-10', 'alpha-beat-10'],
  },
  {
    id: 'beta',
    name: 'Beta',
    conventional: { fromHz: 13, toHz: 30 },
    clinical: { fromHz: 14, toHz: 30 },
    associatedWith:
      'Alert, engaged wakefulness and motor control. Well characterised over motor cortex.',
    boundaryNote:
      'The clearest example of a boundary being a convention: the clinical glossary starts beta at 14 Hz, most consumer material at 13. A 13 Hz rate is therefore alpha or beta depending only on which list you read.',
    libraryEntryIds: ['beta-range'],
    archiveEntryIds: ['ifcn-alpha-10'],
  },
  {
    id: 'gamma',
    name: 'Gamma',
    conventional: { fromHz: 30, toHz: null },
    clinical: { fromHz: 30, toHz: 80 },
    associatedWith:
      'Fast activity studied in perception and attention. 40 Hz is the rate at which the auditory steady-state response is largest in awake adults.',
    boundaryNote:
      'Consumer material usually writes gamma as "30 Hz and above" with no ceiling; the clinical glossary bounds it at 80 Hz. Note separately that a binaural beat stops being heard as a beat somewhere around 35 Hz, so most of this band cannot be delivered binaurally at all.',
    libraryEntryIds: ['assr', 'gamma-40hz'],
    archiveEntryIds: ['ifcn-alpha-10', 'assr-40', 'beat-limit-35'],
  },
];

/**
 * The band a rate falls in under the conventional boundaries, or undefined when
 * it is below the delta floor.
 *
 * Ranges are treated as half-open — `fromHz` belongs to the band, `toHz`
 * belongs to the next one up — so exactly 30 Hz is reported as gamma here while
 * a great deal of material calls it the top of beta. That is not a bug to be
 * papered over: it is the same disagreement `boundaryNote` documents, and
 * resolving it silently would hide the thing this module exists to show.
 *
 * Uses `conventional` rather than `clinical` because these are the boundaries
 * the interface prints.
 */
export function bandForRate(hz: number): BrainwaveBand | undefined {
  if (!Number.isFinite(hz)) return undefined;
  return BRAINWAVE_BANDS.find((band) => {
    const { fromHz, toHz } = band.conventional;
    if (hz < fromHz) return false;
    return toHz === null ? true : hz < toHz;
  });
}

export function brainwaveBand(id: BrainwaveBandId): BrainwaveBand | undefined {
  return BRAINWAVE_BANDS.find((band) => band.id === id);
}
