"use client";

import { CheckCircle2, Loader2, Circle } from "lucide-react";

export type GenerationStage = "idle" | "writing" | "narrating" | "ready" | "error";

export interface ProgressStepsProps {
  stage: GenerationStage;
  narrationProgress?: { completed: number; total: number };
  className?: string;
}

export function ProgressSteps({
  stage,
  narrationProgress,
  className = "",
}: ProgressStepsProps) {
  if (stage === "idle") return null;

  const narrationText =
    narrationProgress && narrationProgress.total > 0
      ? `Recording narration ${narrationProgress.completed}/${narrationProgress.total}`
      : "Recording narration";

  const steps = [
    {
      id: "writing",
      label: "Writing lesson",
      status:
        stage === "writing"
          ? ("current" as const)
          : stage === "narrating" || stage === "ready"
          ? ("complete" as const)
          : ("upcoming" as const),
    },
    {
      id: "narrating",
      label: narrationText,
      status:
        stage === "narrating"
          ? ("current" as const)
          : stage === "ready"
          ? ("complete" as const)
          : ("upcoming" as const),
    },
    {
      id: "ready",
      label: "Ready",
      status: stage === "ready" ? ("complete" as const) : ("upcoming" as const),
    },
  ];

  return (
    <div
      aria-live="polite"
      className={`w-full max-w-xl mx-auto py-3.5 px-5 rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-xs backdrop-blur-xs flex items-center justify-between gap-3 ${className}`}
    >
      {steps.map((step, idx) => {
        const isCurrent = step.status === "current";
        const isComplete = step.status === "complete";

        return (
          <div key={step.id} className="flex items-center gap-2 flex-1">
            <div className="flex items-center justify-center">
              {isComplete ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-500 shrink-0" />
              ) : isCurrent ? (
                <Loader2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-spin motion-reduce:animate-none shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
              )}
            </div>

            <span
              className={`text-xs font-medium whitespace-nowrap ${
                isComplete
                  ? "text-slate-800 dark:text-slate-200"
                  : isCurrent
                  ? "text-indigo-700 dark:text-indigo-300 font-semibold"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              {step.label}
            </span>

            {idx < steps.length - 1 && (
              <div
                className={`h-0.5 flex-1 mx-1.5 rounded-full transition-colors ${
                  isComplete
                    ? "bg-emerald-300 dark:bg-emerald-800"
                    : "bg-slate-200 dark:bg-slate-700"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
