import "server-only";
import type { MarkerInfo } from "@/lib/lesson/markers";
import type { Mark } from "./types";

export interface CharAlignment {
  characters: readonly string[];
  characterStartTimesSeconds: readonly number[];
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Spread marks across the clip in proportion to where they sit in the text. */
export function estimateMarks(spokenLength: number, marks: readonly MarkerInfo[], durationSec: number): Mark[] {
  const length = Math.max(1, spokenLength);
  return marks.map((m) => ({ name: m.name, timeSec: clamp((durationSec * m.offset) / length, 0, durationSec), estimated: true }));
}

/**
 * Time of each marker from per-character start times: the start of the first character at or
 * after the marker. If the provider normalised the text so the lengths differ, the index is
 * scaled and the marks are flagged as estimated.
 */
export function marksFromAlignment(
  spokenText: string,
  marks: readonly MarkerInfo[],
  alignment: CharAlignment | undefined,
  durationSec: number,
): Mark[] {
  const starts = alignment?.characterStartTimesSeconds;
  if (!starts || starts.length === 0) return estimateMarks(spokenText.length, marks, durationSec);

  const exact = starts.length === spokenText.length;
  return marks.map((m) => {
    if (m.offset >= spokenText.length) return { name: m.name, timeSec: durationSec, estimated: !exact };
    const index = exact ? m.offset : Math.round((m.offset / spokenText.length) * starts.length);
    const time = starts[Math.min(index, starts.length - 1)] ?? durationSec;
    return { name: m.name, timeSec: clamp(time, 0, durationSec), estimated: !exact };
  });
}
