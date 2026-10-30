# Voice 2.0 — Audit Findings Verification

Verifying master-prompt Appendix A findings against actual code before building on top of them.
Findings are re-checked incrementally, in the WP that touches that area — this file is updated as we go, not all at once.

## Section A — audio session (`voice.ts`) — verified 2026-10-30

| ID | Sev | Status | Note |
|---|---|---|---|
| A-01 | S1 | **Confirmed** | `onerror`: `no-speech`/`aborted` → `set({ state: 'idle' })` with no distinguishing UX, silently drops the attempt. |
| A-02 | S1 | **Confirmed** | `r.maxAlternatives = 1` — only the top ASR hypothesis is ever used, no n-best rescoring possible yet. |
| A-03 | S2 | **Confirmed** | Silence timers are hardcoded: `final && !interim ? 900 : 2200` (ms), plus the 7000ms no-speech timeout. No adaptive endpointing. |
| A-04 | S1 | Carried forward | Cross-browser STT gaps (Firefox, iOS PWA) — needs device testing in WP2/WP7, not verifiable from source alone. |
| A-05 | S2 | **Confirmed** | `setTimeout(() => { ... startVoice(); }, 420)` in `openAssistant()` — fixed delay before auto-starting mic after panel opens. |
| A-06 | S2 | Carried forward | Blocked-mic recovery UX — to verify in WP2.1/WP6.3. |
| A-07 | S3 | Carried forward | Hold-to-talk tooltip/i18n — cosmetic, deferred to WP6. |

## Section B — understanding (`nlu.ts`) — verified 2026-10-30 (WP1.3)

| ID | Sev | Status | Note |
|---|---|---|---|
| B-01 | S1 | **Confirmed** | `TASK_V` (taskAdd trigger regex) includes bare everyday words — `нужно`, `надо`, `необходимо`, `должен`, `должна` — that fire a task creation on their own with no other signal. |
| B-02 | S1 | **Confirmed** | `ничего` sits in the *neutral* mood bucket (`MOOD` table, group index 2: `'нормальн|норм|средн|ничего|спокойн|...'`). "Я устал и ничего не хочу" logs mood 3/5 — the worst possible misread for someone in a bad state. |
| B-03 | S1 | **Confirmed** | `PAGES` nav table matches on the bare stem `отчет` → `/analytics`. "Закончил отчёт" (finished a report) opens Analytics instead of marking anything done. |
| B-04 | S2 | **Confirmed** | Focus-minutes regex is `/(\d{1,3})\s*(минут\|мин\|час)?/` — requires a literal digit. "Начни фокус на час" ("start focus for an hour") has no digit, so `minutes` comes back `null` and silently falls back to the default length instead of 60. |
| B-05 | S2 | Carried forward | Time/date phrasing gaps ("в половине пятого", "через две недели", a bare day-of-month after a verb) — real work for WP3 (`nlp/dates.ts` rewrite), not a quick fix inside the current regex pile. |
| B-06 | S2 | **Confirmed** | `understand()` is a long if/else chain — first matching rule wins, no scoring between candidates. This is *why* WP1.1's `decide()` had to be risk-only (no confidence signal exists yet to route on) — direct dependency, not just a loose finding. |
| B-07 | S2 | Carried forward | "Хочу чтобы ты напомнил про тренировку" misreads as `done` — needs a `doneVerb()` test case to confirm precisely; deferred to WP3. |
| B-08 | S2 | Carried forward | Multi-clause phrases ("отметь X и поставь Y") sometimes collapse into a question instead of two intents — `splitClauses()` behavior, WP3. |
| B-09 | S2 | Carried forward | English coverage is much thinner than Russian (no "create a habit reading 20 minutes", no "i smoked a cigarette") — WP3.3. |
| B-10 | S3 | Carried forward | `nominative()`/`stem()` are crude suffix-stripping, not real morphology — breaks on less common cases. WP3/WP5 territory. |
| B-11 | S3 | **Confirmed** | `app/src/app/CommandPalette.tsx:34` has its own `commands(q, ...)` parser, completely separate from `nlu.ts`'s `understand()`. Two independent, diverging command grammars. |
| B-12 | S2 | **Confirmed** | No "off-topic / advice / small talk" class exists — the only non-command fallback is the weather/news/joke trigger list in `nlu.ts` (returns `{ kind: 'unknown', text: 'offtopic' }`). Any health/motivation/"why" question either becomes a misfired command or "didn't understand". |

## Section C — execution (`run.ts`) — verified 2026-10-30 (WP1.3)

| ID | Sev | Status | Note |
|---|---|---|---|
| C-01 | S1 | **Partially fixed by WP1.1** | Fuzzy task match (`SURE = 0.62`) used to delete on a single pass with no confirmation. Since WP1.1, `taskDelete` is risk `R3` → `decide()` now always routes it through "Точно — «...»?" before `runAll()` executes. Residual gap: the confirm prompt echoes the *raw spoken phrase*, not the specific task title the `0.62` fuzzy match actually picked — a wrong match still isn't visible before confirming. Showing the matched title in the prompt is a good WP5/exec follow-up. |
| C-02 | S2 | **Confirmed** | `const history: { label, undo }[] = []` (module-level, `run.ts`) — undo stack lives in memory only, lost on reload. No persisted "what I did by voice" journal yet (that's `journal.ts`, WP1.5). |
| C-03 | S2 | **Confirmed** | `runAll()` joins multi-intent replies with `.join('. ')` and speaks the whole block as one utterance — three actions become one long monologue instead of being said back incrementally. |
| C-04 | S2 | **Confirmed** | `case 'chat': { const name = ''; ... }` — greeting is never personalized even though the profile has `first_name`. Dead placeholder, trivial fix, deferred to WP5 (chat/system intents) to avoid touching `run.ts` piecemeal outside its WP. |
| C-05 | S2 | **Confirmed** | No slot-filling for missing required data: "Добавь встречу с врачом" creates the event for today with no time and never asks "во сколько?". Different from C-01/D-01 (which were about *confirming before running*) — this is about *asking for missing info*, which needs the dialog manager (WP4). |
| C-06 | S2 | Carried forward | Time-conflict check informs but doesn't offer an alternative slot. WP5 (`exec/calendar.ts`). |
| C-07 | S3 | **Confirmed** | Large coverage gap, exactly as filed: no habit edit/delete/archive, no goal deadline/completion edit, no quit management (`addQuit`/`archiveQuit` exist in `state/actions.ts` but aren't wired to any intent), no diary (`saveDiary`), no oath (`saveOath`), no settings changes, no "how many times did I read this week" style stats questions. This *is* the WP5 backlog (243 items) — all the underlying actions already exist in `state/actions.ts`, just not reachable by voice yet. |

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
