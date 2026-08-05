import { describe, expect, it } from 'vitest';
import attributesSource from '../../../tests/fixtures/dtd/attributes.dtd?raw';
import astSource from './dtdAst.ts?raw';
import lexerSource from './dtdLexer.ts?raw';
import parserSource from './dtdParser.ts?raw';
import {
  dtdAsciiNmtokenScannerLimitation,
  parseDtdDeclarations,
  parseDtdElementDeclarations,
  type DtdAttributeListDeclarationAst,
} from './index';

function parseOneAttlist(source: string): DtdAttributeListDeclarationAst {
  const result = parseDtdDeclarations(source);
  expect(result.diagnostics).toEqual([]);
  expect(result.declarations).toHaveLength(1);
  const declaration = result.declarations[0];
  expect(declaration?.kind).toBe('attributeListDeclaration');
  return declaration as DtdAttributeListDeclarationAst;
}

function unifiedDiagnosticCodes(source: string): readonly string[] {
  return parseDtdDeclarations(source).diagnostics.map(({ code }) => code);
}

describe('DTD ATTLIST attribute types', () => {
  it.each([
    ['CDATA', 'cdata'],
    ['ID', 'id'],
    ['IDREF', 'idref'],
    ['IDREFS', 'idrefs'],
    ['ENTITY', 'entity'],
    ['ENTITIES', 'entities'],
    ['NMTOKEN', 'nmtoken'],
    ['NMTOKENS', 'nmtokens'],
  ] as const)('parses %s as the exact %s type', (spelling, kind) => {
    const source = `<!ATTLIST book value ${spelling} #IMPLIED>`;
    const declaration = parseOneAttlist(source);
    const type = declaration.attributeDefinitions[0]?.type;

    expect(type).toEqual({
      kind,
      spelling,
      range: {
        start: {
          offset: source.indexOf(spelling),
          line: 1,
          column: source.indexOf(spelling) + 1,
        },
        end: {
          offset: source.indexOf(spelling) + spelling.length,
          line: 1,
          column: source.indexOf(spelling) + spelling.length + 1,
        },
      },
    });
  });

  it('parses enumeration NMTOKEN values in exact source order', () => {
    const source =
      '<!ATTLIST release status (draft | in-review | v1.2 | xml:lang | _token | 2nd) #REQUIRED>';
    const declaration = parseOneAttlist(source);
    const type = declaration.attributeDefinitions[0]?.type;

    expect(dtdAsciiNmtokenScannerLimitation).toContain('ASCII XML-name');
    expect(type).toMatchObject({
      kind: 'enumeration',
      values: [
        { kind: 'enumerationValue', value: 'draft' },
        { kind: 'enumerationValue', value: 'in-review' },
        { kind: 'enumerationValue', value: 'v1.2' },
        { kind: 'enumerationValue', value: 'xml:lang' },
        { kind: 'enumerationValue', value: '_token' },
        { kind: 'enumerationValue', value: '2nd' },
      ],
    });
    if (type?.kind !== 'enumeration') throw new Error('Expected enumeration');
    expect(
      type.values.map(({ range }) =>
        source.slice(range.start.offset, range.end.offset),
      ),
    ).toEqual(['draft', 'in-review', 'v1.2', 'xml:lang', '_token', '2nd']);
    expect(source.slice(type.range.start.offset, type.range.end.offset)).toBe(
      '(draft | in-review | v1.2 | xml:lang | _token | 2nd)',
    );
  });

  it('parses NOTATION names separately and preserves order', () => {
    const source =
      '<!ATTLIST image format NOTATION (gif | jpg | png) #REQUIRED>';
    const declaration = parseOneAttlist(source);
    const type = declaration.attributeDefinitions[0]?.type;

    expect(type).toMatchObject({
      kind: 'notation',
      names: [
        { kind: 'notationName', name: 'gif' },
        { kind: 'notationName', name: 'jpg' },
        { kind: 'notationName', name: 'png' },
      ],
    });
    if (type?.kind !== 'notation') throw new Error('Expected notation');
    expect(source.slice(type.range.start.offset, type.range.end.offset)).toBe(
      'NOTATION (gif | jpg | png)',
    );
    expect(
      type.names.map(({ range }) =>
        source.slice(range.start.offset, range.end.offset),
      ),
    ).toEqual(['gif', 'jpg', 'png']);
  });

  it.each([
    ['<!ATTLIST book status () #IMPLIED>', 'empty-attribute-enumeration'],
    [
      '<!ATTLIST book status (|draft) #IMPLIED>',
      'invalid-attribute-enumeration',
    ],
    [
      '<!ATTLIST book status (draft|) #IMPLIED>',
      'invalid-attribute-enumeration',
    ],
    [
      '<!ATTLIST book status (draft||final) #IMPLIED>',
      'invalid-attribute-enumeration',
    ],
    [
      '<!ATTLIST book status (draft,final) #IMPLIED>',
      'invalid-attribute-enumeration',
    ],
    ['<!ATTLIST image format NOTATION () #IMPLIED>', 'invalid-notation-type'],
    [
      '<!ATTLIST image format NOTATION (|gif) #IMPLIED>',
      'invalid-notation-type',
    ],
    [
      '<!ATTLIST image format NOTATION (gif|) #IMPLIED>',
      'invalid-notation-type',
    ],
    [
      '<!ATTLIST image format NOTATION (gif||png) #IMPLIED>',
      'invalid-notation-type',
    ],
  ] as const)('rejects malformed type syntax in %s', (source, code) => {
    const result = parseDtdDeclarations(source);

    expect(result.declarations).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      code,
    );
  });
});

