import {
  getOutgoingStructuralRelationships,
  getSchemaEdge,
  getSchemaNode,
  isStructuralEdgeKind,
  type SchemaEdgeId,
  type SchemaNodeId,
  type SchemaProject,
  type SchemaRelationship,
} from '../../schema/model';
import { selectCurrentFocusNodeId } from './navigationSelectors';
import type { NavigationPath, NavigationState } from './navigationTypes';

export type NodeCenterRelationshipContext =
  | {
      readonly kind: 'outgoing-structural';
      readonly sourceNodeId: SchemaNodeId;
      readonly edgeId: SchemaEdgeId;
    }
  | {
      readonly kind: 'incoming-structural';
      readonly inspectedNodeId: SchemaNodeId;
      readonly sourceNodeId: SchemaNodeId;
      readonly edgeId: SchemaEdgeId;
    };

interface GeneralNodeCenterRequest {
  readonly targetNodeId: SchemaNodeId;
  readonly targetJourneyPosition?: number;
  readonly relationshipContext?: NodeCenterRelationshipContext;
  readonly origin?: 'inspector' | 'navigation';
  readonly beginNewJourney?: boolean;
}

interface SearchNodeCenterRequest {
  readonly targetNodeId: SchemaNodeId;
  readonly origin: 'search';
  readonly targetJourneyPosition?: never;
  readonly relationshipContext?: never;
  readonly beginNewJourney?: never;
}

export type NodeCenterRequest =
  GeneralNodeCenterRequest | SearchNodeCenterRequest;

interface RelationshipRouteDetails {
  readonly sourceNodeId: SchemaNodeId;
  readonly targetNodeId: SchemaNodeId;
  readonly edgeId: SchemaEdgeId;
}

export type StructuralJourneyDisposition =
  | {
      readonly kind: 'advance';
    }
  | {
      readonly kind: 'terminalCycleClosure';
      readonly targetJourneyPosition: number;
      readonly isCurrentFocus: boolean;
    };

export type NodeCenteringRoute =
  | { readonly kind: 'alreadyFocused' }
  | { readonly kind: 'rootward'; readonly journeyPosition: number }
  | { readonly kind: 'leafward' }
  | { readonly kind: 'teleport' }
  | {
      readonly kind: 'reconstructed';
      readonly journey: NavigationPath;
    }
  | ({
      readonly kind: 'relationshipLeafward';
      readonly sourceJourneyPosition: number;
    } & RelationshipRouteDetails)
  | ({
      readonly kind: 'relationshipReroute';
      readonly sourceJourneyPosition: number;
    } & RelationshipRouteDetails)
  | ({
      readonly kind: 'relationshipReconstructed';
      readonly journey: NavigationPath;
    } & RelationshipRouteDetails)
  | ({
      readonly kind: 'relationshipTeleport';
    } & RelationshipRouteDetails)
  | ({
      readonly kind: 'relationshipTerminalCycleClosure';
      readonly targetJourneyPosition: number;
      readonly isCurrentFocus: boolean;
    } & RelationshipRouteDetails)
  | {
      readonly kind: 'rejected';
      readonly reason:
        | 'projectMismatch'
        | 'unknownNode'
        | 'notInRootwardPath'
        | 'invalidRelationship'
        | 'invalidStructuralJourney';
    };

function isValidatedStructuralRelationship(
  project: SchemaProject,
  edgeId: SchemaEdgeId,
  sourceNodeId: SchemaNodeId,
  targetNodeId: SchemaNodeId,
): boolean {
  const edge = getSchemaEdge(project, edgeId);
  return Boolean(
    edge?.sourceNodeId === sourceNodeId &&
    edge.targetNodeId === targetNodeId &&
    getSchemaNode(project, targetNodeId)?.id === targetNodeId &&
    isStructuralEdgeKind(edge.kind),
  );
}

