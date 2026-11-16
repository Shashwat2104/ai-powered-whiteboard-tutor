import "server-only";
import { configuredTts, type Env, type TtsProvider } from "../env";

const SUBSCRIPTION_URL = "https://api.elevenlabs.io/v1/user/subscription";
const CACHE_MS = 60_000;
const LOOKUP_TIMEOUT_MS = 4_000;

/** Credits per character: Flash and Turbo models cost half of the others. */
export function creditsPerChar(modelId: string): number {
  return /flash|turbo/i.test(modelId) ? 0.5 : 1;
}

let cache: { at: number; remaining: number } | undefined;

export function resetCreditCache(): void {
  cache = undefined;
}

/**
 * True for "this key is not valid", as opposed to a valid key that may not read the subscription
 * (scoped keys get 401 missing_permissions here yet can still synthesize speech).
 */
async function isInvalidKey(res: Response): Promise<boolean> {
  try {
    const body = (await res.json()) as { detail?: { status?: string } };
    return body.detail?.status === "invalid_api_key";
  } catch {
    return false;
  }
}

/**
 * Credits left on the ElevenLabs plan: 0 when the key is invalid, undefined when it could not be
 * read (then assume enough).
 */
export async function elevenLabsCreditsRemaining(apiKey: string, now = Date.now()): Promise<number | undefined> {
  if (cache && now - cache.at < CACHE_MS) return cache.remaining;
  try {
    const res = await fetch(SUBSCRIPTION_URL, {
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (res.status === 401 && (await isInvalidKey(res))) {
      // A dead key can narrate nothing: report no credits so the next voice is used straight away.
      cache = { at: now, remaining: 0 };
      return 0;
    }
    if (!res.ok) return undefined;
    const body = (await res.json()) as { character_count?: number; character_limit?: number };
    if (typeof body.character_count !== "number" || typeof body.character_limit !== "number") return undefined;
    cache = { at: now, remaining: body.character_limit - body.character_count };
    return cache.remaining;
  } catch {
    return undefined;
  }
}

/**
 * Voice providers worth trying for a lesson of `spokenChars` characters. ElevenLabs is dropped when
 * its remaining credits would not cover the whole lesson, so a lesson never starts in one voice and
 * runs out partway (the free plan has a small monthly quota).
 */
export async function ttsProviderOrder(env: Env, spokenChars: number): Promise<TtsProvider[]> {
  const order = configuredTts(env);
  if (env.testProviders || !order.includes("elevenlabs") || !env.ELEVENLABS_API_KEY) return order;
  const remaining = await elevenLabsCreditsRemaining(env.ELEVENLABS_API_KEY);
  const needed = spokenChars * creditsPerChar(env.ELEVENLABS_MODEL_ID);
  return remaining !== undefined && remaining < needed ? order.filter((p) => p !== "elevenlabs") : order;
}
