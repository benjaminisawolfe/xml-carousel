import { describe, expect, it } from 'vitest';
import {
  formatOccurrence,
  getContainedChildren,
  getIncomingEdges,
  getIncomingRelationships,
  getIncomingStructuralRelationships,
  getNodesUsingOrReferencing,
  getOutgoingEdges,
  getOutgoingStructuralRelationships,
  getRootNodes,
  getSchemaNode,
  schemaEdgeKinds,
  schemaNodeKinds,
  validateSchemaProject,
  type SchemaNode,
  type SchemaOccurrence,
  type SchemaPath,
  type SchemaProject,
} from './index';
import { bookDtdNodeIds, bookDtdProject } from '../samples/bookDtdProject';

describe('normalized schema vocabulary', () => {
  it('contains the planned XSD and DTD node and edge kinds', () => {
    expect(schemaNodeKinds).toContain('globalElement');
    expect(schemaNodeKinds).toContain('dtdElement');
    expect(schemaEdgeKinds).toContain('contains');
    expect(schemaEdgeKinds).toContain('usedBy');
  });

  it('keeps navigation paths separate from serializable node data', () => {
    const node: SchemaNode = {
      id: 'test:node',
      kind: 'dtdElement',
      name: 'test',
    };
    const path: SchemaPath = [node.id];

    expect(node).toEqual({ id: 'test:node', kind: 'dtdElement', name: 'test' });
    expect(path).toEqual(['test:node']);
  });
});

describe('book DTD sample project', () => {
  it('contains the expected unique nodes, edges, and sole root', () => {
    expect(bookDtdProject.nodes.map((node) => node.name)).toEqual([
      'book',
      'front.matter',
      'book.content',
      'index',
      'title.page',
      'preface',
      'chapter',
      'title',
      'subtitle',
      'author',
      'epigraph',
      'section',
      'figure',
      'note',
      'para',
      'index.entry',
      'isbn',
      'edition',
      'number',
    ]);
    expect(new Set(bookDtdProject.nodes.map((node) => node.id)).size).toBe(
      bookDtdProject.nodes.length,
    );
    expect(new Set(bookDtdProject.edges.map((edge) => edge.id)).size).toBe(
      bookDtdProject.edges.length,
    );
    expect(getRootNodes(bookDtdProject).map((node) => node.name)).toEqual([
      'book',
    ]);
    expect(validateSchemaProject(bookDtdProject)).toEqual([]);
  });

  it('contains the exact expanded declarations and source identities', () => {
    const declarations: Record<string, string | undefined> = {};
    for (const node of bookDtdProject.nodes) {
      declarations[node.name] = node.compactDeclaration;
    }

    expect(declarations).toEqual({
      book: '(front.matter, book.content, index)',
      'front.matter': '(title.page, preface?)',
      'book.content': '(chapter+)',
      index: '(index.entry+)',
      'title.page': '(title, subtitle?, author+)',
      preface: '(#PCDATA)',
      chapter: '(title, epigraph?, section*, figure*, note*)',
      title: '(#PCDATA)',
      subtitle: '(#PCDATA)',
      author: '(#PCDATA)',
      epigraph: '(#PCDATA)',
      section: '(title?, para+)',
      figure: '(#PCDATA)',
      note: '(#PCDATA)',
      para: '(#PCDATA)',
      'index.entry': '(#PCDATA)',
      isbn: 'isbn ID #REQUIRED',
      edition: 'edition (first|revised) "first"',
      number: 'number CDATA #IMPLIED',
    });
    expect(
      new Set(bookDtdProject.nodes.map((node) => node.sourceFileId)),
    ).toEqual(new Set(['sample.book.dtd']));
  });

  it('is serializable and is not mutated by model queries', () => {
    const before = JSON.stringify(bookDtdProject);
    const roundTrip = JSON.parse(before) as SchemaProject;

    for (const node of bookDtdProject.nodes) {
      getContainedChildren(bookDtdProject, node.id);
      getIncomingStructuralRelationships(bookDtdProject, node.id);
    }

    expect(roundTrip).toEqual(bookDtdProject);
    expect(JSON.stringify(bookDtdProject)).toBe(before);
  });

  it('resolves every edge endpoint', () => {
    for (const edge of bookDtdProject.edges) {
      expect(getSchemaNode(bookDtdProject, edge.sourceNodeId)).toBeDefined();
      expect(getSchemaNode(bookDtdProject, edge.targetNodeId)).toBeDefined();
    }
  });
});

