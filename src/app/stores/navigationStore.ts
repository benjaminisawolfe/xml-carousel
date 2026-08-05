import { derived, get, readable, writable, type Readable } from 'svelte/store';
import {
  getOutgoingStructuralRelationships,
  getSchemaNode,
  type SchemaEdge,
  type SchemaNode,
  type SchemaNodeId,
  type SchemaProject,
  type SchemaRelationship,
} from '../../schema/model';
import { activeProject } from './projectStore';
import {
  selectCanNavigateRootward,
  selectCurrentFocusNode,
  selectCurrentFocusNodeId,
  selectImmediateRootwardNode,
  selectLeafwardDestinationNodes,
  selectLeafwardEdges,
  selectLeafwardRelationships,
  selectNavigationPathIds,
  selectNavigationPathNodes,
  selectRootwardPathNodes,
} from './navigationSelectors';
import {
  classifyStructuralRelationshipForJourney,
  decideNodeCenteringRoute,
  isValidStructuralJourney,
  type NodeCenteringRoute,
  type NodeCenterRequest,
} from './navigationCentering';
import type {
  NavigationInitializationResult,
  NavigationPath,
  NavigationState,
  StructuralRelationshipNavigationResult,
  NavigationTransitionResult,
} from './navigationTypes';

function reject(
  state: NavigationState,
  reason: Extract<NavigationTransitionResult, { applied: false }>['reason'],
): NavigationTransitionResult {
  return { applied: false, reason, state };
}

function rejectStructural(
  state: NavigationState,
  reason: Extract<
    StructuralRelationshipNavigationResult,
    { applied: false }
  >['reason'],
): StructuralRelationshipNavigationResult {
  return { applied: false, reason, state };
}

function apply(state: NavigationState): NavigationTransitionResult {
  return { applied: true, state };
}

function isMatchingProject(
  project: SchemaProject,
  state: NavigationState,
): boolean {
  return project.id === state.projectId;
}

export function initializeNavigation(
  project: SchemaProject,
  nodeId: SchemaNodeId,
): NavigationInitializationResult {
  if (!getSchemaNode(project, nodeId)) {
    return { applied: false, reason: 'unknownNode' };
  }

  return {
    applied: true,
    state: {
      projectId: project.id,
      navigationPath: [nodeId],
    },
  };
}

export function navigateLeafward(
  project: SchemaProject,
  state: NavigationState,
  targetNodeId: SchemaNodeId,
  relationshipId?: string,
): NavigationTransitionResult {
  if (!isMatchingProject(project, state)) {
    return reject(state, 'projectMismatch');
  }

  if (!getSchemaNode(project, targetNodeId)) {
    return reject(state, 'unknownNode');
  }

  const relationships = getOutgoingStructuralRelationships(
    project,
    selectCurrentFocusNodeId(state),
  ).filter(
    ({ edge, node }) =>
      node.id === targetNodeId &&
      (relationshipId === undefined || edge.id === relationshipId),
  );

  if (relationships.length > 1) {
    return reject(state, 'ambiguousRelationship');
  }
  if (relationships.length === 0) {
    return reject(state, 'notLeafwardDestination');
  }

  const result = navigateStructuralRelationship(project, state, {
    edgeId: relationships[0].edge.id,
    sourceNodeId: relationships[0].edge.sourceNodeId,
    targetNodeId,
  });
  return result.applied
    ? { applied: true, state: result.state }
    : { applied: false, reason: result.reason, state: result.state };
}

export interface StructuralRelationshipNavigationRequest {
  readonly edgeId: string;
  readonly sourceNodeId: SchemaNodeId;
  readonly targetNodeId: SchemaNodeId;
}

export function navigateStructuralRelationship(
  project: SchemaProject,
  state: NavigationState,
  request: StructuralRelationshipNavigationRequest,
): StructuralRelationshipNavigationResult {
  if (!isMatchingProject(project, state)) {
    return rejectStructural(state, 'projectMismatch');
  }
  if (
    !getSchemaNode(project, request.sourceNodeId) ||
    !getSchemaNode(project, request.targetNodeId)
  ) {
    return rejectStructural(state, 'unknownNode');
  }
  if (!isValidStructuralJourney(project, state.navigationPath)) {
    return rejectStructural(state, 'invalidRelationship');
  }

  const relationships = getOutgoingStructuralRelationships(
    project,
    request.sourceNodeId,
  ).filter(
    ({ edge, node }) =>
      edge.id === request.edgeId &&
      edge.sourceNodeId === request.sourceNodeId &&
      edge.targetNodeId === request.targetNodeId &&
      node.id === request.targetNodeId,
  );
  if (relationships.length > 1) {
    return rejectStructural(state, 'ambiguousRelationship');
  }
  const relationship = relationships[0];
  if (
    !relationship ||
    request.sourceNodeId !== selectCurrentFocusNodeId(state)
  ) {
    return rejectStructural(state, 'invalidRelationship');
  }

  const disposition = classifyStructuralRelationshipForJourney(
    project,
    state,
    relationship,
  );
  if (!disposition) {
    return rejectStructural(state, 'invalidRelationship');
  }
  if (disposition.kind === 'terminalCycleClosure') {
    return rejectStructural(state, 'terminalCycleClosure');
  }

  return {
    applied: true,
    effect: 'advanced',
    state: {
      ...state,
      navigationPath: [
        state.navigationPath[0],
        ...state.navigationPath.slice(1),
        request.targetNodeId,
      ],
    },
  };
}

