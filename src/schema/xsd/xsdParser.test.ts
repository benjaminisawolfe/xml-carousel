import { describe, expect, it } from 'vitest';
import type {
  XsdComplexTypeAst,
  XsdGlobalElementAst,
  XsdLocalElementAst,
} from './xsdAst';
import { parseXsd } from './xsdParser';
import { xmlSchemaNamespaceUri } from './xsdXmlAst';
import basicStructure from '../../../tests/fixtures/xsd/basic-structure.xsd?raw';
import alternatePrefix from '../../../tests/fixtures/xsd/alternate-prefix.xsd?raw';
import defaultSchemaNamespace from '../../../tests/fixtures/xsd/default-schema-namespace.xsd?raw';
import anonymousTypes from '../../../tests/fixtures/xsd/anonymous-types.xsd?raw';
import occurrences from '../../../tests/fixtures/xsd/occurrences.xsd?raw';
import namespaceShadowing from '../../../tests/fixtures/xsd/namespace-shadowing.xsd?raw';
import annotationsAndForeign from '../../../tests/fixtures/xsd/annotations-and-foreign-content.xsd?raw';
import unsupportedComponents from '../../../tests/fixtures/xsd/unsupported-components.xsd?raw';
import malformedXml from '../../../tests/fixtures/xsd/malformed-xml.xsd?raw';
import wrongRootNamespace from '../../../tests/fixtures/xsd/wrong-root-namespace.xsd?raw';

function declaration<T extends 'globalElement' | 'complexType' | 'simpleType'>(
  source: string,
  kind: T,
  index = 0,
) {
  return parseXsd(source).schema?.declarations.filter(
    (candidate) => candidate.kind === kind,
  )[index] as
    | Extract<
        NonNullable<
          ReturnType<typeof parseXsd>['schema']
        >['declarations'][number],
        { kind: T }
      >
    | undefined;
}

function namedGlobalElement(source: string, index = 0): XsdGlobalElementAst {
  return declaration(source, 'globalElement', index)!;
}

function namedComplexType(source: string, index = 0): XsdComplexTypeAst {
  return declaration(source, 'complexType', index)!;
}

describe('XSD schema root and header projection', () => {
  it('parses schema headers and interleaved global declarations in source order', () => {
    const result = parseXsd(basicStructure, 'basic-structure.xsd');
    expect(result.status).toBe('success');
    expect(result.diagnostics).toEqual([]);
    expect(result.schema).toMatchObject({
      kind: 'schema',
      targetNamespace: {
        value: 'urn:books',
        lexicalValue: 'urn:books',
      },
      elementFormDefault: {
        value: 'qualified',
        lexicalValue: 'qualified',
      },
      attributeFormDefault: {
        value: 'unqualified',
        lexicalValue: 'unqualified',
      },
      version: { value: '1.0', lexicalValue: '1.0' },
    });
    expect(result.schema?.declarations.map(({ kind }) => kind)).toEqual([
      'globalElement',
      'complexType',
      'simpleType',
    ]);
    expect(
      result.schema?.declarations.map(({ sourceOrder }) => sourceOrder),
    ).toEqual(
      [...(result.schema?.declarations ?? [])]
        .sort((left, right) => left.sourceOrder - right.sourceOrder)
        .map(({ sourceOrder }) => sourceOrder),
    );
  });

  it.each([
    ['xs prefix', basicStructure],
    ['arbitrary prefix', alternatePrefix],
    ['default schema namespace', defaultSchemaNamespace],
  ])(
    'recognizes schema components by namespace URI with %s',
    (_name, source) => {
      const result = parseXsd(source);
      expect(result.schema?.xml.namespaceUri).toBe(xmlSchemaNamespaceUri);
      expect(result.schema?.declarations.length).toBeGreaterThan(0);
      expect(
        result.diagnostics.filter(({ severity }) => severity === 'error'),
      ).toEqual([]);
    },
  );

  it('does not accept lexical schema in the wrong namespace', () => {
    const result = parseXsd(wrongRootNamespace, 'wrong.xsd');
    expect(result.status).toBe('failure');
    expect(result.schema).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'wrong-schema-namespace',
    );
  });

  it('distinguishes a non-schema root and an unbound schema prefix', () => {
    expect(parseXsd('<root/>').diagnostics.map(({ code }) => code)).toContain(
      'non-schema-root',
    );
    expect(
      parseXsd('<xs:schema/>').diagnostics.map(({ code }) => code),
    ).toEqual(
      expect.arrayContaining(['undeclared-prefix', 'wrong-schema-namespace']),
    );
  });

  it('uses unqualified form defaults and diagnoses invalid lexical values', () => {
    const valid = parseXsd(
      '<schema xmlns="http://www.w3.org/2001/XMLSchema"/>',
    );
    expect(valid.schema?.elementFormDefault).toEqual({
      value: 'unqualified',
      lexicalValue: 'unqualified',
    });
    expect(valid.schema?.attributeFormDefault).toEqual({
      value: 'unqualified',
      lexicalValue: 'unqualified',
    });

    const invalid = parseXsd(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" elementFormDefault="yes" attributeFormDefault=" qualified "/>',
    );
    expect(
      invalid.diagnostics.filter(({ code }) => code === 'invalid-form-default'),
    ).toHaveLength(2);
    expect(invalid.schema?.elementFormDefault).toMatchObject({
      value: 'unqualified',
      lexicalValue: 'yes',
    });
  });

  it('preserves foreign attributes without treating them as schema header fields', () => {
    const result = parseXsd(annotationsAndForeign);
    expect(result.schema?.xml.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          qualifiedName: 'tool:version',
          namespaceUri: 'urn:tool',
          value: '2',
        }),
      ]),
    );
    expect(result.status).toBe('success');
  });
});

