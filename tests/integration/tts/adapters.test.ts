import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { encodeWavBytes } from "@/lib/audio/wav";
import { ElevenLabsSynth } from "@/server/tts/elevenlabs";
import { GoogleSynth } from "@/server/tts/google";
import { TtsError } from "@/server/tts/types";
import { mockServer } from "../../helpers/msw";

const server = mockServer();

const tone = (samples: number): Int16Array => Int16Array.from({ length: samples }, (_, i) => (i % 100) * 10);
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");
const pcmBytes = (pcm: Int16Array): Uint8Array => new Uint8Array(pcm.buffer.slice(0, pcm.byteLength));

const ELEVEN = "https://api.elevenlabs.io/v1/text-to-speech/:voice/with-timestamps";
const eleven = () => new ElevenLabsSynth({ apiKey: "xi-test", voiceId: "voice-1", modelId: "eleven_flash_v2_5" });
const SPOKEN = "Hello world";

function elevenOk(pcm: Int16Array) {
  return HttpResponse.json({
    audio_base64: b64(pcmBytes(pcm)),
    alignment: {
      characters: [...SPOKEN],
      character_start_times_seconds: [...SPOKEN].map((_, i) => i * 0.05),
      character_end_times_seconds: [...SPOKEN].map((_, i) => i * 0.05 + 0.05),
    },
  });
}

async function expectKind(promise: Promise<unknown>, kind: string): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(TtsError);
  expect((error as TtsError).kind).toBe(kind);
}

describe("ElevenLabsSynth", () => {
  it("requests 24 kHz PCM with timestamps and maps marks from the character alignment", async () => {
    let seen: { url: URL; key: string | null; body: Record<string, unknown> } | undefined;
    server.use(
      http.post(ELEVEN, async ({ request }) => {
        seen = { url: new URL(request.url), key: request.headers.get("xi-api-key"), body: (await request.json()) as Record<string, unknown> };
        return elevenOk(tone(24000));
      }),
    );
    const result = await eleven().synthesize({ text: "Hello [[m1]]world", previousText: "Before [[m9]]this", nextText: "After" });

    expect(seen?.key).toBe("xi-test");
    expect(seen?.url.searchParams.get("output_format")).toBe("pcm_24000");
    expect(seen?.body).toMatchObject({ text: SPOKEN, model_id: "eleven_flash_v2_5", previous_text: "Before this", next_text: "After" });
    expect(result.durationSec).toBe(1);
    expect(result.pcm).toHaveLength(24000);
    expect(result.marks).toHaveLength(1);
    expect(result.marks[0]).toMatchObject({ name: "m1", estimated: false });
    expect(result.marks[0]!.timeSec).toBeCloseTo(0.3, 6);
    expect(result).toMatchObject({ provider: "elevenlabs", voice: "voice-1" });
  });

  it("reports exhausted credits as a quota error", async () => {
    server.use(http.post(ELEVEN, () => HttpResponse.json({ detail: { status: "quota_exceeded", message: "no credits" } }, { status: 401 })));
    await expectKind(eleven().synthesize({ text: SPOKEN }), "quota");
  });

  it("reports rate limits, server errors and plan restrictions", async () => {
    server.use(http.post(ELEVEN, () => HttpResponse.json({ detail: "busy" }, { status: 429 })));
    await expectKind(eleven().synthesize({ text: SPOKEN }), "rate_limited");
    server.use(http.post(ELEVEN, () => new HttpResponse("boom", { status: 500 })));
    await expectKind(eleven().synthesize({ text: SPOKEN }), "server");
    server.use(http.post(ELEVEN, () => HttpResponse.json({ detail: { status: "paid_plan_required" } }, { status: 402 })));
    await expectKind(eleven().synthesize({ text: SPOKEN }), "failed");
    await expectKind(eleven().synthesize({ text: SPOKEN }), "failed");
  });

  it("retries once as WAV when the plan rejects the PCM output format", async () => {
    const formats: (string | null)[] = [];
    server.use(
      http.post(ELEVEN, ({ request }) => {
        const format = new URL(request.url).searchParams.get("output_format");
        formats.push(format);
        if (format === "pcm_24000") return HttpResponse.json({ detail: { message: "output_format not allowed on your plan" } }, { status: 403 });
        return HttpResponse.json({ audio_base64: b64(encodeWavBytes(tone(12000))), alignment: null });
      }),
    );
    const result = await eleven().synthesize({ text: "Hi [[m1]]there" });
    expect(formats).toEqual(["pcm_24000", "wav_24000"]);
    expect(result.durationSec).toBe(0.5);
    expect(result.marks[0]).toMatchObject({ name: "m1", estimated: true });
  });
});

const GOOGLE = "https://texttospeech.googleapis.com/v1beta1/text:synthesize";
const google = () => new GoogleSynth({ apiKey: "g-test", voice: "en-US-Neural2-D" });

describe("GoogleSynth", () => {
  it("asks for SSML mark timepoints and maps them to marks", async () => {
    let seen: { key: string | null; body: Record<string, unknown> } | undefined;
    server.use(
      http.post(GOOGLE, async ({ request }) => {
        seen = { key: request.headers.get("x-goog-api-key"), body: (await request.json()) as Record<string, unknown> };
        return HttpResponse.json({ audioContent: b64(encodeWavBytes(tone(24000))), timepoints: [{ markName: "m1", timeSeconds: 0.4 }] });
      }),
    );
    const result = await google().synthesize({ text: "Hello [[m1]]world [[m2]]again" });

    expect(seen?.key).toBe("g-test");
    expect(JSON.stringify(seen?.body.input)).toContain('<mark name=\\"m1\\"/>');
    expect(seen?.body).toMatchObject({
      enableTimePointing: ["SSML_MARK"],
      audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 24000 },
      voice: { languageCode: "en-US", name: "en-US-Neural2-D" },
    });
    expect(result.durationSec).toBe(1);
    expect(result.marks[0]).toEqual({ name: "m1", timeSec: 0.4, estimated: false });
    expect(result.marks[1]).toMatchObject({ name: "m2", estimated: true });
  });

  it("maps HTTP failures to error kinds", async () => {
    server.use(http.post(GOOGLE, () => new HttpResponse("{}", { status: 429 })));
    await expectKind(google().synthesize({ text: "Hi" }), "rate_limited");
    server.use(http.post(GOOGLE, () => new HttpResponse("{}", { status: 503 })));
    await expectKind(google().synthesize({ text: "Hi" }), "server");
    server.use(http.post(GOOGLE, () => new HttpResponse("{}", { status: 400 })));
    await expectKind(google().synthesize({ text: "Hi" }), "failed");
  });

  it("handles network failure and timeout", async () => {
    server.use(http.post(GOOGLE, () => HttpResponse.error()));
    await expectKind(google().synthesize({ text: "Hi" }), "server");
  });

  it("treats a response with no audio as a failure", async () => {
    server.use(http.post(GOOGLE, () => HttpResponse.json({})));
    await expectKind(google().synthesize({ text: "Hi" }), "failed");
  });
});
