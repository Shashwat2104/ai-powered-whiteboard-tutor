import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/lesson/route";
import { lessonSchema } from "@/lib/lesson/schema";
import { resetEnvCache } from "@/server/env";
import { resetDailyCap } from "@/server/security/daily-cap";
import { resetRateLimits } from "@/server/security/rate-limit";

const ENV_KEYS = [
  "TUTOR_TEST_PROVIDERS",
  "NARRATION_TOKEN_SECRET",
  "RATE_LIMIT_LESSON_PER_10MIN",
  "DAILY_LESSON_CAP",
  "TUTOR_FAKE_LLM_FAULT",
] as const;

function reset(): void {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.TUTOR_TEST_PROVIDERS = "1";
  process.env.NARRATION_TOKEN_SECRET = "route-test-secret-route-test-secret-01";
  resetEnvCache();
  resetRateLimits();
  resetDailyCap();
}

beforeEach(reset);
afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  resetEnvCache();
});

const post = (body: unknown, ip = "9.9.9.9") =>
  POST(
    new Request("http://x/api/lesson", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "x-forwarded-for": ip },
    }),
  );

describe("POST /api/lesson", () => {
  it("returns a validated lesson with a narration token for every segment", async () => {
    const res = await post({ topic: "  How noise cancelling works  ", difficulty: "intermediate" });
    expect(res.status).toBe(200);
    const body = await res.json();
    const lesson = lessonSchema.parse(body.lesson);
    expect(lesson.topic).toBe("How noise cancelling works");
    expect(lesson.difficulty).toBe("intermediate");
    expect(lesson.generatedBy).toMatchObject({ provider: "anthropic", attempts: 1 });
    expect(Object.keys(body.narration.tokens).sort()).toEqual(lesson.segments.map((s) => s.id).sort());
    expect(body.narration.providerOrder).toEqual(["elevenlabs", "google"]);
    expect(Date.parse(body.narration.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("defaults the difficulty to beginner", async () => {
    const body = await (await post({ topic: "Photosynthesis" })).json();
    expect(body.lesson.difficulty).toBe("beginner");
  });

  it.each([
    ["an empty topic", { topic: "   " }, /topic/i],
    ["a topic over 200 characters", { topic: "a".repeat(201) }, /200/],
    ["an unknown difficulty", { topic: "x", difficulty: "expert" }, /difficulty/],
    ["invalid JSON", "{nope", /JSON/],
  ])("rejects %s with a 400", async (_name, body, message) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatchObject({ kind: "invalid_input", message: expect.stringMatching(message) });
  });

  it("rejects an oversized body with a 413", async () => {
    expect((await post({ topic: "x".repeat(5000) })).status).toBe(413);
  });

  it("returns 422 when the model declines the topic", async () => {
    const res = await post({ topic: "please REJECT this" });
    expect(res.status).toBe(422);
    expect((await res.json()).error.kind).toBe("rejected_topic");
  });

  it("rate limits a client after the configured number of lessons", async () => {
    process.env.RATE_LIMIT_LESSON_PER_10MIN = "2";
    resetEnvCache();
    expect((await post({ topic: "one" })).status).toBe(200);
    expect((await post({ topic: "two" })).status).toBe(200);
    const blocked = await post({ topic: "three" });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await post({ topic: "other client" }, "8.8.8.8")).status).toBe(200);
  });

  it("stops at the daily cap", async () => {
    process.env.DAILY_LESSON_CAP = "1";
    resetEnvCache();
    expect((await post({ topic: "one" })).status).toBe(200);
    const res = await post({ topic: "two" });
    expect(res.status).toBe(429);
    expect((await res.json()).error.message).toMatch(/today/i);
  });

  it("does not use up the daily cap on invalid requests", async () => {
    process.env.DAILY_LESSON_CAP = "1";
    resetEnvCache();
    expect((await post({ topic: "" })).status).toBe(400);
    expect((await post({ topic: "valid" })).status).toBe(200);
  });

  it("falls back to the second model when the first is rate limited", async () => {
    process.env.TUTOR_FAKE_LLM_FAULT = "anthropic_429";
    const body = await (await post({ topic: "Fallback" })).json();
    expect(body.lesson.generatedBy.provider).toBe("gemini");
  });

  it("repairs invalid output and reports how many attempts it took", async () => {
    process.env.TUTOR_FAKE_LLM_FAULT = "invalid_twice";
    const body = await (await post({ topic: "Repair" })).json();
    expect(body.lesson.generatedBy).toMatchObject({ provider: "anthropic", attempts: 3 });
  });

  it("returns 502 with a plain message when every model fails", async () => {
    process.env.TUTOR_FAKE_LLM_FAULT = "all_fail";
    const res = await post({ topic: "Outage" });
    expect(res.status).toBe(502);
    const error = (await res.json()).error;
    expect(error.kind).toBe("generation_failed");
    expect(JSON.stringify(error)).not.toMatch(/anthropic|gemini|fake/i);
  });
});
