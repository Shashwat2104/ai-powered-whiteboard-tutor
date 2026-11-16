import "server-only";

type Level = "info" | "warn" | "error";

const SENSITIVE = /key|secret|token|authorization|password/i;
const MAX_DEPTH = 4;

function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1)]),
    );
  }
  return value;
}

/** Structured JSON log line. Any field whose name looks like a secret is redacted. */
export function log(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, message, time: new Date().toISOString(), ...(redact(fields) as object) });
  process.stdout.write(`${line}\n`);
}
