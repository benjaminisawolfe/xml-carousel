import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadAuthorityCases, sha256 } from './relax-ng-conformance-corpus.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const spike = resolve(repo, 'tools/relax-ng-wasm-spike');
const oraclePath = resolve(
  repo,
  'tests/fixtures/relax-ng/conformance/oracle.json',
);
const jingArchive = resolve(spike, '.cache/comparators/jing-20241231.zip');
const trangArchive = resolve(spike, '.cache/comparators/trang-20241231.zip');
const jingJar = resolve(spike, '.tools/jing/jing-20241231/bin/jing.jar');
const trangJar = resolve(spike, '.tools/trang/trang-20241231/trang.jar');
const pins = {
  jingArchiveSha256:
    'd11a765f9106e398e01d66aaffb629beb1da21f8a716299e2930a751130bfad2',
  trangArchiveSha256:
    'eceaa8331377b78fcec6094de8e67d81649bc0c322be3fd2cbb39b4c4c7f3af8',
};
const compactHarnessDifferences = new Map([
  [
    'compacttest:006',
    'The unit authority supplies no x.rnc resource; the command-line translator resolves external and therefore cannot complete.',
  ],
  [
    'compacttest:061',
    'The unit authority supplies no x.rnc resource; the command-line translator resolves include and therefore cannot complete.',
  ],
  [
    'compacttest:075',
    'The unit authority supplies no x.rnc resource; the command-line translator resolves include and therefore cannot complete.',
  ],
  [
    'compacttest:089',
    'The unit authority accepts an empty translation fragment; the standalone Trang command requires a schema document.',
  ],
]);
const compactUpstreamToolDifferences = new Map([
  [
    'compacttest:088',
    'The compacttest unit authority rejects a reserved annotation name that the pinned Jing and Trang command-line front ends accept.',
  ],
]);

for (const [path, expected] of [
  [jingArchive, pins.jingArchiveSha256],
  [trangArchive, pins.trangArchiveSha256],
]) {
  const actual = sha256(await readFile(path));
  if (actual !== expected)
    throw new Error(`Pinned oracle archive mismatch: ${path}`);
}

function java(args, cwd) {
  const result = spawnSync('java', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return result.status === 0 ? 'accepted' : 'invalid';
}

const cases = await loadAuthorityCases(pathToFileURL(`${repo}/`));
const temporary = await mkdtemp(
  resolve(tmpdir(), 'xml-carousel-relaxng-oracle-'),
);
try {
  const spectest = [];
  for (const testCase of cases.spectest) {
    const caseRoot = resolve(temporary, testCase.id.replaceAll(':', '-'));
    for (const file of testCase.files) {
      const path = resolve(caseRoot, file.path);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${file.source}\n`);
    }
    const jing = java(
      ['-jar', jingJar, resolve(caseRoot, testCase.entryPath)],
      caseRoot,
    );
    spectest.push({
      id: testCase.id,
      expected: testCase.expected,
      jing,
      comparison: jing === testCase.expected ? 'AGREE' : 'INVESTIGATE',
    });
  }

  const compacttest = [];
  for (const testCase of cases.compacttest) {
    const stem = testCase.id.replaceAll(':', '-');
    const input = resolve(temporary, `${stem}.rnc`);
    const output = resolve(temporary, `${stem}.rng`);
    await writeFile(input, `${testCase.source}\n`);
    const jing = java(['-jar', jingJar, '-c', input], temporary);
    const trangResult = spawnSync('java', ['-jar', trangJar, input, output], {
      cwd: temporary,
      encoding: 'utf8',
      windowsHide: true,
    });
    if (trangResult.error) throw trangResult.error;
    const trang = trangResult.status === 0 ? 'accepted' : 'invalid';
    const harnessReason = compactHarnessDifferences.get(testCase.id);
    const upstreamToolReason = compactUpstreamToolDifferences.get(testCase.id);
    const comparison =
      trang === testCase.expected
        ? 'AGREE'
        : harnessReason !== undefined
          ? 'EXPECTED_HARNESS_DIFFERENCE'
          : upstreamToolReason !== undefined
            ? 'EXPECTED_UPSTREAM_TOOL_DIFFERENCE'
            : 'INVESTIGATE';
    compacttest.push({
      id: testCase.id,
      expected: testCase.expected,
      jing,
      trang,
      comparison,
      ...(harnessReason === undefined && upstreamToolReason === undefined
        ? {}
        : { reason: harnessReason ?? upstreamToolReason }),
    });
  }

  const oracle = {
    schemaVersion: 1,
    authority: 'Jing/Trang V20241231',
    repository: 'https://github.com/relaxng/jing-trang',
    tag: 'V20241231',
    commit: 'a6bc0041035988325dfbfe7823ef2c098fc56597',
    ...pins,
    jingJarSha256: sha256(await readFile(jingJar)),
    trangJarSha256: sha256(await readFile(trangJar)),
    spectest,
    compacttest,
  };
  const serialized = `${JSON.stringify(oracle, null, 2)}\n`;
  if (process.argv.includes('--write')) {
    await writeFile(oraclePath, serialized);
  } else {
    const committed = await readFile(oraclePath, 'utf8');
    if (committed !== serialized) {
      throw new Error('Committed Jing/Trang oracle evidence is stale.');
    }
  }
  const investigate = [...spectest, ...compacttest].filter(
    ({ comparison }) => comparison === 'INVESTIGATE',
  );
  if (investigate.length > 0) {
    throw new Error(
      `Pinned oracle disagreement: ${investigate
        .slice(0, 10)
        .map(({ id }) => id)
        .join(', ')}`,
    );
  }
  console.log(
    `RELAX_NG_ORACLE ${JSON.stringify({
      jingSchemaAgreement: spectest.length,
      trangTranslationAgreement: compacttest.filter(
        ({ comparison }) => comparison === 'AGREE',
      ).length,
      expectedHarnessDifferences: compacttest.filter(
        ({ comparison }) => comparison === 'EXPECTED_HARNESS_DIFFERENCE',
      ).length,
      expectedUpstreamToolDifferences: compacttest.filter(
        ({ comparison }) => comparison === 'EXPECTED_UPSTREAM_TOOL_DIFFERENCE',
      ).length,
      investigate: 0,
      digest: sha256(Buffer.from(serialized)),
    })}`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
