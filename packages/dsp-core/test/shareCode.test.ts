import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPLORER_RECIPE,
  DEFAULT_MASTER,
  buildPresets,
  designProtocol,
  protocolFromExplorer,
  makeNode,
  buildStage,
  createProtocol,
  describeShareCode,
  encodeDnaString,
  encodeShareCode,
  parseShareCode,
  protocolFingerprint,
  shareCheck,
  FACTORY_PRESETS,
  presetToProtocol,
  type Protocol,
} from '../src/index.js';

/**
 * The contract: a share code is short enough to send in a message, and
 * rebuilding from it produces a protocol that renders identical audio — proven
 * by the fingerprint, not asserted.
 */

describe('share codes', () => {
  it('is short enough to actually send', () => {
    for (const preset of buildPresets()) {
      const code = encodeShareCode(preset);
      expect(code, preset.name).not.toBeNull();
      // The full DNA document runs to thousands of characters; the point of a
      // share code is that a person can paste it.
      expect(code!.length, `${preset.name}: ${code}`).toBeLessThan(120);
      expect(encodeDnaString(preset).length).toBeGreaterThan(1000);
    }
  });

  it('rebuilds every shipped preset to the same fingerprint', () => {
    for (const preset of buildPresets()) {
      const code = encodeShareCode(preset)!;
      const result = parseShareCode(code);
      expect(result.ok, `${preset.name}: ${JSON.stringify(result)}`).toBe(true);
      if (!result.ok) continue;

      expect(protocolFingerprint(result.protocol), preset.name).toBe(protocolFingerprint(preset));
      expect(result.verified, preset.name).toBe(true);
    }
  });

  it('reads as something a person could say out loud', () => {
    const calm = buildPresets().find((preset) => preset.name === 'Calm')!;
    const code = encodeShareCode(calm)!;
    // Header, a global carrier, and one segment per stage.
    expect(code).toMatch(/^FL1 /);
    expect(code).toContain('C220');
    expect(code.split('|')).toHaveLength(calm.stages.length + 1);
    expect(code).toMatch(/#[A-Z0-9]{4}$/);
  });

  it('round-trips a sweep, noise and modulation together', () => {
    const protocol = createProtocol({
      id: 'p',
      name: 'Test',
      intent: 'explore',
      stages: [
        buildStage({
          id: 's1',
          name: 'One',
          durationSec: 600,
          engine: 'binaural',
          carrierHz: 240,
          beatHz: 12,
          beatToHz: 6,
          amplitude: 0.42,
          crossfadeSec: 0,
          noise: { color: 'brown', level: 0.18 },
          noiseToLevel: 0.05,
          am: { rateHz: 40, depth: 0.3 },
          motion: { rateHz: 0.25, depth: 0.8 },
        }),
      ],
      master: { ...DEFAULT_MASTER, gain: 0.42 },
    });

    const code = encodeShareCode(protocol)!;
    const result = parseShareCode(code);
    expect(result.ok, code).toBe(true);
    if (!result.ok) return;
    expect(protocolFingerprint(result.protocol)).toBe(protocolFingerprint(protocol));
  });

  it('round-trips every engine', () => {
    for (const engine of ['binaural', 'monaural', 'isochronic'] as const) {
      const protocol = createProtocol({
        id: 'p',
        name: engine,
        intent: 'explore',
        stages: [
          buildStage({
            id: 's1',
            name: 'One',
            durationSec: 300,
            engine,
            carrierHz: 200,
            beatHz: 8,
            amplitude: 0.5,
            crossfadeSec: 0,
          }),
        ],
      });
      const code = encodeShareCode(protocol)!;
      const result = parseShareCode(code);
      expect(result.ok, `${engine}: ${code}`).toBe(true);
      if (!result.ok) continue;
      expect(protocolFingerprint(result.protocol), engine).toBe(protocolFingerprint(protocol));
    }
  });

  it('accepts a code a human retyped loosely', () => {
    const calm = buildPresets().find((preset) => preset.name === 'Calm')!;
    const code = encodeShareCode(calm)!;
    const mangled = code.toLowerCase().replace(/\s*\|\s*/g, '  ·  ').replace(/^fl1 /, '');
    const result = parseShareCode(mangled);
    expect(result.ok, mangled).toBe(true);
    if (!result.ok) return;
    expect(protocolFingerprint(result.protocol)).toBe(protocolFingerprint(calm));
  });

  it('reports a mistyped code instead of building the wrong thing', () => {
    const calm = buildPresets().find((preset) => preset.name === 'Calm')!;
    const code = encodeShareCode(calm)!;
    // Change one digit of the beat; the check must catch it.
    const wrong = code.replace('B10', 'B11');
    const result = parseShareCode(wrong);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verified).toBe(false);
  });

  it('refuses an unknown token rather than silently dropping it', () => {
    const result = parseShareCode('FL1 C220 Z99 | 10m B10');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Z99');
  });

  it('explains what is missing rather than guessing', () => {
    expect(parseShareCode('FL1 C220 | B10')).toMatchObject({ ok: false });
    expect(parseShareCode('FL1 C220 | 10m')).toMatchObject({ ok: false });
    expect(parseShareCode('')).toMatchObject({ ok: false });
    const future = parseShareCode('FL9 C220 | 10m B10');
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.error).toContain('version 9');
  });

  it('flags a code with no check as unverified rather than claiming it matches', () => {
    const result = parseShareCode('FL1 C220 | 10m B10');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verified).toBe(false);
    expect(result.unchecked).toBe(true);
  });

  it('declines to shorten a protocol it cannot rebuild exactly', () => {
    const calm = buildPresets().find((preset) => preset.name === 'Calm')!;
    // A hand-wired module the standard chain does not have. The encoder's own
    // round trip is what catches this, so no list of rejected shapes has to be
    // maintained by hand.
    const custom: Protocol = {
      ...calm,
      stages: calm.stages.map((stage, index) =>
        index === 0
          ? {
              ...stage,
              graph: {
                ...stage.graph,
                nodes: [
                  ...stage.graph.nodes,
                  makeNode('extra', 'oscillator', { frequency: 100, amplitude: 0.1 }),
                ],
              },
            }
          : stage,
      ),
    };
    expect(encodeShareCode(custom)).toBeNull();
  });

  it('declines rather than quietly re-enabling a disabled limiter', () => {
    const calm = buildPresets().find((preset) => preset.name === 'Calm')!;
    // A protocol shipped with the limiter off must not arrive somewhere else
    // looking ordinary — there is no token for it, so there is no code.
    expect(encodeShareCode({ ...calm, master: { ...calm.master, limiter: false } })).toBeNull();
    expect(
      encodeShareCode({ ...calm, master: { ...calm.master, limiterCeilingDb: -6 } }),
    ).toBeNull();
  });

  it('carries the master fades rather than dropping them', () => {
    const calm = buildPresets().find((preset) => preset.name === 'Calm')!;
    const long: Protocol = { ...calm, master: { ...calm.master, fadeInSec: 12, fadeOutSec: 20 } };
    const code = encodeShareCode(long)!;
    expect(code, 'a non-default fade must be expressible').not.toBeNull();
    const result = parseShareCode(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.protocol.master.fadeInSec).toBe(12);
    expect(result.protocol.master.fadeOutSec).toBe(20);
    expect(protocolFingerprint(result.protocol)).toBe(protocolFingerprint(long));
  });

  it('describes a code in plain language for the import preview', () => {
    const calm = buildPresets().find((preset) => preset.name === 'Calm')!;
    const description = describeShareCode(calm);
    expect(description).toContain('min');
    expect(description).toContain('Hz carrier');
    expect(description).toContain('stage');
  });

  it('covers every path that creates a protocol', () => {
    // Presets are covered above; these are the other two ways a protocol comes
    // into existence. If either grows a module the notation cannot carry, the
    // encoder returns null and this fails rather than silently degrading to
    // file-only sharing.
    const built: Protocol[] = [];
    for (const engine of ['binaural', 'monaural', 'isochronic'] as const) {
      for (const noiseLevel of [0, 0.15]) {
        for (const motionDepth of [0, 0.5]) {
          built.push(
            protocolFromExplorer(
              { ...DEFAULT_EXPLORER_RECIPE, engine, noiseLevel, motionDepth },
              { id: 'explorer' },
            ),
          );
        }
      }
    }
    for (const prompt of [
      'help me relax before bed',
      'deep focus for 45 minutes',
      'meditation with brown noise',
      '40 Hz gamma session',
      'wind down slowly to delta',
    ]) {
      const designed = designProtocol({ prompt, now: '2026-01-01T00:00:00.000Z', id: 'ai' }).protocol;
      if (designed) built.push(designed);
    }

    expect(built.length).toBeGreaterThan(15);
    for (const protocol of built) {
      const code = encodeShareCode(protocol);
      expect(code, `${protocol.name}: no share code`).not.toBeNull();
      expect(code!.length).toBeLessThan(120);
      const result = parseShareCode(code!);
      expect(result.ok, code!).toBe(true);
      if (!result.ok) continue;
      expect(protocolFingerprint(result.protocol), code!).toBe(protocolFingerprint(protocol));
    }
  });

  it('gives the same check to protocols that differ only by name', () => {
    const calm = buildPresets().find((preset) => preset.name === 'Calm')!;
    // Renaming must not change what the code verifies, because the canonical
    // form excludes the name — two people building the same chain should get
    // the same code.
    expect(shareCheck({ ...calm, name: 'Something else', id: 'other' })).toBe(shareCheck(calm));
  });
});

