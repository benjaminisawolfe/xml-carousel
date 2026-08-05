import { describe, expect, it } from 'vitest';
import {
  getOutgoingStructuralRelationships,
  type SchemaProject,
} from '../../schema/model';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../../schema/samples/bookDtdProject';
import {
  decideNodeCenteringRoute,
  classifyStructuralRelationshipForJourney,
  findPreferredStructuralJourney,
  isValidStructuralJourney,
  type NodeCenterRequest,
} from './navigationCentering';
import { centerNavigation } from './navigationStore';
import type { NavigationState } from './navigationTypes';

const project: SchemaProject = {
  id: 'centering-fixture',
  displayName: 'Centering fixture',
  nodes: [
    { id: 'a', kind: 'dtdElement', name: 'a' },
    { id: 'b', kind: 'dtdElement', name: 'b' },
    { id: 'c', kind: 'dtdElement', name: 'c' },
    { id: 'outside', kind: 'dtdElement', name: 'outside' },
  ],
  edges: [
    {
      id: 'a-b',
      kind: 'contains',
      sourceNodeId: 'a',
      targetNodeId: 'b',
    },
    {
      id: 'b-a',
      kind: 'contains',
      sourceNodeId: 'b',
      targetNodeId: 'a',
    },
    {
      id: 'a-c',
      kind: 'contains',
      sourceNodeId: 'a',
      targetNodeId: 'c',
    },
    {
      id: 'b-c',
      kind: 'contains',
      sourceNodeId: 'b',
      targetNodeId: 'c',
    },
    {
      id: 'b-b',
      kind: 'contains',
      sourceNodeId: 'b',
      targetNodeId: 'b',
    },
    {
      id: 'outside-c',
      kind: 'contains',
      sourceNodeId: 'outside',
      targetNodeId: 'c',
    },
  ],
  rootNodeIds: ['a'],
};

const deterministicProject: SchemaProject = {
  id: 'deterministic-path-fixture',
  displayName: 'Deterministic path fixture',
  nodes: [
    { id: 'root:first', kind: 'dtdElement', name: 'root:first' },
    { id: 'root:second', kind: 'dtdElement', name: 'root:second' },
    { id: 'step:first', kind: 'dtdElement', name: 'step:first' },
    { id: 'step:second', kind: 'dtdElement', name: 'step:second' },
    { id: 'branch:a', kind: 'dtdElement', name: 'branch:a' },
    { id: 'branch:z', kind: 'dtdElement', name: 'branch:z' },
    { id: 'target:short', kind: 'dtdElement', name: 'target:short' },
    { id: 'target:tie', kind: 'dtdElement', name: 'target:tie' },
    { id: 'target:stable', kind: 'dtdElement', name: 'target:stable' },
  ],
  edges: [
    {
      id: 'first-step',
      kind: 'contains',
      sourceNodeId: 'root:first',
      targetNodeId: 'step:first',
      order: 0,
    },
    {
      id: 'first-branch-z',
      kind: 'contains',
      sourceNodeId: 'root:first',
      targetNodeId: 'branch:z',
      order: 1,
    },
    {
      id: 'first-branch-a',
      kind: 'contains',
      sourceNodeId: 'root:first',
      targetNodeId: 'branch:a',
      order: 1,
    },
    {
      id: 'second-step',
      kind: 'contains',
      sourceNodeId: 'root:second',
      targetNodeId: 'step:second',
      order: 0,
    },
    {
      id: 'second-short',
      kind: 'contains',
      sourceNodeId: 'root:second',
      targetNodeId: 'target:short',
      order: 1,
    },
    {
      id: 'first-step-short',
      kind: 'contains',
      sourceNodeId: 'step:first',
      targetNodeId: 'target:short',
      order: 0,
    },
    {
      id: 'first-step-tie',
      kind: 'contains',
      sourceNodeId: 'step:first',
      targetNodeId: 'target:tie',
      order: 1,
    },
    {
      id: 'second-step-tie',
      kind: 'contains',
      sourceNodeId: 'step:second',
      targetNodeId: 'target:tie',
      order: 0,
    },
    {
      id: 'branch-a-stable',
      kind: 'contains',
      sourceNodeId: 'branch:a',
      targetNodeId: 'target:stable',
      order: 0,
    },
    {
      id: 'branch-z-stable',
      kind: 'contains',
      sourceNodeId: 'branch:z',
      targetNodeId: 'target:stable',
      order: 0,
    },
  ],
  rootNodeIds: ['root:first', 'root:second'],
};

