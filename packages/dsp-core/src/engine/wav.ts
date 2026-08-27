import { clamp } from '../math/util.js';
import { utf8Encode } from '../protocol/sha256.js';

export type WavBitDepth = 16 | 24 | 32;

export interface WavMetadata {
  title?: string;
  artist?: string;
  /** Free-form comment. FREQUENCY LAB writes the protocol DNA document here. */
  comment?: string;
  software?: string;
}

export interface WavEncodeOptions {
  bitDepth?: WavBitDepth;
  metadata?: WavMetadata;
}

/**
 * Encodes an interleaved stereo WAV.
 *
 * 32-bit writes IEEE float (format 3) and is lossless for the engine's internal
 * representation; 16 and 24 bit write PCM with TPDF dither, because truncating
 * a long quiet fade without dither produces audible quantisation distortion —
 * exactly the artefact a reference export must not introduce (§55).
 */
export function encodeWav(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  options: WavEncodeOptions = {},
): Uint8Array {
  const bitDepth = options.bitDepth ?? 24;
  const frames = Math.min(left.length, right.length);
  const channels = 2;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const dataBytes = frames * blockAlign;
  const listChunk = buildListChunk(options.metadata);

  const headerBytes = 12 + 24 + listChunk.length + 8;
  const buffer = new ArrayBuffer(headerBytes + dataBytes + (dataBytes % 2));
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  const writeAscii = (text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset++, text.charCodeAt(i));
  };

  writeAscii('RIFF');
  view.setUint32(offset, buffer.byteLength - 8, true);
  offset += 4;
  writeAscii('WAVE');

  writeAscii('fmt ');
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, bitDepth === 32 ? 3 : 1, true);
  offset += 2;
  view.setUint16(offset, channels, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate * blockAlign, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, bitDepth, true);
  offset += 2;

  if (listChunk.length > 0) {
    bytes.set(listChunk, offset);
    offset += listChunk.length;
  }

  writeAscii('data');
  view.setUint32(offset, dataBytes, true);
  offset += 4;

  // Deterministic TPDF dither: an export rendered twice is byte-identical.
  let ditherState = 0x2545f491;
  const nextDither = (): number => {
    ditherState ^= ditherState << 13;
    ditherState ^= ditherState >>> 17;
    ditherState ^= ditherState << 5;
    ditherState >>>= 0;
    return ditherState / 4294967296 - 0.5;
  };

  for (let i = 0; i < frames; i++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = clamp(channel === 0 ? left[i] : right[i], -1, 1);
      if (bitDepth === 32) {
        view.setFloat32(offset, sample, true);
        offset += 4;
      } else if (bitDepth === 24) {
        const scale = 8388607;
        const dithered = sample * scale + (nextDither() + nextDither());
        const value = Math.max(-8388608, Math.min(8388607, Math.round(dithered)));
        const unsigned = value < 0 ? value + 0x1000000 : value;
        view.setUint8(offset++, unsigned & 0xff);
        view.setUint8(offset++, (unsigned >> 8) & 0xff);
        view.setUint8(offset++, (unsigned >> 16) & 0xff);
      } else {
        const scale = 32767;
        const dithered = sample * scale + (nextDither() + nextDither());
        view.setInt16(offset, Math.max(-32768, Math.min(32767, Math.round(dithered))), true);
        offset += 2;
      }
    }
  }

  return bytes;
}

function buildListChunk(metadata?: WavMetadata): Uint8Array {
  if (!metadata) return new Uint8Array(0);
  const entries: Array<[string, string]> = [];
  if (metadata.title) entries.push(['INAM', metadata.title]);
  if (metadata.artist) entries.push(['IART', metadata.artist]);
  if (metadata.software) entries.push(['ISFT', metadata.software]);
  if (metadata.comment) entries.push(['ICMT', metadata.comment]);
  if (entries.length === 0) return new Uint8Array(0);

  const encoded = entries.map(([id, value]) => {
    const payload = utf8Encode(`${value}\0`);
    const padded = payload.length % 2 === 0 ? payload.length : payload.length + 1;
    return { id, payload, padded };
  });

  const listBody = encoded.reduce((sum, entry) => sum + 8 + entry.padded, 4);
  const buffer = new Uint8Array(8 + listBody);
  const view = new DataView(buffer.buffer);
  let offset = 0;
  const writeAscii = (text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset++, text.charCodeAt(i));
  };

  writeAscii('LIST');
  view.setUint32(offset, listBody, true);
  offset += 4;
  writeAscii('INFO');

  for (const entry of encoded) {
    writeAscii(entry.id);
    view.setUint32(offset, entry.payload.length, true);
    offset += 4;
    buffer.set(entry.payload, offset);
    offset += entry.padded;
  }

  return buffer;
}
