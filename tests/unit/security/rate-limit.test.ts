import { beforeEach, describe, expect, it } from "vitest";
import { clientIp, limit, resetRateLimits } from "@/server/security/rate-limit";

beforeEach(() => resetRateLimits());

describe("limit", () => {
  it("allows up to max requests inside the window and blocks the next", () => {
    for (let i = 0; i < 3; i++) expect(limit("lesson", "1.1.1.1", 3, 600, 1000 + i).ok).toBe(true);
    const blocked = limit("lesson", "1.1.1.1", 3, 600, 1003);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(600);
  });

  it("frees capacity as old requests leave the window", () => {
    limit("lesson", "a", 2, 100, 0);
    limit("lesson", "a", 2, 100, 50_000);
    expect(limit("lesson", "a", 2, 100, 60_000).ok).toBe(false);
    expect(limit("lesson", "a", 2, 100, 101_000).ok).toBe(true);
  });

  it("tracks clients and routes independently", () => {
    limit("lesson", "a", 1, 600, 0);
    expect(limit("lesson", "b", 1, 600, 1).ok).toBe(true);
    expect(limit("narration", "a", 1, 600, 2).ok).toBe(true);
    expect(limit("lesson", "a", 1, 600, 3).ok).toBe(false);
  });

  it("does not count blocked requests against the client", () => {
    limit("r", "a", 1, 100, 0);
    for (let i = 1; i < 20; i++) limit("r", "a", 1, 100, i * 1000);
    expect(limit("r", "a", 1, 100, 100_500).ok).toBe(true);
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) => new Request("http://x", { headers });

  it("uses the first x-forwarded-for entry", () => {
    expect(clientIp(req({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
  });

  it("falls back to x-real-ip and then to unknown", () => {
    expect(clientIp(req({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(clientIp(req({}))).toBe("unknown");
  });
});
