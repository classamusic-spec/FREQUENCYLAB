import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  DSP_VERSION,
  SessionRenderer,
  encodeWav,
  exportDnaDocument,
  protocolDna,
  totalDurationSec,
  type Protocol,
  type WavBitDepth,
} from '@frequencylab/dsp-core';

/**
 * Reference signal export (§55).
 *
 * The render runs on the JS thread in chunks with a yield between them, so a
 * multi-minute export reports progress instead of freezing the app. Output
 * carries the protocol name, the DSP version and the full DNA document in the
 * WAV's INFO chunk — which is what makes the file a reproducible artefact
 * rather than just audio.
 */

export interface ExportOptions {
  bitDepth?: WavBitDepth;
  sampleRate?: number;
  /** Seconds to render. Defaults to the whole protocol. */
  maxSeconds?: number;
  onProgress?: (fraction: number) => void;
}

export interface ExportResult {
  uri: string;
  filename: string;
  bytes: number;
  durationSec: number;
  truncated: boolean;
}

/** Bytes a render will occupy, for the size warning shown before starting. */
export function estimateBytes(
  durationSec: number,
  sampleRate: number,
  bitDepth: WavBitDepth,
): number {
  return Math.round(durationSec * sampleRate * 2 * (bitDepth / 8)) + 4096;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function exportProtocolToWav(
  protocol: Protocol,
  options: ExportOptions = {},
): Promise<ExportResult> {
  const sampleRate = options.sampleRate ?? protocol.sampleRate;
  const bitDepth = options.bitDepth ?? 16;
  const fullDuration = totalDurationSec(protocol);
  const durationSec = Math.min(fullDuration, options.maxSeconds ?? fullDuration);
  const totalFrames = Math.round(durationSec * sampleRate);

  const renderer = new SessionRenderer(protocol, { sampleRate, compile: 'eager' });
  const left = new Float32Array(totalFrames);
  const right = new Float32Array(totalFrames);

  // One second of audio per chunk, then yield: long enough to be efficient,
  // short enough that progress stays responsive.
  const chunkFrames = sampleRate;
  const blockL = new Float32Array(chunkFrames);
  const blockR = new Float32Array(chunkFrames);

  let produced = 0;
  while (produced < totalFrames) {
    const frames = Math.min(chunkFrames, totalFrames - produced);
    renderer.render(blockL, blockR, frames);
    left.set(blockL.subarray(0, frames), produced);
    right.set(blockR.subarray(0, frames), produced);
    produced += frames;
    options.onProgress?.(produced / totalFrames);
    await yieldToUi();
  }

  const dna = protocolDna(protocol);
  const bytes = encodeWav(left, right, sampleRate, {
    bitDepth,
    metadata: {
      title: protocol.name,
      software: `FREQUENCY LAB · DSP ${DSP_VERSION}`,
      artist: protocol.meta.author,
      comment: JSON.stringify(exportDnaDocument(protocol)),
    },
  });

  const directory = new Directory(Paths.document, 'exports');
  if (!directory.exists) directory.create({ intermediates: true });

  const filename = `${slug(protocol.name)}-${dna.shortFingerprint}.wav`;
  const file = new File(directory, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);

  return {
    uri: file.uri,
    filename,
    bytes: bytes.byteLength,
    durationSec,
    truncated: durationSec < fullDuration,
  };
}

/** Writes the DNA document as a JSON file and offers it to the share sheet. */
export async function exportDnaFile(protocol: Protocol): Promise<ExportResult> {
  const dna = protocolDna(protocol);
  const directory = new Directory(Paths.document, 'exports');
  if (!directory.exists) directory.create({ intermediates: true });

  const filename = `${slug(protocol.name)}-${dna.shortFingerprint}.flxdna.json`;
  const file = new File(directory, filename);
  if (file.exists) file.delete();
  file.create();
  const payload = JSON.stringify(exportDnaDocument(protocol), null, 2);
  file.write(payload);

  return {
    uri: file.uri,
    filename,
    bytes: payload.length,
    durationSec: 0,
    truncated: false,
  };
}

export async function share(uri: string, mimeType: string, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) return;
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: title, UTI: mimeType });
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'protocol';
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
