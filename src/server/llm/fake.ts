import "server-only";
import type { LlmProvider } from "../env";
import { validDraft } from "./fake-lesson";
import { LlmError, type GenerateRequest, type GenerateResult, type StructuredModel } from "./types";

/**
 * Test-only model used by the browser tests (TUTOR_TEST_PROVIDERS=1). The environment check in
 * env.ts refuses to start on a deployment with this flag, so it can never serve real learners.
 * Faults: TUTOR_FAKE_LLM_FAULT = anthropic_429 | anthropic_timeout | invalid_twice | all_fail.
 */
export class FakeModel implements StructuredModel {
  constructor(readonly provider: LlmProvider) {}

  async generate<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const fault = process.env.TUTOR_FAKE_LLM_FAULT;
    if (fault === "all_fail") throw new LlmError("server", "fake outage", this.provider);
    if (fault === "anthropic_429" && this.provider === "anthropic") throw new LlmError("rate_limited", "fake 429", this.provider);
    if (fault === "anthropic_timeout" && this.provider === "anthropic") throw new LlmError("timeout", "fake timeout", this.provider);

    const first = request.messages[0]?.content ?? "";
    const topic = /<topic>([\s\S]*?)<\/topic>/.exec(first)?.[1]?.trim() || "A fake topic";
    const payload = request.kind === "lesson" ? lessonPayload(topic, fault === "invalid_twice" && request.messages.length < 5) : followupPayload(first);
    const raw = JSON.stringify(payload);
    const parsed = request.schema.safeParse(payload);
    if (!parsed.success) throw new LlmError("invalid_output", parsed.error.issues[0]?.message ?? "fake mismatch", this.provider);
    return { data: parsed.data, raw, model: `fake-${this.provider}` };
  }
}

function lessonPayload(topic: string, broken: boolean): unknown {
  if (topic.toUpperCase().includes("REJECT")) return { status: "rejected", reason: "That is not something I can teach." };
  const { status: _status, ...lesson } = validDraft();
  void _status;
  const withTopic = { ...lesson, topic: topic.slice(0, 200) };
  if (!broken) return { status: "ok", lesson: withTopic };
  const [first, ...rest] = withTopic.segments;
  const bad = first && { ...first, actions: first.actions.map((a, i) => (i === 0 ? { ...a, at: "m9" } : a)) };
  return { status: "ok", lesson: { ...withTopic, segments: bad ? [bad, ...rest] : rest } };
}

function followupPayload(prompt: string): unknown {
  const asked = /<question>([\s\S]*?)<\/question>/.exec(prompt)?.[1]?.trim() ?? "your question";

  let sceneRef: string | undefined = "sc2";
  if (asked.includes("trigger_unknown_scene")) {
    sceneRef = "scene_does_not_exist";
  }

  let illustration: unknown = undefined;
  if (asked.includes("trigger_valid_illustration")) {
    illustration = {
      durationSec: 4,
      actions: [
        { id: "ill_w1", type: "write", at: "start", x: 100, y: 100, text: "Mini illustration", size: "md" },
      ],
    };
  } else if (asked.includes("trigger_invalid_illustration")) {
    // Passes Zod schema but fails semantic validation with REF_UNKNOWN
    illustration = {
      durationSec: 4,
      actions: [
        { id: "conn1", type: "connect", at: "start", from: "unknown_target_id", to: { x: 300, y: 300 }, head: "end" },
      ],
    };
  }

  return {
    answer: `Good question. In this lesson, the key idea behind "${asked.slice(0, 80)}" is that each check removes half of what is left.`,
    ...(sceneRef ? { sceneRef } : {}),
    ...(illustration ? { illustration } : {}),
  };
}
