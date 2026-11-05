import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        // import.meta.dirname — стандарт ESM, рекомендован Vite 6+
        '@': import.meta.dirname,
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Code splitting: выделяем тяжёлые вендоры в отдельные chunk'и
          // Это снижает время первой загрузки и улучшает кэширование
          manualChunks(id) {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'react-vendor';
            }
            if (id.includes('node_modules/pdfmake')) {
              return 'pdf-vendor';
            }
            if (id.includes('node_modules/xlsx')) {
              return 'xlsx-vendor';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'lucide-vendor';
            }
            if (id.includes('node_modules/@tanstack')) {
              return 'tanstack-vendor';
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
