import { describe, expect, it } from 'vitest';
import {
  STORM_NODES,
  THUNDER_BASE_LEVEL,
  factoryPreset,
  libraryEntry,
  presetToProtocol,
  thunderRolls,
} from '../src/index';
import { renderProtocolOffline } from '../src/engine/offline.js';
import { goertzelMagnitude } from '../src/math/fft.js';
import { bandPower, peak, rms } from './helpers.js';

/**
 * The thunderstorm with 40 Hz woven through it, and the 40.68 MHz study it is
 * filed against.
 *
 * Two kinds of check. The first group measures the rendered audio, because a
 * soundscape is the easiest thing in the app to describe well and build badly:
 * the 40 Hz has to actually be in the signal, the thunder has to actually roll,
 * and the rolls must not arrive on a beat. The second group defends the words
 * — that this does not reproduce a radio-frequency study, and that 40 Hz and
 * 40.68 MHz are unrelated numbers.
 */

const SR = 48000;
const preset = factoryPreset('noise-storm-40')!;

function compile(overrides: Partial<NonNullable<typeof preset>['representation']> = {}) {
  const row = { ...preset, representation: { ...preset.representation, ...overrides } };
  const compiled = presetToProtocol(row);
  if (!compiled.ok) throw new Error(compiled.failure.message);
  return compiled.protocol;
}

/** Power at `hz` in the signal's squared envelope, against nearby off-rate frequencies. */
function modulationContrast(signal: Float32Array, hz: number): number {
  const power = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) power[i] = signal[i] * signal[i];
  const on = goertzelMagnitude(power, hz, SR);
  const off = [hz - 9, hz - 6, hz + 6, hz + 9].map((f) => goertzelMagnitude(power, f, SR));
  return on / (off.reduce((a, b) => a + b, 0) / off.length);
}

describe('the storm, measured', () => {
  it('compiles to a graph with rain, drops, thunder, wind and the weave', () => {
    const stage = compile().stages[0];
    const ids = stage.graph.nodes.map((n) => n.id);
    for (const id of Object.values(STORM_NODES)) expect(ids).toContain(id);
    const weave = stage.graph.nodes.find((n) => n.id === STORM_NODES.weave)!;
    expect(weave.kind).toBe('am');
    expect(weave.params.modFrequency).toBe(40);
  });

  it('weaves 40 Hz through the rain and thunder, and leaves the wind outside it', () => {
    const { connections } = compile().stages[0].graph;
    const into = (id: string) => connections.filter((c) => c.to === id).map((c) => c.from).sort();
    expect(into(STORM_NODES.bed)).toEqual([STORM_NODES.hiss, STORM_NODES.rain, STORM_NODES.thunderGain].sort());
    expect(into(STORM_NODES.thunderGain)).toEqual([STORM_NODES.thunder]);
    expect(into(STORM_NODES.weave)).toEqual([STORM_NODES.bed]);
    // The wind reaches the mix by its own path, never through the insert.
    expect(connections).toContainEqual({ from: STORM_NODES.wind, to: STORM_NODES.motion });
    expect(connections).toContainEqual({ from: STORM_NODES.motion, to: STORM_NODES.mix });
    expect(connections.some((c) => c.from === STORM_NODES.wind && c.to === STORM_NODES.weave)).toBe(false);
  });

  it('puts a 40 Hz modulation in the rendered audio', () => {
    // Measured, not inferred from the graph: the power envelope of the output
    // carries a 40 Hz line well above its neighbours.
    const { left } = renderProtocolOffline(compile(), { sampleRate: SR, startSec: 4, maxSeconds: 6 });
    expect(modulationContrast(left, 40)).toBeGreaterThan(6);
  });

  it('carries no 40 Hz line when the weave is set to zero', () => {
    // The control for the test above: the same storm, unwoven.
    const { left } = renderProtocolOffline(compile({ modulationDepth: 0 }), { sampleRate: SR, startSec: 4, maxSeconds: 6 });
    expect(modulationContrast(left, 40)).toBeLessThan(2);
  });

  it('rolls thunder you can measure in the low band', () => {
    const roll = thunderRolls(preset.durationSec, 4068)[0];
    const peakAt = roll.atSec + roll.attackSec;
    const { left } = renderProtocolOffline(compile(), { sampleRate: SR, startSec: roll.atSec - 4, maxSeconds: 4 + roll.attackSec + 2 });
    // Compare one 16 384-sample window (≈0.34 s) well before the roll with one
    // centred on its peak, in the band where thunder lives and rain does not.
    const W = 1 << 14;
    const peakIndex = Math.round((peakAt - (roll.atSec - 4)) * SR);
    const before = bandPower(left.subarray(SR, SR + W) as Float32Array, SR, 20, 200);
    const during = bandPower(left.subarray(peakIndex - W / 2, peakIndex + W / 2) as Float32Array, SR, 20, 200);
    expect(10 * Math.log10(during / before)).toBeGreaterThan(10);
    // And it must be audible as a whole, not only in a band nobody isolates:
    // the full-range level at the peak stands clear of the rain around it.
    const loud = rms(left, peakIndex - SR / 2, peakIndex + SR / 2);
    const quiet = rms(left, 0, 2 * SR);
    expect(20 * Math.log10(loud / quiet)).toBeGreaterThan(3);
  });

  it('never clips, including through the loudest close strike', () => {
    const rolls = thunderRolls(preset.durationSec, 4068);
    const loudest = rolls.reduce((a, b) => (b.size > a.size ? b : a));
    const { left, right } = renderProtocolOffline(compile(), { sampleRate: SR, startSec: loudest.atSec - 1, maxSeconds: 6 });
    expect(Math.max(peak(left), peak(right))).toBeLessThanOrEqual(1);
  });
});

