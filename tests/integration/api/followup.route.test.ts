import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/followup/route";
import { resetEnvCache } from "@/server/env";
import { resetFollowupCache } from "@/server/followup/answer";
import { resetRateLimits } from "@/server/security/rate-limit";

const ENV_KEYS = [
  "TUTOR_TEST_PROVIDERS",
  "NARRATION_TOKEN_SECRET",
  "RATE_LIMIT_FOLLOWUP_PER_10MIN",
  "TUTOR_FAKE_LLM_FAULT",
] as const;

function reset(): void {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.TUTOR_TEST_PROVIDERS = "1";
  process.env.NARRATION_TOKEN_SECRET = "route-test-secret-route-test-secret-01";
  resetEnvCache();
  resetRateLimits();
  resetFollowupCache();
}

beforeEach(reset);
afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  resetEnvCache();
  resetFollowupCache();
});

const sampleContext = {
  lessonId: "lesson-test-01",
  topic: "Binary Search",
  objective: "Understand divide and conquer",
  difficulty: "beginner" as const,
  transcript: [
    { segmentId: "seg1", sceneId: "sc1", text: "Welcome to binary search." },
    { segmentId: "seg2", sceneId: "sc2", text: "Here is the sorted array." },
  ],
  scenes: [
    { id: "sc1", title: "Introduction" },
    { id: "sc2", title: "The Array" },
  ],
  recap: ["Sorted arrays only", "O(log n) efficiency"],
};

const post = (body: unknown, ip = "9.9.9.9") =>
  POST(
    new Request("http://x/api/followup", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "x-forwarded-for": ip },
    }),
  );

describe("POST /api/followup", () => {
  it("returns 200 with turnId, answer, sceneRef, and illustration when valid", async () => {
    const res = await post({
      turnId: "turn-001",
      lessonContext: sampleContext,
      history: [],
      question: "Can you show me a trigger_valid_illustration?",
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.turnId).toBe("turn-001");
    expect(typeof data.answer).toBe("string");
    expect(data.sceneRef).toBe("sc2");
    expect(data.illustration).toBeDefined();
    expect(data.illustration.actions.length).toBeGreaterThan(0);
    expect(data.illustration.durationSec).toBe(4);
  });

  it.each([
    ["an empty question", ""],
    ["a whitespace-only question", "     "],
    ["a question over 500 characters", "a".repeat(501)],
  ])("rejects %s after trimming with a 400", async (_name, question) => {
    const res = await post({
      turnId: "turn-bad-q",
      lessonContext: sampleContext,
      history: [],
      question,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatchObject({ kind: "invalid_input" });
  });

  it("rejects history with more than 10 turns with a 400", async () => {
    const history = Array.from({ length: 11 }, (_, i) => ({
      question: `Question ${i + 1}`,
      answer: `Answer ${i + 1}`,
    }));

    const res = await post({
      turnId: "turn-over-history",
      lessonContext: sampleContext,
      history,
      question: "Is 11 turns too many?",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatchObject({
      kind: "invalid_input",
      message: expect.stringMatching(/history/i),
    });
  });

  it("drops an unknown sceneRef not present in lessonContext", async () => {
    const res = await post({
      turnId: "turn-unknown-scene",
      lessonContext: sampleContext,
      history: [],
      question: "Check with trigger_unknown_scene please",
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.turnId).toBe("turn-unknown-scene");
    expect(data.answer).toBeDefined();
    expect(data.sceneRef).toBeUndefined();
  });

  it("drops an invalid illustration and keeps the answer", async () => {
    const res = await post({
      turnId: "turn-invalid-ill",
      lessonContext: sampleContext,
      history: [],
      question: "Please check trigger_invalid_illustration",
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.turnId).toBe("turn-invalid-ill");
    expect(data.answer).toBeDefined();
    expect(data.illustration).toBeUndefined();
  });

  it("returns an identical cached response for the same turnId without a second provider call", async () => {
    const payload = {
      turnId: "idempotency-turn-123",
      lessonContext: sampleContext,
      history: [],
      question: "First time asking",
    };

    const res1 = await post(payload);
    expect(res1.status).toBe(200);
    const data1 = await res1.json();

    // Now break the provider: if it calls the provider, it will fail
    process.env.TUTOR_FAKE_LLM_FAULT = "all_fail";

    const res2 = await post(payload);
    expect(res2.status).toBe(200);
    const data2 = await res2.json();

    expect(data2).toEqual(data1);
  });

  it("rejects an oversized body exceeding 32 KB with a 413", async () => {
    const largeQuestion = "x".repeat(33 * 1024);
    const res = await post({
      turnId: "turn-large",
      lessonContext: sampleContext,
      history: [],
      question: largeQuestion,
    });

    expect(res.status).toBe(413);
  });

  it("enforces rate limit of 30 per 10 minutes (429)", async () => {
    process.env.RATE_LIMIT_FOLLOWUP_PER_10MIN = "3";
    resetEnvCache();
    resetRateLimits();

    for (let i = 0; i < 3; i++) {
      const res = await post(
        {
          turnId: `rate-turn-${i}`,
          lessonContext: sampleContext,
          history: [],
          question: `Question ${i}`,
        },
        "10.0.0.1",
      );
      expect(res.status).toBe(200);
    }

    const blocked = await post(
      {
        turnId: "rate-turn-blocked",
        lessonContext: sampleContext,
        history: [],
        question: "One too many",
      },
      "10.0.0.1",
    );

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeDefined();
    const data = await blocked.json();
    expect(data.error.kind).toBe("rate_limited");
  });
});