export function classifyStructuralRelationshipForJourney(
  project: SchemaProject,
  state: NavigationState,
  relationship: SchemaRelationship,
): StructuralJourneyDisposition | undefined {
  if (project.id !== state.projectId) return undefined;
  if (
    relationship.edge.sourceNodeId !== selectCurrentFocusNodeId(state) ||
    relationship.edge.targetNodeId !== relationship.node.id ||
    !isValidatedStructuralRelationship(
      project,
      relationship.edge.id,
      relationship.edge.sourceNodeId,
      relationship.node.id,
    )
  ) {
    return undefined;
  }

  const targetJourneyPosition = state.navigationPath.lastIndexOf(
    relationship.node.id,
  );
  if (targetJourneyPosition < 0) return { kind: 'advance' };

  return {
    kind: 'terminalCycleClosure',
    targetJourneyPosition,
    isCurrentFocus: targetJourneyPosition === state.navigationPath.length - 1,
  };
}

function getStructuralDestinations(
  project: SchemaProject,
  sourceNodeId: SchemaNodeId,
): readonly SchemaNodeId[] {
  return getOutgoingStructuralRelationships(project, sourceNodeId).map(
    ({ node }) => node.id,
  );
}

function findShortestStructuralPath(
  project: SchemaProject,
  startNodeIds: readonly SchemaNodeId[],
  targetNodeId: SchemaNodeId,
  blockedNodeIds: ReadonlySet<SchemaNodeId> = new Set(),
): NavigationPath | undefined {
  const queue: NavigationPath[] = [];
  const visited = new Set<SchemaNodeId>(blockedNodeIds);

  for (const startNodeId of startNodeIds) {
    if (!getSchemaNode(project, startNodeId)) continue;
    visited.delete(startNodeId);

    const path: NavigationPath = [startNodeId];
    if (startNodeId === targetNodeId) return path;
    queue.push(path);
    visited.add(startNodeId);
  }

  for (let index = 0; index < queue.length; index += 1) {
    const path = queue[index];
    const sourceNodeId = path[path.length - 1];

    for (const destinationNodeId of getStructuralDestinations(
      project,
      sourceNodeId,
    )) {
      if (visited.has(destinationNodeId)) continue;

      const nextPath: NavigationPath = [
        path[0],
        ...path.slice(1),
        destinationNodeId,
      ];
      if (destinationNodeId === targetNodeId) return nextPath;

      visited.add(destinationNodeId);
      queue.push(nextPath);
    }
  }

  return undefined;
}

export function isValidStructuralJourney(
  project: SchemaProject,
  journey: readonly SchemaNodeId[],
): journey is NavigationPath {
  if (journey.length === 0) return false;
  if (journey.some((nodeId) => !getSchemaNode(project, nodeId))) return false;
  if (new Set(journey).size !== journey.length) return false;

  for (let index = 1; index < journey.length; index += 1) {
    const sourceNodeId = journey[index - 1];
    const targetNodeId = journey[index];
    if (
      !getStructuralDestinations(project, sourceNodeId).includes(targetNodeId)
    ) {
      return false;
    }
  }

  return true;
}

function findPreferredRootJourney(
  project: SchemaProject,
  currentJourney: readonly SchemaNodeId[],
  targetNodeId: SchemaNodeId,
): NavigationPath | undefined {
  for (
    let prefixEnd = currentJourney.length - 1;
    prefixEnd >= 0;
    prefixEnd -= 1
  ) {
    const prefix = currentJourney.slice(0, prefixEnd + 1);
    const prefixRootId = prefix[0];
    if (
      !prefixRootId ||
      !project.rootNodeIds.includes(prefixRootId) ||
      !isValidStructuralJourney(project, prefix)
    ) {
      continue;
    }

    const prefixFocusId = prefix[prefix.length - 1];
    const suffix = findShortestStructuralPath(
      project,
      [prefixFocusId],
      targetNodeId,
      new Set(prefix.slice(0, -1)),
    );
    if (suffix) {
      const journey = [...prefix, ...suffix.slice(1)];
      if (isValidStructuralJourney(project, journey)) return journey;
    }
  }

  return findShortestStructuralPath(project, project.rootNodeIds, targetNodeId);
}

