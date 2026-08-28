import { describe, expect, it } from 'vitest';
import {
  FACTORY_PRESETS,
  buildArchiveProtocol,
  humanDna,
  presetToProtocol,
  protocolFingerprint,
  renderProtocolOffline,
  transformsFor,
  validatePreset,
  validateProtocol,
  type ArchiveEntry,
  type FrequencyPreset,
  type PresetRepresentation,
  type PlaybackTransform,
  type PresetCompileOptions,
  type Protocol,
  type TransformKind,
} from '../src/index.js';
import { peak } from './helpers.js';

const NOW = '2026-03-01T09:00:00.000Z';

function transform(kind: TransformKind, hz: number, options = {}): PlaybackTransform {
  return transformsFor(hz, options).find((candidate) => candidate.kind === kind)!;
}

/**
 * A preset row built here rather than taken from the shelf.
 *
 * The shipped rows are data under active editing; these tests are about the
 * machinery, and a fixture that changes underneath them would turn a data edit
 * into a machinery failure. The one test that does read the real shelf says so.
 */
function fixture(representation: PresetRepresentation, over: Partial<FrequencyPreset> = {}): FrequencyPreset {
  return {
    id: 'fixture',
    schemaVersion: 1,
    name: 'Fixture',
    collection: 'brainwave-lab',
    summary: 'A preset built for the compiler tests.',
    sourceFrequency: { value: 10, unit: 'Hz', role: 'modulation' },
    representation,
    durationSec: 20 * 60,
    intent: ['explore'],
    classification: 'experimental',
    libraryEntryIds: [],
    archiveEntryIds: [],
    associations: [],
    safety: {
      headphonesRecommended: true,
      directToneAllowed: false,
      output: 'headphones',
    },
    aliases: [],
    tags: [],
    version: 1,
    factory: true,
    ...over,
  };
}

/** Compiles, failing the test with the compiler's own words if it refused. */
function compiled(preset: FrequencyPreset, options: PresetCompileOptions = {}): Protocol {
  const result = presetToProtocol(preset, options);
  if (!result.ok) throw new Error(`${result.failure.code}: ${result.failure.message}`);
  return result.protocol;
}

function archiveFixture(hz: number): ArchiveEntry {
  return {
    id: 'fixture-entry',
    name: `${hz} Hz`,
    frequency: hz,
    unit: 'Hz',
    category: 'user-collection',
    signalRole: 'unspecified',
    evidenceLevel: 'experimental',
    verification: 'unverified',
    source: { title: 'Built for the transform tests', year: null },
    summary: `${hz} Hz, entered for a test.`,
    claims: [],
    playback: {
      directAudible: false,
      binauralBeatCompatible: true,
      binauralCarrierCompatible: false,
      amCompatible: true,
      isochronicCompatible: true,
      outsidePracticalRange: true,
    },
    recommendedTransform: 'Chosen explicitly by the test.',
    tags: [],
    aliases: [],
    related: [],
    sourceVersion: 1,
    evidenceVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    changeLog: [],
  };
}

