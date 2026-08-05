import { describe, expect, it, vi } from 'vitest';
import type { SchemaProject } from '../model';
import { parseXsd } from './xsdParser';
import { buildXsdSchemaProject } from './xsdProjectBuilder';
import {
  createXsdImporter,
  importXsdSource,
  type XsdImportOptions,
  type XsdImportResult,
} from './xsdImport';

const source =
  '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="root"/></xs:schema>';
const options: XsdImportOptions = {
  projectId: 'xsd:import',
  displayName: 'Imported XSD',
  sourceFileId: 'schema-source',
  sourceFilename: 'schema.xsd',
};
const diagnosticRange = {
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 1, line: 1, column: 2 },
  sourceId: options.sourceFileId,
};

function successfulFixture() {
  const parsed = parseXsd(source, options.sourceFileId);
  if (!parsed.schema) throw new Error('Expected fixture schema.');
  const built = buildXsdSchemaProject(parsed.schema, source, options);
  if (!built.project) throw new Error('Expected fixture project.');
  return { parsed, built };
}

function assertPlain(value: unknown, seen = new Set<object>()): void {
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new Error(`Forbidden ${typeof value}.`);
  }
  if (!value || typeof value !== 'object') return;
  expect(value).not.toBeInstanceOf(Map);
  expect(value).not.toBeInstanceOf(Set);
  expect(seen.has(value)).toBe(false);
  seen.add(value);
  const prototype = Object.getPrototypeOf(value);
  expect(
    Array.isArray(value) ||
      prototype === Object.prototype ||
      prototype === null,
  ).toBe(true);
  for (const child of Object.values(value)) assertPlain(child, seen);
  seen.delete(value);
}

