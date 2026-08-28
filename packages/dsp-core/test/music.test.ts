import { describe, expect, it } from 'vitest';
import {
  FLAT_NAMES,
  JUST_INTERVALS,
  SHARP_NAMES,
  centsBetween,
  formatCents,
  formatNote,
  frequencyToNote,
  harmonicIntervals,
  intervalsFrom,
  justInterval,
  nearestNoteFrequency,
  noteTable,
  noteToFrequency,
  ratioToCents,
  spellNote,
} from '../src/index.js';

describe('12-TET note names', () => {
  it('pins the reference octaves exactly', () => {
    // Powers of two from the reference are exact in binary floating point, so
    // these are equality assertions rather than approximations on purpose.
    expect(noteToFrequency('A4')).toBe(440);
    expect(noteToFrequency('A5')).toBe(880);
    expect(noteToFrequency('A3')).toBe(220);
    expect(noteToFrequency('A0')).toBe(27.5);
  });

  it('places middle C where a tuner does', () => {
    expect(noteToFrequency('C4')).toBeCloseTo(261.6256, 4);
    expect(noteToFrequency('C0')).toBeCloseTo(16.3516, 4);
    expect(noteToFrequency('B8')).toBeCloseTo(7902.133, 3);
  });

  it('retunes the whole grid from the reference', () => {
    expect(noteToFrequency('A4', { referenceHz: 432 })).toBe(432);
    expect(noteToFrequency('A4', { referenceHz: 415 })).toBe(415);
    // Every other note scales by the same factor: a tuning is one multiplication.
    const ratio = 432 / 440;
    expect(noteToFrequency('C4', { referenceHz: 432 })!).toBeCloseTo(
      noteToFrequency('C4')! * ratio,
      10,
    );
  });

  it('reads both spellings, either case, and both accidental glyphs', () => {
    expect(noteToFrequency('a4')).toBe(440);
    expect(noteToFrequency('  A4  ')).toBe(440);
    expect(noteToFrequency('F#2')).toBe(noteToFrequency('F♯2'));
    expect(noteToFrequency('Eb3')).toBe(noteToFrequency('E♭3'));
    expect(noteToFrequency('bb3')).toBe(noteToFrequency('Bb3'));
  });

  it('treats enharmonics as the same pitch', () => {
    expect(noteToFrequency('C#4')).toBe(noteToFrequency('Db4'));
    expect(noteToFrequency('D#4')).toBe(noteToFrequency('Eb4'));
    expect(noteToFrequency('F#4')).toBe(noteToFrequency('Gb4'));
    expect(noteToFrequency('G#4')).toBe(noteToFrequency('Ab4'));
    expect(noteToFrequency('A#4')).toBe(noteToFrequency('Bb4'));
    // The awkward spellings have to cross the octave boundary correctly.
    expect(noteToFrequency('Cb4')).toBe(noteToFrequency('B3'));
    expect(noteToFrequency('B#3')).toBe(noteToFrequency('C4'));
    expect(noteToFrequency('E#4')).toBe(noteToFrequency('F4'));
  });

  it('returns null instead of guessing at nonsense', () => {
    for (const bad of [
      'H4',
      '',
      '   ',
      '4',
      'A',
      'A99',
      'A#b2',
      'A#4b',
      '#4',
      'A4.5',
      'A -1',
      'A-2',
      'A11',
      'Ab',
      'AB4',
      '440',
    ]) {
      expect(noteToFrequency(bad)).toBeNull();
    }
  });

  it('rejects a reference that is not a frequency', () => {
    expect(noteToFrequency('A4', { referenceHz: 0 })).toBeNull();
    expect(noteToFrequency('A4', { referenceHz: -440 })).toBeNull();
    expect(noteToFrequency('A4', { referenceHz: Number.NaN })).toBeNull();
  });
});

