import { describe, expect, it } from 'vitest';
import type { SchemaProject } from '../../schema/model';
import {
  buildProjectPresentationContext,
  shouldShowContextNodeKinds,
} from './projectPresentation';

const singleFileProject: SchemaProject = {
  id: 'single',
  displayName: 'Single project',
  nodes: [
    {
      id: 'one',
      kind: 'dtdElement',
      name: 'one',
      sourceFileId: 'sample.dtd',
    },
    {
      id: 'two',
      kind: 'dtdElement',
      name: 'two',
      sourceFileId: 'sample.dtd',
    },
  ],
  edges: [],
  rootNodeIds: ['one'],
};

describe('project presentation context', () => {
  it('uses the sole model-derived filename as project identity', () => {
    expect(buildProjectPresentationContext(singleFileProject)).toMatchObject({
      identityLabel: 'sample.dtd',
      sourceFilenames: ['sample.dtd'],
      hasMultipleSourceFiles: false,
      hasMultipleNodeKinds: false,
    });
  });

  it('detects multi-file and mixed-kind projects', () => {
    const context = buildProjectPresentationContext({
      ...singleFileProject,
      nodes: [
        singleFileProject.nodes[0],
        {
          id: 'two',
          kind: 'complexType',
          name: 'two',
          sourceFileId: 'shared.xsd',
        },
      ],
    });

    expect(context).toMatchObject({
      identityLabel: 'Single project',
      sourceFilenames: ['sample.dtd', 'shared.xsd'],
      hasMultipleSourceFiles: true,
      hasMultipleNodeKinds: true,
    });
  });

  it('hides homogeneous context kinds and shows disambiguating kinds', () => {
    expect(
      shouldShowContextNodeKinds(
        [{ kind: 'dtdElement' }, { kind: 'dtdElement' }],
        'dtdElement',
      ),
    ).toBe(false);
    expect(
      shouldShowContextNodeKinds(
        [{ kind: 'dtdElement' }, { kind: 'complexType' }],
        'dtdElement',
      ),
    ).toBe(true);
    expect(
      shouldShowContextNodeKinds([{ kind: 'complexType' }], 'dtdElement'),
    ).toBe(true);
  });
});
