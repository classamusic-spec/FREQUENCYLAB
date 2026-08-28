import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_ENTRIES,
  ARCHIVE_SETS,
  AUDIBLE_MAX_HZ,
  annotateDuplicates,
  archiveEntry,
  archiveProvenance,
  availableTransforms,
  buildArchiveProtocol,
  detectMedicalLanguage,
  entriesAtFrequency,
  estimateDominantFrequency,
  findDisagreements,
  harmonicSeries,
  materialiseImport,
  nearDuplicates,
  parseCollection,
  parseQuery,
  recommendedTransform,
  relatedFrequencies,
  renderProtocolOffline,
  searchArchive,
  transformsFor,
  validateProtocol,
  type ArchiveEntry,
} from '../src/index.js';
import { peak } from './helpers.js';

const NOW = '2026-03-01T09:00:00.000Z';

describe('frequency translator', () => {
  it('plays an audible archived value directly and unchanged', () => {
    const transform = recommendedTransform(2128);
    expect(transform.kind).toBe('direct');
    expect(transform.playbackHz).toBe(2128);
    expect(transform.octaveShift).toBe(0);
    // Nothing was altered, so there is nothing to caveat.
    expect(transform.equivalenceNote).toBeUndefined();
  });

  it('divides an out-of-band value by a stated power of two', () => {
    const transform = recommendedTransform(50000);
    expect(transform.kind).toBe('octave-down');
    expect(transform.octaveShift).toBe(-2);
    expect(transform.playbackHz).toBe(12500);
    expect(transform.label).toBe('÷4');
    expect(transform.playbackHz).toBeLessThanOrEqual(AUDIBLE_MAX_HZ);
    expect(transform.equivalenceNote).toContain('not physiologically equivalent');
  });

  it('never silently clamps a value into range', () => {
    // The brief's failure mode: 50 kHz quietly becoming 18 kHz.
    const direct = transformsFor(50000).find((t) => t.kind === 'direct')!;
    expect(direct.available).toBe(false);
    expect(direct.playbackHz).toBe(50000);
    expect(direct.unavailableReason).toContain('above the practical range');
  });

  it('offers a sub-audible value as a beat rather than as silence', () => {
    const transform = recommendedTransform(7.83);
    expect(transform.kind).toBe('binaural-beat');
    expect(transform.playbackHz).toBe(7.83);
    expect(transform.carrierHz).toBe(220);
    expect(transform.description).toContain('227.83');
    expect(transform.equivalenceNote).toContain('not an acoustic tone');
  });

  it('refuses a beat too fast to be perceived as one', () => {
    const beat = transformsFor(400).find((t) => t.kind === 'binaural-beat')!;
    expect(beat.available).toBe(false);
    expect(beat.unavailableReason).toContain('separate pitches');
  });

  it('reports unavailable transforms with a reason rather than hiding them', () => {
    const all = transformsFor(7.83);
    const unavailable = all.filter((t) => !t.available);
    expect(unavailable.length).toBeGreaterThan(0);
    for (const transform of unavailable) {
      expect(transform.unavailableReason, transform.kind).toBeTruthy();
    }
  });

  it('always preserves the original value on every transform', () => {
    for (const hz of [0.5, 7.83, 440, 2128, 50000, 880000]) {
      for (const transform of transformsFor(hz)) {
        expect(transform.originalHz, `${hz} ${transform.kind}`).toBe(hz);
      }
    }
  });

  it('caveats every transform that changes what is heard', () => {
    for (const hz of [7.83, 50000]) {
      for (const transform of availableTransforms(hz)) {
        if (transform.playbackHz !== hz || transform.carrierHz !== undefined) {
          expect(transform.equivalenceNote, `${hz} ${transform.kind}`).toBeTruthy();
        }
      }
    }
  });

  it('labels mathematical relatives as arithmetic, not equivalents', () => {
    const relations = relatedFrequencies(528);
    expect(relations.find((r) => r.ratio === '1:2')?.frequency).toBe(264);
    expect(relations.find((r) => r.ratio === '2:1')?.frequency).toBe(1056);
    expect(relations.find((r) => r.ratio === '3:2')?.frequency).toBe(792);
    expect(harmonicSeries(110, 4).map((h) => h.frequency)).toEqual([110, 220, 330, 440]);
  });
});

