import { describe, it, expect } from "vitest";
import { lessonEnvelopeSchema } from "@/lib/lesson/schema";
import { validateLessonSemantics } from "@/lib/lesson/semantics";
import { GeminiModel } from "@/server/llm/gemini";
import { lessonSystemPrompt, lessonUserMessage } from "@/server/prompts/lesson";

const apiKey = process.env.GEMINI_API_KEY ?? "";
const model = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
const TOPICS = ["Binary search", "Photosynthesis fundamentals"];

/** Calls Gemini alone (no router, no repair) so its raw first-try quality is visible. */
describe.runIf(apiKey.length > 0)(`Gemini provider alone (${model})`, () => {
  const gemini = new GeminiModel({ apiKey, model });

  it.each(TOPICS)("returns a schema-valid lesson for %s and reports semantic issues", async (topic) => {
    const result = await gemini.generate({
      kind: "lesson",
      schema: lessonEnvelopeSchema,
      system: lessonSystemPrompt(),
      messages: [{ role: "user", content: lessonUserMessage(topic, "beginner") }],
      effort: "medium",
      timeoutMs: 120_000,
    });

    expect(result.data.status).toBe("ok");
    const lesson = result.data.lesson;
    expect(lesson).toBeDefined();
    const issues = lesson ? validateLessonSemantics(lesson) : [];
    console.log(JSON.stringify({ topic, model: result.model, issues }, null, 2));
    expect(issues).toEqual([]);
  });
});
