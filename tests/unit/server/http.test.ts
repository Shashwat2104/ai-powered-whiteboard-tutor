import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonBody, withRoute } from "@/server/http";
import { ApiError, toResponse } from "@/server/security/errors";

const schema = z.object({ topic: z.string().min(1) });
const post = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://x/api", { method: "POST", body, headers });

describe("toResponse", () => {
  it("maps an ApiError to its status, envelope and Retry-After header", async () => {
    const res = toResponse(new ApiError("rate_limited", undefined, 30));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(await res.json()).toEqual({
      error: { kind: "rate_limited", message: expect.any(String), retryAfterSec: 30 },
    });
  });

  it("hides unknown errors behind a generic message", async () => {
    const res = toResponse(new Error("connect ECONNREFUSED key=sk-secret-123"));
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("sk-secret");
    expect(text).toContain("internal");
  });

  it.each([
    ["invalid_input", 400],
    ["unauthorized_narration", 403],
    ["payload_too_large", 413],
    ["rejected_topic", 422],
    ["generation_failed", 502],
    ["upstream_timeout", 504],
  ] as const)("%s -> %i", (kind, status) => {
    expect(new ApiError(kind).status).toBe(status);
  });
});

describe("parseJsonBody", () => {
  it("returns the validated body", async () => {
    await expect(parseJsonBody(post('{"topic":"x"}'), schema, 100)).resolves.toEqual({ topic: "x" });
  });

  it("rejects invalid JSON", async () => {
    await expect(parseJsonBody(post("{oops"), schema, 100)).rejects.toMatchObject({ kind: "invalid_input" });
  });

  it("names the failing field", async () => {
    await expect(parseJsonBody(post('{"topic":""}'), schema, 100)).rejects.toThrow(/topic/);
  });

  it("rejects a declared body that is too large", async () => {
    const req = post('{"topic":"x"}', { "content-length": "5000" });
    await expect(parseJsonBody(req, schema, 100)).rejects.toMatchObject({ kind: "payload_too_large" });
  });

  it("rejects an actual body that is too large", async () => {
    await expect(parseJsonBody(post(`{"topic":"${"a".repeat(200)}"}`), schema, 100)).rejects.toMatchObject({
      kind: "payload_too_large",
    });
  });
});

describe("withRoute", () => {
  it("passes the response through", async () => {
    const handler = withRoute("test", async () => Response.json({ ok: true }));
    const res = await handler(new Request("http://x"));
    expect(res.status).toBe(200);
  });

  it("converts thrown errors into the error envelope", async () => {
    const handler = withRoute("test", async () => {
      throw new ApiError("invalid_input", "Bad topic");
    });
    const res = await handler(new Request("http://x"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { kind: "invalid_input", message: "Bad topic" } });
  });
});
