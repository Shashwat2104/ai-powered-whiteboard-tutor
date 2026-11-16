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
      className={`flex flex-col gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm ${className}`}
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
        <div className="flex items-center gap-2">
          {/* Restart Button */}
          <button
            type="button"
            onClick={restart}
            disabled={disabled}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            aria-label="Restart lesson from beginning"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Rewind 10 Seconds */}
          <button
            type="button"
            onClick={handleBack10}
            disabled={disabled}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            aria-label="Rewind 10 seconds"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Primary Play / Pause / Replay Button */}
          {isEnded ? (
            <button
              type="button"
              onClick={replay}
              className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="Replay lesson"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={togglePlay}
              disabled={disabled}
              className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white shadow-md transition-transform active:scale-95 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label={isPlaying ? "Pause lesson" : "Play lesson"}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>
          )}

          {/* Forward 10 Seconds */}
          <button
            type="button"
            onClick={handleForward10}
            disabled={disabled}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            aria-label="Forward 10 seconds"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* State Indicator Pill */}
        <div className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
          {mode === "playing" ? "Playing" : mode === "paused" ? "Paused" : mode === "ended" ? "Ended" : "Ready"}
        </div>
      </div>
    </div>
  );
}
