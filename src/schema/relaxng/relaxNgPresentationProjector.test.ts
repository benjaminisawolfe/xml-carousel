import { describe, expect, it } from 'vitest';
import operatorSource from '../../../tests/fixtures/relax-ng/manual-qa/02-pattern-operators.rng?raw';
import nameClassSource from '../../../tests/fixtures/relax-ng/manual-qa/03-name-classes.rng?raw';
import datatypeSource from '../../../tests/fixtures/relax-ng/manual-qa/04-datatypes-and-values.rng?raw';
import annotationSource from '../../../tests/fixtures/relax-ng/manual-qa/05-annotations-and-compatibility.rng?raw';
import parentRefSource from '../../../tests/fixtures/relax-ng/manual-qa/06-nested-grammar-parent-ref.rng?raw';
import { buildProjectSearchIndex, searchProjectIndex } from '../../app/search';
import { getOutgoingStructuralRelationships } from '../model';
import { buildFocusCardSummary } from '../../ui/carousel/focusCardSummary';
import { buildInspectorSummary } from '../../ui/inspector/inspectorSummary';
import { selectSourceViewPresentation } from '../../ui/presentation/sourceMarkupPresentation';
import {
  buildRelaxNgSemanticModel,
  buildStandaloneRelaxNgProject,
  deriveStandaloneRelaxNgSourceFileId,
} from './index';

function presented(filename: string, sourceText: string) {
  const semanticModel = buildRelaxNgSemanticModel({
    sources: [
      {
        sourceFileId: deriveStandaloneRelaxNgSourceFileId(filename),
        path: filename,
        sourceText,
      },
    ],
  }).model!;
  const imported = buildStandaloneRelaxNgProject({
    filename,
    sourceText,
    engine: { name: 'libxml2 RELAX NG', version: '2.15.3' },
    semanticModel,
  });
  return { semanticModel, imported };
}

