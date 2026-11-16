import { followupRequestSchema } from "@/lib/followup/schema";
import { getEnv } from "@/server/env";
import { answerFollowup } from "@/server/followup/answer";
import { parseJsonBody, withRoute } from "@/server/http";
import { ApiError } from "@/server/security/errors";
import { clientIp, limit } from "@/server/security/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const RATE_WINDOW_SEC = 600;
const MAX_BODY_BYTES = 32 * 1024; // 32 KB

export const POST = withRoute("followup", async (req) => {
  const env = getEnv();
  const rate = limit("followup", clientIp(req), env.RATE_LIMIT_FOLLOWUP_PER_10MIN, RATE_WINDOW_SEC);
  if (!rate.ok) throw new ApiError("rate_limited", undefined, rate.retryAfterSec);

  const body = await parseJsonBody(req, followupRequestSchema, MAX_BODY_BYTES);
  const answer = await answerFollowup(body, env);

  return Response.json(answer);
});
