import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { log } from "../log";
import { LlmError, type GenerateRequest, type GenerateResult, type StructuredModel } from "./types";

const DEFAULT_MAX_TOKENS = 16_000;

export interface AnthropicConfig {
  apiKey: string;
  model: string;
}

/** Claude with schema-constrained output and the server-side refusal fallback. */
export class AnthropicModel implements StructuredModel {
  readonly provider = "anthropic" as const;

  constructor(private readonly config: AnthropicConfig) {}

  async generate<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const client = new Anthropic({ apiKey: this.config.apiKey, maxRetries: 1, timeout: request.timeoutMs });
    try {
      const message = await client.beta.messages.create({
        model: this.config.model,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: request.system,
        messages: request.messages,
        output_config: { format: zodOutputFormat(request.schema), effort: request.effort },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      if (message.stop_reason === "refusal") {
        throw new LlmError("refusal", "The model declined this request", "anthropic");
      }
      const raw = message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
      return { data: parseOutput(request, raw), raw, model: message.model };
    } catch (error) {
      throw toLlmError(error);
    }
  }
}

function parseOutput<T>(request: GenerateRequest<T>, raw: string): T {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new LlmError("invalid_output", "Reply was not valid JSON", "anthropic");
  }
  const parsed = request.schema.safeParse(json);
  if (!parsed.success) throw new LlmError("invalid_output", parsed.error.issues[0]?.message ?? "Schema mismatch", "anthropic");
  return parsed.data;
}

/** Map SDK errors to router error kinds, most specific class first. */
export function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  if (error instanceof Anthropic.RateLimitError) return new LlmError("rate_limited", "Rate limited", "anthropic");
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new LlmError("timeout", "Timed out", "anthropic");
  if (error instanceof Anthropic.APIConnectionError) return new LlmError("server", "Connection failed", "anthropic");
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new LlmError("config", "Anthropic key was rejected", "anthropic");
  }
  if (error instanceof Anthropic.APIError) {
    log("warn", "anthropic api error", { status: error.status });
    return new LlmError("server", `Anthropic error ${error.status ?? ""}`.trim(), "anthropic");
  }
  return new LlmError("invalid_output", error instanceof Error ? error.message : "Unparsable output", "anthropic");
}
