import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";
import { POST } from "@/app/api/narration/route";
import { parseWav } from "@/lib/audio/wav";
import { resetEnvCache } from "@/server/env";
import { signNarrationToken } from "@/server/security/narration-token";
import { resetRateLimits } from "@/server/security/rate-limit";

const SECRET = "route-test-secret-route-test-secret-01";
const ENV_KEYS = ["TUTOR_TEST_PROVIDERS", "NARRATION_TOKEN_SECRET", "RATE_LIMIT_NARRATION_PER_10MIN", "TUTOR_FAKE_TTS_FAULT"] as const;

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.TUTOR_TEST_PROVIDERS = "1";
  process.env.NARRATION_TOKEN_SECRET = SECRET;
  resetEnvCache();
  resetRateLimits();
});
afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  resetEnvCache();
});

const TEXT = "Hello [[m1]]world, this is a short segment of narration for the test.";
const token = (over: Partial<Parameters<typeof signNarrationToken>[0]> = {}) =>
  signNarrationToken({ lessonId: "lesson-1", segmentId: "s1", text: TEXT, secret: SECRET, ...over });

const payload = (over: Record<string, unknown> = {}) => ({
  lessonId: "lesson-1",
  segmentId: "s1",
  text: TEXT,
  provider: "google",
  token: token(),
  ...over,
});
const post = (body: unknown) =>
  POST(new Request("http://x/api/narration", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": "7.7.7.7" } }));

describe("POST /api/narration", () => {
  it("returns WAV audio whose length matches the reported duration, with timed marks", async () => {
    const res = await post(payload({ previousText: "Before.", nextText: "After." }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ segmentId: "s1", provider: "google", sampleRate: 24000 });
    const { pcm } = parseWav(Buffer.from(body.audioBase64, "base64"));
    expect(pcm.length / 24000).toBeCloseTo(body.durationSec, 3);
    expect(body.marks).toHaveLength(1);
    expect(body.marks[0]).toMatchObject({ name: "m1" });
    expect(body.marks[0].timeSec).toBeLessThanOrEqual(body.durationSec);
  });

  it("uses only the provider that was requested", async () => {
    const body = await (await post(payload({ provider: "elevenlabs" }))).json();
    expect(body.provider).toBe("elevenlabs");
  });

  it.each([
    ["changed text", payload({ text: `${TEXT} extra` })],
    ["a different segment", payload({ segmentId: "s2" })],
    ["a different lesson", payload({ lessonId: "lesson-2" })],
    ["an expired token", payload({ token: token({ now: 1000, ttlSec: 10 }) })],
    ["a token signed with another secret", payload({ token: token({ secret: "another-secret-another-secret-123456" }) })],
  ])("returns 403 for %s", async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(403);
    expect((await res.json()).error.kind).toBe("unauthorized_narration");
  });

  it("rejects an unknown provider and malformed bodies with 400", async () => {
    expect((await post(payload({ provider: "azure" }))).status).toBe(400);
    expect((await post({ nonsense: true })).status).toBe(400);
  });

  it("rejects an oversized body with 413", async () => {
    expect((await post(payload({ previousText: "x".repeat(20000) }))).status).toBe(413);
  });

  it("rate limits a client", async () => {
    process.env.RATE_LIMIT_NARRATION_PER_10MIN = "2";
    resetEnvCache();
    expect((await post(payload())).status).toBe(200);
    expect((await post(payload())).status).toBe(200);
    expect((await post(payload())).status).toBe(429);
  });

  it("returns 502 with a plain message when the voice provider fails", async () => {
    process.env.TUTOR_FAKE_TTS_FAULT = "all_fail";
    const res = await post(payload());
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toMatch(/google|fake|elevenlabs/i);
  });
});

describe("GET /api/health", () => {
  it("lists configured providers without revealing any key or secret", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ ok: true, llm: ["anthropic", "gemini"], tts: ["elevenlabs", "google"] });
    expect(text).not.toContain(SECRET);
  });

  it("reports 503 when the server is misconfigured", async () => {
    delete process.env.NARRATION_TOKEN_SECRET;
    resetEnvCache();
    const res = GET();
    expect(res.status).toBe(503);
    expect((await res.json()).ok).toBe(false);
  });
});
