import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

interface ManifestCase {
  readonly id: string;
  readonly schemaDocuments: readonly string[];
  readonly instanceTests: readonly unknown[];
  readonly dependencyPaths: readonly string[];
  readonly dependencySha256?: Readonly<Record<string, string>>;
  readonly expectedSchemaValidity: readonly string[];
  readonly metadataStatus: string;
  readonly productionBoundaryRelevance: string;
  readonly family: string;
  readonly selected: boolean;
  readonly runInCi: boolean;
  readonly exclusionReason: string | null;
}

interface Manifest {
  readonly schemaVersion: number;
  readonly suite: {
    readonly distribution: string;
    readonly archiveBytes: number;
    readonly archiveSha256: string;
    readonly suiteSchemaVersion: string;
  };
  readonly inventory: Readonly<Record<string, number>>;
  readonly selection: {
    readonly fullSelected: number;
    readonly ciSelected: number;
    readonly familyTotals: Readonly<Record<string, number>>;
    readonly exclusionReasonTotals: Readonly<Record<string, number>>;
  };
  readonly cases: readonly ManifestCase[];
}

const fixtureRoot = path.resolve('tests/fixtures/w3c-xsd-1.0/2007-06-20');
let manifest: Manifest;

beforeAll(async () => {
  manifest = JSON.parse(
    await readFile(path.join(fixtureRoot, 'selected-tests.json'), 'utf8'),
  ) as Manifest;
});

describe('W3C XSD manifest integrity', () => {
  it('pins the official distribution and complete metadata inventory', () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.suite).toMatchObject({
      distribution: 'xsts-2007-06-20.tar.gz',
      archiveBytes: 4_367_182,
      archiveSha256:
        '902176b25e4111cf96b08663107521a4992e8ea67aad6b815592a6a5b4b9ea06',
      suiteSchemaVersion: 'W3C XML Schema 1.0 2nd edition',
    });
    expect(manifest.inventory).toEqual({
      metadataFiles: 32,
      testGroups: 14_383,
      schemaTests: 14_328,
      instanceTests: 25_092,
      schemaDocuments: 14_402,
      instanceDocuments: 25_092,
    });
  });

  it('gives every case a stable unique ID and exactly one selected-or-excluded state', () => {
    expect(new Set(manifest.cases.map(({ id }) => id)).size).toBe(
      manifest.cases.length,
    );
    for (const test of manifest.cases) {
      expect(test.id).not.toBe('');
      expect(test.metadataStatus).not.toBe('');
      expect(test.productionBoundaryRelevance).not.toBe('');
      expect(test.family).not.toBe('');
      expect(test.selected === (test.exclusionReason === null)).toBe(true);
      expect(!test.runInCi || test.selected).toBe(true);
      expect(
        test.schemaDocuments.length + test.instanceTests.length,
      ).toBeGreaterThan(0);
    }
  });

  it('preserves exact bounded selection, exclusion, and family totals', () => {
    expect(manifest.selection.fullSelected).toBe(182);
    expect(manifest.selection.ciSelected).toBe(52);
    expect(manifest.cases.filter(({ selected }) => selected)).toHaveLength(182);
    expect(manifest.cases.filter(({ runInCi }) => runInCi)).toHaveLength(52);
    expect(manifest.selection.exclusionReasonTotals).toEqual({
      'bounded-family-sample-limit': 13_537,
      'instance-only': 53,
      'metadata-disputed': 588,
      'missing corpus resource': 21,
      'security-policy conflict': 2,
    });
    expect(Object.keys(manifest.selection.familyTotals)).toHaveLength(24);
    for (const [family, expected] of Object.entries(
      manifest.selection.familyTotals,
    )) {
      expect(
        manifest.cases.filter(
          (test) => test.selected && test.family === family,
        ),
      ).toHaveLength(expected);
    }
  });

  it('keeps positive and negative schema cases in every family with both metadata outcomes', () => {
    const positiveOnlyFamilies = new Set([
      'atomic-datatypes',
      'chameleon-include',
      'instance-only',
    ]);
    for (const family of Object.keys(manifest.selection.familyTotals)) {
      const cases = manifest.cases.filter(
        (test) => test.selected && test.family === family,
      );
      if (family === 'instance-only') continue;
      expect(
        cases.some((test) => test.expectedSchemaValidity.includes('valid')),
      ).toBe(true);
      if (positiveOnlyFamilies.has(family)) continue;
      expect(
        cases.some((test) => test.expectedSchemaValidity.includes('invalid')),
      ).toBe(true);
    }
  });

  it('verifies every committed CI dependency against its manifest hash', async () => {
    for (const test of manifest.cases.filter(({ runInCi }) => runInCi)) {
      for (const dependencyPath of test.dependencyPaths) {
        const bytes = await readFile(
          path.join(fixtureRoot, 'ci-corpus', ...dependencyPath.split('/')),
        );
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(
          test.dependencySha256?.[dependencyPath],
        );
      }
    }
  });
});
