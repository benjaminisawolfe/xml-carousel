import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import type { SchemaProject } from '../../schema/model';
import {
  bookDtdNodeIds,
  bookDtdProject,
} from '../../schema/samples/bookDtdProject';
import {
  selectCanNavigateRootward,
  selectCurrentFocusNode,
  selectCurrentFocusNodeId,
  selectImmediateRootwardNode,
  selectLeafwardDestinationNodes,
  selectLeafwardEdges,
  selectNavigationPathIds,
  selectNavigationPathNodes,
  selectRootwardPathNodes,
} from './navigationSelectors';
import {
  createNavigationStore,
  focusRootwardPathNode,
  initializeNavigation,
  navigateLeafward,
  navigateRootward,
  navigateStructuralRelationship,
  teleportNavigation,
} from './navigationStore';
import type { NavigationState } from './navigationTypes';

function initializeAtBook(): NavigationState {
  const result = initializeNavigation(bookDtdProject, bookDtdNodeIds.book);
  expect(result.applied).toBe(true);
  if (!result.applied) {
    throw new Error('Expected the sample book node to initialize navigation.');
  }
  return result.state;
}

function expectApplied(
  result: ReturnType<typeof navigateLeafward>,
): NavigationState {
  expect(result.applied).toBe(true);
  if (!result.applied) {
    throw new Error(`Expected navigation to apply, received ${result.reason}.`);
  }
  return result.state;
}

const xsdNavigationProject: SchemaProject = {
  id: 'xsd-navigation',
  displayName: 'XSD navigation',
  nodes: [
    { id: 'schema', kind: 'schema', name: 'urn:test' },
    { id: 'element', kind: 'globalElement', name: 'item' },
    { id: 'type', kind: 'complexType', name: 'ItemType' },
    { id: 'sequence', kind: 'sequence', name: 'ItemType sequence' },
    { id: 'local', kind: 'localElement', name: 'item ref' },
    { id: 'attribute', kind: 'attribute', name: 'code' },
  ],
  edges: [
    {
      id: 'schema-element',
      kind: 'contains',
      sourceNodeId: 'schema',
      targetNodeId: 'element',
      order: 0,
    },
    {
      id: 'schema-type',
      kind: 'contains',
      sourceNodeId: 'schema',
      targetNodeId: 'type',
      order: 1,
    },
    {
      id: 'element-type',
      kind: 'typeOf',
      sourceNodeId: 'element',
      targetNodeId: 'type',
    },
    {
      id: 'type-sequence',
      kind: 'contains',
      sourceNodeId: 'type',
      targetNodeId: 'sequence',
    },
    {
      id: 'sequence-local',
      kind: 'contains',
      sourceNodeId: 'sequence',
      targetNodeId: 'local',
      occurrence: { min: 0, max: 'unbounded' },
    },
    {
      id: 'local-reference',
      kind: 'references',
      sourceNodeId: 'local',
      targetNodeId: 'element',
    },
    {
      id: 'local-reference-repeat',
      kind: 'references',
      sourceNodeId: 'local',
      targetNodeId: 'element',
    },
    {
      id: 'local-attribute',
      kind: 'usesAttribute',
      sourceNodeId: 'local',
      targetNodeId: 'attribute',
    },
  ],
  rootNodeIds: ['schema'],
};

describe('navigation initialization', () => {
  it('initializes at book with focus derived from the one-node path', () => {
    const state = initializeAtBook();

    expect(state).toEqual({
      projectId: bookDtdProject.id,
      navigationPath: [bookDtdNodeIds.book],
    });
    expect(selectCurrentFocusNodeId(state)).toBe(bookDtdNodeIds.book);
    expect(selectCurrentFocusNode(bookDtdProject, state)?.name).toBe('book');
    expect(typeof state.navigationPath[0]).toBe('string');
  });

  it('rejects an unknown initial node without constructing state', () => {
    expect(initializeNavigation(bookDtdProject, 'missing')).toEqual({
      applied: false,
      reason: 'unknownNode',
    });
  });
});

