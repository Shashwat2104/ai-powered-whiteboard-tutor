import { describe, expect, it } from "vitest";
import { resolveTimeline } from "@/lib/timeline/resolve";
import { estimateAudio } from "@/lib/timeline/estimate";
import { buildTimeline, fixedAudio } from "../../fixtures/audio";
import { validLesson } from "../../fixtures/lessons";

describe("resolveTimeline", () => {
  const timeline = buildTimeline();
  const at = (id: string) => timeline.actions.find((a) => a.id === id)?.timeSec;

  it("starts each segment where the previous one ends", () => {
    expect(timeline.segments.map((s) => [s.id, s.startSec, s.endSec])).toEqual([
      ["s1", 0, 10],
      ["s2", 10, 18],
      ["s3", 18, 27],
      ["s4", 27, 37],
      ["s5", 37, 47],
      ["s6", 47, 56],
    ]);
    expect(timeline.totalSec).toBe(56);
  });

  it("derives scene ranges from their segments", () => {
    expect(timeline.scenes.map((s) => [s.id, s.startSec, s.endSec])).toEqual([
      ["sc1", 0, 18],
      ["sc2", 18, 37],
      ["sc3", 37, 56],
    ]);
  });

  it("maps a marker to segment start plus the mark time", () => {
    expect(at("t1")).toBe(6);
    expect(at("arr")).toBe(12);
    expect(at("n1")).toBe(16);
    expect(at("eq")).toBe(51);
  });

  it("maps 'start' to the segment start and 'end' to the segment end", () => {
    expect(at("h3")).toBe(37);
    expect(at("e1")).toBe(47);
    expect(at("b1")).toBe(10);
    expect(at("c1")).toBe(27);
  });

  it("sorts actions by time and keeps authored order on ties", () => {
    const times = timeline.actions.map((a) => a.timeSec);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    const tied = timeline.actions.filter((a) => a.timeSec === 24).map((a) => a.id);
    expect(tied).toEqual(["d1", "d2", "d3"]);
  });

  it("assigns scene and segment ids to every action", () => {
    const eq = timeline.actions.find((a) => a.id === "eq");
    expect(eq).toMatchObject({ segmentId: "s6", sceneId: "sc3" });
  });

  it("uses per-type default draw durations and respects explicit ones", () => {
    expect(timeline.actions.find((a) => a.id === "t1")?.drawSec).toBe(0.8);
    expect(timeline.actions.find((a) => a.id === "tv")?.drawSec).toBe(1.5);
    const lesson = validLesson();
    const first = lesson.segments[0]!;
    const patched = {
      ...lesson,
      segments: [
        { ...first, actions: first.actions.map((a) => (a.id === "t1" ? { ...a, drawSec: 2 } : a)) },
        ...lesson.segments.slice(1),
      ],
    };
    const again = resolveTimeline(patched, fixedAudio(patched));
    expect(again.actions.find((a) => a.id === "t1")?.drawSec).toBe(2);
  });

  it("clamps a mark time to the segment duration", () => {
    const audio = fixedAudio().map((a, i) => (i === 0 ? { ...a, marks: [{ name: "m1", timeSec: 99 }] } : a));
    const clamped = resolveTimeline(validLesson(), audio);
    expect(clamped.actions.find((a) => a.id === "t1")?.timeSec).toBe(10);
  });

  it("counts marks that were estimated rather than timed", () => {
    const audio = fixedAudio().map((a) => ({
      ...a,
      marks: a.marks.map((m) => ({ ...m, estimated: m.name === "m2" || m.name === "m3" })),
    }));
    expect(resolveTimeline(validLesson(), audio).estimatedMarks).toBe(2);
  });

  it("throws when a segment has no audio entry", () => {
    expect(() => resolveTimeline(validLesson(), fixedAudio().slice(1))).toThrow(/s1/);
  });
});

describe("estimateAudio", () => {
  it("estimates duration at 2.5 words per second with proportional marks flagged as estimated", () => {
    const lesson = validLesson();
    const audio = estimateAudio(lesson);
    expect(audio).toHaveLength(lesson.segments.length);
    for (const entry of audio) {
      expect(entry.durationSec).toBeGreaterThan(5);
      for (const mark of entry.marks) {
        expect(mark.estimated).toBe(true);
        expect(mark.timeSec).toBeGreaterThanOrEqual(0);
        expect(mark.timeSec).toBeLessThanOrEqual(entry.durationSec);
      }
    }
    expect(resolveTimeline(lesson, audio).estimatedMarks).toBe(8);
  });
});
