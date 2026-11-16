"use client";

import { useMemo } from "react";
import type { BoardState } from "@/lib/board/state";
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
  className?: string;
}

export function Whiteboard({ boardState, sceneTitle, className = "" }: WhiteboardProps) {
  const actionsById = useMemo(() => {
    const map = new Map<string, VisualAction>();
    for (const el of boardState.elements) {
      map.set(el.action.id, el.action);
    }
    return map;
  }, [boardState.elements]);

  return (
    <div
      className={`relative w-full aspect-[16/9] rounded-xl overflow-hidden border border-slate-200/80 shadow-md bg-[#fafbfd] ${className}`}
    >
      {/* Accessible screen-reader narration summary */}
      <div className="sr-only" aria-live="polite">
        {sceneTitle ? `Scene: ${sceneTitle}. ` : ""}
        Whiteboard canvas with {boardState.elements.length} elements.
      </div>

      <svg
        viewBox="0 0 1600 900"
        role="img"
        aria-labelledby="whiteboard-title whiteboard-desc"
        className="w-full h-full select-none"
        preserveAspectRatio="xMidYMid meet"
      >
        <title id="whiteboard-title">{sceneTitle || "Interactive Whiteboard Canvas"}</title>
        <desc id="whiteboard-desc">
          AI generated pedagogical diagram illustrating the topic with progressive step-by-step drawings.
        </desc>

        <defs>
          {/* Subtle grid pattern for dry-erase whiteboard realism */}
          <pattern id="wb-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="0.75" fill="#cbd5e1" opacity="0.45" />
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