describe('shipped archive', () => {
  it('gives every entry a real source and a verification status', () => {
    for (const entry of ARCHIVE_ENTRIES) {
      expect(entry.source.title.length, entry.id).toBeGreaterThan(3);
      expect(entry.verification, entry.id).toBeTruthy();
      expect(entry.evidenceLevel, entry.id).toBeTruthy();
      expect(entry.summary.length, entry.id).toBeGreaterThan(20);
    }
  });

  it('pairs every medical claim with a statement of current evidence', () => {
    for (const entry of ARCHIVE_ENTRIES) {
      for (const claim of entry.claims) {
        expect(claim.currentEvidence.length, `${entry.id}: ${claim.claim}`).toBeGreaterThan(30);
        if (claim.medical) {
          // A medical claim must be answered, not merely restated.
          expect(
            /no reliable|not established|no evidence|not supported|no controlled/i.test(
              claim.currentEvidence,
            ),
            `${entry.id} medical claim lacks a rebuttal`,
          ).toBe(true);
        }
      }
    }
  });

  it('never phrases an entry as a treatment instruction', () => {
    const forbidden = /\b(cure your|kill the|destroy the|treat your|heals your)\b/i;
    for (const entry of ARCHIVE_ENTRIES) {
      const surface = `${entry.name} ${entry.summary} ${entry.archiveNote ?? ''} ${entry.recommendedTransform}`;
      expect(forbidden.test(surface), entry.id).toBe(false);
    }
  });

  it('states plainly what Rife material ships and how it is attributed', () => {
    const context = archiveEntry('rife-context')!;
    expect(context.evidenceLevel).toBe('unsupported-medical-claim');
    // No modern treatment table; the era-attribution rule is stated on the index.
    expect(context.archiveNote).toContain('ships no modern Rife treatment table');
    expect(context.archiveNote).toContain('1950s Crane-era');
    expect(context.claims.some((claim) => claim.medical)).toBe(true);

    // The famous audio numbers are attributed to the Crane era, never to the
    // 1930s laboratory — the single most-copied provenance error in this space.
    for (const id of ['az58-728', 'az58-784', 'az58-880', 'az58-2008', 'az58-2128']) {
      const record = archiveEntry(id)!;
      expect(record.verification, id).toBe('secondary-historical');
      expect(record.evidenceLevel, id).toBe('unsupported-medical-claim');
      expect(
        `${record.summary} ${record.archiveNote ?? ''} ${record.source.originalContext ?? ''}`,
        id,
      ).toMatch(/1950s|1953|Crane/);
    }

    // The 1930s lab-paper values are RF, held at their actual magnitudes, and
    // marked as reaching us through transcription rather than publication.
    const bx = archiveEntry('rife-mor-bx')!;
    expect(bx.frequency).toBeGreaterThan(1_000_000);
    expect(bx.playback.directAudible).toBe(false);
  });

  it('never presents a context record as holding a frequency', () => {
    const context = ARCHIVE_ENTRIES.filter((entry) => entry.contextOnly);
    expect(context.length).toBeGreaterThan(0);

    for (const entry of context) {
      // The placeholder zero must not be reachable as a value: not by an exact
      // lookup, not as a near-duplicate of anything, and not through a numeric
      // or range search.
      expect(entriesAtFrequency(ARCHIVE_ENTRIES, entry.frequency), entry.id).not.toContain(entry);
      expect(nearDuplicates(ARCHIVE_ENTRIES, 0.001), entry.id).not.toContain(entry);

      const byRange = searchArchive(ARCHIVE_ENTRIES, { minHz: 0, maxHz: 1 });
      expect(byRange.map((result) => result.entry.id), entry.id).not.toContain(entry.id);

      // A bare-number query keeps its text channel, so a context record may
      // legitimately match on words in its summary — but never as a frequency.
      const byNumber = searchArchive(ARCHIVE_ENTRIES, parseQuery('0'));
      for (const result of byNumber) {
        if (result.entry.id === entry.id) {
          expect(result.reason, entry.id).not.toMatch(/frequency/i);
        }
      }

      // It stays findable the way someone would actually look for it.
      const byName = searchArchive(ARCHIVE_ENTRIES, { text: entry.name });
      expect(byName.map((result) => result.entry.id), entry.id).toContain(entry.id);
    }
  });

  it('excludes context records from source disagreements', () => {
    // Every context record shares the same placeholder zero, which is not a
    // value they agree or disagree about.
    for (const disagreement of findDisagreements(ARCHIVE_ENTRIES)) {
      for (const record of disagreement.records) {
        expect(archiveEntry(record.entryId)?.contextOnly ?? false).toBe(false);
      }
    }
  });

  it('keeps set membership pointing at entries that exist', () => {
    for (const set of ARCHIVE_SETS) {
      for (const id of set.entryIds) {
        expect(archiveEntry(id), `${set.id} -> ${id}`).toBeDefined();
      }
    }
  });

  it('computes playback compatibility from the value itself', () => {
    const schumann = archiveEntry('schumann-783')!;
    expect(schumann.playback.directAudible).toBe(false);
    expect(schumann.playback.binauralBeatCompatible).toBe(true);
    const solfeggio = archiveEntry('solfeggio-528')!;
    expect(solfeggio.playback.directAudible).toBe(true);
  });
});

