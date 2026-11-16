import { configuredLlm, configuredTts, getEnv } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which providers are configured (never their keys) and the deployed version. */
export function GET(): Response {
  try {
    const env = getEnv();
    return Response.json({
      ok: true,
      llm: configuredLlm(env),
      tts: configuredTts(env),
      version: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
    });
  } catch {
    return Response.json({ ok: false, error: "The server is not configured correctly." }, { status: 503 });
  }
}
