"use client";

import { Play, Pause, RotateCcw } from "lucide-react";
import type { PlaybackController } from "@/lib/playback/controller";
import { formatTime, usePlayback } from "@/lib/client/usePlayback";

interface PlayerControlsProps {
  controller: PlaybackController;
  className?: string;
}

export function PlayerControls({ controller, className = "" }: PlayerControlsProps) {
  const { mode, isPlaying, isEnded, isReady, positionSec, durationSec, togglePlay, replay } =
    usePlayback(controller);

  const disabled = !isReady || mode === "idle" || mode === "generating" || mode === "narrating" || mode === "error";

  return (
    <div
      className={`flex items-center justify-between gap-4 px-5 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm ${className}`}
      aria-label="Lesson Playback Controls"
    >
      <div className="flex items-center gap-3">
        {isEnded ? (
          <button
            type="button"
            onClick={replay}
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label="Replay lesson"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={togglePlay}
            disabled={disabled}
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white shadow-xs transition-transform active:scale-95 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label={isPlaying ? "Pause lesson" : "Play lesson"}
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>
        )}

        <div className="text-xs font-medium tabular-nums text-slate-600 dark:text-slate-400">
          <span className="font-semibold text-slate-900 dark:text-slate-100">{formatTime(positionSec)}</span>
          <span className="mx-1 text-slate-400">/</span>
          <span>{formatTime(durationSec)}</span>
        </div>
      </div>
    </div>
  );
}
