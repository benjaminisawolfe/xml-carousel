import { describe, expect, it } from 'vitest';
import {
  projectSearchScoreTiers,
  type ProjectSearchFieldKind,
  type ProjectSearchResult,
} from '../../app/search';
import {
  buildProjectSearchPresentation,
  SEARCH_EMPTY_HELP_TEXT,
  SEARCH_GUIDANCE_TEXT,
  SEARCH_TRUNCATION_NOTICE,
  SEARCH_UI_RESULT_LIMIT,
  selectProjectSearchPresentationGroup,
} from './projectSearchPresentation';

function match(
  fieldKind: ProjectSearchFieldKind,
  text: string,
  language?: string,
) {
  return {
    fieldId: `field:${fieldKind}:${text}`,
    fieldKind,
    text,
    ...(language === undefined ? {} : { language }),
  };
}

function result(
  overrides: Partial<ProjectSearchResult> = {},
): ProjectSearchResult {
  return {
    id: 'search-document:node-1',
    resultKind: 'schema-node',
    nodeId: 'node-1',
    nodeKind: 'globalElement',
    nodeCategory: 'element',
    nodeName: 'root',
    sourceFileId: 'source-1',
    sourceFilename: 'annotations.xsd',
    score: projectSearchScoreTiers.exactName,
    matches: [match('name', 'root')],
    ...overrides,
  };
}

function flattenResults(
  groups: readonly {
    readonly results: readonly {
      readonly nodeId: string;
    }[];
  }[],
) {
  return groups.reduce<
    readonly {
      readonly nodeId: string;
    }[]
  >((all, group) => [...all, ...group.results], []);
}

