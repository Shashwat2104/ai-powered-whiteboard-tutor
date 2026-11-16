# AI-Powered Interactive Whiteboard Tutor

An educational platform that transforms any topic into a 2-minute interactive, synchronized whiteboard lesson. As a synthesized voice narrates step by step, an animated whiteboard draws diagrams, flowcharts, arrays, equations, and annotations in lockstep. Learners can pause, scrub, replay, read synchronized transcripts, and ask grounded follow-up questions with mini-whiteboard illustrations.

[![CI](https://github.com/Shashwat2104/ai-powered-whiteboard-tutor/actions/workflows/ci.yml/badge.svg)](https://github.com/Shashwat2104/ai-powered-whiteboard-tutor/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Live Demo

- **Production URL**: [https://ai-powered-whiteboard-tutor.vercel.app](https://ai-powered-whiteboard-tutor.vercel.app)
- **Repository**: [https://github.com/Shashwat2104/ai-powered-whiteboard-tutor](https://github.com/Shashwat2104/ai-powered-whiteboard-tutor)

---

## Key Features

1. **Deterministic Audio-Visual Synchronization**:
   - Single joined-WAV audio element acts as the single source of truth.
   - Board state is a pure mathematical projection: `boardStateAt(lesson, timeline, t)` guarantees **0 ms cumulative drift** across pauses, seeks, rewinds, and replays.
   - Continuous audio-visual lag $\le 250$ ms; seek redraw latency $\le 500$ ms.

2. **Multi-Provider Fallback Architecture**:
   - **LLM**: Anthropic Claude 3.7 Sonnet (Primary) $\rightarrow$ Google Gemini 2.5 Pro (Fallback).
   - **TTS**: ElevenLabs API with character alignment (Primary) $\rightarrow$ Google Cloud TTS with SSML marks (Fallback) $\rightarrow$ `VirtualClock` no-audio mode.

3. **Rich Whiteboard Action Vocabulary (11 Types)**:
   - Elements: `write`, `shape`, `connect`, `array`, `list`, `equation` (LaTeX/KaTeX), `annotate`.
   - Dynamic Modifiers: `highlight`, `dim` (strike-through), `travel` (token animation), `erase`.

4. **Pedagogical Structure**:
   - Five progressive phases: `introduction` $\rightarrow$ `foundation` $\rightarrow$ `demonstration` $\rightarrow$ `application` $\rightarrow$ `recap`.
   - Multi-scene transitions (`clear` / `keep`).
   - Integrated interactive multiple-choice knowledge checks with explanatory feedback.

5. **Contextual Follow-Up Q&A**:
   - Grounded conversational tutor answering questions strictly within the lesson's context.
   - Reusable `MiniBoard` component delivering targeted visual step-by-step illustrations.
   - Direct "Jump to scene" seek controls.

6. **Accessibility & Responsive Design (WCAG 2.1 AA)**:
   - 0 critical or serious Axe-core violations.
   - Full keyboard navigation with visible focus indicators.
   - Automatic `prefers-reduced-motion` detection (skips stroke animations, renders static frames).
   - Fully responsive layout down to 360 px viewport width.

7. **Session Persistence & Recovery**:
   - `sessionStorage` (`tutor:v1`) and IndexedDB (`tutor.audio`) preserve active lessons and positions across page reloads.
   - Comprehensive error recovery with retry countdowns and user-gesture autoplay overlays.

---

## Quickstart

### Prerequisites
- Node.js 20.x or higher
- pnpm 9.x or higher (`corepack enable && corepack prepare pnpm@latest --activate`)

### Installation & Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/Shashwat2104/ai-powered-whiteboard-tutor.git
   cd ai-powered-whiteboard-tutor
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` with your API keys (see [Environment Variables](#environment-variables)).

4. Start development server:
   ```bash
   pnpm dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Environment Variables

| Variable | Required | Description | Default / Example |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Recommended | API key for Anthropic Claude models (primary LLM). | `sk-ant-...` |
| `ANTHROPIC_MODEL` | Optional | Claude model identifier. | `claude-3-7-sonnet-20250219` |
| `ANTHROPIC_EFFORT_LESSON` | Optional | Reasoning effort for lesson generation (`low`, `medium`, `high`). | `low` |
| `GEMINI_API_KEY` | Recommended | API key for Google Gemini models (fallback LLM). | `AIzaSy...` |
| `GEMINI_MODEL` | Optional | Gemini model identifier. | `gemini-2.5-pro` |
| `ELEVENLABS_API_KEY` | Recommended | API key for ElevenLabs speech synthesis (primary TTS). | `eleven-...` |
| `ELEVENLABS_VOICE_ID` | Optional | Default ElevenLabs voice ID. | `21m00Tcm4TlvDq8ikWAM` |
| `GOOGLE_TTS_API_KEY` | Optional | Google Cloud TTS API key (fallback TTS). | `AIzaSy...` |
| `NARRATION_TOKEN_SECRET` | **Required** | Secret key (min 32 chars) for HMAC narration authorization tokens. | Generated string |
| `RATE_LIMIT_LESSON_PER_10MIN` | Optional | Max lesson requests per IP per 10 minutes. | `5` |
| `RATE_LIMIT_NARRATION_PER_10MIN` | Optional | Max narration requests per IP per 10 minutes. | `60` |
| `RATE_LIMIT_FOLLOWUP_PER_10MIN` | Optional | Max follow-up questions per IP per 10 minutes. | `30` |
| `DAILY_LESSON_CAP` | Optional | Global server daily lesson generation ceiling. | `100` |

---

## Verification & Testing

The project maintains a rigorous, multi-tiered test suite:

```bash
# Run complete verification (TypeScript typecheck + ESLint + Vitest)
pnpm verify

# Run all 302 unit, DOM, and property tests
pnpm test

# Run tests with V8 coverage report
pnpm test:coverage

# Run mock end-to-end browser suite (16 tests, headless Chrome)
pnpm e2e:mock

# Run automated pedagogical evaluation on 12 topics
pnpm eval:lessons

# Scan codebase for leaked credentials
pnpm secrets:scan
```

---

## Architecture Highlights

- **Pure Mathematical Projection**: `boardStateAt(lesson, timeline, t)` guarantees zero cumulative drift across pauses, seeks, and speed changes.
- **Single Audio Clock**: `<audio>.currentTime` acts as the single source of truth for the animation loop.
- **Fault-Tolerant Fallback**: Anthropic Claude 3.7 Sonnet falls back to Google Gemini 2.5 Pro; ElevenLabs falls back to Google Cloud TTS and VirtualClock.
- **Session Recovery**: Lessons and positions automatically persist to `sessionStorage` and `IndexedDB`.

---

## Deployment

The application is optimized for deployment on Vercel:

1. Push code to your GitHub repository.
2. Import the project into the [Vercel Dashboard](https://vercel.com).
3. Add the environment variables from `.env.example` in Project Settings $\rightarrow$ Environment Variables.
4. Set serverless function timeout: `maxDuration = 120` is configured in `src/app/api/lesson/route.ts`.
5. Deploy.

---

## Known Limitations

1. **Per-Instance Rate Limiting**: The sliding-window rate limiter runs in memory per serverless container instance. In multi-region deployments, global quotas rely on the upstream provider spend caps and `DAILY_LESSON_CAP`.
2. **Firefox Timer Precision**: With `privacy.resistFingerprinting` enabled, Firefox coarsens `performance.now()` and `audio.currentTime` to 100 ms increments. The deterministic `boardStateAt` function remains accurate, but continuous sync jitter may show higher measured variance.
3. **No-Audio Mode Timing**: In offline or total TTS failure scenarios, the `VirtualClock` uses word-proportional heuristics (2.5 words/second) rather than speech acoustic models.
4. **Language Support**: Version 1.0 curriculum generation and speech alignment are optimized exclusively for English.
