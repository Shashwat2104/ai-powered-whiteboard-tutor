"use client";

import { useEffect, useState, useRef } from "react";
import { ClientError, type ClientErrorKind } from "@/lib/client/api";
import { AlertCircle, RefreshCw, Edit3, WifiOff } from "lucide-react";

export interface ErrorNoticeProps {
  error: ClientError | Error | string;
  onRetry?: () => void;
  onEditTopic?: () => void;
  className?: string;
}

export function ErrorNotice({
  error,
  onRetry,
  onEditTopic,
  className = "",
}: ErrorNoticeProps) {
  const isClientError = error instanceof ClientError;
  const kind: ClientErrorKind = isClientError ? error.kind : "generation_failed";
  const initialRetryAfter = isClientError && error.retryAfterSec ? error.retryAfterSec : 0;

  const [countdown, setCountdown] = useState<number>(initialRetryAfter);
  const startTimeRef = useRef<number | null>(null);
  const initialSecRef = useRef<number>(initialRetryAfter);

  useEffect(() => {
    if (initialRetryAfter <= 0) return;
    initialSecRef.current = initialRetryAfter;
    startTimeRef.current = Date.now();

    let rafId: number;
    const tick = () => {
      const start = startTimeRef.current ?? Date.now();
      const elapsedSec = (Date.now() - start) / 1000;
      const remaining = Math.max(0, Math.ceil(initialSecRef.current - elapsedSec));
      setCountdown(remaining);
      if (remaining > 0) {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [initialRetryAfter]);

  let headline = "Something went wrong";
  let description = typeof error === "string" ? error : error.message;
  let showRetry = Boolean(onRetry);
  let showEditTopic = Boolean(onEditTopic);

  switch (kind) {
    case "invalid_input":
      headline = "Please check your topic";
      showRetry = false;
      showEditTopic = true;
      break;
    case "rejected_topic":
      headline = "Topic cannot be taught";
      description = typeof error === "string" ? error : error.message;
      showRetry = false;
      showEditTopic = true;
      break;
    case "rate_limited":
      headline = "Rate limit reached";
      if (countdown > 0) {
        description = `You are generating lessons quickly. Please wait ${countdown} second${countdown === 1 ? "" : "s"} before trying again.`;
      } else {
        description = "You can try generating your lesson again now.";
      }
      showRetry = countdown === 0 && Boolean(onRetry);
      showEditTopic = true;
      break;
    case "network":
      headline = "Network disconnected";
      description = "Could not connect to the service. Please check your internet connection.";
      showRetry = Boolean(onRetry);
      showEditTopic = false;
      break;
    case "upstream_timeout":
      headline = "Request timed out";
      description = "The AI service took too long to respond. Please try again.";
      showRetry = Boolean(onRetry);
      showEditTopic = true;
      break;
    case "generation_failed":
    default:
      headline = "Lesson generation failed";
      description =
        typeof error === "string"
          ? error
          : error.message || "We could not create the lesson right now. Please try again.";
      showRetry = Boolean(onRetry);
      showEditTopic = true;
      break;
  }

  return (
    <div
      role="alert"
      data-testid="error-notice"
      data-error-kind={kind}
      className={`p-4 sm:p-5 rounded-2xl border border-red-200 dark:border-red-900/80 bg-red-50/95 dark:bg-red-950/40 shadow-xs text-sm text-red-900 dark:text-red-200 max-w-2xl mx-auto w-full flex flex-col gap-3.5 ${className}`}
    >
      <div className="flex items-start gap-3">
        {kind === "network" ? (
          <WifiOff className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
        ) : (
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
        )}
        <div className="flex-1">
          <h4 className="font-semibold text-red-950 dark:text-red-100 text-sm tracking-tight">{headline}</h4>
          <p className="mt-1 text-xs sm:text-sm text-red-850 dark:text-red-300 leading-relaxed">
            {description}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3 pl-8">
        {showRetry && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            data-testid="error-retry-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-xs transition-colors shadow-xs cursor-pointer min-h-[38px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Retry</span>
          </button>
        )}
        {showEditTopic && onEditTopic && (
          <button
            type="button"
            onClick={onEditTopic}
            data-testid="error-edit-topic-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-red-100 dark:hover:bg-slate-800 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800 font-medium text-xs transition-colors cursor-pointer min-h-[38px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1"
          >
            <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Edit Topic</span>
          </button>
        )}
      </div>
    </div>
  );
}
