import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  hostileContentType,
  startHostileMimeServer,
} from '../../../scripts/hostile-mime-build-server.mjs';
import { verifyXercesRuntime } from '../../../scripts/verify-xerces-runtime.mjs';

const runningServers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map((server) => server.close()));
});

describe('hostile production MIME boundary', () => {
  it('serves JavaScript normally while making .mjs and WASM hostile', () => {
    expect(hostileContentType('runtime.js')).toBe(
      'text/javascript; charset=utf-8',
    );
    expect(hostileContentType('runtime.mjs')).toBe('application/octet-stream');
    expect(hostileContentType('runtime.wasm')).toBe('application/octet-stream');
  });

  it('mounts the unchanged build at root and a nested path', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'xml-carousel-mime-'));
    await writeFile(
      path.join(directory, 'index.html'),
      '<!doctype html><script type="module" src="./app.js"></script>',
    );
    await writeFile(path.join(directory, 'app.js'), 'export default true;');
    const running = await startHostileMimeServer({
      distDirectory: directory,
      onRequest: () => undefined,
    });
    runningServers.push(running);
    for (const mount of [running.rootUrl, running.nestedUrl]) {
      const index = await fetch(mount);
      const script = await fetch(new URL('./app.js', mount));
      expect(index.status).toBe(200);
      expect(script.status).toBe(200);
      expect(script.headers.get('content-type')).toBe(
        'text/javascript; charset=utf-8',
      );
    }
  });

  it('rejects stale .mjs manifest data', async () => {
    const source = path.resolve('src/standards/xerces/runtime');
    const parent = await mkdtemp(path.join(tmpdir(), 'xml-carousel-runtime-'));
    const copy = path.join(parent, 'runtime');
    await cp(source, copy, { recursive: true });
    const manifestPath = path.join(copy, 'runtime-manifest.json');
    const manifest = await readFile(manifestPath, 'utf8');
    await writeFile(
      manifestPath,
      manifest.replace('xerces-runtime.js', 'xerces-runtime.mjs'),
    );
    await expect(verifyXercesRuntime(copy)).rejects.toThrow(/stale \.mjs/iu);
  });

  it('keeps production runtime references on .js and the vendor input isolated on .mjs', async () => {
    const production = await readFile(
      path.resolve('src/standards/xerces/productionValidator.ts'),
      'utf8',
    );
    const manifest = await readFile(
      path.resolve('src/standards/xerces/runtime/runtime-manifest.json'),
      'utf8',
    );
    const publish = await readFile(
      path.resolve(
        'tools/xerces-wasm-spike/scripts/publish-production-runtime.ps1',
      ),
      'utf8',
    );
    expect(production).not.toContain('xerces-runtime.mjs');
    expect(production).toContain('xerces-runtime.js');
    expect(manifest).not.toContain('xerces-runtime.mjs');
    expect(publish).toContain("'xerces-spike.mjs'");
    expect(publish).toContain("'xerces-runtime.js'");
    expect(publish).toContain("'xerces-runtime.mjs'");
    expect(publish).toMatch(/Remove-Item[^\r\n]+staleModule/iu);
  });
});
