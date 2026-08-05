import { describe, expect, it } from 'vitest';
import {
  getContainedChildren,
  getIncomingStructuralRelationships,
  getNodesByKind,
  getNodesUsingOrReferencing,
  getRootNodes,
  validateSchemaProject,
  type SchemaNode,
  type SchemaProject,
} from '../model';
import type {
  XsdComplexTypeAst,
  XsdGlobalElementAst,
  XsdSchemaAst,
} from './xsdAst';
import { parseXsd } from './xsdParser';
import {
  buildXsdSchemaProject,
  type XsdProjectBuildOptions,
  type XsdProjectBuildResult,
} from './xsdProjectBuilder';
import { xmlSchemaNamespaceUri } from './xsdXmlAst';
import alternatePrefix from '../../../tests/fixtures/xsd/alternate-prefix.xsd?raw';
import anonymousTypes from '../../../tests/fixtures/xsd/anonymous-types.xsd?raw';
import basicStructure from '../../../tests/fixtures/xsd/basic-structure.xsd?raw';
import defaultSchemaNamespace from '../../../tests/fixtures/xsd/default-schema-namespace.xsd?raw';
import duplicateSymbols from '../../../tests/fixtures/xsd/duplicate-symbols.xsd?raw';
import externalReferences from '../../../tests/fixtures/xsd/external-references.xsd?raw';
import namespaceShadowing from '../../../tests/fixtures/xsd/namespace-shadowing.xsd?raw';
import noTargetReferences from '../../../tests/fixtures/xsd/no-target-references.xsd?raw';
import occurrences from '../../../tests/fixtures/xsd/occurrences.xsd?raw';
import sameDocumentReferences from '../../../tests/fixtures/xsd/same-document-references.xsd?raw';
import unsupportedComponents from '../../../tests/fixtures/xsd/unsupported-components.xsd?raw';

const options: XsdProjectBuildOptions = {
  projectId: 'xsd-project',
  displayName: 'Builder fixture',
  sourceFileId: 'schema.xsd',
  sourceFilename: 'schema.xsd',
};

function schemaFor(
  source: string,
  sourceId = options.sourceFileId,
): XsdSchemaAst {
  const result = parseXsd(source, sourceId);
  expect(
    result.diagnostics.filter(({ severity }) => severity === 'error'),
  ).toEqual([]);
  expect(result.schema).toBeDefined();
  return result.schema!;
}

function build(
  source: string,
  buildOptions: XsdProjectBuildOptions = options,
): XsdProjectBuildResult {
  return buildXsdSchemaProject(
    schemaFor(source, buildOptions.sourceFileId),
    source,
    buildOptions,
  );
}

function successfulProject(result: XsdProjectBuildResult): SchemaProject {
  expect(result.project).toBeDefined();
  expect(
    result.diagnostics.filter(({ severity }) => severity === 'error'),
  ).toEqual([]);
  return result.project!;
}

function node(
  project: SchemaProject,
  kind: SchemaNode['kind'],
  name?: string,
  index = 0,
): SchemaNode {
  const matches = project.nodes.filter(
    (candidate) =>
      candidate.kind === kind &&
      (name === undefined || candidate.name === name),
  );
  expect(matches[index]).toBeDefined();
  return matches[index]!;
}

