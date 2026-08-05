import { describe, expect, it } from 'vitest';
import astSource from './dtdAst.ts?raw';
import diagnosticsSource from './dtdDiagnostics.ts?raw';
import lexerSource from './dtdLexer.ts?raw';
import parserSource from './dtdParser.ts?raw';
import {
  dtdAsciiNameScannerLimitation,
  dtdParseDiagnosticCodes,
  parseDtdElementDeclarations,
  type DtdElementDeclarationAst,
  type DtdGroupAst,
} from './index';

function parseOne(source: string): DtdElementDeclarationAst {
  const result = parseDtdElementDeclarations(source);
  expect(result.diagnostics).toEqual([]);
  expect(result.declarations).toHaveLength(1);
  const declaration = result.declarations[0];
  expect(declaration).toBeDefined();
  return declaration!;
}

function expectGroup(declaration: DtdElementDeclarationAst): DtdGroupAst {
  expect(declaration.contentModel.kind).toBe('group');
  return declaration.contentModel as DtdGroupAst;
}

function diagnosticCodes(source: string): readonly string[] {
  return parseDtdElementDeclarations(source).diagnostics.map(
    ({ code }) => code,
  );
}

describe('DTD element parser basic declarations', () => {
  it.each([
    ['<!ELEMENT br EMPTY>', 'empty'],
    ['<!ELEMENT container ANY>', 'any'],
    ['<!ELEMENT title (#PCDATA)>', 'parsedCharacterData'],
  ] as const)('parses %s as %s content', (source, expectedKind) => {
    const declaration = parseOne(source);

    expect(declaration.contentModel.kind).toBe(expectedKind);
    expect(declaration.kind).toBe('elementDeclaration');
  });

  it('parses one referenced child as a one-member sequence group', () => {
    const group = expectGroup(parseOne('<!ELEMENT wrapper (child)>'));

    expect(group).toMatchObject({
      kind: 'group',
      compositor: 'sequence',
      occurrence: 'once',
      members: [
        {
          kind: 'nameReference',
          name: 'child',
          occurrence: 'once',
        },
      ],
    });
  });

  it('preserves sequence member order', () => {
    const group = expectGroup(parseOne('<!ELEMENT book (front,title,index)>'));

    expect(group.compositor).toBe('sequence');
    expect(group.members.map((member) => member.kind)).toEqual([
      'nameReference',
      'nameReference',
      'nameReference',
    ]);
    expect(
      group.members.map((member) =>
        member.kind === 'nameReference' ? member.name : '',
      ),
    ).toEqual(['front', 'title', 'index']);
  });

  it('preserves choice member order', () => {
    const group = expectGroup(parseOne('<!ELEMENT option (a | b | c)>'));

    expect(group.compositor).toBe('choice');
    expect(
      group.members.map((member) =>
        member.kind === 'nameReference' ? member.name : '',
      ),
    ).toEqual(['a', 'b', 'c']);
  });

  it('parses nested sequence and choice groups', () => {
    const outer = expectGroup(
      parseOne('<!ELEMENT nested ((a,b?) | (c+,d*))* >'),
    );

    expect(outer.compositor).toBe('choice');
    expect(outer.occurrence).toBe('zeroOrMore');
    expect(outer.members).toHaveLength(2);
    expect(outer.members[0]).toMatchObject({
      kind: 'group',
      compositor: 'sequence',
      occurrence: 'once',
      members: [
        { kind: 'nameReference', name: 'a', occurrence: 'once' },
        { kind: 'nameReference', name: 'b', occurrence: 'optional' },
      ],
    });
    expect(outer.members[1]).toMatchObject({
      kind: 'group',
      compositor: 'sequence',
      occurrence: 'once',
      members: [
        { kind: 'nameReference', name: 'c', occurrence: 'oneOrMore' },
        { kind: 'nameReference', name: 'd', occurrence: 'zeroOrMore' },
      ],
    });
  });

  it.each([
    ['child', 'once'],
    ['child?', 'optional'],
    ['child*', 'zeroOrMore'],
    ['child+', 'oneOrMore'],
  ] as const)(
    'maps member occurrence syntax %s to %s',
    (particle, expectedOccurrence) => {
      const group = expectGroup(parseOne(`<!ELEMENT wrapper (${particle})>`));

      expect(group.members[0]).toMatchObject({
        kind: 'nameReference',
        name: 'child',
        occurrence: expectedOccurrence,
      });
    },
  );

  it.each([
    ['', 'once'],
    ['?', 'optional'],
    ['*', 'zeroOrMore'],
    ['+', 'oneOrMore'],
  ] as const)(
    'maps group occurrence syntax %s to %s',
    (marker, expectedOccurrence) => {
      const group = expectGroup(
        parseOne(`<!ELEMENT wrapper ((a,b)${marker})>`),
      );
      const nested = group.members[0];

      expect(nested).toMatchObject({
        kind: 'group',
        compositor: 'sequence',
        occurrence: expectedOccurrence,
      });
    },
  );

  it.each([
    'book',
    'front.matter',
    'book-content',
    'hf:identity',
    '_title',
    'section_2',
  ])('preserves supported ASCII-subset name %s exactly', (name) => {
    const declaration = parseOne(`<!ELEMENT ${name} EMPTY>`);

    expect(declaration.name).toBe(name);
  });

  it('makes the bounded ASCII name limitation explicit and rejects Unicode names', () => {
    expect(dtdAsciiNameScannerLimitation).toContain('ASCII XML-name subset');
    expect(diagnosticCodes('<!ELEMENT élève EMPTY>')).toContain(
      'invalid-element-name',
    );
  });

  it('does not normalize element-name case', () => {
    expect(parseOne('<!ELEMENT Book EMPTY>').name).toBe('Book');
  });
});

