import { pcmFromBase64Wav } from "../audio/wav";
import type { Lesson } from "../lesson/schema";
import { ClientError, postNarration, type NarrationResponse, type TtsProviderName } from "./api";

export interface NarrationAudio {
  segmentId: string;
  pcm: Int16Array;
  marks: readonly { name: string; timeSec: number; estimated: boolean }[];
}

export type NarrateResult =
  | { provider: TtsProviderName; audio: NarrationAudio[] }
  /** No voice provider worked: the lesson plays on a virtual clock with estimated timing. */
  | { provider: "none"; audio: [] };

export interface NarrateOptions {
  /** Called as segments finish, for the progress display. */
  onProgress?: (done: number, total: number, provider: TtsProviderName) => void;
  signal?: AbortSignal;
  /** Replaceable for tests. */
  request?: typeof postNarration;
  /** Parallel requests per provider. ElevenLabs' free plan allows only 2 at a time. */
  concurrency?: Partial<Record<TtsProviderName, number>>;
}

const DEFAULT_CONCURRENCY: Record<TtsProviderName, number> = { elevenlabs: 2, google: 4 };
const RETRIES_PER_SEGMENT = 1;

export interface NarrationPlan {
  providerOrder: readonly TtsProviderName[];
  tokens: Readonly<Record<string, string>>;
}

function decode(response: NarrationResponse): NarrationAudio {
  return { segmentId: response.segmentId, pcm: pcmFromBase64Wav(response.audioBase64), marks: response.marks };
}

async function narrateSegment(
  lesson: Lesson,
  index: number,
  provider: TtsProviderName,
  plan: NarrationPlan,
  request: typeof postNarration,
  signal: AbortSignal,
): Promise<NarrationAudio> {
  const segment = lesson.segments[index]!;
  const token = plan.tokens[segment.id];
  if (!token) throw new ClientError("unauthorized_narration", "This lesson has no narration access.");

  for (let attempt = 0; ; attempt++) {
    try {
      return decode(
        await request(
          {
            lessonId: lesson.id,
            segmentId: segment.id,
            text: segment.text,
            previousText: lesson.segments[index - 1]?.text,
            nextText: lesson.segments[index + 1]?.text,
            provider,
            token,
          },
          signal,
        ),
      );
    } catch (error) {
      const fatal = error instanceof ClientError && (error.kind === "aborted" || error.kind === "unauthorized_narration");
      if (fatal || attempt >= RETRIES_PER_SEGMENT) throw error;
    }
  }
}

/** Narrate every segment with one provider. Any failed segment fails the whole attempt (one voice per lesson). */
async function narrateWith(
  lesson: Lesson,
  provider: TtsProviderName,
  plan: NarrationPlan,
  options: NarrateOptions,
): Promise<NarrationAudio[]> {
  const request = options.request ?? postNarration;
  const total = lesson.segments.length;
  const results = new Array<NarrationAudio>(total);
  const stop = new AbortController();
  const outer = options.signal;
  const onAbort = (): void => stop.abort();
  outer?.addEventListener("abort", onAbort);

  let next = 0;
  let done = 0;
  const workers = Math.min(total, options.concurrency?.[provider] ?? DEFAULT_CONCURRENCY[provider]);
  const throwIfStopped = (): void => {
    if (stop.signal.aborted) throw new ClientError("aborted", "Cancelled.");
  };
  const worker = async (): Promise<void> => {
    while (next < total) {
      throwIfStopped();
      const index = next++;
      results[index] = await narrateSegment(lesson, index, provider, plan, request, stop.signal);
      throwIfStopped();
      options.onProgress?.(++done, total, provider);
    }
  };

  try {
    await Promise.all(Array.from({ length: workers }, worker));
    return results;
  } catch (error) {
    stop.abort();
    throw error;
  } finally {
    outer?.removeEventListener("abort", onAbort);
  }
}

/**
 * Narrate a lesson segment by segment. Providers are tried in order; if any segment still fails
 * after a retry, the whole lesson is narrated again with the next provider so the voice never
 * changes midway. If every provider fails the result is `none` and the caller plays without audio.
 */
export async function narrateLesson(lesson: Lesson, plan: NarrationPlan, options: NarrateOptions = {}): Promise<NarrateResult> {
  for (const provider of plan.providerOrder) {
    if (options.signal?.aborted) throw new ClientError("aborted", "Cancelled.");
    try {
      return { provider, audio: await narrateWith(lesson, provider, plan, options) };
    } catch (error) {
      if (error instanceof ClientError && (error.kind === "aborted" || error.kind === "unauthorized_narration")) throw error;
    }
  }
  return { provider: "none", audio: [] };
}
