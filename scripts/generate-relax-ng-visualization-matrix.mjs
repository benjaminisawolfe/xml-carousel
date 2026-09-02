import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildRelaxNgVisualizationMatrix } from './relax-ng-visualization-catalogue.mjs';

const outputPath = path.resolve(
  'docs/technical/relax-ng-complete-visualization-matrix.json',
);
await writeFile(
  outputPath,
  `${JSON.stringify(buildRelaxNgVisualizationMatrix(), null, 2)}\n`,
  'utf8',
);
console.log(`Generated ${outputPath}.`);
