import { describe, expect, it } from "vitest";
import {
  baseId,
  cellIndex,
  estimateBox,
  refBox,
  overlapRatio,
  insideBoard,
  FONT_PX,
} from "@/lib/lesson/layout";
import type { VisualAction } from "@/lib/lesson/schema";

describe("Layout and Coordinate Utilities", () => {
  it("baseId strips cell index", () => {
    expect(baseId("arr[3]")).toBe("arr");
    expect(baseId("element_1")).toBe("element_1");
    expect(baseId("nodes[12]")).toBe("nodes");
  });

  it("cellIndex parses numeric cell index or returns null", () => {
    expect(cellIndex("arr[3]")).toBe(3);
    expect(cellIndex("arr[0]")).toBe(0);
    expect(cellIndex("arr[12]")).toBe(12);
    expect(cellIndex("element")).toBeNull();
    expect(cellIndex("arr[abc]")).toBeNull();
  });

  it("estimateBox calculates correct bounding boxes across action types", () => {
    // write left-aligned
    const w1: VisualAction = {
      id: "w1",
      type: "write",
      at: "start",
      x: 100,
      y: 100,
      text: "Hello",
      size: "md",
      align: "left",
    };
    const b1 = estimateBox(w1);
    expect(b1).not.toBeNull();
    expect(b1?.x).toBe(100);
    expect(b1?.y).toBe(100);
    expect(b1?.h).toBe(FONT_PX.md * 1.3);

    // write center-aligned
    const w2: VisualAction = {
      id: "w2",
      type: "write",
      at: "start",
      x: 200,
      y: 100,
      text: "Hello",
      size: "title",
      align: "center",
    };
    const b2 = estimateBox(w2);
    expect(b2?.x).toBeLessThan(200);

    // shape
    const s1: VisualAction = {
      id: "s1",
      type: "shape",
      at: "start",
      kind: "rect",
      x: 50,
      y: 50,
      w: 300,
      h: 200,
    };
    expect(estimateBox(s1)).toEqual({ x: 50, y: 50, w: 300, h: 200 });

    // array with and without showIndex
    const a1: VisualAction = {
      id: "a1",
      type: "array",
      at: "start",
      x: 200,
      y: 300,
      items: ["1", "2", "3"],
      cellW: 90,
      showIndex: true,
    };
    expect(estimateBox(a1)).toEqual({ x: 200, y: 300, w: 270, h: 110 });

    const a2: VisualAction = {
      id: "a2",
      type: "array",
      at: "start",
      x: 200,
      y: 300,
      items: ["A", "B"],
      showIndex: false,
    };
    expect(estimateBox(a2)).toEqual({ x: 200, y: 300, w: 160, h: 80 });

    // list
    const l1: VisualAction = {
      id: "l1",
      type: "list",
      at: "start",
      x: 100,
      y: 100,
      items: ["First", "Second item"],
      ordered: true,
      size: "sm",
    };
    expect(estimateBox(l1)?.w).toBeGreaterThan(50);

    // equation
    const eq: VisualAction = {
      id: "eq",
      type: "equation",
      at: "start",
      x: 100,
      y: 200,
      latex: "E = mc^2",
      size: "lg",
    };
    expect(estimateBox(eq)).not.toBeNull();

    // modifier actions return null
    const hl: VisualAction = { id: "h", type: "highlight", at: "start", target: "s1" };
    expect(estimateBox(hl)).toBeNull();
  });

  it("refBox resolves boxes for elements and specific array cells", () => {
    const arr: VisualAction = {
      id: "arr",
      type: "array",
      at: "start",
      x: 100,
      y: 200,
      items: ["10", "20", "30"],
      cellW: 80,
    };
    const actionsMap = new Map<string, VisualAction>([["arr", arr]]);

    // Whole array
    expect(refBox("arr", actionsMap)).toEqual({ x: 100, y: 200, w: 240, h: 80 });

    // Cell arr[1]
    expect(refBox("arr[1]", actionsMap)).toEqual({ x: 180, y: 200, w: 80, h: 80 });

    // Cell arr[5] (out of bounds)
    expect(refBox("arr[5]", actionsMap)).toBeUndefined();

    // Unknown reference
    expect(refBox("nonexistent", actionsMap)).toBeUndefined();
  });

  it("overlapRatio detects non-overlapping, touching, and intersecting boxes", () => {
    const boxA = { x: 0, y: 0, w: 100, h: 100 };
    const boxB = { x: 200, y: 200, w: 100, h: 100 };
    expect(overlapRatio(boxA, boxB)).toBe(0);

    // 50% overlap of smaller box
    const boxC = { x: 50, y: 0, w: 100, h: 100 };
    expect(overlapRatio(boxA, boxC)).toBe(0.5);

    // Touching on edge
    const boxD = { x: 100, y: 0, w: 100, h: 100 };
    expect(overlapRatio(boxA, boxD)).toBe(0);
  });

  it("insideBoard validates canvas boundaries", () => {
    expect(insideBoard({ x: 100, y: 100, w: 400, h: 200 })).toBe(true);
    expect(insideBoard({ x: -10, y: 50, w: 100, h: 100 })).toBe(false);
    expect(insideBoard({ x: 1500, y: 50, w: 200, h: 100 })).toBe(false);
    expect(insideBoard({ x: 50, y: 850, w: 100, h: 100 })).toBe(false);
  });
});
