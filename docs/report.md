# Engineering report: decisions and trade-offs

## 1. One audio clock, a pure board

**Decision.** Join every segment's audio into one WAV and make the board a pure function of the audio's `currentTime`.

**Alternatives considered.**
- *Timers per action* drift under pause, seek and background tabs.
- *Per-segment audio elements* make seeking across segments and replay fiddly.

**Trade-off.** Narration must finish for every segment before playback starts, which adds a few seconds up front. In return, pause, seek, restart and replay are trivially correct: there is no state to re-synchronise.

## 2. Markers inside the narration

**Decision.** The model writes `[[m3]]` before the word that should trigger a visual. The TTS provider reports when that word is spoken.

**Alternative.** Ask the model for timestamps. It cannot know how long speech takes, so visuals would land early or late.

**Trade-off.** It needs TTS providers that return timing: ElevenLabs alignment, Google SSML marks. When timing is missing, marker times are estimated from word position.

## 3. Structured output, then a validator, then repair

**Decision.** Use JSON-schema-constrained output (the Zod schema), then semantic checks the schema cannot express, then send the exact problems back to the model (up to two repairs).

**Why.** Schema-valid JSON can still be unplayable: a highlight of an element that was never drawn, or a marker that no action uses.

**Trade-off.** Repairs cost latency (each is a full model call). Two later refinements came from testing against a real, fast model:
- Problems are split into **breaking** and **cosmetic**. Cosmetic problems (overlap, length a little off) are still repaired, but no longer fail the request when repairs run out.
- Off-board elements are **nudged back deterministically** instead of being sent back to the model. This removed the most common hard failure.

**Measured.** With `gemini-3.1-flash-lite`, 6 of 6 fresh topics produced a lesson in 4 to 13 s, at 255 to 362 spoken words (about two minutes). Before the change, 3 of 4 succeeded in a comparable run.

## 4. Two providers for each AI service

**Decision.** Gemini and Claude for text; ElevenLabs and Google for voice. The order is configurable.

**Why.** Free tiers and previews fail in mundane ways (quota, overload, key scope). A transient error is retried once on the same provider; other errors move on.

**Trade-off.** Two adapters per service, and prompts must work for both. The voice never switches mid-lesson: if one segment fails twice, the whole lesson is re-narrated with the next provider.

## 5. Signed narration tokens

**Decision.** The lesson route signs one HMAC token per segment (lesson id, segment id, text hash, one-hour expiry). The narration route speaks only text with a valid token.

**Why.** Otherwise `/api/narration` is an open, free TTS proxy on our account.

## 6. Honest degradation

- **No voice available:** the lesson still plays on a virtual clock, and the screen says the timing is estimated.
- **Lesson provenance:** the model and voice used are shown under the captions.
- **Fake providers:** they exist only for automated tests, and the server refuses to start with them on a deployment.
- **Error messages:** plain language, with retry where it helps. They never mention providers or keys.

## 7. What was verified, and how

| Area | Evidence |
|---|---|
| Logic: schema, validator, timeline, board state, playback state machine, router, adapters (mocked HTTP) | Vitest unit, integration and DOM tests. Property tests prove the board is deterministic and path-independent. |
| User journeys: lesson flow, all playback controls including replay, follow-ups, failures, keyboard, a11y, 360 px, reduced motion, sync lag | Playwright E2E in Chromium against fake providers. |
| Real providers | `pnpm test:live` and a generation harness against Gemini and Google TTS (2026-11-17). |
| Secrets | gitleaks in CI over the full history. |

## 8. Known gaps

See *Known limitations* and *What I would improve next* in the [README](../README.md).
