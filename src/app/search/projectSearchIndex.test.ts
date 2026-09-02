import { describe, expect, it } from 'vitest';
import {
  schemaNodeKinds,
  type SchemaNode,
  type SchemaNodeKind,
  type SchemaProject,
  type SchemaSourceRange,
} from '../../schema/model';
import type {
  DtdAttributesByNodeId,
  DtdNormalizedComment,
} from '../../schema/dtd';
import type {
  XsdAnnotationEntryMetadata,
  XsdAnnotationMetadata,
  XsdMetadataByNodeId,
  XsdNodeMetadata,
  XsdNormalizedReference,
} from '../../schema/xsd';
import {
  buildProjectSearchIndex,
  PROJECT_SEARCH_UNDEFINED_SOURCE_ORDER,
  selectProjectSearchNodeCategory,
} from './projectSearchIndex';

function range(start: number, end = start + 5): SchemaSourceRange {
  return {
    sourceId: 'fixture.xsd',
    start: { offset: start, line: 1, column: start + 1 },
    end: { offset: end, line: 1, column: end + 1 },
  };
}

function reference(
  kind: XsdNormalizedReference['kind'],
  raw: string,
  localName: string,
  start: number,
): XsdNormalizedReference {
  return {
    kind,
    raw,
    localName,
    prefix: raw.includes(':') ? raw.split(':')[0] : undefined,
    namespaceUri: 'urn:fixture',
    range: range(start),
    resolution: 'resolved',
    targetNodeId: `target:${localName}`,
  };
}

function annotationEntry(
  kind: XsdAnnotationEntryMetadata['kind'],
  text: string,
  start: number,
  options: { readonly language?: string; readonly order?: number } = {},
): XsdAnnotationEntryMetadata {
  const shared = {
    text,
    rawXml: `<xs:${kind}>${text}</xs:${kind}>`,
    sourceRange: range(start, start + 10),
    startTagRange: range(start, start + 2),
    contentRange: range(start + 2, start + 8),
    sourceOrder: options.order ?? start,
  };
  if (kind === 'documentation') {
    return {
      kind,
      ...shared,
      ...(options.language !== undefined
        ? {
            xmlLang: {
              value: options.language,
              lexicalValue: options.language,
              range: range(start + 1),
            },
          }
        : {}),
    };
  }
  return { kind, ...shared };
}

function annotation(
  entries: readonly XsdAnnotationEntryMetadata[],
  start: number,
  order = start,
): XsdAnnotationMetadata {
  return {
    entries,
    rawXml: '<xs:annotation />',
    sourceRange: range(start, start + 50),
    startTagRange: range(start, start + 2),
    sourceOrder: order,
  };
}

function xsdMetadata(
  node: SchemaNode,
  options: Partial<XsdNodeMetadata> = {},
): XsdNodeMetadata {
  return {
    kind: node.kind,
    scope: node.kind === 'schema' ? 'schema' : 'global',
    sourceFileId: node.sourceFileId ?? 'fixture.xsd',
    sourceOrder: node.sourceOrder ?? 0,
    sourceRange: range(0, 500),
    startTagRange: range(0, 10),
    ...options,
  };
}

function project(nodes: readonly SchemaNode[]): SchemaProject {
  return {
    id: 'search:fixture',
    displayName: 'Search fixture',
    sourceFiles: [{ id: 'fixture.xsd', filename: 'fixture.xsd' }],
    nodes,
    edges: [],
    rootNodeIds: nodes.length > 0 ? [nodes[0]!.id] : [],
  };
}

function comment(
  commentId: string,
  text: string,
  order: number,
  attachedNodeId?: string,
  attachmentKind: DtdNormalizedComment['attachmentKind'] = 'preceding',
): DtdNormalizedComment {
  return {
    commentId,
    sourceFileId: 'fixture.dtd',
    raw: `<!-- ${text} -->`,
    text,
    sourceRange: {
      sourceId: 'fixture.dtd',
      start: { offset: order * 10, line: order + 1, column: 1 },
      end: { offset: order * 10 + 5, line: order + 1, column: 6 },
    },
    contentRange: {
      sourceId: 'fixture.dtd',
      start: { offset: order * 10 + 1, line: order + 1, column: 2 },
      end: { offset: order * 10 + 4, line: order + 1, column: 5 },
    },
    order,
    attachmentKind,
    ...(attachedNodeId ? { attachedNodeId } : {}),
  };
}

