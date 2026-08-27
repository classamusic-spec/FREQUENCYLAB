import { describe, expect, it } from 'vitest';
import {
  analyseExperiment,
  armCommitment,
  bootstrapDifferenceCi,
  buildPresets,
  buildStage,
  convertBinauralToMonaural,
  createProtocol,
  cohensD,
  createExperiment,
  deriveInsights,
  designProtocol,
  detectMedicalRequest,
  linearTrend,
  parseIntent,
  planNextSession,
  preflight,
  protocolFingerprint,
  recordSession,
  renderProtocolOffline,
  routeChangeAction,
  summarise,
  validateProtocol,
  usesBinaural,
  verifySchedule,
  welchTTest,
  type Experiment,
  type Session,
} from '../src/index.js';
import { peak } from './helpers.js';

const NOW = '2026-03-01T09:00:00.000Z';

function makeSession(
  id: string,
  overrides: Partial<Session> & { relaxation?: number } = {},
): Session {
  const { relaxation, ...rest } = overrides;
  return {
    id,
    protocolId: 'p',
    protocolName: 'P',
    protocolFingerprint: 'f',
    humanDna: 'B10-C220-PN12-T20',
    dspVersion: '1.0.0',
    startedAt: NOW,
    endedAt: NOW,
    plannedDurationSec: 1200,
    endReason: 'completed',
    metrics: {
      playedSec: 1200,
      adherence: 1,
      pauseCount: 0,
      peakGainReductionDb: 0,
      underruns: 0,
    },
    ratings: relaxation === undefined ? [] : [{ metric: 'relaxation', value: relaxation }],
    ...rest,
  };
}

