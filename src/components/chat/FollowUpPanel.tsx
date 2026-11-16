"use client";

import { useState, useCallback, useRef, type KeyboardEvent } from "react";
import type { ConversationTurn, FollowupAnswer, Illustration, LessonContext } from "@/lib/followup/schema";
import { MiniBoard } from "./MiniBoard";

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

      const turnId = existingTurnId ?? (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `turn-${Date.now()}`);

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
              ? { ...t, pending: false, error: "Network error. Please check your connection and retry." }
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

  return (
    <div className={`flex flex-col h-full bg-slate-50 border border-slate-200 rounded-xl overflow-hidden ${className}`}>
      {/* Panel Header */}
      <div className="px-4 py-3 bg-white border-b border-slate-200">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          Ask the Tutor
        </h3>
        <p className="text-xs text-slate-600 mt-0.5">
          Ask questions about &ldquo;{lessonContext.topic}&rdquo; or request clarifications.
        </p>
      </div>

      {/* Conversation turns list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px]" data-testid="chat-messages">
        {turns.length === 0 ? (
          <div className="text-center py-8 text-slate-600 text-sm">
            <p>No questions yet.</p>
            <p className="text-xs mt-1">Ask anything about this lesson and the tutor will clarify!</p>
          </div>
        ) : (
          turns.map((turn) => (
            <div key={turn.turnId} className="space-y-2">
              {/* Learner Question */}
              <div className="flex justify-end">
                <div className="max-w-[85%] bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2 text-sm shadow-sm">
                  {turn.question}
                </div>
              </div>

              {/* Tutor Answer / State */}
              <div className="flex justify-start">
                <div
                  className="max-w-[90%] bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tl-sm p-3 text-sm shadow-sm space-y-2"
                  aria-live="polite"
                  data-testid="tutor-response"
                >
                  {turn.pending && (
                    <div className="flex items-center gap-2 text-slate-500 italic py-1" data-testid="turn-pending">
                      <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                      Thinking...
                    </div>
                  )}

                  {turn.error && (
                    <div className="text-red-600 space-y-1">
                      <p>{turn.error}</p>
                      <button
                        type="button"
                        onClick={() => handleRetry(turn)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {turn.answer && (
                    <div>
                      <p className="whitespace-pre-wrap leading-relaxed">{turn.answer}</p>

                      {/* Scene Reference link */}
                      {turn.sceneRef && (
                        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onJumpToScene?.(turn.sceneRef!)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-2.5 py-1 rounded"
                            aria-label={`Jump to scene: ${getSceneTitle(turn.sceneRef)}`}
                            data-testid="jump-to-scene-btn"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Jump to scene: {getSceneTitle(turn.sceneRef)}
                          </button>
                        </div>
                      )}

                      {/* MiniBoard illustration */}
                      {turn.illustration && (
                        <div className="mt-2" data-testid="turn-illustration">
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
      <div className="p-3 bg-white border-t border-slate-200">
        {validationError && (
          <p className="text-xs text-red-600 mb-1.5 font-medium" role="alert" data-testid="input-error">
            {validationError}
          </p>
        )}
        <div className="relative flex items-end gap-2">
          <textarea
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
            className="flex-1 resize-none rounded-lg border border-slate-300 p-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            disabled={isPending}
            data-testid="chat-input"
          />
          <button
            type="button"
            onClick={handleSubmit}
            aria-disabled={isPending}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 aria-disabled:opacity-40 aria-disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors shadow-sm h-fit self-end"
            aria-label="Send question"
            data-testid="chat-submit-btn"
          >
            {isPending ? "Sending..." : "Send"}
          </button>
        </div>
        <div className="flex justify-between items-center mt-1 text-[11px] text-slate-600">
          <span>Shift + Enter for new line</span>
          <span>{input.length}/500</span>
        </div>
      </div>
    </div>
  );
}
