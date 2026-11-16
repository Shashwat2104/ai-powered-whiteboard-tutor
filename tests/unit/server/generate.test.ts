import { describe, expect, it } from "vitest";
import { normalizeTopic, generateLesson, fitEnvelopeToBoard, TOPIC_MAX_CHARS } from "@/server/lesson/generate";
import { validateLessonSemantics } from "@/lib/lesson/semantics";
import { validDraft } from "../../fixtures/lessons";
import { ApiError } from "@/server/security/errors";
import { parseEnv } from "@/server/env";
import { FakeModel } from "@/server/llm/fake";

describe("generateLesson and normalizeTopic", () => {
  it("normalizes valid topics", () => {
    expect(normalizeTopic("  Binary   search\t\n ")).toBe("Binary search");
    expect(normalizeTopic("Neural networks 101")).toBe("Neural networks 101");
  });

  it("throws invalid_input on empty or whitespace-only topics", () => {
    expect(() => normalizeTopic("")).toThrow(ApiError);
    expect(() => normalizeTopic("    ")).toThrow(ApiError);
  });

  it("throws invalid_input on oversized topics", () => {
    const long = "a".repeat(TOPIC_MAX_CHARS + 5);
    expect(() => normalizeTopic(long)).toThrow(ApiError);
  });

  it("throws invalid_input on topics without letters or numbers", () => {
    expect(() => normalizeTopic("!@#$%^&*()")).toThrow(ApiError);
    expect(() => normalizeTopic("... --- ...")).toThrow(ApiError);
  });

  it("throws generation_failed when no models available", async () => {
    const env = parseEnv({
      NARRATION_TOKEN_SECRET: "test-secret-test-secret-test-secret-0000",
      TUTOR_TEST_PROVIDERS: "1",
    });

    await expect(
      generateLesson({ topic: "Photosynthesis", difficulty: "beginner" }, env, []),
    ).rejects.toThrow(ApiError);
  });

  it("handles rejected topic from model", async () => {
    const env = parseEnv({
      NARRATION_TOKEN_SECRET: "test-secret-test-secret-test-secret-0000",
      TUTOR_TEST_PROVIDERS: "1",
    });

    const fakeModel = new FakeModel("anthropic");

    await expect(
      generateLesson({ topic: "REJECT this invalid topic", difficulty: "beginner" }, env, [fakeModel]),
    ).rejects.toThrow(ApiError);
  });

  it("nudges elements that poke past the board edge back inside before validation", () => {
    const { status: _status, ...draft } = validDraft();
    void _status;
    const [first, ...rest] = draft.segments;
    const shifted = { ...first!, actions: first!.actions.map((a, i) => (i === 1 ? { ...a, x: 1500 } : a)) };
    const lesson = { ...draft, segments: [shifted, ...rest] };
    expect(validateLessonSemantics(lesson).map((e) => e.code)).toContain("OUT_OF_BOUNDS");
    const fitted = fitEnvelopeToBoard({ status: "ok", lesson });
    expect(validateLessonSemantics(fitted.lesson!).map((e) => e.code)).not.toContain("OUT_OF_BOUNDS");
    expect(lesson.segments[0]!.actions[1]).toMatchObject({ x: 1500 });
  });

  it("leaves a rejected envelope untouched", () => {
    const rejected = { status: "rejected" as const, reason: "no" };
    expect(fitEnvelopeToBoard(rejected)).toBe(rejected);
  });
});