describe('XSD global declarations and anonymous types', () => {
  it('parses lexical prefixed and unprefixed type QNames without resolving declarations', () => {
    const global = namedGlobalElement(basicStructure);
    expect(global).toMatchObject({
      name: 'book',
      type: {
        raw: 'tns:BookType',
        prefix: 'tns',
        localName: 'BookType',
        namespaceUri: 'urn:books',
      },
    });

    const unprefixed = namedGlobalElement(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns="urn:default"><xs:element name="root" type="LocalType"/></xs:schema>',
    );
    expect(unprefixed.type).toMatchObject({
      raw: 'LocalType',
      localName: 'LocalType',
    });
    expect(unprefixed.type).not.toHaveProperty('namespaceUri');
  });

  it.each([
    ['missing element name', '<xs:element/>', 'missing-declaration-name'],
    [
      'invalid element name',
      '<xs:element name="bad:name"/>',
      'invalid-declaration-name',
    ],
    [
      'missing complex type name',
      '<xs:complexType/>',
      'missing-declaration-name',
    ],
    [
      'missing simple type name',
      '<xs:simpleType/>',
      'missing-declaration-name',
    ],
    ['global ref', '<xs:element name="a" ref="b"/>', 'forbidden-global-ref'],
    [
      'global min',
      '<xs:element name="a" minOccurs="0"/>',
      'forbidden-global-occurrence',
    ],
    [
      'global max',
      '<xs:element name="a" maxOccurs="2"/>',
      'forbidden-global-occurrence',
    ],
  ])('diagnoses %s', (_name, declarationSource, code) => {
    const result = parseXsd(
      `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">${declarationSource}</xs:schema>`,
    );
    expect(result.diagnostics.map(({ code: actual }) => actual)).toContain(
      code,
    );
    expect(result.status).toBe('failure');
  });

  it('parses anonymous complex and simple type shells', () => {
    const result = parseXsd(anonymousTypes);
    const container = result.schema?.declarations[0] as XsdGlobalElementAst;
    const code = container.anonymousComplexType?.compositor
      ?.members[0] as XsdLocalElementAst;

    expect(container.anonymousComplexType).toMatchObject({
      kind: 'complexType',
      compositor: { compositor: 'sequence' },
    });
    expect(container.anonymousComplexType).not.toHaveProperty('name');
    expect(code.anonymousSimpleType).toMatchObject({
      kind: 'simpleType',
    });
    expect(code.anonymousSimpleType).not.toHaveProperty('name');
    expect(code.anonymousSimpleType?.restriction).toMatchObject({
      kind: 'restriction',
      base: { raw: 'xs:string' },
      enumerations: [],
    });
    expect(result.status).toBe('success');
  });

  it.each([
    [
      'type plus inline',
      '<xs:element name="a" type="xs:string"><xs:complexType/></xs:element>',
      'type-inline-type-conflict',
    ],
    [
      'multiple inline',
      '<xs:element name="a"><xs:complexType/><xs:simpleType/></xs:element>',
      'multiple-inline-types',
    ],
    [
      'unknown QName prefix',
      '<xs:element name="a" type="missing:T"/>',
      'invalid-qname-attribute',
    ],
    [
      'malformed QName',
      '<xs:element name="a" type="a:b:c"/>',
      'invalid-qname-attribute',
    ],
  ])('diagnoses %s conflicts', (_name, declarationSource, code) => {
    const result = parseXsd(
      `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">${declarationSource}</xs:schema>`,
    );
    expect(result.diagnostics.map(({ code: actual }) => actual)).toContain(
      code,
    );
  });
});

