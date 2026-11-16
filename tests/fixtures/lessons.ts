import type { Lesson, LessonDraft, Segment } from "@/lib/lesson/schema";
import { validDraft } from "@/server/llm/fake-lesson";

export { validDraft };

export function validLesson(): Lesson {
  const { status: _status, ...rest } = validDraft();
  void _status;
  return {
    ...rest,
    id: "123e4567-e89b-42d3-a456-426614174000",
    createdAt: "2026-11-16T12:00:00.000Z",
    generatedBy: { provider: "fake", model: "fake-1", attempts: 1 },
  };
}

/** Return a copy of the draft with one segment patched. */
export function withSegment(draft: LessonDraft, index: number, patch: Partial<Segment>): LessonDraft {
  return {
    ...draft,
    segments: draft.segments.map((s, i) => (i === index ? { ...s, ...patch } : s)),
  };
}

/** `count` plain words, for building text of a known length. */
export function words(count: number): string {
  return Array.from({ length: count }, () => "lorem").join(" ");
}
