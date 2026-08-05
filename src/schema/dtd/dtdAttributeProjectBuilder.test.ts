import { describe, expect, it } from 'vitest';
import {
  getContainedChildren,
  getIncomingStructuralRelationships,
  getNodesByKind,
  getOutgoingEdges,
  validateSchemaProject,
} from '../model';
import builderSource from './dtdProjectBuilder.ts?raw';
import {
  buildDtdProjectFromDeclarations,
  parseDtdDeclarations,
  type DtdNormalizedAttributeDefinition,
  type DtdProjectBuildResult,
} from './index';

const options = {
  projectId: 'attribute-project',
  displayName: 'attributes.dtd',
  sourceFileId: 'source:attributes',
  sourceFilename: 'attributes.dtd',
} as const;

function build(source: string): DtdProjectBuildResult {
  const parsed = parseDtdDeclarations(source, options.sourceFileId);
  expect(parsed.diagnostics).toEqual([]);
  return buildDtdProjectFromDeclarations(parsed.declarations, source, options);
}

function successfulBuild(source: string): DtdProjectBuildResult & {
  readonly project: NonNullable<DtdProjectBuildResult['project']>;
} {
  const result = build(source);
  expect(result.diagnostics).toEqual([]);
  expect(result.project).toBeDefined();
  return result as DtdProjectBuildResult & {
    readonly project: NonNullable<DtdProjectBuildResult['project']>;
  };
}

function attributes(
  result: DtdProjectBuildResult,
): readonly DtdNormalizedAttributeDefinition[] {
  return Object.values(result.dtdAttributesByNodeId).sort(
    (left, right) => left.order - right.order,
  );
}