describe('centred and offset binaural arithmetic', () => {
  it('splits a centred beat either side of the carrier', () => {
    // The arithmetic the brief calls out: 10 Hz on 440 Hz is 435 and 445,
    // never 440 and 450.
    const centered = transform('binaural-centered', 10, { carrierHz: 440 });
    expect(centered.available).toBe(true);
    expect(centered.channels).toEqual({ leftHz: 435, rightHz: 445 });
    expect(centered.channels!.rightHz - centered.channels!.leftHz).toBeCloseTo(10, 10);
    expect(centered.carrierHz).toBe(440);
    // The carrier is a midpoint, and neither ear is on it.
    expect(centered.channels!.leftHz).not.toBe(440);
    expect(centered.channels!.rightHz).not.toBe(440);
  });

  it('puts an offset beat on one ear and leaves the other on the carrier', () => {
    const offset = transform('binaural-beat', 10, { carrierHz: 440 });
    expect(offset.channels).toEqual({ leftHz: 440, rightHz: 450 });
    expect(offset.channels!.rightHz - offset.channels!.leftHz).toBeCloseTo(10, 10);
  });

  it('gives the two modes different channels for the same beat and carrier', () => {
    const centered = transform('binaural-centered', 7.83, { carrierHz: 220 });
    const offset = transform('binaural-beat', 7.83, { carrierHz: 220 });
    expect(centered.channels!.leftHz).toBeCloseTo(216.085, 6);
    expect(centered.channels!.rightHz).toBeCloseTo(223.915, 6);
    expect(offset.channels!.leftHz).toBe(220);
    expect(offset.channels!.rightHz).toBeCloseTo(227.83, 6);
    expect(centered.label).not.toBe(offset.label);
    // Both report the same difference — that is the one thing they share.
    expect(centered.playbackHz).toBe(offset.playbackHz);
  });

  it('states both channel frequencies in the centred note, not just the carrier', () => {
    const centered = transform('binaural-centered', 10, { carrierHz: 440 });
    expect(centered.description).toContain('435');
    expect(centered.description).toContain('445');
    expect(centered.equivalenceNote).toContain('435');
    expect(centered.equivalenceNote).toContain('445');
    expect(centered.equivalenceNote).toContain('midpoint');
  });

  it('compiles each mode to the engine mode it names', () => {
    const offsetProtocol = presetToProtocol(
      fixture({ kind: 'binaural', carrierHz: 440, calculationMode: 'offset' }),
    );
    const centeredProtocol = presetToProtocol(
      fixture({ kind: 'binaural-centered', carrierHz: 440, calculationMode: 'centered' }),
    );
    expect(offsetProtocol.ok && centeredProtocol.ok).toBe(true);
    if (!offsetProtocol.ok || !centeredProtocol.ok) return;

    const mode = (compiled: typeof offsetProtocol) =>
      compiled.ok ? compiled.protocol.stages[0].graph.nodes.find((n) => n.id === 'tone')!.options.mode : '';
    expect(mode(offsetProtocol)).toBe('offset');
    expect(mode(centeredProtocol)).toBe('centered');
    // Different sound, therefore a different fingerprint.
    expect(protocolFingerprint(offsetProtocol.protocol)).not.toBe(
      protocolFingerprint(centeredProtocol.protocol),
    );
  });

  it('refuses a centred beat that would push a channel out of the band', () => {
    // 60 Hz centred on 25 Hz would put one ear at -5 Hz.
    const centered = transform('binaural-centered', 60, { carrierHz: 25 });
    expect(centered.available).toBe(false);
    expect(centered.unavailableReason).toContain('outside what headphones reproduce');
    // The offset mode is a different signal and is judged on its own terms.
    expect(transform('binaural-beat', 60, { carrierHz: 25 }).available).toBe(true);
  });
});

