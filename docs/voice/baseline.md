# Voice 2.0 — Baseline (before WP0)

Date: 2026-10-30
Branch: `work/dev` (based on `veyrarc-app`)

## Current voice module

| File | Lines |
|---|---|
| `app/src/voice/nlu.ts` | 550 |
| `app/src/voice/run.ts` | 605 |
| `app/src/voice/voice.ts` | 182 |
| `app/src/voice/AssistantPanel.tsx` + `.module.css` | ~86 / ~71 |
| `app/src/voice/AssistantMark.tsx` | ~17 |
| `app/src/voice/intents.ts` | ~2 |

Total voice module: ~1337 lines (nlu+run+voice only).

## Build baseline (`npm run build`)

- Main chunk: `index-D-n_V5MO.js` — **282.24 kB raw / 88.41 kB gzip**
- Voice code is NOT split into its own chunk — bundled statically into the main chunk (confirms audit finding H12: lazy-loading via `engine.ts` not yet implemented).
- PWA precache total: 1318.35 KiB across 60 entries.
- `typecheck`: clean, no errors.
- `build`: clean, 2 non-fatal `INEFFECTIVE_DYNAMIC_IMPORT` warnings unrelated to voice (`analytics.ts`, `push.ts`).

## Target (per master prompt §6.19.3)

Voice engine lazy chunk should stay under 150 KB gzip.

## Test infra status (before WP0)

- No `tools/voice/` directory yet.
- No `test:voice` / `train:voice` / `coverage:voice` npm scripts yet.
- No golden dataset (`*.jsonl`) yet.
- `tsx` not yet a devDependency.

This file will be updated after WP0 completes with new numbers for comparison.
