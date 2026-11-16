import { AudioClock, type MediaLike } from "../playback/clock";

const LOAD_TIMEOUT_MS = 15_000;

export interface AudioSourceDeps {
  createAudio?: () => HTMLAudioElement;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
}

/**
 * Load the joined narration track into an audio element and wrap it as the lesson clock.
 * Rejects if the browser cannot decode it or it takes too long, so the caller can recover.
 */
export function loadAudioClock(blob: Blob, durationSec: number, deps: AudioSourceDeps = {}): Promise<AudioClock> {
  const audio = deps.createAudio?.() ?? new Audio();
  const url = (deps.createUrl ?? URL.createObjectURL)(blob);
  const revoke = deps.revokeUrl ?? URL.revokeObjectURL;

  const release = (): void => {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    revoke(url);
  };

  return new Promise<AudioClock>((resolve, reject) => {
    const timer = setTimeout(() => fail(new Error("Audio took too long to load")), LOAD_TIMEOUT_MS);
    const cleanup = (): void => {
      clearTimeout(timer);
      audio.removeEventListener("canplay", ready);
      audio.removeEventListener("error", onError);
    };
    const ready = (): void => {
      cleanup();
      resolve(new AudioClock(audio as unknown as MediaLike, durationSec, release));
    };
    const fail = (error: Error): void => {
      cleanup();
      release();
      reject(error);
    };
    const onError = (): void => fail(new Error("Audio could not be loaded"));

    audio.addEventListener("canplay", ready);
    audio.addEventListener("error", onError);
    audio.preload = "auto";
    audio.src = url;
  });
}
