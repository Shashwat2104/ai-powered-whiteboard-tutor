import { baseId, cellIndex, estimateBox, insideBoard, overlapRatio, type Box } from "./layout";
import { extractMarkers, wordCount } from "./markers";
import { CREATING_TYPES, PHASES, type LessonDraft, type VisualAction } from "./schema";

export type SemanticCode =
  | "MARK_SYNTAX"
  | "MARK_MISSING"
  | "MARK_UNUSED"
  | "MARK_DUPLICATE"
  | "REF_UNKNOWN"
  | "ID_DUPLICATE"
  | "OUT_OF_BOUNDS"
  | "OVERLAP"
  | "TEXT_TOO_LONG"
  | "NARRATION_LENGTH"
  | "SEGMENT_LENGTH"
  | "PHASE_ORDER"
  | "SCENE_COVERAGE"
  | "ANSWER_INDEX"
  | "SCENE_REF"
  | "NO_VISUALS";

export interface SemanticError {
  code: SemanticCode;
  path: string;
  message: string;
}

export const LIMITS = {
  narrationMinWords: 220,
  narrationMaxWords: 400,
  segmentMinWords: 15,
  segmentMaxWords: 70,
  boardMaxWords: 12,
  boardMaxChars: 80,
  overlapMax: 0.15,
} as const;

export type SemanticInput = Pick<LessonDraft, "segments" | "scenes" | "knowledgeChecks">;

export interface SemanticOptions {
  /** Validate a small follow-up illustration: skip narration, phase and knowledge-check rules. */
  illustration?: boolean;
}

type Segments = SemanticInput["segments"];
type Scenes = SemanticInput["scenes"];

const fail = (code: SemanticCode, path: string, message: string): SemanticError => ({ code, path, message });
const isPointer = (at: string): boolean => at !== "start" && at !== "end";

function findDuplicates<T>(items: readonly T[], key: (item: T) => string): number[] {
  const seen = new Set<string>();
  const dupes: number[] = [];
  items.forEach((item, i) => {
    const k = key(item);
    if (seen.has(k)) dupes.push(i);
    seen.add(k);
  });
  return dupes;
}

function checkIds(input: SemanticInput): SemanticError[] {
  const errors: SemanticError[] = [];
  const kinds: [string, readonly { id: string }[]][] = [
    ["segments", input.segments],
    ["scenes", input.scenes],
    ["knowledgeChecks", input.knowledgeChecks],
  ];
  for (const [name, list] of kinds) {
    for (const i of findDuplicates(list, (x) => x.id)) errors.push(fail("ID_DUPLICATE", `${name}[${i}]`, "Duplicate id"));
  }
  const seen = new Set<string>();
  input.segments.forEach((segment, i) =>
    segment.actions.forEach((action, j) => {
      if (seen.has(action.id)) errors.push(fail("ID_DUPLICATE", `segments[${i}].actions[${j}]`, `Duplicate action id ${action.id}`));
      seen.add(action.id);
    }),
  );
  return errors;
}

function checkMarkers(segments: Segments): SemanticError[] {
  const errors: SemanticError[] = [];
  const seen = new Set<string>();
  segments.forEach((segment, i) => {
    const { marks, errors: syntax } = extractMarkers(segment.text);
    for (const message of syntax) errors.push(fail("MARK_SYNTAX", `segments[${i}].text`, message));
    const names = new Set(marks.map((m) => m.name));
    for (const mark of marks) {
      if (seen.has(mark.name)) errors.push(fail("MARK_DUPLICATE", `segments[${i}].text`, `Marker ${mark.name} is used more than once`));
      seen.add(mark.name);
    }
    const used = new Set<string>();
    segment.actions.forEach((action, j) => {
      if (!isPointer(action.at)) return;
      used.add(action.at);
      if (!names.has(action.at)) errors.push(fail("MARK_MISSING", `segments[${i}].actions[${j}]`, `Marker ${action.at} is not in the segment text`));
    });
    for (const name of names) {
      if (!used.has(name)) errors.push(fail("MARK_UNUSED", `segments[${i}].text`, `Marker ${name} has no action`));
    }
  });
  return errors;
}

