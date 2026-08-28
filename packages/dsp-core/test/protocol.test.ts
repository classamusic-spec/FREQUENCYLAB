import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  DSP_VERSION,
  PROTOCOL_SCHEMA_VERSION,
  canonicalJson,
  canonicalProtocol,
  decodeDnaString,
  encodeDnaString,
  evaluateLane,
  forkProtocol,
  humanDna,
  makeHoldLane,
  makeSweepLane,
  migrateProtocol,
  protocolDna,
  protocolFingerprint,
  protocolFromExplorer,
  protocolFromSimple,
  sha256Hex,
  validateProtocol,
  verifyDna,
  type Protocol,
} from '../src/index.js';

const FIXED_DATE = '2026-01-01T00:00:00.000Z';

function relaxProtocol(): Protocol {
  return protocolFromSimple({
    goal: 'relax',
    durationSec: 25 * 60,
    intensity: 'balanced',
    id: 'test-relax',
    createdAt: FIXED_DATE,
  });
}

describe('sha256', () => {
  it('matches the published test vectors', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('The quick brown fox jumps over the lazy dog')).toBe(
      'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
    );
  });
});

describe('canonical serialisation', () => {
  it('sorts keys and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: 2, c: undefined })).toBe('{"a":2,"b":1}');
  });

  it('prints numbers without exponent notation', () => {
    expect(canonicalJson({ v: 0.0000001 })).toBe('{"v":0}');
    expect(canonicalJson({ v: 7.8300000001 })).toBe('{"v":7.83}');
    expect(canonicalJson({ v: 1e21 })).toBe('{"v":1e+21}');
  });

  it('is stable across independent builds of the same protocol', () => {
    const a = relaxProtocol();
    const b = relaxProtocol();
    expect(canonicalJson(canonicalProtocol(a))).toBe(canonicalJson(canonicalProtocol(b)));
  });

  it('ignores editor-only changes', () => {
    const base = relaxProtocol();
    const renamed: Protocol = {
      ...base,
      id: 'different-id',
      name: 'A Different Name',
      description: 'Changed',
      meta: { ...base.meta, tags: ['x'], updatedAt: '2030-01-01T00:00:00.000Z', version: 9 },
    };
    expect(protocolFingerprint(renamed)).toBe(protocolFingerprint(base));

    const moved: Protocol = {
      ...base,
      stages: base.stages.map((stage) => ({
        ...stage,
        graph: {
          ...stage.graph,
          nodes: stage.graph.nodes.map((node) => ({ ...node, position: { x: 999, y: 999 } })),
        },
      })),
    };
    expect(protocolFingerprint(moved)).toBe(protocolFingerprint(base));
  });

  it('changes when anything audible changes', () => {
    const base = relaxProtocol();
    const before = protocolFingerprint(base);
    const retuned: Protocol = {
      ...base,
      stages: base.stages.map((stage, index) =>
        index === 0
          ? {
              ...stage,
              graph: {
                ...stage.graph,
                nodes: stage.graph.nodes.map((node) =>
                  node.id === 'tone'
                    ? { ...node, params: { ...node.params, carrier: node.params.carrier + 0.001 } }
                    : node,
                ),
              },
            }
          : stage,
      ),
    };
    expect(protocolFingerprint(retuned)).not.toBe(before);
  });
});

describe('protocol DNA', () => {
  it('produces a readable human form', () => {
    const protocol = protocolFromExplorer(
      {
        engine: 'binaural',
        beatHz: 6,
        carrierHz: 220,
        intensity: 0.5,
        noiseColor: 'pink',
        noiseLevel: 0.15,
        motionRateHz: 0.75,
        motionDepth: 0.5,
        durationSec: 20 * 60,
      },
      { id: 'dna-demo', createdAt: FIXED_DATE },
    );
    expect(humanDna(protocol)).toBe('B6-C220-PN15-S0.75-T20');
  });

  it('reports the schema and DSP version it was made with', () => {
    const dna = protocolDna(relaxProtocol());
    expect(dna.dspVersion).toBe(DSP_VERSION);
    expect(dna.schemaVersion).toBe(PROTOCOL_SCHEMA_VERSION);
    expect(dna.shortFingerprint).toMatch(/^FLX1-[0-9A-HJKMNP-TV-Z]{12}$/);
    expect(dna.fingerprint).toHaveLength(64);
  });

  it('round-trips through a shareable DNA string', () => {
    const protocol = relaxProtocol();
    const encoded = encodeDnaString(protocol);
    const decoded = decodeDnaString(encoded);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.fingerprintMatches).toBe(true);
    expect(decoded.dspVersionMatches).toBe(true);
    expect(protocolFingerprint(decoded.document.protocol)).toBe(protocolFingerprint(protocol));
  });

  it('rejects a damaged DNA string rather than importing something wrong', () => {
    const encoded = encodeDnaString(relaxProtocol());
    const damaged = `${encoded.slice(0, 30)}X${encoded.slice(31)}`;
    const decoded = decodeDnaString(damaged);
    expect(decoded.ok).toBe(false);
  });

  it('verifies a fingerprint and explains an engine mismatch', () => {
    const protocol = relaxProtocol();
    const fingerprint = protocolFingerprint(protocol);
    expect(verifyDna(protocol, fingerprint).matches).toBe(true);
    expect(verifyDna(protocol, 'deadbeef').matches).toBe(false);

    const older: Protocol = { ...protocol, dspVersion: '0.9.0' };
    const verification = verifyDna(older, protocolFingerprint(older));
    expect(verification.matches).toBe(true);
    expect(verification.dspVersionMatches).toBe(false);
    expect(verification.note).toContain('0.9.0');
  });
});

