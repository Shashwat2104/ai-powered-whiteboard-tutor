"use client";

import { useEffect, useRef, useMemo } from "react";
import type { Lesson } from "@/lib/lesson/schema";
import type { Timeline } from "@/lib/timeline/resolve";
import { stripMarkers } from "@/lib/lesson/markers";
import { BookOpen } from "lucide-react";

export interface TranscriptProps {
  lesson: Lesson;
  timeline: Timeline;
  activeSegmentId?: string;
  onSeekSegment?: (segmentId: string, startSec: number) => void;
  reducedMotion?: boolean;
  className?: string;
}

export function Transcript({
  lesson,
  timeline,
  activeSegmentId,
  onSeekSegment,
  reducedMotion = false,
  className = "",
}: TranscriptProps) {
  const activeSegmentRef = useRef<HTMLButtonElement | null>(null);

  // Auto-scroll to active segment
  useEffect(() => {
    if (activeSegmentRef.current) {
      activeSegmentRef.current.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "nearest",
      });
    }
  }, [activeSegmentId, reducedMotion]);

  // Map segments to their timings in the timeline
  const segmentTimings = useMemo(() => {
    const map = new Map<string, { startSec: number; endSec: number }>();
    for (const seg of timeline.segments) {
      map.set(seg.id, { startSec: seg.startSec, endSec: seg.endSec });
    }
    return map;
  }, [timeline.segments]);

  // Map segments to their raw objects
  const segmentsById = useMemo(() => {
    const map = new Map<string, (typeof lesson.segments)[0]>();
    for (const seg of lesson.segments) {
      map.set(seg.id, seg);
    }
    return map;
  }, [lesson]);

  return (
    <div
      className={`flex flex-col h-full bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs ${className}`}
      data-testid="lesson-transcript"
    >
      {/* Header */}
      <div className="px-4 py-3.5 bg-slate-50/80 dark:bg-slate-850 border-b border-slate-200/90 dark:border-slate-800">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2 tracking-tight">
          <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400 stroke-[2.2]" aria-hidden="true" />
          <span>Lesson Transcript</span>
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
          Follow along with the narration or click any section to jump directly to it.
        </p>
      </div>

      {/* Transcript Body */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-5"
        tabIndex={0}
        aria-label="Interactive lesson transcript"
      >
        {lesson.scenes.map((scene, sceneIdx) => (
          <section key={scene.id} aria-labelledby={`scene-heading-${scene.id}`} className="space-y-2">
            <h4
              id={`scene-heading-${scene.id}`}
              className="text-xs font-semibold text-slate-700 dark:text-slate-300 px-2.5 py-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-md border border-slate-200/60 dark:border-slate-700/60"
            >
              Scene {sceneIdx + 1}: {scene.title}
            </h4>

            <div className="space-y-1.5 pl-0.5">
              {scene.segmentIds.map((segId) => {
                const seg = segmentsById.get(segId);
                if (!seg) return null;
                const timing = segmentTimings.get(segId);
                const isActive = segId === activeSegmentId;
                const spokenText = stripMarkers(seg.text);

                return (
                  <button
                    key={segId}
                    ref={isActive ? activeSegmentRef : null}
                    id={`transcript-segment-${segId}`}
                    type="button"
                    onClick={() => onSeekSegment?.(segId, timing?.startSec ?? 0)}
                    aria-current={isActive ? "true" : undefined}
                    data-segment-id={segId}
                    className={`w-full text-left p-3 rounded-xl text-sm transition-all flex flex-col gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      isActive
                        ? "bg-indigo-50/90 dark:bg-indigo-950/40 border-l-4 border-indigo-600 dark:border-indigo-500 text-slate-900 dark:text-slate-100 font-medium shadow-2xs"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100 border-l-4 border-transparent"
                    }`}
                  >
                    <div className="flex justify-between items-center text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400 font-medium">
                      <span className="capitalize font-sans font-medium text-slate-600 dark:text-slate-400">
                        {seg.phase}
                      </span>
                      {timing && (
                        <span>
                          {Math.floor(timing.startSec / 60)}:
                          {String(Math.floor(timing.startSec % 60)).padStart(2, "0")}
                        </span>
                      )}
                    </div>
                    <p className="leading-relaxed">{spokenText}</p>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
