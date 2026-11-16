import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { validLesson } from "../../fixtures/lessons";
import {
  clearSession,
  getAudioBlob,
  restoreSession,
  saveAudioBlob,
  savePosition,
  saveSession,
  STORAGE_KEY,
} from "@/lib/session/persist";

describe("Session Persistence (DOM)", () => {
  const lesson = validLesson();
  const tokens = { s1: "token-1", s2: "token-2" };
  const conversation = [
    { turnId: "turn-1", question: "Why binary search?", answer: "Because it cuts space in half." },
  ];

  beforeEach(async () => {
    sessionStorage.clear();
    await clearSession();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    await clearSession();
  });

  it("saves and restores a full session and audio blob round-trip", async () => {
    await saveSession({
      lesson,
      narrationTokens: tokens,
      ttsProvider: "elevenlabs",
      conversation,
      positionSec: 15.5,
    });

    const fakeBlob = new Blob(["fake-audio-pcm"], { type: "audio/wav" });
    await saveAudioBlob(lesson.id, fakeBlob);

    const restored = await restoreSession();
    expect(restored).not.toBeNull();
    expect(restored?.lesson.id).toBe(lesson.id);
    expect(restored?.lesson.topic).toBe(lesson.topic);
    expect(restored?.narrationTokens).toEqual(tokens);
    expect(restored?.ttsProvider).toBe("elevenlabs");
    expect(restored?.conversation).toEqual(conversation);
    expect(restored?.positionSec).toBe(15.5);
    expect(restored?.audioBlob).not.toBeNull();

    const restoredBlob = await getAudioBlob(lesson.id);
    expect(restoredBlob).not.toBeNull();
  });

  it("handles storage throwing gracefully (e.g. private mode) and returns null", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });

    // Should not throw on save
    await expect(
      saveSession({
        lesson,
        narrationTokens: tokens,
        conversation: [],
        positionSec: 0,
      }),
    ).resolves.not.toThrow();

    vi.restoreAllMocks();

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("SecurityError", "The operation is insecure.");
    });

    // Should return null on restore failure
    const restored = await restoreSession();
    expect(restored).toBeNull();
  });

  it("drops session and returns null on a version mismatch", async () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: "v999_incompatible",
        lesson,
        narrationTokens: tokens,
        positionSec: 10,
      }),
    );

    const restored = await restoreSession();
    expect(restored).toBeNull();
  });

  it("clears old session data and audio when a new lesson starts or clearSession is called", async () => {
    await saveSession({
      lesson,
      narrationTokens: tokens,
      conversation,
      positionSec: 22,
    });
    const fakeBlob = new Blob(["audio-data"], { type: "audio/wav" });
    await saveAudioBlob(lesson.id, fakeBlob);

    // Verify stored
    expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(await getAudioBlob(lesson.id)).not.toBeNull();

    // Clear
    await clearSession();

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(await getAudioBlob(lesson.id)).toBeNull();

    const restored = await restoreSession();
    expect(restored).toBeNull();
  });

  it("savePosition updates position and handles missing session", async () => {
    // With no session
    savePosition(10);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    // With active session
    await saveSession({
      lesson,
      narrationTokens: tokens,
      conversation,
      positionSec: 5,
    });

    savePosition(18.5);
    const restored = await restoreSession();
    expect(restored?.positionSec).toBe(18.5);
  });

  it("handles corrupted json and non-matching types gracefully", async () => {
    sessionStorage.setItem(STORAGE_KEY, "{ invalid json");
    const restored = await restoreSession();
    expect(restored).toBeNull();

    // Save with existing invalid JSON does not crash
    await saveSession({
      lesson,
      narrationTokens: tokens,
      conversation: [],
    });
    expect(await restoreSession()).not.toBeNull();
  });

  it("handles non-existent or unexpected types in audio store", async () => {
    // Non-existent lessonId
    const blob = await getAudioBlob("nonexistent-lesson");
    expect(blob).toBeNull();
  });

  it("handles direct Blob storage and version mismatch in savePosition", async () => {
    // Save version v2 to test savePosition ignoring non-v1
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ version: "v2", positionSec: 0 }));
    savePosition(42);
    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(JSON.parse(raw!).positionSec).toBe(0);

    // Test direct Blob stored in indexedDB
    const testBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });
    await saveAudioBlob("blob-direct", testBlob);
    const retrieved = await getAudioBlob("blob-direct");
    expect(retrieved).toBeInstanceOf(Blob);
  });
});
