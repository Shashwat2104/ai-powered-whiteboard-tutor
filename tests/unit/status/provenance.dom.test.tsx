import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProvenanceNote } from "@/components/status/ProvenanceNote";

afterEach(() => cleanup());

describe("ProvenanceNote (DOM)", () => {
  it("names the live model and the voice that narrated the lesson", () => {
    render(<ProvenanceNote model="gemini-3.1-flash-lite" voice="google" />);
    expect(screen.getByText(/Written live by gemini-3\.1-flash-lite/)).toBeTruthy();
    expect(screen.getByText(/Google Cloud TTS/)).toBeTruthy();
  });

  it("says plainly when there is no voice and timing is estimated", () => {
    render(<ProvenanceNote model="claude-opus-5-5" voice="none" />);
    expect(screen.getByText(/no narration audio; timing estimated from word count/i)).toBeTruthy();
  });

  it("flags the test-only fake model as simulated", () => {
    render(<ProvenanceNote model="fake-gemini" voice="google" />);
    expect(screen.getByText(/Simulated test lesson/i)).toBeTruthy();
  });

  it("renders nothing until a lesson exists", () => {
    const { container } = render(<ProvenanceNote model={undefined} voice={undefined} />);
    expect(container.textContent).toBe("");
  });
});
