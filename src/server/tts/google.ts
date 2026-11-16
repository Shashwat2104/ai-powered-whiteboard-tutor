import "server-only";
import { SAMPLE_RATE, bytesFromBase64, parseWav } from "@/lib/audio/wav";
import { extractMarkers } from "@/lib/lesson/markers";
import { estimateMarks } from "./alignment";
import { getAccessToken, type ServiceAccount } from "./google-auth";
import { toSsml } from "./ssml";
import { TtsError, type Mark, type SpeechSynth, type SynthesisResult, type SynthesizeInput } from "./types";

const ENDPOINT = "https://texttospeech.googleapis.com/v1beta1/text:synthesize";
const TIMEOUT_MS = 20_000;

export type GoogleTtsConfig = ({ apiKey: string } | { account: ServiceAccount }) & { voice: string };

interface ApiResponse {
  audioContent?: string;
  timepoints?: { markName?: string; timeSeconds?: number }[];
}

function toTtsError(status: number): TtsError {
  if (status === 429) return new TtsError("rate_limited", "Google TTS is busy", "google");
  if (status >= 500) return new TtsError("server", `Google TTS error ${status}`, "google");
  return new TtsError("failed", `Google TTS rejected the request (${status})`, "google");
}

/** Google Cloud Text-to-Speech with SSML mark timepoints. */
export class GoogleSynth implements SpeechSynth {
  readonly provider = "google" as const;

  constructor(private readonly config: GoogleTtsConfig) {}

  private async authHeaders(): Promise<Record<string, string>> {
    if ("apiKey" in this.config) return { "x-goog-api-key": this.config.apiKey };
    const token = await getAccessToken(this.config.account);
    return { authorization: `Bearer ${token}`, "x-goog-user-project": this.config.account.project_id };
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesisResult> {
    const { spokenText, marks } = extractMarkers(input.text);
    const auth = await this.authHeaders();
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({
          input: { ssml: toSsml(input.text) },
          voice: { languageCode: "en-US", name: this.config.voice },
          audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: SAMPLE_RATE },
          enableTimePointing: ["SSML_MARK"],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new TtsError(timedOut ? "timeout" : "server", timedOut ? "Google TTS timed out" : "Google TTS is unreachable", "google");
    }
    if (!res.ok) throw toTtsError(res.status);

    const body = (await res.json().catch(() => ({}))) as ApiResponse;
    if (!body.audioContent) throw new TtsError("failed", "Google TTS returned no audio", "google");
    const pcm = parseWav(bytesFromBase64(body.audioContent)).pcm;
    const durationSec = pcm.length / SAMPLE_RATE;

    const reported = new Map((body.timepoints ?? []).map((t) => [t.markName, t.timeSeconds]));
    const fallback = new Map(estimateMarks(spokenText.length, marks, durationSec).map((m) => [m.name, m]));
    const timed: Mark[] = marks.map((m) => {
      const time = reported.get(m.name);
      return typeof time === "number"
        ? { name: m.name, timeSec: Math.min(Math.max(time, 0), durationSec), estimated: false }
        : (fallback.get(m.name) as Mark);
    });
    return { pcm, durationSec, marks: timed, provider: "google", voice: this.config.voice };
  }
}
