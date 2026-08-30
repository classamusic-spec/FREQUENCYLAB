import { describe, expect, it } from 'vitest';
import { FACTORY_PRESETS, presetToProtocol, type GraphNode } from '@frequencylab/dsp-core';
import { playerReadout } from './playerReadout';

/**
 * Every factory preset, checked against what the player will show for it.
 *
 * This exists because 48 of the 80 shipped presets printed `CARRIER 0.000 Hz`
 * over an audible tone, and nothing noticed: the screen read three fixed
 * telemetry keys that only three of the eight engines produce, and a miss
 * defaulted to zero rather than to blank. The audit that found it is this file,
 * so the next engine added cannot repeat it quietly.
 */

/** Compiles a preset and hands back its first stage's nodes. */
function graphFor(preset: (typeof FACTORY_PRESETS)[number]) {
  const compiled = presetToProtocol(preset);
  if (!compiled.ok) throw new Error(`${preset.id} did not compile: ${compiled.failure.message}`);
  return compiled.protocol.stages[0].graph;
}

/** The readout the player would show for a preset, from its real graph. */
function readoutFor(
  preset: (typeof FACTORY_PRESETS)[number],
  readouts: Record<string, number> = {},
) {
  const graph = graphFor(preset);
  return playerReadout(graph.nodes, readouts, graph.connections);
}

function nodesFor(preset: (typeof FACTORY_PRESETS)[number]): GraphNode[] {
  return graphFor(preset).nodes;
}

describe('every factory preset', () => {
  it('compiles', () => {
    expect(FACTORY_PRESETS.length).toBeGreaterThanOrEqual(80);
    for (const preset of FACTORY_PRESETS) {
      expect(() => nodesFor(preset), preset.id).not.toThrow();
    }
  });

  it('shows a frequency, or says why there is none — never a silent zero', () => {
    const zeros: string[] = [];
    for (const preset of FACTORY_PRESETS) {
      const readout = readoutFor(preset);
      if (readout.carrierHz === null) {
        // A null is only honest if the screen has something to print instead —
        // in both places it prints: the dial and the detail row.
        expect(readout.absence, `${preset.id} has no frequency and no reason`).toBeTruthy();
        expect(readout.absenceDetail, preset.id).toBeTruthy();
        continue;
      }
      if (readout.carrierHz === 0) zeros.push(`${preset.id} (${preset.representation.kind})`);
    }
    expect(zeros, `presets printing 0.000 Hz: ${zeros.join(', ')}`).toEqual([]);
  });

  it('names an engine for every preset', () => {
    for (const preset of FACTORY_PRESETS) {
      const { mode } = readoutFor(preset);
      expect(mode, preset.id).not.toBe('—');
    }
  });

  it('captions the dial with whatever number the dial actually got', () => {
    /*
     * The dial shows the rate when there is one and the pitch when there is
     * not, so a fixed caption is wrong half the time — it read "beat" over a
     * Solfeggio pitch. Every preset's caption has to match its own headline.
     */
    for (const preset of FACTORY_PRESETS) {
      const r = readoutFor(preset);
      if (r.beatHz !== null) {
        expect(r.headlineLabel, preset.id).toBe(r.beatLabel);
      } else if (r.carrierHz !== null) {
        expect(r.headlineLabel, preset.id).toBe('Tone');
      } else {
        expect(r.headlineLabel, preset.id).toBe('Noise');
      }
    }
  });

  it('reports the source frequency for every preset that holds one directly', () => {
    /*
     * The strongest form of the check: for a `direct` preset the number on the
     * player must be the number on the shelf. This is what fails if a future
     * engine renames its parameter — the readout would fall back to zero, and
     * zero is not 528.
     */
    const direct = FACTORY_PRESETS.filter((p) => p.representation.kind === 'direct');
    expect(direct.length).toBeGreaterThan(20);
    for (const preset of direct) {
      const { carrierHz, leftHz, rightHz, beatHz } = readoutFor(preset);
      expect(carrierHz, preset.id).toBeCloseTo(preset.sourceFrequency.value, 6);
      // A steady tone is the same in both ears and has no rate at all.
      expect(leftHz, preset.id).toBe(carrierHz);
      expect(rightHz, preset.id).toBe(carrierHz);
      expect(beatHz, preset.id).toBeNull();
    }
  });

  it('puts a real number on the shelves that reported nothing', () => {
    // The four collections the report named, checked by value rather than by
    // "not zero" — these are the rows the user was looking at.
    const expected: Record<string, number> = {
      'solf-528': 528,
      'solf-174': 174,
      'cosmic-136': 136.1,
      'cosmic-194': 194.18,
      'tuning-a432': 432,
      'ht-256': 256,
    };
    for (const [id, hz] of Object.entries(expected)) {
      const preset = FACTORY_PRESETS.find((p) => p.id === id);
      expect(preset, id).toBeDefined();
      expect(readoutFor(preset!).carrierHz, id).toBeCloseTo(hz, 2);
    }
  });
});

