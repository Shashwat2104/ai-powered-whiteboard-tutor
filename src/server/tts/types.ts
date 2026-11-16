import "server-only";
import type { TtsProvider } from "../env";

export type TtsErrorKind = "quota" | "rate_limited" | "timeout" | "server" | "failed";

/** A failure from one voice provider. The client then narrates the whole lesson with the next one. */
export class TtsError extends Error {
  constructor(
    readonly kind: TtsErrorKind,
    message: string,
    readonly provider: TtsProvider,
  ) {
    super(message);
    this.name = "TtsError";
  }
}

export interface Mark {
  name: string;
  timeSec: number;
  /** True when the time was estimated instead of reported by the provider. */
  estimated: boolean;
}

export interface SynthesizeInput {
  /** Segment text with `[[mN]]` markers. */
  text: string;
  /** Neighbouring spoken text, so intonation carries across segments. */
  previousText?: string;
  nextText?: string;
}

export interface SynthesisResult {
  /** 16-bit mono PCM at 24 kHz. */
  pcm: Int16Array;
  durationSec: number;
  marks: Mark[];
  provider: TtsProvider;
  voice: string;
}

export interface SpeechSynth {
  readonly provider: TtsProvider;
  synthesize(input: SynthesizeInput): Promise<SynthesisResult>;
}
