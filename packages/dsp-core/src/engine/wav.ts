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
 * The bytes before the samples: RIFF, fmt, any metadata, and the data header.
 *
 * Split out so a caller that cannot hold the whole render in memory can still
 * produce a byte-identical file. `frames` is written into the size fields, so
 * it has to be the number the caller is actually going to write — a header
 * claiming more samples than follow it is a truncated file, and one claiming
 * fewer is a file with a tail no decoder will read.
 */
export function wavHeader(
  frames: number,
  sampleRate: number,
  options: WavEncodeOptions = {},
): Uint8Array {
  const bitDepth = options.bitDepth ?? 24;
  const channels = 2;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const dataBytes = frames * blockAlign;
  const listChunk = buildListChunk(options.metadata);

  const headerBytes = 12 + 24 + listChunk.length + 8;
  const buffer = new ArrayBuffer(headerBytes);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  const writeAscii = (text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset++, text.charCodeAt(i));
  };

  writeAscii('RIFF');
  // The whole file minus the eight bytes of `RIFF` and this field, including
  // the pad byte an odd data chunk carries.
  view.setUint32(offset, headerBytes + dataBytes + (dataBytes % 2) - 8, true);
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

  return bytes;
}

/**
 * Encodes samples to PCM, a chunk at a time.
 *
 * The dither is the reason this is an object rather than a function. It is a
 * deterministic TPDF sequence so that an export rendered twice is
 * byte-identical, which means its state has to continue across chunk
 * boundaries: restarting it per chunk would produce a different — and
 * chunk-size-dependent — file from the same audio.
 *
 * 32-bit writes IEEE float (format 3) and is lossless for the engine's internal
 * representation; 16 and 24 bit write PCM with dither, because truncating a
 * long quiet fade without it produces audible quantisation distortion — exactly
 * the artefact a reference export must not introduce (§55).
 */
export class WavPcmEncoder {
  private ditherState = 0x2545f491;

  constructor(private readonly bitDepth: WavBitDepth = 24) {}

  private nextDither(): number {
    this.ditherState ^= this.ditherState << 13;
    this.ditherState ^= this.ditherState >>> 17;
    this.ditherState ^= this.ditherState << 5;
    this.ditherState >>>= 0;
    return this.ditherState / 4294967296 - 0.5;
  }

  /** One chunk of interleaved PCM. `frames` may be fewer than the arrays hold. */
  encode(left: Float32Array, right: Float32Array, frames: number): Uint8Array {
    const bytesPerSample = this.bitDepth / 8;
    const bytes = new Uint8Array(frames * 2 * bytesPerSample);
    const view = new DataView(bytes.buffer);
    let offset = 0;

    for (let i = 0; i < frames; i++) {
      for (let channel = 0; channel < 2; channel++) {
        const sample = clamp(channel === 0 ? left[i] : right[i], -1, 1);
        if (this.bitDepth === 32) {
          view.setFloat32(offset, sample, true);
          offset += 4;
        } else if (this.bitDepth === 24) {
          const scale = 8388607;
          const dithered = sample * scale + (this.nextDither() + this.nextDither());
          const value = Math.max(-8388608, Math.min(8388607, Math.round(dithered)));
          const unsigned = value < 0 ? value + 0x1000000 : value;
          view.setUint8(offset++, unsigned & 0xff);
          view.setUint8(offset++, (unsigned >> 8) & 0xff);
          view.setUint8(offset++, (unsigned >> 16) & 0xff);
        } else {
          const scale = 32767;
          const dithered = sample * scale + (this.nextDither() + this.nextDither());
          view.setInt16(offset, Math.max(-32768, Math.min(32767, Math.round(dithered))), true);
          offset += 2;
        }
      }
    }
    return bytes;
  }
}

/** The pad byte an odd-length data chunk needs, or nothing. */
export function wavPadding(frames: number, bitDepth: WavBitDepth = 24): Uint8Array {
  return (frames * 2 * (bitDepth / 8)) % 2 === 1 ? new Uint8Array(1) : new Uint8Array(0);
}

/**
 * Encodes a whole interleaved stereo WAV in one buffer.
 *
 * Built from the same three pieces a streaming caller uses, so the two cannot
 * drift: this is the convenient path, not a second implementation of the
 * format. Anything long enough for the allocation to matter should stream.
 */
export function encodeWav(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  options: WavEncodeOptions = {},
): Uint8Array {
  const bitDepth = options.bitDepth ?? 24;
  const frames = Math.min(left.length, right.length);
  const header = wavHeader(frames, sampleRate, options);
  const pcm = new WavPcmEncoder(bitDepth).encode(left, right, frames);
  const pad = wavPadding(frames, bitDepth);

  const bytes = new Uint8Array(header.length + pcm.length + pad.length);
  bytes.set(header, 0);
  bytes.set(pcm, header.length);
  if (pad.length > 0) bytes.set(pad, header.length + pcm.length);
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
