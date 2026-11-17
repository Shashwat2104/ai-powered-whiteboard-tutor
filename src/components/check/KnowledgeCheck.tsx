"use client";

import { useState } from "react";
import { CheckCircle, XCircle, RotateCcw, ArrowRight } from "lucide-react";
import type { KnowledgeCheck as KnowledgeCheckType } from "@/lib/lesson/schema";

export interface KnowledgeCheckProps {
  checks: KnowledgeCheckType[];
  onSeekScene?: (sceneId: string) => void;
  className?: string;
}

export function KnowledgeCheck({
  checks,
  onSeekScene,
  className = "",
}: KnowledgeCheckProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!checks || checks.length === 0) return null;

  const currentCheck = checks[currentIndex] ?? checks[0];
  if (!currentCheck) return null;

  const isCorrect = selectedOption === currentCheck.answerIndex;
  const hasMore = currentIndex < checks.length - 1;

  const handleSelect = (idx: number) => {
    if (submitted) return;
    setSelectedOption(idx);
  };

  const handleSubmit = () => {
    if (selectedOption === null) return;
    setSubmitted(true);
  };

  const handleNext = () => {
    if (hasMore) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setSubmitted(false);
    }
  };

  return (
    <div
      className={`w-full max-w-2xl mx-auto p-6 sm:p-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs ${className}`}
      data-testid="knowledge-check"
    >
      <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-100 dark:border-slate-800">
        <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
          Knowledge Check {checks.length > 1 ? `(${currentIndex + 1}/${checks.length})` : ""}
        </span>
        {currentCheck.sceneRef && onSeekScene && (
          <button
            type="button"
            onClick={() => onSeekScene(currentCheck.sceneRef!)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors cursor-pointer min-h-[36px] px-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Revisit scene</span>
          </button>
        )}
      </div>

      <fieldset className="space-y-4">
        <legend className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug tracking-tight">
          {currentCheck.question}
        </legend>

        <div className="space-y-2.5 pt-1">
          {currentCheck.options.map((option, idx) => {
            const isSelected = selectedOption === idx;
            const isAnswer = idx === currentCheck.answerIndex;

            let borderStyle = "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600";
            let bgStyle = "bg-slate-50/70 dark:bg-slate-800/40";

            if (isSelected) {
              borderStyle = "border-indigo-600 dark:border-indigo-500 ring-2 ring-indigo-500/20";
              bgStyle = "bg-indigo-50/50 dark:bg-indigo-950/20";
            }

            if (submitted) {
              if (isAnswer) {
                borderStyle = "border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-100";
              } else if (isSelected && !isCorrect) {
                borderStyle = "border-red-500 bg-red-50/70 dark:bg-red-950/30 text-red-950 dark:text-red-100";
              } else {
                borderStyle = "border-slate-200 dark:border-slate-800 opacity-60";
              }
            }

            return (
              <label
                key={idx}
                className={`flex items-start gap-3 p-3.5 rounded-xl border text-sm font-medium cursor-pointer transition-all min-h-[44px] ${borderStyle} ${bgStyle}`}
              >
                <input
                  type="radio"
                  name={`check-${currentCheck.id}`}
                  value={idx}
                  checked={isSelected}
                  onChange={() => handleSelect(idx)}
                  disabled={submitted}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span className="flex-1 text-slate-900 dark:text-slate-100 leading-relaxed">
                  {option}
                </span>
                {submitted && isAnswer && (
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                )}
                {submitted && isSelected && !isCorrect && (
                  <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
                )}
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Submitted Feedback */}
      {submitted && (
        <div
          role="status"
          className={`mt-5 p-4 rounded-xl border text-sm leading-relaxed ${
            isCorrect
              ? "bg-emerald-50/90 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-950 dark:text-emerald-100"
              : "bg-amber-50/90 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-950 dark:text-amber-100"
          }`}
        >
          <p className="font-semibold mb-1">
            {isCorrect ? "Correct!" : "Not quite."}
          </p>
          <p className="text-slate-700 dark:text-slate-300">{currentCheck.explanation}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-5 flex items-center justify-end gap-3">
        {!submitted ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={selectedOption === null}
            className="px-6 py-2.5 rounded-xl text-sm font-medium text-white bg-indigo-700 hover:bg-indigo-800 active:bg-indigo-900 dark:bg-indigo-600 dark:hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-all cursor-pointer min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            Check Answer
          </button>
        ) : hasMore ? (
          <button
            type="button"
            onClick={handleNext}
            className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-sm font-medium text-white bg-indigo-700 hover:bg-indigo-800 active:bg-indigo-900 dark:bg-indigo-600 dark:hover:bg-indigo-500 shadow-xs transition-all cursor-pointer min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            <span>Next Question</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
