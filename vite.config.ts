import path from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

import { readNormalizedReleaseText } from './scripts/release-text-assets.js';

function releaseNoticeAssets(): Plugin {
  return {
    name: 'xml-carousel-release-notices',
    apply: 'build',
    async buildStart() {
      for (const [source, fileName] of [
        ['LICENSE', 'LICENSE.txt'],
        ['THIRD_PARTY_NOTICES.txt', 'THIRD_PARTY_NOTICES.txt'],
      ] as const) {
        this.emitFile({
          type: 'asset',
          fileName,
          source: await readNormalizedReleaseText(path.resolve(source)),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [svelte(), releaseNoticeAssets()],
  resolve: {
    conditions: ['browser'],
  },
  build: {
    target: 'es2022',
    // Keep reviewed runtime manifests and attribution as auditable files rather
    // than embedding them as data URLs in the worker bundle.
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    css: true,
    include: ['src/**/*.test.ts'],
  },
});