function outgoingRequest(
  targetNodeId: string,
  sourceNodeId: string,
  edgeId: string,
): NodeCenterRequest {
  return {
    targetNodeId,
    relationshipContext: {
      kind: 'outgoing-structural',
      sourceNodeId,
      edgeId,
    },
  };
}

function incomingRequest(
  sourceNodeId: string,
  inspectedNodeId: string,
  edgeId: string,
): NodeCenterRequest {
  return {
    targetNodeId: sourceNodeId,
    relationshipContext: {
      kind: 'incoming-structural',
      inspectedNodeId,
      sourceNodeId,
      edgeId,
    },
  };
}

function relationship(sourceNodeId: string, edgeId: string) {
  const found = getOutgoingStructuralRelationships(project, sourceNodeId).find(
    ({ edge }) => edge.id === edgeId,
  );
  if (!found) throw new Error(`Missing fixture relationship ${edgeId}.`);
  return found;
}

describe('structural journey disposition', () => {
  it('classifies advances and terminal self/non-self closures', () => {
    expect(
      classifyStructuralRelationshipForJourney(
        project,
        { projectId: project.id, navigationPath: ['a'] },
        relationship('a', 'a-b'),
      ),
    ).toEqual({ kind: 'advance' });
    expect(
      classifyStructuralRelationshipForJourney(
        project,
        { projectId: project.id, navigationPath: ['a', 'b'] },
        relationship('b', 'b-a'),
      ),
    ).toEqual({
      kind: 'terminalCycleClosure',
      targetJourneyPosition: 0,
      isCurrentFocus: false,
    });
    expect(
      classifyStructuralRelationshipForJourney(
        project,
        { projectId: project.id, navigationPath: ['a', 'b'] },
        relationship('b', 'b-b'),
      ),
    ).toEqual({
      kind: 'terminalCycleClosure',
      targetJourneyPosition: 1,
      isCurrentFocus: true,
    });
  });

  it('uses the latest target defensively without mutating legacy state', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['a', 'b', 'a', 'b'],
    };
    const before = JSON.stringify(state);

    expect(
      classifyStructuralRelationshipForJourney(
        project,
        state,
        relationship('b', 'b-a'),
      ),
    ).toEqual({
      kind: 'terminalCycleClosure',
      targetJourneyPosition: 2,
      isCurrentFocus: false,
    });
    expect(JSON.stringify(state)).toBe(before);
  });

  it('rejects project mismatches, stale edges, and non-current sources', () => {
    expect(
      classifyStructuralRelationshipForJourney(
        project,
        { projectId: 'other', navigationPath: ['a'] },
        relationship('a', 'a-b'),
      ),
    ).toBeUndefined();
    expect(
      classifyStructuralRelationshipForJourney(
        project,
        { projectId: project.id, navigationPath: ['a', 'b'] },
        relationship('a', 'a-b'),
      ),
    ).toBeUndefined();
    expect(
      classifyStructuralRelationshipForJourney(
        project,
        { projectId: project.id, navigationPath: ['a'] },
        {
          edge: { ...relationship('a', 'a-b').edge, id: 'stale' },
          node: relationship('a', 'a-b').node,
        },
      ),
    ).toBeUndefined();
  });
});

