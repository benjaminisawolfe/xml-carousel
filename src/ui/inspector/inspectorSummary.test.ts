import { describe, expect, it } from 'vitest';
import type {
  DtdAttributesByNodeId,
  DtdCommentsByNodeId,
} from '../../schema/dtd';
import type {
  SchemaProject,
  SchemaSourceMarkupByNodeId,
} from '../../schema/model';
import { importXsdSource, type XsdNodeMetadata } from '../../schema/xsd';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../../schema/samples/bookDtdProject';
import { buildInspectorSummary } from './inspectorSummary';
import basicStructure from '../../../tests/fixtures/xsd/basic-structure.xsd?raw';
import externalReferences from '../../../tests/fixtures/xsd/external-references.xsd?raw';
import sameDocumentReferences from '../../../tests/fixtures/xsd/same-document-references.xsd?raw';
import xsdAttributes from '../../../tests/fixtures/xsd/attributes.xsd?raw';
import xsdAnnotations from '../../../tests/fixtures/xsd/annotations.xsd?raw';
import xsdEnumerations from '../../../tests/fixtures/xsd/simple-type-enumerations.xsd?raw';
import type { SchemaPackageUnresolvedReference } from '../../app/import/schemaPackage';

function importXsdFixture(name: string, source: string) {
  const result = importXsdSource(source, {
    projectId: `inspector:${name}`,
    displayName: name,
    sourceFileId: `${name}:source`,
    sourceFilename: `${name}.xsd`,
  });
  expect(result.status).toBe('success');
  if (result.status !== 'success') throw new Error(`Failed to import ${name}.`);
  return result;
}

const project: SchemaProject = {
  id: 'inspector-fixture',
  displayName: 'Inspector fixture',
  nodes: [
    {
      id: 'focus',
      kind: 'dtdElement',
      name: 'focus',
      sourceFileId: ' fixture.dtd ',
      compactDeclaration: ' <!ELEMENT focus (alpha, beta)> ',
    },
    { id: 'alpha', kind: 'dtdElement', name: 'alpha' },
    { id: 'beta', kind: 'dtdElement', name: 'beta' },
    { id: 'gamma', kind: 'dtdElement', name: 'gamma' },
    { id: 'delta', kind: 'dtdElement', name: 'delta' },
    { id: 'epsilon', kind: 'dtdElement', name: 'epsilon' },
    { id: 'container', kind: 'dtdContentModel', name: 'container' },
    { id: 'reference', kind: 'globalElement', name: 'reference' },
    { id: 'inverse', kind: 'dtdElement', name: 'inverse-only' },
  ],
  edges: [
    {
      id: 'contains-3',
      kind: 'contains',
      sourceNodeId: 'focus',
      targetNodeId: 'gamma',
      order: 3,
    },
    {
      id: 'contains-1',
      kind: 'contains',
      sourceNodeId: 'focus',
      targetNodeId: 'alpha',
      order: 1,
      occurrence: { min: 0, max: 1 },
    },
    {
      id: 'contains-4',
      kind: 'contains',
      sourceNodeId: 'focus',
      targetNodeId: 'delta',
      order: 4,
    },
    {
      id: 'contains-2',
      kind: 'contains',
      sourceNodeId: 'focus',
      targetNodeId: 'beta',
      order: 2,
      occurrence: { min: 1, max: 'unbounded' },
    },
    {
      id: 'contains-5',
      kind: 'contains',
      sourceNodeId: 'focus',
      targetNodeId: 'epsilon',
      order: 5,
    },
    {
      id: 'incoming-contains',
      kind: 'contains',
      sourceNodeId: 'container',
      targetNodeId: 'focus',
      order: 0,
    },
    {
      id: 'incoming-reference',
      kind: 'references',
      sourceNodeId: 'reference',
      targetNodeId: 'focus',
      order: 1,
    },
    {
      id: 'inverse-only',
      kind: 'usedBy',
      sourceNodeId: 'inverse',
      targetNodeId: 'focus',
      order: 2,
    },
  ],
  rootNodeIds: ['container'],
};

