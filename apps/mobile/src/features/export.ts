import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  DSP_VERSION,
  SessionRenderer,
  WavPcmEncoder,
  exportDnaDocument,
  protocolDna,
  totalDurationSec,
  wavHeader,
  wavPadding,
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
 *
 * **Each chunk is written to disk and then dropped.** It used to accumulate
 * into two whole-render Float32Arrays and then encode those into a third
 * buffer: a sixty-minute protocol at 48 kHz is 172.8 M frames, so 2 × 691 MB
 * of float plus the encoded WAV, with no `try` around the allocation. The
 * failure mode was the process being killed, not the export error the UI is
 * written to show. Nothing is held now but one second of audio, so length
 * costs disk and time and not memory.
 *
 * The encoder's dither state carries across chunks, which is what keeps the
 * streamed file byte-identical to a one-shot encode of the same render —
 * asserted in `session.test.ts` at every bit depth and five chunk sizes.
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
  const dna = protocolDna(protocol);
  const wavOptions = {
    bitDepth,
    metadata: {
      title: protocol.name,
      software: `FREQUENCY LAB · DSP ${DSP_VERSION}`,
      artist: protocol.meta.author,
      comment: JSON.stringify(exportDnaDocument(protocol)),
    },
  };

  const directory = new Directory(Paths.document, 'exports');
  if (!directory.exists) directory.create({ intermediates: true });

  const filename = `${slug(protocol.name)}-${dna.shortFingerprint}.wav`;
  const file = new File(directory, filename);
  if (file.exists) file.delete();
  file.create();

  // One second of audio per chunk, then yield: long enough to be efficient,
  // short enough that progress stays responsive.
  const chunkFrames = sampleRate;
  const blockL = new Float32Array(chunkFrames);
  const blockR = new Float32Array(chunkFrames);
  const encoder = new WavPcmEncoder(bitDepth);

  const writer = file.writableStream().getWriter();
  let bytesWritten = 0;
  try {
    const header = wavHeader(totalFrames, sampleRate, wavOptions);
    await writer.write(header);
    bytesWritten += header.length;

    let produced = 0;
    while (produced < totalFrames) {
      const frames = Math.min(chunkFrames, totalFrames - produced);
      renderer.render(blockL, blockR, frames);
      const pcm = encoder.encode(blockL, blockR, frames);
      await writer.write(pcm);
      bytesWritten += pcm.length;
      produced += frames;
      options.onProgress?.(produced / totalFrames);
      await yieldToUi();
    }

    const pad = wavPadding(totalFrames, bitDepth);
    if (pad.length > 0) {
      await writer.write(pad);
      bytesWritten += pad.length;
    }
    await writer.close();
  } catch (error) {
    // A half-written file is worse than none: it has a valid header claiming a
    // length it does not have, so it opens and plays silence at the end.
    await writer.abort(error).catch(() => {});
    if (file.exists) file.delete();
    throw error;
  }

  return {
    uri: file.uri,
    filename,
    bytes: bytesWritten,
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

/**
 * Hands a finished file to the system share sheet.
 *
 * Throws rather than returning quietly when sharing is unavailable — which it
 * is on the web build. A silent return here follows a render that may have
 * taken minutes, and from the outside it is indistinguishable from the export
 * having failed: the file is written and sitting in the app's documents
 * directory, and the user is told nothing at all. The caller shows this.
 */
export class SharingUnavailableError extends Error {
  constructor(readonly uri: string) {
    super(
      'This platform has no share sheet, so the file could not be handed on. It was written and is in the app’s documents folder.',
    );
    this.name = 'SharingUnavailableError';
  }
}

export async function share(uri: string, mimeType: string, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new SharingUnavailableError(uri);
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
