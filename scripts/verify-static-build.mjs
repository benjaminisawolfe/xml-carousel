import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { readNormalizedReleaseText } from './release-text-assets.js';

const ASSET_REFERENCE_PATTERN =
  /<(?:script|link)\b[^>]*?\b(?:src|href)=["']([^"'#]+(?:[?#][^"']*)?)["'][^>]*>/giu;

/**
 * @param {string} value
 * @returns {string}
 */
export function normalizeBase(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Expected --base to name a URL path or portable base.');
  }
  const trimmed = value.trim();
  if (trimmed === '.' || trimmed === './') {
    return './';
  }
  if (/^[a-z][a-z\d+.-]*:/iu.test(trimmed) || trimmed.startsWith('//')) {
    throw new Error('Expected --base to be a site-relative URL path.');
  }
  const segments = trimmed.replace(/\\/gu, '/').split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('Expected --base to contain no traversal segments.');
  }
  return segments.length === 0 ? '/' : `/${segments.join('/')}/`;
}

/**
 * @param {string} html
 * @returns {string[]}
 */
export function extractAssetReferences(html) {
  return [...html.matchAll(ASSET_REFERENCE_PATTERN)].map((match) => match[1]);
}

/**
 * @param {string} reference
 * @param {string} expectedBase
 * @returns {string}
 */
export function resolveAssetReference(reference, expectedBase) {
  const base = normalizeBase(expectedBase);
  if (
    typeof reference !== 'string' ||
    reference === '' ||
    /^[a-z][a-z\d+.-]*:/iu.test(reference) ||
    reference.startsWith('//') ||
    reference.includes('\\')
  ) {
    throw new Error(`Built asset reference is not a safe URL: ${reference}`);
  }

  const rawPathname = reference.split(/[?#]/u, 1)[0];
  let pathname;
  try {
    pathname = decodeURIComponent(rawPathname);
  } catch {
    throw new Error(`Built asset reference has unsafe encoding: ${reference}`);
  }

  if (
    [...pathname].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
    })
  ) {
    throw new Error(`Built asset reference has unsafe encoding: ${reference}`);
  }

  let relativePath;
  if (base === './') {
    if (pathname.startsWith('/')) {
      throw new Error(
        `Portable built asset reference must be relative: ${reference}`,
      );
    }
    relativePath = pathname.startsWith('./')
      ? pathname.slice('./'.length)
      : pathname;
  } else {
    if (!pathname.startsWith('/')) {
      throw new Error(`Built asset reference is not absolute: ${reference}`);
    }
    if (!pathname.startsWith(base)) {
      throw new Error(
        `Built asset reference is outside expected base ${base}: ${reference}`,
      );
    }
    relativePath = pathname.slice(base.length);
  }

  const segments = relativePath.split('/');
  if (
    relativePath === '' ||
    segments[0] !== 'assets' ||
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    throw new Error(
      `Built asset reference is not a safe file path: ${reference}`,
    );
  }
  return segments.join(path.sep);
}

/**
 * @param {string} applicationJavascript
 * @param {string} stylesheets
 */
export function verifyBranchWindowRangeBuildOutput(
  applicationJavascript,
  stylesheets,
) {
  const scope = applicationJavascript.match(
    /class=["']branch-window-range (svelte-[\w-]+)["'][^>]*data-branch-window-range/u,
  )?.[1];
  if (!scope) {
    throw new Error(
      'The production application bundle is missing the branch-window range element hook.',
    );
  }

  const escapedScope = scope.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const rule = stylesheets.match(
    new RegExp(`\\.branch-window-range\\.${escapedScope}\\{([^}]*)\\}`, 'u'),
  )?.[1];
  if (!rule) {
    throw new Error(
      'The production stylesheet is missing the scoped branch-window range rule.',
    );
  }

  for (const declaration of [
    'color:var(--colour-accent)',
    'font-size:var(--font-size-xs)',
    'font-weight:700',
    'line-height:1.25',
    'justify-self:end',
    'inline-size:max-content',
    'max-inline-size:calc(100% + var(--space-10))',
  ]) {
    if (!rule.includes(declaration)) {
      throw new Error(
        `The production branch-window range rule is missing ${declaration}.`,
      );
    }
  }

  if (!applicationJavascript.includes('data-branch-window-large-total')) {
    throw new Error(
      'The production application bundle is missing the large-total range state.',
    );
  }
  const largeTotalRule = stylesheets.match(
    new RegExp(
      `\\.branch-window-range\\[data-branch-window-large-total\\]\\.${escapedScope}\\{([^}]*)\\}`,
      'u',
    ),
  )?.[1];
  if (
    !largeTotalRule?.includes('inline-size:100%') ||
    !largeTotalRule.includes('max-inline-size:100%')
  ) {
    throw new Error(
      'The production stylesheet is missing the rail-contained large-total range rule.',
    );
  }
}

/**
 * @param {string[]} argv
 * @returns {string}
 */
function parseArguments(argv) {
  const inline = argv.find((argument) => argument.startsWith('--base='));
  if (inline) return normalizeBase(inline.slice('--base='.length));
  const index = argv.indexOf('--base');
  if (index >= 0 && argv[index + 1]) return normalizeBase(argv[index + 1]);
  throw new Error(
    'Supply the expected public path or portable base, for example --base=./.',
  );
}

/**
 * @param {string} directory
 * @returns {Promise<string[]>}
 */
async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolute)));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

