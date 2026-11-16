import "server-only";
import type { Env, TtsProvider } from "../env";
import { ElevenLabsSynth } from "./elevenlabs";
import { GoogleSynth } from "./google";
import { TtsError, type SpeechSynth } from "./types";

/** The voice adapter for one provider. Fakes load only in test mode. */
export async function loadSynth(env: Env, provider: TtsProvider): Promise<SpeechSynth> {
  if (env.testProviders) return new (await import("./fake")).FakeSynth(provider);
  if (provider === "elevenlabs" && env.ELEVENLABS_API_KEY) {
    return new ElevenLabsSynth({ apiKey: env.ELEVENLABS_API_KEY, voiceId: env.ELEVENLABS_VOICE_ID, modelId: env.ELEVENLABS_MODEL_ID });
  }
  if (provider === "google" && env.GOOGLE_TTS_API_KEY) {
    return new GoogleSynth({ apiKey: env.GOOGLE_TTS_API_KEY, voice: env.GOOGLE_TTS_VOICE });
  }
  throw new TtsError("failed", `${provider} is not configured`, provider);
}