describe('XSD import pipeline', () => {
  it('passes exact inputs through parse then build and returns its unique document element', () => {
    const { parsed, built } = successfulFixture();
    const parse = vi.fn(() => parsed);
    const build = vi.fn(() => built);
    const buildSourceMarkup = vi.fn(() => ({}));
    const importer = createXsdImporter({
      parse,
      build,
      buildSourceMarkup,
    });

    const result = importer(source, options);

    expect(parse).toHaveBeenCalledWith(source, options.sourceFileId);
    expect(build).toHaveBeenCalledWith(parsed.schema, source, options);
    expect(buildSourceMarkup).toHaveBeenCalledWith(
      built.project,
      built.metadataByNodeId,
      source,
      options.sourceFileId,
    );
    expect(result).toMatchObject({
      status: 'success',
      project: built.project,
      xsdMetadataByNodeId: built.metadataByNodeId,
      sourceMarkupByNodeId: {},
    });
    expect(
      built.project!.nodes.find(
        ({ id }) =>
          result.status === 'success' && id === result.initialFocusNodeId,
      )?.kind,
    ).toBe('globalElement');
  });

  it('returns exact node-level source markup only after a successful build', () => {
    const result = importXsdSource(source, options);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    const schemaNode = result.project.nodes.find(
      ({ kind }) => kind === 'schema',
    )!;
    const elementNode = result.project.nodes.find(
      ({ kind }) => kind === 'globalElement',
    )!;
    expect(result.sourceMarkupByNodeId[schemaNode.id]).toMatchObject({
      syntax: 'xsd',
      fragments: [{ text: source }],
    });
    expect(
      result.sourceMarkupByNodeId[elementNode.id]?.fragments[0]?.text,
    ).toBe('<xs:element name="root"/>');
  });

  it.each([
    [
      'multiple candidates',
      '<xs:element name="one"/><xs:element name="two"/>',
      'schema',
    ],
    [
      'zero candidates',
      '<xs:complexType name="OnlyType"><xs:sequence/></xs:complexType>',
      'schema',
    ],
    [
      'one outer element with a referenced helper',
      '<xs:element name="root"><xs:complexType><xs:sequence><xs:element ref="t:helper"/></xs:sequence></xs:complexType></xs:element><xs:element name="helper"/>',
      'root',
    ],
    [
      'one self-recursive candidate',
      '<xs:element name="node"><xs:complexType><xs:sequence><xs:element ref="t:node"/></xs:sequence></xs:complexType></xs:element>',
      'node',
    ],
  ])(
    'selects deterministic initial focus for %s',
    (_caseName, declarations, expectedNameOrKind) => {
      const candidateSource = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:t" targetNamespace="urn:t">${declarations}</xs:schema>`;
      const result = importXsdSource(candidateSource, options);
      expect(result.status).toBe('success');
      if (result.status !== 'success') return;

      const focused = result.project.nodes.find(
        ({ id }) => id === result.initialFocusNodeId,
      );
      expect(
        expectedNameOrKind === 'schema' ? focused?.kind : focused?.name,
      ).toBe(expectedNameOrKind);
      const repeated = importXsdSource(candidateSource, options);
      expect(repeated.status).toBe('success');
      if (repeated.status === 'success') {
        expect(repeated.initialFocusNodeId).toBe(result.initialFocusNodeId);
      }
    },
  );

  it('preserves parser then builder warning order without rewriting stages', () => {
    const { parsed, built } = successfulFixture();
    const parserWarning = {
      stage: 'xsd' as const,
      code: 'unsupported-xsd-component' as const,
      severity: 'warning' as const,
      message: 'parser warning',
      sourceId: options.sourceFileId,
      range: diagnosticRange,
    };
    const builderWarning = {
      stage: 'build' as const,
      code: 'external-type-reference-deferred' as const,
      severity: 'warning' as const,
      message: 'builder warning',
      sourceId: options.sourceFileId,
    };
    const importer = createXsdImporter({
      parse: () => ({ ...parsed, diagnostics: [parserWarning] }),
      build: () => ({ ...built, diagnostics: [builderWarning] }),
    });

    expect(importer(source, options)).toMatchObject({
      status: 'success',
      diagnostics: [parserWarning, builderWarning],
    });
  });

  it.each([
    ['failure status', true],
    ['error diagnostic', false],
  ])('does not build after parser %s', (_name, failureStatus) => {
    const { parsed, built } = successfulFixture();
    const build = vi.fn(() => built);
    const result = createXsdImporter({
      parse: () => ({
        ...parsed,
        status: failureStatus ? 'failure' : 'success',
        diagnostics: [
          {
            stage: 'xml',
            code: 'unexpected-token',
            severity: 'error',
            message: 'bad XML',
            sourceId: options.sourceFileId,
            range: diagnosticRange,
          },
        ],
      }),
      build,
    })(source, options);

    expect(result.status).toBe('failure');
    expect(build).not.toHaveBeenCalled();
  });

  it('fails defensively when a successful parse omits its schema', () => {
    const { parsed, built } = successfulFixture();
    const withoutSchema = {
      status: parsed.status,
      document: parsed.document,
      diagnostics: parsed.diagnostics,
    };
    const build = vi.fn(() => built);
    const result = createXsdImporter({
      parse: () => ({ ...withoutSchema, status: 'success' }),
      build,
    })(source, options);

    expect(result).toEqual({
      status: 'failure',
      diagnostics: [
        expect.objectContaining({
          stage: 'import',
          code: 'no-importable-schema',
        }),
      ],
    });
    expect(build).not.toHaveBeenCalled();
  });

  it('returns builder errors without exposing project metadata or focus', () => {
    const { parsed } = successfulFixture();
    const result = createXsdImporter({
      parse: () => parsed,
      build: () => ({
        diagnostics: [
          {
            stage: 'build',
            code: 'unresolved-type-reference',
            severity: 'error',
            message: 'missing',
          },
        ],
        metadataByNodeId: { partial: {} as never },
      }),
    })(source, options);

    expect(result.status).toBe('failure');
    expect(result).not.toHaveProperty('project');
    expect(result).not.toHaveProperty('xsdMetadataByNodeId');
    expect(result).not.toHaveProperty('sourceMarkupByNodeId');
    expect(result).not.toHaveProperty('initialFocusNodeId');
  });

  it('fails defensively when a builder omits a project without errors', () => {
    const { parsed } = successfulFixture();
    const result = createXsdImporter({
      parse: () => parsed,
      build: () => ({ diagnostics: [], metadataByNodeId: {} }),
    })(source, options);

    expect(result).toEqual({
      status: 'failure',
      diagnostics: [
        expect.objectContaining({
          stage: 'import',
          code: 'no-importable-schema',
        }),
      ],
    });
  });

  it.each([
    ['no roots', []],
    ['multiple roots', ['schema-root', 'another-root']],
    ['missing root', ['missing']],
  ])('rejects %s through the initial-focus contract', (_name, rootNodeIds) => {
    const { parsed, built } = successfulFixture();
    const project: SchemaProject = {
      ...built.project!,
      rootNodeIds,
    };
    const result = createXsdImporter({
      parse: () => parsed,
      build: () => ({ ...built, project }),
    })(source, options);

    expect(result).toEqual({
      status: 'failure',
      diagnostics: [
        expect.objectContaining({
          stage: 'import',
          code: 'invalid-initial-focus',
        }),
      ],
    });
  });

  it('rejects a sole non-schema root', () => {
    const { parsed, built } = successfulFixture();
    const element = built.project!.nodes.find(
      ({ kind }) => kind === 'globalElement',
    )!;
    const project = { ...built.project!, rootNodeIds: [element.id] };
    const result = createXsdImporter({
      parse: () => parsed,
      build: () => ({ ...built, project }),
    })(source, options);

    expect(result.status).toBe('failure');
    expect(result.diagnostics[result.diagnostics.length - 1]).toMatchObject({
      stage: 'import',
      code: 'invalid-initial-focus',
    });
  });

  it('falls back to the validated schema root when candidate metadata is stale', () => {
    const { parsed, built } = successfulFixture();
    const schemaId = built.project!.rootNodeIds[0]!;
    const result = createXsdImporter({
      parse: () => parsed,
      build: () => ({
        ...built,
        metadataByNodeId: {
          [schemaId]: built.metadataByNodeId[schemaId]!,
        },
      }),
    })(source, options);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.initialFocusNodeId).toBe(schemaId);
    }
  });

  it('is deterministic, serializable, plain, and does not mutate inputs', () => {
    const optionSnapshot = { ...options };
    const first = importXsdSource(source, options);
    const second = importXsdSource(source, { ...options });

    expect(first).toEqual(second);
    expect(options).toEqual(optionSnapshot);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    assertPlain(first);
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain('"document"');
    expect(serialized).not.toContain('"sourceText"');
    expect(serialized).not.toContain('"xml":{"kind"');
  });

  it.each([
    [
      'parser failure',
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element',
    ],
    [
      'builder failure',
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:t" targetNamespace="urn:t"><xs:element name="root" type="t:Missing"/></xs:schema>',
    ],
  ])('serializes a %s result without partial output', (_name, badSource) => {
    const result: XsdImportResult = importXsdSource(badSource, options);
    expect(result.status).toBe('failure');
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(result).not.toHaveProperty('project');
    expect(result).not.toHaveProperty('xsdMetadataByNodeId');
    expect(result).not.toHaveProperty('sourceMarkupByNodeId');
  });
});
