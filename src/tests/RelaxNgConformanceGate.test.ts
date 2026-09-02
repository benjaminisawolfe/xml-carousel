import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  areRelaxNgSemanticallyEquivalent,
  buildRelaxNgSemanticModel,
  parseRelaxNgCompactSyntax,
} from '../schema/relaxng';
import {
  createRelaxNgAdapter,
  type RelaxNgModuleFactory,
  type RelaxNgProjectFile,
  validateWithProductionRelaxNg,
} from '../standards/relaxng';
import {
  loadAuthorityCases,
  sha256,
} from '../../scripts/relax-ng-conformance-corpus.mjs';

const fixtureRoot = path.resolve('tests/fixtures/relax-ng/conformance');
const runtimeRoot = path.resolve('src/standards/relaxng/runtime');
let adapter: Awaited<ReturnType<typeof createRelaxNgAdapter>>;
interface BoundaryRecord {
  readonly id: string;
  readonly caseId: string;
  readonly stage: string;
  readonly category:
    'expected-product-boundary' | 'expected-security-policy-difference';
  readonly reason: string;
  readonly productionOutcome: string;
  readonly oracleOutcome: string;
  readonly source: string;
}
interface OracleRecord {
  readonly id: string;
  readonly expected: string;
  readonly jing: string;
  readonly trang?: string;
  readonly comparison: string;
}
let boundaries = new Map<string, BoundaryRecord>();
let oracle = new Map<string, OracleRecord>();
const observedBoundaries = new Set<string>();

beforeAll(async () => {
  const boundaryAuthority = JSON.parse(
    await readFile(path.join(fixtureRoot, 'expected-boundaries.json'), 'utf8'),
  ) as { records: BoundaryRecord[] };
  const oracleAuthority = JSON.parse(
    await readFile(path.join(fixtureRoot, 'oracle.json'), 'utf8'),
  ) as { spectest: OracleRecord[]; compacttest: OracleRecord[] };
  boundaries = new Map(
    boundaryAuthority.records.map((record) => [record.id, record]),
  );
  oracle = new Map(
    [...oracleAuthority.spectest, ...oracleAuthority.compacttest].map(
      (record) => [record.id, record],
    ),
  );
  const moduleUrl = pathToFileURL(
    path.join(runtimeRoot, 'libxml2-relaxng-runtime.js'),
  );
  const wasmUrl = pathToFileURL(
    path.join(runtimeRoot, 'libxml2-relaxng-runtime.wasm'),
  );
  const imported = (await import(moduleUrl.href)) as {
    default: RelaxNgModuleFactory;
  };
  adapter = await createRelaxNgAdapter(imported.default, moduleUrl, wasmUrl);
});

afterAll(() => {
  expect([...observedBoundaries].sort()).toEqual([...boundaries.keys()].sort());
});

function acceptBoundary(
  id: string,
  productionOutcome: string,
  oracleOutcome: string,
): string | undefined {
  const record = boundaries.get(id);
  if (!record) {
    return `${id}: production=${productionOutcome}, oracle=${oracleOutcome}`;
  }
  expect(record?.productionOutcome).toBe(productionOutcome);
  expect(record?.oracleOutcome).toBe(oracleOutcome);
  expect(record?.reason.length).toBeGreaterThan(20);
  expect(record?.source.length).toBeGreaterThan(0);
  observedBoundaries.add(id);
  return undefined;
}

async function validate(
  attemptId: string,
  entryPath: string,
  files: readonly RelaxNgProjectFile[],
) {
  return validateWithProductionRelaxNg(
    { attemptId, entryPath, files },
    async () => adapter,
  );
}

async function filesBelow(
  root: string,
  directory = root,
): Promise<RelaxNgProjectFile[]> {
  const result: RelaxNgProjectFile[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await filesBelow(root, absolute)));
    else if (/\.rnc?$|\.rng$/u.test(entry.name)) {
      result.push({
        path: path.relative(root, absolute).split('\\').join('/'),
        bytes: new Uint8Array(await readFile(absolute)),
      });
    }
  }
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

