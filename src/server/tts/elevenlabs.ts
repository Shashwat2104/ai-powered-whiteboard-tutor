import "server-only";
import { ElevenLabsClient, ElevenLabsError, ElevenLabsTimeoutError } from "@elevenlabs/elevenlabs-js";
import { SAMPLE_RATE, bytesFromBase64, parseWav } from "@/lib/audio/wav";
import { extractMarkers, stripMarkers } from "@/lib/lesson/markers";
import { marksFromAlignment, type CharAlignment } from "./alignment";
import { TtsError, type SpeechSynth, type SynthesisResult, type SynthesizeInput } from "./types";

const TIMEOUT_SEC = 20;

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
  modelId: string;
}

/** Map an SDK failure to a TtsError. Quota exhaustion stays distinct so callers can stop using this provider. */
export function toTtsError(error: unknown): TtsError {
  if (error instanceof TtsError) return error;
  if (error instanceof ElevenLabsTimeoutError) return new TtsError("timeout", "ElevenLabs timed out", "elevenlabs");
  if (error instanceof ElevenLabsError) {
    const status = error.statusCode ?? 0;
    const body = JSON.stringify(error.body ?? "");
    if (/quota/i.test(body)) return new TtsError("quota", "ElevenLabs credits are used up", "elevenlabs");
    if (status === 429) return new TtsError("rate_limited", "ElevenLabs is busy", "elevenlabs");
    if (status >= 500) return new TtsError("server", `ElevenLabs error ${status}`, "elevenlabs");
    return new TtsError("failed", `ElevenLabs rejected the request (${status})`, "elevenlabs");
  }
  const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
  return new TtsError(timedOut ? "timeout" : "server", timedOut ? "ElevenLabs timed out" : "ElevenLabs is unreachable", "elevenlabs");
}

const looksLikeFormatRejection = (error: unknown): boolean =>
  error instanceof ElevenLabsError &&
  [400, 403, 422].includes(error.statusCode ?? 0) &&
  /output_format|tier|plan/i.test(JSON.stringify(error.body ?? ""));

function pcmFromBytes(bytes: Uint8Array): Int16Array {
  const even = bytes.byteLength - (bytes.byteLength % 2);
  return new Int16Array(bytes.slice(0, even).buffer);
}

/** ElevenLabs text-to-speech with per-character timing, through the official SDK. */
export class ElevenLabsSynth implements SpeechSynth {
  readonly provider = "elevenlabs" as const;

  constructor(private readonly config: ElevenLabsConfig) {}

  async synthesize(input: SynthesizeInput): Promise<SynthesisResult> {
    const { spokenText, marks } = extractMarkers(input.text);
    const client = new ElevenLabsClient({ apiKey: this.config.apiKey });

    let format: "pcm_24000" | "wav_24000" = "pcm_24000";
    const call = (outputFormat: typeof format) =>
      client.textToSpeech.convertWithTimestamps(
        this.config.voiceId,
        {
          text: spokenText,
          modelId: this.config.modelId,
          outputFormat,
          ...(input.previousText ? { previousText: stripMarkers(input.previousText) } : {}),
          ...(input.nextText ? { nextText: stripMarkers(input.nextText) } : {}),
        },
        { timeoutInSeconds: TIMEOUT_SEC, maxRetries: 0 },
      );

    let response;
    try {
      try {
        response = await call(format);
      } catch (error) {
        if (!looksLikeFormatRejection(error)) throw error;
        format = "wav_24000";
        response = await call(format);
      }
    } catch (error) {
      throw toTtsError(error);
    }

    if (!response.audioBase64) throw new TtsError("failed", "ElevenLabs returned no audio", "elevenlabs");
    const bytes = bytesFromBase64(response.audioBase64);
    const pcm = format === "pcm_24000" ? pcmFromBytes(bytes) : parseWav(bytes).pcm;
    const durationSec = pcm.length / SAMPLE_RATE;

    const timing = response.alignment;
    const alignment: CharAlignment | undefined = timing
      ? { characters: timing.characters, characterStartTimesSeconds: timing.characterStartTimesSeconds }
      : undefined;
    return {
      pcm,
      durationSec,
      marks: marksFromAlignment(spokenText, marks, alignment, durationSec),
      provider: "elevenlabs",
      voice: this.config.voiceId,
    };
  }
}
