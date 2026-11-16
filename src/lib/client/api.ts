import { z } from "zod";
import { difficultySchema, lessonSchema, type Difficulty, type Lesson } from "../lesson/schema";

export type TtsProviderName = "elevenlabs" | "google";

export type ClientErrorKind =
  | "invalid_input"
  | "rejected_topic"
  | "rate_limited"
  | "unauthorized_narration"
  | "generation_failed"
  | "upstream_timeout"
  | "payload_too_large"
  | "internal"
  | "network"
  | "aborted";

/** An error with a plain-language message that the interface can show as is. */
export class ClientError extends Error {
  constructor(
    readonly kind: ClientErrorKind,
    message: string,
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = "ClientError";
  }
}

const markSchema = z.object({ name: z.string(), timeSec: z.number().min(0), estimated: z.boolean() });

export const lessonResponseSchema = z.object({
  lesson: lessonSchema,
  narration: z.object({
    providerOrder: z.array(z.enum(["elevenlabs", "google"])),
    tokens: z.record(z.string(), z.string()),
    expiresAt: z.string(),
  }),
});

export const narrationResponseSchema = z.object({
  segmentId: z.string(),
  provider: z.enum(["elevenlabs", "google"]),
  voice: z.string(),
  sampleRate: z.literal(24000),
  durationSec: z.number().min(0),
  marks: z.array(markSchema),
  audioBase64: z.string().min(1),
});

export type LessonResponse = z.infer<typeof lessonResponseSchema>;
export type NarrationResponse = z.infer<typeof narrationResponseSchema>;
export type LessonRequest = { topic: string; difficulty: Difficulty };
export interface NarrationRequest {
  lessonId: string;
  segmentId: string;
  text: string;
  previousText?: string;
  nextText?: string;
  provider: TtsProviderName;
  token: string;
}

type FetchLike = typeof fetch;
const KINDS = new Set<string>([
  "invalid_input",
  "rejected_topic",
  "rate_limited",
  "unauthorized_narration",
  "generation_failed",
  "upstream_timeout",
  "payload_too_large",
  "internal",
]);

async function toClientError(res: Response): Promise<ClientError> {
  try {
    const body = (await res.json()) as { error?: { kind?: string; message?: string; retryAfterSec?: number | null } };
    const kind = body.error?.kind;
    if (kind && KINDS.has(kind)) {
      return new ClientError(kind as ClientErrorKind, body.error?.message ?? "Something went wrong.", body.error?.retryAfterSec ?? undefined);
    }
  } catch {
    // Not JSON: fall through to the generic error below.
  }
  return new ClientError("internal", "Something went wrong. Please try again.");
}

async function post(url: string, body: unknown, signal: AbortSignal | undefined, fetchImpl: FetchLike): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new ClientError("aborted", "Cancelled.");
    throw new ClientError("network", "We could not reach the server. Check your connection and try again.");
  }
  if (!res.ok) throw await toClientError(res);
  try {
    return await res.json();
  } catch {
    throw new ClientError("internal", "The server sent an unreadable response. Please try again.");
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ClientError("generation_failed", "The server answered in an unexpected shape. Please try again.");
  return parsed.data;
}

export async function postLesson(request: LessonRequest, signal?: AbortSignal, fetchImpl: FetchLike = fetch): Promise<LessonResponse> {
  const body = { topic: request.topic, difficulty: difficultySchema.parse(request.difficulty) };
  return parse(lessonResponseSchema, await post("/api/lesson", body, signal, fetchImpl));
}

export async function postNarration(request: NarrationRequest, signal?: AbortSignal, fetchImpl: FetchLike = fetch): Promise<NarrationResponse> {
  return parse(narrationResponseSchema, await post("/api/narration", request, signal, fetchImpl));
}

export type { Lesson };
