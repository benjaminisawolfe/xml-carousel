import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadXmltestArchiveFixture } from '../../../scripts/xmltest-archive-fixture.mjs';
import {
  createXercesSpikeAdapter,
  type XercesSpikeAdapter,
} from '../src/adapter';

type Expected = 'valid' | 'invalid' | 'not-wf' | 'error';
type Classification =
  | 'pass'
  | 'fail'
  | 'unsupported-by-current-product-boundary'
  | 'instance-dependent-outside-standalone-DTD-check'
  | 'optional-error-accepted'
  | 'optional-error-reported'
  | 'blocked-by-security-policy'
  | 'harness-error';

interface ManifestTest {
  id: string;
  collection: string;
  expected: Expected;
  entry: string;
  requiredFiles: string[];
  runInCi: boolean;
  selected: boolean;
  exclusionReason: string | null;
  knownBoundaryClassification: Classification | null;
  testFamily: string;
  productionBoundaryRelevance: string;
  executionBoundary: string;
  requiredFileSha256?: Readonly<Record<string, string>>;
}

interface Manifest {
  selection: {
    totalMetadataTests: number;
    selectedTests: number;
    ciTests: number;
    expectedTotals: Readonly<Record<Expected, number>>;
    exclusionReasonTotals: Readonly<Record<string, number>>;
    familyTotals: Readonly<Record<string, number>>;
    productionBoundaryTotals: Readonly<Record<string, number>>;
  };
  tests: ManifestTest[];
}

const spikeRoot = path.resolve('tools/xerces-wasm-spike');
const productionRuntimeRoot = path.resolve('src/standards/xerces/runtime');
const suiteRoot = path.join(
  spikeRoot,
  '.cache/w3c-xmlconf-20130923/extracted/xmlconf',
);
const ciRoot = path.resolve('tests/fixtures/w3c-xmlconf-20130923/ci-corpus');
const manifestPath = path.resolve(
  'tests/fixtures/w3c-xmlconf-20130923/dtd-selected-tests.json',
);
let adapter: XercesSpikeAdapter;
let manifest: Manifest;
let archiveBackedCiFiles: ReadonlyMap<string, Uint8Array>;

beforeAll(async () => {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
  archiveBackedCiFiles = (await loadXmltestArchiveFixture()).files;
  const moduleUrl = pathToFileURL(
    path.join(productionRuntimeRoot, 'xerces-runtime.js'),
  );
  const wasmUrl = pathToFileURL(
    path.join(productionRuntimeRoot, 'xerces-runtime.wasm'),
  );
  const imported = (await import(moduleUrl.href)) as {
    default: Parameters<typeof createXercesSpikeAdapter>[0];
  };
  adapter = await createXercesSpikeAdapter(
    imported.default,
    moduleUrl,
    wasmUrl,
  );
});

function classify(expected: Expected, status: string): Classification {
  if (status === 'blocked') return 'blocked-by-security-policy';
  if (status === 'unsupported') {
    return 'unsupported-by-current-product-boundary';
  }
  if (status === 'internal-error') return 'harness-error';
  if (expected === 'error') {
    return status === 'invalid'
      ? 'optional-error-reported'
      : 'optional-error-accepted';
  }
  if (expected === 'valid') return status === 'valid' ? 'pass' : 'fail';
  return status === 'invalid' ? 'pass' : 'fail';
}

async function runCases(
  cases: readonly ManifestTest[],
  corpusRoot = suiteRoot,
) {
  const counts: Record<Classification, number> = {
    pass: 0,
    fail: 0,
    'unsupported-by-current-product-boundary': 0,
    'instance-dependent-outside-standalone-DTD-check': 0,
    'optional-error-accepted': 0,
    'optional-error-reported': 0,
    'blocked-by-security-policy': 0,
    'harness-error': 0,
  };
  const failures = [];
  for (const test of cases) {
    try {
      const files = await Promise.all(
        test.requiredFiles.map(async (fileName) => {
          const archiveBytes =
            path.resolve(corpusRoot) === ciRoot
              ? archiveBackedCiFiles.get(fileName)
              : undefined;
          const bytes = archiveBytes
            ? new Uint8Array(archiveBytes)
            : new Uint8Array(await readFile(path.join(corpusRoot, fileName)));
          const expectedHash = test.requiredFileSha256?.[fileName];
          if (
            expectedHash &&
            createHash('sha256').update(bytes).digest('hex') !== expectedHash
          ) {
            throw new Error(`Fixture hash mismatch for ${fileName}.`);
          }
          return { path: fileName, bytes };
        }),
      );
      const result = adapter.run({
        attemptId: `${test.collection}:${test.id}`,
        format: 'xml',
        entryPath: test.entry,
        files,
      });
      const classification =
        test.knownBoundaryClassification ??
        classify(test.expected, result.status);
      counts[classification] += 1;
      if (classification === 'fail' || classification === 'harness-error') {
        failures.push({
          id: test.id,
          collection: test.collection,
          expected: test.expected,
          actual: result.status,
          diagnostics: result.diagnostics.slice(0, 3),
        });
      }
    } catch (error) {
      counts['harness-error'] += 1;
      failures.push({
        id: test.id,
        collection: test.collection,
        expected: test.expected,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { counts, failures };
}

describe('W3C XML 1.0 Fifth Edition DTD conformance', () => {
  it('keeps the CI subset manifest inventory and exclusion taxonomy exact', () => {
    expect(manifest.selection).toEqual({
      totalMetadataTests: 2_586,
      selectedTests: 1_950,
      ciTests: 64,
      expectedTotals: { valid: 721, invalid: 212, 'not-wf': 993, error: 24 },
      exclusionReasonTotals: {
        'XML 1.1-only': 267,
        'namespace-only': 59,
        'not XML 1.0 Fifth Edition': 310,
      },
      familyTotals: {
        'attributes-and-defaults': 261,
        'conditional-sections': 58,
        'doctype-and-external-subset': 129,
        'elements-and-content-models': 772,
        'external-entities-and-encoding': 72,
        'notations-and-unparsed-entities': 108,
        'parameter-and-general-entities': 335,
        'xml-document-well-formedness': 215,
      },
      productionBoundaryTotals: {
        standaloneDtdOrEntity: 1_735,
        harnessOnlyXmlDocument: 215,
      },
    });
  });

  it('gives each CI subset manifest row one stable selected-or-excluded state', () => {
    expect(manifest.tests).toHaveLength(2_586);
    expect(new Set(manifest.tests.map(({ id }) => id)).size).toBe(2_586);
    for (const test of manifest.tests) {
      expect(test.selected === (test.exclusionReason === null)).toBe(true);
      expect(!test.runInCi || test.selected).toBe(true);
      expect(test.testFamily).not.toBe('');
      expect(test.productionBoundaryRelevance).not.toBe('');
      expect(test.executionBoundary).not.toBe('');
    }
  });

  it('runs the stable CI subset with explicit result categories', async () => {
    const cases = manifest.tests.filter((test) => test.runInCi);
    expect(cases).toHaveLength(manifest.selection.ciTests);
    const report = await runCases(cases, ciRoot);
    console.log(`W3C_DTD_CI ${JSON.stringify(report)}`);
    expect(report.failures).toEqual([]);
  }, 120_000);

  it('runs the full selected DTD-related suite with explicit result categories', async () => {
    const cases = manifest.tests.filter((test) => test.selected);
    expect(cases).toHaveLength(manifest.selection.selectedTests);
    const report = await runCases(cases);
    console.log(`W3C_DTD_FULL ${JSON.stringify(report)}`);
    expect(report.failures).toEqual([]);
  }, 600_000);
});
