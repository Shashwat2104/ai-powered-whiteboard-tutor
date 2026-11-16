"use client";

import { useState, type FormEvent } from "react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import type { Difficulty } from "@/lib/lesson/schema";

export interface TopicFormProps {
  onSubmit: (topic: string, difficulty: Difficulty) => void;
  isLoading?: boolean;
  initialTopic?: string;
  initialDifficulty?: Difficulty;
}

export function TopicForm({
  onSubmit,
  isLoading = false,
  initialTopic = "",
  initialDifficulty = "beginner",
}: TopicFormProps) {
  const [topic, setTopic] = useState(initialTopic);
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = topic.trim();
    if (!trimmed) {
      setError("Please enter a topic to learn.");
      return;
    }
    setError(null);
    onSubmit(trimmed, difficulty);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-2xl mx-auto flex flex-col gap-4 p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm"
      aria-label="Lesson Topic Selection Form"
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center">
          <label
            htmlFor="topic-input"
            className="text-sm font-semibold text-slate-800 dark:text-slate-200"
          >
            What do you want to learn today?
          </label>
          <span
            className={`text-xs ${
              topic.length >= 190
                ? "text-amber-600 font-medium"
                : "text-slate-500 dark:text-slate-400"
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
            disabled={isLoading}
            placeholder="e.g. How Binary Search works, Photosynthesis, Neural Networks..."
            className={`w-full px-4 py-3 rounded-xl border bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${
              error
                ? "border-red-400 focus:ring-red-300 dark:focus:ring-red-900"
                : "border-slate-300 dark:border-slate-700 focus:ring-blue-500 focus:border-blue-500"
            }`}
            aria-invalid={!!error}
            aria-describedby={error ? "topic-error" : undefined}
          />
        </div>
        {error && (
          <p
            id="topic-error"
            role="alert"
            className="text-xs text-red-600 dark:text-red-400 mt-0.5 font-medium"
          >
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Target Level:
          </span>
          <ToggleGroup.Root
            type="single"
            value={difficulty}
            onValueChange={(val) => {
              if (val) setDifficulty(val as Difficulty);
            }}
            disabled={isLoading}
            className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700/80"
            aria-label="Select difficulty level"
          >
            <ToggleGroup.Item
              value="beginner"
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors data-[state=on]:bg-white dark:data-[state=on]:bg-slate-700 data-[state=on]:text-blue-600 dark:data-[state=on]:text-blue-400 data-[state=on]:shadow-xs text-slate-600 dark:text-slate-400 hover:text-slate-900"
            >
              Beginner
            </ToggleGroup.Item>
            <ToggleGroup.Item
              value="intermediate"
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors data-[state=on]:bg-white dark:data-[state=on]:bg-slate-700 data-[state=on]:text-blue-600 dark:data-[state=on]:text-blue-400 data-[state=on]:shadow-xs text-slate-600 dark:text-slate-400 hover:text-slate-900"
            >
              Intermediate
            </ToggleGroup.Item>
            <ToggleGroup.Item
              value="advanced"
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors data-[state=on]:bg-white dark:data-[state=on]:bg-slate-700 data-[state=on]:text-blue-600 dark:data-[state=on]:text-blue-400 data-[state=on]:shadow-xs text-slate-600 dark:text-slate-400 hover:text-slate-900"
            >
              Advanced
            </ToggleGroup.Item>
          </ToggleGroup.Root>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="ml-auto px-6 py-2.5 rounded-xl font-medium text-sm text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {isLoading ? "Designing Lesson..." : "Teach me"}
        </button>
      </div>
    </form>
  );
}
