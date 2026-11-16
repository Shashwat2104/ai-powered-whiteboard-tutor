import { describe, expect, it } from "vitest";
import { extractMarkers } from "@/lib/lesson/markers";
import { estimateMarks, marksFromAlignment } from "@/server/tts/alignment";
import { toSsml } from "@/server/tts/ssml";

const { spokenText, marks } = extractMarkers("A [[m1]]client asks the [[m2]]server");
const starts = Array.from({ length: spokenText.length }, (_, i) => i * 0.1);
const alignment = { characters: [...spokenText], characterStartTimesSeconds: starts };

describe("marksFromAlignment", () => {
  it("uses the start time of the first character at or after each marker", () => {
    const result = marksFromAlignment(spokenText, marks, alignment, 10);
    expect(result).toEqual([
      { name: "m1", timeSec: starts[2], estimated: false },
      { name: "m2", timeSec: starts[spokenText.indexOf("server")], estimated: false },
    ]);
  });

  it("returns the clip duration for a marker at the very end", () => {
    const end = extractMarkers("Done.[[m1]]");
    const result = marksFromAlignment(end.spokenText, end.marks, { characters: [...end.spokenText], characterStartTimesSeconds: [0, 1, 2, 3, 4] }, 5);
    expect(result[0]).toMatchObject({ timeSec: 5 });
  });

  it("estimates proportionally when there is no alignment", () => {
    const result = marksFromAlignment(spokenText, marks, undefined, 8);
    expect(result.every((m) => m.estimated)).toBe(true);
    expect(result[0]!.timeSec).toBeCloseTo((8 * 2) / spokenText.length, 5);
  });

  it("scales the index and flags estimates when the provider normalised the text", () => {
    const shorter = { characters: [...spokenText].slice(0, 10), characterStartTimesSeconds: starts.slice(0, 10) };
    const result = marksFromAlignment(spokenText, marks, shorter, 8);
    expect(result.every((m) => m.estimated)).toBe(true);
    expect(result[1]!.timeSec).toBeGreaterThan(result[0]!.timeSec);
  });

  it("clamps times to the clip duration", () => {
    const long = { characters: [...spokenText], characterStartTimesSeconds: starts.map((t) => t + 100) };
    expect(marksFromAlignment(spokenText, marks, long, 3).every((m) => m.timeSec <= 3)).toBe(true);
  });
});

describe("estimateMarks", () => {
  it("handles empty text without dividing by zero", () => {
    expect(estimateMarks(0, [{ name: "m1", offset: 0 }], 4)).toEqual([{ name: "m1", timeSec: 0, estimated: true }]);
  });
});

describe("toSsml", () => {
  it("escapes XML characters and turns markers into mark tags", () => {
    expect(toSsml(`Tom & "Jerry" [[m3]]<run>`)).toBe(`<speak>Tom &amp; &quot;Jerry&quot; <mark name="m3"/>&lt;run&gt;</speak>`);
  });

  it("neutralises SSML injection", () => {
    const ssml = toSsml("</speak><audio src='x'/>");
    expect(ssml).not.toContain("<audio");
    expect(ssml.startsWith("<speak>") && ssml.endsWith("</speak>")).toBe(true);
  });
});
