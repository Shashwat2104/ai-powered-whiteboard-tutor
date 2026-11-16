import { extractMarkers, wordCount } from "../lesson/markers";
import type { LessonShape, Segment } from "../lesson/schema";
import type { SegmentAudio } from "./resolve";

/** Average speaking pace used when real audio timing is not available. */
export const WORDS_PER_SEC = 2.5;
const MIN_SEGMENT_SEC = 1;

/** Estimate one segment's duration and marker times from its text. Marks are flagged as estimated. */
export function estimateSegmentAudio(segment: Segment): SegmentAudio {
  const { spokenText, marks } = extractMarkers(segment.text);
  const durationSec = Math.max(MIN_SEGMENT_SEC, wordCount(segment.text) / WORDS_PER_SEC);
  const length = Math.max(1, spokenText.length);
  return {
    segmentId: segment.id,
    durationSec,
    marks: marks.map((m) => ({ name: m.name, timeSec: (durationSec * m.offset) / length, estimated: true })),
  };
}

export function estimateAudio(lesson: Pick<LessonShape, "segments">): SegmentAudio[] {
  return lesson.segments.map(estimateSegmentAudio);
}