describe('leafward navigation', () => {
  it.each([
    ['front.matter', bookDtdNodeIds.frontMatter],
    ['book.content', bookDtdNodeIds.bookContent],
  ])('appends the immediate %s destination', (_name, nodeId) => {
    const initial = initializeAtBook();
    const next = expectApplied(
      navigateLeafward(bookDtdProject, initial, nodeId),
    );

    expect(next.navigationPath).toEqual([bookDtdNodeIds.book, nodeId]);
    expect(selectCurrentFocusNodeId(next)).toBe(nodeId);
  });

  it('navigates from book.content to chapter', () => {
    const atContent = expectApplied(
      navigateLeafward(
        bookDtdProject,
        initializeAtBook(),
        bookDtdNodeIds.bookContent,
      ),
    );
    const atChapter = expectApplied(
      navigateLeafward(bookDtdProject, atContent, bookDtdNodeIds.chapter),
    );

    expect(atChapter.navigationPath).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.bookContent,
      bookDtdNodeIds.chapter,
    ]);
  });

  it('preserves normalized branch order in leafward selectors', () => {
    expect(
      selectLeafwardDestinationNodes(bookDtdProject, initializeAtBook()).map(
        (node) => node.name,
      ),
    ).toEqual(['front.matter', 'book.content', 'index']);
  });

  it.each([
    ['non-adjacent', bookDtdNodeIds.section, 'notLeafwardDestination'],
    ['unknown', 'missing', 'unknownNode'],
  ])('rejects a %s target without changing state', (_case, nodeId, reason) => {
    const initial = initializeAtBook();
    const result = navigateLeafward(bookDtdProject, initial, nodeId);

    expect(result).toEqual({ applied: false, reason, state: initial });
    expect(result.state).toBe(initial);
  });

  it('does not treat an unsupported outgoing relationship as leafward', () => {
    const project: SchemaProject = {
      id: 'unsupported-edge',
      displayName: 'Unsupported edge',
      nodes: [
        { id: 'a', kind: 'dtdElement', name: 'a' },
        { id: 'b', kind: 'dtdElement', name: 'b' },
      ],
      edges: [
        {
          id: 'a-uses-attribute-b',
          kind: 'usesAttribute',
          sourceNodeId: 'a',
          targetNodeId: 'b',
        },
      ],
      rootNodeIds: ['a'],
    };
    const initialized = initializeNavigation(project, 'a');
    if (!initialized.applied) {
      throw new Error('Expected the local project to initialize.');
    }

    expect(navigateLeafward(project, initialized.state, 'b')).toEqual({
      applied: false,
      reason: 'notLeafwardDestination',
      state: initialized.state,
    });
  });
});

