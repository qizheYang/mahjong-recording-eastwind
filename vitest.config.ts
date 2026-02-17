import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@mahjong/shared': resolve(__dirname, 'packages/shared/src'),
    },
    extensions: ['.ts', '.js', '.mts', '.mjs'],
  },
  test: {
    globals: true,
    testTimeout: 30000,
    // Resolve .js imports to .ts files in server source
    alias: {
      '@mahjong/shared': resolve(__dirname, 'packages/shared/src'),
    },
  },
});
