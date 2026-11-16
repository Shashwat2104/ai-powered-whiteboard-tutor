import { BOARD_HEIGHT, BOARD_WIDTH, type VisualAction } from "./schema";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FONT_PX = { sm: 24, md: 32, lg: 44, title: 60 } as const;
const CHAR_WIDTH = 0.55;
const ARRAY_CELL_H = 80;
const ARRAY_INDEX_H = 30;
const DEFAULT_CELL_W = 80;
const LIST_LINE = 1.4;

type Size = keyof typeof FONT_PX;
const px = (size: Size | undefined, fallback: Size = "md"): number => FONT_PX[size ?? fallback];

/** Element id of a reference, without the optional `[index]` part. */
export function baseId(ref: string): string {
  const open = ref.indexOf("[");
  return open === -1 ? ref : ref.slice(0, open);
}

/** The cell index of an `arr[3]` style reference, or null for a whole-element reference. */
export function cellIndex(ref: string): number | null {
  const match = /\[(\d+)\]$/.exec(ref);
  return match ? Number(match[1]) : null;
}

/**
 * Estimated bounding box of an action that creates a sized element.
 * Returns null for connectors, callouts and actions that only change existing elements.
 */
export function estimateBox(action: VisualAction): Box | null {
  switch (action.type) {
    case "write": {
      const size = px(action.size);
      const w = action.text.length * size * CHAR_WIDTH;
      const x = action.align === "center" ? action.x - w / 2 : action.x;
      return { x, y: action.y, w, h: size * 1.3 };
    }
    case "shape":
      return { x: action.x, y: action.y, w: action.w, h: action.h };
    case "array": {
      const cellW = action.cellW ?? DEFAULT_CELL_W;
      return {
        x: action.x,
        y: action.y,
        w: action.items.length * cellW,
        h: ARRAY_CELL_H + (action.showIndex ? ARRAY_INDEX_H : 0),
      };
    }
    case "list": {
      const size = px(action.size);
      const longest = Math.max(...action.items.map((i) => i.length)) + (action.ordered ? 3 : 2);
      return { x: action.x, y: action.y, w: longest * size * CHAR_WIDTH, h: action.items.length * size * LIST_LINE };
    }
    case "equation": {
      const size = px(action.size);
      return { x: action.x, y: action.y, w: action.latex.length * size * 0.5, h: size * 1.8 };
    }
    default:
      return null;
  }
}

/** Box of a reference (an element, or one cell of an array) among the given actions. */
export function refBox(ref: string, actionsById: ReadonlyMap<string, VisualAction>): Box | undefined {
  const action = actionsById.get(baseId(ref));
  if (!action) return undefined;
  const box = estimateBox(action);
  const index = cellIndex(ref);
  if (!box || index === null) return box ?? undefined;
  if (action.type !== "array" || index >= action.items.length) return undefined;
  const cellW = action.cellW ?? DEFAULT_CELL_W;
  return { x: box.x + index * cellW, y: box.y, w: cellW, h: ARRAY_CELL_H };
}

/** Overlapping area divided by the area of the smaller box (0 when they do not touch). */
export function overlapRatio(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(a.w * a.h, b.w * b.h);
}

export function insideBoard(box: Box): boolean {
  return box.x >= 0 && box.y >= 0 && box.x + box.w <= BOARD_WIDTH && box.y + box.h <= BOARD_HEIGHT;
}

/** How far to move a span [start, start+size) so it lies within [0, limit]; 0 when it fits or never can. */
function shiftInto(start: number, size: number, limit: number): number {
  if (size > limit) return 0;
  if (start < 0) return -start;
  if (start + size > limit) return limit - (start + size);
  return 0;
}

/**
 * Move a positioned element that pokes past the board edge back inside, keeping its size. Models
 * often misjudge text width by a few pixels; nudging is safer than rejecting a whole lesson.
 * Returns the same object when nothing needs to move. Elements larger than the board are left alone.
 */
export function fitToBoard(action: VisualAction): VisualAction {
  const box = estimateBox(action);
  if (!box || !("x" in action) || !("y" in action)) return action;
  const dx = shiftInto(box.x, box.w, BOARD_WIDTH);
  const dy = shiftInto(box.y, box.h, BOARD_HEIGHT);
  if (dx === 0 && dy === 0) return action;
  return { ...action, x: action.x + dx, y: action.y + dy };
}
