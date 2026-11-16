import "server-only";
import { SAMPLE_RATE } from "@/lib/audio/wav";
import { extractMarkers, wordCount } from "@/lib/lesson/markers";
import type { TtsProvider } from "../env";
import { estimateMarks } from "./alignment";
import { TtsError, type SpeechSynth, type SynthesisResult, type SynthesizeInput } from "./types";

const WORDS_PER_SEC = 2.5;

/**
 * Test-only voice used by the browser tests (TUTOR_TEST_PROVIDERS=1). It produces a quiet tone, not speech.
 * Faults: TUTOR_FAKE_TTS_FAULT = elevenlabs_segment | elevenlabs_quota | all_fail.
 */
export class FakeSynth implements SpeechSynth {
  constructor(readonly provider: TtsProvider) {}

  async synthesize(input: SynthesizeInput): Promise<SynthesisResult> {
    const fault = process.env.TUTOR_FAKE_TTS_FAULT;
    if (fault === "all_fail") throw new TtsError("server", "fake outage", this.provider);
    if (this.provider === "elevenlabs" && fault === "elevenlabs_quota") throw new TtsError("quota", "fake quota", this.provider);
    if (this.provider === "elevenlabs" && fault === "elevenlabs_segment" && input.text.includes("middle number")) {
      throw new TtsError("failed", "fake segment failure", this.provider);
    }

    const { spokenText, marks } = extractMarkers(input.text);
    const durationSec = Math.max(1, wordCount(input.text) / WORDS_PER_SEC);
    const pcm = new Int16Array(Math.round(durationSec * SAMPLE_RATE));
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) * 800);
    return { pcm, durationSec, marks: estimateMarks(spokenText.length, marks, durationSec), provider: this.provider, voice: `fake-${this.provider}` };
  }
}
