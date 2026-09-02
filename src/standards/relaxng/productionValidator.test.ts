import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  STANDARDS_MAX_AGGREGATE_BYTES,
  STANDARDS_MAX_PATH_CODE_POINTS,
  STANDARDS_MAX_PATH_SEGMENTS,
  STANDARDS_MAX_PROJECT_FILES,
  STANDARDS_MAX_RETAINED_DIAGNOSTICS,
} from '../projectResources';
import type { StandardsBoundaryDiagnostic } from '../types';
import { createRelaxNgAdapter, type RelaxNgModuleFactory } from './adapter';
import {
  retainRelaxNgDiagnostics,
  validateWithProductionRelaxNg,
} from './productionValidator';
import type { RelaxNgAdapter, RelaxNgProjectFile } from './types';

const runtimeRoot = path.resolve('src/standards/relaxng/runtime');
const fixtureRoot = path.resolve(
  'tests/fixtures/relax-ng-wasm-spike/synthetic/rng',
);
const validFixtures = [
  'empty.rng',
  'attribute.rng',
  'choice.rng',
  'group.rng',
  'interleave.rng',
  'repetition.rng',
  'grammar-ref.rng',
  'name-classes.rng',
  'datatypes.rng',
  'annotation.rng',
] as const;
let adapter: RelaxNgAdapter;

