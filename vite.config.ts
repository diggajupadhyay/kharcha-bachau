import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { fileURLToPath, URL } from 'url';

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'manifest.json',
          dest: ''
        },
        {
          src: 'sw.js',
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
          // Vendor chunks
          if (id.includes('node_modules')) {
            // React and React DOM together
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react';
            }
            
            // Firebase (large library)
            if (id.includes('firebase')) {
              return 'vendor-firebase';
            }
            
            // Recharts (very large library - separate)
            if (id.includes('recharts')) {
              return 'vendor-recharts';
            }
            
            // Date-fns (medium size - separate)
            if (id.includes('date-fns')) {
              return 'vendor-date-fns';
            }
            
            // PDF libraries
            if (id.includes('jspdf')) {
              return 'vendor-pdf';
            }
            
            // Lucide icons
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            
            // Other vendor libraries
            return 'vendor';
          }
        }
      }
    }
  }
});