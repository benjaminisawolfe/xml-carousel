import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertSha256, assertToolVersion } from '../src/integrity';

const root = path.resolve('tools/xerces-wasm-spike');

describe('pinned inputs', () => {
  it('enforces the exact Xerces source hash', async () => {
    const metadata = JSON.parse(
      await readFile(path.join(root, 'versions.json'), 'utf8'),
    ) as { xerces: { sha256: string } };
    expect(() =>
      assertSha256(
        'Xerces',
        'c35a6f04e853bde456c65ec38a4496c7ccf60b27c6989ff4e2149db9ea40648c',
        metadata.xerces.sha256,
      ),
    ).not.toThrow();
  });

  it('rejects the wrong Xerces hash', () => {
    expect(() => assertSha256('Xerces', 'bad', 'expected')).toThrow(
      /SHA-256 mismatch/u,
    );
  });

  it('enforces Emscripten 6.0.5', () => {
    expect(() =>
      assertToolVersion('Emscripten', 'emcc 6.0.5', '6.0.5'),
    ).not.toThrow();
    expect(() =>
      assertToolVersion('Emscripten', 'emcc 5.0.0', '6.0.5'),
    ).toThrow(/6\.0\.5 is required/u);
  });
});
