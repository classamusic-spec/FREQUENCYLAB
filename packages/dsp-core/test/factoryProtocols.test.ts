import { describe, expect, it } from 'vitest';

import {
  FACTORY_PROTOCOL_IDS,
  buildAllFactoryProtocols,
  buildFactoryProtocols,
} from '../src/protocol/factoryProtocols.js';
import { NOISE_NODE, TONE_NODE, renameProtocol } from '../src/protocol/builders.js';
import { protocolDna, protocolFingerprint } from '../src/protocol/dna.js';
import { PRESET_IDS } from '../src/protocol/presets.js';
import { totalDurationSec, type Protocol, type ProtocolStage } from '../src/protocol/schema.js';
import { validateProtocol } from '../src/protocol/validate.js';

/**
 * The three multi-stage factory protocols.
 *
 * Two things are being protected here. The first is the audio: a shipped
 * protocol's DNA is what a session record points at, so a stage length or a
 * noise level edited in place would silently rewrite what a listening history
 * says was played. The second is the cross-fade: stage boundaries only glide
 * because the incoming graph adopts the outgoing one's oscillator phases,
 * matched by node id and kind, and a stage built any other way steps instead —
 * the defect measured at up to -19.37 dB across a fade before phase adoption
 * existed. Both are invisible from the outside, so both are asserted.
 */

function protocolById(id: string): Protocol {
  const found = buildFactoryProtocols().find((protocol) => protocol.id === id);
  expect(found, id).toBeDefined();
  return found!;
}

/** The beat sweep on a stage as `[from, to]`, or `null` for a steady stage. */
function beatSweep(stage: ProtocolStage): [number, number] | null {
  const lane = stage.automation.find((entry) => entry.target === `${TONE_NODE}:beat`);
  if (!lane) return null;
  expect(lane.enabled, stage.id).toBe(true);
  expect(lane.points, stage.id).toHaveLength(2);
  expect(lane.points[0].timeSec, stage.id).toBe(0);
  expect(lane.points[1].timeSec, stage.id).toBe(stage.durationSec);
  return [lane.points[0].value, lane.points[1].value];
}

/** Carrier, starting beat, level and bed of a stage, read from the graph. */
function signal(stage: ProtocolStage) {
  const tone = stage.graph.nodes.find((node) => node.id === TONE_NODE)!;
  const noise = stage.graph.nodes.find((node) => node.id === NOISE_NODE);
  return {
    kind: tone.kind,
    carrierHz: tone.params.carrier,
    beatHz: tone.params.beat,
    amplitude: tone.params.amplitude,
    noiseColor: noise?.options.color,
    noiseLevel: noise?.params.level,
  };
}

describe('the multi-stage factory protocols', () => {
  it('ships exactly the three declared, and every one of them validates', () => {
    const protocols = buildFactoryProtocols();
    expect(protocols.map((protocol) => protocol.id)).toEqual([...FACTORY_PROTOCOL_IDS]);
    for (const protocol of protocols) {
      const validation = validateProtocol(protocol);
      expect(
        validation.issues.filter((issue) => issue.severity === 'error'),
        protocol.id,
      ).toEqual([]);
      expect(validation.ok, protocol.id).toBe(true);
      expect(protocol.meta.generatedBy, protocol.id).toBe('preset');
      expect(totalDurationSec(protocol), protocol.id).toBe(30 * 60);
    }
  });

  it('joins the eight demonstrations without colliding with any of them', () => {
    const all = buildAllFactoryProtocols();
    const ids = all.map((protocol) => protocol.id);
    expect(ids).toEqual([...PRESET_IDS, ...FACTORY_PROTOCOL_IDS]);
    expect(new Set(ids).size).toBe(ids.length);
    // Distinct configurations, so a fingerprint identifies which one ran.
    const fingerprints = all.map((protocol) => protocolFingerprint(protocol));
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });

  it('carries the same node ids and kinds across every stage boundary', () => {
    for (const protocol of buildFactoryProtocols()) {
      protocol.stages.slice(1).forEach((stage, index) => {
        const previous = protocol.stages[index];
        const before = new Map(previous.graph.nodes.map((node) => [node.id, node.kind]));
        const tone = stage.graph.nodes.find((node) => node.id === TONE_NODE)!;
        expect(before.get(TONE_NODE), `${protocol.id}/${stage.id}`).toBe(tone.kind);
        expect(stage.crossfadeSec, `${protocol.id}/${stage.id}`).toBeGreaterThan(0);
      });
      // Nothing precedes the first stage, so it has nothing to fade from.
      expect(protocol.stages[0].crossfadeSec, protocol.id).toBe(0);
    }
  });

  it('names nothing after a condition', () => {
    const forbidden = ['cure', 'cancer', 'disease', 'therapy', 'treatment', 'anxiety', 'insomnia', 'depression'];
    for (const protocol of buildFactoryProtocols()) {
      const surfaces = [
        protocol.name,
        protocol.description ?? '',
        ...protocol.meta.tags,
        ...protocol.stages.map((stage) => stage.name),
        ...protocol.stages.map((stage) => stage.notes ?? ''),
      ].map((text) => text.toLowerCase());
      for (const surface of surfaces) {
        for (const word of forbidden) {
          expect(surface.includes(word), `${protocol.id}: "${surface}"`).toBe(false);
        }
      }
    }
  });
});

