import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const runtimeDirectory = path.resolve('src/standards/relaxng/runtime');
const expectedFiles = new Set([
  'LICENSE.emscripten.txt',
  'LICENSE.libxml2.txt',
  'libxml2-relaxng-runtime.js',
  'libxml2-relaxng-runtime.wasm',
  'runtime-manifest.json',
]);

const identity = {
  engine: 'libxml2 RELAX NG',
  libxml2Version: '2.15.3',
  libxml2SourceUrl:
    'https://download.gnome.org/sources/libxml2/2.15/libxml2-2.15.3.tar.xz',
  libxml2SourceSha256:
    '78262a6e7ac170d6528ebfe2efccdf220191a5af6a6cd61ea4a9a9a5042c7a07',
  emsdkVersion: '6.0.5',
  emsdkCommit: 'dfb9d1a46c3bb8f52e1e6324be23123b9d73c190',
  compilerBuildHash: '1db513782be24469589d7cb8a1f1834e9a33f271',
  cmakeVersion: '4.4.2',
  ninjaVersion: '1.13.2',
};

const buildConfiguration = {
  optimization: '-O2',
  filesystem: false,
  network: false,
  upstreamPatched: false,
  enabledLibxml2Features: [
    'XML',
    'regexps',
    'XML Schema datatypes',
    'RELAX NG',
  ],
  disabledLibxml2Features: [
    'HTTP',
    'iconv',
    'ICU',
    'zlib',
    'Python',
    'threads',
    'modules',
    'catalog',
    'programs',
    'tests',
    'docs',
    'HTML',
    'XInclude',
    'XPath',
    'DTD validation',
    'legacy',
    'debug',
    'output',
  ],
  configureOptions: [
    '-DCMAKE_BUILD_TYPE=Release',
    '-DBUILD_SHARED_LIBS=OFF',
    '-DLIBXML2_WITH_RELAXNG=ON',
    '-DLIBXML2_WITH_SCHEMAS=ON',
    '-DLIBXML2_WITH_REGEXPS=ON',
    '-DLIBXML2_WITH_OUTPUT=OFF',
    '-DLIBXML2_WITH_HTTP=OFF',
    '-DLIBXML2_WITH_ICONV=OFF',
    '-DLIBXML2_WITH_ICU=OFF',
    '-DLIBXML2_WITH_ZLIB=OFF',
    '-DLIBXML2_WITH_PYTHON=OFF',
    '-DLIBXML2_WITH_THREADS=OFF',
    '-DLIBXML2_WITH_MODULES=OFF',
    '-DLIBXML2_WITH_CATALOG=OFF',
    '-DLIBXML2_WITH_PROGRAMS=OFF',
    '-DLIBXML2_WITH_TESTS=OFF',
    '-DLIBXML2_WITH_DOCS=OFF',
    '-DLIBXML2_WITH_HTML=OFF',
    '-DLIBXML2_WITH_XINCLUDE=OFF',
    '-DLIBXML2_WITH_XPATH=OFF',
    '-DLIBXML2_WITH_VALID=OFF',
    '-DLIBXML2_WITH_LEGACY=OFF',
    '-DLIBXML2_WITH_DEBUG=OFF',
  ],
  linkFlags: [
    '-DXML_CAROUSEL_RELAXNG_PRODUCTION=1',
    '-O2',
    '-sMODULARIZE=1',
    '-sEXPORT_ES6=1',
    '-sEXPORT_NAME=createRelaxNgProductionModule',
    '-sENVIRONMENT=web,worker,node',
    '-sALLOW_MEMORY_GROWTH=1',
    '-sFILESYSTEM=0',
    "-sEXPORTED_FUNCTIONS=['_malloc','_free','_relaxng_reset','_relaxng_add_file','_relaxng_compile','_relaxng_engine_version','_relaxng_result_json']",
    "-sEXPORTED_RUNTIME_METHODS=['UTF8ToString','stringToUTF8','lengthBytesUTF8','writeArrayToMemory','cwrap','HEAPU8']",
  ],
};

