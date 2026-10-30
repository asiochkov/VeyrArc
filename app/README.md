> Актуальные правила проверки, изоляции сред и выпуска: [PROCESS.md](../docs/release/PROCESS.md). Приложение полностью бесплатное. `VITE_DEMO=1 npm run check` проверяет код без подключения к Supabase; `VITE_DEMO=1 npm run test:ui` проверяет собранный интерфейс. Node 22.18+ (22/24).

# VeyrArc web app

React 18 + TypeScript + Vite. Design source of truth: `../project/*.dc.html`.
Stage reports: `../docs/stage-*.md`.

```bash
npm ci
npm run dev          # http://localhost:5173
npm run typecheck
VITE_DEMO=1 npm run build && VITE_DEMO=1 npm run preview   # http://localhost:4173

# design vs implementation pairs (needs `npm run preview` running)
STAGE=stage-1 npm run compare [-- caseNamePrefix]
```

## Layout

- `src/styles/` — tokens (Night only), global rules and keyframes copied from the design, self-hosted fonts
- `src/i18n/` — key-based RU/EN dictionary, plurals via `Intl.PluralRules`, 150ms language cross-fade
- `src/ui/` — `Icon` (all SVG paths from the design files) and shared primitives
- `src/app/` — router, `AppShell` (rail ≥1024px, bottom bar below), navigation state
- `src/pages/` — application screens
- `src/config.ts` — feature flags, site contacts and shared product settings
- `tools/design-compare.mjs` — renders a prototype and the app, writes side-by-side PNGs with a pixel-diff score

## Preview build

`npm run build:preview` builds `dist-preview/` with `VITE_PREVIEW=1` (`.env.preview`): in-memory routing (the host has no SPA rewrites) and a preview-only screen list at start plus a «Экраны» tab on every screen. `tools/preview-page.mjs` writes `dist-preview/page.html`, the body-only page published as the clickable preview. The production build (`npm run build`) is unchanged.
