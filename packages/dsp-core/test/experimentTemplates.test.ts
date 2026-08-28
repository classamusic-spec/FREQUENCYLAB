import { describe, expect, it } from 'vitest';

import { archiveEntry } from '../src/archive/entries.js';
import {
  FACTORY_EXPERIMENT_TEMPLATES,
  compareConditions,
  experimentTemplate,
  instantiateTemplate,
  templateEvidenceIds,
  templateIssues,
  type ExperimentTemplate,
} from '../src/analysis/experimentTemplates.js';
import { analyseExperiment, planNextSession, recordSession, verifySchedule } from '../src/analysis/experiments.js';
import { binauralFrequencies } from '../src/graph/nodes/generators.js';
import type { GraphNode } from '../src/graph/types.js';
import { libraryEntry } from '../src/library/entries.js';
import { centsBetween, noteToFrequency } from '../src/music/theory.js';
import { TONE_NODE } from '../src/protocol/builders.js';
import { protocolFingerprint } from '../src/protocol/dna.js';
import type { Protocol } from '../src/protocol/schema.js';
import { validateProtocol } from '../src/protocol/validate.js';
import type { Session } from '../src/domain/models.js';

/**
 * Factory experiment templates.
 *
 * A template's whole claim is that its two arms differ in one respect and are
 * equal in every other. That claim is worth nothing if it is checked against
 * the template's own prose, so the assertions here go to the compiled
 * protocols: node parameters, options, connections, automation, stage lengths
 * and master settings, compared key by key. A comparison that quietly acquired
 * a second difference — a noise level edited in one arm, a duration changed in
 * the other — would still play, still record ratings and still print a p-value,
 * and nothing on the results screen would say the number was answering a
 * different question. This file is the only place that failure is visible.
 */

const NOW = '2026-03-01T09:00:00.000Z';

/** A2 at 440 against A2 at 432: the interval the tuning argument is about. */
const TUNING_CENTS = -31.766653633429282;

function arm(template: ExperimentTemplate, which: 'A' | 'B'): Protocol {
  const found = template.arms.find((entry) => entry.arm === which);
  expect(found, `${template.id} has no ${which} arm`).toBeDefined();
  return found!.protocol;
}

function toneNode(protocol: Protocol, stageIndex = 0): GraphNode {
  const node = protocol.stages[stageIndex].graph.nodes.find((entry) => entry.id === TONE_NODE);
  expect(node, `stage ${stageIndex} has no tone module`).toBeDefined();
  return node!;
}

/**
 * Every stored value of a protocol that could change what is rendered, flattened.
 *
 * Deliberately independent of the module under test: it reads the graph
 * directly, keys node values by kind as well as id, and knows nothing about the
 * acoustic vocabulary `conditionParameters` reports in. Two arms agreeing here
 * agree on the actual configuration, not on a description of it.
 */
function rawParameters(protocol: Protocol): Map<string, string | number | boolean> {
  const map = new Map<string, string | number | boolean>();
  map.set('sampleRate', protocol.sampleRate);
  map.set('stages', protocol.stages.length);
  for (const [key, value] of Object.entries(protocol.master)) map.set(`master.${key}`, value);

  protocol.stages.forEach((stage, index) => {
    map.set(`s${index}.durationSec`, stage.durationSec);
    map.set(`s${index}.crossfadeSec`, stage.crossfadeSec);
    for (const node of stage.graph.nodes) {
      const prefix = `s${index}.${node.id}.${node.kind}`;
      for (const [key, value] of Object.entries(node.params)) map.set(`${prefix}.${key}`, value);
      for (const [key, value] of Object.entries(node.options)) map.set(`${prefix}.${key}`, value);
    }
    for (const connection of stage.graph.connections) {
      map.set(`s${index}.wire.${connection.from}->${connection.to}`, true);
    }
    for (const lane of stage.automation) {
      map.set(`s${index}.lane.${lane.target}`, JSON.stringify(lane.points));
    }
  });
  return map;
}

