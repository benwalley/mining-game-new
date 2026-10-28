import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  // GitHub Pages serves project sites from /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [preact()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    target: ['es2022', 'safari17', 'chrome115'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
