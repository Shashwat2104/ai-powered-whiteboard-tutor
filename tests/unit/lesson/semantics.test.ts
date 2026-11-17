import { describe, expect, it } from "vitest";
import type { LessonDraft, Segment, VisualAction } from "@/lib/lesson/schema";
import { wordCount } from "@/lib/lesson/markers";
import { onlyCosmeticIssues, validateLessonSemantics } from "@/lib/lesson/semantics";
import { validDraft, withSegment, words } from "../../fixtures/lessons";

function expectError(draft: LessonDraft, code: string, path: string): void {
  expect(validateLessonSemantics(draft)).toContainEqual(expect.objectContaining({ code, path }));
}

function patchAction(draft: LessonDraft, seg: number, act: number, patch: Partial<VisualAction>): LessonDraft {
  const segment = draft.segments[seg]!;
  const actions = segment.actions.map((a, i) => (i === act ? ({ ...a, ...patch } as VisualAction) : a));
  return withSegment(draft, seg, { actions });
}

describe("validateLessonSemantics", () => {
  it("accepts the valid fixture", () => {
    expect(validateLessonSemantics(validDraft())).toEqual([]);
  });

  it("fixture narration is within 220-400 words", () => {
    const total = validDraft().segments.reduce((n, s) => n + wordCount(s.text), 0);
    expect(total).toBeGreaterThanOrEqual(220);
    expect(total).toBeLessThanOrEqual(400);
  });

  it("MARK_MISSING: action anchored to a marker not in the text", () => {
    expectError(patchAction(validDraft(), 0, 0, { at: "m9" }), "MARK_MISSING", "segments[0].actions[0]");
  });

  it("MARK_UNUSED: marker in the text that no action uses", () => {
    const draft = withSegment(validDraft(), 0, { actions: [validDraft().segments[0]!.actions[1]!] });
    expectError(draft, "MARK_UNUSED", "segments[0].text");
  });

  it("MARK_DUPLICATE: marker name used twice in the lesson", () => {
    const s2 = validDraft().segments[1]!;
    const draft = withSegment(validDraft(), 1, { text: `${s2.text} [[m1]]extra` });
    expectError(draft, "MARK_DUPLICATE", "segments[1].text");
  });

  it("REF_UNKNOWN: target that was never created", () => {
    expectError(patchAction(validDraft(), 1, 1, { target: "ghost" } as Partial<VisualAction>), "REF_UNKNOWN", "segments[1].actions[1]");
  });

  it("REF_UNKNOWN: array cell index out of range", () => {
    expectError(patchAction(validDraft(), 1, 1, { target: "arr[9]" } as Partial<VisualAction>), "REF_UNKNOWN", "segments[1].actions[1]");
  });

  it("REF_UNKNOWN: target erased earlier", () => {
    const draft = withSegment(validDraft(), 5, {
      actions: [
        { id: "e1", type: "erase", at: "start", target: "apps" },
        { id: "e2", type: "erase", at: "m8", target: "apps" },
      ],
    });
    expectError(draft, "REF_UNKNOWN", "segments[5].actions[1]");
  });

  it("REF_UNKNOWN: target left behind by a clearing scene", () => {
    const draft = patchAction(validDraft(), 4, 1, { type: "highlight", target: "arr[0]" } as Partial<VisualAction>);
    expectError(draft, "REF_UNKNOWN", "segments[4].actions[1]");
  });

  it("ID_DUPLICATE: two actions share an id", () => {
    expectError(patchAction(validDraft(), 0, 1, { id: "t1" }), "ID_DUPLICATE", "segments[0].actions[1]");
  });

  it("OUT_OF_BOUNDS: element extends past the board", () => {
    expectError(patchAction(validDraft(), 0, 1, { x: 1500 } as Partial<VisualAction>), "OUT_OF_BOUNDS", "segments[0].actions[1]");
  });

  it("OVERLAP: two elements overlap by more than 15% of the smaller", () => {
    const moved = patchAction(validDraft(), 0, 1, { x: 400, y: 60, w: 300, h: 100 } as Partial<VisualAction>);
    expectError(moved, "OVERLAP", "segments[0].actions[1]");
  });

  it("TEXT_TOO_LONG: board text over 12 words", () => {
    const draft = patchAction(validDraft(), 2, 4, { text: words(13) } as Partial<VisualAction>);
    expectError(draft, "TEXT_TOO_LONG", "segments[2].actions[4]");
  });

  it("TEXT_TOO_LONG: board text over 80 characters", () => {
    const draft = patchAction(validDraft(), 2, 4, { text: "x".repeat(81) } as Partial<VisualAction>);
    expectError(draft, "TEXT_TOO_LONG", "segments[2].actions[4]");
  });

  it("NARRATION_LENGTH: a little short of the two-minute target", () => {
    const short = (s: Segment): Segment => ({ ...s, text: words(32) }); // 6 x 32 = 192 words
    const draft = { ...validDraft(), segments: validDraft().segments.map(short) };
    expectError(draft, "NARRATION_LENGTH", "segments");
  });

  it("NARRATION_TOO_SHORT: under the hard floor, far from two minutes", () => {
    const short = (s: Segment): Segment => ({ ...s, text: words(15) }); // 90 words
    const draft = { ...validDraft(), segments: validDraft().segments.map(short) };
    expectError(draft, "NARRATION_TOO_SHORT", "segments");
  });

  it("NARRATION_LENGTH: too long", () => {
    const long = (s: Segment): Segment => ({ ...s, text: words(70) });
    const draft = { ...validDraft(), segments: validDraft().segments.map(long) };
    expectError(draft, "NARRATION_LENGTH", "segments");
  });

  it("SEGMENT_LENGTH: under 15 and over 70 words", () => {
    expectError(withSegment(validDraft(), 2, { text: words(14) }), "SEGMENT_LENGTH", "segments[2].text");
    expectError(withSegment(validDraft(), 2, { text: words(71) }), "SEGMENT_LENGTH", "segments[2].text");
  });

  it("PHASE_ORDER: phases go backwards", () => {
    expectError(withSegment(validDraft(), 1, { phase: "recap" }), "PHASE_ORDER", "segments[2].phase");
  });

  it("PHASE_ORDER: no demonstration segment", () => {
    const draft = withSegment(withSegment(validDraft(), 2, { phase: "application" }), 3, { phase: "application" });
    expectError(draft, "PHASE_ORDER", "segments");
  });

  it("SCENE_COVERAGE: a segment is left out of every scene", () => {
    const draft = validDraft();
    const scenes = draft.scenes.map((s, i) => (i === 1 ? { ...s, segmentIds: ["s3"] } : s));
    expectError({ ...draft, scenes }, "SCENE_COVERAGE", "scenes");
  });

  it("ANSWER_INDEX: out of range", () => {
    const draft = validDraft();
    const knowledgeChecks = draft.knowledgeChecks.map((q) => ({ ...q, answerIndex: 5 }));
    expectError({ ...draft, knowledgeChecks }, "ANSWER_INDEX", "knowledgeChecks[0]");
  });

  it("ANSWER_INDEX: duplicate options", () => {
    const draft = validDraft();
    const knowledgeChecks = draft.knowledgeChecks.map((q) => ({ ...q, options: ["a", "a", "b"] }));
    expectError({ ...draft, knowledgeChecks }, "ANSWER_INDEX", "knowledgeChecks[0]");
  });

  it("SCENE_REF: unknown scene", () => {
    const draft = validDraft();
    const knowledgeChecks = draft.knowledgeChecks.map((q) => ({ ...q, sceneRef: "nope" }));
    expectError({ ...draft, knowledgeChecks }, "SCENE_REF", "knowledgeChecks[0].sceneRef");
  });

  it("NO_VISUALS: a scene without any creating action", () => {
    const draft = withSegment(withSegment(validDraft(), 4, { actions: [] }), 5, { actions: [] });
    expectError(draft, "NO_VISUALS", "scenes[2]");
  });

  it("DIM_WHOLE_ARRAY: dimming an array instead of its cells", () => {
    expectError(patchAction(validDraft(), 2, 1, { target: "arr" } as Partial<VisualAction>), "DIM_WHOLE_ARRAY", "segments[2].actions[1]");
  });

  it("LATE_VISUAL: a segment whose only action fires at its end", () => {
    const draft = withSegment(validDraft(), 2, { actions: [validDraft().segments[2]!.actions[4]!] });
    expectError(draft, "LATE_VISUAL", "segments[2]");
  });

  it("LATE_VISUAL: a segment that draws nothing", () => {
    expectError(withSegment(validDraft(), 3, { actions: [] }), "LATE_VISUAL", "segments[3]");
  });

  it("LATE_FIRST_VISUAL: the first element appears long after the lesson starts", () => {
    expectError(patchAction(patchAction(validDraft(), 0, 0, { at: "end" }), 0, 1, { at: "end" }), "LATE_FIRST_VISUAL", "segments[0]");
  });

  it("skips pacing rules for a follow-up illustration", () => {
    const issues = validateLessonSemantics(withSegment(validDraft(), 0, { actions: [] }), { illustration: true });
    expect(issues.some((e) => e.code === "LATE_VISUAL" || e.code === "LATE_FIRST_VISUAL")).toBe(false);
  });
});

