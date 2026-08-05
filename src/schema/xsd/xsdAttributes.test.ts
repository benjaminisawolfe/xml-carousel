import { describe, expect, it } from 'vitest';
import { getOutgoingEdges, getOutgoingStructuralRelationships } from '../model';
import attributesSource from '../../../tests/fixtures/xsd/attributes.xsd?raw';
import attributeErrorsSource from '../../../tests/fixtures/xsd/attribute-errors.xsd?raw';
import externalReferenceSource from '../../../tests/fixtures/xsd/external-attribute-reference.xsd?raw';
import noTargetSource from '../../../tests/fixtures/xsd/no-target-attributes.xsd?raw';
import { buildXsdSchemaProject, importXsdSource, parseXsd } from './index';

const options = {
  projectId: 'attributes',
  displayName: 'Attributes',
  sourceFileId: 'attributes.xsd',
  sourceFilename: 'attributes.xsd',
};

function build(source: string) {
  const parsed = parseXsd(source, options.sourceFileId);
  expect(parsed.schema).toBeDefined();
  return {
    parsed,
    built: buildXsdSchemaProject(parsed.schema!, source, options),
  };
}

describe('XSD attribute parser', () => {
  it('parses global, named, referenced, constrained, and anonymous attributes in source order', () => {
    const parsed = parseXsd(attributesSource, options.sourceFileId);
    expect(parsed.status).toBe('success');
    expect(parsed.diagnostics).toEqual([]);
    const global = parsed.schema?.declarations.find(
      ({ kind }) => kind === 'globalAttribute',
    );
    const complex = parsed.schema?.declarations.find(
      ({ kind, name }) => kind === 'complexType' && name === 'RootType',
    );
    expect(global).toMatchObject({
      kind: 'globalAttribute',
      name: 'code',
      type: { raw: 'xs:string', localName: 'string' },
      valueConstraint: {
        kind: 'fixed',
        value: 'GLOBAL',
        lexicalValue: 'GLOBAL',
      },
    });
    expect(complex?.kind).toBe('complexType');
    if (complex?.kind !== 'complexType') return;
    expect(
      complex.attributes.map(({ name, ref, use }) => [name ?? ref?.raw, use]),
    ).toEqual([
      ['id', 'required'],
      ['status', 'optional'],
      ['legacy', 'prohibited'],
      ['lang', 'optional'],
      ['t:code', 'optional'],
      ['rating', 'optional'],
    ]);
    expect(complex.attributes[3]).toMatchObject({
      form: { value: 'qualified', lexicalValue: 'qualified' },
      valueConstraint: { kind: 'fixed', value: 'en' },
    });
    expect(complex.attributes[5]?.anonymousSimpleType?.kind).toBe('simpleType');
    expect(
      complex.attributes.every(
        (attribute, index, all) =>
          index === 0 || all[index - 1]!.sourceOrder < attribute.sourceOrder,
      ),
    ).toBe(true);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
  });

  it('reports the complete supported conflict vocabulary without throwing', () => {
    const cases: readonly [string, string][] = [
      ['<xs:attribute/>', 'missing-global-attribute-name'],
      ['<xs:attribute name="a" ref="a"/>', 'forbidden-global-attribute-ref'],
      [
        '<xs:attribute name="a" use="required"/>',
        'forbidden-global-attribute-use',
      ],
      [
        '<xs:attribute name="a" form="qualified"/>',
        'forbidden-global-attribute-form',
      ],
      [
        '<xs:complexType name="T"><xs:attribute/></xs:complexType>',
        'missing-local-attribute-name-or-ref',
      ],
      [
        '<xs:complexType name="T"><xs:attribute name="a" ref="a"/></xs:complexType>',
        'conflicting-local-attribute-name-ref',
      ],
      [
        '<xs:complexType name="T"><xs:attribute name="a" use="sometimes"/></xs:complexType>',
        'invalid-attribute-use',
      ],
      [
        '<xs:complexType name="T"><xs:attribute name="a" form="sometimes"/></xs:complexType>',
        'invalid-attribute-form',
      ],
      [
        '<xs:complexType name="T"><xs:attribute name="a" type="xs:string"><xs:simpleType/></xs:attribute></xs:complexType>',
        'attribute-type-inline-type-conflict',
      ],
      [
        '<xs:complexType name="T"><xs:attribute ref="a" type="xs:string"/></xs:complexType>',
        'attribute-ref-type-conflict',
      ],
      [
        '<xs:complexType name="T"><xs:attribute ref="a"><xs:simpleType/></xs:attribute></xs:complexType>',
        'attribute-ref-inline-type-conflict',
      ],
      [
        '<xs:complexType name="T"><xs:attribute ref="a" form="qualified"/></xs:complexType>',
        'attribute-ref-form-conflict',
      ],
      [
        '<xs:complexType name="T"><xs:attribute name="a" default="x" fixed="y"/></xs:complexType>',
        'attribute-default-fixed-conflict',
      ],
    ];
    for (const [body, expectedCode] of cases) {
      const source = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">${body}</xs:schema>`;
      const parsed = parseXsd(source, 'case.xsd');
      expect(parsed.status, expectedCode).toBe('failure');
      expect(
        parsed.diagnostics.some(({ code }) => code === expectedCode),
        expectedCode,
      ).toBe(true);
    }
  });

  it('enforces compositor-before-attributes while deferring annotations and unsupported attribute containers', () => {
    const invalid = parseXsd(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:complexType name="T"><xs:attribute name="a"/><xs:sequence/></xs:complexType></xs:schema>',
      'placement.xsd',
    );
    expect(invalid.diagnostics.map(({ code }) => code)).toContain(
      'invalid-attribute-placement',
    );

    const deferred = parseXsd(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:complexType name="T"><xs:annotation/><xs:attributeGroup ref="g"/><xs:anyAttribute/></xs:complexType></xs:schema>',
      'deferred.xsd',
    );
    expect(deferred.status).toBe('success');
    expect(
      deferred.diagnostics.filter(
        ({ code }) => code === 'unsupported-xsd-component',
      ),
    ).toHaveLength(0);
  });

  it('blocks import on attribute parser errors without attempting a project result', () => {
    const imported = importXsdSource(attributeErrorsSource, options);
    expect(imported.status).toBe('failure');
    if (imported.status === 'failure') {
      expect(imported.diagnostics.map(({ code }) => code)).toContain(
        'attribute-default-fixed-conflict',
      );
    }
  });
});

