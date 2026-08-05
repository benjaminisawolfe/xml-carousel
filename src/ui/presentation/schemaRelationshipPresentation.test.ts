import { describe, expect, it } from 'vitest';
import {
  getOutgoingStructuralRelationships,
  type SchemaProject,
} from '../../schema/model';
import type { NavigationState } from '../../app/stores/navigationTypes';
import {
  buildJourneyRelationshipPresentation,
  formatTerminalCycleRelationshipLabel,
  formatOutgoingRelationshipLabel,
} from './schemaRelationshipPresentation';

const project: SchemaProject = {
  id: 'relationship-presentation',
  displayName: 'Relationship presentation',
  nodes: [
    { id: 'element', kind: 'globalElement', name: 'element' },
    { id: 'child', kind: 'localElement', name: 'child' },
    { id: 'type', kind: 'complexType', name: 'ElementType' },
  ],
  edges: [
    {
      id: 'element-child:first',
      kind: 'contains',
      sourceNodeId: 'element',
      targetNodeId: 'child',
      order: 0,
    },
    {
      id: 'element-child:second',
      kind: 'contains',
      sourceNodeId: 'element',
      targetNodeId: 'child',
      order: 1,
    },
    {
      id: 'child-element',
      kind: 'references',
      sourceNodeId: 'child',
      targetNodeId: 'element',
    },
    {
      id: 'child-child',
      kind: 'contains',
      sourceNodeId: 'child',
      targetNodeId: 'child',
    },
    {
      id: 'element-type',
      kind: 'typeOf',
      sourceNodeId: 'element',
      targetNodeId: 'type',
    },
    {
      id: 'type-element',
      kind: 'extends',
      sourceNodeId: 'type',
      targetNodeId: 'element',
    },
  ],
  rootNodeIds: ['element'],
};

function at(
  firstNodeId: string,
  ...remainingNodeIds: string[]
): NavigationState {
  return {
    projectId: project.id,
    navigationPath: [firstNodeId, ...remainingNodeIds],
  };
}

function relationship(sourceNodeId: string, edgeId: string) {
  const found = getOutgoingStructuralRelationships(project, sourceNodeId).find(
    ({ edge }) => edge.id === edgeId,
  );
  if (!found) throw new Error(`Missing ${edgeId}.`);
  return found;
}

describe('schema relationship presentation', () => {
  it('preserves ordinary structural labels', () => {
    expect(formatOutgoingRelationshipLabel('contains')).toBe('Child');
    expect(formatOutgoingRelationshipLabel('typeOf')).toBe('Type');
    expect(formatOutgoingRelationshipLabel('references')).toBe(
      'Referenced element',
    );
    expect(
      formatOutgoingRelationshipLabel('contains', 'simpleType', 'restriction'),
    ).toBe('Restriction');
    expect(formatOutgoingRelationshipLabel('restricts')).toBe('Base type');
    expect(
      buildJourneyRelationshipPresentation(
        project,
        at('element'),
        relationship('element', 'element-type'),
      ),
    ).toEqual({
      disposition: 'advance',
      isCurrentFocusClosure: false,
      relationshipLabel: 'Type',
      edgeId: 'element-type',
    });
  });

  it('formats recursive child, type, reference, and generic closure labels', () => {
    expect(formatTerminalCycleRelationshipLabel('contains')).toBe(
      'Recursive child',
    );
    expect(formatTerminalCycleRelationshipLabel('typeOf')).toBe(
      'Recursive type',
    );
    expect(formatTerminalCycleRelationshipLabel('references')).toBe(
      'Recursive reference',
    );
    expect(formatTerminalCycleRelationshipLabel('restricts')).toBe(
      'Recursive base type',
    );
    expect(formatTerminalCycleRelationshipLabel('extends')).toBe(
      'Recursive base type',
    );
  });

  it('presents earlier and current-focus closures as terminal information', () => {
    expect(
      buildJourneyRelationshipPresentation(
        project,
        at('element', 'child'),
        relationship('child', 'child-element'),
      ),
    ).toEqual({
      disposition: 'terminalCycleClosure',
      targetJourneyPosition: 0,
      isCurrentFocusClosure: false,
      relationshipLabel: 'Recursive reference',
      terminalLabel: 'Already present earlier in this path',
      edgeId: 'child-element',
    });
    expect(
      buildJourneyRelationshipPresentation(
        project,
        at('element', 'child'),
        relationship('child', 'child-child'),
      ),
    ).toEqual({
      disposition: 'terminalCycleClosure',
      targetJourneyPosition: 1,
      isCurrentFocusClosure: true,
      relationshipLabel: 'Recursive child',
      terminalLabel: 'Already the current element',
      edgeId: 'child-child',
    });
  });

  it('keeps repeated same-target edges distinct and does not mutate inputs', () => {
    const state = at('element');
    const first = relationship('element', 'element-child:first');
    const second = relationship('element', 'element-child:second');
    const before = JSON.stringify({ project, state, first, second });

    expect(
      buildJourneyRelationshipPresentation(project, state, first)?.edgeId,
    ).toBe('element-child:first');
    expect(
      buildJourneyRelationshipPresentation(project, state, second)?.edgeId,
    ).toBe('element-child:second');
    expect(JSON.stringify({ project, state, first, second })).toBe(before);
  });

  it('recomputes disposition after path changes and rejects invalid context', () => {
    const closure = relationship('child', 'child-element');
    expect(
      buildJourneyRelationshipPresentation(
        project,
        at('element', 'child'),
        closure,
      )?.disposition,
    ).toBe('terminalCycleClosure');
    expect(
      buildJourneyRelationshipPresentation(project, at('element'), closure),
    ).toBeUndefined();
    expect(
      buildJourneyRelationshipPresentation(
        project,
        { projectId: 'other', navigationPath: ['child'] },
        closure,
      ),
    ).toBeUndefined();
  });
});
