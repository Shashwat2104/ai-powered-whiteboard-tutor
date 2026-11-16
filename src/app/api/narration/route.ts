import { z } from "zod";
import { encodeWavBytes, SAMPLE_RATE } from "@/lib/audio/wav";
import { configuredTts, getEnv } from "@/server/env";
import { parseJsonBody, withRoute } from "@/server/http";
import { log } from "@/server/log";
import { ApiError } from "@/server/security/errors";
import { verifyNarrationToken } from "@/server/security/narration-token";
import { clientIp, limit } from "@/server/security/rate-limit";
import { loadSynth } from "@/server/tts";
import { TtsError } from "@/server/tts/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const RATE_WINDOW_SEC = 600;
const MAX_BODY_BYTES = 8192;

const bodySchema = z.object({
  lessonId: z.string().min(1).max(64),
  segmentId: z.string().min(1).max(32),
  text: z.string().min(1).max(1200),
  previousText: z.string().max(1200).optional(),
  nextText: z.string().max(1200).optional(),
  provider: z.enum(["elevenlabs", "google"]),
  token: z.string().min(10).max(1000),
});

export const POST = withRoute("narration", async (req) => {
  const env = getEnv();
  const rate = limit("narration", clientIp(req), env.RATE_LIMIT_NARRATION_PER_10MIN, RATE_WINDOW_SEC);
  if (!rate.ok) throw new ApiError("rate_limited", undefined, rate.retryAfterSec);

  const body = await parseJsonBody(req, bodySchema, MAX_BODY_BYTES);
  const verified = verifyNarrationToken(body.token, {
    lessonId: body.lessonId,
    segmentId: body.segmentId,
    text: body.text,
    secret: env.NARRATION_TOKEN_SECRET,
  });
  if (!verified.ok) throw new ApiError("unauthorized_narration");
  if (!configuredTts(env).includes(body.provider)) throw new ApiError("invalid_input", "That voice provider is not available.");

  const synth = await loadSynth(env, body.provider);
  try {
    const result = await synth.synthesize({ text: body.text, previousText: body.previousText, nextText: body.nextText });
    return Response.json({
      segmentId: body.segmentId,
      provider: result.provider,
      voice: result.voice,
      sampleRate: SAMPLE_RATE,
      durationSec: result.durationSec,
      marks: result.marks,
      audioBase64: Buffer.from(encodeWavBytes(result.pcm)).toString("base64"),
    });
  } catch (error) {
    if (!(error instanceof TtsError)) throw error;
    log("warn", "narration failed", { provider: error.provider, kind: error.kind });
    throw new ApiError(error.kind === "timeout" ? "upstream_timeout" : "generation_failed", "We could not record the narration. Please try again.");
  }
});