export function findPreferredStructuralJourney(
  project: SchemaProject,
  currentJourney: readonly SchemaNodeId[],
  targetNodeId: SchemaNodeId,
  relationshipContext?: NodeCenterRelationshipContext,
): NavigationPath | undefined {
  if (!getSchemaNode(project, targetNodeId)) return undefined;

  if (relationshipContext?.kind === 'outgoing-structural') {
    if (
      !isValidatedStructuralRelationship(
        project,
        relationshipContext.edgeId,
        relationshipContext.sourceNodeId,
        targetNodeId,
      )
    ) {
      return undefined;
    }
  } else if (relationshipContext?.kind === 'incoming-structural') {
    if (
      targetNodeId !== relationshipContext.sourceNodeId ||
      !isValidatedStructuralRelationship(
        project,
        relationshipContext.edgeId,
        relationshipContext.sourceNodeId,
        relationshipContext.inspectedNodeId,
      )
    ) {
      return undefined;
    }
  }

  const existingTargetPosition = currentJourney.lastIndexOf(targetNodeId);
  if (existingTargetPosition >= 0) {
    const existingJourney = currentJourney.slice(0, existingTargetPosition + 1);
    return isValidStructuralJourney(project, existingJourney)
      ? existingJourney
      : undefined;
  }

  if (relationshipContext?.kind === 'outgoing-structural') {
    const sourceJourneyPosition = currentJourney.lastIndexOf(
      relationshipContext.sourceNodeId,
    );
    const sourceJourney =
      sourceJourneyPosition >= 0
        ? currentJourney.slice(0, sourceJourneyPosition + 1)
        : findPreferredRootJourney(
            project,
            currentJourney,
            relationshipContext.sourceNodeId,
          );
    if (!sourceJourney || !isValidStructuralJourney(project, sourceJourney)) {
      return undefined;
    }

    const journey = [...sourceJourney, targetNodeId];
    return isValidStructuralJourney(project, journey) ? journey : undefined;
  }

  return findPreferredRootJourney(project, currentJourney, targetNodeId);
}

function decideGenericRoute(
  project: SchemaProject,
  state: NavigationState,
  request: NodeCenterRequest,
): NodeCenteringRoute {
  const { targetNodeId, targetJourneyPosition } = request;
  const currentPosition = state.navigationPath.length - 1;

  if (targetJourneyPosition !== undefined) {
    if (
      Number.isInteger(targetJourneyPosition) &&
      targetJourneyPosition >= 0 &&
      targetJourneyPosition < currentPosition &&
      state.navigationPath[targetJourneyPosition] === targetNodeId
    ) {
      return { kind: 'rootward', journeyPosition: targetJourneyPosition };
    }

    if (
      targetJourneyPosition === currentPosition &&
      selectCurrentFocusNodeId(state) === targetNodeId
    ) {
      return { kind: 'alreadyFocused' };
    }

    return { kind: 'rejected', reason: 'notInRootwardPath' };
  }

  if (request.origin === 'navigation' && request.beginNewJourney) {
    const earlierPosition = state.navigationPath.lastIndexOf(
      targetNodeId,
      currentPosition - 1,
    );
    if (earlierPosition >= 0) {
      return { kind: 'rootward', journeyPosition: earlierPosition };
    }
    return { kind: 'reconstructed', journey: [targetNodeId] };
  }

  if (request.origin === 'navigation') {
    const journey = findPreferredStructuralJourney(project, [], targetNodeId);
    if (journey) return { kind: 'reconstructed', journey };
  }

  const earlierPosition = state.navigationPath.lastIndexOf(
    targetNodeId,
    currentPosition - 1,
  );
  if (earlierPosition >= 0) {
    return { kind: 'rootward', journeyPosition: earlierPosition };
  }

  const isImmediateLeafward = getOutgoingStructuralRelationships(
    project,
    selectCurrentFocusNodeId(state),
  ).some(({ node }) => node.id === targetNodeId);
  if (isImmediateLeafward) {
    return { kind: 'leafward' };
  }

  if (request.origin === 'inspector') {
    const journey = findPreferredStructuralJourney(
      project,
      state.navigationPath,
      targetNodeId,
    );
    if (journey) return { kind: 'reconstructed', journey };
  }

  return { kind: 'teleport' };
}