describe('XSD structural leafward navigation', () => {
  const at = (navigationPath: NavigationState['navigationPath']) => ({
    projectId: xsdNavigationProject.id,
    navigationPath,
  });

  it('selects and follows typeOf as a structural destination', () => {
    const state = at(['schema', 'element']);

    expect(
      selectLeafwardEdges(xsdNavigationProject, state).map(({ kind }) => kind),
    ).toEqual(['typeOf']);
    expect(
      selectLeafwardDestinationNodes(xsdNavigationProject, state).map(
        ({ name }) => name,
      ),
    ).toEqual(['ItemType']);
    expect(
      navigateLeafward(xsdNavigationProject, state, 'type', 'element-type'),
    ).toEqual({
      applied: true,
      state: at(['schema', 'element', 'type']),
    });
  });

  it('follows an exact references edge and returns rootward to the local particle', () => {
    const localJourney = at(['schema', 'type', 'sequence', 'local']);
    const followed = navigateLeafward(
      xsdNavigationProject,
      localJourney,
      'element',
      'local-reference-repeat',
    );

    expect(followed).toEqual({
      applied: true,
      state: at(['schema', 'type', 'sequence', 'local', 'element']),
    });
    if (!followed.applied) throw new Error('Expected reference navigation.');
    expect(navigateRootward(followed.state)).toEqual({
      applied: true,
      state: localJourney,
    });
  });

  it('retains repeated relationships and rejects wrong or nonstructural edge IDs', () => {
    const state = at(['schema', 'type', 'sequence', 'local']);

    expect(
      selectLeafwardEdges(xsdNavigationProject, state).map(({ id }) => id),
    ).toEqual(['local-reference', 'local-reference-repeat']);
    expect(
      navigateLeafward(
        xsdNavigationProject,
        state,
        'element',
        'local-attribute',
      ),
    ).toEqual({
      applied: false,
      reason: 'notLeafwardDestination',
      state,
    });
    expect(
      navigateLeafward(xsdNavigationProject, state, 'element', 'missing-edge'),
    ).toEqual({
      applied: false,
      reason: 'notLeafwardDestination',
      state,
    });
    expect(navigateLeafward(xsdNavigationProject, state, 'element')).toEqual({
      applied: false,
      reason: 'ambiguousRelationship',
      state,
    });
  });

  it('treats a repeated-node cycle as a terminal relationship', () => {
    const localJourney = at(['schema', 'element', 'type', 'sequence', 'local']);
    const followed = navigateStructuralRelationship(
      xsdNavigationProject,
      localJourney,
      {
        edgeId: 'local-reference',
        sourceNodeId: 'local',
        targetNodeId: 'element',
      },
    );

    expect(followed).toEqual({
      applied: false,
      reason: 'terminalCycleClosure',
      state: localJourney,
    });

    expect(
      navigateStructuralRelationship(
        xsdNavigationProject,
        at(['element', 'type', 'sequence', 'local']),
        {
          edgeId: 'local-reference',
          sourceNodeId: 'local',
          targetNodeId: 'element',
        },
      ),
    ).toEqual({
      applied: false,
      reason: 'terminalCycleClosure',
      state: at(['element', 'type', 'sequence', 'local']),
    });
  });

  it('reconstructs schema-to-declaration paths for Navigation-origin centring', () => {
    const store = createNavigationStore(
      xsdNavigationProject,
      at(['schema', 'type', 'sequence', 'local']),
    );

    expect(
      store.centerNode({ targetNodeId: 'element', origin: 'navigation' }),
    ).toMatchObject({ applied: true });
    expect(get(store).navigationPath).toEqual(['schema', 'element']);
  });

  it('rebuilds a direct global path even when the declaration appears earlier in a deeper journey', () => {
    const store = createNavigationStore(
      xsdNavigationProject,
      at(['schema', 'element', 'type', 'sequence', 'local']),
    );

    expect(
      store.centerNode({ targetNodeId: 'type', origin: 'navigation' }),
    ).toMatchObject({ applied: true });
    expect(get(store).navigationPath).toEqual(['schema', 'type']);
  });

  it('starts explicit XSD Navigation entries as one-node journeys', () => {
    const store = createNavigationStore(
      xsdNavigationProject,
      at(['schema', 'type', 'sequence', 'local']),
    );

    expect(
      store.centerNode({
        targetNodeId: 'element',
        origin: 'navigation',
        beginNewJourney: true,
      }),
    ).toMatchObject({ applied: true });
    expect(get(store).navigationPath).toEqual(['element']);

    expect(
      store.centerNode({
        targetNodeId: 'schema',
        origin: 'navigation',
        beginNewJourney: true,
      }),
    ).toMatchObject({ applied: true });
    expect(get(store).navigationPath).toEqual(['schema']);
  });

  it('preserves accepted rootward behaviour for an existing Navigation entry', () => {
    const store = createNavigationStore(
      xsdNavigationProject,
      at(['schema', 'element', 'type']),
    );

    expect(
      store.centerNode({
        targetNodeId: 'element',
        origin: 'navigation',
        beginNewJourney: true,
      }),
    ).toMatchObject({ applied: true });
    expect(get(store).navigationPath).toEqual(['schema', 'element']);
  });

  it('keeps project-mismatch selectors and transitions empty or rejected', () => {
    const mismatched = {
      projectId: 'other-project',
      navigationPath: ['schema'] as NavigationState['navigationPath'],
    };

    expect(
      selectLeafwardDestinationNodes(xsdNavigationProject, mismatched),
    ).toEqual([]);
    expect(
      navigateLeafward(xsdNavigationProject, mismatched, 'element'),
    ).toEqual({
      applied: false,
      reason: 'projectMismatch',
      state: mismatched,
    });
  });
});

