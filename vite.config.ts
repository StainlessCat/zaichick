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
      chunkSizeWarningLimit: 3000,
      rollupOptions: {
        output: {
          // Code splitting: выделяем тяжёлые вендоры и модули данных в отдельные chunk'и
          // Это снижает время первой загрузки и улучшает кэширование
          manualChunks(id) {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'react-vendor';
            }
            if (id.includes('node_modules/pdfmake')) {
              return 'pdf-vendor';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'lucide-vendor';
            }
            if (id.includes('node_modules/@tanstack')) {
              return 'tanstack-vendor';
            }
            if (id.includes('kharasaveyDemoData')) {
              return 'demo-kharasavey';
            }
            if (id.includes('src/data/seedData')) {
              return 'seed-data';
            }
            if (id.includes('WeldingJournalsView') || id.includes('src/utils/journals')) {
              return 'journals-module';
            }
            if (id.includes('JointPassportModal') || id.includes('src/components/passport/')) {
              return 'passport-module';
            }
          },
        },
      },
    },
    server: {
      // Proxy API & SSE requests to FastAPI (Python 3.12 + PostgreSQL) backend
      proxy: {
        '/api': {
          target: process.env.VITE_API_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