function checkLengths(segments: Segments): SemanticError[] {
  const errors: SemanticError[] = [];
  let total = 0;
  segments.forEach((segment, i) => {
    const words = wordCount(segment.text);
    total += words;
    if (words < LIMITS.segmentMinWords || words > LIMITS.segmentMaxWords) {
      errors.push(fail("SEGMENT_LENGTH", `segments[${i}].text`, `Segment has ${words} words; expected ${LIMITS.segmentMinWords}-${LIMITS.segmentMaxWords}`));
    }
  });
  if (total < LIMITS.narrationMinWords || total > LIMITS.narrationMaxWords) {
    errors.push(fail("NARRATION_LENGTH", "segments", `Narration has ${total} words; expected ${LIMITS.narrationMinWords}-${LIMITS.narrationMaxWords}`));
  }
  return errors;
}

function checkPhases(segments: Segments): SemanticError[] {
  const errors: SemanticError[] = [];
  let highest = -1;
  segments.forEach((segment, i) => {
    const index = PHASES.indexOf(segment.phase);
    if (index < highest) errors.push(fail("PHASE_ORDER", `segments[${i}].phase`, `Phase ${segment.phase} comes after a later phase`));
    highest = Math.max(highest, index);
  });
  if (!segments.some((s) => s.phase === "demonstration")) {
    errors.push(fail("PHASE_ORDER", "segments", "At least one segment must be in the demonstration phase"));
  }
  return errors;
}

function checkSceneCoverage(segments: Segments, scenes: Scenes): SemanticError[] {
  const flat = scenes.flatMap((s) => s.segmentIds);
  const expected = segments.map((s) => s.id);
  const same = flat.length === expected.length && flat.every((id, i) => id === expected[i]);
  return same ? [] : [fail("SCENE_COVERAGE", "scenes", "Scenes must cover every segment exactly once, in order")];
}

function checkKnowledgeChecks(input: SemanticInput): SemanticError[] {
  const errors: SemanticError[] = [];
  const sceneIds = new Set(input.scenes.map((s) => s.id));
  input.knowledgeChecks.forEach((q, i) => {
    const duplicated = new Set(q.options).size !== q.options.length;
    if (q.answerIndex < 0 || q.answerIndex >= q.options.length || duplicated) {
      errors.push(fail("ANSWER_INDEX", `knowledgeChecks[${i}]`, "Answer index is out of range or options are duplicated"));
    }
    if (q.sceneRef !== undefined && !sceneIds.has(q.sceneRef)) {
      errors.push(fail("SCENE_REF", `knowledgeChecks[${i}].sceneRef`, `Unknown scene ${q.sceneRef}`));
    }
  });
  return errors;
}

// ---- Board-level checks (references, bounds, overlap, text) ---------------------------------

interface Present {
  action: VisualAction;
  box: Box | null;
}

function boardTexts(action: VisualAction): string[] {
  switch (action.type) {
    case "write":
    case "annotate":
      return [action.text];
    case "shape":
    case "connect":
    case "travel":
      return action.label ? [action.label] : [];
    case "list":
      return action.items;
    default:
      return [];
  }
}

function refTargets(action: VisualAction): string[] {
  switch (action.type) {
    case "connect":
      return [action.from, action.to].filter((r): r is string => typeof r === "string");
    case "travel":
      return [action.along];
    case "annotate":
    case "highlight":
    case "dim":
    case "erase":
      return [action.target];
    default:
      return [];
  }
}

function refIsValid(ref: string, action: VisualAction, present: ReadonlyMap<string, Present>): boolean {
  const target = present.get(baseId(ref))?.action;
  if (!target) return false;
  const index = cellIndex(ref);
  if (index !== null) return action.type !== "erase" && action.type !== "travel" && target.type === "array" && index < target.items.length;
  return action.type !== "travel" || target.type === "connect";
}