describe('Deep Calm', () => {
  const protocol = protocolById('preset-deep-calm');

  it('descends 10 → 8 → 6 Hz over a carrier that drops with it, then returns', () => {
    expect(protocol.stages.map((stage) => stage.durationSec)).toEqual([300, 600, 600, 300]);
    expect(protocol.stages.map((stage) => stage.crossfadeSec)).toEqual([0, 8, 8, 8]);
    expect(protocol.stages.map((stage) => beatSweep(stage))).toEqual([
      [10, 8],
      [8, 6],
      null,
      [6, 10],
    ]);
    expect(protocol.stages.map((stage) => signal(stage).carrierHz)).toEqual([220, 200, 180, 180]);
    expect(protocol.stages[2].graph.nodes.find((node) => node.id === TONE_NODE)!.params.beat).toBe(6);
  });

  it('brings the pink bed in at 8% and forward to 12%, then lets it recede', () => {
    expect(protocol.stages.map((stage) => signal(stage).noiseLevel)).toEqual([
      undefined,
      0.08,
      0.12,
      0.12,
    ]);
    for (const stage of protocol.stages.slice(1)) {
      expect(signal(stage).noiseColor, stage.id).toBe('pink');
    }
    const taper = protocol.stages[3].automation.find((lane) => lane.target === `${NOISE_NODE}:level`)!;
    expect(taper.points[0].value).toBe(0.12);
    expect(taper.points[1].value).toBe(0.05);
    // The first stage has no bed at all, so no noise module is in its graph —
    // a level of zero would put a silent module in the signal-flow view and in
    // the DNA, describing something that is not running.
    expect(protocol.stages[0].graph.nodes.some((node) => node.id === NOISE_NODE)).toBe(false);
  });

  it('holds one level throughout and fades out over twenty seconds', () => {
    for (const stage of protocol.stages) expect(signal(stage).amplitude, stage.id).toBe(0.32);
    expect(protocol.master.fadeOutSec).toBe(20);
    expect(protocol.master.limiter).toBe(true);
  });
});

describe('Alpha Focus', () => {
  const protocol = protocolById('preset-alpha-focus');

  it('arrives at 10 Hz, holds for twenty minutes, then lifts to 12 Hz', () => {
    expect(protocol.stages.map((stage) => stage.durationSec)).toEqual([300, 1200, 300]);
    expect(protocol.stages.map((stage) => beatSweep(stage))).toEqual([[8, 10], null, [10, 12]]);
    expect(protocol.stages[1].graph.nodes.find((node) => node.id === TONE_NODE)!.params.beat).toBe(10);
  });

  it('never moves the carrier or the bed, so only the beat is in question', () => {
    for (const stage of protocol.stages) {
      const heard = signal(stage);
      expect(heard.carrierHz, stage.id).toBe(220);
      expect(heard.noiseColor, stage.id).toBe('pink');
      expect(heard.noiseLevel, stage.id).toBe(0.08);
      expect(heard.amplitude, stage.id).toBe(0.36);
      expect(stage.automation.some((lane) => lane.target === `${TONE_NODE}:carrier`), stage.id).toBe(false);
    }
  });
});

describe('Theta Descent', () => {
  const protocol = protocolById('preset-theta-descent');

  it('steps 10 → 8 → 6 → 5 Hz and returns to 8 Hz', () => {
    expect(protocol.stages.map((stage) => stage.durationSec)).toEqual([300, 600, 600, 300]);
    expect(protocol.stages.map((stage) => beatSweep(stage))).toEqual([
      [10, 8],
      [8, 6],
      [6, 5],
      [5, 8],
    ]);
  });

  it('keeps a steady 200 Hz carrier under brown noise the whole way', () => {
    for (const stage of protocol.stages) {
      const heard = signal(stage);
      expect(heard.carrierHz, stage.id).toBe(200);
      expect(heard.noiseColor, stage.id).toBe('brown');
      expect(heard.noiseLevel, stage.id).toBe(0.1);
      expect(heard.amplitude, stage.id).toBe(0.32);
    }
  });
});

describe('Protocol DNA', () => {
  it('fingerprints the same on every build', () => {
    const first = buildFactoryProtocols();
    const second = buildFactoryProtocols();
    first.forEach((protocol, index) => {
      expect(protocolFingerprint(protocol), protocol.id).toBe(protocolFingerprint(second[index]));
      expect(protocolFingerprint(protocol), protocol.id).toHaveLength(64);
    });
  });

  it('reads back the configuration people talk about', () => {
    // Human DNA describes the first stage plus the shape of the whole: Deep
    // Calm opens with no bed, which is why it carries no noise segment.
    expect(protocolDna(protocolById('preset-deep-calm')).human).toBe('B10-C220-x4-T30');
    expect(protocolDna(protocolById('preset-alpha-focus')).human).toBe('B8-C220-PN8-x3-T30');
    expect(protocolDna(protocolById('preset-theta-descent')).human).toBe('B10-C200-BN10-x4-T30');
  });

  it('gives each of the three a fingerprint the others do not share', () => {
    const dna = buildFactoryProtocols().map((protocol) => protocolDna(protocol));
    expect(new Set(dna.map((entry) => entry.fingerprint)).size).toBe(3);
    expect(new Set(dna.map((entry) => entry.shortFingerprint)).size).toBe(3);
    for (const entry of dna) {
      expect(entry.shortFingerprint.startsWith('FLX1-')).toBe(true);
      expect(entry.dspVersion).toBe('1.0.0');
    }
  });

  it('survives a rename, because a name is not part of the audio', () => {
    const protocol = protocolById('preset-alpha-focus');
    const before = protocolFingerprint(protocol);
    const renamed = renameProtocol(protocol, 'My Version', 'Renamed and otherwise untouched.');
    expect(protocolFingerprint(renamed)).toBe(before);
    expect(protocolDna(renamed).human).toBe(protocolDna(protocol).human);
  });
});
