import { describe, expect, it } from 'vitest';
import { getOutgoingEdges, getOutgoingStructuralRelationships } from '../model';
import enumerationsSource from '../../../tests/fixtures/xsd/simple-type-enumerations.xsd?raw';
import errorsSource from '../../../tests/fixtures/xsd/simple-type-restriction-errors.xsd?raw';
import externalSource from '../../../tests/fixtures/xsd/external-restriction-base.xsd?raw';
import cycleSource from '../../../tests/fixtures/xsd/restriction-cycle.xsd?raw';
import { buildXsdSchemaProject, importXsdSource, parseXsd } from './index';

const options = {
  projectId: 'simple-type-restrictions',
  displayName: 'Simple type restrictions',
  sourceFileId: 'simple-types.xsd',
  sourceFilename: 'simple-types.xsd',
};

function build(source: string) {
  const parsed = parseXsd(source, options.sourceFileId);
  expect(parsed.schema).toBeDefined();
  return {
    parsed,
    built: buildXsdSchemaProject(parsed.schema!, source, options),
  };
}

describe('XSD simple type restriction parser', () => {
  it('parses bases and ordered enumeration values without normalizing duplicates or empty strings', () => {
    const parsed = parseXsd(enumerationsSource, options.sourceFileId);
    expect(parsed.status).toBe('success');
    expect(parsed.diagnostics).toEqual([]);
    const statusType = parsed.schema?.declarations.find(
      ({ kind, name }) => kind === 'simpleType' && name === 'StatusType',
    );
    expect(statusType?.kind).toBe('simpleType');
    if (statusType?.kind !== 'simpleType') return;
    expect(statusType.restriction?.base).toMatchObject({
      raw: 'xs:string',
      prefix: 'xs',
      localName: 'string',
    });
    expect(
      statusType.restriction?.enumerations.map(({ value, lexicalValue }) => [
        value,
        lexicalValue,
      ]),
    ).toEqual([
      ['active', 'active'],
      ['paused', 'paused'],
      ['active', 'active'],
      ['', ''],
      [
        'a-very-long-status-value-that-must-wrap-safely-in-the-inspector',
        'a-very-long-status-value-that-must-wrap-safely-in-the-inspector',
      ],
    ]);
    expect(
      statusType.restriction?.enumerations.every(
        (facet) =>
          facet.valueRange &&
          facet.valueRange.end.offset - facet.valueRange.start.offset ===
            facet.lexicalValue?.length,
      ),
    ).toBe(true);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
    expect(parseXsd(enumerationsSource, options.sourceFileId)).toEqual(parsed);
  });

  it('supports restriction shells and anonymous simple type restrictions', () => {
    const shell = parseXsd(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:simpleType name="Shell"/></xs:schema>',
      'shell.xsd',
    );
    expect(shell.status).toBe('success');
    const shellType = shell.schema?.declarations.find(
      ({ kind }) => kind === 'simpleType',
    );
    expect(
      shellType?.kind === 'simpleType' ? shellType.restriction : null,
    ).toBe(undefined);

    const parsed = parseXsd(enumerationsSource, options.sourceFileId);
    const root = parsed.schema?.declarations.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'root',
    );
    const anonymousRestriction =
      root?.kind === 'globalElement'
        ? root.anonymousComplexType?.attributes[1]?.anonymousSimpleType
            ?.restriction
        : undefined;
    expect(anonymousRestriction?.base?.raw).toBe('xs:string');
    expect(
      anonymousRestriction?.enumerations.map(({ value }) => value),
    ).toEqual(['inner', '']);
  });

  it('reuses QName parsing for unprefixed, arbitrary-prefix, malformed, and undeclared bases', () => {
    const unprefixed = parseXsd(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:simpleType name="T"><xs:restriction base="Base"/></xs:simpleType></xs:schema>',
      'unprefixed.xsd',
    );
    const simple = unprefixed.schema?.declarations.find(
      ({ kind }) => kind === 'simpleType',
    );
    expect(
      simple?.kind === 'simpleType' && simple.restriction?.base,
    ).toMatchObject({
      raw: 'Base',
      localName: 'Base',
    });
    expect(
      simple?.kind === 'simpleType'
        ? simple.restriction?.base?.namespaceUri
        : undefined,
    ).toBeUndefined();

    const alternate = parseXsd(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:a="urn:a"><xs:simpleType name="T"><xs:restriction base="a:Base"/></xs:simpleType></xs:schema>',
      'alternate.xsd',
    );
    const alternateType = alternate.schema?.declarations.find(
      ({ kind }) => kind === 'simpleType',
    );
    expect(
      alternateType?.kind === 'simpleType'
        ? alternateType.restriction?.base
        : undefined,
    ).toMatchObject({
      raw: 'a:Base',
      prefix: 'a',
      namespaceUri: 'urn:a',
    });

    for (const base of ['missing:Base', 'not a qname']) {
      const invalid = parseXsd(
        `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:simpleType name="T"><xs:restriction base="${base}"/></xs:simpleType></xs:schema>`,
        'invalid.xsd',
      );
      expect(invalid.status).toBe('failure');
      expect(invalid.diagnostics.map(({ code }) => code)).toContain(
        'invalid-qname-attribute',
      );
    }
  });

  it('reports missing values and conflicting varieties without throwing', () => {
    const parsed = parseXsd(errorsSource, 'errors.xsd');
    expect(parsed.status).toBe('failure');
    expect(parsed.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'missing-restriction-base',
        'missing-enumeration-value',
        'multiple-simple-type-restrictions',
        'multiple-simple-type-varieties',
      ]),
    );
  });

  it('parses annotations, retains newly projected facets, and diagnoses misplaced restrictions', () => {
    const deferred = parseXsd(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:simpleType name="T"><xs:annotation/><xs:restriction base="xs:string"><xs:annotation/><xs:enumeration value="x"><xs:annotation/></xs:enumeration><xs:pattern value="[a-z]+"/></xs:restriction></xs:simpleType><xs:simpleType name="Listed"><xs:list itemType="xs:string"/></xs:simpleType></xs:schema>',
      'deferred.xsd',
    );
    expect(deferred.status).toBe('success');
    expect(
      deferred.diagnostics.filter(
        ({ code }) => code === 'unsupported-xsd-component',
      ),
    ).toHaveLength(0);
    const restricted = deferred.schema?.declarations.find(
      ({ kind, name }) => kind === 'simpleType' && name === 'T',
    );
    expect(
      restricted?.kind === 'simpleType'
        ? restricted.restriction?.deferredComponents.map(({ reason }) => reason)
        : [],
    ).toEqual(['unsupported-xsd']);
    expect(
      restricted?.kind === 'simpleType'
        ? restricted.annotations.length +
            (restricted.restriction?.annotations.length ?? 0) +
            (restricted.restriction?.enumerations[0]?.annotations.length ?? 0)
        : undefined,
    ).toBe(3);
    expect(
      restricted?.kind === 'simpleType'
        ? restricted.restriction?.enumerations[0]?.deferredComponents
        : undefined,
    ).toEqual([]);

    const misplaced = parseXsd(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="root"><xs:restriction base="xs:string"/></xs:element></xs:schema>',
      'misplaced.xsd',
    );
    expect(misplaced.status).toBe('failure');
    expect(misplaced.diagnostics.map(({ code }) => code)).toEqual([
      'invalid-restriction-placement',
    ]);
  });
});

