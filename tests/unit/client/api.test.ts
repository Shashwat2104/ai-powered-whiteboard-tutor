import { describe, expect, it } from "vitest";
import { ClientError, postLesson, postNarration } from "@/lib/client/api";
import { validLesson } from "../../fixtures/lessons";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  (async () => Response.json(body, { status, headers })) as unknown as typeof fetch;

const lessonBody = {
  lesson: validLesson(),
  narration: { providerOrder: ["elevenlabs", "google"], tokens: { s1: "t" }, expiresAt: "2026-11-16T13:00:00Z" },
};

async function failure(promise: Promise<unknown>): Promise<ClientError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ClientError);
  return error as ClientError;
}

describe("postLesson", () => {
  it("returns a validated lesson and narration plan", async () => {
    const result = await postLesson({ topic: "x", difficulty: "beginner" }, undefined, json(lessonBody));
    expect(result.lesson.id).toBe(validLesson().id);
    expect(result.narration.providerOrder).toEqual(["elevenlabs", "google"]);
  });

  it("maps the server error envelope, including the retry delay", async () => {
    const envelope = { error: { kind: "rate_limited", message: "Slow down.", retryAfterSec: 42 } };
    const error = await failure(postLesson({ topic: "x", difficulty: "beginner" }, undefined, json(envelope, 429)));
    expect(error).toMatchObject({ kind: "rate_limited", message: "Slow down.", retryAfterSec: 42 });
  });

  it("rejects a lesson that does not match the schema", async () => {
    const bad = { ...lessonBody, lesson: { ...validLesson(), segments: [] } };
    const error = await failure(postLesson({ topic: "x", difficulty: "beginner" }, undefined, json(bad)));
    expect(error.kind).toBe("generation_failed");
  });

  it("reports a network failure", async () => {
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const error = await failure(postLesson({ topic: "x", difficulty: "beginner" }, undefined, offline));
    expect(error.kind).toBe("network");
  });

  it("reports an abort separately from a network failure", async () => {
    const aborted = (async () => {
      throw new DOMException("aborted", "AbortError");
    }) as unknown as typeof fetch;
    const error = await failure(postLesson({ topic: "x", difficulty: "beginner" }, undefined, aborted));
    expect(error.kind).toBe("aborted");
  });

  it("uses a generic error for non-JSON failures", async () => {
    const html = (async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch;
    const error = await failure(postLesson({ topic: "x", difficulty: "beginner" }, undefined, html));
    expect(error.kind).toBe("internal");
  });
});

describe("postNarration", () => {
  const request = { lessonId: "l", segmentId: "s1", text: "t", provider: "google" as const, token: "tok" };

  it("validates the narration response", async () => {
    const body = { segmentId: "s1", provider: "google", voice: "v", sampleRate: 24000, durationSec: 1, marks: [], audioBase64: "AAAA" };
    expect((await postNarration(request, undefined, json(body))).segmentId).toBe("s1");
  });

  it("rejects a response with the wrong sample rate", async () => {
    const body = { segmentId: "s1", provider: "google", voice: "v", sampleRate: 44100, durationSec: 1, marks: [], audioBase64: "AAAA" };
    expect((await failure(postNarration(request, undefined, json(body)))).kind).toBe("generation_failed");
  });
});
