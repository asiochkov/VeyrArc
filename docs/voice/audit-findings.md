# Voice 2.0 — Audit Findings Verification

Verifying master-prompt Appendix A findings against actual code before building on top of them.
Findings are re-checked incrementally, in the WP that touches that area — this file is updated as we go, not all at once.

## Section A — audio session (`voice.ts`) — verified 2026-10-30

| ID | Sev | Status | Note |
|---|---|---|---|
| A-01 | S1 | **Fixed (WP2.1)** | `no-speech` now shows feedback ("не расслышал, нажмите и повторите") instead of silently sharing the `aborted` (user-cancelled) branch. |
| A-02 | S1 | **Fixed (WP2.2)** | `r.maxAlternatives` raised `1→5`; `pickBestAlt()` tries each n-best transcript through `understand()` and uses the first one that parses, instead of blindly trusting hypothesis #0. (Still no phonetic-lexicon rescoring — that's WP2.4/WP3's `nlp/rescore.ts`.) |
| A-03 | S2 | **Confirmed** | Silence timers are hardcoded: `final && !interim ? 900 : 2200` (ms), plus the 7000ms no-speech timeout. No adaptive endpointing. |
| A-04 | S1 | Carried forward | Cross-browser STT gaps (Firefox, iOS PWA) — needs device testing in WP2/WP7, not verifiable from source alone. |
| A-05 | S2 | **Confirmed** | `setTimeout(() => { ... startVoice(); }, 420)` in `openAssistant()` — fixed delay before auto-starting mic after panel opens. |
| A-06 | S2 | Carried forward | Blocked-mic recovery UX — to verify in WP2.1/WP6.3. |
| A-07 | S3 | Carried forward | Hold-to-talk tooltip/i18n — cosmetic, deferred to WP6. |

## Section B — understanding (`nlu.ts`) — verified 2026-10-30 (WP1.3)

| ID | Sev | Status | Note |
|---|---|---|---|
| B-01 | S1 | **Confirmed** | `TASK_V` (taskAdd trigger regex) includes bare everyday words — `нужно`, `надо`, `необходимо`, `должен`, `должна` — that fire a task creation on their own with no other signal. |
| B-02 | S1 | **Fixed** | `ничего` in the neutral mood bucket now has a negative lookahead `(?!\s+(?:не\|хорошего\|особенного))` — "я устал и ничего не хочу" now correctly reads the *bad*-mood word "устал" (level 1) instead of being swallowed by the neutral "ничего" match. A bare "ничего" reply (meaning "I'm fine") and "настроение ничего" (explicit context) are unaffected. |
| B-03 | S1 | **Fixed** | The nav-by-word-count shortcut (≤2 words, no explicit "open/show" verb required) now bails if the phrase starts with a done-verb (`DONE_V`) — "закончил отчёт" is marked done, not navigated to Analytics. An explicit `OPEN` verb ("покажи отчёт", "открой отчёт") still navigates, unaffected. Caught my own bug while fixing this: first pass used `\b` for the boundary check, which is ASCII-only in JS and silently fails on Cyrillic (the exact pitfall `nlu.ts`'s own `L`/`R` helpers exist to avoid) — switched to `R`. |
| B-04 | S2 | **Fixed** | Focus-minutes regex still requires a digit, but now falls back to 60 when the text contains a bare "час" with no number — "начни фокус на час" returns 60 minutes instead of `null`. The other focus-start pattern ("хочу поработать час") already had this fallback; only this one didn't. |
| B-05 | S2 | **Partially fixed (WP3.1)** | "в половине пятого", "без пятнадцати/четверти/двадцати пяти шесть", "через две недели", "в конце месяца" now work. Still open: a bare day-of-month after a verb with no day-trigger ("записаться к врачу на пятое ноября"), and "купить хлеб" becoming a task with zero trigger verb — both are real intent-design work, not quick regex additions. |
| B-06 | S2 | **Confirmed** | `understand()` is a long if/else chain — first matching rule wins, no scoring between candidates. This is *why* WP1.1's `decide()` had to be risk-only (no confidence signal exists yet to route on) — direct dependency, not just a loose finding. |
| B-07 | S2 | **Fixed** | Root cause: `doneVerb()`'s generic `PAST` regex matches *any* past-tense verb suffix (`-ал/-ил/-ел/…`) as "done" unless explicitly excluded via `NOT_DONE`. "Напомнил" wasn't excluded, so "хочу чтобы ты напомнил про тренировку" (a request about the future) misread as completing a habit called "про тренировку напомнил". Added "напомнил/напомнила/напомнили" to `NOT_DONE` — now falls to `guess` (asks again) instead of silently marking something done. Doesn't add real reminder-setting (that's `settingsReminder`, a different feature) — just stops the false positive. |
| B-08 | S2 | **Partially fixed** | Root cause #1: the generic question detector treated «что» in «отметь ЧТО я…» as the interrogative "what" instead of the conjunction "that" — added a `reportingThat` guard. Root cause #2: the done/undone-only clause-split-by-«и» didn't apply when the whole phrase read as `mood` — extended it. Together: "отметь что я позанимался и поставь настроение хорошее" now splits into two real intents instead of one wrong `ask`. **Residual gap**: the first intent's query comes out as `отметь` (the verb) rather than a habit name, because "позанимался" is simultaneously the trigger verb *and* the only content word in this phrasing — `run.ts:555-559`'s object-cleaning strips it as a DONE_V word, leaving nothing, so it falls back to the verb. That's a separate, deeper ambiguity (bare generic-verb-with-no-named-habit) not fixed here. |
| B-09 | S2 | Carried forward | English coverage is much thinner than Russian (no "create a habit reading 20 minutes", no "i smoked a cigarette") — WP3.3. |
| B-10 | S3 | Carried forward | `nominative()`/`stem()` are crude suffix-stripping, not real morphology — breaks on less common cases. WP3/WP5 territory. |
| B-11 | S3 | **Confirmed** | `app/src/app/CommandPalette.tsx:34` has its own `commands(q, ...)` parser, completely separate from `nlu.ts`'s `understand()`. Two independent, diverging command grammars. |
| B-12 | S2 | **Partially fixed** | Added a conservative health/medical keyword detector (боли, симптомы, лекарства, диеты, "как похудеть", …) → `{ kind: 'unknown', text: 'offtopic-health' }`, with a gentle "я не могу давать медицинских советов — лучше спросить врача" reply instead of a flat "didn't understand" (§6.7.4, §6.18). Motivation/"why" questions and the general lack of a proper chat/small-talk class are still open — this covers specifically the named medical-advice example, not the whole finding. |

