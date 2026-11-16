import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_SEC = 3600;

export interface TokenSubject {
  lessonId: string;
  segmentId: string;
  /** The exact segment text the token covers (markers included). */
  text: string;
  secret: string;
}

export type TokenResult = { ok: true } | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "mismatch" };

const nowSec = (): number => Math.floor(Date.now() / 1000);
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const mac = (payload: string, secret: string): string => createHmac("sha256", secret).update(payload).digest("base64url");

/** Sign a short-lived token that allows narrating exactly this text for this segment of this lesson. */
export function signNarrationToken(input: TokenSubject & { ttlSec?: number; now?: number }): string {
  const issued = input.now ?? nowSec();
  const body = { l: input.lessonId, s: input.segmentId, h: sha256(input.text), e: issued + (input.ttlSec ?? DEFAULT_TTL_SEC) };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payload}.${mac(payload, input.secret)}`;
}

function parsePayload(payload: string): { l: unknown; s: unknown; h: unknown; e: unknown } | undefined {
  try {
    const value: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return value && typeof value === "object" ? (value as { l: unknown; s: unknown; h: unknown; e: unknown }) : undefined;
  } catch {
    return undefined;
  }
}

export function verifyNarrationToken(token: string, subject: TokenSubject & { now?: number }): TokenResult {
  const parts = token.split(".");
  const [payload, signature] = parts;
  if (parts.length !== 2 || !payload || !signature) return { ok: false, reason: "malformed" };

  const expected = Buffer.from(mac(payload, subject.secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { ok: false, reason: "bad_signature" };

  const body = parsePayload(payload);
  if (!body || typeof body.e !== "number") return { ok: false, reason: "malformed" };
  if ((subject.now ?? nowSec()) > body.e) return { ok: false, reason: "expired" };

  const matches = body.l === subject.lessonId && body.s === subject.segmentId && body.h === sha256(subject.text);
  return matches ? { ok: true } : { ok: false, reason: "mismatch" };
}
