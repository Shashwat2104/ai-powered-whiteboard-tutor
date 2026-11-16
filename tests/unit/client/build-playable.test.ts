import { describe, expect, it } from "vitest";
import { SAMPLE_RATE } from "@/lib/audio/wav";
import { buildPlayable } from "@/lib/client/build-playable";
import type { NarrationAudio } from "@/lib/client/narrate";
import { extractMarkers } from "@/lib/lesson/markers";
import { validLesson } from "../../fixtures/lessons";

const lesson = validLesson();
const SECONDS = [4, 3, 5, 4, 6, 2];

function narrated(): { provider: "elevenlabs"; audio: NarrationAudio[] } {
  return {
    provider: "elevenlabs",
    audio: lesson.segments.map((segment, i) => ({
      segmentId: segment.id,
      pcm: new Int16Array(SECONDS[i]! * SAMPLE_RATE),
      marks: extractMarkers(segment.text).marks.map((m) => ({ name: m.name, timeSec: 1.5, estimated: false })),
    })),
  };
}

describe("buildPlayable", () => {
  it("places each segment at the cumulative sample count of the segments before it", () => {
    const { timeline } = buildPlayable(lesson, narrated());
    expect(timeline.segments.map((s) => s.startSec)).toEqual([0, 4, 7, 12, 16, 22]);
    expect(timeline.totalSec).toBe(24);
  });

  it("joins the audio into one WAV exactly as long as the timeline", () => {
    const playable = buildPlayable(lesson, narrated());
    expect(playable.noAudio).toBe(false);
    expect(playable.audio?.type).toBe("audio/wav");
    expect(playable.audio?.size).toBe(44 + 2 * SAMPLE_RATE * 24);
  });

  it("anchors actions at segment start plus the spoken time of their marker", () => {
    const { timeline } = buildPlayable(lesson, narrated());
    expect(timeline.actions.find((a) => a.id === "t1")?.timeSec).toBe(1.5);
    expect(timeline.actions.find((a) => a.id === "arr")?.timeSec).toBe(4 + 1.5);
  });

  it("is independent of the order the audio arrived in", () => {
    const reversed = { ...narrated(), audio: [...narrated().audio].reverse() };
    expect(buildPlayable(lesson, reversed).timeline).toEqual(buildPlayable(lesson, narrated()).timeline);
  });

  it("falls back to an estimated timeline with no audio when narration failed", () => {
    const playable = buildPlayable(lesson, { provider: "none", audio: [] });
    expect(playable.noAudio).toBe(true);
    expect(playable.audio).toBeUndefined();
    expect(playable.timeline.estimatedMarks).toBe(8);
    expect(playable.timeline.totalSec).toBeGreaterThan(60);
  });

  it("throws when a segment's audio is missing", () => {
    const partial = narrated();
    expect(() => buildPlayable(lesson, { ...partial, audio: partial.audio.slice(1) })).toThrow(/s1/);
  });
});
