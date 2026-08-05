import { describe, expect, it } from 'vitest';
import annotatedSource from '../../../tests/fixtures/xsd/annotations.xsd?raw';
import anonymousTypesSource from '../../../tests/fixtures/xsd/anonymous-types.xsd?raw';
import type {
  SchemaNode,
  SchemaNodeKind,
  SchemaProject,
  SchemaSourceRange,
} from '../model';
import { importXsdSource, type XsdImportOptions } from './xsdImport';
import type {
  XsdMetadataByNodeId,
  XsdNodeMetadata,
} from './xsdProjectMetadata';
import { buildXsdSourceMarkupByNodeId } from './xsdSourceMarkup';

const options: XsdImportOptions = {
  projectId: 'xsd:source-markup',
  displayName: 'Source markup',
  sourceFileId: 'annotations.xsd',
  sourceFilename: 'annotations.xsd',
};

function imported(sourceText = annotatedSource, overrides = {}) {
  const result = importXsdSource(sourceText, { ...options, ...overrides });
  if (result.status !== 'success') {
    throw new Error('Expected the source-markup fixture to import.');
  }
  return result;
}

function findNode(
  project: SchemaProject,
  metadataByNodeId: XsdMetadataByNodeId,
  kind: SchemaNodeKind,
  predicate: (node: SchemaNode, metadata: XsdNodeMetadata) => boolean,
): SchemaNode {
  const node = project.nodes.find((candidate) => {
    const metadata = metadataByNodeId[candidate.id];
    return (
      candidate.kind === kind &&
      metadata !== undefined &&
      predicate(candidate, metadata)
    );
  });
  if (!node) throw new Error(`Expected ${kind} fixture node.`);
  return node;
}

function exactSlice(sourceText: string, range: SchemaSourceRange): string {
  return sourceText.slice(range.start.offset, range.end.offset);
}