async function fixture(
  projectPath: string,
  fixturePath = projectPath,
): Promise<RelaxNgProjectFile> {
  return {
    path: projectPath,
    bytes: new Uint8Array(await readFile(path.join(fixtureRoot, fixturePath))),
  };
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

beforeAll(async () => {
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

describe('committed libxml2 RELAX NG production runtime', () => {
  it.each(validFixtures)('accepts valid grammar %s', async (name) => {
    const result = await validate(name, name, [await fixture(name)]);
    expect(result).toMatchObject({
      attemptId: name,
      engine: { name: 'libxml2 RELAX NG', version: '2.15.3' },
      status: 'valid',
      diagnostics: [],
    });
  });

  it.each([
    'invalid-malformed.rng',
    'invalid-structural.rng',
    'invalid-datatype.rng',
  ])(
    'classifies invalid grammar %s with complete diagnostics',
    async (name) => {
      const result = await validate(name, name, [await fixture(name)]);
      expect(result.status).toBe('invalid');
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics[0]).toMatchObject({
        category: 'standards-invalid',
        source: 'rng',
        fileName: name,
      });
      expect(result.diagnostics[0]?.message.trim().length).toBeGreaterThan(0);
      expect(
        result.diagnostics.some(
          (diagnostic) => diagnostic.line !== undefined && diagnostic.line > 0,
        ),
      ).toBe(true);
      expect(
        result.diagnostics.every(
          (diagnostic) => diagnostic.column === undefined,
        ),
      ).toBe(true);
      expect(JSON.stringify(result.diagnostics)).not.toContain('project:///');
    },
  );

  it('resolves include, nested include, externalRef, shared, and safe parent references exactly', async () => {
    const includeFiles = await Promise.all([
      fixture('include/main.rng'),
      fixture('include/parts/common.rng'),
      fixture('include/shared/leaf.rng'),
    ]);
    const externalFiles = await Promise.all([
      fixture('external-main.rng'),
      fixture('shared.rng'),
    ]);
    const parentFiles: RelaxNgProjectFile[] = [
      {
        path: 'schemas/main.rng',
        bytes: new TextEncoder().encode(
          '<grammar xmlns="http://relaxng.org/ns/structure/1.0"><include href="../shared/base.rng"/><start><ref name="root"/></start></grammar>',
        ),
      },
      {
        path: 'shared/base.rng',
        bytes: new TextEncoder().encode(
          '<grammar xmlns="http://relaxng.org/ns/structure/1.0"><define name="root"><element name="root"><empty/></element></define></grammar>',
        ),
      },
    ];
    await expect(
      validate('include', 'include/main.rng', includeFiles),
    ).resolves.toMatchObject({
      status: 'valid',
    });
    await expect(
      validate('external', 'external-main.rng', externalFiles),
    ).resolves.toMatchObject({
      status: 'valid',
    });
    await expect(
      validate('parent', 'schemas/main.rng', parentFiles),
    ).resolves.toMatchObject({
      status: 'valid',
    });
  });

  it.each([
    ['https', 'blocked-https.rng'],
    ['http', 'blocked-http.rng'],
    ['file', 'blocked-file.rng'],
    ['absolute', 'blocked-absolute.rng'],
    ['traversal', 'blocked-traversal.rng'],
    ['encoded traversal', 'blocked-encoded.rng'],
  ])('blocks %s dependency retrieval', async (_label, name) => {
    const result = await validate(name, name, [await fixture(name)]);
    expect(result.status).toBe('blocked');
    expect(result.dependencyRequests).toEqual(
      expect.arrayContaining([expect.objectContaining({ outcome: 'blocked' })]),
    );
    expect(
      result.diagnostics.some(
        (diagnostic) => diagnostic.category === 'security',
      ),
    ).toBe(true);
    expect(JSON.stringify(result.diagnostics)).not.toMatch(
      /project:\/\/\/|https?:\/\/|file:\/\//iu,
    );
    expect(JSON.stringify(result.dependencyRequests)).not.toMatch(
      /https?:\/\/|file:\/\//iu,
    );
  });

  it.each([
    ['include', 'missing-include.rng'],
    ['externalRef', 'external-main.rng'],
  ])(
    'distinguishes a missing exact %s member from basename fallback',
    async (_referenceKind, name) => {
      const missing = await validate(`missing-${name}`, name, [
        await fixture(name),
        {
          path: 'other/not-present.rng',
          bytes: new TextEncoder().encode(
            '<element xmlns="http://relaxng.org/ns/structure/1.0" name="wrong"><empty/></element>',
          ),
        },
      ]);
      expect(missing.status).toBe('blocked');
      expect(missing.dependencyRequests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ outcome: 'missing' }),
        ]),
      );
      expect(
        missing.diagnostics.some(
          (diagnostic) => diagnostic.category === 'blocked-dependency',
        ),
      ).toBe(true);
    },
  );

  it('resets native state across invalid and valid attempts', async () => {
    const invalid = await validate('first', 'invalid-malformed.rng', [
      await fixture('invalid-malformed.rng'),
    ]);
    const valid = await validate('second', 'empty.rng', [
      await fixture('empty.rng'),
    ]);
    expect(invalid.status).toBe('invalid');
    expect(valid).toMatchObject({
      attemptId: 'second',
      status: 'valid',
      diagnostics: [],
    });
  });

  it('reports the native include recursion limit as a resource limit', async () => {
    const files: RelaxNgProjectFile[] = Array.from(
      { length: 66 },
      (_, index) => ({
        path: `depth/f${index}.rng`,
        bytes: new TextEncoder().encode(
          index === 65
            ? '<grammar xmlns="http://relaxng.org/ns/structure/1.0"><define name="root"><element name="root"><empty/></element></define></grammar>'
            : `<grammar xmlns="http://relaxng.org/ns/structure/1.0"><include href="f${index + 1}.rng"/>${index === 0 ? '<start><ref name="root"/></start>' : ''}</grammar>`,
        ),
      }),
    );
    const result = await validate('include-limit', 'depth/f0.rng', files);
    expect(result.status).not.toBe('valid');
    expect(
      result.diagnostics.some(
        (diagnostic) => diagnostic.category === 'resource-limit',
      ),
    ).toBe(true);
  });

  it('enforces project file, aggregate-byte, decoded path length, and depth limits before startup', async () => {
    const cases: Array<[readonly RelaxNgProjectFile[], string]> = [
      [
        Array.from({ length: STANDARDS_MAX_PROJECT_FILES + 1 }, (_, index) => ({
          path: `f${index}.rng`,
          bytes: new Uint8Array(),
        })),
        'relaxng:too-many-files',
      ],
      [
        [
          {
            path: 'main.rng',
            bytes: new Uint8Array(STANDARDS_MAX_AGGREGATE_BYTES + 1),
          },
        ],
        'relaxng:project-too-large',
      ],
      [
        [
          {
            path: `${'a'.repeat(STANDARDS_MAX_PATH_CODE_POINTS - 3)}.rng`,
            bytes: new Uint8Array(),
          },
        ],
        'relaxng:path-too-long',
      ],
      [
        [
          {
            path: `${'d/'.repeat(STANDARDS_MAX_PATH_SEGMENTS)}main.rng`,
            bytes: new Uint8Array(),
          },
        ],
        'relaxng:path-too-deep',
      ],
    ];
    for (const [files, code] of cases) {
      const provider = vi.fn(async () => adapter);
      const result = await validateWithProductionRelaxNg(
        { attemptId: code, entryPath: files[0]!.path, files },
        provider,
      );
      expect(result).toMatchObject({
        status: 'blocked',
        diagnostics: [{ code, category: 'resource-limit' }],
      });
      expect(provider).not.toHaveBeenCalled();
    }
  });

  it('retains an explicit final diagnostic at the diagnostic cap', () => {
    const diagnostic: StandardsBoundaryDiagnostic = {
      stage: 'standards',
      code: 'test',
      severity: 'error',
      message: 'complete',
      category: 'standards-invalid',
      source: 'rng',
    };
    const retained = retainRelaxNgDiagnostics(
      Array.from(
        { length: STANDARDS_MAX_RETAINED_DIAGNOSTICS + 1 },
        () => diagnostic,
      ),
    );
    expect(retained).toHaveLength(STANDARDS_MAX_RETAINED_DIAGNOSTICS);
    expect(retained[retained.length - 1]).toMatchObject({
      code: 'relaxng:resource-diagnostic-limit',
      category: 'resource-limit',
    });
  });

  it('maps runtime initialization failure to safe engine-internal diagnostics', async () => {
    const result = await validateWithProductionRelaxNg(
      {
        attemptId: 'init',
        entryPath: 'empty.rng',
        files: [await fixture('empty.rng')],
      },
      async () => {
        throw new Error('secret local path');
      },
    );
    expect(result.status).toBe('internal-error');
    expect(
      result.diagnostics.every((item) => item.category === 'engine-internal'),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain('secret local path');
  });
});