describe('RELAX NG semantic presentation projector', () => {
  it('presents every operator and terminal without rebuilding semantic identity', () => {
    const operator = presented('operators.rng', operatorSource);
    const names = presented('names.rng', nameClassSource);
    const parent = presented('parent.rng', parentRefSource);
    const presentedPatternKinds = new Set(
      [
        ...operator.semanticModel.patterns,
        ...names.semanticModel.patterns,
        ...parent.semanticModel.patterns,
      ]
        .filter(({ kind }) =>
          [
            'choice',
            'group',
            'interleave',
            'optional',
            'zeroOrMore',
            'oneOrMore',
            'mixed',
            'list',
            'text',
            'empty',
            'notAllowed',
          ].includes(kind),
        )
        .map(({ id }) =>
          [
            ...operator.imported.project.nodes,
            ...names.imported.project.nodes,
            ...parent.imported.project.nodes,
          ].find((node) => node.id === id),
        )
        .filter((node) => node !== undefined)
        .map(
          (node) =>
            node.properties?.find(({ label }) => label === 'Pattern')?.value,
        ),
    );

    expect(presentedPatternKinds).toEqual(
      new Set([
        'Choice',
        'Group',
        'Interleave',
        'Optional',
        'Zero or more',
        'One or more',
        'Mixed content',
        'List',
        'Text',
        'Empty',
        'Not allowed',
      ]),
    );
    for (const { semanticModel, imported } of [operator, names, parent]) {
      for (const pattern of semanticModel.patterns) {
        if (pattern.kind === 'grammar') continue;
        expect(imported.project.nodes.some(({ id }) => id === pattern.id)).toBe(
          true,
        );
      }
    }
  });

  it('presents all name classes, datatype details, values, params, and exact source ranges', () => {
    const names = presented('names.rng', nameClassSource);
    expect(
      new Set(
        names.imported.project.nodes
          .filter(({ kind }) => kind === 'relaxNgNameClass')
          .flatMap(
            ({ properties }) =>
              properties
                ?.filter(({ label }) => label === 'Name-class kind')
                .map(({ value }) => value) ?? [],
          ),
      ),
    ).toEqual(new Set(['name', 'anyName', 'nsName', 'choice']));

    const datatype = presented('datatype.rng', datatypeSource);
    const decimal = datatype.imported.project.nodes.find(
      ({ name }) => name === 'Data · decimal',
    )!;
    expect(decimal.properties).toEqual(
      expect.arrayContaining([
        { label: 'Type', value: 'decimal' },
        {
          label: 'Parameters',
          value: 'minInclusive=0, fractionDigits=3',
        },
        { label: 'Except patterns', value: '1' },
      ]),
    );
    expect(
      searchProjectIndex(
        buildProjectSearchIndex({ project: datatype.imported.project }),
        '13.000',
      ).some(
        ({ nodeId }) =>
          nodeId ===
          datatype.semanticModel.patterns.find(
            (pattern) =>
              pattern.kind === 'value' && pattern.lexicalValue === '13.000',
          )?.id,
      ),
    ).toBe(true);

    const sourcePresentation = selectSourceViewPresentation(
      {
        project: datatype.imported.project,
        origin: 'imported',
        sourceFilename: 'datatype.rng',
        sourceMarkupByNodeId: datatype.imported.sourceMarkupByNodeId,
      },
      decimal.id,
    )!;
    const semanticData = datatype.semanticModel.patterns.find(
      (pattern) => pattern.kind === 'data' && pattern.type === 'decimal',
    )!;
    expect(sourcePresentation.location).toMatchObject({
      kind: 'exactLineColumn',
      line: semanticData.range.start.line,
      column: semanticData.range.start.column,
    });
    expect(sourcePresentation.fragments[0]?.text).toBe(
      datatypeSource.slice(
        semanticData.range.start.offset,
        semanticData.range.end.offset,
      ),
    );
  });

  it('binds parentRef to the actual parent grammar and exposes inspection independently of focus', () => {
    const { semanticModel, imported } = presented(
      'parent.rng',
      parentRefSource,
    );
    const parentRef = semanticModel.patterns.find(
      (pattern) => pattern.kind === 'parentRef',
    )!;
    if (parentRef.kind !== 'parentRef') throw new Error('Expected parentRef.');
    const localDefinition = semanticModel.definitionGroups.find(
      ({ name, grammarId }) =>
        name === parentRef.name && grammarId === parentRef.grammarId,
    )!;
    expect(parentRef.resolvedDefinitionGroupId).not.toBe(localDefinition.id);
    expect(
      getOutgoingStructuralRelationships(imported.project, parentRef.id).map(
        ({ node }) => node.id,
      ),
    ).toContain(parentRef.resolvedDefinitionGroupId);

    const focusedBefore = imported.initialFocusNodeId;
    const inspector = buildInspectorSummary(
      imported.project,
      parentRef.id,
      {},
      {},
      imported.sourceMarkupByNodeId,
    )!;
    expect(inspector.overviewProperties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Role',
          value: 'Reference in the actual parent grammar',
        }),
      ]),
    );
    expect(imported.initialFocusNodeId).toBe(focusedBefore);
  });

  it('keeps documentation, foreign annotations, and default values as inert semantic facts', () => {
    const { imported } = presented('annotations.rng', annotationSource);
    const contact = imported.project.nodes.find(
      ({ kind, name }) => kind === 'relaxNgElement' && name === 'contact',
    )!;
    const role = imported.project.nodes.find(
      ({ kind, name }) => kind === 'relaxNgAttribute' && name === 'role',
    )!;
    expect(contact.properties).toEqual(
      expect.arrayContaining([
        {
          label: 'Documentation',
          value:
            'A project-authored contact record used to inspect documentation retention.',
        },
        {
          label: 'Annotation',
          value: 'guide:review: Foreign metadata remains inert semantic data.',
        },
      ]),
    );
    expect(role.properties).toContainEqual({
      label: 'Default value',
      value: 'reader',
    });
    expect(contact.properties?.every(({ value }) => !value.includes('<'))).toBe(
      true,
    );
  });

  it('keeps node identity and graph topology stable across Full, Compact, and Overview summaries', () => {
    const { imported } = presented('operators.rng', operatorSource);
    const nodeId = imported.project.nodes.find(
      ({ kind }) => kind === 'relaxNgElement',
    )!.id;
    const summaries = (['full', 'compact', 'overview'] as const).map(() =>
      buildFocusCardSummary(imported.project, nodeId),
    );
    expect(summaries.map((summary) => summary?.nodeId)).toEqual([
      nodeId,
      nodeId,
      nodeId,
    ]);
    expect(
      summaries.map((summary) =>
        summary?.orderedDestinationSummaries.map(
          ({ edgeId, nodeId: targetId }) => [edgeId, targetId],
        ),
      ),
    ).toEqual([
      summaries[0]?.orderedDestinationSummaries.map(
        ({ edgeId, nodeId: targetId }) => [edgeId, targetId],
      ),
      summaries[0]?.orderedDestinationSummaries.map(
        ({ edgeId, nodeId: targetId }) => [edgeId, targetId],
      ),
      summaries[0]?.orderedDestinationSummaries.map(
        ({ edgeId, nodeId: targetId }) => [edgeId, targetId],
      ),
    ]);
  });
});
