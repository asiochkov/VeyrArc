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

## Notes / deviations from master prompt

- Working branch is `work/dev` off `veyrarc-app`, not `feature/voice-2` off `develop` — per explicit user instruction (user reviews locally before any push).
- Sections B–K of the audit are verified incrementally per-WP rather than all upfront (see `audit-findings.md`).
- `.claude/launch.json` added (not part of the master prompt) — local dev-server config so the app can be previewed. Had to force `--host 127.0.0.1`: on this machine Vite's default `localhost` bind only opened the IPv6 loopback, so `http://localhost:5173` was unreachable from a normal browser.