describe('each engine reports what it actually does', () => {
  const withKind = (kind: string) =>
    FACTORY_PRESETS.find((p) => p.representation.kind === kind);

  it('splits a binaural pair by the core’s own arithmetic', () => {
    const preset = withKind('binaural');
    expect(preset).toBeDefined();
    const readout = readoutFor(preset!);
    expect(readout.mode).toBe('Binaural');
    expect(readout.leftHz).not.toBe(readout.rightHz);
    // Offset mode: the beat is the whole difference between the ears.
    expect(readout.rightHz! - readout.leftHz!).toBeCloseTo(readout.beatHz!, 6);
  });

  it('honours centered mode instead of assuming offset', () => {
    /*
     * The screen used to compute `right = carrier + beat` unconditionally,
     * which is the offset split. In centered mode the carrier sits between the
     * ears, and every centered preset was therefore shown a right ear it did
     * not have.
     */
    const preset = withKind('binaural-centered');
    if (!preset) return;
    const readout = readoutFor(preset);
    expect(readout.rightHz! - readout.leftHz!).toBeCloseTo(readout.beatHz!, 6);
    // Centered: the carrier is the midpoint, which offset never is.
    expect((readout.leftHz! + readout.rightHz!) / 2).toBeCloseTo(readout.carrierHz!, 6);
  });

  it('reads an AM preset off the modulator, not the oscillator beside it', () => {
    const preset = withKind('am');
    expect(preset).toBeDefined();
    const readout = readoutFor(preset!);
    expect(readout.carrierHz).toBeGreaterThan(0);
    expect(readout.beatHz).toBeGreaterThan(0);
    expect(readout.beatLabel).toBe('Modulation');
  });

  it('refuses to give noise a frequency it does not have', () => {
    const preset = withKind('noise-modulation');
    expect(preset).toBeDefined();
    const readout = readoutFor(preset!);
    expect(readout.carrierHz).toBeNull();
    expect(readout.leftHz).toBeNull();
    expect(readout.rightHz).toBeNull();
    expect(readout.absence).toMatch(/no single frequency/i);
    expect(readout.absenceDetail).toMatch(/broadband/i);
    // This preset *is* modulated, so the dial has a rate to show and the
    // caption names it. It is the pitch that does not exist, not the rate.
    expect(readout.beatHz).toBeGreaterThan(0);
    expect(readout.headlineLabel).toBe('Modulation');
  });

  it('gives unmodulated noise no number and no tone word', () => {
    // `noise-white` and friends have neither pitch nor rate. The dial shows the
    // reason, and the rate row must not call broadband noise a "steady tone".
    const preset = FACTORY_PRESETS.find((p) => p.id === 'noise-white');
    expect(preset, 'noise-white').toBeDefined();
    const readout = readoutFor(preset!);
    expect(readout.carrierHz).toBeNull();
    expect(readout.beatHz).toBeNull();
    expect(readout.headlineLabel).toBe('Noise');
    expect(readout.noRateLabel).not.toMatch(/tone/i);
    expect(readout.absence).toBe('No single frequency');
  });

  it('calls an isochronic rate a pulse', () => {
    const preset = withKind('isochronic');
    if (!preset) return;
    const readout = readoutFor(preset);
    expect(readout.beatLabel).toBe('Pulse');
    expect(readout.beatHz).toBeGreaterThan(0);
  });

  it('reports a harmonic stack by its root', () => {
    const preset = withKind('harmonic');
    if (!preset) return;
    const readout = readoutFor(preset);
    expect(readout.carrierHz).toBeCloseTo(preset.sourceFrequency.value, 6);
    expect(readout.beatHz).toBeNull();
  });
});

describe('live telemetry wins over the written value', () => {
  it('follows an automated parameter rather than the value it started at', () => {
    const preset = FACTORY_PRESETS.find((p) => p.representation.kind === 'direct')!;
    const moved = readoutFor(preset, { 'tone:frequency': 111.25 });
    expect(moved.carrierHz).toBe(111.25);
  });

  it('falls back to the written value for a parameter telemetry omits', () => {
    /*
     * The renderer drops any key whose value is zero, so a beat resting at 0 Hz
     * is absent rather than present as 0 — indistinguishable, without this
     * fallback, from a parameter the engine does not have.
     */
    const preset = FACTORY_PRESETS.find((p) => p.representation.kind === 'direct')!;
    const readout = readoutFor(preset);
    expect(readout.carrierHz).toBeCloseTo(preset.sourceFrequency.value, 6);
  });

  it('says nothing is playing when there is no graph', () => {
    expect(playerReadout(undefined, undefined).mode).toBe('—');
    expect(playerReadout([], {}).absence).toBeTruthy();
  });
});
