import { describe, expect, it } from 'vitest';
import {
  getContainedChildren,
  getIncomingStructuralRelationships,
  getSchemaNode,
  validateSchemaProject,
  type SchemaEdge,
  type SchemaProject,
} from '../model';
import { bookDtdNodeIds, bookDtdProject } from '../samples/bookDtdProject';
import builderSource from './dtdProjectBuilder.ts?raw';
import buildDiagnosticsSource from './dtdBuildDiagnostics.ts?raw';
import {
  buildDtdSchemaProject,
  dtdBuildDiagnosticCodes,
  parseDtdElementDeclarations,
  type DtdElementDeclarationAst,
  type DtdGroupAst,
  type DtdProjectBuildOptions,
  type DtdProjectBuildResult,
} from './index';

const defaultOptions = {
  projectId: 'project:fixture',
  displayName: 'Fixture DTD',
  sourceFileId: 'source:fixture',
  sourceFilename: 'fixture.dtd',
} satisfies DtdProjectBuildOptions;

function parse(source: string): readonly DtdElementDeclarationAst[] {
  const result = parseDtdElementDeclarations(
    source,
    defaultOptions.sourceFileId,
  );
  expect(result.diagnostics).toEqual([]);
  return result.declarations;
}

function build(
  source: string,
  options: DtdProjectBuildOptions = defaultOptions,
): DtdProjectBuildResult {
  return buildDtdSchemaProject(parse(source), source, options);
}

function requireProject(result: DtdProjectBuildResult): SchemaProject {
  expect(result.diagnostics).toEqual([]);
  expect(result.project).toBeDefined();
  return result.project!;
}

function nodeId(project: SchemaProject, name: string): string {
  const node = project.nodes.find((candidate) => candidate.name === name);
  expect(node).toBeDefined();
  return node!.id;
}

function outgoing(project: SchemaProject, name: string): readonly SchemaEdge[] {
  return getContainedChildren(project, nodeId(project, name)).map(
    ({ edge }) => edge,
  );
}

function projectForExpression(
  expression: string,
  childNames: readonly string[],
): SchemaProject {
  const declarations = childNames
    .map((name) => `<!ELEMENT ${name} EMPTY>`)
    .join('\n');
  return requireProject(build(`<!ELEMENT x ${expression}>\n${declarations}`));
}

function occurrences(
  project: SchemaProject,
  sourceName = 'x',
): readonly (readonly [string, number, number | 'unbounded'])[] {
  return getContainedChildren(project, nodeId(project, sourceName)).map(
    ({ edge, node }) =>
      [
        node.name,
        edge.occurrence?.min ?? 1,
        edge.occurrence?.max ?? 1,
      ] as const,
  );
}

const expandedBookDtd = [
  '<!ELEMENT book (front.matter, book.content, index)>',
  '<!ELEMENT front.matter (title.page, preface?)>',
  '<!ELEMENT book.content (chapter+)>',
  '<!ELEMENT index (index.entry+)>',
  '<!ELEMENT title.page (title, subtitle?, author+)>',
  '<!ELEMENT preface (#PCDATA)>',
  '<!ELEMENT chapter (title, epigraph?, section*, figure*, note*)>',
  '<!ELEMENT title (#PCDATA)>',
  '<!ELEMENT subtitle (#PCDATA)>',
  '<!ELEMENT author (#PCDATA)>',
  '<!ELEMENT epigraph (#PCDATA)>',
  '<!ELEMENT section (title?, para+)>',
  '<!ELEMENT figure (#PCDATA)>',
  '<!ELEMENT note (#PCDATA)>',
  '<!ELEMENT para (#PCDATA)>',
  '<!ELEMENT index.entry (#PCDATA)>',
].join('\n');

