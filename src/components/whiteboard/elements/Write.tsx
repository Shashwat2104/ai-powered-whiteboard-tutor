import type { BoardElement } from "@/lib/board/state";
import type { VisualAction } from "@/lib/lesson/schema";
import { fontSizePx, HANDWRITING_FONT, resolveColor, HIGHLIGHT_BG } from "../palette";

interface WriteProps {
  element: BoardElement;
}

export function Write({ element }: WriteProps) {
  const action = element.action as Extract<VisualAction, { type: "write" }>;
  const size = fontSizePx(action.size);
  const color = resolveColor(action.color);
  const isCenter = action.align === "center";
  const textAnchor = isCenter ? "middle" : "start";

  const approxW = action.text.length * size * 0.55;
  const clipX = isCenter ? action.x - approxW / 2 : action.x;
  const clipId = `clip-${element.id}`;

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
            x={clipX - 4}
            y={action.y - size * 0.2}
            width={Math.max(0, (approxW + 8) * element.progress)}
            height={size * 1.5}
          />
        </clipPath>
      </defs>

      {/* Emphasis highlight */}
      {element.emphasized && (
        <rect
          x={clipX - 6}
          y={action.y}
          width={approxW + 12}
          height={size * 1.2}
          rx={4}
          fill={HIGHLIGHT_BG[element.emphasisColor ?? action.color ?? "ink"]}
          className="animate-pulse"
        />
      )}

      {/* Main Text */}
      <text
        x={action.x}
        y={action.y + size}
        fill={color}
        fontSize={size}
        fontFamily={HANDWRITING_FONT}
        textAnchor={textAnchor}
        clipPath={`url(#${clipId})`}
        style={{ userSelect: "none" }}
      >
        {action.text}
      </text>

      {/* Strike-through */}
      {element.struck && (
        <line
          x1={clipX}
          y1={action.y + size * 0.6}
          x2={clipX + approxW}
          y2={action.y + size * 0.6}
          stroke={color}
          strokeWidth={Math.max(2, size * 0.08)}
          strokeLinecap="round"
        />
      )}
    </g>
  );
}