describe('XSD project options, ranges, and source provenance', () => {
  it.each([
    ['projectId', { projectId: '' }],
    ['displayName', { displayName: '   ' }],
    ['sourceFileId', { sourceFileId: '' }],
    ['sourceFilename', { sourceFilename: '\t' }],
  ] as const)('rejects an invalid %s option', (name, replacement) => {
    const result = buildXsdSchemaProject(
      schemaFor(basicStructure),
      basicStructure,
      {
        ...options,
        ...replacement,
      },
    );
    expect(result.project).toBeUndefined();
    expect(result.metadataByNodeId).toEqual({});
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        stage: 'build',
        code: 'invalid-build-option',
        severity: 'error',
        message: expect.stringContaining(name),
      }),
    ]);
  });

  it.each([
    ['negative start', { start: { offset: -1 } }],
    ['reversed range', { start: { offset: 3 }, end: { offset: 2 } }],
    ['out-of-bounds end', { end: { offset: basicStructure.length + 1 } }],
    ['non-integer start', { start: { offset: 0.5 } }],
    ['incoherent line', { start: { line: 9 } }],
  ])('rejects a schema %s', (_name, replacement) => {
    const parsed = schemaFor(basicStructure);
    const range = {
      ...parsed.range,
      start: {
        ...parsed.range.start,
        ...('start' in replacement ? replacement.start : {}),
      },
      end: {
        ...parsed.range.end,
        ...('end' in replacement ? replacement.end : {}),
      },
    };
    const result = buildXsdSchemaProject(
      { ...parsed, range },
      basicStructure,
      options,
    );
    expect(result.project).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'invalid-source-range',
    );
  });

  it('rejects a source ID mismatch without slicing source', () => {
    const parsed = schemaFor(basicStructure);
    const result = buildXsdSchemaProject(
      { ...parsed, range: { ...parsed.range, sourceId: 'other.xsd' } },
      basicStructure,
      options,
    );
    expect(result.project).toBeUndefined();
    expect(result.diagnostics[0]).toMatchObject({
      code: 'source-id-mismatch',
      sourceId: options.sourceFileId,
      range: { sourceId: 'other.xsd' },
    });
  });

  it('accepts valid ranges with absent source IDs', () => {
    const parsed = schemaFor(basicStructure);
    const withoutSourceId = {
      ...parsed,
      range: { start: parsed.range.start, end: parsed.range.end },
      startTagRange: {
        start: parsed.startTagRange.start,
        end: parsed.startTagRange.end,
      },
    };
    expect(
      buildXsdSchemaProject(withoutSourceId, basicStructure, options).project,
    ).toBeDefined();
  });

  it.each([
    [
      'CRLF',
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">\r\n  <xs:element name="root"/>\r\n</xs:schema>',
    ],
    [
      'non-BMP UTF-16 text',
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><!--😀--><xs:element name="root"/></xs:schema>',
    ],
  ])('uses exact offsets and locations for %s source', (_name, source) => {
    const result = build(source);
    const project = successfulProject(result);
    const root = node(project, 'globalElement', 'root');
    const metadata = result.metadataByNodeId[root.id]!;
    expect(root.compactDeclaration).toBe(
      source.slice(
        metadata.startTagRange.start.offset,
        metadata.startTagRange.end.offset,
      ),
    );
  });

  it('defensively rejects a malformed required AST value', () => {
    const parsed = schemaFor(basicStructure);
    const first = parsed.declarations[0] as XsdGlobalElementAst;
    const result = buildXsdSchemaProject(
      {
        ...parsed,
        declarations: [
          { ...first, name: undefined },
          ...parsed.declarations.slice(1),
        ],
      },
      basicStructure,
      options,
    );
    expect(result.project).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'missing-required-ast-value',
    );
  });

  it('returns a typed failure instead of throwing for a malformed AST shape', () => {
    const parsed = schemaFor(basicStructure);
    const malformed = {
      ...parsed,
      elementFormDefault: undefined,
    } as unknown as XsdSchemaAst;
    expect(() =>
      buildXsdSchemaProject(malformed, basicStructure, options),
    ).not.toThrow();
    expect(buildXsdSchemaProject(malformed, basicStructure, options)).toEqual({
      diagnostics: [
        expect.objectContaining({
          code: 'missing-required-ast-value',
          severity: 'error',
        }),
      ],
      metadataByNodeId: {},
    });
  });
});