describe('expanded hardcoded sample declarations', () => {
  it.each([
    [
      '<!ELEMENT book (front.matter, book.content, index)>',
      'book',
      ['front.matter', 'book.content', 'index'],
      ['once', 'once', 'once'],
    ],
    [
      '<!ELEMENT front.matter (title.page, preface?)>',
      'front.matter',
      ['title.page', 'preface'],
      ['once', 'optional'],
    ],
    [
      '<!ELEMENT book.content (chapter+)>',
      'book.content',
      ['chapter'],
      ['oneOrMore'],
    ],
    [
      '<!ELEMENT title.page (title, subtitle?, author+)>',
      'title.page',
      ['title', 'subtitle', 'author'],
      ['once', 'optional', 'oneOrMore'],
    ],
    [
      '<!ELEMENT chapter (title, epigraph?, section*, figure*, note*)>',
      'chapter',
      ['title', 'epigraph', 'section', 'figure', 'note'],
      ['once', 'optional', 'zeroOrMore', 'zeroOrMore', 'zeroOrMore'],
    ],
    [
      '<!ELEMENT section (title?, para+)>',
      'section',
      ['title', 'para'],
      ['optional', 'oneOrMore'],
    ],
    [
      '<!ELEMENT index (index.entry+)>',
      'index',
      ['index.entry'],
      ['oneOrMore'],
    ],
  ] as const)(
    'parses the exact sample declaration for %s',
    (source, expectedName, expectedNames, expectedOccurrences) => {
      const declaration = parseOne(source);
      const group = expectGroup(declaration);
      const members = group.members.map((member) => {
        expect(member.kind).toBe('nameReference');
        return member as Extract<typeof member, { kind: 'nameReference' }>;
      });

      expect(declaration.name).toBe(expectedName);
      expect(group.compositor).toBe('sequence');
      expect(members.map(({ name }) => name)).toEqual(expectedNames);
      expect(members.map(({ occurrence }) => occurrence)).toEqual(
        expectedOccurrences,
      );
    },
  );
});