describe('XSD local elements, compositors, QNames, and occurrences', () => {
  it('preserves sequence, choice, all, nested models, and ordered members', () => {
    const source = `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:complexType name="Model">
          <xs:sequence>
            <xs:element name="first"/>
            <xs:choice>
              <xs:element name="second"/>
              <xs:all><xs:element name="third"/></xs:all>
            </xs:choice>
          </xs:sequence>
        </xs:complexType>
      </xs:schema>`;
    const model = namedComplexType(source);
    const sequence = model.compositor!;
    const choice = sequence.members[1] as NonNullable<typeof sequence>;
    const all = choice.members[1] as NonNullable<typeof sequence>;

    expect(sequence.compositor).toBe('sequence');
    expect(sequence.members.map(({ kind }) => kind)).toEqual([
      'localElement',
      'compositor',
    ]);
    expect(choice.compositor).toBe('choice');
    expect(all.compositor).toBe('all');
    expect((all.members[0] as XsdLocalElementAst).name).toBe('third');
  });

  it('parses local name/ref, lexical types, inline types, and occurrence defaults', () => {
    const type = namedComplexType(basicStructure);
    const members = type.compositor?.members as XsdLocalElementAst[];
    expect(members[0]).toMatchObject({
      name: 'title',
      type: {
        prefix: 'xs',
        localName: 'string',
        namespaceUri: xmlSchemaNamespaceUri,
      },
      occurrence: { minOccurs: 1, maxOccurs: 1 },
    });
    expect(members[1]).toMatchObject({
      name: 'chapter',
      occurrence: { minOccurs: 0, maxOccurs: 'unbounded' },
    });
    expect(
      members[1]?.occurrence.maxOccursAttribute?.valueContentRange,
    ).toBeDefined();
  });

  it.each([
    ['neither name nor ref', '<xs:element/>', 'missing-local-name-or-ref'],
    [
      'both name and ref',
      '<xs:element name="a" ref="a"/>',
      'conflicting-local-name-ref',
    ],
    [
      'ref and type',
      '<xs:element ref="a" type="xs:string"/>',
      'type-ref-conflict',
    ],
    [
      'ref and inline',
      '<xs:element ref="a"><xs:complexType/></xs:element>',
      'ref-inline-type-conflict',
    ],
  ])('diagnoses local element rule: %s', (_name, member, code) => {
    const result = parseXsd(`
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:complexType name="T"><xs:sequence>${member}</xs:sequence></xs:complexType>
      </xs:schema>`);
    expect(result.diagnostics.map(({ code: actual }) => actual)).toContain(
      code,
    );
  });

  it.each([
    ['negative', '-1', '1'],
    ['plus sign', '+1', '1'],
    ['decimal', '1.5', '2'],
    ['exponent', '1e2', '2'],
    ['padded', ' 1 ', '2'],
    ['empty', '', '2'],
    ['unsafe', '9007199254740992', '9007199254740992'],
    ['unbounded minimum', 'unbounded', 'unbounded'],
  ])('rejects invalid minOccurs lexical form: %s', (_name, min, max) => {
    const result = parseXsd(`
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:complexType name="T"><xs:sequence><xs:element name="a" minOccurs="${min}" maxOccurs="${max}"/></xs:sequence></xs:complexType>
      </xs:schema>`);
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'invalid-occurrence',
    );
  });

  it.each([
    ['negative', '-1'],
    ['sign', '+2'],
    ['decimal', '2.0'],
    ['exponent', '2e1'],
    ['padded', ' 2 '],
    ['unsafe', '9007199254740992'],
  ])('rejects invalid maxOccurs lexical form: %s', (_name, max) => {
    const result = parseXsd(`
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:complexType name="T"><xs:sequence><xs:element name="a" maxOccurs="${max}"/></xs:sequence></xs:complexType>
      </xs:schema>`);
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'invalid-occurrence',
    );
  });

  it('accepts zero, safe large integers, numeric max, and unbounded max', () => {
    const result = parseXsd(`
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:complexType name="T"><xs:sequence>
          <xs:element name="a" minOccurs="0" maxOccurs="9007199254740991"/>
          <xs:element name="b" maxOccurs="unbounded"/>
        </xs:sequence></xs:complexType>
      </xs:schema>`);
    const members = namedComplexType(
      `
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:complexType name="T"><xs:sequence>
          <xs:element name="a" minOccurs="0" maxOccurs="9007199254740991"/>
          <xs:element name="b" maxOccurs="unbounded"/>
        </xs:sequence></xs:complexType>
      </xs:schema>`,
    ).compositor?.members as XsdLocalElementAst[];
    expect(result.diagnostics).toEqual([]);
    expect(members.map(({ occurrence }) => occurrence)).toMatchObject([
      { minOccurs: 0, maxOccurs: 9007199254740991 },
      { minOccurs: 1, maxOccurs: 'unbounded' },
    ]);
  });

  it('diagnoses max below min and multiple direct compositors', () => {
    const result = parseXsd(`
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:complexType name="T">
          <xs:sequence minOccurs="2" maxOccurs="1"/>
          <xs:choice/>
        </xs:complexType>
      </xs:schema>`);
    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'invalid-occurrence',
        'multiple-direct-compositors',
      ]),
    );
  });

  it('resolves explicit QName prefixes using the nearest shadowed binding', () => {
    const result = parseXsd(namespaceShadowing);
    const type = result.schema?.declarations[0] as XsdComplexTypeAst;
    const inside = type.compositor?.members[0] as XsdLocalElementAst;
    const outside = result.schema?.declarations[1] as XsdGlobalElementAst;
    expect(inside.type?.namespaceUri).toBe('urn:inner');
    expect(outside.type?.namespaceUri).toBe('urn:outer');
  });

  it('accepts Unicode local names and preserves exact raw QName spelling', () => {
    const result = parseXsd(`
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:t">
        <xs:element name="élément" type="t:Τύπος"/>
      </xs:schema>`);
    const global = result.schema?.declarations[0] as XsdGlobalElementAst;
    expect(global.name).toBe('élément');
    expect(global.type).toMatchObject({
      raw: 't:Τύπος',
      prefix: 't',
      localName: 'Τύπος',
      namespaceUri: 'urn:t',
    });
  });
});

