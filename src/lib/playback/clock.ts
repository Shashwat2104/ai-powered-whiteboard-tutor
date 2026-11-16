/** The one source of lesson time. The audio element is the real clock; VirtualClock is the no-audio fallback. */
export interface LessonClock {
  readonly duration: number;
  /** Current lesson time in seconds. */
  now(): number;
  play(): Promise<void>;
  pause(): void;
  seek(timeSec: number): void;
  /** Subscribe to the natural end of playback; returns an unsubscribe function. */
  onEnded(callback: () => void): () => void;
  dispose?(): void;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Time source with no audio: position advances from an injected millisecond clock while playing. */
export class VirtualClock implements LessonClock {
  private base = 0;
  private startedAt: number | null = null;

  constructor(
    readonly duration: number,
    private readonly nowMs: () => number = () => performance.now(),
  ) {}

  now(): number {
    const running = this.startedAt === null ? 0 : (this.nowMs() - this.startedAt) / 1000;
    return clamp(this.base + running, 0, this.duration);
  }

  atEnd(): boolean {
    return this.now() >= this.duration;
  }

  play(): Promise<void> {
    if (this.startedAt === null) this.startedAt = this.nowMs();
    return Promise.resolve();
  }

  pause(): void {
    this.base = this.now();
    this.startedAt = null;
  }

  seek(timeSec: number): void {
    const wasPlaying = this.startedAt !== null;
    this.base = clamp(timeSec, 0, this.duration);
    this.startedAt = wasPlaying ? this.nowMs() : null;
  }

  /** The virtual clock has no timers, so it never fires; the controller detects the end by polling. */
  onEnded(): () => void {
    return () => undefined;
  }
}

/** The subset of HTMLMediaElement the clock needs, so it can be tested without a browser. */
export interface MediaLike {
  currentTime: number;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** Lesson time is the audio element's playback position. */
export class AudioClock implements LessonClock {
  constructor(
    private readonly media: MediaLike,
    readonly duration: number,
  ) {}

  now(): number {
    return this.media.currentTime;
  }

  play(): Promise<void> {
    return this.media.play();
  }

  pause(): void {
    this.media.pause();
  }

  seek(timeSec: number): void {
    this.media.currentTime = clamp(timeSec, 0, this.duration);
  }

  onEnded(callback: () => void): () => void {
    this.media.addEventListener("ended", callback);
    return () => this.media.removeEventListener("ended", callback);
  }
}