describe('frequency to note', () => {
  it('names a frequency and how far off it is', () => {
    expect(frequencyToNote(440)).toEqual({
      name: 'A',
      octave: 4,
      centsOff: 0,
      exactHz: 440,
    });
    const sharp = frequencyToNote(444)!;
    expect(sharp.name).toBe('A');
    expect(sharp.octave).toBe(4);
    // 444 Hz is the "brighter" orchestral A: 15.7 cents sharp of A440.
    expect(sharp.centsOff).toBeCloseTo(15.667, 3);
    // A432 sits 31.77 cents — about a third of a semitone — below A440.
    expect(frequencyToNote(432)!.centsOff).toBeCloseTo(-31.767, 3);
  });

  it('has no answer for frequencies off the pitch axis', () => {
    expect(frequencyToNote(0)).toBeNull();
    expect(frequencyToNote(-440)).toBeNull();
    expect(frequencyToNote(Number.NaN)).toBeNull();
    expect(frequencyToNote(Number.POSITIVE_INFINITY)).toBeNull();
    expect(frequencyToNote(440, { referenceHz: 0 })).toBeNull();
  });

  it('round-trips every note in the table', () => {
    for (const referenceHz of [440, 432, 415]) {
      for (const entry of noteTable({ referenceHz })) {
        const written = `${entry.name}${entry.octave}`;
        const hz = noteToFrequency(written, { referenceHz });
        expect(hz).not.toBeNull();
        expect(hz).toBeCloseTo(entry.hz, 10);

        const back = frequencyToNote(hz!, { referenceHz })!;
        expect(`${back.name}${back.octave}`).toBe(written);
        expect(Math.abs(back.centsOff)).toBeLessThan(0.001);
        expect(back.exactHz).toBeCloseTo(entry.hz, 10);
      }
    }
  });
});

describe('snapping to the grid', () => {
  it('pulls a frequency onto the note it is nearest', () => {
    expect(nearestNoteFrequency(444)).toBe(440);
    expect(nearestNoteFrequency(432)).toBe(440);
    expect(nearestNoteFrequency(220.4)).toBe(220);
    // 226.5 Hz is past the midpoint between A3 and A#3, so it lands on A#3.
    expect(nearestNoteFrequency(226.5)).toBeCloseTo(noteToFrequency('A#3')!, 10);
  });

  it('steps by whole notes from wherever it started', () => {
    expect(nearestNoteFrequency(440, 12)).toBeCloseTo(880, 10);
    expect(nearestNoteFrequency(440, -12)).toBeCloseTo(220, 10);
    expect(nearestNoteFrequency(440, 1)).toBeCloseTo(noteToFrequency('A#4')!, 10);
    // An off-grid input is rounded first, so one step is always one note.
    expect(nearestNoteFrequency(444, -1)).toBeCloseTo(noteToFrequency('G#4')!, 10);
  });

  it('snaps against whatever reference it is given', () => {
    expect(nearestNoteFrequency(430, 0, { referenceHz: 432 })).toBe(432);
    expect(nearestNoteFrequency(430, 0, { referenceHz: 415 })).toBeCloseTo(
      noteToFrequency('A#4', { referenceHz: 415 })!,
      10,
    );
  });

  it('has nothing to snap to off the pitch axis', () => {
    expect(nearestNoteFrequency(0)).toBeNull();
    expect(nearestNoteFrequency(-440)).toBeNull();
    expect(nearestNoteFrequency(Number.NaN)).toBeNull();
    expect(nearestNoteFrequency(440, Number.NaN)).toBeNull();
    expect(nearestNoteFrequency(440, 0, { referenceHz: 0 })).toBeNull();
  });

  it('is idempotent, so a held control cannot drift', () => {
    const once = nearestNoteFrequency(311.9)!;
    expect(nearestNoteFrequency(once)).toBeCloseTo(once, 10);
  });
});