describe('rootward navigation and path focus', () => {
  const chapterJourney = (): NavigationState => {
    const atContent = expectApplied(
      navigateLeafward(
        bookDtdProject,
        initializeAtBook(),
        bookDtdNodeIds.bookContent,
      ),
    );
    return expectApplied(
      navigateLeafward(bookDtdProject, atContent, bookDtdNodeIds.chapter),
    );
  };

  it('removes exactly one final journey entry', () => {
    const result = navigateRootward(chapterJourney());

    expect(result.applied).toBe(true);
    expect(result.state.navigationPath).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.bookContent,
    ]);
  });

  it('is an explicit no-op at the first path node', () => {
    const initial = initializeAtBook();
    const result = navigateRootward(initial);

    expect(result).toEqual({
      applied: false,
      reason: 'rootwardUnavailable',
      state: initial,
    });
  });

  it('selects the immediate rootward node', () => {
    expect(
      selectImmediateRootwardNode(bookDtdProject, chapterJourney())?.name,
    ).toBe('book.content');
  });

  it('truncates at an earlier path node', () => {
    const result = focusRootwardPathNode(
      chapterJourney(),
      bookDtdNodeIds.bookContent,
    );

    expect(result.applied).toBe(true);
    expect(result.state.navigationPath).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.bookContent,
    ]);
  });

  it.each([
    ['the current node', bookDtdNodeIds.chapter, 'alreadyFocused'],
    ['a node outside the path', bookDtdNodeIds.section, 'notInRootwardPath'],
  ])('does not alter the path when focusing %s', (_case, nodeId, reason) => {
    const state = chapterJourney();
    const result = focusRootwardPathNode(state, nodeId);

    expect(result).toEqual({ applied: false, reason, state });
  });
});

describe('teleportation', () => {
  it('starts a new journey at section without inventing ancestors', () => {
    const result = teleportNavigation(
      bookDtdProject,
      initializeAtBook(),
      bookDtdNodeIds.section,
    );

    expect(result.applied).toBe(true);
    expect(result.state.navigationPath).toEqual([bookDtdNodeIds.section]);
  });

  it('rejects an unknown target without changing state', () => {
    const initial = initializeAtBook();
    expect(teleportNavigation(bookDtdProject, initial, 'missing')).toEqual({
      applied: false,
      reason: 'unknownNode',
      state: initial,
    });
  });
});

describe('search-origin store centering', () => {
  it('applies reconstructed, singleton, rootward, and leafward journeys', () => {
    const reconstructed = createNavigationStore(xsdNavigationProject, {
      projectId: xsdNavigationProject.id,
      navigationPath: ['attribute'],
    });
    expect(
      reconstructed.centerNode({ targetNodeId: 'local', origin: 'search' }),
    ).toMatchObject({ applied: true });
    expect(get(reconstructed).navigationPath).toEqual([
      'schema',
      'type',
      'sequence',
      'local',
    ]);

    const teleported = createNavigationStore(xsdNavigationProject, {
      projectId: xsdNavigationProject.id,
      navigationPath: ['schema'],
    });
    expect(
      teleported.centerNode({ targetNodeId: 'attribute', origin: 'search' }),
    ).toMatchObject({ applied: true });
    expect(get(teleported).navigationPath).toEqual(['attribute']);

    const rootward = createNavigationStore(xsdNavigationProject, {
      projectId: xsdNavigationProject.id,
      navigationPath: ['schema', 'type', 'sequence', 'local'],
    });
    expect(
      rootward.centerNode({ targetNodeId: 'type', origin: 'search' }),
    ).toMatchObject({ applied: true });
    expect(get(rootward).navigationPath).toEqual(['schema', 'type']);

    const leafward = createNavigationStore(xsdNavigationProject, {
      projectId: xsdNavigationProject.id,
      navigationPath: ['schema'],
    });
    expect(
      leafward.centerNode({ targetNodeId: 'element', origin: 'search' }),
    ).toMatchObject({ applied: true });
    expect(get(leafward).navigationPath).toEqual(['schema', 'element']);
  });

  it('keeps rejected state identical and notifies only for an applied action', () => {
    const store = createNavigationStore(xsdNavigationProject, {
      projectId: xsdNavigationProject.id,
      navigationPath: ['schema'],
    });
    const states: NavigationState[] = [];
    const unsubscribe = store.subscribe((state) => states.push(state));

    const applied = store.centerNode({
      targetNodeId: 'element',
      origin: 'search',
    });
    const beforeRejected = get(store);
    const alreadyFocused = store.centerNode({
      targetNodeId: 'element',
      origin: 'search',
    });
    const unknown = store.centerNode({
      targetNodeId: 'missing',
      origin: 'search',
    });
    unsubscribe();

    expect(applied.applied).toBe(true);
    expect(alreadyFocused).toEqual({
      applied: false,
      reason: 'alreadyFocused',
      state: beforeRejected,
    });
    expect(unknown).toEqual({
      applied: false,
      reason: 'unknownNode',
      state: beforeRejected,
    });
    expect(states).toHaveLength(2);
    expect(states[1]).toBe(applied.state);
    expect(get(store)).toBe(beforeRejected);
  });
});

