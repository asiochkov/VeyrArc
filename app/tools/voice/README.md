# Инструменты голосового ассистента

- `build-golden.ts` — собирает `golden/*.jsonl` из `golden-src/*.ts` (фразы, ожидания, шумные варианты через `perturb.ts`).
- `run-golden.ts` — прогоняет золотой набор по пайплайну `normalize → parse → decide` без UI и сети; Q1–Q3; `--verbose`, `--split=test`, `--update-baseline`.
- `perturb.ts` — детерминированные искажения «как у распознавания речи».
- `train.ts` — обучение классификатора (WP1.2), `coverage.ts` — покрытие каталога 243 пунктов (WP5).
- `golden/fixture.json` — состояние человека (привычки, цели, задачи, отказы); «сейчас» — среда 28.10.2026 15:00.
- Запуск: `npm run test:voice`, `npm run train:voice`, `npm run coverage:voice`.