describe('DTD mixed content', () => {
  it('represents (#PCDATA) explicitly', () => {
    const content = parseOne('<!ELEMENT text (#PCDATA)>').contentModel;

    expect(content).toMatchObject({ kind: 'parsedCharacterData' });
  });

  it('parses standard mixed content with ordered alternatives', () => {
    const content = parseOne(
      '<!ELEMENT para (#PCDATA | em | strong)*>',
    ).contentModel;

    expect(content).toMatchObject({
      kind: 'mixed',
      occurrence: 'zeroOrMore',
      namedAlternatives: [
        { kind: 'nameReference', name: 'em', occurrence: 'once' },
        { kind: 'nameReference', name: 'strong', occurrence: 'once' },
      ],
    });
  });

  it('accepts compact mixed-content whitespace variants', () => {
    const declaration = parseOne('<!ELEMENT para(\n#PCDATA|em|strong\n)*>');

    expect(declaration.contentModel.kind).toBe('mixed');
  });

  it.each([
    ['<!ELEMENT para (em | #PCDATA)*>', 'invalid-pcdata-placement'],
    ['<!ELEMENT para ((#PCDATA))>', 'invalid-pcdata-placement'],
    ['<!ELEMENT para (#PCDATA | em)>', 'invalid-mixed-content'],
    ['<!ELEMENT para (#PCDATA, em)*>', 'invalid-mixed-content'],
    ['<!ELEMENT para (#PCDATA || em)*>', 'invalid-mixed-content'],
    ['<!ELEMENT para (#PCDATA | em |)*>', 'invalid-mixed-content'],
    ['<!ELEMENT para (#PCDATA | em?)*>', 'invalid-occurrence'],
    ['<!ELEMENT para (#PCDATA)*>', 'invalid-mixed-content'],
  ] as const)('diagnoses invalid mixed form %s', (source, expectedCode) => {
    const result = parseDtdElementDeclarations(source);

    expect(result.declarations).toEqual([]);
    expect(result.diagnostics.map(({ code }) => code)).toContain(expectedCode);
  });
});