/**
 * @param {string[]} files
 * @param {string} root
 * @returns {string[]}
 */
function relativeNames(files, root) {
  return files.map((file) => path.relative(root, file).replace(/\\/gu, '/'));
}

export async function verifyStaticBuild({
  distDirectory = path.resolve('dist'),
  expectedBase = '',
} = {}) {
  const base = normalizeBase(expectedBase);
  const indexPath = path.join(distDirectory, 'index.html');
  let html;
  try {
    html = await readFile(indexPath, 'utf8');
  } catch {
    throw new Error(`Missing static entry point: ${indexPath}`);
  }

  const references = extractAssetReferences(html);
  const scripts = references.filter((reference) =>
    reference.split(/[?#]/u, 1)[0].endsWith('.js'),
  );
  const styles = references.filter((reference) =>
    reference.split(/[?#]/u, 1)[0].endsWith('.css'),
  );
  if (scripts.length === 0 || styles.length === 0) {
    throw new Error('dist/index.html must reference built JavaScript and CSS.');
  }
  if (references.some((reference) => reference.includes('/src/'))) {
    throw new Error('dist/index.html contains a development /src/ reference.');
  }

  for (const reference of references) {
    const relativePath = resolveAssetReference(reference, base);
    const assetPath = path.join(distDirectory, relativePath);
    let assetStats;
    try {
      assetStats = await stat(assetPath);
    } catch {
      throw new Error(`Referenced built asset is missing: ${relativePath}`);
    }
    if (!assetStats.isFile() || assetStats.size === 0) {
      throw new Error(`Referenced built asset is empty: ${relativePath}`);
    }
  }

  const files = await listFiles(distDirectory);
  const names = relativeNames(files, distDirectory);
  const releaseNotices = {
    'LICENSE.txt': path.resolve('LICENSE'),
    'THIRD_PARTY_NOTICES.txt': path.resolve('THIRD_PARTY_NOTICES.txt'),
  };
  for (const [name, authoritativePath] of Object.entries(releaseNotices)) {
    if (!names.includes(name)) {
      throw new Error(`Required release notice is missing from dist: ${name}`);
    }
    const [distributed, authoritative] = await Promise.all([
      readFile(path.join(distDirectory, name), 'utf8'),
      readNormalizedReleaseText(authoritativePath),
    ]);
    if (distributed !== authoritative) {
      throw new Error(
        `Distributed ${name} differs from its authoritative repository copy.`,
      );
    }
  }
  const workers = names.filter((name) =>
    /^assets\/schemaImportWorker-[\w-]+\.js$/u.test(name),
  );
  if (workers.length !== 1) {
    throw new Error(
      `Expected exactly one schema import worker asset; found ${workers.length}.`,
    );
  }
  const workerPath = path.join(distDirectory, ...workers[0].split('/'));
  const workerStats = await stat(workerPath);
  if (workerStats.size === 0) {
    throw new Error('The schema import worker asset is empty.');
  }
  const relaxNgWorkers = names.filter((name) =>
    /^assets\/relaxNgStandardsWorker-[\w-]+\.js$/u.test(name),
  );
  if (relaxNgWorkers.length !== 1) {
    throw new Error(
      `Expected exactly one RELAX NG standards worker asset; found ${relaxNgWorkers.length}.`,
    );
  }
  const relaxNgWorkerPath = path.join(
    distDirectory,
    ...relaxNgWorkers[0].split('/'),
  );
  const relaxNgWorkerStats = await stat(relaxNgWorkerPath);
  if (!relaxNgWorkerStats.isFile() || relaxNgWorkerStats.size === 0) {
    throw new Error('The RELAX NG standards worker asset is empty.');
  }
  if (names.some((name) => name.endsWith('.map'))) {
    throw new Error('Unexpected source-map output was found in dist.');
  }
  if (names.some((name) => name.endsWith('.mjs'))) {
    throw new Error('A production .mjs module was found in dist.');
  }
  const testCorpusAssets = names.filter(
    (name) =>
      /(^|\/)(?:tests|fixtures|conformance)(?:\/|$)/iu.test(name) ||
      /(?:spectest|compacttest)\.xml$/iu.test(name) ||
      /(?:^|\/)oracle\.json$/iu.test(name),
  );
  if (testCorpusAssets.length > 0) {
    throw new Error(
      `Test-only conformance material was bundled into dist: ${testCorpusAssets.join(', ')}.`,
    );
  }

  const xercesRuntimePatterns = {
    glue: /^assets\/xerces-runtime-[\w-]+\.js$/u,
    wasm: /^assets\/xerces-runtime-[\w-]+\.wasm$/u,
    xercesLicense: /^assets\/LICENSE\.xerces-[\w-]+\.txt$/u,
    xercesNotice: /^assets\/NOTICE\.xerces-[\w-]+\.txt$/u,
  };
  const relaxNgRuntimePatterns = {
    glue: /^assets\/libxml2-relaxng-runtime-[\w-]+\.js$/u,
    wasm: /^assets\/libxml2-relaxng-runtime-[\w-]+\.wasm$/u,
    libxml2License: /^assets\/LICENSE\.libxml2-[\w-]+\.txt$/u,
  };
  const sharedRuntimePatterns = {
    emscriptenLicense: /^assets\/LICENSE\.emscripten-[\w-]+\.txt$/u,
  };
  const manifestNames = names.filter((name) =>
    /^assets\/runtime-manifest-[\w-]+\.json$/u.test(name),
  );
  if (manifestNames.length !== 2) {
    throw new Error(
      `Expected exactly two standards runtime manifests; found ${manifestNames.length}.`,
    );
  }
  const manifests = await Promise.all(
    manifestNames.map(async (name) => ({
      name,
      parsed: JSON.parse(
        await readFile(path.join(distDirectory, ...name.split('/')), 'utf8'),
      ),
    })),
  );
  const xercesManifest = manifests.find(
    ({ parsed }) => parsed.engine === 'Apache Xerces-C++',
  );
  const relaxNgManifest = manifests.find(
    ({ parsed }) => parsed.engine === 'libxml2 RELAX NG',
  );
  if (!xercesManifest || !relaxNgManifest) {
    throw new Error('The standards runtime manifests have unexpected engines.');
  }
  /** @type {Record<string, { name: string; size: number }>} */
  const xercesRuntimeAssets = {};
  /** @type {Record<string, { name: string; size: number }>} */
  const relaxNgRuntimeAssets = {};
  /** @type {Record<string, { name: string; size: number }>} */
  const sharedRuntimeAssets = {};
  /**
   * @param {Record<string, RegExp>} patterns
   * @param {Record<string, { name: string; size: number }>} destination
   * @param {string} label
   */
  async function collectRuntimeAssets(patterns, destination, label) {
    for (const [kind, pattern] of Object.entries(patterns)) {
      const matches = names.filter((name) => pattern.test(name));
      if (matches.length !== 1) {
        throw new Error(
          `Expected exactly one ${label} ${kind} asset; found ${matches.length}.`,
        );
      }
      const runtimePath = path.join(distDirectory, ...matches[0].split('/'));
      const runtimeStats = await stat(runtimePath);
      if (!runtimeStats.isFile() || runtimeStats.size === 0) {
        throw new Error(`The ${label} ${kind} asset is empty.`);
      }
      destination[kind] = { name: matches[0], size: runtimeStats.size };
    }
  }
  await collectRuntimeAssets(
    xercesRuntimePatterns,
    xercesRuntimeAssets,
    'Xerces',
  );
  await collectRuntimeAssets(
    relaxNgRuntimePatterns,
    relaxNgRuntimeAssets,
    'RELAX NG',
  );
  await collectRuntimeAssets(
    sharedRuntimePatterns,
    sharedRuntimeAssets,
    'shared runtime',
  );
  xercesRuntimeAssets.manifest = {
    name: xercesManifest.name,
    size: (
      await stat(path.join(distDirectory, ...xercesManifest.name.split('/')))
    ).size,
  };
  relaxNgRuntimeAssets.manifest = {
    name: relaxNgManifest.name,
    size: (
      await stat(path.join(distDirectory, ...relaxNgManifest.name.split('/')))
    ).size,
  };
  xercesRuntimeAssets.emscriptenLicense = sharedRuntimeAssets.emscriptenLicense;
  relaxNgRuntimeAssets.emscriptenLicense =
    sharedRuntimeAssets.emscriptenLicense;

  const javascriptFiles = files.filter((file) => file.endsWith('.js'));
  const javascriptSources = await Promise.all(
    javascriptFiles.map((file) => readFile(file, 'utf8')),
  );
  const javascript = javascriptSources.join('\n');
  const runtimeGluePaths = new Set(
    [xercesRuntimeAssets.glue, relaxNgRuntimeAssets.glue].map(({ name }) =>
      path.resolve(path.join(distDirectory, ...name.split('/'))),
    ),
  );
  const applicationJavascript = (
    await Promise.all(
      javascriptFiles
        .filter((file) => !runtimeGluePaths.has(path.resolve(file)))
        .map((file) => readFile(file, 'utf8')),
    )
  ).join('\n');
  const stylesheetOutput = (
    await Promise.all(
      files
        .filter((file) => file.endsWith('.css'))
        .map((file) => readFile(file, 'utf8')),
    )
  ).join('\n');
  verifyBranchWindowRangeBuildOutput(applicationJavascript, stylesheetOutput);
  const textualFiles = files.filter((file) =>
    /\.(?:css|html|js|json|svg|txt)$/u.test(file),
  );
  const textualOutput = (
    await Promise.all(textualFiles.map((file) => readFile(file, 'utf8')))
  ).join('\n');
  for (const forbiddenRuntime of [
    'xerces-runtime.mjs',
    'libxml2-relaxng-runtime.mjs',
  ]) {
    if (textualOutput.includes(forbiddenRuntime)) {
      throw new Error(`The production build references ${forbiddenRuntime}.`);
    }
  }
  const workerBasename = path.basename(workerPath);
  const relaxNgWorkerBasename = path.basename(relaxNgWorkerPath);
  for (const [label, basename] of [
    ['schema import', workerBasename],
    ['RELAX NG standards', relaxNgWorkerBasename],
  ]) {
    if (!javascript.includes(basename)) {
      throw new Error(
        `The application bundle does not reference the ${label} worker.`,
      );
    }
  }
  for (const [label, assets] of [
    ['Xerces', xercesRuntimeAssets],
    ['RELAX NG', relaxNgRuntimeAssets],
  ]) {
    for (const [kind, asset] of Object.entries(assets)) {
      const basename = path.basename(asset.name);
      if (!javascript.includes(basename)) {
        throw new Error(
          `The production JavaScript does not reference ${label} ${kind}.`,
        );
      }
    }
  }
  const workerSource = await readFile(workerPath, 'utf8');
  const relaxNgWorkerSource = await readFile(relaxNgWorkerPath, 'utf8');
  /**
   * @param {string} label
   * @param {string} source
   * @param {Record<string, { name: string; size: number }>} assets
   */
  function verifyWorkerRuntimeReferences(label, source, assets) {
    for (const kind of ['glue', 'wasm']) {
      const basename = path.basename(assets[kind].name);
      if (!source.includes(basename)) {
        throw new Error(
          `The production ${label} worker does not reference its ${kind}.`,
        );
      }
    }
  }
  verifyWorkerRuntimeReferences('Xerces', workerSource, xercesRuntimeAssets);
  verifyWorkerRuntimeReferences(
    'RELAX NG',
    relaxNgWorkerSource,
    relaxNgRuntimeAssets,
  );
  if (base === './') {
    if (
      javascript.includes(`/assets/${workerBasename}`) ||
      javascript.includes(`/assets/${relaxNgWorkerBasename}`) ||
      javascript.includes('/xml-carousel/assets/')
    ) {
      throw new Error(
        'The portable application bundle embeds a location-specific worker or asset base.',
      );
    }
    for (const [label, basename] of [
      ['schema import', workerBasename],
      ['RELAX NG standards', relaxNgWorkerBasename],
    ]) {
      const escapedWorker = basename.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      const relativeWorkerPattern = new RegExp(
        `new URL\\((?:"|')(?:\\./)?${escapedWorker}(?:"|'),\\s*import\\.meta\\.url\\)`,
        'u',
      );
      if (!relativeWorkerPattern.test(javascript)) {
        throw new Error(
          `The application bundle does not resolve the ${label} worker relative to its module URL.`,
        );
      }
    }
    /**
     * @param {string} label
     * @param {string} source
     * @param {Record<string, { name: string; size: number }>} assets
     */
    function verifyPortableRuntimeReferences(label, source, assets) {
      for (const kind of ['glue', 'wasm']) {
        const basename = path
          .basename(assets[kind].name)
          .replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
        const relativeRuntimePattern = new RegExp(
          `new URL\\((?:"|')(?:\\./)?${basename}(?:"|'),\\s*(?:import\\.meta\\.url|self\\.location\\.href)\\)`,
          'u',
        );
        if (!relativeRuntimePattern.test(source)) {
          throw new Error(
            `The portable production ${label} worker does not resolve its ${kind} relative to its worker URL.`,
          );
        }
      }
    }
    verifyPortableRuntimeReferences(
      'Xerces',
      workerSource,
      xercesRuntimeAssets,
    );
    verifyPortableRuntimeReferences(
      'RELAX NG',
      relaxNgWorkerSource,
      relaxNgRuntimeAssets,
    );
  } else {
    for (const [label, basename] of [
      ['schema import', workerBasename],
      ['RELAX NG standards', relaxNgWorkerBasename],
    ]) {
      const expectedWorkerUrl = `${base}assets/${basename}`;
      if (!javascript.includes(expectedWorkerUrl)) {
        throw new Error(
          `The application bundle does not reference the ${label} worker beneath ${base}.`,
        );
      }
    }
  }
  if (
    !javascript.includes('sample.book.dtd') ||
    !javascript.includes('library.xsd')
  ) {
    throw new Error('Required built-in DTD and XSD sample assets are absent.');
  }
  for (const name of Object.keys(releaseNotices)) {
    if (!applicationJavascript.includes(name)) {
      throw new Error(
        `The application does not provide a local link to ${name}.`,
      );
    }
  }
  if (
    /(?:\bfrom\s*["']node:|\brequire\s*\(|\bprocess\.versions\.node)/u.test(
      applicationJavascript,
    )
  ) {
    throw new Error('The output contains a server-only Node.js dependency.');
  }

  return {
    base,
    indexPath,
    referencedAssets: references.length,
    worker: {
      name: workers[0],
      size: workerStats.size,
    },
    relaxNgWorker: {
      name: relaxNgWorkers[0],
      size: relaxNgWorkerStats.size,
    },
    xercesRuntime: xercesRuntimeAssets,
    relaxNgRuntime: relaxNgRuntimeAssets,
    releaseNotices: Object.keys(releaseNotices),
  };
}

async function main() {
  const expectedBase = parseArguments(process.argv.slice(2));
  const result = await verifyStaticBuild({ expectedBase });
  console.log(
    result.base === './'
      ? `Verified portable relative static build: ${result.referencedAssets} HTML assets; ${result.worker.name} (${result.worker.size} bytes); ${result.relaxNgWorker.name} (${result.relaxNgWorker.size} bytes); ${Object.keys(result.xercesRuntime).length} Xerces and ${Object.keys(result.relaxNgRuntime).length} RELAX NG runtime/attribution assets; ${result.releaseNotices.length} release notices.`
      : `Verified static build for ${result.base}: ${result.referencedAssets} HTML assets; ${result.worker.name} (${result.worker.size} bytes); ${result.relaxNgWorker.name} (${result.relaxNgWorker.size} bytes); ${Object.keys(result.xercesRuntime).length} Xerces and ${Object.keys(result.relaxNgRuntime).length} RELAX NG runtime/attribution assets; ${result.releaseNotices.length} release notices.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Static build verification failed.',
    );
    process.exitCode = 1;
  });
}
