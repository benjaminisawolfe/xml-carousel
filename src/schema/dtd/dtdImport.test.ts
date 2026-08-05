import { describe, expect, it, vi } from 'vitest';
import commentsSource from '../../../tests/fixtures/dtd/comments.dtd?raw';
import type { DtdDeclarationParseResult, DtdSourceRange } from './dtdAst';
import type { DtdProjectBuildResult } from './dtdProjectBuilder';
import {
  createDtdImporter,
  importDtdSource,
  type DtdImportOptions,
} from './dtdImport';
import { parseDtdDeclarations } from './dtdParser';

const options = {
  projectId: 'test:library',
  displayName: 'Library',
  sourceFileId: 'source:library',
  sourceFilename: 'library.dtd',
} satisfies DtdImportOptions;

const librarySource = [
  '<!ELEMENT library (shelf+)>',
  '<!ELEMENT shelf (book*)>',
  '<!ELEMENT book (title, author+)>',
  '<!ELEMENT title (#PCDATA)>',
  '<!ELEMENT author (#PCDATA)>',
].join('\n');

const attributesSource = [
  '<!ELEMENT book (#PCDATA)>',
  '<!ATTLIST book id ID #REQUIRED lang CDATA "en">',
].join('\n');

function range(start: number, end: number): DtdSourceRange {
  return {
    start: { offset: start, line: 1, column: start + 1 },
    end: { offset: end, line: 1, column: end + 1 },
    sourceId: options.sourceFileId,
  };
}