function rawDifferences(a: Protocol, b: Protocol): string[] {
  const left = rawParameters(a);
  const right = rawParameters(b);
  return [...new Set([...left.keys(), ...right.keys()])]
    .filter((key) => left.get(key) !== right.get(key))
    .sort();
}

/** Left and right ear frequencies, whichever engine produced them. */
function channels(node: GraphNode): { left: number; right: number } {
  if (node.kind === 'binaural') {
    return binauralFrequencies(node.params.carrier, node.params.beat, node.options.mode);
  }
  const hz = node.params.frequency ?? node.params.fundamental ?? node.params.carrier;
  return { left: hz, right: hz };
}

describe('the shipped templates', () => {
  it('declares two arms and a matching pair of protocols for each', () => {
    expect(FACTORY_EXPERIMENT_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    const ids = FACTORY_EXPERIMENT_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const template of FACTORY_EXPERIMENT_TEMPLATES) {
      expect(template.arms.map((entry) => entry.arm), template.id).toEqual(['A', 'B']);
      const protocolIds = template.arms.map((entry) => entry.protocol.id);
      expect(new Set(protocolIds).size, template.id).toBe(2);
      for (const entry of template.arms) {
        expect(validateProtocol(entry.protocol).ok, entry.protocol.id).toBe(true);
      }
      // Two arms that hash the same are one arm played twice.
      expect(protocolFingerprint(arm(template, 'A')), template.id).not.toBe(
        protocolFingerprint(arm(template, 'B')),
      );
    }
  });

  it('agrees with its own protocols about what is held constant and what varies', () => {
    for (const template of FACTORY_EXPERIMENT_TEMPLATES) {
      expect(templateIssues(template), template.id).toEqual([]);
    }
  });

  it('declares exactly the dimensions that actually differ', () => {
    for (const template of FACTORY_EXPERIMENT_TEMPLATES) {
      const different = compareConditions(arm(template, 'A'), arm(template, 'B')).different;
      const declared = template.varies.flatMap((entry) => entry.keys);
      expect(new Set(different), template.id).toEqual(new Set(declared));
    }
  });

  it('links only evidence records that resolve', () => {
    const ids = templateEvidenceIds();
    expect(ids.library.length).toBeGreaterThan(0);
    expect(ids.archive.length).toBeGreaterThan(0);
    for (const id of ids.library) expect(libraryEntry(id), `library/${id}`).toBeDefined();
    for (const id of ids.archive) expect(archiveEntry(id), `archive/${id}`).toBeDefined();
  });

  it('states the limits of every design', () => {
    for (const template of FACTORY_EXPERIMENT_TEMPLATES) {
      expect(template.caveats.length, template.id).toBeGreaterThan(1);
      for (const caveat of template.caveats) expect(caveat.length, template.id).toBeGreaterThan(40);
      expect(template.question.endsWith('?'), template.id).toBe(true);
    }
  });

  it('keeps disease and treatment language out of every surface a user reads', () => {
    const forbidden = [
      'cure',
      'cancer',
      'alzheimer',
      'parasite',
      'tumour',
      'tumor',
      'disease',
      'therapy',
      'treatment',
      'heals',
      'healing',
      'dna repair',
    ];
    for (const template of FACTORY_EXPERIMENT_TEMPLATES) {
      const surfaces = [
        template.name,
        template.question,
        template.summary,
        ...template.caveats,
        ...template.arms.map((entry) => entry.condition),
        ...template.arms.map((entry) => entry.protocol.name),
        ...template.arms.map((entry) => entry.protocol.description ?? ''),
        ...template.heldConstant.flatMap((entry) => [entry.label, entry.value]),
        ...template.varies.flatMap((entry) => [entry.label, entry.difference ?? '']),
      ].map((text) => text.toLowerCase());
      for (const surface of surfaces) {
        for (const word of forbidden) {
          expect(surface.includes(word), `${template.id}: "${surface}"`).toBe(false);
        }
      }
    }
  });

  it('never names the varying condition in a protocol a blinded session would load', () => {
    // A blind experiment that loads a protocol called "A432" has already told
    // the listener which arm they are in, and no amount of sealed assignment
    // gets that back.
    const leaks = ['432', '440', '528', '6 hz', '10 hz', 'theta', 'alpha', 'control'];
    for (const template of FACTORY_EXPERIMENT_TEMPLATES) {
      for (const entry of template.arms) {
        const text = `${entry.protocol.name} ${entry.protocol.description ?? ''}`.toLowerCase();
        for (const leak of leaks) {
          expect(text.includes(leak), `${entry.protocol.id}: "${text}"`).toBe(false);
        }
        for (const stage of entry.protocol.stages) {
          expect(stage.notes, `${entry.protocol.id}/${stage.id}`).toBeUndefined();
        }
      }
    }
  });
});