describe('unified DTD attribute project building', () => {
  it('builds one attribute node and nonstructural use edge', () => {
    const result = successfulBuild(`
      <!ELEMENT book (#PCDATA)>
      <!ATTLIST book id ID #REQUIRED>
    `);
    const element = getNodesByKind(result.project, 'dtdElement')[0]!;
    const attribute = getNodesByKind(result.project, 'dtdAttribute')[0]!;

    expect(attribute).toMatchObject({
      id: 'dtd:attribute:book:id',
      kind: 'dtdAttribute',
      name: 'id',
      sourceFileId: options.sourceFileId,
    });
    expect(getOutgoingEdges(result.project, element.id)).toEqual([
      expect.objectContaining({
        kind: 'usesAttribute',
        sourceNodeId: element.id,
        targetNodeId: attribute.id,
        order: 0,
      }),
    ]);
    expect(getContainedChildren(result.project, element.id)).toEqual([]);
    expect(
      getIncomingStructuralRelationships(result.project, attribute.id),
    ).toEqual([]);
  });

  it('preserves multiple attributes in source order', () => {
    const result = successfulBuild(`
      <!ELEMENT book (#PCDATA)>
      <!ATTLIST book
        lang CDATA "en"
        id ID #REQUIRED
        status (draft | final) "draft">
    `);

    expect(
      attributes(result).map(({ name, order }) => ({ name, order })),
    ).toEqual([
      { name: 'lang', order: 0 },
      { name: 'id', order: 1 },
      { name: 'status', order: 2 },
    ]);
  });

  it('accepts an empty ATTLIST without adding nodes or edges', () => {
    const result = successfulBuild(`
      <!ELEMENT book EMPTY>
      <!ATTLIST book>
    `);

    expect(result.dtdAttributesByNodeId).toEqual({});
    expect(result.project.nodes).toHaveLength(1);
    expect(result.project.edges).toEqual([]);
  });

  it.each([
    `<!ATTLIST book id ID #IMPLIED>
     <!ELEMENT book EMPTY>`,
    `<!ELEMENT book EMPTY>
     <!ATTLIST book id ID #IMPLIED>`,
  ])('resolves ATTLIST owners independent of declaration order', (source) => {
    const result = successfulBuild(source);

    expect(attributes(result).map(({ name }) => name)).toEqual(['id']);
  });

  it('merges multiple ATTLIST blocks in combined source order', () => {
    const result = successfulBuild(`
      <!ATTLIST book first CDATA #IMPLIED>
      <!ELEMENT book EMPTY>
      <!ATTLIST book second NMTOKEN #REQUIRED>
      <!ATTLIST book third (a | b) "a">
    `);

    expect(
      attributes(result).map(({ name, order }) => ({ name, order })),
    ).toEqual([
      { name: 'first', order: 0 },
      { name: 'second', order: 1 },
      { name: 'third', order: 2 },
    ]);
  });

  it('normalizes every tokenized type and default kind', () => {
    const result = successfulBuild(`
      <!ELEMENT item EMPTY>
      <!ATTLIST item
        cdata CDATA #IMPLIED
        id ID #REQUIRED
        idref IDREF "target"
        idrefs IDREFS "a b"
        entity ENTITY #IMPLIED
        entities ENTITIES #REQUIRED
        token NMTOKEN #FIXED 'one'
        tokens NMTOKENS "one two">
    `);

    expect(
      attributes(result).map(({ name, type, defaultDeclaration }) => ({
        name,
        type,
        defaultDeclaration,
      })),
    ).toEqual([
      {
        name: 'cdata',
        type: { kind: 'tokenized', name: 'CDATA' },
        defaultDeclaration: { kind: 'implied' },
      },
      {
        name: 'id',
        type: { kind: 'tokenized', name: 'ID' },
        defaultDeclaration: { kind: 'required' },
      },
      {
        name: 'idref',
        type: { kind: 'tokenized', name: 'IDREF' },
        defaultDeclaration: {
          kind: 'value',
          literal: { value: 'target', quote: 'double' },
        },
      },
      {
        name: 'idrefs',
        type: { kind: 'tokenized', name: 'IDREFS' },
        defaultDeclaration: {
          kind: 'value',
          literal: { value: 'a b', quote: 'double' },
        },
      },
      {
        name: 'entity',
        type: { kind: 'tokenized', name: 'ENTITY' },
        defaultDeclaration: { kind: 'implied' },
      },
      {
        name: 'entities',
        type: { kind: 'tokenized', name: 'ENTITIES' },
        defaultDeclaration: { kind: 'required' },
      },
      {
        name: 'token',
        type: { kind: 'tokenized', name: 'NMTOKEN' },
        defaultDeclaration: {
          kind: 'fixed',
          literal: { value: 'one', quote: 'single' },
        },
      },
      {
        name: 'tokens',
        type: { kind: 'tokenized', name: 'NMTOKENS' },
        defaultDeclaration: {
          kind: 'value',
          literal: { value: 'one two', quote: 'double' },
        },
      },
    ]);
  });

  it('normalizes enumeration and NOTATION values in order', () => {
    const result = successfulBuild(`
      <!ELEMENT item EMPTY>
      <!ATTLIST item
        status (draft | review | final) #FIXED "review"
        format NOTATION (gif | jpg | png) "gif">
    `);

    expect(attributes(result).map(({ type }) => type)).toEqual([
      { kind: 'enumeration', values: ['draft', 'review', 'final'] },
      { kind: 'notation', values: ['gif', 'jpg', 'png'] },
    ]);
  });

  it('preserves exact definition slices, ranges, literal whitespace, and entity text', () => {
    const source = `<!ELEMENT book EMPTY>
<!ATTLIST book
  label CDATA "line one
  > &entity; line two">`;
    const result = successfulBuild(source);
    const attribute = attributes(result)[0]!;

    expect(attribute.declarationText).toBe(
      `label CDATA "line one
  > &entity; line two"`,
    );
    expect(
      source.slice(
        attribute.sourceRange.start.offset,
        attribute.sourceRange.end.offset,
      ),
    ).toBe(attribute.declarationText);
    expect(attribute.defaultDeclaration).toEqual({
      kind: 'value',
      literal: {
        value: `line one
  > &entity; line two`,
        quote: 'double',
      },
    });
    expect(attribute.sourceRange.sourceId).toBe(options.sourceFileId);
  });

  it('allows the same attribute name on different elements', () => {
    const result = successfulBuild(`
      <!ELEMENT book EMPTY>
      <!ELEMENT chapter EMPTY>
      <!ATTLIST book id ID #IMPLIED>
      <!ATTLIST chapter id ID #REQUIRED>
    `);

    expect(
      attributes(result).map(({ attributeNodeId }) => attributeNodeId),
    ).toEqual(['dtd:attribute:book:id', 'dtd:attribute:chapter:id']);
  });

  it('keeps attribute nodes out of project roots and structural relationships', () => {
    const result = successfulBuild(`
      <!ELEMENT book (chapter)>
      <!ELEMENT chapter EMPTY>
      <!ATTLIST book id ID #REQUIRED>
      <!ATTLIST chapter lang CDATA #IMPLIED>
    `);

    expect(result.project.rootNodeIds).toEqual(['dtd:element:book']);
    expect(getContainedChildren(result.project, 'dtd:element:book')).toEqual([
      expect.objectContaining({
        node: expect.objectContaining({ id: 'dtd:element:chapter' }),
      }),
    ]);
    expect(
      getIncomingStructuralRelationships(
        result.project,
        'dtd:element:chapter',
      ).map(({ node }) => node.id),
    ).toEqual(['dtd:element:book']);
  });

  it('uses punctuation-safe owner/name IDs that remain stable when declarations reorder', () => {
    const first = successfulBuild(`
      <!ELEMENT a.b EMPTY>
      <!ELEMENT a-b EMPTY>
      <!ATTLIST a.b xml:lang CDATA #IMPLIED>
      <!ATTLIST a-b xml.lang CDATA #IMPLIED>
    `);
    const second = successfulBuild(`
      <!ELEMENT a-b EMPTY>
      <!ELEMENT a.b EMPTY>
      <!ATTLIST a-b xml.lang CDATA #IMPLIED>
      <!ATTLIST a.b xml:lang CDATA #IMPLIED>
    `);

    expect(
      attributes(first)
        .map(({ attributeNodeId }) => attributeNodeId)
        .sort(),
    ).toEqual(
      attributes(second)
        .map(({ attributeNodeId }) => attributeNodeId)
        .sort(),
    );
    expect(
      new Set(attributes(first).map(({ attributeNodeId }) => attributeNodeId))
        .size,
    ).toBe(2);
  });

  it('passes normalized project validation', () => {
    const result = successfulBuild(`
      <!ELEMENT book EMPTY>
      <!ATTLIST book id ID #REQUIRED lang CDATA "en">
    `);

    expect(validateSchemaProject(result.project)).toEqual([]);
  });
});