describe('share codes across the whole engine', () => {
  /*
   * The grammar started life knowing three engines, because those were the
   * three the stage builder had. The stock preset library brought five more —
   * a plain tone, a harmonic stack, FM, centred binaural, and a noise bed with
   * no tone module in it at all — and 46 of the 72 factory presets could not be
   * written as a code at all. That is not a small gap: a bare 528 Hz tone is
   * about the most shareable thing in the library, and the card's fallback copy
   * would have told its owner the protocol "uses custom routing", which is
   * false. These assert the grammar covers what the builder can build.
   */
  it('writes and reads back every factory preset', () => {
    const compiled = FACTORY_PRESETS.map((preset) => ({ preset, built: presetToProtocol(preset) }));
    for (const { preset, built } of compiled) {
      if (!built.ok) continue;
      const code = encodeShareCode(built.protocol);
      expect(code, `${preset.id} (${preset.representation.kind}) has no share code`).not.toBeNull();

      const reread = parseShareCode(code!);
      expect(reread.ok, `${preset.id} does not parse back`).toBe(true);
      if (!reread.ok) continue;
      expect(protocolFingerprint(reread.protocol), `${preset.id} round-trips to a different sound`)
        .toBe(protocolFingerprint(built.protocol));
    }
  });

  /*
   * The reason centred binaural gets its own letter rather than a flag. A 6 Hz
   * beat on 220 Hz is 220/226 offset and 217/223 centred — different sounds, so
   * different codes. If both wrote `EB`, one would be readable as the other.
   */
  it('does not let a centred binaural read as an offset one', () => {
    const make = (binauralMode: 'offset' | 'centered') =>
      createProtocol({
        id: `mode-${binauralMode}`,
        name: 'Mode',
        intent: 'explore',
        master: DEFAULT_MASTER,
        stages: [
          buildStage({
            id: 'stage-1',
            name: 'A',
            durationSec: 600,
            engine: 'binaural',
            binauralMode,
            carrierHz: 220,
            beatHz: 6,
            amplitude: 0.36,
            crossfadeSec: 0,
          }),
        ],
      });

    const offset = encodeShareCode(make('offset'));
    const centered = encodeShareCode(make('centered'));
    expect(offset).not.toBeNull();
    expect(centered).not.toBeNull();
    expect(centered).not.toBe(offset);
    expect(centered).toContain('EC');

    const back = parseShareCode(centered!);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(protocolFingerprint(back.protocol)).toBe(protocolFingerprint(make('centered')));
      expect(protocolFingerprint(back.protocol)).not.toBe(protocolFingerprint(make('offset')));
    }
  });

  it('leaves out the tokens an engine has no use for', () => {
    const tone = createProtocol({
      id: 'plain-tone',
      name: 'Tone',
      intent: 'explore',
      master: DEFAULT_MASTER,
      stages: [
        buildStage({
          id: 'stage-1',
          name: 'A',
          durationSec: 900,
          engine: 'tone',
          carrierHz: 528,
          beatHz: 0,
          amplitude: 0.36,
          crossfadeSec: 0,
        }),
      ],
    });
    const toneCode = encodeShareCode(tone);
    // A tone has a pitch and no rate: `B0` would read as a beat somebody chose.
    expect(toneCode).toContain('C528');
    expect(toneCode).not.toMatch(/\bB\d/);

    const bed = createProtocol({
      id: 'noise-bed',
      name: 'Bed',
      intent: 'explore',
      master: DEFAULT_MASTER,
      stages: [
        buildStage({
          id: 'stage-1',
          name: 'A',
          durationSec: 1800,
          engine: 'none',
          carrierHz: 0,
          beatHz: 0,
          amplitude: 0,
          noise: { color: 'pink', level: 0.25 },
          crossfadeSec: 0,
        }),
      ],
    });
    const bedCode = encodeShareCode(bed);
    // A bed with no tone module carries neither a carrier nor a beat.
    expect(bedCode).toContain('EO');
    expect(bedCode).toContain('NP');
    expect(bedCode).not.toMatch(/\bC\d/);
    expect(bedCode).not.toMatch(/\bB\d/);

    const reread = parseShareCode(bedCode!);
    expect(reread.ok).toBe(true);
    if (reread.ok) expect(protocolFingerprint(reread.protocol)).toBe(protocolFingerprint(bed));
  });
});