describe('the representations added to the translator', () => {
  it('offers a monaural difference as an acoustic beat, not a binaural one', () => {
    const monaural = transform('monaural-beat', 10, { carrierHz: 220 });
    expect(monaural.available).toBe(true);
    expect(monaural.description).toContain('230');
    expect(monaural.equivalenceNote).toContain('speaker');
    expect(transform('monaural-beat', 400).available).toBe(false);
    expect(transform('monaural-beat', 400).unavailableReason).toContain('separate pitches');
  });

  it('states the FM swing rather than leaving it implied', () => {
    const fm = transform('fm-rate', 6, { carrierHz: 220, deviationHz: 30 });
    expect(fm.available).toBe(true);
    expect(fm.deviationHz).toBe(30);
    expect(fm.description).toContain('190');
    expect(fm.description).toContain('250');
    const wide = transform('fm-rate', 6, { carrierHz: 30, deviationHz: 200 });
    expect(wide.available).toBe(false);
    expect(wide.unavailableReason).toContain('outside what headphones reproduce');
  });

  it('bounds stereo movement by what the movement module produces', () => {
    expect(transform('stereo-motion-rate', 0.5).available).toBe(true);
    const fast = transform('stereo-motion-rate', 12);
    expect(fast.available).toBe(false);
    expect(fast.unavailableReason).toContain('stereo movement module');
  });

  it('describes a modulated noise bed without giving it a carrier', () => {
    const bed = transform('noise-modulation-rate', 10);
    expect(bed.available).toBe(true);
    expect(bed.carrierHz).toBeUndefined();
    expect(bed.equivalenceNote).toContain('broadband');
    const tooFast = transform('noise-modulation-rate', 400);
    expect(tooFast.available).toBe(false);
    expect(tooFast.unavailableReason).toContain('modulation range');
  });

  it('calls the partials of a harmonic stack additional tones', () => {
    const stack = transform('harmonic-stack', 110);
    expect(stack.available).toBe(true);
    expect(stack.playbackHz).toBe(110);
    expect(stack.description).toContain('220');
    expect(stack.description).toContain('330');
    expect(stack.equivalenceNote).toContain('tones in their own right');

    const shifted = transform('harmonic-stack', 110, { harmonicOctaveShift: -1 });
    expect(shifted.playbackHz).toBe(55);
    expect(shifted.octaveShift).toBe(-1);
    expect(shifted.equivalenceNote).toContain('55');

    const tooHigh = transform('harmonic-stack', 4000);
    expect(tooHigh.available).toBe(false);
    expect(tooHigh.unavailableReason).toContain('fundamental');
  });

  it('divides a subharmonic by exact octaves and refuses anything else', () => {
    const one = transform('subharmonic', 528);
    expect(one.playbackHz).toBe(264);
    expect(one.octaveShift).toBe(-1);
    expect(one.label).toBe('Subharmonic ÷2');
    expect(one.equivalenceNote).toContain('not 528');

    const three = transform('subharmonic', 528, { subharmonicOctaves: 3 });
    expect(three.playbackHz).toBe(66);
    expect(three.octaveShift).toBe(-3);

    const fractional = transform('subharmonic', 528, { subharmonicOctaves: 1.5 });
    expect(fractional.available).toBe(false);
    expect(fractional.playbackHz).toBe(528);
    expect(fractional.unavailableReason).toContain('whole number of octaves');

    // Halving a value that is still above the band does not rescue it, and the
    // refusal says which number it landed on.
    const stillHigh = transform('subharmonic', 50000);
    expect(stillHigh.available).toBe(false);
    expect(stillHigh.unavailableReason).toContain('25000');
  });

  it('gives every unavailable transform a reason and never loses the original value', () => {
    for (const hz of [0.5, 7.83, 40, 528, 4000, 50000]) {
      for (const candidate of transformsFor(hz)) {
        expect(candidate.originalHz, `${hz} ${candidate.kind}`).toBe(hz);
        if (!candidate.available) {
          expect(candidate.unavailableReason, `${hz} ${candidate.kind}`).toBeTruthy();
        }
      }
    }
  });

  it('caveats every added transform whose sound is not the value itself', () => {
    const added: TransformKind[] = [
      'binaural-centered',
      'monaural-beat',
      'fm-rate',
      'stereo-motion-rate',
      'noise-modulation-rate',
      'harmonic-stack',
      'subharmonic',
    ];
    for (const kind of added) {
      for (const hz of [0.5, 7.83, 40, 528]) {
        const candidate = transform(kind, hz);
        if (!candidate.available) continue;
        expect(candidate.equivalenceNote, `${kind} at ${hz}`).toBeTruthy();
      }
    }
  });
});

