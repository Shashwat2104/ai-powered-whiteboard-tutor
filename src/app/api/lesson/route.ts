import { z } from "zod";
import { difficultySchema } from "@/lib/lesson/schema";
import { stripMarkers } from "@/lib/lesson/markers";
import { getEnv } from "@/server/env";
import { parseJsonBody, withRoute } from "@/server/http";
import { generateLesson } from "@/server/lesson/generate";
import { takeDaily } from "@/server/security/daily-cap";
import { ApiError } from "@/server/security/errors";
import { signNarrationToken } from "@/server/security/narration-token";
import { clientIp, limit } from "@/server/security/rate-limit";
import { ttsProviderOrder } from "@/server/tts/availability";

export const runtime = "nodejs";
export const maxDuration = 120;

const RATE_WINDOW_SEC = 600;
const MAX_BODY_BYTES = 2048;
const TOKEN_TTL_SEC = 3600;

const bodySchema = z.object({
  topic: z.string().trim().min(1, "Please enter a topic.").max(200, "Topics can be at most 200 characters."),
  difficulty: difficultySchema.default("beginner"),
});

export const POST = withRoute("lesson", async (req) => {
  const env = getEnv();
  const rate = limit("lesson", clientIp(req), env.RATE_LIMIT_LESSON_PER_10MIN, RATE_WINDOW_SEC);
  if (!rate.ok) throw new ApiError("rate_limited", undefined, rate.retryAfterSec);

  const body = await parseJsonBody(req, bodySchema, MAX_BODY_BYTES);
  const daily = takeDaily(env.DAILY_LESSON_CAP);
  if (!daily.ok) throw new ApiError("rate_limited", "Today's lesson limit has been reached. Please come back tomorrow.", daily.retryAfterSec);

  const lesson = await generateLesson(body, env);
  const issued = Math.floor(Date.now() / 1000);
  const tokens = Object.fromEntries(
    lesson.segments.map((s) => [
      s.id,
      signNarrationToken({ lessonId: lesson.id, segmentId: s.id, text: s.text, secret: env.NARRATION_TOKEN_SECRET, ttlSec: TOKEN_TTL_SEC, now: issued }),
    ]),
  );
  const spokenChars = lesson.segments.reduce((n, s) => n + stripMarkers(s.text).length, 0);
  const providerOrder = await ttsProviderOrder(env, spokenChars);

  return Response.json({
    lesson,
    narration: { providerOrder, tokens, expiresAt: new Date((issued + TOKEN_TTL_SEC) * 1000).toISOString() },
  });
});