const attributes: DtdAttributesByNodeId = {
  'attribute:lang': {
    attributeNodeId: 'attribute:lang',
    ownerElementNodeId: 'focus',
    name: 'lang',
    type: { kind: 'tokenized', name: 'CDATA' },
    defaultDeclaration: {
      kind: 'value',
      literal: { value: 'en', quote: 'double' },
    },
    sourceFileId: 'fixture.dtd',
    declarationText: 'lang CDATA "en"',
    sourceRange: {
      start: { offset: 20, line: 2, column: 5 },
      end: { offset: 35, line: 2, column: 20 },
      sourceId: 'fixture.dtd',
    },
    order: 1,
  },
  'attribute:id': {
    attributeNodeId: 'attribute:id',
    ownerElementNodeId: 'focus',
    name: 'id',
    type: { kind: 'tokenized', name: 'ID' },
    defaultDeclaration: { kind: 'required' },
    sourceFileId: 'fixture.dtd',
    declarationText: 'id ID #REQUIRED',
    sourceRange: {
      start: { offset: 4, line: 2, column: 1 },
      end: { offset: 19, line: 2, column: 16 },
      sourceId: 'fixture.dtd',
    },
    order: 0,
  },
  'attribute:other': {
    attributeNodeId: 'attribute:other',
    ownerElementNodeId: 'alpha',
    name: 'other',
    type: { kind: 'tokenized', name: 'NMTOKEN' },
    defaultDeclaration: { kind: 'implied' },
    sourceFileId: 'fixture.dtd',
    declarationText: 'other NMTOKEN #IMPLIED',
    sourceRange: {
      start: { offset: 40, line: 3, column: 1 },
      end: { offset: 63, line: 3, column: 24 },
    },
    order: 0,
  },
};

const comments: DtdCommentsByNodeId = {
  focus: [
    {
      commentId: 'comment:second',
      sourceFileId: 'fixture.dtd',
      raw: '<!-- second -->',
      text: ' second ',
      sourceRange: {
        start: { offset: 30, line: 4, column: 1 },
        end: { offset: 45, line: 4, column: 16 },
      },
      contentRange: {
        start: { offset: 34, line: 4, column: 5 },
        end: { offset: 42, line: 4, column: 13 },
      },
      order: 2,
      attachmentKind: 'contained',
      declarationKind: 'attributeList',
      attachedNodeId: 'focus',
    },
    {
      commentId: 'comment:first',
      sourceFileId: 'fixture.dtd',
      raw: '<!-- first -->',
      text: '\n  first\n    detail\n',
      sourceRange: {
        start: { offset: 0, line: 1, column: 1 },
        end: { offset: 20, line: 3, column: 4 },
      },
      contentRange: {
        start: { offset: 4, line: 1, column: 5 },
        end: { offset: 17, line: 3, column: 1 },
      },
      order: 1,
      attachmentKind: 'preceding',
      declarationKind: 'element',
      attachedNodeId: 'focus',
    },
  ],
};

const focusSourceText = '<!ELEMENT focus (alpha, beta)>   ';
const sourceMarkup: SchemaSourceMarkupByNodeId = {
  focus: {
    syntax: 'dtd',
    fragments: [
      {
        id: 'focus:source',
        sourceFileId: ' fixture.dtd ',
        range: {
          start: { offset: 0, line: 1, column: 1 },
          end: {
            offset: focusSourceText.length,
            line: 1,
            column: focusSourceText.length + 1,
          },
          sourceId: ' fixture.dtd ',
        },
        text: focusSourceText,
      },
    ],
  },
};

