import { describe, expect, it } from 'vitest';
import type {
  SchemaEdge,
  SchemaNode,
  SchemaProject,
  SchemaSourceRange,
} from '../../../schema/model';
import type {
  XsdMetadataByNodeId,
  XsdNodeMetadata,
  XsdNormalizedReference,
} from '../../../schema/xsd';
import { resolveSchemaPackageXsdReferences } from './xsdPackageReferenceResolver';

const range: SchemaSourceRange = {
  start: { offset: 10, line: 1, column: 11 },
  end: { offset: 15, line: 1, column: 16 },
  sourceId: 'source-a',
};

function node(
  id: string,
  kind: SchemaNode['kind'],
  name: string,
  sourceFileId = 'source-a',
): SchemaNode {
  return { id, kind, name, sourceFileId, sourceOrder: 0 };
}

function reference(
  kind: XsdNormalizedReference['kind'],
  localName: string,
): XsdNormalizedReference {
  return {
    kind,
    raw: `t:${localName}`,
    prefix: 't',
    localName,
    namespaceUri: 'urn:test',
    range,
    resolution: 'externalDeferred',
  };
}

function metadata(
  kind: SchemaNode['kind'],
  scope: XsdNodeMetadata['scope'],
  sourceFileId = 'source-a',
): XsdNodeMetadata {
  return {
    kind,
    scope,
    sourceFileId,
    sourceOrder: 0,
    sourceRange: range,
    startTagRange: range,
    targetNamespace: 'urn:test',
  };
}

function project(
  nodes: readonly SchemaNode[],
  edges: readonly SchemaEdge[] = [],
): SchemaProject {
  return {
    id: 'package',
    displayName: 'package.zip',
    sourceFiles: [
      { id: 'source-a', filename: 'a.xsd' },
      { id: 'source-b', filename: 'b.xsd' },
    ],
    nodes,
    edges,
    rootNodeIds: [],
  };
}

