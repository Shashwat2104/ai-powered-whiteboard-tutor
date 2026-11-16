import type { BoardElement } from "@/lib/board/state";
import type { VisualAction } from "@/lib/lesson/schema";
import { refBox } from "@/lib/lesson/layout";
import { HANDWRITING_FONT, resolveColor } from "../palette";

interface AnnotateProps {
  element: BoardElement;
  actionsById: ReadonlyMap<string, VisualAction>;
}

export function Annotate({ element, actionsById }: AnnotateProps) {
  const action = element.action as Extract<VisualAction, { type: "annotate" }>;
  const color = resolveColor(action.color, "blue");
  const targetBox = refBox(action.target, actionsById) ?? { x: 800, y: 450, w: 0, h: 0 };

  const { side, text } = action;
  const offset = 45;

  let targetPoint = { x: targetBox.x + targetBox.w / 2, y: targetBox.y };
  let textPoint = { x: targetPoint.x, y: targetPoint.y - offset };
  let textAnchor: "middle" | "start" | "end" = "middle";

  if (side === "top") {
    targetPoint = { x: targetBox.x + targetBox.w / 2, y: targetBox.y };
    textPoint = { x: targetPoint.x, y: targetPoint.y - offset };
    textAnchor = "middle";
  } else if (side === "bottom") {
    targetPoint = { x: targetBox.x + targetBox.w / 2, y: targetBox.y + targetBox.h };
    textPoint = { x: targetPoint.x, y: targetPoint.y + offset + 20 };
    textAnchor = "middle";
  } else if (side === "left") {
    targetPoint = { x: targetBox.x, y: targetBox.y + targetBox.h / 2 };
    textPoint = { x: targetPoint.x - offset, y: targetPoint.y + 6 };
    textAnchor = "end";
  } else if (side === "right") {
    targetPoint = { x: targetBox.x + targetBox.w, y: targetBox.y + targetBox.h / 2 };
    textPoint = { x: targetPoint.x + offset, y: targetPoint.y + 6 };
    textAnchor = "start";
  }

  const currentProgress = element.progress;

  return (
    <g
      data-element-id={element.id}
      data-progress={element.progress}
      opacity={element.dimmed ? 0.3 : 1}
      className="transition-opacity duration-300"
    >
      {/* Target Pin/Dot */}
      {currentProgress > 0 && (
        <circle cx={targetPoint.x} cy={targetPoint.y} r={4} fill={color} />
      )}

      {/* Leader line */}
      {currentProgress > 0 && (
        <line
          x1={targetPoint.x}
          y1={targetPoint.y}
          x2={targetPoint.x + (textPoint.x - targetPoint.x) * currentProgress}
          y2={targetPoint.y + (textPoint.y - targetPoint.y) * currentProgress}
          stroke={color}
          strokeWidth={2}
          strokeDasharray="4 3"
          strokeLinecap="round"
        />
      )}

      {/* Callout text */}
      {currentProgress > 0.4 && (
        <text
          x={textPoint.x}
          y={textPoint.y}
          fill={color}
          fontSize={22}
          fontFamily={HANDWRITING_FONT}
          textAnchor={textAnchor}
          fontStyle="italic"
          opacity={Math.min(1, (currentProgress - 0.4) / 0.6)}
          style={{ userSelect: "none" }}
        >
          {text}
        </text>
      )}
    </g>
  );
}