const resourcePolicy = {
  version: 1,
  canonicalNamespace: 'project:///',
  resolution:
    'Exact common-root-relative POSIX paths resolved from the referring document directory; safe parent segments remain within the project root.',
  externalRetrieval: false,
  basenameFallback: false,
  includeRecursionLimit: 64,
};

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fileIdentity(file, gzip = false) {
  const bytes = await readFile(path.join(runtimeDirectory, file));
  return {
    file,
    rawBytes: bytes.length,
    ...(gzip ? { gzipBytes: gzipSync(bytes, { level: 9 }).length } : {}),
    sha256: sha256(bytes),
  };
}

async function createManifest() {
  return {
    ...identity,
    productionLoading: {
      javascriptPackaging: 'dynamic-es-module-js',
      wasmInstantiation: 'prefetched-byte-array',
      hostileWasmMimeSupported: 'application/octet-stream',
    },
    buildConfiguration,
    resourcePolicy,
    artifacts: [
      await fileIdentity('libxml2-relaxng-runtime.js', true),
      await fileIdentity('libxml2-relaxng-runtime.wasm', true),
    ],
    attributionFiles: [
      await fileIdentity('LICENSE.libxml2.txt'),
      await fileIdentity('LICENSE.emscripten.txt'),
    ],
  };
}

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function verifyRelaxNgRuntime() {
  const names = new Set(await readdir(runtimeDirectory));
  const missing = [...expectedFiles].filter((name) => !names.has(name));
  const unexpected = [...names].filter((name) => !expectedFiles.has(name));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `RELAX NG runtime filenames differ from the reviewed set. Missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}.`,
    );
  }

  for (const name of expectedFiles) {
    const fileStats = await stat(path.join(runtimeDirectory, name));
    if (!fileStats.isFile() || fileStats.size === 0) {
      throw new Error(`RELAX NG runtime file is missing or empty: ${name}`);
    }
  }

  const manifestSource = await readFile(
    path.join(runtimeDirectory, 'runtime-manifest.json'),
    'utf8',
  );
  if (
    /\.mjs\b|(?:^|["\s])[A-Za-z]:[\\/]|file:\/\/|localhost|127\.0\.0\.1/mu.test(
      manifestSource,
    )
  ) {
    throw new Error(
      'The RELAX NG runtime manifest contains a stale module name or machine-specific path.',
    );
  }
  const manifest = JSON.parse(manifestSource);
  const expected = await createManifest();
  if (!exactJson(manifest, expected)) {
    throw new Error(
      'The RELAX NG runtime manifest differs from the pinned deterministic identity.',
    );
  }

  const glue = await readFile(
    path.join(runtimeDirectory, 'libxml2-relaxng-runtime.js'),
    'utf8',
  );
  if (
    /https?:\/\/(?!emscripten\.org\b)/iu.test(glue) ||
    /fetch\([^)]*https?:/iu.test(glue)
  ) {
    throw new Error(
      'The RELAX NG runtime glue contains a runtime download reference.',
    );
  }
  if (
    /_rng_|domProbe|compiledDump|xmlRelaxNGDumpTree/u.test(glue) ||
    !['_relaxng_reset', '_relaxng_add_file', '_relaxng_compile'].every(
      (symbol) => glue.includes(symbol),
    )
  ) {
    throw new Error(
      'The RELAX NG runtime glue does not expose the reviewed narrow production surface.',
    );
  }
  return manifest;
}

if (process.argv.includes('--write-manifest')) {
  await writeFile(
    path.join(runtimeDirectory, 'runtime-manifest.json'),
    `${JSON.stringify(await createManifest(), null, 2)}\n`,
    'utf8',
  );
} else if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    const manifest = await verifyRelaxNgRuntime();
    console.log(
      `Verified libxml2 RELAX NG ${manifest.libxml2Version} production runtime: ${manifest.artifacts.length} artifacts and ${manifest.attributionFiles.length} attribution files.`,
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : 'RELAX NG runtime verification failed.',
    );
    process.exitCode = 1;
  }
}