describe('project search result presentation', () => {
  it('uses guidance for empty and compatibility-whitespace-only queries', () => {
    expect(buildProjectSearchPresentation('', [])).toEqual({
      status: 'guidance',
      query: '',
      guidanceText: SEARCH_GUIDANCE_TEXT,
      statusText: '',
    });
    expect(buildProjectSearchPresentation('　\r\n\t', [])).toMatchObject({
      status: 'guidance',
      guidanceText: SEARCH_GUIDANCE_TEXT,
    });
  });

  it('uses exact empty-state wording with the original trimmed casing', () => {
    expect(buildProjectSearchPresentation('  MissingType  ', [])).toEqual({
      status: 'empty',
      query: '  MissingType  ',
      normalizedQuery: 'missingtype',
      displayQuery: 'MissingType',
      heading: 'No nodes matched “MissingType”.',
      helpText: SEARCH_EMPTY_HELP_TEXT,
      statusText: 'No nodes matched “MissingType”.',
    });
  });

  it('formats singular and plural live status exactly', () => {
    expect(buildProjectSearchPresentation('root', [result()])).toMatchObject({
      status: 'results',
      resultCount: 1,
      statusText: '1 result for “root”.',
    });
    expect(
      buildProjectSearchPresentation('root', [
        result(),
        result({ nodeId: 'node-2' }),
      ]),
    ).toMatchObject({
      status: 'results',
      resultCount: 2,
      statusText: '2 results for “root”.',
    });
  });

  it('detects the 101st result while presenting only the first 100', () => {
    const results = Array.from(
      { length: SEARCH_UI_RESULT_LIMIT + 1 },
      (_, index) =>
        result({
          nodeId: `node-${index}`,
          nodeName: `root ${index}`,
        }),
    );
    const presentation = buildProjectSearchPresentation('root', results);

    expect(presentation).toMatchObject({
      status: 'results',
      resultCount: 100,
      isTruncated: true,
      statusText:
        'Showing the first 100 results for “root”. Refine your search.',
      truncationNotice: SEARCH_TRUNCATION_NOTICE,
    });
    if (presentation.status !== 'results') throw new Error('Expected results.');
    expect(flattenResults(presentation.groups)).toHaveLength(100);
    expect(
      flattenResults(presentation.groups).some(
        ({ nodeId }) => nodeId === 'node-100',
      ),
    ).toBe(false);
  });

  it('uses stable group IDs, labels, and accepted order', () => {
    const presentation = buildProjectSearchPresentation('match', [
      result({
        nodeId: 'other',
        nodeKind: 'include',
        nodeCategory: 'other',
        nodeName: 'match other',
      }),
      result({
        nodeId: 'source',
        nodeName: 'source owner',
        score: projectSearchScoreTiers.sourceFile,
        matches: [match('sourceFile', 'match.xsd')],
      }),
      result({
        nodeId: 'docs',
        nodeName: 'docs owner',
        score: projectSearchScoreTiers.documentation,
        matches: [match('documentation', 'match text')],
      }),
      result({
        nodeId: 'schema',
        nodeKind: 'schema',
        nodeCategory: 'schema',
        nodeName: 'match schema',
      }),
      result({
        nodeId: 'dtd',
        nodeKind: 'dtdElement',
        nodeCategory: 'dtdDeclaration',
        nodeName: 'match dtd',
      }),
      result({
        nodeId: 'attribute',
        nodeKind: 'attribute',
        nodeCategory: 'attribute',
        nodeName: 'match attribute',
      }),
      result({
        nodeId: 'type',
        nodeKind: 'complexType',
        nodeCategory: 'type',
        nodeName: 'match type',
      }),
      result({ nodeId: 'element', nodeName: 'match element' }),
    ]);

    if (presentation.status !== 'results') throw new Error('Expected results.');
    expect(presentation.groups.map(({ id, label }) => [id, label])).toEqual([
      ['elements', 'Elements'],
      ['types', 'Types'],
      ['attributes', 'Attributes'],
      ['dtd-declarations', 'DTD declarations'],
      ['schema-structures', 'Schema and structures'],
      ['documentation-comments', 'Documentation and comments'],
      ['source-files', 'Source files'],
      ['other', 'Other'],
    ]);
  });

  it('applies documentation/comment and source-only overrides by score tier', () => {
    expect(
      selectProjectSearchPresentationGroup(
        result({
          score: projectSearchScoreTiers.documentation,
          matches: [match('documentation', 'prose')],
        }),
      ),
    ).toBe('documentation-comments');
    expect(
      selectProjectSearchPresentationGroup(
        result({
          score: projectSearchScoreTiers.dtdComment,
          matches: [match('dtdComment', 'comment')],
        }),
      ),
    ).toBe('documentation-comments');
    expect(
      selectProjectSearchPresentationGroup(
        result({
          score: projectSearchScoreTiers.sourceFile,
          matches: [match('sourceFile', 'schema.xsd')],
        }),
      ),
    ).toBe('source-files');
  });

  it('keeps strong and distributed name/reference matches in node groups', () => {
    expect(
      selectProjectSearchPresentationGroup(
        result({
          nodeCategory: 'type',
          score: projectSearchScoreTiers.exactReference,
          matches: [match('reference', 'root')],
        }),
      ),
    ).toBe('types');
    expect(
      selectProjectSearchPresentationGroup(
        result({
          nodeCategory: 'type',
          score: projectSearchScoreTiers.distributed,
          matches: [match('name', 'root'), match('reference', 'type')],
        }),
      ),
    ).toBe('types');
  });

  it('puts every result in exactly one group and preserves ranking order', () => {
    const input = [
      result({ nodeId: 'first', nodeName: 'first root' }),
      result({ nodeId: 'second', nodeName: 'second root' }),
      result({ nodeId: 'third', nodeName: 'third root' }),
    ];
    const presentation = buildProjectSearchPresentation('root', input);

    if (presentation.status !== 'results') throw new Error('Expected results.');
    const ids = flattenResults(presentation.groups).map(({ nodeId }) => nodeId);
    expect(ids).toEqual(['first', 'second', 'third']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('formats node kind and strips local paths from source metadata', () => {
    const presentation = buildProjectSearchPresentation('base', [
      result({
        nodeKind: 'complexType',
        nodeCategory: 'type',
        nodeName: 'BaseType',
        sourceFilename: String.raw`C:\private\schemas\annotations.xsd`,
      }),
    ]);
    if (presentation.status !== 'results') throw new Error('Expected results.');
    expect(presentation.groups[0]!.results[0]).toMatchObject({
      kindLabel: 'Complex type declaration',
      sourceFilename: 'annotations.xsd',
    });
    expect(JSON.stringify(presentation)).not.toContain('C:\\\\private');
  });

  it('selects one context by group-specific field priority', () => {
    const matches = [
      match('sourceFile', 'annotations.xsd'),
      match('dtdComment', 'comment match'),
      match('documentation', 'documentation match', 'en'),
      match('reference', 'xs:match'),
    ];
    const nodeGroup = buildProjectSearchPresentation('match', [
      result({
        nodeCategory: 'type',
        nodeKind: 'complexType',
        score: projectSearchScoreTiers.referenceTerms,
        matches,
      }),
    ]);
    const proseGroup = buildProjectSearchPresentation('match', [
      result({
        score: projectSearchScoreTiers.documentation,
        matches,
      }),
    ]);

    if (nodeGroup.status !== 'results' || proseGroup.status !== 'results') {
      throw new Error('Expected results.');
    }
    expect(nodeGroup.groups[0]!.results[0]!.contextLabel).toBe('Reference');
    expect(proseGroup.groups[0]!.results[0]).toMatchObject({
      contextLabel: 'Documentation · en',
      language: 'en',
    });
  });

  it('uses exact context labels and omits empty Documentation language', () => {
    for (const [fieldKind, label] of [
      ['reference', 'Reference'],
      ['documentation', 'Documentation'],
      ['dtdComment', 'DTD comment'],
      ['sourceFile', 'Source file'],
    ] as const) {
      const score =
        fieldKind === 'sourceFile'
          ? projectSearchScoreTiers.sourceFile
          : fieldKind === 'dtdComment'
            ? projectSearchScoreTiers.dtdComment
            : fieldKind === 'documentation'
              ? projectSearchScoreTiers.documentation
              : projectSearchScoreTiers.referenceTerms;
      const presentation = buildProjectSearchPresentation('match', [
        result({
          score,
          matches: [
            match(
              fieldKind,
              'match',
              fieldKind === 'documentation' ? '' : undefined,
            ),
          ],
        }),
      ]);
      if (presentation.status !== 'results')
        throw new Error('Expected results.');
      expect(presentation.groups[0]!.results[0]).toMatchObject({
        contextLabel: label,
      });
      expect(presentation.groups[0]!.results[0]).not.toHaveProperty('language');
    }
  });

  it('omits duplicate name context and formats additional-match grammar', () => {
    const nameOnly = buildProjectSearchPresentation('root', [result()]);
    const oneAdditional = buildProjectSearchPresentation('root', [
      result({
        score: projectSearchScoreTiers.referenceTerms,
        matches: [
          match('name', 'root'),
          match('reference', 'rootType'),
          match('documentation', 'root documentation'),
        ],
      }),
    ]);
    const twoAdditional = buildProjectSearchPresentation('root', [
      result({
        score: projectSearchScoreTiers.referenceTerms,
        matches: [
          match('name', 'root'),
          match('reference', 'rootType'),
          match('documentation', 'root documentation'),
          match('sourceFile', 'root.xsd'),
        ],
      }),
    ]);

    for (const presentation of [nameOnly, oneAdditional, twoAdditional]) {
      if (presentation.status !== 'results')
        throw new Error('Expected results.');
    }
    if (
      nameOnly.status !== 'results' ||
      oneAdditional.status !== 'results' ||
      twoAdditional.status !== 'results'
    ) {
      throw new Error('Expected results.');
    }
    expect(nameOnly.groups[0]!.results[0]).not.toHaveProperty('contextLabel');
    expect(nameOnly.groups[0]!.results[0]).not.toHaveProperty(
      'additionalMatchText',
    );
    expect(oneAdditional.groups[0]!.results[0]!.additionalMatchText).toBe(
      '+1 additional match',
    );
    expect(twoAdditional.groups[0]!.results[0]!.additionalMatchText).toBe(
      '+2 additional matches',
    );
  });

  it('is deterministic, returns defensive data, and does not mutate inputs', () => {
    const inputs = [
      result({
        nodeId: 'stable',
        matches: [
          match('name', 'root'),
          match('documentation', 'root documentation'),
        ],
      }),
    ];
    const before = JSON.stringify(inputs);
    const first = buildProjectSearchPresentation('root', inputs);
    const second = buildProjectSearchPresentation('root', inputs);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(JSON.stringify(inputs)).toBe(before);
    expect(Object.isFrozen(first)).toBe(true);
  });
});
