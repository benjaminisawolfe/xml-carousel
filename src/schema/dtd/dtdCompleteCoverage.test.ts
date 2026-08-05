import { describe, expect, it } from 'vitest';
import { getOutgoingEdges, validateSchemaProject } from '../model';
import { importDtdSource } from './dtdImport';
import source from '../../../tests/fixtures/dtd/complete-coverage/main.dtd?raw';

function importFixture() {
  const result = importDtdSource(source, {
    projectId: 'complete-dtd-coverage',
    displayName: 'Complete DTD coverage',
    sourceFileId: 'complete-coverage/main.dtd',
    sourceFilename: 'complete-coverage/main.dtd',
    standardsAccepted: true,
  });
  expect(result.status).toBe('success');
  if (result.status !== 'success') throw new Error('fixture import failed');
  return result;
}

describe('complete Xerces-accepted DTD visualization extraction', () => {
  it('retains every declaration class as deterministic source-backed nodes', () => {
    const first = importFixture();
    const second = importFixture();

    expect(first).toEqual(second);
    expect(validateSchemaProject(first.project)).toEqual([]);
    expect(first.visualization.summary.completeness).toBe('complete');
    expect(first.visualization.findings).toEqual([]);

    const kinds = new Set(first.project.nodes.map(({ kind }) => kind));
    expect([...kinds]).toEqual(
      expect.arrayContaining([
        'dtdElement',
        'dtdContentModel',
        'dtdElementReference',
        'dtdAttributeList',
        'dtdAttribute',
        'dtdEntity',
        'dtdParameterEntity',
        'dtdNotation',
        'dtdConditionalSection',
        'dtdComment',
        'dtdProcessingInstruction',
        'dtdDependency',
      ]),
    );
    expect(
      first.project.nodes.every(
        ({ id }) => first.sourceMarkupByNodeId[id]?.fragments.length,
      ),
    ).toBe(true);
  });

  it('preserves nested grammar, occurrence, and undeclared-reference truth', () => {
    const result = importFixture();
    const root = result.project.nodes.find(
      ({ kind, name }) => kind === 'dtdElement' && name === 'root',
    )!;
    const model = result.project.nodes.find(
      ({ kind, name }) =>
        kind === 'dtdContentModel' && name.startsWith('root content model:'),
    )!;
    const choice = result.project.nodes.find(
      ({ kind, name }) =>
        kind === 'dtdContentModel' && name.includes('Choice group'),
    )!;
    const undeclared = result.project.nodes.find(
      ({ kind, name }) =>
        kind === 'dtdElementReference' && name === 'legal-undeclared',
    )!;

    expect(getOutgoingEdges(result.project, root.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'contentModelMember',
          targetNodeId: model.id,
        }),
      ]),
    );
    expect(choice.properties).toEqual(
      expect.arrayContaining([
        { label: 'Structure', value: 'Choice of alternatives' },
        { label: 'Occurrence', value: 'One or more (+)' },
      ]),
    );
    expect(undeclared.properties).toEqual(
      expect.arrayContaining([
        {
          label: 'Reference status',
          value: 'Undeclared element-name reference',
        },
      ]),
    );
    expect(
      getOutgoingEdges(result.project, undeclared.id).some(
        ({ kind }) => kind === 'referencesElementName',
      ),
    ).toBe(false);
  });

  it('retains complete attribute types/defaults and exact notation semantics', () => {
    const result = importFixture();
    const attributes = Object.values(result.dtdAttributesByNodeId);
    const typeLabels = result.project.nodes
      .filter(({ kind }) => kind === 'dtdAttribute')
      .flatMap(({ properties }) =>
        (properties ?? [])
          .filter(({ label }) => label === 'Attribute type')
          .map(({ value }) => value),
      );

    expect(typeLabels).toEqual(
      expect.arrayContaining([
        'CDATA',
        'ID',
        'IDREF',
        'IDREFS',
        'ENTITY',
        'ENTITIES',
        'NMTOKEN',
        'NMTOKENS',
        '(draft | final | archived)',
        'NOTATION (gif | png)',
      ]),
    );
    expect(
      attributes.map(({ defaultDeclaration }) => defaultDeclaration.kind),
    ).toEqual(
      expect.arrayContaining(['required', 'implied', 'fixed', 'value']),
    );
    expect(
      result.project.edges.filter(
        ({ kind }) => kind === 'attributeAllowsNotation',
      ),
    ).toHaveLength(2);
    expect(
      result.project.nodes.filter(({ kind }) => kind === 'dtdAttributeList'),
    ).toHaveLength(4);
  });

  it('keeps entity categories, notations, inert conditionals, comments, PIs, and dependencies distinct', () => {
    const result = importFixture();
    const entityCategories = result.project.nodes
      .filter(
        ({ kind }) => kind === 'dtdEntity' || kind === 'dtdParameterEntity',
      )
      .flatMap(({ properties }) =>
        (properties ?? [])
          .filter(({ label }) => label === 'Entity category')
          .map(({ value }) => value),
      );

    expect(entityCategories).toEqual(
      expect.arrayContaining([
        'Internal parsed general entity',
        'External parsed general entity',
        'External unparsed general entity',
        'Parameter entity',
      ]),
    );
    expect(
      result.project.edges.filter(({ kind }) => kind === 'entityUsesNotation'),
    ).toHaveLength(1);
    expect(
      result.project.nodes
        .filter(({ kind }) => kind === 'dtdConditionalSection')
        .map(({ name }) => name),
    ).toEqual(['INCLUDE conditional section', 'IGNORE conditional section']);
    expect(
      result.project.nodes.some(
        ({ kind, name }) => kind === 'dtdElement' && name === 'included',
      ),
    ).toBe(true);
    expect(
      result.project.nodes.some(
        ({ kind, name }) => kind === 'dtdElement' && name === 'ignored',
      ),
    ).toBe(false);
    expect(
      result.project.nodes.filter(({ kind }) => kind === 'dtdComment').length,
    ).toBe(5);
    expect(
      result.project.nodes.find(
        ({ kind, name }) =>
          kind === 'dtdConditionalSection' &&
          name === 'IGNORE conditional section',
      )?.compactDeclaration,
    ).toContain('Ignored source remains inert.');
    expect(
      result.project.nodes.filter(
        ({ kind }) => kind === 'dtdProcessingInstruction',
      ),
    ).toHaveLength(2);
    expect(
      result.project.nodes.filter(({ kind }) => kind === 'dtdDependency'),
    ).toHaveLength(3);
  });

  it('indexes stable source order without using it as carousel containment', () => {
    const result = importFixture();
    const sourceOrders = result.project.nodes.map(
      ({ sourceOrder }) => sourceOrder ?? Number.MAX_SAFE_INTEGER,
    );
    expect(sourceOrders).toEqual([...sourceOrders].sort((a, b) => a - b));
    expect(
      result.project.edges.filter(({ kind }) => kind === 'sourceOrderAdjacent'),
    ).toHaveLength(result.project.nodes.length - 1);
    expect(
      result.project.edges.some(
        ({ kind, sourceNodeId, targetNodeId }) =>
          kind === 'contains' &&
          result.project.nodes.find(({ id }) => id === sourceNodeId)?.kind ===
            'dtdEntity' &&
          result.project.nodes.find(({ id }) => id === targetNodeId)?.kind ===
            'dtdDependency',
      ),
    ).toBe(false);
  });
});