describe('the thunder does not keep time', () => {
  const rolls = thunderRolls(1800, 4068);

  it('rolls dozens of times in a session, each at its own size', () => {
    expect(rolls.length).toBeGreaterThan(20);
    expect(new Set(rolls.map((r) => r.size.toFixed(3))).size).toBe(rolls.length);
    expect(rolls.some((r) => r.close)).toBe(true);
    expect(rolls.some((r) => !r.close)).toBe(true);
  });

  it('arrives at irregular intervals', () => {
    // A periodic swell is the one thing thunder never does.
    const gaps = rolls.slice(1).map((r, i) => r.atSec - rolls[i].atSec);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
    expect(sd / mean).toBeGreaterThan(0.2);
  });

  it('lets every roll die away before the next begins', () => {
    for (let i = 1; i < rolls.length; i++) {
      const previous = rolls[i - 1];
      expect(rolls[i].atSec).toBeGreaterThan(previous.atSec + previous.attackSec + previous.decaySec);
    }
  });

  it('is the same storm every time it is played', () => {
    expect(thunderRolls(1800, 4068)).toEqual(rolls);
    expect(compile().stages[0].automation).toEqual(compile().stages[0].automation);
  });

  it('rests at the base level between rolls, rather than at silence', () => {
    const lane = compile().stages[0].automation.find((l) => l.target === `${STORM_NODES.thunder}:level`)!;
    expect(lane.points[0].value).toBe(THUNDER_BASE_LEVEL);
    expect(Math.min(...lane.points.map((p) => p.value))).toBe(THUNDER_BASE_LEVEL);
  });
});

describe('what the preset says', () => {
  it('plays the rate it states — 40 Hz, not the study’s 40.68 MHz', () => {
    expect(preset.sourceFrequency).toEqual({ value: 40, unit: 'Hz', role: 'modulation' });
  });

  it('says the study was not sound, and that this does not reproduce it', () => {
    expect(preset.summary).toMatch(/not sound/i);
    expect(preset.summary).toMatch(/does not reproduce/i);
  });

  it('says 40 Hz and 40.68 MHz are unrelated numbers', () => {
    expect(preset.summary).toMatch(/unrelated/i);
    expect(preset.summary).toMatch(/megahertz/i);
  });

  it('says the storm is synthesised, not recorded', () => {
    expect(preset.summary).toMatch(/synthesised/i);
  });

  it('answers the medical claim it invites, with a no', () => {
    const claim = preset.associations.find((a) => /brain injury|Alzheimer/i.test(a.claim))!;
    expect(claim.medical).toBe(true);
    expect(claim.currentEvidence).toMatch(/^No\./);
    expect(claim.currentEvidence).toMatch(/cannot produce/);
  });

  it('is classified experimental, and promises no effect in its name', () => {
    expect(preset.classification).toBe('experimental');
    expect(preset.name).not.toMatch(/clear|clean|heal|detox|flush|brain health|glymphatic/i);
  });

  it('links the entry that explains the study', () => {
    expect(preset.libraryEntryIds).toContain('ultrashort-wave-glymphatic');
  });
});

describe('the ultrashort-wave library entry', () => {
  const entry = libraryEntry('ultrashort-wave-glymphatic')!;

  it('cites the study it describes', () => {
    const study = entry.sources.find((s) => s.year === 2026);
    expect(study?.publication).toMatch(/Science Advances/);
    expect(study?.note).toMatch(/not sound/i);
  });

  it('offers no number and no way to "hear" the stimulus', () => {
    // 40.68 MHz is about 2000 times the top of human hearing. A frequencyHz
    // would display it as a value this app could play; a recipe would load
    // Explorer as though it could.
    expect(entry.frequencyHz).toBeUndefined();
    expect(entry.recipe).toBeUndefined();
  });

  it('says the results are in mice and that audio does not reproduce them', () => {
    expect(entry.whatHasNotBeenEstablished).toMatch(/mice/i);
    expect(entry.whatHasNotBeenEstablished).toMatch(/audio/i);
    expect(entry.howGenerated).toMatch(/Not by this app/);
  });
});