export function decideNodeCenteringRoute(
  project: SchemaProject,
  state: NavigationState,
  request: NodeCenterRequest,
): NodeCenteringRoute {
  const { targetNodeId, relationshipContext } = request;
  if (project.id !== state.projectId) {
    return { kind: 'rejected', reason: 'projectMismatch' };
  }
  if (!isValidStructuralJourney(project, state.navigationPath)) {
    return { kind: 'rejected', reason: 'invalidStructuralJourney' };
  }

  if (!getSchemaNode(project, targetNodeId)) {
    return { kind: 'rejected', reason: 'unknownNode' };
  }

  if (request.origin === 'search') {
    if (selectCurrentFocusNodeId(state) === targetNodeId) {
      return { kind: 'alreadyFocused' };
    }

    const existingTargetPosition = state.navigationPath.lastIndexOf(
      targetNodeId,
      state.navigationPath.length - 2,
    );
    if (existingTargetPosition >= 0) {
      return { kind: 'rootward', journeyPosition: existingTargetPosition };
    }

    const isImmediateLeafward = getOutgoingStructuralRelationships(
      project,
      selectCurrentFocusNodeId(state),
    ).some(({ node }) => node.id === targetNodeId);
    if (isImmediateLeafward) {
      return { kind: 'leafward' };
    }

    const journey = findPreferredStructuralJourney(
      project,
      state.navigationPath,
      targetNodeId,
    );
    return journey ? { kind: 'reconstructed', journey } : { kind: 'teleport' };
  }

  if (request.targetJourneyPosition !== undefined) {
    return decideGenericRoute(project, state, request);
  }

  if (relationshipContext?.kind === 'outgoing-structural') {
    if (
      !isValidatedStructuralRelationship(
        project,
        relationshipContext.edgeId,
        relationshipContext.sourceNodeId,
        targetNodeId,
      )
    ) {
      return { kind: 'rejected', reason: 'invalidRelationship' };
    }

    const sourceJourneyPosition = state.navigationPath.lastIndexOf(
      relationshipContext.sourceNodeId,
    );
    const relationshipDetails = {
      sourceNodeId: relationshipContext.sourceNodeId,
      targetNodeId,
      edgeId: relationshipContext.edgeId,
    };
    const targetJourneyPosition =
      state.navigationPath.lastIndexOf(targetNodeId);
    if (
      sourceJourneyPosition === state.navigationPath.length - 1 &&
      targetJourneyPosition >= 0
    ) {
      return {
        kind: 'relationshipTerminalCycleClosure',
        targetJourneyPosition,
        isCurrentFocus:
          targetJourneyPosition === state.navigationPath.length - 1,
        ...relationshipDetails,
      };
    }

    if (sourceJourneyPosition === state.navigationPath.length - 1) {
      return {
        kind: 'relationshipLeafward',
        sourceJourneyPosition,
        ...relationshipDetails,
      };
    }
    if (sourceJourneyPosition >= 0) {
      return {
        kind: 'relationshipReroute',
        sourceJourneyPosition,
        ...relationshipDetails,
      };
    }

    const journey = findPreferredStructuralJourney(
      project,
      state.navigationPath,
      targetNodeId,
      relationshipContext,
    );
    if (journey) {
      return {
        kind: 'relationshipReconstructed',
        journey,
        ...relationshipDetails,
      };
    }

    return { kind: 'relationshipTeleport', ...relationshipDetails };
  }

  if (relationshipContext?.kind === 'incoming-structural') {
    if (
      targetNodeId !== relationshipContext.sourceNodeId ||
      !isValidatedStructuralRelationship(
        project,
        relationshipContext.edgeId,
        relationshipContext.sourceNodeId,
        relationshipContext.inspectedNodeId,
      )
    ) {
      return { kind: 'rejected', reason: 'invalidRelationship' };
    }
    if (selectCurrentFocusNodeId(state) === targetNodeId) {
      return { kind: 'alreadyFocused' };
    }

    const journey = findPreferredStructuralJourney(
      project,
      state.navigationPath,
      targetNodeId,
      relationshipContext,
    );
    return journey ? { kind: 'reconstructed', journey } : { kind: 'teleport' };
  }

  if (selectCurrentFocusNodeId(state) === targetNodeId) {
    return { kind: 'alreadyFocused' };
  }

  if (request.origin === 'navigation') {
    return decideGenericRoute(project, state, request);
  }

  const existingTargetPosition = state.navigationPath.lastIndexOf(
    targetNodeId,
    state.navigationPath.length - 2,
  );
  if (existingTargetPosition >= 0) {
    return { kind: 'rootward', journeyPosition: existingTargetPosition };
  }

  return decideGenericRoute(project, state, request);
}
