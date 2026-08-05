import { describe, expect, it } from 'vitest';
import source from '../../tests/fixtures/dtd/complete-coverage/main.dtd?raw';
import { buildProjectSearchIndex, searchProjectIndex } from '../app/search';
import { importDtdSource } from '../schema/dtd';
import { formatSchemaNodeKind } from '../ui/carousel/nodePresentation';
import { buildFocusCardSummary } from '../ui/carousel/focusCardSummary';
import { buildInspectorSummary } from '../ui/inspector/inspectorSummary';
import { selectNodeSourceMarkup } from '../ui/presentation/sourceMarkupPresentation';

function fixture() {
  const imported = importDtdSource(source, {
    projectId: 'complete-dtd-ui',
    displayName: 'Complete DTD UI',
    sourceFileId: 'complete/main.dtd',
    sourceFilename: 'complete/main.dtd',
    standardsAccepted: true,
  });
  expect(imported.status).toBe('success');
  if (imported.status !== 'success') throw new Error('fixture import failed');
  return imported;
}

describe('complete DTD presentation routes', () => {
  it('creates one searchable document for every construct and indexes semantic source text', () => {
    const imported = fixture();
    const index = buildProjectSearchIndex({
      project: imported.project,
      sourceFilename: 'complete/main.dtd',
      commentsByNodeId: imported.commentsByNodeId,
      dtdAttributesByNodeId: imported.dtdAttributesByNodeId,
    });
    expect(index.documents).toHaveLength(imported.project.nodes.length);

    const cases = [
      ['legal-undeclared', 'dtdElementReference'],
      ['archived', 'dtdAttribute'],
      ['image/gif', 'dtdNotation'],
      ['external-parameter', 'dtdParameterEntity'],
      ['Unattached final source note', 'dtdComment'],
      ['prefer="public"', 'dtdProcessingInstruction'],
      ['parts/declarations.ent', 'dtdDependency'],
    ] as const;
    for (const [query, expectedKind] of cases) {
      expect(
        searchProjectIndex(index, query).some(
          ({ nodeKind }) => nodeKind === expectedKind,
        ),
      ).toBe(true);
    }
  });

  it('provides every normalized node with inspector facts and safe source access', () => {
    const imported = fixture();
    for (const node of imported.project.nodes) {
      const inspector = buildInspectorSummary(
        imported.project,
        node.id,
        imported.dtdAttributesByNodeId,
        imported.commentsByNodeId,
        imported.sourceMarkupByNodeId,
      );
      expect(inspector?.displayName).toBeTruthy();
      expect(inspector?.sourceMarkup?.fragments.length).toBeGreaterThan(0);
      expect(
        selectNodeSourceMarkup(
          imported.project,
          node.id,
          imported.sourceMarkupByNodeId,
        )?.fragments.length,
      ).toBeGreaterThan(0);
    }

    const processingInstruction = imported.project.nodes.find(
      ({ kind, name }) =>
        kind === 'dtdProcessingInstruction' && name === 'catalog',
    )!;
    const markup = selectNodeSourceMarkup(
      imported.project,
      processingInstruction.id,
      imported.sourceMarkupByNodeId,
    )!;
    expect(markup.fragments[0]?.text).toBe('<?catalog prefer="public"?>');
  });

  it('keeps the carousel bounded and grammar-structured without false declaration containment', () => {
    const imported = fixture();
    const root = imported.project.nodes.find(
      ({ kind, name }) => kind === 'dtdElement' && name === 'root',
    )!;
    const rootCard = buildFocusCardSummary(imported.project, root.id)!;
    expect(
      rootCard.orderedDestinationSummaries.map(
        ({ displayName, kind, occurrence }) =>
          `${displayName}:${kind}:${occurrence}`,
      ),
    ).toEqual([
      'header:dtdElementReference:',
      'chapter:dtdElementReference:*',
      'appendix:dtdElementReference:*',
      'footer:dtdElementReference:?',
      'legal-undeclared:dtdElementReference:*',
    ]);
    const rootInspector = buildInspectorSummary(imported.project, root.id)!;
    const model = rootInspector.relatedDefinitions.find(
      ({ relationshipKind }) => relationshipKind === 'contentModelMember',
    )!;
    expect(model.kind).toBe('dtdContentModel');
    const modelInspector = buildInspectorSummary(
      imported.project,
      model.nodeId,
    )!;
    expect(
      modelInspector.relatedDefinitions.filter(
        ({ relationshipKind }) => relationshipKind === 'contentModelMember',
      ),
    ).toHaveLength(4);
    expect(
      imported.project.edges.some(
        ({ kind, sourceNodeId }) =>
          kind === 'contains' &&
          imported.project.nodes.find(({ id }) => id === sourceNodeId)?.kind ===
            'dtdEntity',
      ),
    ).toBe(false);
  });

  it('exposes textual, non-color-only accessible construct and relationship labels', () => {
    const imported = fixture();
    const labels = new Set(
      imported.project.nodes.map(({ kind }) => formatSchemaNodeKind(kind)),
    );
    expect([...labels]).toEqual(
      expect.arrayContaining([
        'DTD element-name reference',
        'DTD parameter-entity declaration',
        'DTD conditional section',
        'DTD processing instruction',
        'Project-local DTD dependency',
      ]),
    );
    const undeclared = imported.project.nodes.find(
      ({ kind, name }) =>
        kind === 'dtdElementReference' && name === 'legal-undeclared',
    )!;
    expect(undeclared.properties).toContainEqual({
      label: 'Reference status',
      value: 'Undeclared element-name reference',
    });
  });
});
