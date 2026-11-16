import "server-only";

let currentDay = "";
let count = 0;

const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

/** A per-instance cap on lessons per UTC day, to bound spend on the paid model and voice services. */
export function takeDaily(cap: number, now: Date = new Date()): { ok: boolean; retryAfterSec: number } {
  const today = dayKey(now);
  if (today !== currentDay) {
    currentDay = today;
    count = 0;
  }
  if (count >= cap) {
    const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((midnight - now.getTime()) / 1000)) };
  }
  count += 1;
  return { ok: true, retryAfterSec: 0 };
}

export function resetDailyCap(): void {
  currentDay = "";
  count = 0;
}