describe('DTD ATTLIST defaults and literals', () => {
  it.each([
    ['#REQUIRED', 'required'],
    ['#IMPLIED', 'implied'],
  ] as const)('parses %s defaults', (syntax, kind) => {
    const source = `<!ATTLIST book id ID ${syntax}>`;
    const defaultDeclaration =
      parseOneAttlist(source).attributeDefinitions[0]?.defaultDeclaration;

    expect(defaultDeclaration).toEqual({
      kind,
      range: {
        start: {
          offset: source.indexOf(syntax),
          line: 1,
          column: source.indexOf(syntax) + 1,
        },
        end: {
          offset: source.indexOf(syntax) + syntax.length,
          line: 1,
          column: source.indexOf(syntax) + syntax.length + 1,
        },
      },
    });
  });

  it.each([
    ['""', '', 'double'],
    ["''", '', 'single'],
    ['"greater > value"', 'greater > value', 'double'],
    ["'&entity; stays text'", '&entity; stays text', 'single'],
    ['"line one\\n  line two"', 'line one\\n  line two', 'double'],
  ] as const)('preserves literal %s exactly', (literalSyntax, value, quote) => {
    const source = `<!ATTLIST book label CDATA ${literalSyntax}>`.replace(
      '\\n',
      '\n',
    );
    const defaultDeclaration =
      parseOneAttlist(source).attributeDefinitions[0]?.defaultDeclaration;

    expect(defaultDeclaration).toMatchObject({
      kind: 'value',
      value: {
        kind: 'attributeValueLiteral',
        value: value.replace('\\n', '\n'),
        quote,
      },
    });
    if (defaultDeclaration?.kind !== 'value') {
      throw new Error('Expected direct value default');
    }
    expect(
      source.slice(
        defaultDeclaration.value.range.start.offset,
        defaultDeclaration.value.range.end.offset,
      ),
    ).toBe(literalSyntax.replace('\\n', '\n'));
  });

  it('parses #FIXED with distinct keyword-plus-literal and literal ranges', () => {
    const source = '<!ATTLIST book role CDATA #FIXED "primary">';
    const defaultDeclaration =
      parseOneAttlist(source).attributeDefinitions[0]?.defaultDeclaration;

    expect(defaultDeclaration).toMatchObject({
      kind: 'fixed',
      value: {
        kind: 'attributeValueLiteral',
        value: 'primary',
        quote: 'double',
      },
    });
    if (defaultDeclaration?.kind !== 'fixed') {
      throw new Error('Expected fixed default');
    }
    expect(
      source.slice(
        defaultDeclaration.range.start.offset,
        defaultDeclaration.range.end.offset,
      ),
    ).toBe('#FIXED "primary"');
    expect(
      source.slice(
        defaultDeclaration.value.range.start.offset,
        defaultDeclaration.value.range.end.offset,
      ),
    ).toBe('"primary"');
  });

  it('diagnoses an unterminated quoted value without treating > as a terminator', () => {
    const source = '<!ATTLIST book label CDATA "still > open';
    const result = parseDtdDeclarations(source, 'unterminated.dtd');
    const diagnostic = result.diagnostics.find(
      ({ code }) => code === 'unterminated-attribute-value',
    );

    expect(result.declarations).toEqual([]);
    expect(diagnostic).toMatchObject({
      sourceId: 'unterminated.dtd',
      range: {
        start: {
          offset: source.indexOf('"'),
          line: 1,
          column: source.indexOf('"') + 1,
        },
        end: {
          offset: source.length,
          line: 1,
          column: source.length + 1,
        },
      },
    });
  });
});