describe('preferred structural journey reconstruction', () => {
  it.each([
    [
      'title.page',
      bookDtdNodeIds.titlePage,
      'dtd:contains:title.page:title',
      [
        bookDtdNodeIds.book,
        bookDtdNodeIds.frontMatter,
        bookDtdNodeIds.titlePage,
        bookDtdNodeIds.title,
      ],
    ],
    [
      'chapter',
      bookDtdNodeIds.chapter,
      'dtd:contains:chapter:title',
      [
        bookDtdNodeIds.book,
        bookDtdNodeIds.bookContent,
        bookDtdNodeIds.chapter,
        bookDtdNodeIds.title,
      ],
    ],
    [
      'section',
      bookDtdNodeIds.section,
      'dtd:contains:section:title',
      [
        bookDtdNodeIds.book,
        bookDtdNodeIds.bookContent,
        bookDtdNodeIds.chapter,
        bookDtdNodeIds.section,
        bookDtdNodeIds.title,
      ],
    ],
  ])(
    'preserves the displayed %s → title relationship',
    (_sourceName, sourceNodeId, edgeId, expectedJourney) => {
      expect(
        findPreferredStructuralJourney(
          bookDtdProject,
          [bookDtdNodeIds.book],
          bookDtdNodeIds.title,
          {
            kind: 'outgoing-structural',
            sourceNodeId,
            edgeId,
          },
        ),
      ).toEqual(expectedJourney);
    },
  );

  it('reconstructs every title Used by source from a one-node journey', () => {
    expect(
      [
        [bookDtdNodeIds.titlePage, 'dtd:contains:title.page:title'] as const,
        [bookDtdNodeIds.chapter, 'dtd:contains:chapter:title'] as const,
        [bookDtdNodeIds.section, 'dtd:contains:section:title'] as const,
      ].map(([sourceNodeId, edgeId]) =>
        findPreferredStructuralJourney(
          bookDtdProject,
          [bookDtdNodeIds.title],
          sourceNodeId,
          {
            kind: 'incoming-structural',
            inspectedNodeId: bookDtdNodeIds.title,
            sourceNodeId,
            edgeId,
          },
        ),
      ),
    ).toEqual([
      [
        bookDtdNodeIds.book,
        bookDtdNodeIds.frontMatter,
        bookDtdNodeIds.titlePage,
      ],
      [bookDtdNodeIds.book, bookDtdNodeIds.bookContent, bookDtdNodeIds.chapter],
      [
        bookDtdNodeIds.book,
        bookDtdNodeIds.bookContent,
        bookDtdNodeIds.chapter,
        bookDtdNodeIds.section,
      ],
    ]);
  });

  it('prefers the deepest compatible prefix of the current journey', () => {
    expect(
      findPreferredStructuralJourney(
        bookDtdProject,
        [
          bookDtdNodeIds.book,
          bookDtdNodeIds.bookContent,
          bookDtdNodeIds.chapter,
        ],
        bookDtdNodeIds.para,
      ),
    ).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.bookContent,
      bookDtdNodeIds.chapter,
      bookDtdNodeIds.section,
      bookDtdNodeIds.para,
    ]);
  });

  it('chooses shortest paths before root order', () => {
    expect(
      findPreferredStructuralJourney(
        deterministicProject,
        ['unrelated'],
        'target:short',
      ),
    ).toEqual(['root:second', 'target:short']);
  });

  it('uses root order and then stable edge IDs to break ties', () => {
    expect(
      findPreferredStructuralJourney(
        deterministicProject,
        ['unrelated'],
        'target:tie',
      ),
    ).toEqual(['root:first', 'step:first', 'target:tie']);
    expect(
      findPreferredStructuralJourney(
        deterministicProject,
        ['unrelated'],
        'target:stable',
      ),
    ).toEqual(['root:first', 'branch:a', 'target:stable']);
  });

  it('rejects a repeated legacy prefix while reconstructing a unique route', () => {
    expect(
      findPreferredStructuralJourney(project, ['a', 'b', 'a'], 'a'),
    ).toBeUndefined();
    expect(
      findPreferredStructuralJourney(project, ['a', 'b', 'a'], 'c'),
    ).toEqual(['a', 'b', 'c']);
  });

  it('returns undefined for invalid relationships and unreachable nodes', () => {
    expect(
      findPreferredStructuralJourney(
        project,
        ['a'],
        'b',
        outgoingRequest('b', 'a', 'a-c').relationshipContext,
      ),
    ).toBeUndefined();
    expect(
      findPreferredStructuralJourney(project, ['a'], 'outside'),
    ).toBeUndefined();
  });

  it('validates every adjacent edge and rejects repeated IDs', () => {
    expect(isValidStructuralJourney(project, ['a', 'b', 'c'])).toBe(true);
    expect(isValidStructuralJourney(project, ['a', 'b', 'a'])).toBe(false);
    expect(isValidStructuralJourney(project, ['a', 'outside'])).toBe(false);
    expect(isValidStructuralJourney(project, [])).toBe(false);
  });

  it('is deterministic and does not mutate project or journey inputs', () => {
    const journey = ['a', 'b'];
    const before = JSON.stringify({ project, journey });
    const first = findPreferredStructuralJourney(project, journey, 'c');
    const second = findPreferredStructuralJourney(project, journey, 'c');

    expect(second).toEqual(first);
    expect(JSON.stringify({ project, journey })).toBe(before);
  });
});

