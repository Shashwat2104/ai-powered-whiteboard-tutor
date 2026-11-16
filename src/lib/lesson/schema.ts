import { z } from "zod";

/** Lesson format version. MAJOR changes break the renderer; MINOR changes only add. */
export const SCHEMA_VERSION = "1.0" as const;

export const BOARD_WIDTH = 1600;
export const BOARD_HEIGHT = 900;

export const PHASES = ["introduction", "foundation", "demonstration", "application", "recap"] as const;
export const COLORS = ["ink", "blue", "red", "green", "orange", "purple", "muted"] as const;
export const ACTION_TYPES = [
  "write",
  "shape",
  "connect",
  "array",
  "list",
  "equation",
  "annotate",
  "highlight",
  "dim",
  "travel",
  "erase",
] as const;

export const phaseSchema = z.enum(PHASES);
export const colorSchema = z.enum(COLORS);
export const sizeSchema = z.enum(["sm", "md", "lg", "title"]);

export const idSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,31}$/);
/** An element id, optionally with an array cell index, e.g. `arr` or `arr[3]`. */
export const refSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,31}(\[\d{1,2}\])?$/);
/** Where in the owning segment an action fires: its start, its end, or a `[[mN]]` marker. */
export const anchorSchema = z.string().regex(/^(start|end|m\d{1,3})$/);

export const xSchema = z.number().min(0).max(BOARD_WIDTH);
export const ySchema = z.number().min(0).max(BOARD_HEIGHT);
export const pointSchema = z.object({ x: xSchema, y: ySchema });
export const boardText = z.string().min(1).max(80);

const base = {
  id: idSchema,
  at: anchorSchema,
  drawSec: z.number().min(0.2).max(3).optional(),
};

export const visualActionSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("write"),
    x: xSchema,
    y: ySchema,
    text: boardText,
    size: sizeSchema,
    color: colorSchema.optional(),
    align: z.enum(["left", "center"]).optional(),
  }),
  z.object({
    ...base,
    type: z.literal("shape"),
    kind: z.enum(["rect", "rounded", "ellipse", "diamond"]),
    x: xSchema,
    y: ySchema,
    w: z.number().min(10).max(BOARD_WIDTH),
    h: z.number().min(10).max(BOARD_HEIGHT),
    label: boardText.optional(),
    color: colorSchema.optional(),
  }),
  z.object({
    ...base,
    type: z.literal("connect"),
    from: z.union([refSchema, pointSchema]),
    to: z.union([refSchema, pointSchema]),
    head: z.enum(["end", "both", "none"]),
    style: z.enum(["solid", "dashed"]).optional(),
    label: boardText.optional(),
    color: colorSchema.optional(),
  }),
  z.object({
    ...base,
    type: z.literal("array"),
    x: xSchema,
    y: ySchema,
    items: z.array(z.string().min(1).max(6)).min(1).max(12),
    cellW: z.number().min(40).max(200).optional(),
    showIndex: z.boolean().optional(),
  }),
  z.object({
    ...base,
    type: z.literal("list"),
    x: xSchema,
    y: ySchema,
    items: z.array(boardText).min(1).max(6),
    ordered: z.boolean().optional(),
    size: sizeSchema.optional(),
  }),
  z.object({
    ...base,
    type: z.literal("equation"),
    x: xSchema,
    y: ySchema,
    latex: z.string().min(1).max(120),
    size: sizeSchema.optional(),
  }),
  z.object({
    ...base,
    type: z.literal("annotate"),
    target: refSchema,
    text: boardText,
    side: z.enum(["top", "bottom", "left", "right"]),
    color: colorSchema.optional(),
  }),
  z.object({
    ...base,
    type: z.literal("highlight"),
    target: refSchema,
    color: colorSchema.optional(),
    forSec: z.number().min(0.5).max(10).optional(),
  }),
  z.object({ ...base, type: z.literal("dim"), target: refSchema, strike: z.boolean().optional() }),
  z.object({
    ...base,
    type: z.literal("travel"),
    along: refSchema,
    label: boardText.optional(),
    color: colorSchema.optional(),
    reverse: z.boolean().optional(),
  }),
  z.object({ ...base, type: z.literal("erase"), target: refSchema }),
]);

