import type { Color } from "@/lib/lesson/schema";
import { FONT_PX } from "@/lib/lesson/layout";

export const COLOR_MAP: Record<Color, string> = {
  ink: "#1e293b",
  blue: "#2563eb",
  red: "#dc2626",
  green: "#16a34a",
  orange: "#ea580c",
  purple: "#9333ea",
  muted: "#94a3b8",
};

export const HIGHLIGHT_BG: Record<Color, string> = {
  ink: "rgba(30, 41, 59, 0.15)",
  blue: "rgba(37, 99, 235, 0.2)",
  red: "rgba(220, 38, 38, 0.2)",
  green: "rgba(22, 163, 74, 0.2)",
  orange: "rgba(234, 88, 12, 0.25)",
  purple: "rgba(147, 51, 234, 0.2)",
  muted: "rgba(148, 163, 184, 0.25)",
};

export const HANDWRITING_FONT = "var(--font-caveat), 'Caveat', 'Kalam', cursive, sans-serif";
export const MONO_FONT = "var(--font-geist-mono), monospace";

export function resolveColor(color?: Color, fallback: Color = "ink"): string {
  return COLOR_MAP[color ?? fallback] ?? COLOR_MAP.ink;
}

export function fontSizePx(size?: keyof typeof FONT_PX): number {
  return FONT_PX[size ?? "md"];
}