describe('search-origin node centering', () => {
  it('rejects project mismatch, invalid current journeys, and unknown targets in order', () => {
    expect(
      decideNodeCenteringRoute(
        project,
        { projectId: 'other', navigationPath: ['a'] },
        { targetNodeId: 'missing', origin: 'search' },
      ),
    ).toEqual({ kind: 'rejected', reason: 'projectMismatch' });
    expect(
      decideNodeCenteringRoute(
        project,
        { projectId: project.id, navigationPath: ['a', 'outside'] },
        { targetNodeId: 'missing', origin: 'search' },
      ),
    ).toEqual({
      kind: 'rejected',
      reason: 'invalidStructuralJourney',
    });
    expect(
      decideNodeCenteringRoute(
        project,
        { projectId: project.id, navigationPath: ['a'] },
        { targetNodeId: 'missing', origin: 'search' },
      ),
    ).toEqual({ kind: 'rejected', reason: 'unknownNode' });
  });

  it('handles already-focused, earlier-path, and immediate-leafward targets explicitly', () => {
    expect(
      decideNodeCenteringRoute(
        project,
        { projectId: project.id, navigationPath: ['a', 'b'] },
        { targetNodeId: 'b', origin: 'search' },
      ),
    ).toEqual({ kind: 'alreadyFocused' });
    expect(
      decideNodeCenteringRoute(
        project,
        { projectId: project.id, navigationPath: ['a', 'b', 'c'] },
        { targetNodeId: 'b', origin: 'search' },
      ),
    ).toEqual({ kind: 'rootward', journeyPosition: 1 });
    expect(
      decideNodeCenteringRoute(
        project,
        { projectId: project.id, navigationPath: ['a', 'b'] },
        { targetNodeId: 'c', origin: 'search' },
      ),
    ).toEqual({ kind: 'leafward' });
  });

  it('preserves the longest valid current prefix before replacing its suffix', () => {
    const state: NavigationState = {
      projectId: deterministicProject.id,
      navigationPath: ['root:first', 'step:first'],
    };

    expect(
      decideNodeCenteringRoute(deterministicProject, state, {
        targetNodeId: 'target:stable',
        origin: 'search',
      }),
    ).toEqual({
      kind: 'reconstructed',
      journey: ['root:first', 'branch:a', 'target:stable'],
    });
    expect(
      centerNavigation(deterministicProject, state, {
        targetNodeId: 'target:stable',
        origin: 'search',
      }).state.navigationPath,
    ).toEqual(['root:first', 'branch:a', 'target:stable']);
  });

  it('reconstructs from roots by shortest path, root order, and stable edge order', () => {
    const state: NavigationState = {
      projectId: deterministicProject.id,
      navigationPath: ['root:second', 'step:second'],
    };

    expect(
      decideNodeCenteringRoute(deterministicProject, state, {
        targetNodeId: 'target:short',
        origin: 'search',
      }),
    ).toEqual({
      kind: 'reconstructed',
      journey: ['root:second', 'target:short'],
    });
    expect(
      decideNodeCenteringRoute(deterministicProject, state, {
        targetNodeId: 'target:stable',
        origin: 'search',
      }),
    ).toEqual({
      kind: 'reconstructed',
      journey: ['root:first', 'branch:a', 'target:stable'],
    });
  });

  it('uses a singleton teleport only for structurally unreachable targets', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['a', 'b'],
    };

    expect(
      decideNodeCenteringRoute(project, state, {
        targetNodeId: 'outside',
        origin: 'search',
      }),
    ).toEqual({ kind: 'teleport' });
    expect(
      centerNavigation(project, state, {
        targetNodeId: 'outside',
        origin: 'search',
      }).state.navigationPath,
    ).toEqual(['outside']);
  });

  it('never duplicates nodes or traverses a terminal cycle closure', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['a', 'b'],
    };
    const rootward = centerNavigation(project, state, {
      targetNodeId: 'a',
      origin: 'search',
    });
    const reconstructed = centerNavigation(project, state, {
      targetNodeId: 'c',
      origin: 'search',
    });

    expect(rootward.state.navigationPath).toEqual(['a']);
    expect(reconstructed.state.navigationPath).toEqual(['a', 'b', 'c']);
    expect(new Set(reconstructed.state.navigationPath).size).toBe(
      reconstructed.state.navigationPath.length,
    );
  });
});

