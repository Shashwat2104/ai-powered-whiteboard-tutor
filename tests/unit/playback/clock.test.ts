import { describe, expect, it, vi } from "vitest";
import { AudioClock, VirtualClock, type MediaLike } from "@/lib/playback/clock";

describe("VirtualClock", () => {
  it("advances only while playing", async () => {
    let ms = 0;
    const clock = new VirtualClock(10, () => ms);
    expect(clock.now()).toBe(0);
    ms = 1000;
    expect(clock.now()).toBe(0);
    await clock.play();
    ms = 3000;
    expect(clock.now()).toBe(2);
  });

  it("freezes on pause", async () => {
    let ms = 0;
    const clock = new VirtualClock(10, () => ms);
    await clock.play();
    ms = 2000;
    clock.pause();
    ms = 9000;
    expect(clock.now()).toBe(2);
  });

  it("seeks and continues from the new position", async () => {
    let ms = 0;
    const clock = new VirtualClock(10, () => ms);
    clock.seek(7);
    expect(clock.now()).toBe(7);
    await clock.play();
    ms = 2000;
    expect(clock.now()).toBe(9);
  });

  it("clamps to the duration and reports the end", async () => {
    let ms = 0;
    const clock = new VirtualClock(10, () => ms);
    clock.seek(8);
    await clock.play();
    ms = 5000;
    expect(clock.now()).toBe(10);
    expect(clock.atEnd()).toBe(true);
    clock.seek(-3);
    expect(clock.now()).toBe(0);
  });
});

class FakeMedia implements MediaLike {
  currentTime = 0;
  played = 0;
  paused = true;
  private listeners = new Map<string, Set<() => void>>();
  play(): Promise<void> {
    this.played += 1;
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  addEventListener(type: string, fn: () => void): void {
    this.listeners.set(type, (this.listeners.get(type) ?? new Set()).add(fn));
  }
  removeEventListener(type: string, fn: () => void): void {
    this.listeners.get(type)?.delete(fn);
  }
  emit(type: string): void {
    this.listeners.get(type)?.forEach((fn) => fn());
  }
}

describe("AudioClock", () => {
  it("reads the media element's current time", () => {
    const media = new FakeMedia();
    const clock = new AudioClock(media, 56);
    media.currentTime = 12.5;
    expect(clock.now()).toBe(12.5);
    expect(clock.duration).toBe(56);
  });

  it("forwards play, pause and seek", async () => {
    const media = new FakeMedia();
    const clock = new AudioClock(media, 56);
    await clock.play();
    expect(media.played).toBe(1);
    clock.pause();
    expect(media.paused).toBe(true);
    clock.seek(30);
    expect(media.currentTime).toBe(30);
  });

  it("notifies on the ended event and can unsubscribe", () => {
    const media = new FakeMedia();
    const clock = new AudioClock(media, 56);
    const cb = vi.fn();
    const off = clock.onEnded(cb);
    media.emit("ended");
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    media.emit("ended");
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
