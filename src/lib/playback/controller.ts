import type { LessonClock } from "./clock";

export type PlaybackMode = "idle" | "generating" | "narrating" | "ready" | "playing" | "paused" | "ended" | "error";

export interface PlaybackSnapshot {
  mode: PlaybackMode;
  /** Position at the last update; read `getPosition()` for the live value. */
  positionSec: number;
  durationSec: number;
  /** True when the browser blocked automatic playback and the learner must press play. */
  needsUserGesture: boolean;
  /** True when there is no narration audio and a virtual clock drives the lesson. */
  noAudio: boolean;
  errorKind?: string;
}

export interface ControllerOptions {
  /** Called when an action is not allowed in the current mode. */
  onIllegal?: (mode: PlaybackMode, action: string) => void;
  /** Frame scheduler; defaults to requestAnimationFrame when available. */
  raf?: (callback: () => void) => number;
  caf?: (id: number) => void;
}

const INITIAL: PlaybackSnapshot = { mode: "idle", positionSec: 0, durationSec: 0, needsUserGesture: false, noAudio: false };
const END_EPSILON = 0.001;
const POSITION_STEP = 0.05;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function isAutoplayBlock(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: string }).name === "NotAllowedError";
}

/**
 * The lesson playback state machine. It owns no timers of its own for the lesson: time always comes
 * from the clock (the audio element). A frame loop only reads the clock to notice the end.
 */
export class PlaybackController {
  private snapshot: PlaybackSnapshot = INITIAL;
  private clock: LessonClock | undefined;
  private offEnded: (() => void) | undefined;
  private readonly listeners = new Set<() => void>();
  private playToken = 0;
  private pendingPlay = false;
  private frame: number | undefined;
  private readonly raf: ControllerOptions["raf"];
  private readonly caf: ControllerOptions["caf"];

  constructor(private readonly options: ControllerOptions = {}) {
    this.raf = options.raf ?? (typeof requestAnimationFrame === "function" ? (cb) => requestAnimationFrame(cb) : undefined);
    this.caf = options.caf ?? (typeof cancelAnimationFrame === "function" ? (id) => cancelAnimationFrame(id) : undefined);
  }