describe('XSD normalized nodes, metadata, and compact declarations', () => {
  it('creates one schema root and globals in declaration source order', () => {
    const result = build(basicStructure);
    const project = successfulProject(result);
    const schema = node(project, 'schema');
    expect(getRootNodes(project)).toEqual([schema]);
    expect(project.rootNodeIds).toEqual([schema.id]);
    expect(schema.name).toBe('urn:books');
    expect(
      getContainedChildren(project, schema.id).map(({ node: child }) => [
        child.kind,
        child.name,
      ]),
    ).toEqual([
      ['globalElement', 'book'],
      ['complexType', 'BookType'],
      ['simpleType', 'CodeType'],
    ]);
    expect(
      getContainedChildren(project, schema.id).map(({ edge }) => edge.order),
    ).toEqual([0, 1, 2]);
  });

  it('falls back to the filename for a no-target-namespace schema name', () => {
    const result = build(noTargetReferences, {
      ...options,
      sourceFilename: 'no-target.xsd',
    });
    expect(node(successfulProject(result), 'schema').name).toBe(
      'no-target.xsd',
    );
  });

  it('constructs global elements, named complex types, and named simple types', () => {
    const project = successfulProject(build(basicStructure));
    expect(node(project, 'globalElement', 'book').id).toContain(
      'globalElement',
    );
    expect(node(project, 'complexType', 'BookType').id).toContain(
      'complexType',
    );
    expect(node(project, 'simpleType', 'CodeType').id).toContain('simpleType');
  });

  it('uses expanded global identity independent of lexical schema prefixes', () => {
    const first = build(
      `<s:schema xmlns:s="${xmlSchemaNamespaceUri}" targetNamespace="urn:identity"><s:element name="root"/><s:complexType name="RootType"/></s:schema>`,
    );
    const second = build(
      `<xs:schema xmlns:xs="${xmlSchemaNamespaceUri}" targetNamespace="urn:identity"><xs:element name="root"/><xs:complexType name="RootType"/></xs:schema>`,
    );
    const firstProject = successfulProject(first);
    const secondProject = successfulProject(second);
    expect(node(firstProject, 'globalElement', 'root').id).toBe(
      node(secondProject, 'globalElement', 'root').id,
    );
    expect(node(firstProject, 'complexType', 'RootType').id).toBe(
      node(secondProject, 'complexType', 'RootType').id,
    );
  });

  it('normalizes the Task 5.1 alternate-prefix fixture by namespace URI', () => {
    const source = alternatePrefix.replace(
      '</s:schema>',
      '  <s:element name="item"/>\n</s:schema>',
    );
    const result = build(source);
    const project = successfulProject(result);
    const root = node(project, 'globalElement', 'root');
    const type = node(project, 'complexType', 'RootType');
    const item = node(project, 'globalElement', 'item');
    expect(
      project.edges.find(
        ({ kind, sourceNodeId, targetNodeId }) =>
          kind === 'typeOf' &&
          sourceNodeId === root.id &&
          targetNodeId === type.id,
      ),
    ).toBeDefined();
    expect(getNodesUsingOrReferencing(project, item.id)).toHaveLength(1);
  });

  it('supports Unicode global and local names with deterministic IDs', () => {
    const source = `<xs:schema xmlns:xs="${xmlSchemaNamespaceUri}">
      <xs:element name="根"/><xs:complexType name="类型"><xs:sequence><xs:element name="子"/></xs:sequence></xs:complexType>
    </xs:schema>`;
    const first = successfulProject(build(source));
    const second = successfulProject(build(source));
    expect(node(first, 'globalElement', '根').id).toBe(
      node(second, 'globalElement', '根').id,
    );
    expect(node(first, 'complexType', '类型')).toBeDefined();
    expect(node(first, 'localElement', '子')).toBeDefined();
  });

  it('constructs anonymous complex and simple types with typeOf edges', () => {
    const result = build(anonymousTypes);
    const project = successfulProject(result);
    const complex = node(project, 'complexType');
    const simple = node(project, 'simpleType');
    expect(complex.name).toBe('Anonymous complex type of container');
    expect(simple.name).toBe('Anonymous simple type of code');
    expect(result.metadataByNodeId[complex.id]).toMatchObject({
      scope: 'anonymous',
      anonymous: true,
    });
    expect(result.metadataByNodeId[simple.id]).toMatchObject({
      scope: 'anonymous',
      anonymous: true,
    });
    expect(project.edges.filter(({ kind }) => kind === 'typeOf')).toHaveLength(
      2,
    );
    expect(
      getContainedChildren(project, node(project, 'schema').id).map(
        ({ node: child }) => child.id,
      ),
    ).not.toContain(complex.id);
  });

  it('constructs global anonymous simple and local anonymous complex types', () => {
    const source = `<xs:schema xmlns:xs="${xmlSchemaNamespaceUri}">
      <xs:element name="scalar"><xs:simpleType/></xs:element>
      <xs:complexType name="Owner"><xs:sequence><xs:element name="nested"><xs:complexType><xs:all><xs:element name="leaf"/></xs:all></xs:complexType></xs:element></xs:sequence></xs:complexType>
    </xs:schema>`;
    const result = build(source);
    const project = successfulProject(result);
    const simple = node(
      project,
      'simpleType',
      'Anonymous simple type of scalar',
    );
    const complex = node(
      project,
      'complexType',
      'Anonymous complex type of nested',
    );
    expect(result.metadataByNodeId[simple.id]?.scope).toBe('anonymous');
    expect(result.metadataByNodeId[complex.id]?.scope).toBe('anonymous');
    expect(getContainedChildren(project, complex.id)[0]?.node.kind).toBe('all');
  });

  it('preserves sequence, choice, all, and nested compositor nodes', () => {
    const source = `<xs:schema xmlns:xs="${xmlSchemaNamespaceUri}">
      <xs:complexType name="Model">
        <xs:sequence minOccurs="0" maxOccurs="2">
          <xs:choice>
            <xs:all><xs:element name="leaf"/></xs:all>
          </xs:choice>
        </xs:sequence>
      </xs:complexType>
    </xs:schema>`;
    const project = successfulProject(build(source));
    const type = node(project, 'complexType', 'Model');
    const sequence = node(project, 'sequence');
    const choice = node(project, 'choice');
    const all = node(project, 'all');
    const leaf = node(project, 'localElement', 'leaf');
    expect(getContainedChildren(project, type.id)[0]?.node).toEqual(sequence);
    expect(getContainedChildren(project, sequence.id)[0]?.node).toEqual(choice);
    expect(getContainedChildren(project, choice.id)[0]?.node).toEqual(all);
    expect(getContainedChildren(project, all.id)[0]?.node).toEqual(leaf);
  });

  it('keeps repeated local names and refs as distinct range-based nodes', () => {
    const source = `<xs:schema xmlns:xs="${xmlSchemaNamespaceUri}" xmlns:t="urn:r" targetNamespace="urn:r">
      <xs:element name="item"/>
      <xs:complexType name="Model"><xs:sequence>
        <xs:element name="same"/><xs:element name="same"/>
        <xs:element ref="t:item"/><xs:element ref="t:item"/>
      </xs:sequence></xs:complexType>
    </xs:schema>`;
    const project = successfulProject(build(source));
    const locals = getNodesByKind(project, 'localElement');
    const references = getNodesByKind(project, 'elementReference');
    expect(locals).toHaveLength(2);
    expect(references).toHaveLength(2);
    expect(
      new Set([...locals, ...references].map(({ id }) => id)),
    ).toHaveLength(4);
    expect(references.filter(({ name }) => name === 't:item')).toHaveLength(2);
  });

  it('copies schema and node metadata without retaining ordinary namespace maps', () => {
    const result = build(basicStructure);
    const project = successfulProject(result);
    const schema = node(project, 'schema');
    const type = node(project, 'complexType', 'BookType');
    expect(result.metadataByNodeId[schema.id]).toMatchObject({
      kind: 'schema',
      scope: 'schema',
      targetNamespace: 'urn:books',
      elementFormDefault: 'qualified',
      attributeFormDefault: 'unqualified',
      version: '1.0',
    });
    expect(result.metadataByNodeId[type.id]).toMatchObject({
      kind: 'complexType',
      scope: 'global',
      anonymous: false,
      targetNamespace: 'urn:books',
    });
    expect(result.metadataByNodeId[type.id]).not.toHaveProperty(
      'namespaceBindings',
    );
  });

  it('uses exact start tags, never full nested declarations', () => {
    const result = build(sameDocumentReferences);
    const project = successfulProject(result);
    for (const graphNode of project.nodes) {
      const metadata = result.metadataByNodeId[graphNode.id]!;
      expect(graphNode.compactDeclaration).toBe(
        sameDocumentReferences.slice(
          metadata.startTagRange.start.offset,
          metadata.startTagRange.end.offset,
        ),
      );
      expect(graphNode.compactDeclaration).not.toContain('</');
    }
  });
});

