import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

const BUILD = (process.env.RENDER_GIT_COMMIT || (() => { try { return execSync('git rev-parse HEAD').toString() } catch { return 'dev' } })()).trim().slice(0, 7)

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  define: { __BUILD__: JSON.stringify(BUILD) },
  resolve: mode === 'preview' ? { alias: { 'virtual:pwa-register': '/src/lib/stubs/pwa-register.ts' } } : undefined,
  plugins: [
    react(),
    // Installable app + offline shell. Not in the Artifact preview build (the host blocks service workers).
    mode !== 'preview' && VitePWA({
      registerType: 'autoUpdate',
      // registered in src/lib/pwa.ts (update check each time the app comes back to the foreground)
      injectRegister: false,
      includeAssets: ['push-sw.js', 'favicon.png', 'favicon-32.png', 'apple-touch-icon.png', 'logo-mark.png'],
      manifest: {
        name: 'VeyrArc',
        short_name: 'VeyrArc',
        description: 'Привычки, цели и прогресс в одном месте',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // deep links (Master Changeset task 30): web+veyrarc://goals/<id> → /open → /goals/<id>
        protocol_handlers: [{ protocol: 'web+veyrarc', url: '/open?to=%s' }],
        shortcuts: [
          { name: 'Сегодня', url: '/' },
          { name: 'Планер', url: '/planner' },
          { name: 'Фокус', url: '/?focus=1' },
        ],
      } as Record<string, unknown>,
      workbox: {
        importScripts: ['push-sw.js'],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // the browser only fetches the subsets it needs; keep the offline cache to Latin + Cyrillic
        globIgnores: ['**/*-{greek,vietnamese,latin-ext,cyrillic-ext}-*.woff2'],
        navigateFallback: '/index.html',
        // never cache API calls: data always comes fresh from Supabase
        navigateFallbackDenylist: [/^\/auth\//, /^\/rest\//],
      },
    }),
  ],
}))