describe('basic DTD project building', () => {
  it.each([
    ['EMPTY', 'empty'],
    ['ANY', 'any'],
    ['(#PCDATA)', 'text'],
  ] as const)('builds a single %s element', (content, expectedKind) => {
    const project = requireProject(build(`<!ELEMENT item ${content}>`));
    const itemId = nodeId(project, 'item');

    expect(project.nodes).toHaveLength(1);
    expect(project.edges).toEqual([]);
    expect(project.rootNodeIds).toEqual([itemId]);
    expect(
      build(`<!ELEMENT item ${content}>`).contentKindsByNodeId[itemId],
    ).toBe(expectedKind);
  });

  it('builds one ordered child relationship', () => {
    const project = requireProject(
      build('<!ELEMENT parent (child)>\n<!ELEMENT child EMPTY>'),
    );

    expect(occurrences(project, 'parent')).toEqual([['child', 1, 1]]);
  });

  it('resolves a forward reference', () => {
    const project = requireProject(
      build('<!ELEMENT parent (child)>\n<!ELEMENT child EMPTY>'),
    );

    expect(outgoing(project, 'parent')[0]?.targetNodeId).toBe(
      nodeId(project, 'child'),
    );
  });

  it('resolves a backward reference', () => {
    const project = requireProject(
      build('<!ELEMENT child EMPTY>\n<!ELEMENT parent (child)>'),
    );

    expect(occurrences(project, 'parent')).toEqual([['child', 1, 1]]);
  });

  it('supports a self reference without inventing a root', () => {
    const project = requireProject(build('<!ELEMENT recursive (recursive?)>'));

    expect(occurrences(project, 'recursive')).toEqual([['recursive', 0, 1]]);
    expect(project.rootNodeIds).toEqual([]);
  });

  it('supports a simple cycle with zero roots', () => {
    const project = requireProject(build('<!ELEMENT a (b)>\n<!ELEMENT b (a)>'));

    expect(occurrences(project, 'a')).toEqual([['b', 1, 1]]);
    expect(occurrences(project, 'b')).toEqual([['a', 1, 1]]);
    expect(project.rootNodeIds).toEqual([]);
  });

  it('preserves declaration order for multiple roots', () => {
    const project = requireProject(
      build(
        '<!ELEMENT second EMPTY>\n<!ELEMENT first EMPTY>\n<!ELEMENT child EMPTY>',
      ),
    );

    expect(
      project.rootNodeIds.map((id) => getSchemaNode(project, id)?.name),
    ).toEqual(['second', 'first', 'child']);
  });

  it('creates exactly one source-file record and associates every node', () => {
    const project = requireProject(
      build('<!ELEMENT root (child)>\n<!ELEMENT child EMPTY>'),
    );

    expect(project.sourceFiles).toEqual([
      { id: 'source:fixture', filename: 'fixture.dtd' },
    ]);
    expect(
      new Set(project.nodes.map(({ sourceFileId }) => sourceFileId)),
    ).toEqual(new Set(['source:fixture']));
  });
});

describe('expanded book sample equivalence', () => {
  const result = build(expandedBookDtd, {
    projectId: 'parsed:book',
    displayName: 'Parsed book DTD',
    sourceFileId: 'book.dtd',
    sourceFilename: 'book.dtd',
  });
  const project = requireProject(result);
  const sampleElementNodes = bookDtdProject.nodes.filter(
    ({ kind }) => kind === 'dtdElement',
  );

  it('matches the product sample element names, kinds, and source identity', () => {
    expect(project.nodes.map(({ name }) => name)).toEqual(
      sampleElementNodes.map(({ name }) => name),
    );
    expect(project.nodes.map(({ kind }) => kind)).toEqual(
      sampleElementNodes.map(({ kind }) => kind),
    );
    expect(project.sourceFiles).toEqual([
      { id: 'book.dtd', filename: 'book.dtd' },
    ]);
  });

  it('preserves every exact declaration while matching sample expressions', () => {
    for (const sampleNode of sampleElementNodes) {
      const builtNode = project.nodes.find(
        ({ name }) => name === sampleNode.name,
      );
      expect(builtNode?.compactDeclaration).toBe(
        expandedBookDtd
          .split('\n')
          .find((line) => line.startsWith(`<!ELEMENT ${sampleNode.name} `)),
      );
      expect(builtNode?.compactDeclaration).toContain(
        sampleNode.compactDeclaration!,
      );
    }
  });

  it('uses deterministic builder IDs without requiring legacy sample IDs', () => {
    expect(nodeId(project, 'book')).toBe('dtd:element:book');
    expect(nodeId(project, 'front.matter')).toBe('dtd:element:front.matter');
    expect(nodeId(project, 'book')).toBe(bookDtdNodeIds.book);
  });

  it('matches every ordered structural destination and occurrence', () => {
    for (const sampleNode of sampleElementNodes) {
      const expected = getContainedChildren(bookDtdProject, sampleNode.id).map(
        ({ edge, node }) => ({
          name: node.name,
          occurrence: edge.occurrence,
        }),
      );
      const actual = getContainedChildren(
        project,
        nodeId(project, sampleNode.name),
      ).map(({ edge, node }) => ({
        name: node.name,
        occurrence: edge.occurrence,
      }));
      expect(actual).toEqual(expected);
    }
  });

  it('reuses one title node with three incoming relationships', () => {
    const titleNodes = project.nodes.filter(({ name }) => name === 'title');

    expect(titleNodes).toHaveLength(1);
    expect(
      getIncomingStructuralRelationships(project, titleNodes[0]!.id),
    ).toHaveLength(3);
  });

  it('identifies book as the root and passes graph validation', () => {
    expect(
      project.rootNodeIds.map((id) => getSchemaNode(project, id)?.name),
    ).toEqual(['book']);
    expect(validateSchemaProject(project)).toEqual([]);
  });
});

