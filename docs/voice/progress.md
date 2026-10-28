# Журнал работ над голосовым ассистентом 2.0

| WP | Дата | Что сделано | Цифры качества |
|---|---|---|---|
| WP0.1–0.6 | 2026-10-28 | tooling, golden scaffold (185/130/46), telemetry+consent, flags/store/prefs, shell skeleton, Voice Lab behind flag, spike: local engines not accepted (see spike/results.md) | baseline Q1 44.3% · Q2 26.1% · Q3 122/130 |
| WP1.1, 1.2, 1.4, 1.5 | 2026-10-28 | risk matrix (36120 combinations), classifier (51 KB gz), speechText, reply builders, journal + undo (29 do→undo checks) | unit: 7 files green; golden still on the legacy adapter |
| WP2.1–2.5 | 2026-10-28 | audio session (states, sync start from gesture, 7-day health probe, network retries 1/2/4 s, visibility abort), Web Speech engine (5 alts + confidence), end-of-phrase detection, lexicon + phonetic rescoring, `voice.err.*` RU/EN, hold-to-talk ≥350 ms, Ctrl/⌘+Shift+Space, Space/Esc, «Повторить» | unit: 11 files green (stt 19, endpoint 14, lexicon 15, session 24); e2e-voice green; golden unchanged (new parser in Phase 3) |
| WP3.1 | 2026-10-28 | normalize / itn / dates: every row of tables 6.5.1–6.5.3 is a unit check (now = 28.10.2026 15:00) | unit: voice-dates 90 checks |
| WP3.2 | 2026-10-28 | rule engine + candidate parser (entities, morphology, spelling repairs, segmentation, classifier mix), rules for the current golden intents | golden: RU positives 100% · noisy 97.8% · negative violations 0; EN comes in WP3.3 |
| WP3.3 | 2026-10-28 | English parity: itnEn, datesEn (54 unit checks), EN rules for every current command, EN fixture, 130 EN golden positives + 26 EN negatives, classifier retrained (53 KB gz) | golden: Q1 100% · Q2 100% · Q3 0 violations |
| WP3.4–3.5 | 2026-10-28 | app now runs on the new parser (bridge to the executor, slot questions remembered); assistant moved to lazy chunks (initial JS 271 014 → 249 931 B gz); palette sends phrases to the assistant; golden thresholds enforced (config.json) | Q1 100% · Q2 95.7% · Q3 0 · e2e-voice green |
