import { describe, expect, it } from 'vitest';
import {
  getOutgoingEdges,
  getOutgoingStructuralRelationships,
  validateSchemaProject,
} from '../model';
import validSource from '../../../tests/fixtures/xsd/complex-type-derivations.xsd?raw';
import externalSource from '../../../tests/fixtures/xsd/external-complex-type-base.xsd?raw';
import errorSource from '../../../tests/fixtures/xsd/complex-type-derivation-errors.xsd?raw';
import cycleSource from '../../../tests/fixtures/xsd/complex-type-derivation-cycles.xsd?raw';
import {
  buildXsdSchemaProject,
  importXsdSource,
  parseXsd,
  type XsdComplexTypeAst,
} from './index';
import {
  formatXsdComplexTypeBase,
  selectXsdComplexTypeDerivationPresentation,
} from '../../ui/presentation/xsdComplexTypeDerivationPresentation';
import { selectXsdRestrictionPresentation } from '../../ui/presentation/xsdRestrictionPresentation';
import { selectXsdNodePresentation } from '../../ui/presentation/xsdMetadataPresentation';
import {
  buildJourneyRelationshipPresentation,
  formatOutgoingRelationshipLabel,
  formatTerminalCycleRelationshipLabel,
} from '../../ui/presentation/schemaRelationshipPresentation';
import { buildFocusCardSummary } from '../../ui/carousel/focusCardSummary';
import { buildInspectorSummary } from '../../ui/inspector/inspectorSummary';

const options = {
  projectId: 'complex-type-derivations',
  displayName: 'Complex type derivations',
  sourceFileId: 'complex-type-derivations.xsd',
  sourceFilename: 'complex-type-derivations.xsd',
};

function importValid() {
  const result = importXsdSource(validSource, options);
  expect(result.status).toBe('success');
  if (result.status !== 'success') {
    throw new Error('Expected the valid complex derivation fixture to import.');
  }
  return result;
}

function namedComplexType(
  declarations: readonly { readonly kind: string; readonly name?: string }[],
  name: string,
): XsdComplexTypeAst {
  const declaration = declarations.find(
    ({ kind, name: candidateName }) =>
      kind === 'complexType' && candidateName === name,
  );
  if (!declaration || declaration.kind !== 'complexType') {
    throw new Error(`Expected complex type ${name}.`);
  }
  return declaration as XsdComplexTypeAst;
}