describe('schema relationship queries', () => {
  it('returns ordered outgoing XSD structural relationships without collapsing repeated targets', () => {
    const project: SchemaProject = {
      id: 'xsd-relationships',
      displayName: 'XSD relationships',
      nodes: [
        { id: 'element', kind: 'localElement', name: 'item' },
        { id: 'child', kind: 'sequence', name: 'item sequence' },
        { id: 'type', kind: 'complexType', name: 'ItemType' },
        { id: 'reference', kind: 'globalElement', name: 'itemDefinition' },
        { id: 'attribute', kind: 'attribute', name: 'code' },
      ],
      edges: [
        {
          id: 'edge:type:second',
          kind: 'typeOf',
          sourceNodeId: 'element',
          targetNodeId: 'type',
          order: 3,
        },
        {
          id: 'edge:attribute',
          kind: 'usesAttribute',
          sourceNodeId: 'element',
          targetNodeId: 'attribute',
          order: 1,
        },
        {
          id: 'edge:child',
          kind: 'contains',
          sourceNodeId: 'element',
          targetNodeId: 'child',
          order: 0,
        },
        {
          id: 'edge:reference',
          kind: 'references',
          sourceNodeId: 'element',
          targetNodeId: 'reference',
          order: 2,
        },
        {
          id: 'edge:type:first',
          kind: 'typeOf',
          sourceNodeId: 'element',
          targetNodeId: 'type',
          order: 3,
        },
        {
          id: 'edge:missing',
          kind: 'references',
          sourceNodeId: 'element',
          targetNodeId: 'missing',
          order: 4,
        },
        {
          id: 'edge:cycle',
          kind: 'references',
          sourceNodeId: 'reference',
          targetNodeId: 'element',
        },
      ],
      rootNodeIds: ['element'],
    };

    expect(
      getOutgoingStructuralRelationships(project, 'element').map(
        ({ edge, node }) => [edge.id, edge.kind, node.id],
      ),
    ).toEqual([
      ['edge:child', 'contains', 'child'],
      ['edge:reference', 'references', 'reference'],
      ['edge:type:first', 'typeOf', 'type'],
      ['edge:type:second', 'typeOf', 'type'],
    ]);
    expect(
      getOutgoingStructuralRelationships(project, 'reference').map(
        ({ edge, node }) => [edge.kind, node.id],
      ),
    ).toEqual([['references', 'element']]);
    expect(getOutgoingStructuralRelationships(project, 'missing')).toEqual([]);
  });

  it('keeps DTD outgoing structural output identical to containment output', () => {
    for (const node of bookDtdProject.nodes) {
      expect(
        getOutgoingStructuralRelationships(bookDtdProject, node.id),
      ).toEqual(getContainedChildren(bookDtdProject, node.id));
    }
  });

  it('returns the three ordered book children', () => {
    expect(
      getContainedChildren(bookDtdProject, bookDtdNodeIds.book).map(
        ({ node }) => node.name,
      ),
    ).toEqual(['front.matter', 'book.content', 'index']);
  });

  it('preserves front-matter order and optional occurrence', () => {
    const children = getContainedChildren(
      bookDtdProject,
      bookDtdNodeIds.frontMatter,
    );

    expect(children.map(({ node }) => node.name)).toEqual([
      'title.page',
      'preface',
    ]);
    expect(formatOccurrence(children[0]?.edge.occurrence)).toBe('');
    expect(formatOccurrence(children[1]?.edge.occurrence)).toBe('?');
  });

  it('formats repeated chapter and section occurrences', () => {
    const chapterEdge = getContainedChildren(
      bookDtdProject,
      bookDtdNodeIds.bookContent,
    )[0]?.edge;
    const sectionEdge = getContainedChildren(
      bookDtdProject,
      bookDtdNodeIds.chapter,
    ).find(({ node }) => node.id === bookDtdNodeIds.section)?.edge;

    expect(formatOccurrence(chapterEdge?.occurrence)).toBe('+');
    expect(formatOccurrence(sectionEdge?.occurrence)).toBe('*');
  });

  it('preserves every ordered structural relationship and occurrence object', () => {
    const relationships: Record<
      string,
      readonly {
        readonly name: string;
        readonly order: number | undefined;
        readonly occurrence: SchemaOccurrence | undefined;
      }[]
    > = {};
    for (const sourceNodeId of [
      bookDtdNodeIds.book,
      bookDtdNodeIds.frontMatter,
      bookDtdNodeIds.bookContent,
      bookDtdNodeIds.titlePage,
      bookDtdNodeIds.chapter,
      bookDtdNodeIds.section,
      bookDtdNodeIds.index,
    ]) {
      relationships[sourceNodeId] = getContainedChildren(
        bookDtdProject,
        sourceNodeId,
      ).map(({ edge, node }) => ({
        name: node.name,
        order: edge.order,
        occurrence: edge.occurrence,
      }));
    }

    expect(relationships).toEqual({
      [bookDtdNodeIds.book]: [
        {
          name: 'front.matter',
          order: 0,
          occurrence: { min: 1, max: 1 },
        },
        {
          name: 'book.content',
          order: 1,
          occurrence: { min: 1, max: 1 },
        },
        { name: 'index', order: 2, occurrence: { min: 1, max: 1 } },
      ],
      [bookDtdNodeIds.frontMatter]: [
        { name: 'title.page', order: 0, occurrence: { min: 1, max: 1 } },
        { name: 'preface', order: 1, occurrence: { min: 0, max: 1 } },
      ],
      [bookDtdNodeIds.bookContent]: [
        {
          name: 'chapter',
          order: 0,
          occurrence: { min: 1, max: 'unbounded' },
        },
      ],
      [bookDtdNodeIds.titlePage]: [
        { name: 'title', order: 0, occurrence: { min: 1, max: 1 } },
        { name: 'subtitle', order: 1, occurrence: { min: 0, max: 1 } },
        {
          name: 'author',
          order: 2,
          occurrence: { min: 1, max: 'unbounded' },
        },
      ],
      [bookDtdNodeIds.chapter]: [
        { name: 'title', order: 0, occurrence: { min: 1, max: 1 } },
        { name: 'epigraph', order: 1, occurrence: { min: 0, max: 1 } },
        {
          name: 'section',
          order: 2,
          occurrence: { min: 0, max: 'unbounded' },
        },
        {
          name: 'figure',
          order: 3,
          occurrence: { min: 0, max: 'unbounded' },
        },
        {
          name: 'note',
          order: 4,
          occurrence: { min: 0, max: 'unbounded' },
        },
      ],
      [bookDtdNodeIds.section]: [
        { name: 'title', order: 0, occurrence: { min: 0, max: 1 } },
        {
          name: 'para',
          order: 1,
          occurrence: { min: 1, max: 'unbounded' },
        },
      ],
      [bookDtdNodeIds.index]: [
        {
          name: 'index.entry',
          order: 0,
          occurrence: { min: 1, max: 'unbounded' },
        },
      ],
    });
  });

  it('reuses one title node through three distinct incoming edges', () => {
    expect(
      bookDtdProject.nodes.filter((node) => node.name === 'title'),
    ).toHaveLength(1);
    expect(
      getIncomingStructuralRelationships(
        bookDtdProject,
        bookDtdNodeIds.title,
      ).map(({ edge, node }) => ({
        source: node.name,
        edgeId: edge.id,
      })),
    ).toEqual([
      {
        source: 'title.page',
        edgeId: 'dtd:contains:title.page:title',
      },
      { source: 'chapter', edgeId: 'dtd:contains:chapter:title' },
      { source: 'section', edgeId: 'dtd:contains:section:title' },
    ]);
  });

  it('distinguishes expanded structural leaves from non-leaves', () => {
    const leaves = bookDtdProject.nodes
      .filter(
        (node) =>
          node.kind === 'dtdElement' &&
          getContainedChildren(bookDtdProject, node.id).length === 0,
      )
      .map((node) => node.name);

    expect(leaves).toEqual([
      'preface',
      'title',
      'subtitle',
      'author',
      'epigraph',
      'figure',
      'note',
      'para',
      'index.entry',
    ]);
  });

  it('finds incoming container relationships without redundant reverse edges', () => {
    expect(
      getIncomingEdges(bookDtdProject, bookDtdNodeIds.chapter).map(
        (edge) => edge.sourceNodeId,
      ),
    ).toEqual([bookDtdNodeIds.bookContent]);
    expect(
      getIncomingRelationships(bookDtdProject, bookDtdNodeIds.chapter).map(
        ({ node }) => node.name,
      ),
    ).toEqual(['book.content']);
    expect(
      getNodesUsingOrReferencing(bookDtdProject, bookDtdNodeIds.chapter),
    ).toEqual([]);
  });

  it('handles unknown node IDs without throwing', () => {
    expect(getSchemaNode(bookDtdProject, 'missing')).toBeUndefined();
    expect(getOutgoingEdges(bookDtdProject, 'missing')).toEqual([]);
    expect(getIncomingEdges(bookDtdProject, 'missing')).toEqual([]);
    expect(getContainedChildren(bookDtdProject, 'missing')).toEqual([]);
  });
});

