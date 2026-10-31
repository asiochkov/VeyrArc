# Voice 2.0 — Progress

Branch: `work/dev` (based on `veyrarc-app`). Workflow: commit per WP, confirm with user before pushing/merging.

## WP0 — Foundation

- [x] **WP0.1** — Tooling audit, baseline, docs/voice scaffold.
  - `docs/voice/baseline.md` — bundle size + voice module size before changes.
  - `docs/voice/audit-findings.md` — Appendix A findings re-verified against current `voice.ts` (all confirmed, still accurate).
  - `tsx` added as real devDependency (was only used via transient `npx`).
  - `tools/unit/run-all.ts` — generic runner for `tools/unit/*.test.ts` (currently just `voice-intents.test.ts`, 59/59 passing).
  - `npm run test:voice` wired in `app/package.json`.
  - `typecheck` and `build` confirmed clean before and after.
- [ ] WP0.2 — Golden dataset (~150 phrases) + `run-golden.ts` + `perturb.ts`. *(not started — needs `nlp/decide.ts` risk/confidence plumbing from WP1 to be meaningful; current `test:voice` only runs the existing unit intents, golden harness will be layered in once WP1.1 lands)*
- [ ] WP0.3 — Telemetry (`voice_open`, `voice_intent`, etc.)
- [x] **WP0.4** — `app/src/voice/store.ts` (localStorage get/set/remove), `flags.ts` (`?flags=lab` + persisted overrides), `prefs.ts` (muted/sound/rate/tone/aliases/macros/chains/rituals/templates/care/shareText, zustand-backed, persisted). Not yet wired into `engine.ts`/UI — that happens in WP6 (VoiceSettings) and when fixing finding E-02 (mute not persisted).
- [x] **WP0.5** — Split `voice.ts` into `shell.ts` (always-loaded: `useVoice`, `useAssistant`, `openAssistant`/`closeAssistant`, `voiceSupported` — zero heavy deps) and `engine.ts` (recognition, NLU wiring, TTS, `startVoice`/`stopVoice`/`handle`/`choose` — loaded via `import('./engine')` only once the assistant opens). `AssistantPanel` is now `React.lazy`-loaded from `AppShell.tsx`, only mounted while `open`. `run.ts`'s `useVoice` import repointed to `shell.ts`. Old `voice.ts` deleted.
  - **Result (confirms + fixes finding H12):** main chunk 282.24 kB → **214.59 kB raw** (88.41 → **65.03 kB gzip**, **−23.4 kB gzip**). New `engine-*.js` chunk: 62.52 kB raw / **22.08 kB gzip** (well under the 150 kB gzip ceiling from §6.19.3). `AssistantPanel-*.js` + `.css`: ~3.6 kB gzip combined.
  - `typecheck`, `build`, `test:voice` (59/59) all clean after the refactor.

## WP1 — Risk and decisions

- [x] **WP1.1** — `app/src/voice/nlp/risk.ts` (R0–R4 per intent `kind`, mapped against the current 20-kind `Intent` union — not the full §6.6 domain table, which only exists once WP3/WP5 add those intents) and `app/src/voice/nlp/decide.ts` (risk-only routing: R2+ → `confirm`, R0/R1 → `execute`). Wired into `engine.ts`'s `handle()`: a risky command now shows "Точно — «...»?" with Yes/Cancel chips instead of running immediately (fixes findings C-05, D-01).
  - No confidence score exists on the current rule-based `understand()` output, so decision routing is risk-only for now (not the confidence-weighted §6.7.2–6.7.4 formula) — that lands once WP1.2/WP3 add a classifier.
  - `nlp/params.ts` skipped for this pass — nothing to tune yet with no confidence score; will land with the classifier.
  - New `tools/unit/voice-risk.test.ts` (12 checks, all passing) covers the risk table and the confirm/execute split.
  - Bundle impact: zero on the main chunk — `risk.ts`/`decide.ts` are only reachable via the lazy `engine.ts` chunk.
