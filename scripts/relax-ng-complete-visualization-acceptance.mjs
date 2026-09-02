import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildRelaxNgVisualizationMatrix } from './relax-ng-visualization-catalogue.mjs';

const matrixPath = path.resolve(
  'docs/technical/relax-ng-complete-visualization-matrix.json',
);
const text = await readFile(matrixPath, 'utf8');
const expected = `${JSON.stringify(buildRelaxNgVisualizationMatrix(), null, 2)}\n`;
if (text !== expected) {
  throw new Error(
    'RELAX NG visualization matrix is stale; run npm run visualization:relaxng:matrix.',
  );
}
const matrix = JSON.parse(text);
const ids = new Set();
const incomplete = [];
for (const entry of matrix.entries) {
  if (ids.has(entry.id)) incomplete.push(`${entry.id}: duplicate ID`);
  ids.add(entry.id);
  for (const field of [
    'construct',
    'presentation',
    'navigation',
    'carousel',
    'inspector',
    'search',
    'source',
    'zoomIdentity',
    'evidence',
  ]) {
    if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
      incomplete.push(`${entry.id}: missing ${field}`);
    }
  }
}
if (incomplete.length > 0) {
  throw new Error(
    `RELAX NG complete visualization has incomplete rows:\n${incomplete
      .slice(0, 20)
      .map((finding) => `- ${finding}`)
      .join('\n')}`,
  );
}
const digest = createHash('sha256').update(text).digest('hex');
console.log('# RELAX NG complete-visualization acceptance');
console.log(
  `Matrix: ${matrix.entries.length}/${matrix.entries.length} complete (${digest})`,
);
console.log('Findings: 0');
console.log('Acceptance result: PASS');
