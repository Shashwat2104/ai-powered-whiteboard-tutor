"use client";

import { useEffect, useRef, useMemo } from "react";
import type { Lesson } from "@/lib/lesson/schema";
import type { Timeline } from "@/lib/timeline/resolve";
import { stripMarkers } from "@/lib/lesson/markers";

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
      className={`flex flex-col h-full bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm ${className}`}
      data-testid="lesson-transcript"
    >
      {/* Header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Lesson Transcript
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Follow along with the narration or click any section to jump directly to it.
        </p>
      </div>

      {/* Transcript Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6" tabIndex={0} aria-label="Interactive lesson transcript">
        {lesson.scenes.map((scene, sceneIdx) => (
          <section key={scene.id} aria-labelledby={`scene-heading-${scene.id}`} className="space-y-2">
            <h4
              id={`scene-heading-${scene.id}`}
              className="text-xs font-bold uppercase tracking-wider text-slate-500 px-2 py-1 bg-slate-100/70 rounded"
            >
              Scene {sceneIdx + 1}: {scene.title}
            </h4>

            <div className="space-y-1.5 pl-1">
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
                    className={`w-full text-left p-2.5 rounded-lg text-sm transition-all flex flex-col gap-1 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
                      isActive
                        ? "bg-indigo-50/90 border-l-4 border-indigo-600 text-slate-900 font-medium shadow-sm"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-l-4 border-transparent"
                    }`}
                  >
                    <div className="flex justify-between items-center text-[11px] text-slate-400">
                      <span className="capitalize">{seg.phase}</span>
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