describe('XSD complex-type derivation parser', () => {
  it('parses extension and restriction wrappers, exact bases, bodies, attributes, and source order', () => {
    const parsed = parseXsd(validSource, options.sourceFileId);
    expect(parsed.status).toBe('success');
    expect(parsed.diagnostics).toEqual([]);
    const declarations = parsed.schema?.declarations ?? [];
    const extending = namedComplexType(declarations, 'BeforeDerived');
    const restricting = namedComplexType(declarations, 'Restricted');

    expect(extending.compositor).toBeUndefined();
    expect(extending.attributes).toEqual([]);
    expect(extending.complexContent?.kind).toBe('complexContent');
    expect(extending.complexContent?.derivation).toMatchObject({
      kind: 'extension',
      base: {
        raw: 'd:BaseLater',
        prefix: 'd',
        localName: 'BaseLater',
        namespaceUri: 'urn:derivations',
      },
      compositor: { kind: 'compositor', compositor: 'sequence' },
    });
    expect(
      extending.complexContent?.derivation?.attributes.map(({ name, use }) => [
        name,
        use,
      ]),
    ).toEqual([['beforeCode', 'required']]);
    expect(restricting.complexContent?.derivation).toMatchObject({
      kind: 'restriction',
      base: { raw: 'd:BaseEarlier' },
      compositor: { compositor: 'all' },
    });
    const base = extending.complexContent?.derivation?.base;
    expect(
      base
        ? validSource.slice(base.range.start.offset, base.range.end.offset)
        : '',
    ).toBe('d:BaseLater');
    expect(
      extending.complexContent!.sourceOrder <
        extending.complexContent!.derivation!.sourceOrder,
    ).toBe(true);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
    expect(parseXsd(validSource, options.sourceFileId)).toEqual(parsed);
  });

  it('parses anonymous, built-in, default-namespace, and no-target derivations', () => {
    const parsed = parseXsd(validSource, options.sourceFileId);
    const anonymous = parsed.schema?.declarations.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'anonymousRoot',
    );
    expect(
      anonymous?.kind === 'globalElement'
        ? anonymous.anonymousComplexType?.complexContent?.derivation?.kind
        : undefined,
    ).toBe('extension');
    const anyType = namedComplexType(
      parsed.schema?.declarations ?? [],
      'AnyTypeDerived',
    );
    expect(anyType.complexContent?.derivation?.base?.raw).toBe('xs:anyType');

    const noTargetSource =
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:complexType name="Base"/><xs:complexType name="Derived"><xs:complexContent><xs:extension base="Base"/></xs:complexContent></xs:complexType></xs:schema>';
    const noTarget = parseXsd(noTargetSource, 'no-target.xsd');
    const derived = namedComplexType(
      noTarget.schema?.declarations ?? [],
      'Derived',
    );
    expect(derived.complexContent?.derivation?.base).toMatchObject({
      raw: 'Base',
      localName: 'Base',
    });
  });

  it('parses direct annotations while preserving foreign, unsupported, and simpleContent children', () => {
    const source =
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:f="urn:f"><xs:complexType name="T"><xs:complexContent><xs:annotation/><xs:extension base="xs:anyType"><xs:annotation/><f:foreign/><xs:group ref="g"/></xs:extension></xs:complexContent></xs:complexType><xs:complexType name="Deferred"><xs:simpleContent><xs:extension base="xs:string"/></xs:simpleContent></xs:complexType></xs:schema>';
    const parsed = parseXsd(source, 'deferred-complex.xsd');
    expect(parsed.status).toBe('success');
    const type = namedComplexType(parsed.schema?.declarations ?? [], 'T');
    expect(type.complexContent?.annotations).toMatchObject([
      { kind: 'annotation', entries: [] },
    ]);
    expect(type.complexContent?.deferredComponents).toEqual([]);
    expect(type.complexContent?.derivation?.annotations).toMatchObject([
      { kind: 'annotation', entries: [] },
    ]);
    expect(
      type.complexContent?.derivation?.deferredComponents.map(
        ({ reason }) => reason,
      ),
    ).toEqual(['foreign', 'unsupported-xsd']);
    const deferred = namedComplexType(
      parsed.schema?.declarations ?? [],
      'Deferred',
    );
    expect(deferred.complexContent).toBeUndefined();
    expect(deferred.deferredComponents).toMatchObject([
      { localName: 'simpleContent', reason: 'unsupported-xsd' },
    ]);
  });

  it('reports dedicated placement and conflict diagnostics without throwing', () => {
    const parsed = parseXsd(errorSource, 'derivation-errors.xsd');
    expect(parsed.status).toBe('failure');
    expect(parsed.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'missing-complex-derivation-base',
        'multiple-complex-content-derivations',
        'missing-complex-content-derivation',
        'multiple-complex-type-content-models',
        'multiple-complex-derivation-compositors',
        'invalid-complex-derivation-element-placement',
        'invalid-complex-derivation-attribute-placement',
        'invalid-complex-derivation-placement',
      ]),
    );
    expect(() => parseXsd(errorSource, 'derivation-errors.xsd')).not.toThrow();

    const multipleContent = parseXsd(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:complexType name="T"><xs:complexContent><xs:extension base="xs:anyType"/></xs:complexContent><xs:complexContent><xs:extension base="xs:anyType"/></xs:complexContent></xs:complexType></xs:schema>',
      'multiple-content.xsd',
    );
    expect(multipleContent.diagnostics.map(({ code }) => code)).toContain(
      'multiple-complex-content',
    );
  });
});