describe('XSD occurrence and structural edge construction', () => {
  it('places compositor and local occurrences only on containment edges', () => {
    const project = successfulProject(build(sameDocumentReferences));
    const sequence = node(project, 'sequence', undefined, 0);
    const rootType = node(project, 'complexType', 'RootType');
    const ref = node(project, 'elementReference', 'g:item');
    expect(
      project.edges.find(
        ({ sourceNodeId, targetNodeId }) =>
          sourceNodeId === rootType.id && targetNodeId === sequence.id,
      )?.occurrence,
    ).toEqual({ min: 0, max: 2 });
    expect(
      project.edges.find(({ targetNodeId }) => targetNodeId === ref.id)
        ?.occurrence,
    ).toEqual({ min: 0, max: 'unbounded' });
    expect(
      project.edges
        .filter(({ kind }) => kind !== 'contains')
        .every(({ occurrence }) => occurrence === undefined),
    ).toBe(true);
  });

  it('does not multiply nested occurrences or synthesize choice optionality', () => {
    const source = `<xs:schema xmlns:xs="${xmlSchemaNamespaceUri}">
      <xs:complexType name="M"><xs:sequence minOccurs="0" maxOccurs="3">
        <xs:choice minOccurs="2" maxOccurs="4">
          <xs:element name="leaf" minOccurs="1" maxOccurs="5"/>
        </xs:choice>
      </xs:sequence></xs:complexType>
    </xs:schema>`;
    const project = successfulProject(build(source));
    const sequence = node(project, 'sequence');
    const choice = node(project, 'choice');
    const leaf = node(project, 'localElement', 'leaf');
    expect(
      project.edges.find(({ targetNodeId }) => targetNodeId === sequence.id)
        ?.occurrence,
    ).toEqual({ min: 0, max: 3 });
    expect(
      project.edges.find(({ targetNodeId }) => targetNodeId === choice.id)
        ?.occurrence,
    ).toEqual({ min: 2, max: 4 });
    expect(
      project.edges.find(({ targetNodeId }) => targetNodeId === leaf.id)
        ?.occurrence,
    ).toEqual({ min: 1, max: 5 });
  });

  it('preserves zero, optional, bounded, and unbounded occurrences', () => {
    const project = successfulProject(build(occurrences));
    const sequence = node(project, 'sequence');
    const item = node(project, 'localElement', 'item');
    expect(
      project.edges.find(({ targetNodeId }) => targetNodeId === sequence.id)
        ?.occurrence,
    ).toEqual({ min: 0, max: 2 });
    expect(
      project.edges.find(({ targetNodeId }) => targetNodeId === item.id)
        ?.occurrence,
    ).toEqual({ min: 0, max: 'unbounded' });
  });

  it('uses contiguous member order and creates no reverse usedBy edges', () => {
    const project = successfulProject(build(sameDocumentReferences));
    for (const compositor of project.nodes.filter(({ kind }) =>
      ['sequence', 'choice', 'all'].includes(kind),
    )) {
      const orders = getContainedChildren(project, compositor.id).map(
        ({ edge }) => edge.order,
      );
      expect(orders).toEqual(orders.map((_value, index) => index));
    }
    expect(project.edges.some(({ kind }) => kind === 'usedBy')).toBe(false);
  });
});

