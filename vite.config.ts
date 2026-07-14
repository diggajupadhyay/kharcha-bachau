import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { fileURLToPath, URL } from 'url';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: 'manifest.json',
          dest: ''
        },
        {
          src: 'sw.js',
          dest: ''
        },
        {
          src: 'public/icon-192.png',
          dest: ''
        },
        {
          src: 'public/icon-512.png',
          dest: ''
        },
        {
          src: 'public/icon-180.png',
          dest: ''
        },
        {
          src: 'public/icon-maskable-192.png',
          dest: ''
        },
        {
          src: 'public/icon-maskable-512.png',
          dest: ''
        },
        {
          src: 'public/favicon.ico',
          dest: ''
        },
        {
          src: 'public/favicon-16x16.png',
          dest: ''
        },
        {
          src: 'public/favicon-32x32.png',
          dest: ''
        }
      ]
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url))
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 500, // Warn if chunk exceeds 500KB
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor chunks — ORDER MATTERS: check more specific before more general
          if (id.includes('node_modules')) {
            // Lucide icons (must check BEFORE react since path contains "react")
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            
            // React Router + router internals (check BEFORE react since paths may contain "react")
            if (id.includes('react-router') || id.includes('@remix-run') || id.includes('/history')) {
              return 'vendor-router';
            }
            
            // React, React DOM, scheduler, react-is (React internals)
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler') || id.includes('react-is')) {
              return 'vendor-react';
            }
            
            // Firestore transitive deps (protobuf/grpc/idb) — large, cache separately
            if (
              id.includes('protobufjs') ||
              id.includes('@grpc') ||
              id.includes('grpc-web') ||
              id.includes('/idb/') ||
              id.includes('long/')
            ) {
              return 'vendor-firestore-deps';
            }

            // Firebase (large library)
            if (id.includes('firebase')) {
              return 'vendor-firebase';
            }
            
            // Date-fns (medium size - separate)
            if (id.includes('date-fns')) {
              return 'vendor-date-fns';
            }
            
            // PDF libraries + their heavy optional deps are ONLY reached through
            // the dynamically-imported pdfService. Return undefined so Rollup
            // keeps them in the lazy dynamic chunk instead of forcing them into
            // the eagerly-preloaded main vendor chunk.
            if (
              id.includes('jspdf') ||
              id.includes('html2canvas') ||
              id.includes('canvg') ||
              id.includes('dompurify') ||
              id.includes('stackblur-canvas') ||
              id.includes('fast-png') ||
              id.includes('svg-pathdata') ||
              id.includes('rgbcolor') ||
              id.includes('iobuffer') ||
              id.includes('performance-now')
            ) {
              return undefined;
            }
            
            // Other vendor libraries
            return 'vendor';
          }
        }
      }
    }
  }
});