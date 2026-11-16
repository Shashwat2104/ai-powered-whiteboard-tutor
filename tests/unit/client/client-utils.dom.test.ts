import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReducedMotion } from "@/lib/client/useReducedMotion";
import { useShortcuts } from "@/lib/client/useShortcuts";
import { PlaybackController } from "@/lib/playback/controller";
import { loadAudioClock } from "@/lib/client/audio-source";
import { initSyncProbe, isProbeEnabled } from "@/lib/client/probe";
import { validLesson } from "../../fixtures/lessons";
import { resolveTimeline } from "@/lib/timeline/resolve";

describe("Client Utilities & Hooks (DOM)", () => {
  it("useReducedMotion returns matchMedia value and handles changes", () => {
    let listener: (() => void) | null = null;
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn((_, cb) => {
        listener = cb as () => void;
      }),
      removeEventListener: vi.fn(),
    }));

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    // Trigger change callback
    if (listener) {
      act(() => {
        (listener as () => void)();
      });
    }
  });

  it("useShortcuts attaches listeners and responds to Space, Arrows, Home", async () => {
    const controller = new PlaybackController();
    const playSpy = vi.spyOn(controller, "play").mockImplementation(async () => {});
    const pauseSpy = vi.spyOn(controller, "pause").mockImplementation(() => {});
    const seekSpy = vi.spyOn(controller, "seek").mockImplementation(() => {});
    const restartSpy = vi.spyOn(controller, "restart").mockImplementation(async () => {});

    // Set controller to ready
    controller.startGenerating();
    controller.startNarrating();
    controller.setReady({
      duration: 20,
      now: () => 5,
      play: async () => {},
      pause: () => {},
      seek: () => {},
      onEnded: () => () => {},
      dispose: () => {},
    });

    renderHook(() => useShortcuts({ controller, enabled: true }));

    // Test Space while ready (should trigger play)
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    expect(playSpy).toHaveBeenCalled();

    // Test Space while playing (should trigger pause)
    await controller.play();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    expect(pauseSpy).toHaveBeenCalled();

    // Test Left Arrow (should seek -5)
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(seekSpy).toHaveBeenCalledWith(0);

    // Test Right Arrow (should seek +5)
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(seekSpy).toHaveBeenCalledWith(10);

    // Test Home (should restart)
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    expect(restartSpy).toHaveBeenCalled();

    // Test ignoring when inside input element
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    playSpy.mockClear();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(playSpy).not.toHaveBeenCalled();
    input.remove();
  });

  it("loadAudioClock succeeds on canplay and fails on error", async () => {
    const fakeAudio = {
      addEventListener: vi.fn((event, cb) => {
        if (event === "canplay") {
          setTimeout(cb, 10);
        }
      }),
      removeEventListener: vi.fn(),
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      load: vi.fn(),
      preload: "",
      src: "",
    } as unknown as HTMLAudioElement;

    const fakeBlob = new Blob(["test"], { type: "audio/wav" });
    const clock = await loadAudioClock(fakeBlob, 10, {
      createAudio: () => fakeAudio,
      createUrl: () => "blob:test",
      revokeUrl: vi.fn(),
    });

    expect(clock).toBeDefined();
    expect(clock.duration).toBe(10);

    // Test error branch
    const failingAudio = {
      addEventListener: vi.fn((event, cb) => {
        if (event === "error") setTimeout(cb, 10);
      }),
      removeEventListener: vi.fn(),
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      load: vi.fn(),
    } as unknown as HTMLAudioElement;

    await expect(
      loadAudioClock(fakeBlob, 10, {
        createAudio: () => failingAudio,
        createUrl: () => "blob:test",
        revokeUrl: vi.fn(),
      }),
    ).rejects.toThrow("Audio could not be loaded");
  });

  it("initSyncProbe creates probe and records events", () => {
    const lesson = validLesson();
    const timeline = resolveTimeline(
      lesson,
      lesson.segments.map((s) => ({ segmentId: s.id, durationSec: 10, marks: [] })),
    );

    Object.defineProperty(window, "location", {
      value: new URL("http://localhost:3000/?probe=1"),
      writable: true,
      configurable: true,
    });

    expect(isProbeEnabled()).toBe(true);

    const probe = initSyncProbe(lesson, timeline);
    expect(probe).toBeDefined();

    probe?.recordElementFirstSeen("el1", 1.2, 1.0);
    // Duplicate seenId branch
    probe?.recordElementFirstSeen("el1", 1.3, 1.0);
    expect(probe?.events.length).toBe(1);
    expect(probe?.events[0]?.lagMs).toBe(200);

    probe?.recordSeekLatency(45);
    expect(probe?.seekLatencies).toContain(45);

    const expected = probe?.expectedAt(0);
    expect(Array.isArray(expected)).toBe(true);
  });
});
