import { describe, expect, it } from 'vitest';
import type {
  ProjectSearchDocument,
  ProjectSearchField,
  ProjectSearchFieldKind,
  ProjectSearchIndex,
} from './projectSearchTypes';
import {
  DEFAULT_PROJECT_SEARCH_RESULT_LIMIT,
  projectSearchScoreTiers,
  searchProjectIndex,
} from './projectSearchQuery';
import { normalizeProjectSearchText } from './projectSearchNormalization';

function field(
  id: string,
  kind: ProjectSearchFieldKind,
  text: string,
  sourceOrder: number,
  language?: string,
): ProjectSearchField {
  return {
    id,
    kind,
    text,
    normalizedText: normalizeProjectSearchText(text),
    sourceOrder,
    ...(language ? { language } : {}),
  };
}

function document(
  nodeId: string,
  nodeName: string,
  fields: readonly ProjectSearchField[],
  options: {
    readonly sourceOrder?: number;
    readonly category?: ProjectSearchDocument['nodeCategory'];
  } = {},
): ProjectSearchDocument {
  return {
    id: `search-document:${nodeId}`,
    resultKind: 'schema-node',
    nodeId,
    nodeKind: options.category === 'attribute' ? 'attribute' : 'globalElement',
    nodeCategory: options.category ?? 'element',
    nodeName,
    normalizedNodeName: normalizeProjectSearchText(nodeName),
    sourceOrder: options.sourceOrder ?? 0,
    fields: [field(`${nodeId}:name`, 'name', nodeName, 0), ...fields],
  };
}

function index(
  documents: readonly ProjectSearchDocument[],
): ProjectSearchIndex {
  return { projectId: 'query:fixture', documents };
}

