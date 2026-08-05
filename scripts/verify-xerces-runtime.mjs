import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const expectedFiles = new Set([
  'LICENSE.emscripten.txt',
  'LICENSE.xerces.txt',
  'NOTICE.xerces.txt',
  'runtime-manifest.json',
  'xerces-runtime.d.ts',
  'xerces-runtime.js',
  'xerces-runtime.wasm',
]);

/** @param {import('node:crypto').BinaryLike} bytes */
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * @param {string} runtimeDirectory
 * @param {{ file: string; rawBytes: number; gzipBytes?: number; sha256: string }} entry
 * @param {{ gzip?: boolean }} [options]
 */
async function verifyEntry(runtimeDirectory, entry, { gzip = false } = {}) {
  const filePath = path.join(runtimeDirectory, entry.file);
  const bytes = await readFile(filePath);
  const fileStats = await stat(filePath);
  if (!fileStats.isFile() || bytes.length === 0) {
    throw new Error(`Xerces runtime file is missing or empty: ${entry.file}`);
  }
  if (bytes.length !== entry.rawBytes) {
    throw new Error(
      `${entry.file} size mismatch: expected ${entry.rawBytes}, found ${bytes.length}.`,
    );
  }
  const actualHash = sha256(bytes);
  if (actualHash !== entry.sha256) {
    throw new Error(
      `${entry.file} SHA-256 mismatch: expected ${entry.sha256}, found ${actualHash}.`,
    );
  }
  if (
    gzip &&
    (!Number.isInteger(entry.gzipBytes) || (entry.gzipBytes ?? 0) <= 0)
  ) {
    throw new Error(`${entry.file} has no reviewed gzip-size record.`);
  }
}

export async function verifyXercesRuntime(
  runtimeDirectory = path.resolve('src/standards/xerces/runtime'),
) {
  const names = new Set(await readdir(runtimeDirectory));
  const missing = [...expectedFiles].filter((name) => !names.has(name));
  const unexpected = [...names].filter((name) => !expectedFiles.has(name));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Xerces runtime filenames differ from the reviewed set. Missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}.`,
    );
  }

  const manifestPath = path.join(runtimeDirectory, 'runtime-manifest.json');
  const manifestSource = await readFile(manifestPath, 'utf8');
  if (manifestSource.includes('xerces-runtime.mjs')) {
    throw new Error('The Xerces runtime manifest contains a stale .mjs name.');
  }
  const manifest = JSON.parse(manifestSource);
  if (
    manifest.engine !== 'Apache Xerces-C++' ||
    manifest.xercesVersion !== '3.3.0' ||
    manifest.xercesSourceSha256 !==
      'c35a6f04e853bde456c65ec38a4496c7ccf60b27c6989ff4e2149db9ea40648c' ||
    manifest.emscriptenVersion !== '6.0.5'
  ) {
    throw new Error(
      'The Xerces runtime manifest does not match the pinned inputs.',
    );
  }
  if (
    manifest.productionLoading?.javascriptPackaging !==
      'dynamic-es-module-js' ||
    manifest.productionLoading?.wasmInstantiation !== 'prefetched-byte-array'
  ) {
    throw new Error('The Xerces production loading strategy changed.');
  }
  if (
    manifest.buildConfiguration?.optimization !== '-O2' ||
    manifest.buildConfiguration?.exceptionHandling !== 'JavaScript' ||
    manifest.buildConfiguration?.lto !== false ||
    manifest.buildConfiguration?.filesystem !== false ||
    manifest.buildConfiguration?.network !== false ||
    manifest.buildConfiguration?.upstreamPatched !== false
  ) {
    throw new Error('The Xerces runtime manifest build configuration changed.');
  }
  if (
    manifest.virtualProjectResolution?.canonicalNamespace !==
      'common-root-relative-posix' ||
    manifest.virtualProjectResolution?.referenceBase !==
      'referring-document-directory' ||
    manifest.virtualProjectResolution?.safeParentSegments !==
      'normalize-within-project-root' ||
    manifest.virtualProjectResolution?.externalRetrieval !== false
  ) {
    throw new Error('The Xerces virtual-project resolution boundary changed.');
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 2) {
    throw new Error(
      'The Xerces runtime manifest must list two runtime artifacts.',
    );
  }
  if (
    manifest.artifacts[0]?.file !== 'xerces-runtime.js' ||
    manifest.artifacts[1]?.file !== 'xerces-runtime.wasm'
  ) {
    throw new Error(
      'The Xerces runtime manifest does not list the reviewed JavaScript and WASM artifacts.',
    );
  }
  if (
    !Array.isArray(manifest.attributionFiles) ||
    manifest.attributionFiles.length !== 3
  ) {
    throw new Error(
      'The Xerces runtime manifest must list three attribution files.',
    );
  }
  for (const artifact of manifest.artifacts) {
    await verifyEntry(runtimeDirectory, artifact, { gzip: true });
  }
  for (const attribution of manifest.attributionFiles) {
    await verifyEntry(runtimeDirectory, attribution);
  }
  return manifest;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    const manifest = await verifyXercesRuntime();
    console.log(
      `Verified Apache Xerces-C++ ${manifest.xercesVersion} production runtime: ${manifest.artifacts.length} artifacts and ${manifest.attributionFiles.length} attribution files.`,
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : 'Xerces runtime verification failed.',
    );
    process.exitCode = 1;
  }
}
