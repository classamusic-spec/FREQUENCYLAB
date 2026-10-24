import { describe, expect, it } from 'vitest';
import { factoryPreset, libraryEntry, presetToProtocol } from '../src/index';

/**
 * The 40.68 MHz ultrashort-wave study, and the listening program filed
 * against it.
 *
 * The study's stimulus is a radio-frequency field. Everything below defends
 * one sentence: this app does not reproduce it, and must never be edited into
 * appearing to. The failure being guarded against is not a lie written on
 * purpose but a helpful-looking edit — a `recipe` so the entry "can be heard",
 * a `frequencyHz` so it shows a number, a softer caveat.
 */
describe('the ultrashort-wave library entry', () => {
  const entry = libraryEntry('ultrashort-wave-glymphatic');

  it('exists and cites the study it describes', () => {
    expect(entry).toBeDefined();
    const study = entry!.sources.find((s) => s.year === 2026);
    expect(study?.publication).toMatch(/Science Advances/);
    expect(study?.note).toMatch(/not sound/i);
  });

  it('offers no number and no way to "hear" the stimulus', () => {
    // 40.68 MHz is about 2000 times the top of human hearing. A frequencyHz
    // would display it as a value this app could play; a recipe would load
    // Explorer as though it could.
    expect(entry!.frequencyHz).toBeUndefined();
    expect(entry!.recipe).toBeUndefined();
  });

  it('says the results are in mice and that audio does not reproduce them', () => {
    expect(entry!.whatHasNotBeenEstablished).toMatch(/mice/i);
    expect(entry!.whatHasNotBeenEstablished).toMatch(/audio/i);
    expect(entry!.howGenerated).toMatch(/Not by this app/);
  });

  it('is rated as early work rather than established', () => {
    expect(['promising', 'limited']).toContain(entry!.evidence);
  });
});

describe('the listening program filed against it', () => {
  const preset = factoryPreset('noise-uswave-study');

  it('exists, compiles, and plays what its source frequency says', () => {
    expect(preset).toBeDefined();
    const compiled = presetToProtocol(preset!);
    expect(compiled.ok).toBe(true);
    // The value is the rate actually played, not the study's 40.68 MHz.
    expect(preset!.sourceFrequency).toEqual({ value: 1, unit: 'Hz', role: 'modulation' });
  });

  it('says in its own summary that it does not reproduce the study', () => {
    expect(preset!.summary).toMatch(/not sound/i);
    expect(preset!.summary).toMatch(/does not reproduce/i);
  });

  it('answers the medical claim it invites, with a no', () => {
    const claim = preset!.associations.find((a) => /brain injury|Alzheimer/i.test(a.claim));
    expect(claim?.medical).toBe(true);
    expect(claim?.currentEvidence).toMatch(/^No\./);
    expect(claim?.currentEvidence).toMatch(/cannot produce/);
  });

  it('is classified experimental, not research', () => {
    // The study is research. This preset is not the study.
    expect(preset!.classification).toBe('experimental');
  });

  it('links the entry that explains the gap', () => {
    expect(preset!.libraryEntryIds).toContain('ultrashort-wave-glymphatic');
  });

  it('makes no effect claim in its name', () => {
    expect(preset!.name).not.toMatch(/clear|clean|heal|detox|flush|brain health/i);
  });
});