describe('XSD duplicate symbol spaces and collision gates', () => {
  it('rejects duplicate global elements and shared complex/simple type names', () => {
    const result = buildXsdSchemaProject(
      schemaFor(duplicateSymbols),
      duplicateSymbols,
      options,
    );
    expect(result.project).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      'duplicate-global-element',
      'duplicate-type-definition',
    ]);
    expect(result.diagnostics.every(({ relatedRange }) => relatedRange)).toBe(
      true,
    );
  });

  it('allows a global element and type to share a local name', () => {
    const source = `<xs:schema xmlns:xs="${xmlSchemaNamespaceUri}">
      <xs:element name="Same"/><xs:complexType name="Same"/>
    </xs:schema>`;
    expect(build(source).project).toBeDefined();
  });

  it.each([
    [
      'complex types',
      '<xs:complexType name="Same"/><xs:complexType name="Same"/>',
    ],
    [
      'simple types',
      '<xs:simpleType name="Same"/><xs:simpleType name="Same"/>',
    ],
  ])('rejects duplicate %s in the shared type space', (_name, declarations) => {
    const source = `<xs:schema xmlns:xs="${xmlSchemaNamespaceUri}">${declarations}</xs:schema>`;
    const result = build(source);
    expect(result.project).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'duplicate-type-definition',
        relatedRange: expect.any(Object),
      }),
    ]);
  });

  it('rejects a deterministic local node ID collision', () => {
    const parsed = schemaFor(noTargetReferences);
    const type = parsed.declarations[2] as XsdComplexTypeAst;
    const compositor = type.compositor!;
    const first = compositor.members[0]!;
    const second = compositor.members[1]!;
    const collidingType = {
      ...type,
      compositor: {
        ...compositor,
        members: [first, { ...second, range: first.range }],
      },
    };
    const result = buildXsdSchemaProject(
      {
        ...parsed,
        declarations: [
          ...parsed.declarations.slice(0, 2),
          collidingType,
          ...parsed.declarations.slice(3),
        ],
      },
      noTargetReferences,
      options,
    );
    expect(result.project).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'id-collision',
    );
  });

  it('converts an invalid occurrence into a shared project validation error', () => {
    const parsed = schemaFor(occurrences);
    const type = parsed.declarations[0] as XsdComplexTypeAst;
    const compositor = type.compositor!;
    const malformed = {
      ...type,
      compositor: {
        ...compositor,
        occurrence: { ...compositor.occurrence, minOccurs: -1 },
      },
    };
    const result = buildXsdSchemaProject(
      { ...parsed, declarations: [malformed] },
      occurrences,
      options,
    );
    expect(result.project).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'project-validation-failed',
    );
  });
});