## Section C — execution (`run.ts`) — verified 2026-10-30 (WP1.3)

| ID | Sev | Status | Note |
|---|---|---|---|
| C-01 | S1 | **Partially fixed by WP1.1** | Fuzzy task match (`SURE = 0.62`) used to delete on a single pass with no confirmation. Since WP1.1, `taskDelete` is risk `R3` → `decide()` now always routes it through "Точно — «...»?" before `runAll()` executes. Residual gap: the confirm prompt echoes the *raw spoken phrase*, not the specific task title the `0.62` fuzzy match actually picked — a wrong match still isn't visible before confirming. Showing the matched title in the prompt is a good WP5/exec follow-up. |
| C-02 | S2 | **Confirmed** | `const history: { label, undo }[] = []` (module-level, `run.ts`) — undo stack lives in memory only, lost on reload. No persisted "what I did by voice" journal yet (that's `journal.ts`, WP1.5). |
| C-03 | S2 | **Fixed** | `engine.ts`'s `speak()` now splits the reply into sentences (`/(?<=[.!?])\s+/`, per §6.11.2) and speaks each as its own chained utterance via `onend`, instead of one `SpeechSynthesisUtterance` for the whole `.join('. ')`-ed block. A natural pause now falls between sentences of a multi-intent reply. `runAll()` still joins the *displayed* text the same way — only the spoken delivery changed. |
| C-04 | S2 | **Fixed** | Greeting now uses `profile.nickname \|\| profile.first_name` when present ("Привет, Арсений!"), falls back to the old unpersonalized greeting when neither is set (anonymous/incomplete profile). |
| C-05 | S2 | **Fixed** | Added a minimal ask-slot mechanism (`Reply.ask`, `shell.ts`'s `pendingSlot`, handled in `engine.ts`'s `handle()`): an appointment-shaped task with no time ("встреча", "созвон", "звонок", …) now asks "Во сколько?" and the next utterance is parsed as the time, instead of silently saving with none. Scoped to exactly this one slot — a general-purpose dialog manager (multiple slot types, multi-turn) is still WP4's job, not retrofitted here. Plain to-dos ("купить хлеб") are untouched. |
| C-06 | S2 | **Fixed** | `taskAdd` now computes the next free slot after the conflicting event (`nextFreeSlot()`) and offers it as a tappable/speakable choice ("Поставить на 16:00?") instead of only reporting the overlap. A minimal local version, not the full `exec/calendar.ts` module (`freeSlots`/`conflicts`/`freest` for arbitrary ranges) planned for WP5.7. |
| C-07 | S3 | **Closed** | Every example named in the original finding is now reachable by voice: habit archive/restore/delete, goal deadline/completion, quit add/archive, diary, oath, theme/reminder settings, per-habit streak. (The finding's examples, not the full 243-item WP5 catalogue — that's still mostly open.) |

## Sections D–K

Not yet re-verified — confirmed at the start of the WP that implements them (per master prompt §4.2 step 1):
- D (dialog) → WP4
- E (TTS) → WP6.1
- F (UX/CSS) → WP6
- G (onboarding) → WP6.4
- H (perf/compat) → **H12 fixed in WP0.5** (voice engine now lazy-split, see `baseline.md`); the rest (cross-browser, device perf) → WP7
- I (push) → WP6.8
- J (legal/limits) → WP7.1
- K (process/tooling) → mostly closed in WP0 (K-01 telemetry pending WP0.3, K-02 tooling done, K-03/K-04 remain)
