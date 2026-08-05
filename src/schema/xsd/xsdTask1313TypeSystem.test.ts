import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import fixture from '../../../tests/fixtures/xsd/task-13.13-type-system.xsd?raw';
import {
  getIncomingRelationships,
  getNodesByKind,
  getOutgoingRelationships,
  validateSchemaProject,
} from '../model';
import { buildProjectSearchIndex } from '../../app/search';
import { buildFocusCardSummary } from '../../ui/carousel/focusCardSummary';
import {
  formatSchemaEdgeKind,
  formatSchemaNodeKind,
} from '../../ui/carousel/nodePresentation';
import { buildInspectorSummary } from '../../ui/inspector/inspectorSummary';
import {
  validateWithProductionXerces,
  type XercesAdapter,
  type XercesModuleFactory,
} from '../../standards/xerces';
import { createXercesAdapter } from '../../standards/xerces/adapter';
import {
  selectXsdNavigationGroups,
  selectXsdNodePresentation,
} from '../../ui/presentation/xsdMetadataPresentation';
import { importXsdSource } from './xsdImport';

const options = {
  projectId: 'task-13.13-type-system',
  displayName: 'Task 13.13 type system',
  sourceFileId: 'task-13.13-type-system.xsd',
  sourceFilename: 'task-13.13-type-system.xsd',
  standardsAccepted: true,
} as const;
let xerces: XercesAdapter;

beforeAll(async () => {
  const runtimeRoot = path.resolve('src/standards/xerces/runtime');
  const moduleUrl = pathToFileURL(path.join(runtimeRoot, 'xerces-runtime.js'));
  const wasmUrl = pathToFileURL(path.join(runtimeRoot, 'xerces-runtime.wasm'));
  const runtime = (await import(moduleUrl.href)) as {
    default: XercesModuleFactory;
  };
  xerces = await createXercesAdapter(runtime.default, moduleUrl, wasmUrl);
});

function imported() {
  const result = importXsdSource(fixture, options);
  if (result.status !== 'success') {
    throw new Error(JSON.stringify(result.diagnostics, null, 2));
  }
  return result;
}

