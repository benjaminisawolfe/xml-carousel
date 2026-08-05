import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tools/xerces-wasm-spike/tests/**/*.spike.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
