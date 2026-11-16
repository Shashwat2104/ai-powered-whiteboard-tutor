import type { BoardElement } from "@/lib/board/state";
import type { VisualAction } from "@/lib/lesson/schema";
import { fontSizePx, HANDWRITING_FONT, HIGHLIGHT_BG, resolveColor } from "../palette";

interface ListProps {
  element: BoardElement;
}

export function List({ element }: ListProps) {
  const action = element.action as Extract<VisualAction, { type: "list" }>;
  const { x, y, items, ordered } = action;
  const size = fontSizePx(action.size);
  const color = resolveColor(undefined, "ink");
  const lineHeight = size * 1.4;

  return (
    <g
      data-element-id={element.id}
      data-progress={element.progress}
      opacity={element.dimmed ? 0.3 : 1}
      className="transition-opacity duration-300"
    >
      {items.map((item, i) => {
        const itemY = y + i * lineHeight;
        const revealThreshold = i / items.length;
        const itemProgress = Math.min(1, Math.max(0, (element.progress - revealThreshold) * items.length));

        if (itemProgress <= 0) return null;

        const prefix = ordered ? `${i + 1}. ` : "• ";
        const fullText = `${prefix}${item}`;
        const approxW = fullText.length * size * 0.55;

        return (
          <g key={i} opacity={itemProgress}>
            {element.emphasized && (
              <rect
                x={x - 4}
                y={itemY}
                width={approxW + 8}
                height={lineHeight}
                rx={4}
                fill={HIGHLIGHT_BG[element.emphasisColor ?? "ink"]}
              />
            )}
            <text
              x={x}
              y={itemY + size}
              fill={color}
              fontSize={size}
              fontFamily={HANDWRITING_FONT}
              style={{ userSelect: "none" }}
            >
              {fullText}
            </text>
            {element.struck && (
              <line
                x1={x}
                y1={itemY + size * 0.6}
                x2={x + approxW}
                y2={itemY + size * 0.6}
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
              />
            )}
          </g>
        );
      })}
    </g>
  );
}
