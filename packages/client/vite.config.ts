import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'child_process';

const BASE_PATH = process.env.VITE_BASE_PATH || '/mahjong-recording/';

let gitHash = 'dev';
try { gitHash = execSync('git rev-parse --short HEAD').toString().trim(); } catch {}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: BASE_PATH,
  define: {
    __APP_VERSION__: JSON.stringify(gitHash),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: 5173,
    proxy: {
      '/mahjong-recording/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/mahjong-recording/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
});