describe('relationship-aware store centering', () => {
  const bookToIndexRequest = {
    targetNodeId: bookDtdNodeIds.index,
    relationshipContext: {
      kind: 'outgoing-structural' as const,
      sourceNodeId: bookDtdNodeIds.book,
      edgeId: 'dtd:contains:book:index',
    },
  };

  it('begins a validated two-ID relationship journey without copied nodes', () => {
    const store = createNavigationStore(bookDtdProject, {
      projectId: bookDtdProject.id,
      navigationPath: [bookDtdNodeIds.section],
    });

    expect(store.centerNode(bookToIndexRequest).applied).toBe(true);
    expect(get(store).navigationPath).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.index,
    ]);
    expect(
      get(store).navigationPath.every((nodeId) => typeof nodeId === 'string'),
    ).toBe(true);
    expect(bookToIndexRequest).not.toHaveProperty('sourceNode');
    expect(bookToIndexRequest).not.toHaveProperty('targetNode');
  });

  it('returns rootward from the relationship destination to its source', () => {
    const store = createNavigationStore(bookDtdProject, initializeAtBook());

    store.centerNode(bookToIndexRequest);
    expect(store.navigateRootward()).toMatchObject({ applied: true });
    expect(get(store).navigationPath).toEqual([bookDtdNodeIds.book]);
  });

  it('preserves a current prefix and truncates an earlier source before appending', () => {
    const currentSourceStore = createNavigationStore(
      bookDtdProject,
      initializeAtBook(),
    );
    currentSourceStore.centerNode(bookToIndexRequest);
    expect(get(currentSourceStore).navigationPath).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.index,
    ]);

    const earlierSourceStore = createNavigationStore(bookDtdProject, {
      projectId: bookDtdProject.id,
      navigationPath: [
        bookDtdNodeIds.book,
        bookDtdNodeIds.bookContent,
        bookDtdNodeIds.chapter,
      ],
    });
    earlierSourceStore.centerNode(bookToIndexRequest);
    expect(get(earlierSourceStore).navigationPath).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.index,
    ]);
  });

  it('keeps the immutable schema project unchanged', () => {
    const before = JSON.stringify(bookDtdProject);
    const store = createNavigationStore(bookDtdProject, {
      projectId: bookDtdProject.id,
      navigationPath: [bookDtdNodeIds.section],
    });

    store.centerNode(bookToIndexRequest);
    store.navigateRootward();

    expect(JSON.stringify(bookDtdProject)).toBe(before);
  });

  it.each([
    [
      bookDtdNodeIds.book,
      bookDtdNodeIds.frontMatter,
      'dtd:contains:book:front.matter',
      [bookDtdNodeIds.book, bookDtdNodeIds.frontMatter],
    ],
    [
      bookDtdNodeIds.book,
      bookDtdNodeIds.bookContent,
      'dtd:contains:book:book.content',
      [bookDtdNodeIds.book, bookDtdNodeIds.bookContent],
    ],
    [
      bookDtdNodeIds.book,
      bookDtdNodeIds.index,
      'dtd:contains:book:index',
      [bookDtdNodeIds.book, bookDtdNodeIds.index],
    ],
    [
      bookDtdNodeIds.frontMatter,
      bookDtdNodeIds.titlePage,
      'dtd:contains:front.matter:title.page',
      [
        bookDtdNodeIds.book,
        bookDtdNodeIds.frontMatter,
        bookDtdNodeIds.titlePage,
      ],
    ],
    [
      bookDtdNodeIds.frontMatter,
      bookDtdNodeIds.preface,
      'dtd:contains:front.matter:preface',
      [bookDtdNodeIds.book, bookDtdNodeIds.frontMatter, bookDtdNodeIds.preface],
    ],
    [
      bookDtdNodeIds.bookContent,
      bookDtdNodeIds.chapter,
      'dtd:contains:book.content:chapter',
      [bookDtdNodeIds.book, bookDtdNodeIds.bookContent, bookDtdNodeIds.chapter],
    ],
    [
      bookDtdNodeIds.titlePage,
      bookDtdNodeIds.title,
      'dtd:contains:title.page:title',
      [
        bookDtdNodeIds.book,
        bookDtdNodeIds.frontMatter,
        bookDtdNodeIds.titlePage,
        bookDtdNodeIds.title,
      ],
    ],
    [
      bookDtdNodeIds.titlePage,
      bookDtdNodeIds.subtitle,
      'dtd:contains:title.page:subtitle',
      [
        bookDtdNodeIds.book,
        bookDtdNodeIds.frontMatter,
        bookDtdNodeIds.titlePage,
        bookDtdNodeIds.subtitle,
      ],
    ],
    [
      bookDtdNodeIds.titlePage,
      bookDtdNodeIds.author,
      'dtd:contains:title.page:author',
      [
        bookDtdNodeIds.book,
        bookDtdNodeIds.frontMatter,
        bookDtdNodeIds.titlePage,
        bookDtdNodeIds.author,
      ],
    ],
    [
      bookDtdNodeIds.chapter,
      bookDtdNodeIds.title,
      'dtd:contains:chapter:title',
      [
        bookDtdNodeIds.book,
        bookDtdNodeIds.bookContent,
        bookDtdNodeIds.chapter,
        bookDtdNodeIds.title,
      ],
    ],
    [
      bookDtdNodeIds.chapter,
      bookDtdNodeIds.epigraph,
      'dtd:contains:chapter:epigraph',
      [
        bookDtdNodeIds.book,
        bookDtdNodeIds.bookContent,
        bookDtdNodeIds.chapter,
        bookDtdNodeIds.epigraph,
      ],
    ],
    [
      bookDtdNodeIds.chapter,
      bookDtdNodeIds.section,
      'dtd:contains:chapter:section',
      [
        bookDtdNodeIds.book,
        bookDtdNodeIds.bookContent,
        bookDtdNodeIds.chapter,
        bookDtdNodeIds.section,
      ],
    ],
    [
      bookDtdNodeIds.chapter,
      bookDtdNodeIds.figure,
      'dtd:contains:chapter:figure',
      [
        bookDtdNodeIds.book,
        bookDtdNodeIds.bookContent,
        bookDtdNodeIds.chapter,
        bookDtdNodeIds.figure,
      ],
    ],
    [
      bookDtdNodeIds.chapter,
      bookDtdNodeIds.note,
      'dtd:contains:chapter:note',
      [
        bookDtdNodeIds.book,
        bookDtdNodeIds.bookContent,
        bookDtdNodeIds.chapter,
        bookDtdNodeIds.note,
      ],
    ],
    [
      bookDtdNodeIds.section,
      bookDtdNodeIds.title,
      'dtd:contains:section:title',
      [
        bookDtdNodeIds.book,
        bookDtdNodeIds.bookContent,
        bookDtdNodeIds.chapter,
        bookDtdNodeIds.section,
        bookDtdNodeIds.title,
      ],
    ],
    [
      bookDtdNodeIds.section,
      bookDtdNodeIds.para,
      'dtd:contains:section:para',
      [
        bookDtdNodeIds.book,
        bookDtdNodeIds.bookContent,
        bookDtdNodeIds.chapter,
        bookDtdNodeIds.section,
        bookDtdNodeIds.para,
      ],
    ],
    [
      bookDtdNodeIds.index,
      bookDtdNodeIds.indexEntry,
      'dtd:contains:index:index.entry',
      [bookDtdNodeIds.book, bookDtdNodeIds.index, bookDtdNodeIds.indexEntry],
    ],
  ])(
    'preserves sample relationship %s → %s',
    (sourceNodeId, targetNodeId, edgeId, expectedPath) => {
      const store = createNavigationStore(bookDtdProject, initializeAtBook());

      store.centerNode({
        targetNodeId,
        relationshipContext: {
          kind: 'outgoing-structural',
          sourceNodeId,
          edgeId,
        },
      });

      expect(get(store).navigationPath).toEqual(expectedPath);
    },
  );

  it('rejects manually supplied duplicate journeys in the store', () => {
    const cyclicProject: SchemaProject = {
      id: 'relationship-cycle',
      displayName: 'Relationship cycle',
      nodes: [
        { id: 'a', kind: 'dtdElement', name: 'a' },
        { id: 'b', kind: 'dtdElement', name: 'b' },
        { id: 'c', kind: 'dtdElement', name: 'c' },
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
      ],
      rootNodeIds: ['a'],
    };
    const store = createNavigationStore(cyclicProject, {
      projectId: cyclicProject.id,
      navigationPath: ['a', 'b', 'a', 'b'],
    });

    const result = store.centerNode({
      targetNodeId: 'c',
      relationshipContext: {
        kind: 'outgoing-structural',
        sourceNodeId: 'a',
        edgeId: 'a-c',
      },
    });

    expect(result).toEqual({
      applied: false,
      reason: 'invalidStructuralJourney',
      state: get(store),
    });
    expect(get(store).navigationPath).toEqual(['a', 'b', 'a', 'b']);
  });
});

