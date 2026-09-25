import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'url';
import pkg from './package.json';

export default defineConfig({
  // Single source of truth for the version string: package.json. It previously
  // appeared, differently, in package.json, SettingsPage and backupService.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'favicon.ico',
        'favicon-16x16.png',
        'favicon-32x32.png',
        'icon-96.png',
        'icon-144.png',
        'icon-180.png',
        'icon-192.png',
        'icon-256.png',
        'icon-512.png',
        'icon-maskable-192.png',
        'icon-maskable-512.png',
      ],
      manifest: {
        id: '/',
        name: 'Kharcha Bachau',
        short_name: 'Kharcha Bachau',
        description: 'Free daily expense tracker that works offline.',
        // /app so the installed PWA opens into the tracker, not the landing page.
        // id stays '/' so existing installs keep their identity.
        start_url: '/app',
        scope: '/',
        lang: 'en',
        dir: 'ltr',
        categories: ['finance', 'productivity'],
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        background_color: '#f8fafc',
        theme_color: '#0E1833',
        orientation: 'portrait',
        prefer_related_applications: false,
        icons: [
          { src: 'icon-96.png', sizes: '96x96', type: 'image/png', purpose: 'any' },
          { src: 'icon-144.png', sizes: '144x144', type: 'image/png', purpose: 'any' },
          { src: 'icon-180.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-256.png', sizes: '256x256', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url))
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }

            if (id.includes('react-router') || id.includes('@remix-run') || id.includes('/history')) {
              return 'vendor-router';
            }

            if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler') || id.includes('react-is')) {
              return 'vendor-react';
            }

            if (
              id.includes('protobufjs') ||
              id.includes('@grpc') ||
              id.includes('grpc-web') ||
              id.includes('/idb/') ||
              id.includes('long/')
            ) {
              return 'vendor-firestore-deps';
            }

            if (id.includes('firebase')) {
              return 'vendor-firebase';
            }

            if (id.includes('date-fns')) {
              return 'vendor-date-fns';
            }

            return 'vendor';
          }
        }
      }
    }
  }
});
