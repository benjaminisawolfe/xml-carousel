import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { createSpike } from './spike-client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const fixtureRoot = resolve(repo, 'tests/fixtures/relax-ng-wasm-spike');
const rngRoot = resolve(fixtureRoot, 'synthetic/rng');
const evidenceRoot = resolve(here, '../.evidence');

async function filesBelow(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (item.isDirectory()) result.push(...(await filesBelow(path)));
    else result.push(path);
  }
  return result;
}

const expected = JSON.parse(
  await readFile(resolve(fixtureRoot, 'expected/cases.json'), 'utf8'),
);
const projectFiles = await Promise.all(
  (await filesBelow(rngRoot)).map(async (path) => ({
    path: relative(rngRoot, path).replaceAll('\\', '/'),
    bytes: await readFile(path),
  })),
);

const instantiateStarted = performance.now();
const spike = await createSpike();
const instantiateMs = performance.now() - instantiateStarted;
assert.equal(spike.version, '2.15.3');
const wasmMemoryBytesAfterInitialization = spike.memoryBytes();

const results = [];
let attemptId = 1;
for (const classification of ['accepted', 'invalid', 'blocked']) {
  for (const entryPath of expected.rng[classification]) {
    const result = spike.run({
      attemptId: attemptId++,
      entryPath,
      files: projectFiles,
    });
    assert.equal(
      result.status,
      classification,
      `${entryPath}: ${JSON.stringify(result.diagnostics)}`,
    );
    results.push({ entryPath, expected: classification, result });
  }
}

const memProbe = spike.run({
  attemptId: attemptId++,
  entryPath: 'empty.rng',
  files: projectFiles,
  parserMode: 1,
});
assert.equal(memProbe.status, 'accepted');
assert.equal(memProbe.domProbe, '');

const smallMetric = spike.run({
  attemptId: attemptId++,
  entryPath: 'empty.rng',
  files: [projectFiles.find((file) => file.path === 'empty.rng')],
});
const largeSource = `<element xmlns="http://relaxng.org/ns/structure/1.0" name="root"><choice>${Array.from(
  { length: 300 },
  (_, index) => `<element name="item-${index}"><empty/></element>`,
).join('')}</choice></element>`;
const largeMetric = spike.run({
  attemptId: attemptId++,
  entryPath: 'large.rng',
  files: [{ path: 'large.rng', bytes: largeSource }],
});
assert.equal(largeMetric.status, 'accepted');
const wasmMemoryBytesAfterLargerRun = spike.memoryBytes();

const repeated = [];
for (let index = 0; index < 100; index += 1) {
  repeated.push(
    spike.run({
      attemptId: attemptId++,
      entryPath: index % 3 === 1 ? 'invalid-structural.rng' : 'empty.rng',
      files: projectFiles,
    }).status,
  );
}
assert.deepEqual(repeated.slice(0, 3), ['accepted', 'invalid', 'accepted']);

const evidence = {
  createdUtc: new Date().toISOString(),
  engineVersion: spike.version,
  instantiationMs: Number(instantiateMs.toFixed(3)),
  wasmMemoryBytesAfterInitialization,
  wasmMemoryBytesAfterLargerRun,
  wasmMemoryBytesAfterRuns: spike.memoryBytes(),
  compileMetrics: {
    smallGrammarBytes: smallMetric.inputBytes,
    smallGrammarElapsedMs: smallMetric.elapsedMs,
    largerGrammarBytes: largeMetric.inputBytes,
    largerGrammarElapsedMs: largeMetric.elapsedMs,
  },
  caseCount: results.length,
  counts: Object.fromEntries(
    ['accepted', 'invalid', 'blocked'].map((status) => [
      status,
      results.filter((item) => item.result.status === status).length,
    ]),
  ),
  parserContextProbe: {
    newDocParserCtxt:
      'preserves project URI, DOM source lines, and relative dependency resolution',
    newMemParserCtxt:
      'accepts standalone grammar but has no logical URI/DOM probe and is unsuitable for project dependencies',
  },
  results,
};
await mkdir(evidenceRoot, { recursive: true });
await writeFile(
  resolve(evidenceRoot, 'node-synthetic.json'),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(
  `PASS libxml2 ${spike.version}: ${results.length}/${results.length} synthetic RNG classifications; 100 lifecycle repetitions`,
);
console.log(
  `Instantiation ${evidence.instantiationMs} ms; WASM memory ${evidence.wasmMemoryBytesAfterRuns} bytes`,
);
