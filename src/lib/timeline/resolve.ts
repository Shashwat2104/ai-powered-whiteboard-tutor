import type { ActionType, LessonShape, VisualAction } from "../lesson/schema";

export interface SegmentAudio {
  segmentId: string;
  durationSec: number;
  /** When each `[[mN]]` marker is spoken, in seconds from the start of this segment. */
  marks: readonly { name: string; timeSec: number; estimated?: boolean }[];
}

export interface TimedAction {
  id: string;
  segmentId: string;
  sceneId: string;
  timeSec: number;
  drawSec: number;
  action: VisualAction;
}

export interface Timeline {
  totalSec: number;
  segments: readonly { id: string; startSec: number; endSec: number }[];
  scenes: readonly { id: string; startSec: number; endSec: number }[];
  /** Sorted by time; actions at the same time keep their authored order. */
  actions: readonly TimedAction[];
  /** Number of markers whose time was estimated instead of reported by the voice service. */
  estimatedMarks: number;
}

/** How long each action type takes to draw when the lesson does not say. */
export const DEFAULT_DRAW_SEC: Readonly<Record<ActionType, number>> = {
  write: 0.8,
  shape: 0.8,
  connect: 0.6,
  array: 1.0,
  list: 1.2,
  equation: 1.0,
  annotate: 0.6,
  highlight: 0.3,
  dim: 0.4,
  travel: 1.5,
  erase: 0.3,
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function offsetInSegment(action: VisualAction, audio: SegmentAudio): number {
  if (action.at === "start") return 0;
  if (action.at === "end") return audio.durationSec;
  const mark = audio.marks.find((m) => m.name === action.at);
  return clamp(mark?.timeSec ?? 0, 0, audio.durationSec);
}

/**
 * Turn real audio timing into lesson time. `start` is the segment start, `end` is the segment
 * end, and a marker is the segment start plus the time that marker was spoken.
 */
export function resolveTimeline(lesson: LessonShape, audio: readonly SegmentAudio[]): Timeline {
  const audioById = new Map(audio.map((a) => [a.segmentId, a]));
  const sceneOfSegment = new Map(lesson.scenes.flatMap((scene) => scene.segmentIds.map((id) => [id, scene.id] as const)));

  let cursor = 0;
  let estimatedMarks = 0;
  const segments: { id: string; startSec: number; endSec: number }[] = [];
  const timed: { item: TimedAction; order: number }[] = [];

  for (const segment of lesson.segments) {
    const entry = audioById.get(segment.id);
    if (!entry) throw new Error(`Missing audio timing for segment ${segment.id}`);
    const startSec = cursor;
    segments.push({ id: segment.id, startSec, endSec: startSec + entry.durationSec });
    estimatedMarks += entry.marks.filter((m) => m.estimated).length;

    for (const action of segment.actions) {
      const item: TimedAction = {
        id: action.id,
        segmentId: segment.id,
        sceneId: sceneOfSegment.get(segment.id) ?? "",
        timeSec: startSec + offsetInSegment(action, entry),
        drawSec: action.drawSec ?? DEFAULT_DRAW_SEC[action.type],
        action,
      };
      timed.push({ item, order: timed.length });
    }
    cursor = startSec + entry.durationSec;
  }

  const actions = timed.sort((a, b) => a.item.timeSec - b.item.timeSec || a.order - b.order).map((t) => t.item);
  const scenes = lesson.scenes.map((scene) => {
    const ranges = segments.filter((s) => scene.segmentIds.includes(s.id));
    return {
      id: scene.id,
      startSec: Math.min(...ranges.map((r) => r.startSec)),
      endSec: Math.max(...ranges.map((r) => r.endSec)),
    };
  });
  return { totalSec: cursor, segments, scenes, actions, estimatedMarks };
}