describe('duplicate and unresolved declarations', () => {
  it('reports a duplicate with both conflicting ranges and no project', () => {
    const result = build(
      '<!ELEMENT figure EMPTY>\n<!ELEMENT figure (#PCDATA)>',
    );
    const duplicate = result.diagnostics[0];

    expect(result.project).toBeUndefined();
    expect(duplicate?.code).toBe('duplicate-element-declaration');
    expect(duplicate?.message).toContain('"figure"');
    expect(duplicate?.range?.start.line).toBe(2);
    expect(duplicate?.relatedRange?.start.line).toBe(1);
  });

  it('reports every declaration after the first duplicate', () => {
    const result = build(
      [
        '<!ELEMENT a EMPTY>',
        '<!ELEMENT a ANY>',
        '<!ELEMENT a (#PCDATA)>',
        '<!ELEMENT b EMPTY>',
        '<!ELEMENT b ANY>',
      ].join('\n'),
    );

    expect(
      result.diagnostics.filter(
        ({ code }) => code === 'duplicate-element-declaration',
      ),
    ).toHaveLength(3);
  });

  it('reports one unresolved reference with a useful range', () => {
    const result = build('<!ELEMENT chapter (figure)>');
    const unresolved = result.diagnostics[0];

    expect(result.project).toBeUndefined();
    expect(unresolved?.code).toBe('unresolved-element-reference');
    expect(unresolved?.message).toBe(
      'Element "figure" is referenced by "chapter" but has no declaration in this DTD source.',
    );
    expect(unresolved?.range).toBeDefined();
  });

  it('reports multiple unresolved references independently', () => {
    const result = build('<!ELEMENT chapter (figure, note, figure)>');

    expect(
      result.diagnostics.filter(
        ({ code }) => code === 'unresolved-element-reference',
      ),
    ).toHaveLength(3);
  });

  it('does not treat a later declaration as unresolved', () => {
    const result = build(
      '<!ELEMENT chapter (figure)>\n<!ELEMENT figure EMPTY>',
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.project?.nodes).toHaveLength(2);
  });

  it('returns neither placeholders nor a partial successful project', () => {
    const result = build(
      '<!ELEMENT chapter (known, missing)>\n<!ELEMENT known EMPTY>',
    );

    expect(result.project).toBeUndefined();
    expect(result.contentKindsByNodeId).toEqual({});
  });

  it('never treats #PCDATA as an element reference', () => {
    const result = build('<!ELEMENT para (#PCDATA)>');

    expect(result.diagnostics).toEqual([]);
    expect(result.project?.edges).toEqual([]);
  });
});

