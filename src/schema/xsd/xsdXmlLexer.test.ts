import { describe, expect, it } from 'vitest';
import { createXsdSourceMap } from './xsdXmlAst';
import { lexXsdXml } from './xsdXmlLexer';

describe('XSD XML source map', () => {
  it('maps empty source, EOF, LF, CRLF, and isolated CR', () => {
    expect(createXsdSourceMap('').positionAt(0)).toEqual({
      offset: 0,
      line: 1,
      column: 1,
    });
    const source = 'a\r\nb\rc\nd';
    const map = createXsdSourceMap(source, 'lines.xsd');
    expect([0, 1, 3, 4, 5, 6, source.length].map(map.positionAt)).toEqual([
      { offset: 0, line: 1, column: 1 },
      { offset: 1, line: 1, column: 2 },
      { offset: 3, line: 2, column: 1 },
      { offset: 4, line: 2, column: 2 },
      { offset: 5, line: 3, column: 1 },
      { offset: 6, line: 3, column: 2 },
      { offset: 8, line: 4, column: 2 },
    ]);
    expect(map.range(3, 5).sourceId).toBe('lines.xsd');
  });

  it('uses UTF-16 code-unit offsets for non-BMP characters', () => {
    const source = 'A😀B';
    const map = createXsdSourceMap(source);
    expect(source.length).toBe(4);
    expect(map.positionAt(3)).toEqual({ offset: 3, line: 1, column: 4 });
    expect(map.positionAt(999)).toEqual({ offset: 4, line: 1, column: 5 });
    expect(map.positionAt(-4)).toEqual({ offset: 0, line: 1, column: 1 });
  });
});

describe('XSD XML lexer', () => {
  it('tokenizes declaration, PI, comments, CDATA, tags, names, equals, values, and text', () => {
    const source = [
      '<?xml version="1.0"?>',
      '<?build test?>',
      '<!-- note -->',
      '<root xmlns:x="urn:x" x:item=\'one\' plain="two">',
      'text<![CDATA[<raw>]]><child/></root>',
    ].join('\n');
    const result = lexXsdXml(source, 'tokens.xsd');

    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.map(({ kind }) => kind)).toEqual([
      'xmlDeclaration',
      'text',
      'processingInstruction',
      'text',
      'comment',
      'text',
      'startTagOpen',
      'name',
      'name',
      'equals',
      'attributeValue',
      'name',
      'equals',
      'attributeValue',
      'name',
      'equals',
      'attributeValue',
      'tagClose',
      'text',
      'cdata',
      'startTagOpen',
      'name',
      'emptyTagClose',
      'endTagOpen',
      'name',
      'tagClose',
    ]);
    expect(
      result.tokens.filter(({ kind }) => kind === 'attributeValue'),
    ).toMatchObject([
      { quote: 'double', value: 'urn:x' },
      { quote: 'single', value: 'one' },
      { quote: 'double', value: 'two' },
    ]);
    expect(result.tokens.find(({ kind }) => kind === 'cdata')).toMatchObject({
      value: '<raw>',
    });
  });

  it('preserves exact token and attribute-content ranges', () => {
    const source = '<x:item a="A&amp;B"/>';
    const result = lexXsdXml(source, 'range.xsd');
    const name = result.tokens.find(
      ({ kind, value }) => kind === 'name' && value === 'x:item',
    );
    const value = result.tokens.find(({ kind }) => kind === 'attributeValue');

    expect(source.slice(name!.range.start.offset, name!.range.end.offset)).toBe(
      'x:item',
    );
    expect(
      source.slice(
        value!.contentRange!.start.offset,
        value!.contentRange!.end.offset,
      ),
    ).toBe('A&amp;B');
    expect(value).toMatchObject({
      raw: '"A&amp;B"',
      value: 'A&B',
      quote: 'double',
    });
  });

  it('decodes only predefined and decimal/hex numeric references', () => {
    const source =
      '<root value="&lt;&gt;&amp;&quot;&apos;&#65;&#x1F600;">&#x42;</root>';
    const result = lexXsdXml(source);
    expect(result.diagnostics).toEqual([]);
    expect(
      result.tokens.find(({ kind }) => kind === 'attributeValue')?.value,
    ).toBe('<>&"\'A😀');
    expect(
      result.tokens.find(
        ({ kind, raw }) => kind === 'text' && raw.includes('&#x42;'),
      )?.value,
    ).toBe('B');
  });

  it.each([
    ['unknown', '<r a="&custom;"/>', 'unknown-entity-reference'],
    ['missing semicolon', '<r a="&amp"/>', 'unterminated-entity-reference'],
    ['empty numeric', '<r a="&#;"/>', 'invalid-entity-reference'],
    ['bad decimal', '<r a="&#12x;"/>', 'invalid-entity-reference'],
    ['surrogate', '<r a="&#xD800;"/>', 'invalid-entity-reference'],
    ['too large', '<r a="&#x110000;"/>', 'invalid-entity-reference'],
    ['zero', '<r a="&#0;"/>', 'invalid-entity-reference'],
  ])('diagnoses %s references without throwing', (_name, source, code) => {
    const result = lexXsdXml(source);
    expect(result.diagnostics.map(({ code: actual }) => actual)).toContain(
      code,
    );
    expect(result.tokens.length).toBeGreaterThan(0);
  });

  it('rejects DOCTYPE and other markup declarations without entity expansion', () => {
    const source =
      '<!DOCTYPE root [<!ENTITY secret SYSTEM "file:///secret">]><root>&secret;</root>';
    const result = lexXsdXml(source);
    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'doctype-not-allowed',
        'unknown-entity-reference',
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('file contents');
  });

  it.each([
    ['comment', '<!-- open', 'unterminated-comment'],
    ['CDATA', '<![CDATA[open', 'unterminated-cdata'],
    ['PI', '<?open', 'unterminated-processing-instruction'],
    ['attribute', '<r a="open', 'unterminated-attribute-value'],
    ['tag', '<root', 'unterminated-tag'],
  ])('stops safely for an unterminated %s', (_name, source, code) => {
    const result = lexXsdXml(source);
    expect(result.diagnostics.map(({ code: actual }) => actual)).toContain(
      code,
    );
    expect(result.tokens.length).toBeLessThan(10);
  });

  it('diagnoses unquoted values and always advances', () => {
    const source = '<root one=bare two="ok"/>';
    const lexed = lexXsdXml(source);
    expect(lexed.diagnostics.map(({ code }) => code)).toContain(
      'unquoted-attribute-value',
    );
    expect(lexed.tokens.map(({ kind }) => kind)).toContain(
      'unquotedAttributeValue',
    );
    expect(lexed.tokens.map(({ kind }) => kind)).toContain('emptyTagClose');
    expect(lexed.tokens.length).toBeLessThan(source.length + 1);
  });

  it('accepts practical Unicode names and name punctuation', () => {
    const result = lexXsdXml(
      '<δοκιμή:élément attr_1-name.test="ok"></δοκιμή:élément>',
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.filter(({ kind }) => kind === 'name')).toMatchObject([
      { value: 'δοκιμή:élément' },
      { value: 'attr_1-name.test' },
      { value: 'δοκιμή:élément' },
    ]);
  });

  it('is deterministic for identical source and source ID', () => {
    const source = '<r a="&#65;">text &amp; more</r>';
    expect(lexXsdXml(source, 'same.xsd')).toEqual(
      lexXsdXml(source, 'same.xsd'),
    );
  });
});