describe('XSD node source markup', () => {
  it('builds one exact deterministic XSD fragment for every valid normalized node', () => {
    const result = imported();
    const first = buildXsdSourceMarkupByNodeId(
      result.project,
      result.xsdMetadataByNodeId,
      annotatedSource,
      options.sourceFileId,
    );
    const second = buildXsdSourceMarkupByNodeId(
      result.project,
      result.xsdMetadataByNodeId,
      annotatedSource,
      options.sourceFileId,
    );

    expect(first).toEqual(second);
    const sourceNodes = result.project.nodes.filter(
      ({ kind }) => kind !== 'builtInType',
    );
    expect(Object.keys(first)).toHaveLength(sourceNodes.length);
    for (const node of sourceNodes) {
      const metadata = result.xsdMetadataByNodeId[node.id]!;
      const markup = first[node.id]!;
      expect(markup.syntax).toBe('xsd');
      expect(markup.fragments).toHaveLength(1);
      expect(markup.fragments[0]).toEqual({
        id: `xsd:source-markup:${encodeURIComponent(options.sourceFileId)}:${metadata.sourceRange.start.offset}-${metadata.sourceRange.end.offset}`,
        sourceFileId: options.sourceFileId,
        range: metadata.sourceRange,
        text: exactSlice(annotatedSource, metadata.sourceRange),
      });
      expect(markup.fragments[0]?.range).not.toBe(metadata.sourceRange);
    }
  });

  it('uses the schema range as authority and excludes the XML declaration', () => {
    const result = imported();
    const schemaNode = result.project.nodes.find(
      ({ kind }) => kind === 'schema',
    )!;
    const markup = result.sourceMarkupByNodeId[schemaNode.id]!;

    expect(markup.fragments[0]?.text).toBe(
      annotatedSource.slice(
        annotatedSource.indexOf('<xs:schema'),
        annotatedSource.lastIndexOf('</xs:schema>') + '</xs:schema>'.length,
      ),
    );
    expect(markup.fragments[0]?.text).not.toContain('<?xml');
  });

  it('captures exact global and local element and attribute elements', () => {
    const result = imported();
    const cases = [
      findNode(
        result.project,
        result.xsdMetadataByNodeId,
        'globalElement',
        ({ name }) => name === 'root',
      ),
      findNode(
        result.project,
        result.xsdMetadataByNodeId,
        'localElement',
        ({ name }) => name === 'child',
      ),
      findNode(
        result.project,
        result.xsdMetadataByNodeId,
        'attribute',
        ({ name }, metadata) =>
          name === 'globalCode' && metadata.scope === 'global',
      ),
      findNode(
        result.project,
        result.xsdMetadataByNodeId,
        'attribute',
        ({ name }, metadata) =>
          name === 'localCode' && metadata.scope === 'local',
      ),
    ];

    for (const node of cases) {
      const metadata = result.xsdMetadataByNodeId[node.id]!;
      expect(result.sourceMarkupByNodeId[node.id]?.fragments[0]?.text).toBe(
        exactSlice(annotatedSource, metadata.sourceRange),
      );
    }
    expect(
      result.sourceMarkupByNodeId[cases[1]!.id]?.fragments[0]?.text,
    ).toContain('Anonymous simple type documentation.');
    expect(
      result.sourceMarkupByNodeId[cases[3]!.id]?.fragments[0]?.text,
    ).toContain('Local attribute documentation.');
  });

  it('captures named and anonymous complex and simple type elements', () => {
    const annotated = imported();
    const anonymous = imported(anonymousTypesSource, {
      projectId: 'xsd:anonymous-source-markup',
      sourceFileId: 'anonymous-types.xsd',
      sourceFilename: 'anonymous-types.xsd',
    });
    const cases = [
      [
        annotated,
        annotatedSource,
        findNode(
          annotated.project,
          annotated.xsdMetadataByNodeId,
          'complexType',
          ({ name }) => name === 'BaseType',
        ),
      ],
      [
        annotated,
        annotatedSource,
        findNode(
          annotated.project,
          annotated.xsdMetadataByNodeId,
          'simpleType',
          ({ name }) => name === 'StatusType',
        ),
      ],
      [
        anonymous,
        anonymousTypesSource,
        findNode(
          anonymous.project,
          anonymous.xsdMetadataByNodeId,
          'complexType',
          (_node, metadata) => metadata.anonymous === true,
        ),
      ],
      [
        anonymous,
        anonymousTypesSource,
        findNode(
          anonymous.project,
          anonymous.xsdMetadataByNodeId,
          'simpleType',
          (_node, metadata) => metadata.anonymous === true,
        ),
      ],
    ] as const;

    for (const [result, sourceText, node] of cases) {
      const metadata = result.xsdMetadataByNodeId[node.id]!;
      expect(result.sourceMarkupByNodeId[node.id]?.fragments[0]?.text).toBe(
        exactSlice(sourceText, metadata.sourceRange),
      );
    }
  });

  it('captures sequence, choice, and all compositors as complete elements', () => {
    const sourceText = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:complexType name="SequenceType"><xs:sequence><xs:element name="one"/></xs:sequence></xs:complexType>
  <xs:complexType name="ChoiceType"><xs:choice><xs:element name="two"/></xs:choice></xs:complexType>
  <xs:complexType name="AllType"><xs:all><xs:element name="three"/></xs:all></xs:complexType>
</xs:schema>`;
    const result = imported(sourceText, {
      projectId: 'xsd:compositor-source-markup',
      sourceFileId: 'compositors.xsd',
      sourceFilename: 'compositors.xsd',
    });

    for (const kind of ['sequence', 'choice', 'all'] as const) {
      const node = findNode(
        result.project,
        result.xsdMetadataByNodeId,
        kind,
        () => true,
      );
      const text = result.sourceMarkupByNodeId[node.id]?.fragments[0]?.text;
      expect(text).toMatch(new RegExp(`^<xs:${kind}>`));
      expect(text).toContain(`</xs:${kind}>`);
    }
  });

  it('keeps annotation and forwarded context naturally inside owner markup', () => {
    const result = imported();
    const extendedType = findNode(
      result.project,
      result.xsdMetadataByNodeId,
      'complexType',
      ({ name }) => name === 'ExtendedType',
    );
    const restriction = findNode(
      result.project,
      result.xsdMetadataByNodeId,
      'restriction',
      ({ name }) => name === 'Restriction of StatusType',
    );

    const typeText =
      result.sourceMarkupByNodeId[extendedType.id]?.fragments[0]?.text;
    expect(typeText).toContain('<xs:complexContent>');
    expect(typeText).toContain('Complex-content documentation.');
    expect(typeText).toContain('<xs:extension base="a:BaseType">');

    const restrictionText =
      result.sourceMarkupByNodeId[restriction.id]?.fragments[0]?.text;
    expect(restrictionText).toContain('<xs:enumeration value="active">');
    expect(restrictionText).toContain('<xs:appinfo source="tool/active">');
  });

  it('captures complete extension, simple restriction, and complex restriction elements', () => {
    const result = imported();
    const cases = [
      findNode(
        result.project,
        result.xsdMetadataByNodeId,
        'extension',
        ({ name }) => name === 'Extension of ExtendedType',
      ),
      findNode(
        result.project,
        result.xsdMetadataByNodeId,
        'restriction',
        ({ name }) => name === 'Restriction of StatusType',
      ),
      findNode(
        result.project,
        result.xsdMetadataByNodeId,
        'restriction',
        ({ name }) => name === 'Restriction of RestrictedType',
      ),
    ];

    for (const node of cases) {
      const metadata = result.xsdMetadataByNodeId[node.id]!;
      const text = result.sourceMarkupByNodeId[node.id]?.fragments[0]?.text;
      expect(text).toBe(exactSlice(annotatedSource, metadata.sourceRange));
      expect(text).toMatch(/^<xs:(extension|restriction)\b/);
      expect(text).toMatch(/<\/xs:(extension|restriction)>$/);
    }
  });

  it('rejects invalid, malformed, and cross-file provenance without mutating input', () => {
    const result = imported();
    const node = result.project.nodes.find(({ kind }) => kind === 'schema')!;
    const metadata = result.xsdMetadataByNodeId[node.id]!;
    const projectSnapshot = structuredClone(result.project);
    const metadataSnapshot = structuredClone(result.xsdMetadataByNodeId);

    const invalidCases: XsdNodeMetadata[] = [
      { ...metadata, sourceFileId: 'other.xsd' },
      {
        ...metadata,
        sourceRange: {
          ...metadata.sourceRange,
          sourceId: 'other.xsd',
        },
      },
      {
        ...metadata,
        sourceRange: {
          ...metadata.sourceRange,
          start: { ...metadata.sourceRange.start, offset: -1 },
        },
      },
      {
        ...metadata,
        sourceRange: {
          ...metadata.sourceRange,
          end: {
            ...metadata.sourceRange.end,
            offset: annotatedSource.length + 1,
          },
        },
      },
      {
        ...metadata,
        sourceRange: {
          ...metadata.sourceRange,
          start: { ...metadata.sourceRange.start, line: 0 },
        },
      },
    ];

    for (const invalid of invalidCases) {
      expect(
        buildXsdSourceMarkupByNodeId(
          result.project,
          { [node.id]: invalid },
          annotatedSource,
          options.sourceFileId,
        ),
      ).toEqual({});
    }
    expect(result.project).toEqual(projectSnapshot);
    expect(result.xsdMetadataByNodeId).toEqual(metadataSnapshot);
  });

  it('returns plain JSON metadata without storing an AST or complete source document field', () => {
    const result = imported();
    const markup = buildXsdSourceMarkupByNodeId(
      result.project,
      result.xsdMetadataByNodeId,
      annotatedSource,
      options.sourceFileId,
    );
    const serialized = JSON.stringify(markup);

    expect(JSON.parse(serialized)).toEqual(markup);
    expect(serialized).not.toContain('"sourceText"');
    expect(serialized).not.toContain('"document"');
    expect(serialized).not.toContain('"ast"');
  });
});
