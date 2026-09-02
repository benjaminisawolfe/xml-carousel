import { describe, expect, it } from 'vitest';
import {
  buildRelaxNgSemanticModel,
  type RelaxNgNameNameClass,
  validateRelaxNgSemanticModel,
} from './index';

const rng = 'http://relaxng.org/ns/structure/1.0';
const compat = 'http://relaxng.org/ns/compatibility/annotations/1.0';

const comprehensive = `<?xml version="1.0"?>
<grammar xmlns="${rng}" xmlns:p="urn:prefixed" xmlns:a="${compat}" xmlns:doc="urn:project-docs" ns="urn:catalog" datatypeLibrary="http://www.w3.org/2001/XMLSchema-datatypes">
  <a:documentation xml:lang="en">Catalog grammar</a:documentation>
  <start combine="choice"><ref name="catalog"/></start>
  <start combine="choice"><element name="emptyCatalog"><empty/></element></start>
  <define name="catalog" combine="choice">
    <element name="catalog" a:defaultValue="unused">
      <attribute name="version" a:defaultValue="1"><value type="string">1</value></attribute>
      <zeroOrMore><ref name="item"/></zeroOrMore>
      <doc:note importance="high">foreign metadata</doc:note>
    </element>
  </define>
  <define name="catalog" combine="choice"><notAllowed/></define>
  <define name="item">
    <choice>
      <element><name>book</name><group><attribute name="id"><data type="token"><param name="minLength">1</param><except><value>forbidden</value></except></data></attribute><mixed><text/></mixed></group></element>
      <element><choice><name>p:article</name><nsName ns="urn:special"><except><name>excluded</name></except></nsName><anyName><except><name ns="urn:any">blocked</name></except></anyName></choice><interleave><optional><text/></optional><oneOrMore><list><data type="integer"/></list></oneOrMore></interleave></element>
      <grammar>
        <start><parentRef name="item"/></start>
        <define name="item"><empty/></define>
      </grammar>
    </choice>
  </define>
</grammar>`;

function build(sourceText = comprehensive) {
  const result = buildRelaxNgSemanticModel({
    sources: [{ sourceFileId: 'source:main', path: 'main.rng', sourceText }],
  });
  if (!result.model) throw new Error('Expected semantic model.');
  return result.model;
}

