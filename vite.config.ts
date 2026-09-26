import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'url';
import pkg from './package.json';

export default defineConfig({
  // Single source of truth for the version string: package.json.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
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

            return 'vendor';
          }
        }
      }
    }
  }
});
