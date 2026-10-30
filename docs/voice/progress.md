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
- [ ] WP0.4 — `flags.ts`, `store.ts`, `prefs.ts`
- [ ] WP0.5 — Structural refactor: `shell.ts`/`engine.ts` lazy-load split

## Notes / deviations from master prompt

- Working branch is `work/dev` off `veyrarc-app`, not `feature/voice-2` off `develop` — per explicit user instruction (user reviews locally before any push).
- Sections B–K of the audit are verified incrementally per-WP rather than all upfront (see `audit-findings.md`).
