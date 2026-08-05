import { describe, expect, it } from 'vitest';
import type { DtdCommentsByNodeId } from '../../schema/dtd';
import {
  getOutgoingStructuralRelationships,
  type SchemaProject,
} from '../../schema/model';
import { importXsdSource } from '../../schema/xsd';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../../schema/samples/bookDtdProject';
import {
  buildFocusCardSummary,
  FOCUS_CARD_CONTENT_MODEL_REFERENCE_LIMIT,
} from './focusCardSummary';
import basicStructure from '../../../tests/fixtures/xsd/basic-structure.xsd?raw';
import externalReferences from '../../../tests/fixtures/xsd/external-references.xsd?raw';
import sameDocumentReferences from '../../../tests/fixtures/xsd/same-document-references.xsd?raw';
import xsdAttributes from '../../../tests/fixtures/xsd/attributes.xsd?raw';
import xsdEnumerations from '../../../tests/fixtures/xsd/simple-type-enumerations.xsd?raw';
import xsdRestrictionCycle from '../../../tests/fixtures/xsd/restriction-cycle.xsd?raw';
import xsdAnnotations from '../../../tests/fixtures/xsd/annotations.xsd?raw';

function importXsdFixture(name: string, source: string) {
  const result = importXsdSource(source, {
    projectId: `focus:${name}`,
    displayName: name,
    sourceFileId: `${name}:source`,
    sourceFilename: `${name}.xsd`,
  });
  expect(result.status).toBe('success');
  if (result.status !== 'success') throw new Error(`Failed to import ${name}.`);
  return result;
}

const fixtureProject: SchemaProject = {
  id: 'fixture:focus-card',
  displayName: 'Focus card fixture',
  nodes: [
    {
      id: 'node:focus',
      kind: 'dtdElement',
      name: 'focus',
      sourceFileId: 'fixture.dtd',
      compactDeclaration: '(zeta?, alpha, zeta+, beta, gamma*)',
    },
    { id: 'node:zeta', kind: 'dtdElement', name: 'zeta' },
    { id: 'node:alpha', kind: 'dtdElement', name: 'alpha' },
    { id: 'node:beta', kind: 'dtdElement', name: 'beta' },
    { id: 'node:gamma', kind: 'dtdElement', name: 'gamma' },
    { id: 'node:user-a', kind: 'dtdElement', name: 'user-a' },
    { id: 'node:user-b', kind: 'dtdElement', name: 'user-b' },
    { id: 'node:inverse', kind: 'dtdElement', name: 'inverse' },
    { id: 'attribute:focus:id', kind: 'dtdAttribute', name: 'id' },
    { id: 'attribute:focus:lang', kind: 'dtdAttribute', name: 'lang' },
    { id: 'attribute:alpha:id', kind: 'dtdAttribute', name: 'id' },
  ],
  edges: [
    {
      id: 'edge:focus:zeta:first',
      kind: 'contains',
      sourceNodeId: 'node:focus',
      targetNodeId: 'node:zeta',
      order: 0,
      occurrence: { min: 0, max: 1 },
    },
    {
      id: 'edge:focus:alpha',
      kind: 'contains',
      sourceNodeId: 'node:focus',
      targetNodeId: 'node:alpha',
      order: 1,
    },
    {
      id: 'edge:focus:zeta:second',
      kind: 'contains',
      sourceNodeId: 'node:focus',
      targetNodeId: 'node:zeta',
      order: 2,
      occurrence: { min: 1, max: 'unbounded' },
    },
    {
      id: 'edge:focus:beta',
      kind: 'contains',
      sourceNodeId: 'node:focus',
      targetNodeId: 'node:beta',
      order: 3,
    },
    {
      id: 'edge:focus:gamma',
      kind: 'contains',
      sourceNodeId: 'node:focus',
      targetNodeId: 'node:gamma',
      order: 4,
      occurrence: { min: 0, max: 'unbounded' },
    },
    {
      id: 'edge:user-a:focus',
      kind: 'contains',
      sourceNodeId: 'node:user-a',
      targetNodeId: 'node:focus',
    },
    {
      id: 'edge:user-b:focus',
      kind: 'references',
      sourceNodeId: 'node:user-b',
      targetNodeId: 'node:focus',
    },
    {
      id: 'edge:inverse:focus',
      kind: 'usedBy',
      sourceNodeId: 'node:inverse',
      targetNodeId: 'node:focus',
    },
    {
      id: 'edge:focus:attribute:id',
      kind: 'usesAttribute',
      sourceNodeId: 'node:focus',
      targetNodeId: 'attribute:focus:id',
      order: 0,
    },
    {
      id: 'edge:focus:attribute:lang',
      kind: 'usesAttribute',
      sourceNodeId: 'node:focus',
      targetNodeId: 'attribute:focus:lang',
      order: 1,
    },
    {
      id: 'edge:alpha:attribute:id',
      kind: 'usesAttribute',
      sourceNodeId: 'node:alpha',
      targetNodeId: 'attribute:alpha:id',
      order: 0,
    },
  ],
  rootNodeIds: ['node:user-a'],
};

