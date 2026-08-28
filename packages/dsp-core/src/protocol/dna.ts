import { canonicalJson, canonicalProtocol } from './canonical.js';
import {
  base32Encode,
  base64UrlDecode,
  base64UrlEncode,
  sha256Bytes,
  sha256Hex,
  toHex,
  utf8Decode,
  utf8Encode,
} from './sha256.js';
import { DSP_VERSION, PROTOCOL_SCHEMA_VERSION, totalDurationSec, type Protocol } from './schema.js';

export const DNA_PREFIX = 'FLX';

export interface ProtocolDna {
  /** Short, readable, lossy — for cards, chips and conversation. */
  human: string;
  /** Full SHA-256 of the canonical form. */
  fingerprint: string;
  /** First 60 bits of the fingerprint in Crockford base32, e.g. `FLX1-8Q4K7NV2`. */
  shortFingerprint: string;
  dspVersion: string;
  schemaVersion: number;
}

/** SHA-256 over the canonical, audio-determining subset of a protocol. */
export function protocolFingerprint(protocol: Protocol): string {
  return sha256Hex(canonicalJson(canonicalProtocol(protocol)));
}

/**
 * Human DNA — a compact summary of the salient signal, in the brief's own
 * notation: `B7.83-C220-AM40-PN12-S0.75`.
 *
 * It is intentionally lossy. It exists so a protocol is recognisable at a
 * glance; `fingerprint` is what actually proves two protocols are identical,
 * and the UI never presents human DNA as an identity check.
 */
export function humanDna(protocol: Protocol): string {
  const segments: string[] = [];
  const first = protocol.stages[0];
  if (!first) return `${DNA_PREFIX}-EMPTY`;

  const nodes = first.graph.nodes;
  const byKind = (kind: string) => nodes.filter((node) => node.kind === kind);

  const beatSource =
    byKind('binaural')[0] ?? byKind('monaural')[0] ?? byKind('isochronic')[0] ?? undefined;
  if (beatSource) {
    const beat = beatSource.params.beat ?? beatSource.params.pulse;
    if (beat !== undefined) segments.push(`B${trim(beat)}`);
  }

  // An AM module fed by something else is an insert, and its own carrier
  // parameter is unused — reading it would print a carrier for a signal that
  // has none, which a modulated noise bed does not.
  const amGenerator = byKind('am').find(
    (node) => !first.graph.connections.some((connection) => connection.to === node.id),
  );
  const carrierSource = beatSource ?? amGenerator ?? byKind('fm')[0] ?? byKind('oscillator')[0];
  if (carrierSource) {
    const carrier =
      carrierSource.params.carrier ?? carrierSource.params.frequency ?? carrierSource.params.fundamental;
    if (carrier !== undefined) segments.push(`C${trim(carrier)}`);
  }

  const am = byKind('am')[0];
  if (am && (am.params.depth ?? 0) > 0) segments.push(`AM${trim(am.params.modFrequency ?? 0)}`);

  const fm = byKind('fm')[0];
  if (fm && (fm.params.deviation ?? 0) > 0) segments.push(`FM${trim(fm.params.modFrequency ?? 0)}`);

  const harmonic = byKind('harmonic')[0];
  if (harmonic) {
    const count = Object.keys(harmonic.params).filter(
      (key) => /^h\d+$/.test(key) && (harmonic.params[key] ?? 0) > 0.001,
    ).length;
    segments.push(`H${count}`);
  }

  const noise = byKind('noise')[0];
  if (noise && (noise.params.level ?? 0) > 0.001) {
    const letter = { white: 'WN', pink: 'PN', brown: 'BN' }[noise.options.color ?? 'pink'] ?? 'PN';
    segments.push(`${letter}${Math.round((noise.params.level ?? 0) * 100)}`);
  }

  const motion = byKind('stereoMotion')[0];
  if (motion && (motion.params.depth ?? 0) > 0.001) segments.push(`S${trim(motion.params.rate ?? 0)}`);

  if (protocol.stages.length > 1) segments.push(`x${protocol.stages.length}`);
  const minutes = Math.round(totalDurationSec(protocol) / 60);
  if (minutes > 0) segments.push(`T${minutes}`);

  return segments.length > 0 ? segments.join('-') : `${DNA_PREFIX}-EMPTY`;
}

