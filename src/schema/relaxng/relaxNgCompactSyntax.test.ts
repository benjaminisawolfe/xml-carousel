import { describe, expect, it } from 'vitest';
import {
  areRelaxNgSemanticallyEquivalent,
  buildRelaxNgSemanticModel,
  parseRelaxNgCompactSyntax,
  relaxNgSemanticMeaning,
} from './index';

const rng = 'http://relaxng.org/ns/structure/1.0';

describe('RELAX NG Compact Syntax front end', () => {
  it('preserves source ranges while translating the complete core pattern family', () => {
    const source = `\ufeff# inert comment\r\nnamespace p = "urn:parts"\r\ndefault namespace = "urn:catalog"\r\ndatatypes xsd = "http://www.w3.org/2001/XMLSchema-datatypes"\r\n## Catalog documentation\r\nstart = element catalog {\r\n  attribute version { xsd:string "1" }?,\r\n  (element p:item { (text | empty)+ } & element * - p:blocked { list { xsd:token { minLength = "1" } } })*\r\n}`;
    const parsed = parseRelaxNgCompactSyntax(source, 'source:compact');
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.generated?.xml).toContain(
      '<grammar xmlns="http://relaxng.org/ns/structure/1.0"',
    );
    expect(parsed.generated?.xml).toContain('<a:documentation');
    const model = buildRelaxNgSemanticModel({
      sources: [
        {
          sourceFileId: 'source:compact',
          path: 'catalog.rnc',
          sourceText: source,
        },
      ],
    }).model!;
    expect(model.documents).toHaveLength(1);
    expect(model.patterns.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining([
        'grammar',
        'element',
        'attribute',
        'choice',
        'group',
        'interleave',
        'optional',
        'zeroOrMore',
        'oneOrMore',
        'list',
        'text',
        'empty',
        'data',
        'value',
      ]),
    );
    const catalog = model.patterns.find(({ kind }) => kind === 'element')!;
    expect(
      source.slice(catalog.range.start.offset, catalog.range.end.offset),
    ).toContain('element catalog');
    expect(catalog.range.sourceId).toBe('source:compact');
    expect(model.documentation[0]?.text).toBe('Catalog documentation');
  });

  it('reports original lexical and grouping coordinates', () => {
    const malformed = 'start = element x { text | empty, text }\n"unterminated';
    const parsed = parseRelaxNgCompactSyntax(malformed, 'source:bad');
    expect(parsed.document).toBeUndefined();
    expect(parsed.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'rnc:mixed-binary-operators',
        'rnc:unterminated-literal',
      ]),
    );
    expect(
      parsed.diagnostics.every(({ range }) => range.sourceId === 'source:bad'),
    ).toBe(true);
  });

  it.each([
    [
      'nested name-class exclusion',
      'element * - foo - bar { empty }',
      'rnc:nested-name-class-except',
    ],
    [
      'duplicate expanded annotation attribute',
      'namespace one = "urn:x"\nnamespace two = "urn:x"\n[ one:x = "a" two:x = "b" ] element root { empty }',
      'rnc:duplicate-annotation-attribute',
    ],
    [
      'reserved xmlns namespace',
      'namespace bad = "http://www.w3.org/2000/xmlns"\n[ bad:x = "a" ] element root { empty }',
      'rnc:reserved-namespace-binding',
    ],
    [
      'invalid XML character escape',
      'element root { "\\x{D800}" }',
      'rnc:invalid-unicode-escape',
    ],
  ])('rejects authoritative invalid syntax: %s', (_, source, code) => {
    const parsed = parseRelaxNgCompactSyntax(source, 'source:invalid');
    expect(parsed.document).toBeUndefined();
    expect(parsed.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      code,
    );
  });

  it('handles escaped keywords, Unicode escapes, triple literals, concatenation, and annotations', () => {
    const source = `\ufeffnamespace a = "http://relaxng.org/ns/compatibility/annotations/1.0"\nnamespace meta = "urn:meta"\n\\element = element root { "\\x{41}" ~ '''B\nC''' }\n## docs\n[ meta:review = "safe" ]\nstart = [ a:defaultValue = "fallback" ] attribute code { token } | \\element >> meta:note [ "after" ]`;
    const parsed = parseRelaxNgCompactSyntax(source, 'source:lexical');
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.generated?.xml).toContain('AB\nC');
    const model = buildRelaxNgSemanticModel({
      sources: [
        {
          sourceFileId: 'source:lexical',
          path: 'lexical.rnc',
          sourceText: source,
        },
      ],
    }).model!;
    expect(model.defineClauses[0]?.name).toBe('element');
    expect(model.patterns.some(({ kind }) => kind === 'ref')).toBe(true);
    expect(model.documentation[0]?.text).toBe('docs');
    expect(model.annotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ namespaceUri: 'urn:meta' }),
      ]),
    );
  });

  it('proves representative RNG/RNC semantic equivalence without conflating source identity', () => {
    const xml = `<grammar xmlns="${rng}" ns="urn:test"><start><element name="root"><group><attribute name="id"><data type="token"/></attribute><zeroOrMore><choice><element name="item"><text/></element><empty/></choice></zeroOrMore></group></element></start></grammar>`;
    const compact = `default namespace = "urn:test"\nstart = element root { attribute id { token }, (element item { text } | empty)* }`;
    const left = buildRelaxNgSemanticModel({
      sources: [
        { sourceFileId: 'source:xml', path: 'same.rng', sourceText: xml },
      ],
    }).model!;
    const right = buildRelaxNgSemanticModel({
      sources: [
        {
          sourceFileId: 'source:compact',
          path: 'same.rnc',
          sourceText: compact,
        },
      ],
    }).model!;
    expect(relaxNgSemanticMeaning(right)).toEqual(relaxNgSemanticMeaning(left));
    expect(areRelaxNgSemanticallyEquivalent(left, right)).toBe(true);
    expect(left.documents[0]?.sourceFileId).not.toBe(
      right.documents[0]?.sourceFileId,
    );
    expect(
      compact.slice(
        right.patterns[0]!.range.start.offset,
        right.patterns[0]!.range.end.offset,
      ),
    ).not.toContain('<');
  });

  it('canonicalizes implicit sibling grouping without erasing meaningful operators', () => {
    const modelFor = (sourceText: string, sourceFileId: string) =>
      buildRelaxNgSemanticModel({
        sources: [{ sourceFileId, path: `${sourceFileId}.rng`, sourceText }],
      }).model!;
    const implicit = modelFor(
      `<element xmlns="${rng}" name="root"><attribute name="id"/><text/></element>`,
      'implicit',
    );
    const explicit = modelFor(
      `<element xmlns="${rng}" name="root"><group><attribute name="id"/><text/></group></element>`,
      'explicit',
    );
    const choice = modelFor(
      `<element xmlns="${rng}" name="root"><choice><attribute name="id"/><text/></choice></element>`,
      'choice',
    );
    const interleave = modelFor(
      `<element xmlns="${rng}" name="root"><interleave><attribute name="id"/><text/></interleave></element>`,
      'interleave',
    );

    expect(areRelaxNgSemanticallyEquivalent(implicit, explicit)).toBe(true);
    expect(areRelaxNgSemanticallyEquivalent(implicit, choice)).toBe(false);
    expect(areRelaxNgSemanticallyEquivalent(explicit, interleave)).toBe(false);
  });

  it.each([
    {
      label: 'operators and repetition',
      rng: `<element xmlns="${rng}" name="root"><group><optional><attribute name="a"><text/></attribute></optional><zeroOrMore><choice><element name="x"><empty/></element><element name="y"><text/></element></choice></zeroOrMore><oneOrMore><interleave><attribute name="b"><text/></attribute><attribute name="c"><text/></attribute></interleave></oneOrMore></group></element>`,
      rnc: 'element root { attribute a { text }?, (element x { empty } | element y { text })*, (attribute b { text } & attribute c { text })+ }',
    },
    {
      label: 'definitions, refs, and combine',
      rng: `<grammar xmlns="${rng}"><start><ref name="item"/></start><define name="item" combine="choice"><element name="a"><empty/></element></define><define name="item" combine="choice"><element name="b"><text/></element></define></grammar>`,
      rnc: 'start = item\nitem |= element a { empty }\nitem |= element b { text }',
    },
    {
      label: 'interleave combine',
      rng: `<grammar xmlns="${rng}"><start combine="interleave"><ref name="left"/></start><start combine="interleave"><ref name="right"/></start><define name="left" combine="interleave"><element name="a"><empty/></element></define><define name="left" combine="interleave"><element name="b"><text/></element></define><define name="right"><element name="c"><empty/></element></define></grammar>`,
      rnc: 'start &= left\nstart &= right\nleft &= element a { empty }\nleft &= element b { text }\nright = element c { empty }',
    },
    {
      label: 'mixed, list, and built-in datatypes',
      rng: `<element xmlns="${rng}" name="root"><group><mixed><zeroOrMore><element name="part"><text/></element></zeroOrMore></mixed><list><group><data type="token"/><data type="string"/></group></list></group></element>`,
      rnc: 'element root { mixed { element part { text }* }, list { token, string } }',
    },
    {
      label: 'name classes and exclusions',
      rng: `<element xmlns="${rng}" xmlns:p="urn:p" ns="urn:d"><choice><name>local</name><nsName ns="urn:p"><except><name>p:blocked</name></except></nsName><anyName><except><name>secret</name></except></anyName></choice><text/></element>`,
      rnc: 'namespace p = "urn:p"\ndefault namespace = "urn:d"\nelement (local | p:* - p:blocked | * - secret) { text }',
    },
    {
      label: 'datatypes, params, values, and except',
      rng: `<element xmlns="${rng}" name="root"><group><value datatypeLibrary="http://www.w3.org/2001/XMLSchema-datatypes" type="string">fixed</value><data datatypeLibrary="http://www.w3.org/2001/XMLSchema-datatypes" type="integer"><param name="minInclusive">0</param><except><value datatypeLibrary="http://www.w3.org/2001/XMLSchema-datatypes" type="integer">7</value></except></data></group></element>`,
      rnc: 'datatypes xsd = "http://www.w3.org/2001/XMLSchema-datatypes"\nelement root { xsd:string "fixed", xsd:integer { minInclusive = "0" } - xsd:integer "7" }',
    },
    {
      label: 'nested grammar and parent ref',
      rng: `<grammar xmlns="${rng}"><start><group><ref name="item"/><grammar><start><parentRef name="item"/></start><define name="item"><empty/></define></grammar></group></start><define name="item"><element name="outer"><text/></element></define></grammar>`,
      rnc: 'start = item, grammar { start = parent item\nitem = empty }\nitem = element outer { text }',
    },
    {
      label: 'documentation and default value',
      rng: `<grammar xmlns="${rng}" xmlns:a="http://relaxng.org/ns/compatibility/annotations/1.0"><a:documentation>Doc</a:documentation><start><element name="root"><attribute name="code" a:defaultValue="42"><text/></attribute></element></start></grammar>`,
      rnc: 'namespace a = "http://relaxng.org/ns/compatibility/annotations/1.0"\n## Doc\nstart = element root { [ a:defaultValue = "42" ] attribute code { text } }',
    },
  ])('proves syntax-neutral equivalence for $label', ({ rng: xml, rnc }) => {
    const left = buildRelaxNgSemanticModel({
      sources: [
        { sourceFileId: 'source:rng', path: 'pair.rng', sourceText: xml },
      ],
    }).model!;
    const right = buildRelaxNgSemanticModel({
      sources: [
        { sourceFileId: 'source:rnc', path: 'pair.rnc', sourceText: rnc },
      ],
    }).model!;
    expect(relaxNgSemanticMeaning(right)).toEqual(relaxNgSemanticMeaning(left));
    expect(areRelaxNgSemanticallyEquivalent(left, right)).toBe(true);
  });

  it('proves include override and external-reference equivalence across supplied projects', () => {
    const xml = buildRelaxNgSemanticModel({
      sources: [
        {
          sourceFileId: 'source:xml-main',
          path: 'main.rng',
          sourceText: `<grammar xmlns="${rng}"><include href="library.rng"><define name="item"><element name="override"><text/></element></define></include><start><group><ref name="item"/><externalRef href="external.rng"/></group></start></grammar>`,
        },
        {
          sourceFileId: 'source:xml-library',
          path: 'library.rng',
          sourceText: `<grammar xmlns="${rng}"><define name="item"><element name="original"><empty/></element></define></grammar>`,
        },
        {
          sourceFileId: 'source:xml-external',
          path: 'external.rng',
          sourceText: `<element xmlns="${rng}" name="external"><text/></element>`,
        },
      ],
      relationships: [
        {
          id: 'relationship:xml-include',
          kind: 'rng-include',
          rawTarget: 'library.rng',
          sourcePath: 'main.rng',
          targetPath: 'library.rng',
          status: 'resolved',
        },
        {
          id: 'relationship:xml-external',
          kind: 'rng-external-ref',
          rawTarget: 'external.rng',
          sourcePath: 'main.rng',
          targetPath: 'external.rng',
          status: 'resolved',
        },
      ],
    }).model!;
    const compact = buildRelaxNgSemanticModel({
      sources: [
        {
          sourceFileId: 'source:rnc-main',
          path: 'main.rnc',
          sourceText:
            'include "library.rnc" { item = element override { text } }\nstart = item, external "external.rnc"',
        },
        {
          sourceFileId: 'source:rnc-library',
          path: 'library.rnc',
          sourceText: 'item = element original { empty }',
        },
        {
          sourceFileId: 'source:rnc-external',
          path: 'external.rnc',
          sourceText: 'element external { text }',
        },
      ],
      relationships: [
        {
          id: 'relationship:rnc-include',
          kind: 'rng-include',
          rawTarget: 'library.rnc',
          sourcePath: 'main.rnc',
          targetPath: 'library.rnc',
          status: 'resolved',
        },
        {
          id: 'relationship:rnc-external',
          kind: 'rng-external-ref',
          rawTarget: 'external.rnc',
          sourcePath: 'main.rnc',
          targetPath: 'external.rnc',
          status: 'resolved',
        },
      ],
    }).model!;

    expect(relaxNgSemanticMeaning(compact)).toEqual(
      relaxNgSemanticMeaning(xml),
    );
  });

  it('proves shared-dependency and representative-cycle equivalence', () => {
    const sharedXml = buildRelaxNgSemanticModel({
      sources: [
        {
          sourceFileId: 'xml:a',
          path: 'a.rng',
          sourceText: `<grammar xmlns="${rng}"><include href="shared.rng"/><start><ref name="shared"/></start></grammar>`,
        },
        {
          sourceFileId: 'xml:b',
          path: 'b.rng',
          sourceText: `<grammar xmlns="${rng}"><include href="shared.rng"/><start><ref name="shared"/></start></grammar>`,
        },
        {
          sourceFileId: 'xml:shared',
          path: 'shared.rng',
          sourceText: `<grammar xmlns="${rng}"><define name="shared"><element name="shared"><text/></element></define></grammar>`,
        },
      ],
      relationships: [
        {
          id: 'xml:a-shared',
          kind: 'rng-include',
          rawTarget: 'shared.rng',
          sourcePath: 'a.rng',
          targetPath: 'shared.rng',
          status: 'resolved',
        },
        {
          id: 'xml:b-shared',
          kind: 'rng-include',
          rawTarget: 'shared.rng',
          sourcePath: 'b.rng',
          targetPath: 'shared.rng',
          status: 'resolved',
        },
      ],
    }).model!;
    const sharedCompact = buildRelaxNgSemanticModel({
      sources: [
        {
          sourceFileId: 'rnc:a',
          path: 'a.rnc',
          sourceText: 'include "shared.rnc"\nstart = shared',
        },
        {
          sourceFileId: 'rnc:b',
          path: 'b.rnc',
          sourceText: 'include "shared.rnc"\nstart = shared',
        },
        {
          sourceFileId: 'rnc:shared',
          path: 'shared.rnc',
          sourceText: 'shared = element shared { text }',
        },
      ],
      relationships: [
        {
          id: 'rnc:a-shared',
          kind: 'rng-include',
          rawTarget: 'shared.rnc',
          sourcePath: 'a.rnc',
          targetPath: 'shared.rnc',
          status: 'resolved',
        },
        {
          id: 'rnc:b-shared',
          kind: 'rng-include',
          rawTarget: 'shared.rnc',
          sourcePath: 'b.rnc',
          targetPath: 'shared.rnc',
          status: 'resolved',
        },
      ],
    }).model!;
    expect(relaxNgSemanticMeaning(sharedCompact)).toEqual(
      relaxNgSemanticMeaning(sharedXml),
    );

    const cycleXml = buildRelaxNgSemanticModel({
      sources: [
        {
          sourceFileId: 'xml:cycle-a',
          path: 'cycle-a.rng',
          sourceText: `<grammar xmlns="${rng}"><include href="cycle-b.rng"/><start><element name="a"><empty/></element></start></grammar>`,
        },
        {
          sourceFileId: 'xml:cycle-b',
          path: 'cycle-b.rng',
          sourceText: `<grammar xmlns="${rng}"><include href="cycle-a.rng"/><start><element name="b"><empty/></element></start></grammar>`,
        },
      ],
      relationships: [
        {
          id: 'xml:cycle-a-b',
          kind: 'rng-include',
          rawTarget: 'cycle-b.rng',
          sourcePath: 'cycle-a.rng',
          targetPath: 'cycle-b.rng',
          status: 'resolved',
        },
        {
          id: 'xml:cycle-b-a',
          kind: 'rng-include',
          rawTarget: 'cycle-a.rng',
          sourcePath: 'cycle-b.rng',
          targetPath: 'cycle-a.rng',
          status: 'resolved',
        },
      ],
    }).model!;
    const cycleCompact = buildRelaxNgSemanticModel({
      sources: [
        {
          sourceFileId: 'rnc:cycle-a',
          path: 'cycle-a.rnc',
          sourceText: 'include "cycle-b.rnc"\nstart = element a { empty }',
        },
        {
          sourceFileId: 'rnc:cycle-b',
          path: 'cycle-b.rnc',
          sourceText: 'include "cycle-a.rnc"\nstart = element b { empty }',
        },
      ],
      relationships: [
        {
          id: 'rnc:cycle-a-b',
          kind: 'rng-include',
          rawTarget: 'cycle-b.rnc',
          sourcePath: 'cycle-a.rnc',
          targetPath: 'cycle-b.rnc',
          status: 'resolved',
        },
        {
          id: 'rnc:cycle-b-a',
          kind: 'rng-include',
          rawTarget: 'cycle-a.rnc',
          sourcePath: 'cycle-b.rnc',
          targetPath: 'cycle-a.rnc',
          status: 'resolved',
        },
      ],
    }).model!;
    expect(relaxNgSemanticMeaning(cycleCompact)).toEqual(
      relaxNgSemanticMeaning(cycleXml),
    );
  });
});
