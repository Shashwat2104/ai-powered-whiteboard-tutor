"use client";

import { useSyncExternalStore, useRef, useCallback } from "react";
import { PlaybackController } from "../playback/controller";
import { AudioClock, VirtualClock } from "../playback/clock";

export function formatTime(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function usePlayback(controller: PlaybackController) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = useCallback(() => {
    if (snapshot.mode === "playing") {
      controller.pause();
    } else {
      void controller.play();
    }
  }, [controller, snapshot.mode]);

  const initAudio = useCallback(
    (audioEl: HTMLAudioElement, durationSec: number) => {
      audioRef.current = audioEl;
      const clock = new AudioClock(audioEl, durationSec);
      controller.setReady(clock);
    },
    [controller]
  );

  const initVirtualClock = useCallback(
    (durationSec: number) => {
      const clock = new VirtualClock(durationSec);
      controller.setReady(clock, { noAudio: true });
    },
    [controller]
  );

  return {
    snapshot,
    mode: snapshot.mode,
    isPlaying: snapshot.mode === "playing",
    isPaused: snapshot.mode === "paused",
    isEnded: snapshot.mode === "ended",
    isReady: snapshot.mode === "ready" || snapshot.mode === "playing" || snapshot.mode === "paused" || snapshot.mode === "ended",
    positionSec: snapshot.positionSec,
    durationSec: snapshot.durationSec,
    formattedCurrentTime: formatTime(snapshot.positionSec),
    formattedDuration: formatTime(snapshot.durationSec),
    needsUserGesture: snapshot.needsUserGesture,
    audioRef,
    play: () => controller.play(),
    pause: () => controller.pause(),
    togglePlay,
    seek: (t: number) => controller.seek(t),
    restart: () => controller.restart(),
    replay: () => controller.replay(),
    initAudio,
    initVirtualClock,
  };
}
