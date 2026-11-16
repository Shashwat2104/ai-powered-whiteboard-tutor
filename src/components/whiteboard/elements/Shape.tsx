import type { BoardElement } from "@/lib/board/state";
import type { VisualAction } from "@/lib/lesson/schema";
import { HANDWRITING_FONT, HIGHLIGHT_BG, resolveColor } from "../palette";

interface ShapeProps {
  element: BoardElement;
}

export function Shape({ element }: ShapeProps) {
  const action = element.action as Extract<VisualAction, { type: "shape" }>;
  const { x, y, w, h, kind, label } = action;
  const color = resolveColor(action.color);
  const strokeWidth = 3;
  const dashOffset = Math.max(0, 1 - element.progress);

  const cx = x + w / 2;
  const cy = y + h / 2;

  return (
    <g
      data-element-id={element.id}
      data-progress={element.progress}
      opacity={element.dimmed ? 0.3 : 1}
      className="transition-opacity duration-300"
    >
      {/* Emphasis Background */}
      {element.emphasized && (
        <rect
          x={x - 6}
          y={y - 6}
          width={w + 12}
          height={h + 12}
          rx={kind === "rounded" ? 20 : 6}
          fill={HIGHLIGHT_BG[element.emphasisColor ?? action.color ?? "ink"]}
          className="animate-pulse"
        />
      )}

      {/* Shape Outlines */}
      {kind === "rect" && (
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={dashOffset}
        />
      )}

      {kind === "rounded" && (
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={16}
          ry={16}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={dashOffset}
        />
      )}

      {kind === "ellipse" && (
        <ellipse
          cx={cx}
          cy={cy}
          rx={w / 2}
          ry={h / 2}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={dashOffset}
        />
      )}

      {kind === "diamond" && (
        <path
          d={`M ${cx} ${y} L ${x + w} ${cy} L ${cx} ${y + h} L ${x} ${cy} Z`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={dashOffset}
        />
      )}

      {/* Centered Label */}
      {label && element.progress > 0.3 && (
        <text
          x={cx}
          y={cy + 8}
          fill={color}
          fontSize={24}
          fontFamily={HANDWRITING_FONT}
          textAnchor="middle"
          opacity={Math.min(1, (element.progress - 0.3) / 0.7)}
          style={{ userSelect: "none" }}
        >
          {label}
        </text>
      )}

      {/* Strike-through */}
      {element.struck && (
        <line
          x1={x + 4}
          y1={cy}
          x2={x + w - 4}
          y2={cy}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      )}
    </g>
  );
}
