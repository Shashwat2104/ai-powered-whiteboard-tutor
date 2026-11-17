import type { Color } from "@/lib/lesson/schema";
import { FONT_PX } from "@/lib/lesson/layout";

export const COLOR_MAP: Record<Color, string> = {
  ink: "#0f172a",
  blue: "#1d4ed8",
  red: "#b91c1c",
  green: "#047857",
  orange: "#c2410c",
  purple: "#7e22ce",
  muted: "#64748b",
};

export const HIGHLIGHT_BG: Record<Color, string> = {
  ink: "rgba(15, 23, 42, 0.12)",
  blue: "rgba(29, 78, 216, 0.18)",
  red: "rgba(185, 28, 28, 0.18)",
  green: "rgba(4, 120, 87, 0.18)",
  orange: "rgba(194, 65, 12, 0.22)",
  purple: "rgba(126, 34, 206, 0.18)",
  muted: "rgba(100, 116, 139, 0.2)",
};

export const HANDWRITING_FONT = "var(--font-caveat), 'Caveat', 'Kalam', cursive, sans-serif";
export const MONO_FONT = "var(--font-geist-mono), monospace";

export function resolveColor(color?: Color, fallback: Color = "ink"): string {
  return COLOR_MAP[color ?? fallback] ?? COLOR_MAP.ink;
}

export function fontSizePx(size?: keyof typeof FONT_PX): number {
  return FONT_PX[size ?? "md"];
}
