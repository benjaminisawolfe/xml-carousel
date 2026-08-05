import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateProductionThirdPartyNotices } from './production-third-party-notices.mjs';
import {
  loadXmltestArchiveFixture,
  xmltestSelectedEntries,
} from './xmltest-archive-fixture.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

/** @param {string} relativePath */
async function readRepositoryFile(relativePath) {
  return readFile(
    path.join(repositoryRoot, ...relativePath.split('/')),
    'utf8',
  );
}

/** @param {string} relativePath */
async function exists(relativePath) {
  try {
    return (
      await stat(path.join(repositoryRoot, ...relativePath.split('/')))
    ).isFile();
  } catch {
    return false;
  }
}

/**
 * @param {string} directory
 * @returns {Promise<string[]>}
 */
async function listFiles(directory) {
  const absolute = path.join(repositoryRoot, ...directory.split('/'));
  try {
    const entries = await readdir(absolute, { withFileTypes: true });
    /** @type {string[]} */
    const files = [];
    for (const entry of entries) {
      const child = `${directory}/${entry.name}`;
      if (entry.isDirectory()) files.push(...(await listFiles(child)));
      else if (entry.isFile()) files.push(child);
    }
    return files;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * @param {string} source
 * @param {string} file
 * @param {readonly string[]} snippets
 * @param {string[]} errors
 */
function requireText(source, file, snippets, errors) {
  for (const snippet of snippets) {
    if (!source.includes(snippet)) {
      errors.push(`${file}: missing required text: ${snippet}`);
    }
  }
}

export async function verifyReleaseIntegrity() {
  /** @type {string[]} */
  const errors = [];
  const packageJson = JSON.parse(await readRepositoryFile('package.json'));
  if (packageJson.license !== 'CC0-1.0') {
    errors.push('package.json: license must be CC0-1.0.');
  }
  if (
    packageJson.scripts?.['verify:release-integrity'] !==
    'node scripts/verify-release-integrity.mjs'
  ) {
    errors.push('package.json: verify:release-integrity script is missing.');
  }

  const applicationLicense = await readRepositoryFile('LICENSE');
  requireText(
    applicationLicense,
    'LICENSE',
    ['Creative Commons Legal Code', 'CC0 1.0 Universal'],
    errors,
  );

  const runtimeManifest =
    /** @type {{ attributionFiles?: Array<{ file: string }> }} */ (
      JSON.parse(
        await readRepositoryFile(
          'src/standards/xerces/runtime/runtime-manifest.json',
        ),
      )
    );
  const attributionFiles = runtimeManifest.attributionFiles?.map(
    ({ file }) => file,
  );
  if (
    JSON.stringify(attributionFiles) !==
    JSON.stringify([
      'LICENSE.xerces.txt',
      'NOTICE.xerces.txt',
      'LICENSE.emscripten.txt',
    ])
  ) {
    errors.push(
      'runtime-manifest.json: expected Xerces and Emscripten attribution files.',
    );
  }

  const expectedNotices = await generateProductionThirdPartyNotices();
  const notices = await readRepositoryFile('THIRD_PARTY_NOTICES.txt');
  if (notices !== expectedNotices) {
    errors.push(
      'THIRD_PARTY_NOTICES.txt: differs from locked production package license sources.',
    );
  }
  requireText(
    notices,
    'THIRD_PARTY_NOTICES.txt',
    [
      'Apache Xerces-C++ 3.3.0',
      'Emscripten 6.0.5',
      'svelte 5.56.7',
      'jszip 3.10.1',
      'CC0 does not apply to any third-party component or fixture.',
    ],
    errors,
  );

  await loadXmltestArchiveFixture();
  const prohibitedRoot =
    'tests/fixtures/w3c-xmlconf-20130923/ci-corpus/xmltest';
  const unpacked = await listFiles(prohibitedRoot);
  if (unpacked.length > 0) {
    errors.push(
      `${prohibitedRoot}: unpacked James Clark files remain: ${unpacked.join(', ')}`,
    );
  }
  for (const entry of xmltestSelectedEntries) {
    if (
      await exists(
        `tests/fixtures/w3c-xmlconf-20130923/ci-corpus/${entry.manifestPath}`,
      )
    ) {
      errors.push(`Unpacked James Clark entry remains: ${entry.manifestPath}`);
    }
  }

  const provenancePath =
    'tests/fixtures/third-party/james-clark-xmltest/README.md';
  const provenance = await readRepositoryFile(provenancePath);
  requireText(
    provenance,
    provenancePath,
    [
      'James Clark',
      '107,060 bytes',
      'a919d7142fe6f72af51fc796b4df40732f385c9eb313b8993c6d39cc92acc410',
      'unchanged',
      'xmltest/readme.html',
      'It is third-party test material',
      'CC0',
      'must not be committed or redistributed separately',
      'performs no network access',
    ],
    errors,
  );

  const xsdFixtureNotice = await readRepositoryFile(
    'tests/fixtures/w3c-xsd-1.0/2007-06-20/00COPYRIGHT',
  );
  requireText(
    xsdFixtureNotice,
    'tests/fixtures/w3c-xsd-1.0/2007-06-20/00COPYRIGHT',
    [
      'Copyright (C) World Wide Web Consortium 2006, 2007',
      'W3C DOCUMENT NOTICE AND LICENSE',
    ],
    errors,
  );
  const docbook = await readRepositoryFile(
    'tests/fixtures/dtd/sdocbook/sdocbook.dtd',
  );
  requireText(
    docbook,
    'tests/fixtures/dtd/sdocbook/sdocbook.dtd',
    ['Copyright 1992-2001', 'Permission to use, copy, modify and distribute'],
    errors,
  );

  const manifest =
    /** @type {{
     *   selection?: { ciTests?: number },
     *   tests: Array<{
     *     id: string,
     *     selected?: boolean,
     *     runInCi?: boolean,
     *     requiredFileSha256?: Record<string, string>,
     *   }>,
     * }} */ (
      JSON.parse(
        await readRepositoryFile(
          'tests/fixtures/w3c-xmlconf-20130923/dtd-selected-tests.json',
        ),
      )
    );
  const selected = manifest.tests.find(({ id }) => id === 'invalid-not-sa-022');
  if (!selected?.selected || !selected?.runInCi) {
    errors.push(
      'dtd-selected-tests.json: invalid-not-sa-022 must remain selected and in CI.',
    );
  }
  if (manifest.selection?.ciTests !== 64) {
    errors.push('dtd-selected-tests.json: expected 64 classified CI rows.');
  }
  for (const entry of xmltestSelectedEntries) {
    if (selected?.requiredFileSha256?.[entry.manifestPath] !== entry.sha256) {
      errors.push(
        `dtd-selected-tests.json: wrong archive-backed hash for ${entry.manifestPath}.`,
      );
    }
  }

  const harnessPath =
    'tools/xerces-wasm-spike/tests/w3c-dtd-conformance.spike.ts';
  const harness = await readRepositoryFile(harnessPath);
  requireText(
    harness,
    harnessPath,
    ['loadXmltestArchiveFixture', 'archiveBackedCiFiles.get(fileName)'],
    errors,
  );
  if (/\bfetch\s*\(|https?:\/\/|ftp:\/\//u.test(harness)) {
    errors.push(
      `${harnessPath}: archive-backed CI loading must not use a network.`,
    );
  }

  const generatorPath = 'scripts/generate-w3c-dtd-manifest.mjs';
  const generator = await readRepositoryFile(generatorPath);
  requireText(
    generator,
    generatorPath,
    xmltestSelectedEntries.map(({ manifestPath }) => manifestPath),
    errors,
  );

  const validation = await readRepositoryFile('scripts/run-validation.mjs');
  requireText(
    validation,
    'scripts/run-validation.mjs',
    [
      "['run', 'verify:release-integrity']",
      "['run', 'acceptance:complete-visualization']",
    ],
    errors,
  );

  const viteConfig = await readRepositoryFile('vite.config.ts');
  requireText(
    viteConfig,
    'vite.config.ts',
    [
      "['LICENSE', 'LICENSE.txt']",
      "['THIRD_PARTY_NOTICES.txt', 'THIRD_PARTY_NOTICES.txt']",
      'readNormalizedReleaseText',
    ],
    errors,
  );

  const releaseTextAssets = await readRepositoryFile(
    'scripts/release-text-assets.js',
  );
  requireText(
    releaseTextAssets,
    'scripts/release-text-assets.js',
    ["replace(/\\r\\n?/gu, '\\n')", 'readNormalizedReleaseText'],
    errors,
  );

  const staticBuildVerifier = await readRepositoryFile(
    'scripts/verify-static-build.mjs',
  );
  requireText(
    staticBuildVerifier,
    'scripts/verify-static-build.mjs',
    ['readNormalizedReleaseText(authoritativePath)'],
    errors,
  );

  /** @type {Array<[string, string[]]>} */
  const documentationRequirements = [
    [
      'README.md',
      [
        'Apache Xerces-C++',
        'XML Schema 1.0',
        'npm run verify:release-integrity',
        'THIRD_PARTY_NOTICES.txt',
      ],
    ],
    [
      'docs/standards-support.md',
      [
        '221/221',
        'XSD 1.1 is not supported',
        'foundry-common.xsd',
        'security-blocked',
      ],
    ],
    [
      'docs/third-party-licensing.md',
      [
        'James Clark',
        'unresolved historical redistribution',
        'LICENSE.xerces.txt',
        'LICENSE.emscripten.txt',
      ],
    ],
    [
      'docs/technical/xmltest-history-audit.md',
      [
        '70917bef925c7e86a31b2b2802dea0f68907d5f3',
        'b639f2551cccbc2a4b6264e1c199dd236c943185',
        '26f2d8beb2acdf8d2a062831ce2790f449e33f69',
        'Unresolved historical redistribution',
      ],
    ],
  ];
  for (const [file, snippets] of documentationRequirements) {
    const source = await readRepositoryFile(file);
    requireText(source, file, snippets, errors);
  }

  if (errors.length > 0) {
    throw new Error(
      `Release documentation/licensing integrity failed:\n${errors
        .map((error) => `- ${error}`)
        .join('\n')}`,
    );
  }
  return {
    bundledJavaScriptComponents: 16,
    archiveBackedCase: 'invalid-not-sa-022',
    archiveEntries: xmltestSelectedEntries.length,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  verifyReleaseIntegrity()
    .then((result) => {
      console.log(
        `Verified release documentation and licensing: ${result.bundledJavaScriptComponents} bundled JavaScript components; ${result.archiveBackedCase}; ${result.archiveEntries} archive entries.`,
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
