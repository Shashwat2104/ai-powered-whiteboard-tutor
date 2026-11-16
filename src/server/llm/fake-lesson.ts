import type { LessonDraft } from "@/lib/lesson/schema";

/**
 * The fixed lesson the test-only FakeModel returns (TUTOR_TEST_PROVIDERS=1). It lives in src so the
 * server bundle never imports from tests/; the test fixtures re-export it.
 */
/** A valid lesson about binary search. Uses all 11 action types, 3 scenes, 275 spoken words. */
export function validDraft(): LessonDraft {
  return {
    status: "ok",
    schemaVersion: "1.0",
    topic: "How binary search works",
    objective: "Explain how binary search finds a value by halving a sorted list.",
    difficulty: "beginner",
    segments: [
      {
        id: "s1",
        phase: "introduction",
        text:
          "Imagine finding a name in a thick phone book. You would not read every page. You would open the middle, " +
          "decide which half holds the name, and repeat. That clever habit is called [[m1]]binary search, and it is " +
          "surprisingly fast. Today we will see exactly how it works.",
        actions: [
          { id: "t1", type: "write", at: "m1", x: 400, y: 60, text: "Binary search", size: "title", color: "blue" },
          { id: "b1", type: "shape", at: "end", kind: "rounded", x: 650, y: 200, w: 300, h: 160, label: "Phone book" },
        ],
      },
      {
        id: "s2",
        phase: "foundation",
        text:
          "Binary search works on a [[m2]]sorted list. Here are seven numbers in order, and we want to find the number " +
          "[[m3]]thirty eight. A plain search would check them one by one, starting from the left, which can take many steps.",
        actions: [
          { id: "arr", type: "array", at: "m2", x: 450, y: 450, items: ["2", "5", "8", "16", "23", "38", "56"], cellW: 100, showIndex: true },
          { id: "n1", type: "annotate", at: "m3", target: "arr[5]", text: "Target: 38", side: "top", color: "red" },
        ],
      },
      {
        id: "s3",
        phase: "demonstration",
        text:
          "Now the shortcut. We look at the [[m4]]middle number, which is sixteen. Thirty eight is bigger than sixteen, " +
          "so everything on the left [[m5]]cannot hold our target. We throw that half away in one move. That single " +
          "comparison removes half of all the possible places.",
        actions: [
          { id: "h1", type: "highlight", at: "m4", target: "arr[3]", color: "blue" },
          { id: "d1", type: "dim", at: "m5", target: "arr[0]", strike: true },
          { id: "d2", type: "dim", at: "m5", target: "arr[1]", strike: true },
          { id: "d3", type: "dim", at: "m5", target: "arr[2]", strike: true },
          { id: "c1", type: "write", at: "end", x: 450, y: 620, text: "38 > 16, keep the right", size: "md" },
        ],
      },
      {
        id: "s4",
        phase: "demonstration",
        text:
          "Next, we repeat on the right half. The middle of what is left is [[m6]]thirty eight, which is exactly our " +
          "target. We found it after only two checks, while the plain search needed six. Each check cuts the search " +
          "area in half, so progress is very quick.",
        actions: [
          { id: "h2", type: "highlight", at: "m6", target: "arr[5]", color: "green", forSec: 4 },
          { id: "ptr", type: "connect", at: "m6", from: { x: 1300, y: 350 }, to: "arr[5]", head: "end", style: "dashed", label: "found" },
          { id: "tv", type: "travel", at: "m6", along: "ptr", label: "38", color: "green" },
        ],
      },
      {
        id: "s5",
        phase: "application",
        text:
          "This idea powers many real tools. A phone looks up a contact, a database finds a record, and a game searches " +
          "a score table. Every time the list doubles in size, [[m7]]binary search needs just one extra check. Fast " +
          "lookups matter when millions of people use the same service at once.",
        actions: [
          { id: "h3", type: "write", at: "start", x: 300, y: 100, text: "Where it is used", size: "lg" },
          { id: "apps", type: "list", at: "m7", x: 300, y: 220, items: ["Phone contacts", "Database lookups", "Game score tables"], size: "md" },
        ],
      },
      {
        id: "s6",
        phase: "recap",
        text:
          "To recap: keep the list sorted, check the middle, and discard the half that cannot contain your target. " +
          "Repeat until you find it. Because [[m8]]each step halves the work, even a million items need only about " +
          "twenty checks. That is the power of halving.",
        actions: [
          { id: "e1", type: "erase", at: "start", target: "apps" },
          { id: "eq", type: "equation", at: "m8", x: 300, y: 400, latex: "\\log_2(1{,}000{,}000) \\approx 20", size: "md" },
        ],
      },
    ],
    scenes: [
      { id: "sc1", title: "The phone book idea", segmentIds: ["s1", "s2"], transition: "clear" },
      { id: "sc2", title: "Halving the list", segmentIds: ["s3", "s4"], transition: "keep" },
      { id: "sc3", title: "Uses and recap", segmentIds: ["s5", "s6"], transition: "clear" },
    ],
    recap: { keyPoints: ["Keep the list sorted", "Check the middle", "Discard the wrong half"] },
    knowledgeChecks: [
      {
        id: "q1",
        question: "After checking the middle of a sorted list, what do you do?",
        options: ["Discard the half that cannot hold the target", "Start again from the left", "Sort the list again"],
        answerIndex: 0,
        explanation: "Because the list is sorted, one comparison rules out half of the remaining items.",
        sceneRef: "sc2",
      },
    ],
  };
}