describe('written form', () => {
  it('writes a match in scientific pitch notation', () => {
    expect(formatNote(frequencyToNote(440)!)).toBe('A4');
    expect(formatNote(frequencyToNote(147.5)!)).toBe('D3');
    expect(formatNote({ name: 'C#', octave: 3 })).toBe('C#3');
    expect(formatNote({ name: 'C', octave: -1 })).toBe('C-1');
  });

  it('always signs the cents it prints', () => {
    expect(formatCents(12)).toBe('+12¢');
    expect(formatCents(-3)).toBe('-3¢');
    expect(formatCents(-31.767)).toBe('-32¢');
    expect(formatCents(49.5)).toBe('+50¢');
  });

  it('prints nothing rather than zero inside a cent', () => {
    // A readout flicking between "+0¢" and "-0¢" reports noise as information.
    expect(formatCents(0)).toBeNull();
    expect(formatCents(0.9)).toBeNull();
    expect(formatCents(-0.9)).toBeNull();
    expect(formatCents(Number.NaN)).toBeNull();
    // The boundary is a whole cent, so nothing can ever round to a printed zero.
    expect(formatCents(1)).toBe('+1¢');
    expect(formatCents(-1)).toBe('-1¢');
  });

  it('spells a note the way it would be said aloud', () => {
    expect(spellNote(frequencyToNote(440)!)).toBe('A 4');
    expect(spellNote(frequencyToNote(noteToFrequency('C#3')!)!)).toBe('C sharp 3');
    expect(spellNote(frequencyToNote(444)!)).toBe('A 4, 16 cents sharp');
    expect(spellNote(frequencyToNote(432)!)).toBe('A 4, 32 cents flat');
    // Same threshold as the printed form: inside a cent, the note is the note.
    expect(spellNote(frequencyToNote(440.2)!)).toBe('A 4');
  });
});

describe('note table', () => {
  it('covers octaves 0..8 by default, ascending', () => {
    const table = noteTable();
    expect(table).toHaveLength(9 * 12);
    expect(table[0]).toEqual({ name: 'C', octave: 0, hz: noteToFrequency('C0')! });
    expect(table[table.length - 1]!.name).toBe('B');
    expect(table[table.length - 1]!.octave).toBe(8);
    for (let i = 1; i < table.length; i++) {
      expect(table[i]!.hz).toBeGreaterThan(table[i - 1]!.hz);
    }
  });

  it('honours the requested range and clamps to what exists', () => {
    expect(noteTable({ fromOctave: 4, toOctave: 4 })).toHaveLength(12);
    expect(noteTable({ fromOctave: 4, toOctave: 3 })).toHaveLength(0);
    // -5 and 99 are not octaves; the caller gets everything that is.
    expect(noteTable({ fromOctave: -5, toOctave: 99 })).toHaveLength(12 * 12);
  });

  it('spells the same twelve pitch classes both ways', () => {
    expect(SHARP_NAMES).toHaveLength(12);
    expect(FLAT_NAMES).toHaveLength(12);
    for (let i = 0; i < 12; i++) {
      expect(noteToFrequency(`${SHARP_NAMES[i]}4`)).toBe(noteToFrequency(`${FLAT_NAMES[i]}4`));
    }
  });
});

describe('just intonation', () => {
  it('multiplies by small integers exactly', () => {
    // The whole appeal of a ratio: no floating point residue to round away.
    expect(justInterval(220, 'perfectFifth')).toBe(330);
    expect(justInterval(220, 'octave')).toBe(440);
    expect(justInterval(220, 'perfectFourth')).toBeCloseTo(293.3333, 4);
    expect(justInterval(440, 'majorThird')).toBe(550);
  });

  it('derives cents from the ratio', () => {
    expect(ratioToCents(2, 1)).toBe(1200);
    expect(ratioToCents(1, 1)).toBe(0);
    expect(ratioToCents(3, 2)).toBeCloseTo(701.955, 3);
    expect(ratioToCents(5, 4)).toBeCloseTo(386.314, 3);

    const byName = new Map(JUST_INTERVALS.map((i) => [i.name, i]));
    expect(JUST_INTERVALS).toHaveLength(13);
    expect(byName.get('perfectFifth')!.cents).toBeCloseTo(701.955, 3);
    expect(byName.get('perfectFifth')!.ratio).toEqual([3, 2]);
    expect(byName.get('octave')!.cents).toBe(1200);
    for (let i = 1; i < JUST_INTERVALS.length; i++) {
      expect(JUST_INTERVALS[i]!.cents).toBeGreaterThan(JUST_INTERVALS[i - 1]!.cents);
    }
  });

  it('shows what equal temperament costs', () => {
    const compared = new Map(intervalsFrom(220).map((i) => [i.name, i]));

    const fifth = compared.get('perfectFifth')!;
    expect(fifth.hz).toBe(330);
    // 12-TET spreads the Pythagorean comma over twelve fifths, so each one is
    // 1.955 cents narrow — the single most-quoted number in tuning.
    expect(fifth.temperedHz).toBeCloseTo(329.6276, 4);
    expect(fifth.centsFromTempered).toBeCloseTo(1.955, 3);
    expect(centsBetween(fifth.temperedHz, fifth.hz)).toBeCloseTo(1.955, 3);
    expect(fifth.hz).toBeGreaterThan(fifth.temperedHz);

    // The third is where temperament is actually audible: 13.7 cents wide.
    const third = compared.get('majorThird')!;
    expect(third.centsFromTempered).toBeCloseTo(-13.686, 3);
    expect(compared.get('tritone')!.centsFromTempered).toBeCloseTo(-9.776, 3);

    // Unison and octave are the two intervals the two systems agree on.
    expect(compared.get('unison')!.centsFromTempered).toBe(0);
    expect(compared.get('octave')!.centsFromTempered).toBe(0);
    expect(compared.get('octave')!.hz).toBe(440);
  });
});

