import "server-only";

export type ApiErrorKind =
  | "invalid_input"
  | "rejected_topic"
  | "rate_limited"
  | "unauthorized_narration"
  | "generation_failed"
  | "upstream_timeout"
  | "payload_too_large"
  | "internal";

const STATUS: Record<ApiErrorKind, number> = {
  invalid_input: 400,
  unauthorized_narration: 403,
  payload_too_large: 413,
  rejected_topic: 422,
  rate_limited: 429,
  internal: 500,
  generation_failed: 502,
  upstream_timeout: 504,
};

/** Plain-language defaults. They never mention providers, keys or stack traces. */
const DEFAULT_MESSAGE: Record<ApiErrorKind, string> = {
  invalid_input: "That request was not valid. Please check it and try again.",
  rejected_topic: "That topic cannot be turned into a lesson. Please try a different one.",
  rate_limited: "You are going a little fast. Please wait a moment and try again.",
  unauthorized_narration: "This narration link has expired. Please generate the lesson again.",
  generation_failed: "We could not create the lesson right now. Please try again.",
  upstream_timeout: "That took too long. Please try again.",
  payload_too_large: "That request is too large. Please shorten it and try again.",
  internal: "Something went wrong on our side. Please try again.",
};

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message?: string,
    readonly retryAfterSec?: number,
  ) {
    super(message ?? DEFAULT_MESSAGE[kind]);
    this.name = "ApiError";
  }

  get status(): number {
    return STATUS[this.kind];
  }
}

/** Turn any thrown value into the shared error response. Unknown errors become a generic message. */
export function toResponse(error: unknown): Response {
  const api = error instanceof ApiError ? error : new ApiError("internal");
  const headers: Record<string, string> = {};
  if (api.retryAfterSec !== undefined) headers["Retry-After"] = String(api.retryAfterSec);
  return Response.json(
    { error: { kind: api.kind, message: api.message, retryAfterSec: api.retryAfterSec ?? null } },
    { status: api.status, headers },
  );
}
