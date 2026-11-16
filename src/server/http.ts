import "server-only";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { log } from "./log";
import { ApiError, toResponse } from "./security/errors";

/** Read, size-check and validate a JSON request body. Throws ApiError on any problem. */
export async function parseJsonBody<T>(req: Request, schema: z.ZodType<T>, maxBytes: number): Promise<T> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ApiError("payload_too_large");

  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes) throw new ApiError("payload_too_large");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError("invalid_input", "The request body must be valid JSON.");
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw new ApiError("invalid_input", `${where}${issue?.message ?? "Invalid value"}`);
  }
  return parsed.data;
}

export interface RouteContext {
  requestId: string;
}

/** Wrap a route handler: request id, timing, structured logging and the shared error response. */
export function withRoute(
  name: string,
  handler: (req: Request, ctx: RouteContext) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    const requestId = randomUUID();
    const started = Date.now();
    try {
      const response = await handler(req, { requestId });
      log("info", "request", { route: name, requestId, status: response.status, latencyMs: Date.now() - started });
      return response;
    } catch (error) {
      const known = error instanceof ApiError;
      log(known ? "warn" : "error", "request failed", { route: name, requestId, error, latencyMs: Date.now() - started });
      return toResponse(error);
    }
  };
}