describe('no silent substitution', () => {
  it('builds a genuinely different chain for every transform kind', () => {
    // The defect this guards: a `default` branch that quietly auditions an
    // unimplemented transform as a plain tone.
    const entry = archiveFixture(4);
    const kinds: TransformKind[] = [
      'binaural-centered',
      'monaural-beat',
      'fm-rate',
      'stereo-motion-rate',
      'noise-modulation-rate',
    ];
    const toneKinds = new Set<string>();
    for (const kind of kinds) {
      const chosen = transform(kind, 4);
      expect(chosen.available, kind).toBe(true);
      const protocol = buildArchiveProtocol({
        id: `t-${kind}`,
        name: kind,
        stages: [{ entry, transform: chosen, durationSec: 60 }],
        createdAt: NOW,
      });
      expect(validateProtocol(protocol).ok, kind).toBe(true);
      const nodes = protocol.stages[0].graph.nodes;
      const tone = nodes.find((node) => node.id === 'tone');
      toneKinds.add(tone ? tone.kind : 'none');
    }
    // binaural, monaural, fm, oscillator-with-motion, and a bed with no tone.
    expect(toneKinds.size).toBe(kinds.length);
  });

  it('renders a modulated noise bed as a bed, with no tone in the graph', () => {
    const entry = archiveFixture(40);
    const protocol = buildArchiveProtocol({
      id: 'noise-mod',
      name: 'Noise modulation',
      stages: [
        {
          entry,
          transform: transform('noise-modulation-rate', 40),
          durationSec: 60,
          noise: { color: 'pink', level: 0.3 },
        },
      ],
      createdAt: NOW,
    });
    const nodes = protocol.stages[0].graph.nodes;
    expect(nodes.find((node) => node.id === 'tone')).toBeUndefined();
    expect(nodes.find((node) => node.id === 'noise')).toBeDefined();
    expect(nodes.find((node) => node.id === 'am')!.params.modFrequency).toBe(40);
    // The bed feeds the modulator, and the modulator feeds the mix.
    expect(protocol.stages[0].graph.connections).toContainEqual({ from: 'noise', to: 'am' });
    expect(protocol.stages[0].graph.connections).toContainEqual({ from: 'am', to: 'mix' });
    expect(validateProtocol(protocol).ok).toBe(true);
    // Human DNA must not claim a carrier for a signal that has none.
    expect(humanDna(protocol)).not.toContain('C');
  });

  it('refuses to compile a preset whose representation the value cannot support', () => {
    const compiled = presetToProtocol(
      fixture(
        { kind: 'stereo-motion', carrierHz: 220 },
        { sourceFrequency: { value: 40, unit: 'Hz', role: 'modulation' } },
      ),
    );
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.failure.code).toBe('representation-unavailable');
    expect(compiled.failure.message).toContain('stereo movement module');
  });

  it('refuses a multi-layer representation rather than playing one layer of it', () => {
    const compiled = presetToProtocol(fixture({ kind: 'multi-layer', carrierHz: 220 }));
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.failure.code).toBe('representation-not-compilable');
    expect(compiled.failure.message).toContain('which layers');
  });

  it('compiles a direct tone to one oscillator, not to a binaural pair', () => {
    const compiled = presetToProtocol(
      fixture(
        { kind: 'direct' },
        {
          sourceFrequency: { value: 528, unit: 'Hz', role: 'carrier' },
          safety: { headphonesRecommended: false, directToneAllowed: true, output: 'headphones-or-speakers' },
        },
      ),
    );
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const tone = compiled.protocol.stages[0].graph.nodes.find((node) => node.id === 'tone')!;
    expect(tone.kind).toBe('oscillator');
    expect(tone.params.frequency).toBe(528);
    expect(compiled.statement.transform!.kind).toBe('direct');
  });
});

