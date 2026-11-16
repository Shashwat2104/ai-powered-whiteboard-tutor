import type { Lesson } from "../lesson/schema";
import type { Timeline } from "../timeline/resolve";
import type { ChatTurn } from "@/components/chat/FollowUpPanel";

export const STORAGE_KEY = "tutor:v1";
const DB_NAME = "tutor";
const STORE_NAME = "audio";
const DB_VERSION = 1;

export interface SessionData {
  version: "v1";
  lesson: Lesson;
  timeline?: Timeline;
  narrationTokens: Record<string, string>;
  narrationExpiresAt?: string;
  ttsProvider?: string;
  conversation: ChatTurn[];
  positionSec: number;
  savedAt: number;
}

export interface SaveSessionInput {
  lesson: Lesson;
  timeline?: Timeline;
  narrationTokens: Record<string, string>;
  narrationExpiresAt?: string;
  ttsProvider?: string;
  conversation?: ChatTurn[];
  positionSec?: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not supported"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Persists the lesson, narration tokens, conversation turns, and current position in sessionStorage.
 * Safe for private browsing and quota limits.
 */
export async function saveSession(input: SaveSessionInput): Promise<void> {
  try {
    if (typeof sessionStorage === "undefined") return;

    const existingJson = sessionStorage.getItem(STORAGE_KEY);
    let existingConversation: ChatTurn[] = [];
    let existingPosition = 0;

    if (existingJson) {
      try {
        const parsed = JSON.parse(existingJson);
        if (parsed?.version === "v1") {
          existingConversation = parsed.conversation ?? [];
          existingPosition = parsed.positionSec ?? 0;
        }
      } catch {
        // Ignore parse error
      }
    }

    const sessionData: SessionData = {
      version: "v1",
      lesson: input.lesson,
      timeline: input.timeline,
      narrationTokens: input.narrationTokens,
      narrationExpiresAt: input.narrationExpiresAt,
      ttsProvider: input.ttsProvider,
      conversation: input.conversation ?? existingConversation,
      positionSec: input.positionSec ?? existingPosition,
      savedAt: Date.now(),
    };

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
  } catch {
    // QuotaExceededError or private browsing restrictions
  }
}

/**
 * Saves current playback position, updating sessionStorage.
 */
export function savePosition(positionSec: number): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    const json = sessionStorage.getItem(STORAGE_KEY);
    if (!json) return;
    const parsed = JSON.parse(json);
    if (parsed?.version === "v1") {
      parsed.positionSec = positionSec;
      parsed.savedAt = Date.now();
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }
  } catch {
    // Fail silently in private mode
  }
}

/**
 * Stores the joined WAV audio Blob in IndexedDB keyed by lesson ID.
 */
export async function saveAudioBlob(lessonId: string, blob: Blob): Promise<void> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(arrayBuffer, lessonId);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // Ignore IndexedDB errors
  }
}

/**
 * Retrieves the joined audio Blob from IndexedDB.
 */
function isArrayBuffer(val: unknown): val is ArrayBuffer {
  return (
    val instanceof ArrayBuffer ||
    Object.prototype.toString.call(val) === "[object ArrayBuffer]" ||
    (typeof val === "object" && val !== null && val.constructor?.name === "ArrayBuffer")
  );
}

function isBlob(val: unknown): val is Blob {
  return (
    val instanceof Blob ||
    Object.prototype.toString.call(val) === "[object Blob]" ||
    (typeof val === "object" && val !== null && val.constructor?.name === "Blob")
  );
}

/**
 * Retrieves the joined audio Blob from IndexedDB.
 */
export async function getAudioBlob(lessonId: string): Promise<Blob | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(lessonId);
      req.onsuccess = () => {
        db.close();
        const res = req.result;
        if (!res) {
          resolve(null);
        } else if (isArrayBuffer(res)) {
          resolve(new Blob([res], { type: "audio/wav" }));
        } else if (isBlob(res)) {
          resolve(res);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Restores the lesson, conversation, position, and audio blob from browser storage.
 * Returns null if not found, corrupted, or version mismatched.
 */
export async function restoreSession(): Promise<{
  lesson: Lesson;
  timeline?: Timeline;
  narrationTokens: Record<string, string>;
  narrationExpiresAt?: string;
  ttsProvider?: string;
  conversation: ChatTurn[];
  positionSec: number;
  audioBlob: Blob | null;
} | null> {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const json = sessionStorage.getItem(STORAGE_KEY);
    if (!json) return null;

    const data: SessionData = JSON.parse(json);
    if (data.version !== "v1" || !data.lesson?.id) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const audioBlob = await getAudioBlob(data.lesson.id);

    return {
      lesson: data.lesson,
      timeline: data.timeline,
      narrationTokens: data.narrationTokens ?? {},
      narrationExpiresAt: data.narrationExpiresAt,
      ttsProvider: data.ttsProvider,
      conversation: data.conversation ?? [],
      positionSec: data.positionSec ?? 0,
      audioBlob,
    };
  } catch {
    return null;
  }
}

/**
 * Clears sessionStorage and all cached audio from IndexedDB.
 */
export async function clearSession(): Promise<void> {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // Fail silently
  }
}
