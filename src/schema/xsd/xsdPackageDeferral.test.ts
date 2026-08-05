import { describe, expect, it } from 'vitest';
import { importXsdSource } from './xsdImport';
import type {
  XsdMetadataByNodeId,
  XsdNormalizedReference,
} from './xsdProjectMetadata';

const options = {
  projectId: 'package-member',
  displayName: 'member.xsd',
  sourceFileId: 'package-source',
  sourceFilename: 'member.xsd',
} as const;

const missingReferences = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
  xmlns:tns="urn:package" targetNamespace="urn:package">
  <xs:element name="root" type="tns:MissingType"/>
  <xs:complexType name="Container">
    <xs:sequence><xs:element ref="tns:MissingElement"/></xs:sequence>
    <xs:attribute ref="tns:MissingAttribute"/>
  </xs:complexType>
  <xs:simpleType name="Code">
    <xs:restriction base="tns:MissingSimple"/>
  </xs:simpleType>
  <xs:complexType name="Child">
    <xs:complexContent>
      <xs:extension base="tns:MissingComplex"/>
    </xs:complexContent>
  </xs:complexType>
</xs:schema>`;

function collectReferences(
  metadataByNodeId: XsdMetadataByNodeId,
): readonly XsdNormalizedReference[] {
  const references: XsdNormalizedReference[] = [];
  for (const metadata of Object.values(metadataByNodeId)) {
    for (const reference of [
      metadata.typeReference,
      metadata.elementReference,
      metadata.attributeReference,
      metadata.restrictionBaseReference,
      metadata.complexTypeDerivation?.baseReference,
    ]) {
      if (reference) references.push(reference);
    }
  }
  return references;
}

describe('XSD package unresolved-reference policy', () => {
  it('preserves default single-file unresolved-reference errors', () => {
    const result = importXsdSource(missingReferences, options);

    expect(result.status).toBe('failure');
    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'unresolved-type-reference',
        'unresolved-element-reference',
        'unresolved-attribute-reference',
        'unresolved-restriction-base',
        'unresolved-complex-type-base',
      ]),
    );
    expect(
      result.diagnostics.every(
        (diagnostic) =>
          !String(diagnostic.code).startsWith('external-') ||
          diagnostic.severity === 'warning',
      ),
    ).toBe(true);
  });

  it('defers every eligible missing reference with complete metadata', () => {
    const result = importXsdSource(missingReferences, {
      ...options,
      unresolvedReferencePolicy: 'deferForPackage',
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    const references = collectReferences(result.xsdMetadataByNodeId).filter(
      (reference) => reference.resolution === 'externalDeferred',
    );

    expect(new Set(references.map((reference) => reference.kind))).toEqual(
      new Set([
        'type',
        'element',
        'attribute',
        'restrictionBase',
        'complexTypeBase',
      ]),
    );
    expect(
      references.every(
        (reference) =>
          reference.raw &&
          reference.localName &&
          reference.namespaceUri === 'urn:package' &&
          reference.range.sourceId === options.sourceFileId,
      ),
    ).toBe(true);
    expect(
      result.diagnostics.every(({ severity }) => severity === 'warning'),
    ).toBe(true);
  });

  it('leaves built-ins and same-document references resolved', () => {
    const result = importXsdSource(
      `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
        xmlns:tns="urn:package" targetNamespace="urn:package">
        <xs:simpleType name="Code"><xs:restriction base="xs:string"/></xs:simpleType>
        <xs:element name="root" type="tns:Code"/>
      </xs:schema>`,
      { ...options, unresolvedReferencePolicy: 'deferForPackage' },
    );

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    const references = collectReferences(result.xsdMetadataByNodeId);
    expect(references.map((reference) => reference.resolution)).toEqual(
      expect.arrayContaining(['resolved']),
    );
  });

  it('keeps definite same-document wrong-kind targets fatal', () => {
    const result = importXsdSource(
      `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
        xmlns:tns="urn:package" targetNamespace="urn:package">
        <xs:complexType name="Complex"/>
        <xs:attribute name="code" type="tns:Complex"/>
      </xs:schema>`,
      { ...options, unresolvedReferencePolicy: 'deferForPackage' },
    );

    expect(result.status).toBe('failure');
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'invalid-attribute-type-target',
    );
  });
});
