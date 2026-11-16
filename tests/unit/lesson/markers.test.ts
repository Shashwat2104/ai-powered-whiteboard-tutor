import { describe, expect, it } from "vitest";
import { extractMarkers, stripMarkers, wordCount } from "@/lib/lesson/markers";

describe("extractMarkers", () => {
  it("removes a marker and records its offset", () => {
    expect(extractMarkers("A [[m1]]client")).toEqual({
      spokenText: "A client",
      marks: [{ name: "m1", offset: 2 }],
      errors: [],
    });
  });

  it("handles adjacent markers at the same offset", () => {
    const { spokenText, marks } = extractMarkers("Go [[m1]][[m2]]now");
    expect(spokenText).toBe("Go now");
    expect(marks).toEqual([
      { name: "m1", offset: 3 },
      { name: "m2", offset: 3 },
    ]);
  });

  it("handles a marker at the end", () => {
    const { spokenText, marks, errors } = extractMarkers("Done.[[m3]]");
    expect(spokenText).toBe("Done.");
    expect(marks).toEqual([{ name: "m3", offset: 5 }]);
    expect(errors).toEqual([]);
  });

  it("leaves a malformed marker as text and reports it", () => {
    const { spokenText, errors } = extractMarkers("Hello [[x1]]world");
    expect(spokenText).toBe("Hello [[x1]]world");
    expect(errors).toHaveLength(1);
  });

  it("reports a marker inside a word", () => {
    const { errors } = extractMarkers("cli[[m1]]ent");
    expect(errors.some((e) => e.includes("inside a word"))).toBe(true);
  });

  it("never leaves valid markers in the spoken text", () => {
    expect(extractMarkers("a [[m1]]b [[m22]]c").spokenText).not.toContain("[[");
  });
});

describe("stripMarkers and wordCount", () => {
  it("strips markers", () => {
    expect(stripMarkers("one [[m1]]two")).toBe("one two");
  });

  it("counts spoken words, ignoring markers and extra whitespace", () => {
    expect(wordCount("one [[m1]]two   three\nfour")).toBe(4);
    expect(wordCount("")).toBe(0);
  });
});
