import { SAMPLE_RATE, joinPcm, pcmDurationSec, wavBlob } from "../audio/wav";
import type { Lesson } from "../lesson/schema";
import { estimateAudio } from "../timeline/estimate";
import { resolveTimeline, type SegmentAudio, type Timeline } from "../timeline/resolve";
import type { NarrateResult } from "./narrate";

export interface Playable {
  timeline: Timeline;
  /** One WAV holding every segment back to back; undefined when there is no audio. */
  audio?: Blob;
  /** True when there is no narration audio and the lesson runs on a virtual clock. */
  noAudio: boolean;
  provider: NarrateResult["provider"];
}

/**
 * Join the per-segment audio into one track and resolve the timeline from the real sample counts.
 * Segment N starts at the sum of the earlier segments' samples divided by the sample rate, which is
 * exactly where it sits in the joined WAV, so audio position and lesson time can never drift apart.
 */
export function buildPlayable(lesson: Lesson, narrated: NarrateResult): Playable {
  if (narrated.provider === "none") {
    return { timeline: resolveTimeline(lesson, estimateAudio(lesson)), noAudio: true, provider: "none" };
  }

  const byId = new Map(narrated.audio.map((a) => [a.segmentId, a]));
  const ordered = lesson.segments.map((segment) => {
    const entry = byId.get(segment.id);
    if (!entry) throw new Error(`Narration is missing for segment ${segment.id}`);
    return entry;
  });

  const segmentAudio: SegmentAudio[] = ordered.map((entry) => ({
    segmentId: entry.segmentId,
    durationSec: pcmDurationSec(entry.pcm.length, SAMPLE_RATE),
    marks: entry.marks,
  }));
  return {
    timeline: resolveTimeline(lesson, segmentAudio),
    audio: wavBlob(joinPcm(ordered.map((e) => e.pcm))),
    noAudio: false,
    provider: narrated.provider,
  };
}
