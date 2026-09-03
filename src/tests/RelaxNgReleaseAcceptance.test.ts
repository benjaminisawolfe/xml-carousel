import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  buildReleaseAcceptanceMatrix,
  catalogue,
  evidencePath,
  matrixPath,
  serialize,
} from '../../scripts/relax-ng-release-acceptance.mjs';

async function evidence() {
  return JSON.parse(await readFile(evidencePath, 'utf8'));
}

describe('Task 17.10 release acceptance authority', () => {
  it('preserves every required dimension and reproduces the reviewed matrix', async () => {
    const ids = catalogue.map(([id]) => id);
    expect(ids).toHaveLength(60);
    expect(new Set(ids).size).toBe(60);
    expect(ids).toEqual([...ids].sort());
    expect(await readFile(matrixPath, 'utf8')).toBe(
      serialize(buildReleaseAcceptanceMatrix(await evidence())),
    );
  });

  it('does not substitute Chrome evidence for a missing Firefox run', async () => {
    const record = await evidence();
    record.browsers = record.browsers.filter(
      (browser: { browser: string }) => browser.browser !== 'firefox',
    );
    expect(buildReleaseAcceptanceMatrix(record).recommendation).toBe(
      'NOT_READY_FOR_0_3_0_RELEASE',
    );
  });

  it('rejects a missing nested-mount source-fidelity observation', async () => {
    const record = await evidence();
    record.browsers[0].checks = record.browsers[0].checks.filter(
      (check: { id: string }) => check.id !== 'nested:rnc-source-copy',
    );
    const result = buildReleaseAcceptanceMatrix(record);
    expect(result.entries.find(({ id }) => id === 'copy-source')?.status).toBe(
      'FAIL',
    );
    expect(result.recommendation).toBe('NOT_READY_FOR_0_3_0_RELEASE');
  });

  it('rejects browser errors or an unexpected origin even if checks say pass', async () => {
    const record = await evidence();
    record.browsers[1].privacy.unexpectedOrigins = 1;
    expect(buildReleaseAcceptanceMatrix(record).recommendation).toBe(
      'NOT_READY_FOR_0_3_0_RELEASE',
    );
  });

  it('keeps a failed deterministic-build gate release-blocking', async () => {
    const record = await evidence();
    record.gates.buildRepeat = { status: 'FAIL' };
    expect(buildReleaseAcceptanceMatrix(record).recommendation).toBe(
      'NOT_READY_FOR_0_3_0_RELEASE',
    );
  });
});
