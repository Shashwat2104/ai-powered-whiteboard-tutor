import "server-only";
import type { z } from "zod";
import { log } from "../log";
import { repairMessage, type RepairIssue } from "../prompts/repair";
import { ApiError } from "../security/errors";
import { LlmError, type ChatMessage, type Effort, type StructuredModel } from "./types";

/** One provider gets the first reply plus this many repair rounds before the router moves on. */
export const MAX_ATTEMPTS_PER_PROVIDER = 3;
const SAFETY_MARGIN_MS = 3_000;
const MIN_ATTEMPT_MS = 8_000;

export interface RouterRequest<T> {
  kind: "lesson" | "followup";
  schema: z.ZodType<T>;
  system: string;
  userContent: string;
  effort: Effort;
  /** Returns problems with otherwise well-formed output; an empty list means accepted. */
  validate?: (data: T) => RepairIssue[];
  /** Longest a single provider call may take. */
  attemptTimeoutMs?: number;
  /** Total time the whole routing may use across providers and repairs. */
  budgetMs?: number;
}

export interface RouterResult<T> {
  data: T;
  provider: string;
  model: string;
  /** Calls used on the provider that succeeded. */
  attempts: number;
}

const DEFAULT_ATTEMPT_MS = 60_000;
const DEFAULT_BUDGET_MS = 100_000;

/**
 * Try each provider in order. A provider may be asked to repair invalid output up to twice. Any
 * provider failure (rate limit, timeout, refusal, bad output) moves on to the next provider.
 */
export async function generateWithFallback<T>(
  request: RouterRequest<T>,
  providers: readonly StructuredModel[],
  now: () => number = Date.now,
): Promise<RouterResult<T>> {
  const deadline = now() + (request.budgetMs ?? DEFAULT_BUDGET_MS);

  for (const provider of providers) {
    let messages: ChatMessage[] = [{ role: "user", content: request.userContent }];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_PROVIDER; attempt++) {
      const remaining = deadline - now() - SAFETY_MARGIN_MS;
      if (remaining < MIN_ATTEMPT_MS) throw new ApiError("generation_failed");
      try {
        const result = await provider.generate({
          kind: request.kind,
          schema: request.schema,
          system: request.system,
          messages,
          effort: request.effort,
          timeoutMs: Math.min(request.attemptTimeoutMs ?? DEFAULT_ATTEMPT_MS, remaining),
        });
        const issues = request.validate?.(result.data) ?? [];
        if (issues.length === 0) return { data: result.data, provider: provider.provider, model: result.model, attempts: attempt };
        log("warn", "lesson failed validation", { provider: provider.provider, attempt, issues: issues.length, details: issues });
        messages = [
          ...messages,
          { role: "assistant", content: result.raw },
          { role: "user", content: repairMessage(issues) },
        ];
      } catch (error) {
        if (!(error instanceof LlmError)) throw error;
        log("warn", "provider failed", { provider: provider.provider, kind: error.kind, attempt });
        if (error.kind !== "invalid_output") break;
        messages = [
          ...messages,
          { role: "user", content: `That reply was not valid JSON for the schema (${error.message}). Reply again with only the JSON object.` },
        ];
      }
    }
  }
  throw new ApiError("generation_failed");
}
