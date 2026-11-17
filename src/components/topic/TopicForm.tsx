"use client";

import { useState, type FormEvent } from "react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import type { Difficulty } from "@/lib/lesson/schema";

export interface TopicFormProps {
  onSubmit: (topic: string, difficulty: Difficulty) => void;
  isLoading?: boolean;
  inFlightTopic?: string;
  initialTopic?: string;
  initialDifficulty?: Difficulty;
}

const SUGGESTED_TOPICS = [
  "How Binary Search works",
  "Photosynthesis light reaction",
  "Neural Networks backpropagation",
  "Bayes' Theorem intuition",
] as const;

export function TopicForm({
  onSubmit,
  isLoading = false,
  inFlightTopic,
  initialTopic = "",
  initialDifficulty = "beginner",
}: TopicFormProps) {
  const [topic, setTopic] = useState(initialTopic);
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty);
  const [error, setError] = useState<string | null>(null);

  const trimmed = topic.trim();
  const isDuplicateInFlight =
    isLoading &&
    Boolean(inFlightTopic) &&
    trimmed.toLowerCase() === inFlightTopic?.trim().toLowerCase();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed) {
      setError("Please enter a topic to learn.");
      return;
    }
    if (trimmed.length > 200) {
      setError("Topic must be 200 characters or less.");
      return;
    }
    if (isDuplicateInFlight) {
      return;
    }
    setError(null);
    onSubmit(trimmed, difficulty);
  };

  const handleSelectSuggestion = (suggestion: string) => {
    setTopic(suggestion);
    if (error) setError(null);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-2xl mx-auto flex flex-col gap-5 p-6 sm:p-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs"
      aria-label="Lesson Topic Selection Form"
    >
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-baseline">
          <label
            htmlFor="topic-input"
            className="text-sm font-semibold text-slate-900 dark:text-slate-100 tracking-tight"
          >
            What concept would you like to explore?
          </label>
          <span
            className={`text-xs tabular-nums ${
              topic.length >= 190
                ? "text-amber-600 dark:text-amber-400 font-semibold"
                : "text-slate-600 dark:text-slate-400"
            }`}
            aria-live="polite"
          >
            {topic.length} / 200
          </span>
        </div>

        <div className="relative">
          <input
            id="topic-input"
            type="text"
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value);
              if (error) setError(null);
            }}
            maxLength={200}
            placeholder="e.g. How Binary Search works, Photosynthesis, Neural Networks..."
            className={`w-full px-4 py-3 rounded-xl border bg-slate-50/80 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 text-sm sm:text-base focus:outline-none transition-all ${
              error
                ? "border-red-400 focus:ring-2 focus:ring-red-500/30"
                : "border-slate-300 dark:border-slate-700 focus:border-indigo-600 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            }`}
            aria-invalid={!!error}
            aria-describedby={error ? "topic-error" : undefined}
          />
        </div>

        {error && (
          <p
            id="topic-error"
            role="alert"
            className="text-xs text-red-600 dark:text-red-400 font-medium"
          >
            {error}
          </p>
        )}

        {/* Suggested Topic Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mr-1">
            Suggestions:
          </span>
          {SUGGESTED_TOPICS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSelectSuggestion(s)}
              className="text-xs px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer border border-slate-200/60 dark:border-slate-700/60"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Target Level:
          </span>
          <ToggleGroup.Root
            type="single"
            value={difficulty}
            onValueChange={(val) => {
              if (val) setDifficulty(val as Difficulty);
            }}
            className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700"
            aria-label="Select difficulty level"
          >
            <ToggleGroup.Item
              value="beginner"
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer min-h-[34px] data-[state=on]:bg-white dark:data-[state=on]:bg-indigo-600 data-[state=on]:text-indigo-700 dark:data-[state=on]:text-white data-[state=on]:shadow-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Beginner
            </ToggleGroup.Item>
            <ToggleGroup.Item
              value="intermediate"
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer min-h-[34px] data-[state=on]:bg-white dark:data-[state=on]:bg-indigo-600 data-[state=on]:text-indigo-700 dark:data-[state=on]:text-white data-[state=on]:shadow-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Intermediate
            </ToggleGroup.Item>
            <ToggleGroup.Item
              value="advanced"
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer min-h-[34px] data-[state=on]:bg-white dark:data-[state=on]:bg-indigo-600 data-[state=on]:text-indigo-700 dark:data-[state=on]:text-white data-[state=on]:shadow-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Advanced
            </ToggleGroup.Item>
          </ToggleGroup.Root>
        </div>

        <button
          type="submit"
          disabled={isDuplicateInFlight}
          className="ml-auto px-6 py-2.5 rounded-xl font-medium text-sm text-white bg-indigo-700 hover:bg-indigo-800 active:bg-indigo-900 dark:bg-indigo-600 dark:hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-all cursor-pointer min-h-[44px] flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          <span>{isDuplicateInFlight ? "Designing Lesson..." : "Teach me"}</span>
        </button>
      </div>
    </form>
  );
}