export function navigateRootward(
  state: NavigationState,
): NavigationTransitionResult {
  if (state.navigationPath.length === 1) {
    return reject(state, 'rootwardUnavailable');
  }

  const navigationPath: NavigationPath = [
    state.navigationPath[0],
    ...state.navigationPath.slice(1, -1),
  ];

  return apply({
    ...state,
    navigationPath,
  });
}

export function focusRootwardPathNode(
  state: NavigationState,
  targetNodeId: SchemaNodeId,
): NavigationTransitionResult {
  if (selectCurrentFocusNodeId(state) === targetNodeId) {
    return reject(state, 'alreadyFocused');
  }

  const targetIndex = state.navigationPath.lastIndexOf(targetNodeId);
  if (targetIndex < 0) {
    return reject(state, 'notInRootwardPath');
  }

  const navigationPath: NavigationPath = [
    state.navigationPath[0],
    ...state.navigationPath.slice(1, targetIndex + 1),
  ];

  return apply({
    ...state,
    navigationPath,
  });
}

export function focusJourneyPosition(
  state: NavigationState,
  targetJourneyPosition: number,
): NavigationTransitionResult {
  const currentPosition = state.navigationPath.length - 1;
  if (
    !Number.isInteger(targetJourneyPosition) ||
    targetJourneyPosition < 0 ||
    targetJourneyPosition >= currentPosition
  ) {
    return reject(state, 'notInRootwardPath');
  }

  return apply({
    ...state,
    navigationPath: [
      state.navigationPath[0],
      ...state.navigationPath.slice(1, targetJourneyPosition + 1),
    ],
  });
}

/** Global entry points begin a new journey; they do not invent ancestors. */
export function teleportNavigation(
  project: SchemaProject,
  state: NavigationState,
  targetNodeId: SchemaNodeId,
): NavigationTransitionResult {
  if (!isMatchingProject(project, state)) {
    return reject(state, 'projectMismatch');
  }

  if (!getSchemaNode(project, targetNodeId)) {
    return reject(state, 'unknownNode');
  }

  return apply({
    projectId: project.id,
    navigationPath: [targetNodeId],
  });
}

export function centerNavigation(
  project: SchemaProject,
  state: NavigationState,
  request: NodeCenterRequest,
): NavigationTransitionResult {
  const route = decideNodeCenteringRoute(project, state, request);

  switch (route.kind) {
    case 'alreadyFocused':
      return reject(state, 'alreadyFocused');
    case 'rootward':
      return focusJourneyPosition(state, route.journeyPosition);
    case 'leafward':
      return navigateLeafward(project, state, request.targetNodeId);
    case 'teleport':
      return teleportNavigation(project, state, request.targetNodeId);
    case 'reconstructed':
      return navigateReconstructedJourney(project, state, route.journey);
    case 'relationshipLeafward': {
      const result = navigateStructuralRelationship(project, state, {
        edgeId: route.edgeId,
        sourceNodeId: route.sourceNodeId,
        targetNodeId: route.targetNodeId,
      });
      return result.applied
        ? { applied: true, state: result.state }
        : { applied: false, reason: result.reason, state: result.state };
    }
    case 'relationshipTerminalCycleClosure':
      return {
        applied: false,
        reason: 'terminalCycleClosure',
        state,
      };
    case 'relationshipReroute':
    case 'relationshipReconstructed':
    case 'relationshipTeleport':
      return navigateThroughRelationship(project, state, route);
    case 'rejected':
      return reject(state, route.reason);
  }
}

type RelationshipCenteringRoute = Extract<
  NodeCenteringRoute,
  {
    readonly kind:
      | 'relationshipLeafward'
      | 'relationshipReroute'
      | 'relationshipReconstructed'
      | 'relationshipTeleport';
  }
>;

function navigateThroughRelationship(
  project: SchemaProject,
  state: NavigationState,
  route: RelationshipCenteringRoute,
): NavigationTransitionResult {
  const navigationPath: NavigationPath =
    route.kind === 'relationshipReconstructed'
      ? route.journey
      : route.kind === 'relationshipTeleport'
        ? [route.sourceNodeId, route.targetNodeId]
        : [
            state.navigationPath[0],
            ...state.navigationPath.slice(1, route.sourceJourneyPosition + 1),
            route.targetNodeId,
          ];

  return navigateReconstructedJourney(project, state, navigationPath);
}

function navigateReconstructedJourney(
  project: SchemaProject,
  state: NavigationState,
  navigationPath: readonly SchemaNodeId[],
): NavigationTransitionResult {
  if (!isMatchingProject(project, state)) {
    return reject(state, 'projectMismatch');
  }
  if (!isValidStructuralJourney(project, navigationPath)) {
    return reject(state, 'invalidStructuralJourney');
  }

  return apply({
    ...state,
    navigationPath: [
      navigationPath[0],
      ...navigationPath.slice(1),
    ] as NavigationPath,
  });
}

