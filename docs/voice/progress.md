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

## Notes / deviations from master prompt

- Working branch is `work/dev` off `veyrarc-app`, not `feature/voice-2` off `develop` — per explicit user instruction (user reviews locally before any push).
- Sections B–K of the audit are verified incrementally per-WP rather than all upfront (see `audit-findings.md`).
- `.claude/launch.json` added (not part of the master prompt) — local dev-server config so the app can be previewed. Had to force `--host 127.0.0.1`: on this machine Vite's default `localhost` bind only opened the IPv6 loopback, so `http://localhost:5173` was unreachable from a normal browser.