describe('XSD type QName resolution', () => {
  it('resolves forward, backward, repeated, and mutually recursive named types', () => {
    const project = successfulProject(build(sameDocumentReferences));
    const root = node(project, 'globalElement', 'root');
    const item = node(project, 'globalElement', 'item');
    const rootType = node(project, 'complexType', 'RootType');
    const itemType = node(project, 'complexType', 'ItemType');
    const parent = node(project, 'localElement', 'parent');
    expect(
      project.edges.find(
        ({ kind, sourceNodeId, targetNodeId }) =>
          kind === 'typeOf' &&
          sourceNodeId === root.id &&
          targetNodeId === rootType.id,
      ),
    ).toBeDefined();
    expect(
      project.edges.find(
        ({ kind, sourceNodeId, targetNodeId }) =>
          kind === 'typeOf' &&
          sourceNodeId === item.id &&
          targetNodeId === itemType.id,
      ),
    ).toBeDefined();
    expect(
      project.edges.find(
        ({ kind, sourceNodeId, targetNodeId }) =>
          kind === 'typeOf' &&
          sourceNodeId === parent.id &&
          targetNodeId === rootType.id,
      ),
    ).toBeDefined();
  });

  it('resolves an unprefixed QName through the owning default namespace', () => {
    const source = `<xs:schema xmlns:xs="${xmlSchemaNamespaceUri}" xmlns="urn:d" targetNamespace="urn:d">
      <xs:element name="root" type="RootType"/><xs:complexType name="RootType"/>
    </xs:schema>`;
    const result = build(source);
    const project = successfulProject(result);
    const root = node(project, 'globalElement', 'root');
    expect(result.metadataByNodeId[root.id]?.typeReference).toMatchObject({
      raw: 'RootType',
      localName: 'RootType',
      namespaceUri: 'urn:d',
      resolution: 'resolved',
    });
  });

  it('treats unprefixed QNames in the XSD default namespace as built-ins', () => {
    const result = build(defaultSchemaNamespace);
    const project = successfulProject(result);
    const value = node(project, 'localElement', 'value');
    expect(result.metadataByNodeId[value.id]?.typeReference).toMatchObject({
      raw: 'string',
      namespaceUri: xmlSchemaNamespaceUri,
      resolution: 'resolved',
      targetNodeId: 'xsd:builtInType:string',
    });
    expect(project.nodes.some(({ name }) => name === 'string')).toBe(false);
  });

  it('resolves same-document no-namespace types only without targetNamespace', () => {
    const result = build(noTargetReferences);
    const project = successfulProject(result);
    const root = node(project, 'globalElement', 'root');
    expect(result.metadataByNodeId[root.id]?.typeReference).toMatchObject({
      raw: 'RootType',
      resolution: 'resolved',
    });
    expect(result.metadataByNodeId[root.id]?.typeReference).not.toHaveProperty(
      'namespaceUri',
    );
  });

  it('does not redirect an unprefixed no-default QName to targetNamespace', () => {
    const source = `<xs:schema xmlns:xs="${xmlSchemaNamespaceUri}" targetNamespace="urn:t">
      <xs:element name="root" type="RootType"/><xs:complexType name="RootType"/>
    </xs:schema>`;
    const result = build(source);
    expect(result.project).toBeDefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'external-type-reference-deferred',
        severity: 'warning',
      }),
    ]);
    const root = node(result.project!, 'globalElement', 'root');
    expect(result.metadataByNodeId[root.id]?.typeReference).toMatchObject({
      resolution: 'externalDeferred',
    });
  });

  it('uses nested default-namespace shadowing for local type QNames', () => {
    const source = `<xs:schema xmlns:xs="${xmlSchemaNamespaceUri}" xmlns="urn:outer" targetNamespace="urn:outer">
      <xs:complexType name="Outer"><xs:sequence xmlns="${xmlSchemaNamespaceUri}">
        <xs:element name="value" type="string"/>
      </xs:sequence></xs:complexType>
    </xs:schema>`;
    const result = build(source);
    const project = successfulProject(result);
    const value = node(project, 'localElement', 'value');
    expect(result.metadataByNodeId[value.id]?.typeReference).toMatchObject({
      namespaceUri: xmlSchemaNamespaceUri,
      resolution: 'resolved',
      targetNodeId: 'xsd:builtInType:string',
    });
  });

  it('uses the Task 5.1 namespace-shadowing fixture owner context', () => {
    const result = build(namespaceShadowing);
    const project = successfulProject(result);
    const inside = node(project, 'localElement', 'inside');
    const outside = node(project, 'globalElement', 'outside');
    expect(result.metadataByNodeId[inside.id]?.typeReference).toMatchObject({
      raw: 't:Inside',
      namespaceUri: 'urn:inner',
      resolution: 'externalDeferred',
    });
    expect(result.metadataByNodeId[outside.id]?.typeReference).toMatchObject({
      raw: 't:Outside',
      namespaceUri: 'urn:outer',
      resolution: 'externalDeferred',
    });
  });

  it('resolves prefix aliases to one type-definition target', () => {
    const source = `<xs:schema xmlns:xs="${xmlSchemaNamespaceUri}" xmlns:a="urn:t" xmlns:b="urn:t" targetNamespace="urn:t">
      <xs:element name="one" type="a:T"/><xs:element name="two" type="b:T"/><xs:complexType name="T"/>
    </xs:schema>`;
    const result = build(source);
    const project = successfulProject(result);
    const type = node(project, 'complexType', 'T');
    const one = node(project, 'globalElement', 'one');
    const two = node(project, 'globalElement', 'two');
    expect(result.metadataByNodeId[one.id]?.typeReference?.targetNodeId).toBe(
      type.id,
    );
    expect(result.metadataByNodeId[two.id]?.typeReference?.targetNodeId).toBe(
      type.id,
    );
  });

  it('rejects parser-provided QName namespaces inconsistent with owner bindings', () => {
    const parsed = schemaFor(basicStructure);
    const element = parsed.declarations[0] as XsdGlobalElementAst;
    const result = buildXsdSchemaProject(
      {
        ...parsed,
        declarations: [
          {
            ...element,
            type: {
              ...element.type!,
              namespaceUri: 'urn:wrong',
            },
          },
          ...parsed.declarations.slice(1),
        ],
      },
      basicStructure,
      options,
    );
    expect(result.project).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'inconsistent-qname-namespace',
    );
  });

  it('defers external type references with warnings and no placeholder edge', () => {
    const result = build(externalReferences);
    const project = successfulProject(result);
    const root = node(project, 'globalElement', 'root');
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'external-type-reference-deferred',
    );
    expect(result.metadataByNodeId[root.id]?.typeReference).toMatchObject({
      namespaceUri: 'urn:external',
      resolution: 'externalDeferred',
    });
    expect(
      project.edges.some(
        ({ kind, sourceNodeId }) =>
          kind === 'typeOf' && sourceNodeId === root.id,
      ),
    ).toBe(false);
  });

  it('fails a missing same-document type without a dangling edge', () => {
    const source = `<xs:schema xmlns:xs="${xmlSchemaNamespaceUri}" xmlns:t="urn:t" targetNamespace="urn:t">
      <xs:element name="root" type="t:Missing"/>
    </xs:schema>`;
    const result = build(source);
    expect(result.project).toBeUndefined();
    expect(result.metadataByNodeId).toEqual({});
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'unresolved-type-reference',
        severity: 'error',
        reference: 't:Missing',
      }),
    ]);
  });
});

