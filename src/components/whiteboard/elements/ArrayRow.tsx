import type { BoardElement } from "@/lib/board/state";
import type { VisualAction } from "@/lib/lesson/schema";
import { HIGHLIGHT_BG, MONO_FONT, resolveColor } from "../palette";

interface ArrayRowProps {
  element: BoardElement;
}

const DEFAULT_CELL_W = 80;
const CELL_H = 80;
const INDEX_H = 26;

export function ArrayRow({ element }: ArrayRowProps) {
  const action = element.action as Extract<VisualAction, { type: "array" }>;
  const { x, y, items, showIndex } = action;
  const cellW = action.cellW ?? DEFAULT_CELL_W;
  const totalW = items.length * cellW;
  const color = resolveColor(undefined, "ink");
  const strokeWidth = 2.5;

  return (
    <g
      data-element-id={element.id}
      data-progress={element.progress}
      opacity={element.dimmed ? 0.3 : 1}
      className="transition-opacity duration-300"
    >
      {/* Outer Array Outline */}
      <rect
        x={x}
        y={y}
        width={totalW}
        height={CELL_H}
        fill="#ffffff"
        fillOpacity={0.8}
        stroke={color}
        strokeWidth={strokeWidth}
        rx={4}
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset={Math.max(0, 1 - element.progress)}
      />

      {/* Cells */}
      {items.map((item, i) => {
        const cellX = x + i * cellW;
        const cellState = element.cells?.[i];
        const isEmphasized = cellState?.emphasized || element.emphasized;
        const emphasisColor = cellState?.emphasisColor || element.emphasisColor;
        const isDimmed = cellState?.dimmed;
        const isStruck = cellState?.struck;

        const cellRevealProgress = Math.min(1, Math.max(0, (element.progress - i / items.length) * items.length));

        return (
          <g key={i} opacity={isDimmed ? 0.3 : 1}>
            {/* Cell Divider Line (for i > 0) */}
            {i > 0 && (
              <line
                x1={cellX}
                y1={y}
                x2={cellX}
                y2={y + CELL_H}
                stroke={color}
                strokeWidth={1.5}
                opacity={element.progress}
              />
            )}

            {/* Cell Emphasis Fill */}
            {isEmphasized && (
              <rect
                x={cellX + 2}
                y={y + 2}
                width={cellW - 4}
                height={CELL_H - 4}
                rx={2}
                fill={HIGHLIGHT_BG[emphasisColor ?? "ink"]}
                className="animate-pulse"
              />
            )}

            {/* Item Content Text */}
            {cellRevealProgress > 0 && (
              <text
                x={cellX + cellW / 2}
                y={y + CELL_H / 2 + 10}
                fill={color}
                fontSize={28}
                fontFamily={MONO_FONT}
                textAnchor="middle"
                opacity={cellRevealProgress}
                style={{ userSelect: "none" }}
              >
                {item}
              </text>
            )}

            {/* Cell Strike */}
            {isStruck && (
              <line
                x1={cellX + 6}
                y1={y + CELL_H / 2}
                x2={cellX + cellW - 6}
                y2={y + CELL_H / 2}
                stroke={color}
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            )}

            {/* Index Label */}
            {showIndex && (
              <text
                x={cellX + cellW / 2}
                y={y + CELL_H + INDEX_H}
                fill="#64748b"
                fontSize={18}
                fontFamily={MONO_FONT}
                textAnchor="middle"
                opacity={Math.min(1, element.progress * 1.5)}
                style={{ userSelect: "none" }}
              >
                {i}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
