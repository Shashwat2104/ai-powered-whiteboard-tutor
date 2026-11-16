import "server-only";
import { createSign } from "node:crypto";
import { z } from "zod";
import { TtsError } from "./types";

const SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const ASSERTION_TTL_SEC = 3600;
const REFRESH_MARGIN_MS = 5 * 60_000;
const TIMEOUT_MS = 10_000;

const serviceAccountSchema = z.object({
  client_email: z.string().min(1),
  private_key: z.string().min(1),
  token_uri: z.url(),
  project_id: z.string().min(1),
});

export type ServiceAccount = z.infer<typeof serviceAccountSchema>;

/** Read a service-account key file that was base64-encoded so it fits in one env value. */
export function parseServiceAccount(encoded: string): ServiceAccount {
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    throw new Error("not base64-encoded JSON");
  }
  const parsed = serviceAccountSchema.safeParse(json);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`service account key is missing or has invalid: ${missing}`);
  }
  return parsed.data;
}

const base64url = (value: object): string => Buffer.from(JSON.stringify(value)).toString("base64url");

function signAssertion(account: ServiceAccount, nowSec: number): string {
  const unsigned = `${base64url({ alg: "RS256", typ: "JWT" })}.${base64url({
    iss: account.client_email,
    scope: SCOPE,
    aud: account.token_uri,
    iat: nowSec,
    exp: nowSec + ASSERTION_TTL_SEC,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key, "base64url");
  return `${unsigned}.${signature}`;
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

const cache = new Map<string, CachedToken>();

/** An OAuth access token for the service account, reused until shortly before it expires. */
export async function getAccessToken(account: ServiceAccount, now: () => number = Date.now): Promise<string> {
  const hit = cache.get(account.client_email);
  if (hit && hit.expiresAtMs - REFRESH_MARGIN_MS > now()) return hit.token;

  let res: Response;
  try {
    res = await fetch(account.token_uri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: signAssertion(account, Math.floor(now() / 1000)),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new TtsError(timedOut ? "timeout" : "server", "Google sign-in is unreachable", "google");
  }
  if (!res.ok) {
    throw new TtsError(res.status >= 500 ? "server" : "failed", `Google rejected the service account (${res.status})`, "google");
  }
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new TtsError("failed", "Google sign-in returned no token", "google");

  cache.set(account.client_email, { token: body.access_token, expiresAtMs: now() + (body.expires_in ?? ASSERTION_TTL_SEC) * 1000 });
  return body.access_token;
}
