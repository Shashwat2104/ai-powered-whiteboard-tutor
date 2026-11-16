import { extractMarkers } from "@/lib/lesson/markers";
import type { Lesson } from "@/lib/lesson/schema";
import { resolveTimeline, type SegmentAudio, type Timeline } from "@/lib/timeline/resolve";
import { validLesson } from "./lessons";

/** Fixed per-segment durations (seconds) for the fixture lesson: starts 0, 10, 18, 27, 37, 47, total 56. */
export const AUDIO_DURATIONS = [10, 8, 9, 10, 10, 9] as const;

/** Seconds from the start of its segment at which each marker is spoken. */
export const AUDIO_MARKS: Record<string, number> = { m1: 6, m2: 2, m3: 6, m4: 3, m5: 6, m6: 4, m7: 5, m8: 4 };

export function fixedAudio(lesson: Lesson = validLesson()): SegmentAudio[] {
  return lesson.segments.map((segment, i) => ({
    segmentId: segment.id,
    durationSec: AUDIO_DURATIONS[i] ?? 10,
    marks: extractMarkers(segment.text).marks.map((m) => ({ name: m.name, timeSec: AUDIO_MARKS[m.name] ?? 0 })),
  }));
}

export function buildTimeline(lesson: Lesson = validLesson()): Timeline {
  return resolveTimeline(lesson, fixedAudio(lesson));
}