describe('RELAX NG normalized semantic model', () => {
  it('builds deterministic clone-safe source-preserving semantic data', () => {
    const first = build();
    const second = build();

    expect(second).toEqual(first);
    expect(structuredClone(first)).toEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(validateRelaxNgSemanticModel(first)).toEqual([]);
    expect(first.documents).toHaveLength(1);
    expect(first.grammars).toHaveLength(2);
    expect(first.startClauses).toHaveLength(3);
    expect(first.defineClauses).toHaveLength(4);
    expect(first.definitionGroups).toHaveLength(3);
    expect(new Set(first.patterns.map(({ id }) => id)).size).toBe(
      first.patterns.length,
    );
    expect(first.patterns.map(({ sourceOrder }) => sourceOrder)).toEqual(
      [...first.patterns.map(({ sourceOrder }) => sourceOrder)].sort(
        (left, right) => left - right,
      ),
    );
    for (const pattern of first.patterns) {
      expect(
        comprehensive.slice(
          pattern.range.start.offset,
          pattern.range.end.offset,
        ),
      ).toMatch(/^<(?:[A-Za-z_][\w.-]*:)?[A-Za-z_]/);
      expect(pattern.range.sourceId).toBe('source:main');
    }
  });

  it('retains clauses separately from effective symbols and binds graph references without expansion', () => {
    const model = build();
    const outer = model.grammars.find(
      ({ parentGrammarId }) => !parentGrammarId,
    )!;
    const inner = model.grammars.find(
      ({ parentGrammarId }) => parentGrammarId,
    )!;
    const catalog = model.definitionGroups.find(
      ({ grammarId, name }) => grammarId === outer.id && name === 'catalog',
    )!;
    expect(catalog.clauseIds).toHaveLength(2);
    expect(catalog.effectiveCombine).toBe('choice');
    expect(
      model.effectiveStarts.find(({ grammarId }) => grammarId === outer.id),
    ).toMatchObject({
      effectiveCombine: 'choice',
      clauseIds: expect.any(Array),
    });

    const parentRef = model.patterns.find(
      (pattern) => pattern.kind === 'parentRef',
    );
    const outerItem = model.definitionGroups.find(
      ({ grammarId, name }) => grammarId === outer.id && name === 'item',
    )!;
    const innerItem = model.definitionGroups.find(
      ({ grammarId, name }) => grammarId === inner.id && name === 'item',
    )!;
    expect(parentRef).toMatchObject({
      kind: 'parentRef',
      grammarId: inner.id,
      parentGrammarId: outer.id,
      resolvedDefinitionGroupId: outerItem.id,
    });
    expect(parentRef).not.toMatchObject({
      resolvedDefinitionGroupId: innerItem.id,
    });
    expect(model.patterns.length).toBeLessThan(50);
  });

  it('normalizes element and attribute names while preserving lexical and namespace meaning', () => {
    const model = build();
    const names = model.nameClasses.filter(
      (nameClass): nameClass is RelaxNgNameNameClass =>
        nameClass.kind === 'name',
    );
    expect(
      names.find(({ lexicalName }) => lexicalName === 'catalog'),
    ).toMatchObject({
      localName: 'catalog',
      namespaceUri: 'urn:catalog',
      effectiveNs: 'urn:catalog',
    });
    expect(
      names.find(({ lexicalName }) => lexicalName === 'version'),
    ).toMatchObject({
      localName: 'version',
      effectiveNs: '',
    });
    expect(
      names.find(({ lexicalName }) => lexicalName === 'version'),
    ).not.toHaveProperty('namespaceUri');
    expect(
      names.find(({ lexicalName }) => lexicalName === 'p:article'),
    ).toMatchObject({
      localName: 'article',
      namespaceUri: 'urn:prefixed',
      lexicalName: 'p:article',
    });
    expect(model.nameClasses.some(({ kind }) => kind === 'choice')).toBe(true);
    expect(
      model.nameClasses.filter(
        (nameClass) =>
          (nameClass.kind === 'anyName' || nameClass.kind === 'nsName') &&
          nameClass.exceptNameClassId,
      ),
    ).toHaveLength(2);
  });

  it('models operators, terminals, data params/except, values, and contexts explicitly', () => {
    const model = build();
    const kinds = new Set(model.patterns.map(({ kind }) => kind));
    for (const kind of [
      'grammar',
      'element',
      'attribute',
      'choice',
      'group',
      'interleave',
      'optional',
      'zeroOrMore',
      'oneOrMore',
      'mixed',
      'list',
      'text',
      'empty',
      'notAllowed',
      'data',
      'value',
      'ref',
      'parentRef',
    ]) {
      expect(kinds).toContain(kind);
    }
    expect(model.params).toEqual([
      expect.objectContaining({ name: 'minLength', value: '1' }),
    ]);
    expect(
      model.patterns.find(
        (pattern) => pattern.kind === 'data' && pattern.paramIds.length > 0,
      ),
    ).toMatchObject({
      datatypeLibrary: {
        effective: 'http://www.w3.org/2001/XMLSchema-datatypes',
      },
      exceptPatternIds: [expect.any(String)],
    });
    expect(model.patterns.find(({ kind }) => kind === 'value')).toMatchObject({
      lexicalValue: '1',
      type: 'string',
    });
  });

  it('retains typed documentation, foreign metadata, and DTD compatibility default values', () => {
    const model = build();
    expect(model.documentation).toEqual([
      expect.objectContaining({ text: 'Catalog grammar', xmlLang: 'en' }),
    ]);
    expect(
      model.annotations.find(
        ({ namespaceUri }) => namespaceUri === 'urn:project-docs',
      ),
    ).toMatchObject({ localName: 'note', text: 'foreign metadata' });
    expect(
      model.patterns.find(
        (pattern) =>
          pattern.kind === 'attribute' && pattern.defaultValue !== undefined,
      ),
    ).toMatchObject({
      defaultValue: { lexicalValue: '1', range: expect.any(Object) },
    });
  });

  it('links includes and external references to supplied semantic documents by package relationship identity', () => {
    const main = `<grammar xmlns="${rng}"><include href="defs.rng"/><start><group><ref name="shared"/><externalRef href="external.rng"/></group></start></grammar>`;
    const defs = `<grammar xmlns="${rng}"><define name="shared"><element name="shared"><text/></element></define></grammar>`;
    const external = `<element xmlns="${rng}" name="external"><empty/></element>`;
    const result = buildRelaxNgSemanticModel({
      sources: [
        { sourceFileId: 'source:main', path: 'main.rng', sourceText: main },
        { sourceFileId: 'source:defs', path: 'defs.rng', sourceText: defs },
        {
          sourceFileId: 'source:external',
          path: 'external.rng',
          sourceText: external,
        },
      ],
      relationships: [
        {
          id: 'relationship:include',
          kind: 'rng-include',
          rawTarget: 'defs.rng',
          sourcePath: 'main.rng',
          targetPath: 'defs.rng',
          status: 'resolved',
        },
        {
          id: 'relationship:external',
          kind: 'rng-external-ref',
          rawTarget: 'external.rng',
          sourcePath: 'main.rng',
          targetPath: 'external.rng',
          status: 'resolved',
        },
      ],
    });
    const model = result.model!;
    expect(model.includes[0]).toMatchObject({
      packageRelationshipId: 'relationship:include',
      resolution: 'resolved',
      resolvedDocumentId: expect.any(String),
      resolvedGrammarId: expect.any(String),
    });
    expect(model.patterns.find(({ kind }) => kind === 'ref')).toMatchObject({
      resolvedDefinitionGroupId: expect.any(String),
    });
    expect(
      model.patterns.find(({ kind }) => kind === 'externalRef'),
    ).toMatchObject({
      packageRelationshipId: 'relationship:external',
      resolution: 'resolved',
      resolvedDocumentId: expect.any(String),
      resolvedRootPatternId: expect.any(String),
    });
    expect(validateRelaxNgSemanticModel(model)).toEqual([]);
  });

  it('retains missing and blocked references without fabricating targets', () => {
    const source = `<grammar xmlns="${rng}"><include href="missing.rng"/><start><externalRef href="https://example.invalid/schema.rng"/></start></grammar>`;
    const model = buildRelaxNgSemanticModel({
      sources: [
        { sourceFileId: 'source:main', path: 'main.rng', sourceText: source },
      ],
      relationships: [
        {
          id: 'relationship:missing',
          kind: 'rng-include',
          rawTarget: 'missing.rng',
          sourcePath: 'main.rng',
          status: 'missing',
        },
        {
          id: 'relationship:blocked',
          kind: 'rng-external-ref',
          rawTarget: 'https://example.invalid/schema.rng',
          sourcePath: 'main.rng',
          status: 'blocked',
        },
      ],
    }).model!;
    expect(model.includes[0]).toMatchObject({ resolution: 'missing' });
    expect(model.includes[0]).not.toHaveProperty('resolvedDocumentId');
    const external = model.patterns.find(({ kind }) => kind === 'externalRef')!;
    expect(external).toMatchObject({ resolution: 'blocked' });
    expect(external).not.toHaveProperty('resolvedDocumentId');
  });

  it('preserves include overrides and links contributions without cloning target clauses', () => {
    const main = `<grammar xmlns="${rng}"><include href="base.rng"><start><ref name="local"/></start><define name="shared"><element name="override"><empty/></element></define></include><define name="local"><ref name="shared"/></define></grammar>`;
    const base = `<grammar xmlns="${rng}"><start><ref name="shared"/></start><define name="shared"><element name="base"><text/></element></define><define name="contributed"><element name="contributed"><empty/></element></define></grammar>`;
    const model = buildRelaxNgSemanticModel({
      sources: [
        { sourceFileId: 'source:main', path: 'main.rng', sourceText: main },
        { sourceFileId: 'source:base', path: 'base.rng', sourceText: base },
      ],
      relationships: [
        {
          id: 'relationship:include',
          kind: 'rng-include',
          rawTarget: 'base.rng',
          sourcePath: 'main.rng',
          targetPath: 'base.rng',
          status: 'resolved',
        },
      ],
    }).model!;
    const include = model.includes[0]!;
    expect(include.overrideStartClauseIds).toHaveLength(1);
    expect(include.overrideDefineClauseIds).toHaveLength(1);
    const mainGrammar = model.grammars.find(
      ({ documentId }) =>
        model.documents.find(({ id }) => id === documentId)?.path ===
        'main.rng',
    )!;
    const shared = model.definitionGroups.find(
      ({ grammarId, name }) =>
        grammarId === mainGrammar.id && name === 'shared',
    )!;
    const contributed = model.definitionGroups.find(
      ({ grammarId, name }) =>
        grammarId === mainGrammar.id && name === 'contributed',
    )!;
    expect(shared.clauseIds).toEqual(include.overrideDefineClauseIds);
    expect(shared.contributionGroupIds).toEqual([]);
    expect(contributed.clauseIds).toEqual([]);
    expect(contributed.contributionGroupIds).toHaveLength(1);
    expect(
      model.defineClauses.filter(
        ({ sourceFileId }) => sourceFileId === 'source:base',
      ),
    ).toHaveLength(2);
  });

  it('terminates recursive reference graphs without cloning their targets', () => {
    const source = `<grammar xmlns="${rng}"><start><ref name="a"/></start><define name="a"><ref name="b"/></define><define name="b"><ref name="a"/></define></grammar>`;
    const model = build(source);
    expect(model.patterns.filter(({ kind }) => kind === 'ref')).toHaveLength(3);
    expect(model.definitionGroups).toHaveLength(2);
    expect(model.bindings.filter(({ kind }) => kind === 'ref')).toHaveLength(3);
    expect(JSON.stringify(model).length).toBeLessThan(25_000);
  });

  it('keeps CRLF and non-ASCII source ranges exact while separating decoded values from source spelling', () => {
    const source = [
      '<?xml version="1.0"?>',
      `<!-- source order must survive comments --><rng:element xmlns:rng="${rng}" xmlns:meta="urn:meta" name="bøøk" datatypeLibrary="">`,
      '  <meta:label>Édition</meta:label>',
      '  <rng:value datatypeLibrary="http://www.w3.org/2001/XMLSchema-datatypes">one&amp;two</rng:value>',
      '</rng:element>',
    ].join('\r\n');
    const model = build(source);
    const element = model.patterns.find(
      (pattern) => pattern.kind === 'element',
    )!;
    const value = model.patterns.find((pattern) => pattern.kind === 'value');

    expect(
      source.slice(element.range.start.offset, element.range.end.offset),
    ).toContain('name="bøøk"');
    expect(element.range.start.line).toBe(2);
    expect(element.datatypeLibrary).toMatchObject({
      explicit: '',
      effective: '',
    });
    expect(value).toMatchObject({
      kind: 'value',
      lexicalValue: 'one&two',
      sourceLexicalValue: 'one&amp;two',
      datatypeLibrary: {
        explicit: 'http://www.w3.org/2001/XMLSchema-datatypes',
        effective: 'http://www.w3.org/2001/XMLSchema-datatypes',
      },
    });
    expect(model.annotations).toEqual([
      expect.objectContaining({
        namespaceUri: 'urn:meta',
        text: 'Édition',
      }),
    ]);
    expect(validateRelaxNgSemanticModel(model)).toEqual([]);
  });
});