describe('compiling a preset', () => {
  const binaural = fixture({ kind: 'binaural', carrierHz: 220, calculationMode: 'offset' });

  it('is deterministic — the same preset and options fingerprint identically', () => {
    const a = presetToProtocol(binaural, { createdAt: NOW });
    const b = presetToProtocol(binaural, { createdAt: '2027-01-01T00:00:00.000Z' });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    // A different timestamp and a fresh call: same audio, same fingerprint.
    expect(protocolFingerprint(a.protocol)).toBe(protocolFingerprint(b.protocol));
    expect(protocolFingerprint(compiled(binaural))).toBe(protocolFingerprint(a.protocol));
  });

  it('changes the fingerprint when the carrier or the duration changes', () => {
    const base = presetToProtocol(binaural);
    const retuned = presetToProtocol(binaural, { carrierHz: 432 });
    const shorter = presetToProtocol(binaural, { durationSec: 10 * 60 });
    expect(base.ok && retuned.ok && shorter.ok).toBe(true);
    if (!base.ok || !retuned.ok || !shorter.ok) return;

    expect(retuned.protocol.stages[0].graph.nodes.find((n) => n.id === 'tone')!.params.carrier).toBe(432);
    expect(protocolFingerprint(retuned.protocol)).not.toBe(protocolFingerprint(base.protocol));
    expect(protocolFingerprint(shorter.protocol)).not.toBe(protocolFingerprint(base.protocol));
    // Renaming the protocol is not a change of sound, so the id must not move it.
    expect(protocolFingerprint(compiled(binaural, { id: 'something-else' }))).toBe(
      protocolFingerprint(base.protocol),
    );
  });

  it('uses the shared builders, so node ids match what every other surface makes', () => {
    const compiled = presetToProtocol(binaural);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const ids = compiled.protocol.stages[0].graph.nodes.map((node) => node.id).sort();
    expect(ids).toEqual(['mix', 'output', 'tone']);
    expect(compiled.protocol.meta.generatedBy).toBe('preset');
  });

  it('carries the translator statement onto the stage', () => {
    const compiled = presetToProtocol(binaural);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.statement.summary).toBe(compiled.protocol.stages[0].notes);
    expect(compiled.statement.summary).toContain('230');
    expect(compiled.statement.summary).toContain('not an acoustic tone');
  });

  it('sweeps a rate on the beat and a pitch on the tone', () => {
    const rateSweep = presetToProtocol(
      fixture(
        { kind: 'sweep', carrierHz: 220, sweepToHz: 4 },
        { sourceFrequency: { value: 10, unit: 'Hz', role: 'modulation' } },
      ),
    );
    expect(rateSweep.ok).toBe(true);
    if (!rateSweep.ok) return;
    expect(rateSweep.protocol.stages[0].automation[0].target).toBe('tone:beat');
    expect(rateSweep.statement.sweepTo!.originalHz).toBe(4);

    const pitchSweep = presetToProtocol(
      fixture(
        { kind: 'sweep', sweepToHz: 432 },
        {
          sourceFrequency: { value: 220, unit: 'Hz', role: 'carrier' },
          safety: { headphonesRecommended: false, directToneAllowed: true, output: 'headphones-or-speakers' },
        },
      ),
    );
    expect(pitchSweep.ok).toBe(true);
    if (!pitchSweep.ok) return;
    // An oscillator's pitch parameter is `frequency`, not `carrier`; a lane
    // aimed at the wrong one is a validation error rather than a silent no-op.
    expect(pitchSweep.protocol.stages[0].automation[0].target).toBe('tone:frequency');
    expect(validateProtocol(pitchSweep.protocol).ok).toBe(true);
  });

  it('compiles an unmodulated noise bed without inventing a frequency for it', () => {
    const compiled = presetToProtocol(
      fixture(
        { kind: 'noise-modulation', modulationDepth: 0, noiseColor: 'brown', noiseLevel: 0.25 },
        { sourceFrequency: { value: 0, unit: 'Hz', role: 'unspecified' } },
      ),
    );
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.statement.transform).toBeUndefined();
    expect(compiled.statement.summary).toContain('broadband');
    expect(compiled.statement.summary).not.toContain('0 Hz');
    const nodes = compiled.protocol.stages[0].graph.nodes.map((node) => node.id).sort();
    expect(nodes).toEqual(['mix', 'noise', 'output']);
  });

  it('renders audibly on the engines added for the preset shelf', () => {
    // A protocol that validates and then plays nothing would pass every check
    // above. These two use the chains that did not exist before — a bare
    // oscillator, and a noise bed with no tone module at all.
    const tone = compiled(
      fixture(
        { kind: 'direct' },
        {
          durationSec: 30,
          sourceFrequency: { value: 440, unit: 'Hz', role: 'carrier' },
          safety: { headphonesRecommended: false, directToneAllowed: true, output: 'headphones-or-speakers' },
        },
      ),
    );
    const bed = compiled(
      fixture(
        { kind: 'noise-modulation', modulationDepth: 0.8, noiseColor: 'pink', noiseLevel: 0.3 },
        { durationSec: 30, sourceFrequency: { value: 10, unit: 'Hz', role: 'modulation' } },
      ),
    );

    for (const [label, protocol] of [['tone', tone], ['noise bed', bed]] as const) {
      const rendered = renderProtocolOffline(protocol, { maxSeconds: 12 });
      // Sampled well past the master fade-in and well before the fade-out, so
      // this measures the signal rather than an envelope.
      const from = Math.round(10 * rendered.sampleRate);
      expect(peak(rendered.left, from), label).toBeGreaterThan(0.01);
      expect(peak(rendered.right, from), label).toBeGreaterThan(0.01);
    }
  });

  it('produces a valid protocol for every shipped preset the engine can build', () => {
    // The one test that reads the real shelf. Every row either compiles to a
    // protocol that will actually run, or is refused — and the only rows
    // refused are the ones whose representation the preset type cannot yet
    // describe. A refusal for any other reason, or a compiled protocol that
    // would not pass validation, is a row that should not have shipped.
    expect(FACTORY_PRESETS.length).toBeGreaterThan(0);
    const refused: string[] = [];
    for (const preset of FACTORY_PRESETS) {
      const compiled = presetToProtocol(preset, { createdAt: NOW });
      if (!compiled.ok) {
        expect(compiled.failure.code, preset.id).toBe('representation-not-compilable');
        refused.push(preset.representation.kind);
        continue;
      }
      expect(validateProtocol(compiled.protocol).ok, preset.id).toBe(true);
      expect(compiled.statement.summary.length, preset.id).toBeGreaterThan(10);
    }
    // `multi-layer` is the known gap: `PresetRepresentation` names one kind and
    // carries no list of layers, so a row asking for three simultaneous tones
    // has no way to say which three. Compiling it as the one tone the type can
    // hold would be a preset playing something other than what it says.
    expect(new Set(refused)).toEqual(new Set(refused.length > 0 ? ['multi-layer'] : []));
  });
});

