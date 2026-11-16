import "server-only";
import { z } from "zod";
import { parseServiceAccount } from "./tts/google-auth";

export type LlmProvider = "anthropic" | "gemini";
export type TtsProvider = "elevenlabs" | "google";

/** Values copied from .env.example that were never replaced count as "not set". */
const PLACEHOLDER = /your[-_]|replace[-_]with|changeme|pinned-at-scaffold/i;

const optionalKey = z
  .string()
  .optional()
  .transform((value) => (value && !PLACEHOLDER.test(value) ? value : undefined));

const csvOf = <T extends string>(values: readonly [T, ...T[]], fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((s) => s.split(",").map((part) => part.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1));

const effort = z.enum(["low", "medium", "high"]);
const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const envSchema = z.object({
  ANTHROPIC_API_KEY: optionalKey,
  ANTHROPIC_MODEL: z.string().min(1).default("claude-opus-5-5"),
  ANTHROPIC_EFFORT_LESSON: effort.default("medium"),
  ANTHROPIC_EFFORT_FOLLOWUP: effort.default("low"),
  GEMINI_API_KEY: optionalKey,
  GEMINI_MODEL: z.string().min(1).default("gemini-flash-latest"),
  LLM_PROVIDER_ORDER: csvOf(["anthropic", "gemini"], "anthropic,gemini"),
  ELEVENLABS_API_KEY: optionalKey,
  ELEVENLABS_VOICE_ID: z.string().min(1).default("JBFqnCBsd6RMkjVDRZzb"),
  ELEVENLABS_MODEL_ID: z.string().min(1).default("eleven_flash_v2_5"),
  ELEVENLABS_CONCURRENCY: positiveInt(2),
  GOOGLE_TTS_API_KEY: optionalKey,
  GOOGLE_TTS_CREDENTIALS_B64: optionalKey,
  GOOGLE_TTS_VOICE: z.string().min(1).default("en-US-Neural2-D"),
  TTS_PROVIDER_ORDER: csvOf(["elevenlabs", "google"], "elevenlabs,google"),
  NARRATION_TOKEN_SECRET: z.string().default(""),
  RATE_LIMIT_LESSON_PER_10MIN: positiveInt(5),
  RATE_LIMIT_NARRATION_PER_10MIN: positiveInt(60),
  RATE_LIMIT_FOLLOWUP_PER_10MIN: positiveInt(30),
  DAILY_LESSON_CAP: positiveInt(200),
  TUTOR_TEST_PROVIDERS: z.string().optional(),
  TUTOR_DEPLOYED: z.string().optional(),
  VERCEL_ENV: z.string().optional(),
});

export type Env = z.infer<typeof envSchema> & { testProviders: boolean };

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

const MIN_SECRET_BYTES = 32;

/** Parse and check an environment. Throws EnvError with a message that names the variable. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new EnvError(`Invalid environment variable ${String(issue?.path[0] ?? "?")}: ${issue?.message ?? "invalid"}`);
  }
  const env = parsed.data;
  const testProviders = env.TUTOR_TEST_PROVIDERS === "1";
  const deployed = env.VERCEL_ENV === "production" || env.TUTOR_DEPLOYED === "1";
  if (testProviders && deployed) {
    throw new EnvError("TUTOR_TEST_PROVIDERS must never be set on a deployment");
  }
  if (PLACEHOLDER.test(env.NARRATION_TOKEN_SECRET) || Buffer.byteLength(env.NARRATION_TOKEN_SECRET) < MIN_SECRET_BYTES) {
    throw new EnvError(`NARRATION_TOKEN_SECRET must be a real secret of at least ${MIN_SECRET_BYTES} bytes`);
  }
  if (!testProviders && !env.ANTHROPIC_API_KEY && !env.GEMINI_API_KEY) {
    throw new EnvError("Set ANTHROPIC_API_KEY or GEMINI_API_KEY");
  }
  if (env.GOOGLE_TTS_CREDENTIALS_B64) {
    try {
      parseServiceAccount(env.GOOGLE_TTS_CREDENTIALS_B64);
    } catch (error) {
      throw new EnvError(`Invalid environment variable GOOGLE_TTS_CREDENTIALS_B64: ${error instanceof Error ? error.message : "invalid"}`);
    }
  }
  return { ...env, testProviders };
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}

/** LLM providers to try, in order. In test mode every provider in the order is available (as a fake). */
export function configuredLlm(env: Env): LlmProvider[] {
  const hasKey: Record<LlmProvider, boolean> = { anthropic: Boolean(env.ANTHROPIC_API_KEY), gemini: Boolean(env.GEMINI_API_KEY) };
  return env.LLM_PROVIDER_ORDER.filter((p) => env.testProviders || hasKey[p]);
}

/** TTS providers to try, in order. */
export function configuredTts(env: Env): TtsProvider[] {
  const hasKey: Record<TtsProvider, boolean> = { elevenlabs: Boolean(env.ELEVENLABS_API_KEY), google: Boolean(env.GOOGLE_TTS_API_KEY || env.GOOGLE_TTS_CREDENTIALS_B64) };
  return env.TTS_PROVIDER_ORDER.filter((p) => env.testProviders || hasKey[p]);
}