  // ---- external-store API (useSyncExternalStore) ----

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): PlaybackSnapshot => this.snapshot;

  /** Live lesson time, straight from the clock. */
  getPosition(): number {
    const live = this.clock?.now();
    return live === undefined ? this.snapshot.positionSec : clamp(live, 0, this.snapshot.durationSec);
  }

  // ---- lesson preparation ----

  startGenerating(): void {
    this.releaseClock();
    this.replace({ ...INITIAL, mode: "generating" });
  }

  startNarrating(): void {
    if (this.snapshot.mode !== "generating") return this.illegal("startNarrating");
    this.update({ mode: "narrating" });
  }

  setReady(clock: LessonClock, options: { noAudio?: boolean; positionSec?: number } = {}): void {
    if (
      this.snapshot.mode !== "narrating" &&
      this.snapshot.mode !== "generating" &&
      this.snapshot.mode !== "idle"
    ) {
      return this.illegal("setReady");
    }
    this.releaseClock();
    this.clock = clock;
    this.offEnded = clock.onEnded(() => {
      if (this.snapshot.mode === "playing") this.finish();
    });
    const positionSec = clamp(options.positionSec ?? 0, 0, clock.duration);
    if (positionSec > 0) clock.seek(positionSec);
    this.replace({ ...INITIAL, mode: "ready", durationSec: clock.duration, positionSec, noAudio: options.noAudio === true });
  }

  fail(kind: string): void {
    this.stopLoop();
    this.update({ mode: "error", errorKind: kind });
  }

  // ---- transport ----

  async play(): Promise<void> {
    const { mode } = this.snapshot;
    if (mode === "playing" || this.pendingPlay) return;
    const clock = this.clock;
    if (!clock || (mode !== "ready" && mode !== "paused" && mode !== "ended")) return this.illegal("play");
    if (mode === "ended") {
      clock.seek(0);
      this.update({ mode: "paused", positionSec: 0 });
    }
    const token = ++this.playToken;
    this.pendingPlay = true;
    try {
      await clock.play();
    } catch (error) {
      if (token !== this.playToken) return;
      this.pendingPlay = false;
      if (isAutoplayBlock(error)) this.update({ mode: "paused", needsUserGesture: true });
      else this.update({ mode: "error", errorKind: "audio" });
      return;
    }
    if (token !== this.playToken) {
      clock.pause();
      return;
    }
    this.pendingPlay = false;
    this.update({ mode: "playing", needsUserGesture: false, positionSec: clock.now() });
    this.startLoop();
  }

  pause(): void {
    const clock = this.clock;
    if (!clock) return this.illegal("pause");
    if (this.pendingPlay) {
      this.playToken++;
      this.pendingPlay = false;
      clock.pause();
      this.update({ mode: "paused", positionSec: clock.now() });
      return;
    }
    if (this.snapshot.mode !== "playing") return this.illegal("pause");
    clock.pause();
    this.stopLoop();
    this.update({ mode: "paused", positionSec: clock.now() });
  }

  seek(timeSec: number): void {
    const clock = this.clock;
    const { mode } = this.snapshot;
    if (!clock || (mode !== "ready" && mode !== "playing" && mode !== "paused" && mode !== "ended")) return this.illegal("seek");
    const target = clamp(timeSec, 0, clock.duration);
    clock.seek(target);
    if (target >= clock.duration) return this.finish();
    this.update({ positionSec: target, mode: mode === "ended" ? "paused" : mode });
  }

  async restart(): Promise<void> {
    const clock = this.clock;
    const { mode } = this.snapshot;
    if (!clock || (mode !== "ready" && mode !== "playing" && mode !== "paused" && mode !== "ended")) return this.illegal("restart");
    clock.seek(0);
    if (mode === "playing") return this.update({ positionSec: 0 });
    this.update({ mode: "paused", positionSec: 0 });
    await this.play();
  }

  async replay(): Promise<void> {
    if (this.snapshot.mode !== "ended") return this.illegal("replay");
    await this.restart();
  }

  /** Frame callback: read the clock, update the position, and notice the end. */
  tick(): void {
    const clock = this.clock;
    if (!clock || this.snapshot.mode !== "playing") return;
    const position = clock.now();
    if (position >= clock.duration - END_EPSILON) return this.finish();
    if (Math.abs(position - this.snapshot.positionSec) >= POSITION_STEP) this.update({ positionSec: position });
  }

  dispose(): void {
    this.releaseClock();
    this.listeners.clear();
  }

  // ---- internals ----

  private finish(): void {
    this.clock?.pause();
    this.stopLoop();
    this.pendingPlay = false;
    this.update({ mode: "ended", positionSec: this.snapshot.durationSec });
  }

  private startLoop(): void {
    const schedule = this.raf;
    if (!schedule || this.frame !== undefined) return;
    const step = (): void => {
      this.frame = undefined;
      if (this.snapshot.mode !== "playing") return;
      this.tick();
      this.frame = schedule(step);
    };
    this.frame = schedule(step);
  }

  private stopLoop(): void {
    if (this.frame !== undefined) this.caf?.(this.frame);
    this.frame = undefined;
  }

  private releaseClock(): void {
    this.stopLoop();
    this.playToken++;
    this.pendingPlay = false;
    this.offEnded?.();
    this.offEnded = undefined;
    this.clock?.pause();
    this.clock?.dispose?.();
    this.clock = undefined;
  }

  private illegal(action: string): void {
    this.options.onIllegal?.(this.snapshot.mode, action);
  }

  private update(patch: Partial<PlaybackSnapshot>): void {
    const changed = (Object.keys(patch) as (keyof PlaybackSnapshot)[]).some((k) => this.snapshot[k] !== patch[k]);
    if (changed) this.replace({ ...this.snapshot, ...patch });
  }

  private replace(next: PlaybackSnapshot): void {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}
