import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    mkcert(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'QR Nav Indoor Navigation',
        short_name: 'QR Nav',
        description: 'Offline-capable QR indoor navigation prototype.',
        theme_color: '#0f1117',
        background_color: '#0f1117',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/maps/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'floor-plan-images',
              expiration: {
                maxEntries: 16,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/route'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'route-api',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/scan'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'qr-scan-api',
              networkTimeoutSeconds: 2,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    proxy: {
      '/map':    'http://localhost:8000',
      '/route':  'http://localhost:8000',
      '/scan':   'http://localhost:8000',
      '/qr-codes': 'http://localhost:8000',
      '/graph':  'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/search': 'http://localhost:8000',
      '/event':  'http://localhost:8000',
      '/maps':   'http://localhost:8000',   // static floor plan image
      '/analytics': 'http://localhost:8000',
    }
  }
})