describe('trivia and source locations', () => {
  it.each(['', ' \t\r\n ', '<!-- only trivia -->'])(
    'returns an empty successful result for trivia-only input %j',
    (source) => {
      const result = parseDtdElementDeclarations(source);
      expect(result.declarations).toEqual([]);
      expect(result.diagnostics).toEqual([]);
      expect(result.comments).toHaveLength(source.includes('<!--') ? 1 : 0);
    },
  );

  it('ignores comments between declarations and at lexical boundaries', () => {
    const result = parseDtdElementDeclarations(`
      <!-- root -->
      <!ELEMENT book (chapter+, <!-- inline trivia --> index)>
      <!-- leaf -->
      <!ELEMENT chapter EMPTY>
    `);

    expect(result.diagnostics).toEqual([]);
    expect(result.declarations.map(({ name }) => name)).toEqual([
      'book',
      'chapter',
    ]);
  });

  it.each([
    ['\n', 1],
    ['\r\n', 2],
    ['\r', 1],
  ] as const)(
    'uses consistent one-based locations after %j line endings',
    (lineEnding, expectedStartOffset) => {
      const source = `${lineEnding}<!ELEMENT book EMPTY>`;
      const declaration = parseOne(source);

      expect(declaration.range.start).toEqual({
        offset: expectedStartOffset,
        line: 2,
        column: 1,
      });
      expect(declaration.range.end).toEqual({
        offset: source.length,
        line: 2,
        column: 22,
      });
    },
  );

  it('retains exact multi-line node and declaration ranges', () => {
    const source =
      '<!ELEMENT book\n  (front.matter,\n   book.content,\n   index)>';
    const declaration = parseOne(source);
    const group = expectGroup(declaration);

    expect(declaration.range).toEqual({
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: source.length, line: 4, column: 11 },
    });
    expect(group.range.start).toEqual({
      offset: source.indexOf('('),
      line: 2,
      column: 3,
    });
    expect(group.range.end).toEqual({
      offset: source.indexOf(')') + 1,
      line: 4,
      column: 10,
    });
  });

  it('applies a supplied source ID to declarations, nodes, and diagnostics', () => {
    const valid = parseDtdElementDeclarations(
      '<!ELEMENT book (chapter+)>',
      'book.dtd',
    );
    const invalid = parseDtdElementDeclarations(
      '<!ELEMENT book ()>',
      'broken.dtd',
    );
    const declaration = valid.declarations[0]!;
    const group = declaration.contentModel as DtdGroupAst;

    expect(declaration.range.sourceId).toBe('book.dtd');
    expect(group.range.sourceId).toBe('book.dtd');
    expect(group.members[0]?.range.sourceId).toBe('book.dtd');
    expect(invalid.diagnostics[0]).toMatchObject({
      sourceId: 'broken.dtd',
      range: { sourceId: 'broken.dtd' },
    });
  });

  it('allows exact original declaration recovery from end-exclusive offsets', () => {
    const source =
      '<!-- before -->\n  <!ELEMENT book (chapter+)>\n<!-- after -->';
    const declaration = parseOne(source);
    const { start, end } = declaration.rawDeclarationRange;

    expect(source.slice(start.offset, end.offset)).toBe(
      '<!ELEMENT book (chapter+)>',
    );
  });

  it('reports an unterminated comment with an exact range', () => {
    const source = '<!ELEMENT book EMPTY>\n<!-- unterminated';
    const result = parseDtdElementDeclarations(source, 'comments.dtd');
    const diagnostic = result.diagnostics.find(
      ({ code }) => code === 'unterminated-comment',
    );

    expect(result.declarations.map(({ name }) => name)).toEqual(['book']);
    expect(diagnostic).toMatchObject({
      severity: 'error',
      sourceId: 'comments.dtd',
      range: {
        start: {
          offset: source.indexOf('<!--'),
          line: 2,
          column: 1,
        },
        end: {
          offset: source.length,
          line: 2,
          column: 18,
        },
      },
    });
  });
});

describe('multiple declarations and bounded recovery', () => {
  it('preserves declaration order and trailing trivia', () => {
    const result = parseDtdElementDeclarations(`
      <!ELEMENT book (chapter+)>
      <!ELEMENT chapter (title, para+)>
      <!ELEMENT title (#PCDATA)>
      <!ELEMENT para (#PCDATA | em)*>

    `);

    expect(result.diagnostics).toEqual([]);
    expect(result.declarations.map(({ name }) => name)).toEqual([
      'book',
      'chapter',
      'title',
      'para',
    ]);
  });

  it('preserves duplicate declarations as separate AST entries', () => {
    const result = parseDtdElementDeclarations(`
      <!ELEMENT duplicate EMPTY>
      <!ELEMENT duplicate ANY>
    `);

    expect(result.diagnostics).toEqual([]);
    expect(result.declarations.map(({ name }) => name)).toEqual([
      'duplicate',
      'duplicate',
    ]);
    expect(
      result.declarations.map(({ contentModel }) => contentModel.kind),
    ).toEqual(['empty', 'any']);
  });

  it('preserves valid declarations before and after a malformed declaration', () => {
    const result = parseDtdElementDeclarations(`
      <!ELEMENT before EMPTY>
      <!ELEMENT broken (a,)>
      <!ELEMENT after ANY>
    `);

    expect(result.declarations.map(({ name }) => name)).toEqual([
      'before',
      'after',
    ]);
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'trailing-separator',
    );
  });

  it('recovers at the next declaration when a closing > is missing', () => {
    const result = parseDtdElementDeclarations(`
      <!ELEMENT broken (a)
      <!ELEMENT after EMPTY>
    `);

    expect(result.declarations.map(({ name }) => name)).toEqual(['after']);
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'unterminated-declaration',
    );
  });

  it.each(['ATTLIST', 'ENTITY', 'NOTATION'])(
    'diagnoses and recovers after unsupported %s declarations',
    (declarationType) => {
      const result = parseDtdElementDeclarations(`
        <!${declarationType} unsupported ignored>
        <!ELEMENT after EMPTY>
      `);

      expect(result.declarations.map(({ name }) => name)).toEqual(['after']);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: 'unsupported-declaration',
          severity: 'error',
        }),
      ]);
    },
  );

  it('diagnoses parameter-entity syntax and continues', () => {
    const result = parseDtdElementDeclarations(`
      %common;
      <!ELEMENT after EMPTY>
    `);

    expect(result.declarations.map(({ name }) => name)).toEqual(['after']);
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'unsupported-syntax',
    );
  });

  it('recovers unsupported declarations past quoted > characters', () => {
    const result = parseDtdElementDeclarations(`
      <!ATTLIST book label CDATA "greater > value">
      <!ELEMENT after EMPTY>
    `);

    expect(result.declarations.map(({ name }) => name)).toEqual(['after']);
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      'unsupported-declaration',
    ]);
  });

  it('skips a complete unsupported conditional section before continuing', () => {
    const result = parseDtdElementDeclarations(`
      <![IGNORE[
        <!ELEMENT hidden EMPTY>
      ]]>
      <!ELEMENT visible EMPTY>
    `);

    expect(result.declarations.map(({ name }) => name)).toEqual(['visible']);
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      'unsupported-declaration',
    ]);
  });
});