describe('effective occurrence propagation', () => {
  it.each([
    [
      '(a, b?)',
      ['a', 'b'],
      [
        ['a', 1, 1],
        ['b', 0, 1],
      ],
    ],
    [
      '(a, b)+',
      ['a', 'b'],
      [
        ['a', 1, 'unbounded'],
        ['b', 1, 'unbounded'],
      ],
    ],
    [
      '(a | b)',
      ['a', 'b'],
      [
        ['a', 0, 1],
        ['b', 0, 1],
      ],
    ],
    [
      '(a | b)+',
      ['a', 'b'],
      [
        ['a', 0, 'unbounded'],
        ['b', 0, 'unbounded'],
      ],
    ],
    [
      '((a, b) | c)?',
      ['a', 'b', 'c'],
      [
        ['a', 0, 1],
        ['b', 0, 1],
        ['c', 0, 1],
      ],
    ],
    [
      '(a, (b | c)+)',
      ['a', 'b', 'c'],
      [
        ['a', 1, 1],
        ['b', 0, 'unbounded'],
        ['c', 0, 'unbounded'],
      ],
    ],
  ] as const)(
    'computes required bounds for %s',
    (expression, children, expected) => {
      expect(occurrences(projectForExpression(expression, children))).toEqual(
        expected,
      );
    },
  );

  it('computes mixed-content named-alternative bounds', () => {
    const project = projectForExpression('(#PCDATA | em | strong)*', [
      'em',
      'strong',
    ]);

    expect(occurrences(project)).toEqual([
      ['em', 0, 'unbounded'],
      ['strong', 0, 'unbounded'],
    ]);
  });

  it('propagates nested optional sequences', () => {
    expect(occurrences(projectForExpression('((a, b)?)?', ['a', 'b']))).toEqual(
      [
        ['a', 0, 1],
        ['b', 0, 1],
      ],
    );
  });

  it('propagates nested repeated choices', () => {
    expect(
      occurrences(projectForExpression('((a | b)+, c)', ['a', 'b', 'c'])),
    ).toEqual([
      ['a', 0, 'unbounded'],
      ['b', 0, 'unbounded'],
      ['c', 1, 1],
    ]);
  });

  it('keeps repeated references as distinct ordered edges', () => {
    const project = projectForExpression('(a, a?, a+)', ['a']);
    const edges = outgoing(project, 'x');

    expect(occurrences(project)).toEqual([
      ['a', 1, 1],
      ['a', 0, 1],
      ['a', 1, 'unbounded'],
    ]);
    expect(new Set(edges.map(({ id }) => id)).size).toBe(3);
    expect(edges.map(({ order }) => order)).toEqual([0, 1, 2]);
  });

  it('preserves unbounded multiplication explicitly', () => {
    expect(occurrences(projectForExpression('((a+)+)+', ['a']))).toEqual([
      ['a', 1, 'unbounded'],
    ]);
  });

  it('combines a local marker with an enclosing group marker', () => {
    expect(occurrences(projectForExpression('(a?)+', ['a']))).toEqual([
      ['a', 0, 'unbounded'],
    ]);
  });

  it('flattens nested groups depth-first and left-to-right', () => {
    const project = projectForExpression('((a, b?) | (c+, d*))', [
      'a',
      'b',
      'c',
      'd',
    ]);

    expect(occurrences(project).map(([name]) => name)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });
});

describe('content-kind metadata', () => {
  it('distinguishes every normalized DTD content form without AST objects', () => {
    const source = [
      '<!ELEMENT empty EMPTY>',
      '<!ELEMENT any ANY>',
      '<!ELEMENT text (#PCDATA)>',
      '<!ELEMENT mixed (#PCDATA | text)*>',
      '<!ELEMENT elements (empty)>',
    ].join('\n');
    const result = build(source);
    const project = requireProject(result);
    const kindsByName: Record<string, string | undefined> = {};
    for (const { id, name } of project.nodes) {
      kindsByName[name] = result.contentKindsByNodeId[id];
    }

    expect(kindsByName).toEqual({
      empty: 'empty',
      any: 'any',
      text: 'text',
      mixed: 'mixed',
      elements: 'elementOnly',
    });
  });
});

describe('deterministic IDs', () => {
  it('creates stable punctuation-safe, collision-free node IDs', () => {
    const project = requireProject(
      build(
        [
          '<!ELEMENT root (a.b, a-b, a_b, a:b)>',
          '<!ELEMENT a.b EMPTY>',
          '<!ELEMENT a-b EMPTY>',
          '<!ELEMENT a_b EMPTY>',
          '<!ELEMENT a:b EMPTY>',
        ].join('\n'),
      ),
    );
    const ids = ['a.b', 'a-b', 'a_b', 'a:b'].map((name) =>
      nodeId(project, name),
    );

    expect(new Set(ids).size).toBe(4);
    expect(ids).toEqual([
      'dtd:element:a.b',
      'dtd:element:a-b',
      'dtd:element:a_b',
      'dtd:element:a%3Ab',
    ]);
  });

  it('produces deeply equal node and edge IDs across repeated builds', () => {
    const source = '<!ELEMENT root (child, child?)>\n<!ELEMENT child EMPTY>';
    const first = requireProject(build(source));
    const second = requireProject(build(source));

    expect(first.nodes.map(({ id }) => id)).toEqual(
      second.nodes.map(({ id }) => id),
    );
    expect(first.edges.map(({ id }) => id)).toEqual(
      second.edges.map(({ id }) => id),
    );
  });

  it('keeps node IDs stable when declarations are reordered', () => {
    const first = requireProject(build('<!ELEMENT a (b)>\n<!ELEMENT b EMPTY>'));
    const second = requireProject(
      build('<!ELEMENT b EMPTY>\n<!ELEMENT a (b)>'),
    );

    expect(nodeId(first, 'a')).toBe(nodeId(second, 'a'));
    expect(nodeId(first, 'b')).toBe(nodeId(second, 'b'));
  });
});

describe('source text and ranges', () => {
  it('preserves the exact exclusive declaration slice', () => {
    const source =
      '<!-- before -->\n  <!ELEMENT book (chapter+)>\n<!-- after -->\n<!ELEMENT chapter EMPTY>';
    const project = requireProject(build(source));

    expect(
      project.nodes.find(({ name }) => name === 'book')?.compactDeclaration,
    ).toBe('<!ELEMENT book (chapter+)>');
  });

  it('preserves an exact multiline declaration', () => {
    const declaration = '<!ELEMENT book\n  (chapter,\n   appendix?)>';
    const project = requireProject(
      build(
        `${declaration}\n<!ELEMENT chapter EMPTY>\n<!ELEMENT appendix EMPTY>`,
      ),
    );

    expect(
      project.nodes.find(({ name }) => name === 'book')?.compactDeclaration,
    ).toBe(declaration);
  });

  it('preserves CRLF declaration text', () => {
    const declaration = '<!ELEMENT book\r\n  (chapter)>';
    const project = requireProject(
      build(`${declaration}\r\n<!ELEMENT chapter EMPTY>`),
    );

    expect(
      project.nodes.find(({ name }) => name === 'book')?.compactDeclaration,
    ).toBe(declaration);
  });

  it('reports an invalid out-of-range AST range', () => {
    const source = '<!ELEMENT book EMPTY>';
    const declaration = parse(source)[0]!;
    const invalidDeclaration: DtdElementDeclarationAst = {
      ...declaration,
      rawDeclarationRange: {
        ...declaration.rawDeclarationRange,
        end: {
          ...declaration.rawDeclarationRange.end,
          offset: source.length + 1,
        },
      },
    };
    const result = buildDtdSchemaProject(
      [invalidDeclaration],
      source,
      defaultOptions,
    );

    expect(result.project).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalid-source-range',
        elementName: 'book',
        sourceId: 'source:fixture',
      }),
    ]);
  });

  it('preserves supplied project, display, source ID, and filename values', () => {
    const options = {
      projectId: 'project:catalog',
      displayName: 'Catalog declarations',
      sourceFileId: 'source:catalog',
      sourceFilename: 'schemas/catalog.dtd',
    };
    const project = requireProject(build('<!ELEMENT catalog EMPTY>', options));

    expect(project.id).toBe(options.projectId);
    expect(project.displayName).toBe(options.displayName);
    expect(project.sourceFiles).toEqual([
      { id: options.sourceFileId, filename: options.sourceFilename },
    ]);
    expect(project.nodes[0]?.sourceFileId).toBe(options.sourceFileId);
  });
});

