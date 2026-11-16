import { z } from "zod";
import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  difficultySchema,
  idSchema,
  refSchema,
  colorSchema,
  sizeSchema,
  xSchema,
  ySchema,
  pointSchema,
  boardText,
} from "../lesson/schema";

export const illustrationAnchorSchema = z.enum(["start", "end"]);

const illustrationBase = {
  id: idSchema,
  at: illustrationAnchorSchema,
  drawSec: z.number().min(0.2).max(3).optional(),
};

export const illustrationActionSchema = z.discriminatedUnion("type", [
  z.object({
    ...illustrationBase,
    type: z.literal("write"),
    x: xSchema,
    y: ySchema,
    text: boardText,
    size: sizeSchema,
    color: colorSchema.optional(),
    align: z.enum(["left", "center"]).optional(),
  }),
  z.object({
    ...illustrationBase,
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
    ...illustrationBase,
    type: z.literal("connect"),
    from: z.union([refSchema, pointSchema]),
    to: z.union([refSchema, pointSchema]),
    head: z.enum(["end", "both", "none"]),
    style: z.enum(["solid", "dashed"]).optional(),
    label: boardText.optional(),
    color: colorSchema.optional(),
  }),
  z.object({
    ...illustrationBase,
    type: z.literal("array"),
    x: xSchema,
    y: ySchema,
    items: z.array(z.string().min(1).max(6)).min(1).max(12),
    cellW: z.number().min(40).max(200).optional(),
    showIndex: z.boolean().optional(),
  }),
  z.object({
    ...illustrationBase,
    type: z.literal("list"),
    x: xSchema,
    y: ySchema,
    items: z.array(boardText).min(1).max(6),
    ordered: z.boolean().optional(),
    size: sizeSchema.optional(),
  }),
  z.object({
    ...illustrationBase,
    type: z.literal("equation"),
    x: xSchema,
    y: ySchema,
    latex: z.string().min(1).max(120),
    size: sizeSchema.optional(),
  }),
  z.object({
    ...illustrationBase,
    type: z.literal("annotate"),
    target: refSchema,
    text: boardText,
    side: z.enum(["top", "bottom", "left", "right"]),
    color: colorSchema.optional(),
  }),
  z.object({
    ...illustrationBase,
    type: z.literal("highlight"),
    target: refSchema,
    color: colorSchema.optional(),
    forSec: z.number().min(0.5).max(10).optional(),
  }),
  z.object({
    ...illustrationBase,
    type: z.literal("dim"),
    target: refSchema,
    strike: z.boolean().optional(),
  }),
  z.object({
    ...illustrationBase,
    type: z.literal("travel"),
    along: refSchema,
    label: boardText.optional(),
    color: colorSchema.optional(),
    reverse: z.boolean().optional(),
  }),
  z.object({
    ...illustrationBase,
    type: z.literal("erase"),
    target: refSchema,
  }),
]);

export const illustrationSchema = z.object({
  actions: z.array(illustrationActionSchema).max(12),
  durationSec: z.number().min(2).max(15),
});

export const lessonContextSchema = z.object({
  lessonId: z.string().min(1),
  topic: z.string().min(1),
  objective: z.string().min(1),
  difficulty: difficultySchema,
  transcript: z.array(
    z.object({
      segmentId: z.string().min(1),
      sceneId: z.string().min(1),
      text: z.string().min(1),
    }),
  ),
  scenes: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
    }),
  ),
  recap: z.array(z.string()),
});

export const conversationTurnSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

export const followupRequestSchema = z.object({
  turnId: z.string().min(1),
  lessonContext: lessonContextSchema,
  history: z.array(conversationTurnSchema).max(10, "History can hold at most 10 turns."),
  question: z
    .string()
    .trim()
    .min(1, "Question cannot be empty.")
    .max(500, "Question can be at most 500 characters."),
});

/** Schema for model generation output (before turnId is attached) */
export const followupModelOutputSchema = z.object({
  answer: z.string().min(1).max(1200),
  sceneRef: z.string().optional(),
  illustration: illustrationSchema.optional(),
});

export const followupAnswerSchema = z.object({
  turnId: z.string().min(1),
  answer: z.string().min(1).max(1200),
  sceneRef: z.string().optional(),
  illustration: illustrationSchema.optional(),
});

// PascalCase aliases for task specification matching
export const FollowupRequestSchema = followupRequestSchema;
export const FollowupAnswerSchema = followupAnswerSchema;
export const IllustrationSchema = illustrationSchema;

export type Illustration = z.infer<typeof illustrationSchema>;
export type LessonContext = z.infer<typeof lessonContextSchema>;
export type ConversationTurn = z.infer<typeof conversationTurnSchema>;
export type FollowupRequest = z.infer<typeof followupRequestSchema>;
export type FollowupAnswer = z.infer<typeof followupAnswerSchema>;
export type FollowupModelOutput = z.infer<typeof followupModelOutputSchema>;