describe('tuning reference — A440 against A432', () => {
  const template = experimentTemplate('tuning-reference')!;
  const a = arm(template, 'A');
  const b = arm(template, 'B');

  it('plays the same five-note figure in both arms', () => {
    expect(a.stages).toHaveLength(5);
    expect(b.stages).toHaveLength(5);
    expect(a.stages.map((stage) => stage.name)).toEqual(['A2', 'E3', 'C3', 'D3', 'A2']);
    expect(b.stages.map((stage) => stage.name)).toEqual(a.stages.map((stage) => stage.name));
    expect(a.stages.map((stage) => stage.durationSec)).toEqual([240, 240, 240, 240, 240]);
    expect(a.stages.map((stage) => stage.crossfadeSec)).toEqual([0, 12, 12, 12, 12]);
  });

  it('differs by exactly −31.77 cents on every note and nowhere else', () => {
    const differences = rawDifferences(a, b);
    expect(differences).toEqual([
      's0.tone.harmonic.fundamental',
      's1.tone.harmonic.fundamental',
      's2.tone.harmonic.fundamental',
      's3.tone.harmonic.fundamental',
      's4.tone.harmonic.fundamental',
    ]);

    a.stages.forEach((_, index) => {
      const from = toneNode(a, index).params.fundamental;
      const to = toneNode(b, index).params.fundamental;
      expect(centsBetween(from, to), `note ${index}`).toBeCloseTo(TUNING_CENTS, 9);
    });
  });

  it('derives both arms from the tuning reference rather than from a table', () => {
    const notes = ['A2', 'E3', 'C3', 'D3', 'A2'];
    notes.forEach((note, index) => {
      expect(toneNode(a, index).params.fundamental).toBe(noteToFrequency(note, { referenceHz: 440 }));
      expect(toneNode(b, index).params.fundamental).toBe(noteToFrequency(note, { referenceHz: 432 }));
    });
    // The exact case, so the arithmetic is visible: A2 is the reference two
    // octaves down, in either tuning.
    expect(toneNode(a, 0).params.fundamental).toBe(110);
    expect(toneNode(b, 0).params.fundamental).toBe(108);
  });

  it('keeps the spectrum, the level and the bed identical', () => {
    a.stages.forEach((_, index) => {
      const left = toneNode(a, index);
      const right = toneNode(b, index);
      for (let partial = 1; partial <= 8; partial++) {
        expect(left.params[`h${partial}`], `h${partial}`).toBe(right.params[`h${partial}`]);
      }
      expect(left.params.amplitude).toBe(0.3);
      expect(right.params.amplitude).toBe(0.3);

      const bedA = a.stages[index].graph.nodes.find((node) => node.kind === 'noise')!;
      const bedB = b.stages[index].graph.nodes.find((node) => node.kind === 'noise')!;
      expect(bedA.params).toEqual(bedB.params);
      expect(bedA.options).toEqual(bedB.options);
      expect(bedA.params.level).toBe(0.06);
      expect(bedA.options.color).toBe('pink');
    });
    expect(a.master).toEqual(b.master);
  });

  it('says plainly that a monophonic figure is not a piece of music', () => {
    const caveats = template.caveats.join(' ').toLowerCase();
    expect(caveats).toContain('not a piece of music');
    expect(caveats).toContain('no harmony');
  });
});