describe('XSD complex-type derivation builder and metadata', () => {
  it('normalizes deterministic derivation doorways and keeps declared bodies beneath them', () => {
    const imported = importValid();
    const derived = imported.project.nodes.find(
      ({ kind, name }) => kind === 'complexType' && name === 'BeforeDerived',
    )!;
    const extension = getOutgoingStructuralRelationships(
      imported.project,
      derived.id,
    ).find(({ node }) => node.kind === 'extension')!;
    expect(extension.edge).toMatchObject({ kind: 'contains', order: 0 });
    expect(extension.node.id).toMatch(
      /^xsd:extension:complex-type-derivations\.xsd:\d+-\d+$/,
    );
    expect(
      getOutgoingEdges(imported.project, derived.id).filter(
        ({ kind }) => kind === 'usesAttribute',
      ),
    ).toEqual([]);
    expect(
      getOutgoingStructuralRelationships(imported.project, extension.node.id)
        .map(({ edge, node }) => [edge.kind, node.kind])
        .sort(),
    ).toEqual([
      ['contains', 'sequence'],
      ['extends', 'complexType'],
    ]);
    expect(
      getOutgoingEdges(imported.project, extension.node.id).filter(
        ({ kind }) => kind === 'usesAttribute',
      ),
    ).toHaveLength(1);
    expect(
      imported.xsdMetadataByNodeId[derived.id]?.complexTypeDerivation,
    ).toMatchObject({
      kind: 'extension',
      baseReference: {
        kind: 'complexTypeBase',
        raw: 'd:BaseLater',
        resolution: 'resolved',
      },
      declaredCompositor: 'sequence',
      declaredAttributeCount: 1,
    });
    expect(
      imported.xsdMetadataByNodeId[extension.node.id]?.complexTypeDerivation,
    ).toEqual(imported.xsdMetadataByNodeId[derived.id]?.complexTypeDerivation);
    expect(validateSchemaProject(imported.project)).toEqual([]);
    expect(JSON.parse(JSON.stringify(imported))).toEqual(imported);
    expect(JSON.stringify(imported)).not.toMatch(
      /"xml"\s*:|"document"|"sourceText"|"namespaceBindings"/,
    );
    expect(importXsdSource(validSource, options)).toEqual(imported);
  });

  it('resolves forward/backward extension and restriction bases with one typed edge', () => {
    const imported = importValid();
    for (const [typeName, nodeKind, edgeKind, baseName] of [
      ['BeforeDerived', 'extension', 'extends', 'BaseLater'],
      ['AfterDerived', 'extension', 'extends', 'BaseEarlier'],
      ['Restricted', 'restriction', 'restricts', 'BaseEarlier'],
    ] as const) {
      const owner = imported.project.nodes.find(
        ({ kind, name }) => kind === 'complexType' && name === typeName,
      )!;
      const derivation = getOutgoingStructuralRelationships(
        imported.project,
        owner.id,
      ).find(({ node }) => node.kind === nodeKind)!.node;
      const baseEdge = getOutgoingEdges(imported.project, derivation.id).filter(
        ({ kind }) => kind === edgeKind,
      );
      expect(baseEdge).toHaveLength(1);
      expect(
        imported.project.nodes.find(
          ({ id }) => id === baseEdge[0]!.targetNodeId,
        ),
      ).toMatchObject({ kind: 'complexType', name: baseName });
    }
  });

  it('makes built-in bases navigable while keeping external bases deferred', () => {
    const imported = importValid();
    const anyType = imported.project.nodes.find(
      ({ kind, name }) => kind === 'complexType' && name === 'AnyTypeDerived',
    )!;
    expect(
      imported.xsdMetadataByNodeId[anyType.id]?.complexTypeDerivation
        ?.baseReference,
    ).toMatchObject({
      kind: 'complexTypeBase',
      raw: 'xs:anyType',
      resolution: 'resolved',
      targetNodeId: 'xsd:builtInType:anyType',
    });
    expect(
      imported.project.nodes.some(({ name }) => name === 'xs:anyType'),
    ).toBe(true);

    const external = importXsdSource(externalSource, {
      ...options,
      sourceFileId: 'external-complex.xsd',
      sourceFilename: 'external-complex.xsd',
    });
    expect(external.status).toBe('success');
    if (external.status !== 'success') return;
    expect(external.diagnostics.map(({ code }) => code)).toContain(
      'external-complex-type-base-deferred',
    );
    const extension = external.project.nodes.find(
      ({ kind }) => kind === 'extension',
    )!;
    expect(
      external.xsdMetadataByNodeId[extension.id]?.complexTypeDerivation
        ?.baseReference,
    ).toMatchObject({
      raw: 'vendor:ExternalBase',
      resolution: 'externalDeferred',
    });
    expect(
      getOutgoingEdges(external.project, extension.id).some(
        ({ kind }) => kind === 'extends',
      ),
    ).toBe(false);
  });

  it('rejects unresolved and simple complex bases and validates exact base ranges', () => {
    for (const [source, code] of [
      [
        '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:complexType name="T"><xs:complexContent><xs:extension base="Missing"/></xs:complexContent></xs:complexType></xs:schema>',
        'unresolved-complex-type-base',
      ],
      [
        '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:simpleType name="S"><xs:restriction base="xs:string"/></xs:simpleType><xs:complexType name="T"><xs:complexContent><xs:restriction base="S"/></xs:complexContent></xs:complexType></xs:schema>',
        'invalid-complex-type-base-target',
      ],
    ] as const) {
      const parsed = parseXsd(source, 'invalid-base.xsd');
      expect(parsed.status).toBe('success');
      const built = buildXsdSchemaProject(parsed.schema!, source, {
        ...options,
        sourceFileId: 'invalid-base.xsd',
      });
      expect(built.project).toBeUndefined();
      expect(
        built.diagnostics.map(({ code: candidate }) => candidate),
      ).toContain(code);
    }

    const parsed = parseXsd(validSource, options.sourceFileId);
    const derived = namedComplexType(
      parsed.schema?.declarations ?? [],
      'BeforeDerived',
    );
    Object.assign(derived.complexContent?.derivation?.base?.range.end ?? {}, {
      offset: validSource.length + 1,
    });
    const built = buildXsdSchemaProject(parsed.schema!, validSource, options);
    expect(built.project).toBeUndefined();
    expect(built.diagnostics.map(({ code }) => code)).toContain(
      'invalid-source-range',
    );
  });

  it('constructs self and mutual cycles without treating them as build errors', () => {
    const imported = importXsdSource(cycleSource, {
      ...options,
      sourceFileId: 'complex-cycles.xsd',
      sourceFilename: 'complex-cycles.xsd',
    });
    expect(imported.status).toBe('success');
    if (imported.status !== 'success') return;
    expect(
      imported.project.edges.filter(
        ({ kind }) => kind === 'extends' || kind === 'restricts',
      ),
    ).toHaveLength(4);
    expect(validateSchemaProject(imported.project)).toEqual([]);
  });
});