describe('structured parser diagnostics', () => {
  it.each([
    ['unexpected-token', '<!ELEMENT book (a b)>'],
    ['unexpected-end-of-input', '<!ELEMENT book (a'],
    ['missing-element-name', '<!ELEMENT>'],
    ['invalid-element-name', '<!ELEMENT 1book EMPTY>'],
    ['missing-content-model', '<!ELEMENT book>'],
    ['unbalanced-parenthesis', '<!ELEMENT book ((a,b)>'],
    ['mixed-compositor', '<!ELEMENT book (a,b|c)>'],
    ['empty-group', '<!ELEMENT book ()>'],
    ['trailing-separator', '<!ELEMENT book (a,)>'],
    ['invalid-occurrence', '<!ELEMENT book (a?*)>'],
    ['invalid-pcdata-placement', '<!ELEMENT book (a|#PCDATA)*>'],
    ['invalid-mixed-content', '<!ELEMENT book (#PCDATA|em)>'],
    ['unterminated-comment', '<!-- unterminated'],
    ['unterminated-declaration', '<!ELEMENT book EMPTY'],
    ['unsupported-declaration', '<!ATTLIST book id ID #IMPLIED>'],
    ['unsupported-syntax', '%common;'],
  ] as const)('returns stable %s diagnostics', (expectedCode, source) => {
    const result = parseDtdElementDeclarations(source, 'diagnostics.dtd');
    const diagnostic = result.diagnostics.find(
      ({ code }) => code === expectedCode,
    );

    expect(diagnostic).toBeDefined();
    expect(diagnostic).toMatchObject({
      code: expectedCode,
      severity: 'error',
      sourceId: 'diagnostics.dtd',
    });
    expect(diagnostic?.message).toMatch(/near line \d+, column \d+\.$/);
    expect(diagnostic?.range.end.offset).toBeGreaterThanOrEqual(
      diagnostic?.range.start.offset ?? 0,
    );
  });

  it('exports every required stable diagnostic code', () => {
    expect(dtdParseDiagnosticCodes).toEqual([
      'unexpected-token',
      'unexpected-end-of-input',
      'missing-element-name',
      'invalid-element-name',
      'missing-content-model',
      'unbalanced-parenthesis',
      'mixed-compositor',
      'empty-group',
      'trailing-separator',
      'invalid-occurrence',
      'invalid-pcdata-placement',
      'invalid-mixed-content',
      'unterminated-comment',
      'unterminated-declaration',
      'unsupported-declaration',
      'unsupported-syntax',
      'missing-attlist-element-name',
      'missing-attribute-name',
      'missing-attribute-type',
      'invalid-attribute-type',
      'empty-attribute-enumeration',
      'invalid-attribute-enumeration',
      'invalid-notation-type',
      'missing-attribute-default',
      'invalid-attribute-default',
      'missing-fixed-value',
      'unterminated-attribute-value',
      'incomplete-attribute-definition',
    ]);
  });

  it('diagnoses extra closing parentheses and trailing tokens', () => {
    expect(diagnosticCodes('<!ELEMENT book (a,b))>')).toContain(
      'unbalanced-parenthesis',
    );
    expect(diagnosticCodes('<!ELEMENT book (a,b) trailing>')).toContain(
      'unexpected-token',
    );
  });

  it('diagnoses leading and extra separators without throwing', () => {
    expect(diagnosticCodes('<!ELEMENT book (,a)>')).toContain(
      'unexpected-token',
    );
    expect(diagnosticCodes('<!ELEMENT book (a,,b)>')).toContain(
      'unexpected-token',
    );
    expect(diagnosticCodes('<!ELEMENT book (a||b)>')).toContain(
      'unexpected-token',
    );
  });
});