describe('build diagnostics and project validation', () => {
  it.each([
    'projectId',
    'displayName',
    'sourceFileId',
    'sourceFilename',
  ] as const)('rejects an empty or whitespace-only %s', (optionName) => {
    const result = buildDtdSchemaProject(
      parse('<!ELEMENT item EMPTY>'),
      '<!ELEMENT item EMPTY>',
      { ...defaultOptions, [optionName]: '   ' },
    );

    expect(result.project).toBeUndefined();
    expect(result.diagnostics[0]).toEqual(
      expect.objectContaining({
        code: 'invalid-build-option',
        message: expect.stringContaining(`"${optionName}"`),
      }),
    );
  });

  it('publishes every required stable diagnostic code', () => {
    expect(dtdBuildDiagnosticCodes).toEqual([
      'invalid-build-option',
      'duplicate-element-declaration',
      'unresolved-element-reference',
      'invalid-source-range',
      'id-collision',
      'project-validation-failed',
      'multiple-id-attributes',
      'invalid-id-attribute-default',
      'attribute-default-not-in-allowed-values',
    ]);
  });

  it('keeps repeated same-range references collision-free by source order', () => {
    const source = '<!ELEMENT root (child, child)>\n<!ELEMENT child EMPTY>';
    const declarations = parse(source);
    const root = declarations[0]!;
    expect(root.contentModel.kind).toBe('group');
    const group = root.contentModel as DtdGroupAst;
    const first = group.members[0]!;
    const second = group.members[1]!;
    expect(first.kind).toBe('nameReference');
    expect(second.kind).toBe('nameReference');

    const malformedRoot: DtdElementDeclarationAst = {
      ...root,
      contentModel: {
        ...group,
        members: [first, { ...second, range: first.range }],
      },
    };
    const result = buildDtdSchemaProject(
      [malformedRoot, declarations[1]!],
      source,
      defaultOptions,
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.project?.edges).toHaveLength(2);
    expect(new Set(result.project?.edges.map(({ id }) => id))).toHaveProperty(
      'size',
      2,
    );
  });
});