function trim(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
}

export function protocolDna(protocol: Protocol): ProtocolDna {
  const fingerprint = protocolFingerprint(protocol);
  const bytes = sha256Bytes(utf8Encode(canonicalJson(canonicalProtocol(protocol))));
  return {
    human: humanDna(protocol),
    fingerprint,
    shortFingerprint: `${DNA_PREFIX}${protocol.schemaVersion}-${base32Encode(bytes, 8).slice(0, 12)}`,
    dspVersion: protocol.dspVersion,
    schemaVersion: protocol.schemaVersion,
  };
}

/** The document produced by SHARE DNA / EXPORT and consumed by IMPORT DNA. */
export interface DnaDocument {
  format: 'frequencylab.protocol-dna';
  version: 1;
  fingerprint: string;
  human: string;
  protocol: Protocol;
}

export function exportDnaDocument(protocol: Protocol): DnaDocument {
  return {
    format: 'frequencylab.protocol-dna',
    version: 1,
    fingerprint: protocolFingerprint(protocol),
    human: humanDna(protocol),
    protocol,
  };
}

/**
 * Compact single-line DNA suitable for a clipboard or a QR code:
 * `FLX1.<base64url payload>.<8 hex checksum>`.
 */
export function encodeDnaString(protocol: Protocol): string {
  const payload = base64UrlEncode(utf8Encode(JSON.stringify(exportDnaDocument(protocol))));
  const checksum = sha256Hex(payload).slice(0, 8);
  return `${DNA_PREFIX}${protocol.schemaVersion}.${payload}.${checksum}`;
}

export type DnaImportResult =
  | { ok: true; document: DnaDocument; fingerprintMatches: boolean; dspVersionMatches: boolean }
  | { ok: false; error: string };

export function decodeDnaString(text: string): DnaImportResult {
  const trimmed = text.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3 || !parts[0].startsWith(DNA_PREFIX)) {
    return { ok: false, error: 'This does not look like a FREQUENCY LAB DNA string.' };
  }
  const [, payload, checksum] = parts;
  if (sha256Hex(payload).slice(0, 8) !== checksum) {
    return { ok: false, error: 'The DNA string is damaged — its checksum does not match.' };
  }
  let document: DnaDocument;
  try {
    document = JSON.parse(utf8Decode(base64UrlDecode(payload))) as DnaDocument;
  } catch {
    return { ok: false, error: 'The DNA payload could not be read.' };
  }
  if (document.format !== 'frequencylab.protocol-dna' || !document.protocol) {
    return { ok: false, error: 'The DNA payload is not a protocol document.' };
  }
  return {
    ok: true,
    document,
    fingerprintMatches: protocolFingerprint(document.protocol) === document.fingerprint,
    dspVersionMatches: document.protocol.dspVersion === DSP_VERSION,
  };
}

export interface DnaVerification {
  matches: boolean;
  expected: string;
  actual: string;
  schemaSupported: boolean;
  dspVersionMatches: boolean;
  /** Present when the protocol was made by a different engine version. */
  note?: string;
}

/**
 * VERIFY DNA. Confirms that a protocol still hashes to its recorded
 * fingerprint, and reports honestly when the engine that renders it is not the
 * engine that produced it.
 */
export function verifyDna(protocol: Protocol, expectedFingerprint: string): DnaVerification {
  const actual = protocolFingerprint(protocol);
  const dspVersionMatches = protocol.dspVersion === DSP_VERSION;
  const schemaSupported = protocol.schemaVersion <= PROTOCOL_SCHEMA_VERSION;
  return {
    matches: actual === expectedFingerprint,
    expected: expectedFingerprint,
    actual,
    schemaSupported,
    dspVersionMatches,
    note: dspVersionMatches
      ? undefined
      : `This protocol was created with DSP ${protocol.dspVersion}; this build runs ${DSP_VERSION}. The configuration is intact, but rendered audio may differ.`,
  };
}

export { toHex };