describe('graph reuse and immutability', () => {
  it('does not mutate the sample project during navigation', () => {
    const snapshot = JSON.stringify(bookDtdProject);
    const atContent = expectApplied(
      navigateLeafward(
        bookDtdProject,
        initializeAtBook(),
        bookDtdNodeIds.bookContent,
      ),
    );
    navigateRootward(atContent);
    teleportNavigation(bookDtdProject, atContent, bookDtdNodeIds.section);

    expect(JSON.stringify(bookDtdProject)).toBe(snapshot);
  });

  it('keeps graph cycles valid while leaving terminal journeys unchanged', () => {
    const cyclicProject: SchemaProject = {
      id: 'cycle',
      displayName: 'Cycle',
      nodes: [
        { id: 'a', kind: 'dtdElement', name: 'a' },
        { id: 'b', kind: 'dtdElement', name: 'b' },
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
      ],
      rootNodeIds: ['a'],
    };
    const initialized = initializeNavigation(cyclicProject, 'a');
    if (!initialized.applied) {
      throw new Error('Expected the cyclic project to initialize.');
    }
    const atB = expectApplied(
      navigateLeafward(cyclicProject, initialized.state, 'b'),
    );
    const backAtA = navigateStructuralRelationship(cyclicProject, atB, {
      edgeId: 'b-a',
      sourceNodeId: 'b',
      targetNodeId: 'a',
    });

    expect(backAtA).toEqual({
      applied: false,
      reason: 'terminalCycleClosure',
      state: atB,
    });
  });

  it('keeps self closures unchanged and longer cycles bounded', () => {
    const cyclicProject: SchemaProject = {
      id: 'long-cycle',
      displayName: 'Long cycle',
      nodes: [
        { id: 'a', kind: 'dtdElement', name: 'a' },
        { id: 'b', kind: 'dtdElement', name: 'b' },
        { id: 'c', kind: 'dtdElement', name: 'c' },
      ],
      edges: [
        {
          id: 'a-a',
          kind: 'contains',
          sourceNodeId: 'a',
          targetNodeId: 'a',
        },
        {
          id: 'a-b',
          kind: 'contains',
          sourceNodeId: 'a',
          targetNodeId: 'b',
        },
        {
          id: 'b-c',
          kind: 'contains',
          sourceNodeId: 'b',
          targetNodeId: 'c',
        },
        {
          id: 'c-a',
          kind: 'contains',
          sourceNodeId: 'c',
          targetNodeId: 'a',
        },
      ],
      rootNodeIds: ['a'],
    };
    const atA: NavigationState = {
      projectId: cyclicProject.id,
      navigationPath: ['a'],
    };
    expect(
      navigateStructuralRelationship(cyclicProject, atA, {
        edgeId: 'a-a',
        sourceNodeId: 'a',
        targetNodeId: 'a',
      }),
    ).toEqual({
      applied: false,
      reason: 'terminalCycleClosure',
      state: atA,
    });

    const atB = navigateStructuralRelationship(cyclicProject, atA, {
      edgeId: 'a-b',
      sourceNodeId: 'a',
      targetNodeId: 'b',
    });
    if (!atB.applied) throw new Error('Expected A → B.');
    const atC = navigateStructuralRelationship(cyclicProject, atB.state, {
      edgeId: 'b-c',
      sourceNodeId: 'b',
      targetNodeId: 'c',
    });
    if (!atC.applied) throw new Error('Expected B → C.');
    expect(
      navigateStructuralRelationship(cyclicProject, atC.state, {
        edgeId: 'c-a',
        sourceNodeId: 'c',
        targetNodeId: 'a',
      }),
    ).toEqual({
      applied: false,
      reason: 'terminalCycleClosure',
      state: atC.state,
    });
  });
});