export const segmentSchema = z.object({
  id: idSchema,
  phase: phaseSchema,
  text: z.string().min(1).max(700),
  actions: z.array(visualActionSchema).max(15),
});

export const sceneSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(60),
  segmentIds: z.array(idSchema).min(1),
  transition: z.enum(["clear", "keep"]),
});

const keyPoint = z
  .string()
  .min(1)
  .max(80)
  .refine((s) => s.trim().split(/\s+/).length <= 12, "A key point must have at most 12 words");

export const recapSchema = z.object({ keyPoints: z.array(keyPoint).min(2).max(5) });

export const knowledgeCheckSchema = z.object({
  id: idSchema,
  question: z.string().min(1).max(200),
  options: z
    .array(z.string().min(1).max(120))
    .min(3)
    .max(4)
    .refine((o) => new Set(o).size === o.length, "Options must be unique"),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(1).max(300),
  sceneRef: idSchema.optional(),
});

export const difficultySchema = z.enum(["beginner", "intermediate", "advanced"]);

/** What the model returns for an accepted topic. Server fields are added later. */
export const lessonDraftSchema = z.object({
  status: z.literal("ok"),
  schemaVersion: z.literal(SCHEMA_VERSION),
  topic: z.string().min(1).max(200),
  scopeNote: z.string().min(1).max(160).optional(),
  objective: z.string().min(1).max(200),
  difficulty: difficultySchema,
  segments: z.array(segmentSchema).min(5).max(12),
  scenes: z.array(sceneSchema).min(2).max(8),
  recap: recapSchema,
  knowledgeChecks: z.array(knowledgeCheckSchema).min(1).max(3),
});

/** A lesson without the status field; the model returns it inside an envelope. */
export const lessonBodySchema = lessonDraftSchema.omit({ status: true });

/**
 * What the model is asked to return: a flat object (no union at the root, which some providers
 * reject) holding either a lesson or a short reason for declining the topic.
 */
export const lessonEnvelopeSchema = z.object({
  status: z.enum(["ok", "rejected"]),
  reason: z.string().min(1).max(300).optional(),
  lesson: lessonBodySchema.optional(),
});

export const lessonRejectedSchema = z.object({
  status: z.literal("rejected"),
  reason: z.string().min(1).max(300),
});

/** The model may accept the topic (a lesson) or decline it with a reason. */
export const lessonResponseSchema = z.discriminatedUnion("status", [lessonDraftSchema, lessonRejectedSchema]);

export const generatedBySchema = z.object({
  provider: z.string(),
  model: z.string(),
  attempts: z.number().int().min(1),
});

/** A validated lesson with the fields the server adds. Only this shape reaches the renderer. */
export const lessonSchema = lessonDraftSchema.omit({ status: true }).extend({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  generatedBy: generatedBySchema,
});

export type Phase = z.infer<typeof phaseSchema>;
export type Color = (typeof COLORS)[number];
export type VisualAction = z.infer<typeof visualActionSchema>;
export type ActionType = VisualAction["type"];
export type Segment = z.infer<typeof segmentSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type KnowledgeCheck = z.infer<typeof knowledgeCheckSchema>;
export type Difficulty = z.infer<typeof difficultySchema>;
export type LessonDraft = z.infer<typeof lessonDraftSchema>;
export type LessonResponse = z.infer<typeof lessonResponseSchema>;
export type Lesson = z.infer<typeof lessonSchema>;

/** The parts of a lesson the timeline and board need. Both Lesson and LessonDraft satisfy it. */
export interface LessonShape {
  segments: readonly Segment[];
  scenes: readonly Scene[];
}

/** Actions that add an element to the board. The others change an existing element. */
export const CREATING_TYPES: ReadonlySet<ActionType> = new Set([
  "write",
  "shape",
  "connect",
  "array",
  "list",
  "equation",
  "annotate",
]);
