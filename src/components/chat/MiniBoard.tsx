"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Illustration } from "@/lib/followup/schema";
import type { LessonShape } from "@/lib/lesson/schema";
import { boardStateAt, type BoardState } from "@/lib/board/state";
import { VirtualClock } from "@/lib/playback/clock";
import { resolveTimeline } from "@/lib/timeline/resolve";
import { Whiteboard } from "../whiteboard/Whiteboard";
import { RotateCcw } from "lucide-react";

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
    <div className={`relative rounded-xl overflow-hidden border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs my-2.5 ${className}`}>
      <Whiteboard boardState={boardState} sceneTitle="Illustration" className="border-0 rounded-none shadow-none" />

      {/* Replay Overlay Button */}
      <div className="absolute bottom-2.5 right-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={handleReplay}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border border-slate-300 dark:border-slate-700 rounded-lg shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          aria-label="Replay illustration animation"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{isFinished ? "Replay" : isPlaying ? "Restart" : "Play"}</span>
        </button>
      </div>
    </div>
  );
}