describe('project search query engine', () => {
  it('keeps only K ranked candidates while matching 40,000 documents', () => {
    const documents = Array.from({ length: 40_000 }, (_, value) =>
      document(
        `node:${value}`,
        `customer ${String(40_000 - value).padStart(5, '0')}`,
        [],
        { sourceOrder: value % 97 },
      ),
    );
    let maximumRetained = 0;
    const optimized = searchProjectIndex(index(documents), 'customer', {
      limit: 20,
      onRetainedCandidateCount: (count) => {
        maximumRetained = Math.max(maximumRetained, count);
      },
    });
    const referenceDocuments = documents.slice(0, 1_000);
    const referenceTop = searchProjectIndex(
      index(referenceDocuments),
      'customer',
      { limit: 20 },
    );
    const fullReference = searchProjectIndex(
      index(referenceDocuments),
      'customer',
      { limit: referenceDocuments.length },
    );

    expect(referenceTop).toEqual(fullReference.slice(0, 20));
    expect(optimized).toHaveLength(20);
    expect(maximumRetained).toBe(20);
  });

  it('returns no results for empty queries and does not interpret punctuation', () => {
    const fixture = index([
      document('colon', 'xs:string', []),
      document('plain', 'string', []),
    ]);

    expect(searchProjectIndex(fixture, '')).toEqual([]);
    expect(searchProjectIndex(fixture, ' \r\n\t')).toEqual([]);
    expect(
      searchProjectIndex(fixture, ':').map(({ nodeId }) => nodeId),
    ).toEqual(['colon']);
    expect(searchProjectIndex(fixture, '[.*')).toEqual([]);
  });

  it('supports one-character, case-insensitive, and NFKC-compatible matches', () => {
    const fixture = index([
      document('base', 'BaseType', []),
      document('resume', 'Résumé', []),
    ]);

    expect(searchProjectIndex(fixture, 'b')[0]?.nodeId).toBe('base');
    expect(searchProjectIndex(fixture, 'BASETYPE')[0]?.nodeId).toBe('base');
    expect(searchProjectIndex(fixture, 'ＢａｓｅＴｙｐｅ')[0]?.nodeId).toBe(
      'base',
    );
    expect(searchProjectIndex(fixture, 'résumé')[0]?.nodeId).toBe('resume');
    expect(searchProjectIndex(fixture, 'resume')).toEqual([]);
  });

  it('uses AND semantics across fields and rejects a missing term', () => {
    const fixture = index([
      document('root', 'root', [
        field('root:doc', 'documentation', 'Human documentation text', 1),
      ]),
    ]);

    const results = searchProjectIndex(fixture, 'root documentation');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      nodeId: 'root',
      score: projectSearchScoreTiers.distributed,
    });
    expect(results[0]!.matches.map(({ fieldKind }) => fieldKind)).toEqual([
      'name',
      'documentation',
    ]);
    expect(searchProjectIndex(fixture, 'root absent')).toEqual([]);
  });

  it('ranks name, reference, prose, source, and distributed matches by tier', () => {
    const fixture = index([
      document('exact-name', 'BaseType', []),
      document('prefix-name', 'BaseTypeExtended', []),
      document('term-name', 'Alpha BaseType Node', []),
      document('exact-reference', 'Reference exact', [
        field('exact-reference:ref', 'reference', 'BaseType', 1),
      ]),
      document('prefix-reference', 'Reference prefix', [
        field('prefix-reference:ref', 'reference', 'BaseTypeDerived', 1),
      ]),
      document('term-reference', 'Reference terms', [
        field('term-reference:ref', 'reference', 'Alpha BaseType Node', 1),
      ]),
      document('documentation', 'Documentation owner', [
        field('documentation:doc', 'documentation', 'BaseType prose', 1),
      ]),
      document('comment', 'Comment owner', [
        field('comment:comment', 'dtdComment', 'BaseType prose', 1),
      ]),
      document('source', 'Source owner', [
        field('source:file', 'sourceFile', 'BaseType.xsd', 1),
      ]),
      document('distributed', 'Base owner', [
        field('distributed:doc', 'documentation', 'Type prose', 1),
      ]),
    ]);

    expect(
      searchProjectIndex(fixture, 'BaseType').map(({ nodeId, score }) => [
        nodeId,
        score,
      ]),
    ).toEqual([
      ['exact-name', projectSearchScoreTiers.exactName],
      ['prefix-name', projectSearchScoreTiers.namePrefix],
      ['term-name', projectSearchScoreTiers.nameTerms],
      ['exact-reference', projectSearchScoreTiers.exactReference],
      ['prefix-reference', projectSearchScoreTiers.referencePrefix],
      ['term-reference', projectSearchScoreTiers.referenceTerms],
      ['documentation', projectSearchScoreTiers.documentation],
      ['comment', projectSearchScoreTiers.dtdComment],
      ['source', projectSearchScoreTiers.sourceFile],
    ]);

    expect(searchProjectIndex(fixture, 'base type')[0]).toMatchObject({
      nodeId: 'term-name',
      score: projectSearchScoreTiers.nameTerms,
    });
    expect(
      searchProjectIndex(fixture, 'base type').find(
        ({ nodeId }) => nodeId === 'distributed',
      ),
    ).toMatchObject({ score: projectSearchScoreTiers.distributed });
  });

  it('returns one result per node with every matching field once and in order', () => {
    const fixture = index([
      document('owner', 'owner', [
        field('owner:ref', 'reference', 'tns:BaseType', 1),
        field(
          'owner:doc-en',
          'documentation',
          'BaseType documentation',
          2,
          'en',
        ),
        field(
          'owner:doc-fr',
          'documentation',
          'Documentation BaseType',
          3,
          'fr',
        ),
      ]),
    ]);

    const results = searchProjectIndex(fixture, 'basetype');
    expect(results).toHaveLength(1);
    expect(results[0]!.matches).toEqual([
      {
        fieldId: 'owner:ref',
        fieldKind: 'reference',
        text: 'tns:BaseType',
      },
      {
        fieldId: 'owner:doc-en',
        fieldKind: 'documentation',
        text: 'BaseType documentation',
        language: 'en',
      },
      {
        fieldId: 'owner:doc-fr',
        fieldKind: 'documentation',
        text: 'Documentation BaseType',
        language: 'fr',
      },
    ]);
  });

  it('uses deterministic source/category/name/id tie-breaks', () => {
    const fixture = index([
      document('z-id', 'Same', [], {
        sourceOrder: 2,
        category: 'element',
      }),
      document('attribute', 'Same', [], {
        sourceOrder: 1,
        category: 'attribute',
      }),
      document('element-z', 'Zeta', [], {
        sourceOrder: 1,
        category: 'element',
      }),
      document('element-a2', 'Alpha', [], {
        sourceOrder: 1,
        category: 'element',
      }),
      document('element-a1', 'Alpha', [], {
        sourceOrder: 1,
        category: 'element',
      }),
    ]);

    expect(
      searchProjectIndex(fixture, 'a').map(({ nodeId }) => nodeId),
    ).toEqual(['element-a1', 'element-a2', 'element-z', 'attribute', 'z-id']);
  });

  it('applies default, explicit, zero, negative, fractional, and non-finite limits after sorting', () => {
    const documents = Array.from({ length: 120 }, (_, position) =>
      document(
        `node-${position}`,
        `Match ${String(position).padStart(3, '0')}`,
        [],
        {
          sourceOrder: position,
        },
      ),
    );
    const fixture = index(documents);

    expect(searchProjectIndex(fixture, 'match')).toHaveLength(
      DEFAULT_PROJECT_SEARCH_RESULT_LIMIT,
    );
    expect(searchProjectIndex(fixture, 'match', { limit: 3 })).toHaveLength(3);
    expect(
      searchProjectIndex(fixture, 'match', { limit: 3.9 }).map(
        ({ nodeId }) => nodeId,
      ),
    ).toEqual(['node-0', 'node-1', 'node-2']);
    expect(searchProjectIndex(fixture, 'match', { limit: 0 })).toEqual([]);
    expect(searchProjectIndex(fixture, 'match', { limit: -2 })).toEqual([]);
    expect(
      searchProjectIndex(fixture, 'match', { limit: Number.NaN }),
    ).toHaveLength(DEFAULT_PROJECT_SEARCH_RESULT_LIMIT);
    expect(
      searchProjectIndex(fixture, 'match', { limit: Infinity }),
    ).toHaveLength(DEFAULT_PROJECT_SEARCH_RESULT_LIMIT);
  });

  it('uses pre-normalized fields rather than modifying or renormalizing index text', () => {
    const fixture = index([
      {
        ...document('normalized', 'Not a match', []),
        fields: [
          {
            id: 'normalized:name',
            kind: 'name',
            text: 'Not a match',
            normalizedText: 'synthetic normalized vocabulary',
            sourceOrder: 0,
          },
        ],
      },
    ]);

    expect(searchProjectIndex(fixture, 'vocabulary')[0]?.nodeId).toBe(
      'normalized',
    );
    expect(searchProjectIndex(fixture, 'not a match')).toEqual([]);
  });

  it('returns JSON data in independently allocated result and match arrays without mutating the index', () => {
    const fixture = index([
      document('owner', 'Owner', [
        field('owner:doc', 'documentation', 'Documentation text', 1, 'en'),
      ]),
    ]);
    const snapshot = JSON.stringify(fixture);
    const first = searchProjectIndex(fixture, 'documentation');
    const second = searchProjectIndex(fixture, 'documentation');

    expect(JSON.stringify(first)).toBeTruthy();
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
    expect(first[0]!.matches).not.toBe(second[0]!.matches);
    expect(JSON.stringify(fixture)).toBe(snapshot);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first[0]!.matches)).toBe(true);
  });
});
