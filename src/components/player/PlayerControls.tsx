"use client";

import { Play, Pause, RotateCcw, RotateCw, RefreshCw } from "lucide-react";
import type { PlaybackController } from "@/lib/playback/controller";
import { usePlayback } from "@/lib/client/usePlayback";
import { Timeline, type SceneMarker } from "./Timeline";

interface PlayerControlsProps {
  controller: PlaybackController;
  scenes?: readonly SceneMarker[];
  className?: string;
}

export function PlayerControls({
  controller,
  scenes = [],
  className = "",
}: PlayerControlsProps) {
  const {
    mode,
    isPlaying,
    isEnded,
    isReady,
    positionSec,
    durationSec,
    togglePlay,
    restart,
    replay,
    seek,
  } = usePlayback(controller);

  const disabled = !isReady || mode === "idle" || mode === "generating" || mode === "narrating" || mode === "error";

  const handleBack10 = () => {
    if (disabled) return;
    seek(Math.max(0, positionSec - 10));
  };

  const handleForward10 = () => {
    if (disabled) return;
    seek(Math.min(durationSec, positionSec + 10));
  };

  return (
    <div
      className={`flex flex-col gap-3 p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs ${className}`}
      aria-label="Lesson Playback Controls"
    >
      {/* Interactive Timeline Scrubbing Slider */}
      <Timeline
        positionSec={positionSec}
        durationSec={durationSec}
        scenes={scenes}
        onSeek={seek}
        disabled={disabled}
      />

      {/* Button Controls Toolbar */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Restart Button */}
          <button
            type="button"
            onClick={restart}
            disabled={disabled}
            className="inline-flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
            aria-label="Restart lesson from beginning"
          >
            <RefreshCw className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
          </button>

          {/* Rewind 10 Seconds */}
          <button
            type="button"
            onClick={handleBack10}
            disabled={disabled}
            className="inline-flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
            aria-label="Rewind 10 seconds"
          >
            <RotateCcw className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
          </button>

          {/* Primary Play / Pause / Replay Button */}
          {isEnded ? (
            <button
              type="button"
              onClick={replay}
              className="inline-flex items-center justify-center w-12 h-12 min-w-[44px] min-h-[44px] rounded-xl bg-indigo-700 hover:bg-indigo-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white shadow-xs transition-transform active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              aria-label="Replay lesson"
            >
              <RotateCcw className="w-5 h-5 stroke-[2.2]" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={togglePlay}
              disabled={disabled}
              className="inline-flex items-center justify-center w-12 h-12 min-w-[44px] min-h-[44px] rounded-xl bg-indigo-700 hover:bg-indigo-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white shadow-xs transition-transform active:scale-95 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              aria-label={isPlaying ? "Pause lesson" : "Play lesson"}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" aria-hidden="true" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" aria-hidden="true" />
              )}
            </button>
          )}

          {/* Forward 10 Seconds */}
          <button
            type="button"
            onClick={handleForward10}
            disabled={disabled}
            className="inline-flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
            aria-label="Forward 10 seconds"
          >
            <RotateCw className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
          </button>
        </div>

        {/* State Indicator Pill */}
        <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 text-slate-700 dark:text-slate-300">
          <span
            className={`w-2 h-2 rounded-full ${
              mode === "playing"
                ? "bg-emerald-500 animate-pulse"
                : mode === "paused"
                ? "bg-amber-500"
                : "bg-slate-400 dark:bg-slate-500"
            }`}
            aria-hidden="true"
          />
          <span>{mode === "playing" ? "Playing" : mode === "paused" ? "Paused" : mode === "ended" ? "Ended" : "Ready"}</span>
        </div>
      </div>
    </div>
  );
}