describe('search', () => {
  it('parses an exact frequency query', () => {
    // An exact query is a hairline window around the value, not the value itself,
    // so that a stored 2128.0000001 still matches what the user typed.
    const exact = parseQuery('2128 Hz');
    expect(exact.minHz).toBeLessThan(2128);
    expect(exact.maxHz).toBeGreaterThan(2128);
    expect(exact.maxHz! - exact.minHz!).toBeLessThan(0.01);

    const bare = parseQuery('528');
    expect(bare.minHz).toBeLessThan(528);
    expect(bare.maxHz).toBeGreaterThan(528);
  });

  it('parses a range query', () => {
    const query = parseQuery('700-900');
    expect(query.minHz).toBe(700);
    expect(query.maxHz).toBe(900);
    expect(query.text).toBeUndefined();
  });

  it('ranks an exact frequency match above a text match', () => {
    const results = searchArchive(ARCHIVE_ENTRIES, parseQuery('528'));
    expect(results[0].entry.id).toBe('solfeggio-528');
    expect(results[0].reason).toBe('Exact frequency match');
  });

  it('finds entries by source, alias and tag', () => {
    expect(searchArchive(ARCHIVE_ENTRIES, { text: 'schumann' }).length).toBeGreaterThan(0);
    expect(searchArchive(ARCHIVE_ENTRIES, { text: 'horowitz' }).length).toBeGreaterThan(0);
    expect(searchArchive(ARCHIVE_ENTRIES, { text: 'a440' }).length).toBeGreaterThan(0);
  });

  it('returns every record holding a value, across sources', () => {
    // The shipped archive itself holds 528 from two independent sources (the
    // 1999 Solfeggio publication and a 2018 endocrine study); adding a third
    // record surfaces all of them, none collapsed.
    const shipped = entriesAtFrequency(ARCHIVE_ENTRIES, 528).map((entry) => entry.id);
    expect(shipped).toContain('solfeggio-528');
    expect(shipped).toContain('tone-528-study');

    const conflicting: ArchiveEntry[] = [
      { ...archiveEntry('solfeggio-528')!, id: 'other-528', source: { title: 'Another list' } },
      ...ARCHIVE_ENTRIES,
    ];
    expect(entriesAtFrequency(conflicting, 528)).toHaveLength(shipped.length + 1);
  });

  it('flags near-duplicates rather than merging them', () => {
    const drifted: ArchiveEntry[] = [
      { ...archiveEntry('solfeggio-528')!, id: 'drifted', frequency: 527.9 },
      ...ARCHIVE_ENTRIES,
    ];
    const near = nearDuplicates(drifted, 528);
    expect(near.map((entry) => entry.id)).toContain('drifted');
    // Still distinct records: the drifted value was flagged, not folded into
    // the exact matches.
    expect(entriesAtFrequency(drifted, 528).map((entry) => entry.id)).not.toContain('drifted');
  });

  it('preserves disagreement between sources instead of averaging', () => {
    const disputed: ArchiveEntry[] = [
      ...ARCHIVE_ENTRIES,
      {
        ...archiveEntry('solfeggio-528')!,
        id: 'source-b-528',
        frequency: 527,
        source: { title: 'Compilation B', year: 2004 },
      },
    ];
    const disagreements = findDisagreements(disputed);
    const solfeggio = disagreements.find((d) => d.label === 'solfeggio 528');
    expect(solfeggio).toBeDefined();
    expect(solfeggio!.records.map((r) => r.frequency).sort()).toEqual([527, 528]);
  });
});

