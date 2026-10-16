import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const venturesBaseUrl = env.VITE_VENTURES_BASE_URL || '';

  return {
    plugins: [react()],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    server: {
      proxy: venturesBaseUrl
        ? {
            '/ventures-proxy': {
              target: venturesBaseUrl,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/ventures-proxy/, ''),
              secure: false,
            },
          }
        : {},
    },
  };
});