describe('bounded DTD attribute semantic validation', () => {
  it('builds an undeclared ATTLIST owner as an explicit attribute-list node', () => {
    const result = build('<!ATTLIST book id ID #IMPLIED>');

    expect(result.diagnostics).toEqual([]);
    expect(result.project?.rootNodeIds).toEqual([]);
    expect(result.project?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'dtd:attribute-list:book',
          kind: 'dtdAttributeList',
          name: 'book',
        }),
        expect.objectContaining({
          id: 'dtd:attribute:book:id',
          kind: 'dtdAttribute',
          name: 'id',
        }),
      ]),
    );
    expect(
      result.dtdAttributesByNodeId['dtd:attribute:book:id']?.ownerElementNodeId,
    ).toBe('dtd:attribute-list:book');
  });

  it('keeps the first duplicate attribute declaration effective', () => {
    const result = build(`
      <!ELEMENT book EMPTY>
      <!ATTLIST book id ID #IMPLIED>
      <!ATTLIST book id CDATA #IMPLIED>
    `);

    expect(result.diagnostics).toEqual([]);
    expect(result.project).toBeDefined();
    expect(Object.keys(result.dtdAttributesByNodeId)).toEqual([
      'dtd:attribute:book:id',
    ]);
    expect(result.dtdAttributesByNodeId['dtd:attribute:book:id']?.type).toEqual(
      { kind: 'tokenized', name: 'ID' },
    );
    expect(
      result.sourceMarkupByNodeId['dtd:element:book']?.fragments
        .map(({ text }) => text)
        .join('\n'),
    ).toContain('<!ATTLIST book id CDATA #IMPLIED>');
  });

  it('rejects multiple ID attributes for one element', () => {
    const result = build(`
      <!ELEMENT book EMPTY>
      <!ATTLIST book first ID #IMPLIED second ID #REQUIRED>
    `);

    expect(result.project).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'multiple-id-attributes',
    );
  });

  it.each([
    '<!ATTLIST book id ID "book-1">',
    '<!ATTLIST book id ID #FIXED "book-1">',
  ])('rejects an ID literal or fixed default', (attlist) => {
    const result = build(`<!ELEMENT book EMPTY>${attlist}`);

    expect(result.project).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'invalid-id-attribute-default',
    );
  });

  it.each(['#REQUIRED', '#IMPLIED'])(
    'accepts ID default %s',
    (defaultSyntax) => {
      const result = successfulBuild(`
        <!ELEMENT book EMPTY>
        <!ATTLIST book id ID ${defaultSyntax}>
      `);

      expect(attributes(result)).toHaveLength(1);
    },
  );

  it.each([
    ['(draft | final)', '"draft"'],
    ['(draft | final)', '#FIXED "final"'],
    ['NOTATION (gif | png)', '"gif"'],
    ['NOTATION (gif | png)', '#FIXED "png"'],
  ])('accepts an allowed default for %s', (type, defaultSyntax) => {
    const result = successfulBuild(`
      <!ELEMENT item EMPTY>
      <!ATTLIST item value ${type} ${defaultSyntax}>
    `);

    expect(attributes(result)).toHaveLength(1);
  });

  it.each([
    ['(draft | final)', '"Draft"'],
    ['(draft | final)', '#FIXED "archived"'],
    ['NOTATION (gif | png)', '"jpg"'],
    ['NOTATION (gif | png)', '#FIXED "GIF"'],
  ])('rejects a nonmatching default for %s', (type, defaultSyntax) => {
    const result = build(`
      <!ELEMENT item EMPTY>
      <!ATTLIST item value ${type} ${defaultSyntax}>
    `);

    expect(result.project).toBeUndefined();
    expect(result.dtdAttributesByNodeId).toEqual({});
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'attribute-default-not-in-allowed-values',
    );
  });
});