describe('528 Hz and 432 Hz — a personal response comparison', () => {
  const template = experimentTemplate('personal-response-528-432')!;
  const a = arm(template, 'A');
  const b = arm(template, 'B');

  it('is named and framed as a preference, never as an outcome', () => {
    expect(template.question.toLowerCase()).toContain('prefer');
    expect(template.summary.toLowerCase()).toContain('personal response');
    expect(template.caveats.join(' ').toLowerCase()).toContain('a preference is a preference');
  });

  it('differs in the tone and in nothing else', () => {
    expect(rawDifferences(a, b)).toEqual(['s0.tone.oscillator.frequency']);
    expect(toneNode(a).params.frequency).toBe(528);
    expect(toneNode(b).params.frequency).toBe(432);
    expect(toneNode(a).params.amplitude).toBe(toneNode(b).params.amplitude);
    expect(toneNode(a).options.waveform).toBe('sine');
  });

  it('matches the two conditions acoustically everywhere else', () => {
    expect(a.stages[0].durationSec).toBe(15 * 60);
    expect(a.stages[0].durationSec).toBe(b.stages[0].durationSec);
    expect(a.master).toEqual(b.master);
    const bedA = a.stages[0].graph.nodes.find((node) => node.kind === 'noise')!;
    const bedB = b.stages[0].graph.nodes.find((node) => node.kind === 'noise')!;
    expect(bedA.params).toEqual(bedB.params);
    expect(bedA.options).toEqual(bedB.options);
    // Neither arm may carry a beat: a beat in one of them would be a second
    // difference wearing the first one's name.
    expect(a.stages[0].graph.nodes.some((node) => node.kind === 'binaural')).toBe(false);
    expect(b.stages[0].graph.nodes.some((node) => node.kind === 'binaural')).toBe(false);
  });

  it('admits that equal amplitude is not equal loudness', () => {
    expect(template.caveats.join(' ').toLowerCase()).toContain('equal loudness');
  });
});

describe('a binaural beat against a matched control', () => {
  const template = experimentTemplate('control-condition')!;
  const a = arm(template, 'A');
  const b = arm(template, 'B');

  it('puts 220/226 against a genuine 220/220', () => {
    expect(channels(toneNode(a))).toEqual({ left: 220, right: 226 });
    expect(channels(toneNode(b))).toEqual({ left: 220, right: 220 });
    expect(toneNode(a).params.beat).toBe(6);
    expect(toneNode(a).params.separation).toBe(1);
    // The control is a single tone rather than a binaural pair at zero beat,
    // because the beat parameter floor is 0.1 Hz. At full separation the two
    // are the same signal, and a 0.1 Hz "beat" would not be a control.
    expect(toneNode(b).kind).toBe('oscillator');
    expect(toneNode(b).params.frequency).toBe(220);
  });

  it('changes nothing outside the tone module', () => {
    for (const key of rawDifferences(a, b)) {
      expect(key.startsWith('s0.tone.'), key).toBe(true);
    }
    expect(a.master).toEqual(b.master);
    expect(a.stages[0].durationSec).toBe(20 * 60);
    expect(b.stages[0].durationSec).toBe(20 * 60);
    expect(a.stages).toHaveLength(1);
    expect(b.stages).toHaveLength(1);
  });

  it('holds the level, the waveform and the ambient layer equal', () => {
    expect(toneNode(a).params.amplitude).toBe(0.32);
    expect(toneNode(b).params.amplitude).toBe(0.32);
    expect(toneNode(a).options.waveform).toBe(toneNode(b).options.waveform);
    const bedA = a.stages[0].graph.nodes.find((node) => node.kind === 'noise')!;
    const bedB = b.stages[0].graph.nodes.find((node) => node.kind === 'noise')!;
    expect(bedA.params).toEqual(bedB.params);
    expect(bedA.options).toEqual(bedB.options);
    expect(bedA.params.level).toBe(0.08);
  });
});

