const MARKER = /\[\[(m\d{1,3})\]\]/g;

export interface MarkerInfo {
  name: string;
  /** Character offset of the marker inside the spoken text (markers removed). */
  offset: number;
}

export interface ExtractedMarkers {
  spokenText: string;
  marks: MarkerInfo[];
  errors: string[];
}

const isLetter = (ch: string | undefined): boolean => ch !== undefined && /\p{L}|\p{N}/u.test(ch);

/** Remove `[[mN]]` markers from narration text and record where each one sat. */
export function extractMarkers(text: string): ExtractedMarkers {
  const marks: MarkerInfo[] = [];
  const errors: string[] = [];
  let spoken = "";
  let last = 0;

  for (const match of text.matchAll(MARKER)) {
    const index = match.index ?? 0;
    spoken += text.slice(last, index);
    const after = text[index + match[0].length];
    if (isLetter(spoken[spoken.length - 1]) && isLetter(after)) {
      errors.push(`Marker ${match[1]} sits inside a word`);
    }
    marks.push({ name: match[1] as string, offset: spoken.length });
    last = index + match[0].length;
  }
  spoken += text.slice(last);

  if (spoken.includes("[[")) {
    errors.push("Malformed marker left in the text; markers must look like [[m1]]");
  }
  return { spokenText: spoken, marks, errors };
}

export function stripMarkers(text: string): string {
  return extractMarkers(text).spokenText;
}

/** Number of spoken words, ignoring markers. */
export function wordCount(text: string): number {
  const spoken = stripMarkers(text).trim();
  return spoken === "" ? 0 : spoken.split(/\s+/).length;
}