describe('DTD ATTLIST declaration shape and source order', () => {
  it('accepts an empty ATTLIST declaration', () => {
    expect(parseOneAttlist('<!ATTLIST book>')).toMatchObject({
      kind: 'attributeListDeclaration',
      elementName: 'book',
      attributeDefinitions: [],
    });
  });

  it('parses multiple definitions across whitespace and comments', () => {
    const source = `<!ATTLIST book
      id ID #REQUIRED
      <!-- formatting trivia -->
      status (draft | final) "draft"
      format NOTATION (html | epub) #IMPLIED>`;
    const declaration = parseOneAttlist(source);

    expect(
      declaration.attributeDefinitions.map(
        ({ name, type, defaultDeclaration }) => ({
          name,
          type: type.kind,
          default: defaultDeclaration.kind,
        }),
      ),
    ).toEqual([
      { name: 'id', type: 'id', default: 'required' },
      { name: 'status', type: 'enumeration', default: 'value' },
      { name: 'format', type: 'notation', default: 'implied' },
    ]);
  });

  it('preserves duplicate attributes and repeated ATTLIST declarations', () => {
    const result = parseDtdDeclarations(`
      <!ATTLIST book id ID #IMPLIED id CDATA "duplicate">
      <!ATTLIST book role CDATA #REQUIRED>
    `);

    expect(result.diagnostics).toEqual([]);
    expect(result.declarations).toHaveLength(2);
    expect(
      result.declarations.map((declaration) =>
        declaration.kind === 'attributeListDeclaration'
          ? {
              elementName: declaration.elementName,
              names: declaration.attributeDefinitions.map(({ name }) => name),
            }
          : undefined,
      ),
    ).toEqual([
      { elementName: 'book', names: ['id', 'id'] },
      { elementName: 'book', names: ['role'] },
    ]);
  });

  it('does not require a corresponding ELEMENT declaration', () => {
    const declaration = parseOneAttlist(
      '<!ATTLIST undeclared id ID #REQUIRED>',
    );

    expect(declaration.elementName).toBe('undeclared');
  });

  it('preserves mixed ELEMENT and ATTLIST declaration order', () => {
    const result = parseDtdDeclarations(`
      <!ATTLIST book id ID #REQUIRED>
      <!ELEMENT book (chapter+)>
      <!ATTLIST chapter number NMTOKEN #IMPLIED>
      <!ELEMENT chapter (#PCDATA)>
    `);

    expect(result.diagnostics).toEqual([]);
    expect(result.declarations.map((declaration) => declaration.kind)).toEqual([
      'attributeListDeclaration',
      'elementDeclaration',
      'attributeListDeclaration',
      'elementDeclaration',
    ]);
  });

  it('recovers from a malformed ATTLIST and parses later declarations', () => {
    const result = parseDtdDeclarations(`
      <!ATTLIST broken status (draft|) #IMPLIED>
      <!ELEMENT after EMPTY>
      <!ATTLIST after id ID #REQUIRED>
    `);

    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'invalid-attribute-enumeration',
    );
    expect(
      result.declarations.map((declaration) =>
        declaration.kind === 'elementDeclaration'
          ? declaration.name
          : declaration.elementName,
      ),
    ).toEqual(['after', 'after']);
  });
});