describe('XSD unsupported, malformed, and deferred structures', () => {
  it('projects annotations and preserves unrelated foreign content without an error', () => {
    const result = parseXsd(annotationsAndForeign);
    expect(result.status).toBe('success');
    expect(result.schema?.deferredComponents).toMatchObject([
      { localName: 'panel', namespaceUri: 'urn:tool', reason: 'foreign' },
    ]);
    expect(result.schema?.annotations[0]?.entries).toMatchObject([
      { kind: 'documentation', text: 'Example schema' },
      { kind: 'appInfo', text: '' },
    ]);
  });

  it('extracts schema relationships while preserving their subtrees', () => {
    const result = parseXsd(unsupportedComponents);
    expect(result.status).toBe('success');
    const warnings = result.diagnostics.filter(
      ({ severity }) => severity === 'warning',
    );
    expect(warnings).toHaveLength(0);
    expect(result.schema?.relationships).toMatchObject([
      { kind: 'import' },
      { kind: 'include', schemaLocation: { value: 'shared.xsd' } },
    ]);
    expect(JSON.stringify(result.document)).toContain('schemaLocation');
    expect(JSON.stringify(result.document)).toContain('enumeration');
    expect(JSON.stringify(result.document)).toContain('extension');
    expect(JSON.stringify(result.document)).toContain('attribute');
  });

  it('keeps warnings distinct from errors and gates error-bearing results', () => {
    const warningOnly = parseXsd(unsupportedComponents);
    const malformed = parseXsd(malformedXml);
    expect(warningOnly.status).toBe('success');
    expect(
      warningOnly.diagnostics.some(({ severity }) => severity === 'error'),
    ).toBe(false);
    expect(malformed.status).toBe('failure');
    expect(malformed.diagnostics.map(({ stage }) => stage)).toContain('xml');
    expect(malformed.schema).toBeDefined();
  });

  it('does not create graph, project, resolution, or activation data', () => {
    const result = parseXsd(basicStructure);
    const serialized = JSON.stringify(result);
    for (const prohibited of [
      '"nodes"',
      '"edges"',
      '"rootNodeIds"',
      '"projectId"',
      '"activeProject"',
      '"resolvedDeclaration"',
    ]) {
      expect(serialized).not.toContain(prohibited);
    }
  });

  it('preserves source IDs, ranges, and deterministic diagnostics', () => {
    const source =
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element/></xs:schema>';
    const first = parseXsd(source, 'diagnostic.xsd');
    const second = parseXsd(source, 'diagnostic.xsd');
    expect(first).toEqual(second);
    expect(first.diagnostics[0]).toMatchObject({
      stage: 'xsd',
      code: 'missing-declaration-name',
      severity: 'error',
      sourceId: 'diagnostic.xsd',
      range: { sourceId: 'diagnostic.xsd' },
    });
    expect(first.diagnostics[0]?.message).toContain('line 1, column');
  });

  it('uses the occurrences fixture without flattening compositor structure', () => {
    const type = namedComplexType(occurrences);
    expect(type.compositor).toMatchObject({
      compositor: 'sequence',
      occurrence: { minOccurs: 0, maxOccurs: 2 },
      members: [
        {
          kind: 'localElement',
          occurrence: { minOccurs: 0, maxOccurs: 'unbounded' },
        },
      ],
    });
  });
});
