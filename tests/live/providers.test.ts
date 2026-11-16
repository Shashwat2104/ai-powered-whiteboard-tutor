import { describe, it, expect } from "vitest";
import { generateLesson } from "@/server/lesson/generate";
import { getEnv } from "@/server/env";
import { loadSynth } from "@/server/tts";

const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
const hasGemini = !!process.env.GEMINI_API_KEY;
const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY;
const hasGoogleTts = !!process.env.GOOGLE_TTS_API_KEY;

describe("Live Provider Verification", () => {
  describe("T073: LLM Schema Acceptance (K1)", () => {
    it.runIf(hasAnthropic || hasGemini)("generates a valid parsed lesson with available LLM provider", async () => {
      const env = getEnv();
      const lesson = await generateLesson(
        {
          topic: "Photosynthesis fundamentals",
          difficulty: "beginner",
        },
        env
      );

      expect(lesson).toBeDefined();
      expect(lesson.topic).toBe("Photosynthesis fundamentals");
      expect(lesson.segments.length).toBeGreaterThanOrEqual(5);
      expect(lesson.scenes.length).toBeGreaterThanOrEqual(2);
      expect(lesson.knowledgeChecks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("T074: TTS Audio & Alignment Formats (K3/K4)", () => {
    it.runIf(hasElevenLabs)("synthesizes PCM 24000 audio with marks on ElevenLabs", async () => {
      const env = getEnv();
      const synth = await loadSynth(env, "elevenlabs");
      const result = await synth.synthesize({
        text: "This is a [[m1]]test of audio alignment.",
      });

      expect(result.pcm.length).toBeGreaterThan(0);
      expect(result.durationSec).toBeGreaterThan(0);
      expect(result.marks.length).toBeGreaterThanOrEqual(1);
      expect(result.marks[0]?.name).toBe("m1");
    });

    it.runIf(hasGoogleTts)("synthesizes linear PCM audio with timepoints on Google TTS", async () => {
      const env = getEnv();
      const synth = await loadSynth(env, "google");
      const result = await synth.synthesize({
        text: "This is a [[m1]]test of Google timepoints.",
      });

      expect(result.pcm.length).toBeGreaterThan(0);
      expect(result.durationSec).toBeGreaterThan(0);
      expect(result.marks.length).toBeGreaterThanOrEqual(1);
    });
  });
});
