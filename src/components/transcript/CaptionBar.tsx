"use client";

import { useState } from "react";

export interface CaptionBarProps {
  currentText?: string;
  className?: string;
}

export function CaptionBar({ currentText, className = "" }: CaptionBarProps) {
  const [enabled, setEnabled] = useState(true);

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-900/95 dark:bg-slate-900/95 backdrop-blur-md text-white rounded-xl shadow-xs text-sm border border-slate-800 ${className}`}
      data-testid="caption-bar"
    >
      {/* Captions Text Area */}
      <div className="flex-1 min-h-[1.5rem] flex items-center overflow-hidden">
        {enabled ? (
          <p
            className="text-xs sm:text-sm text-slate-100 font-medium leading-relaxed truncate"
            aria-live="off"
            data-testid="caption-text"
          >
            {currentText || "..."}
          </p>
        ) : (
          <p className="text-xs text-slate-400 italic">Captions are turned off.</p>
        )}
      </div>

      {/* Toggle Button */}
      <button
        type="button"
        onClick={() => setEnabled((prev) => !prev)}
        aria-pressed={enabled}
        data-testid="captions-toggle-btn"
        className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
          enabled
            ? "bg-indigo-600 text-white hover:bg-indigo-500 shadow-2xs"
            : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700"
        }`}
      >
        <span className="font-mono text-[10px] uppercase font-bold tracking-wider">CC</span>
        <span>{enabled ? "On" : "Off"}</span>
      </button>
    </div>
  );
}