describe('import', () => {
  it('parses a CSV list and keeps the source row', () => {
    const preview = parseCollection(
      'name,frequency\nExample A,728\nExample B,880\nExample C,2128',
      'list.csv',
    );
    expect(preview.acceptedCount).toBe(3);
    expect(preview.rows[0]).toMatchObject({ name: 'Example A', frequency: 728 });
    expect(preview.rows[2].frequency).toBe(2128);
  });

  it('parses a bare list of numbers', () => {
    const preview = parseCollection('728\n880\n2128', 'plain.txt');
    expect(preview.acceptedCount).toBe(3);
    expect(preview.rows.map((r) => r.frequency)).toEqual([728, 880, 2128]);
  });

  it('parses JSON', () => {
    const preview = parseCollection('[{"name":"A","hz":432},{"name":"B","hz":528}]', 'list.json');
    expect(preview.rows.map((r) => r.frequency)).toEqual([432, 528]);
  });

  it('flags treatment language without discarding the row', () => {
    const preview = parseCollection('Cancer treatment,2128\nRelaxing tone,432', 'claims.csv');
    expect(preview.medicalRows).toContain(1);
    expect(preview.medicalRows).not.toContain(2);
    // Flagged, still imported — the archive preserves what the source said.
    expect(preview.acceptedCount).toBe(2);
  });

  it('detects the claim vocabulary it must catch', () => {
    for (const text of [
      'kills viruses',
      'cures cancer',
      'parasite cleanse',
      'treatment for arthritis',
      'destroys bacteria',
      // The most common claim attached to these lists, and the one that reads
      // most like a neutral description rather than a treatment instruction.
      'said to repair DNA',
      'repairs cellular damage',
    ]) {
      expect(detectMedicalLanguage(text), text).toBe(true);
    }
    for (const text of ['alpha range tone', 'concert pitch reference', '40 Hz modulation rate']) {
      expect(detectMedicalLanguage(text), text).toBe(false);
    }
  });

  it('reports rows it cannot parse instead of guessing', () => {
    const preview = parseCollection('no numbers at all here', 'bad.txt');
    expect(preview.acceptedCount).toBe(0);
    expect(preview.issues.some((issue) => issue.code === 'unparseable')).toBe(true);
  });

  it('warns about collisions with what is already held', () => {
    const preview = annotateDuplicates(
      parseCollection('Solfeggio,528\nDrifted,527.9', 'dupes.csv'),
      ARCHIVE_ENTRIES,
    );
    expect(preview.duplicateRows).toContain(1);
    expect(preview.nearDuplicateRows).toContain(2);
    expect(preview.issues.some((i) => i.code === 'exact-duplicate')).toBe(true);
  });

  it('imports everything as unverified, whatever the file asserted', () => {
    const preview = parseCollection('Proven cure for cancer,2128\nPlain tone,432', 'x.csv');
    const { entries, set } = materialiseImport(preview, {
      sourceTitle: 'My archive',
      now: NOW,
      idPrefix: 'test',
    });
    expect(set.verification).toBe('unverified');
    for (const entry of entries) {
      expect(entry.verification).toBe('unverified');
      expect(entry.tags).toContain('unverified');
      expect(entry.source.originalContext).toContain('x.csv');
    }
    // The medical row is preserved as a quoted claim with a rebuttal attached.
    const medical = entries[0];
    expect(medical.evidenceLevel).toBe('unsupported-medical-claim');
    expect(medical.claims[0].medical).toBe(true);
    expect(medical.claims[0].currentEvidence).toContain('No reliable clinical evidence');
    expect(entries[1].claims).toHaveLength(0);
  });

  it('keeps imported values exactly as the file gave them', () => {
    const preview = parseCollection('A,2127.9\nB,7.83', 'precise.csv');
    const { entries } = materialiseImport(preview, { sourceTitle: 'S', now: NOW, idPrefix: 't' });
    expect(entries[0].frequency).toBe(2127.9);
    expect(entries[1].frequency).toBe(7.83);
  });
});

