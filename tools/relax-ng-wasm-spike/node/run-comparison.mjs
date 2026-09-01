import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSpike } from './spike-client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const spikeRoot = resolve(here, '..');
const repo = resolve(spikeRoot, '../..');
const fixtures = resolve(repo, 'tests/fixtures/relax-ng-wasm-spike');
const rngRoot = resolve(fixtures, 'synthetic/rng');
const rncRoot = resolve(fixtures, 'synthetic/rnc');
const evidenceRoot = resolve(spikeRoot, '.evidence');
const jingJar = resolve(spikeRoot, '.tools/jing/jing-20241231/bin/jing.jar');
const trangJar = resolve(spikeRoot, '.tools/trang/trang-20241231/trang.jar');
const expected = JSON.parse(
  await readFile(resolve(fixtures, 'expected/cases.json'), 'utf8'),
);

function java(args, cwd) {
  const result = spawnSync('java', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  return {
    exitCode: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

async function createRnv() {
  const { default: createModule } = await import('../dist/rnv-spike.mjs');
  const wasmBinary = await readFile(resolve(spikeRoot, 'dist/rnv-spike.wasm'));
  const errors = [];
  const module = await createModule({
    wasmBinary,
    printErr: (line) => errors.push(line),
  });
  return {
    version: module.cwrap('rnv_spike_version', 'string', [])(),
    run(bytes) {
      const pointer = module._malloc(bytes.length);
      module.writeArrayToMemory(bytes, pointer);
      const code = module.cwrap('rnv_spike_parse', 'number', [
        'number',
        'number',
      ])(pointer, bytes.length);
      module._free(pointer);
      return {
        status: code === 0 ? 'accepted' : 'invalid',
        diagnostics: [...errors],
      };
    },
  };
}

await mkdir(evidenceRoot, { recursive: true });
const rngComparison = [];
for (const classification of ['accepted', 'invalid']) {
  for (const entry of expected.rng[classification]) {
    const jing = java(['-jar', jingJar, entry], rngRoot);
    const actual = jing.exitCode === 0 ? 'accepted' : 'invalid';
    rngComparison.push({
      entry,
      expected: classification,
      jing: actual,
      agreement: actual === classification ? 'AGREE' : 'INVESTIGATE',
      diagnostics: jing.stderr,
    });
  }
}
for (const entry of expected.rng.blocked) {
  rngComparison.push({
    entry,
    expected: 'blocked',
    jing: 'not-run-network-policy-case',
    agreement: 'ACCEPTED_BOUNDARY_DIFFERENCE',
    diagnostics: '',
  });
}
assert.equal(
  rngComparison.filter((item) => item.agreement === 'INVESTIGATE').length,
  0,
);

const rncComparison = [];
for (const classification of ['accepted', 'invalid']) {
  for (const entry of expected.rnc[classification]) {
    const jing = java(['-jar', jingJar, '-c', entry], rncRoot);
    const jingStatus = jing.exitCode === 0 ? 'accepted' : 'invalid';
    const rnv = await createRnv();
    const rnvResult = rnv.run(await readFile(resolve(rncRoot, entry)));
    const knownRnvLimitation = [
      'include-main.rnc',
      'external.rnc',
      'missing.rnc',
      'invalid-restriction.rnc',
    ].includes(entry);
    const agreement =
      jingStatus !== classification
        ? 'INVESTIGATE'
        : jingStatus === rnvResult.status
          ? 'AGREE'
          : knownRnvLimitation
            ? 'KNOWN_IMPLEMENTATION_LIMITATION'
            : 'INVESTIGATE';
    rncComparison.push({
      entry,
      expected: classification,
      jing: jingStatus,
      rnv: rnvResult.status,
      agreement,
      jingDiagnostics: jing.stderr,
      rnvDiagnostics: rnvResult.diagnostics,
    });
  }
}
rncComparison.push({
  entry: 'blocked-remote.rnc',
  expected: 'blocked',
  jing: 'not-run-network-policy-case',
  rnv: 'not-run-network-policy-case',
  agreement: 'ACCEPTED_BOUNDARY_DIFFERENCE',
});
const rncInvestigate = rncComparison.filter(
  (item) => item.agreement === 'INVESTIGATE',
);
assert.equal(rncInvestigate.length, 0, JSON.stringify(rncInvestigate));

const translationEntries = [
  'simple.rnc',
  'attribute.rnc',
  'choice.rnc',
  'group.rnc',
  'interleave.rnc',
  'repetition.rnc',
  'definition.rnc',
  'name-class.rnc',
  'datatype.rnc',
];
const libxml = await createSpike();
const translations = [];
const generatedRoot = resolve(evidenceRoot, 'trang-generated');
await mkdir(generatedRoot, { recursive: true });
let attemptId = 5000;
for (const entry of translationEntries) {
  const outputName = entry.replace(/\.rnc$/, '.rng');
  const outputPath = resolve(generatedRoot, outputName);
  const trang = java(
    ['-jar', trangJar, resolve(rncRoot, entry), outputPath],
    repo,
  );
  let libxmlStatus = 'not-generated';
  if (trang.exitCode === 0) {
    const bytes = await readFile(outputPath);
    libxmlStatus = libxml.run({
      attemptId: attemptId++,
      entryPath: outputName,
      files: [{ path: outputName, bytes }],
    }).status;
  }
  translations.push({
    entry,
    trang: trang.exitCode === 0 ? 'converted' : 'failed',
    libxml: libxmlStatus,
    semanticAgreement:
      trang.exitCode === 0 && libxmlStatus === 'accepted'
        ? 'AGREE'
        : 'INVESTIGATE',
    diagnostics: trang.stderr,
  });
}
assert.equal(
  translations.filter((item) => item.semanticAgreement === 'INVESTIGATE')
    .length,
  0,
);

const evidence = {
  createdUtc: new Date().toISOString(),
  jingRelease: 'V20241231',
  trangRelease: 'V20241231',
  rnvVersion: '1.7',
  rngComparison,
  rngCounts: {
    agree: rngComparison.filter((item) => item.agreement === 'AGREE').length,
    boundaryDifference: rngComparison.filter(
      (item) => item.agreement === 'ACCEPTED_BOUNDARY_DIFFERENCE',
    ).length,
    investigate: 0,
  },
  rncComparison,
  rncCounts: {
    agree: rncComparison.filter((item) => item.agreement === 'AGREE').length,
    knownImplementationLimitation: rncComparison.filter(
      (item) => item.agreement === 'KNOWN_IMPLEMENTATION_LIMITATION',
    ).length,
    boundaryDifference: rncComparison.filter(
      (item) => item.agreement === 'ACCEPTED_BOUNDARY_DIFFERENCE',
    ).length,
    investigate: 0,
  },
  translations,
};
await writeFile(
  resolve(evidenceRoot, 'comparison.json'),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(
  `PASS Jing RNG: ${evidence.rngCounts.agree} agree, ${evidence.rngCounts.boundaryDifference} policy boundaries, 0 investigate`,
);
console.log(
  `PASS Jing/RNV RNC: ${evidence.rncCounts.agree} agree, ${evidence.rncCounts.knownImplementationLimitation} known loader limitations, 0 investigate`,
);
console.log(
  `PASS Trang/libxml2: ${translations.length}/${translations.length} translations accepted`,
);
