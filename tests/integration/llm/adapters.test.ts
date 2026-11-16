import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseEnv } from "@/server/env";
import { AnthropicModel } from "@/server/llm/anthropic";
import { GeminiModel } from "@/server/llm/gemini";
import { loadLlmProviders } from "@/server/llm";
import { LlmError, type GenerateRequest, type LlmErrorKind } from "@/server/llm/types";
import { mockServer } from "../../helpers/msw";

const server = mockServer();

const schema = z.object({ n: z.number(), label: z.literal("ok") });
const request: GenerateRequest<z.infer<typeof schema>> = {
  kind: "lesson",
  schema,
  system: "You teach.",
  messages: [{ role: "user", content: "hello" }],
  effort: "medium",
  timeoutMs: 5000,
};

async function kindOf(promise: Promise<unknown>): Promise<LlmErrorKind | undefined> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  return error instanceof LlmError ? error.kind : undefined;
}

const CLAUDE = "https://api.anthropic.com/v1/messages";
const claude = () => new AnthropicModel({ apiKey: "sk-ant-test", model: "claude-test" });
const message = (text: string, stop = "end_turn") => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-test",
  content: [{ type: "text", text }],
  stop_reason: stop,
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
});
const FAST = { "retry-after-ms": "1" };

describe("AnthropicModel", () => {
  it("sends a schema-constrained request with effort and the refusal fallback, and returns the parsed output", async () => {
    let seen: { headers: Headers; body: Record<string, unknown> } | undefined;
    server.use(
      http.post(CLAUDE, async ({ request: r }) => {
        seen = { headers: r.headers, body: (await r.json()) as Record<string, unknown> };
        return HttpResponse.json(message(JSON.stringify({ n: 7, label: "ok" })));
      }),
    );
    const result = await claude().generate(request);

    expect(result.data).toEqual({ n: 7, label: "ok" });
    expect(result.raw).toContain('"n":7');
    expect([...(seen?.headers.values() ?? [])].some((v) => v.includes("sk-ant-test"))).toBe(true);
    expect(seen?.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(seen?.body).toMatchObject({
      model: "claude-test",
      system: "You teach.",
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema" } },
    });
  });

  it("maps a refusal to the refusal kind", async () => {
    server.use(http.post(CLAUDE, () => HttpResponse.json(message("", "refusal"))));
    expect(await kindOf(claude().generate(request))).toBe("refusal");
  });

  it.each([
    [429, "rate_limited"],
    [401, "config"],
    [403, "config"],
    [500, "server"],
    [400, "server"],
  ] as const)("maps HTTP %i to %s", async (status, kind) => {
    server.use(http.post(CLAUDE, () => HttpResponse.json({ type: "error", error: { type: "api_error", message: "x" } }, { status, headers: FAST })));
    expect(await kindOf(claude().generate(request))).toBe(kind);
  });

  it("maps unparsable output to invalid_output", async () => {
    server.use(http.post(CLAUDE, () => HttpResponse.json(message("not json at all"))));
    expect(await kindOf(claude().generate(request))).toBe("invalid_output");
  });
});

const GEMINI = "https://generativelanguage.googleapis.com/*/models/*";
const gemini = () => new GeminiModel({ apiKey: "g-test", model: "gemini-test" });
const candidate = (text: string) => ({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }] });

describe("GeminiModel", () => {
  it("requests JSON with a sanitised schema and validates the reply with Zod", async () => {
    let seen: { url: string; key: string | null; body: Record<string, unknown> } | undefined;
    server.use(
      http.post(GEMINI, async ({ request: r }) => {
        seen = { url: r.url, key: r.headers.get("x-goog-api-key"), body: (await r.json()) as Record<string, unknown> };
        return HttpResponse.json(candidate(JSON.stringify({ n: 3, label: "ok" })));
      }),
    );
    const result = await gemini().generate(request);

    expect(result.data).toEqual({ n: 3, label: "ok" });
    expect(seen?.url).toContain("gemini-test:generateContent");
    expect(seen?.key).toBe("g-test");
    const config = seen?.body.generationConfig as Record<string, unknown>;
    expect(config.responseMimeType).toBe("application/json");
    expect(JSON.stringify(config.responseJsonSchema)).not.toContain('"const"');
    expect(JSON.stringify(seen?.body.systemInstruction)).toContain("You teach.");
  });

  it("maps invalid JSON and schema mismatches to invalid_output", async () => {
    server.use(http.post(GEMINI, () => HttpResponse.json(candidate("nope"))));
    expect(await kindOf(gemini().generate(request))).toBe("invalid_output");
    server.use(http.post(GEMINI, () => HttpResponse.json(candidate(JSON.stringify({ n: "x", label: "ok" })))));
    expect(await kindOf(gemini().generate(request))).toBe("invalid_output");
  });

  it.each([
    [429, "rate_limited"],
    [403, "config"],
    [500, "server"],
  ] as const)("maps HTTP %i to %s", async (status, kind) => {
    server.use(http.post(GEMINI, () => HttpResponse.json({ error: { code: status, message: "x", status: "ERR" } }, { status })));
    expect(await kindOf(gemini().generate(request))).toBe(kind);
  });
});

describe("loadLlmProviders", () => {
  const base = { NARRATION_TOKEN_SECRET: "s".repeat(40) };

  it("loads only providers that have a key, in the configured order", async () => {
    const env = parseEnv({ ...base, ANTHROPIC_API_KEY: "sk-ant-real" });
    expect((await loadLlmProviders(env)).map((p) => p.provider)).toEqual(["anthropic"]);
    const both = parseEnv({ ...base, ANTHROPIC_API_KEY: "sk-ant-real", GEMINI_API_KEY: "g-real", LLM_PROVIDER_ORDER: "gemini,anthropic" });
    expect((await loadLlmProviders(both)).map((p) => p.provider)).toEqual(["gemini", "anthropic"]);
  });

  it("loads fakes in test mode without any keys", async () => {
    const env = parseEnv({ ...base, TUTOR_TEST_PROVIDERS: "1" });
    expect((await loadLlmProviders(env)).map((p) => p.provider)).toEqual(["anthropic", "gemini"]);
  });
});