describe("onlyCosmeticIssues", () => {
  const issue = (code: string) => ({ code, path: "p", message: "m" });

  it.each([
    "NARRATION_LENGTH",
    "SEGMENT_LENGTH",
    "OVERLAP",
    "TEXT_TOO_LONG",
    "PHASE_ORDER",
    "NO_VISUALS",
    "DIM_WHOLE_ARRAY",
    "LATE_VISUAL",
    "LATE_FIRST_VISUAL",
  ])("tolerates %s", (code) => {
    expect(onlyCosmeticIssues([issue(code)])).toBe(true);
  });

  it.each([
    "MARK_SYNTAX",
    "MARK_MISSING",
    "MARK_UNUSED",
    "MARK_DUPLICATE",
    "REF_UNKNOWN",
    "ID_DUPLICATE",
    "OUT_OF_BOUNDS",
    "SCENE_COVERAGE",
    "ANSWER_INDEX",
    "SCENE_REF",
    "NARRATION_TOO_SHORT",
  ])("rejects %s, which would break or gut the lesson", (code) => {
    expect(onlyCosmeticIssues([issue("OVERLAP"), issue(code)])).toBe(false);
  });

  it("does not treat an empty list as a reason to tolerate anything", () => {
    expect(onlyCosmeticIssues([])).toBe(true);
  });
});