describe('buildInspectorSummary', () => {
  it('returns primitive identity and declaration presentation data', () => {
    const summary = buildInspectorSummary(project, 'focus');

    expect(summary).toMatchObject({
      nodeId: 'focus',
      displayName: 'focus',
      kind: 'dtdElement',
      sourceFilename: 'fixture.dtd',
      overviewProperties: [
        { id: 'kind', label: 'Kind', value: 'DTD element declaration' },
      ],
      showRelatedNodeKinds: true,
      declaration: '<!ELEMENT focus (alpha, beta)>',
      isStructuralLeaf: false,
    });
    expect(summary).not.toHaveProperty('node');
    expect(summary).not.toHaveProperty('project');
  });

  it('returns undefined for an unknown node', () => {
    expect(buildInspectorSummary(project, 'unknown')).toBeUndefined();
  });

  it('omits redundant Overview properties for the single-file single-kind sample', () => {
    expect(
      buildInspectorSummary(bookDtdProject, bookDtdNodeIds.book)
        ?.overviewProperties,
    ).toEqual([]);
  });

  it('keeps all five ordered chapter destinations outside the card limit', () => {
    expect(
      buildInspectorSummary(
        bookDtdProject,
        bookDtdNodeIds.chapter,
      )?.orderedDestinations.map(
        ({ displayName, occurrence }) => `${displayName}${occurrence}`,
      ),
    ).toEqual(['title', 'epigraph?', 'section*', 'figure*', 'note*']);
  });

  it('derives three deterministic incoming relationships for reused title', () => {
    expect(
      buildInspectorSummary(
        bookDtdProject,
        bookDtdNodeIds.title,
      )?.incomingRelationships.map(({ displayName }) => displayName),
    ).toEqual(['title.page', 'chapter', 'section']);
    expect(
      buildInspectorSummary(bookDtdProject, bookDtdNodeIds.title)
        ?.isStructuralLeaf,
    ).toBe(true);
  });

  it('shows multi-file source metadata once as a useful Overview property', () => {
    const multiFileProject: SchemaProject = {
      ...bookDtdProject,
      sourceFiles: [
        ...(bookDtdProject.sourceFiles ?? []),
        { id: 'appendix.dtd', filename: 'appendix.dtd' },
      ],
      nodes: bookDtdProject.nodes.map((node, index) =>
        index === 1 ? { ...node, sourceFileId: 'appendix.dtd' } : node,
      ),
    };

    expect(
      buildInspectorSummary(multiFileProject, bookDtdNodeIds.book)
        ?.overviewProperties,
    ).toEqual([
      {
        id: 'source-file',
        label: 'Source file',
        value: 'sample.book.dtd',
      },
    ]);
  });

  it('preserves every ordered destination and occurrence without truncation', () => {
    const destinations = buildInspectorSummary(
      project,
      'focus',
    )?.orderedDestinations;

    expect(destinations).toHaveLength(5);
    expect(
      destinations?.map(({ displayName, occurrence, order }) => ({
        displayName,
        occurrence,
        order,
      })),
    ).toEqual([
      { displayName: 'alpha', occurrence: '?', order: 0 },
      { displayName: 'beta', occurrence: '+', order: 1 },
      { displayName: 'gamma', occurrence: '', order: 2 },
      { displayName: 'delta', occurrence: '', order: 3 },
      { displayName: 'epsilon', occurrence: '', order: 4 },
    ]);
  });

  it('returns all direct incoming structural and usage relationships', () => {
    const incoming = buildInspectorSummary(
      project,
      'focus',
    )?.incomingRelationships;

    expect(incoming).toEqual([
      {
        relationshipId: 'incoming-contains',
        nodeId: 'container',
        displayName: 'container',
        kind: 'dtdContentModel',
        relationshipKind: 'contains',
        order: 0,
      },
      {
        relationshipId: 'incoming-reference',
        nodeId: 'reference',
        displayName: 'reference',
        kind: 'globalElement',
        relationshipKind: 'references',
        order: 1,
      },
    ]);
  });

  it('returns only the inspected element attributes in declared order', () => {
    expect(
      buildInspectorSummary(project, 'focus', attributes)?.attributes,
    ).toEqual([
      {
        nodeId: 'attribute:id',
        name: 'id',
        detailLines: ['ID · Required'],
        order: 0,
      },
      {
        nodeId: 'attribute:lang',
        name: 'lang',
        detailLines: ['CDATA · Default "en"'],
        order: 1,
      },
    ]);
    expect(
      buildInspectorSummary(project, 'beta', attributes)?.attributes,
    ).toEqual([]);
  });

  it('returns complete comment presentation in source order', () => {
    expect(
      buildInspectorSummary(project, 'focus', attributes, comments)?.comments,
    ).toEqual([
      {
        commentId: 'comment:first',
        text: 'first\n  detail',
        order: 1,
      },
      {
        commentId: 'comment:second',
        text: 'second',
        order: 2,
      },
    ]);
    expect(
      buildInspectorSummary(project, 'alpha', attributes, comments)?.comments,
    ).toEqual([]);
  });

  it('includes generic source markup only when explicitly supplied', () => {
    expect(
      buildInspectorSummary(
        project,
        'focus',
        attributes,
        comments,
        sourceMarkup,
      )?.sourceMarkup,
    ).toEqual(sourceMarkup.focus);
    expect(
      buildInspectorSummary(project, 'focus')?.sourceMarkup,
    ).toBeUndefined();
  });

  it('derives graph relationships independently of a navigation journey', () => {
    const firstJourney = ['container', 'focus'];
    const secondJourney = ['reference', 'focus', 'alpha'];

    expect(firstJourney).not.toEqual(secondJourney);
    expect(buildInspectorSummary(project, 'focus')).toEqual(
      buildInspectorSummary(project, 'focus'),
    );
  });

  it('marks nodes with no structural destinations as leaves', () => {
    expect(buildInspectorSummary(project, 'alpha')).toMatchObject({
      orderedDestinations: [],
      isStructuralLeaf: true,
    });
  });

  it('does not mutate the normalized project', () => {
    const before = JSON.stringify(project);

    buildInspectorSummary(project, 'focus');

    expect(JSON.stringify(project)).toBe(before);
  });
});