describe('schema project validation', () => {
  it('reports malformed IDs, endpoints, roots, occurrences, and branch orders', () => {
    const invalidProject: SchemaProject = {
      id: 'invalid',
      displayName: 'Invalid project',
      nodes: [
        { id: 'node:a', kind: 'dtdElement', name: 'a' },
        { id: 'node:a', kind: 'dtdElement', name: 'duplicate a' },
      ],
      edges: [
        {
          id: 'edge:duplicate',
          kind: 'contains',
          sourceNodeId: 'node:missing',
          targetNodeId: 'node:a',
          order: 0,
          occurrence: { min: 2, max: 1 },
        },
        {
          id: 'edge:duplicate',
          kind: 'contains',
          sourceNodeId: 'node:a',
          targetNodeId: 'node:missing',
          order: -1,
        },
        {
          id: 'edge:order-conflict',
          kind: 'contains',
          sourceNodeId: 'node:missing',
          targetNodeId: 'node:a',
          order: 0,
        },
      ],
      rootNodeIds: ['node:missing'],
    };

    expect(
      validateSchemaProject(invalidProject).map(({ code }) => code),
    ).toEqual(
      expect.arrayContaining([
        'duplicateNodeId',
        'duplicateEdgeId',
        'missingEdgeSource',
        'missingEdgeTarget',
        'missingRootNode',
        'invalidOccurrence',
        'invalidBranchOrder',
        'duplicateBranchOrder',
      ]),
    );
  });
});
