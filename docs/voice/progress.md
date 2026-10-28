# Журнал работ над голосовым ассистентом 2.0

| WP | Дата | Что сделано | Цифры качества |
|---|---|---|---|
| WP0.1–0.6 | 2026-10-28 | tooling, golden scaffold (185/130/46), telemetry+consent, flags/store/prefs, shell skeleton, Voice Lab behind flag, spike: local engines not accepted (see spike/results.md) | baseline Q1 44.3% · Q2 26.1% · Q3 122/130 |
| WP1.1, 1.2, 1.4, 1.5 | 2026-10-28 | risk matrix (36120 combinations), classifier (51 KB gz), speechText, reply builders, journal + undo (29 do→undo checks) | unit: 7 files green; golden still on the legacy adapter |
| WP2.1–2.5 | 2026-10-28 | audio session (states, sync start from gesture, 7-day health probe, network retries 1/2/4 s, visibility abort), Web Speech engine (5 alts + confidence), end-of-phrase detection, lexicon + phonetic rescoring, `voice.err.*` RU/EN, hold-to-talk ≥350 ms, Ctrl/⌘+Shift+Space, Space/Esc, «Повторить» | unit: 11 files green (stt 19, endpoint 14, lexicon 15, session 24); e2e-voice green; golden unchanged (new parser in Phase 3) |
