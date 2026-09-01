import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSpike } from './spike-client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const spikeRoot = resolve(here, '..');
const selection = JSON.parse(
  await readFile(
    resolve(spikeRoot, 'manifests/selected-relaxng-cases.json'),
    'utf8',
  ),
);
const suitePath = resolve(
  spikeRoot,
  '.cache/comparators/jing-trang-spectest.xml',
);
const suite = await readFile(suitePath, 'utf8');
const jingJar = resolve(spikeRoot, '.tools/jing/jing-20241231/bin/jing.jar');
const generated = resolve(spikeRoot, '.evidence/selected-suite');
await mkdir(generated, { recursive: true });

const byKind = Object.fromEntries(
  ['correct', 'incorrect'].map((kind) => [
    kind,
    [...suite.matchAll(new RegExp(`<${kind}>([\\s\\S]*?)</${kind}>`, 'g'))].map(
      (match) => match[1].trim(),
    ),
  ]),
);
const libxml = await createSpike();
const results = [];
let attemptId = 8000;
for (const selected of selection.selection) {
  const source = byKind[selected.kind][selected.index];
  assert.ok(
    source,
    `Missing selected ${selected.kind} index ${selected.index}`,
  );
  const name = `${selected.kind}-${String(selected.index).padStart(3, '0')}.rng`;
  const path = resolve(generated, name);
  await writeFile(path, `${source}\n`);
  const expected = selected.kind === 'correct' ? 'accepted' : 'invalid';
  const wasm = libxml.run({
    attemptId: attemptId++,
    entryPath: name,
    files: [{ path: name, bytes: source }],
  });
  const jingRun = spawnSync('java', ['-jar', jingJar, path], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const jing = jingRun.status === 0 ? 'accepted' : 'invalid';
  results.push({
    ...selected,
    expected,
    libxml: wasm.status,
    jing,
    agreement:
      wasm.status === expected && jing === expected ? 'AGREE' : 'INVESTIGATE',
  });
}
const investigate = results.filter((item) => item.agreement === 'INVESTIGATE');
assert.equal(investigate.length, 0, JSON.stringify(investigate));
const evidence = {
  createdUtc: new Date().toISOString(),
  authority: selection.authority,
  sourceSha256: selection.sourceSha256,
  selectedCount: results.length,
  libxmlAgreementCount: results.filter((item) => item.libxml === item.expected)
    .length,
  jingAgreementCount: results.filter((item) => item.jing === item.expected)
    .length,
  unexpectedDisagreementCount: investigate.length,
  results,
};
await writeFile(
  resolve(spikeRoot, '.evidence/selected-suite.json'),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(
  `PASS selected external suite: libxml2 ${evidence.libxmlAgreementCount}/${results.length}, Jing ${evidence.jingAgreementCount}/${results.length}, 0 unexpected`,
);
