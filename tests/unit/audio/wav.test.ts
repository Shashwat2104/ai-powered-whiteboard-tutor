import { describe, expect, it } from "vitest";
import {
  encodeWavBytes,
  joinPcm,
  parseWav,
  pcmDurationSec,
  pcmFromBase64Wav,
  SAMPLE_RATE,
  silence,
  wavBlob,
  WavError,
} from "@/lib/audio/wav";

const tone = (samples: number): Int16Array => Int16Array.from({ length: samples }, (_, i) => Math.round(Math.sin(i / 10) * 12000));

describe("wav", () => {
  it("uses 24 kHz", () => {
    expect(SAMPLE_RATE).toBe(24000);
  });

  it("round-trips PCM through encode and parse", () => {
    const pcm = tone(2400);
    const parsed = parseWav(encodeWavBytes(pcm));
    expect(parsed.sampleRate).toBe(24000);
    expect(parsed.channels).toBe(1);
    expect(Array.from(parsed.pcm)).toEqual(Array.from(pcm));
  });

  it("writes a 44 byte header", () => {
    expect(encodeWavBytes(tone(100)).byteLength).toBe(44 + 200);
  });

  it("joins PCM chunks in order and sums lengths", () => {
    const joined = joinPcm([Int16Array.of(1, 2), Int16Array.of(3), Int16Array.of(4, 5, 6)]);
    expect(Array.from(joined)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("computes duration from sample count", () => {
    expect(pcmDurationSec(24000)).toBe(1);
    expect(pcmDurationSec(12000)).toBe(0.5);
  });

  it("creates silence of the right length", () => {
    const s = silence(0.5);
    expect(s).toHaveLength(12000);
    expect(s.every((v) => v === 0)).toBe(true);
  });

  it("rejects stereo and non-24k audio with a typed error", () => {
    expect(() => parseWav(encodeWavBytes(tone(100), 24000, 2))).toThrow(WavError);
    expect(() => parseWav(encodeWavBytes(tone(100), 48000, 1))).toThrow(/unsupported/);
  });

  it("rejects bytes that are not a WAV file", () => {
    expect(() => parseWav(new Uint8Array([1, 2, 3, 4]))).toThrow(WavError);
  });

  it("tolerates a streaming header whose data size is 0xFFFFFFFF", () => {
    const bytes = encodeWavBytes(tone(500));
    new DataView(bytes.buffer, bytes.byteOffset).setUint32(40, 0xffffffff, true);
    expect(parseWav(bytes).pcm).toHaveLength(500);
  });

  it("decodes a base64 WAV", () => {
    const pcm = tone(300);
    const b64 = Buffer.from(encodeWavBytes(pcm)).toString("base64");
    expect(Array.from(pcmFromBase64Wav(b64))).toEqual(Array.from(pcm));
  });

  it("builds an audio/wav Blob", () => {
    const blob = wavBlob(tone(100));
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(244);
  });
});
