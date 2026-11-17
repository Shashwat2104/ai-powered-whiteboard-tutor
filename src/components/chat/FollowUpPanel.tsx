"use client";

import { useState, useCallback, useRef, type KeyboardEvent } from "react";
import type { ConversationTurn, FollowupAnswer, Illustration, LessonContext } from "@/lib/followup/schema";
import { MiniBoard } from "./MiniBoard";
import { MessageSquare, PlayCircle, Send, RefreshCw } from "lucide-react";

export interface ChatTurn {
  turnId: string;
  question: string;
  answer?: string;
  sceneRef?: string;
  illustration?: Illustration;
  pending?: boolean;
  error?: string;
}

export interface FollowUpPanelProps {
  lessonContext: LessonContext;
  onJumpToScene?: (sceneId: string) => void;
  initialTurns?: ChatTurn[];
  onTurnsChange?: (turns: ChatTurn[]) => void;
  className?: string;
}

export function FollowUpPanel({
  lessonContext,
  onJumpToScene,
  initialTurns,
  onTurnsChange,
  className = "",
}: FollowUpPanelProps) {
  const [turns, setTurns] = useState<ChatTurn[]>(() => initialTurns ?? []);
  const [input, setInput] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const activeRequestRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const updateTurns = useCallback(
    (updater: (prev: ChatTurn[]) => ChatTurn[]) => {
      setTurns((prev) => {
        const next = updater(prev);
        if (onTurnsChange) onTurnsChange(next);
        return next;
      });
    },
    [onTurnsChange]
  );

  const getSceneTitle = useCallback(
    (sceneId: string): string => {
      const match = lessonContext.scenes.find((s) => s.id === sceneId);
      return match?.title || `Scene ${sceneId}`;
    },
    [lessonContext.scenes],
  );

  const askQuestion = useCallback(
    async (questionText: string, existingTurnId?: string) => {
      const trimmed = questionText.trim();
      if (!trimmed) {
        setValidationError("Please enter a question.");
        return;
      }
      setValidationError(null);

      if (activeRequestRef.current) return;
      activeRequestRef.current = true;
      setIsPending(true);

      const turnId =
        existingTurnId ??
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `turn-${Date.now()}`);

      // Add or update turn in state
      updateTurns((prev) => {
        const existingIdx = prev.findIndex((t) => t.turnId === turnId);
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = { turnId, question: trimmed, pending: true, error: undefined };
          return next;
        }
        return [...prev, { turnId, question: trimmed, pending: true }];
      });

      // Prepare last 10 successful turns as history
      const history: ConversationTurn[] = turns
        .filter((t) => t.answer && !t.error && t.turnId !== turnId)
        .slice(-10)
        .map((t) => ({ question: t.question, answer: t.answer ?? "" }));

      try {
        const res = await fetch("/api/followup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            turnId,
            lessonContext,
            history,
            question: trimmed,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const msg = body?.error?.message || "Failed to get an answer. Please try again.";
          updateTurns((prev) =>
            prev.map((t) => (t.turnId === turnId ? { ...t, pending: false, error: msg } : t)),
          );
          return;
        }

        const data: FollowupAnswer = await res.json();
        updateTurns((prev) =>
          prev.map((t) =>
            t.turnId === turnId
              ? {
                  ...t,
                  pending: false,
                  answer: data.answer,
                  sceneRef: data.sceneRef,
                  illustration: data.illustration,
                }
              : t,
          ),
        );
      } catch {
        updateTurns((prev) =>
          prev.map((t) =>
            t.turnId === turnId
              ? {
                  ...t,
                  pending: false,
                  error: "Network error. Please check your connection and retry.",
                }
              : t,
          ),
        );
      } finally {
        activeRequestRef.current = false;
        setIsPending(false);
      }
    },
    [lessonContext, turns, updateTurns],
  );

  const handleSubmit = () => {
    if (isPending) return;
    const textToSubmit = input;
    if (!textToSubmit.trim()) {
      setValidationError("Please enter a question.");
      return;
    }
    setInput("");
    void askQuestion(textToSubmit);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleRetry = (turn: ChatTurn) => {
    void askQuestion(turn.question, turn.turnId);
  };

  const handleQuickQuestion = (q: string) => {
    setInput(q);
    if (validationError) setValidationError(null);
    textareaRef.current?.focus();
  };

  return (
    <div
      className={`flex flex-col h-full bg-slate-50/70 dark:bg-slate-950/70 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs ${className}`}
    >
      {/* Panel Header */}
      <div className="px-4 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-200/90 dark:border-slate-800">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2 tracking-tight">
          <MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400 stroke-[2.2]" aria-hidden="true" />
          <span>Ask the Tutor</span>
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
          Ask questions about &ldquo;{lessonContext.topic}&rdquo; or request clarifications.
        </p>
      </div>

      {/* Conversation turns list */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px]"
        data-testid="chat-messages"
      >
        {turns.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-8 px-2 text-slate-600 dark:text-slate-400 text-sm space-y-3">
            <div>
              <p className="font-medium text-slate-700 dark:text-slate-300">No questions yet.</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Ask anything about this lesson and the tutor will clarify with text and diagrams!
              </p>
            </div>

            <div className="flex flex-col gap-1.5 w-full max-w-sm pt-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-left">
                Suggested questions:
              </span>
              {[
                "Can you explain the main idea step-by-step?",
                "What is a common edge case or pitfall?",
                "How does this apply in practice?",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleQuickQuestion(suggestion)}
                  className="text-left text-xs p-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  &ldquo;{suggestion}&rdquo;
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn) => (
            <div key={turn.turnId} className="space-y-2">
              {/* Learner Question */}
              <div className="flex justify-end">
                <div className="max-w-[85%] bg-indigo-700 text-white dark:bg-indigo-600 rounded-2xl rounded-tr-xs px-4 py-2.5 text-sm shadow-2xs leading-relaxed">
                  {turn.question}
                </div>
              </div>

              {/* Tutor Answer / State */}
              <div className="flex justify-start">
                <div
                  className="max-w-[92%] bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl rounded-tl-xs p-4 text-sm shadow-xs space-y-2.5"
                  aria-live="polite"
                  data-testid="tutor-response"
                >
                  {turn.pending && (
                    <div
                      className="flex items-center gap-2 text-slate-500 dark:text-slate-400 italic py-1 text-xs"
                      data-testid="turn-pending"
                    >
                      <div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                      Thinking...
                    </div>
                  )}

                  {turn.error && (
                    <div className="text-red-600 dark:text-red-400 space-y-1.5 text-xs">
                      <p>{turn.error}</p>
                      <button
                        type="button"
                        onClick={() => handleRetry(turn)}
                        className="inline-flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" aria-hidden="true" />
                        <span>Retry</span>
                      </button>
                    </div>
                  )}

                  {turn.answer && (
                    <div>
                      <p className="whitespace-pre-wrap leading-relaxed text-slate-850 dark:text-slate-150">
                        {turn.answer}
                      </p>

                      {/* Scene Reference link */}
                      {turn.sceneRef && (
                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onJumpToScene?.(turn.sceneRef!)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:underline bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/60 dark:border-indigo-800/60 px-3 py-1.5 rounded-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            aria-label={`Jump to scene: ${getSceneTitle(turn.sceneRef)}`}
                            data-testid="jump-to-scene-btn"
                          >
                            <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Jump to scene: {getSceneTitle(turn.sceneRef)}</span>
                          </button>
                        </div>
                      )}

                      {/* MiniBoard illustration */}
                      {turn.illustration && (
                        <div className="mt-3" data-testid="turn-illustration">
                          <MiniBoard illustration={turn.illustration} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input area */}
      <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-200/90 dark:border-slate-800">
        {validationError && (
          <p
            className="text-xs text-red-600 dark:text-red-400 mb-1.5 font-medium"
            role="alert"
            data-testid="input-error"
          >
            {validationError}
          </p>
        )}
        <div className="relative flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (validationError) setValidationError(null);
            }}
            onKeyDown={handleKeyDown}
            maxLength={500}
            rows={2}
            placeholder="Ask a question about this lesson... (Enter to send)"
            aria-label="Ask a question about this lesson"
            className="flex-1 resize-none rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 p-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 dark:focus:border-indigo-500 transition-all"
            disabled={isPending}
            data-testid="chat-input"
          />
          <button
            type="button"
            onClick={handleSubmit}
            aria-disabled={isPending}
            className="px-4 py-2.5 bg-indigo-700 hover:bg-indigo-800 active:bg-indigo-900 dark:bg-indigo-600 dark:hover:bg-indigo-500 aria-disabled:opacity-40 aria-disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-all shadow-xs h-fit self-end min-h-[44px] cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
            data-testid="chat-submit-btn"
          >
            <span>{isPending ? "Sending..." : "Send"}</span>
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex justify-between items-center mt-1.5 text-[11px] text-slate-600 dark:text-slate-400">
          <span>Shift + Enter for new line</span>
          <span className="tabular-nums">{input.length}/500</span>
        </div>
      </div>
    </div>
  );
}
