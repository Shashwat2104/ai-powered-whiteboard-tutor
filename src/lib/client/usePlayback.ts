"use client";

import { useSyncExternalStore, useRef, useCallback, useEffect, useState } from "react";
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
  const [audioTrouble, setAudioTrouble] = useState(false);
  const stalledStartRef = useRef<number | null>(null);

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

      const handleError = () => {
        controller.pause();
        setAudioTrouble(true);
      };

      const handleStalled = () => {
        if (controller.getSnapshot().mode === "playing" && stalledStartRef.current === null) {
          stalledStartRef.current = Date.now();
        }
      };

      const handleClearStalled = () => {
        stalledStartRef.current = null;
      };

      audioEl.addEventListener("error", handleError);
      audioEl.addEventListener("stalled", handleStalled);
      audioEl.addEventListener("playing", handleClearStalled);
      audioEl.addEventListener("timeupdate", handleClearStalled);
      audioEl.addEventListener("canplay", handleClearStalled);
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

  // Monitor stalled condition > 5 seconds while playing in rAF tick
  useEffect(() => {
    let rafId: number;
    const checkStalled = () => {
      if (controller.getSnapshot().mode !== "playing") {
        stalledStartRef.current = null;
      } else if (stalledStartRef.current !== null && Date.now() - stalledStartRef.current > 5000) {
        stalledStartRef.current = null;
        controller.pause();
        setAudioTrouble(true);
      }
      rafId = requestAnimationFrame(checkStalled);
    };
    rafId = requestAnimationFrame(checkStalled);

    return () => cancelAnimationFrame(rafId);
  }, [controller]);

  const retryAudio = useCallback(() => {
    setAudioTrouble(false);
    stalledStartRef.current = null;
    if (audioRef.current) {
      const pos = controller.getPosition();
      const currentSrc = audioRef.current.src;
      audioRef.current.src = currentSrc;
      audioRef.current.currentTime = pos;
      audioRef.current.load();
      void controller.play();
    }
  }, [controller]);

  const continueWithoutAudio = useCallback(() => {
    setAudioTrouble(false);
    stalledStartRef.current = null;
    const pos = controller.getPosition();
    const duration = snapshot.durationSec;
    const clock = new VirtualClock(duration);
    clock.seek(pos);
    controller.setReady(clock, { noAudio: true });
    void controller.play();
  }, [controller, snapshot.durationSec]);

  // Handle visibilitychange to re-sync immediately on tab return with no animation catchup
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        controller.tick();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [controller]);

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
    audioTrouble,
    setAudioTrouble,
    retryAudio,
    continueWithoutAudio,
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
