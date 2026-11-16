import { describe, expect, it, vi } from "vitest";
import { encodeWavBytes } from "@/lib/audio/wav";
import { ClientError, type NarrationRequest, type NarrationResponse } from "@/lib/client/api";
import { narrateLesson } from "@/lib/client/narrate";
import { validLesson } from "../../fixtures/lessons";

const lesson = validLesson();
const plan = {
  providerOrder: ["elevenlabs", "google"] as const,
  tokens: Object.fromEntries(lesson.segments.map((s) => [s.id, `token-${s.id}`])),
};

const wavB64 = Buffer.from(encodeWavBytes(Int16Array.from({ length: 2400 }, (_, i) => i % 50))).toString("base64");
const ok = (req: NarrationRequest): NarrationResponse => ({
  segmentId: req.segmentId,
  provider: req.provider,
  voice: "v",
  sampleRate: 24000,
  durationSec: 0.1,
  marks: [{ name: "m1", timeSec: 0.05, estimated: false }],
  audioBase64: wavB64,
});

describe("narrateLesson", () => {
  it("narrates every segment with the first provider and reports progress", async () => {
    const calls: NarrationRequest[] = [];
    const onProgress = vi.fn();
    const result = await narrateLesson(lesson, plan, {
      request: async (req) => (calls.push(req), ok(req)),
      onProgress,
    });
    expect(result.provider).toBe("elevenlabs");
    expect(result.audio.map((a) => a.segmentId)).toEqual(lesson.segments.map((s) => s.id));
    expect(result.audio[0]?.pcm).toHaveLength(2400);
    expect(onProgress).toHaveBeenLastCalledWith(6, 6, "elevenlabs");
    expect(calls.every((c) => c.provider === "elevenlabs")).toBe(true);
  });

  it("passes neighbouring text and the segment's token", async () => {
    const calls: NarrationRequest[] = [];
    await narrateLesson(lesson, plan, { request: async (req) => (calls.push(req), ok(req)) });
    const second = calls.find((c) => c.segmentId === "s2")!;
    expect(second.previousText).toBe(lesson.segments[0]!.text);
    expect(second.nextText).toBe(lesson.segments[2]!.text);
    expect(second.token).toBe("token-s2");
    expect(calls.find((c) => c.segmentId === "s1")!.previousText).toBeUndefined();
  });

  it("never runs more requests at once than the provider's concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    await narrateLesson(lesson, plan, {
      request: async (req) => {
        peak = Math.max(peak, ++inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return ok(req);
      },
    });
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(0);
  });

  it("retries a segment once and stays with the same provider", async () => {
    let failedOnce = false;
    const result = await narrateLesson(lesson, plan, {
      request: async (req) => {
        if (req.segmentId === "s3" && !failedOnce) {
          failedOnce = true;
          throw new ClientError("upstream_timeout", "slow");
        }
        return ok(req);
      },
    });
    expect(result.provider).toBe("elevenlabs");
  });

  it("narrates the whole lesson again with the next provider when a segment keeps failing", async () => {
    const calls: NarrationRequest[] = [];
    const result = await narrateLesson(lesson, plan, {
      request: async (req) => {
        calls.push(req);
        if (req.provider === "elevenlabs" && req.segmentId === "s3") throw new ClientError("generation_failed", "boom");
        return ok(req);
      },
    });
    expect(result.provider).toBe("google");
    expect(result.audio).toHaveLength(6);
    expect(calls.filter((c) => c.provider === "google")).toHaveLength(6);
  });

  it("returns 'none' when every provider fails", async () => {
    const result = await narrateLesson(lesson, plan, {
      request: async () => {
        throw new ClientError("generation_failed", "down");
      },
    });
    expect(result).toEqual({ provider: "none", audio: [] });
  });

  it("stops at once on an expired narration token instead of falling back", async () => {
    const request = vi.fn(async (_req: NarrationRequest): Promise<NarrationResponse> => {
      void _req;
      throw new ClientError("unauthorized_narration", "expired");
    });
    await expect(narrateLesson(lesson, plan, { request })).rejects.toMatchObject({ kind: "unauthorized_narration" });
    expect(new Set(request.mock.calls.map((c) => (c[0] as NarrationRequest).provider))).toEqual(new Set(["elevenlabs"]));
  });

  it("rejects when a segment has no token", async () => {
    await expect(narrateLesson(lesson, { ...plan, tokens: {} }, { request: async (req) => ok(req) })).rejects.toMatchObject({
      kind: "unauthorized_narration",
    });
  });

  it("stops when the caller aborts", async () => {
    const controller = new AbortController();
    const request = vi.fn(async (req: NarrationRequest) => {
      controller.abort();
      return ok(req);
    });
    await expect(narrateLesson(lesson, plan, { request, signal: controller.signal })).rejects.toMatchObject({ kind: "aborted" });
    expect(request.mock.calls.length).toBeLessThan(6);
  });
});
