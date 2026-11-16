import { describe, expect, it } from "vitest";
import { configuredLlm, configuredTts, EnvError, parseEnv } from "@/server/env";

const SECRET = "s".repeat(40);
const base = { NARRATION_TOKEN_SECRET: SECRET, ANTHROPIC_API_KEY: "sk-ant-real-key" };

describe("parseEnv", () => {
  it("applies defaults", () => {
    const env = parseEnv(base);
    expect(env.ANTHROPIC_MODEL).toBe("claude-opus-5-5");
    expect(env.ELEVENLABS_CONCURRENCY).toBe(2);
    expect(env.ELEVENLABS_MODEL_ID).toBe("eleven_flash_v2_5");
    expect(env.LLM_PROVIDER_ORDER).toEqual(["anthropic", "gemini"]);
    expect(env.TTS_PROVIDER_ORDER).toEqual(["elevenlabs", "google"]);
    expect(env.testProviders).toBe(false);
  });

  it("treats copied placeholder values as unset", () => {
    const env = parseEnv({ ...base, GEMINI_API_KEY: "your-gemini-key-here" });
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(configuredLlm(env)).toEqual(["anthropic"]);
  });

  it("requires at least one LLM key outside test mode", () => {
    expect(() => parseEnv({ NARRATION_TOKEN_SECRET: SECRET })).toThrow(EnvError);
  });

  it("rejects a short or placeholder token secret", () => {
    expect(() => parseEnv({ ...base, NARRATION_TOKEN_SECRET: "short" })).toThrow(/NARRATION_TOKEN_SECRET/);
    expect(() => parseEnv({ ...base, NARRATION_TOKEN_SECRET: "replace-with-32-plus-random-bytes" })).toThrow(EnvError);
  });

  it("refuses test providers on a deployment", () => {
    expect(() => parseEnv({ ...base, TUTOR_TEST_PROVIDERS: "1", VERCEL_ENV: "production" })).toThrow(/never be set/);
    expect(() => parseEnv({ ...base, TUTOR_TEST_PROVIDERS: "1", TUTOR_DEPLOYED: "1" })).toThrow(EnvError);
  });

  it("allows test providers locally without any keys", () => {
    const env = parseEnv({ NARRATION_TOKEN_SECRET: SECRET, TUTOR_TEST_PROVIDERS: "1" });
    expect(configuredLlm(env)).toEqual(["anthropic", "gemini"]);
    expect(configuredTts(env)).toEqual(["elevenlabs", "google"]);
  });

  it("honours provider order and rejects unknown providers", () => {
    const env = parseEnv({ ...base, GEMINI_API_KEY: "real", LLM_PROVIDER_ORDER: "gemini, anthropic" });
    expect(configuredLlm(env)).toEqual(["gemini", "anthropic"]);
    expect(() => parseEnv({ ...base, LLM_PROVIDER_ORDER: "openai" })).toThrow(EnvError);
  });

  it("lists only text-to-speech providers that have keys", () => {
    const env = parseEnv({ ...base, GOOGLE_TTS_API_KEY: "real", ELEVENLABS_API_KEY: "your-elevenlabs-key-here" });
    expect(configuredTts(env)).toEqual(["google"]);
  });
});