describe('Task 13.13 XSD type-system and constraint projection', () => {
  it('is accepted by the authoritative production Xerces boundary', async () => {
    const validation = await validateWithProductionXerces(
      {
        attemptId: 'task-13.13-fixture',
        format: 'xsd',
        entryPath: options.sourceFilename,
        files: [
          {
            path: options.sourceFilename,
            bytes: new TextEncoder().encode(fixture),
          },
        ],
      },
      async () => xerces,
    );
    expect(validation).toMatchObject({ status: 'valid', diagnostics: [] });
  });

  it('projects every simple variety and all twelve XSD 1.0 facets lexically', () => {
    const result = imported();
    const facets = [
      ...getNodesByKind(result.project, 'facet'),
      ...getNodesByKind(result.project, 'enumeration'),
    ].map((node) => result.xsdMetadataByNodeId[node.id]!.facet!);

    expect(new Set(facets.map(({ kind }) => kind))).toEqual(
      new Set([
        'length',
        'minLength',
        'maxLength',
        'pattern',
        'enumeration',
        'whiteSpace',
        'maxInclusive',
        'maxExclusive',
        'minInclusive',
        'minExclusive',
        'totalDigits',
        'fractionDigits',
      ]),
    );
    expect(
      facets.find(
        ({ kind, value }) => kind === 'minInclusive' && value === '-0001.50',
      )?.lexicalValue,
    ).toBe('-0001.50');
    expect(
      facets.filter(({ kind }) => kind === 'pattern').map(({ value }) => value),
    ).toEqual(['[A-Z][A-Z0-9]+', '[^_]+', '[A-Z][A-Z0-9._:/-]{0,120}']);
    expect(facets.find(({ kind }) => kind === 'whiteSpace')).toMatchObject({
      value: 'collapse',
      fixed: true,
      fixedLexicalValue: 'true',
    });

    expect(getNodesByKind(result.project, 'list')).toHaveLength(2);
    expect(getNodesByKind(result.project, 'union')).toHaveLength(2);
    expect(
      getNodesByKind(result.project, 'simpleType').map(
        ({ id }) => result.xsdMetadataByNodeId[id]?.simpleTypeVariety,
      ),
    ).toEqual(expect.arrayContaining(['restriction', 'list', 'union']));
    expect(result.visualization.findings).toEqual([]);
  });

  it('builds navigable built-in ancestry and distinct derivation methods', () => {
    const result = imported();
    const builtIns = getNodesByKind(result.project, 'builtInType');
    const byName = new Map(builtIns.map((node) => [node.name, node]));
    const ncName = byName.get('xs:NCName')!;
    expect(ncName.sourceFileId).toBeUndefined();
    expect(result.sourceMarkupByNodeId[ncName.id]).toBeUndefined();
    expect(result.xsdMetadataByNodeId[ncName.id]).toMatchObject({
      scope: 'standard',
      applicationOwned: true,
      builtInType: {
        directBaseLocalName: 'Name',
        ancestry: [
          'Name',
          'token',
          'normalizedString',
          'string',
          'anySimpleType',
          'anyType',
        ],
      },
    });
    expect(
      getOutgoingRelationships(result.project, ncName.id).map(
        ({ edge, node }) => [edge.kind, node.name],
      ),
    ).toContainEqual(['derivesFrom', 'xs:Name']);

    const methods = new Set(
      Object.values(result.xsdMetadataByNodeId)
        .map(({ typeDerivation }) => typeDerivation?.method)
        .filter(Boolean),
    );
    for (const method of [
      'simpleRestriction',
      'simpleList',
      'simpleUnion',
      'complexExtension',
      'complexRestriction',
      'simpleContentExtension',
      'simpleContentRestriction',
      'builtInRestriction',
      'builtInList',
    ]) {
      expect(methods.has(method as never), method).toBe(true);
    }
    const base = result.project.nodes.find(({ name }) => name === 'BaseType')!;
    expect(
      getIncomingRelationships(result.project, base.id).some(
        ({ edge, node }) =>
          edge.kind === 'derivesFrom' && node.name === 'ExtendedType',
      ),
    ).toBe(true);
  });

  it('retains final/block effects, lexical value constraints, identities, and notation', () => {
    const result = imported();
    const root = result.project.nodes.find(({ name }) => name === 'root')!;
    expect(result.xsdMetadataByNodeId[root.id]).toMatchObject({
      effectiveBlock: {
        tokens: ['restriction'],
        source: 'declaration',
        applicability: 'element',
      },
      effectiveFinal: {
        tokens: ['extension'],
        source: 'declaration',
        applicability: 'element',
      },
    });
    const fixedCode = result.project.nodes.find(
      ({ name }) => name === 'fixedCode',
    )!;
    expect(
      result.xsdMetadataByNodeId[fixedCode.id]?.valueConstraint,
    ).toMatchObject({
      kind: 'fixed',
      value: 'BETA',
      lexicalValue: 'BETA',
    });

    const identities = getNodesByKind(result.project, 'identityConstraint');
    expect(identities.map(({ name }) => name).sort()).toEqual([
      'itemKey',
      'itemReference',
      'uniqueCode',
    ]);
    const keyref = identities.find(({ name }) => name === 'itemReference')!;
    expect(
      result.xsdMetadataByNodeId[keyref.id]?.identityConstraint,
    ).toMatchObject({
      kind: 'keyref',
      referReference: { raw: 't:itemKey', resolution: 'resolved' },
    });
    expect(
      getOutgoingRelationships(result.project, keyref.id).map(
        ({ edge, node }) => [edge.kind, node.name],
      ),
    ).toContainEqual(['keyrefTargets', 'itemKey']);
    expect(
      getNodesByKind(result.project, 'field')
        .filter(
          ({ id }) =>
            result.xsdMetadataByNodeId[id]?.ownerNodeId ===
            identities.find(({ name }) => name === 'uniqueCode')?.id,
        )
        .map(
          ({ id }) =>
            result.xsdMetadataByNodeId[id]?.xpathConstraint?.fieldOrder,
        ),
    ).toEqual([0, 1]);

    const notation = getNodesByKind(result.project, 'xsdNotation')[0]!;
    expect(result.xsdMetadataByNodeId[notation.id]?.notation).toEqual({
      publicIdentifier: 'image/jpeg',
      systemIdentifier: 'urn:media:jpeg',
    });
    const notationValue = getNodesByKind(result.project, 'enumeration').find(
      ({ id }) => result.xsdMetadataByNodeId[id]?.facet?.value === 't:jpeg',
    )!;
    expect(
      result.xsdMetadataByNodeId[notationValue.id]?.notationReference,
    ).toMatchObject({
      raw: 't:jpeg',
      targetNodeId: notation.id,
    });
    expect(
      getOutgoingRelationships(result.project, notationValue.id).map(
        ({ edge, node }) => [edge.kind, node.id],
      ),
    ).toContainEqual(['notationConstraint', notation.id]);
  });

  it('is deterministic, serializable, searchable, source-linked, and inspectable', () => {
    const first = imported();
    const second = imported();
    expect(first).toEqual(second);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(validateSchemaProject(first.project)).toEqual([]);

    const search = buildProjectSearchIndex({
      project: first.project,
      xsdMetadataByNodeId: first.xsdMetadataByNodeId,
    });
    expect(search.documents).toHaveLength(first.project.nodes.length);
    expect(
      search.documents.some(({ fields }) =>
        fields.some(({ text }) => text === '[A-Z][A-Z0-9]+'),
      ),
    ).toBe(true);
    expect(
      search.documents.some(({ fields }) =>
        fields.some(({ text }) => text === 't:item'),
      ),
    ).toBe(true);

    const navigation = selectXsdNavigationGroups(
      first.project,
      first.xsdMetadataByNodeId,
    );
    expect(navigation.simpleTypes.length).toBeGreaterThan(0);
    const union = getNodesByKind(first.project, 'union')[0]!;
    expect(
      selectXsdNodePresentation(
        first.project,
        union.id,
        first.xsdMetadataByNodeId,
      ),
    ).toBeDefined();
    const inspector = buildInspectorSummary(
      first.project,
      union.id,
      {},
      {},
      first.sourceMarkupByNodeId,
      first.xsdMetadataByNodeId,
    )!;
    expect(inspector.overviewProperties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Variety', value: 'union' }),
        expect.objectContaining({
          label: 'Member types',
          value: 't:Code xs:string',
        }),
      ]),
    );
    expect(inspector.sourceMarkup?.fragments[0]?.text).toContain('<xs:union');
  });

  it('provides bounded carousel routes and textual accessible labels for every new construct', () => {
    const result = imported();
    const taskKinds = [
      'list',
      'union',
      'facet',
      'enumeration',
      'builtInType',
      'identityConstraint',
      'selector',
      'field',
      'xsdNotation',
    ] as const;
    const taskEdges = [
      'ownsTypeVariety',
      'ownsFacet',
      'derivesFrom',
      'listItemType',
      'unionMemberType',
      'ownsIdentityConstraint',
      'ownsSelector',
      'ownsField',
      'keyrefTargets',
      'notationConstraint',
    ] as const;
    for (const kind of taskKinds) {
      expect(formatSchemaNodeKind(kind)).toMatch(/\S/u);
    }
    for (const kind of taskEdges) {
      expect(formatSchemaEdgeKind(kind)).toMatch(/\S/u);
    }

    const union = getNodesByKind(result.project, 'union')[0]!;
    const unionCard = buildFocusCardSummary(
      result.project,
      union.id,
      {},
      result.xsdMetadataByNodeId,
    )!;
    expect(unionCard.orderedDestinationSummaries.length).toBeGreaterThan(0);
    expect(unionCard.orderedDestinationSummaries.length).toBeLessThan(10);

    const recursive = result.project.nodes.find(
      ({ kind, name }) => kind === 'complexType' && name === 'RecursiveType',
    )!;
    const recursiveCard = buildFocusCardSummary(
      result.project,
      recursive.id,
      {},
      result.xsdMetadataByNodeId,
    )!;
    expect(recursiveCard.orderedDestinationSummaries.length).toBeLessThan(10);
    expect(
      result.project.nodes
        .filter(({ kind }) => taskKinds.includes(kind as never))
        .every(({ id, kind }) =>
          kind === 'builtInType'
            ? result.sourceMarkupByNodeId[id] === undefined
            : (result.sourceMarkupByNodeId[id]?.fragments.length ?? 0) > 0,
        ),
    ).toBe(true);
  });
});
