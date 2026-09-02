import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import {
  buildRelaxNgSemanticModel,
  buildStandaloneRelaxNgProject,
} from '../../schema/relaxng';
import type { SchemaProject } from '../../schema/model';
import {
  createActiveProjectStore,
  type ActiveProjectState,
} from './projectStore';

const sourceText =
  '<grammar xmlns="http://relaxng.org/ns/structure/1.0"><start><ref name="root"/></start><define name="root"><element name="root"><text/></element></define></grammar>';

function initialState(): ActiveProjectState {
  const project: SchemaProject = {
    id: 'initial',
    displayName: 'Initial',
    sourceFiles: [{ id: 'initial-source', filename: 'initial.dtd' }],
    nodes: [
      {
        id: 'initial-node',
        kind: 'dtdElement',
        name: 'initial',
        sourceFileId: 'initial-source',
      },
    ],
    edges: [],
    rootNodeIds: ['initial-node'],
  };
  return { project, origin: 'sample', sourceFilename: 'initial.dtd' };
}

describe('active-project RELAX NG semantic retention', () => {
  it('deeply clones retained semantic data and clears it on replacement', () => {
    const semanticModel = buildRelaxNgSemanticModel({
      sources: [
        {
          sourceFileId: 'imported-rng-source:model.rng',
          path: 'model.rng',
          sourceText,
        },
      ],
    }).model!;
    const imported = buildStandaloneRelaxNgProject({
      filename: 'model.rng',
      sourceText,
      engine: { name: 'libxml2 RELAX NG', version: '2.15.3' },
      semanticModel,
    });
    const store = createActiveProjectStore(initialState());

    expect(
      store.replace(imported.project, {
        origin: 'imported',
        sourceFilename: 'model.rng',
        relaxNgSemanticModel: semanticModel,
      }).applied,
    ).toBe(true);
    const retained = get(store).relaxNgSemanticModel!;
    expect(retained).toEqual(semanticModel);
    expect(retained).not.toBe(semanticModel);
    expect(retained.patterns).not.toBe(semanticModel.patterns);

    const replacement = initialState();
    expect(
      store.replace(replacement.project, {
        origin: 'sample',
        sourceFilename: replacement.sourceFilename,
      }).applied,
    ).toBe(true);
    expect(get(store).relaxNgSemanticModel).toBeUndefined();
  });
});
