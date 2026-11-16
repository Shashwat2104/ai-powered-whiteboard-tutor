import "server-only";

const hits = new Map<string, number[]>();
const PRUNE_ABOVE = 10_000;

export interface LimitResult {
  ok: boolean;
  /** Seconds until a blocked client may try again; 0 when allowed. */
  retryAfterSec: number;
}

/**
 * Sliding-window limiter, kept in memory. It applies per server instance, not globally.
 * Blocked requests are not recorded, so a client recovers as soon as old requests expire.
 */
export function limit(routeKey: string, ip: string, max: number, windowSec: number, now = Date.now()): LimitResult {
  const key = `${routeKey}|${ip}`;
  const windowMs = windowSec * 1000;
  const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs);

  if (recent.length >= max) {
    hits.set(key, recent);
    const oldest = recent[0] ?? now;
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
  }

  hits.set(key, [...recent, now]);
  if (hits.size > PRUNE_ABOVE) prune(now, windowMs);
  return { ok: true, retryAfterSec: 0 };
}

function prune(now: number, windowMs: number): void {
  for (const [key, times] of hits) {
    if (times.every((t) => t <= now - windowMs)) hits.delete(key);
  }
}

export function resetRateLimits(): void {
  hits.clear();
}

/** Best-effort client address: first x-forwarded-for entry, then x-real-ip. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}
