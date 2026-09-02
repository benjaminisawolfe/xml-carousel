import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';

import {
  gitBlobId,
  loadAuthorityCases,
  sha256,
} from './relax-ng-conformance-corpus.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(repo, 'tests/fixtures/relax-ng/conformance');
const manifestPath = resolve(root, 'manifest.json');

const projects = [
  {
    id: 'docbook-5.1',
    project: 'DocBook 5.1',
    repository: 'https://github.com/docbook/docbook',
    release: '5.2',
    commit: '7bf26df21266c00d38ea1d3033bcd70c2b280a59',
    root: 'real-world/docbook-5.1',
    entryPath: 'docbook.rng',
    licence: 'DocBook schema redistribution grant',
    licencePath: 'copyright.xml',
    features: ['large grammar', 'annotations', 'namespaces', 'datatypes'],
  },
  {
    id: 'epubcheck-5.3.0',
    project: 'EPUBCheck package schema',
    repository: 'https://github.com/w3c/epubcheck',
    release: 'v5.3.0',
    commit: '029831b8f477e4519e9734c984ee24357547a698',
    root: 'real-world/epubcheck-5.3.0',
    entryPath: 'package-30.rnc',
    licence: 'MIT',
    licencePath: 'LICENSE',
    features: ['Compact Syntax', 'multi-file grammar', 'datatypes'],
  },
  {
    id: 'validator-26.8.30',
    project: 'Validator.nu HTML5 schema',
    repository: 'https://github.com/validator/validator',
    release: '26.8.30',
    commit: 'f84563f28898457af3cb76ec8c820cf17a2174c4',
    root: 'real-world/validator-26.8.30',
    entryPath: 'html5/html5.rnc',
    licence: 'MIT',
    licencePath: 'LICENSE',
    features: ['Compact Syntax', 'large grammar', 'multi-file grammar'],
  },
];

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(path)));
    else files.push(path);
  }
  return files.sort();
}

async function identity(path, base) {
  const bytes = await readFile(path);
  return {
    localPath: relative(root, path).replaceAll('\\', '/'),
    upstreamPath: relative(base, path).replaceAll('\\', '/'),
    bytes: bytes.length,
    gitBlob: gitBlobId(bytes),
    sha256: sha256(bytes),
  };
}

const authorityRoot = resolve(root, 'upstream/jing-trang-v20241231');
const authorityFiles = await Promise.all(
  (await filesBelow(authorityRoot)).map((path) =>
    identity(path, authorityRoot),
  ),
);
const cases = await loadAuthorityCases(pathToFileURL(`${repo}/`));
const boundaryPath = resolve(root, 'expected-boundaries.json');
const oraclePath = resolve(root, 'oracle.json');
const expectedOracleSha256 =
  '053dcf0670e26e4bb5509e4234d0533e45e9f1843ebaddba2b306dc7c484d39c';
const boundaryAuthority = JSON.parse(await readFile(boundaryPath, 'utf8'));
if (sha256(await readFile(oraclePath)) !== expectedOracleSha256) {
  throw new Error(
    'Committed Jing/Trang oracle identity changed; reproduce and review it with npm run relaxng:oracle.',
  );
}
const knownCaseIds = new Set([
  ...cases.spectest.map(({ id }) => id),
  ...cases.compacttest.map(({ id }) => id),
  ...projects.map(({ id }) => `real-world:${id}`),
]);
for (const record of boundaryAuthority.records) {
  if (!knownCaseIds.has(record.caseId)) {
    throw new Error(`Unknown RELAX NG boundary case: ${record.caseId}`);
  }
}
const realWorld = [];
for (const project of projects) {
  const projectRoot = resolve(root, project.root);
  const files = await Promise.all(
    (await filesBelow(projectRoot)).map((path) => identity(path, projectRoot)),
  );
  realWorld.push({
    ...project,
    fileCount: files.length,
    schemaFileCount: files.filter(({ localPath }) =>
      /\.rnc?$|\.rng$/u.test(localPath),
    ).length,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    files,
  });
}

const manifest = {
  schemaVersion: 1,
  authority: 'XML Carousel Task 17.9 RELAX NG conformance authority',
  upstream: {
    repository: 'https://github.com/relaxng/jing-trang',
    tag: 'V20241231',
    commit: 'a6bc0041035988325dfbfe7823ef2c098fc56597',
    licence: 'BSD-3-Clause',
    licencePath: 'upstream/jing-trang-v20241231/copying.txt',
    files: authorityFiles,
  },
  suites: [
    {
      id: 'jing-trang-spectest',
      upstreamPath: 'mod/rng-validate/test/spectest.xml',
      upstreamGitBlob: 'fb16f8371030b6e79578ffbf3d15e2a02d74514c',
      purpose: 'RELAX NG XML-syntax schema compilation conformance',
      caseCount: cases.spectest.length,
      selectedCount: cases.spectest.length,
      excludedCount: 0,
    },
    {
      id: 'jing-trang-compacttest',
      upstreamPath: 'mod/rng-schema/test/compacttest.xml',
      upstreamGitBlob: 'f598025bb3836f06ffcf17da66a3f9ba07ea11b2',
      purpose: 'Compact Syntax acceptance and translation equivalence',
      caseCount: cases.compacttest.length,
      selectedCount: cases.compacttest.length,
      excludedCount: 0,
    },
  ],
  classifications: [
    'selected-product-schema-conformance',
    'selected-rnc-translation-conformance',
  ],
  resultCategories: [
    'pass/agrees',
    'production-invalid-as-expected',
    'expected-security-policy-difference',
    'expected-product-boundary',
    'oracle-disagreement-investigate',
    'harness-error',
  ],
  expectedBoundaries: {
    count: boundaryAuthority.records.length,
    categories: Object.fromEntries(
      [...new Set(boundaryAuthority.records.map(({ category }) => category))]
        .sort()
        .map((category) => [
          category,
          boundaryAuthority.records.filter(
            (record) => record.category === category,
          ).length,
        ]),
    ),
    file: await identity(boundaryPath, root),
  },
  oracle: {
    file: await identity(oraclePath, root),
  },
  cases: [...cases.spectest, ...cases.compacttest].map(
    ({ source, expectedXml, files, ...record }) => ({
      ...record,
      sourceSha256: sha256(Buffer.from(source)),
      ...(files === undefined
        ? {}
        : {
            files: files.map(({ path, source: fileSource }) => ({
              path,
              sha256: sha256(Buffer.from(fileSource)),
            })),
          }),
      ...(expectedXml === undefined
        ? {}
        : { expectedMeaningSha256: sha256(Buffer.from(expectedXml)) }),
    }),
  ),
  realWorld,
};

const serialized = await format(JSON.stringify(manifest), {
  ...(await resolveConfig(manifestPath)),
  parser: 'json',
});
if (process.argv.includes('--write')) {
  await writeFile(manifestPath, serialized);
} else {
  const committed = await readFile(manifestPath, 'utf8');
  if (committed !== serialized) {
    throw new Error(
      'RELAX NG conformance manifest is stale; run npm run relaxng:conformance:generate.',
    );
  }
}

console.log(
  `RELAX_NG_CORPUS ${JSON.stringify({
    spectest: cases.spectest.length,
    compacttest: cases.compacttest.length,
    selected: cases.spectest.length + cases.compacttest.length,
    excluded: 0,
    realWorldProjects: realWorld.length,
    realWorldSchemaFiles: realWorld.reduce(
      (total, project) => total + project.schemaFileCount,
      0,
    ),
    manifestDigest: sha256(Buffer.from(serialized)),
  })}`,
);
