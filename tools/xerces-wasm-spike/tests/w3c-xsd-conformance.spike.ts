import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createXercesAdapter,
  type XercesModuleFactory,
} from '../../../src/standards/xerces/adapter';
import type {
  XercesAdapter,
  XercesProjectFile,
} from '../../../src/standards/xerces/types';

type Classification =
  | 'pass'
  | 'fail'
  | 'unsupported'
  | 'instance-dependent'
  | 'optional accepted'
  | 'optional reported'
  | 'security-blocked'
  | 'metadata-disputed'
  | 'harness-error';

interface ManifestCase {
  readonly id: string;
  readonly schemaDocuments: readonly string[];
  readonly dependencyPaths: readonly string[];
  readonly dependencySha256: Readonly<Record<string, string>>;
  readonly expectedSchemaValidity: readonly ('valid' | 'invalid')[];
  readonly selected: boolean;
  readonly runInCi: boolean;
  readonly family: string;
  readonly knownClassification: Classification | null;
}

interface Manifest {
  readonly suite: {
    readonly archiveBytes: number;
    readonly archiveSha256: string;
  };
  readonly selection: {
    readonly fullSelected: number;
    readonly ciSelected: number;
  };
  readonly cases: readonly ManifestCase[];
}

const repositoryRoot = path.resolve('.');
const manifestPath = path.join(
  repositoryRoot,
  'tests/fixtures/w3c-xsd-1.0/2007-06-20/selected-tests.json',
);
const ciRoot = path.join(
  repositoryRoot,
  'tests/fixtures/w3c-xsd-1.0/2007-06-20/ci-corpus',
);
const cacheRoot = path.join(
  repositoryRoot,
  'tools/xerces-wasm-spike/.cache/w3c-xsd-2007-06-20',
);
const fullRoot = path.join(cacheRoot, 'xmlschema2006-11-06');
const archivePath = path.join(cacheRoot, 'xsts-2007-06-20.tar.gz');
const runtimeRoot = path.join(repositoryRoot, 'src/standards/xerces/runtime');

let adapter: XercesAdapter;
let manifest: Manifest;

beforeAll(async () => {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
  const moduleUrl = pathToFileURL(path.join(runtimeRoot, 'xerces-runtime.js'));
  const wasmUrl = pathToFileURL(path.join(runtimeRoot, 'xerces-runtime.wasm'));
  const imported = (await import(moduleUrl.href)) as {
    default: XercesModuleFactory;
  };
  adapter = await createXercesAdapter(imported.default, moduleUrl, wasmUrl);
});

async function exists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function classificationCounts(): Record<Classification, number> {
  return {
    pass: 0,
    fail: 0,
    unsupported: 0,
    'instance-dependent': 0,
    'optional accepted': 0,
    'optional reported': 0,
    'security-blocked': 0,
    'metadata-disputed': 0,
    'harness-error': 0,
  };
}

function classify(
  test: ManifestCase,
  statuses: readonly string[],
): Classification {
  if (test.knownClassification === 'instance-dependent') {
    return 'instance-dependent';
  }
  if (test.knownClassification === 'metadata-disputed') {
    return 'metadata-disputed';
  }
  if (test.knownClassification === 'security-blocked') {
    return statuses.every((status) => status === 'blocked')
      ? 'security-blocked'
      : 'fail';
  }
  if (test.knownClassification === 'unsupported') return 'unsupported';
  if (statuses.some((status) => status === 'internal-error')) {
    return 'harness-error';
  }
  if (statuses.some((status) => status === 'blocked')) return 'fail';
  if (statuses.some((status) => status === 'unsupported')) {
    return test.knownClassification === 'unsupported' ? 'unsupported' : 'fail';
  }
  const actual = statuses.every((status) => status === 'valid')
    ? 'valid'
    : 'invalid';
  if (
    test.expectedSchemaValidity.includes('valid') &&
    test.expectedSchemaValidity.includes('invalid')
  ) {
    return actual === 'valid' ? 'optional accepted' : 'optional reported';
  }
  return test.expectedSchemaValidity.includes(actual) ? 'pass' : 'fail';
}

async function runCases(cases: readonly ManifestCase[], corpusRoot: string) {
  const counts = classificationCounts();
  const failures = [];
  for (const test of cases) {
    if (test.knownClassification === 'instance-dependent') {
      counts['instance-dependent'] += 1;
      continue;
    }
    try {
      const files: XercesProjectFile[] = await Promise.all(
        test.dependencyPaths.map(async (filePath) => {
          const bytes = new Uint8Array(
            await readFile(path.join(corpusRoot, ...filePath.split('/'))),
          );
          const expectedHash = test.dependencySha256[filePath];
          if (
            expectedHash &&
            createHash('sha256').update(bytes).digest('hex') !== expectedHash
          ) {
            throw new Error(`Fixture hash mismatch for ${filePath}.`);
          }
          return { path: filePath, bytes };
        }),
      );
      const statuses = test.schemaDocuments.map(
        (entryPath, index) =>
          adapter.run({
            attemptId: `${test.id}:schema:${index + 1}`,
            format: 'xsd',
            entryPath,
            files,
          }).status,
      );
      const classification = classify(test, statuses);
      counts[classification] += 1;
      if (classification === 'fail' || classification === 'harness-error') {
        failures.push({
          id: test.id,
          family: test.family,
          expected: test.expectedSchemaValidity,
          actual: statuses,
        });
      }
    } catch (error) {
      counts['harness-error'] += 1;
      failures.push({
        id: test.id,
        family: test.family,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { counts, failures };
}

describe('W3C XML Schema 1.0 Second Edition conformance', () => {
  it('runs the committed CI subset without external corpus access', async () => {
    const cases = manifest.cases.filter(({ runInCi }) => runInCi);
    expect(cases).toHaveLength(manifest.selection.ciSelected);
    const report = await runCases(cases, ciRoot);
    console.log(`W3C_XSD_CI ${JSON.stringify(report)}`);
    expect(report.failures).toEqual([]);
  }, 120_000);

  it('runs the full bounded selection from the pinned external cache', async () => {
    if (
      !(await exists(archivePath)) ||
      !(await exists(path.join(fullRoot, 'suite.xml')))
    ) {
      throw new Error(
        'The W3C XSD corpus is absent. Run npm run spike:xerces:bootstrap-w3c-xsd before npm run w3c:xsd:full.',
      );
    }
    const archive = new Uint8Array(await readFile(archivePath));
    expect(archive.byteLength).toBe(manifest.suite.archiveBytes);
    expect(createHash('sha256').update(archive).digest('hex')).toBe(
      manifest.suite.archiveSha256,
    );
    const cases = manifest.cases.filter(({ selected }) => selected);
    expect(cases).toHaveLength(manifest.selection.fullSelected);
    const report = await runCases(cases, fullRoot);
    console.log(`W3C_XSD_FULL ${JSON.stringify(report)}`);
    expect(report.failures).toEqual([]);
  }, 600_000);
});