describe('shared generic node-centering route', () => {
  it('rejects the current focus as a no-op', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['a', 'b'],
    };
    const request = { targetNodeId: 'b' };
    expect(decideNodeCenteringRoute(project, state, request)).toEqual({
      kind: 'alreadyFocused',
    });
    expect(centerNavigation(project, state, request)).toEqual({
      applied: false,
      reason: 'alreadyFocused',
      state,
    });
  });

  it('appends an immediate leafward destination normally', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['a', 'b'],
    };
    expect(centerNavigation(project, state, { targetNodeId: 'c' })).toEqual({
      applied: true,
      state: {
        projectId: project.id,
        navigationPath: ['a', 'b', 'c'],
      },
    });
  });

  it('truncates to an earlier occurrence when no position is given', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['a', 'b', 'c'],
    };
    expect(centerNavigation(project, state, { targetNodeId: 'b' })).toEqual({
      applied: true,
      state: {
        projectId: project.id,
        navigationPath: ['a', 'b'],
      },
    });
  });

  it('uses an explicit journey position for repeated node IDs', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['a', 'b'],
    };
    expect(
      centerNavigation(project, state, {
        targetNodeId: 'a',
        targetJourneyPosition: 0,
      }),
    ).toEqual({
      applied: true,
      state: {
        projectId: project.id,
        navigationPath: ['a'],
      },
    });
  });

  it('teleports unrelated targets without inventing ancestors', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['a', 'b'],
    };
    expect(
      centerNavigation(project, state, { targetNodeId: 'outside' }),
    ).toEqual({
      applied: true,
      state: {
        projectId: project.id,
        navigationPath: ['outside'],
      },
    });
  });

  it('rejects invalid occurrence positions deterministically', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['a', 'b'],
    };
    const request = { targetNodeId: 'a', targetJourneyPosition: 1 };
    const first = decideNodeCenteringRoute(project, state, request);
    const second = decideNodeCenteringRoute(project, state, request);

    expect(first).toEqual({
      kind: 'rejected',
      reason: 'notInRootwardPath',
    });
    expect(second).toEqual(first);
  });
});

