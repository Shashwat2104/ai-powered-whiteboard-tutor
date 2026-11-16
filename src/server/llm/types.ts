import "server-only";
import type { z } from "zod";
import type { LlmProvider } from "../env";

export type LlmErrorKind = "rate_limited" | "timeout" | "refusal" | "server" | "invalid_output" | "config";

/** A failure from one model provider. The router moves on to the next provider after any of these. */
export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    readonly provider: LlmProvider | "fake",
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type Effort = "low" | "medium" | "high";

export interface GenerateRequest<T> {
  /** What is being generated; only the test fakes look at this. */
  kind: "lesson" | "followup";
  schema: z.ZodType<T>;
  system: string;
  messages: ChatMessage[];
  effort: Effort;
  timeoutMs: number;
  maxTokens?: number;
}

export interface GenerateResult<T> {
  data: T;
  /** The model's raw text, sent back to it when a repair is needed. */
  raw: string;
  model: string;
}

export interface StructuredModel {
  readonly provider: LlmProvider;
  generate<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>>;
}