describe('package unresolved inspector presentation', () => {
  it('filters by owner and presents every kind/reason without internal IDs', () => {
    const imported = importXsdFixture('package-owner', basicStructure);
    const owner = imported.project.nodes.find(
      ({ kind }) => kind === 'globalElement',
    )!;
    const candidate = imported.project.nodes.find(({ id }) => id !== owner.id)!;
    const kinds = [
      'type',
      'element',
      'attribute',
      'restrictionBase',
      'complexTypeBase',
    ] as const;
    const reasons = [
      'notFound',
      'ambiguous',
      'invalidTargetKind',
      'notFound',
      'ambiguous',
    ] as const;
    const unresolved: SchemaPackageUnresolvedReference[] = kinds.map(
      (referenceKind, index) => ({
        id: `schema-package-unresolved:${index}`,
        sourceNodeId: owner.id,
        sourceFileId: owner.sourceFileId!,
        referenceKind,
        raw: index === 0 ? '<script>alert(1)</script>' : `t:Missing${index}`,
        localName: `Missing${index}`,
        reason: reasons[index]!,
        candidateNodeIds: index === 0 ? [] : [candidate.id],
        range: {
          start: { offset: index, line: index + 2, column: 3 },
          end: { offset: index + 1, line: index + 2, column: 4 },
          sourceId: owner.sourceFileId,
        },
      }),
    );
    unresolved.push({
      ...unresolved[0]!,
      id: 'other-owner',
      sourceNodeId: candidate.id,
    });

    const summary = buildInspectorSummary(
      imported.project,
      owner.id,
      {},
      {},
      imported.sourceMarkupByNodeId,
      imported.xsdMetadataByNodeId,
      undefined,
      unresolved,
    );

    expect(summary?.sourceFilename).toBe('package-owner.xsd');
    expect(summary?.unresolvedReferences).toHaveLength(5);
    expect(
      summary?.unresolvedReferences.map(({ kindLabel }) => kindLabel),
    ).toEqual([
      'Type reference',
      'Element reference',
      'Attribute reference',
      'Restriction base',
      'Complex type base',
    ]);
    expect(
      summary?.unresolvedReferences.map(({ reasonLabel }) => reasonLabel),
    ).toEqual([
      'Not found',
      'Ambiguous',
      'Wrong component kind',
      'Not found',
      'Ambiguous',
    ]);
    expect(summary?.unresolvedReferences[0]?.raw).toBe(
      '<script>alert(1)</script>',
    );
    expect(summary?.unresolvedReferences[1]?.candidateSummary).toContain(
      candidate.name,
    );
    expect(JSON.stringify(summary?.unresolvedReferences)).not.toContain(
      candidate.id,
    );
  });
});

