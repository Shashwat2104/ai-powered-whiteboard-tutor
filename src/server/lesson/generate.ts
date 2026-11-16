import "server-only";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { fitToBoard } from "@/lib/lesson/layout";
import { lessonEnvelopeSchema, lessonSchema, type Difficulty, type Lesson } from "@/lib/lesson/schema";
import { onlyCosmeticIssues, validateLessonSemantics } from "@/lib/lesson/semantics";
import type { Env } from "../env";
import { loadLlmProviders } from "../llm";
import { generateWithFallback } from "../llm/router";
import type { StructuredModel } from "../llm/types";
import { lessonSystemPrompt, lessonUserMessage } from "../prompts/lesson";
import type { RepairIssue } from "../prompts/repair";
import { ApiError } from "../security/errors";

export const TOPIC_MAX_CHARS = 200;

/** Trim, collapse whitespace and strip control characters. Throws invalid_input for unusable topics. */
export function normalizeTopic(raw: string): string {
  const topic = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (topic.length === 0) throw new ApiError("invalid_input", "Please enter a topic.");
  if (topic.length > TOPIC_MAX_CHARS) throw new ApiError("invalid_input", `Topics can be at most ${TOPIC_MAX_CHARS} characters.`);
  if (!/\p{L}.*\p{L}|\p{N}/u.test(topic)) throw new ApiError("invalid_input", "Please enter a topic made of words.");
  return topic;
}

type Envelope = z.infer<typeof lessonEnvelopeSchema>;

/** Nudge elements that poke past the board edge back inside, so a few stray pixels never fail a lesson. */
export function fitEnvelopeToBoard(envelope: Envelope): Envelope {
  if (!envelope.lesson) return envelope;
  const segments = envelope.lesson.segments.map((segment) => ({ ...segment, actions: segment.actions.map(fitToBoard) }));
  return { ...envelope, lesson: { ...envelope.lesson, segments } };
}

function validateEnvelope(envelope: Envelope): RepairIssue[] {
  if (envelope.status === "rejected") return [];
  if (!envelope.lesson) return [{ code: "LESSON_MISSING", path: "lesson", message: "status is ok but lesson is missing" }];
  return validateLessonSemantics(envelope.lesson);
}

export interface GenerateLessonInput {
  topic: string;
  difficulty: Difficulty;
}

/** Ask the models for a lesson, validate it, and add the server-owned fields. */
export async function generateLesson(
  input: GenerateLessonInput,
  env: Env,
  providers?: readonly StructuredModel[],
): Promise<Lesson> {
  const topic = normalizeTopic(input.topic);
  const models = providers ?? (await loadLlmProviders(env));
  if (models.length === 0) throw new ApiError("generation_failed");

  const result = await generateWithFallback(
    {
      kind: "lesson",
      schema: lessonEnvelopeSchema,
      system: lessonSystemPrompt(),
      userContent: lessonUserMessage(topic, input.difficulty),
      effort: env.ANTHROPIC_EFFORT_LESSON,
      normalize: fitEnvelopeToBoard,
      validate: validateEnvelope,
      tolerate: onlyCosmeticIssues,
    },
    models,
  );

  const { status, reason, lesson: body } = result.data;
  if (status === "rejected") throw new ApiError("rejected_topic", reason ?? undefined);
  if (!body) throw new ApiError("generation_failed");

  return lessonSchema.parse({
    ...body,
    topic,
    difficulty: input.difficulty,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    generatedBy: { provider: result.provider, model: result.model, attempts: result.attempts },
  });
}