describe('DTD ATTLIST locations', () => {
  it.each(['\n', '\r\n', '\r'] as const)(
    'uses exact UTF-16 locations with %j line endings',
    (lineEnding) => {
      const source = `${lineEnding}<!ATTLIST book${lineEnding} id CDATA "x">`;
      const declaration = parseDtdDeclarations(source, 'locations.dtd')
        .declarations[0] as DtdAttributeListDeclarationAst;
      const attribute = declaration.attributeDefinitions[0]!;

      expect(declaration.range).toEqual({
        start: { offset: lineEnding.length, line: 2, column: 1 },
        end: { offset: source.length, line: 3, column: 15 },
        sourceId: 'locations.dtd',
      });
      expect(attribute.range.start).toEqual({
        offset: source.indexOf('id'),
        line: 3,
        column: 2,
      });
      expect(attribute.type.range).toEqual({
        start: {
          offset: source.indexOf('CDATA'),
          line: 3,
          column: 5,
        },
        end: {
          offset: source.indexOf('CDATA') + 5,
          line: 3,
          column: 10,
        },
        sourceId: 'locations.dtd',
      });
      expect(attribute.defaultDeclaration.range).toEqual({
        start: { offset: source.indexOf('"x"'), line: 3, column: 11 },
        end: { offset: source.indexOf('"x"') + 3, line: 3, column: 14 },
        sourceId: 'locations.dtd',
      });
    },
  );

  it('provides source IDs and exact recoverable ranges at every AST level', () => {
    const source = '<!ATTLIST image format NOTATION (gif|png) #FIXED "gif">';
    const declaration = parseDtdDeclarations(source, 'images.dtd')
      .declarations[0] as DtdAttributeListDeclarationAst;
    const attribute = declaration.attributeDefinitions[0]!;
    const type = attribute.type;
    const defaultDeclaration = attribute.defaultDeclaration;

    expect(declaration.rawDeclarationRange.sourceId).toBe('images.dtd');
    expect(attribute.range.sourceId).toBe('images.dtd');
    expect(type.range.sourceId).toBe('images.dtd');
    expect(
      type.kind === 'notation'
        ? type.names.every(({ range }) => range.sourceId === 'images.dtd')
        : false,
    ).toBe(true);
    expect(defaultDeclaration.range.sourceId).toBe('images.dtd');
    expect(
      defaultDeclaration.kind === 'fixed'
        ? defaultDeclaration.value.range.sourceId
        : undefined,
    ).toBe('images.dtd');
    expect(
      source.slice(
        declaration.rawDeclarationRange.start.offset,
        declaration.rawDeclarationRange.end.offset,
      ),
    ).toBe(source);
  });
});

