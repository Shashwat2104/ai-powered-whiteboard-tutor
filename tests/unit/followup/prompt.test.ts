import { describe, expect, it } from "vitest";
import { followupSystemPrompt, followupUserMessage } from "@/server/prompts/followup";
import type { ConversationTurn, LessonContext } from "@/lib/followup/schema";

describe("Follow-up Prompts", () => {
  const context: LessonContext = {
    lessonId: "test-lesson-123",
    topic: "Binary Search",
    objective: "Understand how divide and conquer cuts search space in half",
    difficulty: "beginner",
    transcript: [
      { segmentId: "seg1", sceneId: "sc1", text: "Welcome to binary search." },
      { segmentId: "seg2", sceneId: "sc2", text: "Notice the array is sorted." },
    ],
    scenes: [
      { id: "sc1", title: "Introduction" },
      { id: "sc2", title: "The Array" },
    ],
    recap: ["Binary search needs sorted items", "Each check halves remaining items"],
  };

  const history: ConversationTurn[] = [
    { question: "What if the list is unsorted?", answer: "Then binary search does not work." },
    { question: "Can we sort it first?", answer: "Yes, you can sort it in O(n log n)." },
  ];

  it("builds a system prompt with grounded instructions and no citations", () => {
    const system = followupSystemPrompt();
    expect(system).toMatch(/difficulty/i);
    expect(system).toMatch(/transcript/i);
    expect(system).toMatch(/scene/i);
    expect(system).toMatch(/illustration/i);
    expect(system).toMatch(/outside/i);
    expect(system).toMatch(/citation|cite/i);
  });

  it("builds a user prompt that contains topic, objective, transcript with scene ids, recap, and history in order, followed by the delimited question", () => {
    const question = "Why do we calculate mid using low + (high - low) / 2?";
    const prompt = followupUserMessage(context, history, question);

    // Context components exist
    expect(prompt).toContain("Binary Search");
    expect(prompt).toContain("Understand how divide and conquer cuts search space in half");
    expect(prompt).toContain("sc1");
    expect(prompt).toContain("sc2");
    expect(prompt).toContain("Welcome to binary search.");
    expect(prompt).toContain("Notice the array is sorted.");
    expect(prompt).toContain("Binary search needs sorted items");
    expect(prompt).toContain("What if the list is unsorted?");
    expect(prompt).toContain("Can we sort it first?");

    // Question is delimited after the context
    expect(prompt).toContain(`<question>\n${question}\n</question>`);

    // Verify ordering: topic -> objective -> transcript -> recap -> history -> question
    const topicIdx = prompt.indexOf("Binary Search");
    const objIdx = prompt.indexOf("Understand how divide and conquer");
    const transcriptIdx = prompt.indexOf("Notice the array is sorted.");
    const recapIdx = prompt.indexOf("Binary search needs sorted items");
    const historyIdx = prompt.indexOf("What if the list is unsorted?");
    const questionIdx = prompt.indexOf(question);

    expect(topicIdx).toBeLessThan(objIdx);
    expect(objIdx).toBeLessThan(transcriptIdx);
    expect(transcriptIdx).toBeLessThan(recapIdx);
    expect(recapIdx).toBeLessThan(historyIdx);
    expect(historyIdx).toBeLessThan(questionIdx);
  });
});