describe('XSD local element ref resolution', () => {
  it('resolves forward, backward, repeated, and recursive local refs', () => {
    const source = `<xs:schema xmlns:xs="${xmlSchemaNamespaceUri}" xmlns:t="urn:e" targetNamespace="urn:e">
      <xs:element name="root"><xs:complexType><xs:sequence>
        <xs:element ref="t:item"/><xs:element ref="t:item"/>
      </xs:sequence></xs:complexType></xs:element>
      <xs:element name="item"><xs:complexType><xs:choice>
        <xs:element ref="t:root"/>
      </xs:choice></xs:complexType></xs:element>
    </xs:schema>`;
    const result = build(source);
    const project = successfulProject(result);
    const root = node(project, 'globalElement', 'root');
    const item = node(project, 'globalElement', 'item');
    const itemRefs = getNodesUsingOrReferencing(project, item.id);
    const rootRefs = getNodesUsingOrReferencing(project, root.id);
    expect(
      itemRefs.filter(({ kind }) => kind === 'elementReference'),
    ).toHaveLength(2);
    expect(
      rootRefs.filter(({ kind }) => kind === 'elementReference'),
    ).toHaveLength(1);
  });

  it('resolves no-target and default-namespace refs', () => {
    const noTarget = build(noTargetReferences);
    const noTargetProject = successfulProject(noTarget);
    const noTargetItem = node(noTargetProject, 'globalElement', 'item');
    expect(
      getNodesUsingOrReferencing(noTargetProject, noTargetItem.id),
    ).toHaveLength(1);

    const target = build(sameDocumentReferences);
    const targetProject = successfulProject(target);
    const targetItem = node(targetProject, 'globalElement', 'item');
    expect(
      getNodesUsingOrReferencing(targetProject, targetItem.id),
    ).toHaveLength(1);
  });

  it('resolves an unprefixed ref through a target default namespace', () => {
    const source = `<xs:schema xmlns:xs="${xmlSchemaNamespaceUri}" xmlns="urn:e" targetNamespace="urn:e">
      <xs:element name="item"/><xs:complexType name="M"><xs:sequence><xs:element ref="item"/></xs:sequence></xs:complexType>
    </xs:schema>`;
    const result = build(source);
    const project = successfulProject(result);
    const item = node(project, 'globalElement', 'item');
    const local = node(project, 'elementReference', 'item');
    expect(result.metadataByNodeId[local.id]?.elementReference).toMatchObject({
      raw: 'item',
      namespaceUri: 'urn:e',
      resolution: 'resolved',
      targetNodeId: item.id,
    });
  });

  it('defers external and XSD-namespace element refs without placeholders', () => {
    const source = `<xs:schema xmlns:xs="${xmlSchemaNamespaceUri}" xmlns:ext="urn:ext">
      <xs:complexType name="M"><xs:sequence>
        <xs:element ref="ext:item"/><xs:element ref="xs:schema"/>
      </xs:sequence></xs:complexType>
    </xs:schema>`;
    const result = build(source);
    const project = successfulProject(result);
    expect(
      result.diagnostics.filter(
        ({ code }) => code === 'external-element-reference-deferred',
      ),
    ).toHaveLength(2);
    expect(project.edges.filter(({ kind }) => kind === 'references')).toEqual(
      [],
    );
  });

  it('fails an unresolved same-document element ref', () => {
    const source = `<xs:schema xmlns:xs="${xmlSchemaNamespaceUri}" xmlns:t="urn:t" targetNamespace="urn:t">
      <xs:complexType name="M"><xs:sequence><xs:element ref="t:missing"/></xs:sequence></xs:complexType>
    </xs:schema>`;
    const result = build(source);
    expect(result.project).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'unresolved-element-reference',
    );
  });

  it('keeps particle occurrence on contains rather than references', () => {
    const project = successfulProject(build(sameDocumentReferences));
    const ref = node(project, 'elementReference', 'g:item');
    const contains = project.edges.find(
      ({ kind, targetNodeId }) =>
        kind === 'contains' && targetNodeId === ref.id,
    );
    const references = project.edges.find(
      ({ kind, sourceNodeId }) =>
        kind === 'references' && sourceNodeId === ref.id,
    );
    expect(contains?.occurrence).toEqual({
      min: 0,
      max: 'unbounded',
    });
    expect(references?.occurrence).toBeUndefined();
  });
});

