import { describe, expect, it } from "vitest";
import { signNarrationToken, verifyNarrationToken } from "@/server/security/narration-token";

const secret = "unit-test-secret-unit-test-secret-0123456789";
const base = { lessonId: "lesson-1", segmentId: "s1", text: "Hello [[m1]]world" };

describe("narration token", () => {
  it("verifies a token it signed", () => {
    const token = signNarrationToken({ ...base, secret, now: 1000 });
    expect(verifyNarrationToken(token, { ...base, secret, now: 1500 })).toEqual({ ok: true });
  });

  it("rejects tampered text", () => {
    const token = signNarrationToken({ ...base, secret, now: 1000 });
    const result = verifyNarrationToken(token, { ...base, text: "Different", secret, now: 1500 });
    expect(result.ok).toBe(false);
  });

  it("rejects a different segment or lesson", () => {
    const token = signNarrationToken({ ...base, secret, now: 1000 });
    expect(verifyNarrationToken(token, { ...base, segmentId: "s2", secret, now: 1500 }).ok).toBe(false);
    expect(verifyNarrationToken(token, { ...base, lessonId: "lesson-2", secret, now: 1500 }).ok).toBe(false);
  });

  it("rejects an expired token", () => {
    const token = signNarrationToken({ ...base, secret, now: 1000, ttlSec: 60 });
    expect(verifyNarrationToken(token, { ...base, secret, now: 1000 + 61 })).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a token signed with another secret", () => {
    const token = signNarrationToken({ ...base, secret, now: 1000 });
    const other = "another-secret-another-secret-0123456789ab";
    expect(verifyNarrationToken(token, { ...base, secret: other, now: 1500 }).ok).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const sig = signNarrationToken({ ...base, secret, now: 1000 }).split(".")[1];
    const forged = Buffer.from(JSON.stringify({ l: "lesson-1", s: "s1", h: "x", e: 9_999_999_999 })).toString("base64url");
    expect(verifyNarrationToken(`${forged}.${sig}`, { ...base, secret, now: 1500 }).ok).toBe(false);
  });

  it.each(["", "abc", "a.b.c", "....", "payload."])("rejects malformed token %j", (token) => {
    expect(verifyNarrationToken(token, { ...base, secret, now: 1500 }).ok).toBe(false);
  });
});
