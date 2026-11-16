import { describe, expect, it } from "vitest";
import {
  ACTION_TYPES,
  lessonDraftSchema,
  lessonResponseSchema,
  lessonSchema,
  SCHEMA_VERSION,
  visualActionSchema,
} from "@/lib/lesson/schema";
import { validDraft, validLesson } from "../../fixtures/lessons";

const ok = (value: unknown) => lessonDraftSchema.safeParse(value).success;

describe("lessonDraftSchema", () => {
  it("accepts the valid fixture and declares version 1.0", () => {
    expect(SCHEMA_VERSION).toBe("1.0");
    expect(ok(validDraft())).toBe(true);
  });

  it("covers all 11 action types in the fixture", () => {
    const used = new Set(validDraft().segments.flatMap((s) => s.actions.map((a) => a.type)));
    expect([...used].sort()).toEqual([...ACTION_TYPES].sort());
    expect(ACTION_TYPES).toHaveLength(11);
  });

  it("rejects an unknown action type", () => {
    const result = visualActionSchema.safeParse({ id: "x", type: "script", at: "start", code: "alert(1)" });
    expect(result.success).toBe(false);
  });

  it("rejects free-form colors", () => {
    const action = { id: "x", type: "write", at: "start", x: 1, y: 1, text: "hi", size: "md", color: "#ff0000" };
    expect(visualActionSchema.safeParse(action).success).toBe(false);
  });

  describe("array size boundaries", () => {
    const seg = (i: number) => ({ ...validDraft().segments[0]!, id: `s${i}` });
    const sceneOf = (i: number) => ({ id: `sc${i}`, title: "t", segmentIds: ["s1"], transition: "clear" as const });

    it.each([
      [4, false],
      [5, true],
      [12, true],
      [13, false],
    ])("segments: %i items -> %s", (count, expected) => {
      const draft = { ...validDraft(), segments: Array.from({ length: count }, (_, i) => seg(i + 1)) };
      expect(ok(draft)).toBe(expected);
    });

    it.each([
      [1, false],
      [2, true],
      [8, true],
      [9, false],
    ])("scenes: %i items -> %s", (count, expected) => {
      const draft = { ...validDraft(), scenes: Array.from({ length: count }, (_, i) => sceneOf(i + 1)) };
      expect(ok(draft)).toBe(expected);
    });

    it.each([
      [1, false],
      [2, true],
      [5, true],
      [6, false],
    ])("recap key points: %i items -> %s", (count, expected) => {
      const keyPoints = Array.from({ length: count }, (_, i) => `Point ${i}`);
      expect(ok({ ...validDraft(), recap: { keyPoints } })).toBe(expected);
    });

    it.each([
      [0, false],
      [1, true],
      [3, true],
      [4, false],
    ])("knowledge checks: %i items -> %s", (count, expected) => {
      const check = validDraft().knowledgeChecks[0]!;
      const knowledgeChecks = Array.from({ length: count }, (_, i) => ({ ...check, id: `q${i + 1}` }));
      expect(ok({ ...validDraft(), knowledgeChecks })).toBe(expected);
    });

    it.each([
      [2, false],
      [3, true],
      [4, true],
      [5, false],
    ])("options: %i items -> %s", (count, expected) => {
      const check = validDraft().knowledgeChecks[0]!;
      const options = Array.from({ length: count }, (_, i) => `Option ${i}`);
      expect(ok({ ...validDraft(), knowledgeChecks: [{ ...check, options, answerIndex: 0 }] })).toBe(expected);
    });

    it("rejects duplicate options", () => {
      const check = validDraft().knowledgeChecks[0]!;
      const options = ["Same", "Same", "Other"];
      expect(ok({ ...validDraft(), knowledgeChecks: [{ ...check, options }] })).toBe(false);
    });

    it("rejects a recap key point over 12 words", () => {
      const keyPoints = ["one two three four five six seven eight nine ten eleven twelve thirteen", "ok"];
      expect(ok({ ...validDraft(), recap: { keyPoints } })).toBe(false);
    });
  });

  describe("string length boundaries", () => {
    const longer = (n: number) => "a".repeat(n);
    it.each([
      ["topic", 200, 201],
      ["objective", 200, 201],
      ["scopeNote", 160, 161],
    ])("%s: max %i chars", (field, max, over) => {
      expect(ok({ ...validDraft(), [field]: longer(max) })).toBe(true);
      expect(ok({ ...validDraft(), [field]: longer(over) })).toBe(false);
    });

    it("rejects an empty topic", () => {
      expect(ok({ ...validDraft(), topic: "" })).toBe(false);
    });

    it("scene title: max 60 chars", () => {
      const withTitle = (title: string) => {
        const d = validDraft();
        return { ...d, scenes: d.scenes.map((s, i) => (i === 0 ? { ...s, title } : s)) };
      };
      expect(ok(withTitle(longer(60)))).toBe(true);
      expect(ok(withTitle(longer(61)))).toBe(false);
    });

    it("question max 200 and explanation max 300 chars", () => {
      const check = validDraft().knowledgeChecks[0]!;
      const make = (patch: object) => ({ ...validDraft(), knowledgeChecks: [{ ...check, ...patch }] });
      expect(ok(make({ question: longer(200) }))).toBe(true);
      expect(ok(make({ question: longer(201) }))).toBe(false);
      expect(ok(make({ explanation: longer(300) }))).toBe(true);
      expect(ok(make({ explanation: longer(301) }))).toBe(false);
    });
  });

  describe("drawSec bounds 0.2 to 3.0", () => {
    const action = (drawSec: number) => ({ id: "x", type: "erase", at: "start", target: "y", drawSec });
    it.each([
      [0.1, false],
      [0.2, true],
      [3, true],
      [3.1, false],
    ])("drawSec %f -> %s", (value, expected) => {
      expect(visualActionSchema.safeParse(action(value)).success).toBe(expected);
    });
  });
});

describe("lessonResponseSchema", () => {
  it("accepts the rejected variant", () => {
    const parsed = lessonResponseSchema.safeParse({ status: "rejected", reason: "Not an educational topic." });
    expect(parsed.success).toBe(true);
  });

  it("accepts an ok draft", () => {
    expect(lessonResponseSchema.safeParse(validDraft()).success).toBe(true);
  });
});

describe("lessonSchema", () => {
  it("accepts a full lesson with server fields", () => {
    expect(lessonSchema.safeParse(validLesson()).success).toBe(true);
  });

  it("requires a UUID id", () => {
    expect(lessonSchema.safeParse({ ...validLesson(), id: "not-a-uuid" }).success).toBe(false);
  });
});
