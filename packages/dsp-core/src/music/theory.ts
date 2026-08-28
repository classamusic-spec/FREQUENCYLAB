/**
 * Music theory: 12-tone equal temperament, just intonation and the harmonic
 * series, as pure arithmetic.
 *
 * Nothing here makes a claim about anything. It converts between note names,
 * frequencies, ratios and cents, which is arithmetic that has been settled for
 * centuries — so unlike the archive there is no provenance to carry.
 *
 * Every entry point takes `referenceHz` because the instrument has to be able to
 * work in tunings other than A440: the archive carries historical and revisionist
 * pitch standards (Baroque A415, the A432 claims), and a note table is only
 * meaningful relative to the reference it was built from. The default is 440 Hz
 * for A4, the ISO 16 standard.
 *
 * Results are deliberately unrounded. Rounding belongs at the display edge
 * (`formatHz`) or at protocol canonicalisation (`roundTo`); rounding here would
 * silently break the round-trip note -> Hz -> note.
 */

/** The twelve pitch classes spelled with sharps. */
export type SharpNoteName =
  | 'C'
  | 'C#'
  | 'D'
  | 'D#'
  | 'E'
  | 'F'
  | 'F#'
  | 'G'
  | 'G#'
  | 'A'
  | 'A#'
  | 'B';

/** The five black keys spelled with flats. Enharmonically equal to the sharps. */
export type FlatNoteName = 'Db' | 'Eb' | 'Gb' | 'Ab' | 'Bb';

/**
 * Any accepted spelling of a pitch class. Both spellings of a black key name the
 * same frequency in equal temperament — the distinction only carries meaning in
 * a key signature, which this module has no notion of.
 */
export type NoteName = SharpNoteName | FlatNoteName;

/**
 * Pitch classes in sharp spelling, indexed by semitones above C.
 * This is the spelling used for every note this module *returns*, because
 * choosing C# over Db requires a key context we do not have.
 */
export const SHARP_NAMES: readonly SharpNoteName[] = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];

/** The same twelve pitch classes in flat spelling, for callers that prefer them. */
export const FLAT_NAMES: readonly NoteName[] = [
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'Gb',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
];

/** MIDI note number of A4, the pitch the reference frequency names. */
export const A4_MIDI = 69;

/** Default reference: A4 = 440 Hz (ISO 16). */
export const DEFAULT_REFERENCE_HZ = 440;

/**
 * Accepted written octave range.
 *
 * -1 is the bottom of the MIDI numbering (C-1 ~ 8.18 Hz, below hearing) and 10 is
 * already above it (B10 ~ 31.6 kHz, above hearing). The arithmetic keeps working
 * outside this range, but a note like "A99" is a typo rather than a request, and
 * this module rejects rather than guesses.
 */
export const MIN_OCTAVE = -1;
/** See {@link MIN_OCTAVE}. */
export const MAX_OCTAVE = 10;

/** Semitones above C for each natural letter. */
const LETTER_SEMITONES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/**
 * One letter, at most one accidental, then a signed one- or two-digit octave.
 *
 * At most one accidental is the point: "A#b2" has to fail rather than resolve to
 * something. The letter is case-insensitive ("a4"), the accidental is not — a
 * lowercase `b` is the flat sign, so accepting an uppercase `B` there would make
 * "AB" ambiguous with a note letter.
 */
