import { baseId, cellIndex } from "../lesson/layout";
import { CREATING_TYPES, type ActionType, type Color, type LessonShape, type VisualAction } from "../lesson/schema";
import type { TimedAction, Timeline } from "../timeline/resolve";

export interface CellState {
  emphasized: boolean;
  emphasisColor?: Color;
  dimmed: boolean;
  struck: boolean;
}

export interface TokenState {
  /** 0 at the start of the connector, 1 at the end (reversed travel is handled by the renderer). */
  progress: number;
  label?: string;
  color?: Color;
  reverse: boolean;
}

export interface BoardElement {
  id: string;
  kind: ActionType;
  action: VisualAction;
  startSec: number;
  /** How much of the element is drawn: 0 not started, 1 fully drawn. */
  progress: number;
  emphasized: boolean;
  emphasisColor?: Color;
  dimmed: boolean;
  struck: boolean;
  /** Per-cell state, for arrays only. */
  cells?: CellState[];
  token?: TokenState;
}

export interface BoardState {
  sceneId: string;
  activeSegmentId: string;
  /** In creation order. */
  elements: BoardElement[];
}

export interface BoardOptions {
  reducedMotion: boolean;
}

interface Emphasis {
  until: number;
  color?: Color;
}

interface Draft {
  action: VisualAction;
  startSec: number;
  drawSec: number;
  emphasis: Emphasis;
  dimmed: boolean;
  struck: boolean;
  cells?: { emphasis: Emphasis; dimmed: boolean; struck: boolean }[];
  token?: { startSec: number; drawSec: number; label?: string; color?: Color; reverse: boolean };
}

const NONE: Emphasis = { until: Number.NEGATIVE_INFINITY };
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const progressAt = (t: number, startSec: number, drawSec: number, reduced: boolean): number =>
  reduced || drawSec <= 0 ? 1 : clamp((t - startSec) / drawSec, 0, 1);

function newDraft(timed: TimedAction): Draft {
  const { action } = timed;
  const cells =
    action.type === "array"
      ? action.items.map(() => ({ emphasis: NONE, dimmed: false, struck: false }))
      : undefined;
  return { action, startSec: timed.timeSec, drawSec: timed.drawSec, emphasis: NONE, dimmed: false, struck: false, cells };
}

function stronger(current: Emphasis, next: Emphasis): Emphasis {
  return next.until >= current.until ? next : current;
}

function removeWithAttachments(drafts: Map<string, Draft>, id: string): void {
  drafts.delete(id);
  for (const [key, draft] of [...drafts]) {
    const a = draft.action;
    const attached =
      (a.type === "connect" && [a.from, a.to].some((r) => typeof r === "string" && baseId(r) === id)) ||
      (a.type === "annotate" && baseId(a.target) === id);
    if (attached) drafts.delete(key);
  }
}

function applyAction(drafts: Map<string, Draft>, timed: TimedAction): void {
  const { action } = timed;
  if (CREATING_TYPES.has(action.type)) {
    drafts.set(action.id, newDraft(timed));
    return;
  }
  switch (action.type) {
    case "highlight": {
      const draft = drafts.get(baseId(action.target));
      if (!draft) return;
      const emphasis = { until: action.forSec ? timed.timeSec + action.forSec : Number.POSITIVE_INFINITY, color: action.color };
      const index = cellIndex(action.target);
      const cell = index === null ? undefined : draft.cells?.[index];
      if (cell) cell.emphasis = stronger(cell.emphasis, emphasis);
      else draft.emphasis = stronger(draft.emphasis, emphasis);
      return;
    }
    case "dim": {
      const draft = drafts.get(baseId(action.target));
      if (!draft) return;
      const index = cellIndex(action.target);
      const cell = index === null ? undefined : draft.cells?.[index];
      const target = cell ?? draft;
      target.dimmed = true;
      target.struck = target.struck || action.strike === true;
      return;
    }
    case "travel": {
      const draft = drafts.get(baseId(action.along));
      if (draft) draft.token = { startSec: timed.timeSec, drawSec: timed.drawSec, label: action.label, color: action.color, reverse: action.reverse === true };
      return;
    }
    case "erase":
      removeWithAttachments(drafts, baseId(action.target));
      return;
    default:
      return;
  }
}

function toElement(id: string, draft: Draft, t: number, reduced: boolean): BoardElement {
  return {
    id,
    kind: draft.action.type,
    action: draft.action,
    startSec: draft.startSec,
    progress: progressAt(t, draft.startSec, draft.drawSec, reduced),
    emphasized: t < draft.emphasis.until,
    emphasisColor: draft.emphasis.color,
    dimmed: draft.dimmed,
    struck: draft.struck,
    cells: draft.cells?.map((c) => ({
      emphasized: t < c.emphasis.until,
      emphasisColor: c.emphasis.color,
      dimmed: c.dimmed,
      struck: c.struck,
    })),
    token: draft.token && {
      progress: progressAt(t, draft.token.startSec, draft.token.drawSec, reduced),
      label: draft.token.label,
      color: draft.token.color,
      reverse: draft.token.reverse,
    },
  };
}

/**
 * The whole whiteboard at lesson time `t`. A pure function of (lesson, timeline, t): the same
 * inputs always give the same board, however `t` was reached (play, seek, restart, replay).
 */
export function boardStateAt(lesson: LessonShape, timeline: Timeline, t: number, options: BoardOptions): BoardState {
  const clamped = clamp(t, 0, timeline.totalSec);
  const activeScene = timeline.scenes.reduce((found, scene, i) => (scene.startSec <= clamped ? i : found), 0);
  const activeSegment = timeline.segments.reduce((found, seg) => (seg.startSec <= clamped ? seg.id : found), timeline.segments[0]?.id ?? "");

  const drafts = new Map<string, Draft>();
  lesson.scenes.forEach((scene, index) => {
    if (index > activeScene) return;
    if (index === 0 || scene.transition === "clear") drafts.clear();
    for (const timed of timeline.actions) {
      if (timed.sceneId === scene.id && timed.timeSec <= t) applyAction(drafts, timed);
    }
  });

  return {
    sceneId: lesson.scenes[activeScene]?.id ?? "",
    activeSegmentId: activeSegment,
    elements: [...drafts].map(([id, draft]) => toElement(id, draft, t, options.reducedMotion)),
  };
}