describe('DTD ATTLIST diagnostics and compatibility boundary', () => {
  it.each([
    ['missing-attlist-element-name', '<!ATTLIST>'],
    ['missing-attribute-name', '<!ATTLIST book #IMPLIED>'],
    ['missing-attribute-type', '<!ATTLIST book id #IMPLIED>'],
    ['invalid-attribute-type', '<!ATTLIST book id UNKNOWN #IMPLIED>'],
    ['empty-attribute-enumeration', '<!ATTLIST book status () #IMPLIED>'],
    [
      'invalid-attribute-enumeration',
      '<!ATTLIST book status (draft||final) #IMPLIED>',
    ],
    ['invalid-notation-type', '<!ATTLIST book media NOTATION () #IMPLIED>'],
    ['missing-attribute-default', '<!ATTLIST book id ID>'],
    ['invalid-attribute-default', '<!ATTLIST book id ID sometimes>'],
    ['missing-fixed-value', '<!ATTLIST book id ID #FIXED>'],
    ['unterminated-attribute-value', '<!ATTLIST book label CDATA "open'],
    ['incomplete-attribute-definition', '<!ATTLIST book'],
  ] as const)('returns stable %s diagnostics', (code, source) => {
    const result = parseDtdDeclarations(source, 'diagnostics.dtd');
    const diagnostic = result.diagnostics.find(
      (candidate) => candidate.code === code,
    );

    expect(result.declarations).toEqual([]);
    expect(diagnostic).toMatchObject({
      code,
      severity: 'error',
      sourceId: 'diagnostics.dtd',
      range: { sourceId: 'diagnostics.dtd' },
    });
    expect(diagnostic?.message).toMatch(/near line \d+, column \d+\.$/);
  });

  it('keeps ATTLIST unsupported in the element-only compatibility API', () => {
    const unified = parseDtdDeclarations(attributesSource);
    const elementOnly = parseDtdElementDeclarations(attributesSource);

    expect(unified.diagnostics).toEqual([]);
    expect(unified.declarations.map(({ kind }) => kind)).toEqual([
      'elementDeclaration',
      'attributeListDeclaration',
    ]);
    expect(elementOnly.declarations.map(({ name }) => name)).toEqual(['book']);
    expect(elementOnly.diagnostics.map(({ code }) => code)).toEqual([
      'unsupported-declaration',
    ]);
  });

  it('keeps later ELEMENT declarations recoverable in element-only mode', () => {
    const result = parseDtdElementDeclarations(`
      <!ATTLIST book label CDATA "greater > value">
      <!ELEMENT after EMPTY>
    `);

    expect(result.declarations.map(({ name }) => name)).toEqual(['after']);
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      'unsupported-declaration',
    ]);
  });

  it('extracts ENTITY, NOTATION declarations, and parameter-entity references without parser errors', () => {
    expect(
      unifiedDiagnosticCodes(`
        <!ENTITY publisher "Example">
        <!NOTATION gif SYSTEM "image/gif">
        %common;
      `),
    ).toEqual([]);
    expect(
      parseDtdDeclarations(`
        <!ENTITY publisher "Example">
        <!NOTATION gif SYSTEM "image/gif">
        %common;
      `).constructs?.map(({ kind }) => kind),
    ).toEqual([
      'entityDeclaration',
      'notationDeclaration',
      'parameterEntityReference',
    ]);
  });
});

describe('DTD ATTLIST determinism and parser isolation', () => {
  it('is deterministic, does not mutate input, and produces plain JSON data', () => {
    const source = `<!ATTLIST book
      status (draft|review|final) "draft"
      role CDATA #FIXED 'primary'>`;
    const original = `${source}`;
    const first = parseDtdDeclarations(source, 'stable.dtd');
    const second = parseDtdDeclarations(source, 'stable.dtd');
    const serialized = JSON.stringify(first);

    expect(source).toBe(original);
    expect(first).toEqual(second);
    expect(JSON.parse(serialized)).toEqual(first);
  });

  it('contains no functions, classes, maps, sets, or cycles in output', () => {
    const result = parseDtdDeclarations(
      '<!ATTLIST book status (draft|final) #IMPLIED>',
    );
    const ancestors = new Set<object>();

    function inspect(value: unknown): void {
      expect(typeof value).not.toBe('function');
      if (!value || typeof value !== 'object') return;
      expect(value).not.toBeInstanceOf(Map);
      expect(value).not.toBeInstanceOf(Set);
      expect(Object.getPrototypeOf(value)).toBeOneOf([
        Object.prototype,
        Array.prototype,
      ]);
      expect(ancestors.has(value)).toBe(false);
      ancestors.add(value);
      for (const nested of Object.values(value)) inspect(nested);
      ancestors.delete(value);
    }

    inspect(result);
  });

  it('keeps parser files free of UI, browser, dependency, and any-type coupling', () => {
    for (const source of [astSource, lexerSource, parserSource]) {
      expect(source).not.toMatch(/from\s+['"][^'"]*(?:svelte|ui|stores)\//);
      expect(source).not.toMatch(/\b(?:window|document|navigator)\b/);
      expect(source).not.toMatch(/(?:\bas\s+any\b|:\s*any\b|<any>)/);
    }
    expect(parserSource).not.toContain('function isAsciiNameCharacter');
    expect(lexerSource.match(/function isAsciiNameCharacter/g)).toHaveLength(1);
  });
});
