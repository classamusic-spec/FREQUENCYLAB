import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_DESCRIPTION_MAX_LENGTH,
  PROTOCOL_NAME_MAX_LENGTH,
  buildPresets,
  canonicalJson,
  canonicalProtocol,
  decodeDnaString,
  encodeDnaString,
  encodeShareCode,
  normaliseProtocolDescription,
  normaliseProtocolName,
  protocolDna,
  protocolFingerprint,
  protocolFromSimple,
  protocolNameIssue,
  renameProtocol,
  shareCheck,
  type Protocol,
} from '../src/index.js';

/**
 * The contract behind the rename feature.
 *
 * The whole reason a user can be told "the name is yours, the fingerprint is
 * the experiment" is that `canonicalProtocol` excludes id, name and
 * description. That is a property of the code, not a promise in a comment, so
 * it is asserted here — against the real hashing and share-code paths — rather
 * than being taken on trust by the screens that repeat the claim.
 */

const FIXED_DATE = '2026-01-01T00:00:00.000Z';

function sample(): Protocol {
  return protocolFromSimple({
    goal: 'relax',
    durationSec: 25 * 60,
    intensity: 'balanced',
    id: 'test-rename',
    createdAt: FIXED_DATE,
  });
}

describe('renaming a protocol', () => {
  it('leaves the fingerprint untouched', () => {
    const before = sample();
    const after = renameProtocol(before, 'My evening wind-down');

    expect(after.name).toBe('My evening wind-down');
    expect(after.name).not.toBe(before.name);
    expect(protocolFingerprint(after)).toBe(protocolFingerprint(before));
  });

  it('leaves the share code — and its check — byte-identical', () => {
    const before = sample();
    const after = renameProtocol(before, 'Totally different name', 'And a new description.');

    const codeBefore = encodeShareCode(before);
    expect(codeBefore).not.toBeNull();
    expect(encodeShareCode(after)).toBe(codeBefore);
    expect(shareCheck(after)).toBe(shareCheck(before));
  });

  it('leaves the canonical form byte-identical', () => {
    const before = sample();
    const after = renameProtocol(before, 'Something else entirely', 'A different description.');

    expect(canonicalJson(canonicalProtocol(after))).toBe(
      canonicalJson(canonicalProtocol(before)),
    );
  });

  it('keeps the short id and the human summary stable', () => {
    const before = protocolDna(sample());
    const after = protocolDna(renameProtocol(sample(), 'Renamed'));

    expect(after.fingerprint).toBe(before.fingerprint);
    expect(after.shortFingerprint).toBe(before.shortFingerprint);
    expect(after.human).toBe(before.human);
  });

  it('holds for every shipped preset, whatever it is renamed to', () => {
    for (const preset of buildPresets()) {
      const renamed = renameProtocol(preset, `${preset.name} — mine`);
      expect(protocolFingerprint(renamed), preset.name).toBe(protocolFingerprint(preset));
      expect(encodeShareCode(renamed), preset.name).toBe(encodeShareCode(preset));
    }
  });

  /*
   * The one place a name *is* visible. The full DNA string serialises the whole
   * protocol document, name included, so the string itself changes — but the
   * fingerprint it carries does not, and the decoded protocol still verifies.
   * The UI copy says "share code" for this reason, and this test is what keeps
   * that distinction honest.
   */
  it('changes the full DNA string but not the fingerprint inside it', () => {
    const before = sample();
    const after = renameProtocol(before, 'Renamed for the DNA string');

    expect(encodeDnaString(after)).not.toBe(encodeDnaString(before));

    const decoded = decodeDnaString(encodeDnaString(after));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.fingerprintMatches).toBe(true);
    expect(decoded.document.fingerprint).toBe(protocolFingerprint(before));
    expect(decoded.document.protocol.name).toBe('Renamed for the DNA string');
  });

  it('does not touch anything else about the protocol', () => {
    const before = sample();
    const after = renameProtocol(before, 'Renamed', 'Described');

    expect(after.id).toBe(before.id);
    expect(after.meta).toEqual(before.meta);
    expect(after.master).toEqual(before.master);
    expect(after.stages).toEqual(before.stages);
    expect(after.sampleRate).toBe(before.sampleRate);
    expect(after.intent).toBe(before.intent);
  });
});

describe('name validation', () => {
  it('trims and collapses whitespace', () => {
    expect(normaliseProtocolName('   Evening   wind   down  ')).toBe('Evening wind down');
  });

  it('flattens pasted line breaks and control characters into single spaces', () => {
    expect(normaliseProtocolName('Evening\n\twind\r\ndown')).toBe('Evening wind down');
  });

  it('caps a very long name without leaving a ragged trailing space', () => {
    const long = `${'a'.repeat(PROTOCOL_NAME_MAX_LENGTH)} tail`;
    const result = normaliseProtocolName(long);

    expect(result.length).toBe(PROTOCOL_NAME_MAX_LENGTH);
    expect(result).toBe(result.trim());
  });

  it('caps a description at its own, longer limit', () => {
    const long = 'b'.repeat(PROTOCOL_DESCRIPTION_MAX_LENGTH + 40);
    expect(normaliseProtocolDescription(long).length).toBe(PROTOCOL_DESCRIPTION_MAX_LENGTH);
  });

  it('refuses an empty or whitespace-only name', () => {
    expect(protocolNameIssue('')).not.toBeNull();
    expect(protocolNameIssue('   ')).not.toBeNull();
    expect(protocolNameIssue('\n\t ')).not.toBeNull();
    expect(() => renameProtocol(sample(), '   ')).toThrow();
  });

  it('accepts an ordinary name, and one that is only punctuation or an emoji', () => {
    expect(protocolNameIssue('Sleep')).toBeNull();
    expect(protocolNameIssue('???')).toBeNull();
    expect(protocolNameIssue('🌙')).toBeNull();
  });

  /*
   * Duplicates are explicitly allowed. Two protocols may reasonably be called
   * the same thing, and they remain distinguishable by the only field that
   * actually differs.
   */
  it('allows two different protocols to share a name', () => {
    const relax = renameProtocol(sample(), 'Evening');
    const focus = renameProtocol(
      protocolFromSimple({
        goal: 'focus',
        durationSec: 30 * 60,
        intensity: 'balanced',
        id: 'test-rename-focus',
        createdAt: FIXED_DATE,
      }),
      'Evening',
    );

    expect(focus.name).toBe(relax.name);
    expect(protocolFingerprint(focus)).not.toBe(protocolFingerprint(relax));
  });
});

describe('descriptions', () => {
  it('sets a description when one is given', () => {
    expect(renameProtocol(sample(), 'Evening', 'For after work.').description).toBe(
      'For after work.',
    );
  });

  it('leaves the existing description alone when none is given', () => {
    const described = renameProtocol(sample(), 'Evening', 'For after work.');
    expect(renameProtocol(described, 'Late evening').description).toBe('For after work.');
  });

  it('removes the description when an empty one is given', () => {
    const described = renameProtocol(sample(), 'Evening', 'For after work.');
    expect(renameProtocol(described, 'Evening', '   ').description).toBeUndefined();
  });

  it('does not let a description change the fingerprint either', () => {
    const before = sample();
    expect(protocolFingerprint(renameProtocol(before, before.name, 'A note to self.'))).toBe(
      protocolFingerprint(before),
    );
  });
});
