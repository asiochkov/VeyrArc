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

## Sections B–K

Not yet re-verified against current line numbers — these will be confirmed at the start of the WP that implements them (per master prompt §4.2 step 1):
- B (NLU / `nlu.ts`) → WP1.3, WP3
- C (`run.ts`) → WP1.3, WP5
- D (dialog) → WP4
- E (TTS) → WP6.1
- F (UX/CSS) → WP6
- G (onboarding) → WP6.4
- H (perf/compat) → WP0.5, WP7 (H12 already confirmed via baseline.md — voice code not lazy-split yet)
- I (push) → WP6.8
- J (legal/limits) → WP7.1
- K (process/tooling) → WP0 (this package)