describe('harmonic series against the keyboard', () => {
  const partials = harmonicIntervals(220, 16);

  it('puts the octave partials dead on the note', () => {
    expect(partials).toHaveLength(16);
    for (const partial of [1, 2, 4, 8, 16]) {
      const row = partials[partial - 1]!;
      expect(row.hz).toBe(220 * partial);
      expect(row.note).toBe('A');
      expect(Math.abs(row.centsOff)).toBeLessThan(1e-9);
    }
    expect(partials[0]!.octave).toBe(3);
    expect(partials[1]!.octave).toBe(4);
    expect(partials[0]!.centsAboveFundamental).toBe(0);
    expect(partials[1]!.centsAboveFundamental).toBe(1200);
  });

  it('reproduces the just fifth and third as partials 3 and 5', () => {
    const fifth = partials[2]!;
    expect(fifth.hz).toBe(660);
    expect(fifth.note).toBe('E');
    expect(fifth.octave).toBe(5);
    expect(fifth.centsOff).toBeCloseTo(1.955, 3);

    const third = partials[4]!;
    expect(third.hz).toBe(1100);
    expect(third.note).toBe('C#');
    expect(third.centsOff).toBeCloseTo(-13.686, 3);
  });

  it('lands the 7th partial ~31 cents flat of any tempered note', () => {
    const seventh = partials[6]!;
    expect(seventh.partial).toBe(7);
    expect(seventh.hz).toBe(1540);
    expect(seventh.note).toBe('G');
    expect(seventh.octave).toBe(6);
    // Flat, not sharp — the sign is the point: 7:4 is narrower than a tempered
    // minor seventh, which is why it sounds "wrong" against a piano.
    expect(seventh.centsOff).toBeLessThan(0);
    expect(seventh.centsOff).toBeCloseTo(-31.174, 3);
    expect(Math.abs(seventh.centsOff)).toBeGreaterThan(25);
    expect(Math.abs(seventh.centsOff)).toBeLessThan(35);
  });

  it('leaves the 11th partial almost exactly between two keys', () => {
    const eleventh = partials[10]!;
    expect(eleventh.hz).toBe(2420);
    // ~49 cents off is as far from the grid as a pitch can get.
    expect(Math.abs(eleventh.centsOff)).toBeGreaterThan(45);
    expect(Math.abs(eleventh.centsOff)).toBeLessThanOrEqual(50);
  });

  it('refuses a fundamental that is not a frequency', () => {
    expect(harmonicIntervals(0, 8)).toHaveLength(0);
    expect(harmonicIntervals(-220, 8)).toHaveLength(0);
    expect(harmonicIntervals(Number.NaN, 8)).toHaveLength(0);
    expect(harmonicIntervals(220, 0)).toHaveLength(0);
    expect(harmonicIntervals(220, 8)).toHaveLength(8);
  });
});