function removeWithAttachments(present: Map<string, Present>, id: string): void {
  present.delete(id);
  for (const [key, entry] of [...present]) {
    const a = entry.action;
    const attached =
      (a.type === "connect" && [a.from, a.to].some((r) => typeof r === "string" && baseId(r) === id)) ||
      (a.type === "annotate" && baseId(a.target) === id);
    if (attached) present.delete(key);
  }
}

function checkAction(action: VisualAction, path: string, present: Map<string, Present>): SemanticError[] {
  const errors: SemanticError[] = [];
  const tooLong = boardTexts(action).some(
    (t) => t.trim().split(/\s+/).length > LIMITS.boardMaxWords || t.length > LIMITS.boardMaxChars,
  );
  if (tooLong) errors.push(fail("TEXT_TOO_LONG", path, `Board text must be at most ${LIMITS.boardMaxWords} words and ${LIMITS.boardMaxChars} characters`));

  for (const ref of refTargets(action)) {
    if (!refIsValid(ref, action, present)) errors.push(fail("REF_UNKNOWN", path, `Reference ${ref} does not point to an element on the board`));
  }

  const box = estimateBox(action);
  if (box && !insideBoard(box)) errors.push(fail("OUT_OF_BOUNDS", path, "Element extends outside the 1600x900 board"));
  if (box) {
    const clash = [...present.values()].some((p) => p.box !== null && overlapRatio(box, p.box) > LIMITS.overlapMax);
    if (clash) errors.push(fail("OVERLAP", path, "Element overlaps another element by more than 15%"));
  }

  if (CREATING_TYPES.has(action.type)) present.set(action.id, { action, box });
  else if (action.type === "erase") removeWithAttachments(present, baseId(action.target));
  return errors;
}

interface Placed {
  seg: number;
  act: number;
  rank: number;
  key: number;
  action: VisualAction;
}

function placeSceneActions(segments: Segments, segmentIds: readonly string[]): Placed[] {
  const placed: Placed[] = [];
  segmentIds.forEach((id, rank) => {
    const seg = segments.findIndex((s) => s.id === id);
    const segment = segments[seg];
    if (!segment) return;
    const offsets = new Map(extractMarkers(segment.text).marks.map((m) => [m.name, m.offset]));
    segment.actions.forEach((action, act) => {
      const key = action.at === "start" ? -1 : action.at === "end" ? Number.POSITIVE_INFINITY : (offsets.get(action.at) ?? 0);
      placed.push({ seg, act, rank, key, action });
    });
  });
  return placed.sort((a, b) => a.rank - b.rank || a.key - b.key || a.act - b.act);
}

function checkBoard(input: SemanticInput): SemanticError[] {
  const errors: SemanticError[] = [];
  const present = new Map<string, Present>();
  input.scenes.forEach((scene, sceneIdx) => {
    if (scene.transition === "clear" || sceneIdx === 0) present.clear();
    const placed = placeSceneActions(input.segments, scene.segmentIds);
    for (const p of placed) errors.push(...checkAction(p.action, `segments[${p.seg}].actions[${p.act}]`, present));
    if (!placed.some((p) => CREATING_TYPES.has(p.action.type))) {
      errors.push(fail("NO_VISUALS", `scenes[${sceneIdx}]`, `Scene ${scene.id} never adds anything to the board`));
    }
  });
  return errors;
}

/** Check rules a schema cannot express: anchors, references, layout, lengths and ordering. */
export function validateLessonSemantics(input: SemanticInput, options: SemanticOptions = {}): SemanticError[] {
  const errors: SemanticError[] = [...checkIds(input), ...checkMarkers(input.segments)];
  if (!options.illustration) {
    errors.push(...checkLengths(input.segments), ...checkPhases(input.segments), ...checkKnowledgeChecks(input));
  }
  const coverage = checkSceneCoverage(input.segments, input.scenes);
  errors.push(...coverage);
  if (coverage.length === 0) errors.push(...checkBoard(input));
  return errors;
}