describe('DTD import pipeline', () => {
  it('composes parsing and normalization into one successful result', () => {
    const result = importDtdSource(librarySource, options);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.project.displayName).toBe('Library');
    expect(result.project.sourceFiles).toEqual([
      { id: 'source:library', filename: 'library.dtd' },
    ]);
    expect(result.project.nodes.map(({ name }) => name)).toEqual([
      'library',
      'shelf',
      'book',
      'title',
      'author',
    ]);
    expect(result.initialFocusNodeId).toBe('dtd:element:library');
    expect(result.contentKindsByNodeId).toMatchObject({
      'dtd:element:library': 'elementOnly',
      'dtd:element:title': 'text',
    });
    expect(
      result.sourceMarkupByNodeId['dtd:element:library']?.fragments.map(
        ({ text }) => text,
      ),
    ).toEqual(['<!ELEMENT library (shelf+)>']);
    expect(result.diagnostics).toEqual([]);
  });

  it('imports unified ELEMENT and ATTLIST declarations with normalized metadata', () => {
    const result = importDtdSource(attributesSource, options);

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(
      result.project.nodes.map(({ kind, name }) => ({ kind, name })),
    ).toEqual([
      { kind: 'dtdElement', name: 'book' },
      { kind: 'dtdAttribute', name: 'id' },
      { kind: 'dtdAttribute', name: 'lang' },
    ]);
    expect(result.project.edges.map(({ kind }) => kind)).toEqual([
      'usesAttribute',
      'usesAttribute',
    ]);
    expect(
      Object.values(result.dtdAttributesByNodeId).map(
        ({ name, order, defaultDeclaration }) => ({
          name,
          order,
          defaultDeclaration,
        }),
      ),
    ).toEqual([
      { name: 'id', order: 0, defaultDeclaration: { kind: 'required' } },
      {
        name: 'lang',
        order: 1,
        defaultDeclaration: {
          kind: 'value',
          literal: { value: 'en', quote: 'double' },
        },
      },
    ]);
    expect(
      result.sourceMarkupByNodeId['dtd:element:book']?.fragments.map(
        ({ text }) => text,
      ),
    ).toEqual([attributesSource]);
  });

  it('imports comments as normalized metadata without graph artifacts', () => {
    const result = importDtdSource(commentsSource, {
      ...options,
      sourceFileId: 'comments.dtd',
      sourceFilename: 'comments.dtd',
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.comments).toHaveLength(6);
    expect(result.commentsByNodeId['dtd:element:book']).toHaveLength(2);
    expect(result.commentsByNodeId['dtd:element:chapter']).toHaveLength(3);
    expect(result.schemaLevelComments).toHaveLength(1);
    const bookMarkup =
      result.sourceMarkupByNodeId['dtd:element:book']?.fragments[0]?.text;
    expect(bookMarkup).toContain('<!-- The root element for the document. -->');
    expect(bookMarkup).toContain(
      '<!ELEMENT book (chapter+)><!-- Book structure. -->',
    );
    expect(JSON.stringify(result.sourceMarkupByNodeId)).not.toContain(
      'Project-level note retained at end',
    );
    expect(
      result.project.nodes.every(({ kind }) => kind !== ('comment' as never)),
    ).toBe(true);
  });

  it('passes parser comments to the builder unchanged', () => {
    const parsed = parseDtdDeclarations(
      '<!-- docs -->\n<!ELEMENT root EMPTY>',
      options.sourceFileId,
    );
    const build = vi.fn((): DtdProjectBuildResult => ({
      project: {
        id: options.projectId,
        displayName: options.displayName,
        nodes: [
          {
            id: 'dtd:element:root',
            kind: 'dtdElement',
            name: 'root',
          },
        ],
        edges: [],
        rootNodeIds: ['dtd:element:root'],
      },
      diagnostics: [],
      contentKindsByNodeId: { 'dtd:element:root': 'empty' },
      dtdAttributesByNodeId: {},
      comments: [],
      commentsByNodeId: {},
      schemaLevelComments: [],
      sourceMarkupByNodeId: {},
    }));
    const importer = createDtdImporter({ parse: () => parsed, build });

    importer('source', options);

    expect(build).toHaveBeenCalledWith(
      parsed.declarations,
      'source',
      options,
      parsed.comments,
      [],
    );
  });

  it('does not call the builder when parser errors are present', () => {
    const parseResult: DtdDeclarationParseResult = {
      declarations: [],
      comments: [],
      diagnostics: [
        {
          code: 'unexpected-token',
          severity: 'error',
          message: 'Malformed declaration.',
          range: range(4, 5),
          sourceId: options.sourceFileId,
        },
      ],
    };
    const build = vi.fn<() => DtdProjectBuildResult>();
    const importer = createDtdImporter({
      parse: () => parseResult,
      build,
    });

    expect(importer('<!ELEMENT broken (a,>', options)).toEqual({
      status: 'failure',
      diagnostics: [
        {
          stage: 'parse',
          ...parseResult.diagnostics[0],
        },
      ],
    });
    expect(build).not.toHaveBeenCalled();
  });

  it('fails malformed ATTLIST syntax at the parse stage', () => {
    const result = importDtdSource(
      '<!ELEMENT book EMPTY>\n<!ATTLIST book id ID>',
      options,
    );

    expect(result.status).toBe('failure');
    expect(result.diagnostics[0]).toMatchObject({
      stage: 'parse',
      severity: 'error',
      sourceId: options.sourceFileId,
    });
    expect(result.diagnostics[0]).toHaveProperty('range.start.offset');
  });

  it('does not treat an extracted ENTITY declaration as malformed syntax', () => {
    const result = importDtdSource('<!ENTITY copy "copyright">', options);

    expect(result.status).toBe('failure');
    expect(result.diagnostics[0]).toMatchObject({
      stage: 'import',
      code: 'no-importable-elements',
      severity: 'error',
    });
  });

  it('reports attribute semantic diagnostics at the build stage with ranges', () => {
    const result = importDtdSource(
      '<!ELEMENT book EMPTY>\n<!ATTLIST book id ID "book-1">',
      options,
    );

    expect(result.status).toBe('failure');
    expect(result.diagnostics[0]).toMatchObject({
      stage: 'build',
      code: 'invalid-id-attribute-default',
      sourceId: options.sourceFileId,
      elementName: 'book',
      attributeName: 'id',
    });
    expect(result.diagnostics[0]).toHaveProperty('range.start.offset');
  });

  it('reports builder failure only after a successful parse', () => {
    const result = importDtdSource('<!ELEMENT root (missing)>', options);

    expect(result.status).toBe('failure');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      stage: 'build',
      code: 'unresolved-element-reference',
      severity: 'error',
      sourceId: options.sourceFileId,
      elementName: 'root',
      referenceName: 'missing',
    });
    expect(result.diagnostics[0]).toHaveProperty('range.start.offset');
  });

  it('preserves parser diagnostic order, codes, messages, and ranges', () => {
    const firstRange = range(1, 2);
    const secondRange = range(7, 8);
    const parse = vi.fn((): DtdDeclarationParseResult => ({
      declarations: [],
      comments: [],
      diagnostics: [
        {
          code: 'missing-element-name',
          severity: 'error',
          message: 'First.',
          range: firstRange,
          sourceId: options.sourceFileId,
        },
        {
          code: 'unterminated-declaration',
          severity: 'error',
          message: 'Second.',
          range: secondRange,
          sourceId: options.sourceFileId,
        },
      ],
    }));
    const importer = createDtdImporter({
      parse,
      build: vi.fn(),
    });

    const result = importer('malformed', options);

    expect(
      result.diagnostics.map(({ stage, code }) => ({ stage, code })),
    ).toEqual([
      { stage: 'parse', code: 'missing-element-name' },
      { stage: 'parse', code: 'unterminated-declaration' },
    ]);
    expect(result.diagnostics.map(({ message }) => message)).toEqual([
      'First.',
      'Second.',
    ]);
    expect(
      result.diagnostics.map((diagnostic) =>
        'range' in diagnostic ? diagnostic.range : undefined,
      ),
    ).toEqual([firstRange, secondRange]);
  });

  it('fails an empty source with one import-level diagnostic', () => {
    const result = importDtdSource('', options);

    expect(result).toEqual({
      status: 'failure',
      diagnostics: [
        {
          stage: 'import',
          code: 'no-importable-elements',
          severity: 'error',
          message:
            'The DTD source contains no importable element declarations.',
          sourceId: options.sourceFileId,
        },
      ],
    });
  });

  it('selects the first root in declaration order for multiple roots', () => {
    const result = importDtdSource(
      '<!ELEMENT alpha EMPTY>\n<!ELEMENT beta EMPTY>',
      options,
    );

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.project.rootNodeIds).toEqual([
      'dtd:element:alpha',
      'dtd:element:beta',
    ]);
    expect(result.initialFocusNodeId).toBe('dtd:element:alpha');
  });

  it('falls back to the first declaration when a cycle has no roots', () => {
    const result = importDtdSource(
      '<!ELEMENT a (b)>\n<!ELEMENT b (a)>',
      options,
    );

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.project.rootNodeIds).toEqual([]);
    expect(result.initialFocusNodeId).toBe('dtd:element:a');
  });

  it('is deterministic and JSON serializable', () => {
    const first = importDtdSource(librarySource, options);
    const second = importDtdSource(librarySource, options);

    expect(first).toEqual(second);
    expect(() => JSON.stringify(first)).not.toThrow();
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it('does not mutate source text or options', () => {
    const sourceBefore = librarySource;
    const optionsBefore = JSON.stringify(options);

    importDtdSource(librarySource, options);

    expect(librarySource).toBe(sourceBefore);
    expect(JSON.stringify(options)).toBe(optionsBefore);
  });

  it('keeps parser diagnostics before builder diagnostics when both exist', () => {
    const parseDiagnostic = {
      code: 'unexpected-token' as const,
      severity: 'error' as const,
      message: 'Parser note.',
      range: range(0, 1),
    };
    const buildDiagnostic = {
      code: 'invalid-build-option' as const,
      severity: 'error' as const,
      message: 'Builder note.',
    };
    const importer = createDtdImporter({
      parse: () => ({
        declarations: [],
        comments: [],
        diagnostics: [],
      }),
      build: () => ({
        diagnostics: [buildDiagnostic],
        contentKindsByNodeId: {},
        dtdAttributesByNodeId: {},
        comments: [],
        commentsByNodeId: {},
        schemaLevelComments: [],
        sourceMarkupByNodeId: {},
      }),
    });
    const result = importer('source', options);

    expect(result.diagnostics).toEqual([
      { stage: 'build', ...buildDiagnostic },
    ]);

    const gatedImporter = createDtdImporter({
      parse: () => ({
        declarations: [],
        comments: [],
        diagnostics: [parseDiagnostic],
      }),
      build: vi.fn(),
    });
    expect(gatedImporter('source', options).diagnostics).toEqual([
      { stage: 'parse', ...parseDiagnostic },
    ]);
  });
});
