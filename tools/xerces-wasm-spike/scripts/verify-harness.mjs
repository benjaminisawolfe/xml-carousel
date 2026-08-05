import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('tools/xerces-wasm-spike/dist/harness');
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const references = [...html.matchAll(/(?:src|href)="([^"]+)"/gu)].map(
  (match) => match[1],
);
if (
  references.length === 0 ||
  references.some((reference) => reference.startsWith('/'))
) {
  throw new Error('Harness HTML assets must be nonempty and relative.');
}
for (const reference of references) {
  const pathname = reference.split(/[?#]/u, 1)[0];
  const target = path.resolve(root, pathname);
  if (!target.startsWith(root + path.sep) || (await stat(target)).size === 0) {
    throw new Error(
      `Harness asset is missing, empty, or outside output: ${reference}`,
    );
  }
  for (const base of [
    'https://example.test/',
    'https://example.test/xml-carousel-spike/',
  ]) {
    const resolved = new URL(reference, base);
    if (!resolved.pathname.startsWith(new URL(base).pathname)) {
      throw new Error(`Harness asset escapes deployment base: ${reference}`);
    }
  }
}
const assets = await readdir(path.join(root, 'assets'));
if (!assets.some((name) => name.endsWith('.wasm')))
  throw new Error('Harness WASM is absent.');
if (!assets.some((name) => /^worker-.*\.js$/u.test(name)))
  throw new Error('Harness worker is absent.');
console.log(
  `Verified unchanged relative harness for root and nested paths: ${references.length} HTML references, ${assets.length} assets.`,
);
