import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { importDtdSource } from '../../schema/dtd';
import { createXercesAdapter, type XercesModuleFactory } from './adapter';
import {
  filterProbeOnlyXercesDiagnostics,
  normalizeXercesProjectPath,
  resolveXercesProjectReference,
  retainXercesDiagnostics,
  validateWithProductionXerces,
} from './index';
import type {
  StandardsBoundaryDiagnostic,
  XercesAdapter,
  XercesProjectFile,
  XercesValidationFormat,
} from './types';
import {
  XERCES_MAX_AGGREGATE_BYTES,
  XERCES_MAX_PATH_CODE_POINTS,
  XERCES_MAX_PATH_SEGMENTS,
  XERCES_MAX_PROJECT_FILES,
  XERCES_MAX_RETAINED_DIAGNOSTICS,
} from './limits';

const runtimeRoot = path.resolve('src/standards/xerces/runtime');
const fixtureRoot = path.resolve('tests/fixtures/xerces-wasm-spike');
const conformanceFixtureRoot = path.resolve('tests/fixtures/dtd/conformance');
const visualizationFixtureRoot = path.resolve('tests/fixtures');
let adapter: XercesAdapter;

async function fixture(
  projectPath: string,
  fixturePath = projectPath,
): Promise<XercesProjectFile> {
  return {
    path: projectPath,
    bytes: new Uint8Array(await readFile(path.join(fixtureRoot, fixturePath))),
  };
}

async function validate(
  attemptId: string,
  format: XercesValidationFormat,
  entryPath: string,
  files: readonly XercesProjectFile[],
) {
  return validateWithProductionXerces(
    { attemptId, format, entryPath, files },
    async () => adapter,
  );
}

async function conformanceFile(fileName: string): Promise<XercesProjectFile> {
  return {
    path: fileName,
    bytes: new Uint8Array(
      await readFile(path.join(conformanceFixtureRoot, fileName)),
    ),
  };
}

beforeAll(async () => {
  const moduleUrl = pathToFileURL(path.join(runtimeRoot, 'xerces-runtime.js'));
  const wasmUrl = pathToFileURL(path.join(runtimeRoot, 'xerces-runtime.wasm'));
  const imported = (await import(moduleUrl.href)) as {
    default: XercesModuleFactory;
  };
  adapter = await createXercesAdapter(imported.default, moduleUrl, wasmUrl);
});

