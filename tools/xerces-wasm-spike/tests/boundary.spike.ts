import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('reviewed spike boundary', () => {
  it('keeps production independent from developer spike modules and outputs', async () => {
    const productionFiles = [
      'src/main.ts',
      'src/app/App.svelte',
      'src/workers/schemaImportWorker.ts',
      'vite.config.ts',
    ];
    for (const file of productionFiles) {
      const source = await readFile(path.resolve(file), 'utf8');
      expect(source).not.toMatch(
        /tools[\\/]xerces-wasm-spike|xerces-spike\.wasm|harness/iu,
      );
    }
  });

  it('uses relative module URLs for glue and WASM', async () => {
    const worker = await readFile(
      path.resolve('tools/xerces-wasm-spike/src/worker.ts'),
      'utf8',
    );
    expect(worker).toContain(
      "new URL('../dist/xerces-spike.mjs', import.meta.url)",
    );
    expect(worker).toContain(
      "new URL('../dist/xerces-spike.wasm', import.meta.url)",
    );
    expect(worker).not.toMatch(/localhost|https?:\/\//u);
  });

  it('keeps generated outputs ignored', async () => {
    const ignore = await readFile(path.resolve('.gitignore'), 'utf8');
    for (const directory of ['.cache/', '.tools/', 'build/', 'dist/']) {
      expect(ignore).toContain(`tools/xerces-wasm-spike/${directory}`);
    }
  });
});
