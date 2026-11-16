import { describe, expect, it } from "vitest";
import { boardStateAt } from "@/lib/board/state";
import { resolveTimeline } from "@/lib/timeline/resolve";
import { buildTimeline, fixedAudio } from "../../fixtures/audio";
import { validLesson } from "../../fixtures/lessons";

const lesson = validLesson();
const timeline = buildTimeline(lesson);
const state = (t: number, reducedMotion = false) => boardStateAt(lesson, timeline, t, { reducedMotion });
const ids = (t: number) => state(t).elements.map((e) => e.id);
const el = (t: number, id: string) => state(t).elements.find((e) => e.id === id);

describe("boardStateAt", () => {
  it("shows nothing before the first action", () => {
    expect(ids(5)).toEqual([]);
    expect(state(0).sceneId).toBe("sc1");
  });

  it("draws progressively: progress is 0.5 halfway through drawSec", () => {
    expect(el(6.4, "t1")?.progress).toBeCloseTo(0.5, 5);
    expect(el(6, "t1")?.progress).toBe(0);
    expect(el(7, "t1")?.progress).toBe(1);
  });

  it("reduced motion makes new elements fully drawn at once", () => {
    expect(state(6.4, true).elements.find((e) => e.id === "t1")?.progress).toBe(1);
  });

  it("creates array cells", () => {
    expect(el(12.4, "arr")?.cells).toHaveLength(7);
    expect(el(12.4, "arr")?.progress).toBeCloseTo(0.4, 5);
  });

  it("'keep' transition retains earlier elements and 'clear' empties the board", () => {
    expect(ids(20)).toEqual(expect.arrayContaining(["t1", "b1", "arr", "n1"]));
    expect(state(20).sceneId).toBe("sc2");
    expect(ids(38)).toEqual(["h3"]);
    expect(state(38).sceneId).toBe("sc3");
  });

  it("highlight emphasizes the targeted array cell from its time", () => {
    expect(el(20, "arr")?.cells?.[3]?.emphasized).toBe(false);
    expect(el(21.5, "arr")?.cells?.[3]?.emphasized).toBe(true);
  });

  it("highlight with forSec expires", () => {
    expect(el(32, "arr")?.cells?.[5]?.emphasized).toBe(true);
    expect(el(35.5, "arr")?.cells?.[5]?.emphasized).toBe(false);
  });

  it("dim fades cells and strike crosses them out", () => {
    const cells = el(24.5, "arr")?.cells;
    expect(cells?.slice(0, 3).every((c) => c.dimmed && c.struck)).toBe(true);
    expect(cells?.[3]?.dimmed).toBe(false);
  });

  it("travel moves a token along the connector from 0 to 1", () => {
    expect(el(31.75, "ptr")?.token?.progress).toBeCloseTo(0.5, 5);
    expect(el(33, "ptr")?.token?.progress).toBe(1);
    expect(el(30, "ptr")).toBeUndefined();
  });

  it("erase removes the target", () => {
    expect(ids(43)).toContain("apps");
    expect(ids(47.5)).not.toContain("apps");
    expect(ids(52)).toContain("eq");
  });

  it("list progress follows its draw duration", () => {
    expect(el(43, "apps")?.progress).toBeCloseTo(1 / 1.2, 5);
  });

  it("erasing an element also removes attached connectors and annotations", () => {
    const target = lesson.segments[3]!;
    const patched = {
      ...lesson,
      segments: lesson.segments.map((s) =>
        s.id === target.id
          ? { ...s, actions: [...s.actions, { id: "e9", type: "erase" as const, at: "m6", target: "arr" }] }
          : s,
      ),
    };
    const tl = resolveTimeline(patched, fixedAudio(patched));
    const out = boardStateAt(patched, tl, 32, { reducedMotion: false }).elements.map((e) => e.id);
    expect(out).toEqual(expect.arrayContaining(["t1", "b1"]));
    for (const gone of ["arr", "n1", "ptr"]) expect(out).not.toContain(gone);
  });

  it("reports the active segment for the transcript", () => {
    expect(state(9.99).activeSegmentId).toBe("s1");
    expect(state(10).activeSegmentId).toBe("s2");
    expect(state(56).activeSegmentId).toBe("s6");
  });

  it("clamps times outside the lesson", () => {
    expect(state(-5).elements).toEqual([]);
    expect(state(999).sceneId).toBe("sc3");
    expect(ids(999)).toContain("eq");
  });
});
