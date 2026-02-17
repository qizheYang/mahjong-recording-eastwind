import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const BASE_PATH = process.env.VITE_BASE_PATH || '/mahjong-recording/';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: BASE_PATH,
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
