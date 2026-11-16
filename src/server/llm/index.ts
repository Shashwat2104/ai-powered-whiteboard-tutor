import "server-only";
import { configuredLlm, type Env } from "../env";
import { AnthropicModel } from "./anthropic";
import { GeminiModel } from "./gemini";
import type { StructuredModel } from "./types";

/** The model providers to try, in configured order. Fakes load only in test mode. */
export async function loadLlmProviders(env: Env): Promise<StructuredModel[]> {
  const fake = env.testProviders ? (await import("./fake")).FakeModel : undefined;
  return configuredLlm(env).flatMap((provider): StructuredModel[] => {
    if (fake) return [new fake(provider)];
    if (provider === "anthropic" && env.ANTHROPIC_API_KEY) {
      return [new AnthropicModel({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL })];
    }
    if (provider === "gemini" && env.GEMINI_API_KEY) {
      return [new GeminiModel({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL })];
    }
    return [];
  });
}