describe('XSD simple type restriction builder', () => {
  it('creates deterministic restriction layers and individually navigable enumerations', () => {
    const imported = importXsdSource(enumerationsSource, options);
    expect(imported.status).toBe('success');
    if (imported.status !== 'success') return;
    const statusType = imported.project.nodes.find(
      ({ kind, name }) => kind === 'simpleType' && name === 'StatusType',
    )!;
    const restrictionRelationship = getOutgoingStructuralRelationships(
      imported.project,
      statusType.id,
    ).find(({ node }) => node.kind === 'restriction')!;
    expect(restrictionRelationship.edge.kind).toBe('contains');
    expect(restrictionRelationship.node.id).toMatch(
      /^xsd:restriction:simple-types\.xsd:\d+-\d+$/,
    );
    const restrictionMetadata =
      imported.xsdMetadataByNodeId[restrictionRelationship.node.id]!;
    expect(restrictionMetadata.restrictionBaseReference).toMatchObject({
      kind: 'restrictionBase',
      raw: 'xs:string',
      resolution: 'resolved',
      targetNodeId: 'xsd:builtInType:string',
    });
    expect(
      restrictionMetadata.enumerationValues?.map(({ value }) => value),
    ).toEqual([
      'active',
      'paused',
      'active',
      '',
      'a-very-long-status-value-that-must-wrap-safely-in-the-inspector',
    ]);
    expect(restrictionMetadata.enumerationCount).toBe(5);
    expect(
      imported.project.nodes
        .filter(({ kind }) => kind === 'enumeration')
        .map(({ id }) => imported.xsdMetadataByNodeId[id]?.facet?.value),
    ).toEqual([
      'base',
      'active',
      'paused',
      'active',
      '',
      'a-very-long-status-value-that-must-wrap-safely-in-the-inspector',
      'alpha',
      'beta',
      'inner',
      '',
    ]);
    expect(
      imported.project.edges.some(({ sourceNodeId, targetNodeId }) =>
        [sourceNodeId, targetNodeId].some((id) => id.includes('enumeration')),
      ),
    ).toBe(true);
    expect(imported.xsdMetadataByNodeId[statusType.id]).toMatchObject({
      enumerationCount: 5,
      restrictionBaseReference: { raw: 'xs:string' },
    });
  });

  it('rejects invalid restriction facet ranges before project construction', () => {
    const parsed = parseXsd(enumerationsSource, options.sourceFileId);
    const statusType = parsed.schema?.declarations.find(
      ({ kind, name }) => kind === 'simpleType' && name === 'StatusType',
    );
    if (statusType?.kind !== 'simpleType' || !statusType.restriction) {
      throw new Error('Expected the StatusType restriction AST.');
    }
    Object.assign(statusType.restriction.enumerations[0]!.valueRange!.end, {
      offset: enumerationsSource.length + 1,
    });

    const built = buildXsdSchemaProject(
      parsed.schema!,
      enumerationsSource,
      options,
    );
    expect(built.project).toBeUndefined();
    expect(built.diagnostics.map(({ code }) => code)).toContain(
      'invalid-source-range',
    );
  });

  it('resolves named bases with restricts edges and defers external bases', () => {
    const imported = importXsdSource(enumerationsSource, options);
    expect(imported.status).toBe('success');
    if (imported.status !== 'success') return;
    const identifierType = imported.project.nodes.find(
      ({ kind, name }) => kind === 'simpleType' && name === 'IdentifierType',
    )!;
    const identifierRestriction = getOutgoingEdges(
      imported.project,
      identifierType.id,
    )
      .map(({ targetNodeId }) =>
        imported.project.nodes.find(({ id }) => id === targetNodeId),
      )
      .find((node) => node?.kind === 'restriction')!;
    const restricts = getOutgoingEdges(
      imported.project,
      identifierRestriction.id,
    ).find(({ kind }) => kind === 'restricts')!;
    expect(
      imported.project.nodes.find(({ id }) => id === restricts.targetNodeId),
    ).toMatchObject({ kind: 'simpleType', name: 'BaseToken' });

    const external = importXsdSource(externalSource, {
      ...options,
      sourceFileId: 'external.xsd',
    });
    expect(external.status).toBe('success');
    if (external.status === 'success') {
      expect(external.diagnostics.map(({ code }) => code)).toContain(
        'external-restriction-base-deferred',
      );
      const restriction = external.project.nodes.find(
        ({ kind }) => kind === 'restriction',
      )!;
      expect(
        external.xsdMetadataByNodeId[restriction.id]?.restrictionBaseReference,
      ).toMatchObject({
        raw: 'ext:ExternalToken',
        resolution: 'externalDeferred',
      });
      expect(
        getOutgoingEdges(external.project, restriction.id).some(
          ({ kind }) => kind === 'restricts',
        ),
      ).toBe(false);
    }
  });

  it('rejects unresolved and complex restriction bases', () => {
    const missing = build(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:simpleType name="T"><xs:restriction base="Missing"/></xs:simpleType></xs:schema>',
    ).built;
    expect(missing.project).toBeUndefined();
    expect(missing.diagnostics.map(({ code }) => code)).toContain(
      'unresolved-restriction-base',
    );

    const complex = build(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:complexType name="Wrong"/><xs:simpleType name="T"><xs:restriction base="Wrong"/></xs:simpleType></xs:schema>',
    ).built;
    expect(complex.project).toBeUndefined();
    expect(complex.diagnostics.map(({ code }) => code)).toContain(
      'invalid-restriction-base-target',
    );
  });

  it('uses established no-target and default-namespace QName semantics', () => {
    const noTarget = build(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:simpleType name="Base"/><xs:simpleType name="Derived"><xs:restriction base="Base"/></xs:simpleType></xs:schema>',
    ).built;
    expect(noTarget.project).toBeDefined();
    if (!noTarget.project) throw new Error('Expected a no-target project.');
    const restriction = noTarget.project.nodes.find(
      ({ kind }) => kind === 'restriction',
    )!;
    expect(
      getOutgoingEdges(noTarget.project, restriction.id).some(
        ({ kind }) => kind === 'restricts',
      ),
    ).toBe(true);

    const noGuessing = build(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:t"><xs:simpleType name="Base"/><xs:simpleType name="Derived"><xs:restriction base="Base"/></xs:simpleType></xs:schema>',
    ).built;
    expect(noGuessing.project).toBeDefined();
    expect(noGuessing.diagnostics.map(({ code }) => code)).toContain(
      'external-restriction-base-deferred',
    );
  });

  it('preserves self and mutual restriction cycles as graph edges', () => {
    const imported = importXsdSource(cycleSource, {
      ...options,
      sourceFileId: 'cycle.xsd',
    });
    expect(imported.status).toBe('success');
    if (imported.status !== 'success') return;
    expect(
      imported.project.edges.filter(({ kind }) => kind === 'restricts'),
    ).toHaveLength(2);
    expect(imported.initialFocusNodeId).toBe(
      imported.project.nodes.find(
        ({ kind, name }) => kind === 'globalElement' && name === 'root',
      )?.id,
    );
    expect(JSON.parse(JSON.stringify(imported.xsdMetadataByNodeId))).toEqual(
      imported.xsdMetadataByNodeId,
    );
  });
});
