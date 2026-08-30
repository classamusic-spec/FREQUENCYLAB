import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, type ExperienceLevel } from '@frequencylab/dsp-core';
import {
  capabilitiesFor,
  engineInPlainWords,
  levelCanSee,
  paceInPlainWords,
  type Capability,
} from './tierCapabilities';

/**
 * The tier contract.
 *
 * These are the rules `features/tier` states in prose, written down where they
 * can fail. The one that matters most is the last group: a tier hides
 * vocabulary and controls, never honesty — and the way that rule breaks is not
 * by someone disagreeing with it, but by a capability being added later whose
 * name sounds like a control and whose content is a claim.
 */

const LEVELS: ExperienceLevel[] = ['simple', 'explorer', 'lab'];

describe('the levels nest', () => {
  it('gives Lab everything Explorer has, and Explorer everything Simple has', () => {
    // A level that took something away as you moved up would mean a person
    // seeking more detail could lose a control by asking for more of them.
    for (const capability of capabilitiesFor('simple')) {
      expect(levelCanSee('explorer', capability)).toBe(true);
    }
    for (const capability of capabilitiesFor('explorer')) {
      expect(levelCanSee('lab', capability)).toBe(true);
    }
  });

  it('withholds nothing at Lab', () => {
    expect(capabilitiesFor('lab').size).toBeGreaterThan(capabilitiesFor('explorer').size);
  });

  it('starts a fresh install at the level that shows least', () => {
    expect(DEFAULT_PREFERENCES.experienceLevel).toBe('simple');
    expect(capabilitiesFor('simple').size).toBe(0);
  });

  it('falls back to the narrowest set for a level it does not know', () => {
    // A preferences record from a future build must not open Lab by accident.
    expect(capabilitiesFor('experimental' as ExperienceLevel).size).toBe(0);
    expect(levelCanSee('experimental' as ExperienceLevel, 'engineering')).toBe(false);
  });
});

describe('what a tier is allowed to gate', () => {
  it('gates only vocabulary and controls', () => {
    /*
     * The whole list, named here rather than derived, so adding a capability is
     * a decision someone has to make in this file too. If a new name belongs to
     * a claim — a classification, an evidence rating, a safety statement — it
     * does not go in this list and it does not get tiered. It gets shown at
     * every level or at none.
     */
    const gateable: Capability[] = [
      'hertz',
      'signalDetail',
      'dna',
      'lab',
      'trials',
      'explore',
      'library',
      'representation',
      'engineering',
      'mixer',
    ];
    const declared = new Set<Capability>();
    for (const level of LEVELS) for (const c of capabilitiesFor(level)) declared.add(c);
    expect([...declared].sort()).toEqual([...gateable].sort());
  });

  it('has no capability named for a claim', () => {
    // The failure this catches is a well-meant `'safety'` or `'evidence'`
    // capability added by someone who read the tier as a general on/off switch.
    const forbidden = /claim|safety|evidence|classification|warning|disclaimer|medical|risk/i;
    for (const level of LEVELS) {
      for (const capability of capabilitiesFor(level)) {
        expect(capability, `"${capability}" names a claim`).not.toMatch(forbidden);
      }
    }
  });
});

describe('plain words describe the sound, never the effect', () => {
  it('says what a rate does to the sound and nothing about the listener', () => {
    const words = [0, 1, 2, 4, 7, 8, 12, 13, 20, 29, 30, 40, 100].map(paceInPlainWords);
    const forbidden = /calm|relax|focus|sleep|alert|heal|energ|balance|anxi|stress|mood/i;
    for (const word of words) expect(word, word).not.toMatch(forbidden);
  });

  it('covers the whole range with no gap and no thrown error', () => {
    for (let hz = 0; hz <= 200; hz += 0.25) {
      expect(typeof paceInPlainWords(hz)).toBe('string');
      expect(paceInPlainWords(hz).length).toBeGreaterThan(0);
    }
  });

  it('keeps the one fact a listener has to act on', () => {
    /*
     * A binaural beat is assembled from two tones, one per ear, so a speaker
     * cannot produce it. Simple drops the word "binaural" and must not drop
     * that — which is why this is a plain-words function and not a tier gate.
     */
    expect(engineInPlainWords('binaural')).toBe('Headphones only');
    expect(engineInPlainWords('binaural-centered')).toBe('Headphones only');
    for (const engine of ['monaural', 'isochronic', 'am', 'fm', 'noise-modulation']) {
      expect(engineInPlainWords(engine)).toBe('Speakers or headphones');
    }
  });

  it('does not claim headphones-only for an engine that does not need them', () => {
    // The inverse mistake: over-warning trains people to ignore the warning.
    expect(engineInPlainWords('unknown-future-engine')).toBe('Speakers or headphones');
  });
});