describe('attribute normalization determinism and isolation', () => {
  it('produces deeply equal serializable output without retaining AST objects', () => {
    const source = `
      <!ELEMENT book EMPTY>
      <!ATTLIST book status (draft | final) "draft">
    `;
    const first = successfulBuild(source);
    const second = successfulBuild(source);
    const serialized = JSON.stringify(first);

    expect(first).toEqual(second);
    expect(JSON.parse(serialized)).toEqual(first);
    expect(serialized).not.toContain('attributeDefinition');
    expect(serialized).not.toContain('attributeListDeclaration');
  });

  it('does not mutate parser declarations or source text', () => {
    const source = '<!ELEMENT book EMPTY><!ATTLIST book id ID #REQUIRED>';
    const parsed = parseDtdDeclarations(source, options.sourceFileId);
    const snapshot = JSON.stringify(parsed);

    buildDtdProjectFromDeclarations(parsed.declarations, source, options);

    expect(JSON.stringify(parsed)).toBe(snapshot);
    expect(source).toBe('<!ELEMENT book EMPTY><!ATTLIST book id ID #REQUIRED>');
  });

  it('keeps the unified builder free of UI, store, DOM, browser, and any-type coupling', () => {
    expect(builderSource).not.toMatch(/from\s+['"][^'"]*(?:ui|stores)\//);
    expect(builderSource).not.toMatch(/\b(?:window|document|navigator|File)\b/);
    expect(builderSource).not.toMatch(/(?:\bas\s+any\b|:\s*any\b|<any>)/);
  });
});