describe('outgoing relationship-aware centering', () => {
  it('keeps a validated terminal relationship unchanged', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['a', 'b'],
    };
    expect(
      decideNodeCenteringRoute(
        project,
        state,
        outgoingRequest('a', 'b', 'b-a'),
      ),
    ).toEqual({
      kind: 'relationshipTerminalCycleClosure',
      targetJourneyPosition: 0,
      isCurrentFocus: false,
      sourceNodeId: 'b',
      targetNodeId: 'a',
      edgeId: 'b-a',
    });
    expect(
      centerNavigation(project, state, outgoingRequest('a', 'b', 'b-a')),
    ).toEqual({
      applied: false,
      reason: 'terminalCycleClosure',
      state,
    });
  });

  it('appends through the relationship when its source is current focus', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['a', 'b'],
    };
    const request = outgoingRequest('c', 'b', 'b-c');
    expect(decideNodeCenteringRoute(project, state, request)).toEqual({
      kind: 'relationshipLeafward',
      sourceJourneyPosition: 1,
      sourceNodeId: 'b',
      targetNodeId: 'c',
      edgeId: 'b-c',
    });
    expect(centerNavigation(project, state, request)).toEqual({
      applied: true,
      state: {
        projectId: project.id,
        navigationPath: ['a', 'b', 'c'],
      },
    });
  });

  it('truncates to an earlier source and appends its destination', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['a', 'b'],
    };
    expect(
      centerNavigation(project, state, outgoingRequest('c', 'a', 'a-c')),
    ).toEqual({
      applied: true,
      state: {
        projectId: project.id,
        navigationPath: ['a', 'c'],
      },
    });
  });

  it('begins a two-node journey when the validated source is absent', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['a', 'b'],
    };
    expect(
      centerNavigation(
        project,
        state,
        outgoingRequest('c', 'outside', 'outside-c'),
      ),
    ).toEqual({
      applied: true,
      state: {
        projectId: project.id,
        navigationPath: ['outside', 'c'],
      },
    });
  });

  it('rejects a manually supplied repeated source journey', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['a', 'b', 'a', 'b', 'outside'],
    };

    expect(
      centerNavigation(project, state, outgoingRequest('c', 'b', 'b-c')),
    ).toEqual({
      applied: false,
      reason: 'invalidStructuralJourney',
      state,
    });
  });

  it('can still centre through a relationship whose source is not current', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['a', 'b', 'c'],
    };

    expect(
      centerNavigation(project, state, outgoingRequest('b', 'a', 'a-b')),
    ).toEqual({
      applied: true,
      state: {
        projectId: project.id,
        navigationPath: ['a', 'b'],
      },
    });
  });

  it('rejects an invalid displayed edge instead of fabricating a path', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['outside'],
    };

    expect(
      centerNavigation(project, state, outgoingRequest('b', 'a', 'a-c')),
    ).toEqual({
      applied: false,
      reason: 'invalidRelationship',
      state,
    });
  });

  it('validates relationship direction before preserving a path', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['outside'],
    };

    expect(
      centerNavigation(project, state, outgoingRequest('a', 'c', 'a-c')),
    ).toEqual({
      applied: false,
      reason: 'invalidRelationship',
      state,
    });
  });

  it('does not mutate its request, state, or project inputs', () => {
    const request = outgoingRequest('c', 'b', 'b-c');
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['a', 'b'],
    };
    const before = JSON.stringify({ project, state, request });

    decideNodeCenteringRoute(project, state, request);

    expect(JSON.stringify({ project, state, request })).toBe(before);
  });
});

describe('incoming Used-by relationship centering', () => {
  it('keeps an already-focused source as a no-op', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['a'],
    };
    expect(
      centerNavigation(project, state, incomingRequest('a', 'c', 'a-c')),
    ).toEqual({
      applied: false,
      reason: 'alreadyFocused',
      state,
    });
  });

  it('truncates to a source already in the journey', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['a', 'b', 'c'],
    };

    expect(
      centerNavigation(project, state, incomingRequest('a', 'c', 'a-c')),
    ).toEqual({
      applied: true,
      state: {
        projectId: project.id,
        navigationPath: ['a'],
      },
    });
  });

  it('teleports to the source alone when it is absent', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['outside'],
    };

    expect(
      centerNavigation(project, state, incomingRequest('a', 'c', 'a-c')),
    ).toEqual({
      applied: true,
      state: {
        projectId: project.id,
        navigationPath: ['a'],
      },
    });
  });

  it('reconstructs the source without inventing a reversed path', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['outside'],
    };
    const route = decideNodeCenteringRoute(
      project,
      state,
      incomingRequest('a', 'c', 'a-c'),
    );

    expect(route).toEqual({ kind: 'reconstructed', journey: ['a'] });
    expect(route).not.toHaveProperty('inspectedNodeId');
  });

  it('rejects invalid incoming relationship context', () => {
    const state: NavigationState = {
      projectId: project.id,
      navigationPath: ['outside'],
    };

    expect(
      centerNavigation(project, state, incomingRequest('a', 'c', 'b-c')),
    ).toEqual({
      applied: false,
      reason: 'invalidRelationship',
      state,
    });
  });
});