describe('project search index builder', () => {
  it('creates exactly one deterministic document and one name field per node', () => {
    const nodes: SchemaNode[] = [
      { id: 'late', kind: 'choice', name: 'Zulu' },
      {
        id: 'element',
        kind: 'globalElement',
        name: 'Root',
        sourceOrder: 2,
      },
      { id: 'type', kind: 'complexType', name: 'Alpha', sourceOrder: 2 },
      { id: 'first', kind: 'schema', name: 'Schema', sourceOrder: 0 },
    ];
    const first = buildProjectSearchIndex({ project: project(nodes) });
    const second = buildProjectSearchIndex({ project: project(nodes) });

    expect(first.documents.map(({ nodeId }) => nodeId)).toEqual([
      'first',
      'element',
      'type',
      'late',
    ]);
    expect(first.documents).toHaveLength(nodes.length);
    expect(
      first.documents.every(
        ({ fields }) =>
          fields.filter(({ kind }) => kind === 'name').length === 1,
      ),
    ).toBe(true);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.documents).not.toBe(second.documents);
    expect(first.documents[0]?.fields).not.toBe(second.documents[0]?.fields);
    expect(first.documents[3]?.sourceOrder).toBe(
      PROJECT_SEARCH_UNDEFINED_SOURCE_ORDER,
    );
  });

  it('maps every current schema-node kind to its stable category', () => {
    const expected: Record<SchemaNodeKind, string> = {
      schema: 'schema',
      globalElement: 'element',
      localElement: 'element',
      elementReference: 'element',
      complexType: 'type',
      simpleType: 'type',
      attribute: 'attribute',
      attributeReference: 'attribute',
      attributeGroup: 'structure',
      attributeGroupReference: 'structure',
      group: 'structure',
      groupReference: 'structure',
      sequence: 'structure',
      choice: 'structure',
      all: 'structure',
      simpleContent: 'structure',
      complexContent: 'structure',
      elementWildcard: 'structure',
      attributeWildcard: 'structure',
      extension: 'structure',
      restriction: 'structure',
      list: 'structure',
      union: 'structure',
      facet: 'structure',
      enumeration: 'structure',
      builtInType: 'structure',
      identityConstraint: 'structure',
      selector: 'structure',
      field: 'structure',
      xsdNotation: 'structure',
      import: 'structure',
      include: 'structure',
      redefine: 'structure',
      xsdAnnotation: 'structure',
      xsdDocumentation: 'structure',
      xsdAppInfo: 'structure',
      xsdForeignElement: 'structure',
      xsdComment: 'structure',
      xsdProcessingInstruction: 'structure',
      xsdProlog: 'structure',
      dtdElement: 'dtdDeclaration',
      dtdContentModel: 'dtdDeclaration',
      dtdAttributeList: 'dtdDeclaration',
      dtdAttribute: 'attribute',
      dtdEntity: 'dtdDeclaration',
      dtdParameterEntity: 'dtdDeclaration',
      dtdNotation: 'dtdDeclaration',
      dtdElementReference: 'dtdDeclaration',
      dtdConditionalSection: 'dtdDeclaration',
      dtdComment: 'dtdDeclaration',
      dtdProcessingInstruction: 'dtdDeclaration',
      dtdDependency: 'dtdDeclaration',
      relaxNgSchema: 'other',
    };

    expect(
      schemaNodeKinds.map((kind) => selectProjectSearchNodeCategory(kind)),
    ).toEqual(schemaNodeKinds.map((kind) => expected[kind]));
  });

  it('indexes ordered non-empty Documentation while excluding AppInfo', () => {
    const node: SchemaNode = {
      id: 'schema',
      kind: 'schema',
      name: 'Schema overview',
      sourceFileId: 'fixture.xsd',
      sourceOrder: 0,
    };
    const entries = [
      annotationEntry('documentation', 'second wrapper', 120, { order: 0 }),
      annotationEntry('appInfo', 'secret appinfo', 130, { order: 1 }),
    ];
    const metadata: XsdMetadataByNodeId = {
      schema: xsdMetadata(node, {
        annotations: [
          annotation(entries, 100, 2),
          annotation(
            [
              annotationEntry('documentation', '', 20, { order: 0 }),
              annotationEntry('documentation', 'first English', 30, {
                language: 'en',
                order: 1,
              }),
              annotationEntry('documentation', 'duplicate', 40, {
                language: 'fr',
                order: 2,
              }),
              annotationEntry('documentation', 'duplicate', 50, {
                language: 'en',
                order: 3,
              }),
              annotationEntry('documentation', 'duplicate', 60, {
                language: 'en',
                order: 4,
              }),
              annotationEntry('documentation', 'empty language', 70, {
                language: '',
                order: 5,
              }),
            ],
            10,
            1,
          ),
        ],
      }),
    };

    const document = buildProjectSearchIndex({
      project: project([node]),
      xsdMetadataByNodeId: metadata,
    }).documents[0]!;
    const documentation = document.fields.filter(
      ({ kind }) => kind === 'documentation',
    );

    expect(documentation.map(({ text }) => text)).toEqual([
      'first English',
      'duplicate',
      'duplicate',
      'empty language',
      'second wrapper',
    ]);
    expect(documentation.map(({ language }) => language)).toEqual([
      'en',
      'fr',
      'en',
      undefined,
      undefined,
    ]);
    expect(document.fields.some(({ text }) => text === 'secret appinfo')).toBe(
      false,
    );
    expect(document.fields.some(({ text }) => text === '')).toBe(false);
  });

  it('indexes raw and local reference vocabulary in explicit property order', () => {
    const node: SchemaNode = {
      id: 'owner',
      kind: 'localElement',
      name: 'owner',
      sourceFileId: 'fixture.xsd',
      sourceOrder: 0,
    };
    const metadata: XsdMetadataByNodeId = {
      owner: xsdMetadata(node, {
        typeReference: reference('type', 'tns:BaseType', 'BaseType', 10),
        elementReference: reference('element', 'tns:root', 'root', 20),
        attributeReference: reference('attribute', 'tns:code', 'code', 30),
        restrictionBaseReference: reference(
          'restrictionBase',
          'xs:string',
          'string',
          40,
        ),
        complexTypeDerivation: {
          kind: 'extension',
          baseReference: reference(
            'complexTypeBase',
            'tns:BaseType',
            'BaseType',
            50,
          ),
          declaredAttributeCount: 0,
          sourceRange: range(50),
          startTagRange: range(50, 51),
        },
      }),
    };

    const references = buildProjectSearchIndex({
      project: project([node]),
      xsdMetadataByNodeId: metadata,
    }).documents[0]!.fields.filter(({ kind }) => kind === 'reference');

    expect(references.map(({ text }) => text)).toEqual([
      'tns:BaseType',
      'BaseType',
      'tns:root',
      'root',
      'tns:code',
      'code',
      'xs:string',
      'string',
    ]);
  });

  it('indexes only ordered non-empty comments attached to the current node', () => {
    const node: SchemaNode = {
      id: 'book',
      kind: 'dtdElement',
      name: 'book',
      sourceFileId: 'fixture.dtd',
      sourceOrder: 0,
    };
    const comments = [
      comment('second', 'Second attached', 2, 'book'),
      comment('empty', ' \r\n ', 1, 'book'),
      comment('first', 'First attached', 0, 'book'),
      comment('other', 'Other node comment', 3, 'chapter'),
      comment('schema', 'Schema-level comment', 4, undefined, 'schema'),
    ];

    const document = buildProjectSearchIndex({
      project: {
        ...project([node]),
        sourceFiles: [{ id: 'fixture.dtd', filename: 'fixture.dtd' }],
      },
      commentsByNodeId: { book: comments },
    }).documents[0]!;

    expect(
      document.fields
        .filter(({ kind }) => kind === 'dtdComment')
        .map(({ text }) => text),
    ).toEqual(['First attached', 'Second attached']);
  });

  it('discovers concrete XSD and DTD type/attribute nodes by primary name only', () => {
    const nodes: SchemaNode[] = [
      { id: 'complex', kind: 'complexType', name: 'ComplexName' },
      { id: 'simple', kind: 'simpleType', name: 'SimpleName' },
      { id: 'xsd-attribute', kind: 'attribute', name: 'xsdCode' },
      { id: 'dtd-attribute', kind: 'dtdAttribute', name: 'dtdCode' },
    ];
    const staleAttributes = {
      stale: {
        attributeNodeId: 'stale',
        ownerElementNodeId: 'missing',
        name: 'syntheticCode',
        type: { kind: 'tokenized', name: 'CDATA' },
        defaultDeclaration: { kind: 'implied' },
        sourceFileId: 'fixture.dtd',
        declarationText: 'syntheticCode CDATA #IMPLIED',
        sourceRange: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 10, line: 1, column: 11 },
        },
        order: 0,
      },
    } as DtdAttributesByNodeId;
    const index = buildProjectSearchIndex({
      project: project(nodes),
      dtdAttributesByNodeId: staleAttributes,
    });

    expect(index.documents.map(({ nodeName }) => nodeName)).toEqual([
      'ComplexName',
      'SimpleName',
      'xsdCode',
      'dtdCode',
    ]);
    expect(index.documents.some(({ nodeId }) => nodeId === 'stale')).toBe(
      false,
    );
    expect(
      index.documents.some(({ nodeName }) => nodeName === 'syntheticCode'),
    ).toBe(false);
  });

  it('resolves source filenames per node and strips local paths', () => {
    const nodes: SchemaNode[] = [
      {
        id: 'known',
        kind: 'schema',
        name: 'known',
        sourceFileId: 'known-source',
      },
      {
        id: 'fallback-id',
        kind: 'schema',
        name: 'fallback id',
        sourceFileId: 'logical-source',
      },
      { id: 'active', kind: 'schema', name: 'active fallback' },
    ];
    const index = buildProjectSearchIndex({
      project: {
        ...project(nodes),
        sourceFiles: [
          {
            id: 'known-source',
            filename: 'E:\\Work\\schemas\\known.xsd',
          },
        ],
      },
      sourceFilename: 'E:\\Work\\active\\active.xsd',
    });

    expect(
      index.documents.find(({ nodeId }) => nodeId === 'known')?.sourceFilename,
    ).toBe('known.xsd');
    expect(
      index.documents.find(({ nodeId }) => nodeId === 'fallback-id')
        ?.sourceFilename,
    ).toBe('logical-source');
    expect(
      index.documents.find(({ nodeId }) => nodeId === 'active')?.sourceFilename,
    ).toBe('active.xsd');
    expect(JSON.stringify(index)).not.toContain('E:\\\\Work');
  });

  it('uses deterministic field IDs and deduplicates only exact kind/text/language matches', () => {
    const node: SchemaNode = {
      id: 'schema',
      kind: 'schema',
      name: 'duplicate',
      sourceFileId: 'fixture.xsd',
    };
    const metadata: XsdMetadataByNodeId = {
      schema: xsdMetadata(node, {
        annotations: [
          annotation(
            [
              annotationEntry('documentation', 'duplicate', 10, {
                language: 'en',
              }),
              annotationEntry('documentation', 'duplicate', 20, {
                language: 'en',
              }),
              annotationEntry('documentation', 'duplicate', 30, {
                language: 'fr',
              }),
            ],
            0,
          ),
        ],
      }),
    };
    const first = buildProjectSearchIndex({
      project: project([node]),
      xsdMetadataByNodeId: metadata,
      commentsByNodeId: {
        schema: [comment('comment', 'duplicate', 0, 'schema')],
      },
    });
    const second = buildProjectSearchIndex({
      project: project([node]),
      xsdMetadataByNodeId: metadata,
      commentsByNodeId: {
        schema: [comment('comment', 'duplicate', 0, 'schema')],
      },
    });

    expect(
      first.documents[0]!.fields.map(({ kind, text, language }) => [
        kind,
        text,
        language,
      ]),
    ).toEqual([
      ['name', 'duplicate', undefined],
      ['documentation', 'duplicate', 'en'],
      ['documentation', 'duplicate', 'fr'],
      ['dtdComment', 'duplicate', undefined],
      ['sourceFile', 'fixture.xsd', undefined],
    ]);
    expect(first.documents[0]!.fields.map(({ id }) => id)).toEqual(
      second.documents[0]!.fields.map(({ id }) => id),
    );
  });

  it('is JSON-serializable, defensively isolated, and does not mutate inputs', () => {
    const nodes: SchemaNode[] = [
      {
        id: 'schema',
        kind: 'schema',
        name: 'Schema',
        sourceFileId: 'fixture.xsd',
      },
    ];
    const projectInput = project(nodes);
    const annotationEntries = [
      annotationEntry('documentation', 'Original documentation', 10),
    ];
    const metadataByNodeId: XsdMetadataByNodeId = {
      schema: xsdMetadata(nodes[0]!, {
        annotations: [annotation(annotationEntries, 0)],
      }),
    };
    const snapshot = JSON.stringify({ projectInput, metadataByNodeId });
    const index = buildProjectSearchIndex({
      project: projectInput,
      xsdMetadataByNodeId: metadataByNodeId,
    });
    expect(JSON.stringify({ projectInput, metadataByNodeId })).toBe(snapshot);

    nodes.push({ id: 'late', kind: 'schema', name: 'Late mutation' });
    annotationEntries.push(
      annotationEntry('documentation', 'Late metadata mutation', 20),
    );

    expect(JSON.stringify(index)).toBeTruthy();
    expect(index.documents).toHaveLength(1);
    expect(index.documents[0]!.fields.map(({ text }) => text)).not.toContain(
      'Late metadata mutation',
    );
    expect(Object.isFrozen(index)).toBe(true);
    expect(Object.isFrozen(index.documents)).toBe(true);
    expect(Object.isFrozen(index.documents[0]!.fields)).toBe(true);
  });
});
