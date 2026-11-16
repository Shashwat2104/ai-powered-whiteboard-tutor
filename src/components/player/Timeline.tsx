"use client";

import { useState, type KeyboardEvent } from "react";
import * as Slider from "@radix-ui/react-slider";
import { formatTime } from "@/lib/client/usePlayback";

export interface SceneMarker {
  id: string;
  title?: string;
  startSec: number;
  endSec: number;
}

export interface TimelineProps {
  positionSec: number;
  durationSec: number;
  scenes?: readonly SceneMarker[];
  onSeek: (seconds: number) => void;
  className?: string;
  disabled?: boolean;
}

export function Timeline({
  positionSec,
  durationSec,
  scenes = [],
  onSeek,
  className = "",
  disabled = false,
}: TimelineProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState<number | null>(null);

  const displayTime = isDragging && dragValue !== null ? dragValue : positionSec;
  const max = Math.max(0.1, durationSec);
  const clampedPos = Math.min(max, Math.max(0, displayTime));

  const handleKeyDown = (e: KeyboardEvent) => {
    if (disabled || durationSec <= 0) return;

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onSeek(Math.max(0, positionSec - 5));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onSeek(Math.min(durationSec, positionSec + 5));
    } else if (e.key === "Home") {
      e.preventDefault();
      onSeek(0);
    } else if (e.key === "End") {
      e.preventDefault();
      onSeek(durationSec);
    }
  };

  return (
    <div className={`flex flex-col gap-1.5 w-full select-none ${className}`}>
      <div className="relative flex items-center w-full py-2">
        <Slider.Root
          min={0}
          max={max}
          step={0.1}
          value={[clampedPos]}
          disabled={disabled || durationSec <= 0}
          onValueChange={(val) => {
            setIsDragging(true);
            setDragValue(val[0] ?? 0);
          }}
          onValueCommit={(val) => {
            setIsDragging(false);
            setDragValue(null);
            if (val[0] !== undefined) onSeek(val[0]);
          }}
          className="relative flex items-center select-none touch-none w-full h-5 cursor-pointer disabled:cursor-not-allowed group"
          aria-label="Lesson Timeline"
        >
          <Slider.Track className="bg-slate-200 dark:bg-slate-700 relative grow rounded-full h-1.5 group-hover:h-2 transition-all">
            <Slider.Range className="absolute bg-blue-600 rounded-full h-full" />

            {/* Scene Tick Marks */}
            {durationSec > 0 &&
              scenes.map((scene) => {
                const percent = Math.min(100, Math.max(0, (scene.startSec / durationSec) * 100));
                return (
                  <div
                    key={scene.id}
                    data-testid="scene-tick"
                    title={scene.title}
                    style={{ left: `${percent}%` }}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-3 bg-slate-400 dark:bg-slate-500 rounded-xs hover:bg-blue-400 transition-colors pointer-events-auto"
                  />
                );
              })}
          </Slider.Track>

          <Slider.Thumb
            onKeyDown={handleKeyDown}
            aria-label="Seek lesson timeline"
            aria-valuetext={`${formatTime(positionSec)} of ${formatTime(durationSec)}`}
            aria-valuenow={Math.round(positionSec)}
            aria-valuemin={0}
            aria-valuemax={Math.round(durationSec)}
            className="block w-4 h-4 bg-white dark:bg-slate-100 border-2 border-blue-600 rounded-full shadow-sm hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-transform"
          />
        </Slider.Root>
      </div>

      <div className="flex justify-between items-center text-xs tabular-nums text-slate-500 dark:text-slate-400 px-0.5">
        <span>{formatTime(displayTime)}</span>
        <span>{formatTime(durationSec)}</span>
      </div>
    </div>
  );
}
