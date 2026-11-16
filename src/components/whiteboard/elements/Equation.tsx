import katex from "katex";
import type { BoardElement } from "@/lib/board/state";
import type { VisualAction } from "@/lib/lesson/schema";
import { fontSizePx, HIGHLIGHT_BG } from "../palette";

interface EquationProps {
  element: BoardElement;
}

export function Equation({ element }: EquationProps) {
  const action = element.action as Extract<VisualAction, { type: "equation" }>;
  const { x, y, latex } = action;
  const size = fontSizePx(action.size);
  const approxW = Math.max(120, latex.length * size * 0.65);
  const approxH = Math.max(60, size * 2.2);

  let renderedHtml = "";
  try {
    renderedHtml = katex.renderToString(latex, {
      trust: false,
      strict: "warn",
      throwOnError: false,
      displayMode: true,
    });
  } catch {
    renderedHtml = `<span class="katex-error">${latex}</span>`;
  }

  const clipId = `clip-eq-${element.id}`;

  return (
    <g
      data-element-id={element.id}
      data-progress={element.progress}
      opacity={element.dimmed ? 0.3 : 1}
      className="transition-opacity duration-300"
    >
      <defs>
        <clipPath id={clipId}>
          <rect
            x={x}
            y={y}
            width={Math.max(0, approxW * element.progress)}
            height={approxH}
          />
        </clipPath>
      </defs>

      {/* Emphasis */}
      {element.emphasized && (
        <rect
          x={x - 8}
          y={y - 8}
          width={approxW + 16}
          height={approxH + 16}
          rx={6}
          fill={HIGHLIGHT_BG[element.emphasisColor ?? "ink"]}
          className="animate-pulse"
        />
      )}

      {/* KaTeX foreignObject with progressive clip */}
      <g clipPath={`url(#${clipId})`}>
        <foreignObject x={x} y={y} width={approxW} height={approxH}>
          <div
            style={{
              fontSize: `${size}px`,
              color: "#1e293b",
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              overflow: "visible",
            }}
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        </foreignObject>
      </g>

      {/* Strike-through */}
      {element.struck && (
        <line
          x1={x}
          y1={y + approxH / 2}
          x2={x + approxW}
          y2={y + approxH / 2}
          stroke="#1e293b"
          strokeWidth={3}
          strokeLinecap="round"
        />
      )}
    </g>
  );
}
