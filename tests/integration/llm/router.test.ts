import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generateWithFallback, MAX_ATTEMPTS_PER_PROVIDER } from "@/server/llm/router";
import { LlmError, type GenerateRequest, type LlmErrorKind, type StructuredModel } from "@/server/llm/types";
import { ApiError } from "@/server/security/errors";

const schema = z.object({ n: z.number() });
type Out = z.infer<typeof schema>;

type Script = (call: number, req: GenerateRequest<unknown>) => Out | LlmErrorKind | Error;

function model(provider: "anthropic" | "gemini", script: Script): StructuredModel & { calls: GenerateRequest<unknown>[] } {
  const calls: GenerateRequest<unknown>[] = [];
  return {
    provider,
    calls,
    async generate<T>(req: GenerateRequest<T>) {
      calls.push(req as GenerateRequest<unknown>);
      const step = script(calls.length, req as GenerateRequest<unknown>);
      if (step instanceof Error) throw step;
      if (typeof step === "string") throw new LlmError(step, `${provider} ${step}`, provider);
      return { data: step as T, raw: JSON.stringify(step), model: `${provider}-model` };
    },
  };
}

const request = {
  kind: "lesson" as const,
  schema,
  system: "sys",
  userContent: "topic",
  effort: "medium" as const,
  validate: (d: Out) => (d.n < 5 ? [{ code: "TOO_SMALL", path: "n", message: "n must be at least 5" }] : []),
};

describe("generateWithFallback", () => {
  it("returns the first provider's valid result on the first attempt", async () => {
    const a = model("anthropic", () => ({ n: 9 }));
    const b = model("gemini", () => ({ n: 9 }));
    expect(await generateWithFallback(request, [a, b])).toEqual({ data: { n: 9 }, provider: "anthropic", model: "anthropic-model", attempts: 1 });
    expect(b.calls).toHaveLength(0);
  });

  it.each<LlmErrorKind>(["rate_limited", "timeout", "refusal", "server", "config"])("moves on to the next provider after %s", async (kind) => {
    const a = model("anthropic", () => kind);
    const b = model("gemini", () => ({ n: 7 }));
    const result = await generateWithFallback(request, [a, b]);
    expect(result.provider).toBe("gemini");
    expect(a.calls).toHaveLength(1);
  });

  it("asks the same provider to repair invalid output, sending its own reply and the problems back", async () => {
    const a = model("anthropic", (call) => ({ n: call === 1 ? 1 : 9 }));
    const result = await generateWithFallback(request, [a]);
    expect(result.attempts).toBe(2);
    const second = a.calls[1]!.messages;
    expect(second.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(second[1]!.content).toBe('{"n":1}');
    expect(second[2]!.content).toContain("[TOO_SMALL] n: n must be at least 5");
  });

  it("gives up on a provider after the maximum attempts and tries the next", async () => {
    const a = model("anthropic", () => ({ n: 1 }));
    const b = model("gemini", () => ({ n: 8 }));
    const result = await generateWithFallback(request, [a, b]);
    expect(a.calls).toHaveLength(MAX_ATTEMPTS_PER_PROVIDER);
    expect(result).toMatchObject({ provider: "gemini", attempts: 1 });
  });

  it("retries unparsable output with a reminder to reply with JSON", async () => {
    const a = model("anthropic", (call) => (call === 1 ? "invalid_output" : { n: 6 }));
    const result = await generateWithFallback(request, [a]);
    expect(result.attempts).toBe(2);
    expect(a.calls[1]!.messages.at(-1)!.content).toMatch(/JSON/);
  });

  it("throws a generation_failed ApiError when every provider fails", async () => {
    const a = model("anthropic", () => "server");
    const b = model("gemini", () => "timeout");
    await expect(generateWithFallback(request, [a, b])).rejects.toMatchObject({ kind: "generation_failed" });
    await expect(generateWithFallback(request, [])).rejects.toBeInstanceOf(ApiError);
  });

  it("does not swallow unexpected errors", async () => {
    const a = model("anthropic", () => new TypeError("bug"));
    await expect(generateWithFallback(request, [a])).rejects.toBeInstanceOf(TypeError);
  });

  it("stops before calling a provider when the time budget is used up", async () => {
    const a = model("anthropic", () => ({ n: 9 }));
    await expect(generateWithFallback({ ...request, budgetMs: 5000 }, [a])).rejects.toMatchObject({ kind: "generation_failed" });
    expect(a.calls).toHaveLength(0);
  });

  it("gives each attempt no more than the per-attempt timeout or the remaining budget", async () => {
    const a = model("anthropic", () => ({ n: 9 }));
    await generateWithFallback({ ...request, attemptTimeoutMs: 20_000, budgetMs: 100_000 }, [a]);
    expect(a.calls[0]!.timeoutMs).toBe(20_000);
    const b = model("anthropic", () => ({ n: 9 }));
    await generateWithFallback({ ...request, attemptTimeoutMs: 60_000, budgetMs: 30_000 }, [b]);
    expect(b.calls[0]!.timeoutMs).toBeLessThanOrEqual(27_000);
  });

  it("passes the schema, prompt and effort through", async () => {
    const a = model("anthropic", () => ({ n: 9 }));
    const spy = vi.spyOn(a, "generate");
    await generateWithFallback(request, [a]);
    expect(spy.mock.calls[0]![0]).toMatchObject({ kind: "lesson", system: "sys", effort: "medium", schema });
  });
});