describe('validating a preset', () => {
  it('refuses a direct tone on a preset whose safety block forbids one', () => {
    const issues = validatePreset(
      fixture({ kind: 'direct' }, { sourceFrequency: { value: 7.83, unit: 'Hz', role: 'modulation' } }),
    );
    expect(issues.ok).toBe(false);
    expect(issues.issues.map((issue) => issue.code)).toContain('direct-tone-not-allowed');
    // And the same row is refused by the compiler rather than played.
    const compiled = presetToProtocol(
      fixture({ kind: 'direct' }, { sourceFrequency: { value: 7.83, unit: 'Hz', role: 'modulation' } }),
    );
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.failure.code).toBe('preset-invalid');
  });

  it('refuses a modulation rate presented as a pitch or as a carrier', () => {
    const asPitch = validatePreset(
      fixture(
        { kind: 'harmonic' },
        {
          sourceFrequency: { value: 7.83, unit: 'Hz', role: 'modulation' },
          safety: { headphonesRecommended: true, directToneAllowed: true, output: 'headphones' },
        },
      ),
    );
    expect(asPitch.issues.map((issue) => issue.code)).toContain('modulation-rate-as-pitch');

    const asCarrier = validatePreset(
      fixture(
        { kind: 'binaural', carrierHz: 40 },
        { sourceFrequency: { value: 40, unit: 'Hz', role: 'modulation' } },
      ),
    );
    expect(asCarrier.issues.map((issue) => issue.code)).toContain('modulation-rate-as-carrier');
  });

  it('requires a carrier a representation can actually ride on', () => {
    const inaudible = validatePreset(fixture({ kind: 'binaural', carrierHz: 4 }));
    expect(inaudible.ok).toBe(false);
    expect(inaudible.issues.map((issue) => issue.code)).toContain('carrier-not-audible');

    const missing = validatePreset(fixture({ kind: 'binaural' }));
    // A missing carrier is a stated default rather than a wrong sound, so it
    // warns and still compiles.
    expect(missing.ok).toBe(true);
    expect(missing.issues.map((issue) => issue.code)).toContain('carrier-missing');
    expect(presetToProtocol(fixture({ kind: 'binaural' })).ok).toBe(true);
  });

  it('catches a representation that contradicts itself', () => {
    const contradiction = validatePreset(
      fixture({ kind: 'binaural-centered', carrierHz: 220, calculationMode: 'offset' }),
    );
    expect(contradiction.ok).toBe(false);
    expect(contradiction.issues.map((issue) => issue.code)).toContain('calculation-mode-contradiction');

    expect(
      validatePreset(fixture({ kind: 'sweep', carrierHz: 220 })).issues.map((issue) => issue.code),
    ).toContain('sweep-without-target');

    expect(
      validatePreset(
        fixture(
          { kind: 'subharmonic', octaveShift: 1 },
          {
            sourceFrequency: { value: 528, unit: 'Hz', role: 'carrier' },
            safety: { headphonesRecommended: false, directToneAllowed: true, output: 'headphones' },
          },
        ),
      ).issues.map((issue) => issue.code),
    ).toContain('subharmonic-shift-not-negative');
  });

  it('passes every shipped preset', () => {
    for (const preset of FACTORY_PRESETS) {
      const validation = validatePreset(preset);
      const errors = validation.issues.filter((issue) => issue.severity === 'error');
      expect(errors.map((issue) => `${preset.id}: ${issue.message}`)).toEqual([]);
    }
  });
});
