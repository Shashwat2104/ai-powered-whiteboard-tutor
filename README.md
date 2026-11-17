# AI-Powered Interactive Whiteboard Tutor

Type any topic and get a two-minute lesson taught the way a good tutor teaches at a whiteboard: a voice explains the idea while the board draws diagrams, arrays, arrows, equations and highlights at the exact moment each one is mentioned. Pause, scrub, replay, read along, check your understanding, and ask follow-up questions that are answered in the context of the lesson you just watched.

[![CI](https://github.com/Shashwat2104/ai-powered-whiteboard-tutor/actions/workflows/ci.yml/badge.svg)](https://github.com/Shashwat2104/ai-powered-whiteboard-tutor/actions)

- **Live demo:** [https://ai-whiteboard-tutor-pi.vercel.app/](https://ai-whiteboard-tutor-pi.vercel.app/) (no sign-in needed)
- **Repository:** [https://github.com/Shashwat2104/ai-powered-whiteboard-tutor](https://github.com/Shashwat2104/ai-powered-whiteboard-tutor)

<video src="https://github.com/Shashwat2104/ai-powered-whiteboard-tutor/raw/main/assets/pre.mp4" controls width="100%"></video>

If the player does not load, [open the demo video](assets/pre.mp4).

---

## The learner and the problem

**Who it is for.** Self-directed learners (senior school, early university, career switchers) who meet a concept they do not yet understand, such as binary search, Newton's second law, or how HTTPS works, and want a fast, visual first intuition before reading further.

**The problem.** The two easy options both fall short for a first encounter with an idea:

- **Chatbot answers** arrive as paragraphs. Many concepts (an array being halved, a request travelling to a server, an equation being built up) are understood by *watching them happen*, which text cannot show.
- **Videos** show things happening, but they are fixed: they are not about your exact question, you cannot ask them anything, and finding a good one takes longer than the two minutes you wanted to spend.

**The idea.** Generate the lesson *and* its visual demonstration together, for the learner's own topic and level, and keep voice and board locked to one clock so every visual appears while it is being explained. Then let the learner stay in control (pause, seek, replay), test themselves (a short knowledge check) and ask questions grounded in what they just saw.

**Why this interaction.** For a first intuition, a short guided demonstration beats both a wall of text and an open-ended canvas: the learner does not yet know what to draw or ask. Control and follow-up questions keep it from becoming a passive video.

## How to review it (about 5 minutes)

1. Open the [live demo](https://ai-whiteboard-tutor-pi.vercel.app/). Enter a topic of your choice (for example *How binary search works*, *The water cycle* or *Compound interest*), pick a level and press **Teach me**.
2. Watch the progress steps: *Writing lesson* (live LLM call, usually 5 to 30 s) and *Recording narration* (live text-to-speech, one request per segment).
3. Press **Play**. Watch the board draw each element at the moment the voice mentions it. The caption bar and the transcript highlight the current sentence. The line under the captions says which model wrote the lesson and which voice is reading it.
4. Try the controls: **Pause/Resume** (Space), **±10 s** buttons (or ±5 s with the arrow keys), drag the **timeline** (ticks mark each scene), click any **transcript** sentence to jump there, **Restart** (Home), and **Replay** after the lesson ends. The board always matches the audio position.
5. Answer the **knowledge check**; each question can take you back to the scene it is about.
6. Ask a **follow-up question** in *Ask the Tutor*. Answers use the lesson's transcript as context, may include a small illustration, and can offer a *Jump to scene* link.
7. Reload the page mid-lesson: the lesson, the position and the conversation are restored.

## What is live and what is not

| Part | Behaviour in the live demo |
|---|---|
| Lesson content (narration, board actions, scenes, quiz) | **Live AI.** Generated per request by an LLM with JSON-schema-constrained output, then checked by a semantic validator (see *Architecture*). Nothing is pre-written. |
| Follow-up answers and illustrations | **Live AI**, with the lesson transcript, scenes and recap in the prompt. |
| Narration audio | **Live text-to-speech** (ElevenLabs or Google Cloud TTS, whichever is configured and working). |
| No-audio mode | If every voice provider fails, the lesson still plays on a **virtual clock** with timing *estimated* from word count (2.5 words/s). The app says so on screen. |
| Fake providers | `TUTOR_TEST_PROVIDERS=1` swaps in a fixed sample lesson and canned answers **for automated tests only**. The server refuses to start with this flag on a deployment, and the UI labels such a lesson "Simulated test lesson". |

The model that wrote each lesson and the voice reading it are shown under the captions, and returned in the API response (`lesson.generatedBy`).

## Features

- **One clock for voice and board.** All narration segments are joined into one WAV played by a single `<audio>` element. The board is a pure function of the audio position, `boardStateAt(lesson, timeline, t)`, so pausing, seeking, restarting or replaying can never leave the board out of step. There is no accumulated drift because nothing accumulates.
- **Precise visual timing.** The model places markers such as `[[m3]]` before the word that should trigger a visual. Word-level timestamps from the TTS provider (ElevenLabs character alignment or Google SSML marks) turn each marker into an exact time.
- **11 whiteboard actions.** Creating: `write`, `shape`, `connect` (arrows), `array`, `list`, `equation` (KaTeX), `annotate`. Changing: `highlight`, `dim`/strike-through, `travel` (a token moving along an arrow) and `erase`. Elements draw progressively, and scenes either clear the board or build on it.
- **Teaching structure.** Introduction, foundation, demonstration, application and recap phases, a concrete worked example on the board, one to three multiple-choice checks, and three difficulty levels.
- **Follow-up tutor** grounded in the lesson, with optional mini-whiteboard illustrations and scene jumps.
- **Reliability.** Two LLM providers with automatic fallback, a retry for transient provider errors, schema validation plus up to two repair rounds, deterministic clean-up of small layout slips, and two TTS providers with whole-lesson fallback (so the voice never changes mid-lesson).
- **Accessibility.** Full keyboard control, visible focus, captions and transcript, `prefers-reduced-motion` support, responsive down to 360 px. Axe reports no critical or serious violations in the E2E suite.
- **Session restore.** Lesson, position and conversation survive a reload (`sessionStorage`, plus audio in IndexedDB).

## Technology stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript | One deployable unit for UI and API routes; server-only modules keep keys off the client. |
| Styling | Tailwind CSS 4, Radix slider and toggle group, lucide icons | Accessible primitives for the timeline and level picker. |
| Whiteboard | Hand-written SVG components, KaTeX for equations | Full control over progressive drawing and timing; no canvas library needed for this vocabulary. |
| LLM | Google Gemini (`@google/genai`) and Anthropic Claude (`@anthropic-ai/sdk`) | Both support schema-constrained JSON; order and models are configurable. |
| TTS | ElevenLabs (with character alignment), Google Cloud TTS (SSML marks) | Both return timing data, which the sync design needs. |
| Validation | Zod 4 | One schema drives the LLM output format, the API contract and runtime checks. |
| Tests | Vitest (unit, DOM, property tests with fast-check, MSW for HTTP), Playwright + axe-core | See *Testing*. |
| Hosting | Vercel | Serverless API routes with per-route time limits. |

## Architecture

```
Browser                                        Server (Next.js route handlers)
───────                                        ───────────────────────────────
TopicForm ── POST /api/lesson ───────────────▶ rate limit + daily cap
                                               generateLesson()
                                                 └ router: provider 1 → repair ×2 → provider 2
                                                   normalize (fit to board) → semantic validation
                                               sign one narration token per segment (HMAC)
          ◀── lesson + tokens + voice order ──
narrateLesson() ─ POST /api/narration ×N ────▶ verify token → TTS provider → PCM + marks
buildPlayable(): join WAV, resolve marker times → timeline
<audio> clock ─▶ PlaybackController ─▶ boardStateAt(t) ─▶ SVG whiteboard, captions, transcript
FollowUpPanel ── POST /api/followup ─────────▶ answerFollowup(lesson context, history, question)
```

- `src/app/api/*`: thin route handlers (input validation, rate limits, error envelope).
- `src/server/*`: server-only code (LLM and TTS adapters, prompts, routing, security).
- `src/lib/*`: shared pure logic (lesson schema and validator, timeline, board state, playback state machine).
- `src/components/*`: React UI.

More detail: [docs/architecture.md](docs/architecture.md), [docs/lesson-schema.md](docs/lesson-schema.md), [docs/sync.md](docs/sync.md) and [docs/report.md](docs/report.md) (decisions and trade-offs).

## Run it locally

**Prerequisites:** Node.js 24 or newer (see `.nvmrc`), pnpm 10 (`corepack enable`), and at least one LLM key (Gemini or Anthropic). A TTS key is recommended; without one, lessons play in no-audio mode.

```bash
git clone https://github.com/Shashwat2104/ai-powered-whiteboard-tutor.git
cd ai-powered-whiteboard-tutor
pnpm install
cp .env.example .env.local      # then fill in real values (see below)
pnpm dev                        # http://localhost:3000
```

No keys at hand? Run the whole app on the fake providers (fixed sample lesson, canned answers):

```bash
TUTOR_TEST_PROVIDERS=1 NARRATION_TOKEN_SECRET=local-dev-secret-local-dev-secret-0 pnpm dev
```

## Environment variables

Use placeholders only; never commit real values. `.env*` files are git-ignored except `.env.example`. Values that still look like the placeholders in `.env.example` are treated as unset.

| Variable | Required | Purpose | Default |
|---|---|---|---|
| `NARRATION_TOKEN_SECRET` | **Yes** | HMAC secret for narration tokens, at least 32 bytes. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` | none |
| `GEMINI_API_KEY` | One LLM key required | Google Gemini key. | none |
| `GEMINI_MODEL` | No | Gemini model id. | `gemini-flash-latest` |
| `ANTHROPIC_API_KEY` | One LLM key required | Anthropic key. | none |
| `ANTHROPIC_MODEL` | No | Claude model id. | `claude-opus-5-5` |
| `ANTHROPIC_EFFORT_LESSON` / `ANTHROPIC_EFFORT_FOLLOWUP` | No | Effort for lessons / follow-ups (`low`, `medium`, `high`). Also sets Gemini's thinking level. | `medium` / `low` |
| `LLM_PROVIDER_ORDER` | No | Order to try LLM providers. | `anthropic,gemini` |
| `ELEVENLABS_API_KEY` | Recommended | ElevenLabs key with text-to-speech permission. | none |
| `ELEVENLABS_VOICE_ID` / `ELEVENLABS_MODEL_ID` | No | Voice and model. | `JBFqnCBsd6RMkjVDRZzb` / `eleven_flash_v2_5` |
| `ELEVENLABS_CONCURRENCY` | No | Parallel ElevenLabs requests (free plan allows 2). | `2` |
| `GOOGLE_TTS_API_KEY` | Optional | Google Cloud TTS key (restrict it to the TTS API). | none |
| `GOOGLE_TTS_CREDENTIALS_B64` | Optional | Service-account JSON, base64 on one line; used instead of the API key when set. | none |
| `GOOGLE_TTS_VOICE` | No | Google voice name. | `en-US-Neural2-D` |
| `TTS_PROVIDER_ORDER` | No | Order to try voices. | `elevenlabs,google` |
| `RATE_LIMIT_LESSON_PER_10MIN` / `_NARRATION_` / `_FOLLOWUP_` | No | Per-IP limits per 10 minutes. | `5` / `60` / `30` |
| `DAILY_LESSON_CAP` | No | Lessons per server instance per day. | `200` |
| `TUTOR_TEST_PROVIDERS` | Tests only | `1` uses fake providers. Refused on deployments. | unset |

**Deploying to Vercel:** import the repository, add the variables above under *Project Settings → Environment Variables* (Production), and deploy. `GET /api/health` reports which providers are configured (never the keys) and returns 503 if the configuration is invalid.

## Testing

```bash
pnpm verify          # typecheck + lint + unit/integration/DOM tests
pnpm test:coverage   # same tests with V8 coverage (80% line and branch thresholds on src/lib and src/server)
pnpm e2e:mock        # Playwright: full user journeys in Chromium against fake providers
pnpm test:live       # optional: real provider checks (needs real keys; costs API credits)
pnpm eval:lessons    # optional: generate lessons for 12 topics with real providers and score them
```

The E2E suite covers the full lesson flow, every playback control including replay after the end, follow-up chat, keyboard-only use, axe accessibility, a 360 px viewport, reduced motion, the failure paths (invalid topic, network loss, rate limit, generation failure, all TTS failing, autoplay blocked, a new topic mid-generation, reload mid-lesson) and a sync probe that asserts board/audio lag of at most 250 ms. CI runs `pnpm verify`, coverage and a gitleaks secret scan on every push.

## Known limitations

1. **Lesson quality depends on the model.** Smaller, faster models sometimes overlap elements, or make a lesson a little shorter or longer than two minutes. The validator asks the model to fix every problem (up to two repair rounds). If only cosmetic problems remain, the lesson is still served rather than failing. Broken references or missing markers are never served.
2. **First-load latency.** Writing a lesson takes about 5 to 30 s and recording narration another few seconds; progress is shown throughout.
3. **Rate limits are per server instance** (in memory). Across many serverless instances the real ceilings are the provider spend caps and `DAILY_LESSON_CAP`.
4. **No-audio timing is estimated** (2.5 words/s) when no voice provider works.
5. **English only** for generation and speech alignment.
6. **Firefox with `privacy.resistFingerprinting`** coarsens media timestamps, which can add visible jitter to animations (the board state itself is still correct).
