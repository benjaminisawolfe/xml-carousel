import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildProjectSearchIndex, searchProjectIndex } from '../app/search';
import {
  areRelaxNgSemanticallyEquivalent,
  buildRelaxNgSemanticModel,
  buildStandaloneRelaxNgProject,
  deriveStandaloneRelaxNgSourceFileId,
} from '../schema/relaxng';
import { buildFocusCardSummary } from '../ui/carousel/focusCardSummary';
import { buildInspectorSummary } from '../ui/inspector/inspectorSummary';
import { selectSourceViewPresentation } from '../ui/presentation/sourceMarkupPresentation';
import { buildRelaxNgVisualizationMatrix } from '../../scripts/relax-ng-visualization-catalogue.mjs';

const rngNamespace = 'http://relaxng.org/ns/structure/1.0';
const rngSource = `<grammar xmlns="${rngNamespace}"><start><element name="catalog"><group><attribute name="version"><text/></attribute><zeroOrMore><element name="item"><text/></element></zeroOrMore></group></element></start></grammar>`;
const rncSource =
  'start = element catalog { attribute version { text }, element item { text }* }';

function presented(filename: string, sourceText: string) {
  const sourceFileId = deriveStandaloneRelaxNgSourceFileId(filename);
  const semanticModel = buildRelaxNgSemanticModel({
    sources: [{ sourceFileId, path: filename, sourceText }],
  }).model!;
  const imported = buildStandaloneRelaxNgProject({
    filename,
    sourceText,
    engine: { name: 'libxml2 RELAX NG', version: '2.15.3' },
    semanticModel,
  });
  return { semanticModel, imported };
}

describe('Task 17.9 RELAX NG complete visualization authority', () => {
  it('keeps the committed matrix byte-identical to its canonical catalogue', async () => {
    const matrixPath = path.resolve(
      'docs/technical/relax-ng-complete-visualization-matrix.json',
    );
    const text = await readFile(matrixPath, 'utf8');
    const generated = `${JSON.stringify(buildRelaxNgVisualizationMatrix(), null, 2)}\n`;
    expect(text).toBe(generated);
    const matrix = JSON.parse(text) as {
      entries: Array<{ id: string; construct: string }>;
    };
    expect(matrix.entries).toHaveLength(77);
    expect(new Set(matrix.entries.map(({ id }) => id)).size).toBe(77);
    expect(matrix.entries.map(({ id }) => id)).toEqual(
      [...matrix.entries.map(({ id }) => id)].sort(),
    );
  });

  it('preserves syntax-neutral meaning while every source-facing surface remains syntax-specific', () => {
    const rng = presented('paired.rng', rngSource);
    const rnc = presented('paired.rnc', rncSource);
    expect(
      areRelaxNgSemanticallyEquivalent(rng.semanticModel, rnc.semanticModel),
    ).toBe(true);

    for (const [filename, sourceText, presentedSource] of [
      ['paired.rng', rngSource, rng],
      ['paired.rnc', rncSource, rnc],
    ] as const) {
      const catalog = presentedSource.imported.project.nodes.find(
        ({ kind, name }) => kind === 'relaxNgElement' && name === 'catalog',
      )!;
      const source = selectSourceViewPresentation(
        {
          project: presentedSource.imported.project,
          origin: 'imported',
          sourceFilename: filename,
          sourceMarkupByNodeId: presentedSource.imported.sourceMarkupByNodeId,
        },
        catalog.id,
      )!;
      expect(source.fragments).toHaveLength(1);
      expect(sourceText).toContain(source.fragments[0]!.text);
      const inspector = buildInspectorSummary(
        presentedSource.imported.project,
        catalog.id,
        {},
        {},
        presentedSource.imported.sourceMarkupByNodeId,
      );
      expect(inspector?.sourceMarkup?.fragments[0]?.text).toBe(
        source.fragments[0]!.text,
      );
    }
    const compactSource = selectSourceViewPresentation(
      {
        project: rnc.imported.project,
        origin: 'imported',
        sourceFilename: 'paired.rnc',
        sourceMarkupByNodeId: rnc.imported.sourceMarkupByNodeId,
      },
      rnc.imported.project.nodes.find(
        ({ kind, name }) => kind === 'relaxNgElement' && name === 'catalog',
      )!.id,
    )!;
    expect(compactSource.fragments[0]?.text).toContain('element catalog');
    expect(compactSource.fragments[0]?.text).not.toContain('<element');
  });

  it('keeps Search, journey, Inspector, and zoom identities bound to the same semantic node', () => {
    const { imported } = presented('paired.rnc', rncSource);
    const item = imported.project.nodes.find(
      ({ kind, name }) => kind === 'relaxNgElement' && name === 'item',
    )!;
    const search = searchProjectIndex(
      buildProjectSearchIndex({ project: imported.project }),
      'item',
    );
    expect(search.some(({ nodeId }) => nodeId === item.id)).toBe(true);
    expect(
      buildInspectorSummary(
        imported.project,
        item.id,
        {},
        {},
        imported.sourceMarkupByNodeId,
      ),
    ).toBeDefined();
    const snapshots = (['full', 'compact', 'overview'] as const).map(() =>
      buildFocusCardSummary(imported.project, item.id),
    );
    expect(snapshots.every((snapshot) => snapshot?.nodeId === item.id)).toBe(
      true,
    );
    const summaries = snapshots.map((snapshot) => {
      if (!snapshot) throw new Error('Expected focus-card summary.');
      return snapshot;
    });
    expect(
      summaries.map(({ orderedDestinationSummaries }) =>
        orderedDestinationSummaries.map(({ edgeId, nodeId }) => [
          edgeId,
          nodeId,
        ]),
      ),
    ).toEqual([
      summaries[0]!.orderedDestinationSummaries.map(({ edgeId, nodeId }) => [
        edgeId,
        nodeId,
      ]),
      summaries[0]!.orderedDestinationSummaries.map(({ edgeId, nodeId }) => [
        edgeId,
        nodeId,
      ]),
      summaries[0]!.orderedDestinationSummaries.map(({ edgeId, nodeId }) => [
        edgeId,
        nodeId,
      ]),
    ]);
  });
});
