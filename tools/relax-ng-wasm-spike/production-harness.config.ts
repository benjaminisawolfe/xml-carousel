import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const spikeRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(spikeRoot, 'production-browser'),
  base: './',
  publicDir: false,
  build: {
    target: 'es2022',
    outDir: path.join(spikeRoot, '.evidence/production-browser-dist'),
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
  server: {
    fs: { allow: [path.resolve(spikeRoot, '../..')] },
  },
});