describe('same-package XSD reference resolution', () => {
  it('resolves every reference kind with exact edge semantics', () => {
    const declarations = [
      node('complex', 'complexType', 'Complex', 'source-b'),
      node('simple', 'simpleType', 'Simple', 'source-b'),
      node('element', 'globalElement', 'Element', 'source-b'),
      node('attribute', 'attribute', 'Attribute', 'source-b'),
    ];
    const owners = [
      node('typed-element', 'globalElement', 'typed'),
      node('simple-typed-element', 'globalElement', 'simpleTyped'),
      node('typed-attribute', 'attribute', 'typedAttribute'),
      node('element-ref', 'localElement', 'elementRef'),
      node('attribute-ref', 'attribute', 'attributeRef'),
      node('simple-owner', 'simpleType', 'SimpleOwner'),
      node('simple-restriction', 'restriction', 'restriction'),
      node('complex-owner', 'complexType', 'ComplexOwner'),
      node('extension', 'extension', 'extension'),
      node('complex-restriction-owner', 'complexType', 'RestrictedOwner'),
      node('complex-restriction', 'restriction', 'restriction'),
    ];
    const contains: SchemaEdge[] = [
      {
        id: 'contains-simple',
        kind: 'contains',
        sourceNodeId: 'simple-owner',
        targetNodeId: 'simple-restriction',
        order: 0,
      },
      {
        id: 'contains-extension',
        kind: 'contains',
        sourceNodeId: 'complex-owner',
        targetNodeId: 'extension',
        order: 0,
      },
      {
        id: 'contains-complex-restriction',
        kind: 'contains',
        sourceNodeId: 'complex-restriction-owner',
        targetNodeId: 'complex-restriction',
        order: 0,
      },
    ];
    const values: Record<string, XsdNodeMetadata> = {
      complex: metadata('complexType', 'global', 'source-b'),
      simple: metadata('simpleType', 'global', 'source-b'),
      element: metadata('globalElement', 'global', 'source-b'),
      attribute: metadata('attribute', 'global', 'source-b'),
      'typed-element': {
        ...metadata('globalElement', 'global'),
        typeReference: reference('type', 'Complex'),
      },
      'simple-typed-element': {
        ...metadata('globalElement', 'global'),
        typeReference: reference('type', 'Simple'),
      },
      'typed-attribute': {
        ...metadata('attribute', 'global'),
        typeReference: reference('type', 'Simple'),
      },
      'element-ref': {
        ...metadata('localElement', 'local'),
        elementReference: reference('element', 'Element'),
      },
      'attribute-ref': {
        ...metadata('attribute', 'local'),
        attributeReference: reference('attribute', 'Attribute'),
      },
      'simple-owner': {
        ...metadata('simpleType', 'global'),
        restrictionBaseReference: reference('restrictionBase', 'Simple'),
      },
      'simple-restriction': {
        ...metadata('restriction', 'local'),
        restrictionBaseReference: reference('restrictionBase', 'Simple'),
      },
      'complex-owner': {
        ...metadata('complexType', 'global'),
        complexTypeDerivation: {
          kind: 'extension',
          baseReference: reference('complexTypeBase', 'Complex'),
          declaredAttributeCount: 0,
          sourceRange: range,
          startTagRange: range,
        },
      },
      extension: {
        ...metadata('extension', 'local'),
        complexTypeDerivation: {
          kind: 'extension',
          baseReference: reference('complexTypeBase', 'Complex'),
          declaredAttributeCount: 0,
          sourceRange: range,
          startTagRange: range,
        },
      },
      'complex-restriction-owner': {
        ...metadata('complexType', 'global'),
        complexTypeDerivation: {
          kind: 'restriction',
          baseReference: reference('complexTypeBase', 'Complex'),
          declaredAttributeCount: 0,
          sourceRange: range,
          startTagRange: range,
        },
      },
      'complex-restriction': {
        ...metadata('restriction', 'local'),
        complexTypeDerivation: {
          kind: 'restriction',
          baseReference: reference('complexTypeBase', 'Complex'),
          declaredAttributeCount: 0,
          sourceRange: range,
          startTagRange: range,
        },
      },
    };

    const result = resolveSchemaPackageXsdReferences(
      project([...declarations, ...owners], contains),
      values,
    );

    expect(result.unresolvedReferences).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(
      result.project.edges
        .slice(contains.length)
        .map((edge) => `${edge.sourceNodeId}:${edge.kind}`),
    ).toEqual([
      'attribute-ref:referencesDeclaration',
      'complex-restriction:restricts',
      'complex-restriction-owner:derivesFrom',
      'element-ref:referencesDeclaration',
      'extension:extends',
      'complex-owner:derivesFrom',
      'simple-restriction:restricts',
      'simple-owner:derivesFrom',
      'simple-typed-element:typeOf',
      'typed-attribute:typeOf',
      'typed-element:typeOf',
    ]);
    expect(
      result.project.edges.filter((edge) => edge.kind === 'restricts'),
    ).toHaveLength(2);
    expect(
      result.xsdMetadataByNodeId['simple-owner']?.restrictionBaseReference
        ?.targetNodeId,
    ).toBe('simple');
    expect(
      result.xsdMetadataByNodeId['complex-owner']?.complexTypeDerivation
        ?.baseReference?.targetNodeId,
    ).toBe('complex');
    expect(
      result.xsdMetadataByNodeId['complex-restriction-owner']
        ?.complexTypeDerivation?.baseReference?.targetNodeId,
    ).toBe('complex');
  });

  it('reports not-found, ambiguous, and invalid-kind warnings deterministically', () => {
    const nodes = [
      node('owner-not-found', 'globalElement', 'one'),
      node('owner-ambiguous', 'localElement', 'two'),
      node('owner-invalid', 'attribute', 'three'),
      node('restriction-invalid', 'restriction', 'restriction'),
      node('extension-invalid', 'extension', 'extension'),
      node('element-a', 'globalElement', 'Shared', 'source-b'),
      node('element-b', 'globalElement', 'Shared', 'source-a'),
      node('complex-only', 'complexType', 'ComplexOnly', 'source-b'),
      node('simple-only', 'simpleType', 'SimpleOnly', 'source-b'),
    ];
    const metadataByNodeId: XsdMetadataByNodeId = {
      'owner-not-found': {
        ...metadata('globalElement', 'global'),
        typeReference: reference('type', 'Missing'),
      },
      'owner-ambiguous': {
        ...metadata('localElement', 'local'),
        elementReference: reference('element', 'Shared'),
      },
      'owner-invalid': {
        ...metadata('attribute', 'global'),
        typeReference: reference('type', 'ComplexOnly'),
      },
      'restriction-invalid': {
        ...metadata('restriction', 'local'),
        restrictionBaseReference: reference('restrictionBase', 'ComplexOnly'),
      },
      'extension-invalid': {
        ...metadata('extension', 'local'),
        complexTypeDerivation: {
          kind: 'extension',
          baseReference: reference('complexTypeBase', 'SimpleOnly'),
          declaredAttributeCount: 0,
          sourceRange: range,
          startTagRange: range,
        },
      },
      'element-a': metadata('globalElement', 'global', 'source-b'),
      'element-b': metadata('globalElement', 'global', 'source-a'),
      'complex-only': metadata('complexType', 'global', 'source-b'),
      'simple-only': metadata('simpleType', 'global', 'source-b'),
    };

    const result = resolveSchemaPackageXsdReferences(
      project(nodes),
      metadataByNodeId,
    );

    expect(result.project.edges).toEqual([]);
    expect(
      result.unresolvedReferences.map(
        (issue) => `${issue.sourceNodeId}:${issue.reason}`,
      ),
    ).toEqual([
      'extension-invalid:invalidTargetKind',
      'owner-ambiguous:ambiguous',
      'owner-invalid:invalidTargetKind',
      'owner-not-found:notFound',
      'restriction-invalid:invalidTargetKind',
    ]);
    expect(result.diagnostics.map(({ code }) => code).sort()).toEqual([
      'ambiguous-xsd-reference',
      'invalid-xsd-reference-target',
      'invalid-xsd-reference-target',
      'invalid-xsd-reference-target',
      'unresolved-xsd-reference',
    ]);
    expect(result.unresolvedReferences[1]?.candidateNodeIds).toEqual([
      'element-a',
      'element-b',
    ]);
    expect(result.unresolvedReferences[2]?.candidateNodeIds).toEqual([
      'complex-only',
    ]);
    expect(result.unresolvedReferences[0]?.candidateNodeIds).toEqual([
      'simple-only',
    ]);
    expect(result.unresolvedReferences[4]?.candidateNodeIds).toEqual([
      'complex-only',
    ]);
  });

  it('matches expanded names across external and absent namespaces', () => {
    const externalTarget = node(
      'external-target',
      'complexType',
      'External',
      'source-b',
    );
    const noNamespaceTarget = node(
      'no-namespace-target',
      'simpleType',
      'Plain',
      'source-b',
    );
    const externalOwner = node('external-owner', 'globalElement', 'external');
    const noNamespaceOwner = node(
      'no-namespace-owner',
      'globalElement',
      'plain',
    );
    const externalReference = {
      ...reference('type', 'External'),
      namespaceUri: 'urn:external',
    };
    const noNamespaceReference = {
      ...reference('type', 'Plain'),
      prefix: undefined,
      namespaceUri: undefined,
      raw: 'Plain',
    };
    const result = resolveSchemaPackageXsdReferences(
      project([
        externalOwner,
        noNamespaceOwner,
        externalTarget,
        noNamespaceTarget,
      ]),
      {
        'external-owner': {
          ...metadata('globalElement', 'global'),
          typeReference: externalReference,
        },
        'no-namespace-owner': {
          ...metadata('globalElement', 'global'),
          targetNamespace: undefined,
          typeReference: noNamespaceReference,
        },
        'external-target': {
          ...metadata('complexType', 'global', 'source-b'),
          targetNamespace: 'urn:external',
        },
        'no-namespace-target': {
          ...metadata('simpleType', 'global', 'source-b'),
          targetNamespace: undefined,
        },
      },
    );

    expect(result.unresolvedReferences).toEqual([]);
    expect(result.project.edges).toEqual([
      expect.objectContaining({
        sourceNodeId: 'external-owner',
        targetNodeId: 'external-target',
        kind: 'typeOf',
      }),
      expect.objectContaining({
        sourceNodeId: 'no-namespace-owner',
        targetNodeId: 'no-namespace-target',
        kind: 'typeOf',
      }),
    ]);
  });

  it('never selects a first declaration when global expanded names collide', () => {
    const declarations = [
      node('element-a', 'globalElement', 'DuplicateElement', 'source-a'),
      node('element-b', 'globalElement', 'DuplicateElement', 'source-b'),
      node('attribute-a', 'attribute', 'DuplicateAttribute', 'source-a'),
      node('attribute-b', 'attribute', 'DuplicateAttribute', 'source-b'),
      node('complex-a', 'complexType', 'DuplicateComplex', 'source-a'),
      node('complex-b', 'complexType', 'DuplicateComplex', 'source-b'),
      node('simple-a', 'simpleType', 'DuplicateSimple', 'source-a'),
      node('simple-b', 'simpleType', 'DuplicateSimple', 'source-b'),
      node('mixed-complex', 'complexType', 'Mixed', 'source-a'),
      node('mixed-simple', 'simpleType', 'Mixed', 'source-b'),
      node('unique', 'complexType', 'Unique', 'source-b'),
    ];
    const owners = [
      node('element-owner', 'localElement', 'elementOwner'),
      node('attribute-owner', 'attribute', 'attributeOwner'),
      node('complex-owner', 'globalElement', 'complexOwner'),
      node('simple-owner', 'globalElement', 'simpleOwner'),
      node('mixed-owner', 'globalElement', 'mixedOwner'),
      node('unique-owner', 'globalElement', 'uniqueOwner'),
    ];
    const declarationsMetadata: Record<string, XsdNodeMetadata> = {};
    for (const declaration of declarations) {
      declarationsMetadata[declaration.id] = metadata(
        declaration.kind,
        'global',
        declaration.sourceFileId,
      );
    }
    const result = resolveSchemaPackageXsdReferences(
      project([...declarations, ...owners]),
      {
        ...declarationsMetadata,
        'element-owner': {
          ...metadata('localElement', 'local'),
          elementReference: reference('element', 'DuplicateElement'),
        },
        'attribute-owner': {
          ...metadata('attribute', 'local'),
          attributeReference: reference('attribute', 'DuplicateAttribute'),
        },
        'complex-owner': {
          ...metadata('globalElement', 'global'),
          typeReference: reference('type', 'DuplicateComplex'),
        },
        'simple-owner': {
          ...metadata('globalElement', 'global'),
          typeReference: reference('type', 'DuplicateSimple'),
        },
        'mixed-owner': {
          ...metadata('globalElement', 'global'),
          typeReference: reference('type', 'Mixed'),
        },
        'unique-owner': {
          ...metadata('globalElement', 'global'),
          typeReference: reference('type', 'Unique'),
        },
      },
    );

    expect(result.unresolvedReferences).toHaveLength(5);
    expect(
      result.unresolvedReferences.every(
        ({ reason, candidateNodeIds }) =>
          reason === 'ambiguous' && candidateNodeIds.length === 2,
      ),
    ).toBe(true);
    expect(result.project.nodes).toHaveLength(
      declarations.length + owners.length,
    );
    expect(result.project.edges).toHaveLength(1);
    expect(result.project.edges[0]).toEqual(
      expect.objectContaining({
        sourceNodeId: 'unique-owner',
        targetNodeId: 'unique',
      }),
    );
  });

  it('ignores DTD, local, anonymous, built-in, and already resolved metadata', () => {
    const nodes = [
      node('owner', 'globalElement', 'owner'),
      node('dtd', 'dtdElement', 'Target', 'source-b'),
      node('local', 'localElement', 'Target', 'source-b'),
      node('anonymous', 'complexType', 'Target', 'source-b'),
      node('built-in', 'globalElement', 'builtIn'),
      node('resolved', 'globalElement', 'resolved'),
    ];
    const metadataByNodeId: XsdMetadataByNodeId = {
      owner: {
        ...metadata('globalElement', 'global'),
        typeReference: reference('type', 'Target'),
      },
      local: metadata('localElement', 'local', 'source-b'),
      anonymous: metadata('complexType', 'anonymous', 'source-b'),
      'built-in': {
        ...metadata('globalElement', 'global'),
        typeReference: {
          ...reference('type', 'string'),
          resolution: 'xsdBuiltIn',
        },
      },
      resolved: {
        ...metadata('globalElement', 'global'),
        typeReference: {
          ...reference('type', 'Known'),
          resolution: 'resolved',
          targetNodeId: 'known',
        },
      },
    };

    const result = resolveSchemaPackageXsdReferences(
      project(nodes),
      metadataByNodeId,
    );
    expect(result.unresolvedReferences).toHaveLength(1);
    expect(result.unresolvedReferences[0]?.reason).toBe('notFound');
    expect(
      result.xsdMetadataByNodeId['built-in']?.typeReference?.resolution,
    ).toBe('xsdBuiltIn');
    expect(
      result.xsdMetadataByNodeId.resolved?.typeReference?.targetNodeId,
    ).toBe('known');
  });

  it('does not mutate inputs and repeats deeply equal', () => {
    const nodes = [
      node('owner', 'globalElement', 'owner'),
      node('target', 'complexType', 'Target', 'source-b'),
    ];
    const metadataByNodeId: XsdMetadataByNodeId = {
      owner: {
        ...metadata('globalElement', 'global'),
        typeReference: reference('type', 'Target'),
      },
      target: metadata('complexType', 'global', 'source-b'),
    };
    const inputProject = project(nodes);
    const projectBefore = structuredClone(inputProject);
    const metadataBefore = structuredClone(metadataByNodeId);
    const first = resolveSchemaPackageXsdReferences(
      inputProject,
      metadataByNodeId,
    );
    const second = resolveSchemaPackageXsdReferences(
      inputProject,
      metadataByNodeId,
    );

    expect(first).toEqual(second);
    expect(inputProject).toEqual(projectBefore);
    expect(metadataByNodeId).toEqual(metadataBefore);
  });
});
