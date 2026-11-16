import "server-only";
import {
  followupModelOutputSchema,
  type FollowupAnswer,
  type Illustration,
  type LessonContext,
  type ConversationTurn,
} from "@/lib/followup/schema";
import { validateLessonSemantics, type SemanticInput } from "@/lib/lesson/semantics";
import type { Env } from "../env";
import { loadLlmProviders } from "../llm";
import { generateWithFallback } from "../llm/router";
import type { StructuredModel } from "../llm/types";
import { followupSystemPrompt, followupUserMessage } from "../prompts/followup";
import { ApiError } from "../security/errors";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const FOLLOWUP_ATTEMPT_MS = 18_000;
const FOLLOWUP_BUDGET_MS = 26_000;
const MAX_CACHE_SIZE = 1000;

interface CacheEntry {
  answer: FollowupAnswer;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function getCachedFollowup(turnId: string, now = Date.now()): FollowupAnswer | null {
  const entry = cache.get(turnId);
  if (!entry) return null;
  if (now > entry.expiresAt) {
    cache.delete(turnId);
    return null;
  }
  // LRU bump
  cache.delete(turnId);
  cache.set(turnId, entry);
  return entry.answer;
}

export function setCachedFollowup(
  turnId: string,
  answer: FollowupAnswer,
  now = Date.now(),
  ttlMs = CACHE_TTL_MS,
): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(turnId, { answer, expiresAt: now + ttlMs });
}

export function resetFollowupCache(): void {
  cache.clear();
}

export interface AnswerFollowupInput {
  turnId: string;
  lessonContext: LessonContext;
  history: readonly ConversationTurn[];
  question: string;
}

/**
 * Answers a learner's question about an existing lesson using LLM fallback routing.
 * Applies caching by turnId, validates semantic correctness of optional illustrations,
 * drops invalid illustrations or unmatched scene references without failing the answer.
 */
export async function answerFollowup(
  input: AnswerFollowupInput,
  env: Env,
  providers?: readonly StructuredModel[],
): Promise<FollowupAnswer> {
  const cached = getCachedFollowup(input.turnId);
  if (cached) {
    return cached;
  }

  const models = providers ?? (await loadLlmProviders(env));
  if (models.length === 0) throw new ApiError("generation_failed");

  const result = await generateWithFallback(
    {
      kind: "followup",
      schema: followupModelOutputSchema,
      system: followupSystemPrompt(),
      userContent: followupUserMessage(input.lessonContext, input.history, input.question),
      effort: env.ANTHROPIC_EFFORT_FOLLOWUP ?? "low",
      // The follow-up route may run for 30 s (maxDuration); finish routing well before that.
      attemptTimeoutMs: FOLLOWUP_ATTEMPT_MS,
      budgetMs: FOLLOWUP_BUDGET_MS,
    },
    models,
  );

  let sceneRef: string | undefined = result.data.sceneRef;
  if (sceneRef && !input.lessonContext.scenes.some((s) => s.id === sceneRef)) {
    sceneRef = undefined;
  }

  let illustration: Illustration | undefined = result.data.illustration;
  if (illustration) {
    if (!illustration.actions || illustration.actions.length === 0) {
      illustration = undefined;
    } else {
      const hasInvalidAnchor = illustration.actions.some((a) => a.at !== "start" && a.at !== "end");
      if (hasInvalidAnchor) {
        illustration = undefined;
      } else {
        const syntheticInput: SemanticInput = {
          scenes: [{ id: "sc-synth", title: "Illustration", segmentIds: ["seg-synth"], transition: "clear" as const }],
          segments: [
            {
              id: "seg-synth",
              phase: "demonstration",
              text: "Illustration",
              actions: illustration.actions,
            },
          ],
          knowledgeChecks: [],
        };
        const errors = validateLessonSemantics(syntheticInput, { illustration: true });
        if (errors.length > 0) {
          illustration = undefined;
        }
      }
    }
  }

  const response: FollowupAnswer = {
    turnId: input.turnId,
    answer: result.data.answer,
    ...(sceneRef ? { sceneRef } : {}),
    ...(illustration ? { illustration } : {}),
  };

  setCachedFollowup(input.turnId, response);
  return response;
}
