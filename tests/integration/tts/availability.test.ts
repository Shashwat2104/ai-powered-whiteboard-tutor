import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { parseEnv } from "@/server/env";
import { creditsPerChar, resetCreditCache, ttsProviderOrder } from "@/server/tts/availability";
import { mockServer } from "../../helpers/msw";

const server = mockServer();
beforeEach(() => resetCreditCache());

const base = {
  NARRATION_TOKEN_SECRET: "s".repeat(40),
  ANTHROPIC_API_KEY: "sk-ant-real",
  ELEVENLABS_API_KEY: "xi-real",
  GOOGLE_TTS_API_KEY: "g-real",
};
const SUBSCRIPTION = "https://api.elevenlabs.io/v1/user/subscription";
const credits = (used: number, limit: number) => http.get(SUBSCRIPTION, () => HttpResponse.json({ character_count: used, character_limit: limit }));

describe("creditsPerChar", () => {
  it("charges half for Flash and Turbo models", () => {
    expect(creditsPerChar("eleven_flash_v2_5")).toBe(0.5);
    expect(creditsPerChar("eleven_turbo_v2_5")).toBe(0.5);
    expect(creditsPerChar("eleven_multilingual_v2")).toBe(1);
  });
});

describe("ttsProviderOrder", () => {
  it("keeps ElevenLabs first when the remaining credits cover the lesson", async () => {
    server.use(credits(1000, 10000));
    expect(await ttsProviderOrder(parseEnv(base), 2000)).toEqual(["elevenlabs", "google"]);
  });

  it("drops ElevenLabs when credits would run out partway through the lesson", async () => {
    server.use(credits(9500, 10000));
    expect(await ttsProviderOrder(parseEnv(base), 2000)).toEqual(["google"]);
  });

  it("counts full price for non-Flash models", async () => {
    server.use(credits(7500, 10000));
    const env = parseEnv({ ...base, ELEVENLABS_MODEL_ID: "eleven_multilingual_v2" });
    expect(await ttsProviderOrder(env, 3000)).toEqual(["google"]);
  });

  it("assumes there are enough credits when the lookup fails", async () => {
    server.use(http.get(SUBSCRIPTION, () => new HttpResponse("{}", { status: 500 })));
    expect(await ttsProviderOrder(parseEnv(base), 2000)).toEqual(["elevenlabs", "google"]);
  });

  it("does not look anything up in test mode or without an ElevenLabs key", async () => {
    const testEnv = parseEnv({ NARRATION_TOKEN_SECRET: base.NARRATION_TOKEN_SECRET, TUTOR_TEST_PROVIDERS: "1" });
    expect(await ttsProviderOrder(testEnv, 2000)).toEqual(["elevenlabs", "google"]);
    const noKey = parseEnv({ ...base, ELEVENLABS_API_KEY: undefined });
    expect(await ttsProviderOrder(noKey, 2000)).toEqual(["google"]);
  });
});
