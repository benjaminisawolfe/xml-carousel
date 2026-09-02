import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import {
  createRelaxNgAdapter,
  type RelaxNgModuleFactory,
} from '../../standards/relaxng/adapter';
import { validateWithProductionRelaxNg } from '../../standards/relaxng/productionValidator';
import type { RelaxNgAdapter } from '../../standards/relaxng/types';
import {
  areRelaxNgSemanticallyEquivalent,
  buildRelaxNgSemanticModel,
  parseRelaxNgCompactSyntax,
  validateRelaxNgSemanticModel,
} from './index';

interface Manifest {
  readonly equivalence: readonly {
    readonly file: string;
    readonly sha256: string;
  }[];
  readonly loose: readonly {
    readonly file: string;
    readonly sha256: string;
    readonly expected: 'valid' | 'syntax-invalid' | 'blocked';
  }[];
  readonly packages: readonly {
    readonly file: string;
    readonly sha256: string;
    readonly members: readonly string[];
  }[];
}

const fixtureRoot = path.resolve('tests/fixtures/relax-ng/manual-qa-rnc');
const runtimeRoot = path.resolve('src/standards/relaxng/runtime');
let manifest: Manifest;
let adapter: RelaxNgAdapter;

beforeAll(async () => {
  manifest = JSON.parse(
    await readFile(path.join(fixtureRoot, 'manifest.json'), 'utf8'),
  ) as Manifest;
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

describe('persistent Compact Syntax manual-QA fixtures', () => {
  it('matches every committed loose and ZIP SHA-256', async () => {
    for (const entry of [
      ...manifest.equivalence,
      ...manifest.loose,
      ...manifest.packages,
    ]) {
      const bytes = await readFile(path.join(fixtureRoot, entry.file));
      expect(createHash('sha256').update(bytes).digest('hex'), entry.file).toBe(
        entry.sha256,
      );
    }
    expect(manifest.loose).toHaveLength(10);
    expect(manifest.packages).toHaveLength(9);
    expect(manifest.equivalence).toHaveLength(2);
  });

  it('proves the persistent RNG/RNC browser pair is semantically equivalent', async () => {
    const rngEntry = manifest.equivalence.find(({ file }) =>
      file.endsWith('.rng'),
    )!;
    const rncEntry = manifest.equivalence.find(({ file }) =>
      file.endsWith('.rnc'),
    )!;
    const rngSource = await readFile(
      path.join(fixtureRoot, rngEntry.file),
      'utf8',
    );
    const rncSource = await readFile(
      path.join(fixtureRoot, rncEntry.file),
      'utf8',
    );
    const rngModel = buildRelaxNgSemanticModel({
      sources: [
        {
          sourceFileId: 'fixture:equivalence:rng',
          path: rngEntry.file,
          sourceText: rngSource,
        },
      ],
    }).model!;
    const rncModel = buildRelaxNgSemanticModel({
      sources: [
        {
          sourceFileId: 'fixture:equivalence:rnc',
          path: rncEntry.file,
          sourceText: rncSource,
        },
      ],
    }).model!;

    expect(areRelaxNgSemanticallyEquivalent(rngModel, rncModel)).toBe(true);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'parses, validates, and projects valid loose fixture %s',
    async (number) => {
      const entry = manifest.loose[number - 1]!;
      const bytes = new Uint8Array(
        await readFile(path.join(fixtureRoot, entry.file)),
      );
      const sourceText = new TextDecoder().decode(bytes);
      const parsed = parseRelaxNgCompactSyntax(sourceText, entry.file);
      expect(parsed.diagnostics, entry.file).toEqual([]);
      const standards = await validateWithProductionRelaxNg(
        {
          attemptId: entry.file,
          entryPath: entry.file,
          files: [{ path: entry.file, bytes }],
        },
        async () => adapter,
      );
      expect(standards.status, JSON.stringify(standards.diagnostics)).toBe(
        'valid',
      );
      const semantic = buildRelaxNgSemanticModel({
        sources: [
          {
            sourceFileId: `fixture:${entry.file}`,
            path: entry.file,
            sourceText,
          },
        ],
      });
      expect(semantic.model).toBeDefined();
      expect(validateRelaxNgSemanticModel(semantic.model!), entry.file).toEqual(
        [],
      );
    },
  );

  it('keeps invalid syntax native and blocks remote resolution without requests', async () => {
    const invalid = manifest.loose.find(
      ({ expected }) => expected === 'syntax-invalid',
    )!;
    const blocked = manifest.loose.find(
      ({ expected }) => expected === 'blocked',
    )!;
    const invalidBytes = new Uint8Array(
      await readFile(path.join(fixtureRoot, invalid.file)),
    );
    const invalidResult = await validateWithProductionRelaxNg(
      {
        attemptId: 'invalid-rnc-fixture',
        entryPath: invalid.file,
        files: [{ path: invalid.file, bytes: invalidBytes }],
      },
      async () => adapter,
    );
    expect(invalidResult.status).toBe('invalid');
    expect(invalidResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'rnc:mixed-binary-operators' }),
      ]),
    );
    const blockedBytes = new Uint8Array(
      await readFile(path.join(fixtureRoot, blocked.file)),
    );
    const blockedResult = await validateWithProductionRelaxNg(
      {
        attemptId: 'blocked-rnc-fixture',
        entryPath: blocked.file,
        files: [{ path: blocked.file, bytes: blockedBytes }],
      },
      async () => adapter,
    );
    expect(blockedResult.status).toBe('blocked');
    expect(blockedResult.dependencyRequests).toEqual([
      expect.objectContaining({ outcome: 'blocked' }),
    ]);
  });
});
