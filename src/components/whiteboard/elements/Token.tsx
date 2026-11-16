import type { TokenState } from "@/lib/board/state";
import type { Color } from "@/lib/lesson/schema";
import { HANDWRITING_FONT, resolveColor } from "../palette";

interface TokenProps {
  token: TokenState;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  defaultColor?: Color;
}

export function Token({ token, p1, p2, defaultColor }: TokenProps) {
  const color = resolveColor(token.color, defaultColor ?? "orange");
  const effectiveProgress = token.reverse ? 1 - token.progress : token.progress;

  const x = p1.x + (p2.x - p1.x) * effectiveProgress;
  const y = p1.y + (p2.y - p1.y) * effectiveProgress;

  return (
    <g className="transition-transform duration-75">
      {/* Glow pulse */}
      <circle cx={x} cy={y} r={18} fill={color} opacity={0.25} className="animate-ping" />
      {/* Outer ring */}
      <circle cx={x} cy={y} r={14} fill="#ffffff" stroke={color} strokeWidth={3} />
      {/* Center dot */}
      <circle cx={x} cy={y} r={6} fill={color} />

      {/* Label if provided */}
      {token.label && (
        <text
          x={x}
          y={y - 20}
          fill={color}
          fontSize={18}
          fontFamily={HANDWRITING_FONT}
          textAnchor="middle"
          fontWeight="bold"
          style={{ userSelect: "none" }}
        >
          {token.label}
        </text>
      )}
    </g>
  );
}
