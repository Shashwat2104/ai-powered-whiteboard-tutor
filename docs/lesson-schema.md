# Lesson schema

Source of truth: `src/lib/lesson/schema.ts` (Zod). The same schema is:

- sent to the model as its JSON output format;
- used to parse the reply;
- used as the API contract.

`src/lib/lesson/semantics.ts` adds the rules a schema cannot express.

## Shape

```ts
Lesson {
  id: uuid; createdAt: ISO datetime            // added by the server
  generatedBy: { provider, model, attempts }   // added by the server
  schemaVersion: "1.0"
  topic, objective, difficulty: "beginner" | "intermediate" | "advanced", scopeNote?
  segments: Segment[]          // 5–12, spoken in order
  scenes: Scene[]              // 2–8, group consecutive segments
  knowledgeChecks: Check[]     // 1–3 multiple-choice questions
  recap: { keyPoints: string[] }   // 2–5
}

Segment { id: "s1"…, phase, text /* narration with [[mN]] markers */, actions: VisualAction[] }
Scene   { id: "sc1"…, title, segmentIds, transition: "clear" | "keep" }
Check   { id: "q1"…, question, options (3–4, distinct), answerIndex, explanation, sceneRef? }
```

`phase` is one of `introduction`, `foundation`, `demonstration`, `application`, `recap`, in that order. At least one segment must be a demonstration.

## Timing: markers

- Narration is plain speech with markers such as `[[m3]]` placed immediately before the word that should trigger a visual.
- Every action has an `at`: a marker name, or `start`/`end` of its own segment.
- The voice service reports when each marker is spoken (ElevenLabs character alignment or Google SSML `<mark>` time points). `resolveTimeline()` converts that into absolute seconds.
- If a provider gives no time for a marker, it is estimated from the word position, and the timeline counts how many were estimated.

## Board actions (canvas 1600 × 900, origin top-left)

**Creating** (add an element; may be referenced later by `id`):

| Type | Key fields |
|---|---|
| `write` | `x, y, text, size (sm/md/lg/title), align?` |
| `shape` | `kind (rect/rounded/ellipse/diamond), x, y, w, h, label?` |
| `connect` | `from, to` (element id, array cell `arr[2]`, or a point), `head (end/both/none), style?, label?` |
| `array` | `x, y, items` (1–12 strings of up to 6 characters), `cellW?, showIndex?`; cells addressable as `id[i]` |
| `list` | `x, y, items` (1–6), `ordered?, size?` |
| `equation` | `x, y, latex` (rendered with KaTeX), `size?` |
| `annotate` | `target, text, side (top/bottom/left/right)` |

**Changing** (act on an existing element):

| Type | Key fields |
|---|---|
| `highlight` | `target, color?, forSec?` (0.5–10 s) |
| `dim` | `target, strike?` (fade, or cross out something eliminated) |
| `travel` | `along` (a `connect` id), `label?, reverse?` (a token moves along the arrow) |
| `erase` | `target` |

All actions take an optional `drawSec` (0.2 to 3 s; per-type defaults otherwise) and `color` from a fixed palette.

## Semantic rules (`validateLessonSemantics`)

| Kind | Codes | Effect |
|---|---|---|
| **Breaking**: would misfire or reference nothing | `MARK_SYNTAX`, `MARK_MISSING`, `MARK_UNUSED`, `MARK_DUPLICATE`, `REF_UNKNOWN`, `ID_DUPLICATE`, `OUT_OF_BOUNDS`, `SCENE_COVERAGE`, `ANSWER_INDEX`, `SCENE_REF`, `NARRATION_TOO_SHORT` (under 180 words) | Never served; the model is asked to repair. |
| **Cosmetic**: plays correctly, looks or paces a little off | `NARRATION_LENGTH` (outside 220–400 words), `SEGMENT_LENGTH` (outside 15–70), `OVERLAP` (>15 % of the smaller box), `TEXT_TOO_LONG` (board text >12 words or >80 characters), `PHASE_ORDER`, `NO_VISUALS` | Repaired while attempts remain; tolerated as a last resort. |

Before validation, positioned elements that poke past the board edge are moved back inside (`fitToBoard` in `src/lib/lesson/layout.ts`). Element sizes for the overlap and bounds checks are estimated from text length and font size.
