import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createXercesSpikeAdapter,
  type XercesSpikeAdapter,
} from '../src/adapter';

interface W3cManifest {
  cacheDirectory: string;
  cases: readonly {
    id: string;
    expected: 'valid' | 'invalid';
    cacheFile: string;
  }[];
}

let adapter: XercesSpikeAdapter;
let manifest: W3cManifest;

beforeAll(async () => {
  manifest = JSON.parse(
    await readFile(
      path.resolve('tests/fixtures/xerces-wasm-spike/w3c-selected-cases.json'),
      'utf8',
    ),
  ) as W3cManifest;
  const moduleUrl = pathToFileURL(
    path.resolve('tools/xerces-wasm-spike/dist/xerces-spike.mjs'),
  );
  const imported = (await import(moduleUrl.href)) as {
    default: Parameters<typeof createXercesSpikeAdapter>[0];
  };
  adapter = await createXercesSpikeAdapter(imported.default, moduleUrl);
});

describe('selected official W3C cases', () => {
  it.each([0, 1, 2])('matches manifest case %s', async (index) => {
    const testCase = manifest.cases[index];
    const bytes = new Uint8Array(
      await readFile(path.resolve(manifest.cacheDirectory, testCase.cacheFile)),
    );
    const result = adapter.run({
      attemptId: testCase.id,
      format: 'xsd',
      entryPath: testCase.cacheFile,
      files: [{ path: testCase.cacheFile, bytes }],
    });
    expect(result.status).toBe(testCase.expected);
  });
});
