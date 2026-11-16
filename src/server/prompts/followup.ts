import "server-only";
import type { ConversationTurn, LessonContext } from "@/lib/followup/schema";

/**
 * System prompt for answering learner follow-up questions about a whiteboard lesson.
 * Grounded in the lesson content, responsive to difficulty, and structured for optional visual aid.
 */
export function followupSystemPrompt(): string {
  return [
    "You are an encouraging, expert AI whiteboard tutor answering follow-up questions from a learner.",
    "Guidelines:",
    "1. Answer simply, clearly, and concisely, tailored strictly to the lesson's difficulty level.",
    "2. Ground your explanations directly in the lesson transcript and recap.",
    "3. Reference a scene by its exact scene id in `sceneRef` when referring to that part of the lesson helps the learner.",
    "4. Add an `illustration` (up to 12 visual actions, durationSec between 2 and 15) only when a diagram or visual depiction genuinely clarifies your answer. For illustration actions, action anchors must only be 'start' or 'end'.",
    "5. If a question is outside the scope of the lesson, politely acknowledge that it is outside the lesson, and still answer briefly and accurately.",
    "6. Do not include academic citations, URLs, or phrases like 'According to the transcript'.",
    "7. Respond with only a valid JSON object matching the requested schema.",
  ].join("\n");
}

/**
 * Formats the context and conversation history with the learner's question delimited.
 * Preserves the pedagogical sequence: topic -> objective -> transcript with scene ids -> recap -> history -> question.
 */
export function followupUserMessage(
  context: LessonContext,
  history: readonly ConversationTurn[],
  question: string,
): string {
  const parts: string[] = [];

  parts.push("<lesson_context>");
  parts.push(`<topic>${context.topic}</topic>`);
  parts.push(`<objective>${context.objective}</objective>`);
  parts.push(`<difficulty>${context.difficulty}</difficulty>`);

  parts.push("<transcript>");
  for (const item of context.transcript) {
    parts.push(`[Scene: ${item.sceneId}, Segment: ${item.segmentId}] ${item.text}`);
  }
  parts.push("</transcript>");

  if (context.recap.length > 0) {
    parts.push("<recap>");
    for (const point of context.recap) {
      parts.push(`- ${point}`);
    }
    parts.push("</recap>");
  }

  if (history.length > 0) {
    parts.push("<history>");
    for (let i = 0; i < history.length; i++) {
      const turn = history[i];
      if (turn) {
        parts.push(`Turn ${i + 1}:\nQ: ${turn.question}\nA: ${turn.answer}`);
      }
    }
    parts.push("</history>");
  }

  parts.push("</lesson_context>");

  parts.push("<question>");
  parts.push(question);
  parts.push("</question>");

  return parts.join("\n");
}
