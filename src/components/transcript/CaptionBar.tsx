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
      className={`flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-900/90 backdrop-blur text-white rounded-lg shadow-sm text-sm border border-slate-800 ${className}`}
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
        aria-label={enabled ? "Turn captions off" : "Turn captions on"}
        data-testid="captions-toggle-btn"
        className={`px-2.5 py-1 text-xs font-semibold rounded flex items-center gap-1 transition-colors ${
          enabled
            ? "bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm"
            : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700"
        }`}
      >
        <span className="font-mono text-[10px] uppercase font-bold tracking-wider">CC</span>
        <span>{enabled ? "On" : "Off"}</span>
      </button>
    </div>
  );
}