describe('archive protocols', () => {
  it('converts a set into stages in the order the source gave', () => {
    const entries = [728, 880, 2128].map((hz, i) => ({
      ...archiveEntry('solfeggio-528')!,
      id: `seq-${i}`,
      name: `Step ${i + 1}`,
      frequency: hz,
    }));
    const protocol = buildArchiveProtocol({
      id: 'archive-seq',
      name: 'Sequence',
      createdAt: NOW,
      stages: entries.map((entry) => ({
        entry,
        transform: recommendedTransform(entry.frequency),
        durationSec: 180,
      })),
    });

    expect(protocol.stages).toHaveLength(3);
    expect(protocol.stages.map((s) => s.durationSec)).toEqual([180, 180, 180]);
    expect(validateProtocol(protocol).ok).toBe(true);

    const provenance = archiveProvenance(protocol)!;
    expect(provenance.references.map((r) => r.originalFrequency)).toEqual([728, 880, 2128]);
    expect(provenance.notice).toContain('not equivalent');
  });

  it('renders a direct archive tone at the archived frequency', () => {
    const entry = { ...archiveEntry('solfeggio-528')!, frequency: 2128 };
    const protocol = buildArchiveProtocol({
      id: 'archive-tone',
      name: 'Tone',
      createdAt: NOW,
      stages: [{ entry, transform: recommendedTransform(2128), durationSec: 30 }],
    });
    const audio = renderProtocolOffline(protocol, { sampleRate: 48000, startSec: 10, maxSeconds: 1 });
    expect(peak(audio.left)).toBeGreaterThan(0.05);
    // The tone that comes out is the number that went in.
    expect(estimateDominantFrequency(audio.left, 48000)).toBeCloseTo(2128, 0);
  });

  it('renders a divided value at the divided frequency, not the original', () => {
    const entry = { ...archiveEntry('solfeggio-528')!, frequency: 50000 };
    const transform = recommendedTransform(50000);
    const protocol = buildArchiveProtocol({
      id: 'archive-div',
      name: 'Divided',
      createdAt: NOW,
      stages: [{ entry, transform, durationSec: 30 }],
    });
    const audio = renderProtocolOffline(protocol, { sampleRate: 48000, startSec: 10, maxSeconds: 1 });
    expect(estimateDominantFrequency(audio.left, 48000)).toBeCloseTo(12500, -1);

    const provenance = archiveProvenance(protocol)!;
    expect(provenance.references[0]).toMatchObject({
      originalFrequency: 50000,
      playbackFrequency: 12500,
      transform: 'octave-down',
      octaveShift: -2,
    });
  });

  it('renders a sub-audible value as a real binaural difference', () => {
    const entry = archiveEntry('schumann-783')!;
    const protocol = buildArchiveProtocol({
      id: 'archive-beat',
      name: 'Beat',
      createdAt: NOW,
      stages: [{ entry, transform: recommendedTransform(7.83), durationSec: 30 }],
    });
    const audio = renderProtocolOffline(protocol, { sampleRate: 48000, startSec: 10, maxSeconds: 2 });
    const left = estimateDominantFrequency(audio.left, 48000);
    const right = estimateDominantFrequency(audio.right, 48000);
    expect(right - left).toBeCloseTo(7.83, 1);
  });

  it('carries the transform into the protocol so a session is reproducible', () => {
    const entry = { ...archiveEntry('solfeggio-528')!, frequency: 880000 };
    const transform = recommendedTransform(880000);
    const protocol = buildArchiveProtocol({
      id: 'archive-dna',
      name: 'DNA',
      createdAt: NOW,
      stages: [{ entry, transform, durationSec: 60 }],
    });
    const reference = archiveProvenance(protocol)!.references[0];
    expect(reference.originalFrequency).toBe(880000);
    expect(reference.playbackFrequency).toBe(transform.playbackHz);
    expect(reference.octaveShift).toBeLessThan(0);
    expect(reference.sourceVersion).toBe(entry.sourceVersion);
  });
});