describe('theta 6 Hz against alpha 10 Hz', () => {
  const template = experimentTemplate('beat-rate-theta-alpha')!;
  const a = arm(template, 'A');
  const b = arm(template, 'B');

  it('moves the beat rate and nothing else', () => {
    expect(rawDifferences(a, b)).toEqual(['s0.tone.binaural.beat']);
    expect(toneNode(a).params.beat).toBe(6);
    expect(toneNode(b).params.beat).toBe(10);
    expect(channels(toneNode(a))).toEqual({ left: 220, right: 226 });
    expect(channels(toneNode(b))).toEqual({ left: 220, right: 230 });
    expect(toneNode(a).params.carrier).toBe(toneNode(b).params.carrier);
    expect(toneNode(a).params.amplitude).toBe(toneNode(b).params.amplitude);
  });

  it('does not claim a band name is a state', () => {
    const caveats = template.caveats.join(' ').toLowerCase();
    expect(caveats).toContain('not switches');
    expect(caveats).toContain('does not put you in a theta state');
  });
});

describe('instantiating a template', () => {
  const template = experimentTemplate('control-condition')!;

  function instance(salt = 'fixed-salt') {
    return instantiateTemplate(template, { id: 'exp-control', salt, createdAt: NOW });
  }

  it('produces a blinded, verifiable schedule naming the arm protocols', () => {
    const { experiment, protocols } = instance();
    expect(experiment.blinded).toBe(true);
    expect(experiment.assignments).toHaveLength(template.sessionsPerArm * 2);
    expect(verifySchedule(experiment)).toBe(true);
    expect(experiment.protocolA).toBe(arm(template, 'A').id);
    expect(experiment.protocolB).toBe(arm(template, 'B').id);
    expect(experiment.protocolControl).toBeUndefined();
    expect(protocols.map((protocol) => protocol.id)).toEqual([
      arm(template, 'A').id,
      arm(template, 'B').id,
    ]);

    const plan = planNextSession(experiment)!;
    expect(plan.arm).toBeUndefined();
    expect([experiment.protocolA, experiment.protocolB]).toContain(plan.protocolId);
  });

  it('is deterministic for a salt and different across salts', () => {
    const sealed = (salt: string) =>
      instance(salt).experiment.assignments.map((assignment) => assignment.sealedArm).join('');
    expect(sealed('fixed-salt')).toBe(sealed('fixed-salt'));
    expect(sealed('fixed-salt')).not.toBe(sealed('another-salt'));
  });

  it('runs through the engine and comes back with a real comparison', () => {
    let running = instance().experiment;
    const sessions: Session[] = [];
    // Overlapping ratings, the shape a real run of a null comparison has.
    const scoresA = [7.6, 6.9, 8.1, 7.2, 7.8, 7.0];
    const scoresB = [7.4, 7.9, 6.8, 7.5, 7.1, 7.6];
    let usedA = 0;
    let usedB = 0;
    for (const assignment of running.assignments) {
      const beat = assignment.sealedArm === 'A';
      const session: Session = {
        id: `s-${assignment.index}`,
        protocolId: beat ? running.protocolA : running.protocolB,
        protocolName: 'Beat Comparison',
        protocolFingerprint: 'x',
        humanDna: 'B6-C220-PN8-T20',
        dspVersion: '1.0.0',
        startedAt: NOW,
        endedAt: NOW,
        plannedDurationSec: 1200,
        endReason: 'completed',
        metrics: { playedSec: 1200, adherence: 1, pauseCount: 0, peakGainReductionDb: 0, underruns: 0 },
        ratings: [{ metric: 'relaxation', value: beat ? scoresA[usedA++] : scoresB[usedB++] }],
      };
      sessions.push(session);
      running = recordSession(running, assignment.index, session.id, NOW);
    }

    const results = analyseExperiment(running, sessions);
    expect(results.scheduleVerified).toBe(true);
    expect(results.completedSessions).toBe(12);
    const comparison = results.comparisons[0];
    expect(comparison.arms.find((entry) => entry.arm === 'A')!.summary.n).toBe(6);
    expect(comparison.arms.find((entry) => entry.arm === 'B')!.summary.n).toBe(6);
    // The two arms overlap completely, and the engine says so rather than
    // reporting a winner off a fifth of a point.
    expect(comparison.interpretation).toContain('not yet a reliable separation');
  });
});
