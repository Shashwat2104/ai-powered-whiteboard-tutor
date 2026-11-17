"use client";

import { useMemo } from "react";
import type { BoardElement, BoardState } from "@/lib/board/state";
import type { VisualAction } from "@/lib/lesson/schema";
import {
  Write,
  Shape,
  Connect,
  ArrayRow,
  List,
  Equation,
  Annotate,
} from "./elements";

interface WhiteboardProps {
  boardState: BoardState;
  sceneTitle?: string;
  activeSegmentId?: string;
  className?: string;
}

function describeElement(element: BoardElement): string {
  const { action } = element;
  switch (action.type) {
    case "write":
      return `Text: "${action.text}"`;
    case "shape":
      return `Shape ${action.kind}${action.label ? ` labeled "${action.label}"` : ""}`;
    case "array":
      return `Array row containing: [${action.items.join(", ")}]`;
    case "list":
      return `List containing: [${action.items.join(", ")}]`;
    case "equation":
      return `Mathematical equation: ${action.latex}`;
    case "connect":
      return `Connector arrow${action.label ? ` labeled "${action.label}"` : ""}`;
    case "annotate":
      return `Annotation note: "${action.text}"`;
    default:
      return `Diagram element`;
  }
}

export function Whiteboard({
  boardState,
  sceneTitle,
  activeSegmentId,
  className = "",
}: WhiteboardProps) {
  const actionsById = useMemo(() => {
    const map = new Map<string, VisualAction>();
    for (const el of boardState.elements) {
      map.set(el.action.id, el.action);
    }
    return map;
  }, [boardState.elements]);

  const describedBy = [
    "whiteboard-desc",
    activeSegmentId ? `transcript-segment-${activeSegmentId}` : undefined,
    "whiteboard-elements-list",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`relative w-full aspect-[16/9] rounded-2xl overflow-hidden border-2 border-slate-300 dark:border-slate-700/80 shadow-md bg-[#fafbfd] dark:bg-[#090d16] ${className}`}
    >
      {/* Subtle dry-erase studio frame header */}
      {sceneTitle && (
        <div className="absolute top-3 left-4 z-10 px-3 py-1 rounded-md bg-white/85 dark:bg-slate-900/85 backdrop-blur-xs border border-slate-200/80 dark:border-slate-800/80 text-xs font-semibold text-slate-700 dark:text-slate-300 pointer-events-none select-none shadow-2xs">
          <span>{sceneTitle}</span>
        </div>
      )}

      {/* Accessible screen-reader narration summary */}
      <div className="sr-only" aria-live="polite">
        {sceneTitle ? `Scene: ${sceneTitle}. ` : ""}
        Whiteboard canvas with {boardState.elements.length} elements.
      </div>

      {/* Visually hidden list of active elements for screen readers */}
      <div id="whiteboard-elements-list" className="sr-only">
        <h4>Elements currently visible on the whiteboard:</h4>
        <ul>
          {boardState.elements.map((element) => (
            <li key={element.id}>{describeElement(element)}</li>
          ))}
        </ul>
      </div>

      <svg
        viewBox="0 0 1600 900"
        role="img"
        aria-labelledby="whiteboard-title whiteboard-desc"
        aria-describedby={describedBy}
        className="w-full h-full select-none"
        preserveAspectRatio="xMidYMid meet"
      >
        <title id="whiteboard-title">{sceneTitle || "Interactive Whiteboard Canvas"}</title>
        <desc id="whiteboard-desc">
          AI generated pedagogical diagram illustrating the topic with progressive step-by-step drawings.
        </desc>

        <defs>
          {/* Subtle dot grid pattern for dry-erase whiteboard realism */}
          <pattern id="wb-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="0.8" fill="#94a3b8" opacity="0.35" />
          </pattern>
        </defs>

        {/* Board Background */}
        <rect width="1600" height="900" fill="#fafbfd" />
        <rect width="1600" height="900" fill="url(#wb-grid)" />

        {/* Elements in chronological creation order */}
        {boardState.elements.map((element) => {
          switch (element.kind) {
            case "write":
              return <Write key={element.id} element={element} />;
            case "shape":
              return <Shape key={element.id} element={element} />;
            case "connect":
              return <Connect key={element.id} element={element} actionsById={actionsById} />;
            case "array":
              return <ArrayRow key={element.id} element={element} />;
            case "list":
              return <List key={element.id} element={element} />;
            case "equation":
              return <Equation key={element.id} element={element} />;
            case "annotate":
              return <Annotate key={element.id} element={element} actionsById={actionsById} />;
            default:
              return null;
          }
        })}
      </svg>
    </div>
  );
}