describe('XSD attribute project builder', () => {
  it('builds nonstructural attribute nodes, ownership, references, types, forms, and constraints', () => {
    const imported = importXsdSource(attributesSource, options);
    expect(imported.status).toBe('success');
    if (imported.status !== 'success') return;
    const attributes = imported.project.nodes.filter(
      ({ kind }) => kind === 'attribute',
    );
    expect(attributes).toHaveLength(6);
    const attributeReferences = imported.project.nodes.filter(
      ({ kind }) => kind === 'attributeReference',
    );
    expect(attributeReferences).toHaveLength(1);
    const global = attributes.find(
      ({ id }) => imported.xsdMetadataByNodeId[id]?.scope === 'global',
    )!;
    const complex = imported.project.nodes.find(
      ({ kind, name }) => kind === 'complexType' && name === 'RootType',
    )!;
    const localEdges = getOutgoingEdges(imported.project, complex.id).filter(
      ({ kind }) => kind === 'usesAttribute',
    );
    expect(localEdges).toHaveLength(6);
    expect(
      getOutgoingStructuralRelationships(imported.project, complex.id).some(
        ({ node }) => node.kind === 'attribute',
      ),
    ).toBe(false);
    expect(
      getOutgoingEdges(imported.project, imported.project.rootNodeIds[0]!).some(
        ({ targetNodeId }) => targetNodeId === global.id,
      ),
    ).toBe(true);

    const byName = attributes.reduce<
      Record<string, (typeof attributes)[number]>
    >((nodesByName, node) => {
      nodesByName[node.name] = node;
      return nodesByName;
    }, {});
    expect(imported.xsdMetadataByNodeId[byName.id!.id]).toMatchObject({
      attributeUse: 'required',
      typeReference: {
        resolution: 'resolved',
        raw: 'xs:ID',
        targetNodeId: 'xsd:builtInType:ID',
      },
      attributeForm: { resolution: 'inherited', value: 'unqualified' },
    });
    expect(imported.xsdMetadataByNodeId[byName.status!.id]).toMatchObject({
      typeReference: { resolution: 'resolved' },
      valueConstraint: { kind: 'default', value: 'active' },
    });
    expect(imported.xsdMetadataByNodeId[byName.legacy!.id]).toMatchObject({
      attributeUse: 'prohibited',
      implicitAttributeType: 'xs:anySimpleType',
    });
    expect(imported.xsdMetadataByNodeId[byName.lang!.id]).toMatchObject({
      attributeForm: { resolution: 'explicit', value: 'qualified' },
      targetNamespace: 'urn:attributes',
      valueConstraint: { kind: 'fixed', value: 'en' },
    });
    const referenceUse = attributeReferences.find(
      ({ name }) => name === 't:code',
    )!;
    expect(imported.xsdMetadataByNodeId[referenceUse.id]).toMatchObject({
      attributeReference: {
        kind: 'attribute',
        resolution: 'resolved',
        targetNodeId: global.id,
      },
    });
    expect(
      getOutgoingEdges(imported.project, referenceUse.id).some(
        ({ kind, targetNodeId }) =>
          kind === 'references' && targetNodeId === global.id,
      ),
    ).toBe(true);
    const rating = byName.rating!;
    expect(
      getOutgoingEdges(imported.project, rating.id).some(
        ({ kind, targetNodeId }) =>
          kind === 'typeOf' &&
          imported.project.nodes.find(({ id }) => id === targetNodeId)?.kind ===
            'simpleType',
      ),
    ).toBe(true);
    expect(imported.initialFocusNodeId).toBe(
      imported.project.nodes.find(({ name }) => name === 'root')?.id,
    );
  });

  it('keeps attribute symbols separate and rejects duplicate declarations, uses, and complex type targets', () => {
    const duplicateGlobal = build(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="same"/><xs:attribute name="same"/><xs:attribute name="same"/></xs:schema>',
    ).built;
    expect(duplicateGlobal.project).toBeUndefined();
    expect(duplicateGlobal.diagnostics[0]).toMatchObject({
      code: 'duplicate-global-attribute',
    });
    expect(duplicateGlobal.diagnostics[0]?.relatedRange).toBeDefined();

    const duplicateUse = build(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:complexType name="T"><xs:attribute name="a"/><xs:attribute name="a"/></xs:complexType></xs:schema>',
    ).built;
    expect(duplicateUse.diagnostics.map(({ code }) => code)).toContain(
      'duplicate-attribute-use',
    );

    const complexTarget = build(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:t" targetNamespace="urn:t"><xs:complexType name="Wrong"/><xs:attribute name="a" type="t:Wrong"/></xs:schema>',
    ).built;
    expect(complexTarget.diagnostics.map(({ code }) => code)).toContain(
      'invalid-attribute-type-target',
    );
  });

  it('defers external attribute references and normalizes no-target attributes safely', () => {
    const external = importXsdSource(externalReferenceSource, {
      ...options,
      sourceFileId: 'external.xsd',
    });
    expect(external.status).toBe('success');
    if (external.status === 'success') {
      expect(external.diagnostics.map(({ code }) => code)).toEqual(
        expect.arrayContaining([
          'external-attribute-reference-deferred',
          'external-type-reference-deferred',
        ]),
      );
      const refMetadata = Object.values(external.xsdMetadataByNodeId).find(
        ({ attributeReference }) => attributeReference,
      );
      expect(refMetadata?.attributeReference?.resolution).toBe(
        'externalDeferred',
      );
    }

    const noTarget = importXsdSource(noTargetSource, {
      ...options,
      sourceFileId: 'no-target.xsd',
    });
    expect(noTarget.status).toBe('success');
    if (noTarget.status === 'success') {
      const local = noTarget.project.nodes.find(
        ({ kind, name }) => kind === 'attribute' && name === 'local',
      )!;
      expect(noTarget.xsdMetadataByNodeId[local.id]).toMatchObject({
        attributeForm: { resolution: 'inherited', value: 'qualified' },
      });
      expect(noTarget.xsdMetadataByNodeId[local.id]).not.toHaveProperty(
        'targetNamespace',
      );
    }
  });
});