const commentsByNodeId: DtdCommentsByNodeId = {
  'node:focus': [
    {
      commentId: 'comment:later',
      sourceFileId: 'fixture.dtd',
      raw: '<!-- later -->',
      text: ' later ',
      sourceRange: {
        start: { offset: 30, line: 3, column: 1 },
        end: { offset: 44, line: 3, column: 15 },
      },
      contentRange: {
        start: { offset: 34, line: 3, column: 5 },
        end: { offset: 41, line: 3, column: 12 },
      },
      order: 2,
      attachmentKind: 'trailing',
      declarationKind: 'element',
      attachedNodeId: 'node:focus',
    },
    {
      commentId: 'comment:first',
      sourceFileId: 'fixture.dtd',
      raw: '<!-- first docs -->',
      text: '\n  first docs\n    detail\n',
      sourceRange: {
        start: { offset: 0, line: 1, column: 1 },
        end: { offset: 24, line: 3, column: 4 },
      },
      contentRange: {
        start: { offset: 4, line: 1, column: 5 },
        end: { offset: 21, line: 3, column: 1 },
      },
      order: 1,
      attachmentKind: 'preceding',
      declarationKind: 'element',
      attachedNodeId: 'node:focus',
    },
  ],
};

describe('focused-card summary', () => {
  it('selects identity, kind, source filename, and declaration by node ID', () => {
    expect(
      buildFocusCardSummary(bookDtdProject, bookDtdNodeIds.chapter),
    ).toMatchObject({
      nodeId: bookDtdNodeIds.chapter,
      displayName: 'chapter',
      kind: 'dtdElement',
      sourceFilename: 'sample.book.dtd',
      showSourceFilename: false,
      declaration: '(title, epigraph?, section*, figure*, note*)',
    });
  });

  it('preserves model order, occurrence, and repeated destination positions', () => {
    const summary = buildFocusCardSummary(fixtureProject, 'node:focus');

    expect(
      summary?.orderedDestinationSummaries.map(
        ({ nodeId, displayName, occurrence }) => ({
          nodeId,
          displayName,
          occurrence,
        }),
      ),
    ).toEqual([
      { nodeId: 'node:zeta', displayName: 'zeta', occurrence: '?' },
      { nodeId: 'node:alpha', displayName: 'alpha', occurrence: '' },
      { nodeId: 'node:zeta', displayName: 'zeta', occurrence: '+' },
      { nodeId: 'node:beta', displayName: 'beta', occurrence: '' },
      { nodeId: 'node:gamma', displayName: 'gamma', occurrence: '*' },
    ]);
  });

  it('builds one complete content model with text punctuation and references', () => {
    const summary = buildFocusCardSummary(fixtureProject, 'node:focus');

    expect(
      summary?.contentModelParts.map((part) =>
        part.kind === 'text'
          ? part.text
          : `${part.displayName}${part.occurrence}`,
      ),
    ).toEqual([
      '(',
      'zeta?',
      ', ',
      'alpha',
      ', ',
      'zeta+',
      ', ',
      'beta',
      ', ',
      'gamma*',
      ')',
    ]);
  });

  it('uses chapter as the live complete five-reference fixture', () => {
    const summary = buildFocusCardSummary(
      bookDtdProject,
      bookDtdNodeIds.chapter,
    );

    expect(
      summary?.orderedDestinationSummaries.map(
        ({ displayName, occurrence }) => `${displayName}${occurrence}`,
      ),
    ).toEqual(['title', 'epigraph?', 'section*', 'figure*', 'note*']);
    expect(summary?.destinationCount).toBe(5);
    expect(
      summary?.contentModelParts.map((part) =>
        part.kind === 'text'
          ? part.text
          : `${part.displayName}${part.occurrence}`,
      ),
    ).toEqual([
      '(',
      'title',
      ', ',
      'epigraph?',
      ', ',
      'section*',
      ', ',
      'figure*',
      ', ',
      'note*',
      ')',
    ]);
  });

  it('reports the complete destination count', () => {
    const summary = buildFocusCardSummary(bookDtdProject, bookDtdNodeIds.book);

    expect(summary?.destinationCount).toBe(3);
    expect(summary?.orderedDestinationSummaries).toHaveLength(3);
  });

  it('shows focused-card source only for projects with multiple files', () => {
    expect(
      buildFocusCardSummary(bookDtdProject, bookDtdNodeIds.book)
        ?.showSourceFilename,
    ).toBe(false);

    const multiFileProject: SchemaProject = {
      ...fixtureProject,
      nodes: fixtureProject.nodes.map((node, index) =>
        index === 1 ? { ...node, sourceFileId: 'second.dtd' } : node,
      ),
    };
    expect(
      buildFocusCardSummary(multiFileProject, 'node:focus')?.showSourceFilename,
    ).toBe(true);
  });

  it('detects structural leaves and keeps their destination counts empty', () => {
    const summary = buildFocusCardSummary(bookDtdProject, bookDtdNodeIds.title);

    expect(summary?.isStructuralLeaf).toBe(true);
    expect(summary?.destinationCount).toBe(0);
    expect(summary?.orderedDestinationSummaries).toEqual([]);
  });

  it('counts only direct incoming containment and use relationships', () => {
    expect(
      buildFocusCardSummary(fixtureProject, 'node:focus')?.incomingUseCount,
    ).toBe(2);
    expect(
      buildFocusCardSummary(bookDtdProject, bookDtdNodeIds.book)
        ?.incomingUseCount,
    ).toBe(0);
    expect(
      buildFocusCardSummary(bookDtdProject, bookDtdNodeIds.title)
        ?.incomingUseCount,
    ).toBe(3);
  });

  it('counts only attributes owned by the focused DTD element', () => {
    expect(
      buildFocusCardSummary(fixtureProject, 'node:focus')?.attributeCount,
    ).toBe(2);
    expect(
      buildFocusCardSummary(fixtureProject, 'node:alpha')?.attributeCount,
    ).toBe(1);
    expect(
      buildFocusCardSummary(fixtureProject, 'attribute:focus:id')
        ?.attributeCount,
    ).toBe(0);
    expect(
      buildFocusCardSummary(bookDtdProject, bookDtdNodeIds.book)
        ?.attributeCount,
    ).toBe(2);
  });

  it('summarizes only focused-node comments using the first source-ordered excerpt', () => {
    const summary = buildFocusCardSummary(
      fixtureProject,
      'node:focus',
      commentsByNodeId,
    );

    expect(summary?.commentCount).toBe(2);
    expect(summary?.commentExcerpt).toBe('first docs\n  detail');
    expect(
      buildFocusCardSummary(fixtureProject, 'node:alpha', commentsByNodeId),
    ).toMatchObject({ commentCount: 0 });
  });

  it('does not mutate the supplied comment index', () => {
    const before = JSON.stringify(commentsByNodeId);

    buildFocusCardSummary(fixtureProject, 'node:focus', commentsByNodeId);

    expect(JSON.stringify(commentsByNodeId)).toBe(before);
  });

  it('does not derive incoming use from repeated journey positions', () => {
    const repeatedJourney = [
      'node:user-a',
      'node:focus',
      'node:user-a',
      'node:focus',
    ];
    const before = buildFocusCardSummary(
      fixtureProject,
      repeatedJourney[repeatedJourney.length - 1],
    )?.incomingUseCount;

    repeatedJourney.push('node:focus', 'node:focus');

    expect(before).toBe(2);
    expect(
      buildFocusCardSummary(
        fixtureProject,
        repeatedJourney[repeatedJourney.length - 1],
      )?.incomingUseCount,
    ).toBe(2);
  });

  it('does not mutate the schema project', () => {
    const before = JSON.stringify(fixtureProject);

    buildFocusCardSummary(fixtureProject, 'node:focus');

    expect(JSON.stringify(fixtureProject)).toBe(before);
  });

  it('returns undefined for an unknown node instead of fabricating content', () => {
    expect(
      buildFocusCardSummary(fixtureProject, 'node:missing'),
    ).toBeUndefined();
  });
});