describe('bounded malformed-input cases', () => {
  it.each([
    '<!ELEMENT>',
    '<!ELEMENT book>',
    '<!ELEMENT book ()>',
    '<!ELEMENT book (a,)>',
    '<!ELEMENT book (,a)>',
    '<!ELEMENT book (a|)>',
    '<!ELEMENT book (a,b|c)>',
    '<!ELEMENT book ((a,b)>',
    '<!ELEMENT book (a,b))>',
    '<!ELEMENT book (#PCDATA|em)>',
    '<!-- unterminated',
  ])('returns diagnostics without throwing or hanging for %s', (source) => {
    let result: ReturnType<typeof parseDtdElementDeclarations> | undefined;

    expect(() => {
      result = parseDtdElementDeclarations(source);
    }).not.toThrow();
    expect(result?.diagnostics.length).toBeGreaterThan(0);
  });
});

describe('serialization, determinism, and architecture boundaries', () => {
  it('does not mutate its input and produces deeply equivalent repeated results', () => {
    const source = '<!ELEMENT book ((a,b?)|(c+,d*))>';
    const original = `${source}`;
    const first = parseDtdElementDeclarations(source, 'stable.dtd');
    const second = parseDtdElementDeclarations(source, 'stable.dtd');

    expect(source).toBe(original);
    expect(first).toEqual(second);
  });

  it('produces plain JSON-serializable acyclic data', () => {
    const result = parseDtdElementDeclarations(
      '<!ELEMENT para (#PCDATA | em | strong)*>',
      'serializable.dtd',
    );
    const serialized = JSON.stringify(result);

    expect(JSON.parse(serialized)).toEqual(result);
    expect(serialized).toContain('"kind":"mixed"');
  });

  it('stores no functions anywhere in successful AST output', () => {
    const result = parseDtdElementDeclarations(`
      <!ELEMENT book ((a,b?)|(c+,d*))>
      <!ELEMENT para (#PCDATA | em)*>
    `);

    function containsFunction(value: unknown): boolean {
      if (typeof value === 'function') return true;
      if (Array.isArray(value)) return value.some(containsFunction);
      if (value && typeof value === 'object') {
        return Object.values(value).some(containsFunction);
      }
      return false;
    }

    expect(containsFunction(result)).toBe(false);
  });

  it('keeps every parser module independent of Svelte, UI, stores, and browser globals', () => {
    for (const source of [
      astSource,
      diagnosticsSource,
      lexerSource,
      parserSource,
    ]) {
      expect(source).not.toMatch(/from\s+['"][^'"]*svelte/);
      expect(source).not.toMatch(/from\s+['"][^'"]*(?:ui|stores)\//);
      expect(source).not.toMatch(/\b(?:window|document|navigator)\b/);
    }
  });
});