- [ ] WP1.2 — classifier (confidence scoring, oos detection)
- [x] **WP1.3** — Sections B (`nlu.ts`) and C (`run.ts`) re-verified against current code and line numbers (see `audit-findings.md`). 8/12 B-findings and 6/7 C-findings confirmed exactly as filed; the rest carried forward to the WP that actually touches that code (no speculative fixes outside the current WP's scope). Notably: **C-01 is now partially fixed by WP1.1** (taskDelete can no longer run without confirmation — residual gap: the confirm prompt doesn't show *which* task the fuzzy match picked).
- [ ] WP1.4 — `reply.ts`, tone (§6.13.6)
- [x] **WP1.5** — `app/src/voice/journal.ts`: persisted, readable log of voice exchanges (`said`/`reply`/`ok`/timestamp), capped at 50 entries × 200 chars, stored via `store.ts`. Wired into `engine.ts`'s `show()` so every reply gets journaled. **Important scope note:** this is a *readable history* fix for half of C-02 ("no journal of what I did"), not an undo-after-reload fix — `run.ts`'s undo mechanism is `() => void` closures, which cannot survive a page reload (functions aren't serializable). True cross-reload undo needs the richer `UndoOp` data model from the master prompt (§5.3), which is a WP5 exec-rewrite concern, not something to retrofit here. No UI reads the journal yet — that's `JournalSheet.tsx` in WP6.13.2.

## WP2 — Audio and speech recognition

- [x] **WP2.1/2.2** — Fixed audio findings A-01 and A-02 in `engine.ts`'s `startVoice()`:
  - **A-01**: `no-speech` used to share a branch with `aborted` and silently reset to idle with zero feedback — the "didn't catch that, tap to retry" message already existed in the file but was dead code, unreachable. Split the branches: `aborted` (user-cancelled) stays silent, `no-speech` now shows that message. Also gave `audio-capture` its own distinct message instead of falling into the generic catch-all.
  - **A-02**: `maxAlternatives` was `1` — only the top ASR guess was ever usable. Bumped to `5` and added `pickBestAlt()`: on the final result, try each n-best transcript through `understand()` and use the first one that parses into a real intent (not `guess`/`unknown`) instead of blindly trusting hypothesis #0. No phonetic lexicon yet (that's WP2.4/WP3's `nlp/rescore.ts` — a real scored blend of ASR confidence + lexicon similarity); this is the simpler free win available right now.
  - A-03 (hardcoded silence timers) intentionally **not** touched — a real fix needs adaptive endpointing wired to parse confidence, which doesn't exist yet. Renaming the magic numbers to a constants object would be cosmetic, not a fix, so left for WP2.3 when there's something real to tune.
  - `typecheck`, `build`, `test:voice` (59/59) clean.
- [ ] WP2.3 — adaptive endpointing (needs parse-confidence integration)
- [ ] WP2.4 — phonetic lexicon / rescore
- [x] **WP2.5 (partial)** — `visibilitychange`/`pagehide` cleanup in `engine.ts`: the mic used to keep recording indefinitely in a backgrounded tab (nothing ever stopped it — a real privacy/battery issue, related to finding A-06). Now `cancelVoice()` fires when the tab hides or unloads mid-listen. Registered once at module scope since `engine.ts` only loads after the assistant has opened.
  - Not done: `navigator.permissions.query` pre-check and mic-health-check (`healthCheck()`, §6.1.6) — both exist to feed UI that doesn't exist yet (`FirstRun.tsx`, WP6.4), so building them now would have no consumer. Deferred to WP6.

## WP3 — Understanding (NLU)

- [x] **WP3.1 (partial)** — Fixed 4 of B-05's named gaps in `nlu.ts`'s `takeTime`/`takeDay`:
  - «в половине пятого» → 04:30 (`takeTime`)
  - «без пятнадцати шесть» / «без четверти шесть» / «без двадцати пяти шесть» → 05:45 / 05:45 / 05:35 (`takeTime`) — genitive minute-words (`пятнадцати`, `двадцати пяти`, …) aren't in the `NUM` table (only nominative forms are), so they're matched as literal words rather than relying on `wordsToDigits`.
  - «через две недели» → +14 days (`takeDay`, was only wired for "через неделю"/"через 1 неделю")
  - «в конце месяца» → last day of the current month (`takeDay`)
  - 5 new regression cases added to `tools/unit/voice-intents.test.ts` (64/64 passing total).
  - **Not done** (still open, carried forward): "пятого ноября" after a verb with no day-trigger word, and "купить хлеб" becoming a task with no trigger verb at all — both need real intent-detection design work (risk of over-matching), not a quick regex patch. Left for a dedicated WP3.2 pass.

## WP5 — Execution (started early, scoped slice: quits)

- [x] **WP5.4 (partial)** — First slice of the C-07 coverage backlog: quit management is now reachable by voice.
  - New intents `quitAdd` (risk R2) and `quitArchive` (risk R3) in `nlu.ts` — triggers require the literal word "отказ" so they can't collide with the existing "хочу бросить X" → `goalAdd` pattern (verified: "хочу бросить курить" still stays a goal, not hijacked).
  - `run.ts` wires them to the already-existing `addQuit`/`archiveQuit`/`restoreQuit` actions (per C-07's own note: "все нужные actions в коде уже есть"). `quitArchive` uses the same fuzzy-match-then-confirm pattern as the existing `relapse` case (`rank()`/`SURE`/choices fallback).
  - Small targeted fix for a real grammar bug: "отказ от курения"/"от сладкого" names the target in genitive case — added a 2-ending (`-ия→-ие`, `-ого→-ое`) local converter scoped to just this capture (not a general `nominative()` fix — that's B-10's own, much bigger problem).
  - Both risky by design (R2/R3) — go through the WP1.1 confirm-before-execute flow automatically, no extra wiring needed.
  - 4 new test cases in `voice-intents.test.ts` (68/68 passing total), including a regression guard for the `goalAdd` collision risk.
  - `typecheck`, `build` clean. **Not yet covered by an execution-level test** (`runOne()` needs a full `SystemRaw` context — same gap as all existing `run.ts` cases, not something to newly invent here).
- [x] **WP5.1 (partial)** — habit archive/restore/delete, same slice shape: `habitArchive`/`habitRestore` (R2) and `habitDelete` (R3) intents in `nlu.ts`, wired to the already-existing `archiveHabit`/`restoreHabit`/`deleteHabit` actions. `habitDelete` has no undo — it's a hard DB delete that also drops the habit's log history, unlike archive (reversible via restore). 4 new tests (71/71 total), verified no collision with the existing `done`/`taskDelete` intents.
- [x] **WP5.5 (partial)** — goal completion and deadline: `goalComplete` (R3) and `goalDeadline` (R2) intents, wired to the already-existing `updateGoal` action. Both resolve the goal by fuzzy match against active goals (`rank()`, same pattern as `stepAdd`). 4 new tests (75/75 total), verified no collision with the existing `stepAdd` intent ("добавь шаг в цель X: Y" still parses as a step, not a completion/deadline command).
- [x] **WP5.4+ (partial)** — goal diary and arc oath: `goalDiary` and `arcOath` intents (both R2), wired to the already-existing `saveDiary`/`saveOath` actions. Both capture and restore the *previous* text on undo (diary: looks up today's existing entry for that goal before overwriting; oath: reads `arc.oath` before replacing). 2 new tests (77/77 total).
- [x] **WP5.10 (partial)** — settings: `settingsTheme` (R1, light/dark/system) and `settingsReminder` (R2, daily reminder time), wired to the already-existing `useTheme.setTheme`/`setProfile` actions.
  - Found and fixed a real bug while building this: my first regex for `settingsReminder` ate the "в"/"на" preposition before handing text to `takeTime()`, which broke its own time-parsing patterns ("напоминай мне в 9 утра" silently fell through to `taskAdd` instead). Fixed by passing the untouched remainder to `takeTime`.
  - Found and fixed a second bug before it shipped: the EN trigger "remind me" collided with the existing `taskAdd` test case ("remind me to call John..." — in English that phrase is unambiguously a task, not a settings change). Dropped the EN alternative; `settingsReminder` is RU-only for now (consistent with B-09's known EN-coverage gap).
  - 4 new tests (81/81 total).
- [x] **WP5.9 (partial) — C-07 closed** — per-habit streak question: `habitStreakQuery` (R0), wired to the already-existing `habitStreak`/`habitBest`. Found and fixed two bugs before shipping: `[аой]{2}` doesn't match "ая" (wrong character-class use — rewrote as `(?:ая|ой|ое)`), and the first version missed "какой **у меня** стрик по X" phrasing (added an optional `у меня` group). Verified it doesn't shadow the existing generic `ask.streak` question. 3 new tests (84/84 total).
- [x] **quitDaysQuery** — caught a gap in my own "C-07 closed" claim: "сколько дней я не курю" (named explicitly in C-07) wasn't actually covered by `habitStreakQuery`, it's a separate quit-days question. Added `quitDaysQuery` (R0), wired to `daysBetween(quit.clean_since, today)`. 2 new tests (85/85 total).
  - **This closes the C-07 finding's named backlog** (habit/goal/quit lifecycle, diary, oath, settings, stats) — every example explicitly named in the finding is now reachable by voice. The finding's closing line ("все нужные actions в коде уже есть") is now also true for voice *intents*, not just the underlying state actions. This is not all 243 items from the master prompt's full catalogue — just the specific gap C-07 called out.
- [x] **C-04 fixed (quick win)** — greeting personalization in `run.ts`'s `case 'chat'`: was `const name = ''` (dead code). Now uses `profile.nickname || profile.first_name` when set, falls back to the generic greeting otherwise.

## C-05 — minimal ask-slot mechanism (early taste of WP4)

- [x] Fixed C-05: an appointment-shaped `taskAdd` with no time ("добавь встречу с врачом") now asks "Во сколько?" instead of silently saving with no time.
  - `run.ts`: `Reply` gained an `ask?: { slot: 'taskAdd.time'; title; day }` field; the `taskAdd` case returns it when the title matches appointment words (встреча/созвон/звонок/приём/событие/мероприятие) and no time was parsed.
  - `shell.ts`: `useVoice` gained `pendingSlot`, set from `r.ask` in `engine.ts`'s `show()`.
  - `engine.ts`'s `handle()`: checks `pendingSlot` first — if set, the next utterance is parsed with `takeTime()`; a successful parse completes the `taskAdd`, a failed one clears the slot and falls through to normal command handling (no infinite re-asking).
  - **Scoped deliberately narrow**: one slot type, one intent. This is not WP4's general dialog manager (`DialogContext`, TTL, multiple slot grammars) — just the smallest fix that closes the literal finding.
  - Verified via `understand()` output only (run.ts can't run outside Vite — it statically imports React/`.module.css`, same constraint as always); `typecheck`/`build`/`test:voice` (85/85) clean, no new permanent test added for the ask-slot *execution* path itself since there's no harness that can run `runOne()` yet (same gap noted for every other `run.ts` case).

## C-06 — offer an alternative time on conflict

- [x] Fixed C-06: `taskAdd` used to only report "В это время уже ${other title}" when the new event overlapped an existing one, with no way forward except retyping. Now computes the next free gap after the conflicting event (`nextFreeSlot()`, a small local scan of the day's events — not the full `exec/calendar.ts` module planned for WP5.7) and offers it as a choice: tap/say "На 16:00" to move there, or "Оставить как есть" to keep the overlap. Moving is itself undoable (reverts to the original clashing time).
  - `typecheck`/`build`/`test:voice` (85/85) clean — this only touches `run.ts`'s internal scheduling logic, no new intents, so no new parse-level tests needed.

## C-03 — sentence-chunked speech

- [x] Fixed C-03: multi-intent replies ("сделал зарядку и медитацию") used to be spoken as one `SpeechSynthesisUtterance` for the whole `.join('. ')`-ed block — one long monologue. `engine.ts`'s `speak()` now splits on sentence boundaries (`/(?<=[.!?])\s+/`, matching §6.11.2) and chains each sentence as its own utterance via `onend`, giving a natural pause between them. Single-sentence replies (the common case) are unaffected — one chunk, same as before. `cancelVoice()`'s `speechSynthesis.cancel()` still aborts the whole chain (barge-in unaffected).
  - `typecheck`/`build`/`test:voice` (85/85) clean — TTS timing isn't something the test harness or browser tooling can verify (no speaker output check available), so this was checked by code review only.

## B-02 — stop misreading distress as neutral mood (S1, highest severity open so far)

- [x] Fixed B-02: the neutral-mood pattern's bare `ничего` matched *inside* negations — "я устал и ничего не хочу" logged mood level 2 (neutral) instead of reading "устал" (tired, level 1). For someone in a genuinely bad state, this was the worst possible misread the system could produce. Added a negative lookahead so `ничего` only counts as "fine" when it isn't followed by "не"/"хорошего"/"особенного". Bare "ничего" (a reply meaning "I'm fine") and "настроение ничего" (explicit context) still correctly read as neutral — only the negation case changed.
  - 2 new regression tests (87/87 total). `typecheck`/`build` clean.

## B-03 — stop stem-matching done-verb phrases as navigation

- [x] Fixed B-03: the nav shortcut for short phrases (≤2 words, no "open/show" verb required) matched "закончил отчёт" against the Analytics page's `отчет` stem before the phrase ever reached the done-verb logic. Added a guard: bail out of the nav-by-word-count path if the phrase starts with a `DONE_V` verb. Explicit navigation ("покажи отчёт") is unaffected.
  - Self-caught bug in my own fix: first attempt used `\b` for the word-boundary check, which is ASCII-only in JS and doesn't work correctly after/before Cyrillic letters — exactly the trap `nlu.ts`'s own `L`/`R` constants exist to avoid (`// word start (\b is ASCII-only in JS)`). Switched to `R`.
  - 2 new tests (89/89 total). `typecheck`/`build` clean.

## Notes / deviations from master prompt

- Working branch is `work/dev` off `veyrarc-app`, not `feature/voice-2` off `develop` — per explicit user instruction (user reviews locally before any push).
- Sections B–K of the audit are verified incrementally per-WP rather than all upfront (see `audit-findings.md`).
- `.claude/launch.json` added (not part of the master prompt) — local dev-server config so the app can be previewed. Had to force `--host 127.0.0.1`: on this machine Vite's default `localhost` bind only opened the IPv6 loopback, so `http://localhost:5173` was unreachable from a normal browser.