describe('XSD focused-card summary', () => {
  it('selects documentation for representative XSD owners without changing structural summary fields', () => {
    const imported = importXsdFixture('annotations', xsdAnnotations);
    const nodeWithDocumentation = (text: string) =>
      imported.project.nodes.find((node) =>
        imported.xsdMetadataByNodeId[node.id]?.annotations?.some((annotation) =>
          annotation.entries.some(
            (entry) => entry.kind === 'documentation' && entry.text === text,
          ),
        ),
      )!;
    const expected = [
      [
        'Defines the persistent identity, exactly. Use <literal> as text. Entity & decoded.',
        2,
        'en',
      ],
      ['Root element documentation.', 1, 'en'],
      ['Base type documentation.', 1, undefined],
      ['Base sequence documentation.', 1, undefined],
      ['Allowed status values.', 1, undefined],
      ['Restriction documentation.', 1, undefined],
      ['Extended type documentation.', 2, undefined],
      ['Extension documentation.', 1, undefined],
      ['Complex restriction documentation.', 1, undefined],
      ['Local child documentation.', 1, undefined],
      ['Local attribute documentation.', 1, undefined],
    ] as const;

    for (const [text, documentationCount, language] of expected) {
      const node = nodeWithDocumentation(text);
      const summary = buildFocusCardSummary(
        imported.project,
        node.id,
        {},
        imported.xsdMetadataByNodeId,
      );

      expect(summary?.documentation).toEqual({
        excerpt: text,
        documentationCount,
        additionalDocumentationCount: documentationCount - 1,
        ...(language ? { language } : {}),
      });
      expect(summary?.destinationCount).toBe(
        getOutgoingStructuralRelationships(imported.project, node.id).length,
      );
      expect(summary?.isStructuralLeaf).toBe(summary?.destinationCount === 0);
      expect(summary?.sourceFilename).toBe('annotations.xsd');
    }
  });

  it('uses forwarded enumeration documentation on the owning restriction and excludes AppInfo-only owners', () => {
    const imported = importXsdFixture('annotations', xsdAnnotations);
    const anonymousRestriction = imported.project.nodes.find(
      (node) =>
        node.kind === 'restriction' &&
        imported.xsdMetadataByNodeId[node.id]?.annotations?.some((annotation) =>
          annotation.entries.some(
            (entry) =>
              entry.kind === 'documentation' &&
              entry.text === 'Anonymous enumeration documentation.',
          ),
        ),
    )!;
    const globalAttribute = imported.project.nodes.find(
      ({ kind, name }) => kind === 'attribute' && name === 'globalCode',
    )!;
    const extensionAttribute = imported.project.nodes.find(
      ({ kind, name }) => kind === 'attribute' && name === 'extensionCode',
    )!;

    expect(
      buildFocusCardSummary(
        imported.project,
        anonymousRestriction.id,
        {},
        imported.xsdMetadataByNodeId,
      )?.documentation,
    ).toEqual({
      excerpt: 'Anonymous restriction documentation.',
      documentationCount: 2,
      additionalDocumentationCount: 1,
    });
    expect(
      buildFocusCardSummary(
        imported.project,
        globalAttribute.id,
        {},
        imported.xsdMetadataByNodeId,
      )?.documentation,
    ).toBeUndefined();
    expect(
      buildFocusCardSummary(
        imported.project,
        extensionAttribute.id,
        {},
        imported.xsdMetadataByNodeId,
      )?.documentation,
    ).toBeUndefined();
  });

  it('keeps DTD comments separate and rejects mismatched XSD metadata', () => {
    const dtdSummary = buildFocusCardSummary(
      fixtureProject,
      'node:focus',
      commentsByNodeId,
    );
    expect(dtdSummary?.documentation).toBeUndefined();
    expect(dtdSummary).toMatchObject({
      commentCount: 2,
      commentExcerpt: 'first docs\n  detail',
      destinationCount: 5,
      attributeCount: 2,
      isStructuralLeaf: false,
    });

    const imported = importXsdFixture('annotations', xsdAnnotations);
    const root = imported.project.nodes.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'root',
    )!;
    expect(
      buildFocusCardSummary(
        imported.project,
        root.id,
        {},
        {
          [root.id]: {
            ...imported.xsdMetadataByNodeId[root.id]!,
            kind: 'schema',
          },
        },
      )?.documentation,
    ).toBeUndefined();
  });

  it('counts global attributes on overview and direct uses on complex types without structural destinations', () => {
    const imported = importXsdFixture('attributes', xsdAttributes);
    const schemaId = imported.project.rootNodeIds[0]!;
    const complex = imported.project.nodes.find(
      ({ kind, name }) => kind === 'complexType' && name === 'RootType',
    )!;
    const overview = buildFocusCardSummary(
      imported.project,
      schemaId,
      {},
      imported.xsdMetadataByNodeId,
    );
    const type = buildFocusCardSummary(
      imported.project,
      complex.id,
      {},
      imported.xsdMetadataByNodeId,
    );

    expect(overview).toMatchObject({
      attributeCount: 1,
      attributeCountKind: 'global attribute',
    });
    expect(type).toMatchObject({
      attributeCount: 6,
      attributeCountKind: 'attribute',
    });
    expect(
      type?.orderedDestinationSummaries.some(
        ({ kind }) => kind === 'attribute',
      ),
    ).toBe(false);
  });

  it('presents the internal schema node as metadata-only Schema overview', () => {
    const imported = importXsdFixture('basic', basicStructure);
    const schema = imported.project.nodes.find(
      ({ kind }) => kind === 'schema',
    )!;
    const summary = buildFocusCardSummary(
      imported.project,
      schema.id,
      {},
      imported.xsdMetadataByNodeId,
    );

    expect(summary).toMatchObject({
      displayName: 'Schema overview',
      kind: 'schema',
      declaration: undefined,
      contentModelParts: [],
    });
    expect(summary?.xsdProperties).toEqual(
      expect.arrayContaining([
        { id: 'source-file', label: 'Source file', value: 'basic.xsd' },
        {
          id: 'target-namespace',
          label: 'Target namespace',
          value: 'urn:books',
        },
      ]),
    );
    expect(
      summary?.orderedDestinationSummaries.map(
        ({ relationshipLabel, displayName }) => [
          relationshipLabel,
          displayName,
        ],
      ),
    ).toEqual([
      ['Global element declaration', 'book'],
      ['XML source metadata', 'XML declaration'],
      ['Complex type declaration', 'BookType'],
      ['Simple type declaration', 'CodeType'],
    ]);
  });

  it('retains resolved relationship identity and never string-searches XSD declarations', () => {
    const imported = importXsdFixture('basic', basicStructure);
    const book = imported.project.nodes.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'book',
    )!;
    const summary = buildFocusCardSummary(
      imported.project,
      book.id,
      {},
      imported.xsdMetadataByNodeId,
    );

    expect(summary).toMatchObject({
      declaration: undefined,
      contentModelParts: [],
      hasXsdPresentation: true,
      destinationCount: 1,
      isStructuralLeaf: false,
      leafStateLabel: 'No structural destinations',
    });
    expect(summary?.orderedDestinationSummaries).toEqual([
      expect.objectContaining({
        edgeId: expect.any(String),
        relationshipKind: 'typeOf',
        relationshipLabel: 'Type',
        displayName: 'BookType',
        kind: 'complexType',
        occurrence: '',
      }),
    ]);
    expect(summary?.xsdProperties).toEqual(
      expect.arrayContaining([
        { id: 'scope', label: 'Scope', value: 'Global' },
        { id: 'type', label: 'Type', value: 'BookType (tns:BookType)' },
      ]),
    );
    expect(JSON.stringify(summary)).not.toMatch(
      /resolved|sourceRange|sourceOrder|startTagRange/,
    );
  });

  it('presents local occurrence and resolved ref metadata without moving occurrence to the reference', () => {
    const imported = importXsdFixture('same-document', sameDocumentReferences);
    const localRef = imported.project.nodes.find(
      ({ kind, name }) => kind === 'elementReference' && name === 'g:item',
    )!;
    const summary = buildFocusCardSummary(
      imported.project,
      localRef.id,
      {},
      imported.xsdMetadataByNodeId,
    );

    expect(summary?.xsdProperties).toEqual(
      expect.arrayContaining([
        { id: 'scope', label: 'Scope', value: 'Local' },
        { id: 'occurs', label: 'Occurs', value: '0..unbounded' },
        { id: 'references', label: 'References', value: 'item (g:item)' },
      ]),
    );
    expect(summary?.orderedDestinationSummaries).toEqual([
      expect.objectContaining({
        relationshipKind: 'references',
        relationshipLabel: 'Referenced element',
        displayName: 'item',
        occurrence: '',
      }),
    ]);
  });

  it('shows external metadata and navigable built-in type destinations', () => {
    const imported = importXsdFixture('external', externalReferences);
    const root = imported.project.nodes.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'root',
    )!;
    const builtIn = imported.project.nodes.find(
      ({ kind, name }) => kind === 'localElement' && name === 'builtIn',
    )!;

    expect(
      buildFocusCardSummary(
        imported.project,
        root.id,
        {},
        imported.xsdMetadataByNodeId,
      ),
    ).toMatchObject({
      orderedDestinationSummaries: [],
      xsdProperties: [
        expect.any(Object),
        expect.any(Object),
        {
          id: 'type',
          label: 'Type',
          value: 'ext:ExternalType (external)',
        },
      ],
    });
    expect(
      buildFocusCardSummary(
        imported.project,
        builtIn.id,
        {},
        imported.xsdMetadataByNodeId,
      )?.orderedDestinationSummaries,
    ).toEqual([
      expect.objectContaining({
        relationshipKind: 'typeOf',
        displayName: 'xs:string',
        kind: 'builtInType',
      }),
    ]);
    expect(
      buildFocusCardSummary(
        imported.project,
        builtIn.id,
        {},
        imported.xsdMetadataByNodeId,
      )?.xsdProperties,
    ).toContainEqual({ id: 'type', label: 'Type', value: 'xs:string' });
  });

  it('bounds visible structural destinations deterministically', () => {
    const project: SchemaProject = {
      id: 'bounded-xsd',
      displayName: 'Bounded XSD',
      nodes: [
        { id: 'schema', kind: 'schema', name: 'schema' },
        ...Array.from({ length: 6 }, (_, index) => ({
          id: `element:${index}`,
          kind: 'globalElement' as const,
          name: `element-${index}`,
        })),
      ],
      edges: Array.from({ length: 6 }, (_, index) => ({
        id: `edge:${index}`,
        kind: 'contains' as const,
        sourceNodeId: 'schema',
        targetNodeId: `element:${index}`,
        order: index,
      })),
      rootNodeIds: ['schema'],
    };

    const summary = buildFocusCardSummary(project, 'schema');
    expect(
      summary?.visibleRelationshipSummaries.map(({ edgeId }) => edgeId),
    ).toEqual(['edge:0', 'edge:1', 'edge:2', 'edge:3']);
    expect(summary?.hiddenRelationshipCount).toBe(2);
  });

  it('bounds linked content-model references for very wide DTD elements', () => {
    const destinationCount = 120;
    const destinationNames = Array.from(
      { length: destinationCount },
      (_, index) => `node-${index}`,
    );
    const project: SchemaProject = {
      id: 'bounded-wide-dtd',
      displayName: 'Bounded wide DTD',
      nodes: [
        {
          id: 'root',
          kind: 'dtdElement',
          name: 'root',
          compactDeclaration: `(${destinationNames.join(', ')})`,
        },
        ...destinationNames.map((name) => ({
          id: name,
          kind: 'dtdElement' as const,
          name,
        })),
      ],
      edges: destinationNames.map((name, index) => ({
        id: `edge:${index}`,
        kind: 'contains' as const,
        sourceNodeId: 'root',
        targetNodeId: name,
        order: index,
      })),
      rootNodeIds: ['root'],
    };

    const summary = buildFocusCardSummary(project, 'root');
    expect(summary?.orderedDestinationSummaries).toHaveLength(destinationCount);
    expect(
      summary?.contentModelParts.filter(({ kind }) => kind === 'nodeReference'),
    ).toHaveLength(FOCUS_CARD_CONTENT_MODEL_REFERENCE_LIMIT);
    expect(
      summary!.contentModelParts[summary!.contentModelParts.length - 1],
    ).toEqual({
      kind: 'text',
      id: 'text:bounded-remainder',
      text: ' … +70 more destinations',
    });
  });

  it('remains safe with missing or mismatched metadata', () => {
    const imported = importXsdFixture('safe', basicStructure);
    const book = imported.project.nodes.find(
      ({ kind }) => kind === 'globalElement',
    )!;

    expect(buildFocusCardSummary(imported.project, book.id)).toMatchObject({
      hasXsdPresentation: false,
      xsdProperties: [],
      destinationCount: 1,
    });
    expect(
      buildFocusCardSummary(
        imported.project,
        book.id,
        {},
        {
          [book.id]: {
            ...imported.xsdMetadataByNodeId[book.id]!,
            kind: 'schema',
          },
        },
      ),
    ).toMatchObject({ hasXsdPresentation: false, xsdProperties: [] });
  });

  it('summarizes restriction bases and counts without enumeration cards or raw tags', () => {
    const imported = importXsdFixture('enumerations', xsdEnumerations);
    const statusType = imported.project.nodes.find(
      ({ kind, name }) => kind === 'simpleType' && name === 'StatusType',
    )!;
    const simpleSummary = buildFocusCardSummary(
      imported.project,
      statusType.id,
      {},
      imported.xsdMetadataByNodeId,
    );
    const restriction = imported.project.nodes.find(
      (node) =>
        node.kind === 'restriction' &&
        imported.project.edges.some(
          ({ kind, sourceNodeId, targetNodeId }) =>
            kind === 'contains' &&
            sourceNodeId === statusType.id &&
            targetNodeId === node.id,
        ),
    )!;
    const restrictionSummary = buildFocusCardSummary(
      imported.project,
      restriction.id,
      {},
      imported.xsdMetadataByNodeId,
    );

    expect(simpleSummary).toMatchObject({
      declaration: undefined,
      xsdProperties: expect.arrayContaining([
        { id: 'base-type', label: 'Base type', value: 'xs:string' },
        { id: 'allowed-values', label: 'Allowed values', value: '5' },
      ]),
      orderedDestinationSummaries: expect.arrayContaining([
        expect.objectContaining({
          relationshipKind: 'contains',
          relationshipLabel: 'Restriction',
          kind: 'restriction',
        }),
        expect.objectContaining({
          relationshipKind: 'derivesFrom',
          kind: 'builtInType',
        }),
      ]),
    });
    expect(restrictionSummary).toMatchObject({
      declaration: undefined,
      xsdProperties: [
        { id: 'base-type', label: 'Base type', value: 'xs:string' },
        { id: 'allowed-values', label: 'Allowed values', value: '5' },
      ],
      orderedDestinationSummaries: [
        expect.objectContaining({
          relationshipKind: 'restricts',
          kind: 'builtInType',
        }),
      ],
    });
    expect(
      imported.project.nodes.some(({ kind }) => kind === 'enumeration'),
    ).toBe(true);
    expect(JSON.stringify([simpleSummary, restrictionSummary])).not.toContain(
      '<xs:',
    );
  });

  it('presents restriction-cycle closures as terminal recursive bases', () => {
    const imported = importXsdFixture('restriction-cycle', xsdRestrictionCycle);
    const typeA = imported.project.nodes.find(
      ({ kind, name }) => kind === 'simpleType' && name === 'TypeA',
    )!;
    const restrictionA = imported.project.nodes.find(
      ({ kind, name }) =>
        kind === 'restriction' && name === 'Restriction of TypeA',
    )!;
    const typeB = imported.project.nodes.find(
      ({ kind, name }) => kind === 'simpleType' && name === 'TypeB',
    )!;
    const restrictionB = imported.project.nodes.find(
      ({ kind, name }) =>
        kind === 'restriction' && name === 'Restriction of TypeB',
    )!;
    const summary = buildFocusCardSummary(
      imported.project,
      restrictionB.id,
      {},
      imported.xsdMetadataByNodeId,
      {
        projectId: imported.project.id,
        navigationPath: [typeA.id, restrictionA.id, typeB.id, restrictionB.id],
      },
    );

    expect(summary?.visibleRelationshipSummaries).toEqual([
      expect.objectContaining({
        nodeId: typeA.id,
        relationshipKind: 'restricts',
        relationshipLabel: 'Recursive base type',
        disposition: 'terminalCycleClosure',
        terminalLabel: 'Already present earlier in this path',
      }),
    ]);
  });

  it('derives recursive focused-card controls from the current journey', () => {
    const recursiveProject: SchemaProject = {
      id: 'recursive-focus-summary',
      displayName: 'Recursive focus summary',
      nodes: [
        {
          id: 'one',
          kind: 'dtdElement',
          name: 'one',
          compactDeclaration: '(two)',
        },
        {
          id: 'two',
          kind: 'dtdElement',
          name: 'two',
          compactDeclaration: '(one)',
        },
        {
          id: 'section',
          kind: 'dtdElement',
          name: 'section',
          compactDeclaration: '(section*)',
        },
      ],
      edges: [
        {
          id: 'one-two',
          kind: 'contains',
          sourceNodeId: 'one',
          targetNodeId: 'two',
        },
        {
          id: 'two-one',
          kind: 'contains',
          sourceNodeId: 'two',
          targetNodeId: 'one',
        },
        {
          id: 'section-section',
          kind: 'contains',
          sourceNodeId: 'section',
          targetNodeId: 'section',
          occurrence: { min: 0, max: 'unbounded' },
        },
      ],
      rootNodeIds: ['one', 'section'],
    };

    expect(
      buildFocusCardSummary(
        recursiveProject,
        'two',
        {},
        {},
        {
          projectId: recursiveProject.id,
          navigationPath: ['one', 'two'],
        },
      )?.contentModelParts,
    ).toContainEqual(
      expect.objectContaining({
        kind: 'nodeReference',
        id: 'two-one',
        disposition: 'terminalCycleClosure',
        relationshipLabel: 'Recursive child',
        terminalLabel: 'Already present earlier in this path',
        isCurrentFocusClosure: false,
      }),
    );
    expect(
      buildFocusCardSummary(
        recursiveProject,
        'section',
        {},
        {},
        {
          projectId: recursiveProject.id,
          navigationPath: ['section'],
        },
      )?.contentModelParts,
    ).toContainEqual(
      expect.objectContaining({
        id: 'section-section',
        disposition: 'terminalCycleClosure',
        relationshipLabel: 'Recursive child',
        terminalLabel: 'Already the current element',
        isCurrentFocusClosure: true,
      }),
    );
  });
});
