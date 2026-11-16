"use client";

import { useEffect } from "react";
import type { PlaybackController } from "../playback/controller";

interface ShortcutsOptions {
  controller: PlaybackController;
  enabled?: boolean;
}

export function useShortcuts({ controller, enabled = true }: ShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcut when active focus is inside an input, textarea or editable region
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || target.isContentEditable) {
          return;
        }
      }

      const snapshot = controller.getSnapshot();
      const isPlayable = snapshot.mode === "ready" || snapshot.mode === "playing" || snapshot.mode === "paused" || snapshot.mode === "ended";
      if (!isPlayable) return;

      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (snapshot.mode === "playing") {
          controller.pause();
        } else {
          void controller.play();
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        controller.seek(Math.max(0, controller.getPosition() - 5));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        controller.seek(Math.min(snapshot.durationSec, controller.getPosition() + 5));
      } else if (e.key === "Home") {
        e.preventDefault();
        void controller.restart();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [controller, enabled]);
}
