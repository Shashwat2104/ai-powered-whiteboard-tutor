"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Illustration } from "@/lib/followup/schema";
import type { LessonShape } from "@/lib/lesson/schema";
import { boardStateAt, type BoardState } from "@/lib/board/state";
import { VirtualClock } from "@/lib/playback/clock";
import { resolveTimeline } from "@/lib/timeline/resolve";
import { Whiteboard } from "../whiteboard/Whiteboard";

interface MiniBoardProps {
  illustration: Illustration;
  className?: string;
}

export function MiniBoard({ illustration, className = "" }: MiniBoardProps) {
  const lesson: LessonShape = useMemo(
    () => ({
      id: "mini-lesson",
      scenes: [{ id: "sc-mini", title: "Illustration", segmentIds: ["seg-mini"], transition: "clear" as const }],
      segments: [
        {
          id: "seg-mini",
          phase: "demonstration",
          text: "Illustration",
          actions: illustration.actions,
        },
      ],
    }),
    [illustration.actions],
  );

  const audio = useMemo(
    () => [
      {
        segmentId: "seg-mini",
        durationSec: illustration.durationSec,
        marks: [],
      },
    ],
    [illustration.durationSec],
  );

  const timeline = useMemo(() => resolveTimeline(lesson, audio), [lesson, audio]);

  const clockRef = useRef<VirtualClock | null>(null);
  const [boardState, setBoardState] = useState<BoardState>(() =>
    boardStateAt(lesson, timeline, 0, { reducedMotion: false }),
  );
  const [isPlaying, setIsPlaying] = useState(true);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    const clock = new VirtualClock(illustration.durationSec);
    clockRef.current = clock;
    void clock.play();

    let rafId: number;
    let initialized = false;
    const tick = () => {
      if (!initialized) {
        setIsPlaying(true);
        setIsFinished(false);
        initialized = true;
      }
      const t = clock.now();
      setBoardState(boardStateAt(lesson, timeline, t, { reducedMotion: false }));
      if (clock.atEnd()) {
        clock.pause();
        setIsPlaying(false);
        setIsFinished(true);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      clock.pause();
    };
  }, [lesson, timeline, illustration.durationSec]);

  const handleReplay = () => {
    if (!clockRef.current) return;
    clockRef.current.seek(0);
    void clockRef.current.play();
    setIsPlaying(true);
    setIsFinished(false);

    const tick = () => {
      if (!clockRef.current) return;
      const t = clockRef.current.now();
      setBoardState(boardStateAt(lesson, timeline, t, { reducedMotion: false }));
      if (clockRef.current.atEnd()) {
        clockRef.current.pause();
        setIsPlaying(false);
        setIsFinished(true);
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  };

  return (
    <div className={`relative rounded-lg overflow-hidden border border-slate-200 bg-white shadow-sm my-2 ${className}`}>
      <Whiteboard boardState={boardState} sceneTitle="Illustration" className="border-0 rounded-none shadow-none" />

      {/* Replay Overlay Button */}
      <div className="absolute bottom-2 right-2 flex items-center gap-2">
        <button
          type="button"
          onClick={handleReplay}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white/90 backdrop-blur border border-slate-300 rounded shadow-sm hover:bg-slate-50 transition-colors"
          aria-label="Replay illustration animation"
        >
          <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {isFinished ? "Replay" : isPlaying ? "Restart" : "Play"}
        </button>
      </div>
    </div>
  );
}
