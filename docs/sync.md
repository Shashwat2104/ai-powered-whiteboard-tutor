# Audio-Visual Synchronization Specification & Measurement

## 1. Architectural Approach (Deterministic Sync)

The synchronization between the narration audio and the animated SVG whiteboard elements relies on a single hardware-backed source of truth: the `HTMLMediaElement.currentTime` clock.

1. **Pure State Derivation**:
   The board state is computed via `boardStateAt(lesson, timeline, t, { reducedMotion })`. No cumulative drift is possible because every element's appearance and animation progress is a pure mathematical function of the current timestamp `t`.

2. **No Unsynchronized Timers**:
   No `setTimeout` or `setInterval` calls drive lesson progression. Frame rendering is scheduled via `requestAnimationFrame`, which samples `clock.now()` directly.

3. **Background Tab Resilience**:
   When the browser tab is hidden or backgrounded, `requestAnimationFrame` throttles. On tab return, a `visibilitychange` listener immediately triggers `controller.tick()`, snapping the board state to the audio element's live timestamp without laggy catch-up animations.

---

## 2. How sync is verified

What is actually measured, and where:

| Check | Where | Threshold | Result |
| :--- | :--- | :--- | :--- |
| Marker time vs first frame the element is drawn (`window.__tutorProbe`, `?probe=1`) | `tests/e2e/sync.spec.ts`, Chromium, fake providers | max ≤ 250 ms, p95 ≤ 100 ms | Passes in CI-equivalent local runs |
| Rendered board equals `expectedAt(audio.currentTime)` after pause, resume, ±10 s seek, restart, seek to end and replay | `tests/e2e/playback.spec.ts`, Chromium | exact set match | Passes |
| Board equals the expected set at 13 positions (0 to 110 s, including non-empty boards) while pausing, resuming and seeking; natural end then replay | Manual DevTools run against a production build with fake providers (2026-11-16) | exact set match | 13 of 13 matched |
| `boardStateAt` is deterministic and path-independent, and never shows an element before its time | `tests/unit/board/state.property.test.ts` (fast-check) | property | Passes |

Only Chromium is exercised automatically; Firefox and Safari are not part of the test matrix.

---

## 3. Known Limitations & Edge Cases

- **Firefox timer resolution**: with `privacy.resistFingerprinting`, Firefox coarsens `currentTime`. The board is still correct for whatever time the browser reports, but animation can look steppier. Not measured automatically.
- **Virtual Clock Fallback**: In offline / no-audio mode (`provider: "none"`), playback uses `VirtualClock(performance.now)` with estimated speech duration (2.5 words/second).
