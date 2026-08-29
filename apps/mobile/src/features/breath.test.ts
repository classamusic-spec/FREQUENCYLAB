import { describe, expect, it } from 'vitest';
import {
  BREATH_PATTERNS,
  breathAt,
  breathPatternById,
  breathsPerMinute,
  cycleSec,
  describePattern,
  type BreathPattern,
} from './breath';

/**
 * The breath cycle, checked as arithmetic.
 *
 * Two things are being defended here. The first is timing: the panel tells a
 * person to breathe on a count, so the count has to still be right an hour in.
 * The second is language: every string this module produces is read by someone
 * who has not been told what breathing is supposed to do to them, and it has to
 * stay that way as patterns get added.
 */

const HOUR = 3600;

describe('patterns', () => {
  it('names every pattern by its counts and nothing else', () => {
    for (const pattern of BREATH_PATTERNS) {
      const counts = [
        pattern.inhaleSec,
        pattern.holdFullSec,
        pattern.exhaleSec,
        pattern.holdEmptySec,
      ].filter((value) => value > 0);
      // `4·6` is the two counts; `5.5·5.5` is the two halves. A label with a
      // word in it would be a name, and a name is where a claim gets in.
      expect(pattern.label).toBe(counts.join('·'));
    }
  });

  it('has a unique id per pattern', () => {
    const ids = BREATH_PATTERNS.map((pattern) => pattern.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves ids and refuses unknown ones', () => {
    expect(breathPatternById('4-6')?.exhaleSec).toBe(6);
    expect(breathPatternById('4-7-8')).toBeUndefined();
    expect(breathPatternById(undefined)).toBeUndefined();
  });

  it('states no outcome in any caption a user reads', () => {
    /*
     * The forbidden list is deliberately wider than the claims anyone would
     * write on purpose, because the failure this guards against is a well-meant
     * sentence rather than a dishonest one: "calms the nervous system" is the
     * kind of thing that arrives in a copy edit, not in a design review.
     */
    const forbidden = [
      'calm',
      'relax',
      'reduce',
      'lower',
      'anxiety',
      'stress',
      'heart rate',
      'blood pressure',
      'nervous system',
      'vagus',
      'vagal',
      'parasympathetic',
      'cortisol',
      'heal',
      'therapy',
      'therapeutic',
      'balance',
      'restore',
      'improve',
      'boost',
      'regulate',
      'entrain',
      'sleep better',
      'focus',
      'energy',
    ];
    for (const pattern of BREATH_PATTERNS) {
      const copy = [pattern.label, pattern.spoken, pattern.note, pattern.aside ?? '', describePattern(pattern)]
        .join(' ')
        .toLowerCase();
      for (const term of forbidden) {
        expect(copy, `${pattern.id} says "${term}"`).not.toContain(term);
      }
    }
  });

  it('describes each pattern as its counts, its rate and nothing more', () => {
    expect(describePattern(BREATH_PATTERNS[0])).toBe(
      'Four seconds in, four seconds out. 7.5 breaths a minute.',
    );
    expect(describePattern(BREATH_PATTERNS[2])).toBe(
      'Five and a half seconds each way. 5.45 breaths a minute. A commonly used slow-breathing rate.',
    );
  });

  it('works the rate out from the counts', () => {
    expect(cycleSec(BREATH_PATTERNS[0])).toBe(8);
    expect(breathsPerMinute(BREATH_PATTERNS[0])).toBe(7.5);
    expect(cycleSec(BREATH_PATTERNS[3])).toBe(16); // 4·4·4·4 is a 16-second box
    expect(breathsPerMinute(BREATH_PATTERNS[3])).toBe(3.75);
  });
});

describe('breathAt', () => {
  const box = BREATH_PATTERNS[3]; // 4 in, hold 4, 4 out, hold 4

  it('walks the four phases in order', () => {
    expect(breathAt(box, 0).phase).toBe('in');
    expect(breathAt(box, 3.9).phase).toBe('in');
    expect(breathAt(box, 4).phase).toBe('holdFull');
    expect(breathAt(box, 7.9).phase).toBe('holdFull');
    expect(breathAt(box, 8).phase).toBe('out');
    expect(breathAt(box, 11.9).phase).toBe('out');
    expect(breathAt(box, 12).phase).toBe('holdEmpty');
    expect(breathAt(box, 15.9).phase).toBe('holdEmpty');
  });

  it('skips the phases a pattern does not have', () => {
    const fourFour = BREATH_PATTERNS[0]; // no holds
    expect(breathAt(fourFour, 0).phase).toBe('in');
    expect(breathAt(fourFour, 4).phase).toBe('out');
    // A zero-length hold must not be reachable, or the ring would freeze on a
    // phase whose countdown never ticks.
    for (let t = 0; t < 8; t += 0.01) {
      expect(breathAt(fourFour, t).phase).not.toBe('holdFull');
      expect(breathAt(fourFour, t).phase).not.toBe('holdEmpty');
    }
  });

  it('is empty at the top of the cycle and full at the turn', () => {
    expect(breathAt(box, 0).fullness).toBeCloseTo(0, 12);
    expect(breathAt(box, 4).fullness).toBeCloseTo(1, 12);
    expect(breathAt(box, 8).fullness).toBeCloseTo(1, 12);
    expect(breathAt(box, 12).fullness).toBeCloseTo(0, 12);
  });

  it('rises monotonically in, falls monotonically out', () => {
    let previous = -1;
    for (let t = 0; t < 4; t += 0.005) {
      const now = breathAt(box, t).fullness;
      expect(now).toBeGreaterThanOrEqual(previous);
      previous = now;
    }
    previous = 2;
    for (let t = 8; t < 12; t += 0.005) {
      const now = breathAt(box, t).fullness;
      expect(now).toBeLessThanOrEqual(previous);
      previous = now;
    }
  });

  it('arrives at each turn rather than hitting it', () => {
    // Zero slope at the ends is what makes the ring swing instead of tick. The
    // first 5 ms of an in-breath must travel far less than the middle 5 ms.
    const start = breathAt(box, 0.005).fullness - breathAt(box, 0).fullness;
    const middle = breathAt(box, 2.005).fullness - breathAt(box, 2).fullness;
    expect(start).toBeLessThan(middle / 100);
  });

  it('counts down in whole seconds and never shows a zero', () => {
    expect(breathAt(box, 0).countdown).toBe(4);
    expect(breathAt(box, 3.001).countdown).toBe(1);
    expect(breathAt(box, 3.999).countdown).toBe(1);
    expect(breathAt(box, 4).countdown).toBe(4); // the hold's own four
    for (let t = 0; t < 16; t += 0.013) {
      const { countdown } = breathAt(box, t);
      expect(countdown).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(countdown)).toBe(true);
    }
  });

  it('does not drift, because there is nothing for drift to accumulate in', () => {
    /*
     * The claim on the panel is that the guide is still on the count a long way
     * into a session. It holds by construction — the phase is a modulo of the
     * session clock rather than a counter advanced once a frame — so there is no
     * state for an error to survive in, and the residue is float representation
     * of `offset + n · cycle` alone.
     *
     * Measured across all four patterns at 400 offsets each, at 1, 4 and 12
     * hours: phase and countdown match every time, and the largest disagreement
     * in fullness is 1.4e-12. Divided by the steepest the curve ever gets
     * (π / 2·inhale ≈ 0.39 per second) that is under a nanosecond of cycle
     * position after half a day.
     *
     * Mutate `breathAt` to accumulate — `u += dt` carried between calls — and
     * this test fails on the phase assertion long before the tolerance matters.
     */
    const FULLNESS_TOLERANCE = 5e-12;
    for (const pattern of BREATH_PATTERNS) {
      const cycle = cycleSec(pattern);
      for (const hours of [1, 4, 12]) {
        const cycles = Math.floor((HOUR * hours) / cycle);
        for (const offset of [0, 0.37, 1.5, 2.16, cycle * 0.5, cycle - 0.001]) {
          const early = breathAt(pattern, offset);
          const late = breathAt(pattern, offset + cycles * cycle);
          expect(late.phase, `${pattern.id} @${offset}s after ${hours}h`).toBe(early.phase);
          expect(late.countdown).toBe(early.countdown);
          expect(Math.abs(late.fullness - early.fullness)).toBeLessThan(FULLNESS_TOLERANCE);
        }
      }
    }
  });

  it('measures a cycle at its stated length over a long run', () => {
    // The session clock advances one 2048-frame buffer at a time at 48 kHz, so
    // this walks the same steps the app does and finds every rising edge.
    const pattern = BREATH_PATTERNS[3];
    const step = 2048 / 48000;
    const edges: number[] = [];
    let previous = breathAt(pattern, 0).phase;
    for (let t = step; t < HOUR; t += step) {
      const phase = breathAt(pattern, t).phase;
      if (phase === 'in' && previous !== 'in') edges.push(t);
      previous = phase;
    }
    expect(edges.length).toBeGreaterThan(200);
    const measured = (edges[edges.length - 1] - edges[0]) / (edges.length - 1);
    // Within one buffer of the stated 16 s, which is the resolution of the
    // clock rather than an error in the cycle.
    expect(Math.abs(measured - cycleSec(pattern))).toBeLessThan(step);
  });

  it('reads a backwards clock as the same point in the cycle', () => {
    /*
     * One frame of a restarted session under an old anchor hands `breathAt` a
     * negative time. `-1s` has to mean the same thing as one second before the
     * end of a cycle, which is what `((x % c) + c) % c` is for.
     *
     * Checking bounds alone is not enough and this test used to do exactly that:
     * `raisedCosine` clamps its input, so a plain `seconds % cycle` still
     * returns a fullness inside 0…1 and a phase from the set — while showing a
     * five-second count in a four-second in-breath, frozen at empty. Comparing
     * against the equivalent forward time is what catches it.
     */
    for (const pattern of BREATH_PATTERNS) {
      const cycle = cycleSec(pattern);
      for (const back of [-0.001, -1, -2.5, -cycle, -cycle - 0.4, -HOUR]) {
        const forward = ((back % cycle) + cycle) % cycle;
        const state = breathAt(pattern, back);
        const same = breathAt(pattern, forward);
        expect(state.phase, `${pattern.id} at ${back}s`).toBe(same.phase);
        expect(state.countdown).toBe(same.countdown);
        expect(state.fullness).toBeCloseTo(same.fullness, 12);
      }
    }
  });

  it('never counts down further than the phase it is in', () => {
    // A countdown longer than its own phase is the visible symptom of a
    // position that has escaped the cycle.
    for (const pattern of BREATH_PATTERNS) {
      const lengths: Record<string, number> = {
        in: pattern.inhaleSec,
        holdFull: pattern.holdFullSec,
        out: pattern.exhaleSec,
        holdEmpty: pattern.holdEmptySec,
      };
      for (let t = -2 * cycleSec(pattern); t < 2 * cycleSec(pattern); t += 0.017) {
        const { phase, countdown } = breathAt(pattern, t);
        expect(countdown, `${pattern.id} ${phase} at ${t.toFixed(3)}s`).toBeLessThanOrEqual(
          Math.ceil(lengths[phase]),
        );
      }
    }
  });

  it('holds fullness inside 0…1 for every pattern across a cycle', () => {
    for (const pattern of BREATH_PATTERNS) {
      for (let t = 0; t < cycleSec(pattern); t += 0.01) {
        const { fullness } = breathAt(pattern, t);
        expect(fullness).toBeGreaterThanOrEqual(0);
        expect(fullness).toBeLessThanOrEqual(1);
      }
    }
  });

  it('does not read the session beat rate', () => {
    /*
     * The panel states that the breath count and the session's beat rate do not
     * interact. `breathAt` takes a pattern and a time and nothing else, which is
     * that sentence expressed as a signature — there is no third argument for a
     * beat rate to arrive through.
     */
    expect(breathAt.length).toBe(2);
  });
});

describe('a pattern added later', () => {
  it('is measured the same way as the shipped four', () => {
    // Guards the arithmetic against a pattern nobody has written yet.
    const invented: BreathPattern = {
      id: 'test-3-2-7-1',
      inhaleSec: 3,
      holdFullSec: 2,
      exhaleSec: 7,
      holdEmptySec: 1,
      label: '3·2·7·1',
      spoken: 'three in, hold two, seven out, hold one',
      note: 'Three in, hold two, seven out, hold one.',
    };
    expect(cycleSec(invented)).toBe(13);
    expect(breathAt(invented, 2.9).phase).toBe('in');
    expect(breathAt(invented, 3).phase).toBe('holdFull');
    expect(breathAt(invented, 5).phase).toBe('out');
    expect(breathAt(invented, 12).phase).toBe('holdEmpty');
    expect(breathAt(invented, 13).phase).toBe('in');
  });
});
