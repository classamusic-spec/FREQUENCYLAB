import { describe, expect, it } from 'vitest';
import {
  Rng,
  clamp,
  curveShape,
  curveValue,
  dbToGain,
  equalPowerPan,
  formatClock,
  formatHz,
  gainToDb,
  roundTo,
  wrapUnit,
} from '../src/index.js';

describe('numeric helpers', () => {
  it('formats Hz the way the instrument displays it', () => {
    expect(formatHz(7.83)).toBe('007.830');
    expect(formatHz(220)).toBe('220.000');
    expect(formatHz(1234.5678)).toBe('1234.568');
  });

  it('formats the session clock', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(61)).toBe('01:01');
    expect(formatClock(3661)).toBe('1:01:01');
  });

  it('round-trips dB and linear gain', () => {
    expect(dbToGain(0)).toBeCloseTo(1, 12);
    expect(dbToGain(-6)).toBeCloseTo(0.5011872, 6);
    expect(gainToDb(dbToGain(-13.7))).toBeCloseTo(-13.7, 9);
    expect(gainToDb(0)).toBe(-Infinity);
  });

  it('rounds deterministically at the canonicalisation precision', () => {
    expect(roundTo(1.0000004999, 6)).toBe(1);
    expect(roundTo(7.8299999999, 3)).toBe(7.83);
    expect(roundTo(-0.0000001, 6)).toBe(0);
    expect(Object.is(roundTo(-0.0000001, 6), -0)).toBe(false);
  });

  it('keeps equal-power pan at constant power', () => {
    for (const pan of [-1, -0.5, 0, 0.25, 1]) {
      const { left, right } = equalPowerPan(pan);
      expect(left * left + right * right).toBeCloseTo(1, 10);
    }
  });

  it('wraps normalised phase into [0,1)', () => {
    expect(wrapUnit(1.25)).toBeCloseTo(0.25, 12);
    expect(wrapUnit(-0.25)).toBeCloseTo(0.75, 12);
  });

  it('clamps', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
  });
});

describe('curves', () => {
  it('pins every shape to the unit interval endpoints', () => {
    for (const kind of ['linear', 'smooth', 'exponential', 'logarithmic', 'bezier'] as const) {
      expect(curveShape(0, { kind })).toBeCloseTo(0, 6);
      expect(curveShape(1, { kind })).toBeCloseTo(1, 6);
    }
    expect(curveShape(0, { kind: 'stepped' })).toBe(0);
    expect(curveShape(0.99, { kind: 'stepped' })).toBe(0);
    expect(curveShape(1, { kind: 'stepped' })).toBe(1);
  });

  it('moves monotonically for continuous shapes', () => {
    for (const kind of ['linear', 'smooth', 'exponential', 'logarithmic'] as const) {
      let previous = -Infinity;
      for (let i = 0; i <= 100; i++) {
        const value = curveShape(i / 100, { kind });
        expect(value).toBeGreaterThanOrEqual(previous - 1e-12);
        previous = value;
      }
    }
  });

  it('interpolates an exponential sweep at a constant ratio per unit time', () => {
    const from = 10;
    const to = 2.5;
    const spec = { kind: 'exponential' } as const;
    const quarter = curveValue(from, to, 0.25, spec);
    const half = curveValue(from, to, 0.5, spec);
    const threeQuarters = curveValue(from, to, 0.75, spec);
    expect(half / quarter).toBeCloseTo(threeQuarters / half, 9);
    expect(curveValue(from, to, 0, spec)).toBeCloseTo(from, 9);
    expect(curveValue(from, to, 1, spec)).toBeCloseTo(to, 9);
  });

  it('holds the start value for a stepped segment', () => {
    expect(curveValue(10, 6, 0.5, { kind: 'stepped' })).toBe(10);
    expect(curveValue(10, 6, 1, { kind: 'stepped' })).toBe(6);
  });
});

describe('deterministic rng', () => {
  it('produces the same stream for the same seed', () => {
    const a = new Rng('frequency-lab');
    const b = new Rng('frequency-lab');
    for (let i = 0; i < 1000; i++) expect(a.nextUint32()).toBe(b.nextUint32());
  });

  it('produces different streams for different seeds', () => {
    const a = new Rng('left');
    const b = new Rng('right');
    let identical = 0;
    for (let i = 0; i < 1000; i++) if (a.nextUint32() === b.nextUint32()) identical++;
    expect(identical).toBeLessThan(5);
  });

  it('is approximately uniform', () => {
    const rng = new Rng(12345);
    const buckets = new Array(10).fill(0);
    const samples = 200_000;
    for (let i = 0; i < samples; i++) buckets[Math.floor(rng.nextFloat() * 10)]++;
    for (const count of buckets) {
      expect(count / samples).toBeGreaterThan(0.09);
      expect(count / samples).toBeLessThan(0.11);
    }
  });
});
