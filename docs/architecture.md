# Architecture

## Request flow

1. **`POST /api/lesson`** (`src/app/api/lesson/route.ts`, `maxDuration` 120 s)
   - Per-IP sliding-window rate limit and a per-instance daily cap (`src/server/security`).
   - Body validated with Zod (topic 1 to 200 characters, difficulty).
   - `generateLesson()` (`src/server/lesson/generate.ts`) normalises the topic, then asks the LLM router for a lesson.
   - The server adds `id`, `createdAt` and `generatedBy`, and signs one HMAC narration token per segment. A token binds lesson id, segment id and a hash of the segment text, and expires after one hour.
   - It returns the lesson, the tokens and the voice-provider order.
2. **`POST /api/narration`**, once per segment, from the browser (`src/lib/client/narrate.ts`)
   - Verifies the token, so only text the server generated can be spoken on our TTS account.
   - Calls ElevenLabs or Google TTS (`src/server/tts`) and returns 24 kHz PCM as base64 WAV plus marker times.
   - The client runs two to four segments in parallel. If any segment fails twice, the whole lesson is narrated again with the next provider, so the voice never changes mid-lesson. If all providers fail, the lesson plays without audio.
3. **`buildPlayable()`** (`src/lib/client/build-playable.ts`)
   - Joins the segment PCM into one WAV.
   - `resolveTimeline()` turns markers and segment offsets into absolute action times.
4. **Playback**
   - `PlaybackController` (`src/lib/playback/controller.ts`) is a small state machine (idle, generating, narrating, ready, playing, paused, ended, error) built on a `LessonClock`.
   - The clock is the `<audio>` element (`AudioClock`), or a `VirtualClock` when there is no audio.
   - Each animation frame reads the clock and renders `boardStateAt(lesson, timeline, t)`.
5. **`POST /api/followup`** (`maxDuration` 30 s)
   - Sends the lesson transcript, scenes, recap, recent conversation and the question to the router.
   - Illustrations are validated with the same semantic rules as lessons. Invalid ones are dropped and the answer is kept.

## LLM routing (`src/server/llm/router.ts`)

- Providers are tried in `LLM_PROVIDER_ORDER`.
- **Transient errors** (`server`, `timeout`) are retried once on the same provider. Rate limits, refusals and configuration errors move straight to the next provider.
- **Validation:** every reply is parsed against the Zod schema (the same schema is sent as the model's JSON-schema output format).
  - It is then normalised: elements that poke past the 1600×900 board are nudged back inside (`fitToBoard`).
  - Then it is checked by `validateLessonSemantics()`.
- **Repair:** up to two rounds per provider. The model receives its own reply plus a numbered list of problems.
- **Cosmetic issues:** overlaps, length a little off target, or a scene with nothing new drawn.
  - These never stop the repair loop.
  - If repairs run out, or the time budget is nearly spent, the best lesson with only cosmetic issues is returned instead of an error.
  - Broken markers, dangling references, uncovered segments and lessons far shorter than two minutes are never returned.
- Lessons have a 100 s overall budget and 60 s per call. Follow-ups have 26 s and 18 s, inside the route's 30 s limit.

## Module boundaries

| Folder | Holds | Rules |
|---|---|---|
| `src/app/api` | Route handlers | Thin: validate, rate-limit, call a server function, shape the error envelope (`src/server/security/errors.ts`). |
| `src/server` | Provider adapters, prompts, routing, security, logging | `import "server-only"`; never bundled to the browser. Errors are mapped to plain-language messages that never mention providers or keys. |
| `src/lib` | Pure, shared logic | No I/O except `src/lib/client` (browser API calls, audio, persistence). Most of the test suite targets this layer. |
| `src/components` | React UI | `LessonApp` coordinates; whiteboard elements are one SVG component per action type. |

## Security and privacy

- Keys live only in server environment variables. `getEnv()` validates them at first use, and `/api/health` reports configuration without values.
- Narration tokens stop the TTS endpoint from being used as a free text-to-speech proxy.
- Bodies are size-capped, topics are stripped of control characters, and the topic is passed to the model as delimited data, not instructions.
- No accounts and no learner data on the server. Session restore uses the browser's own storage.
- CI runs gitleaks over the full history.
