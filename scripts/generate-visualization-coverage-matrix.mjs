import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildCoverageMatrix } from './visualization-coverage-catalogue.mjs';

const outputPath = path.resolve(
  'docs/technical/visualization-coverage-matrix.json',
);

await writeFile(
  outputPath,
  `${JSON.stringify(buildCoverageMatrix(), null, 2)}\n`,
  'utf8',
);

process.stdout.write(
  `Generated ${outputPath} from the canonical visualization catalogue.\n`,
);