describe('navigation selectors and store wrapper', () => {
  const chapterState: NavigationState = {
    projectId: bookDtdProject.id,
    navigationPath: [
      bookDtdNodeIds.book,
      bookDtdNodeIds.bookContent,
      bookDtdNodeIds.chapter,
    ],
  };

  it('derives chapter focus, nearest-first roots, and ordered leaves', () => {
    expect(selectCurrentFocusNodeId(chapterState)).toBe(bookDtdNodeIds.chapter);
    expect(selectCurrentFocusNode(bookDtdProject, chapterState)?.name).toBe(
      'chapter',
    );
    expect(
      selectImmediateRootwardNode(bookDtdProject, chapterState)?.name,
    ).toBe('book.content');
    expect(
      selectRootwardPathNodes(bookDtdProject, chapterState).map(
        (node) => node.name,
      ),
    ).toEqual(['book.content', 'book']);
    expect(
      selectLeafwardDestinationNodes(bookDtdProject, chapterState).map(
        (node) => node.name,
      ),
    ).toEqual(['title', 'epigraph', 'section', 'figure', 'note']);
    expect(
      selectLeafwardEdges(bookDtdProject, chapterState).find(
        (edge) => edge.targetNodeId === bookDtdNodeIds.section,
      )?.occurrence,
    ).toEqual({ min: 0, max: 'unbounded' });
    expect(selectCanNavigateRootward(chapterState)).toBe(true);
  });

  it('returns path IDs and resolvable path nodes safely', () => {
    expect(selectNavigationPathIds(chapterState)).toEqual(
      chapterState.navigationPath,
    );
    expect(
      selectNavigationPathNodes(bookDtdProject, {
        ...chapterState,
        navigationPath: [bookDtdNodeIds.book, 'missing'],
      }).map((node) => node.name),
    ).toEqual(['book']);
  });

  it('exposes named transitions and readable derived state', () => {
    const store = createNavigationStore(bookDtdProject, initializeAtBook());

    expect(get(store.currentFocusNode)?.name).toBe('book');
    expect(
      get(store.leafwardDestinationNodes).map((node) => node.name),
    ).toEqual(['front.matter', 'book.content', 'index']);

    const result = store.navigateLeafward(bookDtdNodeIds.bookContent);
    expect(result.applied).toBe(true);
    expect(get(store).navigationPath).toEqual([
      bookDtdNodeIds.book,
      bookDtdNodeIds.bookContent,
    ]);
    expect(get(store.currentFocusNodeId)).toBe(bookDtdNodeIds.bookContent);
    expect(get(store.canNavigateRootward)).toBe(true);
  });
});
