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
  /** Deterministic clean-up applied to every reply before it is validated (must not mutate). */
  normalize?: (data: T) => T;
  /** Returns problems with otherwise well-formed output; an empty list means accepted. */
  validate?: (data: T) => RepairIssue[];
  /**
   * True when the remaining problems are cosmetic (the output still works). Such output is never
   * accepted while repairs remain, but the best one is returned instead of failing the request
   * once repairs or time run out.
   */
  tolerate?: (issues: readonly RepairIssue[]) => boolean;
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

/** Errors worth one immediate retry on the same provider (overloaded or slow, not misconfigured). */
const TRANSIENT_KINDS = new Set(["server", "timeout"]);

interface Candidate<T> {
  result: RouterResult<T>;
  issueCount: number;
}

/** Keeps the tolerable output with the fewest problems, returned when nothing better arrives. */
class BestCandidate<T> {
  private best: Candidate<T> | undefined;

  offer(candidate: Candidate<T>): void {
    if (!this.best || candidate.issueCount < this.best.issueCount) this.best = candidate;
  }

  get present(): boolean {
    return this.best !== undefined;
  }

  /** The best candidate, or a generation_failed error when there is none. */
  settle(): RouterResult<T> {
    if (!this.best) throw new ApiError("generation_failed");
    log("warn", "accepted output with cosmetic issues", { provider: this.best.result.provider, issues: this.best.issueCount });
    return this.best.result;
  }
}

type ProviderOutcome<T> = { done: RouterResult<T> } | { done?: undefined; outOfTime: boolean };

/**
 * Try each provider in order. A provider may be asked to repair invalid output up to twice, and a
 * transient error (overload, timeout) is retried once. Other failures move on to the next provider.
 * When everything fails, the best output with only tolerable problems is returned, if there is one.
 */
export async function generateWithFallback<T>(
  request: RouterRequest<T>,
  providers: readonly StructuredModel[],
  now: () => number = Date.now,
): Promise<RouterResult<T>> {
  const deadline = now() + (request.budgetMs ?? DEFAULT_BUDGET_MS);
  const best = new BestCandidate<T>();

  for (const provider of providers) {
    const outcome = await tryProvider(request, provider, deadline, now, best);
    if (outcome.done) return outcome.done;
    // A working lesson with cosmetic issues beats a fresh start on a slower or failing provider.
    if (outcome.outOfTime || best.present) break;
  }
  return best.settle();
}

async function tryProvider<T>(
  request: RouterRequest<T>,
  provider: StructuredModel,
  deadline: number,
  now: () => number,
  best: BestCandidate<T>,
): Promise<ProviderOutcome<T>> {
  let messages: ChatMessage[] = [{ role: "user", content: request.userContent }];
  let retriedTransient = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_PROVIDER; attempt++) {
    const remaining = deadline - now() - SAFETY_MARGIN_MS;
    if (remaining < MIN_ATTEMPT_MS) return { outOfTime: true };
    try {
      const result = await provider.generate({
        kind: request.kind,
        schema: request.schema,
        system: request.system,
        messages,
        effort: request.effort,
        timeoutMs: Math.min(request.attemptTimeoutMs ?? DEFAULT_ATTEMPT_MS, remaining),
      });
      const data = request.normalize ? request.normalize(result.data) : result.data;
      const accepted: RouterResult<T> = { data, provider: provider.provider, model: result.model, attempts: attempt };
      const issues = request.validate?.(data) ?? [];
      if (issues.length === 0) return { done: accepted };
      log("warn", "lesson failed validation", { provider: provider.provider, attempt, issues: issues.length, details: issues });
      if (request.tolerate?.(issues)) best.offer({ result: accepted, issueCount: issues.length });
      messages = [...messages, { role: "assistant", content: result.raw }, { role: "user", content: repairMessage(issues) }];
    } catch (error) {
      if (!(error instanceof LlmError)) throw error;
      log("warn", "provider failed", { provider: provider.provider, kind: error.kind, attempt });
      if (TRANSIENT_KINDS.has(error.kind) && !retriedTransient) {
        retriedTransient = true;
        continue;
      }
      if (error.kind !== "invalid_output") break;
      messages = [
        ...messages,
        { role: "user", content: `That reply was not valid JSON for the schema (${error.message}). Reply again with only the JSON object.` },
      ];
    }
  }
  return { outOfTime: false };
}
