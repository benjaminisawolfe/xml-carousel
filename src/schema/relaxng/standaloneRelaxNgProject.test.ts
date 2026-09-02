import { describe, expect, it } from 'vitest';
import { selectNodeSourceMarkup } from '../../ui/presentation/sourceMarkupPresentation';
import { formatSchemaNodeKind } from '../../ui/carousel/nodePresentation';
import { buildProjectSearchIndex, searchProjectIndex } from '../../app/search';
import {
  buildRelaxNgSemanticModel,
  buildStandaloneRelaxNgProject,
} from './index';

describe('standalone RELAX NG source-first project', () => {
  it('builds one deterministic durable node with exact retained full source', () => {
    const sourceText =
      '<?xml version="1.0"?>\r\n<element xmlns="http://relaxng.org/ns/structure/1.0" name="book">\n  <text/>\n</element>\n';
    const first = buildStandaloneRelaxNgProject({
      filename: 'book.rng',
      sourceText,
      engine: { name: 'libxml2 RELAX NG', version: '2.15.3' },
    });
    const second = buildStandaloneRelaxNgProject({
      filename: 'book.rng',
      sourceText,
      engine: { name: 'libxml2 RELAX NG', version: '2.15.3' },
    });

    expect(first).toEqual(second);
    expect(first.project.nodes).toHaveLength(1);
    expect(first.project.edges).toEqual([]);
    expect(first.project.rootNodeIds).toEqual([first.initialFocusNodeId]);
    const node = first.project.nodes[0]!;
    expect(node).toMatchObject({
      id: 'relaxng:schema:book.rng',
      kind: 'relaxNgSchema',
      name: 'book.rng',
      sourceFileId: 'imported-rng-source:book.rng',
      properties: [
        { label: 'Syntax', value: 'RELAX NG XML syntax' },
        { label: 'Engine', value: 'libxml2 RELAX NG 2.15.3' },
      ],
    });
    expect(formatSchemaNodeKind(node.kind)).toBe('RELAX NG schema');

    const markup = selectNodeSourceMarkup(
      first.project,
      node.id,
      first.sourceMarkupByNodeId,
    );
    expect(markup?.syntax).toBe('rng');
    expect(markup?.fragments).toHaveLength(1);
    expect(markup?.fragments[0]).toMatchObject({
      text: sourceText,
      range: {
        start: { offset: 0, line: 1, column: 1 },
        end: { offset: sourceText.length, line: 5, column: 1 },
      },
    });
  });

  it('reports exactly one nonfatal structural-visualization limitation', () => {
    const result = buildStandaloneRelaxNgProject({
      filename: 'empty.rng',
      sourceText: '<empty xmlns="http://relaxng.org/ns/structure/1.0"/>',
      engine: { name: 'libxml2 RELAX NG', version: '2.15.3' },
    });

    expect(result.visualization.summary).toMatchObject({
      completeness: 'partial',
      totalFindingCount: 1,
      retainedFindingCount: 1,
      omittedConstructCount: 1,
      placeholderCount: 0,
    });
    expect(result.visualization.findings[0]).toMatchObject({
      code: 'relaxng:structural-visualization-unavailable',
      severity: 'warning',
      category: 'visualization',
    });
  });

  it('projects retained semantics into the presentation graph with an effective-start focus', () => {
    const sourceText =
      '<grammar xmlns="http://relaxng.org/ns/structure/1.0"><start><ref name="semantic-only-secret"/></start><define name="semantic-only-secret"><element name="semantic-only-secret"><text/></element></define></grammar>';
    const semanticModel = buildRelaxNgSemanticModel({
      sources: [
        {
          sourceFileId: 'imported-rng-source:model.rng',
          path: 'model.rng',
          sourceText,
        },
      ],
    }).model!;
    const result = buildStandaloneRelaxNgProject({
      filename: 'model.rng',
      sourceText,
      engine: { name: 'libxml2 RELAX NG', version: '2.15.3' },
      semanticModel,
      semanticFindings: [],
    });

    expect(result.semanticModel).toEqual(semanticModel);
    expect(result.semanticFindings).toEqual([]);
    expect(result.project.nodes.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining([
        'relaxNgSchema',
        'relaxNgGrammar',
        'relaxNgStart',
        'relaxNgDefinition',
        'relaxNgElement',
        'relaxNgReference',
      ]),
    );
    expect(result.project.edges.length).toBeGreaterThan(0);
    expect(result.project.nodes[0]!.kind).toBe('relaxNgSchema');
    expect(
      result.project.nodes.find(({ id }) => id === result.initialFocusNodeId)
        ?.kind,
    ).toBe('relaxNgStart');
    expect(result.visualization.summary.completeness).toBe('complete');
    const search = buildProjectSearchIndex({
      project: result.project,
      sourceFilename: 'model.rng',
    });
    expect(
      searchProjectIndex(search, 'semantic-only-secret').map(
        ({ nodeKind }) => nodeKind,
      ),
    ).toEqual(
      expect.arrayContaining([
        'relaxNgDefinition',
        'relaxNgElement',
        'relaxNgReference',
      ]),
    );
  });
});
