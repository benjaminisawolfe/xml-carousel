import { describe, expect, it } from 'vitest';
import type {
  SchemaNode,
  SchemaProject,
  SchemaRelationship,
} from '../../schema/model';
import type { NavigationState } from '../../app/stores/navigationTypes';
import {
  getActionableLeafwardRelationships,
  getKeyboardSelectionWindowStart,
  moveKeyboardSelectedRelationshipId,
  resolveKeyboardSelectedRelationshipId,
} from './keyboardNavigation';
import { getBranchWindow, MAX_LEAFWARD_CARDS } from './carouselWindowing';

function relationship(
  edgeId: string,
  targetNode: SchemaNode,
  order: number,
): SchemaRelationship {
  return {
    node: targetNode,
    edge: {
      id: edgeId,
      kind: 'contains',
      sourceNodeId: 'source',
      targetNodeId: targetNode.id,
      order,
    },
  };
}

const source: SchemaNode = {
  id: 'source',
  kind: 'dtdElement',
  name: 'source',
};
const shared: SchemaNode = {
  id: 'shared',
  kind: 'dtdElement',
  name: 'shared',
};
const leaf: SchemaNode = {
  id: 'leaf',
  kind: 'dtdElement',
  name: 'leaf',
};
const relationships = [
  relationship('edge:parallel:first', shared, 0),
  relationship('edge:parallel:second', shared, 1),
  relationship('edge:leaf', leaf, 2),
  relationship('edge:self-cycle', source, 3),
] as const;
const project: SchemaProject = {
  id: 'keyboard-selection',
  displayName: 'Keyboard selection',
  nodes: [source, shared, leaf],
  edges: relationships.map(({ edge }) => edge),
  rootNodeIds: [source.id],
};
const navigationState: NavigationState = {
  projectId: project.id,
  navigationPath: [source.id],
};

describe('leafward keyboard selection', () => {
  it('keeps canonical edge order and parallel destinations while skipping terminal cycles', () => {
    expect(
      getActionableLeafwardRelationships(
        project,
        navigationState,
        relationships,
      ).map(({ edge }) => edge.id),
    ).toEqual(['edge:parallel:first', 'edge:parallel:second', 'edge:leaf']);
  });

  it('starts without a selected edge and preserves only an exact valid edge ID', () => {
    const actionable = getActionableLeafwardRelationships(
      project,
      navigationState,
      relationships,
    );

    expect(resolveKeyboardSelectedRelationshipId(actionable)).toBeUndefined();
    expect(
      resolveKeyboardSelectedRelationshipId(actionable, 'edge:parallel:second'),
    ).toBe('edge:parallel:second');
    expect(
      resolveKeyboardSelectedRelationshipId(actionable, 'missing'),
    ).toBeUndefined();
    expect(resolveKeyboardSelectedRelationshipId([])).toBeUndefined();
  });

  it('moves up and down without wrapping or changing edge identity', () => {
    const actionable = getActionableLeafwardRelationships(
      project,
      navigationState,
      relationships,
    );

    expect(moveKeyboardSelectedRelationshipId(actionable, undefined, 1)).toBe(
      'edge:parallel:first',
    );
    expect(moveKeyboardSelectedRelationshipId(actionable, undefined, -1)).toBe(
      'edge:leaf',
    );
    expect(
      moveKeyboardSelectedRelationshipId(actionable, 'edge:parallel:first', -1),
    ).toBe('edge:parallel:first');
    expect(
      moveKeyboardSelectedRelationshipId(actionable, 'edge:parallel:first', 1),
    ).toBe('edge:parallel:second');
    expect(moveKeyboardSelectedRelationshipId(actionable, 'edge:leaf', 1)).toBe(
      'edge:leaf',
    );
  });

  it('shifts a bounded window only enough to keep selection visible', () => {
    const manyRelationships = Array.from({ length: 20 }, (_, index) =>
      relationship(
        `edge:${index}`,
        {
          id: `node:${index}`,
          kind: 'dtdElement',
          name: `node-${index}`,
        },
        index,
      ),
    );

    expect(
      getKeyboardSelectionWindowStart(manyRelationships, 'edge:3', 0, 3),
    ).toBe(1);
    expect(
      getKeyboardSelectionWindowStart(manyRelationships, 'edge:2', 0, 3),
    ).toBe(0);
    expect(
      getKeyboardSelectionWindowStart(manyRelationships, 'edge:1', 5, 3),
    ).toBe(1);
  });

  it('keeps 40,000 destinations bounded to the established maximum window', () => {
    const manyRelationships = Array.from({ length: 40_000 }, (_, index) =>
      relationship(
        `edge:${index}`,
        {
          id: `node:${index}`,
          kind: 'globalElement',
          name: `node-${index}`,
        },
        index,
      ),
    );
    const startIndex = getKeyboardSelectionWindowStart(
      manyRelationships,
      'edge:39999',
      0,
      MAX_LEAFWARD_CARDS,
    );
    const window = getBranchWindow(
      manyRelationships,
      startIndex,
      MAX_LEAFWARD_CARDS,
    );

    expect(startIndex).toBe(39_993);
    expect(window.visible).toHaveLength(MAX_LEAFWARD_CARDS);
    expect(window.visible[MAX_LEAFWARD_CARDS - 1]?.item.edge.id).toBe(
      'edge:39999',
    );
  });
});