describe('determinism, serialization, immutability, and isolation', () => {
  it('produces deeply equal repeated results', () => {
    const source =
      '<!ELEMENT root ((a, b?) | c+)>\n<!ELEMENT a EMPTY>\n<!ELEMENT b EMPTY>\n<!ELEMENT c EMPTY>';

    expect(build(source)).toEqual(build(source));
  });

  it('round-trips through JSON without functions, Maps, Sets, or cycles', () => {
    const result = build('<!ELEMENT root (child)>\n<!ELEMENT child EMPTY>');
    const serialized = JSON.stringify(result);

    expect(JSON.parse(serialized)).toEqual(result);
    expect(serialized).toContain('"contentKindsByNodeId"');
  });

  it('does not mutate AST declarations or source text', () => {
    const source = '<!ELEMENT root (child?)>\n<!ELEMENT child EMPTY>';
    const declarations = parse(source);
    const astBefore = JSON.stringify(declarations);
    const sourceBefore = `${source}`;

    buildDtdSchemaProject(declarations, source, defaultOptions);

    expect(JSON.stringify(declarations)).toBe(astBefore);
    expect(source).toBe(sourceBefore);
  });

  it('stores no parser AST objects in nodes or edges', () => {
    const result = build('<!ELEMENT root (child)>\n<!ELEMENT child EMPTY>');
    const project = requireProject(result);

    for (const node of project.nodes) {
      expect(node).not.toHaveProperty('contentModel');
      expect(node).not.toHaveProperty('range');
      expect(node).not.toHaveProperty('rawDeclarationRange');
    }
    for (const edge of project.edges) {
      expect(edge).not.toHaveProperty('reference');
      expect(edge).not.toHaveProperty('range');
    }
  });

  it('imports no Svelte, UI, stores, DOM, or browser modules', () => {
    for (const source of [builderSource, buildDiagnosticsSource]) {
      expect(source).not.toMatch(/from\s+['"][^'"]*svelte/);
      expect(source).not.toMatch(/from\s+['"][^'"]*(?:ui|stores)\//);
      expect(source).not.toMatch(
        /\b(?:window|document|navigator|HTMLElement|FileReader)\b/,
      );
    }
  });

  it('keeps the parser-produced application sample fully sourced', () => {
    expect(bookDtdProject.sourceFiles).toEqual([
      { id: 'sample.book.dtd', filename: 'sample.book.dtd' },
    ]);
    expect(bookDtdProject.id).toBe('sample:book-dtd');
  });
});
