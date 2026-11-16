import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { LlmError, type GenerateRequest, type GenerateResult, type StructuredModel } from "./types";
import { sanitizeSchema } from "./sanitize-schema";

const DEFAULT_MAX_TOKENS = 16_000;

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

/** Gemini with JSON-schema constrained output. The reply is validated with Zod afterwards. */
export class GeminiModel implements StructuredModel {
  readonly provider = "gemini" as const;

  constructor(private readonly config: GeminiConfig) {}

  async generate<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const ai = new GoogleGenAI({ apiKey: this.config.apiKey });
    let text: string;
    try {
      const response = await ai.models.generateContent({
        model: this.config.model,
        contents: request.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        config: {
          systemInstruction: request.system,
          responseMimeType: "application/json",
          responseJsonSchema: sanitizeSchema(z.toJSONSchema(request.schema), "gemini"),
          maxOutputTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          abortSignal: AbortSignal.timeout(request.timeoutMs),
        },
      });
      text = response.text ?? "";
    } catch (error) {
      throw toLlmError(error);
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new LlmError("invalid_output", "Reply was not valid JSON", "gemini");
    }
    const parsed = request.schema.safeParse(json);
    if (!parsed.success) throw new LlmError("invalid_output", parsed.error.issues[0]?.message ?? "Schema mismatch", "gemini");
    return { data: parsed.data, raw: text, model: this.config.model };
  }
}

export function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return new LlmError("timeout", "Timed out", "gemini");
  }
  if (error instanceof ApiError) {
    if (error.status === 429) return new LlmError("rate_limited", "Rate limited", "gemini");
    if (error.status === 401 || error.status === 403) return new LlmError("config", "Gemini key was rejected", "gemini");
    return new LlmError("server", `Gemini error ${error.status}`, "gemini");
  }
  return new LlmError("server", error instanceof Error ? error.message : "Gemini failed", "gemini");
}
