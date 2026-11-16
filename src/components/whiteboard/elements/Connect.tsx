import type { BoardElement } from "@/lib/board/state";
import type { VisualAction } from "@/lib/lesson/schema";
import { refBox, type Box } from "@/lib/lesson/layout";
import { HANDWRITING_FONT, resolveColor } from "../palette";
import { Token } from "./Token";

interface ConnectProps {
  element: BoardElement;
  actionsById: ReadonlyMap<string, VisualAction>;
}

interface Point {
  x: number;
  y: number;
}

function resolvePoint(
  target: string | { x: number; y: number },
  actionsById: ReadonlyMap<string, VisualAction>
): { point: Point; box?: Box } {
  if (typeof target !== "string") {
    return { point: target };
  }
  const box = refBox(target, actionsById);
  if (!box) {
    return { point: { x: 0, y: 0 } };
  }
  return {
    point: { x: box.x + box.w / 2, y: box.y + box.h / 2 },
    box,
  };
}

function edgeIntersect(center: Point, target: Point, box?: Box): Point {
  if (!box || (box.w === 0 && box.h === 0)) return center;
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  if (dx === 0 && dy === 0) return center;

  const halfW = box.w / 2;
  const halfH = box.h / 2;

  const scaleX = dx !== 0 ? Math.abs(halfW / dx) : Number.POSITIVE_INFINITY;
  const scaleY = dy !== 0 ? Math.abs(halfH / dy) : Number.POSITIVE_INFINITY;
  const scale = Math.min(scaleX, scaleY);

  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale,
  };
}

export function Connect({ element, actionsById }: ConnectProps) {
  const action = element.action as Extract<VisualAction, { type: "connect" }>;
  const color = resolveColor(action.color);

  const fromResolved = resolvePoint(action.from, actionsById);
  const toResolved = resolvePoint(action.to, actionsById);

  const p1 = edgeIntersect(fromResolved.point, toResolved.point, fromResolved.box);
  const p2 = edgeIntersect(toResolved.point, fromResolved.point, toResolved.box);

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lineLength = Math.hypot(dx, dy);

  // Progressive endpoint
  const currentP2 = {
    x: p1.x + dx * element.progress,
    y: p1.y + dy * element.progress,
  };

  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;

  const markerEndId = `arrow-end-${element.id}`;
  const markerStartId = `arrow-start-${element.id}`;

  return (
    <g
      data-element-id={element.id}
      data-progress={element.progress}
      opacity={element.dimmed ? 0.3 : 1}
      className="transition-opacity duration-300"
    >
      <defs>
        <marker
          id={markerEndId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M 0 1 L 9 5 L 0 9 z" fill={color} />
        </marker>
        <marker
          id={markerStartId}
          viewBox="0 0 10 10"
          refX="2"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 9 5 L 0 9 z" fill={color} />
        </marker>
      </defs>

      {/* Connection Line */}
      {element.progress > 0 && lineLength > 0 && (
        <line
          x1={p1.x}
          y1={p1.y}
          x2={currentP2.x}
          y2={currentP2.y}
          stroke={color}
          strokeWidth={2.5}
          strokeDasharray={action.style === "dashed" ? "8 6" : undefined}
          strokeLinecap="round"
          markerEnd={action.head === "end" || action.head === "both" ? `url(#${markerEndId})` : undefined}
          markerStart={action.head === "both" ? `url(#${markerStartId})` : undefined}
        />
      )}

      {/* Optional Label */}
      {action.label && element.progress > 0.4 && (
        <text
          x={midX}
          y={midY - 8}
          fill={color}
          fontSize={20}
          fontFamily={HANDWRITING_FONT}
          textAnchor="middle"
          opacity={Math.min(1, (element.progress - 0.4) / 0.6)}
          style={{ userSelect: "none" }}
        >
          {action.label}
        </text>
      )}

      {/* Travel Token if active */}
      {element.token && (
        <Token token={element.token} p1={p1} p2={p2} defaultColor={action.color} />
      )}
    </g>
  );
}