describe('automation lanes', () => {
  it('holds before the first point and after the last', () => {
    const lane = makeSweepLane('l', 'tone:beat', 10, 6, 100);
    expect(evaluateLane(lane, -5)).toBe(10);
    expect(evaluateLane(lane, 0)).toBe(10);
    expect(evaluateLane(lane, 100)).toBe(6);
    expect(evaluateLane(lane, 500)).toBe(6);
  });

  it('interpolates through the segment curve', () => {
    const lane = makeSweepLane('l', 'tone:beat', 10, 6, 100, { kind: 'linear' });
    expect(evaluateLane(lane, 50)).toBeCloseTo(8, 9);
    expect(evaluateLane(lane, 25)).toBeCloseTo(9, 9);
  });

  it('returns nothing when disabled', () => {
    const lane = { ...makeHoldLane('l', 'tone:beat', 7.83), enabled: false };
    expect(evaluateLane(lane, 10)).toBeUndefined();
  });
});

describe('protocol validation', () => {
  it('accepts every built-in Simple Mode protocol', () => {
    for (const goal of ['relax', 'focus', 'meditate', 'sleep', 'explore'] as const) {
      const protocol = protocolFromSimple({ goal, durationSec: 30 * 60, intensity: 'balanced' });
      const result = validateProtocol(protocol);
      const errors = result.issues.filter((issue) => issue.severity === 'error');
      expect(errors, `${goal}: ${errors.map((e) => e.message).join('; ')}`).toEqual([]);
      expect(result.ok).toBe(true);
    }
  });

  it('rejects a disabled limiter', () => {
    const protocol = relaxProtocol();
    const result = validateProtocol({ ...protocol, master: { ...protocol.master, limiter: false } });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'limiter-disabled')).toBe(true);
  });

  it('rejects automation pointing at a parameter that does not exist', () => {
    const protocol = relaxProtocol();
    const broken: Protocol = {
      ...protocol,
      stages: protocol.stages.map((stage, index) =>
        index === 0
          ? { ...stage, automation: [makeHoldLane('x', 'tone:notAParameter', 1)] }
          : stage,
      ),
    };
    const result = validateProtocol(broken);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'automation-missing-param')).toBe(true);
  });

  it('rejects a protocol from a future schema', () => {
    const protocol = { ...relaxProtocol(), schemaVersion: 99 };
    expect(validateProtocol(protocol).ok).toBe(false);
    expect(() => migrateProtocol(protocol)).toThrow(/newer than this build/);
  });
});

describe('lineage', () => {
  it('records the parent and root when forking', () => {
    const original = relaxProtocol();
    const v2 = forkProtocol(original, 'v2', 'Focus V2');
    const v3 = forkProtocol(v2, 'v3', 'Focus V3');
    expect(v2.meta.lineage).toEqual({
      parentId: original.id,
      parentVersion: original.meta.version,
      rootId: original.id,
    });
    expect(v3.meta.lineage?.parentId).toBe('v2');
    expect(v3.meta.lineage?.rootId).toBe(original.id);
  });
});

describe('migration', () => {
  it('fills in parameters added after a protocol was saved', () => {
    const protocol = relaxProtocol();
    const stripped = JSON.parse(JSON.stringify(protocol)) as Protocol;
    for (const node of stripped.stages[0].graph.nodes) delete (node.params as never)['amplitude'];
    const migrated = migrateProtocol(stripped);
    const tone = migrated.stages[0].graph.nodes.find((node) => node.id === 'tone');
    expect(tone?.params.amplitude).toBeDefined();
    expect(validateProtocol(migrated).ok).toBe(true);
  });
});

describe('sha256', () => {
  it('is real SHA-256 at every message length', () => {
    // Protocol DNA is advertised as "the SHA-256 of the canonical form", which
    // only means something if another implementation agrees. The padding used
    // to allocate one block too many when the length was 55 mod 64, so about
    // one protocol in sixty-four had a fingerprint nothing else could
    // reproduce — self-consistent, and not SHA-256.
    const mismatched: number[] = [];
    for (let length = 0; length <= 200; length++) {
      const bytes = Buffer.alloc(length, 0x61);
      const expected = createHash('sha256').update(bytes).digest('hex');
      if (sha256Hex(bytes.toString('latin1')) !== expected) mismatched.push(length);
    }
    expect(mismatched, `lengths that differ: ${mismatched.join(', ')}`).toEqual([]);
  });
});