describe('XSD inspector summaries', () => {
  it('shows global and direct local XSD attributes only on their owning inspectors', () => {
    const imported = importXsdFixture('attributes', xsdAttributes);
    const schemaId = imported.project.rootNodeIds[0]!;
    const complex = imported.project.nodes.find(
      ({ kind, name }) => kind === 'complexType' && name === 'RootType',
    )!;
    const root = imported.project.nodes.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'root',
    )!;
    const compositor = imported.project.nodes.find(
      ({ kind }) => kind === 'sequence',
    )!;

    expect(
      buildInspectorSummary(
        imported.project,
        schemaId,
        {},
        {},
        {},
        imported.xsdMetadataByNodeId,
      )?.globalAttributes,
    ).toEqual([
      expect.objectContaining({
        name: 'code',
        detailLines: ['xs:string', 'Global · urn:attributes', 'fixed "GLOBAL"'],
      }),
    ]);
    expect(
      buildInspectorSummary(
        imported.project,
        complex.id,
        {},
        {},
        {},
        imported.xsdMetadataByNodeId,
      )?.attributes.map(({ name }) => name),
    ).toEqual(['id', 'status', 'legacy', 'lang', 't:code', 'rating']);
    for (const nodeId of [root.id, compositor.id]) {
      const summary = buildInspectorSummary(
        imported.project,
        nodeId,
        {},
        {},
        {},
        imported.xsdMetadataByNodeId,
      );
      expect(summary?.attributes).toEqual([]);
      expect(summary?.globalAttributes).toEqual([]);
    }
  });

  it('presents schema defaults, namespace, and version without raw metadata', () => {
    const imported = importXsdFixture('basic', basicStructure);
    const schemaId = imported.project.rootNodeIds[0]!;
    const summary = buildInspectorSummary(
      imported.project,
      schemaId,
      {},
      {},
      {},
      imported.xsdMetadataByNodeId,
    );

    expect(summary?.displayName).toBe('Schema overview');
    expect(summary?.isSchemaOverview).toBe(true);
    expect(summary?.overviewProperties).toEqual([
      { id: 'source-file', label: 'Source file', value: 'basic.xsd' },
      {
        id: 'target-namespace',
        label: 'Target namespace',
        value: 'urn:books',
      },
      {
        id: 'element-form-default',
        label: 'Element form default',
        value: 'qualified',
      },
      {
        id: 'attribute-form-default',
        label: 'Attribute form default',
        value: 'unqualified',
      },
      { id: 'version', label: 'Version', value: '1.0' },
      {
        id: 'namespace-declarations',
        label: 'Namespace declarations',
        value:
          'xml=http://www.w3.org/XML/1998/namespace, xs=http://www.w3.org/2001/XMLSchema, tns=urn:books',
      },
    ]);
    expect(summary?.declaration).toBeUndefined();
    expect(summary?.orderedDestinations).toEqual([]);
    expect(summary?.declarations.map(({ displayName }) => displayName)).toEqual(
      ['book', 'BookType', 'CodeType'],
    );
    expect(
      summary?.declarations.map(({ relationshipLabel }) => relationshipLabel),
    ).toEqual([
      'Global element declaration',
      'Complex type declaration',
      'Simple type declaration',
    ]);
    expect(JSON.stringify(summary)).not.toMatch(
      /sourceRange|startTagRange|"resolved"|xsdBuiltIn|externalDeferred/,
    );
  });

  it('keeps containment in Structure and type/ref edges in Related definitions', () => {
    const imported = importXsdFixture('same-document', sameDocumentReferences);
    const globalRoot = imported.project.nodes.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'root',
    )!;
    const localRef = imported.project.nodes.find(
      ({ kind, name }) => kind === 'elementReference' && name === 'g:item',
    )!;
    const rootSummary = buildInspectorSummary(
      imported.project,
      globalRoot.id,
      {},
      {},
      {},
      imported.xsdMetadataByNodeId,
    );
    const localSummary = buildInspectorSummary(
      imported.project,
      localRef.id,
      {},
      {},
      {},
      imported.xsdMetadataByNodeId,
    );

    expect(rootSummary?.orderedDestinations).toEqual([]);
    expect(rootSummary?.relatedDefinitions).toEqual([
      expect.objectContaining({
        relationshipKind: 'typeOf',
        relationshipLabel: 'Type',
        displayName: 'RootType',
      }),
    ]);
    expect(rootSummary).toMatchObject({
      isStructuralLeaf: true,
      hasStructuralDestinations: true,
    });
    expect(localSummary?.overviewProperties).toEqual(
      expect.arrayContaining([
        { id: 'scope', label: 'Scope', value: 'Local' },
        { id: 'occurs', label: 'Occurs', value: '0..unbounded' },
        {
          id: 'element-form',
          label: 'Element form',
          value: 'qualified (inherited)',
        },
        { id: 'references', label: 'References', value: 'item (g:item)' },
      ]),
    );
    expect(localSummary?.orderedDestinations).toEqual([]);
    expect(localSummary?.relatedDefinitions).toEqual([
      expect.objectContaining({
        relationshipKind: 'references',
        relationshipLabel: 'Referenced element',
        displayName: 'item',
      }),
    ]);
    expect(localSummary?.incomingRelationships).toEqual([
      expect.objectContaining({
        relationshipKind: 'contains',
        kind: 'sequence',
      }),
    ]);
    expect(
      localSummary?.incomingRelationships.some(
        ({ relationshipId }) =>
          relationshipId === localSummary.relatedDefinitions[0]?.relationshipId,
      ),
    ).toBe(false);
  });

  it('presents named and anonymous scope while preserving contained compositor structure', () => {
    const imported = importXsdFixture(
      'same-document-types',
      sameDocumentReferences,
    );
    const named = imported.project.nodes.find(
      ({ kind, name }) => kind === 'complexType' && name === 'RootType',
    )!;
    const anonymous = imported.project.nodes.find(
      (node) =>
        node.kind === 'complexType' &&
        imported.xsdMetadataByNodeId[node.id]?.scope === 'anonymous',
    )!;
    const namedSummary = buildInspectorSummary(
      imported.project,
      named.id,
      {},
      {},
      {},
      imported.xsdMetadataByNodeId,
    );
    const anonymousSummary = buildInspectorSummary(
      imported.project,
      anonymous.id,
      {},
      {},
      {},
      imported.xsdMetadataByNodeId,
    );

    expect(namedSummary?.overviewProperties).toContainEqual({
      id: 'scope',
      label: 'Scope',
      value: 'Global',
    });
    expect(namedSummary?.orderedDestinations[0]?.kind).toBe('sequence');
    expect(namedSummary?.relatedDefinitions).toEqual([]);
    expect(anonymousSummary?.overviewProperties).toContainEqual({
      id: 'scope',
      label: 'Scope',
      value: 'Anonymous',
    });
  });

  it('keeps external types deferred and exposes built-in type references', () => {
    const imported = importXsdFixture('external', externalReferences);
    const root = imported.project.nodes.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'root',
    )!;
    const builtIn = imported.project.nodes.find(
      ({ kind, name }) => kind === 'localElement' && name === 'builtIn',
    )!;
    const summarize = (nodeId: string) =>
      buildInspectorSummary(
        imported.project,
        nodeId,
        {},
        {},
        {},
        imported.xsdMetadataByNodeId,
      );

    expect(summarize(root.id)?.overviewProperties).toContainEqual({
      id: 'type',
      label: 'Type',
      value: 'ext:ExternalType (external)',
    });
    expect(summarize(root.id)?.relatedDefinitions).toEqual([]);
    expect(summarize(builtIn.id)?.overviewProperties).toContainEqual({
      id: 'type',
      label: 'Type',
      value: 'xs:string',
    });
    expect(summarize(builtIn.id)?.relatedDefinitions).toEqual([
      expect.objectContaining({
        relationshipKind: 'typeOf',
        displayName: 'xs:string',
        kind: 'builtInType',
      }),
    ]);
  });

  it('presents simple-type, restriction, facet, and built-in base doorways', () => {
    const imported = importXsdFixture('enumerations', xsdEnumerations);
    const summarize = (nodeId: string) =>
      buildInspectorSummary(
        imported.project,
        nodeId,
        {},
        {},
        {},
        imported.xsdMetadataByNodeId,
      );
    const statusType = imported.project.nodes.find(
      ({ kind, name }) => kind === 'simpleType' && name === 'StatusType',
    )!;
    const statusRestriction = imported.project.nodes.find(
      ({ kind, name }) =>
        kind === 'restriction' && name === 'Restriction of StatusType',
    )!;
    const identifierRestriction = imported.project.nodes.find(
      ({ kind, name }) =>
        kind === 'restriction' && name === 'Restriction of IdentifierType',
    )!;
    const simpleSummary = summarize(statusType.id);
    const restrictionSummary = summarize(statusRestriction.id);
    const namedSummary = summarize(identifierRestriction.id);

    expect(simpleSummary?.overviewProperties).toEqual(
      expect.arrayContaining([
        { id: 'base-type', label: 'Base type', value: 'xs:string' },
        { id: 'allowed-values', label: 'Allowed values', value: '5' },
      ]),
    );
    expect(simpleSummary?.orderedDestinations).toEqual([
      expect.objectContaining({
        relationshipKind: 'contains',
        relationshipLabel: 'Restriction',
        nodeId: statusRestriction.id,
      }),
    ]);
    expect(restrictionSummary?.overviewProperties).toEqual(
      expect.arrayContaining([
        { id: 'base-type', label: 'Base type', value: 'xs:string' },
        { id: 'allowed-values', label: 'Allowed values', value: '5' },
      ]),
    );
    expect(restrictionSummary?.relatedDefinitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationshipKind: 'restricts',
          displayName: 'xs:string',
          kind: 'builtInType',
        }),
        expect.objectContaining({
          relationshipKind: 'ownsFacet',
          kind: 'enumeration',
        }),
      ]),
    );
    for (const summary of [simpleSummary, restrictionSummary]) {
      expect(
        summary?.enumerationValues.map(
          ({ value, displayValue, accessibleLabel }) => [
            value,
            displayValue,
            accessibleLabel,
          ],
        ),
      ).toEqual([
        ['active', 'active', 'active'],
        ['paused', 'paused', 'paused'],
        ['active', 'active', 'active'],
        ['', '(empty string)', 'Empty string allowed value'],
        [
          'a-very-long-status-value-that-must-wrap-safely-in-the-inspector',
          'a-very-long-status-value-that-must-wrap-safely-in-the-inspector',
          'a-very-long-status-value-that-must-wrap-safely-in-the-inspector',
        ],
      ]);
      expect(summary?.declaration).toBeUndefined();
      expect(JSON.stringify(summary)).not.toContain('<xs:');
    }
    expect(namedSummary?.relatedDefinitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationshipKind: 'restricts',
          relationshipLabel: 'Base type',
          displayName: 'BaseToken',
        }),
      ]),
    );
  });

  it('preserves DTD inspector sections and safely omits absent XSD metadata', () => {
    const summary = buildInspectorSummary(
      project,
      'focus',
      attributes,
      comments,
      sourceMarkup,
    );

    expect(summary).toMatchObject({
      relatedDefinitions: [],
      attributes: expect.arrayContaining([
        expect.objectContaining({ name: 'id' }),
      ]),
      documentation: [],
      appInfo: [],
      comments: expect.arrayContaining([
        expect.objectContaining({ text: 'first\n  detail' }),
      ]),
      sourceMarkup: sourceMarkup.focus,
    });
  });

  it('presents accepted annotation metadata on every representative normalized owner', () => {
    const imported = importXsdFixture('annotations', xsdAnnotations);
    const summarize = (nodeId: string) =>
      buildInspectorSummary(
        imported.project,
        nodeId,
        {},
        {},
        imported.sourceMarkupByNodeId,
        imported.xsdMetadataByNodeId,
      )!;
    const nodeWithText = (text: string) =>
      imported.project.nodes.find((node) =>
        imported.xsdMetadataByNodeId[node.id]?.annotations?.some((annotation) =>
          annotation.entries.some((entry) => entry.text === text),
        ),
      )!;

    const schemaSummary = summarize(imported.project.rootNodeIds[0]!);
    expect(schemaSummary.documentation).toEqual([
      expect.objectContaining({
        text: 'Defines the persistent identity, exactly. Use <literal> as text. Entity & decoded.',
        language: { value: 'en', displayValue: 'en' },
        source: { value: 'docs/schema', displayValue: 'docs/schema' },
      }),
      expect.objectContaining({
        text: 'Documentation française.',
        language: { value: 'fr', displayValue: 'fr' },
      }),
      expect.objectContaining({
        displayText: 'No text content.',
        isEmpty: true,
      }),
    ]);
    expect(schemaSummary.appInfo).toEqual([
      expect.objectContaining({
        text: 'alpha',
        source: { value: 'tool/schema', displayValue: 'tool/schema' },
      }),
      expect.objectContaining({
        displayText: 'No extracted text content.',
        isEmpty: true,
      }),
    ]);
    expect(schemaSummary.sourceMarkup).toMatchObject({
      syntax: 'xsd',
      fragments: [
        {
          text: expect.stringMatching(/^<xs:schema[\s\S]*<\/xs:schema>$/),
        },
      ],
    });
    expect(
      JSON.stringify({
        documentation: schemaSummary.documentation,
        appInfo: schemaSummary.appInfo,
      }),
    ).not.toContain('rawXml');

    const expectedDocumentationOwners = [
      ['Root element documentation.', 'globalElement'],
      ['Local child documentation.', 'localElement'],
      ['Base type documentation.', 'complexType'],
      ['Base sequence documentation.', 'sequence'],
      ['Allowed status values.', 'simpleType'],
      ['Restriction documentation.', 'restriction'],
      ['Extension documentation.', 'extension'],
      ['Complex restriction documentation.', 'restriction'],
      ['Local attribute documentation.', 'attribute'],
    ] as const;
    for (const [text, kind] of expectedDocumentationOwners) {
      const node = nodeWithText(text);
      expect(node.kind).toBe(kind);
      expect(summarize(node.id).documentation).toContainEqual(
        expect.objectContaining({ text }),
      );
    }

    const statusRestriction = nodeWithText('Restriction documentation.');
    expect(summarize(statusRestriction.id).appInfo).toContainEqual(
      expect.objectContaining({
        text: '',
        source: { value: 'tool/active', displayValue: 'tool/active' },
      }),
    );
    expect(
      summarize(statusRestriction.id).sourceMarkup?.fragments[0]?.text,
    ).toMatch(
      /^<xs:restriction[\s\S]*<xs:enumeration value="active">[\s\S]*<\/xs:restriction>$/,
    );

    const extendedType = nodeWithText('Extended type documentation.');
    expect(
      summarize(extendedType.id).documentation.map(({ text }) => text),
    ).toEqual([
      'Extended type documentation.',
      'Complex-content documentation.',
    ]);
    expect(summarize(extendedType.id).sourceMarkup?.fragments[0]?.text).toMatch(
      /^<xs:complexType name="ExtendedType">[\s\S]*<xs:complexContent>[\s\S]*<xs:extension base="a:BaseType">[\s\S]*<\/xs:complexType>$/,
    );
    const extension = nodeWithText('Extension documentation.');
    expect(summarize(extension.id).sourceMarkup?.fragments[0]?.text).toMatch(
      /^<xs:extension base="a:BaseType">[\s\S]*<xs:attribute name="extensionCode"[\s\S]*<\/xs:extension>$/,
    );
  });

  it('adds annotation presentation without changing structural inspector results', () => {
    const imported = importXsdFixture('annotation-invariance', xsdAnnotations);
    const root = imported.project.nodes.find(
      ({ kind, name }) => kind === 'globalElement' && name === 'root',
    )!;
    const withAnnotations = buildInspectorSummary(
      imported.project,
      root.id,
      {},
      {},
      imported.sourceMarkupByNodeId,
      imported.xsdMetadataByNodeId,
    )!;
    const metadataWithoutAnnotations: Record<string, XsdNodeMetadata> = {};
    for (const [nodeId, metadata] of Object.entries(
      imported.xsdMetadataByNodeId,
    )) {
      metadataWithoutAnnotations[nodeId] = {
        ...metadata,
        annotations: [],
      };
    }
    const withoutAnnotations = buildInspectorSummary(
      imported.project,
      root.id,
      {},
      {},
      imported.sourceMarkupByNodeId,
      metadataWithoutAnnotations,
    )!;

    expect(withAnnotations.documentation).toHaveLength(1);
    expect(withAnnotations.appInfo).toEqual([]);
    expect({
      declarations: withAnnotations.declarations,
      orderedDestinations: withAnnotations.orderedDestinations,
      relatedDefinitions: withAnnotations.relatedDefinitions,
      incomingRelationships: withAnnotations.incomingRelationships,
      isStructuralLeaf: withAnnotations.isStructuralLeaf,
      hasStructuralDestinations: withAnnotations.hasStructuralDestinations,
    }).toEqual({
      declarations: withoutAnnotations.declarations,
      orderedDestinations: withoutAnnotations.orderedDestinations,
      relatedDefinitions: withoutAnnotations.relatedDefinitions,
      incomingRelationships: withoutAnnotations.incomingRelationships,
      isStructuralLeaf: withoutAnnotations.isStructuralLeaf,
      hasStructuralDestinations: withoutAnnotations.hasStructuralDestinations,
    });
  });

  it('derives recursive Structure rows without changing incoming Used by rows', () => {
    const recursiveProject: SchemaProject = {
      id: 'recursive-inspector',
      displayName: 'Recursive inspector',
      nodes: [
        { id: 'one', kind: 'dtdElement', name: 'one' },
        { id: 'two', kind: 'dtdElement', name: 'two' },
        { id: 'section', kind: 'dtdElement', name: 'section' },
      ],
      edges: [
        {
          id: 'one-two',
          kind: 'contains',
          sourceNodeId: 'one',
          targetNodeId: 'two',
        },
        {
          id: 'two-one',
          kind: 'contains',
          sourceNodeId: 'two',
          targetNodeId: 'one',
        },
        {
          id: 'section-section',
          kind: 'contains',
          sourceNodeId: 'section',
          targetNodeId: 'section',
        },
      ],
      rootNodeIds: ['one', 'section'],
    };

    const mutual = buildInspectorSummary(
      recursiveProject,
      'two',
      {},
      {},
      {},
      {},
      { projectId: recursiveProject.id, navigationPath: ['one', 'two'] },
    );
    expect(mutual?.orderedDestinations).toContainEqual(
      expect.objectContaining({
        relationshipId: 'two-one',
        relationshipLabel: 'Recursive child',
        disposition: 'terminalCycleClosure',
        terminalLabel: 'Already present earlier in this path',
        isCurrentFocusClosure: false,
      }),
    );
    expect(mutual?.incomingRelationships).toContainEqual(
      expect.objectContaining({
        relationshipId: 'one-two',
        nodeId: 'one',
      }),
    );

    expect(
      buildInspectorSummary(
        recursiveProject,
        'section',
        {},
        {},
        {},
        {},
        { projectId: recursiveProject.id, navigationPath: ['section'] },
      )?.orderedDestinations,
    ).toContainEqual(
      expect.objectContaining({
        relationshipId: 'section-section',
        relationshipLabel: 'Recursive child',
        terminalLabel: 'Already the current element',
        isCurrentFocusClosure: true,
      }),
    );
  });
});