describe('XSD deferral, project validation, and generic queries', () => {
  it('excludes deferred components while retaining schema relationships', () => {
    const project = successfulProject(build(unsupportedComponents));
    expect(project.nodes.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining([
        'import',
        'include',
        'attribute',
        'restriction',
        'extension',
        'enumeration',
      ]),
    );
    expect(
      project.nodes.some(({ name }) =>
        ['annotation', 'documentation', 'appinfo'].includes(name),
      ),
    ).toBe(false);
  });

  it('retains explicit local form without changing graph identity', () => {
    const source = `<xs:schema xmlns:xs="${xmlSchemaNamespaceUri}" elementFormDefault="qualified">
      <xs:complexType name="M"><xs:sequence><xs:element name="local" form="unqualified"/></xs:sequence></xs:complexType>
    </xs:schema>`;
    const result = build(source);
    const project = successfulProject(result);
    const local = node(project, 'localElement', 'local');
    expect(result.diagnostics).toEqual([]);
    expect(result.metadataByNodeId[local.id]?.localForm).toEqual({
      resolution: 'explicit',
      value: 'unqualified',
    });
  });

  it('records inherited form policy when no explicit override exists', () => {
    const result = build(basicStructure);
    const project = successfulProject(result);
    const title = node(project, 'localElement', 'title');
    expect(result.metadataByNodeId[title.id]?.localForm).toEqual({
      resolution: 'inherited',
      value: 'qualified',
    });
  });

  it('passes shared project validation and resolves every edge endpoint', () => {
    const project = successfulProject(build(sameDocumentReferences));
    expect(validateSchemaProject(project)).toEqual([]);
    const nodeIds = new Set(project.nodes.map(({ id }) => id));
    expect(
      project.edges.every(
        ({ sourceNodeId, targetNodeId }) =>
          nodeIds.has(sourceNodeId) && nodeIds.has(targetNodeId),
      ),
    ).toBe(true);
  });

  it('works with generic root, containment, usage, incoming, and kind queries', () => {
    const project = successfulProject(build(sameDocumentReferences));
    const schema = node(project, 'schema');
    const rootType = node(project, 'complexType', 'RootType');
    const sequence = getContainedChildren(project, rootType.id)[0]!.node;
    expect(getRootNodes(project)).toEqual([schema]);
    expect(getContainedChildren(project, schema.id)).toHaveLength(5);
    expect(sequence.kind).toBe('sequence');
    expect(getContainedChildren(project, sequence.id)).toHaveLength(2);
    expect(
      getNodesUsingOrReferencing(project, rootType.id).map(({ name }) => name),
    ).toEqual(expect.arrayContaining(['root', 'parent']));
    expect(
      getIncomingStructuralRelationships(project, sequence.id),
    ).toHaveLength(1);
    expect(
      getNodesByKind(project, 'globalElement').map(({ name }) => name),
    ).toEqual(['root', 'item']);
  });
});
