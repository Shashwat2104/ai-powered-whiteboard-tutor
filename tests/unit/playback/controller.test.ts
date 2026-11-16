import { describe, expect, it, vi } from "vitest";
import type { LessonClock } from "@/lib/playback/clock";
import { PlaybackController } from "@/lib/playback/controller";

class FakeClock implements LessonClock {
  t = 0;
  playing = false;
  disposed = false;
  playError: unknown = undefined;
  gate: Promise<void> | undefined;
  private endedCbs = new Set<() => void>();
  constructor(readonly duration = 10) {}
  now(): number {
    return this.t;
  }
  async play(): Promise<void> {
    if (this.gate) await this.gate;
    if (this.playError) throw this.playError;
    this.playing = true;
  }
  pause(): void {
    this.playing = false;
  }
  seek(t: number): void {
    this.t = t;
  }
  onEnded(cb: () => void): () => void {
    this.endedCbs.add(cb);
    return () => this.endedCbs.delete(cb);
  }
  fireEnded(): void {
    this.endedCbs.forEach((cb) => cb());
  }
  dispose(): void {
    this.disposed = true;
  }
}

function ready(opts?: { noAudio?: boolean }) {
  const onIllegal = vi.fn();
  const controller = new PlaybackController({ onIllegal });
  const clock = new FakeClock();
  controller.startGenerating();
  controller.startNarrating();
  controller.setReady(clock, opts);
  return { controller, clock, onIllegal };
}

describe("PlaybackController", () => {
  it("walks idle -> generating -> narrating -> ready", () => {
    const controller = new PlaybackController();
    expect(controller.getSnapshot().mode).toBe("idle");
    controller.startGenerating();
    expect(controller.getSnapshot().mode).toBe("generating");
    controller.startNarrating();
    expect(controller.getSnapshot().mode).toBe("narrating");
    controller.setReady(new FakeClock(10));
    expect(controller.getSnapshot()).toMatchObject({ mode: "ready", positionSec: 0, durationSec: 10 });
  });

  it("plays, pauses and resumes", async () => {
    const { controller, clock } = ready();
    await controller.play();
    expect(controller.getSnapshot().mode).toBe("playing");
    expect(clock.playing).toBe(true);
    clock.t = 4;
    controller.pause();
    expect(controller.getSnapshot()).toMatchObject({ mode: "paused", positionSec: 4 });
    expect(clock.playing).toBe(false);
    await controller.play();
    expect(controller.getSnapshot().mode).toBe("playing");
  });

  it("seeks while playing and keeps playing", async () => {
    const { controller, clock } = ready();
    await controller.play();
    controller.seek(7);
    expect(clock.t).toBe(7);
    expect(controller.getSnapshot()).toMatchObject({ mode: "playing", positionSec: 7 });
  });

  it("clamps seeks and ends when seeking to the duration", async () => {
    const { controller } = ready();
    controller.seek(-5);
    expect(controller.getSnapshot().positionSec).toBe(0);
    controller.seek(99);
    expect(controller.getSnapshot()).toMatchObject({ mode: "ended", positionSec: 10 });
  });

  it("seeking back from ended leaves it paused at the new position", () => {
    const { controller } = ready();
    controller.seek(99);
    controller.seek(3);
    expect(controller.getSnapshot()).toMatchObject({ mode: "paused", positionSec: 3 });
  });

  it("tick updates the position and detects the end", async () => {
    const { controller, clock } = ready();
    await controller.play();
    clock.t = 5;
    controller.tick();
    expect(controller.getSnapshot()).toMatchObject({ mode: "playing", positionSec: 5 });
    clock.t = 10;
    controller.tick();
    expect(controller.getSnapshot().mode).toBe("ended");
    expect(clock.playing).toBe(false);
  });

  it("ends when the clock reports ended", async () => {
    const { controller, clock } = ready();
    await controller.play();
    clock.t = 10;
    clock.fireEnded();
    expect(controller.getSnapshot().mode).toBe("ended");
  });

  it("restarts from paused and replays from ended, both at 0", async () => {
    const { controller, clock } = ready();
    await controller.play();
    clock.t = 6;
    controller.pause();
    await controller.restart();
    expect(clock.t).toBe(0);
    expect(controller.getSnapshot().mode).toBe("playing");
    controller.seek(99);
    await controller.replay();
    expect(clock.t).toBe(0);
    expect(controller.getSnapshot()).toMatchObject({ mode: "playing", positionSec: 0 });
  });

  it("ignores and reports illegal transitions", async () => {
    const { controller, onIllegal } = ready();
    controller.pause();
    expect(controller.getSnapshot().mode).toBe("ready");
    expect(onIllegal).toHaveBeenCalledWith("ready", "pause");

    const idle = new PlaybackController({ onIllegal });
    idle.seek(3);
    await idle.play();
    expect(idle.getSnapshot().mode).toBe("idle");
    expect(onIllegal).toHaveBeenCalledWith("idle", "seek");
    expect(onIllegal).toHaveBeenCalledWith("idle", "play");

    const generating = new PlaybackController({ onIllegal });
    generating.startGenerating();
    await generating.play();
    expect(onIllegal).toHaveBeenCalledWith("generating", "play");
  });

  it("autoplay rejection pauses and asks for a user gesture, then clears on success", async () => {
    const { controller, clock } = ready();
    clock.playError = new DOMException("blocked", "NotAllowedError");
    await controller.play();
    expect(controller.getSnapshot()).toMatchObject({ mode: "paused", needsUserGesture: true });
    clock.playError = undefined;
    await controller.play();
    expect(controller.getSnapshot()).toMatchObject({ mode: "playing", needsUserGesture: false });
  });

  it("other playback errors move to the error state", async () => {
    const { controller, clock } = ready();
    clock.playError = new Error("decode failed");
    await controller.play();
    expect(controller.getSnapshot()).toMatchObject({ mode: "error", errorKind: "audio" });
  });

  it("pausing while play is pending wins", async () => {
    const { controller, clock } = ready();
    let release: () => void = () => undefined;
    clock.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = controller.play();
    controller.pause();
    release();
    await pending;
    expect(controller.getSnapshot().mode).not.toBe("playing");
    expect(clock.playing).toBe(false);
  });

  it("starting a new generation disposes the previous clock", async () => {
    const { controller, clock } = ready();
    await controller.play();
    controller.startGenerating();
    expect(clock.disposed).toBe(true);
    expect(controller.getSnapshot().mode).toBe("generating");
  });

  it("records the no-audio flag", () => {
    const { controller } = ready({ noAudio: true });
    expect(controller.getSnapshot().noAudio).toBe(true);
  });

  it("fail moves to error with the given kind", () => {
    const controller = new PlaybackController();
    controller.startGenerating();
    controller.fail("generation_failed");
    expect(controller.getSnapshot()).toMatchObject({ mode: "error", errorKind: "generation_failed" });
  });

  it("notifies subscribers, returns stable snapshots, and supports unsubscribe", () => {
    const controller = new PlaybackController();
    const listener = vi.fn();
    const off = controller.subscribe(listener);
    const first = controller.getSnapshot();
    expect(controller.getSnapshot()).toBe(first);
    controller.startGenerating();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).not.toBe(first);
    off();
    controller.startNarrating();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
