"use client";

import type { Lesson } from "../lesson/schema";
import type { Timeline } from "../timeline/resolve";
import { boardStateAt } from "../board/state";

export interface ProbeEvent {
  elementId: string;
  observedAtSec: number;
  scheduledTimeSec: number;
  lagMs: number;
}

export interface TutorProbe {
  events: ProbeEvent[];
  seekLatencies: number[];
  expectedAt(t: number): string[];
  recordElementFirstSeen(elementId: string, currentTimeSec: number, scheduledSec: number): void;
  recordSeekLatency(latencyMs: number): void;
}

declare global {
  interface Window {
    __tutorProbe?: TutorProbe;
  }
}

export function isProbeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const urlParams = new URLSearchParams(window.location.search);
  return process.env.NODE_ENV !== "production" || urlParams.get("probe") === "1";
}

export function initSyncProbe(lesson: Lesson, timeline: Timeline): TutorProbe | undefined {
  if (!isProbeEnabled()) return undefined;

  const events: ProbeEvent[] = [];
  const seenIds = new Set<string>();
  const seekLatencies: number[] = [];

  const probe: TutorProbe = {
    events,
    seekLatencies,
    expectedAt(t: number): string[] {
      const state = boardStateAt(lesson, timeline, t, { reducedMotion: false });
      return state.elements.map((el) => el.id);
    },
    recordElementFirstSeen(elementId: string, currentTimeSec: number, scheduledSec: number) {
      if (seenIds.has(elementId)) return;
      seenIds.add(elementId);
      const lagMs = Math.round(Math.abs(currentTimeSec - scheduledSec) * 1000);
      events.push({
        elementId,
        observedAtSec: currentTimeSec,
        scheduledTimeSec: scheduledSec,
        lagMs,
      });
    },
    recordSeekLatency(latencyMs: number) {
      seekLatencies.push(latencyMs);
    },
  };

  window.__tutorProbe = probe;
  return probe;
}