describe('XSD complex-type derivation presentation', () => {
  it('presents owners and derivation nodes without confusing complex restrictions with enumerations', () => {
    const imported = importValid();
    for (const [name, kindLabel, nodeKind] of [
      ['BeforeDerived', 'Extension', 'extension'],
      ['Restricted', 'Restriction', 'restriction'],
    ] as const) {
      const owner = imported.project.nodes.find(
        ({ kind, name: candidate }) =>
          kind === 'complexType' && candidate === name,
      )!;
      const derivation = getOutgoingStructuralRelationships(
        imported.project,
        owner.id,
      ).find(({ node }) => node.kind === nodeKind)!.node;
      for (const nodeId of [owner.id, derivation.id]) {
        const presentation = selectXsdComplexTypeDerivationPresentation(
          imported.project,
          nodeId,
          imported.xsdMetadataByNodeId,
        );
        expect(presentation).toMatchObject({
          kindLabel,
          base: { navigable: true },
          declaredAttributeCount: 1,
        });
      }
      expect(
        selectXsdNodePresentation(
          imported.project,
          owner.id,
          imported.xsdMetadataByNodeId,
        )?.properties,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Derivation', value: kindLabel }),
          expect.objectContaining({ label: 'Base type' }),
        ]),
      );
      if (nodeKind === 'restriction') {
        expect(
          selectXsdRestrictionPresentation(
            imported.project,
            derivation.id,
            imported.xsdMetadataByNodeId,
          ),
        ).toBeUndefined();
        expect(
          buildInspectorSummary(
            imported.project,
            derivation.id,
            {},
            {},
            {},
            imported.xsdMetadataByNodeId,
          )?.enumerationValues,
        ).toEqual([]);
      }
    }
  });

  it('presents lexical built-in/external bases and declared attribute counts safely', () => {
    const imported = importValid();
    const anyType = imported.project.nodes.find(
      ({ kind, name }) => kind === 'complexType' && name === 'AnyTypeDerived',
    )!;
    expect(
      selectXsdComplexTypeDerivationPresentation(
        imported.project,
        anyType.id,
        imported.xsdMetadataByNodeId,
      )?.base,
    ).toEqual({ text: 'xs:anyType', navigable: false });

    const external = importXsdSource(externalSource, {
      ...options,
      sourceFileId: 'external-presentation.xsd',
    });
    if (external.status !== 'success') {
      throw new Error('Expected external derivation to import with a warning.');
    }
    const extension = external.project.nodes.find(
      ({ kind }) => kind === 'extension',
    )!;
    expect(
      selectXsdComplexTypeDerivationPresentation(
        external.project,
        extension.id,
        external.xsdMetadataByNodeId,
      )?.base,
    ).toEqual({
      text: 'vendor:ExternalBase (external)',
      navigable: false,
    });
    expect(
      formatXsdComplexTypeBase(external.project, undefined),
    ).toBeUndefined();

    const owner = imported.project.nodes.find(
      ({ kind, name }) => kind === 'complexType' && name === 'BeforeDerived',
    )!;
    const ownerCard = buildFocusCardSummary(
      imported.project,
      owner.id,
      {},
      imported.xsdMetadataByNodeId,
    );
    const extensionNode = getOutgoingStructuralRelationships(
      imported.project,
      owner.id,
    ).find(({ node }) => node.kind === 'extension')!.node;
    const extensionCard = buildFocusCardSummary(
      imported.project,
      extensionNode.id,
      {},
      imported.xsdMetadataByNodeId,
    );
    expect(ownerCard?.attributeCount).toBe(1);
    expect(extensionCard?.attributeCount).toBe(1);
  });

  it('labels containment, base doorways, and both terminal-cycle edge kinds', () => {
    expect(
      formatOutgoingRelationshipLabel('contains', 'complexType', 'extension'),
    ).toBe('Extension');
    expect(
      formatOutgoingRelationshipLabel('contains', 'complexType', 'restriction'),
    ).toBe('Restriction');
    expect(formatOutgoingRelationshipLabel('extends')).toBe('Base type');
    expect(formatOutgoingRelationshipLabel('restricts')).toBe('Base type');
    expect(formatTerminalCycleRelationshipLabel('extends')).toBe(
      'Recursive base type',
    );
    expect(formatTerminalCycleRelationshipLabel('restricts')).toBe(
      'Recursive base type',
    );

    const imported = importXsdSource(cycleSource, {
      ...options,
      sourceFileId: 'cycle-presentation.xsd',
    });
    if (imported.status !== 'success') {
      throw new Error('Expected cycle fixture to import.');
    }
    const type = imported.project.nodes.find(
      ({ kind, name }) => kind === 'complexType' && name === 'SelfCycle',
    )!;
    const extension = getOutgoingStructuralRelationships(
      imported.project,
      type.id,
    )[0]!.node;
    const relationship = getOutgoingStructuralRelationships(
      imported.project,
      extension.id,
    )[0]!;
    expect(
      buildJourneyRelationshipPresentation(
        imported.project,
        {
          projectId: imported.project.id,
          navigationPath: [type.id, extension.id],
        },
        relationship,
      ),
    ).toMatchObject({
      disposition: 'terminalCycleClosure',
      relationshipLabel: 'Recursive base type',
      terminalLabel: 'Already present earlier in this path',
    });
  });
});
