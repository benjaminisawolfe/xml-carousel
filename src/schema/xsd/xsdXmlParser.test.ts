import { describe, expect, it } from 'vitest';
import {
  xmlNamespaceUri,
  xmlnsNamespaceUri,
  type XsdXmlElementAst,
} from './xsdXmlAst';
import { parseXsdXml } from './xsdXmlParser';

function elementChildren(element: XsdXmlElementAst): XsdXmlElementAst[] {
  return element.children.filter(
    (child): child is XsdXmlElementAst => child.kind === 'element',
  );
}

describe('namespace-aware XSD XML tree parser', () => {
  it('builds a ranged serializable tree with declaration and surrounding nodes', () => {
    const source = [
      '<?xml version="1.0"?>',
      '<!-- before -->',
      '<?tool setup?>',
      '<root><child/>text &amp; more<![CDATA[<raw>]]></root>',
      '<!-- after -->',
    ].join('\n');
    const result = parseXsdXml(source, 'tree.xsd');
    const root = result.document.root!;

    expect(result.diagnostics).toEqual([]);
    expect(result.document.declaration).toMatchObject({
      target: 'xml',
      data: 'version="1.0"',
      sourceOrder: 0,
    });
    expect(root).toMatchObject({
      qualifiedName: 'root',
      localName: 'root',
      sourceOrder: 6,
    });
    expect(root.children.map(({ kind }) => kind)).toEqual([
      'element',
      'text',
      'cdata',
    ]);
    expect(root.children[1]).toMatchObject({
      raw: 'text &amp; more',
      value: 'text & more',
    });
    expect(source.slice(root.range.start.offset, root.range.end.offset)).toBe(
      '<root><child/>text &amp; more<![CDATA[<raw>]]></root>',
    );
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('applies default namespaces to elements but never unprefixed attributes', () => {
    const result = parseXsdXml(
      '<root xmlns="urn:default" plain="x" xmlns:p="urn:p" p:item="y"><child/></root>',
    );
    const root = result.document.root!;
    const child = elementChildren(root)[0]!;

    expect(root.namespaceUri).toBe('urn:default');
    expect(child.namespaceUri).toBe('urn:default');
    const plain = root.attributes.find(
      ({ localName }) => localName === 'plain',
    );
    expect(plain).toMatchObject({ value: 'x' });
    expect(plain).not.toHaveProperty('namespaceUri');
    expect(
      root.attributes.find(({ qualifiedName }) => qualifiedName === 'p:item'),
    ).toMatchObject({
      prefix: 'p',
      namespaceUri: 'urn:p',
      value: 'y',
    });
    expect(
      root.attributes.find(({ qualifiedName }) => qualifiedName === 'xmlns'),
    ).toMatchObject({
      namespaceUri: xmlnsNamespaceUri,
    });
  });

  it('shadows namespace bindings and restores the outer scope', () => {
    const source =
      '<p:root xmlns:p="urn:outer"><p:first><p:inner xmlns:p="urn:inner"><p:item/></p:inner><p:last/></p:first></p:root>';
    const root = parseXsdXml(source).document.root!;
    const first = elementChildren(root)[0]!;
    const inner = elementChildren(first)[0]!;
    const innerItem = elementChildren(inner)[0]!;
    const last = elementChildren(first)[1]!;

    expect(root.namespaceUri).toBe('urn:outer');
    expect(inner.namespaceBindings.p).toBe('urn:inner');
    expect(innerItem.namespaceUri).toBe('urn:inner');
    expect(last.namespaceUri).toBe('urn:outer');
    expect(first.namespaceBindings.p).toBe('urn:outer');
  });

  it('keeps the xml prefix bound and diagnoses reserved rebinding', () => {
    const valid = parseXsdXml('<root xml:lang="en"/>');
    expect(valid.diagnostics).toEqual([]);
    expect(valid.document.root?.namespaceBindings.xml).toBe(xmlNamespaceUri);
    expect(valid.document.root?.attributes[0]?.namespaceUri).toBe(
      xmlNamespaceUri,
    );

    for (const source of [
      '<root xmlns:xml="urn:wrong"/>',
      '<root xmlns:xmlns="urn:wrong"/>',
      '<root xmlns:p="http://www.w3.org/XML/1998/namespace"/>',
      '<root xmlns:p="http://www.w3.org/2000/xmlns/"/>',
    ]) {
      expect(parseXsdXml(source).diagnostics.map(({ code }) => code)).toContain(
        'reserved-namespace-binding',
      );
    }
  });

  it('diagnoses undeclared element and attribute prefixes', () => {
    const result = parseXsdXml('<p:root q:item="x"/>');
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      'undeclared-prefix',
      'undeclared-prefix',
    ]);
    expect(result.document.root).toMatchObject({ qualifiedName: 'p:root' });
    expect(result.document.root).not.toHaveProperty('namespaceUri');
  });

  it('detects duplicate attributes by expanded name', () => {
    const result = parseXsdXml(
      '<root xmlns:a="urn:same" xmlns:b="urn:same" a:item="1" b:item="2" plain="a" plain="b"/>',
    );
    expect(
      result.diagnostics.filter(({ code }) => code === 'duplicate-attribute'),
    ).toHaveLength(2);
  });

  it.each([
    ['multiple colons', '<a:b:c/>', 'malformed-qname'],
    ['empty prefix', '<:root/>', 'malformed-qname'],
    ['unquoted attribute', '<root a=value/>', 'unquoted-attribute-value'],
    ['missing equals', '<root a "value"/>', 'missing-equals'],
  ])('diagnoses %s without throwing', (_name, source, code) => {
    const result = parseXsdXml(source);
    expect(result.diagnostics.map(({ code: actual }) => actual)).toContain(
      code,
    );
  });

  it.each([
    ['empty', '', 'empty-document'],
    ['whitespace', ' \r\n\t', 'empty-document'],
    ['multiple roots', '<a/><b/>', 'multiple-roots'],
    ['outside text', 'before<a/>after', 'text-outside-root'],
    ['unexpected end', '</a><root/>', 'unexpected-end-tag'],
    ['mismatch', '<a><b></a></b>', 'mismatched-end-tag'],
    ['missing end', '<a><b/>', 'missing-end-tag'],
  ])('diagnoses document structure: %s', (_name, source, code) => {
    const result = parseXsdXml(source);
    expect(result.diagnostics.map(({ code: actual }) => actual)).toContain(
      code,
    );
  });

  it('allows surrounding whitespace, comments, and processing instructions', () => {
    const result = parseXsdXml(
      ' \n<!--before--><?before ok?><root/><?after ok?><!--after-->\r\n',
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.document.children.map(({ kind }) => kind)).toEqual([
      'text',
      'comment',
      'processingInstruction',
      'element',
      'processingInstruction',
      'comment',
      'text',
    ]);
  });

  it('diagnoses misplaced and repeated XML declarations', () => {
    const result = parseXsdXml(
      ' \n<?xml version="1.0"?><root><?xml version="1.1"?></root>',
    );
    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'misplaced-xml-declaration',
        'misplaced-xml-declaration',
      ]),
    );
  });

  it('preserves exact element, tag, attribute, and source-order ranges', () => {
    const source = '<root a=\'one\'><child b="two"/></root>';
    const root = parseXsdXml(source, 'ranges.xsd').document.root!;
    const child = elementChildren(root)[0]!;

    expect(
      source.slice(
        root.startTagRange.start.offset,
        root.startTagRange.end.offset,
      ),
    ).toBe("<root a='one'>");
    expect(
      source.slice(
        root.endTagRange!.start.offset,
        root.endTagRange!.end.offset,
      ),
    ).toBe('</root>');
    expect(
      source.slice(
        root.attributes[0]!.nameRange.start.offset,
        root.attributes[0]!.nameRange.end.offset,
      ),
    ).toBe('a');
    expect(
      source.slice(
        root.attributes[0]!.valueContentRange.start.offset,
        root.attributes[0]!.valueContentRange.end.offset,
      ),
    ).toBe('one');
    expect(root.sourceOrder).toBeLessThan(root.attributes[0]!.sourceOrder);
    expect(root.attributes[0]!.sourceOrder).toBeLessThan(child.sourceOrder);
    expect(root.range.sourceId).toBe('ranges.xsd');
  });

  it('is deterministic and does not mutate caller-owned source data', () => {
    const wrapper = { source: '<root><child/></root>' };
    const before = JSON.stringify(wrapper);
    const first = parseXsdXml(wrapper.source, 'same.xsd');
    const second = parseXsdXml(wrapper.source, 'same.xsd');
    expect(first).toEqual(second);
    expect(JSON.stringify(wrapper)).toBe(before);
  });
});
