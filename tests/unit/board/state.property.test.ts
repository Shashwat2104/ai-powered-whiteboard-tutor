import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { boardStateAt, type BoardState } from "@/lib/board/state";
import { extractMarkers } from "@/lib/lesson/markers";
import { resolveTimeline, type SegmentAudio } from "@/lib/timeline/resolve";
import { validLesson } from "../../fixtures/lessons";

const lesson = validLesson();
const markCounts = lesson.segments.map((s) => extractMarkers(s.text).marks.map((m) => m.name));

const audioArb = fc.tuple(
  ...lesson.segments.map((_, i) =>
    fc
      .tuple(
        fc.double({ min: 3, max: 40, noNaN: true }),
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
          minLength: markCounts[i]!.length,
          maxLength: markCounts[i]!.length,
        }),
      )
      .map(([durationSec, fractions]): SegmentAudio => ({
        segmentId: lesson.segments[i]!.id,
        durationSec,
        marks: [...fractions]
          .sort((a, b) => a - b)
          .map((f, k) => ({ name: markCounts[i]![k]!, timeSec: f * durationSec })),
      })),
  ),
);

const normalize = (s: BoardState) => ({
  sceneId: s.sceneId,
  activeSegmentId: s.activeSegmentId,
  elements: s.elements.map((element) => {
    const { progress, token, ...rest } = element;
    void progress;
    return { ...rest, hasToken: token !== undefined };
  }),
});

describe("boardStateAt properties", () => {
  it("is deterministic: same inputs give deep-equal output", () => {
    fc.assert(
      fc.property(audioArb, fc.double({ min: 0, max: 250, noNaN: true }), (audio, t) => {
        const tl = resolveTimeline(lesson, audio);
        const a = boardStateAt(lesson, tl, t, { reducedMotion: false });
        const b = boardStateAt(lesson, tl, t, { reducedMotion: false });
        expect(a).toEqual(b);
      }),
      { numRuns: 200 },
    );
  });

  it("is path independent: visiting other times first does not change the result at t", () => {
    fc.assert(
      fc.property(
        audioArb,
        fc.array(fc.double({ min: 0, max: 250, noNaN: true }), { maxLength: 8 }),
        fc.double({ min: 0, max: 250, noNaN: true }),
        (audio, detours, t) => {
          const tl = resolveTimeline(lesson, audio);
          const direct = boardStateAt(lesson, tl, t, { reducedMotion: false });
          for (const d of detours) boardStateAt(lesson, tl, d, { reducedMotion: false });
          expect(boardStateAt(lesson, tl, t, { reducedMotion: false })).toEqual(direct);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("never shows an element whose action time is after t", () => {
    fc.assert(
      fc.property(audioArb, fc.double({ min: 0, max: 250, noNaN: true }), (audio, t) => {
        const tl = resolveTimeline(lesson, audio);
        const state = boardStateAt(lesson, tl, t, { reducedMotion: false });
        for (const element of state.elements) {
          const timed = tl.actions.find((a) => a.id === element.id);
          expect(timed).toBeDefined();
          expect(timed!.timeSec).toBeLessThanOrEqual(t);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("reduced motion changes only progress values, never which elements exist", () => {
    fc.assert(
      fc.property(audioArb, fc.double({ min: 0, max: 250, noNaN: true }), (audio, t) => {
        const tl = resolveTimeline(lesson, audio);
        const full = boardStateAt(lesson, tl, t, { reducedMotion: false });
        const reduced = boardStateAt(lesson, tl, t, { reducedMotion: true });
        expect(normalize(reduced)).toEqual(normalize(full));
      }),
      { numRuns: 200 },
    );
  });
});