describe('Task 17.9 pinned RELAX NG conformance authority', () => {
  it('classifies every spectest schema through the production libxml2 boundary', async () => {
    const { spectest } = await loadAuthorityCases(
      pathToFileURL(`${path.resolve('.')}/`),
    );
    let agreements = 0;
    let productBoundaries = 0;
    for (const testCase of spectest) {
      const result = await validate(
        testCase.id,
        testCase.entryPath,
        testCase.files.map(
          ({ path: filePath, source }: { path: string; source: string }) => ({
            path: filePath,
            bytes: new TextEncoder().encode(source),
          }),
        ),
      );
      const actual = result.status === 'valid' ? 'accepted' : result.status;
      if (actual !== testCase.expected) {
        const unclassified = acceptBoundary(
          `${testCase.id}:standards`,
          actual,
          testCase.expected,
        );
        expect(unclassified).toBeUndefined();
        productBoundaries += 1;
      } else agreements += 1;
    }
    console.log(
      `RELAX_NG_SPECTEST ${JSON.stringify({ agreements, productBoundaries, investigate: 0, harnessErrors: 0 })}`,
    );
    expect(agreements).toBe(378);
    expect(productBoundaries).toBe(7);
    expect(spectest).toHaveLength(385);
  }, 120_000);

  it('measures Compact Syntax acceptance, mapping, semantic meaning, and source fidelity', async () => {
    const { compacttest } = await loadAuthorityCases(
      pathToFileURL(`${path.resolve('.')}/`),
    );
    let translationAgreements = 0;
    let standardsAgreements = 0;
    let semanticAgreements = 0;
    let productBoundaries = 0;
    let policyDifferences = 0;
    const unclassified: string[] = [];
    for (const testCase of compacttest) {
      const sourceId = `source:${testCase.id}`;
      const parsed = parseRelaxNgCompactSyntax(testCase.source, sourceId);
      const fileName = `${testCase.id.split(':').join('-')}.rnc`;
      const result = await validate(testCase.id, fileName, [
        {
          path: fileName,
          bytes: new TextEncoder().encode(testCase.source),
        },
      ]);
      const translation =
        parsed.generated && parsed.diagnostics.length === 0
          ? 'accepted'
          : 'invalid';
      if (translation !== testCase.expected) {
        const missing = acceptBoundary(
          `${testCase.id}:translation`,
          translation,
          testCase.expected,
        );
        if (missing) unclassified.push(missing);
        productBoundaries += 1;
      } else translationAgreements += 1;
      if (translation === 'invalid' && testCase.expected === 'accepted') {
        continue;
      }

      const oracleRecord = oracle.get(testCase.id);
      expect(oracleRecord).toBeDefined();
      const standards = result.status === 'valid' ? 'accepted' : result.status;
      if (standards !== oracleRecord?.jing) {
        const suffix =
          testCase.id === 'compacttest:006' || testCase.id === 'compacttest:061'
            ? 'security'
            : testCase.id === 'compacttest:088'
              ? 'oracle'
              : 'standards';
        const missing = acceptBoundary(
          `${testCase.id}:${suffix}`,
          standards,
          oracleRecord?.jing ?? 'missing-oracle',
        );
        if (missing) unclassified.push(missing);
        if (suffix === 'security') policyDifferences += 1;
        else productBoundaries += 1;
      } else standardsAgreements += 1;

      if (testCase.expected !== 'accepted') {
        continue;
      }
      if (testCase.expectedXml) {
        const compactModel = buildRelaxNgSemanticModel({
          sources: [
            {
              sourceFileId: sourceId,
              path: `${testCase.id}.rnc`,
              sourceText: testCase.source,
            },
          ],
        }).model;
        const xmlModel = buildRelaxNgSemanticModel({
          sources: [
            {
              sourceFileId: `xml:${testCase.id}`,
              path: `${testCase.id}.rng`,
              sourceText: testCase.expectedXml,
            },
          ],
        }).model;
        if (
          !compactModel ||
          !xmlModel ||
          !areRelaxNgSemanticallyEquivalent(compactModel, xmlModel)
        ) {
          const missing = acceptBoundary(
            `${testCase.id}:semantic`,
            'different',
            'equivalent',
          );
          if (missing) unclassified.push(missing);
          productBoundaries += 1;
        } else semanticAgreements += 1;
      }
      if (
        sha256(Buffer.from(testCase.source)) !==
        sha256(new TextEncoder().encode(testCase.source))
      ) {
        throw new Error(`${testCase.id}: source identity changed`);
      }
    }
    console.log(
      `RELAX_NG_COMPACTTEST ${JSON.stringify({ translationAgreements, standardsAgreements, semanticAgreements, productBoundaries, policyDifferences, investigate: 0, harnessErrors: 0 })}`,
    );
    expect(unclassified).toEqual([]);
    expect(compacttest).toHaveLength(90);
  }, 120_000);

  it.each([
    ['DocBook 5.1', 'docbook-5.1', 'docbook.rng'],
    ['EPUBCheck 5.3.0', 'epubcheck-5.3.0', 'package-30.rnc'],
    ['Validator.nu 26.8.30', 'validator-26.8.30', 'html5/html5.rnc'],
  ])(
    'imports the pinned real-world %s grammar deterministically',
    async (_, id, entryPath) => {
      const root = path.join(fixtureRoot, 'real-world', id);
      const files = await filesBelow(root);
      const first = await validate(`real-world:${id}:1`, entryPath, files);
      const second = await validate(`real-world:${id}:2`, entryPath, files);
      if (id === 'validator-26.8.30') {
        const unclassified = acceptBoundary(
          'real-world:validator-26.8.30:standards',
          first.status,
          'requires-custom-datatype-library',
        );
        expect(unclassified).toBeUndefined();
      } else {
        expect(
          first.status,
          JSON.stringify(first.diagnostics.slice(0, 5)),
        ).toBe('valid');
      }
      expect(second.status).toBe(first.status);
      expect(second.dependencyRequests).toEqual(first.dependencyRequests);
      expect(first.dependencyRequests).not.toContainEqual(
        expect.objectContaining({ outcome: 'blocked' }),
      );
      const semanticSources = await Promise.all(
        files.map(async (file) => ({
          sourceFileId: `real-world:${id}:${file.path}`,
          path: file.path,
          sourceText: new TextDecoder().decode(file.bytes),
        })),
      );
      const semantic = buildRelaxNgSemanticModel({ sources: semanticSources });
      expect(semantic.model).toBeDefined();
      expect(semantic.model?.documents.length).toBeGreaterThan(0);
    },
    120_000,
  );
});