const NOTE_PATTERN = /^([A-Ga-g])([#♯b♭]?)(-?\d{1,2})$/;

/** Size of a frequency ratio in cents. A cent is 1/100 of an equal-tempered semitone. */
export function ratioToCents(numerator: number, denominator: number): number {
  return 1200 * Math.log2(numerator / denominator);
}

/** Distance from `fromHz` up to `toHz` in cents. Negative when `toHz` is the lower pitch. */
export function centsBetween(fromHz: number, toHz: number): number {
  return ratioToCents(toHz, fromHz);
}

/**
 * MIDI note number of a written note name, or null if it cannot be parsed.
 *
 * Accidentals are applied as plain arithmetic on the semitone number, which means
 * the edge spellings come out right for free: Cb4 lands on 59 (= B3) and B#3 on
 * 60 (= C4), exactly as a musician would read them.
 */
export function noteToMidi(note: string): number | null {
  const match = NOTE_PATTERN.exec(note.trim());
  if (!match) return null;

  const [, letter, accidental, octaveText] = match;
  const octave = Number.parseInt(octaveText, 10);
  if (octave < MIN_OCTAVE || octave > MAX_OCTAVE) return null;

  const base = LETTER_SEMITONES[letter.toUpperCase()];
  const offset = accidental === '#' || accidental === '♯' ? 1 : accidental === '' ? 0 : -1;
  // +1 because MIDI octave -1 starts at note 0, so C4 is 60 and A4 is 69.
  return (octave + 1) * 12 + base + offset;
}

/**
 * The equal-temperament formula: f = ref * 2^((n - 69) / 12).
 *
 * 12-TET is chosen because it is what every tuner, keyboard and DAW on the user's
 * desk already agrees on, so a frequency quoted here matches what they will
 * measure. MIDI note numbers are the index because they make the exponent a
 * single subtraction and give octave and pitch class by division and remainder.
 */
export function midiToFrequency(midi: number, referenceHz = DEFAULT_REFERENCE_HZ): number {
  return referenceHz * Math.pow(2, (midi - A4_MIDI) / 12);
}

/** Inverse of {@link midiToFrequency}. Fractional: the integer part is the note. */
export function frequencyToMidi(hz: number, referenceHz = DEFAULT_REFERENCE_HZ): number {
  return A4_MIDI + 12 * Math.log2(hz / referenceHz);
}

/** Options shared by every conversion in this module. */
export interface TuningOptions {
  /** Frequency of A4. Defaults to {@link DEFAULT_REFERENCE_HZ}. */
  referenceHz?: number;
}

/**
 * Frequency of a written note, or null if the input is not a note.
 *
 * Accepts "A4", "C#3", "Db5", "a4", "F♯2" and "Bb-1". Returns null — never a
 * guess — for anything else, including out-of-range octaves and doubled
 * accidentals, so a caller can tell a typo from a real note.
 */
export function noteToFrequency(note: string, options: TuningOptions = {}): number | null {
  const referenceHz = options.referenceHz ?? DEFAULT_REFERENCE_HZ;
  if (!Number.isFinite(referenceHz) || referenceHz <= 0) return null;
  const midi = noteToMidi(note);
  if (midi === null) return null;
  return midiToFrequency(midi, referenceHz);
}

/** A frequency located against the 12-TET grid. */
export interface NoteMatch {
  /** Nearest pitch class, always in sharp spelling. */
  name: SharpNoteName;
  /** Scientific pitch notation octave, where middle C is C4. */
  octave: number;
  /** Signed deviation from that note. Positive means the input is sharp of it. */
  centsOff: number;
  /** The frequency that note has in this tuning. */
  exactHz: number;
}

/**
 * Nearest 12-TET note to a frequency, with how far off it is.
 *
 * Returns null for non-positive or non-finite input: 0 Hz and negative
 * frequencies have no position on a logarithmic pitch axis, and reporting some
 * nearest note for them would be fiction.
 */
export function frequencyToNote(hz: number, options: TuningOptions = {}): NoteMatch | null {
  const referenceHz = options.referenceHz ?? DEFAULT_REFERENCE_HZ;
  if (!Number.isFinite(hz) || hz <= 0) return null;
  if (!Number.isFinite(referenceHz) || referenceHz <= 0) return null;

  // Rounding the fractional MIDI number is what "nearest" means: the grid is
  // uniform in semitones, so nearest-in-cents and nearest-in-index agree.
  const nearest = Math.round(frequencyToMidi(hz, referenceHz));
  const exactHz = midiToFrequency(nearest, referenceHz);
  return {
    // Remainder is taken twice so negative MIDI numbers (below C-1) still index.
    name: SHARP_NAMES[((nearest % 12) + 12) % 12],
    octave: Math.floor(nearest / 12) - 1,
    centsOff: centsBetween(exactHz, hz),
    exactHz,
  };
}

/**
 * Frequency of the note nearest `hz`, optionally `semitones` away from it.
 *
 * This is the arithmetic behind a snap-to-note detent and behind stepping a
 * control by whole notes: round onto the tempered grid, move a whole number of
 * places along it, and come back to a frequency. With `semitones` at 0 it is
 * simply "the exact frequency of the note this is nearest to".
 *
 * Returns null for a frequency with no position on the pitch axis, matching
 * {@link frequencyToNote} rather than inventing a nearest note for 0 Hz.
 */
export function nearestNoteFrequency(
  hz: number,
  semitones = 0,
  options: TuningOptions = {},
): number | null {
  const referenceHz = options.referenceHz ?? DEFAULT_REFERENCE_HZ;
  if (!Number.isFinite(hz) || hz <= 0) return null;
  if (!Number.isFinite(referenceHz) || referenceHz <= 0) return null;
  if (!Number.isFinite(semitones)) return null;
  const nearest = Math.round(frequencyToMidi(hz, referenceHz));
  return midiToFrequency(nearest + Math.round(semitones), referenceHz);
}

/*
 * Written form.
 *
 * These three are presentation rather than theory, and they live here for the
 * same reason `formatHz` lives in `math/util`: a note readout appears on the
 * encoder, in note entry and in any panel that names a pitch, and the moment
 * two of them disagree about whether to print "0¢" the interface stops looking
 * like one instrument. One policy, one place, covered by the same tests as the
 * arithmetic it describes.
 */

/** Scientific pitch notation: `C#3`. */
export function formatNote(match: Pick<NoteMatch, 'name' | 'octave'>): string {
  return `${match.name}${match.octave}`;
}

/**
 * Signed cents, or null when the pitch is close enough to be called the note.
 *
 * The sign is always printed, because "12¢" without one is unreadable — sharp
 * and flat of a note are opposite mistakes. Below a cent nothing is printed at
 * all: a cent is roughly the threshold of pitch discrimination, so a readout
 * flickering between "+0¢" and "-0¢" would be reporting noise as information.
 */
export function formatCents(cents: number): string | null {
  if (!Number.isFinite(cents) || Math.abs(cents) < 1) return null;
  const rounded = Math.round(cents);
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded)}¢`;
}

/**
 * The same readout as words, for a screen reader.
 *
 * "C#3 +12¢" is read aloud as something between meaningless and wrong, so the
 * accessible path gets the spelling a musician would say out loud (§50).
 */
export function spellNote(match: NoteMatch): string {
  const letter = match.name.length > 1 ? `${match.name[0]} sharp` : match.name;
  const written = `${letter} ${match.octave}`;
  if (Math.abs(match.centsOff) < 1) return written;
  const rounded = Math.abs(Math.round(match.centsOff));
  return `${written}, ${rounded} cents ${match.centsOff > 0 ? 'sharp' : 'flat'}`;
}

/** One row of {@link noteTable}. */
export interface NoteTableEntry {
  name: SharpNoteName;
  octave: number;
  hz: number;
}

/** Options for {@link noteTable}. */
export interface NoteTableOptions extends TuningOptions {
  /** First octave, inclusive. Defaults to 0. */
  fromOctave?: number;
  /** Last octave, inclusive. Defaults to 8. */
  toOctave?: number;
}

/**
 * The whole note table, ascending.
 *
 * Defaults to octaves 0..8 — roughly 16 Hz to 7.9 kHz, which covers the piano and
 * then some without padding the list with pitches nobody can hear. Bounds are
 * clamped to the accepted octave range rather than rejected, because a caller
 * asking for "everything" should get everything that exists.
 */
export function noteTable(options: NoteTableOptions = {}): NoteTableEntry[] {
  const referenceHz = options.referenceHz ?? DEFAULT_REFERENCE_HZ;
  if (!Number.isFinite(referenceHz) || referenceHz <= 0) return [];

  const from = Math.max(MIN_OCTAVE, Math.floor(options.fromOctave ?? 0));
  const to = Math.min(MAX_OCTAVE, Math.floor(options.toOctave ?? 8));
  const rows: NoteTableEntry[] = [];
  for (let octave = from; octave <= to; octave++) {
    for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
      const midi = (octave + 1) * 12 + pitchClass;
      rows.push({
        name: SHARP_NAMES[pitchClass],
        octave,
        hz: midiToFrequency(midi, referenceHz),
      });
    }
  }
  return rows;
}

/** The intervals of five-limit just intonation, keyed for lookup. */
export type JustIntervalName =
  | 'unison'
  | 'minorSecond'
  | 'majorSecond'
  | 'minorThird'
  | 'majorThird'
  | 'perfectFourth'
  | 'tritone'
  | 'perfectFifth'
  | 'minorSixth'
  | 'majorSixth'
  | 'minorSeventh'
  | 'majorSeventh'
  | 'octave';

/**
 * Ratio numerator, denominator, and the number of equal-tempered semitones the
 * interval is conventionally written as.
 *
 * A record rather than an array so the type system guarantees every name in
 * `JustIntervalName` has a ratio; insertion order (ascending size) is what
 * `JUST_INTERVALS` then presents.
 */
const JUST_RATIOS: Record<JustIntervalName, readonly [number, number, number]> = {
  unison: [1, 1, 0],
  minorSecond: [16, 15, 1],
  majorSecond: [9, 8, 2],
  minorThird: [6, 5, 3],
  majorThird: [5, 4, 4],
  perfectFourth: [4, 3, 5],
  tritone: [45, 32, 6],
  perfectFifth: [3, 2, 7],
  minorSixth: [8, 5, 8],
  majorSixth: [5, 3, 9],
  minorSeventh: [9, 5, 10],
  majorSeventh: [15, 8, 11],
  octave: [2, 1, 12],
};

/** A just interval and its size. */
export interface JustInterval {
  name: JustIntervalName;
  /** Small-integer frequency ratio as [numerator, denominator]. */
  ratio: readonly [number, number];
  /** Size in cents, derived from the ratio rather than transcribed. */
  cents: number;
  /** Equal-tempered semitones this interval is spelled as, for comparison. */
  semitones: number;
}

/**
 * The classic just intervals, ascending.
 *
 * `cents` is computed as 1200 * log2(n/d) at load rather than copied from a
 * table, so the ratio is the single source of truth and the two can never drift.
 */
export const JUST_INTERVALS: readonly JustInterval[] = (
  Object.keys(JUST_RATIOS) as JustIntervalName[]
).map((name) => {
  const [numerator, denominator, semitones] = JUST_RATIOS[name];
  return {
    name,
    ratio: [numerator, denominator] as const,
    cents: ratioToCents(numerator, denominator),
    semitones,
  };
});

/**
 * Frequency of a just interval above `baseHz`.
 *
 * Multiplies before dividing so exact cases stay exact: a just fifth above 220 Hz
 * is 330 Hz with no floating point residue, which is the whole appeal of
 * small-integer ratios.
 */
export function justInterval(baseHz: number, name: JustIntervalName): number {
  const [numerator, denominator] = JUST_RATIOS[name];
  return (baseHz * numerator) / denominator;
}

/** A just interval placed next to its equal-tempered neighbour. */
export interface IntervalComparison extends JustInterval {
  /** The just frequency: baseHz * numerator / denominator. */
  hz: number;
  /** The 12-TET frequency the same number of semitones above baseHz. */
  temperedHz: number;
  /** Just minus tempered, in cents. Positive means the just interval is wider. */
  centsFromTempered: number;
}

/**
 * Every just interval above `baseHz`, side by side with equal temperament.
 *
 * This is the point of the whole section: it makes the compromise visible.
 * Tempered fifths sit 1.955 cents narrow (spread the Pythagorean comma over
 * twelve of them and this is the price), tempered major thirds a conspicuous
 * 13.7 cents wide, and the tritone is barely the same interval at all.
 */
export function intervalsFrom(baseHz: number): IntervalComparison[] {
  return JUST_INTERVALS.map((interval) => {
    const temperedHz = baseHz * Math.pow(2, interval.semitones / 12);
    return {
      ...interval,
      hz: justInterval(baseHz, interval.name),
      temperedHz,
      // A tempered semitone is exactly 100 cents by definition, so subtracting is
      // both exact and cheaper than taking a log of the two frequencies back.
      centsFromTempered: interval.cents - interval.semitones * 100,
    };
  });
}

/** One partial of the harmonic series, located against the tempered grid. */
export interface HarmonicInterval {
  /** 1-based partial number; 1 is the fundamental. */
  partial: number;
  hz: number;
  /** Height above the fundamental in cents, 1200 * log2(partial). */
  centsAboveFundamental: number;
  /** Nearest 12-TET note, sharp spelling. */
  note: SharpNoteName;
  octave: number;
  /** The frequency that note has in this tuning. */
  temperedHz: number;
  /** Partial minus that note, in cents. Negative means the partial is flat of it. */
  centsOff: number;
}

/**
 * Each partial of a fundamental with the tempered note it lands nearest.
 *
 * The raw partial frequencies are `harmonicSeries` in `archive/transforms.ts`,
 * which formats them for the acoustics explorer; this adds the part that is
 * actually interesting, which is how badly some of them miss the keyboard. The
 * 7th partial lands ~31 cents flat and the 11th sits almost exactly between two
 * keys (~49 cents off) — the reason barbershop sevenths and natural-horn notes
 * sound out of tune to a piano-trained ear and correct to everyone else.
 *
 * Returns an empty array for a non-positive or non-finite fundamental.
 */
export function harmonicIntervals(
  fundamentalHz: number,
  count = 8,
  options: TuningOptions = {},
): HarmonicInterval[] {
  if (!Number.isFinite(fundamentalHz) || fundamentalHz <= 0) return [];
  const total = Math.floor(count);
  if (!Number.isFinite(total) || total < 1) return [];

  const harmonics: HarmonicInterval[] = [];
  for (let partial = 1; partial <= total; partial++) {
    const hz = fundamentalHz * partial;
    const match = frequencyToNote(hz, options);
    // frequencyToNote only returns null for input this loop cannot produce, but
    // the guard keeps the type honest without an assertion.
    if (!match) continue;
    harmonics.push({
      partial,
      hz,
      centsAboveFundamental: ratioToCents(partial, 1),
      note: match.name,
      octave: match.octave,
      temperedHz: match.exactHz,
      centsOff: match.centsOff,
    });
  }
  return harmonics;
}
