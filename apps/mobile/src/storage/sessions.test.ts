import { beforeEach, describe, expect, it } from 'vitest';
import { createProtocol, protocolDna, type Protocol, type Session } from '@frequencylab/dsp-core';
import { loadSessions, saveSessions } from './repositories';
import { StorageKeys, StorageWriteError, writeValue } from './store';
import { __failWrites, __raw, __reset } from './__mocks__/asyncStorage';

/**
 * Session storage, and the two things that used to go wrong with it.
 *
 * A session embeds the whole protocol it ran so history stays reproducible.
 * Stored inline that was about 4 KB a session in one AsyncStorage row, which
 * Android stops being able to read back at around five hundred of them. These
 * check that splitting the snapshots out fixed the size without costing any of
 * the reproducibility it was there for.
 */

function protocolNamed(name: string): Protocol {
  return createProtocol({
    id: `p-${name.toLowerCase()}`,
    name,
    description: 'For the test.',
    intent: 'relax',
    createdAt: '2026-01-01T00:00:00.000Z',
    generatedBy: 'preset',
    stages: [],
  });
}

function sessionFor(protocol: Protocol, id: string): Session {
  return {
    id,
    protocolId: protocol.id,
    protocolName: protocol.name,
    protocolFingerprint: protocolDna(protocol).fingerprint,
    humanDna: 'FL1',
    dspVersion: '1',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:25:00.000Z',
    plannedDurationSec: 1500,
    endReason: 'completed',
    metrics: { playedSec: 1500, pauseCount: 0, underruns: 0, adherence: 1, peakGainReductionDb: 0 },
    ratings: [],
    protocolSnapshot: protocol,
  };
}

beforeEach(() => __reset());

describe('protocol snapshots are stored once each', () => {
  it('round-trips a session with its protocol intact', async () => {
    const protocol = protocolNamed('Deep Calm');
    const session = sessionFor(protocol, 's1');
    await saveSessions([session]);

    const [loaded] = await loadSessions();
    expect(loaded.protocolSnapshot).toEqual(protocol);
    expect(loaded.id).toBe('s1');
  });

  it('stores one copy however many sessions ran the same protocol', async () => {
    const protocol = protocolNamed('Deep Calm');
    const many = Array.from({ length: 50 }, (_, i) => sessionFor(protocol, `s${i}`));
    await saveSessions(many);

    const snapshots = JSON.parse(__raw('frequencylab.v1.protocol-snapshots')!).data;
    expect(Object.keys(snapshots)).toHaveLength(1);

    // The size claim, asserted rather than described: the whole point of this
    // change is that a session record stops carrying a protocol with it.
    const sessionsBytes = __raw('frequencylab.v1.sessions')!.length;
    expect(sessionsBytes / 50).toBeLessThan(600);

    const loaded = await loadSessions();
    expect(loaded).toHaveLength(50);
    expect(loaded.every((s) => s.protocolSnapshot !== undefined)).toBe(true);
  });

  it('keeps each session its own name when two protocols share a fingerprint', async () => {
    /*
     * The subtlety the whole split turns on. A fingerprint hashes what a
     * protocol *does* and deliberately ignores its id and name, so that a
     * renamed protocol keeps its history — which means two differently named
     * protocols with identical DSP share one stored snapshot. Reading the name
     * back off that snapshot would show one session under the other's name.
     */
    const calm = protocolNamed('Deep Calm');
    const twin = protocolNamed('Evening Wind Down');
    expect(protocolDna(twin).fingerprint).toBe(protocolDna(calm).fingerprint);

    await saveSessions([sessionFor(calm, 's1'), sessionFor(twin, 's2')]);
    const loaded = await loadSessions();

    expect(loaded.map((s) => s.protocolName)).toEqual(['Deep Calm', 'Evening Wind Down']);
    expect(loaded.map((s) => s.protocolSnapshot!.name)).toEqual(['Deep Calm', 'Evening Wind Down']);
    expect(loaded.map((s) => s.protocolSnapshot!.id)).toEqual(['p-deep calm', 'p-evening wind down']);
  });

  it('still reads a session written before the split', async () => {
    // Records already on disk carry their own snapshot and no map exists.
    const protocol = protocolNamed('Legacy');
    await writeValue(StorageKeys.sessions, [sessionFor(protocol, 'old')]);

    const [loaded] = await loadSessions();
    expect(loaded.protocolSnapshot).toEqual(protocol);
  });

  it('drops a snapshot nothing points at any more', async () => {
    const keep = protocolNamed('Kept');
    const gone = protocolNamed('Deleted');
    // Different DSP, so genuinely two fingerprints rather than one shared row.
    gone.stages = [...keep.stages];
    await saveSessions([sessionFor(keep, 's1'), sessionFor(gone, 's2')]);

    await saveSessions([sessionFor(keep, 's1')]);
    const snapshots = JSON.parse(__raw('frequencylab.v1.protocol-snapshots')!).data;
    expect(Object.keys(snapshots)).toHaveLength(1);
  });
});

describe('a write that fails says so', () => {
  it('throws a named error carrying the key', async () => {
    __failWrites('Row too big to fit into CursorWindow');
    await expect(saveSessions([sessionFor(protocolNamed('Calm'), 's1')])).rejects.toBeInstanceOf(
      StorageWriteError,
    );
    try {
      await saveSessions([]);
    } catch (error) {
      expect((error as StorageWriteError).key).toBe(StorageKeys.protocolSnapshots);
      expect((error as StorageWriteError).message).toContain('CursorWindow');
    }
  });
});