export interface NavigationStore extends Readable<NavigationState> {
  readonly currentFocusNodeId: Readable<SchemaNodeId>;
  readonly currentFocusNode: Readable<SchemaNode | undefined>;
  readonly navigationPathIds: Readable<NavigationPath>;
  readonly navigationPathNodes: Readable<SchemaNode[]>;
  readonly immediateRootwardNode: Readable<SchemaNode | undefined>;
  readonly rootwardPathNodes: Readable<SchemaNode[]>;
  readonly leafwardRelationships: Readable<SchemaRelationship[]>;
  readonly leafwardEdges: Readable<SchemaEdge[]>;
  readonly leafwardDestinationNodes: Readable<SchemaNode[]>;
  readonly canNavigateRootward: Readable<boolean>;
  resetForProject(
    project: SchemaProject,
    nodeId: SchemaNodeId,
  ): NavigationTransitionResult;
  initializeAt(nodeId: SchemaNodeId): NavigationTransitionResult;
  navigateLeafward(
    nodeId: SchemaNodeId,
    relationshipId?: string,
  ): NavigationTransitionResult;
  navigateStructuralRelationship(
    request: StructuralRelationshipNavigationRequest,
  ): StructuralRelationshipNavigationResult;
  navigateRootward(): NavigationTransitionResult;
  focusRootwardPathNode(nodeId: SchemaNodeId): NavigationTransitionResult;
  centerNode(request: NodeCenterRequest): NavigationTransitionResult;
  teleport(nodeId: SchemaNodeId): NavigationTransitionResult;
}

export function createNavigationStore(
  projectSource: SchemaProject | Readable<SchemaProject>,
  initialState: NavigationState,
): NavigationStore {
  const state = writable(initialState);
  const project =
    'subscribe' in projectSource ? projectSource : readable(projectSource);

  function applyTransition(
    transition: (current: NavigationState) => NavigationTransitionResult,
  ): NavigationTransitionResult {
    const result = transition(get(state));
    if (result.applied) {
      state.set(result.state);
    }
    return result;
  }

  return {
    subscribe: state.subscribe,
    currentFocusNodeId: derived(state, selectCurrentFocusNodeId),
    currentFocusNode: derived([state, project], ([current, active]) =>
      selectCurrentFocusNode(active, current),
    ),
    navigationPathIds: derived(state, selectNavigationPathIds),
    navigationPathNodes: derived([state, project], ([current, active]) =>
      selectNavigationPathNodes(active, current),
    ),
    immediateRootwardNode: derived([state, project], ([current, active]) =>
      selectImmediateRootwardNode(active, current),
    ),
    rootwardPathNodes: derived([state, project], ([current, active]) =>
      selectRootwardPathNodes(active, current),
    ),
    leafwardRelationships: derived([state, project], ([current, active]) =>
      selectLeafwardRelationships(active, current),
    ),
    leafwardEdges: derived([state, project], ([current, active]) =>
      selectLeafwardEdges(active, current),
    ),
    leafwardDestinationNodes: derived([state, project], ([current, active]) =>
      selectLeafwardDestinationNodes(active, current),
    ),
    canNavigateRootward: derived(state, selectCanNavigateRootward),
    resetForProject(nextProject, nodeId) {
      const result = initializeNavigation(nextProject, nodeId);
      if (!result.applied) {
        return reject(get(state), result.reason);
      }
      state.set(result.state);
      return apply(result.state);
    },
    initializeAt(nodeId) {
      const result = initializeNavigation(get(project), nodeId);
      if (!result.applied) {
        return reject(get(state), result.reason);
      }
      state.set(result.state);
      return apply(result.state);
    },
    navigateLeafward(nodeId, relationshipId) {
      return applyTransition((current) =>
        navigateLeafward(get(project), current, nodeId, relationshipId),
      );
    },
    navigateStructuralRelationship(request) {
      return applyTransition((current) =>
        navigateStructuralRelationship(get(project), current, request),
      ) as StructuralRelationshipNavigationResult;
    },
    navigateRootward() {
      return applyTransition(navigateRootward);
    },
    focusRootwardPathNode(nodeId) {
      return applyTransition((current) =>
        focusRootwardPathNode(current, nodeId),
      );
    },
    centerNode(request) {
      return applyTransition((current) =>
        centerNavigation(get(project), current, request),
      );
    },
    teleport(nodeId) {
      return applyTransition((current) =>
        teleportNavigation(get(project), current, nodeId),
      );
    },
  };
}

const initialProject = get(activeProject);
const initialFocusNodeId =
  initialProject.rootNodeIds[0] ?? initialProject.nodes[0]?.id;
if (!initialFocusNodeId) {
  throw new Error('The initial active project has no focusable schema node.');
}

const initialNavigationState = {
  projectId: initialProject.id,
  navigationPath: [initialFocusNodeId],
} satisfies NavigationState;

export const navigationStore = createNavigationStore(
  activeProject,
  initialNavigationState,
);
