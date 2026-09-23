# VeyrArc web app

React 18 + TypeScript + Vite. Design source of truth: `../project/*.dc.html`.
Stage reports: `../docs/stage-*.md`.

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck
npm run build && npm run preview   # http://localhost:4173

# design vs implementation pairs (needs `npm run preview` running)
STAGE=stage-1 npm run compare [-- caseNamePrefix]
```

## Layout

- `src/styles/` — tokens (Night only), global rules and keyframes copied from the design, self-hosted fonts
- `src/i18n/` — key-based RU/EN dictionary, plurals via `Intl.PluralRules`, 150ms language cross-fade
- `src/ui/` — `Icon` (all SVG paths from the design files) and shared primitives
- `src/app/` — router, `AppShell` (rail ≥1024px, bottom bar below), navigation state
- `src/pages/` — screens (placeholders until stage 2)
- `src/config.ts` — feature flags (Apple sign-in off), Free/Pro limits, pricing placeholders
- `tools/design-compare.mjs` — renders a prototype and the app, writes side-by-side PNGs with a pixel-diff score

## Preview build

`npm run build:preview` builds `dist-preview/` with `VITE_PREVIEW=1` (`.env.preview`): in-memory routing (the host has no SPA rewrites) and a preview-only screen list at start plus a «Экраны» tab on every screen. `tools/preview-page.mjs` writes `dist-preview/page.html`, the body-only page published as the clickable preview. The production build (`npm run build`) is unchanged.
