import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Installable app + offline shell. Not in the Artifact preview build (the host blocks service workers).
    mode !== 'preview' && VitePWA({
      registerType: 'autoUpdate',
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
        background_color: '#05070A',
        theme_color: '#05070A',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
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