describe('statistics', () => {
  it('summarises with a sample standard deviation', () => {
    const summary = summarise([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(summary.n).toBe(8);
    expect(summary.mean).toBeCloseTo(5, 9);
    expect(summary.sd).toBeCloseTo(2.13809, 4);
    expect(summary.median).toBeCloseTo(4.5, 9);
  });

  it('computes Welch t and a plausible p-value', () => {
    const a = [8.1, 8.4, 7.9, 8.6, 8.2, 8.0, 8.5];
    const b = [6.8, 7.1, 6.5, 7.0, 6.9, 7.2, 6.6];
    const result = welchTTest(a, b);
    expect(result.t).toBeGreaterThan(5);
    expect(result.p).toBeLessThan(0.001);

    const identical = welchTTest(a, [...a]);
    expect(identical.p).toBeCloseTo(1, 6);
  });

  it('agrees with a known t-distribution tail', () => {
    // Two samples with a tiny, noisy difference must not look significant.
    const a = [5, 6, 4, 7, 5, 6];
    const b = [5.2, 5.8, 4.4, 6.6, 5.1, 6.2];
    expect(welchTTest(a, b).p).toBeGreaterThan(0.5);
  });

  it('reports effect size', () => {
    // A two-point separation against a spread of about one point is a large effect.
    expect(cohensD([9.5, 10, 10.5, 10], [7.5, 8, 8.5, 8])).toBeGreaterThan(1.5);
    expect(cohensD([5, 6, 7], [5, 6, 7])).toBeCloseTo(0, 9);
    // Identical values in both arms leave no spread to scale by, so there is
    // no defined effect size to report rather than an infinite one.
    expect(cohensD([10, 10, 10], [8, 8, 8])).toBe(0);
  });

  it('produces a stable bootstrap interval', () => {
    const a = [8.1, 8.4, 7.9, 8.6, 8.2, 8.0];
    const b = [6.8, 7.1, 6.5, 7.0, 6.9, 7.2];
    const first = bootstrapDifferenceCi(a, b, 0.95, 2000, 'seed');
    const second = bootstrapDifferenceCi(a, b, 0.95, 2000, 'seed');
    expect(first).toEqual(second);
    expect(first.low).toBeGreaterThan(0);
    expect(first.high).toBeLessThan(2.5);
  });

  it('fits a linear trend', () => {
    const trend = linearTrend([0, 1, 2, 3, 4], [1, 3, 5, 7, 9]);
    expect(trend.slope).toBeCloseTo(2, 9);
    expect(trend.intercept).toBeCloseTo(1, 9);
    expect(trend.r2).toBeCloseTo(1, 9);
  });
});

describe('blinded experiments', () => {
  function experiment(): Experiment {
    return createExperiment({
      id: 'exp-1',
      name: 'Alpha vs Theta',
      protocolA: 'protocol-alpha',
      protocolB: 'protocol-theta',
      metrics: ['relaxation'],
      sessionsPerArm: 6,
      salt: 'fixed-salt',
      createdAt: NOW,
    });
  }

  it('balances the arms in blocks', () => {
    const experiment1 = experiment();
    expect(experiment1.assignments).toHaveLength(12);
    const arms = experiment1.assignments.map((assignment) => assignment.sealedArm);
    expect(arms.filter((arm) => arm === 'A')).toHaveLength(6);
    expect(arms.filter((arm) => arm === 'B')).toHaveLength(6);
    // Every consecutive pair is one of each — that is what a block guarantees.
    for (let i = 0; i < arms.length; i += 2) {
      expect(new Set([arms[i], arms[i + 1]]).size).toBe(2);
    }
  });

  it('includes a control arm when one is configured', () => {
    const withControl = createExperiment({
      id: 'exp-2',
      name: 'With control',
      protocolA: 'a',
      protocolB: 'b',
      protocolControl: 'c',
      metrics: ['relaxation'],
      sessionsPerArm: 4,
      salt: 's',
      createdAt: NOW,
    });
    expect(withControl.assignments).toHaveLength(12);
    expect(withControl.assignments.filter((a) => a.sealedArm === 'control')).toHaveLength(4);
  });

  it('is deterministic for a given id and salt', () => {
    expect(experiment().assignments.map((a) => a.sealedArm)).toEqual(
      experiment().assignments.map((a) => a.sealedArm),
    );
  });

  it('commits to every assignment so it cannot be rewritten later', () => {
    const original = experiment();
    expect(verifySchedule(original)).toBe(true);

    const tampered: Experiment = {
      ...original,
      assignments: original.assignments.map((assignment, index) =>
        index === 0 ? { ...assignment, sealedArm: assignment.sealedArm === 'A' ? 'B' : 'A' } : assignment,
      ),
    };
    expect(verifySchedule(tampered)).toBe(false);
  });

  it('produces the same commitment for the same inputs', () => {
    expect(armCommitment('exp-1', 0, 'A', 'fixed-salt')).toBe(
      armCommitment('exp-1', 0, 'A', 'fixed-salt'),
    );
    expect(armCommitment('exp-1', 0, 'A', 'fixed-salt')).not.toBe(
      armCommitment('exp-1', 0, 'B', 'fixed-salt'),
    );
  });

  it('withholds the arm from the session plan while blinded', () => {
    const blind = experiment();
    const plan = planNextSession(blind);
    expect(plan).toBeDefined();
    expect(plan!.arm).toBeUndefined();
    expect(plan!.label).toBe('Session 1 of 12');
    expect(['protocol-alpha', 'protocol-theta']).toContain(plan!.protocolId);

    const revealed: Experiment = { ...blind, revealedAt: NOW };
    expect(planNextSession(revealed)!.arm).toBeDefined();
  });

  it('refuses to draw conclusions from too few sessions', () => {
    let running = experiment();
    const sessions: Session[] = [];
    for (let i = 0; i < 4; i++) {
      const assignment = running.assignments[i];
      const session = makeSession(`s${i}`, { relaxation: assignment.sealedArm === 'A' ? 9 : 5 });
      sessions.push(session);
      running = recordSession(running, assignment.index, session.id, NOW);
    }
    const results = analyseExperiment(running, sessions);
    expect(results.completedSessions).toBe(4);
    expect(results.comparisons[0].p).toBe(1);
    expect(results.comparisons[0].interpretation).toContain('first impression');
    expect(results.comparisons[0].caveats.join(' ')).toContain('Fewer than');
  });

  it('reports a real difference once there are enough sessions', () => {
    let running = experiment();
    const sessions: Session[] = [];
    const scoresA = [8.4, 8.1, 8.6, 8.0, 8.3, 8.5];
    const scoresB = [6.6, 7.0, 6.4, 6.9, 6.7, 7.1];
    let usedA = 0;
    let usedB = 0;
    for (const assignment of running.assignments) {
      const value = assignment.sealedArm === 'A' ? scoresA[usedA++] : scoresB[usedB++];
      const session = makeSession(`s-${assignment.index}`, { relaxation: value });
      sessions.push(session);
      running = recordSession(running, assignment.index, session.id, NOW);
    }
    const results = analyseExperiment(running, sessions);
    const comparison = results.comparisons[0];
    expect(results.scheduleVerified).toBe(true);
    expect(comparison.difference).toBeGreaterThan(1);
    expect(comparison.p).toBeLessThan(0.01);
    expect(comparison.confidenceInterval.low).toBeGreaterThan(0);
    expect(comparison.interpretation).toContain('not a medical finding');
    expect(comparison.arms.find((arm) => arm.arm === 'A')!.summary.n).toBe(6);
  });

  it('flags a time-of-day confound', () => {
    let running = experiment();
    const sessions: Session[] = [];
    for (const assignment of running.assignments) {
      const hour = assignment.sealedArm === 'A' ? '08' : '21';
      const session = makeSession(`s-${assignment.index}`, {
        relaxation: assignment.sealedArm === 'A' ? 8 : 7,
        startedAt: `2026-03-01T${hour}:00:00.000Z`,
      });
      sessions.push(session);
      running = recordSession(running, assignment.index, session.id, NOW);
    }
    const caveats = analyseExperiment(running, sessions).comparisons[0].caveats.join(' ');
    expect(caveats.toLowerCase()).toContain('time of day');
  });
});

describe('personal insights', () => {
  it('returns nothing at all from a thin history', () => {
    const sessions = Array.from({ length: 5 }, (_, i) => makeSession(`s${i}`, { relaxation: 8 }));
    expect(deriveInsights(sessions)).toEqual([]);
  });

  it('finds the band associated with the highest ratings', () => {
    const sessions: Session[] = [];
    for (let i = 0; i < 6; i++) {
      sessions.push(
        makeSession(`theta-${i}`, { relaxation: 8.2 + (i % 2) * 0.2, humanDna: 'B6-C200-PN12-T25' }),
      );
      sessions.push(
        makeSession(`beta-${i}`, { relaxation: 5.8 + (i % 2) * 0.2, humanDna: 'B18-C240-PN12-T25' }),
      );
    }
    const insights = deriveInsights(sessions);
    const band = insights.find((insight) => insight.id.startsWith('band-'));
    expect(band).toBeDefined();
    expect(band!.title).toContain('4–8 Hz');
    expect(band!.body).toContain('associated with');
    expect(band!.body).not.toMatch(/\b(causes?|treats?|heals?|cures?|fixes)\b/i);
  });

  it('never uses causal language anywhere', () => {
    const sessions: Session[] = [];
    for (let i = 0; i < 12; i++) {
      sessions.push(
        makeSession(`long-${i}`, {
          relaxation: 8.5,
          humanDna: 'B6-C200-PN12-T35',
          metrics: {
            playedSec: 2100,
            adherence: 1,
            pauseCount: 0,
            peakGainReductionDb: 0,
            underruns: 0,
          },
        }),
      );
      sessions.push(
        makeSession(`short-${i}`, {
          relaxation: 6.5,
          humanDna: 'B10-C220-T15',
          metrics: {
            playedSec: 900,
            adherence: 1,
            pauseCount: 0,
            peakGainReductionDb: 0,
            underruns: 0,
          },
        }),
      );
    }
    const bodies = deriveInsights(sessions).map((insight) => insight.body).join(' ');
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies).not.toMatch(/\b(causes?|caused|treats?|heals?|cures?|fixes|prevents?)\b/i);
  });

  it('reads the beat and noise back out of a session DNA', () => {
    const sessions: Session[] = [];
    for (let i = 0; i < 6; i++) {
      sessions.push(makeSession(`n-${i}`, { relaxation: 8.4, humanDna: 'B8-C220-PN15-T25' }));
      sessions.push(makeSession(`q-${i}`, { relaxation: 6.4, humanDna: 'B8-C220-T25' }));
    }
    const noise = deriveInsights(sessions).find((insight) => insight.id.startsWith('noise-'));
    expect(noise).toBeDefined();
    expect(noise!.effect).toBeGreaterThan(1);
  });
});

describe('AI protocol designer', () => {
  it('builds a real protocol from a plain request', async () => {
    const result = designProtocol({
      prompt: 'I have 25 minutes. I want to relax but remain awake.',
      now: NOW,
      id: 'ai-1',
    });
    expect(result.status).toBe('proposed');
    expect(result.protocol).toBeDefined();
    expect(result.understood.durationSec).toBe(25 * 60);
    expect(result.understood.stayAwake).toBe(true);
    expect(validateProtocol(result.protocol!).ok).toBe(true);
    expect(result.rationale.length).toBeGreaterThan(2);
    // The protocol it proposes must actually render.
    const audio = renderProtocolOffline(result.protocol!, { sampleRate: 48000, startSec: 60, maxSeconds: 1 });
    expect(peak(audio.left)).toBeGreaterThan(0.05);
  });

  it('parses the advanced example from the brief', () => {
    const intent = parseIntent(
      'Create a 45-minute alpha-to-theta protocol with a 220-Hz carrier and introduce 40-Hz amplitude modulation between minutes 20 and 30.',
    );
    expect(intent.durationSec).toBe(45 * 60);
    expect(intent.bandFrom).toBe('alpha');
    expect(intent.bandTo).toBe('theta');
    expect(intent.carrierHz).toBe(220);
    expect(intent.amRateHz).toBe(40);
    expect(intent.amFromMinute).toBe(20);
    expect(intent.amToMinute).toBe(30);
  });

  it('turns that example into stages with a real AM automation lane', () => {
    const result = designProtocol({
      prompt:
        'Create a 45-minute alpha-to-theta protocol with a 220-Hz carrier and introduce 40-Hz amplitude modulation between minutes 20 and 30.',
      now: NOW,
      id: 'ai-2',
    });
    expect(result.status).toBe('proposed');
    const protocol = result.protocol!;
    expect(protocol.stages).toHaveLength(3);
    expect(protocol.stages[0].durationSec).toBe(20 * 60);
    expect(protocol.stages[1].durationSec).toBe(10 * 60);
    expect(protocol.stages[2].durationSec).toBe(15 * 60);

    const modulated = protocol.stages[1];
    expect(modulated.graph.nodes.some((node) => node.kind === 'am')).toBe(true);
    const lane = modulated.automation.find((entry) => entry.target === 'am:depth');
    expect(lane).toBeDefined();
    expect(lane!.points[0].value).toBe(0);
    expect(lane!.points[lane!.points.length - 1].value).toBe(0);

    const tone = protocol.stages[0].graph.nodes.find((node) => node.id === 'tone');
    expect(tone?.params.carrier).toBe(220);
    expect(validateProtocol(protocol).ok).toBe(true);
  });

  it('declines a medical request and says why, while still offering a session', () => {
    const result = designProtocol({
      prompt: 'Give me a protocol to cure my cancer',
      now: NOW,
      id: 'ai-3',
    });
    expect(result.declinedReason).toBeDefined();
    expect(result.declinedReason).toContain('not an established treatment');
    expect(result.declinedReason).toContain('does not diagnose, treat, cure or prevent');
    expect(result.protocol?.name).toBe('General Relaxation');
    expect(result.status).toBe('proposed');
  });

  it('recognises the medical framings it must not build for', () => {
    for (const prompt of [
      'kill the virus with frequencies',
      'treat my depression',
      'a protocol to replace my medication',
      'frequency therapy for arthritis',
    ]) {
      expect(detectMedicalRequest(prompt), prompt).toBeDefined();
    }
    expect(detectMedicalRequest('help me relax after work')).toBeUndefined();
  });

  it('honours an explicit engine choice for speaker playback', () => {
    const result = designProtocol({
      prompt: 'A 20 minute focus session without headphones',
      now: NOW,
      id: 'ai-4',
    });
    expect(result.understood.engine).toBe('isochronic');
    expect(result.protocol!.stages[0].graph.nodes.some((node) => node.kind === 'isochronic')).toBe(true);
  });
});

describe('shipped presets', () => {
  const presets = buildPresets();

  it('are all valid and reproducible', () => {
    expect(presets).toHaveLength(8);
    for (const preset of presets) {
      const validation = validateProtocol(preset);
      const errors = validation.issues.filter((issue) => issue.severity === 'error');
      expect(errors, `${preset.name}: ${errors.map((e) => e.message).join('; ')}`).toEqual([]);
      expect(protocolFingerprint(preset)).toHaveLength(64);
    }
  });

  it('are not named after conditions', () => {
    const forbidden = /\b(cure|treat|heal|anxiety|depression|insomnia|adhd|pain|cancer)\b/i;
    for (const preset of presets) {
      expect(forbidden.test(preset.name), preset.name).toBe(false);
    }
  });

  it('all render audibly and within the ceiling', () => {
    for (const preset of presets) {
      const audio = renderProtocolOffline(preset, { sampleRate: 48000, startSec: 30, maxSeconds: 1 });
      expect(peak(audio.left), preset.name).toBeGreaterThan(0.02);
      expect(peak(audio.left), preset.name).toBeLessThanOrEqual(0.8914);
    }
  });
});

describe('safety preflight', () => {
  const [calm] = buildPresets();

  it('warns when binaural playback is heading for a speaker', () => {
    const checks = preflight({
      protocol: calm,
      route: { kind: 'speaker', reliable: true },
      usesBinaural: true,
      comfortableOutputLevel: 0.5,
      firstSession: false,
    });
    const headphones = checks.find((check) => check.id === 'headphones-required');
    expect(headphones).toBeDefined();
    expect(headphones!.level).toBe('warning');
    expect(headphones!.message).toContain('independent left and right channels');
  });

  it('does not warn about headphones for an isochronic protocol', () => {
    const checks = preflight({
      protocol: calm,
      route: { kind: 'speaker', reliable: true },
      usesBinaural: false,
      comfortableOutputLevel: 0.5,
      firstSession: false,
    });
    expect(checks.find((check) => check.id === 'headphones-required')).toBeUndefined();
  });

  it('shows the awareness and non-medical notice on a first session', () => {
    const checks = preflight({
      protocol: calm,
      route: { kind: 'headphones', reliable: true },
      usesBinaural: true,
      comfortableOutputLevel: 0.5,
      firstSession: true,
    });
    const first = checks.find((check) => check.id === 'first-session');
    expect(first!.message).toContain('driving');
    expect(first!.message).toContain('not a substitute for medical care');
  });

  it('pauses rather than switching to the speaker when headphones disconnect', () => {
    const result = routeChangeAction(
      { kind: 'headphones', reliable: true },
      { kind: 'speaker', reliable: true },
      true,
    );
    expect(result.action).toBe('pauseAndNotify');
    expect(result.message).toContain('paused');
  });

  it('keeps playing when a better route appears', () => {
    expect(
      routeChangeAction({ kind: 'speaker', reliable: true }, { kind: 'headphones', reliable: true }, true)
        .action,
    ).toBe('continue');
  });
});

describe('monaural fallback', () => {
  it('converts every binaural engine and leaves a valid protocol', () => {
    const [calm] = buildPresets();
    expect(usesBinaural(calm)).toBe(true);

    const converted = convertBinauralToMonaural(calm);
    expect(usesBinaural(converted)).toBe(false);
    expect(validateProtocol(converted).ok).toBe(true);

    const before = calm.stages[0].graph.nodes.find((node) => node.id === 'tone');
    const after = converted.stages[0].graph.nodes.find((node) => node.id === 'tone');
    expect(after?.kind).toBe('monaural');
    expect(after?.params.carrier).toBe(before?.params.carrier);
    expect(after?.params.beat).toBe(before?.params.beat);
  });

  it('produces an identical, audible signal in both channels after conversion', () => {
    // A noise-free protocol, so the assertion is about the engine rather than
    // about a decorrelated noise bed sitting on top of it.
    const binaural = createProtocol({
      id: 'convert-test',
      name: 'Convert Test',
      stages: [
        buildStage({
          id: 'stage-1',
          name: 'Tone',
          durationSec: 120,
          engine: 'binaural',
          carrierHz: 200,
          beatHz: 10,
          amplitude: 0.4,
          crossfadeSec: 0,
        }),
      ],
      master: { fadeInSec: 1, fadeOutSec: 1, gain: 0.8 },
      createdAt: NOW,
    });

    const before = renderProtocolOffline(binaural, { sampleRate: 48000, startSec: 30, maxSeconds: 1 });
    let differs = 0;
    for (let i = 0; i < 4096; i++) {
      if (Math.abs(before.left[i] - before.right[i]) > 1e-4) differs++;
    }
    expect(differs).toBeGreaterThan(3000);

    const converted = convertBinauralToMonaural(binaural);
    expect(usesBinaural(converted)).toBe(false);
    const after = renderProtocolOffline(converted, { sampleRate: 48000, startSec: 30, maxSeconds: 1 });
    expect(peak(after.left)).toBeGreaterThan(0.05);
    // Monaural sums both tones before the output, so the channels are identical
    // and the beat survives on a single speaker.
    for (let i = 100; i < 400; i++) expect(after.left[i]).toBeCloseTo(after.right[i], 5);
  });

  it('leaves a protocol without a binaural engine untouched', () => {
    const [, , , , , , gamma] = buildPresets();
    expect(usesBinaural(gamma)).toBe(false);
    expect(convertBinauralToMonaural(gamma)).toBe(gamma);
  });
});
