export const SAMPLE_RATE = 24000;
const HEADER_BYTES = 44;
const BITS = 16;

export type WavErrorCode = "invalid_wav" | "unsupported_format";

export class WavError extends Error {
  constructor(
    readonly code: WavErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WavError";
  }
}

export interface ParsedWav {
  sampleRate: number;
  channels: number;
  pcm: Int16Array;
}

const tag = (view: DataView, offset: number): string =>
  String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));

/** Read a 16-bit mono 24 kHz PCM WAV file. Anything else is rejected with a typed error. */
export function parseWav(input: ArrayBuffer | Uint8Array): ParsedWav {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < HEADER_BYTES) throw new WavError("invalid_wav", "File is too short to be a WAV file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (tag(view, 0) !== "RIFF" || tag(view, 8) !== "WAVE") throw new WavError("invalid_wav", "Not a RIFF/WAVE file");

  let format: { channels: number; sampleRate: number; bits: number; code: number } | undefined;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = tag(view, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      format = {
        code: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!format) throw new WavError("invalid_wav", "data chunk before fmt chunk");
      if (format.code !== 1 || format.bits !== BITS || format.channels !== 1 || format.sampleRate !== SAMPLE_RATE) {
        throw new WavError("unsupported_format", `unsupported WAV: need 16-bit mono ${SAMPLE_RATE} Hz PCM`);
      }
      const available = Math.min(size, bytes.byteLength - body);
      const length = available - (available % 2);
      const copy = bytes.slice(body, body + length);
      return { sampleRate: format.sampleRate, channels: format.channels, pcm: new Int16Array(copy.buffer, copy.byteOffset, length / 2) };
    }
    offset = body + size + (size % 2);
  }
  throw new WavError("invalid_wav", "No data chunk found");
}

/** Wrap 16-bit PCM in a 44-byte WAV header. */
export function encodeWavBytes(pcm: Int16Array, sampleRate = SAMPLE_RATE, channels = 1): Uint8Array {
  const dataBytes = pcm.length * 2;
  const out = new Uint8Array(HEADER_BYTES + dataBytes);
  const view = new DataView(out.buffer);
  const write = (offset: number, text: string): void => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, BITS, true);
  write(36, "data");
  view.setUint32(40, dataBytes, true);
  pcm.forEach((sample, i) => view.setInt16(HEADER_BYTES + i * 2, sample, true));
  return out;
}

export function wavBlob(pcm: Int16Array, sampleRate = SAMPLE_RATE): Blob {
  return new Blob([encodeWavBytes(pcm, sampleRate) as BlobPart], { type: "audio/wav" });
}

export function joinPcm(chunks: readonly Int16Array[]): Int16Array {
  const out = new Int16Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export const pcmDurationSec = (samples: number, sampleRate = SAMPLE_RATE): number => samples / sampleRate;

export function silence(seconds: number, sampleRate = SAMPLE_RATE): Int16Array {
  return new Int16Array(Math.round(seconds * sampleRate));
}

export function bytesFromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function pcmFromBase64Wav(b64: string): Int16Array {
  return parseWav(bytesFromBase64(b64)).pcm;
}