describe('committed production Xerces runtime', () => {
  describe('adversarial controlled-project policy', () => {
    it.each([
      ['C1 control', `dir/\u0080child.xsd`],
      ['encoded C1 control', 'dir/%C2%80child.xsd'],
      ['invalid percent encoding', 'dir/%ZZchild.xsd'],
      ['single encoded traversal', 'dir/%2e%2e/child.xsd'],
      ['double encoded traversal', 'dir/%252e%252e/child.xsd'],
      ['triple encoded traversal', 'dir/%25252e%25252e/child.xsd'],
    ])('rejects a supplied path containing %s', (_label, candidate) => {
      expect(() => normalizeXercesProjectPath(candidate)).toThrow();
    });

    it('accepts exact supplied file-count and aggregate-byte boundaries', async () => {
      const files = Array.from(
        { length: XERCES_MAX_PROJECT_FILES },
        (_, index) => ({
          path: `f${index}.xsd`,
          bytes: new Uint8Array(index === 0 ? XERCES_MAX_AGGREGATE_BYTES : 0),
        }),
      );
      const adapterRun = vi.fn(() => ({
        attemptId: 'exact-project-limits',
        engine: { name: 'Apache Xerces-C++' as const, version: '3.3.0' },
        status: 'valid' as const,
        diagnostics: [],
        metrics: {
          elapsedMs: 1,
          fileCount: files.length,
          inputBytes: XERCES_MAX_AGGREGATE_BYTES,
        },
      }));
      const result = await validateWithProductionXerces(
        {
          attemptId: 'exact-project-limits',
          format: 'xsd',
          entryPath: 'f0.xsd',
          files,
        },
        async () => ({ run: adapterRun }),
      );

      expect(result.status).toBe('valid');
      expect(adapterRun).toHaveBeenCalledOnce();
    });

    it.each([
      [
        'project file count',
        Array.from({ length: XERCES_MAX_PROJECT_FILES + 1 }, (_, index) => ({
          path: `f${index}.xsd`,
          bytes: new Uint8Array(),
        })),
        'xerces:too-many-files',
      ],
      [
        'aggregate project bytes',
        [
          {
            path: 'main.xsd',
            bytes: new Uint8Array(XERCES_MAX_AGGREGATE_BYTES + 1),
          },
        ],
        'xerces:project-too-large',
      ],
    ] as const)('rejects %s at limit + 1', async (_label, files, code) => {
      const result = await validateWithProductionXerces(
        {
          attemptId: code,
          format: 'xsd',
          entryPath: files[0]!.path,
          files,
        },
        async () => {
          throw new Error('adapter must not start');
        },
      );
      expect(result).toMatchObject({
        status: 'blocked',
        diagnostics: [{ code, category: 'resource-limit' }],
      });
    });

    it('enforces decoded path length and segment boundaries', () => {
      const exactLength = `${'a'.repeat(XERCES_MAX_PATH_CODE_POINTS - 4)}.xsd`;
      const exactDepth = Array.from(
        { length: XERCES_MAX_PATH_SEGMENTS },
        (_, index) => (index === XERCES_MAX_PATH_SEGMENTS - 1 ? 'f.xsd' : 'd'),
      ).join('/');
      expect(normalizeXercesProjectPath(exactLength)).toBe(exactLength);
      expect(normalizeXercesProjectPath(exactDepth)).toBe(exactDepth);
      expect(() => normalizeXercesProjectPath(`a${exactLength}`)).toThrow(
        'path-too-long',
      );
      expect(() => normalizeXercesProjectPath(`d/${exactDepth}`)).toThrow(
        'path-too-deep',
      );
    });

    it('resolves ordinary, dot, safe-parent, and qualified project references', () => {
      expect(resolveXercesProjectReference('dir/main.xsd', 'child.xsd')).toBe(
        'dir/child.xsd',
      );
      expect(resolveXercesProjectReference('dir/main.xsd', './child.xsd')).toBe(
        'dir/child.xsd',
      );
      expect(
        resolveXercesProjectReference('dir/main.xsd', '../child.xsd'),
      ).toBe('child.xsd');
      expect(
        resolveXercesProjectReference(
          'dir/main.xsd',
          'project:///shared/child.xsd',
        ),
      ).toBe('shared/child.xsd');
    });

    it.each([
      '../../escape.xsd',
      '%2e%2e/%2e%2e/escape.xsd',
      '%252e%252e/%252e%252e/escape.xsd',
      '%25252e%25252e/%25252e%25252e/escape.xsd',
      '/absolute.xsd',
      '//host/share.xsd',
      'C:/drive.xsd',
      'https://example.invalid/a.xsd',
      'file:///etc/passwd',
      'ftp://example.invalid/a.xsd',
      'data:text/plain,x',
      'jar:file:///x!/a.xsd',
      'project:/malformed.xsd',
      'project://host/malformed.xsd',
      'child.xsd?query',
      'child.xsd#fragment',
      'dir/\u009fchild.xsd',
      'dir/%ZZchild.xsd',
      '',
    ])('blocks dependency reference %j', (reference) => {
      expect(() =>
        resolveXercesProjectReference('dir/main.xsd', reference),
      ).toThrow();
    });

    it('classifies supplied-path policy failures as security', async () => {
      const result = await validateWithProductionXerces(
        {
          attemptId: 'unsafe-supplied-path',
          format: 'xsd',
          entryPath: '../main.xsd',
          files: [{ path: '../main.xsd', bytes: new Uint8Array() }],
        },
        async () => {
          throw new Error('adapter must not start');
        },
      );
      expect(result).toMatchObject({
        status: 'blocked',
        diagnostics: [{ category: 'security' }],
      });
    });

    it('retains a bounded standards report with an explicit terminal marker', () => {
      const diagnostics = Array.from(
        { length: XERCES_MAX_RETAINED_DIAGNOSTICS + 1 },
        (_, index): StandardsBoundaryDiagnostic => ({
          stage: 'standards',
          code: `test:${index}`,
          severity: 'error',
          message: `diagnostic ${index}`,
          category: 'standards-invalid',
        }),
      );
      const retained = retainXercesDiagnostics(diagnostics);
      expect(retained).toHaveLength(XERCES_MAX_RETAINED_DIAGNOSTICS);
      expect(retained[retained.length - 1]).toMatchObject({
        code: 'xerces:resource-diagnostic-limit',
        category: 'resource-limit',
      });
    });

    it.each([
      [31, 'valid'],
      [32, 'valid'],
      [33, 'blocked'],
    ] as const)(
      'enforces an XSD dependency depth of %i as %s',
      async (depth, expectedStatus) => {
        const files = Array.from({ length: depth + 1 }, (_, index) => ({
          path: `level-${index}.xsd`,
          bytes: new TextEncoder().encode(
            `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">${
              index < depth
                ? `<xs:${index % 2 === 0 ? 'include' : 'import'} schemaLocation="level-${index + 1}.xsd"/>`
                : '<xs:element name="leaf"/>'
            }</xs:schema>`,
          ),
        }));
        const adapterRun = vi.fn(() => ({
          attemptId: `depth-${depth}`,
          engine: { name: 'Apache Xerces-C++' as const, version: '3.3.0' },
          status: 'valid' as const,
          diagnostics: [],
          metrics: {
            elapsedMs: 1,
            fileCount: files.length,
            inputBytes: files.reduce(
              (total, file) => total + file.bytes.length,
              0,
            ),
          },
        }));
        const result = await validateWithProductionXerces(
          {
            attemptId: `depth-${depth}`,
            format: 'xsd',
            entryPath: 'level-0.xsd',
            files,
          },
          async () => ({ run: adapterRun }),
        );
        expect(result.status).toBe(expectedStatus);
        if (expectedStatus === 'blocked') {
          expect(result.diagnostics).toEqual([
            expect.objectContaining({
              code: 'xerces:resource-dependency-depth',
              category: 'resource-limit',
            }),
          ]);
          expect(adapterRun).not.toHaveBeenCalled();
        } else {
          expect(adapterRun).toHaveBeenCalledOnce();
        }
      },
    );

    it.each([
      [31, 'valid'],
      [32, 'valid'],
      [33, 'blocked'],
    ] as const)(
      'enforces a DTD external parameter-entity depth of %i as %s',
      async (depth, expectedStatus) => {
        const files = Array.from({ length: depth + 1 }, (_, index) => ({
          path: `parameter-level-${index}.dtd`,
          bytes: new TextEncoder().encode(
            index < depth
              ? `<!ENTITY % next SYSTEM "parameter-level-${index + 1}.dtd">%next;`
              : '<!ELEMENT leaf EMPTY>',
          ),
        }));
        const adapterRun = vi.fn(() => ({
          attemptId: `parameter-depth-${depth}`,
          engine: { name: 'Apache Xerces-C++' as const, version: '3.3.0' },
          status: 'valid' as const,
          diagnostics: [],
          metrics: {
            elapsedMs: 1,
            fileCount: files.length,
            inputBytes: files.reduce(
              (total, file) => total + file.bytes.length,
              0,
            ),
          },
        }));
        const result = await validateWithProductionXerces(
          {
            attemptId: `parameter-depth-${depth}`,
            format: 'dtd',
            entryPath: 'parameter-level-0.dtd',
            files,
          },
          async () => ({ run: adapterRun }),
        );
        expect(result.status).toBe(expectedStatus);
        if (expectedStatus === 'blocked') {
          expect(result.diagnostics).toEqual([
            expect.objectContaining({
              code: 'xerces:resource-dependency-depth',
              category: 'resource-limit',
            }),
          ]);
          expect(adapterRun).not.toHaveBeenCalled();
        } else {
          expect(adapterRun).toHaveBeenCalledOnce();
        }
      },
    );

    it('does not fabricate dependency edges from comments, CDATA, or foreign appinfo', async () => {
      const files = Array.from({ length: 34 }, (_, index) => ({
        path: `annotation-${index}.xsd`,
        bytes: new TextEncoder()
          .encode(`<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:f="urn:foreign">
          <!-- <xs:include schemaLocation="annotation-${index + 1}.xsd"/> -->
          <xs:annotation><xs:appinfo><f:include schemaLocation="annotation-${index + 1}.xsd"/></xs:appinfo></xs:annotation>
          <xs:element name="item${index}"/>
        </xs:schema>`),
      }));
      const adapterRun = vi.fn(() => ({
        attemptId: 'annotation-not-dependency',
        engine: { name: 'Apache Xerces-C++' as const, version: '3.3.0' },
        status: 'valid' as const,
        diagnostics: [],
        metrics: { elapsedMs: 1, fileCount: files.length, inputBytes: 1 },
      }));
      const result = await validateWithProductionXerces(
        {
          attemptId: 'annotation-not-dependency',
          format: 'xsd',
          entryPath: 'annotation-0.xsd',
          files,
        },
        async () => ({ run: adapterRun }),
      );
      expect(result.status).toBe('valid');
      expect(adapterRun).toHaveBeenCalledOnce();
    });

    it('treats include cycles and shared diamond dependencies as cycle-safe', async () => {
      const sources = {
        'root.xsd':
          '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:include schemaLocation="left.xsd"/><xs:include schemaLocation="right.xsd"/></xs:schema>',
        'left.xsd':
          '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:include schemaLocation="shared.xsd"/></xs:schema>',
        'right.xsd':
          '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:include schemaLocation="shared.xsd"/></xs:schema>',
        'shared.xsd':
          '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:include schemaLocation="root.xsd"/></xs:schema>',
      };
      const files = Object.entries(sources).map(([path, source]) => ({
        path,
        bytes: new TextEncoder().encode(source),
      }));
      const adapterRun = vi.fn(() => ({
        attemptId: 'cycle-safe',
        engine: { name: 'Apache Xerces-C++' as const, version: '3.3.0' },
        status: 'valid' as const,
        diagnostics: [],
        metrics: { elapsedMs: 1, fileCount: files.length, inputBytes: 1 },
      }));
      const result = await validateWithProductionXerces(
        {
          attemptId: 'cycle-safe',
          format: 'xsd',
          entryPath: 'root.xsd',
          files,
        },
        async () => ({ run: adapterRun }),
      );
      expect(result.status).toBe('valid');
      expect(adapterRun).toHaveBeenCalledOnce();
    });
  });

  it('pins Xerces-C++ 3.3.0 and the reviewed artifact manifest', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(runtimeRoot, 'runtime-manifest.json'), 'utf8'),
    );
    expect(manifest).toMatchObject({
      engine: 'Apache Xerces-C++',
      xercesVersion: '3.3.0',
      xercesSourceSha256:
        'c35a6f04e853bde456c65ec38a4496c7ccf60b27c6989ff4e2149db9ea40648c',
      emscriptenVersion: '6.0.5',
      productionLoading: {
        javascriptPackaging: 'dynamic-es-module-js',
        wasmInstantiation: 'prefetched-byte-array',
      },
      buildConfiguration: {
        optimization: '-O2',
        exceptionHandling: 'JavaScript',
        lto: false,
        filesystem: false,
        network: false,
        upstreamPatched: false,
      },
    });
    expect(manifest.artifacts).toHaveLength(2);
    expect(
      manifest.artifacts.map(({ file }: { file: string }) => file),
    ).toEqual(['xerces-runtime.js', 'xerces-runtime.wasm']);
    expect(manifest.attributionFiles).toHaveLength(3);
  });

  it('checks a valid single-file XSD with the actual runtime', async () => {
    const result = await validate('valid', 'xsd', 'valid.xsd', [
      await fixture('valid.xsd', 'xsd/valid.xsd'),
    ]);
    expect(result.status).toBe('valid');
    expect(result.engine).toEqual({
      name: 'Apache Xerces-C++',
      version: '3.3.0',
    });
  });

  it.each([
    ['dtd', 'mixed.dtd', 'dtd/visualization/mixed-supported-unsupported.dtd'],
    ['xsd', 'mixed.xsd', 'xsd/visualization/mixed-supported-unsupported.xsd'],
    ['xsd', 'many-findings.xsd', 'xsd/visualization/many-findings.xsd'],
    ['xsd', 'task-13.12-structural.xsd', 'xsd/task-13.12-structural.xsd'],
    [
      'xsd',
      'task-13.15-annotation-completeness.xsd',
      'xsd/task-13.15-annotation-completeness.xsd',
    ],
    ['dtd', 'unsupported-only.dtd', 'dtd/visualization/unsupported-only.dtd'],
  ] as const)(
    'accepts the tolerant-visualization %s fixture with the actual runtime',
    async (format, entryPath, fixturePath) => {
      const result = await validate('visualization-valid', format, entryPath, [
        {
          path: entryPath,
          bytes: new Uint8Array(
            await readFile(path.join(visualizationFixtureRoot, fixturePath)),
          ),
        },
      ]);
      expect(result.status, JSON.stringify(result.diagnostics)).toBe('valid');
    },
  );

  it('rejects malformed and grammar-invalid XSD before extraction with complete locations', async () => {
    const malformed = await validate('malformed', 'xsd', 'malformed.xsd', [
      await fixture('malformed.xsd', 'xsd/malformed.xsd'),
    ]);
    const grammar = await validate('grammar', 'xsd', 'grammar-errors.xsd', [
      await fixture('grammar-errors.xsd', 'xsd/grammar-errors.xsd'),
    ]);
    expect(malformed.status).toBe('invalid');
    expect(
      malformed.diagnostics.some(({ line, column }) => line && column),
    ).toBe(true);
    expect(grammar.status).toBe('invalid');
    expect(grammar.diagnostics.length).toBeGreaterThanOrEqual(2);
    expect(
      grammar.diagnostics.every(
        ({ category }) => category === 'standards-invalid',
      ),
    ).toBe(true);
  });

  it('resolves local XSD include and import projects', async () => {
    const included = await validate('include', 'xsd', 'include/main.xsd', [
      await fixture('include/main.xsd', 'xsd/include/main.xsd'),
      await fixture('include/included.xsd', 'xsd/include/included.xsd'),
    ]);
    const imported = await validate('import', 'xsd', 'import/main.xsd', [
      await fixture('import/main.xsd', 'xsd/import/main.xsd'),
      await fixture('import/other.xsd', 'xsd/import/other.xsd'),
    ]);
    expect(included.status).toBe('valid');
    expect(imported.status).toBe('valid');
  });

  it.each([
    ['missing', 'xsd/missing-dependency.xsd', 'blocked-dependency'],
    ['remote', 'xsd/remote-dependency.xsd', 'security'],
    ['traversal', 'xsd/traversal-dependency.xsd', 'security'],
  ] as const)(
    'blocks %s XSD dependency resolution as %s',
    async (name, sourcePath, category) => {
      const result = await validate(name, 'xsd', 'main.xsd', [
        await fixture('main.xsd', sourcePath),
      ]);
      expect(result.status).toBe('blocked');
      expect(result.diagnostics[0]).toMatchObject({
        category,
        severity: 'error',
      });
    },
  );

  it('returns unsupported rather than invalid for explicit XSD 1.1', async () => {
    const result = await validate('xsd11', 'xsd', 'xsd-1.1.xsd', [
      await fixture('xsd-1.1.xsd', 'xsd/xsd-1.1.xsd'),
    ]);
    expect(result.status).toBe('unsupported');
    expect(result.diagnostics[0]?.category).toBe('unsupported-standard');
    expect(result.diagnostics[0]?.message).toBe(
      'This schema declares an XSD 1.1 requirement; XML Carousel supports XSD 1.0 validation.',
    );
  });

  it('checks standalone DTD grammar without claiming XML-instance validation', async () => {
    const valid = await validate('dtd-valid', 'dtd', 'valid.dtd', [
      await fixture('valid.dtd', 'dtd/valid.dtd'),
    ]);
    const invalid = await validate('dtd-invalid', 'dtd', 'broken.dtd', [
      await fixture('broken.dtd', 'dtd/malformed-element.dtd'),
    ]);
    expect(valid.status).toBe('valid');
    expect(invalid.status).toBe('invalid');
  });

  it('enforces declaration constraints in the validating-probe phase', async () => {
    const cases = [
      ['invalid-id-default.dtd', 'invalid', 'xerces-validity:8'],
      ['invalid-id-fixed-default.dtd', 'invalid', 'xerces-validity:8'],
      ['valid-id-implied.dtd', 'valid', undefined],
      ['valid-id-required.dtd', 'valid', undefined],
      ['multiple-id-attributes.dtd', 'invalid', 'xerces-validity:11'],
      ['invalid-nmtoken-default.dtd', 'invalid', 'xerces-validity:25'],
      ['invalid-enumeration-default.dtd', 'invalid', 'xerces-validity:23'],
      ['duplicate-enumeration-token.dtd', 'invalid', 'xerces-validity:77'],
      ['multiple-notation-attributes.dtd', 'invalid', 'xerces-validity:76'],
      ['notation-on-empty-element.dtd', 'invalid', 'xerces-validity:74'],
      ['undeclared-notation-attribute.dtd', 'invalid', 'xerces-validity:14'],
      [
        'undeclared-unparsed-entity-notation.dtd',
        'invalid',
        'xerces-validity:4',
      ],
      ['valid-unparsed-entity.dtd', 'valid', undefined],
      ['duplicate-element.dtd', 'invalid', 'xerces-validity:10'],
      ['duplicate-notation.dtd', 'invalid', 'xerces-xml:2'],
      ['improper-pe-nesting.dtd', 'invalid', 'xerces-xml:263'],
      ['recursive-parameter-entity.dtd', 'invalid', 'xerces-xml:205'],
      ['recursive-general-entities.dtd', 'invalid', 'xerces-xml:205'],
      ['malformed-conditional-section.dtd', 'invalid', 'xerces-validity:52'],
      ['instance-dependent-idrefs.dtd', 'valid', undefined],
    ] as const;

    for (const [fileName, status, code] of cases) {
      const result = await validate(fileName, 'dtd', fileName, [
        await conformanceFile(fileName),
      ]);
      expect(result.status, fileName).toBe(status);
      if (code) {
        expect(
          result.diagnostics.some((diagnostic) => diagnostic.code === code),
          fileName,
        ).toBe(true);
      }
      expect(JSON.stringify(result), fileName).not.toContain(
        '__xml_carousel_probe__',
      );
    }
  });

  it('checks supplied external parsed entities and keeps legal lint cases nonfatal', async () => {
    const external = await validate(
      'external-general-entity-malformed.dtd',
      'dtd',
      'external-general-entity-malformed.dtd',
      [
        await conformanceFile('external-general-entity-malformed.dtd'),
        await conformanceFile('malformed-chapter.ent'),
      ],
    );
    expect(external.status).toBe('invalid');
    expect(
      external.diagnostics.some(({ code }) => code === 'xerces-xml:180'),
    ).toBe(true);
    expect(JSON.stringify(external)).not.toContain('__xml_carousel_probe__');

    for (const fileName of [
      'duplicate-attribute.dtd',
      'undeclared-attlist-target.dtd',
      'undeclared-child.dtd',
      'probe-required-attribute.dtd',
      'probe-content-model.dtd',
    ]) {
      const result = await validate(fileName, 'dtd', fileName, [
        await conformanceFile(fileName),
      ]);
      expect(result.status, fileName).toBe('valid');
      expect(JSON.stringify(result), fileName).not.toContain(
        '__xml_carousel_probe__',
      );
    }
  });

  it('filters only the six documented probe-induced instance codes', () => {
    const diagnostics = [
      ...[2, 6, 7, 16, 21, 75].map((code) => ({
        id: `probe-${code}`,
        severity: 'error' as const,
        message: 'synthetic instance mismatch',
        code: `xerces-validity:${code}`,
        phase: 'probe' as const,
      })),
      {
        id: 'real-id-default',
        severity: 'error' as const,
        message: 'ID attribute must be #IMPLIED or #REQUIRED',
        code: 'xerces-validity:8',
        phase: 'probe' as const,
      },
      {
        id: 'same-code-real-phase',
        severity: 'error' as const,
        message: 'real document diagnostic',
        code: 'xerces-validity:2',
        phase: 'document' as const,
      },
    ];
    expect(filterProbeOnlyXercesDiagnostics(diagnostics)).toEqual(
      diagnostics.slice(-2),
    );
  });

  it.each(['attlist-undeclared-element.dtd', 'duplicate-attribute.dtd'])(
    'accepts the audited visualization-lint fixture %s',
    async (filename) => {
      const bytes = new Uint8Array(
        await readFile(path.resolve('tests/fixtures/dtd', filename)),
      );
      const result = await validate(`audit-${filename}`, 'dtd', filename, [
        { path: filename, bytes },
      ]);

      expect(result.status).toBe('valid');
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(
        result.diagnostics.every(
          ({ severity, category, source }) =>
            severity === 'warning' &&
            category === 'standards-invalid' &&
            source === 'dtd',
        ),
      ).toBe(true);
    },
  );

  it('accepts the audited same-basename DTD ZIP without cross-file lint', async () => {
    const archive = await JSZip.loadAsync(
      await readFile(
        path.resolve('tests/fixtures/zip/duplicate-dtd-names.zip'),
      ),
    );
    const paths = Object.keys(archive.files)
      .filter((entryPath) => entryPath.endsWith('.dtd'))
      .sort();
    const files = await Promise.all(
      paths.map(async (entryPath) => ({
        path: entryPath,
        bytes: await archive.files[entryPath]!.async('uint8array'),
      })),
    );

    expect(paths).toEqual(['a/shared.dtd', 'b/shared.dtd']);
    for (const entryPath of paths) {
      const standards = await validate(
        `audit-${entryPath}`,
        'dtd',
        entryPath,
        files,
      );
      expect(standards.status).toBe('valid');

      const source = new TextDecoder().decode(
        files.find(({ path: candidate }) => candidate === entryPath)?.bytes,
      );
      const imported = importDtdSource(source, {
        projectId: `audit:${entryPath}`,
        displayName: entryPath,
        sourceFileId: `audit-source:${entryPath}`,
        sourceFilename: entryPath,
      });
      expect(imported.status).toBe('success');
      expect(imported.diagnostics).toEqual([]);
    }
  });

  it('validates every entry of the reproducible XSD include ZIP', async () => {
    const archive = await JSZip.loadAsync(
      await readFile(path.resolve('tests/fixtures/zip/valid-xsd-include.zip')),
    );
    const paths = Object.keys(archive.files)
      .filter((entryPath) => entryPath.endsWith('.xsd'))
      .sort();
    const files = await Promise.all(
      paths.map(async (entryPath) => ({
        path: entryPath,
        bytes: await archive.files[entryPath]!.async('uint8array'),
      })),
    );

    expect(paths).toEqual(['schemas/included.xsd', 'schemas/main.xsd']);
    for (const entryPath of paths) {
      const result = await validate(
        `include-zip-${entryPath}`,
        'xsd',
        entryPath,
        files,
      );
      expect(result.status, entryPath).toBe('valid');
    }
  });

  it('validates safe nested parent includes with one canonical map in either ZIP order', async () => {
    const archive = await JSZip.loadAsync(
      await readFile(
        path.resolve(
          'tests/fixtures/zip/visualization/common-root-nested-includes.zip',
        ),
      ),
    );
    const paths = Object.keys(archive.files)
      .filter((entryPath) => entryPath.endsWith('.xsd'))
      .map((entryPath) => entryPath.replace(/^project-root\//u, ''))
      .sort();
    const files = await Promise.all(
      paths.map(async (entryPath) => ({
        path: entryPath,
        bytes:
          await archive.files[`project-root/${entryPath}`]!.async('uint8array'),
      })),
    );
    expect(paths).toEqual([
      'common.xsd',
      'entities/character.xsd',
      'entity.xsd',
      'rich-text.xsd',
      'rules.xsd',
    ]);
    for (const orderedFiles of [files, [...files].reverse()]) {
      for (const entryPath of paths) {
        const result = await validate(
          `nested-include-${entryPath}-${orderedFiles[0]?.path}`,
          'xsd',
          entryPath,
          orderedFiles,
        );
        expect(result.status, entryPath).toBe('valid');
      }
    }
  });

  it('keeps the broader DTD audit matrix tied to Xerces and extractor outcomes', async () => {
    const inlineCases = [
      {
        name: 'duplicate-element',
        source: '<!ELEMENT duplicate EMPTY>\n<!ELEMENT duplicate ANY>',
        classification: 'standards-invalid-declaration',
        xercesStatus: 'invalid',
        xercesWarnings: 0,
        importStatus: 'failure',
      },
      {
        name: 'undeclared-content-name',
        source: '<!ELEMENT root (missing)>',
        classification: 'legal-and-unremarkable',
        xercesStatus: 'valid',
        xercesWarnings: 1,
        importStatus: 'success',
      },
      {
        name: 'duplicate-entity',
        source: '<!ENTITY e "a">\n<!ENTITY e "b">\n<!ELEMENT root EMPTY>',
        classification: 'legal-and-unremarkable',
        xercesStatus: 'valid',
        xercesWarnings: 0,
        importStatus: 'success',
      },
      {
        name: 'duplicate-notation',
        source:
          '<!NOTATION gif SYSTEM "a">\n<!NOTATION gif SYSTEM "b">\n<!ELEMENT root EMPTY>',
        classification: 'standards-invalid-declaration',
        xercesStatus: 'invalid',
        xercesWarnings: 0,
        importStatus: 'failure',
      },
      {
        name: 'attlist-before-element',
        source: '<!ATTLIST root id ID #IMPLIED>\n<!ELEMENT root EMPTY>',
        classification: 'legal-and-unremarkable',
        xercesStatus: 'valid',
        xercesWarnings: 0,
        importStatus: 'success',
      },
      {
        name: 'empty-dtd',
        source: '',
        classification: 'visualization-regression',
        xercesStatus: 'valid',
        xercesWarnings: 0,
        importStatus: 'failure',
      },
      {
        name: 'entity-only',
        source: '<!ENTITY e "a">',
        classification: 'legal-and-unremarkable',
        xercesStatus: 'valid',
        xercesWarnings: 0,
        importStatus: 'success',
      },
    ] as const;
    const fixtureCases = [
      {
        filename: 'broken.dtd',
        classification: 'standards-invalid',
        xercesStatus: 'invalid',
        xercesWarnings: 1,
        importStatus: 'failure',
      },
      {
        filename: 'invalid-enumeration-default.dtd',
        classification: 'standards-invalid-declaration',
        xercesStatus: 'invalid',
        xercesWarnings: 0,
        importStatus: 'failure',
      },
      {
        filename: 'invalid-id-default.dtd',
        classification: 'standards-invalid-declaration',
        xercesStatus: 'invalid',
        xercesWarnings: 0,
        importStatus: 'failure',
      },
      {
        filename: 'unresolved.dtd',
        classification: 'legal-and-unremarkable',
        xercesStatus: 'valid',
        xercesWarnings: 1,
        importStatus: 'success',
      },
      {
        filename: 'unterminated-comment.dtd',
        classification: 'standards-invalid',
        xercesStatus: 'invalid',
        xercesWarnings: 0,
        importStatus: 'failure',
      },
    ] as const;

    for (const audit of inlineCases) {
      expect(audit.classification).toMatch(
        /^(legal-and-unremarkable|standards-invalid-declaration|visualization-regression)$/u,
      );
      const bytes = new TextEncoder().encode(audit.source);
      const standards = await validate(
        `audit-${audit.name}`,
        'dtd',
        `${audit.name}.dtd`,
        [{ path: `${audit.name}.dtd`, bytes }],
      );
      expect(standards.status).toBe(audit.xercesStatus);
      expect(
        standards.diagnostics.filter(({ severity }) => severity === 'warning'),
      ).toHaveLength(audit.xercesWarnings);
      if (standards.status === 'valid') {
        expect(
          importDtdSource(audit.source, {
            projectId: `audit:${audit.name}`,
            displayName: audit.name,
            sourceFileId: `audit-source:${audit.name}`,
            sourceFilename: `${audit.name}.dtd`,
            standardsAccepted: true,
          }).status,
        ).toBe(audit.importStatus);
      }
    }

    for (const audit of fixtureCases) {
      expect(audit.classification).toMatch(
        /^(legal-and-unremarkable|standards-invalid|standards-invalid-declaration|visualization-regression)$/u,
      );
      const source = await readFile(
        path.resolve('tests/fixtures/dtd', audit.filename),
        'utf8',
      );
      const standards = await validate(
        `audit-${audit.filename}`,
        'dtd',
        audit.filename,
        [{ path: audit.filename, bytes: new TextEncoder().encode(source) }],
      );
      expect(standards.status).toBe(audit.xercesStatus);
      expect(
        standards.diagnostics.filter(({ severity }) => severity === 'warning'),
      ).toHaveLength(audit.xercesWarnings);
      if (standards.status === 'valid') {
        expect(
          importDtdSource(source, {
            projectId: `audit:${audit.filename}`,
            displayName: audit.filename,
            sourceFileId: `audit-source:${audit.filename}`,
            sourceFilename: audit.filename,
            standardsAccepted: true,
          }).status,
        ).toBe(audit.importStatus);
      }
    }
  });

  it('resolves a local DTD parameter entity and blocks missing or remote entities', async () => {
    const local = await validate('dtd-local', 'dtd', 'parameter/main.dtd', [
      await fixture('parameter/main.dtd', 'dtd/parameter/main.dtd'),
      await fixture(
        'parameter/declarations.ent',
        'dtd/parameter/declarations.ent',
      ),
    ]);
    const missing = await validate('dtd-missing', 'dtd', 'missing.dtd', [
      await fixture('missing.dtd', 'dtd/missing-entity.dtd'),
    ]);
    const remote = await validate('dtd-remote', 'dtd', 'remote.dtd', [
      await fixture('remote.dtd', 'dtd/remote-entity.dtd'),
    ]);
    expect(local.status).toBe('valid');
    expect(missing.status).toBe('blocked');
    expect(remote.status).toBe('blocked');
  });

  it('keeps same-basename project paths distinct', async () => {
    const result = await validate('same-basename', 'xsd', 'main.xsd', [
      await fixture('main.xsd', 'xsd/same-basename/main.xsd'),
      await fixture('a/common.xsd', 'xsd/same-basename/a/common.xsd'),
      await fixture('b/common.xsd', 'xsd/same-basename/b/common.xsd'),
    ]);
    expect(result.status).toBe('valid');
  });

  it('clears native project files between repeated checks', async () => {
    const complete = await validate('complete', 'xsd', 'include/main.xsd', [
      await fixture('include/main.xsd', 'xsd/include/main.xsd'),
      await fixture('include/included.xsd', 'xsd/include/included.xsd'),
    ]);
    const incomplete = await validate('incomplete', 'xsd', 'include/main.xsd', [
      await fixture('include/main.xsd', 'xsd/include/main.xsd'),
    ]);
    expect(complete.status).toBe('valid');
    expect(incomplete.status).toBe('blocked');
  });

  it('rejects external, host, traversal, encoded, and mixed-separator paths', () => {
    for (const candidate of [
      'https://example.invalid/a.xsd',
      'file:///etc/passwd',
      '\\\\server\\share\\a.xsd',
      'C:\\schema\\a.xsd',
      '../outside.xsd',
      '%2e%2e/outside.xsd',
      '%252e%252e%252foutside.xsd',
      'dir\\..\\outside.xsd',
    ]) {
      expect(() => normalizeXercesProjectPath(candidate)).toThrow();
    }
  });

  it('normalizes only parent references that remain inside the virtual root', () => {
    expect(
      resolveXercesProjectReference(
        'entities/characters.xsd',
        '../foundry-entity.xsd',
      ),
    ).toBe('foundry-entity.xsd');
    expect(
      resolveXercesProjectReference(
        'one/two/main.xsd',
        '../../shared/common.xsd',
      ),
    ).toBe('shared/common.xsd');
    for (const reference of [
      '../../outside.xsd',
      '%2e%2e/%2e%2e/outside.xsd',
      '%252e%252e/%252e%252e/outside.xsd',
      '/outside.xsd',
      'https://example.invalid/outside.xsd',
      'file:///outside.xsd',
      'C:/outside.xsd',
    ]) {
      expect(() =>
        resolveXercesProjectReference('entities/main.xsd', reference),
      ).toThrow();
    }
  });

  it('retains duplicate diagnostics and explicitly reports diagnostic-limit truncation', () => {
    const repeated: StandardsBoundaryDiagnostic[] = Array.from(
      { length: 501 },
      () => ({
        stage: 'standards',
        code: 'xerces:error',
        severity: 'error',
        message: 'Repeated native diagnostic.',
        category: 'standards-invalid',
      }),
    );
    const retained = retainXercesDiagnostics(repeated);
    expect(retained).toHaveLength(500);
    expect(retained.slice(0, -1)).toHaveLength(499);
    expect(retained[retained.length - 1]?.code).toBe(
      'xerces:resource-diagnostic-limit',
    );
  });

  it('keeps normal build and production source independent of compiler tools and the developer harness', async () => {
    const packageJson = await readFile(path.resolve('package.json'), 'utf8');
    const validation = await readFile(
      path.resolve('scripts/run-validation.mjs'),
      'utf8',
    );
    const worker = await readFile(
      path.resolve('src/workers/schemaImportWorkerRuntime.ts'),
      'utf8',
    );
    expect(JSON.parse(packageJson).scripts.build).toBe('vite build --base=./');
    expect(validation).not.toMatch(/bootstrap|spike:xerces:build/iu);
    expect(worker).not.toMatch(/tools\/xerces-wasm-spike|harness/iu);
  });

  it('reports a safe engine-internal not-checked result when startup fails', async () => {
    const unsafe = 'E:\\Work\\secret\\xerces-runtime.wasm at 0x1234';
    const result = await validateWithProductionXerces(
      {
        attemptId: 'startup-failure',
        format: 'xsd',
        entryPath: 'valid.xsd',
        files: [await fixture('valid.xsd', 'xsd/valid.xsd')],
      },
      async () => Promise.reject(new Error(unsafe)),
    );
    expect(result.status).toBe('internal-error');
    expect(result.diagnostics[0]).toMatchObject({
      code: 'xerces:initialization-failure',
      category: 'engine-internal',
      message:
        "XML Carousel's standards checker could not start, so this file was not checked.",
    });
    expect(result.diagnostics[1]).toMatchObject({
      code: 'xerces:runtime-module-load-failure',
      category: 'engine-internal',
      message:
        'A required standards-checker runtime module could not be loaded.',
    });
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ category: 'standards-invalid' }),
    );
    expect(JSON.stringify(result)).not.toContain(unsafe);
    expect(JSON.stringify(result)).not.toMatch(/0x1234|E:\\\\Work/iu);
  });
});
